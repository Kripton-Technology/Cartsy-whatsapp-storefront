import express from 'express';
import path from 'node:path';
import cors from 'cors';
import crypto from 'node:crypto';
import { createUploadSignature } from './cloudinary.js';
import { login, getSession, requireUser, rewriteRequestCookieHeader, rewriteResponseCookie, type AuthedRequest } from './auth.js';
import { env } from './env.js';
import { query } from './db.js';

// Ensure required columns exist
query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS paystack_transaction_reference text')
  .then(() => console.log('[DB Schema Check] paystack_transaction_reference column verified'))
  .catch(err => console.error('[DB Schema Check] failed to verify/create column:', err));

query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS on_hold boolean DEFAULT false')
  .then(() => console.log('[DB Schema Check] on_hold column verified'))
  .catch(err => console.error('[DB Schema Check] failed to verify/create on_hold column:', err));

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

// ─── Sitemap ───────────────────────────────────────────────────────────────────
// GET /sitemap.xml — dynamically lists all live stores so search engines can index them.
app.get('/sitemap.xml', async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://YOURDOMAIN.com';
    const stores = await query<{ slug: string; updated_at: string }>(
      `SELECT slug, updated_at FROM stores
       WHERE active = true
         AND on_hold = false
         AND (
           subscription_status = 'active'
           OR (subscription_status = 'trialing' AND trial_ends_at > now())
         )
       ORDER BY updated_at DESC`
    );

    const storeUrls = stores.map(s => {
      const lastmod = s.updated_at ? new Date(s.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      return `  <url>\n    <loc>${siteUrl}/store/${s.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
${storeUrls}
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
app.get('/robots.txt', (_req: express.Request, res: express.Response) => {
  const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://YOURDOMAIN.com';
  const content = `User-agent: *\nAllow: /\nAllow: /store/\nDisallow: /admin\nDisallow: /admin/\nDisallow: /superadmin\nDisallow: /superadmin/\nSitemap: ${siteUrl}/sitemap.xml\n`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache for 1 day
  res.send(content);
});

// ─── SEO Meta Injection helper ─────────────────────────────────────────────────
// Injects dynamic <title>, <meta>, Open Graph, and JSON-LD tags into index.html
// for /store/:slug routes so search engines index each store page individually.
function buildStoreMeta(store: Record<string, any>, siteUrl: string): string {
  const name = store.business_name || 'WhatsApp Store';
  const slug = store.slug || '';
  const tagline = store.tagline || `Shop at ${name} — browse products and order via WhatsApp.`;
  const description = tagline.length > 155 ? tagline.slice(0, 152) + '...' : tagline;
  const image = store.logo_url || store.hero_banner_url || `${siteUrl}/pwa-512x512.png`;
  const url = `${siteUrl}/store/${slug}`;
  const whatsapp = store.whatsapp_number || '';
  const location = store.location || '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name,
    description: tagline,
    url,
    image,
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
    <meta property="og:site_name" content="WhatsApp Commerce" />
    <meta property="og:title" content="${name} — WhatsApp Store" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${name} — WhatsApp Store" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${jsonLd}</script>
    <!-- End Store SEO -->`;
}

// ─── Production: Serve static frontend + SEO-injected store pages ──────────────
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distPath = path.resolve(process.cwd(), 'dist');
  const fs = await import('node:fs/promises');

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));

  // SEO catch-all: inject dynamic meta for /store/:slug before serving index.html
  app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) return next();

    // Only inject meta for store pages; all other SPA routes get plain index.html
    const storeMatch = req.path.match(/^\/store\/([^/]+)\/?$/);
    if (storeMatch) {
      const slug = storeMatch[1];
      try {
        const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || `https://${req.get('host')}`;
        const stores = await query<any>('SELECT * FROM stores WHERE slug = $1 AND active = true LIMIT 1', [slug]);
        if (stores.length > 0) {
          let html = await fs.readFile(path.join(distPath, 'index.html'), 'utf-8');
          const injectedMeta = buildStoreMeta(stores[0], siteUrl);
          // Replace the base title + meta block in index.html with store-specific tags
          html = html.replace(
            /<!-- SEO: base\/fallback meta tags[^]*?-->/,
            injectedMeta
          );
          res.setHeader('Content-Type', 'text/html; charset=UTF-8');
          res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache for store pages
          return res.send(html);
        }
      } catch (err) {
        console.error('[SEO] Failed to inject store meta:', err);
        // Fall through to plain sendFile
      }
    }

    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function getPublicStore(slug?: string) {
  if (!slug) return null;
  
  const rows = await query<any>(
    `SELECT * FROM stores WHERE slug = $1 AND active = true LIMIT 1`,
    [slug]
  );

  return rows[0] || null;
}

async function getAdminStore(userId: string) {
  const rows = await query<any>(
    `SELECT s.*
     FROM stores s
     JOIN store_admins sa ON sa.store_id = s.id
     WHERE sa.user_id = $1
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

    const isTrialActive = store.trial_ends_at ? new Date(store.trial_ends_at) > new Date() : false;
    const isSubActive = store.subscription_status === 'active';
    const isPaymentDue = ['canceled', 'past_due', 'unpaid'].includes(store.subscription_status);
    if (!isSubActive && (!isTrialActive || isPaymentDue)) {
      res.status(402).json({
        error: 'Payment Required',
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your trial or subscription has expired or is unpaid. Please subscribe to continue using the platform.'
      });
      return null;
    }
  }

  return store;
}

function isStorePubliclyLive(store: any): boolean {
  if (!store || !store.active || store.on_hold) return false;
  if (['canceled', 'past_due', 'unpaid'].includes(store.subscription_status)) return false;
  if (store.subscription_status === 'active') return true;
  if (store.trial_ends_at && new Date(store.trial_ends_at) > new Date()) return true;
  return false;
}

function normalizeProduct(row: any) {
  return row
    ? {
        ...row,
        price: Number(row.price),
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

app.get('/api/auth/session', getSession);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', (_req, res) => res.status(204).end());

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
      hero_banner_url
    } = req.body;

    let formattedWhatsapp = whatsapp_number ? String(whatsapp_number).replace(/[^0-9]/g, '') : '';
    if (formattedWhatsapp.startsWith('0')) {
      formattedWhatsapp = '233' + formattedWhatsapp.slice(1);
    }

    // 1. Create the store
    const storeRows = await query<any>(
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
    const store = storeRows[0];

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
    const isSubActive = store.subscription_status === 'active';
    const isActive = isTrialActive || isSubActive;

    const daysLeft = trialEnds 
      ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    res.json({
      subscription_status: store.subscription_status,
      trial_ends_at: store.trial_ends_at,
      paystack_subscription_code: store.paystack_subscription_code,
      paystack_customer_code: store.paystack_customer_code,
      is_active: isActive,
      days_left: daysLeft
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
    const baseUrl = env.paystackPaymentUrl;
    
    console.log(`[Billing Subscribe] Store ${store.id} requesting subscription link. Base URL: ${baseUrl}, User Email: ${email}`);

    if (!baseUrl) {
      console.error('[Billing Subscribe] env.paystackPaymentUrl is not configured');
      res.status(500).json({ error: 'Paystack payment page URL is not configured on the server.' });
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
    const paystackSecret = env.paystackSecretKey;
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

    const rows = await query<any>(
      `UPDATE stores
       SET business_name = $1,
           whatsapp_number = $2,
           tagline = $3,
           logo_url = $4,
           hero_banner_url = $5,
           location = $6,
           facebook_url = $7,
           instagram_url = $8
       WHERE id = $9
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
        store.id,
      ]
    );

    res.json(rows[0]);
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
      recentProducts,
      productsByCategory,
    ] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM categories WHERE store_id = $1', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1 AND in_stock = true', [store.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE store_id = $1 AND in_stock = false', [store.id]),
      query<{ id: string; name: string; price: number; in_stock: boolean; image_url: string | null; category_name: string | null; created_at: string }>(
        `SELECT p.id, p.name, p.price, p.in_stock, p.image_url, c.name AS category_name, p.created_at
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.store_id = $1
         ORDER BY p.created_at DESC
         LIMIT 5`,
        [store.id]
      ),
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
      recent_products: recentProducts,
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
  // Seed default paystack mode if not set
  return query(`
    INSERT INTO superadmin_settings (key, value)
    VALUES ('paystack_mode', 'test')
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

    res.json({
      total_stores: storeStats?.total_stores || 0,
      active_stores: storeStats?.active_stores || 0,
      trialing_stores: storeStats?.trialing_stores || 0,
      expired_stores: storeStats?.expired_stores || 0,
      on_hold_stores: storeStats?.on_hold_stores || 0,
      total_products: productStats?.total_products || 0,
      total_categories: categoryStats?.total_categories || 0,
    });
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
