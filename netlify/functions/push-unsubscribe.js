import { getSubscriptionKey, getSubscriptionStore, json, parseJsonRequest } from './_shared/push.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const body = await parseJsonRequest(request);
  const endpoint = body?.endpoint || body?.subscription?.endpoint;
  if (!endpoint || typeof endpoint !== 'string') {
    return json({ error: 'Missing subscription endpoint.' }, 400);
  }

  const store = getSubscriptionStore();
  await store.delete(getSubscriptionKey(endpoint));

  return json({ ok: true });
}
