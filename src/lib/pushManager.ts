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

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Push notification permission was denied or dismissed.' };
  }

  try {
    const { publicKey } = await adminApi.getPushVapidKey();
    if (!publicKey) {
      return { success: false, message: 'Push service key could not be retrieved from server.' };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subJson = sub.toJSON();
    await adminApi.subscribePush({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      },
    });

    return { success: true, message: 'Push notifications enabled! You will be alerted for every new order.' };
  } catch (error) {
    console.error('Error enabling push:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to enable push notifications.' };
  }
}
