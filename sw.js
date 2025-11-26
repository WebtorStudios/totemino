// sw.js - Service Worker con Cache, Network First, Push, Messaggi + Supporto PWA
// (Versione tua COMPLETA, con minima aggiunta finale)

// -------------------------
// CACHE CONFIG
// -------------------------
const CACHE_VERSION = 'v1';
const CACHE_NAME = `totemino-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/gestione.html',
  '/gestione.css',
  '/gestione-script.js',
  '/img/favicon.png'
];

// -------------------------
// INSTALL
// -------------------------
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installato');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache risorse statiche');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => console.error('❌ Errore cache:', err))
  );
  
  self.skipWaiting();
});

// -------------------------
// ACTIVATE
// -------------------------
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker attivato');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('🗑️ Rimozione cache vecchia:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => clients.claim())
  );
});

// -------------------------
// FETCH - Network First
// -------------------------
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => {
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              return caches.match('/gestione.html');
            }
          });
      })
  );
});

// -------------------------
// PUSH
// -------------------------
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
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => client.postMessage({
          type: 'NEW_ORDER',
          timestamp: Date.now()
        }));
      })
  );
});

// -------------------------
// NOTIFICATION CLICK
// -------------------------
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Click su notifica');
  
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/gestione.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let client of clientList) {
          if (client.url.includes('gestione.html') && 'focus' in client) {
            client.postMessage({ type: 'RELOAD_ORDERS', source: 'notification' });
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});

// -------------------------
// NOTIFICATION CLOSE
// -------------------------
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notifica chiusa');
});

// -------------------------
// MESSAGGI DAL CLIENT
// -------------------------
self.addEventListener('message', (event) => {
  console.log('📨 Messaggio dal client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.map(name => caches.delete(name))))
        .then(() => event.ports[0].postMessage({ success: true }))
    );
  }
});

// -------------------------
// EVENTO PWA INSTALLATA (add-on innocuo)
// -------------------------
self.addEventListener("appinstalled", () => {
  console.log("📲 Totemino installato come PWA!");
});
