require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.set('trust proxy', 1);

// === LIVE RELOAD (SOLO IN SVILUPPO) ===
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

// === MIDDLEWARE (ORDINE CORRETTO!) ===
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ⚠️ WEBHOOK DEVE essere PRIMA di express.json()
app.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log('Webhook ricevuto:', event.type);
    
    // Gestisci checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      console.log('Pagamento completato:', session.id);
      console.log('Metadata:', session.metadata);
      
      try {
        const userCode = session.metadata?.userCode;
        const planType = session.metadata?.planType || 'premium';
        
        if (!userCode) {
          console.error('UserCode mancante nei metadata');
          return res.status(400).json({ error: 'UserCode mancante' });
        }
        
        // Carica e aggiorna utente
        const users = await loadAllUsers();
        
        if (!users[userCode]) {
          console.error(`Utente ${userCode} non trovato`);
          return res.status(404).json({ error: 'Utente non trovato' });
        }
        
        // Determina lo status in base al piano
        let newStatus;
        if (planType === 'pro') {
          newStatus = 'pro';
        } else {
          newStatus = 'paid'; // per premium
        }
        
        // Aggiorna lo status
        users[userCode].status = newStatus;
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = session.id;
        users[userCode].stripeCustomerId = session.customer;
        
        const saved = await saveAllUsers(users);
        
        if (saved) {
          console.log(`Utente ${userCode} aggiornato a status: ${newStatus} (${planType})`);
          return res.json({ received: true, userCode, status: newStatus });
        } else {
          console.error('Errore salvataggio users.json');
          return res.status(500).json({ error: 'Errore salvataggio' });
        }
        
      } catch (error) {
        console.error('Errore elaborazione pagamento:', error);
        return res.status(500).json({ error: error.message });
      }
    }
    
    // Altri eventi webhook
    console.log(`Evento ${event.type} ricevuto ma non gestito`);
    res.json({ received: true });
  }
);

// DOPO il webhook, aggiungi express.json()
app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));

// Auth middleware
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

// === UTILITIES ===
function ensureDirectoryExists(dirPath) {
  if (!fsSync.existsSync(dirPath)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
  }
}

function initializeDirectories() {
  ensureDirectoryExists(path.join(__dirname, 'IDs'));
  ensureDirectoryExists(path.join(__dirname, 'userdata'));
  console.log('Struttura directories inizializzata');
}

// === GESTIONE UTENTI CENTRALIZZATA ===
const USERS_FILE = path.join(__dirname, 'userdata', 'users.json');

async function loadAllUsers() {
  try {
    ensureDirectoryExists(path.dirname(USERS_FILE));
    
    if (!fsSync.existsSync(USERS_FILE)) {
      return {};
    }
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Errore caricamento utenti:', error);
    return {};
  }
}

async function saveAllUsers(users) {
  try {
    ensureDirectoryExists(path.dirname(USERS_FILE));
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Errore salvataggio utenti:', error);
    return false;
  }
}

async function findUserByCode(userCode) {
  const users = await loadAllUsers();
  return users[userCode] || null;
}

function generateUniqueFilename(baseDir, prefix, identifier, extension = '.json') {
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

// === STATISTICS ===
async function updateStats(restaurantId, orderData) {
  const now = new Date();
  const monthYear = `${now.getMonth() + 1}-${now.getFullYear()}`;
  const statsPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', `${monthYear}.json`);
  const salesPath = path.join(__dirname, 'IDs', restaurantId, 'daily-sales', `${monthYear}.json`);
  const usersPath = path.join(__dirname, 'IDs', restaurantId, 'statistics', 'users', 'general.json');
  
  try {
    // === CARICA O INIZIALIZZA STATISTICHE ===
    ensureDirectoryExists(path.dirname(statsPath));
    let stats = {
      totale_ordini: 0,
      totale_incasso: 0,
      scontrino_medio: 0,
      numero_piatti_venduti: {},
      numero_categorie_venduti: {},
      suggerimenti: {
        totale_items_suggeriti: 0,
        totale_valore_suggeriti: 0,
        items_suggeriti_venduti: {},
        categorie_suggerite_vendute: {}
      }
    };
    
    if (fsSync.existsSync(statsPath)) {
      const existing = JSON.parse(await fs.readFile(statsPath, 'utf8'));
      stats = { ...stats, ...existing };
      
      // Assicura che suggerimenti esista
      if (!stats.suggerimenti) {
        stats.suggerimenti = {
          totale_items_suggeriti: 0,
          totale_valore_suggeriti: 0,
          items_suggeriti_venduti: {},
          categorie_suggerite_vendute: {}
        };
      }
    }
    
    // === AGGIORNA TOTALI ===
    stats.totale_ordini += 1;
    if (orderData.total && typeof orderData.total === 'number') {
      stats.totale_incasso = parseFloat((stats.totale_incasso + orderData.total).toFixed(2));
    }
    stats.scontrino_medio = stats.totale_ordini > 0 ? 
      Math.round((stats.totale_incasso / stats.totale_ordini) * 100) / 100 : 0;
    
    // === TRACCIA PIATTI VENDUTI ===
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        const itemName = item.name;
        const quantity = item.quantity || 1;
        
        // Conta piatti venduti
        stats.numero_piatti_venduti[itemName] = (stats.numero_piatti_venduti[itemName] || 0) + quantity;
        
        // Conta categorie vendute
        if (item.category) {
          stats.numero_categorie_venduti[item.category] = (stats.numero_categorie_venduti[item.category] || 0) + quantity;
        }
        
        // Traccia suggerimenti
        if (item.isSuggested) {
          stats.suggerimenti.totale_items_suggeriti += quantity;
          stats.suggerimenti.totale_valore_suggeriti = parseFloat(
            (stats.suggerimenti.totale_valore_suggeriti + (item.price * quantity)).toFixed(2)
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
    
    // Salva statistiche
    await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));
    
    // === AGGIORNA VENDITE GIORNALIERE ===
    ensureDirectoryExists(path.dirname(salesPath));
    let salesData = [];
    if (fsSync.existsSync(salesPath)) {
      try {
        salesData = JSON.parse(await fs.readFile(salesPath, 'utf8'));
      } catch {}
    }
    
    const day = now.getDate();
    let entry = salesData.find(d => d.day === day);
    if (!entry) {
      entry = { day, sales: 0 };
      salesData.push(entry);
      salesData.sort((a, b) => a.day - b.day);
    }
    
    const orderTotal = typeof orderData.total === 'number' ? orderData.total : 0;
    entry.sales = parseFloat((entry.sales + orderTotal).toFixed(2));
    
    const jsonString = '[\n' + salesData.map(d => `  { "day": ${d.day}, "sales": ${d.sales.toFixed(2)} }`).join(',\n') + '\n]';
    await fs.writeFile(salesPath, jsonString, 'utf8');
    
    // === TRACCIA UTENTI ===
    if (orderData.userId) {
      ensureDirectoryExists(path.dirname(usersPath));
      let usersData = {};
      
      if (fsSync.existsSync(usersPath)) {
        try {
          usersData = JSON.parse(await fs.readFile(usersPath, 'utf8'));
        } catch {}
      }
      
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
      
      // Formato: dd-MM-yyyy_hh-mm
      const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      usersData[userId].lastOrderDate = dateStr;
      
      await fs.writeFile(usersPath, JSON.stringify(usersData, null, 2));
    }
    
  } catch (error) {
    console.error('Errore aggiornamento statistiche:', error);
  }
}

// === USER PREFERENCES MANAGEMENT ===
const PREFERENCES_FILE = path.join(__dirname, 'userdata', 'users-preferences.json');

async function loadUserPreferences() {
  try {
    ensureDirectoryExists(path.dirname(PREFERENCES_FILE));
    
    if (!fsSync.existsSync(PREFERENCES_FILE)) {
      // Crea file vuoto se non esiste
      await fs.writeFile(PREFERENCES_FILE, '{}');
      return {};
    }
    
    const data = await fs.readFile(PREFERENCES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Errore caricamento preferenze:', error);
    return {};
  }
}

async function saveUserPreferences(preferences) {
  try {
    ensureDirectoryExists(path.dirname(PREFERENCES_FILE));
    await fs.writeFile(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));
    return true;
  } catch (error) {
    console.error('Errore salvataggio preferenze:', error);
    return false;
  }
}

async function updateUserPreferences(userId, items) {
  try {
    const preferences = await loadUserPreferences();
    
    // Inizializza utente se non esiste
    if (!preferences[userId]) {
      preferences[userId] = {};
    }
    
    // Processa ogni item
    items.forEach(item => {
      const quantity = item.quantity || 1;
      const ingredients = item.ingredients || [];
      
      // Incrementa contatore per ogni ingrediente
      ingredients.forEach(ingredient => {
        const cleanIngredient = ingredient.trim().toLowerCase(); // ✅ Normalizza in lowercase
        if (cleanIngredient) {
          preferences[userId][cleanIngredient] = 
            (preferences[userId][cleanIngredient] || 0) + quantity;
        }
      });
    });
    
    await saveUserPreferences(preferences);
    return true;
  } catch (error) {
    console.error('Errore aggiornamento preferenze:', error);
    return false;
  }
}

// PUBLIC endpoint per aggiornare preferenze (chiamato dal client)
app.post('/api/update-preferences', async (req, res) => {
  const { userId, items } = req.body;
  
  if (!userId || !items || !Array.isArray(items)) {
    return res.status(400).json({ 
      success: false, 
      message: 'userId e items richiesti' 
    });
  }
  
  try {
    const success = await updateUserPreferences(userId, items);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Errore nel salvataggio delle preferenze' 
      });
    }
  } catch (error) {
    console.error('Errore endpoint preferenze:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// === ROUTES AUTH ===
app.post('/api/auth/login', async (req, res) => {
  const { userCode, password } = req.body;

  if (!userCode || !password) {
    return res.status(400).json({
      success: false,
      message: 'ID utente e password richiesti'
    });
  }

  try {
    const user = await findUserByCode(userCode);
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
    console.error('Errore login:', error);
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
    const users = await loadAllUsers();
    
    if (users[userCode]) {
      return res.status(409).json({
        success: false,
        message: 'ID utente già esistente'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users[userCode] = {
      password: hashedPassword,
      status: 'free'
    };

    const saved = await saveAllUsers(users);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Errore nel salvataggio dell\'utente'
      });
    }

    const userDir = path.join(__dirname, 'IDs', userCode);
    ensureDirectoryExists(userDir);

    res.json({
      success: true,
      message: 'Registrazione completata con successo',
      user: { userCode, restaurantId: userCode, status: 'free' }
    });

  } catch (error) {
    console.error('Errore registrazione:', error);
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

  const users = await loadAllUsers();
  const userCode = req.session.user.userCode;
  const freshUser = users[userCode];

  if (!freshUser) {
    return res.json({ success: false, requireLogin: true });
  }

  // aggiorno la sessione con lo status attuale del file
  req.session.user.status = freshUser.status;
  req.session.user.planType = freshUser.planType;

  return res.json({ success: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Errore logout:', err);
      return res.status(500).json({
        success: false,
        message: 'Errore durante il logout'
      });
    }
    res.json({ success: true });
  });
});

// === STRIPE CHECKOUT ===
app.post('/api/create-checkout', requireAuth, async (req, res) => {
  const { priceId, planType } = req.body;
  const userCode = req.session.user.userCode;
  
  if (!priceId) {
    return res.status(400).json({ error: 'Price ID mancante' });
  }
  
  try {
    // Determina l'origin corretto
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
    console.error('Errore creazione checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// === VERIFICA PAGAMENTO (per success page) ===
app.get('/api/verify-payment/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const userCode = req.session.user.userCode;
  
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.metadata.userCode !== userCode) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    if (session.payment_status === 'paid') {
      // ✅ AGGIORNA ANCHE IL FILE users.json QUI
      const users = await loadAllUsers();
      
      if (users[userCode]) {
        const planType = session.metadata.planType || 'premium';
        const newStatus = planType === 'pro' ? 'pro' : 'paid';
        
        users[userCode].status = newStatus;
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = session.id;
        users[userCode].stripeCustomerId = session.customer;
        
        await saveAllUsers(users);
        
        // Aggiorna anche la sessione
        req.session.user.status = newStatus;
        req.session.user.planType = planType;
      }
      
      const user = await findUserByCode(userCode);
      
      res.json({
        success: true,
        paid: true,
        planType: session.metadata.planType,
        currentStatus: user?.status || 'free'
      });
    } else {
      res.json({
        success: true,
        paid: false,
        paymentStatus: session.payment_status
      });
    }
    
  } catch (error) {
    console.error('Errore verifica pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// === PROTECTED ROUTES (solo admin) ===
app.post('/upload-image', requireAuth, async (req, res) => {
  const { fileName, fileData, restaurantId } = req.body;
  
  if (req.session.user.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, message: 'Accesso non autorizzato' });
  }
  
  if (!fileName || !fileData || !restaurantId) {
    return res.status(400).json({ success: false, message: 'Dati mancanti' });
  }
  
  try {
    const imgDir = path.join(__dirname, 'IDs', restaurantId, 'img');
    ensureDirectoryExists(imgDir);
    
    const finalFilePath = path.join(imgDir, fileName);
    const base64Data = fileData.replace(/^data:image\/[a-z]+;base64,/, '');
    
    await fs.writeFile(finalFilePath, base64Data, 'base64');
    res.json({ success: true, fileName });
    
  } catch (error) {
    console.error('Errore upload immagine:', error);
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
    ensureDirectoryExists(restaurantDir);
    ensureDirectoryExists(backupDir);

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
    console.error('Errore salvataggio menu:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio del menu',
      details: error.message
    });
  }
});

// === PUBLIC ROUTES (ordini clienti - NO AUTH) ===
app.post('/IDs/:restaurantId/orders/:section', async (req, res) => {
  const { restaurantId, section } = req.params;
  const orderData = req.body;

  const restaurantDir = path.join(__dirname, 'IDs', restaurantId);
  if (!fsSync.existsSync(restaurantDir)) {
    return res.status(404).json({ error: 'Ristorante non trovato' });
  }

  const ordersDir = path.join(__dirname, 'IDs', restaurantId, 'orders', section);
  
  try {
    ensureDirectoryExists(ordersDir);
    
    const identifier = section === 'pickup' ? (orderData.orderNumber || 100) : (orderData.tableNumber || 'unknown');
    const { fileName, filePath } = generateUniqueFilename(ordersDir, section.charAt(0).toUpperCase() + section.slice(1), identifier);
    
    const completeOrderData = {
      ...orderData,
      timestamp: new Date().toISOString(),
      type: section,
      restaurantId,
      status: 'pending'
    };
    
    await fs.writeFile(filePath, JSON.stringify(completeOrderData, null, 2));
    await updateStats(restaurantId, completeOrderData);
    
    res.json({ success: true, fileName, [section === 'pickup' ? 'orderNumber' : 'tableNumber']: identifier });
    
  } catch (error) {
    console.error(`Errore salvataggio ordine ${section}:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// === PROTECTED ORDER MANAGEMENT (solo admin) ===
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
        console.error(`Errore lettura ${file}:`, fileError.message);
      }
    }
    
    orders.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    res.json(orders);
    
  } catch (error) {
    console.error('Errore lettura ordini:', error);
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
    console.error('Errore aggiornamento ordine:', error);
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
    
    ensureDirectoryExists(deletedDir);
    const timestamp = Date.now();
    const newFileName = `${orderId}_deleted_${timestamp}.json`;
    const deletedFilePath = path.join(deletedDir, newFileName);

    await fs.rename(orderFile, deletedFilePath);
    res.json({ success: true, orderId, deletedFile: newFileName });

  } catch (error) {
    console.error('Errore eliminazione ordine:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione dell\'ordine' });
  }
});

// === STATISTICS ROUTES (PROTETTO) ===
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
    console.error(err);
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
    
    let stats = {
      totale_ordini: 0,
      totale_incasso: 0,
      scontrino_medio: 0,
      numero_piatti_venduti: {},
      numero_categorie_venduti: {}
    };
    
    if (fsSync.existsSync(statsPath)) {
      stats = JSON.parse(await fs.readFile(statsPath, 'utf8'));
    }
    
    res.json({ month: monthYear, stats });
    
  } catch (error) {
    console.error('Errore lettura statistiche:', error);
    res.status(500).json({ error: 'Errore nel caricamento delle statistiche' });
  }
});

app.get('/IDs/:restaurantId/statistics', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const currentMonth = `${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
  
  res.redirect(`/IDs/${restaurantId}/statistics/${currentMonth}`);
});

// Health check endpoint per Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  res.status(500).json({
    success: false,
    message: 'Errore interno del server'
  });
});

// === STARTUP ===
initializeDirectories();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});


