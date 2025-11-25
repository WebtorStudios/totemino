// sw.js - Service Worker per Push Notifications
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installato');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker attivato');
  event.waitUntil(clients.claim());
});

// Gestione notifiche push
self.addEventListener('push', (event) => {
  console.log('🔔 Notifica push ricevuta:', event);
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nuovo Ordine', body: event.data.text() };
    }
  }
  
  const title = data.title || 'Nuovo Ordine Ricevuto!';
  const options = {
    body: data.body || 'Hai ricevuto un nuovo ordine',
    icon: data.icon || '/img/logo.png',
    badge: '/img/badge.png',
    tag: data.tag || 'new-order',
    requireInteraction: true, // Resta visibile finché non viene chiusa
    vibrate: [200, 100, 200, 100, 200], // Pattern vibrazione
    data: data.url || '/gestione.html',
    actions: [
      {
        action: 'view',
        title: '👁️ Visualizza',
        icon: '/img/view-icon.png'
      },
      {
        action: 'close',
        title: '❌ Chiudi',
        icon: '/img/close-icon.png'
      }
    ],
    sound: '/sounds/notification.mp3' // Suono personalizzato
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Gestione click sulla notifica
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Click su notifica:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    // Apri o porta in primo piano la pagina gestione
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Cerca una finestra già aperta con gestione.html
          for (let client of clientList) {
            if (client.url.includes('gestione.html') && 'focus' in client) {
              return client.focus();
            }
          }
          // Se non trova nessuna finestra aperta, ne apre una nuova
          if (clients.openWindow) {
            return clients.openWindow(event.notification.data);
          }
        })
    );
  }
});

// Gestione chiusura notifica
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notifica chiusa');
});