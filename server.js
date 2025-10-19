require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');

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

// 1️⃣ Forza HTTPS
app.use((req, res, next) => {
  if (req.headers['cloudfront-forwarded-proto'] === 'https') {
    req.secure = true;
    req.connection.encrypted = true; 
  }
  next();
});

// 2️⃣ Configurazione sessione MIGLIORATA
const session = require('express-session');
const FileStore = require('session-file-store')(session);

// Assicurati che la cartella esista
function ensureDirectoryExists(dirPath) {
  if (!fsSync.existsSync(dirPath)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirectoryExists('./sessions');

app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 14 * 86400,
    retries: 0,
    reapInterval: 3600,
    fileExtension: '.json',
    encoding: 'utf8',
    logFn: function() {},
    fallbackSessionFn: function(req) {
      return {};
    }
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  },
  genid: function(req) {
    return require('crypto').randomBytes(16).toString('hex');
  }
}));

// Middleware per gestire errori sessione
app.use((req, res, next) => {
  if (!req.session) {
    return res.status(500).json({
      success: false,
      message: 'Errore sessione. Riprova.'
    });
  }
  next();
});

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
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      try {
        const userCode = session.metadata?.userCode;
        const planType = session.metadata?.planType || 'premium';
        
        if (!userCode) {
          return res.status(400).json({ error: 'UserCode mancante' });
        }
        
        const users = await loadAllUsers();
        
        if (!users[userCode]) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }
        
        let newStatus;
        if (planType === 'pro') {
          newStatus = 'pro';
        } else {
          newStatus = 'paid';
        }
        
        users[userCode].status = newStatus;
        users[userCode].planType = planType;
        users[userCode].paymentDate = new Date().toISOString();
        users[userCode].stripeSessionId = session.id;
        users[userCode].stripeCustomerId = session.customer;
        
        const saved = await saveAllUsers(users);
        
        if (saved) {
          return res.json({ received: true, userCode, status: newStatus });
        } else {
          return res.status(500).json({ error: 'Errore salvataggio' });
        }
        
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    
    res.json({ received: true });
  }
);

// DOPO il webhook, aggiungi express.json()
app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));

// Auth middleware MIGLIORATO
const requireAuth = (req, res, next) => {
  if (!req.session) {
    return res.status(500).json({
      success: false,
      message: 'Errore di sessione'
    });
  }
  
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
function initializeDirectories() {
  ensureDirectoryExists(path.join(__dirname, 'IDs'));
  ensureDirectoryExists(path.join(__dirname, 'userdata'));
}

// === GESTIONE UTENTI CENTRALIZZATA ===
const USERS_FILE = path.join(__dirname, 'userdata', 'users.json');

async function checkAndExpireTrials() {
  try {
    const users = await loadAllUsers();
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
      await saveAllUsers(users);
    }
    
  } catch (error) {
    // Errore gestito silenziosamente
  }
}

// CRON JOB - Esegue ogni giorno a mezzanotte
cron.schedule('0 0 * * *', () => {
  checkAndExpireTrials();
});

// Esegui anche all'avvio del server
setTimeout(() => {
  checkAndExpireTrials();
}, 5000);

// Pulizia sessioni scadute ogni 6 ore
cron.schedule('0 */6 * * *', () => {
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fsSync.existsSync(sessionsDir)) return;
  
  fs.readdir(sessionsDir)
    .then(files => {
      const now = Date.now();
      const maxAge = 14 * 24 * 60 * 60 * 1000;
      
      files.forEach(file => {
        const filePath = path.join(sessionsDir, file);
        const stats = fsSync.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath).catch(() => {});
        }
      });
    })
    .catch(() => {});
});

// Backup sessions ogni giorno alle 3 AM
cron.schedule('0 3 * * *', async () => {
  const sessionsDir = path.join(__dirname, 'sessions');
  const backupDir = path.join(__dirname, 'sessions-backup');
  
  try {
    ensureDirectoryExists(backupDir);
    
    const files = await fs.readdir(sessionsDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const source = path.join(sessionsDir, file);
        const dest = path.join(backupDir, file);
        await fs.copyFile(source, dest);
      }
    }
  } catch (error) {
    // Errore gestito silenziosamente
  }
});

async function loadAllUsers() {
  try {
    ensureDirectoryExists(path.dirname(USERS_FILE));
    
    if (!fsSync.existsSync(USERS_FILE)) {
      return {};
    }
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveAllUsers(users) {
  try {
    ensureDirectoryExists(path.dirname(USERS_FILE));
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
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
      
      if (!stats.suggerimenti) {
        stats.suggerimenti = {
          totale_items_suggeriti: 0,
          totale_valore_suggeriti: 0,
          items_suggeriti_venduti: {},
          categorie_suggerite_vendute: {}
        };
      }
    }
    
    stats.totale_ordini += 1;
    if (orderData.total && typeof orderData.total === 'number') {
      stats.totale_incasso = parseFloat((stats.totale_incasso + orderData.total).toFixed(2));
    }
    stats.scontrino_medio = stats.totale_ordini > 0 ? 
      Math.round((stats.totale_incasso / stats.totale_ordini) * 100) / 100 : 0;
    
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        const itemName = item.name;
        const quantity = item.quantity || 1;
        
        stats.numero_piatti_venduti[itemName] = (stats.numero_piatti_venduti[itemName] || 0) + quantity;
        
        if (item.category) {
          stats.numero_categorie_venduti[item.category] = (stats.numero_categorie_venduti[item.category] || 0) + quantity;
        }
        
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
    
    await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));
    
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
      
      const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      usersData[userId].lastOrderDate = dateStr;
      
      await fs.writeFile(usersPath, JSON.stringify(usersData, null, 2));
    }
    
  } catch (error) {
    // Errore gestito silenziosamente
  }
}

// === USER PREFERENCES MANAGEMENT ===
const PREFERENCES_FILE = path.join(__dirname, 'userdata', 'users-preferences.json');

async function loadUserPreferences() {
  try {
    ensureDirectoryExists(path.dirname(PREFERENCES_FILE));
    
    if (!fsSync.existsSync(PREFERENCES_FILE)) {
      await fs.writeFile(PREFERENCES_FILE, '{}');
      return {};
    }
    
    const data = await fs.readFile(PREFERENCES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveUserPreferences(preferences) {
  try {
    ensureDirectoryExists(path.dirname(PREFERENCES_FILE));
    await fs.writeFile(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

async function updateUserPreferences(userId, items) {
  try {
    const preferences = await loadUserPreferences();
    
    if (!preferences[userId]) {
      preferences[userId] = {};
    }
    
    items.forEach(item => {
      const quantity = item.quantity || 1;
      const ingredients = item.ingredients || [];
      
      ingredients.forEach(ingredient => {
        const cleanIngredient = ingredient.trim().toLowerCase();
        if (cleanIngredient) {
          preferences[userId][cleanIngredient] = 
            (preferences[userId][cleanIngredient] || 0) + quantity;
        }
      });
    });
    
    await saveUserPreferences(preferences);
    return true;
  } catch (error) {
    return false;
  }
}

// PUBLIC endpoint per aggiornare preferenze
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
      user: { 
        userCode, 
        restaurantId: userCode, 
        status: 'free',
        trialEndsAt: trialEnd.toISOString()
      }
    });

  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

// === VERIFICA PAGAMENTO ===
app.get('/api/verify-payment/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const userCode = req.session.user.userCode;
  
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.metadata.userCode !== userCode) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    if (session.payment_status === 'paid') {
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
    res.status(500).json({ error: error.message });
  }
});

// === PROTECTED ROUTES ===
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// === PROTECTED ORDER MANAGEMENT ===
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
        // Errore lettura file singolo, continua con gli altri
      }
    }
    
    orders.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    res.json(orders);
    
  } catch (error) {
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
    res.status(500).json({ error: 'Errore nell\'eliminazione dell\'ordine' });
  }
});

// === STATISTICS ROUTES ===
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
    res.status(500).json({ error: 'Errore nel caricamento delle statistiche' });
  }
});

app.get('/IDs/:restaurantId/statistics', requireAuth, async (req, res) => {
  const { restaurantId } = req.params;
  const currentMonth = `${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
  
  res.redirect(`/IDs/${restaurantId}/statistics/${currentMonth}`);
});

// === SETTINGS ROUTES ===
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
    ensureDirectoryExists(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio delle impostazioni',
      details: error.message
    });
  }
});

app.get('/IDs/:restaurantId/settings.json', async (req, res) => {
  const { restaurantId } = req.params;
  const settingsPath = path.join(__dirname, 'IDs', restaurantId, 'settings.json');

  try {
    if (fsSync.existsSync(settingsPath)) {
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      res.json(settings);
    } else {
      res.json({ copertoPrice: 0 });
    }
  } catch (error) {
    res.status(500).json({ error: 'Errore nel caricamento delle impostazioni' });
  }
});

// === ADMIN MONITORING ===
app.get('/api/admin/sessions-count', requireAuth, async (req, res) => {
  if (req.session.user.userCode !== process.env.ADMIN_USER_CODE) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  
  try {
    const sessionsDir = path.join(__dirname, 'sessions');
    const files = await fs.readdir(sessionsDir);
    const sessionFiles = files.filter(f => f.endsWith('.json'));
    
    res.json({
      totalSessions: sessionFiles.length,
      shouldMigrate: sessionFiles.length > 50
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint per AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware - DEVE ESSERE L'ULTIMO
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    success: false,
    message: 'Errore interno del server'
  });
});

// === STARTUP ===
initializeDirectories();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  }
});
