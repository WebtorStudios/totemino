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
  }
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
  }
};

// ==================== GESTIONE DATI ====================
const DataManager = {
  async fetchMenu() {
    await this.loadRestaurantStatus();

    const res = await fetch(`IDs/${CONFIG.restaurantId}/menu.json`);
    const menuJson = await res.json();
    const selectedMap = this.loadSelectedItems();
    
    const suggestedItems = Utils.loadFromStorage(CONFIG.storageKeys.suggestedItems, []);

    menuJson.categories.forEach(category => {
      STATE.menuData[category.name] = [];

      category.items.forEach(item => {
        if (!item.visible) return;

        const itemData = {
          name: item.name,
          price: item.price,
          img: item.imagePath,
          ingredients: item.description.split(",").map(s => s.trim()).filter(Boolean)
        };

        STATE.menuData[category.name].push(itemData);

        if (selectedMap.has(item.name)) {
          STATE.items.push({
            ...itemData,
            restaurantId: CONFIG.restaurantId,
            quantity: selectedMap.get(item.name),
            category: category.name,
            isSuggested: suggestedItems.includes(item.name)
          });
          STATE.selectedCategories.add(category.name);
        }
      });
    });

    await CopertoManager.loadCopertoPrice();
    await this.loadCheckoutMethods(); // ✅ NUOVO
    CopertoManager.addCopertoIfNeeded();

    UI.renderItems();
    UI.updateTotal();

    if (this.canShowSuggestions() && typeof initializeSuggestions !== 'undefined') {
      initializeSuggestions(STATE.menuData, CONFIG.restaurantId).catch(console.error);
    }
  },
  
   async loadCheckoutMethods() {
     try {
      const response = await fetch(`IDs/${CONFIG.restaurantId}/settings.json`);
      if (response.ok) {
        const settings = await response.json();
        if (settings.checkoutMethods) {
          STATE.checkoutMethods = settings.checkoutMethods;
          console.log('✅ Metodi checkout caricati:', STATE.checkoutMethods);
          this.applyCheckoutMethods();
        }
      }
    } catch (error) {
      console.log('ℹ️ Errore caricamento metodi checkout, uso default');
    }
  },

  applyCheckoutMethods() {
    const tableMethod = document.getElementById('service-table');
    const pickupMethod = document.getElementById('service-pickup');
    
    if (tableMethod) {
      tableMethod.style.display = STATE.checkoutMethods.table ? '' : 'none';
    }
    
    if (pickupMethod) {
      pickupMethod.style.display = STATE.checkoutMethods.pickup ? '' : 'none';
    }
    
    // Se è abilitato "Mostra Ordine", aggiungi il pulsante
    if (STATE.checkoutMethods.showOrder) {
      this.addShowOrderButton();
    }
  },
  addShowOrderButton() {
    const serviceMethods = document.querySelector('.service-methods');
    if (!serviceMethods || document.getElementById('service-show-order')) return;
    
    const showOrderBtn = document.createElement('div');
    showOrderBtn.className = 'service-option';
    showOrderBtn.id = 'service-show-order';
    showOrderBtn.tabIndex = 0;
    showOrderBtn.role = 'button';
    showOrderBtn.setAttribute('aria-pressed', 'false');
    
    showOrderBtn.innerHTML = `
      <img class="theme-img" data-light="img/logo_light.png" data-dark="img/logo_dark.png" alt="Mostra Ordine">
      <h3>Mostra Ordine</h3>
    `;
    
    serviceMethods.appendChild(showOrderBtn);
    
    // Aggiungi event listener
    showOrderBtn.addEventListener('click', () => {
      window.location.href = `your-order.html?id=${CONFIG.restaurantId}`;
    });
  },
  
  // ✅ NUOVO: Verifica se i suggerimenti sono disponibili
  canShowSuggestions() {
    return STATE.restaurantStatus === 'pro' || STATE.isTrialActive;
  },

  loadSelectedItems() {
    const saved = Utils.loadFromStorage(CONFIG.storageKeys.selected);
    STATE.orderNotes = Utils.loadFromStorage(CONFIG.storageKeys.notes);
    
    const selectedMap = new Map();
    for (let i = 0; i < saved.length; i += 2) {
      selectedMap.set(saved[i], Math.max(parseInt(saved[i + 1]) || 1, 1));
    }
    return selectedMap;
  },

  async fetchMenu() {
    // ✅ CARICA STATUS PRIMA DI TUTTO
    await this.loadRestaurantStatus();

    const res = await fetch(`IDs/${CONFIG.restaurantId}/menu.json`);
    const menuJson = await res.json();
    const selectedMap = this.loadSelectedItems();
    
    const suggestedItems = Utils.loadFromStorage(CONFIG.storageKeys.suggestedItems, []);

    menuJson.categories.forEach(category => {
      STATE.menuData[category.name] = [];

      category.items.forEach(item => {
        if (!item.visible) return;

        const itemData = {
          name: item.name,
          price: item.price,
          img: item.imagePath,
          ingredients: item.description.split(",").map(s => s.trim()).filter(Boolean)
        };

        STATE.menuData[category.name].push(itemData);

        if (selectedMap.has(item.name)) {
          STATE.items.push({
            ...itemData,
            restaurantId: CONFIG.restaurantId,
            quantity: selectedMap.get(item.name),
            category: category.name,
            isSuggested: suggestedItems.includes(item.name)
          });
          STATE.selectedCategories.add(category.name);
        }
      });
    });

    await CopertoManager.loadCopertoPrice();
    CopertoManager.addCopertoIfNeeded();

    UI.renderItems();
    UI.updateTotal();

    // ✅ INIZIALIZZA SUGGERIMENTI SOLO SE DISPONIBILI
    if (this.canShowSuggestions() && typeof initializeSuggestions !== 'undefined') {
      initializeSuggestions(STATE.menuData, CONFIG.restaurantId).catch(console.error);
    }
  },

  saveSelected() {
    const arr = STATE.items.flatMap(item => [item.name, item.quantity.toString()]);
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
    info.innerHTML = `
      <h3>${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}</h3>
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
      console.log('⚠️ Suggerimenti non disponibili per questo account');
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

    setTimeout(() => {
      newBtn.style.opacity = "1";
    }, 3000);

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
        console.log('✅ Coperto caricato:', this.copertoPrice);
      } else {
        this.copertoPrice = 0;
        console.log('ℹ️ Nessun coperto impostato');
      }
    } catch (error) {
      console.log('ℹ️ Errore caricamento coperto, disabilitato');
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
      console.log('✔ Coperto già presente nell\'ordine');
      return;
    }

    if (!this.canAddCoperto()) {
      console.log('⏳ Coperto non disponibile (prezzo: €' + this.copertoPrice + ', cooldown attivo)');
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
    
    console.log('✔ Coperto aggiunto automaticamente (€' + this.copertoPrice + ')');
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
      window.location.href = CONFIG.restaurantId 
        ? `menu.html?id=${CONFIG.restaurantId}` 
        : "menu.html";
    };

    CONFIG.elements.nextBtn?.addEventListener("click", () => {
      // ✅ MOSTRA SUGGERIMENTI SOLO SE DISPONIBILI
      if (DataManager.canShowSuggestions()) {
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
      if (activeBtn) {
        setTimeout(() => UI.updatePillPosition(activeBtn), 0);
      }
    });
  },

  switchToStep(index) {
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
    
    // ✅ NUOVO - Riapplica visibilità metodi quando si passa alla pagina pagamento
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
        isCoperto: item.isCoperto || false
      })),
      orderNotes: STATE.orderNotes,
      total: STATE.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      totemino_selected: Utils.loadFromStorage(CONFIG.storageKeys.selected),
      totemino_notes: Utils.loadFromStorage(CONFIG.storageKeys.notes),
      totemino_total: localStorage.getItem(CONFIG.storageKeys.total) || "0",
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
      window.location.href = `success.html?id=${CONFIG.restaurantId}`;
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

