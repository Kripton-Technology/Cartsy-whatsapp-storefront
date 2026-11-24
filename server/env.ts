import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

// Parse Cloudinary credentials with fallbacks (supports CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_CLOUD_NAME, or CLOUDINARY_URL)
let cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
let cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY;
let cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

if ((!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) && process.env.CLOUDINARY_URL) {
  try {
    // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
    const parsed = new URL(process.env.CLOUDINARY_URL);
    if (!cloudinaryCloudName && parsed.hostname) cloudinaryCloudName = parsed.hostname;
    if (!cloudinaryApiKey && parsed.username) cloudinaryApiKey = parsed.username;
    if (!cloudinaryApiSecret && parsed.password) cloudinaryApiSecret = parsed.password;
  } catch (e) {
    // Ignore URL parse error
  }
}

export const env = {
  port: Number(process.env.PORT || 8787),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  neonAuthUrl: (process.env.VITE_NEON_AUTH_URL && process.env.VITE_NEON_AUTH_URL.trim()) || process.env.NEON_AUTH_BASE_URL,
  neonAuthBaseUrl: process.env.NEON_AUTH_BASE_URL,
  neonAuthCookieSecret: process.env.NEON_AUTH_COOKIE_SECRET,
  devAdminUserId: process.env.DEV_ADMIN_USER_ID,
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  paystackPlanCode: process.env.PAYSTACK_PLAN_CODE,
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
  paystackPublicKey: process.env.VITE_PAYSTACK_PUBLIC_KEY,
  paystackPaymentUrl: process.env.PAYSTACK_PAYMENT_URL,
  superadminPassword: process.env.SUPERADMIN_PASSWORD,
};

const envVarNames: Record<string, string> = {
  cloudinaryCloudName: 'CLOUDINARY_CLOUD_NAME',
  cloudinaryApiKey: 'CLOUDINARY_API_KEY',
  cloudinaryApiSecret: 'CLOUDINARY_API_SECRET',
  databaseUrl: 'DATABASE_URL',
  neonAuthBaseUrl: 'NEON_AUTH_BASE_URL',
  neonAuthCookieSecret: 'NEON_AUTH_COOKIE_SECRET',
  paystackSecretKey: 'PAYSTACK_SECRET_KEY',
  superadminPassword: 'SUPERADMIN_PASSWORD',
};

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    const publicName = envVarNames[name] || String(name);
    throw new Error(`Missing required environment variable: ${publicName}. Please set it in your environment (e.g. Vercel Project Settings > Environment Variables).`);
  }
  return String(value);
}
