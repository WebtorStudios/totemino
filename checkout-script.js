// ==================== CONFIGURAZIONE ====================
const CONFIG = {
  elements: {
    list: document.getElementById("checkout-list"),
    total: document.getElementById("checkout-total"),
    backBtn: document.getElementById("back-to-menu"),
    navCategories: document.getElementById("checkout-nav"),
    nextBtn: document.querySelector(".next"),
    stepButtons: document.querySelectorAll(".categories button"),
    pill: document.querySelector(".categories .pill")
  },
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
    suggestedItems: "totemino_suggested_items"
  }
};

// ==================== STATO GLOBALE ====================
const STATE = {
  items: [],
  orderNotes: [],
  menuData: {},
  selectedCategories: new Set(),
  suggestionsShown: false,
  selectedPaymentMethod: null,
  restaurantStatus: null,
  isTrialActive: false,
  checkoutMethods: {
    table: true,
    pickup: true,
    showOrder: true
  },
  customizationData: {} 
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
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
  },
   
  saveToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  clearStorageKeepUser() {
    const theme = localStorage.getItem(CONFIG.storageKeys.theme);
    const userId = localStorage.getItem(CONFIG.storageKeys.userId);
    const cookieConsent = localStorage.getItem('totemino_cookie_consent');
    const lastCoperto = localStorage.getItem('totemino_last_coperto');
    
    localStorage.clear();
    
    if (userId) localStorage.setItem(CONFIG.storageKeys.userId, userId);
    if (theme) localStorage.setItem(CONFIG.storageKeys.theme, theme);
    if (cookieConsent) localStorage.setItem('totemino_cookie_consent', cookieConsent);
    if (lastCoperto) localStorage.setItem('totemino_last_coperto', lastCoperto);
  },

  getImagePath(item) {
    return `IDs/${item.restaurantId || CONFIG.restaurantId}/${item.img}`;
  },

  handleImageError(img) {
    img.onerror = () => { img.src = 'img/placeholder.png'; };
  },

  getCustomizationLabel(customizations) {
    const labels = [];
    for (const [key, qty] of Object.entries(customizations)) {
      if (qty > 0) {
        // Trova il nome dell'opzione nel customizationData
        for (const groupId in STATE.customizationData) {
          const group = STATE.customizationData[groupId];
          for (const section of group) {
            const opt = section.options.find(o => o.id === key);
            if (opt) {
              labels.push(qty > 1 ? `${opt.name} x${qty}` : opt.name);
            }
          }
        }
      }
    }
    return labels.length > 0 ? ` (${labels.join(', ')})` : '';
  },

  calculateItemPrice(itemName, customizations = {}) {
    // Trova l'item base
    let baseItem = null;
    for (const category in STATE.menuData) {
      const found = STATE.menuData[category].find(i => i.name === itemName);
      if (found) {
        baseItem = found;
        break;
      }
    }
    
    if (!baseItem) return 0;
    
    let price = baseItem.price;
    
    // Aggiungi i modificatori
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
  }
};

// ==================== GESTIONE DATI ====================
const DataManager = {
  // ✅ Carica lo status del ristorante
  async loadRestaurantStatus() {
    try {
      const response = await fetch('/api/restaurant-status/' + CONFIG.restaurantId);
      if (response.ok) {
        const data = await response.json();
        STATE.restaurantStatus = data.status;
        STATE.isTrialActive = data.isTrialActive || false;
        
      
        if (!this.canShowSuggestions()) {
          const wrapper = document.querySelector('.suggestions-wrapper');
          if (wrapper) {
            wrapper.style.cssText = 'opacity: 0';
          }
        }
        return true;
      }
    } catch (error) {
      console.error('❌ Errore caricamento status:', error);
    }
    STATE.restaurantStatus = 'free';
    STATE.isTrialActive = false;
  
    const wrapper = document.querySelector('.suggestions-wrapper');
    if (wrapper) {
      wrapper.style.cssText = 'opacity: 0 !important; pointer-events: none; display: none !important;';
    }
    return false;
  },

  // ✅ Verifica se i suggerimenti sono disponibili
  canShowSuggestions() {
    return STATE.restaurantStatus === 'pro' || STATE.isTrialActive;
  },

  loadSelectedItems() {
    const saved = Utils.loadFromStorage(CONFIG.storageKeys.selected);
    STATE.orderNotes = Utils.loadFromStorage(CONFIG.storageKeys.notes);
    
    const selectedMap = new Map();
    
    if (saved.length > 0 && saved.length % 3 === 0) {
      // Nuovo formato: [name, customizations_json, qty, ...]
      for (let i = 0; i < saved.length; i += 3) {
        const name = saved[i];
        const customizations = JSON.parse(saved[i + 1] || '{}');
        const qty = Math.max(parseInt(saved[i + 2]) || 1, 1);
        selectedMap.set(name, { qty, customizations });
      }
    } else {
      // Vecchio formato: [name, qty, ...]
      for (let i = 0; i < saved.length; i += 2) {
        const name = saved[i];
        const qty = Math.max(parseInt(saved[i + 1]) || 1, 1);
        selectedMap.set(name, { qty, customizations: {} });
      }
    }
    
    return selectedMap;
  },

  async fetchMenu() {
    // 1️⃣ CARICAMENTI PARALLELI INIZIALI (possono essere fatti insieme)
    await Promise.all([
      this.loadRestaurantStatus(),
      this.loadCheckoutMethods()
    ]);
  
    // 2️⃣ CARICAMENTI PARALLELI DEI FILE JSON
    const [menuJson, customizationData] = await Promise.all([
      fetch(`IDs/${CONFIG.restaurantId}/menu.json`).then(r => r.json()),
      fetch(`IDs/${CONFIG.restaurantId}/customization.json`)
        .then(r => r.json())
        .catch(e => {
          console.warn("customization.json non trovato:", e);
          return {};
        })
    ]);
  
    STATE.customizationData = customizationData;
  
    // 3️⃣ PREPARAZIONE DATI LOCALI
    const selectedMap = this.loadSelectedItems();
    const suggestedItems = Utils.loadFromStorage(CONFIG.storageKeys.suggestedItems, []);
  
    // 4️⃣ PROCESSAMENTO MENU E RICOSTRUZIONE ORDINE
    menuJson.categories.forEach(category => {
      STATE.menuData[category.name] = [];
  
      category.items.forEach(item => {
        if (!item.visible) return;
  
        const itemData = {
          name: item.name,
          price: item.price,
          img: item.imagePath,
          ingredients: item.description.split(",").map(s => s.trim()).filter(Boolean),
          customizable: item.customizable || false,
          customizationGroup: item.customizationGroup || null
        };
  
        STATE.menuData[category.name].push(itemData);
  
        /// Controlla se questo item è nel carrello
        for (const [key, data] of selectedMap) {
          if (key === item.name) {
            const effectivePrice = Utils.calculateItemPrice(item.name, data.customizations);
            
            STATE.items.push({
              ...itemData,
              price: effectivePrice,
              originalPrice: item.price,
              restaurantId: CONFIG.restaurantId,
              quantity: data.qty,
              category: category.name,
              isSuggested: suggestedItems.includes(item.name),
              customizations: data.customizations
            });
            STATE.selectedCategories.add(category.name);
          }
        }
      });
    });
  
    // 5️⃣ GESTIONE COPERTO
    await CopertoManager.loadCopertoPrice();
    CopertoManager.addCopertoIfNeeded();
  
    // 6️⃣ RENDERING UI
    UI.renderItems();
    UI.updateTotal();
    this.applyCheckoutMethods(); // ✅ Applica subito i metodi checkout
  
    // 7️⃣ INIZIALIZZAZIONE SUGGERIMENTI (opzionale, quindi alla fine)
    if (this.canShowSuggestions() && typeof initializeSuggestions !== 'undefined') {
      initializeSuggestions(menuJson, CONFIG.restaurantId).catch(console.error);
    }
  },
  
  async loadCheckoutMethods() {
    try {
      const response = await fetch(`IDs/${CONFIG.restaurantId}/settings.json`);
      if (response.ok) {
        const settings = await response.json();
        if (settings.checkoutMethods) {
          STATE.checkoutMethods = settings.checkoutMethods;
          
          this.applyCheckoutMethods();
        }
      }
    } catch (error) {
      
    }
  },

  applyCheckoutMethods() {
    const tableMethod = document.getElementById('service-table');
    const pickupMethod = document.getElementById('service-pickup');
    const showMethod = document.getElementById('service-show');
    
    if (tableMethod) {
      tableMethod.style.display = STATE.checkoutMethods.table ? '' : 'none';
    }
    
    if (pickupMethod) {
      pickupMethod.style.display = STATE.checkoutMethods.pickup ? '' : 'none';
    }
    
    if (showMethod) {
      showMethod.style.display = STATE.checkoutMethods.show ? '' : 'none';
    }
  },

  saveSelected() {
    const arr = [];
    
    STATE.items.forEach(item => {
      // ✅ CORRETTO: solo name, customizations, quantity
      arr.push(
        item.name,
        JSON.stringify(item.customizations || {}),
        item.quantity.toString()
      );
    });
    
    Utils.saveToStorage(CONFIG.storageKeys.selected, arr);
    Utils.saveToStorage(CONFIG.storageKeys.notes, STATE.orderNotes);
    
    const suggestedItems = STATE.items
      .filter(item => item.isSuggested)
      .map(item => item.name);
    Utils.saveToStorage(CONFIG.storageKeys.suggestedItems, suggestedItems);
    
    UI.updateTotal();
  },

  async getNextOrderNumber() {
    try {
      const response = await fetch(`/IDs/${CONFIG.restaurantId}/orders/pickup/`);
      if (!response.ok) return 100;

      const files = await response.json();
      if (!Array.isArray(files) || files.length === 0) return 100;

      const numbers = files
        .map(o => {
          const match = o._filename?.match(/Pickup\s+(\d+)/i);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(n => n !== null);

      return numbers.length > 0 ? Math.max(...numbers) + 1 : 100;
    } catch (error) {
      console.error("Errore lettura numero ordine:", error);
      return 100;
    }
  },

  async saveOrderToServer(endpoint, orderDetails) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(orderDetails)
      });

      if (response.ok) {
        return { success: true, ...(await response.json()) };
      }
      throw new Error(`Errore HTTP ${response.status}`);
    } catch (error) {
      console.error('Errore salvataggio ordine:', error);
      return { success: false, message: error.message };
    }
  },

  async updateUserPreferences(userId, items) {
    try {
      const response = await fetch('/api/update-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, items })
      });
      return response.ok;
    } catch (error) {
      console.error('Errore aggiornamento preferenze:', error);
      return false;
    }
  }
};

// ==================== UI ====================
const UI = {
  renderItems() {
    CONFIG.elements.list.innerHTML = "";
    
    STATE.items.forEach((item, index) => {
      const row = this.createItemRow(item, index);
      CONFIG.elements.list.appendChild(row);
    });

    document.querySelector(".checkout-wrapper").style.display = STATE.items.length === 0 ? "none" : "";
  },

  createItemRow(item, index) {
    const row = document.createElement("div");
    row.className = "checkout-item";
    
    if (item.isCoperto) {
      row.classList.add('coperto-item');
    }
  
    const img = document.createElement("img");
    img.src = Utils.getImagePath(item);
    img.alt = item.name;
    Utils.handleImageError(img);
  
    const info = document.createElement("div");
    info.className = "checkout-info";
    
    // ✅ Mostra customizzazioni se presenti
    const customLabel = item.customizations ? Utils.getCustomizationLabel(item.customizations) : '';
    const displayName = `${item.name}${customLabel}`;
    
    info.innerHTML = `
      <h3>${displayName}${item.quantity > 1 ? ` (x${item.quantity})` : ''}</h3>
      <p>€${(item.price * item.quantity).toFixed(2)}</p>
    `;
  
    if (!item.isCoperto) {
      const infoBtn = document.createElement("div");
      infoBtn.className = "info-btn";
      infoBtn.innerHTML = '<img src="img/edit.png" alt="Edit">';
      infoBtn.onclick = (e) => {
        e.stopPropagation();
        Popup.openItemPopup(item, index);
      };
      row.append(img, info, infoBtn);
    } else {
      row.append(img, info);
    }
  
    return row;
  },

  updateTotal() {
    const total = STATE.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const count = STATE.items.reduce((sum, i) => sum + i.quantity, 0);

    CONFIG.elements.total.textContent = `€${total.toFixed(2)}`;
    localStorage.setItem(CONFIG.storageKeys.total, total.toFixed(2));
    localStorage.setItem(CONFIG.storageKeys.count, count.toString());

    const isEmpty = STATE.items.length === 0;
    CONFIG.elements.navCategories.style.pointerEvents = isEmpty ? "none" : "auto";
    CONFIG.elements.navCategories.style.opacity = isEmpty ? "0.5" : "1";

    if (CONFIG.elements.nextBtn) {
      CONFIG.elements.nextBtn.disabled = isEmpty;
      CONFIG.elements.nextBtn.classList.toggle("locked", isEmpty);
    }
  },

  updatePillPosition(button) {
    button.offsetHeight;
    CONFIG.elements.pill.style.width = `${button.offsetWidth}px`;
    CONFIG.elements.pill.style.transform = `translateX(${button.offsetLeft}px)`;
  }
};

// ==================== POPUP ====================
const Popup = {
  openItemPopup(item, index) {
    const popup = document.querySelector(".popup");
    const img = popup.querySelector(".popup-img");
    img.src = Utils.getImagePath(item);
    Utils.handleImageError(img);

    popup.querySelector(".popup-title").textContent = item.name;
    popup.querySelector(".popup-ingredients").textContent = item.ingredients.join(", ");
    
    const notesBox = popup.querySelector(".popup-notes");
    notesBox.value = STATE.orderNotes[index] || "";

    this.setupQuantityControls(popup, item, index);
    this.showPopup(popup, () => {
      STATE.orderNotes[index] = notesBox.value;
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
      item.quantity = qty;
      STATE.items[index].quantity = qty;
      
      // ✅ Ricalcola il prezzo se ci sono customizzazioni
      if (item.customizations && Object.keys(item.customizations).length > 0) {
        item.price = Utils.calculateItemPrice(item.name, item.customizations);
        STATE.items[index].price = item.price;
      }
      
      DataManager.saveSelected();
      UI.renderItems();
      UI.updateTotal();
    };
  
    controls.querySelector(".popup-minus").onclick = () => {
      if (qty > 1) {
        updateQty(qty - 1);
      } else {
        STATE.items.splice(index, 1);
        STATE.orderNotes.splice(index, 1);
        DataManager.saveSelected();
        this.hidePopup(popup);
        window.location.reload();
      }
    };
  
    controls.querySelector(".popup-plus").onclick = () => updateQty(qty + 1);
  },

  showPopup(popup, onClose) {
    popup.classList.remove("hidden");
    document.body.classList.add("noscroll");

    const closeHandler = () => {
      if (onClose) onClose();
      this.hidePopup(popup);
    };

    const closeBtn = popup.querySelector(".close-popup");
    closeBtn.onclick = closeHandler;
    popup.onclick = (e) => { if (e.target === popup) closeHandler(); };
    
    const sendBtn = popup.querySelector(".popup-send-btn");
    if (sendBtn) sendBtn.onclick = closeHandler;
  },

  hidePopup(popup) {
    popup.classList.add("hidden");
    document.body.classList.remove("noscroll");
  },

  // ✅ MODIFICATO: Mostra popup solo se status = pro o trial attivo
  async showSuggestionsPopup() {
    if (STATE.suggestionsShown) return;

    // ✅ CONTROLLA SE I SUGGERIMENTI SONO DISPONIBILI
    if (!DataManager.canShowSuggestions()) {
      
      this.skipSuggestions();
      return;
    }

    const popup = document.querySelector(".popup-suggestions");
    const grid = popup.querySelector(".suggestions-grid");
    const selectedSuggestions = new Set();

    try {
      const suggestions = await suggestionsEngine.generateSuggestions();
      
      const uniqueSuggestions = [...new Map(suggestions.map(s => [s.name, s])).values()].slice(0, 4);
      
      if (uniqueSuggestions.length === 0) {
        this.skipSuggestions();
        return;
      }

      popup.classList.remove("hidden");
      document.body.classList.add("noscroll");
      grid.innerHTML = "";

      uniqueSuggestions.forEach(suggestion => {
        const card = this.createSuggestionCard(suggestion, selectedSuggestions);
        grid.appendChild(card);
      });

      this.setupSuggestionsButton(popup, selectedSuggestions);
    } catch (error) {
      console.error("Errore caricamento suggerimenti:", error);
      this.skipSuggestions();
    }
  },

  createSuggestionCard(suggestion, selectedSet) {
    const card = document.createElement("div");
    card.className = "suggestion-card";

    const img = document.createElement("img");
    img.src = `IDs/${CONFIG.restaurantId}/${suggestion.img}`;
    img.alt = suggestion.name;
    Utils.handleImageError(img);

    card.innerHTML = `
      <h4>${suggestion.name}</h4>
      <p>€${suggestion.price.toFixed(2)}</p>
    `;
    card.prepend(img);

    card.onclick = () => {
      card.classList.toggle("selected");
      selectedSet.has(suggestion.name) 
        ? selectedSet.delete(suggestion.name) 
        : selectedSet.add(suggestion.name);

      const btn = document.getElementById("suggestions-action-btn");
      btn.textContent = selectedSet.size > 0 ? "Avanti" : "No grazie";
      btn.classList.toggle("locked", selectedSet.size === 0);
    };

    return card;
  },

  setupSuggestionsButton(popup, selectedSuggestions) {
    const oldBtn = document.getElementById("suggestions-action-btn");
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);
  
    newBtn.style.opacity = "0";
  
    let buttonTimeout = setTimeout(() => {
      newBtn.style.opacity = "1";
    }, 2500);
  
    // Funzione per mostrare il bottone immediatamente
    const showButtonNow = () => {
      clearTimeout(buttonTimeout);
      newBtn.style.opacity = "1";
    };
  
    // Ascolta i click sulle card per mostrare il bottone
    const cards = popup.querySelectorAll('.suggestion-card');
    cards.forEach(card => {
      const originalOnClick = card.onclick;
      card.onclick = function(e) {
        originalOnClick.call(this, e);
        showButtonNow(); // Mostra il bottone quando si clicca una card
      };
    });
  
    newBtn.onclick = () => {
      if (selectedSuggestions.size > 0) {
        selectedSuggestions.forEach(itemName => {
          for (const category in STATE.menuData) {
            const menuItem = STATE.menuData[category].find(i => i.name === itemName);
            if (menuItem) {
              const existingItem = STATE.items.find(i => i.name === itemName);
              
              if (existingItem) {
                existingItem.quantity += 1;
                existingItem.isSuggested = true;
              } else {
                STATE.items.push({
                  ...menuItem,
                  restaurantId: CONFIG.restaurantId,
                  quantity: 1,
                  category: category,
                  isSuggested: true
                });
                STATE.orderNotes.push("");
              }
              break;
            }
          }
        });
  
        DataManager.saveSelected();
        localStorage.setItem(CONFIG.storageKeys.showRiepilogo, "true");
        window.location.reload();
      } else {
        this.hidePopup(popup);
        this.skipSuggestions();
      }
    };
  },

  skipSuggestions() {
    STATE.suggestionsShown = true;
    Navigation.switchToStep(1);
  }
};

// ==================== GESTIONE COPERTO ====================
const CopertoManager = {
  COPERTO_KEY: 'totemino_last_coperto',
  COOLDOWN_HOURS: 4,
  copertoPrice: 0,

  async loadCopertoPrice() {
    try {
      const response = await fetch(`IDs/${CONFIG.restaurantId}/settings.json`);
      if (response.ok) {
        const settings = await response.json();
        this.copertoPrice = parseFloat(settings.copertoPrice) || 0;
        
      } else {
        this.copertoPrice = 0;
        
      }
    } catch (error) {
      
      this.copertoPrice = 0;
    }
  },

  canAddCoperto() {
    if (this.copertoPrice <= 0) return false;
    
    const lastCoperto = localStorage.getItem(this.COPERTO_KEY);
    if (!lastCoperto) return true;
    
    const lastTime = parseInt(lastCoperto, 10);
    const now = Date.now();
    const hoursPassed = (now - lastTime) / (1000 * 60 * 60);
    
    return hoursPassed >= this.COOLDOWN_HOURS;
  },

  addCopertoIfNeeded() {
    const hasCoperto = STATE.items.some(item => item.isCoperto);
    if (hasCoperto) {
      
      return;
    }

    if (!this.canAddCoperto()) {
      
      return;
    }

    const copertoItem = {
      name: 'Coperto',
      price: this.copertoPrice,
      img: '../../img/coperto.png',
      ingredients: ['Servizio al tavolo'],
      restaurantId: CONFIG.restaurantId,
      quantity: 1,
      category: 'Servizi',
      isSuggested: false,
      isCoperto: true
    };

    STATE.items.push(copertoItem);
    STATE.orderNotes.push('');
    
    
  },

  markCopertoAdded() {
    localStorage.setItem(this.COPERTO_KEY, Date.now().toString());
  }
};

// ==================== NAVIGAZIONE ====================
const Navigation = {
  init() {
    CONFIG.elements.stepButtons.forEach((btn, index) => {
      btn.onclick = () => this.switchToStep(index);
    });

    CONFIG.elements.backBtn.onclick = () => {
      if (!CONFIG.restaurantId) {
        window.location.href = "menu.html";
        return;
      }
      
      // ✅ Costruisci URL mantenendo tutti i parametri
      const params = new URLSearchParams(window.location.search);
      const menuUrl = new URL('menu.html', window.location.origin);
      
      menuUrl.searchParams.set('id', CONFIG.restaurantId);
      
      // ✅ Mantieni il parametro type se presente
      const menuType = params.get('type');
      if (menuType) {
        menuUrl.searchParams.set('type', menuType);
      }
      
      window.location.href = menuUrl.toString();
    };

    CONFIG.elements.nextBtn?.addEventListener("click", () => {
      if (DataManager.canShowSuggestions()) {
        Popup.showSuggestionsPopup();
      } else {
        Navigation.switchToStep(1);
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
      if (activeBtn) {
        setTimeout(() => UI.updatePillPosition(activeBtn), 0);
      }
    });
  },

  switchToStep(index) {
    // ✅ CONTROLLA SE MOSTRARE SUGGERIMENTI
    if (index === 1 && STATE.items.length > 0 && !STATE.suggestionsShown && DataManager.canShowSuggestions()) {
      Popup.showSuggestionsPopup();
      return;
    }

    CONFIG.elements.stepButtons.forEach(b => b.classList.remove("active"));
    const activeBtn = CONFIG.elements.stepButtons[index];
    activeBtn.classList.add("active");
    UI.updatePillPosition(activeBtn);

    document.getElementById("section-ordine").style.display = index === 0 ? "" : "none";
    document.getElementById("section-pagamento").style.display = index === 1 ? "" : "none";
    
    // ✅ Riapplica visibilità metodi quando si passa alla pagina pagamento
    if (index === 1) {
      DataManager.applyCheckoutMethods();
    }
  }
};

// ==================== PAGAMENTO ====================
const Payment = {
  init() {
    const paymentCards = document.querySelectorAll(".payment-card");
    const confirmBtn = document.getElementById("confirm-payment");

    paymentCards.forEach(card => {
      card.onclick = () => this.selectPayment(card.id, paymentCards, confirmBtn);
      card.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectPayment(card.id, paymentCards, confirmBtn);
        }
      };
    });

    confirmBtn?.addEventListener("click", () => this.processPayment());
  },

  selectPayment(id, cards, btn) {
    STATE.selectedPaymentMethod = id;
    cards.forEach(card => {
      const isSelected = card.id === id;
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-pressed", isSelected);
    });
    if (btn) btn.disabled = false;
  },

  async processPayment() {
    if (!STATE.selectedPaymentMethod) return;

    if (STATE.selectedPaymentMethod === "pay-stripe") {
      const totalCents = Math.round(STATE.items.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100);

      try {
        const response = await fetch('/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: totalCents })
        });

        const data = await response.json();
        if (data.url) window.location.href = data.url;
        else alert('Errore creazione sessione pagamento');
      } catch (error) {
        alert('Errore di rete');
        console.error(error);
      }
    } else if (STATE.selectedPaymentMethod === "pay-paypal") {
      alert('PayPal non ancora implementato');
    }
  }
};

// ==================== ORDINI ====================
const Orders = {
  init() {
    document.getElementById("service-table")?.addEventListener("click", () => this.handleTable());
    document.getElementById("service-pickup")?.addEventListener("click", () => this.handlePickup());
    document.getElementById("service-show")?.addEventListener("click", () => this.handleShow());
  },

  async handleTable() {
    const popup = document.querySelector(".popup-table-number");
    const input = document.getElementById("table-number-input");
    const confirmBtn = document.getElementById("confirm-table-number");

    popup.classList.remove("hidden");

    const closeHandler = () => popup.classList.add("hidden");
    popup.querySelector(".close-popup-table").onclick = closeHandler;
    popup.onclick = (e) => { if (e.target === popup) closeHandler(); };

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);

    newConfirmBtn.onclick = async () => {
      const tableNumber = input.value.trim();
      if (!tableNumber) {
        input.style.boxShadow = '0 0 0 3px rgba(255, 0, 0, 0.8)';
        input.classList.add('shake');
        setTimeout(() => {
          input.style.boxShadow = '';
          input.classList.remove('shake');
        }, 1000);
        return;
      }

      await this.submitOrder('table', { tableNumber });
    };
  },

  async handlePickup() {
    const orderNumber = await DataManager.getNextOrderNumber();
    await this.submitOrder('pickup', { orderNumber });
  },
  
  handleShow() {
    window.location.href = `your-order.html?id=${CONFIG.restaurantId}`;
  },
  
  async submitOrder(type, extra = {}) {
    const userId = Utils.getUserId();
    
    const hasCoperto = STATE.items.some(item => item.isCoperto);
    if (hasCoperto) {
      CopertoManager.markCopertoAdded();
    }

    const orderDetails = {
      userId,
      ...extra,
      items: STATE.items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        ingredients: item.ingredients,
        isSuggested: item.isSuggested || false,
        isCoperto: item.isCoperto || false,
        customizations: item.customizations || {}
      })),
      orderNotes: STATE.orderNotes,
      total: STATE.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      suggestion_stats: Utils.loadFromStorage(CONFIG.storageKeys.suggestionStats, {})
    };

    const response = await DataManager.saveOrderToServer(
      `/IDs/${CONFIG.restaurantId}/orders/${type}/`,
      orderDetails
    );

    if (response.success) {
      await DataManager.updateUserPreferences(userId, orderDetails.items);
      Utils.clearStorageKeepUser();
      sessionStorage.setItem("lastOrder", JSON.stringify({
        type,
        ...(type === 'table' ? { tableNumber: extra.tableNumber } : { orderNumber: response.orderNumber || extra.orderNumber }),
        total: orderDetails.total.toFixed(2)
      }));
      
      const params = new URLSearchParams(window.location.search);
      const successUrl = new URL('success.html', window.location.origin);
      
      successUrl.searchParams.set('id', CONFIG.restaurantId);
      
      const menuType = params.get('type');
      if (menuType) {
        successUrl.searchParams.set('type', menuType);
      }
      
      window.location.href = successUrl.toString();
    } else {
      console.error("Errore salvataggio ordine:", response.message);
      window.location.href = "error.html";
    }
  }
};

// ==================== INIZIALIZZAZIONE ====================
DataManager.fetchMenu();
Navigation.init();
Payment.init();
Orders.init();


