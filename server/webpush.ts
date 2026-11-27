import crypto from 'node:crypto';
import { query } from './db.js';

let vapidKeys: { publicKey: string; privateKey: string } | null = null;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@usecartsy.me';

function base64UrlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

// Default production-stable VAPID keys (can be overridden by process.env)
const DEFAULT_VAPID_PUBLIC_KEY = 'BCNSagRK4WYmOP-XirgQbh9fYeJ1oWbg36b3r6PoHT6BcwPXQ4-Zb9dqgk7vfZbHxOyRCgK5DOzK_CwIcKdmyLA';
const DEFAULT_VAPID_PRIVATE_KEY = '7mffNDZYRCStZPGG8rRWT0kSAbgUSik8lgP2YiaDyvA';

// Initialize or generate VAPID keys
export function getVapidKeys() {
  if (vapidKeys) return vapidKeys;

  vapidKeys = {
    publicKey: (process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim().replace(/^["']|["']$/g, ''),
    privateKey: (process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY).trim().replace(/^["']|["']$/g, ''),
  };
  return vapidKeys;
}

export function getVapidPublicKey(): string {
  return getVapidKeys().publicKey;
}

// Create VAPID JWT token
function createVapidToken(audience: string): string {
  const keys = getVapidKeys();
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  };

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Convert raw base64url private key to PEM or sign using WebCrypto / Node crypto
  const privKeyRaw = base64UrlDecode(keys.privateKey);
  const pubKeyRaw = base64UrlDecode(keys.publicKey);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(pubKeyRaw.subarray(1, 33)),
    y: base64UrlEncode(pubKeyRaw.subarray(33, 65)),
    d: base64UrlEncode(privKeyRaw),
  };

  const privateKey = crypto.createPrivateKey({
    key: jwk as any,
    format: 'jwk',
  });

  const sign = crypto.createSign('SHA256');
  sign.update(unsignedToken);
  sign.end();
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

// Encrypt payload using RFC 8291 (aes128gcm)
function encryptPayload(
  subscription: { p256dh: string; auth: string },
  payloadText: string
): { ciphertext: Buffer } {
  const userPublicKey = base64UrlDecode(subscription.p256dh);
  const userAuth = base64UrlDecode(subscription.auth);

  const localECDH = crypto.createECDH('prime256v1');
  localECDH.generateKeys();
  const localPublicKey = localECDH.getPublicKey();
  const sharedSecret = localECDH.computeSecret(userPublicKey);

  const salt = crypto.randomBytes(16);

  // Key derivation (RFC 8291 Section 3.2 & 3.3)
  const authInfo = Buffer.from('WebPush: info\0', 'utf8');
  const prkKey = crypto.createHmac('sha256', userAuth).update(sharedSecret).digest();

  const keyInfo = Buffer.concat([
    authInfo,
    userPublicKey,
    localPublicKey,
    Buffer.from([0x01]),
  ]);
  const ikm = crypto.createHmac('sha256', prkKey).update(keyInfo).digest();

  // Content encryption key (CEK) & nonce
  const cekPrk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const cekInfo = Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), Buffer.from([0x01])]);
  const cek = crypto.createHmac('sha256', cekPrk).update(cekInfo).digest().subarray(0, 16);

  const nonceInfo = Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf8'), Buffer.from([0x01])]);
  const nonce = crypto.createHmac('sha256', cekPrk).update(nonceInfo).digest().subarray(0, 12);

  // Pad record with delimiter 0x02
  const record = Buffer.concat([Buffer.from(payloadText, 'utf8'), Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(record), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Header: salt (16 bytes) + rs (4 bytes = 4096) + idlen (1 byte = key len) + key
  const rsBuffer = Buffer.alloc(4);
  rsBuffer.writeUInt32BE(4096, 0);
  const keyIdLenBuffer = Buffer.from([localPublicKey.length]);

  const ciphertext = Buffer.concat([
    salt,
    rsBuffer,
    keyIdLenBuffer,
    localPublicKey,
    encrypted,
    tag,
  ]);

  return { ciphertext };
}

export async function sendWebPush(
  subscription: { id?: string; endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; order_number?: string }
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const token = createVapidToken(audience);
    const pubKey = getVapidPublicKey();

    const payloadString = JSON.stringify(payload);
    const { ciphertext } = encryptPayload(subscription, payloadString);

    const headers: Record<string, string> = {
      Authorization: `vapid t=${token}, k=${pubKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    };

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: new Uint8Array(ciphertext) as any,
    });

    if (res.status === 201 || res.status === 200) {
      if (subscription.id) {
        await query('UPDATE push_subscriptions SET last_success_at = now() WHERE id = $1', [subscription.id]).catch(() => {});
      }
      return true;
    }

    // 404 or 410 means subscription is expired or unsubscribed
    if (res.status === 404 || res.status === 410) {
      console.log(`[WebPush] Subscription expired or gone (${res.status}). Removing subscription: ${subscription.endpoint}`);
      await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [subscription.endpoint]).catch(() => {});
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[WebPush] Push failed with status ${res.status}:`, errText);
    }
    return false;
  } catch (error) {
    console.error('[WebPush] Error sending push notification:', error);
    return false;
  }
}

export async function notifyStoreOfNewOrder(
  storeId: string,
  order: { customer_name: string; total: number; order_number: string; items_count: number }
) {
  try {
    const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE store_id = $1',
      [storeId]
    );

    if (!subs || subs.length === 0) return;

    const payload = {
      title: `New order from ${order.customer_name}`,
      body: `GHS ${order.total.toFixed(2)} • ${order.items_count} item${order.items_count === 1 ? '' : 's'} (${order.order_number})`,
      url: `/admin/orders?orderNumber=${encodeURIComponent(order.order_number)}`,
      order_number: order.order_number,
    };

    await Promise.allSettled(subs.map(sub => sendWebPush(sub, payload)));
  } catch (err) {
    console.error('[WebPush] notifyStoreOfNewOrder error:', err);
  }
}
