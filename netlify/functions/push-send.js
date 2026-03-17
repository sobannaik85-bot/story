import webpush from 'web-push';
import { getPushConfig, getSubscriptionStore, json, parseJsonRequest, requireAdminPassword } from './_shared/push.js';

function sanitizeTopic(value) {
  return String(value || 'storyverse')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 32) || 'storyverse';
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const auth = requireAdminPassword(request);
  if (!auth.ok) {
    return auth.response;
  }

  let pushConfig;
  try {
    pushConfig = getPushConfig();
  } catch (error) {
    return json({ error: error.message }, 503);
  }

  const body = await parseJsonRequest(request);
  const title = body?.title?.trim();
  const message = body?.body?.trim() || body?.message?.trim();
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : '/#/notifications';
  const tag = sanitizeTopic(body?.tag || title || 'storyverse');
  const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim() : '/notification-icon.svg';

  if (!title || !message) {
    return json({ error: 'Title and message are required.' }, 400);
  }

  const store = getSubscriptionStore();
  const { blobs } = await store.list({ prefix: 'subscriber/' });

  if (blobs.length === 0) {
    return json({ ok: true, sent: 0, failed: 0, removed: 0, message: 'No subscribers yet.' });
  }

  webpush.setVapidDetails(pushConfig.subject, pushConfig.publicKey, pushConfig.privateKey);

  const payload = JSON.stringify({
    type: 'announcement',
    title,
    body: message,
    url,
    icon,
    tag,
    sentAt: new Date().toISOString(),
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const blob of blobs) {
    const entry = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    const subscription = entry?.subscription;

    if (!subscription) {
      await store.delete(blob.key);
      removed += 1;
      continue;
    }

    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 24 * 28,
        urgency: 'high',
        topic: tag,
      });
      sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await store.delete(blob.key);
        removed += 1;
      } else {
        failed += 1;
        console.error('Push send failed', error);
      }
    }
  }

  return json({ ok: true, sent, failed, removed });
}
