// sw.js - Service Worker per Push Notifications
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installato');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker attivato');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('🔔 Notifica push ricevuta');
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nuovo Ordine', body: event.data.text() };
    }
  }
  
  const title = data.title || 'Totemino - Nuovo Ordine';
  const options = {
    body: data.body || 'Hai ricevuto un nuovo ordine',
    icon: data.icon || '/img/favicon.png',
    badge: data.badge || '/img/favicon.png',
    tag: data.tag || 'new-order',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: data.url || '/gestione.html'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Click su notifica');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let client of clientList) {
          if (client.url.includes('gestione.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notifica chiusa');
});
