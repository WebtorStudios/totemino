// ============================================
// ORDERS MANAGER - Sistema Unificato con Service Worker
// ============================================

const CONFIG = {
  restaurantId: new URLSearchParams(window.location.search).get('id') || '0000',
  apiBase: '/IDs',
  refreshInterval: 30000, // Fallback se push non supportato
  swEnabled: false
};

// Configurazione sezioni - facilmente estendibile
const SECTIONS = {
  table: {
    label: 'Ordini Tavolo',
    apiPath: 'table',
    icon: '🍽️',
    getIdentifier: (order) => order.table?.[0]?.tableNumber || 'N/A'
  },
  takeaway: {
    label: 'Ritiro al Banco',
    apiPath: 'takeaway',
    icon: '🥡',
    getIdentifier: (order) => order.takeaway?.[0]?.time || 'N/A'
  },
  delivery: {
    label: 'Consegne a Domicilio',
    apiPath: 'delivery',
    icon: '🚗',
    getIdentifier: (order) => order.delivery?.[0]?.time || 'N/A'
  }
};

// State globale
const state = {
  currentSection: 'table',
  orders: [],
  viewingCompleted: false,
  expandedGroups: new Set(),
  currentDetailOrder: null,
  rotation: 0,
  isRotating: false,
  autoRefreshInterval: null
};

// DOM Elements
const dom = {
  nav: document.getElementById('table-nav'),
  refreshBtn: document.getElementById('table-refresh-btn'),
  popup: document.querySelector('.gpopup'),
  deletePopup: document.querySelector('.delete-popup-overlay'),
  sections: {}
};

// ============================================
// INIZIALIZZAZIONE
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkAccess()) return;
  
  document.getElementById('back-btn').onclick = () => location.href = `profile.html`;
  
  initSections();
  initEvents();
  switchSection('table');
  
  // Inizializza Service Worker e Push
  await initServiceWorker();
  
  // Caricamento iniziale
  loadOrders();
  
  // Fallback: auto-refresh se push non supportato
  if (!CONFIG.swEnabled) {
    console.log('⚠️ Push non supportato, uso polling');
    state.autoRefreshInterval = setInterval(loadOrders, CONFIG.refreshInterval);
  }
});

// ============================================
// SERVICE WORKER & PUSH NOTIFICATIONS
// ============================================

async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('❌ Service Worker non supportato');
    return false;
  }
  
  try {
    // Registra Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registrato');
    
    // Ascolta messaggi dal SW
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    
    // Controlla supporto push
    if (!('PushManager' in window)) {
      console.log('❌ Push notifications non supportate');
      return false;
    }
    
    // Richiedi permesso notifiche
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('⚠️ Permesso notifiche negato');
      return false;
    }
    
    // Subscribe a push notifications
    await subscribeToPush(registration);
    
    CONFIG.swEnabled = true;
    console.log('✅ Push notifications attive');
    
    return true;
    
  } catch (error) {
    console.error('❌ Errore Service Worker:', error);
    return false;
  }
}

async function subscribeToPush(registration) {
  try {
    // Ottieni VAPID public key dal server
    const response = await fetch('/api/push/vapid-public-key');
    const { publicKey } = await response.json();
    
    // Converti chiave in Uint8Array
    const vapidKey = urlBase64ToUint8Array(publicKey);
    
    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey
    });
    
    // Invia subscription al server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subscription })
    });
    
    console.log('✅ Subscription salvata');
    
  } catch (error) {
    console.error('❌ Errore subscription:', error);
    throw error;
  }
}

function handleSWMessage(event) {
  console.log('📨 Messaggio da SW:', event.data);
  
  const { type } = event.data;
  
  if (type === 'NEW_ORDER') {
    console.log('🔔 Nuovo ordine ricevuto');
    loadOrders();
    showNotificationBadge();
  }
  
  if (type === 'RELOAD_ORDERS') {
    console.log('🔄 Ricarico ordini da notifica');
    loadOrders();
  }
}

function showNotificationBadge() {
  // Mostra badge temporaneo sul refresh button
  const badge = document.createElement('div');
  badge.className = 'notification-badge';
  badge.textContent = '!';
  dom.refreshBtn.appendChild(badge);
  
  setTimeout(() => badge.remove(), 3000);
}

// Utility per convertire VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

// ============================================
// RESTO DEL CODICE
// ============================================

function initSections() {
  const navHTML = Object.entries(SECTIONS)
    .map(([key, config]) => 
      `<button class="${key === 'table' ? 'active' : ''}" id="${key}-tab">${config.label}</button>`
    ).join('');
  
  dom.nav.innerHTML = '<div class="pill"></div>' + navHTML;
  
  Object.keys(SECTIONS).forEach(key => {
    dom.sections[key] = {
      active: document.querySelector(`.${key}-section:not(.completed)`),
      completed: document.querySelector(`.${key}-section.completed`)
    };
  });
}

function initEvents() {
  Object.keys(SECTIONS).forEach(key => {
    document.getElementById(`${key}-tab`)?.addEventListener('click', () => switchSection(key));
  });
  
  dom.refreshBtn?.addEventListener('click', loadOrders);
  
  document.querySelector('.gpopup-close-btn')?.addEventListener('click', hidePopup);
  dom.popup?.addEventListener('click', (e) => e.target === dom.popup && hidePopup());
  document.querySelector('.toggle-status')?.addEventListener('click', toggleStatus);
  
  document.getElementById('open-delete-popup')?.addEventListener('click', showDeletePopup);
  document.getElementById('delete-btn')?.addEventListener('click', deleteOrder);
  document.getElementById('cancel-delete')?.addEventListener('click', hideDeletePopup);
  dom.deletePopup?.addEventListener('click', (e) => e.target === dom.deletePopup && hideDeletePopup());
  
  document.getElementById('fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('stats')?.addEventListener('click', () => 
    window.location.href = `statistics.html?id=${CONFIG.restaurantId}`);
  document.getElementById('gestione-menu-btn')?.addEventListener('click', () => 
    window.location.href = `gestione-menu.html?id=${CONFIG.restaurantId}`);
  
  window.addEventListener('resize', animatePill);
  window.addEventListener('scroll', () => {
    requestAnimationFrame(animatePill);
  });
  
  dom.nav.addEventListener('scroll', () => {
    requestAnimationFrame(animatePill);
  });
}

async function checkAccess() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    
    if (!data.success || !data.user) {
      window.location.href = 'login.html';
      return false;
    }
    
    const hasAccess = ['premium', 'paid', 'pro'].includes(data.user.status) || data.user.isTrialActive;
    
    if (!hasAccess) {
      alert('La gestione ordini richiede un piano Premium o superiore');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Errore verifica accesso:', error);
    window.location.href = 'login.html';
    return false;
  }
}

function switchSection(section) {
  state.currentSection = section;
  state.viewingCompleted = false;
  state.expandedGroups.clear();
  
  Object.keys(SECTIONS).forEach(key => {
    document.getElementById(`${key}-tab`)?.classList.toggle('active', key === section);
  });
  
  Object.keys(SECTIONS).forEach(key => {
    const sections = dom.sections[key];
    if (sections) {
      sections.active?.classList.toggle('active', key === section);
      sections.active?.classList.toggle('hidden', key !== section);
      sections.completed?.classList.add('hidden');
      sections.completed?.classList.remove('active');
    }
  });
  
  animatePill();
  loadOrders();
}

function animatePill() {
  const pill = document.querySelector('.pill');
  const activeTab = document.getElementById(`${state.currentSection}-tab`);
  if (!pill || !activeTab) return;
  
  // Forza il reflow prima di calcolare le posizioni
  pill.style.transition = 'none';
  void pill.offsetWidth;
  
  const tabRect = activeTab.getBoundingClientRect();
  const navRect = dom.nav.getBoundingClientRect();
  
  pill.style.left = `${tabRect.left - navRect.left}px`;
  pill.style.width = `${tabRect.width}px`;
  
  // Riattiva la transizione
  requestAnimationFrame(() => {
    pill.style.transition = '';
  });
}

async function loadOrders() {
  rotateRefresh();
  const section = getActiveSection();
  section.innerHTML = '<div class="loading">Caricamento...</div>';
  
  try {
    const apiPath = SECTIONS[state.currentSection].apiPath;
    const res = await fetch(`${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${apiPath}`);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    state.orders = await res.json();
    renderOrders();
  } catch (error) {
    console.error('Errore caricamento:', error);
    section.innerHTML = `
      <div class="error">
        <h3>Errore caricamento</h3>
        <button onclick="loadOrders()">Riprova</button>
      </div>`;
  }
}

function rotateRefresh() {
  if (state.isRotating) return;
  state.isRotating = true;
  state.rotation += 180;
  dom.refreshBtn.style.transform = `rotate(${state.rotation}deg)`;
  setTimeout(() => state.isRotating = false, 500);
}

function renderOrders() {
  const section = getActiveSection();
  const orders = state.orders.filter(o => 
    state.viewingCompleted ? o.status === 'completed' : o.status !== 'completed'
  );
  
  const grouped = groupOrders(orders);
  const completedCount = state.orders.filter(o => o.status === 'completed').length;
  
  if (orders.length === 0) {
    section.innerHTML = `
      <div class="orders-grid">
        <div class="empty-state">Nessun ordine ${state.viewingCompleted ? 'completato' : 'attivo'}</div>
        ${createNavButton(completedCount)}
      </div>`;
    return;
  }
  
  const sortedGroups = Object.entries(grouped).sort((a, b) => 
    getLatestTimestamp(b[1]) - getLatestTimestamp(a[1])
  );
  
  let html = '<div class="orders-grid">';
  
  sortedGroups.forEach(([id, groupOrders], i) => {
    const isExpanded = state.expandedGroups.has(id);
    const hasMultiple = groupOrders.length > 1;
    const color = getColor(i);
    
    if (isExpanded && hasMultiple) {
      html += createCollapseButton(id, color);
      groupOrders.forEach((order, j) => {
        html += createOrderCard(order, color, j + 1);
      });
    } else {
      html += createGroupCard(id, groupOrders, color, hasMultiple);
    }
  });
  
  html += createNavButton(completedCount) + '</div>';
  section.innerHTML = html;
}

function createGroupCard(id, orders, color, hasMultiple) {
  const order = orders[0];
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  const count = hasMultiple ? `<sup>(${orders.length})</sup>` : '';
  const isNew = !state.viewingCompleted && orders.some(o => isNewOrder(o.timestamp));
  const newBadge = isNew ? '<div class="new-indicator"></div>' : '';
  const completed = state.viewingCompleted ? 'completed' : '';
  
  const events = hasMultiple ? 
    `oncontextmenu="expandGroup('${id}'); return false;" onclick="showGroupDetails('${id}')"` :
    `onclick="showOrderDetails('${order.id}')"`;
  
  return `
    <div class="order-card ${hasMultiple ? 'group' : ''} ${completed}" 
         style="--card-color: ${color}" ${events}>
      ${newBadge}
      <div class="card-number">${id}${count}</div>
      <div class="card-info">
        <div class="card-date">${formatDateTime(order.timestamp)}</div>
        <div class="card-price">€${total.toFixed(2)}</div>
      </div>
    </div>`;
}

function createOrderCard(order, color, orderNum = null) {
  const id = getOrderIdentifier(order);
  const count = orderNum ? `<sup>(${orderNum})</sup>` : '';
  const isNew = !state.viewingCompleted && isNewOrder(order.timestamp);
  const newBadge = isNew ? '<div class="new-indicator"></div>' : '';
  const completed = state.viewingCompleted ? 'completed' : '';
  
  return `
    <div class="order-card ${completed}" 
         style="--card-color: ${color}" onclick="showOrderDetails('${order.id}')">
      ${newBadge}
      <div class="card-number">${id}${count}</div>
      <div class="card-info">
        <div class="card-date">${formatDateTime(order.timestamp)}</div>
        <div class="card-price">€${order.total.toFixed(2)}</div>
      </div>
    </div>`;
}

function createCollapseButton(id, color) {
  const completed = state.viewingCompleted ? 'completed' : '';
  return `
    <div class="order-card group-collapse ${completed}" style="--card-color: ${color}" 
         onclick="collapseGroup('${id}')"
         oncontextmenu="collapseGroup('${id}'); return false;">
      <div class="card-number">Chiudi</div>
      <div class="card-info">
        <div class="card-date">Ordine ${id}</div>
      </div>
    </div>`;
}

function createNavButton(completedCount) {
  if (state.viewingCompleted) {
    return `
      <div class="order-card special" onclick="showActive()">
        <div class="card-number">Torna ad attivi</div>
        <div class="card-info">
          <div class="card-date">Tutti gli ordini</div>
        </div>
      </div>`;
  }
  return `
    <div class="order-card special" onclick="showCompleted()">
      <div class="card-number">Vai a terminati</div>
      <div class="card-info">
        <div class="card-date">${completedCount} ordini</div>
      </div>
    </div>`;
}

function showOrderDetails(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  
  state.currentDetailOrder = order;
  const id = getOrderIdentifier(order);
  
  // Titolo personalizzato per categoria
  const titles = {
    table: `Tavolo #${id}`,
    takeaway: `Orario ${id}`,
    delivery: `Consegna ${id}`
  };
  
  document.querySelector('.gpopup-title').textContent = titles[state.currentSection] || `Ordine #${id}`;
  
  // Data formattata: "Ordinato alle XX:XX del giorno DD/MM"
  const d = new Date(order.timestamp);
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  document.querySelector('.gpopup-date').textContent = `Ordinato alle ${time} del giorno ${date}`;
  
  document.querySelector('.gpopup-total').textContent = `€${order.total.toFixed(2)}`;
  
  document.querySelector('.gpopup-items').innerHTML = order.items.map((item, i) => {
    const note = order.orderNotes?.[i]?.trim();
    const price = item.finalPrice || item.price || 0;
    
    return `
      <div class="gpopup-item">
        <div class="item-info">
          <h4>${item.quantity > 1 ? `(x${item.quantity}) ` : ''}${formatItemName(item)}</h4>
          <div class="item-price">€${(price * item.quantity).toFixed(2)}</div>
        </div>
        ${note ? `<div class="item-note">🗒️ ${note}</div>` : ''}
      </div>`;
  }).join('');
  
  updateStatusButton(order.status);
  showPopup();
}

function showGroupDetails(id) {
  const orders = getOrdersByIdentifier(id);
  if (orders.length === 0) return;
  
  if (!state.expandedGroups.has(id)) {
    state.currentDetailOrder = { id: `group_${id}`, isGroup: true, orders };
    
    const total = orders.reduce((sum, o) => sum + o.total, 0);
    const earliest = orders.reduce((e, o) => 
      new Date(o.timestamp) < new Date(e.timestamp) ? o : e
    );
    
    // Titolo personalizzato per categoria (senza trattino)
    const titles = {
      table: `Tavolo #${id} (${orders.length} ordini)`,
      takeaway: `Orario ${id} (${orders.length} ordini)`,
      delivery: `Consegna ${id} (${orders.length} ordini)`
    };
    
    document.querySelector('.gpopup-title').textContent = titles[state.currentSection] || `Ordine #${id} (${orders.length} ordini)`;
    
    // Data formattata: "Ordinato alle XX:XX del giorno DD/MM"
    const d = new Date(earliest.timestamp);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    document.querySelector('.gpopup-date').textContent = `Ordinato alle ${time} del giorno ${date}`;
    
    document.querySelector('.gpopup-total').textContent = `€${total.toFixed(2)}`;
    
    const combined = {};
    orders.forEach((order, oi) => {
      order.items.forEach((item, ii) => {
        const key = `${item.name}|${JSON.stringify(item.customizations || {})}`;
        if (!combined[key]) {
          combined[key] = {
            name: item.name,
            price: item.finalPrice || item.price || 0,
            quantity: 0,
            notes: [],
            customizations: item.customizations || {}
          };
        }
        combined[key].quantity += item.quantity;
        const note = order.orderNotes?.[ii]?.trim();
        if (note) combined[key].notes.push(`Ordine ${oi + 1}: ${note}`);
      });
    });
    
    document.querySelector('.gpopup-items').innerHTML = Object.values(combined).map(item => {
      const notesHtml = item.notes.map(n => `<div class="item-note">🗒️ ${n}</div>`).join('');
      return `
        <div class="gpopup-item">
          <div class="item-info">
            <h4>${item.quantity > 1 ? `(x${item.quantity}) ` : ''}${formatItemName(item)}</h4>
            <div class="item-price">€${(item.price * item.quantity).toFixed(2)}</div>
          </div>
          ${notesHtml}
        </div>`;
    }).join('');
    
    updateStatusButton(orders[0].status);
    showPopup();
  }
}

async function deleteOrder() {
  if (!state.currentDetailOrder) return;
  
  const btn = document.getElementById('delete-btn');
  btn.disabled = true;
  hideDeletePopup();
  
  try {
    const orders = state.currentDetailOrder.isGroup ? 
      state.currentDetailOrder.orders : [state.currentDetailOrder];
    
    const apiPath = SECTIONS[state.currentSection].apiPath;
    
    await Promise.all(orders.map(async order => {
      const filename = order.timestamp.replace(/:/g, '.').replace('T', ' - ').split('.')[0];
      const res = await fetch(
        `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${apiPath}/${filename}`, 
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
      );
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const idx = state.orders.findIndex(o => o.id === order.id);
      if (idx !== -1) state.orders.splice(idx, 1);
    }));
    
    setTimeout(() => {
      hidePopup();
      renderOrders();
      btn.disabled = false;
      state.currentDetailOrder = null;
    }, 500);
    
  } catch (error) {
    console.error('Errore eliminazione:', error);
    alert('Errore nell\'eliminare l\'ordine');
    btn.disabled = false;
  }
}

async function toggleStatus() {
  if (!state.currentDetailOrder) return;
  
  const orders = state.currentDetailOrder.isGroup ? 
    state.currentDetailOrder.orders : [state.currentDetailOrder];
  
  const newStatus = orders[0].status === 'completed' ? 'pending' : 'completed';
  const btn = document.querySelector('.toggle-status');
  btn.disabled = true;
  
  try {
    const apiPath = SECTIONS[state.currentSection].apiPath;
    
    await Promise.all(orders.map(async order => {
      const filename = order.timestamp.replace(/:/g, '.').replace('T', ' - ').split('.')[0];
      const res = await fetch(
        `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${apiPath}/${filename}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const idx = state.orders.findIndex(o => o.id === order.id);
      if (idx !== -1) state.orders[idx].status = newStatus;
    }));
    
    if (!state.currentDetailOrder.isGroup) {
      state.currentDetailOrder.status = newStatus;
    }
    
    updateStatusButton(newStatus);
    setTimeout(() => {
      hidePopup();
      renderOrders();
    }, 800);
    
  } catch (error) {
    console.error('Errore aggiornamento:', error);
    alert('Errore nel salvare lo stato');
    btn.disabled = false;
  }
}

function showPopup() {
  dom.popup.classList.remove('hidden');
  hideDeletePopup();
}

function hidePopup() {
  dom.popup.classList.add('hidden');
  hideDeletePopup();
  state.currentDetailOrder = null;
  document.getElementById('delete-btn').disabled = false;
  document.querySelector('.toggle-status').disabled = false;
}

function showDeletePopup() {
  dom.deletePopup.classList.add('show');
}

function hideDeletePopup() {
  dom.deletePopup.classList.remove('show');
}

function updateStatusButton(status) {
  const btn = document.querySelector('.toggle-status');
  const icon = btn.querySelector('.status-icon');
  const text = btn.querySelector('.status-text');
  
  if (status === 'completed') {
    btn.className = 'status-btn toggle-status completed';
    icon.textContent = '↻';
    text.textContent = 'Riapri ordine';
  } else {
    btn.className = 'status-btn toggle-status';
    icon.textContent = '✓';
    text.textContent = 'Segna come completato';
  }
  
  btn.disabled = false;
}

function showCompleted() {
  state.viewingCompleted = true;
  
  const sections = dom.sections[state.currentSection];
  if (sections) {
    sections.active?.classList.add('hidden');
    sections.active?.classList.remove('active');
    sections.completed?.classList.remove('hidden');
    sections.completed?.classList.add('active');
  }
  
  renderOrders();
}

function showActive() {
  state.viewingCompleted = false;
  
  const sections = dom.sections[state.currentSection];
  if (sections) {
    sections.active?.classList.remove('hidden');
    sections.active?.classList.add('active');
    sections.completed?.classList.add('hidden');
    sections.completed?.classList.remove('active');
  }
  
  renderOrders();
}

function expandGroup(id) {
  state.expandedGroups.add(id);
  renderOrders();
}

function collapseGroup(id) {
  state.expandedGroups.delete(id);
  renderOrders();
}

function getActiveSection() {
  return state.viewingCompleted ? 
    dom.sections[state.currentSection].completed : 
    dom.sections[state.currentSection].active;
}

function getOrderIdentifier(order) {
  return SECTIONS[state.currentSection].getIdentifier(order);
}

function groupOrders(orders) {
  const grouped = {};
  
  orders.forEach(order => {
    const key = getOrderIdentifier(order);
    
    // Raggruppa SOLO per ordini tavolo
    if (state.currentSection === 'table') {
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    } else {
      // Per takeaway e delivery, ogni ordine è separato
      const uniqueKey = `${key}_${order.id}`;
      grouped[uniqueKey] = [order];
    }
  });
  
  Object.values(grouped).forEach(group => 
    group.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  );
  
  return grouped;
}

function getOrdersByIdentifier(id) {
  const orders = state.orders.filter(o => 
    (state.viewingCompleted ? o.status === 'completed' : o.status !== 'completed') &&
    getOrderIdentifier(o) === id
  );
  return orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function formatItemName(item) {
  let name = item.name;
  if (item.customizations && Object.keys(item.customizations).length > 0) {
    const customs = Object.entries(item.customizations)
      .map(([n, q]) => `${n}${q > 1 ? ' x' + q : ''}`)
      .join(', ');
    name += ` <span class="item-customizations">(${customs})</span>`;
  }
  return name;
}

function getLatestTimestamp(orders) {
  return Math.max(...orders.map(o => new Date(o.timestamp).getTime()));
}

function getColor(index) {
  const colors = ['#FF6F6F', '#FF9A4D', '#F7E250', '#56D97C', '#42C7F5', 
                  '#6C8CFF', '#9C7DFF', '#FF77F6', '#FFB36B', '#FFE066'];
  return colors[index % colors.length];
}

function isNewOrder(timestamp) {
  return Date.now() - new Date(timestamp).getTime() < 15 * 60 * 1000;
}

function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}<br>${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateTimeFull(timestamp) {
  const d = new Date(timestamp);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} - ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function toggleFullscreen() {
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
}

// Esposizione funzioni globali
window.showOrderDetails = showOrderDetails;
window.showGroupDetails = showGroupDetails;
window.collapseGroup = collapseGroup;
window.expandGroup = expandGroup;
window.showCompleted = showCompleted;
window.showActive = showActive;
window.loadOrders = loadOrders;

// Cleanup al termine
window.addEventListener('beforeunload', () => {
  if (state.autoRefreshInterval) {
    clearInterval(state.autoRefreshInterval);
  }
});
