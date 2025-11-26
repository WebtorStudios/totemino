// sw.js - Service Worker per Push Notifications
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installato');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker attivato');
  event.waitUntil(clients.claim());
});

// ============================================
// FETCH - Passa tutte le richieste alla rete
// ============================================
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// ============================================
// PUSH - Gestione Notifiche Push
// ============================================
self.addEventListener('push', (event) => {
  console.log('🔔 Notifica push ricevuta');
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('❌ Errore parsing notifica:', e);
      data = { 
        title: 'Totemino - Nuovo Ordine', 
        body: event.data.text() || 'Hai ricevuto un nuovo ordine'
      };
    }
  }
  
  const title = data.title || 'Totemino - Nuovo Ordine';
  const options = {
    body: data.body || 'Hai ricevuto un nuovo ordine',
    badge: data.badge || '/img/favicon.png',
    tag: data.tag || `order-${Date.now()}`,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/gestione.html',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Apri Gestione' },
      { action: 'close', title: 'Chiudi' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NEW_ORDER',
            timestamp: Date.now()
          });
        });
      })
  );
});

// ============================================
// NOTIFICATION CLICK - Apertura App
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Click su notifica');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/gestione.html';
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    })
    .then((clientList) => {
      for (let client of clientList) {
        if (client.url.includes('gestione.html') && 'focus' in client) {
          client.postMessage({
            type: 'RELOAD_ORDERS',
            source: 'notification'
          });
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================
// NOTIFICATION CLOSE
// ============================================
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notifica chiusa');
});

// ============================================
// MESSAGE - Comunicazione con il client
// ============================================
self.addEventListener('message', (event) => {
  console.log('📨 Messaggio ricevuto dal client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
