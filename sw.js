self.addEventListener('push', function (event) {
  let data = { title: 'Frost Admin', body: 'You have a new notification.' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Frost Admin', {
      body: data.body || '',
      icon: 'apple-touch-icon.png',
      badge: 'apple-touch-icon.png',
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const c of clientList) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
