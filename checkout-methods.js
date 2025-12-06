// ============================================
// CONFIGURAZIONE E INIZIALIZZAZIONE
// ============================================

let SETTINGS = {};
let MENU_TYPES = {};
let PROMO_CODES = [];

const SHEET_CONFIG = {
  MAX_UP: -64,
  CLOSE_THRESHOLD: 5
};

const TITLES = {
  tavolo: 'Servizio al tavolo',
  delivery: 'Consegna a domicilio',
  takeaway: 'Take away',
  ordine: 'Il tuo ordine'
};

let HERE_API_CONFIG = null;
let configLoadPromise = null;
const geocodeCache = new Map();
let restaurantCoords = null;
let restaurantCoordsPromise = null;

// ============================================
// CARICAMENTO CONFIGURAZIONI CON TIMEOUT
// ============================================

function fetchWithTimeout(url, timeout = 5000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

async function initHereConfig() {
  if (HERE_API_CONFIG) return HERE_API_CONFIG;
  if (configLoadPromise) return configLoadPromise;

  const API_BASE = `${window.location.protocol}//${window.location.host}`;
  
  configLoadPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/here-config`, 3000);
      if (!res.ok) throw new Error('Failed to load HERE config');
      HERE_API_CONFIG = await res.json();
      return HERE_API_CONFIG;
    } catch (error) {
      console.warn('⚠️ HERE config non disponibile:', error.message);
      HERE_API_CONFIG = { API_KEY: '', APP_ID: '' };
      return HERE_API_CONFIG;
    }
  })();

  return configLoadPromise;
}

document.addEventListener('DOMContentLoaded', () => {
  // FASE 1: Inizializzazione immediata (UI cliccabile subito)
  initServiziImmediate();
  
  // FASE 2: Caricamento configurazioni in background (non bloccante)
  loadConfigurationsAsync();
});

function initServiziImmediate() {
  // Rendi TUTTI i servizi cliccabili immediatamente
  const servizi = ['tavolo', 'delivery', 'takeaway', 'ordine'];
  
  servizi.forEach(tipo => {
    const element = document.getElementById(`servizio-${tipo}`);
    if (element) {
      element.style.display = 'flex';
      element.addEventListener('click', () => openBottomSheet(tipo));
    }
  });
}

async function loadConfigurationsAsync() {
  try {
    const menuId = new URLSearchParams(window.location.search).get('id') || 'default';
    
    // Carica configurazioni con timeout
    const results = await Promise.allSettled([
      fetchWithTimeout(`IDs/${menuId}/settings.json`, 3000)
        .then(r => r.ok ? r.json() : null),
      fetchWithTimeout(`IDs/${menuId}/menuTypes.json`, 3000)
        .then(r => r.ok ? r.json() : null),
      fetchWithTimeout(`IDs/${menuId}/promo.json`, 3000)
        .then(r => r.ok ? r.json() : null)
    ]);
    
    SETTINGS = results[0].status === 'fulfilled' && results[0].value ? results[0].value : {};
    MENU_TYPES = results[1].status === 'fulfilled' && results[1].value ? results[1].value : { menuTypes: [] };
    PROMO_CODES = results[2].status === 'fulfilled' && results[2].value ? results[2].value : [];
    
    // Aggiorna visibilità box dopo aver caricato config
    updateServiziVisibility();
    
    // Inizializza HERE config in background (non bloccante)
    initHereConfig().catch(err => console.warn('HERE config error:', err));
    
  } catch (error) {
    console.warn('⚠️ Errore caricamento configurazioni:', error);
    // Fallback: usa valori di default
    SETTINGS = {};
    MENU_TYPES = { menuTypes: [] };
    PROMO_CODES = [];
  }
}

function updateServiziVisibility() {
  const currentMenuType = getCurrentMenuType();
  const checkoutMethods = currentMenuType?.checkoutMethods || {};
  
  const methodMap = {
    tavolo: 'table',
    delivery: 'delivery',
    takeaway: 'takeaway',
    ordine: 'show'
  };
  
  Object.entries(methodMap).forEach(([tipo, method]) => {
    const element = document.getElementById(`servizio-${tipo}`);
    if (!element) return;
    
    if (!checkoutMethods[method]) {
      element.style.display = 'none';
    }
  });
}

async function initRestaurantLocation() {
  if (restaurantCoordsPromise) return restaurantCoordsPromise;
  
  restaurantCoordsPromise = (async () => {
    if (!SETTINGS.restaurant || !SETTINGS.delivery) return null;
    if (SETTINGS.delivery.costType !== 'distance') return null;
    
    const address = `${SETTINGS.restaurant.street} ${SETTINGS.restaurant.number}, ${SETTINGS.restaurant.cap}, Italia`;
    restaurantCoords = await getCoordinates(address);
    
    if (!restaurantCoords) {
      console.warn('⚠️ Impossibile geocodificare indirizzo ristorante');
    }
    
    return restaurantCoords;
  })();
  
  return restaurantCoordsPromise;
}

function getCurrentMenuType() {
  if (!MENU_TYPES.menuTypes?.length) return null;
  
  const requestedType = new URLSearchParams(window.location.search).get('type') || 'default';
  return MENU_TYPES.menuTypes.find(mt => mt.id === requestedType) || MENU_TYPES.menuTypes[0];
}

// ============================================
// GESTIONE BOTTOM SHEET
// ============================================

function openBottomSheet(tipo) {
  closeBottomSheet();
  document.body.classList.add("sheet-open");

  const overlay = document.createElement('div');
  overlay.className = 'bottom-sheet-overlay';
  
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.id = 'active-bottom-sheet';
  sheet.innerHTML = getSheetHTML(tipo);

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  const preventRefresh = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', preventRefresh);
  sheet._preventRefresh = preventRefresh;

  requestAnimationFrame(() => {
    overlay.classList.add('active');
    sheet.classList.add('active');
    attachSheetListeners(tipo, sheet, overlay);
  });
}

function getSheetHTML(tipo) {
  const footer = tipo === 'ordine' ? '' : `
    <div class="bottom-sheet-footer">
      <button class="btn-secondary" onclick="closeBottomSheet()">Annulla</button>
      <button class="btn-primary" id="confirm-servizio">Conferma</button>
    </div>`;

  return `
    <div class="bottom-sheet-handle"></div>
    <div class="bottom-sheet-header"><h3>${TITLES[tipo]}</h3></div>
    <div class="bottom-sheet-content" id="sheet-content">${getFormFields(tipo)}</div>
    ${footer}`;
}

function closeBottomSheet() {
  document.body.classList.remove("sheet-open");

  const sheet = document.getElementById('active-bottom-sheet');
  const overlay = document.querySelector('.bottom-sheet-overlay');
  
  if (sheet?._preventRefresh) {
    window.removeEventListener('beforeunload', sheet._preventRefresh);
  }

  if (!overlay || !sheet) return;

  const isDesktop = window.innerWidth >= 768;
  sheet.style.transform = isDesktop ? 'translateX(-50%) translateY(120%)' : 'translateY(100%)';
  overlay.classList.remove('active');
  
  setTimeout(() => {
    overlay.remove();
    sheet.remove();
  }, 300);
}

// ============================================
// GESTIONE FORM E CAMPI
// ============================================

function getFormFields(tipo) {
  const draft = loadDraft(tipo);
  const common = getCommonData();
  const data = { ...common, ...draft };

  switch (tipo) {
    case 'tavolo':
      return `<div class="form-group">
        <label for="numero-tavolo">Numero del tavolo</label>
        <input type="number" id="numero-tavolo" placeholder="Es. 002" min="1" value="${data.numeroTavolo || ''}" />
      </div>`;

    case 'delivery':
      return `
        <div class="form-group">
          <label for="nome-delivery">Nome e cognome</label>
          <input type="text" id="nome-delivery" placeholder="Es. Mario Rossi" value="${data.nome || ''}" />
        </div>
        <div class="form-group">
          <label for="telefono-delivery">Numero di telefono</label>
          <input type="tel" id="telefono-delivery" placeholder="Es. 351 054 8462" maxlength="16" value="${data.telefono || ''}" />
        </div>
        <div class="form-group">
          <label for="indirizzo-delivery">Indirizzo, civico e città</label>
          <input type="text" id="indirizzo-delivery" placeholder="Es. Via del Corso 15, Napoli" value="${data.indirizzo || ''}" />
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="orario-delivery">Orario</label>
            <input type="text" id="orario-delivery" inputmode="numeric" placeholder="Es. 21:30" maxlength="5" value="" />
          </div>
          <div class="form-group">
            <label for="promo-delivery">Promo</label>
            <input type="text" id="promo-delivery" placeholder="Hai un codice?" value="${data.promo || ''}" />
          </div>
        </div>
        <div class="payment-section">
          <h4 class="payment-title">Metodi di pagamento</h4>
          <div class="payment-grid" id="payment-grid"></div>
        </div>
        <div class="price-breakdown hidden" id="price-breakdown">
          <div class="price-line">
            <span>Ordine</span>
            <span id="price-order">€0.00</span>
          </div>
          <div class="price-line" id="price-delivery-line">
            <span>Spedizione</span>
            <span id="price-delivery">-</span>
          </div>
          <div class="price-line" id="price-discount-line">
            <span>Sconto</span>
            <span id="price-discount">-</span>
          </div>
          <hr class="price-divider" />
          <div class="price-line price-total">
            <span>Totale</span>
            <span id="price-total">€0.00</span>
          </div>
        </div>`;

    case 'takeaway':
      return `
        <div class="form-group">
          <label for="nome-takeaway">Nome e cognome</label>
          <input type="text" id="nome-takeaway" placeholder="Es. Mario Rossi" value="${data.nome || ''}" />
        </div>
        <div class="form-group">
          <label for="telefono-takeaway">Numero di telefono</label>
          <input type="tel" id="telefono-takeaway" placeholder="Es. 351 054 8462" maxlength="16" value="${data.telefono || ''}" />
        </div>
        <div class="form-group">
          <label for="orario-takeaway">Orario</label>
          <input type="text" id="orario-takeaway" inputmode="numeric" placeholder="Es. 21:30" maxlength="5" value="" />
        </div>`;

    case 'ordine':
      return renderOrderList();

    default:
      return '<p>Servizio non disponibile</p>';
  }
}

// ============================================
// GESTIONE DRAFT E STORAGE
// ============================================

function loadDraft(tipo) {
  try {
    return JSON.parse(localStorage.getItem(`totemino_draft_${tipo}`) || '{}');
  } catch {
    return {};
  }
}

function saveDraft(tipo, data) {
  try {
    localStorage.setItem(`totemino_draft_${tipo}`, JSON.stringify(data));
  } catch (error) {
    console.error('⚠️ Errore salvataggio draft:', error);
  }
}

function getCommonData() {
  for (const tipo of ['delivery', 'takeaway']) {
    const draft = loadDraft(tipo);
    if (draft.nome || draft.telefono) {
      return { nome: draft.nome || '', telefono: draft.telefono || '' };
    }
  }
  return { nome: '', telefono: '' };
}

function syncCommonField(field, value) {
  ['delivery', 'takeaway'].forEach(tipo => {
    const draft = loadDraft(tipo);
    draft[field] = value;
    saveDraft(tipo, draft);
  });
}

// ============================================
// LISTENER E VALIDAZIONE
// ============================================

function attachSheetListeners(tipo, sheet, overlay) {
  if (tipo !== 'ordine') {
    document.getElementById('confirm-servizio')?.addEventListener('click', () => validateAndConfirm(tipo));

    const phoneId = `telefono-${tipo}`;
    document.getElementById(phoneId)?.addEventListener('input', formatPhoneNumber);
    
    if (tipo === 'delivery' || tipo === 'takeaway') {
      document.getElementById(`nome-${tipo}`)?.addEventListener('input', (e) => 
        syncCommonField('nome', e.target.value));
      document.getElementById(`telefono-${tipo}`)?.addEventListener('input', (e) => 
        syncCommonField('telefono', e.target.value));
    }
    
    document.getElementById(`orario-${tipo}`)?.addEventListener('input', formatTimeInput);
    
    if (tipo === 'delivery') {
      renderPaymentMethods();
      
      let pricingTimeout = null;
      
      ['indirizzo-delivery', 'promo-delivery'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
          const draft = loadDraft('delivery');
          draft[id.replace('-delivery', '')] = document.getElementById(id).value;
          saveDraft('delivery', draft);
          
          clearTimeout(pricingTimeout);
          pricingTimeout = setTimeout(() => {
            calculatePricing();
          }, 500);
        });
      });
      
      calculatePricing();
    }
  }
  
  attachSwipeListeners(sheet, overlay);
}

function formatPhoneNumber(e) {
  const input = e.target;
  const digits = input.value.replace(/\D/g, '');
  const cursorPos = input.selectionStart;
  const digitsBefore = input.value.slice(0, cursorPos).replace(/\D/g, '').length;

  let formatted;
  if (digits.length <= 10) {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(p => p);
    formatted = parts.join(' ');
  } else {
    const leadLen = digits.length - 10;
    const parts = [
      digits.slice(0, leadLen),
      digits.slice(leadLen, leadLen + 3),
      digits.slice(leadLen + 3, leadLen + 6),
      digits.slice(leadLen + 6)
    ].filter(p => p);
    formatted = parts.join(' ');
  }

  input.value = formatted;

  let newPos = 0;
  let count = 0;
  for (let i = 0; i < formatted.length && count < digitsBefore; i++) {
    if (formatted[i] !== ' ') count++;
    newPos = i + 1;
  }
  
  while (newPos < formatted.length && formatted[newPos] === ' ') newPos++;
  input.setSelectionRange(newPos, newPos);
}

function formatTimeInput(e) {
  let v = e.target.value;

  v = v.replace(/\D/g, "");
  v = v.slice(0, 4);
  if (v.length >= 3) {
    v = v.slice(0, 2) + ":" + v.slice(2);
  }

  const [hh, mm] = v.split(":");

  if (hh && hh.length === 2 && Number(hh) > 23) {
    v = "23" + (mm !== undefined ? ":" + mm : "");
  }
  if (mm && Number(mm) > 59) {
    v = hh + ":59";
  }

  e.target.value = v;
}

async function createOrder(tipo) {
  const selectedItems = JSON.parse(localStorage.getItem('totemino_selected') || '[]');
  const orderNotes = JSON.parse(localStorage.getItem('totemino_notes') || '[]');
  const userId = localStorage.getItem('totemino_userId') || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  if (!localStorage.getItem('totemino_userId')) {
    localStorage.setItem('totemino_userId', userId);
  }
  
  const items = [];
  const notes = [];
  
  for (let i = 0, noteIndex = 0; i < selectedItems.length; i += 3, noteIndex++) {
    const itemName = selectedItems[i];
    const customizations = JSON.parse(selectedItems[i + 1] || '{}');
    const quantity = parseInt(selectedItems[i + 2]) || 1;
    
    const stateItem = STATE?.items?.find(si => si.name === itemName);
    const isSuggested = stateItem?.isSuggested || false;
    const isCoperto = stateItem?.isCoperto || false;
    
    // ✅ Salta il coperto dagli items
    if (!isCoperto) {
      items.push({
        name: itemName,
        price: stateItem?.price || 0,
        quantity: quantity,
        isSuggested: isSuggested,
        customizations: customizations
      });
      
      // ✅ Aggiungi la nota corrispondente
      notes.push(orderNotes[noteIndex] || "");
    }
  }
  
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const orderData = {
    userId: userId,
    items: items,
    orderNotes: notes,
    total: total,
    timestamp: new Date().toISOString(),
    restaurantId: new URLSearchParams(window.location.search).get('id') || 'default',
    orderStatus: 'pending'
  };
  
  if (tipo === 'tavolo') {
    const numeroTavolo = document.getElementById('numero-tavolo').value;
    orderData.table = [{
      tableNumber: numeroTavolo
    }];
  } else if (tipo === 'delivery') {
    const nome = document.getElementById('nome-delivery').value.trim();
    const telefono = document.getElementById('telefono-delivery').value.replace(/\s/g, '');
    const indirizzo = document.getElementById('indirizzo-delivery').value.trim();
    const orario = document.getElementById('orario-delivery').value;
    const promo = document.getElementById('promo-delivery')?.value.trim().toUpperCase() || '';
    
    const selectedPayment = document.querySelector('.payment-card.selected');
    const paymentMethod = selectedPayment ? 
      (selectedPayment.dataset.method === 'cash' ? 'In contanti' :
       selectedPayment.dataset.method === 'card' ? 'POS' : 'Carta in-App') : 'Non specificato';
    
    const shippingText = document.getElementById('price-delivery')?.textContent || '€0.00';
    const discountText = document.getElementById('price-discount')?.textContent || '-';
    
    const shipping = shippingText.includes('€') ? parseFloat(shippingText.replace('€', '')) : 0;
    const discount = discountText.includes('€') ? parseFloat(discountText.replace('-€', '')) : 0;
    
    orderData.delivery = [{
      customer: nome,
      phone: telefono,
      address: indirizzo,
      time: orario,
      shipping: shipping,
      discount: discount > 0 ? -discount : 0,
      paymentMethod: paymentMethod
    }];
  } else if (tipo === 'takeaway') {
    const nome = document.getElementById('nome-takeaway').value.trim();
    const telefono = document.getElementById('telefono-takeaway').value.replace(/\s/g, '');
    const orario = document.getElementById('orario-takeaway').value;
    
    orderData.takeaway = [{
      customer: nome,
      phone: telefono,
      time: orario
    }];
  }
  
  return orderData;
}

async function validateAndConfirm(tipo) {
  document.querySelectorAll('.form-group input').forEach(input => input.classList.remove('error'));

  const validators = {
    tavolo: () => {
      const num = document.getElementById('numero-tavolo');
      if (!num.value || num.value < 1) {
        showError(num);
        num.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      return true;
    },
    
    delivery: () => {
      const fields = {
        nome: document.getElementById('nome-delivery'),
        telefono: document.getElementById('telefono-delivery'),
        indirizzo: document.getElementById('indirizzo-delivery'),
        orario: document.getElementById('orario-delivery')
      };
      
      let valid = true;
      let firstError = null;
      
      if (!fields.nome.value.trim()) { 
        showError(fields.nome); 
        if (!firstError) firstError = fields.nome;
        valid = false; 
      }
      
      const phoneDigits = fields.telefono.value.replace(/\s/g, '');
      if (!phoneDigits || phoneDigits.length < 9) {
        showError(fields.telefono);
        if (!firstError) firstError = fields.telefono;
        valid = false;
      }
      
      if (!fields.indirizzo.value.trim()) { 
        showError(fields.indirizzo);
        if (!firstError) firstError = fields.indirizzo;
        valid = false; 
      }
      
      const deliveryErrorText = document.getElementById('price-delivery')?.textContent;
      if (deliveryErrorText && (deliveryErrorText.includes('Fuori zona') || 
          deliveryErrorText.includes('non valido') || 
          deliveryErrorText.includes('non trovato'))) {
        showError(fields.indirizzo);
        if (!firstError) firstError = fields.indirizzo;
        valid = false;
      }
      
      if (!fields.orario.value || fields.orario.value.length !== 5) {
        showError(fields.orario);
        if (!firstError) firstError = fields.orario;
        valid = false;
      }
      
      const selectedPayment = document.querySelector('.payment-card.selected');
      if (!selectedPayment) {
        const paymentCards = document.querySelectorAll('.payment-card');
        paymentCards.forEach(card => {
          card.style.border = '2px solid #ff4444';
          card.style.animation = 'shake 0.3s ease';
        });
        setTimeout(() => {
          paymentCards.forEach(card => {
            card.style.border = '';
            card.style.animation = '';
          });
        }, 2000);
        if (!firstError) firstError = paymentCards[0];
        valid = false;
      }
      
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      return valid;
    },
    
    takeaway: () => {
      const fields = {
        nome: document.getElementById('nome-takeaway'),
        telefono: document.getElementById('telefono-takeaway'),
        orario: document.getElementById('orario-takeaway')
      };
      
      let valid = true;
      let firstError = null;
      
      if (!fields.nome.value.trim()) { 
        showError(fields.nome);
        if (!firstError) firstError = fields.nome;
        valid = false; 
      }
      
      const phoneDigits = fields.telefono.value.replace(/\s/g, '');
      if (!phoneDigits || phoneDigits.length < 9) {
        showError(fields.telefono);
        if (!firstError) firstError = fields.telefono;
        valid = false;
      }
      
      if (!fields.orario.value || fields.orario.value.length !== 5) {
        showError(fields.orario);
        if (!firstError) firstError = fields.orario;
        valid = false;
      }
      
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      return valid;
    }
  };

  if (validators[tipo]?.()) {
    try {
      const orderData = await createOrder(tipo);
      
      const sectionMap = {
        tavolo: 'table',
        delivery: 'delivery',
        takeaway: 'takeaway'
      };
      
      const section = sectionMap[tipo];
      const restaurantId = orderData.restaurantId;
      
      const API_BASE = `${window.location.protocol}//${window.location.host}`;
      const response = await fetch(`${API_BASE}/IDs/${restaurantId}/orders/${section}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      
      if (!response.ok) {
        throw new Error('Errore invio ordine');
      }
      
      const result = await response.json();
      
      localStorage.removeItem(`totemino_draft_${tipo}`);
      localStorage.removeItem('totemino_selected');
      localStorage.removeItem('totemino_notes');
      localStorage.removeItem('totemino_total');
      localStorage.removeItem('totemino_count');
      localStorage.removeItem('totemino_suggested_items');
      localStorage.removeItem('totemino_suggestion_stats');
      localStorage.removeItem('totemino_show_riepilogo');
      
      ['tavolo', 'delivery', 'takeaway'].forEach(metodo => {
        localStorage.removeItem(`totemino_draft_${metodo}`);
      });
      
      closeBottomSheet();
      
      window.location.href = 'success.html?id=' + restaurantId;
      
    } catch (error) {
      console.error('⚠️ Errore creazione ordine:', error);
      alert('Errore nell\'invio dell\'ordine. Riprova.');
    }
  }
}

function showError(element) {
  element.classList.add('error');
  setTimeout(() => element.classList.remove('error'), 2000);
}

// ============================================
// CALCOLO PREZZI E SPEDIZIONE
// ============================================

function renderPaymentMethods() {
  const grid = document.getElementById('payment-grid');
  if (!grid || !SETTINGS.payments) return;
  
  const methods = [];
  if (SETTINGS.payments.cash) methods.push({ id: 'cash', label: 'Contanti alla consegna', icon: '💵' });
  if (SETTINGS.payments.card) methods.push({ id: 'card', label: 'POS alla consegna', icon: '🧾' });
  if (SETTINGS.payments.stripe) methods.push({ id: 'stripe', label: 'Carta di credito in-App', icon: '💳' });
  
  if (methods.length === 0) {
    grid.innerHTML = '<p style="color: #666;">Nessun metodo di pagamento disponibile</p>';
    return;
  }
  
  grid.innerHTML = methods.map(method => `
    <div class="payment-card" data-method="${method.id}">
      <div class="payment-icon">${method.icon}</div>
      <div class="payment-label">${method.label}</div>
    </div>
  `).join('');
  
  document.querySelectorAll('.payment-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

async function calculatePricing() {
  const breakdown = document.getElementById('price-breakdown');
  if (!breakdown) return;
  
  const orderTotal = getOrderTotal();
  const promoCode = document.getElementById('promo-delivery')?.value.trim().toUpperCase() || '';
  const indirizzo = document.getElementById('indirizzo-delivery')?.value.trim() || '';
  
  document.getElementById('price-order').textContent = `€${orderTotal.toFixed(2)}`;
  
  let deliveryCost = 0;
  let deliveryError = null;
  let hasValidAddress = false;
  
  if (indirizzo && SETTINGS.delivery) {
    hasValidAddress = true;
    
    if (SETTINGS.delivery.costType === 'fixed') {
      deliveryCost = SETTINGS.delivery.costFixed || 0;
    } else {
      // Lazy init geocoding
      await initRestaurantLocation();
      
      const coords = geocodeCache.get(indirizzo) || await getCoordinates(indirizzo);
      
      if (coords && restaurantCoords) {
        const distance = calculateDistance(
          restaurantCoords.lat, restaurantCoords.lon,
          coords.lat, coords.lon
        );
        
        const maxDistance = SETTINGS.delivery.radius || 20;
        if (distance > maxDistance) {
          deliveryError = `Fuori zona (max ${maxDistance}km)`;
        } else if (distance > 200) {
          deliveryError = 'Indirizzo non valido';
        } else {
          deliveryCost = distance * (SETTINGS.delivery.costPerKm || 0) * 1.5;
          
          if (SETTINGS.delivery.freeDeliveryThreshold && orderTotal >= SETTINGS.delivery.freeDeliveryThreshold) {
            deliveryCost = 0;
          }
        }
      } else {
        deliveryError = 'Indirizzo non trovato';
      }
    }
  }
  
  let discount = 0;
  let discountError = null;
  let hasValidPromo = false;
  
  if (promoCode && PROMO_CODES.length > 0) {
    const promo = PROMO_CODES.find(p => p.code === promoCode);
    
    if (!promo) {
      discountError = 'Codice non valido';
    } else if (promo.conditionType === 'minimum' && orderTotal < promo.minimumSpend) {
      discountError = `Spesa minima €${promo.minimumSpend.toFixed(2)}`;
    } else {
      hasValidPromo = true;
      discount = promo.discountType === 'percentage' 
        ? (orderTotal * promo.discountValue) / 100 
        : promo.discountValue;
    }
  }
  
  if (hasValidAddress) {
    document.getElementById('price-delivery').innerHTML = deliveryError 
      ? `<span class="price-error">${deliveryError}</span>` 
      : `€${deliveryCost.toFixed(2)}`;
    document.getElementById('price-delivery-line').style.display = 'flex';
  } else {
    document.getElementById('price-delivery').textContent = '-';
    document.getElementById('price-delivery-line').style.display = 'flex';
  }
  
  if (promoCode) {
    document.getElementById('price-discount').innerHTML = discountError
      ? `<span class="price-error">${discountError}</span>`
      : hasValidPromo ? `-€${discount.toFixed(2)}` : '-';
    document.getElementById('price-discount-line').style.display = 'flex';
  } else {
    document.getElementById('price-discount').textContent = '-';
    document.getElementById('price-discount-line').style.display = 'flex';
  }
  
  let displayTotal = orderTotal;
  if (hasValidAddress && !deliveryError) {
    displayTotal += deliveryCost;
  }
  if (hasValidPromo) {
    displayTotal -= discount;
  }
  displayTotal = Math.max(0, displayTotal);
  
  document.getElementById('price-total').textContent = `€${displayTotal.toFixed(2)}`;
  breakdown.classList.remove('hidden');
}

async function getCoordinates(address) {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address);
  }
  
  if (address.length < 5) {
    return null;
  }
  
  try {
    await initHereConfig();
    
    if (!HERE_API_CONFIG?.API_KEY) {
      console.warn('⚠️ HERE API KEY non disponibile');
      return null;
    }
    
    const response = await fetchWithTimeout(
      `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${HERE_API_CONFIG.API_KEY}&lang=it`,
      5000
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && Array.isArray(data.items) && data.items[0]) {
      const position = data.items[0].position;
      const result = { lat: position.lat, lon: position.lng };
      geocodeCache.set(address, result);
      return result;
    }
    return null;
  } catch (error) {
    console.warn('⚠️ Errore geocodifica:', error.message);
    return null;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function getOrderTotal() {
  try {
    const selectedItems = JSON.parse(localStorage.getItem('totemino_selected') || '[]');
    let total = 0;
    
    for (let i = 0; i < selectedItems.length; i += 3) {
      const itemName = selectedItems[i];
      const quantity = parseInt(selectedItems[i + 2]) || 1;
      
      const item = STATE?.items?.find(si => si.name === itemName);
      if (item?.price) {
        total += item.price * quantity;
      }
    }
    
    return total;
  } catch {
    return 0;
  }
}

// ============================================
// VISUALIZZAZIONE ORDINE
// ============================================

function renderOrderList() {
  try {
    const selectedItems = JSON.parse(localStorage.getItem('totemino_selected') || '[]');

    if (selectedItems.length === 0) {
      return '<p class="empty-order">Il carrello è vuoto</p>';
    }

    const items = [];
    for (let i = 0; i < selectedItems.length; i += 3) {
      const itemName = selectedItems[i];
      const customizations = JSON.parse(selectedItems[i + 1] || '{}');
      const quantity = parseInt(selectedItems[i + 2]) || 1;
      
      const stateItem = STATE?.items?.find(si => si.name === itemName);
      
      items.push({
        name: itemName,
        customizations,
        quantity,
        img: stateItem?.img || 'img/placeholder.png'
      });
    }

    return items.map(item => {
      const customs = Object.entries(item.customizations)
        .filter(([_, qty]) => qty > 0)
        .map(([key, qty]) => qty > 1 ? `${key} x${qty}` : key);
      
      const customLabel = customs.length ? ` (${customs.join(', ')})` : '';
      const displayName = item.quantity > 1 
        ? `${item.name}${customLabel} (x${item.quantity})` 
        : `${item.name}${customLabel}`;
        
      return `<div class="order-item">
        <img src="${item.img}" alt="${item.name}" class="order-item-img" onerror="this.src='img/placeholder.png'" />
        <div class="order-item-info"><h4>${displayName}</h4></div>
      </div>`;
    }).join('');
  } catch {
    return '<p class="empty-order">Errore nel caricamento dell\'ordine</p>';
  }
}

// ============================================
// GESTIONE SWIPE E INTERAZIONI
// ============================================

function attachSwipeListeners(sheet, overlay) {
  const h = sheet.querySelector('.bottom-sheet-handle');
  const hd = sheet.querySelector('.bottom-sheet-header');
  const c = sheet.querySelector('.bottom-sheet-content');

  let startY = 0, curY = 0, drag = false, fromContent = false, down = false;
  const desk = innerWidth >= 768;
  const top = () => c.scrollTop <= 0;
  const bottom = () => c.scrollHeight - c.scrollTop - c.clientHeight <= 0;

  const lock = () => { c.style.overflow = "hidden"; c.style.touchAction = "none"; };
  const unlock = () => { c.style.overflow = ""; c.style.touchAction = ""; };

  const onStart = e => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    startY = y;
    drag = h.contains(e.target) || hd.contains(e.target);
    fromContent = !drag && c.contains(e.target);
    if (drag) { sheet.style.transition = "none"; lock(); e.preventDefault(); }
  };

  const onMove = e => {
    if (!startY) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    curY = y; 
    const dy = curY - startY; 
    down = dy > 0;

    if (drag) {
      e.preventDefault();
      let d = dy < SHEET_CONFIG.MAX_UP ? SHEET_CONFIG.MAX_UP : dy;
      sheet.style.transform = desk ? `translateX(-50%) translateY(${d}px)` : `translateY(${d}px)`;
      overlay.style.opacity = d > 0 ? Math.max(0, 1 - d/300) : 1;
      return;
    }

    if (fromContent && ((down && top()) || (!down && bottom()))) {
      drag = true; 
      fromContent = false; 
      lock(); 
      sheet.style.transition = "none"; 
      e.preventDefault();
    }
  };

  const onEnd = () => {
    if (!drag) { 
      startY = 0; 
      unlock(); 
      return; 
    }
    const dy = curY - startY;
    const th = sheet.offsetHeight * (SHEET_CONFIG.CLOSE_THRESHOLD / 100);
    sheet.style.transition = "";
    if (dy > th) {
      closeBottomSheet();
    } else {
      sheet.style.transform = desk ? "translateX(-50%) translateY(0)" : "translateY(0)";
    }
    overlay.style.opacity = ""; 
    drag = false; 
    startY = 0; 
    unlock();
  };

  const opt = { passive: false };
  
  h.addEventListener("touchstart", onStart, opt);
  hd.addEventListener("touchstart", onStart, opt);
  c.addEventListener("touchstart", onStart, opt);
  h.addEventListener("mousedown", onStart);
  hd.addEventListener("mousedown", onStart);
  c.addEventListener("mousedown", onStart);
  
  addEventListener("touchmove", onMove, opt);
  addEventListener("touchend", onEnd);
  addEventListener("mousemove", onMove);
  addEventListener("mouseup", onEnd);

  overlay.addEventListener("click", closeBottomSheet);
}

