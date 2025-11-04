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

const app = express();
app.set('trust proxy', 1);

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

// Sessioni
const session = require('express-session');
const FileStore = require('session-file-store')(session);

app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 14 * 86400,
    retries: 0,
    reapInterval: 86400,
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

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
      const planType = session.metadata?.planType || 'premium';
      
      if (!userCode) {
        console.error('❌ UserCode mancante nei metadata');
        return res.status(400).json({ error: 'UserCode mancante' });
      }
      
      try {
        const users = await FileManager.loadUsers();
        
        if (!users[userCode]) {
          console.error(`❌ Utente ${userCode} non trovato`);
          return res.status(404).json({ error: 'Utente non trovato' });
        }
        
        const newStatus = planType === 'pro' ? 'pro' : 'paid';
        
        users[userCode].status = newStatus;
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = session.id;
        users[userCode].stripeCustomerId = session.customer;
        
        await FileManager.saveUsers(users);
        
        
        return res.json({ received: true, userCode, status: newStatus });
        
      } catch (error) {
        console.error('❌ Errore elaborazione pagamento:', error);
        return res.status(500).json({ error: error.message });
      }
    }
    
    res.json({ received: true });
  }
);

// Middleware per body parsing
app.use(express.static(__dirname));
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
    preferences: path.join(__dirname, 'userdata', 'users-preferences.json')
  },

  ensureDir(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }
  },

  initDirectories() {
    this.ensureDir(path.join(__dirname, 'IDs'));
    this.ensureDir(path.join(__dirname, 'userdata'));
    
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

  async loadPreferences() {
    try {
      this.ensureDir(path.dirname(this.PATHS.preferences));
      if (!fsSync.existsSync(this.PATHS.preferences)) {
        await fs.writeFile(this.PATHS.preferences, '{}');
        return {};
      }
      
      const data = await fs.readFile(this.PATHS.preferences, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Errore caricamento preferenze:', error);
      return {};
    }
  },

  async savePreferences(preferences) {
    try {
      this.ensureDir(path.dirname(this.PATHS.preferences));
      await fs.writeFile(this.PATHS.preferences, JSON.stringify(preferences, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio preferenze:', error);
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
  }
};

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
      // Carica menu e customization data
      const menuPath = path.join(__dirname, 'IDs', restaurantId, 'menu.json');
      const customPath = path.join(__dirname, 'IDs', restaurantId, 'customization.json');
      
      const menuData = await FileManager.loadJSON(menuPath, { categories: [] });
      const customizationData = await FileManager.loadJSON(customPath, {});
      
      // Trova l'item base
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
      
      // Aggiungi modificatori
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
    
    // rawItems è l'array che arriva dal client
    for (const item of rawItems) {
      const { name, quantity, category, ingredients, isSuggested, isCoperto, customizations = {} } = item;
      
      // Se è coperto, usa il prezzo diretto
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
      
      // Calcola prezzo con customizzazioni
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
    const statsPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', `${monthYear}.json`);
    const salesPath = path.join(__dirname, 'IDs', restaurantId, 'daily-sales', `${monthYear}.json`);
    const usersPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', 'users', 'general.json');
    
    try {
      // === CARICA STATISTICHE ===
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
      
      // === AGGIORNA TOTALI ===
      stats.totale_ordini += 1;
      if (orderData.total && typeof orderData.total === 'number') {
        stats.totale_incasso = parseFloat((stats.totale_incasso + orderData.total).toFixed(2));
      }
      stats.scontrino_medio = stats.totale_ordini > 0 
        ? Math.round((stats.totale_incasso / stats.totale_ordini) * 100) / 100 
        : 0;
      
      // === TRACCIA PIATTI E CUSTOMIZZAZIONI ===
      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items.forEach(item => {
          const itemName = item.name;
          const quantity = item.quantity || 1;
          const finalPrice = item.finalPrice || item.price || 0;
          
          // Conta piatti venduti (con prezzo finale corretto)
          if (!stats.numero_piatti_venduti[itemName]) {
            stats.numero_piatti_venduti[itemName] = { count: 0, revenue: 0 };
          }
          stats.numero_piatti_venduti[itemName].count += quantity;
          stats.numero_piatti_venduti[itemName].revenue += finalPrice * quantity;
          
          // Conta categorie
          if (item.category) {
            stats.numero_categorie_venduti[item.category] = 
              (stats.numero_categorie_venduti[item.category] || 0) + quantity;
          }
          
          // Traccia customizzazioni popolari
          if (item.customizationDetails && item.customizationDetails.length > 0) {
            item.customizationDetails.forEach(custom => {
              if (!stats.customizzazioni_popolari[custom.name]) {
                stats.customizzazioni_popolari[custom.name] = 0;
              }
              stats.customizzazioni_popolari[custom.name] += custom.quantity;
            });
          }
          
          // Traccia suggerimenti
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
      
      // === VENDITE GIORNALIERE ===
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
      
      // === TRACCIA UTENTI ===
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

// ==================== PREFERENCES MANAGER ====================
const PreferencesManager = {
  async updatePreferences(userId, items) {
    try {
      const preferences = await FileManager.loadPreferences();
      
      if (!preferences[userId]) {
        preferences[userId] = {};
      }
      
      items.forEach(item => {
        const quantity = item.quantity || 1;
        const ingredients = item.ingredients || [];
        
        // Traccia ingredienti base
        ingredients.forEach(ingredient => {
          const cleanIngredient = ingredient.trim().toLowerCase();
          if (cleanIngredient) {
            preferences[userId][cleanIngredient] = 
              (preferences[userId][cleanIngredient] || 0) + quantity;
          }
        });
        
        // Traccia customizzazioni come preferenze
        if (item.customizationDetails && item.customizationDetails.length > 0) {
          item.customizationDetails.forEach(custom => {
            const cleanCustom = `custom_${custom.name.trim().toLowerCase()}`;
            preferences[userId][cleanCustom] = 
              (preferences[userId][cleanCustom] || 0) + custom.quantity;
          });
        }
      });
      
      await FileManager.savePreferences(preferences);
      return true;
    } catch (error) {
      console.error('❌ Errore aggiornamento preferenze:', error);
      return false;
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
        if (userData.status === 'free' && userData.trialEndsAt) {
          const trialEnd = new Date(userData.trialEndsAt);
          
          if (now >= trialEnd) {
            delete users[userCode].trialEndsAt;
            expiredCount++;
            
          }
        }
      }
      
      if (expiredCount > 0) {
        await FileManager.saveUsers(users);
        
      } else {
        
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
      status: user.status || 'free',
      planType: user.planType || null
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
      status: 'free',
      createdAt: now.toISOString(),
      trialEndsAt: trialEnd.toISOString()
    };

    await FileManager.saveUsers(users);
    
    const userDir = path.join(__dirname, 'IDs', userCode);
    FileManager.ensureDir(userDir);

    res.json({
      success: true,
      message: 'Registrazione completata con successo',
      user: { 
        userCode, 
        restaurantId: userCode, 
        status: 'free',
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

  if (freshUser.status === 'free' && freshUser.trialEndsAt) {
    const now = new Date();
    const trialEnd = new Date(freshUser.trialEndsAt);
    
    if (now < trialEnd) {
      isTrialActive = true;
      trialDaysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    }
  }

  req.session.user.status = freshUser.status;
  req.session.user.isTrialActive = isTrialActive;
  req.session.user.trialDaysLeft = trialDaysLeft;
  req.session.user.planType = freshUser.planType;

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
  const { priceId, planType } = req.body;
  const userCode = req.session.user.userCode;
  
  if (!priceId) {
    return res.status(400).json({ error: 'Price ID mancante' });
  }
  
  try {
    const origin = process.env.NODE_ENV === 'production' 
      ? process.env.PRODUCTION_URL 
      : `http://localhost:${process.env.PORT || 3000}`;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gestione.html?id=${userCode}`,
      metadata: {
        userCode: userCode,
        planType: planType || 'premium'
      },
      client_reference_id: userCode
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.metadata.userCode !== userCode) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    if (session.payment_status === 'paid') {
      const users = await FileManager.loadUsers();
      
      if (users[userCode]) {
        const planType = session.metadata.planType || 'premium';
        const newStatus = planType === 'pro' ? 'pro' : 'paid';
        
        users[userCode].status = newStatus;
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = session.id;
        users[userCode].stripeCustomerId = session.customer;
        
        await FileManager.saveUsers(users);
        
        req.session.user.status = newStatus;
        req.session.user.planType = planType;
      }
      
      res.json({
        success: true,
        paid: true,
        planType: session.metadata.planType,
        currentStatus: users[userCode]?.status || 'free'
      });
    } else {
      res.json({
        success: true,
        paid: false,
        paymentStatus: session.payment_status
      });
    }
    
  } catch (error) {
    console.error('❌ Errore verifica pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PREFERENCES ROUTES ====================
app.post('/api/update-preferences', async (req, res) => {
  const { userId, items } = req.body;
  
  if (!userId || !items || !Array.isArray(items)) {
    return res.status(400).json({ 
      success: false, 
      message: 'userId e items richiesti' 
    });
  }
  
  try {
    const success = await PreferencesManager.updatePreferences(userId, items);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Errore nel salvataggio delle preferenze' 
      });
    }
  } catch (error) {
    console.error('❌ Errore endpoint preferenze:', error);
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
        status: 'free', 
        isTrialActive: false 
      });
    }
    
    let isTrialActive = false;
    if (user.status === 'free' && user.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(user.trialEndsAt);
      
      if (now < trialEnd) {
        isTrialActive = true;
      }
    }
    
    res.json({
      status: user.status,
      isTrialActive: isTrialActive,
      planType: user.planType || null
    });
    
  } catch (error) {
    console.error('❌ Errore caricamento status ristorante:', error);
    res.status(500).json({ 
      status: 'free', 
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
        console.log(`⚠️ Errore eliminazione: ${oldKey}`);
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

app.post('/save-customizations/:restaurantId', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const { customizations } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }

  if (!customizations) {
    return res.status(400).json({ success: false, message: 'Customizzazioni mancanti' });
  }

  const customizationsPath = path.join(__dirname, 'IDs', restaurantId, 'customization.json');

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
app.get('/IDs/:restaurantId/customization.json', async (req, res) => {
  const { restaurantId } = req.params;
  const customizationsPath = path.join(__dirname, 'IDs', restaurantId, 'customization.json');

  try {
    const customizations = await FileManager.loadJSON(customizationsPath, {});
    res.json(customizations);
  } catch (error) {
    console.error('❌ Errore caricamento customizzazioni:', error);
    res.status(500).json({ error: 'Errore nel caricamento delle customizzazioni' });
  }
});

app.get('/IDs/:restaurantId/settings.json', async (req, res) => {
  const { restaurantId } = req.params;
  const settingsPath = path.join(__dirname, 'IDs', restaurantId, 'settings.json');

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
    
    // ✅ PROCESSA ITEMS CON CUSTOMIZZAZIONI
    const processedItems = await CustomizationParser.processOrderItems(restaurantId, orderData.items);
    
    // ✅ CALCOLA TOTALE CORRETTO
    const calculatedTotal = processedItems.reduce((sum, item) => 
      sum + (item.finalPrice * item.quantity), 0
    );
    
    const identifier = section === 'pickup' 
      ? (orderData.orderNumber || 100) 
      : (orderData.tableNumber || 'unknown');
    
    const { fileName, filePath } = FileManager.generateUniqueFilename(
      ordersDir, 
      section.charAt(0).toUpperCase() + section.slice(1), 
      identifier
    );
    
    // ✅ STRUTTURA ORDINE PULITA (SENZA DATI DUPLICATI)
    const completeOrderData = {
      userId: orderData.userId,
      tableNumber: orderData.tableNumber,
      orderNumber: orderData.orderNumber,
      items: processedItems,
      orderNotes: orderData.orderNotes || [],
      total: calculatedTotal,
      timestamp: new Date().toISOString(),
      type: section,
      restaurantId,
      status: 'pending'
    };
    
    // Salva ordine
    await fs.writeFile(filePath, JSON.stringify(completeOrderData, null, 2));
    
    // Aggiorna statistiche
    await StatisticsManager.updateStats(restaurantId, completeOrderData);
    
    // Aggiorna preferenze utente
    if (orderData.userId) {
      await PreferencesManager.updatePreferences(orderData.userId, processedItems);
    }
    
    
    
    res.json({ 
      success: true, 
      fileName, 
      [section === 'pickup' ? 'orderNumber' : 'tableNumber']: identifier 
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
  const { status } = req.body;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  const orderFile = path.join(ordersDir, `${orderId}.json`);
  
  try {
    if (!fsSync.existsSync(orderFile)) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    
    const fileContent = await fs.readFile(orderFile, 'utf8');
    const orderData = JSON.parse(fileContent);
    
    orderData.status = status;
    orderData.lastModified = new Date().toISOString();
    
    await fs.writeFile(orderFile, JSON.stringify(orderData, null, 2));
    res.json({ success: true, orderId, status });
    
  } catch (error) {
    console.error('❌ Errore aggiornamento ordine:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento dello stato' });
  }
});

app.delete('/IDs/:restaurantId/orders/:section/:orderId', requireAuth, async (req, res) => {
  const { restaurantId, section, orderId } = req.params;

  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  
  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  const deletedDir = path.join(__dirname, 'IDs', restaurantId, 'orders', 'deleted');
  const orderFile = path.join(ordersDir, `${orderId}.json`);

  try {
    if (!fsSync.existsSync(orderFile)) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    
    FileManager.ensureDir(deletedDir);
    const timestamp = Date.now();
    const newFileName = `${orderId}_deleted_${timestamp}.json`;
    const deletedFilePath = path.join(deletedDir, newFileName);

    await fs.rename(orderFile, deletedFilePath);
    res.json({ success: true, orderId, deletedFile: newFileName });

  } catch (error) {
    console.error('❌ Errore eliminazione ordine:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione dell\'ordine' });
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
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

});






