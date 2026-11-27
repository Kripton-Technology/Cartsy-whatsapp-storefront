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
  // ── DIAGNOSTIC: environment check ──────────────────────────────────────────
  const diagEnv = {
    ios: isIOS(),
    standalone: isStandalone(),
    hasSW: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    userAgent: navigator.userAgent.slice(0, 120),
  };
  console.log('[PUSH DIAG] Environment:', diagEnv);

  if (typeof window === 'undefined' || !diagEnv.hasSW || !diagEnv.hasPushManager) {
    return { success: false, message: `[DIAG] Web Push not supported. hasSW=${diagEnv.hasSW} hasPushManager=${diagEnv.hasPushManager}` };
  }

  // iPhone must be in standalone (Home Screen PWA) mode
  if (diagEnv.ios && !diagEnv.standalone) {
    return {
      success: false,
      message: '[DIAG-iOS] Not in standalone mode — please add to Home Screen first. Then re-open and try again.',
    };
  }

  try {
    // STEP 1: Fetch VAPID public key
    let publicKey = '';
    try {
      const vapidRes = await adminApi.getPushVapidKey();
      publicKey = vapidRes.publicKey || '';
      console.log('[PUSH DIAG] VAPID key fetched. Length:', publicKey.length);
    } catch (vapidErr: any) {
      const msg = `[DIAG-STEP1] Failed to fetch VAPID key: ${vapidErr?.message || String(vapidErr)}`;
      console.error(msg);
      return { success: false, message: msg };
    }

    if (!publicKey) {
      return { success: false, message: '[DIAG-STEP1] VAPID key returned was empty.' };
    }

    // STEP 2: Request notification permission
    let permission: NotificationPermission = 'default';
    try {
      permission = await Notification.requestPermission();
      console.log('[PUSH DIAG] Permission result:', permission);
    } catch (permErr: any) {
      const msg = `[DIAG-STEP2] Notification.requestPermission() threw: ${permErr?.message || String(permErr)} (name=${permErr?.name})`;
      console.error(msg);
      return { success: false, message: msg };
    }

    if (permission !== 'granted') {
      return { success: false, message: `[DIAG-STEP2] Permission not granted — result was: "${permission}"` };
    }

    // STEP 3: Get service worker registration
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.ready;
      console.log('[PUSH DIAG] SW ready. scope:', reg.scope, 'active:', !!reg.active);
    } catch (swErr: any) {
      const msg = `[DIAG-STEP3] serviceWorker.ready threw: ${swErr?.message || String(swErr)}`;
      console.error(msg);
      return { success: false, message: msg };
    }

    if (!reg.pushManager) {
      return { success: false, message: '[DIAG-STEP3] reg.pushManager is undefined — PushManager not available on this SW.' };
    }

    // STEP 4: Check for existing subscription
    let sub: PushSubscription | null = null;
    try {
      sub = await reg.pushManager.getSubscription();
      console.log('[PUSH DIAG] Existing subscription:', sub ? sub.endpoint.slice(0, 60) : 'none');
    } catch (getSubErr: any) {
      console.warn('[PUSH DIAG] getSubscription() threw (non-fatal):', getSubErr?.message);
    }

    let p256dh = '';
    let auth = '';

    if (sub) {
      const subJson = sub.toJSON();
      p256dh = subJson.keys?.p256dh || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('p256dh')) : '');
      auth = subJson.keys?.auth || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('auth')) : '');
      console.log('[PUSH DIAG] Existing sub keys — p256dh.length:', p256dh.length, 'auth.length:', auth.length);

      if (!p256dh || !auth) {
        console.log('[PUSH DIAG] Stale sub missing keys — unsubscribing...');
        try { await sub.unsubscribe(); } catch (_) {}
        sub = null;
      }
    }

    // STEP 5: Create new subscription
    if (!sub) {
      let appKey: BufferSource;
      try {
        appKey = getSafeApplicationServerKey(publicKey);
        const keyBytes = appKey instanceof ArrayBuffer ? new Uint8Array(appKey) : appKey as Uint8Array;
        console.log('[PUSH DIAG] applicationServerKey bytes:', keyBytes.length, '| first byte:', keyBytes[0]);
      } catch (keyErr: any) {
        const msg = `[DIAG-STEP5-KEY] Failed to decode VAPID key: ${keyErr?.message || String(keyErr)}`;
        console.error(msg);
        return { success: false, message: msg };
      }

      let subscribeError: any = null;
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
        console.log('[PUSH DIAG] subscribe() succeeded (ArrayBuffer key)');
      } catch (subErr1: any) {
        subscribeError = subErr1;
        console.warn('[PUSH DIAG] subscribe() with ArrayBuffer failed:', subErr1?.name, subErr1?.message);

        // Fallback: try raw Uint8Array key
        if (appKey instanceof ArrayBuffer) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: new Uint8Array(appKey) as unknown as BufferSource,
            });
            console.log('[PUSH DIAG] subscribe() succeeded (Uint8Array fallback key)');
            subscribeError = null;
          } catch (subErr2: any) {
            subscribeError = subErr2;
            console.error('[PUSH DIAG] subscribe() Uint8Array fallback also failed:', subErr2?.name, subErr2?.message);
          }
        }

        if (subscribeError) {
          const e = subscribeError;
          const msg = `[DIAG-STEP5-SUB] pushManager.subscribe() failed — name="${e?.name}" message="${e?.message}" code="${e?.code}"`;
          console.error(msg);
          return { success: false, message: msg };
        }
      }

      if (!sub) {
        return { success: false, message: '[DIAG-STEP5-SUB] subscribe() returned null/undefined without throwing.' };
      }

      const subJson = sub.toJSON();
      p256dh = subJson.keys?.p256dh || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('p256dh')) : '');
      auth = subJson.keys?.auth || (sub.getKey ? arrayBufferToBase64Url(sub.getKey('auth')) : '');
      console.log('[PUSH DIAG] New sub keys — p256dh.length:', p256dh.length, 'auth.length:', auth.length, 'endpoint:', sub.endpoint.slice(0, 60));
    }

    if (!sub || !sub.endpoint || !p256dh || !auth) {
      return {
        success: false,
        message: `[DIAG-STEP5] Incomplete subscription — endpoint=${!!sub?.endpoint} p256dh.len=${p256dh.length} auth.len=${auth.length}`,
      };
    }

    // STEP 6: Register subscription with the backend
    try {
      await adminApi.subscribePush({ endpoint: sub.endpoint, keys: { p256dh, auth } });
      console.log('[PUSH DIAG] subscribePush() saved to backend OK');
    } catch (saveErr: any) {
      const msg = `[DIAG-STEP6] Backend /api/admin/push/subscribe failed: ${saveErr?.message || String(saveErr)}`;
      console.error(msg);
      return { success: false, message: msg };
    }

    return { success: true, message: 'Push notifications enabled! You will be alerted for every new order.' };

  } catch (error: any) {
    const msg = `[DIAG-UNCAUGHT] name="${error?.name}" message="${error?.message}" code="${error?.code}"`;
    console.error('[PUSH DIAG] Uncaught error:', error);
    return { success: false, message: msg };
  }
}
