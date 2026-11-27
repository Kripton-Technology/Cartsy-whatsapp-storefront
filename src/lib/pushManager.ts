import { adminApi } from './api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getSafeApplicationServerKey(base64String: string): BufferSource {
  const bytes = urlBase64ToUint8Array(base64String);
  // WebKit on iOS strictly requires an exact, non-offset ArrayBuffer backing
  if (bytes.buffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return bytes as unknown as BufferSource;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export async function checkPushSubscriptionStatus(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function enablePushNotifications(): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, message: 'Web Push is not supported in this browser.' };
  }

  // PW-5: iPhone note: web push on iOS works only after the site is added to the Home Screen
  if (isIOS() && !isStandalone()) {
    return {
      success: false,
      message: 'On iPhone/iPad, please first tap the Share button in Safari and select "Add to Home Screen". Then open Cartsy from your Home Screen to enable push notifications.',
    };
  }

  try {
    // 1. Fetch VAPID key first so permission -> subscribe happens cleanly in sequence
    const { publicKey } = await adminApi.getPushVapidKey();
    if (!publicKey) {
      return { success: false, message: 'Push service key could not be retrieved from server.' };
    }

    // 2. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, message: 'Push notification permission was denied or dismissed.' };
    }

    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      return { success: false, message: 'Push manager is not available on this device.' };
    }

    let sub = await reg.pushManager.getSubscription();

    // If an existing subscription exists, verify its keys. If missing or invalid, unsubscribe to create fresh.
    let p256dh = '';
    let auth = '';

    if (sub) {
      const subJson = sub.toJSON();
      p256dh = subJson.keys?.p256dh || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('p256dh')) : '');
      auth = subJson.keys?.auth || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('auth')) : '');

      if (!p256dh || !auth) {
        try {
          await sub.unsubscribe();
        } catch (_) {}
        sub = null;
      }
    }

    if (!sub) {
      const appKey = getSafeApplicationServerKey(publicKey);
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey,
        });
      } catch (subErr: any) {
        // Fallback: in case WebKit version preferred Uint8Array instead of ArrayBuffer
        if (appKey instanceof ArrayBuffer) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array(appKey) as unknown as BufferSource,
          });
        } else {
          throw subErr;
        }
      }

      const subJson = sub.toJSON();
      p256dh = subJson.keys?.p256dh || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('p256dh')) : '');
      auth = subJson.keys?.auth || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('auth')) : '');
    }

    if (!sub || !sub.endpoint || !p256dh || !auth) {
      return { success: false, message: 'Browser generated an incomplete push subscription. Please try again.' };
    }

    await adminApi.subscribePush({
      endpoint: sub.endpoint,
      keys: {
        p256dh,
        auth,
      },
    });

    return { success: true, message: 'Push notifications enabled! You will be alerted for every new order.' };
  } catch (error) {
    console.error('Error enabling push:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to enable push notifications.' };
  }
}
