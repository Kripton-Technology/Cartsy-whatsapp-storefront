import net from 'node:net';
import dns from 'node:dns';

// Fix Kali / Linux IPv6 network family auto-selection timeout with AWS / Neon
if (typeof (net as any).setDefaultAutoSelectFamily === 'function') {
  (net as any).setDefaultAutoSelectFamily(false);
}
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import express from 'express';
import path from 'node:path';
import cors from 'cors';
import crypto from 'node:crypto';
import { createUploadSignature } from './cloudinary.js';
import { login, getSession, requireUser, rewriteRequestCookieHeader, rewriteResponseCookie, type AuthedRequest } from './auth.js';
import { env } from './env.js';
import { query } from './db.js';
import { runMigrations } from './migrations.js';
import { getVapidPublicKey, notifyStoreOfNewOrder } from './webpush.js';

// Run database schema migrations
if (env.databaseUrl) {
  runMigrations().catch(err => console.error('[DB Migrations Error]', err));
}

const app = express();
app.set('trust proxy', true);

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://192.168.0.100:5173',
  'http://192.168.0.100:5174',
  env.clientOrigin
].filter(Boolean);

// 1. Auth Proxy — fetch-based so it works in both serverless (Vercel) and persistent (Render/local) runtimes.
// http-proxy-middleware relies on stream piping which breaks in serverless contexts.
app.use('/api/auth', async (req: express.Request, res: express.Response) => {
  const neonBase = env.neonAuthUrl?.split('/neondb')[0];
  if (!neonBase) {
    res.status(500).json({ error: 'VITE_NEON_AUTH_URL is not configured on the server.' });
    return;
  }

  // Build the target URL: /neondb/auth/<rest of path>
  const cleanPath = req.path === '/' ? '' : req.path.replace(/\/$/, '');
  const queryString = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  const targetUrl = `${neonBase}/neondb/auth${cleanPath}${queryString}`;
  console.log(`[AUTH PROXY] ${req.method} ${req.path} -> ${targetUrl}`);

  // Build forwarded headers — strip hop-by-hop and confusing proxy headers
  const skipRequestHeaders = new Set(['host', 'connection', 'x-forwarded-host', 'x-forwarded-port', 'x-forwarded-proto', 'transfer-encoding']);
  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string' && !skipRequestHeaders.has(key.toLowerCase())) {
      if (key.toLowerCase() === 'cookie') {
        forwardHeaders[key] = rewriteRequestCookieHeader(value) || '';
      } else {
        forwardHeaders[key] = value;
      }
    }
  }
  // Rewrite Origin to the Neon target so Better Auth CSRF check passes
  forwardHeaders['origin'] = neonBase;

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // express.json() hasn't run yet at this mount point, so we read the raw body
    body = await new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    if (body) {
      forwardHeaders['content-type'] = forwardHeaders['content-type'] || 'application/json';
      forwardHeaders['content-length'] = Buffer.byteLength(body).toString();
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body || undefined,
    });

    // Forward response status
    res.status(upstream.status);

    // Forward safe response headers
    const skipResponseHeaders = new Set(['transfer-encoding', 'connection', 'content-encoding', 'set-cookie']);
    upstream.headers.forEach((value: string, key: string) => {
      if (!skipResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Rewrite Set-Cookie headers: strip Domain, ensure Secure is conditional on HTTPS, set SameSite=Lax
    const rawCookies: string[] = (upstream.headers as any).getSetCookie?.() ?? [];
    const host = req.headers.host || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.');
    const isSecure = !isLocalhost;
    
    console.log(`[AUTH PROXY] Incoming cookies: ${req.headers.cookie || 'None'}`);
    console.log(`[AUTH PROXY] Protocol detection - host: ${host}, isLocalhost: ${isLocalhost}, isSecure: ${isSecure}`);
    
    const rewrittenCookies: string[] = [];
    rawCookies.forEach((cookie: string) => {
      const rewritten = rewriteResponseCookie(cookie, isSecure);
      console.log(`[AUTH PROXY] Rewriting cookie: "${cookie}" -> "${rewritten}"`);
      rewrittenCookies.push(rewritten);
    });
    
    if (rewrittenCookies.length > 0) {
      res.setHeader('Set-Cookie', rewrittenCookies);
    }

    const responseBody = await upstream.text();
    res.send(responseBody);
  } catch (err) {
    console.error('[AUTH PROXY ERROR]', err);
    res.status(502).json({ error: 'Auth service unreachable. Check VITE_NEON_AUTH_URL.' });
  }
});

// 2. Other middleware
app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  const host = req.get('host');
  
  // Determine if it is a same-origin request
  const isSameOrigin = origin && (
    origin === `http://${host}` ||
    origin === `https://${host}`
  );

  const isAllowed = !origin || 
    allowedOrigins.includes(origin) ||
    isSameOrigin ||
    origin.endsWith('.ngrok-free.app') ||
    origin.endsWith('.onrender.com') ||
    origin.endsWith('.vercel.app');

  callback(null, {
    origin: isAllowed ? (origin || true) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'x-superadmin-token'],
  });
}));

app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), async (req: express.Request, res: express.Response) => {
  const signature = req.headers['x-paystack-signature'] as string;
  const secret = env.paystackSecretKey || '';

  if (!signature) {
    res.status(400).send('Missing signature');
    return;
  }

  // Verify signature using crypto
  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.body)
    .digest('hex');

  if (hash !== signature) {
    console.error('[PAYSTACK WEBHOOK] Signature verification failed');
    res.status(400).send('Invalid signature');
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    console.error('[PAYSTACK WEBHOOK] Failed to parse payload:', err);
    res.status(400).send('Invalid JSON');
    return;
  }

  const event = payload.event;
  const data = payload.data;
  console.log(`[PAYSTACK WEBHOOK] Received event: ${event}`);

  let storeId = data?.metadata?.store_id;

  try {
    if (!storeId) {
      const customerEmail = data?.customer?.email || data?.email;
      if (customerEmail) {
        const userRows = await query<{ id: string }>(
          'SELECT id FROM neon_auth.user WHERE email = $1',
          [customerEmail]
        );
        if (userRows.length > 0) {
          const userId = userRows[0].id;
          const storeRows = await query<{ id: string }>(
            `SELECT s.id
             FROM stores s
             JOIN store_admins sa ON sa.store_id = s.id
             WHERE sa.user_id = $1
             LIMIT 1`,
            [userId]
          );
          if (storeRows.length > 0) {
            storeId = storeRows[0].id;
            console.log(`[PAYSTACK WEBHOOK] Resolved storeId ${storeId} from customer email ${customerEmail}`);
          }
        }
      }
    }

    if (event === 'subscription.create' || event === 'subscription.enable') {
      const subCode = data.subscription_code;
      const custCode = data.customer?.customer_code;
      
      if (storeId) {
        console.log(`[PAYSTACK WEBHOOK] Activating subscription for store ${storeId}: subscription_code=${subCode}`);
        await query(
          `UPDATE stores 
           SET subscription_status = 'active',
               paystack_subscription_code = $1,
               paystack_customer_code = $2,
               trial_ends_at = NULL
           WHERE id = $3`,
          [subCode, custCode, storeId]
        );
      } else {
        console.warn('[PAYSTACK WEBHOOK] No store_id found in metadata or email lookup for subscription.create');
      }
    } 
    else if (event === 'charge.success') {
      const reference = data?.reference || null;
      if (storeId) {
        console.log(`[PAYSTACK WEBHOOK] Successful charge on store ${storeId}, reference: ${reference}`);
        await query(
          `UPDATE stores 
           SET subscription_status = 'active',
               paystack_transaction_reference = $1,
               trial_ends_at = NULL
           WHERE id = $2`,
          [reference, storeId]
        );
      } else {
        console.warn('[PAYSTACK WEBHOOK] No store_id found in metadata or email lookup for charge.success');
      }
    }
    else if (event === 'subscription.disable') {
      const subCode = data.subscription_code;
      console.log(`[PAYSTACK WEBHOOK] Disabling subscription: ${subCode}`);
      await query(
        `UPDATE stores 
         SET subscription_status = 'canceled'
         WHERE paystack_subscription_code = $1`,
        [subCode]
      );
    }
    else if (event === 'invoice.payment_failed') {
      const subCode = data.subscription?.subscription_code;
      console.log(`[PAYSTACK WEBHOOK] Subscription invoice payment failed: ${subCode}`);
      if (subCode) {
        await query(
          `UPDATE stores 
           SET subscription_status = 'past_due'
           WHERE paystack_subscription_code = $1`,
          [subCode]
        );
      }
    }
  } catch (err) {
    console.error('[PAYSTACK WEBHOOK ERROR]', err);
    res.status(500).send('Database update error');
    return;
  }

  res.status(200).send('Webhook handled successfully');
});

app.use(express.json({ limit: '1mb' }));

// ─── Public Platform Info ──────────────────────────────────────────────────────
// GET /api/platform-info — returns public settings (announcement, platform name).
// No auth required; safe to call from merchant admin and customer storefronts.
app.get('/api/platform-info', async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM superadmin_settings WHERE key IN ('platform_announcement', 'platform_name', 'support_whatsapp') ORDER BY key ASC`
    );
    const info: Record<string, string> = {};
    for (const row of rows) {
      info[row.key] = row.value;
    }
    res.json({
      announcement: info['platform_announcement'] || '',
      platform_name: info['platform_name'] || 'WhatsApp Commerce',
      support_whatsapp: info['support_whatsapp'] || '',
    });
  } catch (error) {
    next(error);
  }
});

function resolveSiteUrl(req: express.Request): string {
  const envUrl = (process.env.SITE_URL || process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const host = req.get('host');
  if (host) return `${req.protocol || 'https'}://${host}`;
  return 'https://usecartsy.me';
}

function escapeHtmlAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Sitemap ───────────────────────────────────────────────────────────────────
// GET /sitemap.xml — dynamically lists all live stores and their products so search engines can index them.
app.get('/sitemap.xml', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const siteUrl = resolveSiteUrl(req);
    const stores = await query<{ id: string; slug: string; updated_at: string }>(
      `SELECT id, slug, updated_at FROM stores
       WHERE active = true
         AND on_hold = false
         AND (
           subscription_status = 'active'
           OR (subscription_status = 'trialing' AND trial_ends_at > now())
           OR is_sponsored = true
         )
       ORDER BY updated_at DESC`
    );

    const storeIds = stores.map(s => s.id);
    const products = storeIds.length > 0
      ? await query<{ id: string; store_id: string; updated_at: string }>(
          `SELECT id, store_id, updated_at FROM products
           WHERE store_id = ANY($1) AND in_stock = true
           ORDER BY updated_at DESC
           LIMIT 5000`,
          [storeIds]
        )
      : [];

    const slugByStoreId = new Map(stores.map(s => [s.id, s.slug]));

    const storeUrls = stores.map(s => {
      const lastmod = s.updated_at ? new Date(s.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      return `  <url>\n    <loc>${siteUrl}/s/${encodeURIComponent(s.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join('\n');

    const productUrls = products
      .map(p => {
        const slug = slugByStoreId.get(p.store_id);
        if (!slug) return '';
        const lastmod = p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        return `  <url>\n    <loc>${siteUrl}/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(p.id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
      })
      .filter(Boolean)
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
${storeUrls}
${productUrls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache for 1 hour
    res.send(xml);
  } catch (error) {
    next(error);
  }
});

// ─── Robots.txt ────────────────────────────────────────────────────────────────
// GET /robots.txt — Served dynamically so SITE_URL can be injected into the Sitemap line.
app.get('/robots.txt', (req: express.Request, res: express.Response) => {
  const siteUrl = resolveSiteUrl(req);
  const content = `User-agent: *\nAllow: /\nAllow: /s/\nAllow: /store/\nDisallow: /admin\nDisallow: /admin/\nDisallow: /superadmin\nDisallow: /superadmin/\nSitemap: ${siteUrl}/sitemap.xml\n`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache for 1 day
  res.send(content);
});

// ─── SEO Meta Injection helper ─────────────────────────────────────────────────
// Injects dynamic <title>, <meta>, Open Graph, and JSON-LD tags into index.html
// for /s/:slug and /store/:slug routes so search engines index each store page individually.
function buildStoreMeta(store: Record<string, any>, siteUrl: string): string {
  const name = escapeHtmlAttr(store.business_name || 'WhatsApp Store');
  const slug = encodeURIComponent(store.slug || '');
  const rawTagline = store.tagline || `Shop at ${store.business_name || 'WhatsApp Store'} — browse products and order via WhatsApp.`;
  const description = escapeHtmlAttr(rawTagline.length > 155 ? rawTagline.slice(0, 152) + '...' : rawTagline);
  const image = escapeHtmlAttr(store.logo_url || store.hero_banner_url || `${siteUrl}/pwa-512x512.png`);
  const url = `${siteUrl}/s/${slug}`;
  const whatsapp = store.whatsapp_number || '';
  const location = store.location || '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: store.business_name || 'WhatsApp Store',
    description: rawTagline,
    url,
    image: store.logo_url || store.hero_banner_url || `${siteUrl}/pwa-512x512.png`,
    ...(whatsapp && {
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: whatsapp,
        availableLanguage: 'English',
      },
    }),
    ...(location && {
      address: {
        '@type': 'PostalAddress',
        addressLocality: location,
      },
    }),
  });

  return `
    <!-- Store SEO: injected by server for ${slug} -->
    <title>${name} — WhatsApp Store</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cartsy" />
    <meta property="og:title" content="${name} — Social Storefront" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${name} — Social Storefront" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${jsonLd}</script>
    <!-- End Store SEO -->`;
}

function buildProductMeta(store: Record<string, any>, product: Record<string, any>, siteUrl: string): string {
  const storeName = escapeHtmlAttr(store.business_name || 'Cartsy Store');
  const name = escapeHtmlAttr(product.name || 'Product');
  const slug = encodeURIComponent(store.slug || '');
  const price = Number(product.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawDesc = product.description || `Buy ${product.name || 'Product'} for GHS ${price} from ${store.business_name || 'Cartsy Store'} on WhatsApp.`;
  const description = escapeHtmlAttr(rawDesc.length > 155 ? rawDesc.slice(0, 152) + '...' : rawDesc);
  const image = escapeHtmlAttr((product.image_urls && product.image_urls[0]) || product.image_url || store.logo_url || `${siteUrl}/pwa-512x512.png`);
  const url = `${siteUrl}/s/${slug}/p/${encodeURIComponent(product.id)}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name || 'Product',
    description: rawDesc,
    image: (product.image_urls && product.image_urls[0]) || product.image_url || store.logo_url || `${siteUrl}/pwa-512x512.png`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'GHS',
      price: Number(product.price || 0).toFixed(2),
      availability: product.in_stock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      url,
    },
  });

  return `
    <!-- Product SEO: injected by server for ${name} -->
    <title>${name} | GHS ${price} — ${storeName}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="${storeName}" />
    <meta property="og:title" content="${name} | GHS ${price}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="${url}" />
    <meta property="product:price:amount" content="${Number(product.price || 0).toFixed(2)}" />
    <meta property="product:price:currency" content="GHS" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${name} | GHS ${price} — ${storeName}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${jsonLd}</script>
    <!-- End Product SEO -->`;
}

let cachedIndexHtml: string | null = null;
async function loadBaseHtml(req: express.Request): Promise<string | null> {
  if (cachedIndexHtml) return cachedIndexHtml;
  const fs = await import('node:fs/promises');
  const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
  try {
    cachedIndexHtml = await fs.readFile(distIndexPath, 'utf-8');
    return cachedIndexHtml;
  } catch {
    // On Vercel serverless, dist/index.html is served by CDN rather than local disk
    const host = req.get('host');
    if (!host) return null;
    try {
      const origin = `${req.protocol || 'https'}://${host}`;
      const resp = await fetch(`${origin}/index.html`);
      if (resp.ok) {
        cachedIndexHtml = await resp.text();
        return cachedIndexHtml;
      }
    } catch (err) {
      console.error('[SEO] Failed to fetch base index.html:', err);
    }
    return null;
  }
}

// Dynamic SEO meta injection for /s/:slug and /store/:slug (runs on both Vercel and Node prod)
app.get(['/s/:slug', '/s/:slug/p/:productId', '/store/:slug', '/store/:slug/p/:productId'], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    return next();
  }
  const { slug, productId } = req.params;
  try {
    let html = await loadBaseHtml(req);
    if (!html) return next();

    const siteUrl = resolveSiteUrl(req);
    const stores = await query<any>('SELECT * FROM stores WHERE slug = $1 AND active = true LIMIT 1', [slug]);
    if (stores.length > 0) {
      let injectedMeta = buildStoreMeta(stores[0], siteUrl);
      if (productId) {
        const products = await query<any>('SELECT * FROM products WHERE id = $1 AND store_id = $2 LIMIT 1', [productId, stores[0].id]);
        if (products.length > 0) {
          injectedMeta = buildProductMeta(stores[0], products[0], siteUrl);
        }
      }
      html = html.replace(
        /<!-- SEO: base\/fallback meta tags[^]*?<!-- End SEO -->/,
        injectedMeta
      );
    }

    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(html);
  } catch (err) {
    console.error('[SEO] Failed to inject dynamic meta:', err);
    return next();
  }
});

// ─── Production: Serve static frontend + SEO-injected store/product pages ──────
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distPath = path.resolve(process.cwd(), 'dist');

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function getPublicStore(slug?: string) {
  if (!slug) return null;
  
  const rows = await query<any>(
    `SELECT s.*, i.name AS institution_name, i.logo_url AS institution_logo
     FROM stores s
     LEFT JOIN institutions i ON i.id = s.institution_id
     WHERE s.slug = $1 AND s.active = true LIMIT 1`,
    [slug]
  );

  return rows[0] || null;
}

async function getAdminStore(userId: string) {
  const rows = await query<any>(
    `SELECT s.*
     FROM stores s
     LEFT JOIN store_admins sa ON sa.store_id = s.id
     WHERE sa.user_id = $1 OR s.owner_id = $1
     ORDER BY s.created_at ASC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function requireAdminStore(req: AuthedRequest, res: express.Response, bypassSubscriptionCheck = false) {
  if (!req.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  const storeId = req.headers['x-store-id'] as string;
  let store: any = null;
  
  if (storeId) {
    const rows = await query<any>(
      `SELECT s.* FROM stores s
       JOIN store_admins sa ON sa.store_id = s.id
       WHERE s.id = $1 AND sa.user_id = $2`,
      [storeId, req.userId]
    );
    if (rows[0]) store = rows[0];
  }

  if (!store) {
    store = await getAdminStore(req.userId);
  }

  if (!store) {
    res.status(404).json({ error: 'No store found for this admin user' });
    return null;
  }

  if (!bypassSubscriptionCheck) {
    if (store.on_hold) {
      res.status(403).json({
        error: 'Account On Hold',
        code: 'ACCOUNT_ON_HOLD',
        message: 'Your store account has been placed on hold. Please contact support.'
      });
      return null;
    }

    const now = Date.now();
    const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

    const isSponsoredActive = store.is_sponsored && store.sponsored_expires_at ? new Date(store.sponsored_expires_at).getTime() > now : false;
    const isSponsoredInGrace = store.is_sponsored && store.sponsored_expires_at
      ? (now - new Date(store.sponsored_expires_at).getTime() < GRACE_PERIOD_MS) && (now > new Date(store.sponsored_expires_at).getTime())
      : false;

    const isTrialActive = store.trial_ends_at ? new Date(store.trial_ends_at).getTime() > now : false;
    const isTrialInGrace = store.trial_ends_at
      ? (now - new Date(store.trial_ends_at).getTime() < GRACE_PERIOD_MS) && (now > new Date(store.trial_ends_at).getTime())
      : false;

    const isSubActive = store.subscription_status === 'active' || isSponsoredActive || isSponsoredInGrace || isTrialInGrace;
    const isPaymentDue = ['canceled', 'past_due', 'unpaid'].includes(store.subscription_status) && !isSponsoredActive && !isSponsoredInGrace;
    if (!isSubActive && (!isTrialActive || isPaymentDue)) {
      res.status(402).json({
        error: 'Payment Required',
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your trial or subscription has expired (past 7-day grace period). Please subscribe to continue using the platform.'
      });
      return null;
    }
  }

  return store;
}

function isStorePubliclyLive(store: any): boolean {
  if (!store || !store.active || store.on_hold) return false;
  const now = Date.now();
  const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

  const isSponsoredActive = store.is_sponsored && store.sponsored_expires_at && new Date(store.sponsored_expires_at).getTime() > now;
  const isSponsoredInGrace = store.is_sponsored && store.sponsored_expires_at && (now - new Date(store.sponsored_expires_at).getTime() < GRACE_PERIOD_MS);

  if (['canceled', 'past_due', 'unpaid'].includes(store.subscription_status) && !isSponsoredActive && !isSponsoredInGrace) return false;
  if (store.subscription_status === 'active' || isSponsoredActive || isSponsoredInGrace) return true;
  if (store.trial_ends_at && new Date(store.trial_ends_at).getTime() > now) return true;
  if (store.trial_ends_at && (now - new Date(store.trial_ends_at).getTime() < GRACE_PERIOD_MS)) return true;
  return false;
}

function normalizeProduct(row: any) {
  const numericPrice = Number(row?.price || 0);
  return row
    ? {
        ...row,
        price: numericPrice,
        price_formatted: numericPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      }
    : row;
}

function normalizeProducts(rows: any[]) {
  return rows.map(normalizeProduct);
}

app.get('/api/stores', async (_req, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT slug, business_name, logo_url, tagline 
       FROM stores 
       WHERE active = true 
         AND on_hold = false 
         AND (subscription_status = 'active' OR (trial_ends_at IS NOT NULL AND trial_ends_at > now()))
         AND (subscription_status IS NULL OR subscription_status NOT IN ('canceled', 'past_due', 'unpaid'))
       ORDER BY business_name ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/store', async (req, res, next) => {
  try {
    res.json(await getPublicStore(String(req.query.store || '') || undefined));
  } catch (error) {
    next(error);
  }
});

app.get('/api/categories', async (req, res, next) => {
  try {
    const store = await getPublicStore(String(req.query.store || '') || undefined);
    if (!store || !isStorePubliclyLive(store)) {
      res.json([]);
      return;
    }

    const rows = await query(
      `SELECT * FROM categories
       WHERE store_id = $1 AND active = true
       ORDER BY display_order ASC, created_at ASC`,
      [store.id]
    );
    res.json(normalizeProducts(rows));
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const store = await getPublicStore(String(req.query.store || '') || undefined);
    if (!store || !isStorePubliclyLive(store)) {
      res.json([]);
      return;
    }

    const categoryId = String(req.query.category || '');
    const rows = categoryId
      ? await query(
          `SELECT * FROM products
           WHERE store_id = $1 AND category_id = $2 AND in_stock = true
           ORDER BY display_order ASC, created_at ASC`,
          [store.id, categoryId]
        )
      : await query(
          `SELECT * FROM products
           WHERE store_id = $1 AND in_stock = true
           ORDER BY display_order ASC, created_at ASC`,
          [store.id]
        );

    res.json(normalizeProducts(rows));
  } catch (error) {
    next(error);
  }
});

// ── Rate limiting for order creation (OF-10) ─────────────────────────────────
const orderIpLimits = new Map<string, { count: number; resetAt: number }>();
function checkOrderRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = orderIpLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    orderIpLimits.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const store = await getPublicStore(String(req.query.store || '') || undefined);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    const rows = await query('SELECT * FROM products WHERE id = $1 AND store_id = $2 LIMIT 1', [req.params.id, store.id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(normalizeProduct(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get('/api/store/platforms', async (req, res, next) => {
  try {
    const store = await getPublicStore(String(req.query.store || '') || undefined);
    if (!store) {
      res.json([]);
      return;
    }
    const rows = await query('SELECT platform, handle FROM store_platforms WHERE store_id = $1', [store.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/stats/visit', async (req, res, next) => {
  try {
    const { store_slug, source } = req.body;
    if (!store_slug) {
      res.status(400).json({ error: 'store_slug is required' });
      return;
    }

    const stores = await query<any>('SELECT id FROM stores WHERE slug = $1 LIMIT 1', [store_slug]);
    if (stores.length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const trafficSource = (source || 'direct').toLowerCase();
    await query(
      `INSERT INTO daily_stats (store_id, date, source, visits)
       VALUES ($1, CURRENT_DATE, $2, 1)
       ON CONFLICT (store_id, date, source)
       DO UPDATE SET visits = daily_stats.visits + 1`,
      [stores[0].id, trafficSource]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders/backup', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkOrderRateLimit(ip)) {
      res.status(429).json({ error: 'Too many orders placed from this network. Please wait a moment.' });
      return;
    }

    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch {}
    }

    const {
      order_number,
      public_token,
      store_slug,
      store_id,
      customer_name,
      customer_phone,
      location,
      items,
      delivery_fee,
      total,
      source,
      notes,
    } = bodyData || {};

    if (!customer_name || !location || !items || total === undefined) {
      res.status(400).json({ error: 'Missing required order fields (customer_name, location, items, total)' });
      return;
    }

    let store: any = null;
    if (store_id) {
      const rows = await query<any>('SELECT id, business_name, slug FROM stores WHERE id = $1 LIMIT 1', [store_id]);
      if (rows[0]) store = rows[0];
    }
    if (!store && store_slug) {
      const rows = await query<any>('SELECT id, business_name, slug FROM stores WHERE slug = $1 LIMIT 1', [store_slug]);
      if (rows[0]) store = rows[0];
    }

    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const orderNum = order_number || `CR-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const token = public_token || `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
    const trafficSource = (source || 'direct').toLowerCase();

    // Insert order (text-only backup, < 1 KB target, OF-5)
    const [insertedOrder] = await query<any>(
      `INSERT INTO orders (
        order_number, public_token, store_id, customer_name, customer_phone,
        location, items, delivery_fee, total, source, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'New', $11)
      RETURNING *`,
      [
        orderNum,
        token,
        store.id,
        customer_name,
        customer_phone || null,
        location,
        JSON.stringify(items),
        Number(delivery_fee || 0),
        Number(total),
        trafficSource,
        notes || null,
      ]
    );

    // Insert initial status into audit events
    await query(
      `INSERT INTO order_events (order_id, status) VALUES ($1, 'New')`,
      [insertedOrder.id]
    ).catch(() => {});

    // Increment daily counters (AN-4)
    await query(
      `INSERT INTO daily_stats (store_id, date, source, orders_started)
       VALUES ($1, CURRENT_DATE, $2, 1)
       ON CONFLICT (store_id, date, source)
       DO UPDATE SET orders_started = daily_stats.orders_started + 1`,
      [store.id, trafficSource]
    ).catch(() => {});

    // Asynchronously notify store via Web Push (OF-6, PW-3)
    notifyStoreOfNewOrder(store.id, {
      customer_name,
      total: Number(total),
      order_number: orderNum,
      items_count: Array.isArray(items) ? items.length : 1,
    }).catch(err => console.error('[Push Notification Error]', err));

    res.status(201).json({
      success: true,
      order_number: orderNum,
      public_token: token,
      order_id: insertedOrder.id,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders/track/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier || '').trim();
    const rows = await query<any>(
      `SELECT o.*, s.business_name, s.whatsapp_number, s.slug as store_slug, s.logo_url as store_logo
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.public_token = $1 OR UPPER(o.order_number) = UPPER($1)
       LIMIT 1`,
      [cleanId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = rows[0];
    const events = await query<any>(
      `SELECT status, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id]
    ).catch(() => []);

    res.json({
      ...order,
      events,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', getSession);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', (_req, res) => res.status(204).end());

app.use(['/api/admin', '/api/auth'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use('/api/admin', requireUser);

app.get('/api/admin/stores', async (req: AuthedRequest, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const rows = await query<any>(
      `SELECT s.*
       FROM stores s
       JOIN store_admins sa ON sa.store_id = s.id
       WHERE sa.user_id = $1
       ORDER BY s.created_at ASC`,
      [req.userId]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/stores', async (req: AuthedRequest, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { 
      slug, 
      business_name, 
      whatsapp_number,
      tagline,
      location,
      facebook_url,
      instagram_url,
      logo_url,
      hero_banner_url,
      access_code
    } = req.body;

    let formattedWhatsapp = whatsapp_number ? String(whatsapp_number).replace(/[^0-9]/g, '') : '';
    if (formattedWhatsapp.startsWith('0')) {
      formattedWhatsapp = '233' + formattedWhatsapp.slice(1);
    }

    // Check if an institution/graduation access code was provided
    let accessCodeRecord: any = null;
    let sponsoredUntil: Date | null = null;
    if (access_code && String(access_code).trim()) {
      const codeRows = await query<any>(
        `SELECT gac.*, c.institution_id, i.name AS institution_name, i.revenue_split_pct,
                i.logo_url AS institution_logo
         FROM graduate_access_codes gac
         JOIN cohorts c ON gac.cohort_id = c.id
         JOIN institutions i ON c.institution_id = i.id
         WHERE UPPER(TRIM(gac.code)) = UPPER(TRIM($1))`,
        [String(access_code).trim()]
      );

      if (codeRows.length === 0) {
        res.status(400).json({ error: 'Invalid graduation / institution access code. Please check and try again.' });
        return;
      }
      const ac = codeRows[0];
      if (ac.status === 'revoked') {
        res.status(400).json({ error: 'This access code has been revoked by the institution administrator.' });
        return;
      }
      if (ac.store_id || ac.status === 'redeemed') {
        res.status(400).json({ error: 'This access code has already been claimed by another store.' });
        return;
      }
      if (new Date(ac.expires_at) < new Date() || ac.status === 'expired') {
        res.status(400).json({ error: 'This access code has expired.' });
        return;
      }

      accessCodeRecord = ac;
      const now = new Date();
      sponsoredUntil = new Date(now);
      sponsoredUntil.setMonth(sponsoredUntil.getMonth() + 6);
    }

    // 1. Create the store
    let storeRows: any[];
    if (accessCodeRecord && sponsoredUntil) {
      // Store created under institution graduation package — trial bypassed, immediately active & sponsored
      storeRows = await query<any>(
        `INSERT INTO stores (
           owner_id, slug, business_name, whatsapp_number,
           tagline, location, facebook_url, instagram_url,
           logo_url, hero_banner_url,
           is_sponsored, institution_id, cohort_id, sponsored_expires_at,
           subscription_status, trial_ends_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13, 'active', NULL)
         RETURNING *`,
        [
          req.userId, 
          slug, 
          business_name, 
          formattedWhatsapp,
          tagline || null,
          location || null,
          facebook_url || null,
          instagram_url || null,
          logo_url || null,
          hero_banner_url || null,
          accessCodeRecord.institution_id,
          accessCodeRecord.cohort_id,
          sponsoredUntil.toISOString()
        ]
      );
    } else {
      storeRows = await query<any>(
        `INSERT INTO stores (
           owner_id, slug, business_name, whatsapp_number,
           tagline, location, facebook_url, instagram_url,
           logo_url, hero_banner_url
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.userId, 
          slug, 
          business_name, 
          formattedWhatsapp,
          tagline || null,
          location || null,
          facebook_url || null,
          instagram_url || null,
          logo_url || null,
          hero_banner_url || null
        ]
      );
    }
    const store = storeRows[0];

    // If an access code was used, redeem it and create ledger record
    if (accessCodeRecord && sponsoredUntil) {
      await query(
        `UPDATE graduate_access_codes
         SET store_id = $1, claimed_at = now(), status = 'redeemed'
         WHERE id = $2`,
        [store.id, accessCodeRecord.id]
      );

      const grossAmount = 1000.00;
      const splitPct = Number(accessCodeRecord.revenue_split_pct || 55.00);
      const schoolAmount = (grossAmount * splitPct) / 100;
      const cartsyAmount = grossAmount - schoolAmount;
      const now = new Date();
      const periodStart = now.toISOString().slice(0, 10);
      const periodEnd = sponsoredUntil.toISOString().slice(0, 10);

      await query(
        `INSERT INTO institution_ledgers
          (store_id, institution_id, access_code_id, amount_total, amount_cartsy, amount_institution, status, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)`,
        [store.id, accessCodeRecord.institution_id, accessCodeRecord.id, grossAmount, cartsyAmount, schoolAmount, periodStart, periodEnd]
      );
    }

    // 2. Make the user an owner of this store
    await query(
      `INSERT INTO store_admins (store_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [store.id, req.userId]
    );

    res.status(201).json(store);
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'This store URL is already taken.' });
    } else {
      next(error);
    }
  }
});

app.get('/api/admin/store', async (req: AuthedRequest, res, next) => {
  try {
    const storeId = req.query.storeId as string;
    if (storeId) {
      const rows = await query<any>(
        `SELECT s.* FROM stores s
         JOIN store_admins sa ON sa.store_id = s.id
         WHERE s.id = $1 AND sa.user_id = $2`,
        [storeId, req.userId]
      );
      if (rows[0]) {
        res.json(rows[0]);
        return;
      }
    }
    res.json(await requireAdminStore(req, res, true));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/billing/status', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res, true);
    if (!store) return;

    const trialEnds = store.trial_ends_at ? new Date(store.trial_ends_at) : null;
    const isTrialActive = trialEnds ? trialEnds > new Date() : false;
    const isSponsoredActive = store.is_sponsored && store.sponsored_expires_at ? new Date(store.sponsored_expires_at) > new Date() : false;
    const isSubActive = store.subscription_status === 'active';
    const isActive = isTrialActive || isSubActive || isSponsoredActive;

    let daysLeft = 0;
    if (isSponsoredActive && store.sponsored_expires_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(store.sponsored_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    } else if (trialEnds) {
      daysLeft = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    }

    let institutionInfo = null;
    if (store.institution_id) {
      const instRows = await query<any>('SELECT name, logo_url FROM institutions WHERE id = $1', [store.institution_id]);
      if (instRows.length > 0) {
        institutionInfo = instRows[0];
      }
    }

    res.json({
      subscription_status: store.subscription_status,
      trial_ends_at: store.trial_ends_at,
      paystack_subscription_code: store.paystack_subscription_code,
      paystack_customer_code: store.paystack_customer_code,
      is_active: isActive,
      days_left: daysLeft,
      is_sponsored: !!store.is_sponsored,
      sponsored_expires_at: store.sponsored_expires_at,
      institution_name: institutionInfo?.name || null,
      institution_logo: institutionInfo?.logo_url || null,
    });
  } catch (error) {
    next(error);
  }
});

// Helper: get active Paystack config from DB (falls back to env vars)
async function getPaystackConfig(): Promise<{
  secret_key: string;
  public_key: string;
  plan_code: string;
  payment_url: string;
  mode: string;
}> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM superadmin_settings WHERE key IN (
      'paystack_mode',
      'paystack_live_secret_key','paystack_live_public_key','paystack_live_plan_code','paystack_live_payment_url',
      'paystack_test_secret_key','paystack_test_public_key','paystack_test_plan_code','paystack_test_payment_url'
    )`
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;

  const mode = cfg['paystack_mode'] || 'test';
  const prefix = mode === 'live' ? 'paystack_live_' : 'paystack_test_';

  return {
    mode,
    secret_key: cfg[`${prefix}secret_key`] || (mode === 'live' ? '' : (env.paystackSecretKey || '')),
    public_key: cfg[`${prefix}public_key`] || (mode === 'live' ? '' : (process.env.VITE_PAYSTACK_PUBLIC_KEY || '')),
    plan_code:  cfg[`${prefix}plan_code`]  || (mode === 'live' ? '' : (env.paystackPlanCode || '')),
    payment_url: cfg[`${prefix}payment_url`] || (mode === 'live' ? '' : (env.paystackPaymentUrl || '')),
  };
}

// GET /api/admin/billing/payment-config — returns active Paystack public config for the client
app.get('/api/admin/billing/payment-config', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res, true);
    if (!store) return;
    const cfg = await getPaystackConfig();
    res.json({
      mode: cfg.mode,
      public_key: cfg.public_key,
      plan_code: cfg.plan_code,
      payment_url: cfg.payment_url,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/billing/subscribe', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res, true);
    if (!store) return;

    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userRows = await query<{ email: string }>(
      'SELECT email FROM neon_auth.user WHERE id = $1',
      [req.userId]
    );
    const email = userRows[0]?.email;

    // Load active Paystack config from DB (admin-controlled)
    const payCfg = await getPaystackConfig();
    const baseUrl = payCfg.payment_url;
    
    console.log(`[Billing Subscribe] Store ${store.id} requesting subscription link. Mode: ${payCfg.mode}, Base URL: ${baseUrl}, User Email: ${email}`);

    if (!baseUrl) {
      console.error('[Billing Subscribe] Paystack payment_url not configured in superadmin_settings');
      res.status(500).json({ error: 'Paystack payment page URL is not configured. Please ask the platform admin to set it in Settings.' });
      return;
    }

    const authorization_url = email 
      ? `${baseUrl}?email=${encodeURIComponent(email)}` 
      : baseUrl;

    console.log(`[Billing Subscribe] Returning redirect URL: ${authorization_url}`);

    res.json({
      authorization_url
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/billing/verify', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res, true);
    if (!store) return;

    const { reference } = req.body;
    if (!reference || typeof reference !== 'string') {
      res.status(400).json({ error: 'Transaction reference is required' });
      return;
    }

    // Check if this reference has already been claimed by another store
    const existingReference = await query<any>(
      'SELECT id, business_name FROM stores WHERE paystack_transaction_reference = $1',
      [reference]
    );

    if (existingReference.length > 0) {
      if (existingReference[0].id === store.id) {
        res.json({ success: true, message: 'This payment has already been verified and applied to your store.' });
      } else {
        res.status(400).json({ error: 'This transaction reference has already been claimed by another store.' });
      }
      return;
    }

    // Call Paystack API to verify reference
    const paystackSecret = (await getPaystackConfig()).secret_key || env.paystackSecretKey;
    if (!paystackSecret || paystackSecret === 'sk_test_placeholder_value') {
      console.error('[Billing Verify] Paystack secret key is missing or set to placeholder value.');
      res.status(500).json({ error: 'Paystack is not configured correctly on the server.' });
      return;
    }

    const maskedKey = `${paystackSecret.substring(0, 10)}...${paystackSecret.substring(paystackSecret.length - 4)}`;
    console.log(`[Billing Verify] Active Paystack Secret Key: ${maskedKey}`);

    const verifyUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
    console.log(`[Billing Verify] Calling Paystack to verify reference: ${reference}`);
    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as any;
      console.error('[Billing Verify] Paystack returned error status:', response.status, errBody);
      res.status(400).json({ error: errBody.message || 'Failed to verify transaction with Paystack.' });
      return;
    }

    const payload = (await response.json()) as any;
    console.log('[Billing Verify] Paystack response payload status:', payload.status, 'data status:', payload.data?.status);
    if (!payload.status || payload.data?.status !== 'success') {
      res.status(400).json({ error: 'Transaction was not successful or not found on Paystack.' });
      return;
    }

    const data = payload.data;
    const subCode = data.subscription_code || data.subscription?.subscription_code || null;
    const custCode = data.customer?.customer_code || null;

    // Update store status to active and record the transaction reference
    await query(
      `UPDATE stores 
       SET subscription_status = 'active',
           paystack_subscription_code = COALESCE($1, paystack_subscription_code),
           paystack_customer_code = COALESCE($2, paystack_customer_code),
           paystack_transaction_reference = $3,
           trial_ends_at = NULL
       WHERE id = $4`,
      [subCode, custCode, reference, store.id]
    );

    console.log(`[Billing Verify] Manual verification successful for store ${store.id}: reference=${reference}`);

    res.json({
      success: true,
      message: 'Payment verified successfully! Your subscription is now active.'
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/store', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const payload = req.body;
    let formattedWhatsapp = payload.whatsapp_number ? String(payload.whatsapp_number).replace(/[^0-9]/g, '') : '';
    if (formattedWhatsapp.startsWith('0')) {
      formattedWhatsapp = '233' + formattedWhatsapp.slice(1);
    }

    // Slug change logic with 30-day throttle (ST-2)
    let newSlug = store.slug;
    if (payload.slug && payload.slug.trim() && payload.slug.trim().toLowerCase() !== store.slug) {
      const candidateSlug = payload.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (candidateSlug.length < 3) {
        res.status(400).json({ error: 'Store link slug must be at least 3 characters long.' });
        return;
      }

      if (store.slug_changed_at) {
        const lastChanged = new Date(store.slug_changed_at).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastChanged < thirtyDaysMs) {
          const daysLeft = Math.ceil((lastChanged + thirtyDaysMs - Date.now()) / (24 * 60 * 60 * 1000));
          res.status(400).json({
            error: `Store link slug can only be changed once every 30 days. You can change it again in ${daysLeft} days.`
          });
          return;
        }
      }

      const existingSlug = await query<any>('SELECT id FROM stores WHERE slug = $1 AND id != $2', [candidateSlug, store.id]);
      if (existingSlug.length > 0) {
        res.status(400).json({ error: 'This store link slug is already taken by another store.' });
        return;
      }

      newSlug = candidateSlug;
      await query('UPDATE stores SET slug = $1, slug_changed_at = now() WHERE id = $2', [newSlug, store.id]);
    }

    const rows = await query<any>(
      `UPDATE stores
       SET business_name = $1,
           whatsapp_number = $2,
           tagline = $3,
           logo_url = $4,
           hero_banner_url = $5,
           location = $6,
           facebook_url = $7,
           instagram_url = $8,
           is_closed = COALESCE($9, is_closed),
           closed_message = COALESCE($10, closed_message),
           delivery_settings = COALESCE($11, delivery_settings)
       WHERE id = $12
       RETURNING *`,
      [
        payload.business_name,
        formattedWhatsapp,
        payload.tagline || null,
        payload.logo_url || null,
        payload.hero_banner_url || null,
        payload.location || null,
        payload.facebook_url || null,
        payload.instagram_url || null,
        payload.is_closed ?? null,
        payload.closed_message ?? null,
        payload.delivery_settings ? JSON.stringify(payload.delivery_settings) : null,
        store.id,
      ]
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// ── Store Platforms Management (ST-1) ──────────────────────────────────────────
app.get('/api/admin/platforms', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;
    const rows = await query('SELECT id, platform, handle FROM store_platforms WHERE store_id = $1 ORDER BY platform ASC', [store.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/platforms', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const { platforms } = req.body;
    if (!Array.isArray(platforms)) {
      res.status(400).json({ error: 'platforms array is required' });
      return;
    }

    await query('DELETE FROM store_platforms WHERE store_id = $1', [store.id]);

    for (const p of platforms) {
      if (p.platform) {
        await query(
          'INSERT INTO store_platforms (store_id, platform, handle) VALUES ($1, $2, $3) ON CONFLICT (store_id, platform) DO UPDATE SET handle = $3',
          [store.id, p.platform.toLowerCase(), p.handle || null]
        );
      }
    }

    const rows = await query('SELECT id, platform, handle FROM store_platforms WHERE store_id = $1 ORDER BY platform ASC', [store.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// ── Seller Orders Management (OM-1, OM-2, OM-3) ──────────────────────────────
app.get('/api/admin/orders', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const { status, source, search } = req.query;
    let sqlQuery = 'SELECT * FROM orders WHERE store_id = $1';
    const params: any[] = [store.id];

    if (status && status !== 'all') {
      params.push(status);
      sqlQuery += ` AND status = $${params.length}`;
    }

    if (source && source !== 'all') {
      params.push(source);
      sqlQuery += ` AND source = $${params.length}`;
    }

    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      sqlQuery += ` AND (customer_name ILIKE $${params.length} OR order_number ILIKE $${params.length})`;
    }

    sqlQuery += ' ORDER BY created_at DESC LIMIT 100';

    const rows = await query(sqlQuery, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/orders/:id/status', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const { status } = req.body;
    const validStatuses = ['New', 'Received', 'Preparing', 'Ready', 'Out for delivery', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const rows = await query<any>(
      `UPDATE orders
       SET status = $1, status_updated_at = now(), updated_at = now()
       WHERE id = $2 AND store_id = $3
       RETURNING *`,
      [status, req.params.id, store.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    await query('INSERT INTO order_events (order_id, status) VALUES ($1, $2)', [req.params.id, status]).catch(() => {});

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// ── Web Push Subscriptions for Sellers (PW-2, PW-3) ──────────────────────────
app.get('/api/admin/push/vapid-public-key', async (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post('/api/admin/push/subscribe', async (req: AuthedRequest, res: express.Response) => {
  try {
    const store = await requireAdminStore(req, res, true);
    if (!store) {
      if (!res.headersSent) {
        res.status(404).json({ error: 'Store not found for this user account' });
      }
      return;
    }

    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.warn('[PUSH SUBSCRIBE] Missing payload params:', { endpoint: !!endpoint, hasKeys: !!keys, p256dh: !!keys?.p256dh, auth: !!keys?.auth });
      res.status(400).json({ error: 'Invalid push subscription payload: missing endpoint or encryption keys' });
      return;
    }

    await query(
      `INSERT INTO push_subscriptions (store_id, endpoint, p256dh, auth, last_success_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (endpoint)
       DO UPDATE SET store_id = $1, p256dh = $3, auth = $4, last_success_at = now()`,
      [store.id, String(endpoint).trim(), String(keys.p256dh).trim(), String(keys.auth).trim()]
    );

    console.log(`[PUSH SUBSCRIBE] Registered push endpoint for store: ${store.business_name} (${store.id})`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[PUSH SUBSCRIBE ERROR]', error);
    res.status(500).json({ error: error?.message || 'Database error while saving push subscription' });
  }
});

app.delete('/api/admin/push/unsubscribe', async (req: AuthedRequest, res, next) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const [
      productCounts,
      categoryCounts,
      inStockCounts,
      outOfStockCounts,
      orderCounts,
      newOrderCounts,
      recentProducts,
      recentOrders,
      productsByCategory,
    ] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM categories WHERE store_id = $1', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1 AND in_stock = true', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1 AND in_stock = false', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM orders WHERE store_id = $1', [store.id]).catch(() => [{ count: '0' }]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM orders WHERE store_id = $1 AND status = \'New\'', [store.id]).catch(() => [{ count: '0' }]),
      query<{ id: string; name: string; price: number; in_stock: boolean; image_url: string | null; category_name: string | null; created_at: string }>(
        `SELECT p.id, p.name, p.price, p.in_stock, p.image_url, c.name AS category_name, p.created_at
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.store_id = $1
         ORDER BY p.created_at DESC
         LIMIT 5`,
        [store.id]
      ),
      query<any>(
        `SELECT * FROM orders
         WHERE store_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [store.id]
      ).catch(() => []),
      query<{ name: string; count: string }>(
        `SELECT COALESCE(c.name, 'Uncategorized') AS name, COUNT(*)::text AS count
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.store_id = $1
         GROUP BY c.name
         ORDER BY count DESC
         LIMIT 8`,
        [store.id]
      ),
    ]);

    res.json({
      products: Number(productCounts[0]?.count || 0),
      categories: Number(categoryCounts[0]?.count || 0),
      in_stock_products: Number(inStockCounts[0]?.count || 0),
      out_of_stock_products: Number(outOfStockCounts[0]?.count || 0),
      orders_count: Number(orderCounts[0]?.count || 0),
      new_orders_count: Number(newOrderCounts[0]?.count || 0),
      recent_products: recentProducts,
      recent_orders: recentOrders,
      products_by_category: productsByCategory.map(r => ({ name: r.name, count: Number(r.count) })),
      store_created_at: store.created_at || null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/categories', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    res.json(
      await query(
        `SELECT * FROM categories
         WHERE store_id = $1
         ORDER BY display_order ASC, created_at ASC`,
        [store.id]
      )
    );
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/categories', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const rows = await query<any>(
      `INSERT INTO categories (store_id, name, display_order, active)
       VALUES ($1, $2, (
         SELECT COALESCE(MAX(display_order), 0) + 1 FROM categories WHERE store_id = $1
       ), true)
       RETURNING *`,
      [store.id, req.body.name]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/categories/:id', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const rows = await query<any>(
      `UPDATE categories
       SET name = COALESCE($1, name),
           active = COALESCE($2, active)
       WHERE id = $3 AND store_id = $4
       RETURNING *`,
      [req.body.name ?? null, req.body.active ?? null, req.params.id, store.id]
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/categories/:id', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    await query('DELETE FROM categories WHERE id = $1 AND store_id = $2', [req.params.id, store.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/products', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const rows = await query<any>(
        `SELECT * FROM products
         WHERE store_id = $1
         ORDER BY created_at DESC`,
        [store.id]
    );

    res.json(normalizeProducts(rows));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/products', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const rows = await query<any>(
      `INSERT INTO products
       (store_id, name, description, price, image_url, category_id, in_stock, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        store.id,
        req.body.name,
        req.body.description || null,
        req.body.price,
        req.body.image_url || null,
        req.body.category_id || null,
        req.body.in_stock ?? true,
        req.body.display_order || 0,
      ]
    );

    res.status(201).json(normalizeProduct(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/products/:id', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    const rows = await query<any>(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           image_url = COALESCE($4, image_url),
           category_id = COALESCE($5, category_id),
           in_stock = COALESCE($6, in_stock)
       WHERE id = $7 AND store_id = $8
       RETURNING *`,
      [
        req.body.name ?? null,
        req.body.description ?? null,
        req.body.price ?? null,
        req.body.image_url ?? null,
        req.body.category_id ?? null,
        req.body.in_stock ?? null,
        req.params.id,
        store.id,
      ]
    );

    res.json(normalizeProduct(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/products/:id', async (req: AuthedRequest, res, next) => {
  try {
    const store = await requireAdminStore(req, res);
    if (!store) return;

    await query('DELETE FROM products WHERE id = $1 AND store_id = $2', [req.params.id, store.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/uploads/signature', (req, res) => {
  res.json(createUploadSignature(req.body.folder));
});

// ═══════════════════════════════════════════════════════════════════════
// SUPER-ADMIN ROUTES — protected by SUPERADMIN_PASSWORD env variable
// ═══════════════════════════════════════════════════════════════════════

// Ensure superadmin settings table exists
query(`
  CREATE TABLE IF NOT EXISTS superadmin_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
  )
`).then(() => {
  // Seed default paystack mode and config keys if not set
  return query(`
    INSERT INTO superadmin_settings (key, value) VALUES
      ('paystack_mode', 'test'),
      ('paystack_live_secret_key', ''),
      ('paystack_live_public_key', ''),
      ('paystack_live_plan_code', ''),
      ('paystack_live_payment_url', ''),
      ('paystack_test_secret_key', ''),
      ('paystack_test_public_key', ''),
      ('paystack_test_plan_code', ''),
      ('paystack_test_payment_url', '')
    ON CONFLICT (key) DO NOTHING
  `);
}).then(() => console.log('[SuperAdmin] Settings table ready'))
  .catch(err => console.error('[SuperAdmin] Settings table error:', err));

// Middleware: verify super-admin password from header (x-superadmin-token or Authorization Bearer)
function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const customHeader = req.headers['x-superadmin-token'] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;

  const token = customHeader || bearerToken;
  const expectedToken = process.env.SUPERADMIN_PASSWORD;

  if (!expectedToken) {
    res.status(500).json({ error: 'Super-admin password not configured on server.' });
    return;
  }
  if (!token || token !== expectedToken) {
    res.status(401).json({ error: 'Unauthorized. Invalid super-admin token.' });
    return;
  }
  next();
}

// GET /api/superadmin/verify — verify active session token
app.get('/api/superadmin/verify', requireSuperAdmin, (_req: express.Request, res: express.Response) => {
  res.json({ valid: true });
});

// POST /api/superadmin/login — verify password
app.post('/api/superadmin/login', async (req: express.Request, res: express.Response) => {
  const { password } = req.body;
  const expectedPassword = process.env.SUPERADMIN_PASSWORD;
  if (!expectedPassword) {
    res.status(500).json({ error: 'Super-admin password not configured.' });
    return;
  }
  if (password === expectedPassword) {
    res.json({ success: true, token: expectedPassword });
  } else {
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

// GET /api/superadmin/stats — overall platform metrics
app.get('/api/superadmin/stats', requireSuperAdmin, async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const [storeStats] = await query<any>(`
      SELECT
        COUNT(*)::int AS total_stores,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END)::int AS active_stores,
        COUNT(CASE WHEN subscription_status = 'trialing' THEN 1 END)::int AS trialing_stores,
        COUNT(CASE WHEN (subscription_status NOT IN ('active', 'trialing') OR subscription_status IS NULL) THEN 1 END)::int AS expired_stores,
        COUNT(CASE WHEN on_hold = true THEN 1 END)::int AS on_hold_stores
      FROM stores
    `);

    const [productStats] = await query<any>(`
      SELECT COUNT(*)::int AS total_products FROM products
    `);

    const [categoryStats] = await query<any>(`
      SELECT COUNT(*)::int AS total_categories FROM categories
    `);

    const [orderStats] = await query<any>(`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int AS orders_today
      FROM orders
    `).catch(() => [{ total_orders: 0, orders_today: 0 }]);

    res.json({
      total_stores: storeStats?.total_stores || 0,
      active_stores: storeStats?.active_stores || 0,
      trialing_stores: storeStats?.trialing_stores || 0,
      expired_stores: storeStats?.expired_stores || 0,
      on_hold_stores: storeStats?.on_hold_stores || 0,
      total_products: productStats?.total_products || 0,
      total_categories: categoryStats?.total_categories || 0,
      total_orders: orderStats?.total_orders || 0,
      orders_today: orderStats?.orders_today || 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/orders — platform-wide recent orders for standalone superadmin repo
app.get('/api/superadmin/orders', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<any>(`
      SELECT o.*, s.business_name, s.slug as store_slug
      FROM orders o
      JOIN stores s ON s.id = o.store_id
      ORDER BY o.created_at DESC
      LIMIT 100
    `).catch(() => []);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/stores — all stores with live stats
app.get('/api/superadmin/stores', requireSuperAdmin, async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<any>(`
      SELECT
        s.id,
        s.business_name,
        s.slug,
        s.whatsapp_number,
        s.subscription_status,
        s.trial_ends_at,
        s.paystack_subscription_code,
        s.paystack_customer_code,
        s.paystack_transaction_reference,
        s.active,
        s.on_hold,
        s.created_at,
        s.updated_at,
        COUNT(DISTINCT p.id)::int AS product_count,
        COUNT(DISTINCT sa.user_id)::int AS admin_count,
        COALESCE(u.email, u2.email) AS owner_email
      FROM stores s
      LEFT JOIN products p ON p.store_id = s.id
      LEFT JOIN store_admins sa ON sa.store_id = s.id
      LEFT JOIN neon_auth.user u ON u.id = s.owner_id
      LEFT JOIN neon_auth.user u2 ON u2.id = (
        SELECT user_id FROM store_admins WHERE store_id = s.id ORDER BY created_at LIMIT 1
      )
      GROUP BY s.id, u.email, u2.email
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/stores/:id — single store details with products & categories
app.get('/api/superadmin/stores/:id', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const stores = await query<any>(`
      SELECT
        s.*,
        COUNT(DISTINCT p.id)::int AS product_count,
        COUNT(DISTINCT sa.user_id)::int AS admin_count,
        COALESCE(u.email, u2.email) AS owner_email
      FROM stores s
      LEFT JOIN products p ON p.store_id = s.id
      LEFT JOIN store_admins sa ON sa.store_id = s.id
      LEFT JOIN neon_auth.user u ON u.id = s.owner_id
      LEFT JOIN neon_auth.user u2 ON u2.id = (
        SELECT user_id FROM store_admins WHERE store_id = s.id ORDER BY created_at LIMIT 1
      )
      WHERE s.id = $1
      GROUP BY s.id, u.email, u2.email
    `, [id]);

    if (stores.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    const products = await query<any>(`
      SELECT id, name, price, in_stock, image_url, created_at
      FROM products
      WHERE store_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    const categories = await query<any>(`
      SELECT id, name, active
      FROM categories
      WHERE store_id = $1
      ORDER BY display_order ASC
    `, [id]);

    res.json({
      ...stores[0],
      products,
      categories,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/superadmin/stores/:id — update store details in database
app.patch('/api/superadmin/stores/:id', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const {
      business_name,
      slug,
      whatsapp_number,
      subscription_status,
      trial_ends_at,
      on_hold,
      active,
      paystack_subscription_code,
      paystack_customer_code,
      paystack_transaction_reference,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (business_name !== undefined) {
      values.push(business_name);
      updates.push(`business_name = $${values.length}`);
    }
    if (slug !== undefined) {
      values.push(slug);
      updates.push(`slug = $${values.length}`);
    }
    if (whatsapp_number !== undefined) {
      values.push(whatsapp_number);
      updates.push(`whatsapp_number = $${values.length}`);
    }
    if (subscription_status !== undefined) {
      values.push(subscription_status);
      updates.push(`subscription_status = $${values.length}`);
      if (subscription_status === 'active') {
        updates.push(`trial_ends_at = NULL`);
      } else if (subscription_status === 'trialing' && trial_ends_at === undefined) {
        updates.push(`trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + interval '14 days'`);
      }
    }
    if (trial_ends_at !== undefined) {
      values.push(trial_ends_at);
      updates.push(`trial_ends_at = $${values.length}`);
    }
    if (on_hold !== undefined) {
      values.push(Boolean(on_hold));
      updates.push(`on_hold = $${values.length}`);
    }
    if (active !== undefined) {
      values.push(Boolean(active));
      updates.push(`active = $${values.length}`);
    }
    if (paystack_subscription_code !== undefined) {
      values.push(paystack_subscription_code);
      updates.push(`paystack_subscription_code = $${values.length}`);
    }
    if (paystack_customer_code !== undefined) {
      values.push(paystack_customer_code);
      updates.push(`paystack_customer_code = $${values.length}`);
    }
    if (paystack_transaction_reference !== undefined) {
      values.push(paystack_transaction_reference);
      updates.push(`paystack_transaction_reference = $${values.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update.' });
      return;
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const rows = await query<any>(
      `UPDATE stores SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/stores/:id/extend-trial — extend trial by N days
app.post('/api/superadmin/stores/:id/extend-trial', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const days = Math.max(1, Number(req.body.days) || 14);

    const rows = await query<any>(
      `UPDATE stores
       SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + ($1 || ' days')::interval,
           subscription_status = 'trialing',
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [days, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/superadmin/stores/:id — delete a store from the database
app.delete('/api/superadmin/stores/:id', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await query<any>('DELETE FROM stores WHERE id = $1 RETURNING id, business_name', [id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }
    res.json({ success: true, deleted: rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/settings — get all superadmin settings
app.get('/api/superadmin/settings', requireSuperAdmin, async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<{ key: string; value: string; updated_at?: string }>('SELECT key, value, updated_at FROM superadmin_settings ORDER BY key ASC');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/superadmin/settings — upsert a setting
app.patch('/api/superadmin/settings', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      res.status(400).json({ error: 'key and value are required.' });
      return;
    }
    await query(
      `INSERT INTO superadmin_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(key).trim(), String(value)]
    );
    res.json({ success: true, key: String(key).trim(), value: String(value) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/superadmin/settings/:key — delete a setting
app.delete('/api/superadmin/settings/:key', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { key } = req.params;
    await query('DELETE FROM superadmin_settings WHERE key = $1', [key]);
    res.json({ success: true, key });
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/payments — all payment references across stores
app.get('/api/superadmin/payments', requireSuperAdmin, async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<any>(`
      SELECT
        s.id AS store_id,
        s.business_name,
        s.slug,
        s.subscription_status,
        s.paystack_subscription_code,
        s.paystack_customer_code,
        s.paystack_transaction_reference,
        s.trial_ends_at,
        s.created_at,
        s.updated_at,
        COALESCE(u.email, u2.email) AS owner_email
      FROM stores s
      LEFT JOIN neon_auth.user u ON u.id = s.owner_id
      LEFT JOIN neon_auth.user u2 ON u2.id = (
        SELECT user_id FROM store_admins WHERE store_id = s.id ORDER BY created_at LIMIT 1
      )
      WHERE s.paystack_transaction_reference IS NOT NULL
         OR s.paystack_subscription_code IS NOT NULL
         OR s.subscription_status = 'active'
      ORDER BY COALESCE(s.updated_at, s.created_at) DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/payments/record — manually record payment & update store
app.post('/api/superadmin/payments/record', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { store_id, transaction_reference, subscription_code, customer_code, subscription_status = 'active' } = req.body;
    if (!store_id || !transaction_reference) {
      res.status(400).json({ error: 'store_id and transaction_reference are required.' });
      return;
    }

    const rows = await query<any>(
      `UPDATE stores
       SET paystack_transaction_reference = $1,
           paystack_subscription_code = COALESCE($2, paystack_subscription_code),
           paystack_customer_code = COALESCE($3, paystack_customer_code),
           subscription_status = $4,
           trial_ends_at = CASE WHEN $4 = 'active' THEN NULL ELSE trial_ends_at END,
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [
        transaction_reference,
        subscription_code || null,
        customer_code || null,
        subscription_status,
        store_id,
      ]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }

    res.json({ success: true, store: rows[0] });
  } catch (error) {
    next(error);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Institution SaaS Endpoints
// ════════════════════════════════════════════════════════════════════════════

// ── Admin seller: claim an institution access code ───────────────────────────
// POST /api/admin/claim-access-code
app.post('/api/admin/claim-access-code', async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const userId = req.userId as string;
    const { code } = req.body as { code: string };

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'access_code is required.' });
      return;
    }

    // Fetch the store for this seller (either owned directly or via store_admins)
    const storeRows = await query<any>(
      `SELECT s.id, s.is_sponsored 
       FROM stores s
       LEFT JOIN store_admins sa ON sa.store_id = s.id
       WHERE s.owner_id = $1 OR sa.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );
    if (storeRows.length === 0) {
      res.status(404).json({ error: 'No store found for this account.' });
      return;
    }
    const store = storeRows[0];

    // Look up the access code
    const codeRows = await query<any>(
      `SELECT gac.*, c.institution_id, i.name AS institution_name, i.revenue_split_pct,
              i.logo_url AS institution_logo
       FROM graduate_access_codes gac
       JOIN cohorts c ON gac.cohort_id = c.id
       JOIN institutions i ON c.institution_id = i.id
       WHERE UPPER(TRIM(gac.code)) = UPPER(TRIM($1))`,
      [code.trim()]
    );

    if (codeRows.length === 0) {
      res.status(404).json({ error: 'Invalid access code. Please check and try again.' });
      return;
    }

    const ac = codeRows[0];

    if (ac.status === 'revoked') {
      res.status(403).json({ error: 'This access code has been revoked by the institution administrator.' });
      return;
    }

    if (ac.store_id || ac.status === 'redeemed') {
      res.status(409).json({ error: 'This access code has already been claimed.' });
      return;
    }

    if (new Date(ac.expires_at) < new Date() || ac.status === 'expired') {
      res.status(410).json({ error: 'This access code has expired.' });
      return;
    }

    // Claim the code — give 6 months sponsorship from today
    const now = new Date();
    const sponsoredUntil = new Date(now);
    sponsoredUntil.setMonth(sponsoredUntil.getMonth() + 6);

    await query(
      `UPDATE graduate_access_codes
       SET store_id = $1, claimed_at = now(), status = 'redeemed'
       WHERE id = $2`,
      [store.id, ac.id]
    );

    await query(
      `UPDATE stores
       SET institution_id = $1, cohort_id = $2,
           is_sponsored = true, sponsored_expires_at = $3,
           subscription_status = 'active',
           trial_ends_at = NULL,
           updated_at = now()
       WHERE id = $4`,
      [ac.institution_id, ac.cohort_id, sponsoredUntil.toISOString(), store.id]
    );

    // IN-7: Create ledger entry for this redemption
    const grossAmount = 1000.00;
    const splitPct = Number(ac.revenue_split_pct || 55.00);
    const schoolAmount = (grossAmount * splitPct) / 100;
    const cartsyAmount = grossAmount - schoolAmount;
    const periodStart = now.toISOString().slice(0, 10);
    const periodEnd = sponsoredUntil.toISOString().slice(0, 10);

    try {
      await query(
        `INSERT INTO ledger_entries
          (store_id, institution_id, access_code_id, amount_total, amount_cartsy, amount_institution, status, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
        [store.id, ac.institution_id, ac.id, grossAmount, cartsyAmount, schoolAmount, periodStart, periodEnd]
      );
    } catch (ledgerErr) {
      console.warn('[Ledger] Failed to create redemption entry:', ledgerErr);
    }

    res.json({
      success: true,
      institution_name: ac.institution_name,
      institution_logo: ac.institution_logo,
      sponsored_until: sponsoredUntil.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/sponsorship — get sponsorship status for the current store
app.get('/api/admin/sponsorship', async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const userId = req.userId as string;
    const rows = await query<any>(
      `SELECT s.is_sponsored, s.sponsored_expires_at, s.institution_id, s.cohort_id,
              i.name AS institution_name, i.logo_url AS institution_logo
       FROM stores s
       LEFT JOIN institutions i ON s.institution_id = i.id
       WHERE s.owner_id = $1 LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Store not found.' });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// ── Superadmin: Institution management ───────────────────────────────────────

// GET /api/superadmin/institutions
app.get('/api/superadmin/institutions', requireSuperAdmin, async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rows = await query<any>(`
      SELECT i.*,
             COUNT(DISTINCT c.id)   AS cohorts_count,
             COUNT(DISTINCT gac.id) AS codes_total,
             COUNT(DISTINCT gac.id) FILTER (WHERE gac.store_id IS NOT NULL) AS codes_claimed,
             COUNT(DISTINCT s.id)   AS sponsored_stores
      FROM institutions i
      LEFT JOIN cohorts c ON c.institution_id = i.id
      LEFT JOIN graduate_access_codes gac ON gac.cohort_id = c.id
      LEFT JOIN stores s ON s.institution_id = i.id AND s.is_sponsored = true
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/institutions
app.post('/api/superadmin/institutions', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { name, slug, logo_url, contact_email, revenue_split_pct = 55 } = req.body as any;
    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug are required.' });
      return;
    }
    const cleanSlug = (slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const rows = await query<any>(
      `INSERT INTO institutions (name, slug, logo_url, contact_email, revenue_split_pct)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, cleanSlug, logo_url || null, contact_email || null, revenue_split_pct]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/superadmin/institutions/:id
app.patch('/api/superadmin/institutions/:id', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const { name, logo_url, contact_email, revenue_split_pct, active } = req.body as any;
    const rows = await query<any>(
      `UPDATE institutions
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           contact_email = COALESCE($3, contact_email),
           revenue_split_pct = COALESCE($4, revenue_split_pct),
           active = COALESCE($5, active),
           updated_at = now()
       WHERE id = $6 RETURNING *`,
      [name ?? null, logo_url ?? null, contact_email ?? null, revenue_split_pct ?? null, active ?? null, id]
    );
    if (rows.length === 0) res.status(404).json({ error: 'Institution not found.' });
    else res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/institutions/:id/cohorts
app.get('/api/superadmin/institutions/:id/cohorts', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await query<any>(
      `SELECT c.*,
              COUNT(gac.id) AS codes_total,
              COUNT(gac.id) FILTER (WHERE gac.store_id IS NOT NULL) AS codes_claimed
       FROM cohorts c
       LEFT JOIN graduate_access_codes gac ON gac.cohort_id = c.id
       WHERE c.institution_id = $1
       GROUP BY c.id
       ORDER BY c.year DESC, c.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/institutions/:id/cohorts
app.post('/api/superadmin/institutions/:id/cohorts', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id: institution_id } = req.params;
    const { name, year, graduation_date, access_code_prefix } = req.body as any;
    if (!name || !year) {
      res.status(400).json({ error: 'name and year are required.' });
      return;
    }
    const rows = await query<any>(
      `INSERT INTO cohorts (institution_id, name, year, graduation_date, access_code_prefix)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [institution_id, name, year, graduation_date || null, (access_code_prefix || '').toUpperCase()]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/cohorts/:id/access-codes/generate
app.post('/api/superadmin/cohorts/:id/access-codes/generate', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id: cohort_id } = req.params;
    const { count = 50 } = req.body as { count?: number };

    const cohortRows = await query<any>('SELECT * FROM cohorts WHERE id = $1', [cohort_id]);
    if (cohortRows.length === 0) {
      res.status(404).json({ error: 'Cohort not found.' });
      return;
    }
    const cohort = cohortRows[0];

    // Codes expire 90 days after graduation, or 1 year from now if no graduation date
    const expiresAt = cohort.graduation_date
      ? new Date(new Date(cohort.graduation_date).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const prefix = cohort.access_code_prefix
      ? `${cohort.access_code_prefix}-`
      : `${String(cohort.year).slice(-2)}-`;

    const crypto = await import('crypto');
    const codes: string[] = [];
    for (let i = 0; i < Math.min(count, 500); i++) {
      codes.push(`${prefix}${crypto.randomBytes(4).toString('hex').toUpperCase()}`);
    }

    // Bulk insert, ignore duplicates
    const values = codes.map((c, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    const params = codes.flatMap(c => [cohort_id, c, expiresAt]);
    await query(
      `INSERT INTO graduate_access_codes (cohort_id, code, expires_at) VALUES ${values} ON CONFLICT (code) DO NOTHING`,
      params
    );

    res.json({ generated: codes.length, expires_at: expiresAt, sample: codes.slice(0, 5) });
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/cohorts/:id/access-codes — list codes for a cohort
app.get('/api/superadmin/cohorts/:id/access-codes', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await query<any>(
      `SELECT gac.*, 
              s.business_name AS store_name, s.slug AS store_slug,
              s.whatsapp_number AS store_whatsapp,
              s.is_sponsored AS store_is_sponsored,
              s.subscription_status AS store_subscription_status,
              s.sponsored_expires_at AS store_sponsored_expires_at,
              COALESCE(u.email, u2.email) AS owner_email,
              COALESCE(u.name, u2.name) AS owner_name
       FROM graduate_access_codes gac
       LEFT JOIN stores s ON s.id = gac.store_id
       LEFT JOIN neon_auth.user u ON u.id = s.owner_id
       LEFT JOIN neon_auth.user u2 ON u2.id = (
         SELECT user_id FROM store_admins WHERE store_id = s.id ORDER BY created_at LIMIT 1
       )
       WHERE gac.cohort_id = $1
       ORDER BY gac.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/graduates — comprehensive graduation list with aligned stores, institutions, and users
app.get('/api/superadmin/graduates', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { institution_id, cohort_id, status, search } = req.query as {
      institution_id?: string;
      cohort_id?: string;
      status?: string;
      search?: string;
    };

    const params: any[] = [];
    const conditions: string[] = [];

    if (institution_id) {
      params.push(institution_id);
      conditions.push(`i.id = $${params.length}`);
    }

    if (cohort_id) {
      params.push(cohort_id);
      conditions.push(`c.id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`gac.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = `$${params.length}`;
      conditions.push(`(
        gac.code ILIKE ${pIdx} OR 
        gac.graduate_name ILIKE ${pIdx} OR 
        gac.graduate_email ILIKE ${pIdx} OR 
        gac.graduate_phone ILIKE ${pIdx} OR 
        s.business_name ILIKE ${pIdx} OR 
        s.slug ILIKE ${pIdx} OR 
        COALESCE(u.email, u2.email) ILIKE ${pIdx} OR
        i.name ILIKE ${pIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<any>(
      `SELECT 
        gac.id,
        gac.cohort_id,
        gac.code,
        gac.graduate_name,
        gac.graduate_phone,
        gac.graduate_email,
        gac.course,
        gac.status,
        gac.store_id,
        gac.claimed_at,
        gac.expires_at,
        gac.created_at,
        -- Institution info
        i.id AS institution_id,
        i.name AS institution_name,
        i.slug AS institution_slug,
        i.logo_url AS institution_logo,
        -- Cohort info
        c.name AS cohort_name,
        c.year AS cohort_year,
        -- Aligned Store info
        s.business_name AS store_name,
        s.slug AS store_slug,
        s.whatsapp_number AS store_whatsapp,
        s.is_sponsored AS store_is_sponsored,
        s.subscription_status AS store_subscription_status,
        s.sponsored_expires_at AS store_sponsored_expires_at,
        s.created_at AS store_created_at,
        -- Aligned User / Owner info
        COALESCE(u.id, u2.id) AS owner_id,
        COALESCE(u.email, u2.email) AS owner_email,
        COALESCE(u.name, u2.name) AS owner_name
       FROM graduate_access_codes gac
       JOIN cohorts c ON c.id = gac.cohort_id
       JOIN institutions i ON i.id = c.institution_id
       LEFT JOIN stores s ON s.id = gac.store_id
       LEFT JOIN neon_auth.user u ON u.id = s.owner_id
       LEFT JOIN neon_auth.user u2 ON u2.id = (
         SELECT user_id FROM store_admins WHERE store_id = s.id ORDER BY created_at LIMIT 1
       )
       ${whereClause}
       ORDER BY gac.claimed_at DESC NULLS LAST, gac.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/cohorts/:id/graduates/bulk — upload graduate list by CSV or JSON (IN-3)
app.post('/api/superadmin/cohorts/:id/graduates/bulk', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id: cohort_id } = req.params;
    const { graduates = [], csv_text } = req.body as {
      graduates?: Array<{ name: string; phone?: string; email?: string; course?: string }>;
      csv_text?: string;
    };

    const cohortRows = await query<any>('SELECT * FROM cohorts WHERE id = $1', [cohort_id]);
    if (cohortRows.length === 0) {
      res.status(404).json({ error: 'Cohort not found.' });
      return;
    }
    const cohort = cohortRows[0];

    const parsedGraduates: Array<{ name: string; phone?: string; email?: string; course?: string }> = [...graduates];

    // If CSV text is provided, parse it (format: name,phone,email,course)
    if (csv_text && typeof csv_text === 'string') {
      const lines = csv_text.split(/\r?\n/).filter(line => line.trim().length > 0);
      // Skip header if first line contains header keywords
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (parts[0]) {
          parsedGraduates.push({
            name: parts[0],
            phone: parts[1] || undefined,
            email: parts[2] || undefined,
            course: parts[3] || undefined,
          });
        }
      }
    }

    if (parsedGraduates.length === 0) {
      res.status(400).json({ error: 'No graduates provided. Supply a graduates array or csv_text.' });
      return;
    }

    const expiresAt = cohort.graduation_date
      ? new Date(new Date(cohort.graduation_date).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const prefix = cohort.access_code_prefix
      ? `${cohort.access_code_prefix}-`
      : `${String(cohort.year).slice(-2)}-`;

    const crypto = await import('crypto');
    let inserted = 0;
    const errors: Array<{ row: number; name: string; error: string }> = [];

    for (let i = 0; i < parsedGraduates.length; i++) {
      const g = parsedGraduates[i];
      if (!g.name || !g.name.trim()) {
        errors.push({ row: i + 1, name: '', error: 'Graduate name is required' });
        continue;
      }

      const code = `${prefix}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      try {
        await query(
          `INSERT INTO graduate_access_codes
             (cohort_id, code, graduate_name, graduate_phone, graduate_email, course, expires_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'issued')`,
          [cohort_id, code, g.name.trim(), g.phone || null, g.email || null, g.course || null, expiresAt]
        );
        inserted++;
      } catch (err: any) {
        errors.push({ row: i + 1, name: g.name, error: err.message || 'Database error' });
      }
    }

    res.json({
      success: true,
      total_submitted: parsedGraduates.length,
      created: inserted,
      errors,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/superadmin/access-codes/:id/revoke — revoke an access code (IN-4, IN-5)
app.patch('/api/superadmin/access-codes/:id/revoke', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await query<any>(
      `UPDATE graduate_access_codes
       SET status = 'revoked'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Access code not found.' });
      return;
    }

    const code = rows[0];
    // If it was claimed by a store, also unpublish / revoke sponsorship on store
    if (code.store_id) {
      await query(
        `UPDATE stores
         SET is_sponsored = false,
             subscription_status = 'unpaid',
             updated_at = now()
         WHERE id = $1`,
        [code.store_id]
      );
    }

    res.json({ success: true, access_code: code });
  } catch (error) {
    next(error);
  }
});

// GET /api/superadmin/institutions/:id/stats — institution metrics (IN-6, IN-10: privacy-first, zero customer data)
app.get('/api/superadmin/institutions/:id/stats', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const instRows = await query<any>('SELECT * FROM institutions WHERE id = $1', [id]);
    if (instRows.length === 0) {
      res.status(404).json({ error: 'Institution not found.' });
      return;
    }
    const inst = instRows[0];

    // Counts: graduates, codes claimed, stores live
    const [counts] = await query<any>(
      `SELECT
         COUNT(gac.id) AS total_graduates,
         COUNT(gac.id) FILTER (WHERE gac.status = 'redeemed' OR gac.store_id IS NOT NULL) AS codes_redeemed,
         COUNT(gac.id) FILTER (WHERE gac.status = 'revoked') AS codes_revoked,
         COUNT(DISTINCT s.id) FILTER (WHERE s.active = true AND s.on_hold = false AND s.is_sponsored = true) AS stores_live
       FROM cohorts c
       LEFT JOIN graduate_access_codes gac ON gac.cohort_id = c.id
       LEFT JOIN stores s ON s.institution_id = c.institution_id
       WHERE c.institution_id = $1`,
      [id]
    );

    // Order counts across all graduate stores of this institution (COUNT only, zero customer PII / order contents, IN-6 & IN-10)
    const [orderStats] = await query<any>(
      `SELECT COUNT(o.id) AS total_orders
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE s.institution_id = $1`,
      [id]
    );

    // Revenue ledger totals for this institution
    const [ledgerStats] = await query<any>(
      `SELECT
         COALESCE(SUM(amount_institution) FILTER (WHERE status = 'pending'), 0) AS money_owed_to_school,
         COALESCE(SUM(amount_institution) FILTER (WHERE status = 'paid'), 0) AS money_paid_to_school,
         COALESCE(SUM(amount_total), 0) AS total_gross_generated
       FROM ledger_entries
       WHERE institution_id = $1`,
      [id]
    );

    res.json({
      institution: {
        id: inst.id,
        name: inst.name,
        slug: inst.slug,
        revenue_split_pct: Number(inst.revenue_split_pct),
        active: inst.active,
      },
      graduates: Number(counts?.total_graduates || 0),
      codes_redeemed: Number(counts?.codes_redeemed || 0),
      codes_revoked: Number(counts?.codes_revoked || 0),
      stores_live: Number(counts?.stores_live || 0),
      total_orders_count: Number(orderStats?.total_orders || 0),
      money_owed_to_school: Number(ledgerStats?.money_owed_to_school || 0),
      money_paid_to_school: Number(ledgerStats?.money_paid_to_school || 0),
      total_gross_generated: Number(ledgerStats?.total_gross_generated || 0),
    });
  } catch (error) {
    next(error);
  }
});

// ── Superadmin: Revenue Ledger ────────────────────────────────────────────────

// GET /api/superadmin/ledger
app.get('/api/superadmin/ledger', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { status, institution_id } = req.query as Record<string, string>;
    let sql = `
      SELECT le.*,
             s.business_name AS store_name, s.slug AS store_slug,
             i.name AS institution_name
      FROM ledger_entries le
      JOIN stores s ON s.id = le.store_id
      JOIN institutions i ON i.id = le.institution_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) { sql += ` AND le.status = $${params.length + 1}`; params.push(status); }
    if (institution_id) { sql += ` AND le.institution_id = $${params.length + 1}`; params.push(institution_id); }
    sql += ' ORDER BY le.period_start DESC';
    const rows = await query<any>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/superadmin/ledger/:id/pay — mark ledger entry as paid
app.patch('/api/superadmin/ledger/:id/pay', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const rows = await query<any>(
      `UPDATE ledger_entries SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) res.status(404).json({ error: 'Ledger entry not found.' });
    else res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/superadmin/ledger/generate — generate monthly ledger entries for all sponsored stores
app.post('/api/superadmin/ledger/generate', requireSuperAdmin, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { period_start, period_end } = req.body as { period_start: string; period_end: string };
    if (!period_start || !period_end) {
      res.status(400).json({ error: 'period_start and period_end (YYYY-MM-DD) are required.' });
      return;
    }

    // Find all actively sponsored stores with an institution
    const sponsoredStores = await query<any>(
      `SELECT s.id AS store_id, s.institution_id, i.revenue_split_pct
       FROM stores s
       JOIN institutions i ON i.id = s.institution_id
       WHERE s.is_sponsored = true
         AND s.sponsored_expires_at > now()
         AND i.active = true`,
      []
    );

    let created = 0;
    for (const store of sponsoredStores) {
      const institutionShare = (1000 * store.revenue_split_pct) / 100;
      const cartsyShare = 1000 - institutionShare;
      try {
        await query(
          `INSERT INTO ledger_entries
             (store_id, institution_id, amount_total, amount_cartsy, amount_institution, period_start, period_end)
           VALUES ($1, $2, 1000, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [store.store_id, store.institution_id, cartsyShare, institutionShare, period_start, period_end]
        );
        created++;
      } catch (_) { /* skip duplicates */ }
    }

    res.json({ created, total_stores: sponsoredStores.length });
  } catch (error) {
    next(error);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// END PHASE 2
// ════════════════════════════════════════════════════════════════════════════

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error' });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`API server listening on http://0.0.0.0:${env.port}`);
  });
}

export default app;
