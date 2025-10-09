// Configurazione e variabili globali
const CONFIG = {
  restaurantId: new URLSearchParams(window.location.search).get('id') || '0000',
  apiBase: '/IDs',
  refreshInterval: 30000
};


document.getElementById("fullscreen").onclick = () =>
document.fullscreenElement
  ? document.exitFullscreen()
  : document.documentElement.requestFullscreen();

let currentSection = 'table';
let currentOrders = [];
let viewingCompleted = false;
let expandedGroups = new Set();
let currentDetailOrder = null;
let touchTimer = null;
let isLongPress = false;
let rotation = 0;
let isRotating = false;

document.getElementById("stats").onclick = () => {
  window.location.href = `statistics.html?id=${CONFIG.restaurantId}`;
};

// Elementi DOM
const elements = {
  refreshBtn: document.getElementById('table-refresh-btn'),
  nav: document.getElementById('table-nav'),
  sections: {
    table: document.querySelector('.orders-section'),
    pickup: document.querySelector('.pickup-section'),
    tableCompleted: document.querySelector('.orders-section.completed'),
    pickupCompleted: document.querySelector('.pickup-section.completed')
  },
  popup: document.querySelector('.gpopup'),
  popupContent: {
    title: document.querySelector('.gpopup-title'),
    date: document.querySelector('.gpopup-date'),
    total: document.querySelector('.gpopup-total'),
    items: document.querySelector('.gpopup-items'),
    statusBtn: document.querySelector('.toggle-status'),
    deleteBtn: document.getElementById('delete-btn')
  },
  deletePopup: document.querySelector('.delete-popup-overlay'),
  openDeleteBtn: document.getElementById('open-delete-popup'),
  cancelDeleteBtn: document.getElementById('cancel-delete')
};

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  switchSection('table');
  loadOrders();
  setInterval(loadOrders, CONFIG.refreshInterval);
});

function rotateRefresh() {
  if (isRotating) return;
  isRotating = true;
  rotation += 360;
  elements.refreshBtn.style.transform = `rotate(${rotation}deg)`;
  setTimeout(() => isRotating = false, 1000);
}

// Event Listeners
function initEventListeners() {
  // Navigazione
  document.getElementById('table-orders-tab').addEventListener('click', () => switchSection('table'));
  document.getElementById('table-pickup-tab').addEventListener('click', () => switchSection('pickup'));
  // Refresh
  document.getElementById('table-refresh-btn').addEventListener('click', loadOrders);
  
  // Popup
  document.querySelector('.gpopup-close-btn').addEventListener('click', hidePopup);
  elements.popup.addEventListener('click', (e) => e.target === elements.popup && hidePopup());
  elements.popupContent.statusBtn.addEventListener('click', toggleOrderStatus);
  
  // Delete popup
  if (elements.openDeleteBtn) {
    elements.openDeleteBtn.addEventListener('click', showDeletePopup);
  }
  if (elements.popupContent.deleteBtn) {
    elements.popupContent.deleteBtn.addEventListener('click', deleteOrder);
  }
  if (elements.cancelDeleteBtn) {
    elements.cancelDeleteBtn.addEventListener('click', hideDeletePopup);
  }
  // Click esterno per chiudere delete popup
  if (elements.deletePopup) {
    elements.deletePopup.addEventListener('click', (e) => {
      if (e.target === elements.deletePopup) {
        hideDeletePopup();
      }
    });
  }
  
  // Animazione pillola navbar
  window.addEventListener('resize', animatePill);

  document.getElementById('gestione-menu-btn').addEventListener('click', () => {
    window.location.href = `gestione-menu.html?id=${CONFIG.restaurantId}`;
});

}

// Gestione delete popup
function showDeletePopup() {
  elements.deletePopup.classList.add('show');
}

function hideDeletePopup() {
  elements.deletePopup.classList.remove('show');
}

// Cambio sezione
function switchSection(section) {
  currentSection = section;
  viewingCompleted = false;
  expandedGroups.clear();
  
  // Aggiorna tab attivi
  document.getElementById('table-orders-tab').classList.toggle('active', section === 'table');
  document.getElementById('table-pickup-tab').classList.toggle('active', section === 'pickup');
  
  // Mostra/nascondi sezioni - SOLO table e pickup attive, mai le completed
  elements.sections.table.classList.toggle('active', section === 'table');
  elements.sections.table.classList.toggle('hidden', section !== 'table');
  
  elements.sections.pickup.classList.toggle('active', section === 'pickup');
  elements.sections.pickup.classList.toggle('hidden', section !== 'pickup');
  
  // Le sezioni completed rimangono sempre nascoste
  elements.sections.tableCompleted.classList.add('hidden');
  elements.sections.tableCompleted.classList.remove('active');
  elements.sections.pickupCompleted.classList.add('hidden');
  elements.sections.pickupCompleted.classList.remove('active');
  
  animatePill();
  loadOrders();
}

// Animazione pillola navbar
function animatePill() {
  const pill = document.querySelector('.pill');
  const activeTab = document.querySelector(`#table-${currentSection === 'table' ? 'orders' : 'pickup'}-tab`);
  if (!pill || !activeTab) return;
  
  const tabRect = activeTab.getBoundingClientRect();
  const navRect = elements.nav.getBoundingClientRect();
  pill.style.left = `${tabRect.left - navRect.left}px`;
  pill.style.width = `${tabRect.width}px`;
}

// Caricamento ordini - RIMOSSO filtro 24h
async function loadOrders() {
  rotateRefresh();
  const activeSection = getActiveSection();
  activeSection.innerHTML = '<div class="loading">Caricamento...</div>';
  
  try {
    const response = await fetch(`${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${currentSection}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    currentOrders = await response.json();
    
    renderOrders();
  } catch (error) {
    console.error('Errore caricamento:', error);
    activeSection.innerHTML = `
      <div class="error">
        <h3>Errore caricamento</h3>
        <button onclick="loadOrders()">Riprova</button>
      </div>`;
  }
}

// Rendering principale
function renderOrders() {
  const activeSection = getActiveSection();
  const orders = viewingCompleted ? 
    currentOrders.filter(o => o.status === 'completed') :
    currentOrders.filter(o => o.status !== 'completed');
  
  if (viewingCompleted) {
    renderCompletedView(activeSection, orders);
    return;
  }
  
  // Vista ordini in corso
  if (orders.length === 0) {
    const completedCount = currentOrders.filter(o => o.status === 'completed').length;
    activeSection.innerHTML = `
      <div class="orders-grid">
        <div class="empty-state">Nessun ordine attivo</div>
        ${createNavigationButtons(completedCount, false)}
      </div>`;
    return;
  }
  
  const grouped = groupOrdersByIdentifier(orders);
  const completedCount = currentOrders.filter(o => o.status === 'completed').length;
  
  let html = '<div class="orders-grid">';
  
  // Ordina i gruppi per timestamp del più recente ordine nel gruppo
  const sortedGroups = Object.entries(grouped).sort((a, b) => {
    const timestampA = Math.max(...a[1].map(order => new Date(order.timestamp).getTime()));
    const timestampB = Math.max(...b[1].map(order => new Date(order.timestamp).getTime()));
    return timestampB - timestampA;
  });
  
  sortedGroups.forEach(([identifier, groupOrders], index) => {
    const isExpanded = expandedGroups.has(identifier);
    const hasMultiple = groupOrders.length > 1;
    const color = getTableColor(index);
    
    if (isExpanded && hasMultiple) {
      // Mostra bottone di chiusura e ordini separati
      html += createCollapseButton(identifier, color, false);
      groupOrders.forEach((order, i) => {
        html += createOrderCard(order, color, false, i + 1);
      });
    } else {
      // Mostra carta raggruppata
      html += createGroupCard(identifier, groupOrders, color, hasMultiple);
    }
  });
  
  html += createNavigationButtons(completedCount, false) + '</div>';
  activeSection.innerHTML = html;
}

// Vista completati - MODIFICATA per ordinamento cronologico
function renderCompletedView(section, completedOrders) {
  let html = '<div class="orders-grid">';
  
  if (completedOrders.length === 0) {
    html += '<div class="empty-state">Nessun ordine completato</div>';
  } else {
    const grouped = groupOrdersByIdentifier(completedOrders);
    
    // Ordina i gruppi per timestamp del più recente ordine nel gruppo
    const sortedGroups = Object.entries(grouped).sort((a, b) => {
      const timestampA = Math.max(...a[1].map(order => new Date(order.timestamp).getTime()));
      const timestampB = Math.max(...b[1].map(order => new Date(order.timestamp).getTime()));
      return timestampB - timestampA;
    });
    
    sortedGroups.forEach(([identifier, groupOrders], index) => {
      const isExpanded = expandedGroups.has(identifier);
      const hasMultiple = groupOrders.length > 1;
      const color = getTableColor(index);
      
      if (isExpanded && hasMultiple) {
        html += createCollapseButton(identifier, color, true);
        groupOrders.forEach((order, i) => {
          html += createOrderCard(order, color, true, i + 1);
        });
      } else {
        html += createGroupCard(identifier, groupOrders, color, hasMultiple, true);
      }
    });
  }
  
  const completedCount = currentOrders.filter(o => o.status === 'completed').length;
  html += createNavigationButtons(completedCount, true) + '</div>';
  section.innerHTML = html;
}

// Creazione elementi HTML
function createGroupCard(identifier, orders, color, hasMultiple, isCompleted = false) {
  const order = orders[0]; // Il più recente del gruppo
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  const countDisplay = hasMultiple ? `<sup>(${orders.length})</sup>` : '';
  const isNew = !isCompleted && orders.some(o => isNewOrder(o.timestamp));
  const newIndicator = isNew ? '<div class="new-indicator"></div>' : '';
  
  const events = hasMultiple ? 
    `oncontextmenu="expandGroup('${identifier}'); return false;" 
     onclick="showGroupDetails('${identifier}')"` :
    `onclick="showOrderDetails('${order.id}')"`;
  
  return `
    <div class="order-card ${hasMultiple ? 'group' : ''} ${isCompleted ? 'completed' : ''}" 
         style="--card-color: ${color}" ${events}>
      ${newIndicator}
      <div class="card-number">${identifier}${countDisplay}</div>
      <div class="card-info">
        <div class="card-date">${formatDateTime(order.timestamp)}</div>
        <div class="card-price">€${total.toFixed(2)}</div>
      </div>
    </div>`;
}

function createOrderCard(order, color, isCompleted = false, orderNumber = null) {
  const identifier = order.tableNumber || order.orderNumber;
  const countDisplay = orderNumber ? `<sup>(${orderNumber})</sup>` : '';
  const newIndicator = (!isCompleted && isNewOrder(order.timestamp)) ? 
    '<div class="new-indicator"></div>' : '';
  
  return `
    <div class="order-card ${isCompleted ? 'completed' : ''}" 
         style="--card-color: ${color}" onclick="showOrderDetails('${order.id}')">
      ${newIndicator}
      <div class="card-number">${identifier}${countDisplay}</div>
      <div class="card-info">
        <div class="card-date">${formatDateTime(order.timestamp)}</div>
        <div class="card-price">€${order.total.toFixed(2)}</div>
      </div>
    </div>`;
}

function createCollapseButton(identifier, color, isCompleted = false) {
  return `
    <div class="order-card group-collapse ${isCompleted ? 'completed' : ''}" style="--card-color: ${color}" 
         onclick="collapseGroup('${identifier}')"
         oncontextmenu="collapseGroup('${identifier}'); return false;">
      <div class="card-number">Chiudi</div>
      <div class="card-info">
        <div class="card-date">Ordine ${identifier}</div>
      </div>
    </div>`;
}

// MODIFICATA: Funzione unificata per i bottoni di navigazione - SEMPRE VISIBILI
function createNavigationButtons(completedCount, isCompletedView) {
  if (isCompletedView) {
    // Vista completati: mostra sempre il bottone "Torna ad attivi"
    return `
      <div class="order-card special" onclick="showActive()">
        <div class="card-number">Torna ad attivi</div>
        <div class="card-info">
          <div class="card-date">Tutti gli ordini</div>
        </div>
      </div>`;
  } else {
    // Vista attivi: mostra sempre il bottone "Vai a terminati" con il conteggio
    return `
      <div class="order-card special" onclick="showCompleted()">
        <div class="card-number">Vai a terminati</div>
        <div class="card-info">
          <div class="card-date">${completedCount} ordini</div>
        </div>
      </div>`;
  }
}

// Gestione gruppi
function expandGroup(identifier) {
  expandedGroups.add(identifier);
  renderOrders();
}

function collapseGroup(identifier) {
  expandedGroups.delete(identifier);
  renderOrders();
}

// NUOVA FUNZIONE: Mostra dettagli del gruppo (somma di tutti gli ordini)
function showGroupDetails(identifier) {
  const orders = getOrdersByIdentifier(identifier);
  if (orders.length === 0) return;
  
  // Se è un gruppo non espanso, mostra il popup con la somma
  if (!expandedGroups.has(identifier)) {
    showCombinedOrderDetails(identifier, orders);
  }
}

// NUOVA FUNZIONE: Mostra popup combinato per gruppo di ordini
function showCombinedOrderDetails(identifier, orders) {
  if (orders.length === 0) return;
  
  currentDetailOrder = { 
    id: `group_${identifier}`, 
    isGroup: true, 
    orders: orders 
  };
  
  const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);
  const earliestOrder = orders.reduce((earliest, order) => 
    new Date(order.timestamp) < new Date(earliest.timestamp) ? order : earliest
  );
  
  elements.popupContent.title.textContent = `${currentSection === 'table' ? 'Tavolo' : 'Ordine'} #${identifier} - (${orders.length} ordini)`;
  elements.popupContent.date.textContent = formatDateTimeFull(earliestOrder.timestamp);
  elements.popupContent.total.textContent = `€${totalAmount.toFixed(2)}`;
  
  // Combina tutti gli items dei vari ordini
  const combinedItems = {};
  
  orders.forEach((order, orderIndex) => {
    order.items.forEach((item, itemIndex) => {
      const key = item.name;
      if (!combinedItems[key]) {
        combinedItems[key] = {
          name: item.name,
          price: item.price,
          quantity: 0,
          notes: []
        };
      }
      
      combinedItems[key].quantity += item.quantity;
      
      // Aggiungi nota se presente
      const note = order.totemino_notes?.[itemIndex]?.trim();
      if (note) {
        combinedItems[key].notes.push(`Ordine ${orderIndex + 1}: ${note}`);
      }
    });
  });
  
  elements.popupContent.items.innerHTML = Object.values(combinedItems).map(item => {
    const notesHtml = item.notes.length > 0 ? 
      item.notes.map(note => `<div class="item-note">🗒️ ${note}</div>`).join('') : '';
    
    return `
      <div class="gpopup-item">
        <div class="item-info">
          <h4>${item.name} ${item.quantity > 1 ? `(x${item.quantity})` : ''}</h4>
          <div class="item-price">€${(item.price * item.quantity).toFixed(2)}</div>
        </div>
        ${notesHtml}
      </div>`;
  }).join('');
  
  // Per i gruppi, mostra lo stato del primo ordine (o logica personalizzata)
  updateStatusButton(orders[0].status);
  showPopup();
}

// Popup ordine singolo
function showOrderDetails(orderId) {
  const order = currentOrders.find(o => o.id === orderId);
  if (!order) return;
  
  currentDetailOrder = order;
  const identifier = order.tableNumber || order.orderNumber;
  
  elements.popupContent.title.textContent = 
    `${currentSection === 'table' ? 'Tavolo' : 'Ordine'} #${identifier}`;
  elements.popupContent.date.textContent = formatDateTimeFull(order.timestamp);
  elements.popupContent.total.textContent = `€${order.total.toFixed(2)}`;
  
  elements.popupContent.items.innerHTML = order.items.map((item, i) => {
    const note = order.totemino_notes?.[i]?.trim();
    return `
      <div class="gpopup-item">
        <div class="item-info">
          <h4>${item.name} ${item.quantity > 1 ? `(x${item.quantity})` : ''}</h4>
          <div class="item-price">€${(item.price * item.quantity).toFixed(2)}</div>
        </div>
        ${note ? `<div class="item-note">🗒️ ${note}</div>` : ''}
      </div>`;
  }).join('');
  
  updateStatusButton(order.status);
  showPopup();
}

// CORREZIONE: Elimina ordine spostandolo in deleted
async function deleteOrder() {
  if (!currentDetailOrder) return;
  
  // Se è un gruppo, elimina tutti gli ordini del gruppo
  if (currentDetailOrder.isGroup) {
    await deleteGroupOrders();
    return;
  }
  
  // Reset del popup e dei bottoni prima dell'operazione
  elements.popupContent.deleteBtn.disabled = true;
  hideDeletePopup();
  
  try {
    const identifier = currentDetailOrder._filename?.replace('.json', '') || currentDetailOrder.id;
    const response = await fetch(
      `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${currentSection}/${identifier}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        filename: currentDetailOrder._filename
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    // Rimuovi dall'array locale
    const orderIndex = currentOrders.findIndex(o => o.id === currentDetailOrder.id);
    if (orderIndex !== -1) {
      currentOrders.splice(orderIndex, 1);
    }
    
    // Reset completo e chiusura popup
    setTimeout(() => {
      hidePopup();
      renderOrders();
      // Reset esplicito degli elementi
      elements.popupContent.deleteBtn.disabled = false;
      currentDetailOrder = null;
    }, 500);
    
  } catch (error) {
    console.error('Errore eliminazione:', error);
    alert('Errore nell\'eliminare l\'ordine');
    elements.popupContent.deleteBtn.disabled = false;
    hideDeletePopup();
  }
}

// CORREZIONE: Elimina gruppo di ordini
async function deleteGroupOrders() {
  if (!currentDetailOrder || !currentDetailOrder.isGroup) return;
  
  const orders = currentDetailOrder.orders;
  elements.popupContent.deleteBtn.disabled = true;
  hideDeletePopup();
  
  try {
    // Elimina tutti gli ordini del gruppo
    const deletePromises = orders.map(async order => {
      const identifier = order._filename?.replace('.json', '') || order.id;
      const response = await fetch(
        `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${currentSection}/${identifier}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filename: order._filename
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status} for order ${order.id}`);
      
      // Rimuovi dall'array locale
      const orderIndex = currentOrders.findIndex(o => o.id === order.id);
      if (orderIndex !== -1) {
        currentOrders.splice(orderIndex, 1);
      }
      
      return response;
    });
    
    await Promise.all(deletePromises);
    
    // Reset completo e chiusura popup
    setTimeout(() => {
      hidePopup();
      renderOrders();
      // Reset esplicito degli elementi
      elements.popupContent.deleteBtn.disabled = false;
      currentDetailOrder = null;
    }, 500);
    
  } catch (error) {
    console.error('Errore eliminazione gruppo:', error);
    alert('Errore nell\'eliminare gli ordini');
    elements.popupContent.deleteBtn.disabled = false;
    hideDeletePopup();
  }
}

// Toggle stato ordine - MODIFICATA per gestire i gruppi
async function toggleOrderStatus() {
  if (!currentDetailOrder) return;
  
  // Se è un gruppo, aggiorna tutti gli ordini del gruppo
  if (currentDetailOrder.isGroup) {
    await toggleGroupOrderStatus();
    return;
  }
  
  const newStatus = currentDetailOrder.status === 'completed' ? 'pending' : 'completed';
  elements.popupContent.statusBtn.disabled = true;
  
  try {
    const identifier = currentDetailOrder._filename?.replace('.json', '') || currentDetailOrder.id;
    const response = await fetch(
      `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${currentSection}/${identifier}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: newStatus,
        filename: currentDetailOrder._filename
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    // Aggiorna stato locale
    const orderIndex = currentOrders.findIndex(o => o.id === currentDetailOrder.id);
    if (orderIndex !== -1) {
      currentOrders[orderIndex].status = newStatus;
      currentDetailOrder.status = newStatus;
    }
    
    updateStatusButton(newStatus);
    
    setTimeout(() => {
      hidePopup();
      renderOrders();
    }, 800);
    
  } catch (error) {
    console.error('Errore aggiornamento:', error);
    alert('Errore nel salvare lo stato dell\'ordine');
    elements.popupContent.statusBtn.disabled = false;
  }
}

// NUOVA FUNZIONE: Toggle stato per gruppo di ordini
async function toggleGroupOrderStatus() {
  if (!currentDetailOrder || !currentDetailOrder.isGroup) return;
  
  const orders = currentDetailOrder.orders;
  const newStatus = orders[0].status === 'completed' ? 'pending' : 'completed';
  elements.popupContent.statusBtn.disabled = true;
  
  try {
    // Aggiorna tutti gli ordini del gruppo
    const updatePromises = orders.map(async order => {
      const identifier = order._filename?.replace('.json', '') || order.id;
      const response = await fetch(
        `${CONFIG.apiBase}/${CONFIG.restaurantId}/orders/${currentSection}/${identifier}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          filename: order._filename
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status} for order ${order.id}`);
      
      // Aggiorna stato locale
      const orderIndex = currentOrders.findIndex(o => o.id === order.id);
      if (orderIndex !== -1) {
        currentOrders[orderIndex].status = newStatus;
      }
      
      return response;
    });
    
    await Promise.all(updatePromises);
    
    updateStatusButton(newStatus);
    
    setTimeout(() => {
      hidePopup();
      renderOrders();
    }, 800);
    
  } catch (error) {
    console.error('Errore aggiornamento gruppo:', error);
    alert('Errore nel salvare lo stato degli ordini');
    elements.popupContent.statusBtn.disabled = false;
  }
}

// Controlli popup
function showPopup() {
  elements.popup.classList.remove('hidden');
  // Reset del delete popup quando si apre il popup principale
  hideDeletePopup();
}

function hidePopup() {
  elements.popup.classList.add('hidden');
  hideDeletePopup();
  // Reset completo
  currentDetailOrder = null;
  elements.popupContent.deleteBtn.disabled = false;
  elements.popupContent.statusBtn.disabled = false;
}

function updateStatusButton(status) {
  const btn = elements.popupContent.statusBtn;
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

// CORRETTA: Navigazione stati - UNA VISTA ALLA VOLTA
function showCompleted() {
  viewingCompleted = true;
  renderOrders(); // Ricarica solo i dati, l'interfaccia rimane sulla stessa sezione
}

function showActive() {
  viewingCompleted = false;
  renderOrders(); // Ricarica solo i dati, l'interfaccia rimane sulla stessa sezione
}

// Utility functions
function getActiveSection() {
  // Sempre la stessa sezione, cambia solo il contenuto in base a viewingCompleted
  return currentSection === 'table' ? 
    elements.sections.table : elements.sections.pickup;
}

// MODIFICATA: Ordinamento per timestamp decrescente
function groupOrdersByIdentifier(orders) {
  const grouped = {};
  orders.forEach(order => {
    const key = order.tableNumber || order.orderNumber || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });
  
  // Ordina ogni gruppo per timestamp decrescente (più recente prima)
  Object.values(grouped).forEach(group => 
    group.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  
  return grouped;
}

function getOrdersByIdentifier(identifier) {
  // Ottieni gli ordini giusti in base alla vista corrente
  const orders = viewingCompleted ? 
    currentOrders.filter(o => o.status === 'completed') :
    currentOrders.filter(o => o.status !== 'completed');
  
  return orders.filter(o => (o.tableNumber || o.orderNumber) === identifier)
               .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Ordina per timestamp
}

function getTableColor(index) {
  const colors = ['#FF6F6F', '#FF9A4D', '#F7E250', '#56D97C', '#42C7F5', 
                  '#6C8CFF', '#9C7DFF', '#FF77F6', '#FFB36B', '#FFE066'];
  return colors[index % colors.length];
}

function isNewOrder(timestamp) {
  return Date.now() - new Date(timestamp).getTime() < 15 * 60 * 1000;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}<br>${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateTimeFull(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} - ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Funzioni globali per HTML onclick
window.showOrderDetails = showOrderDetails;
window.showGroupDetails = showGroupDetails;
window.collapseGroup = collapseGroup;
window.expandGroup = expandGroup;
window.showCompleted = showCompleted;
window.showActive = showActive;
window.loadOrders = loadOrders;