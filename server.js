require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = new S3Client({ region: 'eu-west-3' });
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
app.set('trust proxy', 1);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ==================== LIVE RELOAD (SOLO SVILUPPO) ====================
if (process.env.NODE_ENV !== 'production') {
  const livereload = require('livereload');
  const connectLivereload = require('connect-livereload');
  
  const liveReloadServer = livereload.createServer();
  liveReloadServer.watch(__dirname);
  app.use(connectLivereload());
  
  liveReloadServer.server.once("connection", () => {
    setTimeout(() => liveReloadServer.refresh("/"), 100);
  });
}

// ==================== MIDDLEWARE ====================
app.use((req, res, next) => {
  if (req.headers['cloudfront-forwarded-proto'] === 'https') {
    req.secure = true;
    req.connection.encrypted = true;
  }
  next();
});

// Webhook Stripe (PRIMA di express.json)
app.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userCode = session.metadata?.userCode;
      const planType = session.metadata?.planType;
      
      
      
      if (!userCode || !planType) {
        console.error('❌ Metadata mancanti');
        return res.status(400).json({ error: 'Metadata mancanti' });
      }
      
      try {
        const users = await FileManager.loadUsers();
        
        if (!users[userCode]) {
          console.error(`❌ Utente ${userCode} non trovato`);
          return res.status(404).json({ error: 'Utente non trovato' });
        }
        
        // ✅ NUOVO: Cancella abbonamento precedente se esiste
        if (users[userCode].stripeSubscriptionId) {
          try {
            await stripe.subscriptions.cancel(users[userCode].stripeSubscriptionId);
            
          } catch (cancelError) {
            console.warn('⚠️ Errore cancellazione abbonamento precedente:', cancelError.message);
          }
        }
        
        // ✅ Recupera subscription ID dalla sessione
        const subscriptionId = session.subscription;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          
          users[userCode].planType = planType;
          users[userCode].paymentDate = new Date().toISOString();
          users[userCode].stripeSessionId = session.id;
          users[userCode].stripeCustomerId = session.customer;
          users[userCode].stripeSubscriptionId = subscriptionId;
          users[userCode].subscriptionEndsAt = new Date(
            subscription.current_period_end * 1000
          ).toISOString();
          
          delete users[userCode].trialEndsAt;
          
          await FileManager.saveUsers(users);
          
          
          
          
          return res.json({ received: true, userCode, planType });
        } else {
          throw new Error('Subscription ID non trovato nella sessione');
        }
        
      } catch (error) {
        console.error('❌ Errore elaborazione pagamento:', error);
        return res.status(500).json({ error: error.message });
      }
    }
    
    res.json({ received: true });
  }
);

// ==================== SUBSCRIPTION MANAGER ====================
const SubscriptionManager = {
  async checkExpiredSubscriptions() {
    try {
      const users = await FileManager.loadUsers();
      let expiredCount = 0;
      const now = new Date();
      
      for (const [userCode, userData] of Object.entries(users)) {
        // Controlla se l'abbonamento è scaduto
        if (userData.planType !== 'free' && userData.subscriptionEndsAt) {
          const endDate = new Date(userData.subscriptionEndsAt);
          
          // ✅ Grace period di 2 giorni
          const gracePeriod = new Date(endDate);
          gracePeriod.setDate(gracePeriod.getDate() + 2);
          
          if (now >= gracePeriod) {
            // Verifica su Stripe se l'abbonamento è ancora attivo
            if (userData.stripeSubscriptionId) {
              try {
                const subscription = await stripe.subscriptions.retrieve(
                  userData.stripeSubscriptionId
                );
                
                if (subscription.status !== 'active' && subscription.status !== 'trialing') {
                  // Abbonamento non attivo, downgrade a free
                  users[userCode].planType = 'free';
                  delete users[userCode].stripeSubscriptionId;
                  delete users[userCode].subscriptionEndsAt;
                  expiredCount++;
                  
                  
                }
              } catch (stripeError) {
                console.error(`❌ Errore verifica subscription per ${userCode}:`, stripeError.message);
                
                // Se l'abbonamento non esiste più su Stripe, downgrade
                if (stripeError.statusCode === 404) {
                  users[userCode].planType = 'free';
                  delete users[userCode].stripeSubscriptionId;
                  delete users[userCode].subscriptionEndsAt;
                  expiredCount++;
                  
                }
              }
            } else {
              // Nessun subscription ID ma data scaduta -> downgrade
              users[userCode].planType = 'free';
              delete users[userCode].subscriptionEndsAt;
              expiredCount++;
              
            }
          }
        }
      }
      
      if (expiredCount > 0) {
        await FileManager.saveUsers(users);
        
      }
      
    } catch (error) {
      console.error('❌ Errore controllo abbonamenti:', error);
    }
  }
};

// ==================== CRON JOB ABBONAMENTI ====================
// Controlla ogni giorno alle 2:00 AM
cron.schedule('0 2 * * *', () => {
  
  SubscriptionManager.checkExpiredSubscriptions();
});

// Controllo all'avvio del server
setTimeout(() => {
  
  SubscriptionManager.checkExpiredSubscriptions();
}, 5000);

app.post('/webhook/stripe-subscription', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook subscription signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    try {
      const users = await FileManager.loadUsers();
      
      switch (event.type) {
        case 'customer.subscription.deleted':
          // Abbonamento cancellato/scaduto
          const deletedSub = event.data.object;
          const userToDowngrade = Object.values(users).find(u => 
            u.stripeSubscriptionId === deletedSub.id
          );
          
          if (userToDowngrade) {
            const userCode = Object.keys(users).find(k => users[k] === userToDowngrade);
            users[userCode].planType = 'free';
            delete users[userCode].stripeSubscriptionId;
            delete users[userCode].subscriptionEndsAt;
            await FileManager.saveUsers(users);
            
          }
          break;
          
        case 'customer.subscription.updated':
          // Rinnovo abbonamento o cambio piano
          const updatedSub = event.data.object;
          const userToUpdate = Object.values(users).find(u => 
            u.stripeSubscriptionId === updatedSub.id
          );
          
          if (userToUpdate) {
            const userCode = Object.keys(users).find(k => users[k] === userToUpdate);
            
            // Aggiorna data di scadenza
            users[userCode].subscriptionEndsAt = new Date(
              updatedSub.current_period_end * 1000
            ).toISOString();
            
            await FileManager.saveUsers(users);
            
          }
          break;
          
        case 'invoice.payment_failed':
          // Pagamento fallito
          const failedInvoice = event.data.object;
          const userWithFailedPayment = Object.values(users).find(u => 
            u.stripeCustomerId === failedInvoice.customer
          );
          
          if (userWithFailedPayment) {
            const userCode = Object.keys(users).find(k => users[k] === userWithFailedPayment);
            console.warn(`⚠️ Pagamento fallito per ${userCode}`);
            // Opzionale: invia notifica via email
          }
          break;
      }
      
      res.json({ received: true });
      
    } catch (error) {
      console.error('❌ Errore elaborazione webhook subscription:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Middleware per body parsing
app.use(express.static(__dirname));

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    name: 'Totemino',
    short_name: 'Totemino',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/img/favicon.png',
        sizes: '192x192',
        type: 'image/png'
      }
    ]
  });
});

app.use(express.json({ limit: '50mb' }));

// Middleware di autenticazione
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      requireLogin: true,
      message: 'Autenticazione richiesta'
    });
  }
  next();
};

// ==================== FILE MANAGER (UTILITIES CENTRALIZZATE) ====================
const FileManager = {
  PATHS: {
    users: path.join(__dirname, 'userdata', 'users.json'),
  },

  ensureDir(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }
  },

  initDirectories() {
    this.ensureDir(path.join(__dirname, 'IDs'));
    this.ensureDir(path.join(__dirname, 'userdata'));
    this.ensureDir(path.join(__dirname, 'sessions'));    
  },

  async loadUsers() {
    try {
      this.ensureDir(path.dirname(this.PATHS.users));
      if (!fsSync.existsSync(this.PATHS.users)) return {};
      
      const data = await fs.readFile(this.PATHS.users, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Errore caricamento utenti:', error);
      return {};
    }
  },

  async saveUsers(users) {
    try {
      this.ensureDir(path.dirname(this.PATHS.users));
      await fs.writeFile(this.PATHS.users, JSON.stringify(users, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio utenti:', error);
      return false;
    }
  },

  async loadJSON(filePath, defaultValue = {}) {
    try {
      if (!fsSync.existsSync(filePath)) return defaultValue;
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return defaultValue;
    }
  },

  async saveJSON(filePath, data) {
    try {
      this.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio JSON:', error);
      return false;
    }
  },

  generateUniqueFilename(baseDir, prefix, identifier, extension = '.json') {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, ' - ')
      .replace(/\..+/, '')
      .replace(/:/g, '.');
    
    let fileName = `${prefix} ${identifier} - ${timestamp}${extension}`;
    let filePath = path.join(baseDir, fileName);
    
    let counter = 1;
    while (fsSync.existsSync(filePath)) {
      fileName = `${prefix} ${identifier} - ${timestamp}_${counter}${extension}`;
      filePath = path.join(baseDir, fileName);
      counter++;
    }
    
    return { fileName, filePath };
  },
  
  async loadSubscriptions() {
    try {
      this.ensureDir(path.dirname(this.PATHS.subscriptions));
      if (!fsSync.existsSync(this.PATHS.subscriptions)) return {};
      
      const data = await fs.readFile(this.PATHS.subscriptions, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Errore caricamento subscriptions:', error);
      return {};
    }
  },

  async saveSubscriptions(subscriptions) {
    try {
      this.ensureDir(path.dirname(this.PATHS.subscriptions));
      await fs.writeFile(this.PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio subscriptions:', error);
      return false;
    }
  }
};
  
FileManager.initDirectories();

// ==================== SESSIONS ====================
const session = require('express-session');
const sqlite = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);

const sessionsDB = new sqlite('./sessions/sessions.db', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
});

app.use(session({
  store: new SqliteStore({
    client: sessionsDB,
    expired: {
      clear: true,
      intervalMs: 12 * 60 * 60 * 1000 
    }
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  rolling: true,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// ==================== CUSTOMIZATION PARSER ====================
const CustomizationParser = {
  /**
   * Parse itemKey formato: "nome|{opt1:2,opt2:1}"
   * Ritorna: { name, customizations }
   */
  parseItemKey(key) {
    const match = key.match(/^(.+?)\|\{(.+)\}$/);
    if (!match) return { name: key, customizations: {} };
    
    const name = match[1];
    const customStr = match[2];
    const customizations = {};
    
    if (customStr) {
      customStr.split(',').forEach(pair => {
        const [k, v] = pair.split(':');
        customizations[k] = parseInt(v) || 0;
      });
    }
    
    return { name, customizations };
  },

  /**
   * Calcola il prezzo finale di un item con customizzazioni
   */
  async calculateItemPrice(restaurantId, itemName, customizations = {}) {
    try {
      const menuPath = path.join(__dirname, 'IDs', restaurantId, 'menu.json');
      const customPath = path.join(__dirname, 'IDs', restaurantId, 'customizations.json');
      
      const menuData = await FileManager.loadJSON(menuPath, { categories: [] });
      const customizationData = await FileManager.loadJSON(customPath, {});
      
      let baseItem = null;
      for (const category of menuData.categories) {
        const found = category.items.find(i => i.name === itemName);
        if (found) {
          baseItem = found;
          break;
        }
      }
      
      if (!baseItem) return 0;
      
      let finalPrice = baseItem.price;
      const customizationDetails = [];
      
      if (baseItem.customizable && baseItem.customizationGroup) {
        const group = customizationData[baseItem.customizationGroup];
        if (group) {
          group.forEach(section => {
            section.options.forEach(opt => {
              const qty = customizations[opt.id] || 0;
              if (qty > 0) {
                finalPrice += opt.priceModifier * qty;
                customizationDetails.push({
                  id: opt.id,
                  name: opt.name,
                  priceModifier: opt.priceModifier,
                  quantity: qty
                });
              }
            });
          });
        }
      }
      
      return { finalPrice, customizationDetails, basePrice: baseItem.price };
      
    } catch (error) {
      console.error('❌ Errore calcolo prezzo:', error);
      return { finalPrice: 0, customizationDetails: [], basePrice: 0 };
    }
  },

  /**
   * Processa gli items dall'ordine con customizzazioni
   */
  async processOrderItems(restaurantId, rawItems) {
    const processedItems = [];
    
    for (const item of rawItems) {
      const { name, quantity, category, ingredients, isSuggested, isCoperto, customizations = {} } = item;
      
      if (isCoperto) {
        processedItems.push({
          name,
          basePrice: item.price,
          finalPrice: item.price,
          quantity,
          category,
          ingredients,
          isSuggested: false,
          isCoperto: true,
          customizations: {},
          customizationDetails: []
        });
        continue;
      }
      
      const priceData = await this.calculateItemPrice(restaurantId, name, customizations);
      
      processedItems.push({
        name,
        basePrice: priceData.basePrice,
        finalPrice: priceData.finalPrice,
        quantity,
        category,
        ingredients,
        isSuggested: isSuggested || false,
        isCoperto: false,
        customizations,
        customizationDetails: priceData.customizationDetails
      });
    }
    
    return processedItems;
  }
};

// ==================== STATISTICS MANAGER ====================
const StatisticsManager = {
  async updateStats(restaurantId, orderData) {
    const now = new Date();
    const monthYear = `${now.getMonth() + 1}-${now.getFullYear()}`;
    const statsPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', 'months', `${monthYear}.json`);
    const salesPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', 'daily-sales', `${monthYear}.json`);
    const usersPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', 'users', 'general.json');
    
    try {
      let stats = await FileManager.loadJSON(statsPath, {
        totale_ordini: 0,
        totale_incasso: 0,
        scontrino_medio: 0,
        numero_piatti_venduti: {},
        numero_categorie_venduti: {},
        customizzazioni_popolari: {},
        suggerimenti: {
          totale_items_suggeriti: 0,
          totale_valore_suggeriti: 0,
          items_suggeriti_venduti: {},
          categorie_suggerite_vendute: {}
        }
      });
      
      stats.totale_ordini += 1;
      if (orderData.total && typeof orderData.total === 'number') {
        stats.totale_incasso = parseFloat((stats.totale_incasso + orderData.total).toFixed(2));
      }
      stats.scontrino_medio = stats.totale_ordini > 0 
        ? Math.round((stats.totale_incasso / stats.totale_ordini) * 100) / 100 
        : 0;
      
      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items.forEach(item => {
          const itemName = item.name;
          const quantity = item.quantity || 1;
          const finalPrice = item.finalPrice || item.price || 0;
          
          if (!stats.numero_piatti_venduti[itemName]) {
            stats.numero_piatti_venduti[itemName] = { count: 0, revenue: 0 };
          }
          stats.numero_piatti_venduti[itemName].count += quantity;
          stats.numero_piatti_venduti[itemName].revenue += finalPrice * quantity;
          
          if (item.category) {
            stats.numero_categorie_venduti[item.category] = 
              (stats.numero_categorie_venduti[item.category] || 0) + quantity;
          }
          
          if (item.customizationDetails && item.customizationDetails.length > 0) {
            item.customizationDetails.forEach(custom => {
              if (!stats.customizzazioni_popolari[custom.name]) {
                stats.customizzazioni_popolari[custom.name] = 0;
              }
              stats.customizzazioni_popolari[custom.name] += custom.quantity;
            });
          }
          
          if (item.isSuggested) {
            stats.suggerimenti.totale_items_suggeriti += quantity;
            stats.suggerimenti.totale_valore_suggeriti = parseFloat(
              (stats.suggerimenti.totale_valore_suggeriti + (finalPrice * quantity)).toFixed(2)
            );
            
            stats.suggerimenti.items_suggeriti_venduti[itemName] = 
              (stats.suggerimenti.items_suggeriti_venduti[itemName] || 0) + quantity;
            
            if (item.category) {
              stats.suggerimenti.categorie_suggerite_vendute[item.category] = 
                (stats.suggerimenti.categorie_suggerite_vendute[item.category] || 0) + quantity;
            }
          }
        });
      }
      
      await FileManager.saveJSON(statsPath, stats);
      
      let salesData = await FileManager.loadJSON(salesPath, []);
      
      const day = now.getDate();
      let entry = salesData.find(d => d.day === day);
      if (!entry) {
        entry = { day, sales: 0 };
        salesData.push(entry);
        salesData.sort((a, b) => a.day - b.day);
      }
      
      const orderTotal = typeof orderData.total === 'number' ? orderData.total : 0;
      entry.sales = parseFloat((entry.sales + orderTotal).toFixed(2));
      
      const jsonString = '[\n' + salesData.map(d => 
        `  { "day": ${d.day}, "sales": ${d.sales.toFixed(2)} }`
      ).join(',\n') + '\n]';
      
      await fs.writeFile(salesPath, jsonString, 'utf8');
      
      if (orderData.userId) {
        let usersData = await FileManager.loadJSON(usersPath, {});
        
        const userId = orderData.userId;
        if (!usersData[userId]) {
          usersData[userId] = {
            ordersCount: 0,
            totalSpent: 0,
            lastOrderDate: null
          };
        }
        
        usersData[userId].ordersCount += 1;
        usersData[userId].totalSpent = parseFloat(
          (usersData[userId].totalSpent + orderTotal).toFixed(2)
        );
        
        const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
        usersData[userId].lastOrderDate = dateStr;
        
        await FileManager.saveJSON(usersPath, usersData);
      }
      
    } catch (error) {
      console.error('❌ Errore aggiornamento statistiche:', error);
    }
  }
};

// ==================== PUSH NOTIFICATION MANAGER ====================
const PushNotificationManager = {
  PATHS: {
    subscriptions: path.join(__dirname, 'userdata', 'push-subscriptions.json')
  },

  async loadSubscriptions() {
    try {
      FileManager.ensureDir(path.dirname(this.PATHS.subscriptions));
      if (!fsSync.existsSync(this.PATHS.subscriptions)) {
        await fs.writeFile(this.PATHS.subscriptions, '{}');
        return {};
      }
      
      const data = await fs.readFile(this.PATHS.subscriptions, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Errore caricamento subscriptions:', error);
      return {};
    }
  },

  async saveSubscriptions(subscriptions) {
    try {
      FileManager.ensureDir(path.dirname(this.PATHS.subscriptions));
      await fs.writeFile(this.PATHS.subscriptions, JSON.stringify(subscriptions, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio subscriptions:', error);
      return false;
    }
  },

  async addSubscription(restaurantId, subscription) {
    try {
      const subscriptions = await this.loadSubscriptions();
      
      if (!subscriptions[restaurantId]) {
        subscriptions[restaurantId] = [];
      }
      
      const exists = subscriptions[restaurantId].some(
        sub => sub.endpoint === subscription.endpoint
      );
      
      if (!exists) {
        subscriptions[restaurantId].push(subscription);
        await this.saveSubscriptions(subscriptions);
        
      }
      
      return true;
    } catch (error) {
      console.error('❌ Errore aggiunta subscription:', error);
      return false;
    }
  },

  async removeSubscription(endpoint) {
    try {
      const subscriptions = await this.loadSubscriptions();
      let removed = false;
      
      for (const restaurantId in subscriptions) {
        const initialLength = subscriptions[restaurantId].length;
        subscriptions[restaurantId] = subscriptions[restaurantId].filter(
          sub => sub.endpoint !== endpoint
        );
        
        if (subscriptions[restaurantId].length < initialLength) {
          removed = true;
        }
      }
      
      if (removed) {
        await this.saveSubscriptions(subscriptions);
        
      }
      
      return removed;
    } catch (error) {
      console.error('❌ Errore rimozione subscription:', error);
      return false;
    }
  },

  async sendNotification(restaurantId, orderData) {
    try {
      const subscriptions = await this.loadSubscriptions();
      const restaurantSubs = subscriptions[restaurantId] || [];
      
      if (restaurantSubs.length === 0) {
        
        return;
      }

      const isDelivery = orderData.delivery && orderData.delivery.length > 0;
      const isTakeaway = orderData.takeaway && orderData.takeaway.length > 0;
      
      if (!isDelivery && !isTakeaway) {
        return;
      }

      let title, body, orderTotal, orderTime;

      if (isDelivery) {
        const delivery = orderData.delivery[0];
        orderTotal = orderData.total + (delivery.shipping || 0) + (delivery.discount || 0);
        orderTime = delivery.time || 'N/A';
        
        title = 'Nuova Consegna';
        body = `Hai un nuovo ordine di €${orderTotal.toFixed(2)} per le ${orderTime}`;
      } else {
        const takeaway = orderData.takeaway[0];
        orderTotal = orderData.total;
        orderTime = takeaway.time || 'N/A';
        
        title = 'Nuovo Takeaway';
        body = `Hai un nuovo ordine di €${orderTotal.toFixed(2)} per le ${orderTime}`;
      }

      const payload = JSON.stringify({
        title,
        body,
        badge: '/img/badge.png',
        tag: `order-${Date.now()}`,
        url: `/gestione.html?id=${restaurantId}`
      });

      const promises = restaurantSubs.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, payload);
          
        } catch (error) {
          console.error('❌ Errore invio notifica:', error);
          
          if (error.statusCode === 410 || error.statusCode === 404) {
            await this.removeSubscription(subscription.endpoint);
          }
        }
      });

      await Promise.all(promises);
      
    } catch (error) {
      console.error('❌ Errore sendNotification:', error);
    }
  }
};

// ==================== TRIAL MANAGER ====================
const TrialManager = {
  async checkAndExpireTrials() {
    try {
      const users = await FileManager.loadUsers();
      let expiredCount = 0;
      const now = new Date();
      
      for (const [userCode, userData] of Object.entries(users)) {
        // ✅ Rimuovi solo trialEndsAt se scaduto
        if (userData.planType === 'free' && userData.trialEndsAt) {
          const trialEnd = new Date(userData.trialEndsAt);
          
          if (now >= trialEnd) {
            delete users[userCode].trialEndsAt;
            expiredCount++;
          }
        }
      }
      
      if (expiredCount > 0) {
        await FileManager.saveUsers(users);
        
      }
      
    } catch (error) {
      console.error('❌ Errore controllo trial:', error);
    }
  }
};

// Cron job per trial (ogni giorno a mezzanotte)
cron.schedule('0 0 * * *', () => {
  
  TrialManager.checkAndExpireTrials();
});

// Controllo all'avvio del server
setTimeout(() => {
  
  TrialManager.checkAndExpireTrials();
}, 5000);

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  const { userCode, password } = req.body;

  if (!userCode || !password) {
    return res.status(400).json({
      success: false,
      message: 'ID utente e password richiesti'
    });
  }

  try {
    const users = await FileManager.loadUsers();
    const user = users[userCode];
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    req.session.user = {
      userCode,
      restaurantId: userCode,
      planType: user.planType || 'free'
    };

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      user: req.session.user
    });

  } catch (error) {
    console.error('❌ Errore login:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { userCode, password } = req.body;

  if (!userCode || !password) {
    return res.status(400).json({
      success: false,
      message: 'ID utente e password richiesti'
    });
  }

  if (!/^\d{4}$/.test(userCode)) {
    return res.status(400).json({
      success: false,
      message: 'ID deve essere di 4 cifre numeriche'
    });
  }

  if (password.length < 8 || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'Password deve avere almeno 8 caratteri e almeno un numero'
    });
  }

  try {
    const users = await FileManager.loadUsers();
    
    if (users[userCode]) {
      return res.status(409).json({
        success: false,
        message: 'ID utente già esistente'
      });
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);

    const hashedPassword = await bcrypt.hash(password, 10);
    users[userCode] = {
      password: hashedPassword,
      planType: 'free',
      createdAt: now.toISOString(),
      trialEndsAt: trialEnd.toISOString()
    };

    await FileManager.saveUsers(users);
    
    res.json({
      success: true,
      message: 'Registrazione completata con successo',
      user: { 
        userCode, 
        restaurantId: userCode, 
        planType: 'free', 
        trialEndsAt: trialEnd.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Errore registrazione:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, requireLogin: true });
  }

  const users = await FileManager.loadUsers();
  const userCode = req.session.user.userCode;
  const freshUser = users[userCode];

  if (!freshUser) {
    return res.json({ success: false, requireLogin: true });
  }

  let isTrialActive = false;
  let trialDaysLeft = 0;

  // Trial attivo solo se planType='free' E trialEndsAt è futuro
  if (freshUser.planType === 'free' && freshUser.trialEndsAt) {
    const now = new Date();
    const trialEnd = new Date(freshUser.trialEndsAt);
    
    if (now < trialEnd) {
      isTrialActive = true;
      trialDaysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    }
  }

  // ✅ Aggiorna sessione con info abbonamento
  req.session.user.planType = freshUser.planType;
  req.session.user.isTrialActive = isTrialActive;
  req.session.user.trialDaysLeft = trialDaysLeft;
  req.session.user.subscriptionEndsAt = freshUser.subscriptionEndsAt;
  req.session.user.stripeSubscriptionId = freshUser.stripeSubscriptionId;

  return res.json({ 
    success: true, 
    user: req.session.user 
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Errore logout:', err);
      return res.status(500).json({
        success: false,
        message: 'Errore durante il logout'
      });
    }
    res.json({ success: true });
  });
});

// ==================== STRIPE ROUTES ====================
app.post('/api/create-checkout', requireAuth, async (req, res) => {
  const { priceId } = req.body;
  const userCode = req.session.user.userCode;
  
  if (!priceId) {
    return res.status(400).json({ error: 'Price ID mancante' });
  }
  
  try {
    const users = await FileManager.loadUsers();
    const user = users[userCode];
    
    // ✅ VERIFICA: Non permettere nuovo checkout se abbonamento attivo
    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          return res.status(400).json({ 
            error: 'Hai già un abbonamento attivo. Cancellalo prima di sottoscriverne uno nuovo.',
            currentSubscription: {
              status: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
            }
          });
        }
      } catch (stripeError) {
        // Se l'abbonamento non esiste più, puoi procedere
        
      }
    }
    
    const price = await stripe.prices.retrieve(priceId);
    const planType = price.metadata?.planType;
    
    if (!planType) {
      console.error('❌ Metadata planType mancante per price:', priceId);
      return res.status(500).json({ 
        error: 'Configurazione piano mancante. Contatta il supporto.' 
      });
    }

    

    const origin = process.env.NODE_ENV === 'production'
      ? 'https://totemino.it'
      : `http://localhost:${process.env.PORT || 3000}`;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile.html?id=${userCode}`,
      metadata: {
        userCode: userCode,
        planType: planType
      },
      client_reference_id: userCode,
      customer: user.stripeCustomerId || undefined // Riusa customer se esiste
    });
    
    res.json({ url: session.url, sessionId: session.id });
    
  } catch (error) {
    console.error('❌ Errore creazione checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/verify-payment/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const userCode = req.session.user.userCode;
  
  try {
    const users = await FileManager.loadUsers();
    
    // ✅ CONTROLLO 1: Verifica se questa sessione è già stata usata
    if (users[userCode].stripeSessionId === sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Questa sessione di pagamento è già stata utilizzata',
        alreadyProcessed: true
      });
    }
    
    // ✅ CONTROLLO 2: Verifica lo stato del pagamento su Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // ✅ CONTROLLO 3: Verifica che la sessione appartenga all'utente corrente
    if (session.metadata?.userCode !== userCode) {
      return res.status(403).json({
        success: false,
        error: 'Questa sessione non appartiene al tuo account'
      });
    }
    
    if (session.payment_status === 'paid') {
      // ✅ Estrai planType dai metadata della sessione
      const planType = session.metadata?.planType || 'premium';
      
      // ✅ CONTROLLO 4: Cancella abbonamento precedente se esiste
      if (users[userCode].stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(users[userCode].stripeSubscriptionId);
          console.log(`✅ Abbonamento precedente cancellato per ${userCode}`);
        } catch (cancelError) {
          console.warn('⚠️ Errore cancellazione abbonamento precedente:', cancelError.message);
        }
      }
      
      // ✅ Recupera subscription ID dalla sessione
      const subscriptionId = session.subscription;
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // ✅ Aggiorna l'utente con i nuovi dati
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = sessionId; // ✅ Salva per prevenire riutilizzo
        users[userCode].stripeCustomerId = session.customer;
        users[userCode].stripeSubscriptionId = subscriptionId;
        users[userCode].subscriptionEndsAt = new Date(
          subscription.current_period_end * 1000
        ).toISOString();
        
        delete users[userCode].trialEndsAt;
        
        await FileManager.saveUsers(users);
        
        // ✅ Aggiorna sessione
        req.session.user.planType = planType;
        
        console.log(`✅ Pagamento verificato per ${userCode} - Piano: ${planType}`);
        
        res.json({
          success: true,
          paid: true,
          planType: planType,
          currentPlan: users[userCode].planType
        });
      } else {
        throw new Error('Subscription ID non trovato nella sessione');
      }
    } else {
      res.json({
        success: true,
        paid: false,
        paymentStatus: session.payment_status
      });
    }
  } catch (error) {
    console.error('❌ Errore verifica pagamento:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/stripe/connect-link', requireAuth, async (req, res) => {
  try {
    const userCode = req.session.user.userCode;

    const users = await FileManager.loadUsers();
    const user = users[userCode];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    // Riusa l’account se già esiste, altrimenti creane uno nuovo
    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express', // se usi account "standard" cambia in 'standard'
        metadata: {
          userCode
        }
        // opzionale: email, business_type, ecc.
      });

      accountId = account.id;
      user.stripeConnectAccountId = accountId;
      await FileManager.saveUsers(users);
    }

    const origin = process.env.NODE_ENV === 'production'
      ? process.env.PRODUCTION_URL
      : `http://localhost:${process.env.PORT || 3000}`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/gestione.html?id=${userCode}&stripe_refresh=1`,
      return_url: `${origin}/gestione.html?id=${userCode}&stripe_return=1`,
      type: 'account_onboarding'
    });

    return res.json({
      success: true,
      url: accountLink.url
    });

  } catch (error) {
    console.error('❌ Errore creazione account link Stripe Connect:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore nella creazione del link di onboarding Stripe'
    });
  }
});

// ✅ AGGIUNGI QUESTO NUOVO ENDPOINT
app.get('/api/stripe/verify-connection/:restaurantId', requireAuth, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    if (req.session.user.restaurantId !== restaurantId) {
      return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
    }

    const users = await FileManager.loadUsers();
    const user = users[restaurantId];

    if (!user || !user.stripeConnectAccountId) {
      return res.json({ 
        success: true, 
        connected: false,
        message: 'Nessun account Stripe collegato' 
      });
    }

    // Verifica lo stato dell'account su Stripe
    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    
    const isFullyOnboarded = account.charges_enabled && account.payouts_enabled;
    
    if (isFullyOnboarded && !user.stripeConnected) {
      // ✅ Aggiorna lo stato nel database
      user.stripeConnected = true;
      await FileManager.saveUsers(users);
    }

    return res.json({
      success: true,
      connected: isFullyOnboarded,
      accountId: user.stripeConnectAccountId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    });

  } catch (error) {
    console.error('❌ Errore verifica connessione Stripe:', error);
    return res.status(500).json({
      success: false,
      connected: false,
      message: 'Errore nella verifica dello stato Stripe'
    });
  }
});

app.get('/api/here-config', (req, res) => {
  res.json({
    APP_ID: process.env.VITE_HERE_APP_ID,
    API_KEY: process.env.VITE_HERE_API_KEY
  });
});

// ==================== PUSH NOTIFICATION ROUTES ====================
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ 
    success: true,
    publicKey: process.env.VAPID_PUBLIC_KEY 
  });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    const restaurantId = req.session.user.restaurantId;
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ 
        success: false, 
        message: 'Subscription non valida' 
      });
    }
    
    const success = await PushNotificationManager.addSubscription(
      restaurantId, 
      subscription
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Subscription salvata con successo' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Errore nel salvataggio della subscription' 
      });
    }
    
  } catch (error) {
    console.error('❌ Errore /api/push/subscribe:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ 
        success: false, 
        message: 'Endpoint mancante' 
      });
    }
    
    const success = await PushNotificationManager.removeSubscription(endpoint);
    
    res.json({ 
      success: true, 
      message: success ? 'Subscription rimossa' : 'Subscription non trovata' 
    });
    
  } catch (error) {
    console.error('❌ Errore /api/push/unsubscribe:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ==================== RESTAURANT STATUS ====================
app.get('/api/restaurant-status/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  
  try {
    const users = await FileManager.loadUsers();
    const user = users[restaurantId];
    
    if (!user) {
      return res.json({ 
        planType: 'free', 
        isTrialActive: false 
      });
    }
    
    let isTrialActive = false;
    if (user.planType === 'free' && user.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(user.trialEndsAt);
      
      if (now < trialEnd) {
        isTrialActive = true;
      }
    }
    
    res.json({
      planType: user.planType,
      isTrialActive: isTrialActive
    });
    
  } catch (error) {
    console.error('❌ Errore caricamento status ristorante:', error);
    res.status(500).json({ 
      planType: 'free', 
      isTrialActive: false 
    });
  }
});

// ==================== ADMIN PROTECTED ROUTES ====================
app.post('/upload-image', requireAuth, async (req, res) => {
  const { fileName, fileData, restaurantId, oldImageUrl } = req.body;
  
  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }
  
  if (!fileName || !fileData || !restaurantId) {
    return res.status(400).json({ success: false, message: 'Dati mancanti' });
  }
  
  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: 'eu-west-3' });
    
    const base64Data = fileData.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const fileNameParts = fileName.split('.');
    const extension = fileNameParts.pop();
    let baseName = fileNameParts.join('.');
    
    // Estrai il nome della vecchia immagine
    let oldFileName = null;
    if (oldImageUrl) {
      const oldKey = oldImageUrl.replace('https://totemino.s3.eu-west-3.amazonaws.com/', '');
      oldFileName = oldKey.split('/').pop(); // prende solo il nome file
    }
    
    // Se il nuovo nome è uguale al vecchio, incrementa
    let finalFileName = `${baseName}.${extension}`;
    if (oldFileName && finalFileName === oldFileName) {
      finalFileName = `${baseName}_1.${extension}`;
    }
    
    let s3Key = `${restaurantId}/img/${finalFileName}`;
    let counter = 2;
    
    // Controlla se esiste già
    while (true) {
      try {
        await s3Client.send(new HeadObjectCommand({
          Bucket: 'totemino',
          Key: s3Key
        }));
        finalFileName = `${baseName}_${counter}.${extension}`;
        s3Key = `${restaurantId}/img/${finalFileName}`;
        counter++;
      } catch (err) {
        break;
      }
    }
    
    // Carica la nuova immagine
    const uploadParams = {
      Bucket: 'totemino',
      Key: s3Key,
      Body: buffer,
      ContentType: 'image/jpeg',
    };
    
    await s3Client.send(new PutObjectCommand(uploadParams));
    
    const imageUrl = `https://totemino.s3.eu-west-3.amazonaws.com/${s3Key}`;
    
    // Elimina la vecchia
    if (oldImageUrl) {
      const oldKey = oldImageUrl.replace('https://totemino.s3.eu-west-3.amazonaws.com/', '');
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: 'totemino',
          Key: oldKey
        }));
      } catch (err) {
        
      }
    }
    
    res.json({ success: true, fileName: finalFileName, imageUrl });
    
  } catch (error) {
    console.error('❌ Errore upload immagine:', error);
    res.status(500).json({ success: false, message: 'Errore nel salvataggio dell\'immagine' });
  }
});

app.post('/save-menu/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { menuContent } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!menuContent) {
    return res.status(400).json({ success: false, message: 'Contenuto del menu mancante' });
  }

  const restaurantDir = path.join(__dirname, 'IDs', restaurantId);
  const backupDir = path.join(restaurantDir, 'menu-backups');
  const menuFilePath = path.join(restaurantDir, 'menu.json');

  try {
    FileManager.ensureDir(restaurantDir);
    FileManager.ensureDir(backupDir);

    if (fsSync.existsSync(menuFilePath)) {
      const backupFiles = (await fs.readdir(backupDir))
        .filter(f => f.startsWith('menu_') && f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(backupDir, f);
          const stats = fsSync.statSync(filePath);
          return {
            name: f,
            path: filePath,
            time: stats.mtime.getTime()
          };
        })
        .sort((a, b) => b.time - a.time);

      if (backupFiles.length >= 3) {
        const oldestBackup = backupFiles[backupFiles.length - 1];
        await fs.unlink(oldestBackup.path);
      }

      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, '_')
        .replace(/\..+/, '')
        .replace(/:/g, '-');
      
      const backupFileName = `menu_${timestamp}.json`;
      const backupPath = path.join(backupDir, backupFileName);
      
      await fs.copyFile(menuFilePath, backupPath);
    }

    await fs.writeFile(menuFilePath, JSON.stringify(menuContent, null, 2), 'utf8');
    
    res.json({ 
      success: true, 
      backupCreated: fsSync.existsSync(menuFilePath)
    });

  } catch (error) {
    console.error('❌ Errore salvataggio menu:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio del menu',
      details: error.message
    });
  }
});

app.post('/save-settings/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { settings } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!settings) {
    return res.status(400).json({ success: false, message: 'Impostazioni mancanti' });
  }

  const settingsPath = path.join(__dirname, 'IDs', restaurantId, 'settings.json');

  try {
    await FileManager.saveJSON(settingsPath, settings);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Errore salvataggio impostazioni:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio delle impostazioni',
      details: error.message
    });
  }
});

app.post('/save-menu-types/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { menuTypes } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!menuTypes) {
    return res.status(400).json({ success: false, message: 'Menu types mancanti' });
  }

  const menuTypesPath = path.join(__dirname, 'IDs', restaurantId, 'menuTypes.json');

  try {
    await FileManager.saveJSON(menuTypesPath, { menuTypes });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Errore salvataggio menu types:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio dei menu types',
      details: error.message
    });
  }
});

app.post('/save-customizations/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { customizations } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!customizations) {
    return res.status(400).json({ success: false, message: 'Customizzazioni mancanti' });
  }

  const customizationsPath = path.join(__dirname, 'IDs', restaurantId, 'customizations.json');

  try {
    await FileManager.saveJSON(customizationsPath, customizations);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Errore salvataggio customizzazioni:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio delle customizzazioni',
      details: error.message
    });
  }
});

// ==================== PUBLIC ROUTES (NO AUTH) ====================
app.get('/IDs/:restaurantId/customizations.json', async (req, res) => {
  const { restaurantId } = req.params;
  const customizationsPath = path.join(__dirname, 'IDs', restaurantId, 'customizations.json');

  try {
    const customizations = await FileManager.loadJSON(customizationsPath, {});
    res.json(customizations);
  } catch (error) {
    console.error('❌ Errore caricamento customizzazioni:', error);
    res.status(500).json({ error: 'Errore nel caricamento delle customizzazioni' });
  }
});

app.get('/IDs/:restaurantId/menuTypes.json', async (req, res) => {
  const { restaurantId } = req.params;
  const settingsPath = path.join(__dirname, 'IDs', restaurantId, 'menuTypes.json');

  try {
    const settings = await FileManager.loadJSON(settingsPath, { copertoPrice: 0 });
    res.json(settings);
  } catch (error) {
    console.error('❌ Errore caricamento impostazioni:', error);
    res.status(500).json({ error: 'Errore nel caricamento delle impostazioni' });
  }
});

// ==================== ORDER ROUTES (PUBLIC - NO AUTH) ====================
app.post('/IDs/:restaurantId/orders/:section', async (req, res) => {
  const { restaurantId, section } = req.params;
  const orderData = req.body;

  const restaurantDir = path.join(__dirname, 'IDs', restaurantId);
  if (!fsSync.existsSync(restaurantDir)) {
    return res.status(404).json({ error: 'Ristorante non trovato' });
  }

  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  
  try {
    FileManager.ensureDir(ordersDir);
    
    const processedItems = await CustomizationParser.processOrderItems(restaurantId, orderData.items);
    
    const calculatedTotal = processedItems.reduce((sum, item) => 
      sum + (item.finalPrice * item.quantity), 0
    );
    
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, ' - ')
      .replace(/\..+/, '')
      .replace(/:/g, '.');

    const fileName = `${timestamp}.json`;
    const filePath = path.join(ordersDir, fileName);

    let counter = 1;
    let finalFilePath = filePath;
    while (fsSync.existsSync(finalFilePath)) {
      const fileNameWithCounter = `${timestamp}_${counter}.json`;
      finalFilePath = path.join(ordersDir, fileNameWithCounter);
      counter++;
    }
    
    const completeOrderData = {
      userId: orderData.userId,
      items: processedItems,
      orderNotes: orderData.orderNotes || [],
      total: calculatedTotal,
      timestamp: new Date().toISOString(),
      type: section,
      restaurantId,
      orderStatus: 'pending' // ✅ Rinominato da 'status' a 'orderStatus'
    };

    if (orderData.table) completeOrderData.table = orderData.table;
    if (orderData.delivery) completeOrderData.delivery = orderData.delivery;
    if (orderData.takeaway) completeOrderData.takeaway = orderData.takeaway;
    
    await fs.writeFile(filePath, JSON.stringify(completeOrderData, null, 2));
    
    await StatisticsManager.updateStats(restaurantId, completeOrderData);
    await PushNotificationManager.sendNotification(restaurantId, completeOrderData);
    
    res.json({ 
      success: true, 
      fileName,
      orderId: fileName.replace('.json', ''),
      timestamp: completeOrderData.timestamp
    });
    
  } catch (error) {
    console.error(`❌ Errore salvataggio ordine ${section}:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ADMIN ORDER MANAGEMENT (PROTECTED) ====================
app.get('/IDs/:restaurantId/orders/:section', requireAuth, async (req, res) => {
  const { restaurantId, section } = req.params;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  
  try {
    if (!fsSync.existsSync(ordersDir)) {
      return res.json([]);
    }
    
    const files = await fs.readdir(ordersDir);
    const orders = [];
    
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const filePath = path.join(ordersDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const orderData = JSON.parse(fileContent);
        
        // IMPORTANTE: l'id deve corrispondere al nome file senza .json
        orderData._filename = file;
        orderData.id = file.replace('.json', '');
        orders.push(orderData);
        
      } catch (fileError) {
        console.error(`❌ Errore lettura ${file}:`, fileError.message);
      }
    }
    
    orders.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    res.json(orders);
    
  } catch (error) {
    console.error('❌ Errore lettura ordini:', error);
    res.status(500).json({ error: 'Errore nel caricamento degli ordini' });
  }
});

app.patch('/IDs/:restaurantId/orders/:section/:orderId', requireAuth, async (req, res) => {
  const { restaurantId, section, orderId } = req.params;
  const { status } = req.body; // Mantieni 'status' per compatibilità API

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  const orderFile = path.join(ordersDir, `${orderId}.json`);
  
  try {
    if (!fsSync.existsSync(orderFile)) {
      const files = await fs.readdir(ordersDir);
      const matchingFile = files.find(f => f.includes(orderId) || f.replace('.json', '') === orderId);
      
      if (!matchingFile) {
        return res.status(404).json({ error: 'Ordine non trovato' });
      }
      
      const actualFile = path.join(ordersDir, matchingFile);
      const fileContent = await fs.readFile(actualFile, 'utf8');
      const orderData = JSON.parse(fileContent);
      
      orderData.orderStatus = status; // ✅ Usa 'orderStatus'
      orderData.lastModified = new Date().toISOString();
      
      await fs.writeFile(actualFile, JSON.stringify(orderData, null, 2));
      return res.json({ success: true, orderId, status });
    }
    
    const fileContent = await fs.readFile(orderFile, 'utf8');
    const orderData = JSON.parse(fileContent);
    
    orderData.orderStatus = status; // ✅ Usa 'orderStatus'
    orderData.lastModified = new Date().toISOString();
    
    await fs.writeFile(orderFile, JSON.stringify(orderData, null, 2));
    res.json({ success: true, orderId, status });
    
  } catch (error) {
    console.error('❌ Errore aggiornamento ordine:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento dello stato' });
  }
});

// ==================== DELETE ORDER ENDPOINT ====================
app.delete('/IDs/:restaurantId/orders/:section/:orderId', requireAuth, async (req, res) => {
  const { restaurantId, section, orderId } = req.params;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  const orderFile = path.join(ordersDir, `${orderId}.json`);
  
  try {
    // Verifica se il file esiste
    if (!fsSync.existsSync(orderFile)) {
      // Prova a cercare il file con pattern matching
      const files = await fs.readdir(ordersDir);
      const matchingFile = files.find(f => f.includes(orderId) || f.replace('.json', '') === orderId);
      
      if (!matchingFile) {
        return res.status(404).json({ error: 'Ordine non trovato' });
      }
      
      const actualFile = path.join(ordersDir, matchingFile);
      
      // Elimina definitivamente il file
      await fs.unlink(actualFile);
      
      
      return res.json({ 
        success: true, 
        message: 'Ordine eliminato definitivamente',
        orderId 
      });
    }
    
    // Elimina definitivamente il file
    await fs.unlink(orderFile);
    
    
    res.json({ 
      success: true, 
      message: 'Ordine eliminato definitivamente',
      orderId 
    });
    
  } catch (error) {
    console.error('❌ Errore eliminazione ordine:', error);
    res.status(500).json({ 
      error: 'Errore nell\'eliminazione dell\'ordine',
      details: error.message 
    });
  }
});

// ===== BANNER ROUTES (PROTECTED) =====
app.post('/save-banners/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { banners } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!Array.isArray(banners)) {
    return res.status(400).json({ success: false, message: 'Dati banner non validi' });
  }

  const bannersPath = path.join(__dirname, 'IDs', restaurantId, 'banners.json');

  try {
    await FileManager.saveJSON(bannersPath, banners);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio',
      details: error.message
    });
  }
});

app.get('/IDs/:restaurantId/banners.json', async (req, res) => {
  const { restaurantId } = req.params;
  const bannersPath = path.join(__dirname, 'IDs', restaurantId, 'banners.json');

  try {
    const banners = await FileManager.loadJSON(bannersPath, []);
    res.json(banners);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel caricamento dei banner' });
  }
});

// ===== PROMO CODES ROUTES (PROTECTED) =====
app.post('/save-promo/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { promos } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!Array.isArray(promos)) {
    return res.status(400).json({ success: false, message: 'Dati promo non validi' });
  }

  const promosPath = path.join(__dirname, 'IDs', restaurantId, 'promo.json');

  try {
    await FileManager.saveJSON(promosPath, promos);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio',
      details: error.message
    });
  }
});

app.get('/IDs/:restaurantId/promo.json', async (req, res) => {
  const { restaurantId } = req.params;
  const promosPath = path.join(__dirname, 'IDs', restaurantId, 'promo.json');

  try {
    const promos = await FileManager.loadJSON(promosPath, []);
    res.json(promos);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel caricamento dei codici sconto' });
  }
});

// ==================== STATISTICS ROUTES (PROTECTED) ====================
app.get('/api/months/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }

  try {
    const folder = path.join(__dirname, 'IDs', restaurantId, 'statistics');
    if (!fsSync.existsSync(folder)) {
      return res.status(404).json({ error: 'Cartella statistiche non trovata' });
    }

    const files = await fs.readdir(folder);
    const months = files
      .map(f => f.replace('.json',''))
      .filter(f => /^\d{1,2}-\d{4}$/.test(f))
      .sort((a,b) => {
        const [mA,yA] = a.split('-').map(Number);
        const [mB,yB] = b.split('-').map(Number);
        return yA !== yB ? yA - yB : mA - mB;
      });

    res.json(months);
  } catch (err) {
    console.error('❌ Errore caricamento mesi:', err);
    res.status(500).json({ error: 'Errore interno server' });
  }
});

app.get('/IDs/:restaurantId/statistics/:monthYear', requireAuth, async (req, res) => {
  const { restaurantId, monthYear } = req.params;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  try {
    const statsPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', `${monthYear}.json`);
    
    const stats = await FileManager.loadJSON(statsPath, {
      totale_ordini: 0,
      totale_incasso: 0,
      scontrino_medio: 0,
      numero_piatti_venduti: {},
      numero_categorie_venduti: {},
      customizzazioni_popolari: {}
    });
    
    res.json({ month: monthYear, stats });
    
  } catch (error) {
    console.error('❌ Errore lettura statistiche:', error);
    res.status(500).json({ error: 'Errore nel caricamento delle statistiche' });
  }
});

app.get('/IDs/:restaurantId/statistics', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const currentMonth = `${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
  
  res.redirect(`/IDs/${restaurantId}/statistics/${currentMonth}`);
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    success: false,
    message: 'Errore interno del server'
  });
});

// ==================== STARTUP ====================
FileManager.initDirectories();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  
  
});




