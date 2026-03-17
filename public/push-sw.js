self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function postToClients(payload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'storyverse-push', payload });
  }
}

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'StoryVerse',
      body: event.data ? event.data.text() : 'You have a new notification.',
      url: '/#/notifications',
      tag: 'storyverse',
      icon: '/notification-icon.svg',
    };
  }

  const title = payload.title || 'StoryVerse';
  const options = {
    body: payload.body || payload.message || 'You have a new notification.',
    icon: payload.icon || '/notification-icon.svg',
    badge: payload.icon || '/notification-icon.svg',
    tag: payload.tag || 'storyverse',
    data: {
      url: payload.url || '/#/notifications',
    },
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    postToClients(payload),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/#/notifications', self.location.origin).toString();

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url === targetUrl && 'focus' in client) {
        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }

    return undefined;
  })());
});
