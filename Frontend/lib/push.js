/**
 * Browser Web Push helpers.
 *
 * Wraps the Service Worker + PushManager dance behind a few intent-level calls
 * the notification bell uses. Every call is a no-op / safe on browsers that
 * don't support push (or when the server has push disabled).
 */
import { apiGet, apiPost } from './api';

/** True when this browser can do Web Push. */
export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** VAPID public keys arrive base64url; the subscribe API needs a Uint8Array. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Current push state for this browser:
 *   'unsupported' | 'denied' | 'subscribed' | 'default'
 */
export async function currentPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? 'subscribed' : 'default';
  } catch { return 'default'; }
}

/**
 * Requests permission, registers the worker, subscribes, and hands the
 * subscription to the server. Returns the resulting state.
 *   'subscribed' | 'denied' | 'default' | 'unsupported' | 'disabled'
 */
export async function enablePush() {
  if (!pushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission; // 'denied' | 'default'

  // The server holds the VAPID public key (and can report push disabled).
  const res = await apiGet('/notifications/push/public-key');
  const publicKey = res?.data?.publicKey;
  if (!publicKey) return 'disabled';

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await apiPost('/notifications/push/subscribe', sub.toJSON());
  return 'subscribed';
}

/** Unsubscribes this browser and forgets it on the server. */
export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await apiPost('/notifications/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* ignore */ }
}
