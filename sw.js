// sw.js - Service Worker per Push Notifications e Cache
const CACHE_VERSION = 'v1';
const CACHE_NAME = `totemino-${CACHE_VERSION}`;

// File da cachare per l'offline
const STATIC_ASSETS = [
  '/',
  '/gestione.html',
  '/gestione.css',
  '/gestione-script.js',
  '/img/favicon.png'
];

// ============================================
// INSTALL - Cache delle risorse statiche
// ============================================
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

// ============================================
// ACTIVATE - Pulizia vecchie cache
// ============================================
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

// ============================================
// FETCH - Strategia Network First
// ============================================
self.addEventListener('fetch', (event) => {
  // Solo per richieste GET
  if (event.request.method !== 'GET') return;
  
  // Strategia: Network First, fallback su Cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clona la risposta per metterla in cache
        const responseClone = response.clone();
        
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseClone);
          });
        
        return response;
      })
      .catch(() => {
        // Se la rete fallisce, usa la cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Fallback per navigazione
            if (event.request.mode === 'navigate') {
              return caches.match('/gestione.html');
            }
          });
      })
  );
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
  
  // Usa la struttura del server (senza icon, che viene gestita da badge)
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
        // Invia messaggio a tutti i client aperti per ricaricare gli ordini
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
      // Cerca finestre già aperte su gestione.html
      for (let client of clientList) {
        if (client.url.includes('gestione.html') && 'focus' in client) {
          // Invia messaggio per ricaricare ordini
          client.postMessage({
            type: 'RELOAD_ORDERS',
            source: 'notification'
          });
          return client.focus();
        }
      }
      
      // Se nessuna finestra aperta, aprine una nuova
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
  // Eventuale tracking analytics
});

// ============================================
// MESSAGE - Comunicazione con il client
// ============================================
self.addEventListener('message', (event) => {
  console.log('📨 Messaggio ricevuto dal client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.map(name => caches.delete(name))))
        .then(() => {
          event.ports[0].postMessage({ success: true });
        })
    );
  }
});
