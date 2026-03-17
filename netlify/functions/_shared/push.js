import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'storyverse-push-subscriptions';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function validateSubscription(subscription) {
  return Boolean(
    subscription
      && typeof subscription.endpoint === 'string'
      && subscription.keys
      && typeof subscription.keys.auth === 'string'
      && typeof subscription.keys.p256dh === 'string'
  );
}

function getSubscriptionStore() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

function getSubscriptionKey(endpoint) {
  return `subscriber/${createHash('sha256').update(endpoint).digest('hex')}`;
}

function getPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error('Push notifications are not configured yet.');
  }

  return { publicKey, privateKey, subject };
}

function requireAdminPassword(request) {
  const expectedPassword = process.env.PUSH_ADMIN_PASSWORD;
  if (!expectedPassword) {
    return { ok: false, response: json({ error: 'Push admin password is not configured.' }, 503) };
  }

  const providedPassword = request.headers.get('x-admin-password');
  if (providedPassword !== expectedPassword) {
    return { ok: false, response: json({ error: 'Unauthorized push request.' }, 401) };
  }

  return { ok: true };
}

async function parseJsonRequest(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export {
  getPushConfig,
  getSubscriptionKey,
  getSubscriptionStore,
  json,
  parseJsonRequest,
  requireAdminPassword,
  validateSubscription,
};
