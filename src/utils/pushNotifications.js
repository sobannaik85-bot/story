import { getAdminPassword } from '../auth.js';
import { addNotification } from '../store.js';

const PUSH_STATUS_KEY = 'storyverse_push_status';
let registrationPromise = null;
let messageListenerRegistered = false;

function readStatus() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_STATUS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStatus(nextStatus) {
  const current = readStatus();
  localStorage.setItem(PUSH_STATUS_KEY, JSON.stringify({
    ...current,
    ...nextStatus,
    updatedAt: new Date().toISOString(),
  }));
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchServerPublicKey() {
  const keyResponse = await fetch('/.netlify/functions/push-public-key');
  const keyData = await parseResponse(keyResponse);

  if (!keyResponse.ok || !keyData?.publicKey) {
    throw new Error(keyData?.error || 'Push notifications are not configured on the server.');
  }

  return keyData.publicKey;
}

async function saveSubscriptionToServer(subscription) {
  const saveResponse = await fetch('/.netlify/functions/push-subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const saveData = await parseResponse(saveResponse);

  if (!saveResponse.ok) {
    throw new Error(saveData?.error || 'Could not save push subscription.');
  }
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

async function getRegistration() {
  if (!isPushSupported()) return null;

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/push-sw.js');
  }

  return registrationPromise;
}

async function getSubscription() {
  const registration = await getRegistration();
  if (!registration) return null;

  await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function ensureMessageBridge() {
  if (messageListenerRegistered || !isPushSupported()) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'storyverse-push') return;

    const payload = event.data.payload || {};
    addNotification({
      type: payload.type || 'announcement',
      title: payload.title || 'StoryVerse',
      message: payload.body || payload.message || 'You have a new notification.',
      url: payload.url || '#/notifications',
      icon: '📣',
    });
  });

  messageListenerRegistered = true;
}

export async function ensurePushSubscriptionIfGranted() {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return { ok: false, message: 'Notification permission is not granted.' };
  }

  const registration = await getRegistration();
  ensureMessageBridge();

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await fetchServerPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await saveSubscriptionToServer(subscription);
  writeStatus({
    prompted: true,
    permission: Notification.permission,
    subscribed: true,
    endpoint: subscription.endpoint,
  });

  return { ok: true, subscription };
}

export async function initPushNotifications() {
  if (!isPushSupported()) return;

  try {
    await getRegistration();
    ensureMessageBridge();

    // Once users grant permission, keep subscription fresh automatically.
    if (Notification.permission === 'granted') {
      await ensurePushSubscriptionIfGranted();
    }
  } catch (error) {
    console.error('Failed to initialize push notifications', error);
  }
}

export async function getPushState() {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      prompted: true,
    };
  }

  const subscription = await getSubscription().catch(() => null);
  const storedState = readStatus();

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    prompted: Boolean(storedState.prompted) || Notification.permission !== 'default',
    endpoint: subscription?.endpoint || storedState.endpoint || null,
  };
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { ok: false, message: 'This browser does not support push notifications.' };
  }

  writeStatus({ prompted: true });

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      writeStatus({ permission, subscribed: false, endpoint: null });
      return {
        ok: false,
        message: permission === 'denied'
          ? 'Browser notifications were denied.'
          : 'Notification permission request was dismissed.',
      };
    }
  }

  if (Notification.permission !== 'granted') {
    writeStatus({ permission: Notification.permission, subscribed: false, endpoint: null });
    return { ok: false, message: 'Browser notifications are not enabled.' };
  }

  await ensurePushSubscriptionIfGranted();
  return { ok: true, message: 'Push notifications enabled.' };
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) {
    return { ok: false, message: 'This browser does not support push notifications.' };
  }

  const subscription = await getSubscription();
  if (subscription) {
    await fetch('/.netlify/functions/push-unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
  }

  writeStatus({ subscribed: false, endpoint: null });
  return { ok: true, message: 'Push notifications disabled for this browser.' };
}

export async function sendLocalTestNotification() {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return { ok: false, message: 'Enable browser notifications first.' };
  }

  const registration = await getRegistration();
  await registration.showNotification('StoryVerse notifications enabled', {
    body: 'You will now receive real browser notifications when the admin sends them.',
    icon: '/notification-icon.svg',
    badge: '/notification-icon.svg',
    tag: 'storyverse-test',
    data: {
      url: '/#/notifications',
    },
  });

  return { ok: true, message: 'Test notification sent to this browser.' };
}

export async function sendPushAnnouncement({ title, message, url }) {
  const response = await fetch('/.netlify/functions/push-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': getAdminPassword(),
    },
    body: JSON.stringify({
      title,
      body: message,
      url,
      tag: title,
      icon: '/notification-icon.svg',
    }),
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    return { ok: false, message: data?.error || 'Could not send push notification.' };
  }

  return {
    ok: true,
    sent: data?.sent || 0,
    failed: data?.failed || 0,
    removed: data?.removed || 0,
    message: data?.message || 'Push notification sent.',
  };
}
