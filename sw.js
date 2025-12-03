// sw.js - Service Worker per Push Notifications
const SW_VERSION = 'v1.0.0';

// ============================================
// INSTALL
// ============================================
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  self.skipWaiting();
});

// ============================================
// ACTIVATE
// ============================================
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  event.waitUntil(
    clients.claim().then(() => {
      console.log(`[SW ${SW_VERSION}] Activated and controlling pages`);
    })
  );
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
  console.log('[SW] Push received:', event);
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('[SW] Errore parsing notifica:', e);
      data = { 
        title: 'Totemino - Nuovo Ordine', 
        body: event.data.text() || 'Hai ricevuto un nuovo ordine'
      };
    }
  }
  
  const title = data.title || 'Totemino - Nuovo Ordine';
  const options = {
    body: data.body || 'Hai ricevuto un nuovo ordine',
    icon: data.icon || '/img/favicon.png',
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
        console.log('[SW] Notification shown');
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
      .catch(err => {
        console.error('[SW] Errore show notification:', err);
      })
  );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
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
    .catch(err => {
      console.error('[SW] Errore notification click:', err);
    })
  );
});

// ============================================
// NOTIFICATION CLOSE
// ============================================
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

// ============================================
// MESSAGE - Comunicazione con il client
// ============================================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================
// ERROR HANDLING
// ============================================
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled rejection:', event.reason);
});