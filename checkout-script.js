// ==================== CONFIGURAZIONE ====================
const CONFIG = {
  restaurantId: new URLSearchParams(window.location.search).get("id") || "",
  storageKeys: {
    userId: "totemino_user_id",
    selected: "totemino_selected",
    notes: "totemino_notes",
    total: "totemino_total",
    count: "totemino_count",
    theme: "totemino_theme",
    showRiepilogo: "totemino_show_riepilogo",
    suggestionStats: "totemino_suggestion_stats",
    suggestedItems: "totemino_suggested_items",
    lastCoperto: "totemino_last_coperto"
  }
};

async function initializeViewMode() {
  const params = new URLSearchParams(window.location.search);
  const restaurantId = params.get("id");
  let requestedType = params.get("type");

  if (!restaurantId) return;

  try {
    const settingsRes = await fetch(`IDs/${restaurantId}/menuTypes.json`);
    if (!settingsRes.ok) return;

    const settings = await settingsRes.json();
    const allTypes = settings.menuTypes?.map(t => t.id) || [];

    // Se il type non esiste o non è valido → redirect a default
    if (!requestedType || !allTypes.includes(requestedType)) {
      params.set("type", "default");
      window.location.search = params.toString();
      return; // fermo l'esecuzione
    }

    // type è valido → prendo la configurazione
    const typeConfig = settings.menuTypes?.find(t => t.id === requestedType);

    if (typeConfig) {
      const checkoutMethods = typeConfig.checkoutMethods || {};
      const hasAnyCheckout =
        checkoutMethods.table ||
        checkoutMethods.delivery ||
        checkoutMethods.takeaway ||
        checkoutMethods.show;

      if (!hasAnyCheckout) {
        window.isViewOnlyMode = true;
        document.documentElement.classList.add("view-only");
      }
    }
  } catch (e) {
    console.warn("Errore caricamento settings:", e);
  }
}

initializeViewMode();


// ==================== STATO GLOBALE ====================
const STATE = {
  items: [],
  orderNotes: [],
  menuData: {},
  categoryOrder: [],
  selectedCategories: new Set(),
  suggestionsShown: false,
  planType: 'free',
  isTrialActive: false,
  customizationData: {},
  currentMenuType: null,
  settings: null,
  copertoPrice: 0
};

// ==================== UTILITY ====================
const Utils = {
  getUserId() {
    let userId = localStorage.getItem(CONFIG.storageKeys.userId);
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(CONFIG.storageKeys.userId, userId);
    }
    return userId;
  },

  loadFromStorage(key, defaultValue = []) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
    } catch {
      return defaultValue;
    }
  },
   
  saveToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  clearStorageKeepUser() {
    const keep = ['userId', 'theme'].map(k => CONFIG.storageKeys[k]);
    const preserved = keep.reduce((acc, key) => {
      const val = localStorage.getItem(key);
      if (val) acc[key] = val;
      return acc;
    }, {});
    
    localStorage.clear();
    Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
  },

  handleImageError(img) {
    img.onerror = () => img.src = 'img/placeholder.png';
  },

  getCustomizationLabel(customizations) {
    if (!customizations || Object.keys(customizations).length === 0) return '';
    const labels = [];
    for (const [key, qty] of Object.entries(customizations)) {
      if (qty <= 0) continue;
      
      let found = false;
      for (const groupId in STATE.customizationData) {
        if (found) break;
        const group = STATE.customizationData[groupId];
        for (const section of group) {
          const opt = section.options.find(o => o.id === key);
          if (opt) {
            const shouldShowSection = !/^(seleziona|scegli)/i.test(section.name);
            const optionName = qty > 1 ? `${opt.name} x${qty}` : opt.name;
            labels.push(shouldShowSection ? `${section.name} ${optionName}` : optionName);
            found = true;
            break;
          }
        }
      }
    }
    return labels.length > 0 ? ` (${labels.join(', ')})` : '';
  },

  calculateItemPrice(itemName, customizations = {}) {
    let baseItem = null;
    for (const category in STATE.menuData) {
      baseItem = STATE.menuData[category].find(i => i.name === itemName);
      if (baseItem) break;
    }
    
    if (!baseItem) return 0;
    
    let price = baseItem.price;
    
    if (baseItem.customizable && baseItem.customizationGroup) {
      const group = STATE.customizationData[baseItem.customizationGroup];
      if (group) {
        group.forEach(section => {
          section.options.forEach(opt => {
            if (customizations[opt.id]) {
              price += opt.priceModifier * customizations[opt.id];
            }
          });
        });
      }
    }
    
    return price;
  },

  // Gestione scroll unificata per popup
  lockScroll() {
    const scrollY = window.scrollY;
    document.body.style.cssText = `position: fixed; top: -${scrollY}px; width: 100%`;
    document.body.classList.add("noscroll");
    return scrollY;
  },

  unlockScroll(scrollY = 0) {
    document.body.style.cssText = '';
    document.body.classList.remove("noscroll");
    window.scrollTo(0, scrollY);
  }
};

// ==================== GESTIONE DATI ====================
// ==================== GESTIONE DATI ====================
const DataManager = {
  async loadRestaurantStatus() {
    try {
      const response = await fetch('/api/restaurant-status/' + CONFIG.restaurantId);
      if (response.ok) {
        const data = await response.json();
        STATE.planType = data.planType;
        STATE.isTrialActive = data.isTrialActive || false;
        return true;
      }
    } catch (error) {
      console.error('Errore caricamento planType:', error);
    }
    
    STATE.planType = 'free';
    STATE.isTrialActive = false;
    const wrapper = document.querySelector('.suggestions-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    return false;
  },

  canShowSuggestions() {
    return STATE.planType === 'pro' || STATE.isTrialActive;
  },

  loadSelectedItems() {
    const saved = Utils.loadFromStorage(CONFIG.storageKeys.selected);
    STATE.orderNotes = Utils.loadFromStorage(CONFIG.storageKeys.notes);
    
    const selectedMap = new Map();
    const isNewFormat = saved.length > 0 && saved.length % 3 === 0;
    const step = isNewFormat ? 3 : 2;
    
    for (let i = 0; i < saved.length; i += step) {
      const name = saved[i];
      const customizations = isNewFormat ? JSON.parse(saved[i + 1] || '{}') : {};
      const qty = Math.max(parseInt(saved[i + (isNewFormat ? 2 : 1)]) || 1, 1);
      
      const key = isNewFormat && Object.keys(customizations).length > 0
        ? `${name}|{${Object.keys(customizations).sort().map(k => `${k}:${customizations[k]}`).join(',')}}`
        : name;
      
      selectedMap.set(key, { qty, customizations });
    }
    
    return selectedMap;
  },

  async fetchMenu() {
    await this.loadRestaurantStatus();
  
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get('type');
  
    const [menuJson, customizationData, settings] = await Promise.all([
      fetch(`IDs/${CONFIG.restaurantId}/menu.json`).then(r => r.json()),
      fetch(`IDs/${CONFIG.restaurantId}/customizations.json`).then(r => r.json()).catch(() => ({})),
      fetch(`IDs/${CONFIG.restaurantId}/menuTypes.json`).then(r => r.json()).catch(() => ({ menuTypes: [] }))
    ]);
  
    STATE.customizationData = customizationData;
    STATE.settings = settings;
  
    const availableMenuTypes = settings.menuTypes || [];
    let menuTypeFilter = null;
  
    if (!requestedType || requestedType === 'default' || requestedType === 'view' || requestedType === 'readonly') {
      menuTypeFilter = 'default';
    } else {
      const typeConfig = availableMenuTypes.find(t => t.id === requestedType);
      if (typeConfig) {
        menuTypeFilter = requestedType;
      } else {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('type', 'default');
        window.location.replace(newUrl.toString());
        return;
      }
    }
  
    STATE.currentMenuType = menuTypeFilter;

    const selectedMap = this.loadSelectedItems();
    const suggestedItems = Utils.loadFromStorage(CONFIG.storageKeys.suggestedItems, []);
    STATE.categoryOrder = menuJson.categories.map(cat => cat.name);

    menuJson.categories.forEach(category => {
      STATE.menuData[category.name] = category.items
        .filter(item => item.visible)
        .map(item => ({
          name: item.name,
          price: item.price,
          img: item.imagePath,
          ingredients: item.description.split(",").map(s => s.trim()).filter(Boolean),
          customizable: item.customizable || false,
          customizationGroup: item.customizationGroup || null
        }));
    });

    for (const [key, data] of selectedMap) {
      const keyName = key.includes('|') ? key.split('|')[0] : key;
      
      // Trova l'item nel menuData
      let foundItem = null;
      let foundCategory = null;
      
      for (const [categoryName, categoryItems] of Object.entries(STATE.menuData)) {
        foundItem = categoryItems.find(i => i.name === keyName);
        if (foundItem) {
          foundCategory = categoryName;
          break;
        }
      }
      
      if (foundItem) {
        const effectivePrice = Utils.calculateItemPrice(keyName, data.customizations);
        
        STATE.items.push({
          ...foundItem,
          price: effectivePrice,
          originalPrice: foundItem.price,
          restaurantId: CONFIG.restaurantId,
          quantity: data.qty,
          category: foundCategory,
          isSuggested: suggestedItems.includes(keyName),
          customizations: data.customizations,
          uniqueKey: key
        });
        STATE.selectedCategories.add(foundCategory);
      }
    }

    await this.loadCopertoPrice();
    this.addCopertoIfNeeded();
    UI.renderItems();
    UI.updateTotal();

    if (this.canShowSuggestions() && typeof initializeSuggestions !== 'undefined') {
      initializeSuggestions(menuJson, CONFIG.restaurantId).catch(console.error);
    }
  },

  async loadCopertoPrice() {
    try {
      if (!STATE.settings) return;
      
      const menuType = STATE.settings.menuTypes?.find(mt => mt.id === STATE.currentMenuType);
      STATE.copertoPrice = menuType ? parseFloat(menuType.copertoPrice) || 0 : 0;
    } catch (error) {
      console.error('Errore caricamento coperto:', error);
      STATE.copertoPrice = 0;
    }
  },

  canAddCoperto() {
    if (STATE.copertoPrice <= 0) return false;
    
    const lastCoperto = localStorage.getItem(CONFIG.storageKeys.lastCoperto);
    if (!lastCoperto) return true;
    
    const hoursPassed = (Date.now() - parseInt(lastCoperto, 10)) / (1000 * 60 * 60);
    return hoursPassed >= 4;
  },

  addCopertoIfNeeded() {
    if (STATE.items.some(item => item.isCoperto) || !this.canAddCoperto()) return;

    STATE.items.push({
      name: 'Coperto',
      price: STATE.copertoPrice,
      img: '../../img/coperto.png',
      ingredients: ['Servizio al tavolo'],
      restaurantId: CONFIG.restaurantId,
      quantity: 1,
      category: 'Servizi',
      isCoperto: true
    });
    STATE.orderNotes.push('');
  },
  
  removeCoperto() {
    const copertoIndex = STATE.items.findIndex(item => item.isCoperto);
    if (copertoIndex !== -1) {
      STATE.items.splice(copertoIndex, 1);
      STATE.orderNotes.splice(copertoIndex, 1);
    }
  },

  saveSelected() {
    const arr = [];
    const notesArr = [];
    
    STATE.items
      .filter(item => !item.isCoperto)
      .forEach((item, index) => {
        arr.push(
          item.name, 
          JSON.stringify(item.customizations || {}), 
          item.quantity.toString()
        );
        // ✅ Salva la nota corrispondente all'item
        notesArr.push(STATE.orderNotes[index] || "");
      });
    
    Utils.saveToStorage(CONFIG.storageKeys.selected, arr);
    Utils.saveToStorage(CONFIG.storageKeys.notes, notesArr);
    Utils.saveToStorage(CONFIG.storageKeys.suggestedItems, 
      STATE.items.filter(item => item.isSuggested).map(item => item.name)
    );
    
    UI.updateTotal();
  }
};

// ==================== UI ====================
const UI = {
  elements: {
    list: document.getElementById("checkout-list"),
    total: document.getElementById("checkout-total"),
    backBtn: document.getElementById("back-to-menu"),
    navCategories: document.getElementById("checkout-nav"),
    nextBtn: document.querySelector(".next"),
    stepButtons: document.querySelectorAll(".categories button"),
    pill: document.querySelector(".categories .pill")
  },

  renderItems() {
    this.elements.list.innerHTML = STATE.items.map((item, index) => {
      const customLabel = Utils.getCustomizationLabel(item.customizations);
      const displayName = `${item.name}${customLabel}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`;
      const editBtn = item.isCoperto ? '' : `<div class="info-btn" onclick="Popup.openItemPopup(${index})"><img src="img/edit.png" alt="Edit"></div>`;
      
      return `
        <div class="checkout-item ${item.isCoperto ? 'coperto-item' : ''}">
          <img src="${item.img}" alt="${item.name}" onerror="this.src='img/placeholder.png'">
          <div class="checkout-info">
            <h3>${displayName}</h3>
            <p>€${(item.price * item.quantity).toFixed(2)}</p>
          </div>
          ${editBtn}
        </div>
      `;
    }).join('');

    document.querySelector(".checkout-wrapper").style.display = STATE.items.length === 0 ? "none" : "";
  },

  updateTotal() {
    const total = STATE.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const count = STATE.items.reduce((sum, i) => sum + (i.isCoperto ? 0 : i.quantity), 0);

    this.elements.total.textContent = `€${total.toFixed(2)}`;
    localStorage.setItem(CONFIG.storageKeys.total, total.toFixed(2));
    localStorage.setItem(CONFIG.storageKeys.count, count.toString());

    const isEmpty = STATE.items.length === 0;
    this.elements.navCategories.style.cssText = `pointer-events: ${isEmpty ? 'none' : 'auto'}; opacity: ${isEmpty ? '0.5' : '1'}`;

    if (this.elements.nextBtn) {
      this.elements.nextBtn.disabled = isEmpty;
      this.elements.nextBtn.classList.toggle("locked", isEmpty);
    }
  },

  updatePillPosition(button) {
    this.elements.pill.style.cssText = `width: ${button.offsetWidth}px; transform: translateX(${button.offsetLeft}px)`;
  }
};

// ==================== POPUP ====================
const Popup = {
  currentScrollY: 0,

  openItemPopup(index) {
    const item = STATE.items[index];
    const popup = document.querySelector(".popup");
    
    popup.querySelector(".popup-img").src = item.img;
    popup.querySelector(".popup-title").textContent = item.name;
    popup.querySelector(".popup-ingredients").textContent = item.ingredients.join(", ");
    popup.querySelector(".popup-notes").value = STATE.orderNotes[index] || "";

    this.setupQuantityControls(popup, item, index);
    this.show(popup, () => {
      STATE.orderNotes[index] = popup.querySelector(".popup-notes").value;
      Utils.saveToStorage(CONFIG.storageKeys.notes, STATE.orderNotes);
    });
  },

  setupQuantityControls(popup, item, index) {
    const controls = popup.querySelector(".popup-controls");
    let qty = item.quantity;
  
    controls.innerHTML = `
      <button class="popup-minus">−</button>
      <span class="popup-qty">${qty}</span>
      <button class="popup-plus">+</button>
    `;
  
    const updateQty = (newQty) => {
      qty = newQty;
      controls.querySelector(".popup-qty").textContent = qty;
      STATE.items[index].quantity = qty;
      
      if (item.customizations && Object.keys(item.customizations).length > 0) {
        STATE.items[index].price = Utils.calculateItemPrice(item.name, item.customizations);
      }
      
      DataManager.saveSelected();
      UI.renderItems();
    };
  
    controls.querySelector(".popup-minus").onclick = () => {
      if (qty > 1) {
        updateQty(qty - 1);
      } else {
        // Rimuovi item E la sua nota corrispondente
        STATE.items.splice(index, 1);
        STATE.orderNotes.splice(index, 1);
        DataManager.saveSelected();
        this.hide(popup);
        UI.renderItems();
        
        if (DataManager.canShowSuggestions() && typeof suggestionsEngine !== 'undefined') {
          suggestionsEngine.renderSuggestions(CONFIG.restaurantId).catch(console.error);
        }
      }
    };
  
    controls.querySelector(".popup-plus").onclick = () => {
      if (item.customizable) {
        this.hide(popup);
        CustomizationScreen.open(item, index);
      } else {
        updateQty(qty + 1);
      }
    };
  },

  show(popup, onClose) {
    this.currentScrollY = Utils.lockScroll();
    popup.classList.remove("hidden");

    const closeHandler = () => {
      if (onClose) onClose();
      this.hide(popup);
    };

    popup.querySelector(".close-popup").onclick = closeHandler;
    popup.onclick = (e) => { if (e.target === popup) closeHandler(); };
    
    const sendBtn = popup.querySelector(".popup-send-btn");
    if (sendBtn) sendBtn.onclick = closeHandler;
  },

  hide(popup) {
    popup.classList.add("hidden");
    Utils.unlockScroll(this.currentScrollY);
  },

  async showSuggestionsPopup() {
    if (STATE.suggestionsShown || !DataManager.canShowSuggestions()) {
      STATE.suggestionsShown = true;
      Navigation.switchToStep(1);
      return;
    }

    const popup = document.querySelector(".popup-suggestions");
    const grid = popup.querySelector(".suggestions-grid");
    const selectedSuggestions = new Set();

    try {
      const suggestions = await suggestionsEngine.generateSuggestionsForCheckout();
      const uniqueSuggestions = [...new Map(suggestions.map(s => [s.name, s])).values()].slice(0, 4);
      
      if (uniqueSuggestions.length === 0) {
        STATE.suggestionsShown = true;
        Navigation.switchToStep(1);
        return;
      }

      Utils.lockScroll();
      popup.classList.remove("hidden");
      grid.innerHTML = uniqueSuggestions.map(s => `
        <div class="suggestion-card" data-name="${s.name}">
          <img src="${s.img}" alt="${s.name}" onerror="this.src='img/placeholder.png'">
          <h4>${s.name}</h4>
          <p>€${s.price.toFixed(2)}</p>
        </div>
      `).join('');

      grid.querySelectorAll('.suggestion-card').forEach(card => {
        card.onclick = () => {
          card.classList.toggle("selected");
          const name = card.dataset.name;
          selectedSuggestions.has(name) ? selectedSuggestions.delete(name) : selectedSuggestions.add(name);

          const btn = document.getElementById("suggestions-action-btn");
          btn.textContent = selectedSuggestions.size > 0 ? "Avanti" : "No grazie";
          btn.classList.toggle("locked", selectedSuggestions.size === 0);
          btn.style.opacity = "1";
        };
      });

      this.setupSuggestionsButton(popup, selectedSuggestions);
    } catch (error) {
      console.error("Errore suggerimenti:", error);
      STATE.suggestionsShown = true;
      Navigation.switchToStep(1);
    }
  },

  setupSuggestionsButton(popup, selectedSuggestions) {
    const btn = document.getElementById("suggestions-action-btn");
    btn.style.opacity = "0";
    
    const showBtn = setTimeout(() => btn.style.opacity = "1", 1500);
    
    popup.querySelectorAll('.suggestion-card').forEach(card => {
      const original = card.onclick;
      card.onclick = function(e) {
        clearTimeout(showBtn);
        btn.style.opacity = "1";
        original.call(this, e);
      };
    });

    btn.onclick = () => {
      STATE.suggestionsShown = true;
      
      if (selectedSuggestions.size > 0) {
        const itemsByCategory = new Map();
        
        // 1. Raggruppa items esistenti per categoria CON le loro note
        STATE.items.forEach((item, index) => {
          if (item.isCoperto) return;
          
          const category = item.category;
          if (!itemsByCategory.has(category)) {
            itemsByCategory.set(category, []);
          }
          itemsByCategory.get(category).push({
            item: item,
            note: STATE.orderNotes[index] || ""
          });
        });
        
        // 2. Aggiungi i nuovi suggerimenti nella categoria corretta
        STATE.categoryOrder.forEach(category => {
          const categoryItems = STATE.menuData[category];
          if (!categoryItems) return;
          
          categoryItems.forEach(menuItem => {
            if (selectedSuggestions.has(menuItem.name)) {
              // ✅ FIX: Cerca l'item ESATTO (stesso nome E nessuna customizzazione)
              let found = false;
              if (itemsByCategory.has(category)) {
                const existing = itemsByCategory.get(category).find(
                  obj => obj.item.name === menuItem.name && 
                        obj.item.uniqueKey === menuItem.name // ✅ Verifica che sia item base (no customizzazioni)
                );
                
                if (existing) {
                  existing.item.quantity += 1;
                  existing.item.isSuggested = true;
                  found = true;
                }
              }
              
              // Se non esiste, crea nuovo
              if (!found) {
                if (!itemsByCategory.has(category)) {
                  itemsByCategory.set(category, []);
                }
                
                itemsByCategory.get(category).push({
                  item: {
                    ...menuItem,
                    ingredients: menuItem.ingredients || [],
                    restaurantId: CONFIG.restaurantId,
                    quantity: 1,
                    category,
                    isSuggested: true,
                    customizations: {},
                    uniqueKey: menuItem.name
                  },
                  note: ""
                });
              }
            }
          });
        });
        
        // 3. Ricostruisci STATE.items e STATE.orderNotes nell'ordine corretto
        const newItems = [];
        const newNotes = [];
        
        STATE.categoryOrder.forEach(category => {
          if (itemsByCategory.has(category)) {
            itemsByCategory.get(category).forEach(obj => {
              newItems.push(obj.item);
              newNotes.push(obj.note);
            });
          }
        });
        
        // 4. Ri-aggiungi il coperto alla fine
        const copertoItem = STATE.items.find(i => i.isCoperto);
        const copertoIndex = STATE.items.findIndex(i => i.isCoperto);
        if (copertoItem) {
          newItems.push(copertoItem);
          newNotes.push(STATE.orderNotes[copertoIndex] || "");
        }
        
        // 5. Aggiorna STATE
        STATE.items = newItems;
        STATE.orderNotes = newNotes;

        DataManager.saveSelected();
        UI.renderItems();
        
        if (typeof suggestionsEngine !== 'undefined') {
          suggestionsEngine.renderSuggestions(CONFIG.restaurantId).catch(console.error);
        }
      }
      
      Utils.unlockScroll();
      popup.classList.add("hidden");
      Navigation.switchToStep(1);
    };
  }
};

// ==================== CUSTOMIZATION SCREEN ====================
const CustomizationScreen = {
  open(item, itemIndex = null) {
    const screen = document.createElement("div");
    screen.className = "customization-screen";
    screen.innerHTML = `
      <div class="customization-header">
        <h2>Modifica ${item.name}</h2>
        <button class="back-btn"><img src="img/x.png" alt="Chiudi"></button>
      </div>
      <div class="customization-content">
        ${item.img ? `<img src="${item.img}" alt="${item.name}" onerror="this.src='img/placeholder.png'">` : ""}
        ${item.ingredients && item.ingredients.length > 0 ? 
          `<div style="background: var(--btn-secondary); color: var(--text-primary); padding: 1rem; border-radius: 1rem; margin-bottom: 1rem;">
            <div style="font-size: 0.9rem; line-height: 1.5; white-space: pre-line; opacity: 0.9;">${item.ingredients.join(", ").replace(/\\n/g, "\n").trim()}</div>
          </div>` 
        : ""}
        <div class="customization-sections"></div>
      </div>
      <div class="customization-footer">
        <div class="price-display">
          <span class="base-price">Prezzo base: €${(item.originalPrice || item.price).toFixed(2)}</span>
          <span class="total-price">Totale: €${(item.originalPrice || item.price).toFixed(2)}</span>
        </div>
        <button class="add-to-cart-btn">Conferma</button>
      </div>
    `;
    
    const scrollY = Utils.lockScroll();
    document.body.appendChild(screen);
    
    const customizationState = {};
    const group = STATE.customizationData[item.customizationGroup];
    
    if (group) {
      const sectionsContainer = screen.querySelector(".customization-sections");
      
      group.forEach(section => {
        section.options.forEach(opt => customizationState[opt.id] = 0);
        
        const optionsHTML = section.options.map(opt => {
          const priceLabel = opt.priceModifier !== 0 
            ? ` (${opt.priceModifier > 0 ? '+' : ''}€${opt.priceModifier.toFixed(2)})` 
            : '';
          const inputType = section.maxSelections === 1 ? 'radio-checkbox' : 'square-checkbox';
          
          return `
            <div class="customization-option">
              <label>${opt.name}${priceLabel}</label>
              <div class="option-controls">
                <input type="checkbox" id="opt-${opt.id}" class="${inputType}" data-option="${opt.id}">
              </div>
            </div>
          `;
        }).join('');
        
        sectionsContainer.innerHTML += `
          <div class="customization-section" data-section="${section.name}" data-max="${section.maxSelections || 999}">
            <h3>${section.name}${section.required ? ' *' : ''}</h3>
            ${optionsHTML}
          </div>
        `;
      });
      
      sectionsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          const optId = checkbox.dataset.option;
          const section = checkbox.closest('.customization-section');
          const maxSelections = parseInt(section.dataset.max);
          const isRadio = maxSelections === 1;
          
          if (isRadio && checkbox.checked) {
            section.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              if (cb !== checkbox) {
                cb.checked = false;
                customizationState[cb.dataset.option] = 0;
              }
            });
            customizationState[optId] = 1;
          } else {
            if (checkbox.checked) {
              const currentSelections = Object.values(customizationState).reduce((sum, val) => sum + val, 0);
              if (currentSelections < maxSelections) {
                customizationState[optId] = 1;
              } else {
                checkbox.checked = false;
                alert(`Massimo ${maxSelections} selezioni per questa sezione`);
              }
            } else {
              customizationState[optId] = 0;
            }
          }
          
          this.updatePrice(item, customizationState, screen, group);
        });
      });
    }
    
    screen.querySelector('.back-btn').onclick = () => {
      document.body.removeChild(screen);
      Utils.unlockScroll(scrollY);
    };
    
    screen.querySelector('.add-to-cart-btn').onclick = () => {
      const filteredCustomizations = Object.fromEntries(
        Object.entries(customizationState).filter(([_, v]) => v > 0)
      );
      
      const itemPrice = Utils.calculateItemPrice(item.name, filteredCustomizations);
      const customStr = Object.keys(filteredCustomizations).sort()
        .map(k => `${k}:${filteredCustomizations[k]}`).join(',');
      const uniqueKey = customStr ? `${item.name}|{${customStr}}` : item.name;
      
      const existingIndex = STATE.items.findIndex(i => i.uniqueKey === uniqueKey);
      
      if (existingIndex !== -1) {
        STATE.items[existingIndex].quantity += 1;
      } else {
        const itemsByCategory = new Map();
        
        STATE.items.forEach((existingItem, index) => {
          if (existingItem.isCoperto) return;
          
          const category = existingItem.category;
          if (!itemsByCategory.has(category)) {
            itemsByCategory.set(category, []);
          }
          itemsByCategory.get(category).push({
            item: existingItem,
            note: STATE.orderNotes[index] || ""
          });
        });
        
        const newItem = {
          name: item.name,
          price: itemPrice,
          originalPrice: item.originalPrice || item.price,
          img: item.img,
          ingredients: item.ingredients,
          restaurantId: CONFIG.restaurantId,
          quantity: 1,
          category: item.category,
          customizable: item.customizable,
          customizationGroup: item.customizationGroup,
          customizations: filteredCustomizations,
          uniqueKey
        };
        
        if (!itemsByCategory.has(item.category)) {
          itemsByCategory.set(item.category, []);
        }
        itemsByCategory.get(item.category).push({
          item: newItem,
          note: ""
        });
        
        const newItems = [];
        const newNotes = [];
        
        STATE.categoryOrder.forEach(category => {
          if (itemsByCategory.has(category)) {
            itemsByCategory.get(category).forEach(obj => {
              newItems.push(obj.item);
              newNotes.push(obj.note);
            });
          }
        });
        
        const copertoItem = STATE.items.find(i => i.isCoperto);
        const copertoIndex = STATE.items.findIndex(i => i.isCoperto);
        if (copertoItem) {
          newItems.push(copertoItem);
          newNotes.push(STATE.orderNotes[copertoIndex] || "");
        }
        
        STATE.items = newItems;
        STATE.orderNotes = newNotes;
      }
      
      DataManager.saveSelected();
      UI.renderItems();
      
      if (DataManager.canShowSuggestions() && typeof suggestionsEngine !== 'undefined') {
        suggestionsEngine.renderSuggestions(CONFIG.restaurantId).catch(console.error);
      }
      
      document.body.removeChild(screen);
      Utils.unlockScroll(scrollY);
    };
    
    this.updatePrice(item, customizationState, screen, group);
  },
  
  updatePrice(item, customizationState, screen, group) {
    const totalPrice = Utils.calculateItemPrice(item.name, customizationState);
    screen.querySelector(".total-price").textContent = `Totale: €${totalPrice.toFixed(2)}`;
    
    let allRequiredFilled = true;
    if (group) {
      for (const section of group) {
        if (section.required && !section.options.some(opt => customizationState[opt.id] > 0)) {
          allRequiredFilled = false;
          break;
        }
      }
    }
    
    const btn = screen.querySelector('.add-to-cart-btn');
    btn.disabled = !allRequiredFilled;
    btn.classList.toggle("disabled", !allRequiredFilled);
  }
};

// ==================== NAVIGAZIONE ====================
const Navigation = {
  init() {
    UI.elements.stepButtons.forEach((btn, index) => {
      btn.onclick = () => this.switchToStep(index);
    });

    UI.elements.backBtn.onclick = () => {
      const params = new URLSearchParams(window.location.search);
      const menuUrl = new URL('menu.html', window.location.origin);
      
      if (CONFIG.restaurantId) {
        menuUrl.searchParams.set('id', CONFIG.restaurantId);
        const menuType = params.get('type');
        if (menuType) menuUrl.searchParams.set('type', menuType);
      }
      
      window.location.href = menuUrl.toString();
    };

    UI.elements.nextBtn?.addEventListener("click", () => {
      if (!STATE.suggestionsShown && DataManager.canShowSuggestions()) {
        Popup.showSuggestionsPopup();
      } else {
        this.switchToStep(1);
      }
    });

    if (localStorage.getItem(CONFIG.storageKeys.showRiepilogo) === "true") {
      localStorage.removeItem(CONFIG.storageKeys.showRiepilogo);
      STATE.suggestionsShown = true;
      this.switchToStep(1);
    } else {
      this.switchToStep(0);
    }

    window.addEventListener('load', () => {
      const activeBtn = document.querySelector('.categories button.active');
      if (activeBtn) setTimeout(() => UI.updatePillPosition(activeBtn), 0);
    });
  },

  switchToStep(index) {
    if (index === 1 && STATE.items.length > 0 && !STATE.suggestionsShown && DataManager.canShowSuggestions()) {
      Popup.showSuggestionsPopup();
      return;
    }

    UI.elements.stepButtons.forEach(b => b.classList.remove("active"));
    const activeBtn = UI.elements.stepButtons[index];
    activeBtn.classList.add("active");
    UI.updatePillPosition(activeBtn);

    document.getElementById("section-ordine").style.display = index === 0 ? "" : "none";
    document.getElementById("section-pagamento").style.display = index === 1 ? "" : "none";
  }
};

// ==================== INIZIALIZZAZIONE ====================
DataManager.fetchMenu();
Navigation.init();