// ===== STATE =====
let menuData = {};
let categories = [];
let restaurantId = null;
let currentEdit = { item: null, category: null, index: null };
let uploadedImage = null;
let hasChanges = false;
let menuTypes = [];
let filterType = '';
let editingCategoryName = null;
let editingCategoryItems = [];

const allergens = {
  "1": "Molluschi", "2": "Lupino", "3": "Soia", "4": "Latte", "5": "Uova",
  "6": "Pesce", "7": "Glutine", "8": "Arachidi", "9": "Frutta a guscio",
  "10": "Semi di sesamo", "11": "Sedano", "12": "Senape",
  "13": "Anidride solforosa", "14": "Crostacei"
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  if (!await checkAccess()) return;
  
  restaurantId = new URLSearchParams(window.location.search).get("id") || "default";
  
  // Event listeners
  document.getElementById('back-btn').onclick = () => location.href = `profile.html?id=${restaurantId}`;
  document.getElementById('close-edit-popup').onclick = closePopup;
  document.getElementById('cancel-edit').onclick = closePopup;
  document.getElementById('save-item').onclick = saveItem;
  document.getElementById('delete-item').onclick = () => showConfirm();
  document.getElementById('cancel-delete').onclick = hideConfirm;
  document.getElementById('confirm-delete').onclick = deleteItem;
  document.getElementById('save-menu').onclick = saveMenu;
  document.getElementById('menu-type-filter').onchange = () => {
    filterType = document.getElementById('menu-type-filter').value;
    render();
  };
  
  // Image upload
  const imgArea = document.getElementById('product-image-area');
  imgArea.onclick = () => document.getElementById('product-image').click();
  imgArea.ondragover = e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); };
  imgArea.ondragleave = e => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); };
  imgArea.ondrop = e => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) processImage(file);
  };
  document.getElementById('product-image').onchange = e => {
    const file = e.target.files[0];
    if (file) processImage(file);
  };
  
  // Popup close on click outside
  document.getElementById('edit-popup').onclick = e => { if (e.target === e.currentTarget) closePopup(); };
  document.getElementById('delete-popup').onclick = e => { if (e.target === e.currentTarget) hideConfirm(); };
  
  window.onbeforeunload = e => hasChanges ? (e.returnValue = 'Modifiche non salvate') : null;
  
  await loadMenu();
  await loadCustomizations();
});

async function checkAccess() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    
    if (!data.success || !data.user) {
      location.href = 'login.html';
      return false;
    }
    
    const hasAccess = ['premium', 'paid', 'pro'].includes(data.user.status) || data.user.isTrialActive;
    if (!hasAccess) {
      notify('Serve un piano Premium', 'error');
      setTimeout(() => location.href = `gestione.html?id=${restaurantId}`, 2000);
      return false;
    }
    return true;
  } catch (err) {
    location.href = 'login.html';
    return false;
  }
}

// ===== LOAD =====
async function loadMenu() {
  try {
    const [menuRes, settingsRes] = await Promise.all([
      fetch(`IDs/${restaurantId}/menu.json`),
      fetch(`IDs/${restaurantId}/settings.json`).catch(() => ({ ok: false }))
    ]);
    
    const menu = await menuRes.json();
    const settings = settingsRes.ok ? await settingsRes.json() : { menuTypes: [] };
    
    menuData = {};
    categories = [];
    
    menu.categories.forEach(cat => {
      categories.push(cat.name);
      menuData[cat.name] = cat.items.map(item => ({
        name: item.name,
        price: item.price,
        image: item.imagePath,
        description: item.description || '',
        allergens: item.allergens || [],
        isNew: item.featured || false,
        visible: item.visible !== false,
        menuType: item.menuType || [],
        customizable: item.customizable || false,
        customizationGroup: item.customizationGroup || null
      }));
    });
    
    // Assicura che esista sempre il menu default
    menuTypes = settings.menuTypes || [];
    if (!menuTypes.some(t => t.id === 'default')) {
      menuTypes.unshift({
        id: 'default',
        name: 'Menu Intero',
        coperto: 0,
        methods: { table: true, pickup: true, show: true },
        visible: true
      });
    }
    
    render();
  } catch (err) {
    console.error('Load error:', err);
    render();
  }
}

// ===== RENDER =====
function render() {
  renderMenuTypes();
  renderFilter();
  renderCategories();
}

function renderMenuTypes() {
  const container = document.getElementById('menu-types-cards');
  if (!container) return;
  
  container.innerHTML = menuTypes.length ? menuTypes.map((t, i) => `
    <div class="group-card" onclick="openEditMenuTypePopup(${i})" style="cursor: pointer;">
      <div class="group-card-header">
        <h3>${t.name}</h3>
      </div>
      <p class="group-sections">ID: ${t.id}</p>
    </div>
  `).join('') : '<p class="no-groups-message">Nessun tipo di menu</p>';
}

// ===== AGGIUNGI queste nuove funzioni =====
function openEditMenuTypePopup(idx) {
  const type = menuTypes[idx];
  const isDefault = type.id === 'default';
  
  document.getElementById('editing-menu-type-id').value = idx;
  document.getElementById('menu-type-name-edit').value = type.name;
  document.getElementById('menu-type-coperto-edit').value = type.coperto || 0;
  
  // FIX: Assicura che methods esista
  const methods = type.methods || { table: true, pickup: true, show: true };
  document.getElementById('edit-method-table').checked = methods.table !== false;
  document.getElementById('edit-method-pickup').checked = methods.pickup !== false;
  document.getElementById('edit-method-show').checked = methods.show !== false;
  document.getElementById('menu-type-visibility-edit').checked = type.visible !== false;
    
  // Nascondi pulsante elimina per il menu default
  const deleteBtn = document.querySelector('#edit-menu-type-popup .btn-danger');
  if (deleteBtn) {
    deleteBtn.style.display = type.id === 'default' ? 'none' : 'inline-block';
  }
  
  document.getElementById('edit-menu-type-popup').classList.remove('hidden');
}


function closeEditMenuTypePopup() {
  document.getElementById('edit-menu-type-popup').classList.add('hidden');
}

async function saveMenuTypeChanges() {
  const idx = parseInt(document.getElementById('editing-menu-type-id').value);
  const name = document.getElementById('menu-type-name-edit').value.trim();
  const coperto = parseFloat(document.getElementById('menu-type-coperto-edit').value) || 0;
  
  if (!name) return notify('Nome obbligatorio', 'error');
  
  menuTypes[idx] = {
    ...menuTypes[idx],
    name,
    coperto: parseFloat(coperto.toFixed(2)),
    methods: {
      table: document.getElementById('edit-method-table').checked,
      pickup: document.getElementById('edit-method-pickup').checked,
      show: document.getElementById('edit-method-show').checked
    },
    visible: document.getElementById('menu-type-visibility-edit').checked
  };
  
  await saveSettings();
  closeEditMenuTypePopup();
  render();
  notify('Tipo menu aggiornato!');
}

async function deleteMenuTypeFromPopup() {
  const idx = parseInt(document.getElementById('editing-menu-type-id').value);
  const type = menuTypes[idx];
  
  if (type.id === 'default') {
    notify('Il menu default può essere solo nascosto', 'error');
    return;
  }
  
  const inUse = Object.values(menuData).flat().some(item => item.menuType?.includes(type.id));
  
  if (inUse && !confirm(`"${type.name}" è in uso. Eliminare comunque?`)) return;
  
  menuTypes.splice(idx, 1);
  await saveSettings();
  closeEditMenuTypePopup();
  render();
  notify('Tipo menu eliminato');
}

function deleteMenuTypeFromCard(idx) {
  const type = menuTypes[idx];
  
  if (type.id === 'default') {
    notify('Il menu default può essere solo nascosto', 'error');
    return;
  }
  
  const inUse = Object.values(menuData).flat().some(item => item.menuType?.includes(type.id));
  
  if (inUse && !confirm(`"${type.name}" è in uso. Eliminare comunque?`)) return;
  
  menuTypes.splice(idx, 1);
  saveSettings();
  render();
  notify('Tipo menu eliminato');
}

function renderFilter() {
  const select = document.getElementById('menu-type-filter');
  if (!select) return;
  
  const defaultMenu = menuTypes.find(t => t.id === 'default');
  const otherMenus = menuTypes.filter(t => t.id !== 'default');
  
  let options = '';
  if (defaultMenu) {
    options += `<option value="default" ${filterType === 'default' || !filterType ? 'selected' : ''}>${defaultMenu.name}</option>`;
  }
  options += otherMenus.map(t => 
    `<option value="${t.id}" ${filterType === t.id ? 'selected' : ''}>${t.name}</option>`
  ).join('');
  
  select.innerHTML = options;
}


function renderCategories() {
  const container = document.getElementById('menu-sections');
  container.innerHTML = '';
  
  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Menu vuoto</h2>
        <p>Aggiungi una categoria</p>
        <button class="btn-primary" onclick="addCategory()">Aggiungi Categoria</button>
      </div>`;
    return;
  }
  
  let visible = 0;
  categories.forEach((cat, idx) => {
    const items = (menuData[cat] || []).filter(item => 
      !filterType || (item.menuType && item.menuType.includes(filterType))
    );
    
    if (!items.length && filterType) return;
    visible++;
    
    const section = document.createElement('div');
    section.className = 'category-section';
    section.innerHTML = `
      <div class="category-header">
        <h2 class="category-title">${cat}</h2>
        <div>
          <button class="delete-category-btn" onclick="deleteCategory('${cat}')" title="Elimina">
            <img src="img/delete.png">
          </button>
          <button class="edit-category-btn" onclick="openEditCategoryPopup('${cat}')" title="Modifica">
            <img src="img/edit.png">
          </button>
          <button class="add-item-btn" onclick="openPopup(null, '${cat}')" title="Aggiungi">+</button>
        </div>
      </div>
      <div class="menu-items-grid">${items.map((item, i) => createCard(item, cat, i)).join('')}</div>
    `;
    container.appendChild(section);
  });
  
  if (filterType && !visible) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Nessun risultato</h2>
        <button class="btn-secondary" onclick="clearFilter()">Rimuovi Filtro</button>
      </div>`;
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Aggiungi Categoria';
    btn.onclick = addCategory;
    btn.style.cssText = 'margin: 2rem auto; display: block;';
    container.appendChild(btn);
  }
}

function createCard(item, cat, idx) {
  const realIdx = menuData[cat].indexOf(item);

  const badges = [];
  if (item.isNew) badges.push(`<span class="badge item-new" title="Novità">Novità</span>`);
  if (item.customizationGroup) badges.push(`<span class="badge item-group" title="Gruppo ${item.customizationGroup}">${item.customizationGroup}</span>`);
  if (item.visible === true) badges.push(`<span class="badge item-shown" title="Elemento visibile">Visibile</span>`);
  if (item.visible === false) badges.push(`<span class="badge item-hidden" title="Elemento nascosto">Nascosto</span>`);

  const badgeRow = badges.length ? `<div class="badges-row">${badges.join('')}</div>` : '';

  return `
    <div class="menu-item-card" onclick="openPopup(${realIdx}, '${cat}')" style="cursor: pointer; position: relative;">
      ${badgeRow}
      
      <div class="item-header">
        <div class="item-info">
          <h3 class="item-name">${item.name}</h3>
          <p class="item-price">€${(item.price || 0).toFixed(2)}</p>
        </div>
      </div>

      <img class="item-image" src="${item.image || 'img/placeholder.png'}" alt="${item.name || ''}" onerror="this.src='img/placeholder.png'">
      <p class="item-description">${item.description || ''}</p>

      <div class="item-allergens">
        ${(item.allergens || []).map(a => `<img class="allergen-ico" src="img/allergens/${a}.png" alt="${allergens[a] || ''}" title="${allergens[a] || ''}">`).join('')}
      </div>
    </div>
  `;
}




// ===== POPUP =====
function openPopup(idx, cat) {
  const isNew = idx === null;
  currentEdit = { item: isNew ? null : menuData[cat][idx], category: cat, index: idx };
  
  document.getElementById('popup-title').textContent = isNew ? `Aggiungi a "${cat}"` : `Modifica "${currentEdit.item.name}"`;
  document.getElementById('delete-item').classList.toggle('hidden', isNew);
  
  // Reset form
  document.getElementById('item-name').value = currentEdit.item?.name || '';
  document.getElementById('item-price').value = currentEdit.item?.price !== undefined ? currentEdit.item.price : '';
  document.getElementById('item-description').value = currentEdit.item?.description || '';
  document.getElementById('item-new').checked = currentEdit.item?.isNew || false;
  document.getElementById('hide-item').checked = currentEdit.item?.visible === false;
  
  document.getElementById('item-customizable').checked = currentEdit.item?.customizable || false;
  document.getElementById('customization-group-id').value = currentEdit.item?.customizationGroup || '';
  updateCustomizationVisibility();
  updateGroupIdButton();
  
  const preview = document.getElementById('product-preview');
  const placeholder = document.getElementById('product-placeholder');
  if (currentEdit.item?.image) {
    preview.src = currentEdit.item.image;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
  
  uploadedImage = null;
  
  // Allergens
  const grid = document.getElementById('allergens-grid');
  grid.innerHTML = Object.entries(allergens).map(([id, name]) => `
    <div class="allergen-item ${currentEdit.item?.allergens?.includes(id) ? 'selected' : ''}" 
         data-allergen-id="${id}" 
         onclick="this.classList.toggle('selected')">
      <img src="img/allergeni/${id}.png" alt="${name}">
      <span>${name}</span>
    </div>
  `).join('');
  
  // Menu types - default sempre selezionato e disabilitato
  const typesContainer = document.getElementById('menu-types-checkboxes');
  typesContainer.innerHTML = menuTypes.length ? menuTypes.map(t => {
    const isDefault = t.id === 'default';
    const isChecked = isDefault || (currentEdit.item?.menuType?.includes(t.id) || false);
    
    return `
      <label class="checkbox-label">
        <input type="checkbox" 
               value="${t.id}" 
               ${isChecked ? 'checked' : ''} 
               ${isDefault ? 'disabled onclick="return false;"' : ''}>
        <span class="checkmark"></span>
        <span class="checkbox-text">${t.name}</span>
      </label>
    `;
  }).join('') : '<p style="opacity: 0.7;">Nessun tipo menu disponibile</p>';
  
  // Show popup
  const scrollY = window.pageYOffset;
  document.body.dataset.scrollY = scrollY;
  document.body.style.top = `-${scrollY}px`;
  document.body.classList.add('popup-open');
  document.getElementById('edit-popup').classList.remove('hidden');
}

function closePopup() {
  document.getElementById('edit-popup').classList.add('hidden');
  
  const scrollY = parseInt(document.body.dataset.scrollY || '0');
  document.body.classList.remove('popup-open');
  document.body.style.top = '';
  delete document.body.dataset.scrollY;
  window.scrollTo(0, scrollY);
  
  currentEdit = { item: null, category: null, index: null };
}

async function saveItem() {
  const name = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  const description = document.getElementById('item-description').value.trim();
  
  if (!name) return notify('Nome obbligatorio', 'error');
  if (isNaN(price) || price < 0) return notify('Prezzo non valido', 'error');
  
  // Check duplicates - escludi l'elemento corrente se in modifica
  const isDupe = Object.entries(menuData).some(([cat, items]) => 
    items.some((item, idx) => {
      // Se è lo stesso elemento che stiamo modificando, ignoralo
      if (cat === currentEdit.category && idx === currentEdit.index) {
        return false;
      }
      // Altrimenti controlla se il nome è duplicato
      return item.name.toLowerCase() === name.toLowerCase();
    })
  );
  if (isDupe) return notify(`"${name}" già esistente`, 'error');
  
  const selectedAllergens = [...document.querySelectorAll('.allergen-item.selected')].map(el => el.dataset.allergenId);
  
  // Raccogli i tipi menu selezionati dagli input non disabilitati + default obbligatorio
  const selectedTypes = [...document.querySelectorAll('#menu-types-checkboxes input:checked:not([disabled])')].map(cb => cb.value);
  
  // Assicura che default sia sempre presente
  if (!selectedTypes.includes('default')) {
    selectedTypes.push('default');
  }
  
  let image = '';
  const preview = document.getElementById('product-preview');
  if (!preview.classList.contains('hidden')) {
    image = uploadedImage || currentEdit.item?.image || '';
  }

  const isCustomizable = document.getElementById('item-customizable').checked;
  const itemData = {
    name,
    price,
    image,
    description,
    allergens: selectedAllergens,
    isNew: document.getElementById('item-new').checked,
    visible: !document.getElementById('hide-item').checked,
    menuType: selectedTypes,
    customizable: isCustomizable,
    customizationGroup: isCustomizable ? (document.getElementById('customization-group-id').value || null) : null
  };
  
  if (currentEdit.index === null) {
    menuData[currentEdit.category].push(itemData);
  } else {
    menuData[currentEdit.category][currentEdit.index] = itemData;
  }
  
  hasChanges = true;
  closePopup();
  render();
  notify('Salvato! Ricorda di salvare il menu');
}

function showConfirm() {
  document.getElementById('delete-popup').classList.remove('hidden');
}

function hideConfirm() {
  document.getElementById('delete-popup').classList.add('hidden');
}

function deleteItem() {
  if (!currentEdit.item) return;
  
  menuData[currentEdit.category].splice(currentEdit.index, 1);
  
  if (!menuData[currentEdit.category].length) {
    if (confirm(`"${currentEdit.category}" è vuota. Rimuoverla?`)) {
      delete menuData[currentEdit.category];
      categories = categories.filter(c => c !== currentEdit.category);
    }
  }
  
  hasChanges = true;
  hideConfirm();
  closePopup();
  render();
  notify('Eliminato! Ricorda di salvare');
}

// ===== IMAGE =====
async function processImage(file) {
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    const res = await fetch('/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileData: base64,
        restaurantId,
        oldImageUrl: currentEdit.item?.image
      })
    });
    
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    
    uploadedImage = result.imageUrl || `img/${result.fileName}`;
    
    const preview = document.getElementById('product-preview');
    preview.src = base64;
    preview.classList.remove('hidden');
    document.getElementById('product-placeholder').classList.add('hidden');
    
  } catch (err) {
    console.error(err);
    notify('Errore caricamento immagine', 'error');
  }
}

// ===== CATEGORIES =====
function addCategory() {
  const name = prompt('Nome categoria:');
  if (!name?.trim()) return;
  
  if (categories.includes(name.trim())) return notify('Categoria esistente', 'error');
  
  categories.push(name.trim());
  menuData[name.trim()] = [];
  hasChanges = true;
  render();
  notify('Categoria aggiunta!');
}

function renameCategory(oldName) {
  const newName = prompt('Nuovo nome:', oldName);
  if (!newName?.trim() || newName === oldName) return;
  
  if (categories.includes(newName)) return notify('Nome già esistente', 'error');
  
  menuData[newName] = menuData[oldName];
  delete menuData[oldName];
  categories[categories.indexOf(oldName)] = newName;
  hasChanges = true;
  render();
  notify('Categoria rinominata!');
}

function deleteCategory(name) {
  if (!confirm(`Eliminare "${name}" e tutti gli elementi?`)) return;
  
  delete menuData[name];
  categories = categories.filter(c => c !== name);
  hasChanges = true;
  render();
  notify('Categoria eliminata!');
}

// ===== MENU TYPES =====
function openAddMenuTypePopup() {
  document.getElementById('new-menu-type-name').value = '';
  document.getElementById('new-menu-type-coperto').value = '0.00';
  document.getElementById('new-method-table').checked = true;
  document.getElementById('new-method-pickup').checked = true;
  document.getElementById('new-method-show').checked = true;
  document.getElementById('new-menu-type-visibility').checked = true;
  document.getElementById('add-menu-type-popup').classList.remove('hidden');
}

function closeAddMenuTypePopup() {
  document.getElementById('add-menu-type-popup').classList.add('hidden');
}

function autoGenerateId() {
  const name = document.getElementById('new-menu-type-name').value.trim();
  const id = name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  document.getElementById('new-menu-type-id').value = id;
}

async function createNewMenuType() {
  const name = document.getElementById('new-menu-type-name').value.trim();
  const coperto = parseFloat(document.getElementById('new-menu-type-coperto').value) || 0;
  
  if (!name) return notify('Nome obbligatorio', 'error');
  
  // Genera ID automaticamente
  const id = name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  
  if (!id) return notify('Nome non valido', 'error');
  if (menuTypes.some(t => t.id === id)) return notify('Un menu con questo nome esiste già', 'error');
  
  menuTypes.push({
    id,
    name,
    coperto: parseFloat(coperto.toFixed(2)),
    methods: {
      table: document.getElementById('new-method-table').checked,
      pickup: document.getElementById('new-method-pickup').checked,
      show: document.getElementById('new-method-show').checked
    },
    visible: document.getElementById('new-menu-type-visibility').checked
  });
  
  await saveSettings();
  closeAddMenuTypePopup();
  render();
  notify('Tipo menu aggiunto!');
}

async function deleteMenuType(idx) {
  const type = menuTypes[idx];
  const inUse = Object.values(menuData).flat().some(item => item.menuType?.includes(type.id));
  
  if (inUse && !confirm(`"${type.name}" è in uso. Eliminare comunque?`)) return;
  
  menuTypes.splice(idx, 1);
  await saveSettings();
  render();
  notify('Tipo menu eliminato');
}

// ===== SAVE =====
async function saveMenu() {
  try {
    const menuJson = {
      categories: categories.map(cat => ({
        name: cat,
        items: (menuData[cat] || []).map(item => ({
          name: item.name,
          price: item.price,
          imagePath: item.image,
          description: item.description,
          allergens: item.allergens,
          featured: item.isNew,
          visible: item.visible,
          menuType: item.menuType?.length ? item.menuType : undefined,
          customizable: item.customizable || false, // AGGIUNGI QUESTA
          customizationGroup: item.customizationGroup || null // AGGIUNGI QUESTA
        }))
      }))
    };
    
    const res = await fetch(`/save-menu/${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuContent: menuJson })
    });
    
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    
    hasChanges = false;
    notify('Menu salvato!');
  } catch (err) {
    console.error(err);
    notify('Errore salvataggio', 'error');
  }
}

async function saveSettings() {
  try {
    const res = await fetch(`/save-settings/${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          menuTypes: menuTypes.map(t => ({
            id: t.id,
            name: t.name,
            copertoPrice: t.coperto,
            checkoutMethods: t.methods,
            visibility: t.visible
          }))
        }
      })
    });
    
    const result = await res.json();
    if (!result.success) throw new Error();
  } catch (err) {
    notify('Errore salvataggio settings', 'error');
  }
}

// ===== UTILS =====
function clearFilter() {
  filterType = '';
  document.getElementById('menu-type-filter').value = '';
  render();
}

let notifyTimeout;
function notify(msg, type = 'success') {
  const el = document.getElementById('save-notification');
  clearTimeout(notifyTimeout);
  el.className = `notification ${type}`;
  el.textContent = msg;
  void el.offsetWidth;
  el.classList.add('show');
  notifyTimeout = setTimeout(() => el.classList.remove('show'), 3000);
}

function closeEditCategoryPopup() {
  document.getElementById('edit-category-popup').classList.add('hidden');
}

function saveCategoryChanges() {
  const newName = document.getElementById('category-name-input').value.trim();
  if (!newName) return notify('Nome obbligatorio', 'error');
  
  if (newName !== editingCategoryName) {
    if (categories.includes(newName)) return notify('Nome esistente', 'error');
    menuData[newName] = menuData[editingCategoryName];
    delete menuData[editingCategoryName];
    categories[categories.indexOf(editingCategoryName)] = newName;
  }
  
  menuData[newName] = editingCategoryItems;
  hasChanges = true;
  closeEditCategoryPopup();
  render();
  notify('Categoria aggiornata!');
}

function openEditCategoryPopup(cat) {
  editingCategoryName = cat;
  editingCategoryItems = [...menuData[cat]];
  document.getElementById('category-name-input').value = cat;
  renderDraggableItems();
  document.getElementById('edit-category-popup').classList.remove('hidden');
}

function renderDraggableItems() {
  const container = document.getElementById('draggable-items-list');
  container.innerHTML = editingCategoryItems.map((item, i) => `
    <div class="draggable-item" data-index="${i}">
      <div class="reorder-buttons">
        <button class="reorder-btn" onclick="moveItemUp(${i})" ${i === 0 ? 'disabled' : ''}>
          <img src="img/arrow-up.png">
        </button>
        <button class="reorder-btn" onclick="moveItemDown(${i})" ${i === editingCategoryItems.length - 1 ? 'disabled' : ''}>
          <img src="img/arrow-down.png">
        </button>
      </div>
      <img src="${item.image || 'img/placeholder.png'}" class="draggable-item-image">
      <div class="draggable-item-info">
        <p class="draggable-item-name">${item.name}</p>
        <p class="draggable-item-price">€${item.price.toFixed(2)}</p>
      </div>
    </div>
  `).join('');
}

function moveItemUp(i) {
  if (i === 0) return;
  [editingCategoryItems[i], editingCategoryItems[i-1]] = [editingCategoryItems[i-1], editingCategoryItems[i]];
  renderDraggableItems();
}

function moveItemDown(i) {
  if (i === editingCategoryItems.length - 1) return;
  [editingCategoryItems[i], editingCategoryItems[i+1]] = [editingCategoryItems[i+1], editingCategoryItems[i]];
  renderDraggableItems();
}

// Expose for HTML
window.addCategory = addCategory;
window.renameCategory = renameCategory;
window.deleteCategory = deleteCategory;
window.openPopup = openPopup;
window.deleteMenuType = deleteMenuType;
window.openAddMenuTypePopup = openAddMenuTypePopup;
window.closeAddMenuTypePopup = closeAddMenuTypePopup;
window.createNewMenuType = createNewMenuType;
window.clearFilter = clearFilter;
window.openEditCategoryPopup = openEditCategoryPopup;
window.moveItemUp = moveItemUp;
window.moveItemDown = moveItemDown;
window.saveCategoryChanges = saveCategoryChanges;
window.openEditMenuTypePopup = openEditMenuTypePopup;
window.closeEditMenuTypePopup = closeEditMenuTypePopup;
window.saveMenuTypeChanges = saveMenuTypeChanges;
window.deleteMenuTypeFromPopup = deleteMenuTypeFromPopup;
window.deleteMenuTypeFromCard = deleteMenuTypeFromCard;
window.autoGenerateId = autoGenerateId;