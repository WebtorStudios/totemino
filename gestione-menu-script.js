// ===== VARIABILI GLOBALI =====
let menuData = {};
let categories = [];
let restaurantId = null;
let currentEditingItem = null;
let currentEditingCategory = null;
let currentEditingIndex = null;
let isAddingNew = false;
let uploadedImageName = null;
let hasUnsavedChanges = false;
let availableMenuTypes = [];
let currentMenuTypeFilter = '';
let restaurantSettings = {
  copertoPrice: 0,
  checkoutMethods: {
    table: true,
    pickup: true,
    showOrder: true
  }
};

const allergenNames = {
  "1": "Molluschi", "2": "Lupino", "3": "Soia", "4": "Latte", "5": "Uova",
  "6": "Pesce", "7": "Glutine", "8": "Arachidi", "9": "Frutta a guscio",
  "10": "Semi di sesamo", "11": "Sedano", "12": "Senape",
  "13": "Anidride solforosa", "14": "Crostacei"
};

// Carica menu types da settings
async function loadMenuTypes() {
  if (restaurantSettings.menuTypes && Array.isArray(restaurantSettings.menuTypes)) {
    availableMenuTypes = restaurantSettings.menuTypes;
  } else {
    availableMenuTypes = [];
  }
  updateMenuTypeFilterUI();
  renderMenuSections();
}

// Aggiorna UI filtro
function updateMenuTypeFilterUI() {
  const filterSelect = document.getElementById('menu-type-filter');
  if (!filterSelect) return;
  
  filterSelect.innerHTML = '<option value="">Tutti gli elementi</option>';
  availableMenuTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.name;
    if (currentMenuTypeFilter === type.id) {
      option.selected = true;
    }
    filterSelect.appendChild(option);
  });
  filterSelect.onchange = filterMenuByType;
}

// Filtra menu per tipo
function filterMenuByType() {
  const filterSelect = document.getElementById('menu-type-filter');
  if (!filterSelect) return; 
  currentMenuTypeFilter = filterSelect.value;
  renderMenuSections();
}

// Apri popup gestione menu types
function openMenuTypesManager() {
  const popup = document.getElementById('menu-types-popup');
  renderMenuTypesList();
  popup.classList.remove('hidden');
}

// Chiudi popup
function closeMenuTypesPopup() {
  document.getElementById('menu-types-popup').classList.add('hidden');
}

// Renderizza lista menu types
function renderMenuTypesList() {
  const container = document.getElementById('menu-types-list');
  container.innerHTML = '';
  
  if (availableMenuTypes.length === 0) {
    container.innerHTML = '<p class="no-groups-message">Nessun tipo di menu creato</p>';
    return;
  }
  
  availableMenuTypes.forEach((type, index) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-card-header">
        <h3>${type.name}</h3>
        <div class="group-card-actions">
          <button class="group-delete-btn" onclick="deleteMenuType(${index})">
            <img src="img/delete.png" alt="Elimina">
          </button>
        </div>
      </div>
      <p class="group-sections">ID: ${type.id}</p>
    `;
    container.appendChild(card);
  });
}

// Aggiungi nuovo menu type
async function addNewMenuType() {
  const idInput = document.getElementById('new-menu-type-id');
  const nameInput = document.getElementById('new-menu-type-name');
  
  const id = idInput.value.trim().toLowerCase();
  const name = nameInput.value.trim();
  
  if (!id || !name) {
    showNotification('Compila entrambi i campi', 'error');
    return;
  }
  
  // Controlla duplicati
  if (availableMenuTypes.some(t => t.id === id)) {
    showNotification('ID già esistente', 'error');
    return;
  }
  
  availableMenuTypes.push({ id, name });
  restaurantSettings.menuTypes = availableMenuTypes;
  
  await saveMenuTypesToServer();
  
  idInput.value = '';
  nameInput.value = '';
  renderMenuTypesList();
  updateMenuTypeFilterUI();
  showNotification('Tipo menu aggiunto!', 'success');
}

// Elimina menu type
async function deleteMenuType(index) {
  const type = availableMenuTypes[index];
  
  // Controlla se è in uso
  let inUse = false;
  for (const category in menuData) {
    menuData[category].forEach(item => {
      if (item.menuType && item.menuType.includes(type.id)) {
        inUse = true;
      }
    });
  }
  
  if (inUse) {
    const confirm = window.confirm(`"${type.name}" è usato da alcuni elementi. Eliminarlo comunque?`);
    if (!confirm) return;
  }
  
  availableMenuTypes.splice(index, 1);
  restaurantSettings.menuTypes = availableMenuTypes;
  
  await saveMenuTypesToServer();
  
  renderMenuTypesList();
  updateMenuTypeFilterUI();
  showNotification('Tipo menu eliminato', 'success');
}

// Salva sul server
async function saveMenuTypesToServer() {
  try {
    const response = await fetch(`/save-settings/${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: restaurantSettings })
    });
    
    const result = await response.json();
    if (!result.success) throw new Error('Errore salvataggio');
    
  } catch (error) {
    console.error('Errore salvataggio menu types:', error);
    showNotification('Errore nel salvataggio', 'error');
  }
}

async function checkPremiumAccess() {
  try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await response.json();
      
      if (!data.success || !data.user) {
          window.location.href = 'login.html';
          return false;
      }
      
      // ✅ Permetti accesso se: premium, paid, pro, o trial attivo
      const hasAccess = data.user.status === 'premium' || 
                       data.user.status === 'paid' || 
                       data.user.status === 'pro' ||
                       data.user.isTrialActive;
      
      if (!hasAccess) {
          showNotification('La gestione del menu richiede un piano Premium o superiore', 'error');
          setTimeout(() => {
              window.location.href = `gestione.html?id=${restaurantId}`;
          }, 3000);
          return false;
      }
      
      return true;
      
  } catch (error) {
      console.error('Errore verifica accesso:', error);
      window.location.href = 'login.html';
      return false;
  }
}


// ===== INIZIALIZZAZIONE =====
document.addEventListener('DOMContentLoaded', async () => {
  // ✅ Controlla accesso prima di inizializzare
  const hasAccess = await checkPremiumAccess();
  if (!hasAccess) return;
  
  setupEventListeners();
  loadMenu();
});


function setupEventListeners() {  
  // Back to menu
  document.getElementById('back-btn').addEventListener('click', function () {
    window.location.href = `gestione.html?id=${restaurantId}`;
  });
  
  document.getElementById('save-coperto').addEventListener('click', saveCopertoSettings);
  document.getElementById('save-checkout-methods').addEventListener('click', saveCheckoutMethods);
  
  // Popup eventi
  document.getElementById('close-edit-popup').addEventListener('click', handlePopupClose);
  document.getElementById('cancel-edit').addEventListener('click', closeEditPopup);
  document.getElementById('save-item').addEventListener('click', saveAndClosePopup);
  document.getElementById('delete-item').addEventListener('click', () => showDeleteConfirm());
  
  // Popup eliminazione
  document.getElementById('cancel-delete').addEventListener('click', hideDeleteConfirm);
  document.getElementById('confirm-delete').addEventListener('click', deleteItem);
  
  // Upload immagine prodotto con drag & drop
  const imageArea = document.getElementById('product-image-area');
  imageArea.addEventListener('click', () => {
    document.getElementById('product-image').click();
  });
  
  imageArea.addEventListener('dragover', handleDragOver);
  imageArea.addEventListener('dragleave', handleDragLeave);
  imageArea.addEventListener('drop', handleDrop);
  
  document.getElementById('product-image').addEventListener('change', handleProductImageUpload);
  
  // Salva menu
  document.getElementById('save-menu').addEventListener('click', saveMenuToFile);
  
  // Chiudi popup cliccando fuori
  document.getElementById('edit-popup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) handlePopupClose();
  });
  
  document.getElementById('delete-popup').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideDeleteConfirm();
  });

  // Avvisa prima di uscire se ci sono modifiche non salvate
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = 'Hai modifiche non salvate. Vuoi davvero uscire?';
    }
  });
}

// ===== CARICAMENTO MENU =====
async function loadMenu() {
  const params = new URLSearchParams(window.location.search);
  restaurantId = params.get("id") || "default";

  try {
    // Carica il menu
    const response = await fetch(`IDs/${restaurantId}/menu.json`);
    const menuJson = await response.json();
    
    menuData = {};
    categories = [];
    
    menuJson.categories.forEach(category => {
      categories.push(category.name);
      menuData[category.name] = category.items.map(item => {
        // ✅ FIX: Carica menuType correttamente
        const loadedItem = {
          name: item.name,
          price: item.price,
          image: item.imagePath,
          description: item.description,
          allergens: item.allergens,
          isNew: item.featured,
          isSuggested: false,
          visible: item.visible !== false,
          customizable: item.customizable || false,
          customizationGroup: item.customizationGroup || null
        };
        
        // ✅ Aggiungi menuType solo se presente
        if (item.menuType && Array.isArray(item.menuType) && item.menuType.length > 0) {
          loadedItem.menuType = item.menuType;
        }
        
        return loadedItem;
      });
    });
    
    // Carica customizzazioni e settings
    await loadCustomizations();
    await loadRestaurantSettings();
    
    // ✅ Carica menu types PRIMA di renderizzare
    await loadMenuTypes();
    
  } catch (error) {
    console.error("Errore nel caricamento del menu:", error);
    menuData = {};
    categories = [];
    renderMenuSections();
  }
}

function parseMenuData(text) {
  const lines = text.trim().split("\n").filter(line => line.trim() !== "");
  
  menuData = {};
  categories = [];
  let currentCategory = "";

  for (const line of lines) {
    if (line.startsWith("#")) {
      currentCategory = line.substring(1).trim();
      categories.push(currentCategory);
      menuData[currentCategory] = [];
    } else if (currentCategory) {
      const parts = line.split(";");
      if (parts.length >= 5) {
        let rawName = parts[0].trim();
        let isNew = false;
        let isSuggested = false;

        if (rawName.startsWith("*")) {
          isNew = true;
          rawName = rawName.substring(1).trim();
        } else if (rawName.startsWith("!")) {
          isSuggested = true;
          rawName = rawName.substring(1).trim();
        }

        const price = parseFloat(parts[1]);
        const img = parts[2].trim();
        const ingredients = parts[3].trim();
        const allergens = parts[4] ? parts[4].split(",").map(a => a.trim()).filter(Boolean) : [];

        menuData[currentCategory].push({
          name: rawName,
          price: price,
          image: img,
          description: ingredients,
          allergens: allergens,
          isNew: isNew,
          isSuggested: isSuggested
        });
      }
    }
  }
}

// ===== RENDERING =====
function renderMenuSections() {
  const container = document.getElementById('menu-sections');
  container.innerHTML = '';

  if (categories.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <h2>Menu vuoto</h2>
      <p>Inizia aggiungendo una nuova categoria</p>
      <button class="btn-primary" onclick="addNewCategory()">Aggiungi Categoria</button>
    `;
    container.appendChild(emptyState);
    return;
  }

  // ✅ Conta quante sezioni hanno elementi visibili
  let visibleSectionsCount = 0;

  categories.forEach((category, categoryIndex) => {
    const section = createCategorySection(category, categoryIndex);
    
    // ✅ Solo se la sezione ha elementi visibili, aggiungila
    if (section) {
      container.appendChild(section);
      visibleSectionsCount++;
    }
  });

  // ✅ Se il filtro è attivo ma non ci sono risultati, mostra messaggio
  if (currentMenuTypeFilter && visibleSectionsCount === 0) {
    const noResultsState = document.createElement('div');
    noResultsState.className = 'empty-state';
    noResultsState.innerHTML = `
      <h2>Nessun elemento trovato</h2>
      <p>Non ci sono elementi che corrispondono al filtro selezionato.</p>
      <button class="btn-secondary" onclick="clearMenuTypeFilter()">Rimuovi Filtro</button>
    `;
    container.appendChild(noResultsState);
  } else {
    // Aggiungi pulsante per nuova categoria solo se non c'è il messaggio "nessun risultato"
    const addCategoryBtn = document.createElement('button');
    addCategoryBtn.className = 'btn-primary';
    addCategoryBtn.innerHTML = 'Aggiungi nuova categoria';
    addCategoryBtn.title = 'Aggiungi nuova categoria';
    addCategoryBtn.onclick = addNewCategory;
    addCategoryBtn.style.margin = '2rem auto';
    addCategoryBtn.style.display = 'block';
    addCategoryBtn.style.boxShadow = '0px 2px 15px rgba(0, 0, 0, 0.3)';

    container.appendChild(addCategoryBtn);
  }
}

// ===== CREA SEZIONE CATEGORIA (SOSTITUISCI) =====
function createCategorySection(category, categoryIndex) {
  const section = document.createElement('div');
  section.className = 'category-section';
  
  const header = document.createElement('div');
  header.className = 'category-header';
  
  const title = document.createElement('h2');
  title.className = 'category-title';
  title.textContent = category;
  
  const buttonsContainer = document.createElement('div');
  
  const addBtn = document.createElement('button');
  addBtn.className = 'add-item-btn';
  addBtn.innerHTML = '+';
  addBtn.title = 'Aggiungi nuovo elemento';
  addBtn.onclick = () => openEditPopup(null, category);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-category-btn';
  deleteBtn.innerHTML = '<img src="img/delete.png">';
  deleteBtn.title = 'Elimina categoria';
  deleteBtn.onclick = (e) => {
   e.stopPropagation();
   deleteCategoryConfirm(category);
  };
  
  buttonsContainer.appendChild(deleteBtn);
  buttonsContainer.appendChild(addBtn);
  
  header.appendChild(title);
  header.appendChild(buttonsContainer);
  
  const itemsGrid = document.createElement('div');
  itemsGrid.className = 'menu-items-grid';

  const items = menuData[category] || [];
  
  let visibleItemsCount = 0;
  
  items.forEach((item, originalIndex) => {
    if (currentMenuTypeFilter) {
      const hasMenuType = item.menuType && item.menuType.includes(currentMenuTypeFilter);
      if (!hasMenuType) return; // Salta questo item
    }
    
    // ✅ Passa l'indice ORIGINALE, non quello filtrato
    const card = createItemCard(item, category, originalIndex);
    itemsGrid.appendChild(card);
    visibleItemsCount++;
  });

  // ✅ Se non ci sono elementi visibili, ritorna null (la sezione non verrà aggiunta)
  if (visibleItemsCount === 0 && currentMenuTypeFilter) {
    return null;
  }

  section.appendChild(header);
  section.appendChild(itemsGrid);

  return section;
}

function updateMenuTypesCheckboxes(selectedTypes = []) {
  const container = document.getElementById('menu-types-checkboxes');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (availableMenuTypes.length === 0) {
    container.innerHTML = '<p style="opacity: 0.7; font-size: 0.9rem;">Nessun tipo di menu disponibile. Creane uno nella sezione "Tipi di Menu".</p>';
    return;
  }
  
  availableMenuTypes.forEach(type => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = type.id;
    checkbox.checked = selectedTypes.includes(type.id);
    
    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';
    
    const text = document.createElement('span');
    text.className = 'checkbox-text';
    text.textContent = type.name;
    
    label.appendChild(checkbox);
    label.appendChild(checkmark);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function createItemCard(item, category, itemIndex) {
  const card = document.createElement('div');
  card.className = 'menu-item-card';
  card.style.cursor = 'pointer';
  
  card.onclick = () => openEditPopup(item, category, itemIndex);

  const header = document.createElement('div');
  header.className = 'item-header';

  const info = document.createElement('div');
  info.className = 'item-info';

  const name = document.createElement('h3');
  name.className = 'item-name';
  name.textContent = item.name;
  
  if (item.isNew) {
    const badge = document.createElement('span');
    badge.className = 'new-badge';
    badge.textContent = 'Novità';
    name.appendChild(badge);
  }
  
  // ✅ NUOVO: Badge customizzabile
  if (item.customizable && item.customizationGroup) {
    const customBadge = document.createElement('span');
    customBadge.className = 'custom-badge';
    customBadge.textContent = `${item.customizationGroup}`;
    customBadge.style.background = 'var(--accent-pink)';
    customBadge.style.color = 'white';
    customBadge.style.padding = '0.2rem 0.6rem';
    customBadge.style.borderRadius = '1rem';
    customBadge.style.fontSize = '0.7rem';
    customBadge.style.fontWeight = 'bold';
    customBadge.style.marginLeft = '0.5rem';
    name.appendChild(customBadge);
  }

  const price = document.createElement('p');
  price.className = 'item-price';
  price.textContent = `€${item.price.toFixed(2)}`;

  info.appendChild(name);
  info.appendChild(price);

  header.appendChild(info);

  // Immagine
  const img = document.createElement('img');
  img.className = 'item-image';
  img.src = `IDs/${restaurantId}/${item.image}`;
  img.alt = item.name;
  img.onerror = () => {
    img.src = 'img/placeholder.png';
  };
  
  // Se l'elemento è nascosto, mostra l'icona eye
  if (item.visible === false) {
    const eyeIcon = document.createElement('img');
    eyeIcon.src = 'img/eye.png';
    eyeIcon.alt = 'Elemento nascosto';
    eyeIcon.className = 'hidden-icon';
    eyeIcon.style.position = 'absolute';
    eyeIcon.style.top = '1rem';
    eyeIcon.style.right = '1rem';
    eyeIcon.style.width = '48px';
    eyeIcon.style.height = '48px';
    eyeIcon.style.borderRadius = '50%';
    eyeIcon.style.border = '2px solid white';
    card.style.position = 'relative';
    card.appendChild(eyeIcon);
  }

  const description = document.createElement('p');
  description.className = 'item-description';
  description.textContent = item.description;

  const allergensContainer = document.createElement('div');
  allergensContainer.className = 'item-allergens';
  
  if (item.allergens && item.allergens.length > 0) {
    item.allergens.forEach(allergenId => {
      const allergenImg = document.createElement('img');
      allergenImg.className = 'allergen-icon';
      allergenImg.src = `img/allergeni/${allergenId}.png`;
      allergenImg.alt = allergenNames[allergenId] || `Allergene ${allergenId}`;
      allergenImg.title = allergenNames[allergenId] || `Allergene ${allergenId}`;
      allergensContainer.appendChild(allergenImg);
    });
  }

  card.appendChild(header);
  card.appendChild(img);
  card.appendChild(description);
  card.appendChild(allergensContainer);

  return card;
}

// ===== DRAG AND DROP =====
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
      processImageFile(file);
    } else {
      showNotification('Seleziona un file immagine valido', 'error');
    }
  }
}

// ===== POPUP GESTIONE =====
function openEditPopup(item = null, category = null, itemIndex = null) {
  isAddingNew = item === null;
  currentEditingItem = item;
  currentEditingCategory = category;
  currentEditingIndex = itemIndex;
  
  const popup = document.getElementById('edit-popup');
  const title = document.getElementById('popup-title');
  const deleteBtn = document.getElementById('delete-item');
  
  // Reset form
  resetEditForm();
  
  if (isAddingNew) {
    title.textContent = category ? `Aggiungi elemento a "${category}"` : 'Aggiungi nuova categoria';
    deleteBtn.classList.add('hidden');
  } else {
    title.textContent = `Modifica "${item.name}"`;
    deleteBtn.classList.remove('hidden');
    fillEditForm(item);
  }
  
  // Genera griglia allergeni
  generateAllergensGrid();
  
  // Se stiamo modificando, seleziona gli allergeni esistenti
  if (item && item.allergens) {
    setTimeout(() => {
      item.allergens.forEach(allergenId => {
        const allergenItem = document.querySelector(`[data-allergen-id="${allergenId}"]`);
        if (allergenItem) {
          allergenItem.classList.add('selected');
        }
      });
    }, 100);
  }
  
  popup.classList.remove('hidden');
  
  // Salva la posizione e blocca lo scroll
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function closeEditPopup() {
  const popup = document.getElementById('edit-popup');
  popup.classList.add('hidden');
  
  // Ripristina completamente lo scroll
  const scrollY = parseInt(document.body.dataset.scrollY || '0');
  document.body.style.removeProperty('position');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('width');
  document.body.style.removeProperty('overflow');
  delete document.body.dataset.scrollY;
  window.scrollTo(0, scrollY);
  
  currentEditingItem = null;
  currentEditingCategory = null;
  currentEditingIndex = null;
  isAddingNew = false;
}

function handlePopupClose() {
  // Se stiamo aggiungendo un nuovo elemento e tutti i campi sono vuoti, agisci come annulla
  if (isAddingNew && areAllFieldsEmpty()) {
    closeEditPopup();
    return;
  }
  
  // Altrimenti, salva e chiudi
  if (validateAndSaveItem()) {
    closeEditPopup();
  }
}

function areAllFieldsEmpty() {
  const name = document.getElementById('item-name').value.trim();
  const price = document.getElementById('item-price').value.trim();
  const description = document.getElementById('item-description').value.trim();
  const isNew = document.getElementById('item-new').checked;
  const preview = document.getElementById('product-preview');
  const hasImage = !preview.classList.contains('hidden');
  
  const selectedAllergens = document.querySelectorAll('.allergen-item.selected').length;
  
  return !name && !price && !description && !isNew && !hasImage && selectedAllergens === 0;
}

function saveAndClosePopup() {
  if (validateAndSaveItem()) {
    closeEditPopup();
  }
}

function resetEditForm() {
  document.getElementById('item-name').value = '';
  document.getElementById('item-price').value = '';
  document.getElementById('item-description').value = '';
  document.getElementById('item-new').checked = false;
  document.getElementById('hide-item').checked = false;
  
  // ✅ NUOVO: Reset customizzazione
  document.getElementById('item-customizable').checked = false;
  document.getElementById('customization-group-id').value = '';
  updateCustomizationVisibility();

  // Reset immagine
  const preview = document.getElementById('product-preview');
  const placeholder = document.getElementById('product-placeholder');
  preview.classList.add('hidden');
  placeholder.classList.remove('hidden');
  preview.src = '';
  uploadedImageName = null;
  
  // Reset allergeni
  document.querySelectorAll('.allergen-item').forEach(item => {
    item.classList.remove('selected');
  });

  updateMenuTypesCheckboxes([]);
}

function updateCustomizationVisibility() {
  const checkbox = document.getElementById('item-customizable');
  const controls = document.getElementById('customization-controls');
  
  if (checkbox.checked) {
    controls.style.display = 'flex';
  } else {
    controls.style.display = 'none';
  }
}

function fillEditForm(item) {
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-description').value = item.description || '';
  document.getElementById('item-new').checked = item.isNew;
  document.getElementById('hide-item').checked = item.visible === false;
  
  // ✅ NUOVO: Customizzazione
  const customizableCheckbox = document.getElementById('item-customizable');
  const groupInput = document.getElementById('customization-group-id');
  
  customizableCheckbox.checked = item.customizable || false;
  groupInput.value = item.customizationGroup || '';
  
  updateCustomizationVisibility();

  // Carica immagine se presente
  if (item.image) {
    const preview = document.getElementById('product-preview');
    const placeholder = document.getElementById('product-placeholder');
    preview.src = `IDs/${restaurantId}/${item.image}`;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  }

  updateMenuTypesCheckboxes(item.menuType || []);
}

function generateAllergensGrid() {
  const grid = document.getElementById('allergens-grid');
  grid.innerHTML = '';
  
  for (let i = 1; i <= 14; i++) {
    const item = document.createElement('div');
    item.className = 'allergen-item';
    item.dataset.allergenId = i;
    item.onclick = () => toggleAllergen(item);
    
    const img = document.createElement('img');
    img.src = `img/allergeni/${i}.png`;
    img.alt = allergenNames[i];
    
    const label = document.createElement('span');
    label.textContent = allergenNames[i];
    
    item.appendChild(img);
    item.appendChild(label);
    grid.appendChild(item);
  }
}

function toggleAllergen(allergenElement) {
  allergenElement.classList.toggle('selected');
}

function handleProductImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showNotification('Seleziona un file immagine valido', 'error');
    return;
  }
  
  processImageFile(file);
}

async function processImageFile(file) {
  try {
    // Converti il file in base64
    const base64Data = await fileToBase64(file);
    
    // Prepara i dati per l'upload
    const uploadData = {
      fileName: file.name,
      fileData: base64Data,
      restaurantId: restaurantId
    };
    
    // Invia il file al server
    const response = await fetch('/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      uploadedImageName = result.fileName; // Nome finale del file (con eventuale numerazione)
      
      // Mostra preview
      const preview = document.getElementById('product-preview');
      const placeholder = document.getElementById('product-placeholder');
      
      preview.src = base64Data;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
      
    } else {
      throw new Error(result.message || 'Errore durante il caricamento');
    }
  } catch (error) {
    console.error('Errore nel caricamento dell\'immagine:', error);
    showNotification('Errore nel caricamento dell\'immagine', 'error');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== SALVATAGGIO =====
function validateAndSaveItem() {
  const name = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  const description = document.getElementById('item-description').value.trim();
  const isNew = document.getElementById('item-new').checked;
  
  // Validazione nome
  if (!name) {
    showNotification('Il nome del prodotto è obbligatorio', 'error');
    return false;
  }
  
  // Validazione prezzo
  if ((!price || price < 0) && price!=0) {
    showNotification('Inserisci un prezzo valido', 'error');
    return false;
  }
  
  // === CONTROLLO DUPLICATI GLOBALI ===
  if (isAddingNew || (currentEditingItem && currentEditingItem.name !== name)) {
    let isDuplicate = false;
    
    for (const category in menuData) {
      isDuplicate = menuData[category].some((item, index) => {
        if (!isAddingNew && category === currentEditingCategory && index === currentEditingIndex) {
          return false;
        }
        return item.name.toLowerCase() === name.toLowerCase();
      });
      if (isDuplicate) break;
    }
    
    if (isDuplicate) {
      showNotification(`Esiste già un elemento chiamato "${name}" in un'altra categoria`, 'error');
      return false;
    }
  }
  
  // Raccogli allergeni selezionati
  const selectedAllergens = [];
  document.querySelectorAll('.allergen-item.selected').forEach(item => {
    selectedAllergens.push(item.dataset.allergenId);
  });

  // Gestione customizzazione
  const customizable = document.getElementById('item-customizable').checked;
  const customizationGroup = document.getElementById('customization-group-id').value;
  
  if (customizable && !customizationGroup) {
    showNotification('Seleziona un gruppo di customizzazione', 'error');
    return false;
  }

  // Gestione immagine
  let imagePath = '';
  const preview = document.getElementById('product-preview');
  if (!preview.classList.contains('hidden')) {
    if (uploadedImageName) {
      imagePath = `img/${uploadedImageName}`;
    } else if (currentEditingItem && currentEditingItem.image) {
      imagePath = currentEditingItem.image;
    }
  }
  
  const hideCheckbox = document.getElementById('hide-item');
  
  // ✅ FIX: Raccogli menu types selezionati correttamente
  const selectedMenuTypes = [];
  document.querySelectorAll('#menu-types-checkboxes input:checked').forEach(cb => {
    selectedMenuTypes.push(cb.value);
  });

  // ✅ FIX: Crea l'oggetto item correttamente
  const itemData = {
    name: name,
    price: price,
    image: imagePath,
    description: description,
    allergens: selectedAllergens,
    isNew: isNew,
    isSuggested: false,
    visible: !hideCheckbox.checked,
    customizable: customizable,
    customizationGroup: customizable ? customizationGroup : null
  };
  
  // ✅ FIX: Aggiungi menuType solo se ci sono tipi selezionati
  if (selectedMenuTypes.length > 0) {
    itemData.menuType = selectedMenuTypes;
  }
  
  if (isAddingNew) {
    if (!currentEditingCategory) {
      const categoryName = prompt('Nome della nuova categoria:');
      if (!categoryName) return false;
      categories.push(categoryName);
      menuData[categoryName] = [itemData];
    } else {
      if (!menuData[currentEditingCategory]) {
        menuData[currentEditingCategory] = [];
      }
      menuData[currentEditingCategory].push(itemData);
    }
  } else {
    const categoryItems = menuData[currentEditingCategory];
    if (currentEditingIndex !== null && categoryItems[currentEditingIndex]) {
      categoryItems[currentEditingIndex] = itemData;
    }
  }
  
  hasUnsavedChanges = true;
  renderMenuSections();
  showNotification('Elemento salvato! Ricorda di salvare il menu.', 'success');
  return true;
}


function showDeleteConfirm() {
  document.getElementById('delete-popup').classList.remove('hidden');
}

function hideDeleteConfirm() {
  document.getElementById('delete-popup').classList.add('hidden');
}

function deleteItem() {
  if (!currentEditingItem || !currentEditingCategory) return;
  
  const categoryItems = menuData[currentEditingCategory];
  if (currentEditingIndex !== null) {
    categoryItems.splice(currentEditingIndex, 1);
  }
  
  // Se la categoria è vuota, chiedere se rimuoverla
  if (categoryItems.length === 0) {
    const removeCategory = confirm(`La categoria "${currentEditingCategory}" è ora vuota. Vuoi rimuoverla?`);
    if (removeCategory) {
      delete menuData[currentEditingCategory];
      const categoryIndex = categories.indexOf(currentEditingCategory);
      if (categoryIndex !== -1) {
        categories.splice(categoryIndex, 1);
      }
    }
  }
  
  hasUnsavedChanges = true;
  hideDeleteConfirm();
  closeEditPopup();
  renderMenuSections();
  showNotification('Elemento eliminato! Ricorda di salvare il menu.', 'success');
}

function addNewCategory() {
  const categoryName = prompt('Nome della nuova categoria:');
  if (!categoryName || !categoryName.trim()) return;
  
  const trimmedName = categoryName.trim();
  
  if (categories.includes(trimmedName)) {
    showNotification('Categoria già esistente', 'error');
    return;
  }
  
  categories.push(trimmedName);
  menuData[trimmedName] = [];
  hasUnsavedChanges = true;
  renderMenuSections();
  showNotification('Nuova categoria aggiunta! Ricorda di salvare.', 'success');
}

// ===== SALVATAGGIO FILE =====
async function saveMenuToFile() {
  try {
    const menuJson = {
      categories: categories.map(categoryName => ({
        name: categoryName,
        items: (menuData[categoryName] || []).map(item => {
          // ✅ FIX: Salva menuType correttamente
          const jsonItem = {
            name: item.name,
            price: item.price,
            imagePath: item.image,
            description: item.description || '',
            allergens: item.allergens || [],
            featured: item.isNew || false,
            visible: item.visible !== false,
            customizable: item.customizable || false,
            customizationGroup: item.customizationGroup || null
          };
          
          // ✅ Aggiungi menuType solo se presente
          if (item.menuType && item.menuType.length > 0) {
            jsonItem.menuType = item.menuType;
          }
          
          return jsonItem;
        })
      }))
    };
    
    const response = await fetch(`/save-menu/${restaurantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ menuContent: menuJson })
    });
    
    const result = await response.json();
    
    if (result.success) {
      hasUnsavedChanges = false;
      showNotification('Menu salvato con successo!', 'success');
    } else {
      throw new Error(result.message || 'Errore durante il salvataggio');
    }
  } catch (error) {
    console.error('Errore nel salvataggio:', error);
    showNotification('Errore nel salvataggio del menu', 'error');
  }
}

function deleteCategoryConfirm(categoryName) {
  const confirmDelete = confirm(`Sei sicuro di voler eliminare la categoria "${categoryName}" e tutti i suoi elementi?`);
  if (confirmDelete) {
    deleteCategory(categoryName);
  }
}

function deleteCategory(categoryName) {
  // Rimuovi la categoria dal menuData
  delete menuData[categoryName];
  
  // Rimuovi la categoria dall'array categories
  const categoryIndex = categories.indexOf(categoryName);
  if (categoryIndex !== -1) {
    categories.splice(categoryIndex, 1);
  }
  
  hasUnsavedChanges = true;
  renderMenuSections();
  showNotification('Categoria eliminata! Ricorda di salvare il menu.', 'success');
}

// ===== NOTIFICHE =====
let notificationTimeout;

function showNotification(message, type = 'success') {
  const notification = document.getElementById('save-notification');
  
  // Reset timer e classi
  clearTimeout(notificationTimeout);
  notification.className = `notification ${type}`;
  notification.classList.remove('show', 'hidden');
  
  // Imposta testo
  notification.textContent = message;
  
  // Forza reflow per riattivare la transizione CSS
  void notification.offsetWidth;
  
  // Mostra
  notification.classList.add('show');
  
  // Nascondi dopo 3 secondi
  notificationTimeout = setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 300); // tempo per la transizione CSS
  }, 3000);
}

// ===== NUOVE FUNZIONI PER GESTIRE IL COPERTO =====

/**
 * Carica le impostazioni del ristorante (coperto, ecc.)
 */
async function loadRestaurantSettings() {
  try {
    const response = await fetch(`IDs/${restaurantId}/settings.json`);
    if (response.ok) {
      restaurantSettings = await response.json();
      
      
      // Assicura che checkoutMethods esista
      if (!restaurantSettings.checkoutMethods) {
        restaurantSettings.checkoutMethods = {
          table: true,
          pickup: true,
          show: true // ← CAMBIATO da showOrder
        };
      }
    } else {
      restaurantSettings = { 
        copertoPrice: 0,
        checkoutMethods: {
          table: true,
          pickup: true,
          show: true // ← CAMBIATO da showOrder
        }
      };
      
    }
  } catch (error) {
    
    restaurantSettings = { 
      copertoPrice: 0,
      checkoutMethods: {
        table: true,
        pickup: true,
        show: true // ← CAMBIATO da showOrder
      }
    };
  }
  
  updateSettingsUI();
}

function updateSettingsUI() {
  // Aggiorna campo coperto
  const copertoInput = document.getElementById('coperto-price');
  if (copertoInput) {
    copertoInput.value = restaurantSettings.copertoPrice || 0;
  }
  
  // Aggiorna checkbox metodi checkout
  if (restaurantSettings.checkoutMethods) {
    const methodTable = document.getElementById('method-table');
    const methodPickup = document.getElementById('method-pickup');
    const methodShow = document.getElementById('method-show'); 
    
    if (methodTable) {
      methodTable.checked = restaurantSettings.checkoutMethods.table !== false;
    }
    if (methodPickup) {
      methodPickup.checked = restaurantSettings.checkoutMethods.pickup !== false;
    }
    if (methodShow) {
      methodShow.checked = restaurantSettings.checkoutMethods.show !== false; 
    }
  }
}

async function saveCheckoutMethods() {
  const methodTable = document.getElementById('method-table');
  const methodPickup = document.getElementById('method-pickup');
  const methodShow = document.getElementById('method-show'); // ← CAMBIATO da method-show-order
  
  // Verifica che almeno un metodo sia selezionato
  if (!methodTable.checked && !methodPickup.checked && !methodShow.checked) {
    showNotification('Devi selezionare almeno un metodo di checkout', 'error');
    return;
  }
  
  // Aggiorna l'oggetto restaurantSettings
  restaurantSettings.checkoutMethods = {
    table: methodTable.checked,
    pickup: methodPickup.checked,
    show: methodShow.checked // ← USA .show invece di .showOrder
  };
  
  try {
    const response = await fetch(`/save-settings/${restaurantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: restaurantSettings })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('Metodi di checkout salvati con successo!', 'success');
    } else {
      throw new Error(result.message || 'Errore durante il salvataggio');
    }
  } catch (error) {
    console.error('Errore salvataggio metodi checkout:', error);
    showNotification('Errore nel salvataggio dei metodi', 'error');
  }
}

/**
 * Salva le impostazioni del coperto
 */
async function saveCopertoSettings() {
  const copertoInput = document.getElementById('coperto-price');
  const copertoPrice = parseFloat(copertoInput.value) || 0;
  
  if (copertoPrice < 0) {
    showNotification('Il prezzo del coperto non può essere negativo', 'error');
    return;
  }
  
  restaurantSettings.copertoPrice = copertoPrice;
  
  try {
    const response = await fetch(`/save-settings/${restaurantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings: restaurantSettings })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification(
        copertoPrice > 0 
          ? `Coperto impostato a €${copertoPrice.toFixed(2)}` 
          : 'Coperto disabilitato', 
        'success'
      );
    } else {
      throw new Error(result.message || 'Errore durante il salvataggio');
    }
  } catch (error) {
    console.error('Errore salvataggio coperto:', error);
    showNotification('Errore nel salvataggio delle impostazioni', 'error');
  }
}

// ✅ NUOVA FUNZIONE: Resetta il filtro
function clearMenuTypeFilter() {
  currentMenuTypeFilter = '';
  const filterSelect = document.getElementById('menu-type-filter');
  if (filterSelect) {
    filterSelect.value = '';
  }
  renderMenuSections();
}

window.getRestaurantSettings = () => restaurantSettings;

