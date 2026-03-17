import { getSubscriptionKey, getSubscriptionStore, json, parseJsonRequest, validateSubscription } from './_shared/push.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const body = await parseJsonRequest(request);
  const subscription = body?.subscription;
  if (!validateSubscription(subscription)) {
    return json({ error: 'Invalid push subscription payload.' }, 400);
  }

  const store = getSubscriptionStore();
  const key = getSubscriptionKey(subscription.endpoint);

  await store.setJSON(key, {
    subscription,
    createdAt: new Date().toISOString(),
    userAgent: request.headers.get('user-agent') || null,
  });

  return json({ ok: true });
}
