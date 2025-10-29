document.addEventListener('contextmenu', event => event.preventDefault());

const nav = document.querySelector(".categories");
const itemsContainer = document.querySelector(".items");
const priceDisplay = document.querySelector(".price");
const counterDisplay = document.querySelector(".cart h3");
const nextBtn = document.querySelector(".next");
const cartIcon = document.querySelector(".cart");
const cartPopup = document.querySelector(".cart-popup");
const allergenNames = {
  "1": "Molluschi", "2": "Lupino", "3": "Soia", "4": "Latte", "5": "Uova",
  "6": "Pesce", "7": "Glutine", "8": "Arachidi", "9": "Frutta a guscio",
  "10": "Semi di sesamo", "11": "Sedano", "12": "Senape",
  "13": "Anidride solforosa", "14": "Crostacei"
};

let total = 0;
let count = 0;
let categories = [];
let currentCategoryIndex = 0;
let restaurantId = null;
let lastSwipeDirection = "right";
let allergenPopupTimeout = null;
let selectedItems = new Map();
let quantityPopup = null;
let quantityPopupTimeout = null;
let currentPopupItem = null;
let customizationData = {};

// Carica customization.json
async function loadCustomizations() {
  try {
    const res = await fetch(`IDs/${restaurantId}/customization.json`);
    customizationData = await res.json();
  } catch (e) {
    console.warn("customization.json non trovato o errore:", e);
  }
}

// Genera chiave univoca per item con customizzazioni
function generateItemKey(itemName, customizations = {}) {
  const sortedKeys = Object.keys(customizations).sort();
  const customStr = sortedKeys.map(k => `${k}:${customizations[k]}`).join(',');
  return customStr ? `${itemName}|{${customStr}}` : itemName;
}

// Estrae nome base e customizzazioni da una chiave
function parseItemKey(key) {
  const match = key.match(/^(.+?)\|\{(.+)\}$/);
  if (!match) return { name: key, customizations: {} };
  
  const name = match[1];
  const customStr = match[2];
  const customizations = {};
  
  if (customStr) {
    customStr.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      customizations[k] = parseInt(v) || 0;
    });
  }
  
  return { name, customizations };
}

// Calcola prezzo totale con modificatori
function calculateItemPrice(itemName, customizations = {}) {
  const item = findItemByName(itemName);
  if (!item) return 0;
  
  let price = item.price;
  
  if (item.customizable && item.customizationGroup) {
    const group = customizationData[item.customizationGroup];
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

// Ottieni label per customizzazioni
function getCustomizationLabel(customizations) {
  const labels = [];
  for (const [key, qty] of Object.entries(customizations)) {
    if (qty > 0) {
      // Trova il nome dell'opzione
      for (const groupId in customizationData) {
        const group = customizationData[groupId];
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
}

function updateItemButtonUI(itemName) {
  const buttons = itemsContainer.querySelectorAll("button");
  buttons.forEach(btn => {
    const titleEl = btn.querySelector("h3");
    if (!titleEl) return;

    const baseName = titleEl.getAttribute('data-item-name');
    if (baseName !== itemName) return;

    // Conta TUTTE le varianti di questo item
    let totalQty = 0;
    for (const [key, data] of selectedItems) {
      const parsed = parseItemKey(key);
      if (parsed.name === itemName) {
        totalQty += data.qty;
      }
    }

    if (totalQty > 1) {
      titleEl.textContent = `${itemName} (x${totalQty})`;
    } else {
      titleEl.textContent = itemName;
    }

    if (totalQty > 0) {
      btn.classList.add("selected");
    } else {
      btn.classList.remove("selected");
    }
  });
}

// Carica immagini allergeni
for (let i = 1; i <= 14; i++) {
  const img = new Image();
  img.src = `img/allergeni/${i}.png`;
}

// === PERSISTENZA ===
function saveSelectionToStorage() {
  const arr = [];
  for (const [key, data] of selectedItems) {
    const parsed = parseItemKey(key);
    arr.push(
      parsed.name,                              // Nome base
      JSON.stringify(data.customizations || {}), // Customizations
      data.qty.toString()                        // Quantity
    );
  }
  localStorage.setItem("totemino_selected", JSON.stringify(arr));
  localStorage.setItem("totemino_total", total.toFixed(2));
  localStorage.setItem("totemino_count", count.toString());
}

function loadSelectionFromStorage() {
  const saved = localStorage.getItem("totemino_selected");
  selectedItems = new Map();
  if (saved) {
    const arr = JSON.parse(saved);
    for (let i = 0; i < arr.length; i += 3) {
      const name = arr[i];
      const customizations = JSON.parse(arr[i + 1] || '{}');
      const qty = parseInt(arr[i + 2]);
      
      if (name && qty && qty > 0) {
        const key = generateItemKey(name, customizations);
        selectedItems.set(key, { qty, customizations });
      }
    }
  }
  total = parseFloat(localStorage.getItem("totemino_total")) || 0;
  count = parseInt(localStorage.getItem("totemino_count")) || 0;
}

let isCartPopupAnimating = false;

function toggleCartPopup() {
  if (isCartPopupAnimating) return;
  
  const cartImg = cartIcon.querySelector("img");
  const cartCounter = cartIcon.querySelector("h3");
  
  if (cartPopup.classList.contains("hidden")) {
    isCartPopupAnimating = true;
    renderCartPopup();
    cartPopup.classList.remove("hidden", "slide-up");
    cartPopup.classList.add("slide-down");
    cartImg.src = "img/cart_open.png";
    cartCounter.style.opacity = "0";
    setTimeout(() => {
      isCartPopupAnimating = false;
    }, 300);
  } else {
    isCartPopupAnimating = true;
    cartPopup.classList.remove("slide-down");
    cartPopup.classList.add("slide-up");
    cartImg.src = "img/cart_closed.png";
    cartCounter.style.opacity = "1";
    setTimeout(() => {
      cartPopup.classList.add("hidden");
      isCartPopupAnimating = false;
    }, 300);
  }
}

function renderCartPopup() {
  cartPopup.innerHTML = "";
  
  for (const [key, data] of selectedItems) {
    const parsed = parseItemKey(key);
    const item = findItemByName(parsed.name);
    if (!item) continue;
    
    const itemDiv = document.createElement("div");
    itemDiv.className = "cart-popup-item";
    
    const img = document.createElement("img");
    img.src = `IDs/${restaurantId}/${item.img}`;
    img.onerror = () => { img.src = 'img/placeholder.png'; };
    
    itemDiv.appendChild(img);
    
    if (data.qty > 1) {
      const badge = document.createElement("span");
      badge.className = "cart-popup-badge";
      badge.textContent = data.qty;
      itemDiv.appendChild(badge);
    }
    
    cartPopup.appendChild(itemDiv);
  }
}

cartIcon.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleCartPopup();
});

document.addEventListener("click", (e) => {
  if (!cartPopup.contains(e.target) && !cartIcon.contains(e.target)) {
    if (!cartPopup.classList.contains("hidden")) {
      const cartImg = cartIcon.querySelector("img");
      const cartCounter = cartIcon.querySelector("h3");
      cartPopup.classList.add("hidden");
      cartImg.src = "img/cart_closed.png";
      cartCounter.style.opacity = "1";
    }
  }
});

// === SCHERMATA CUSTOMIZZAZIONE ===
function openCustomizationScreen(item) {
  const screen = document.createElement("div");
  screen.className = "customization-screen";
  screen.innerHTML = `
    <div class="customization-header">
      <h2>Modifica ${item.displayName}</h2>
      <button class="back-btn">
        <img src="img/x.png" alt="Chiudi">
      </button>
    </div>
    <div class="customization-content">
      ${item.img ? `<img src="IDs/${restaurantId}/${item.img}" alt="${item.displayName}">` : ""}
      <div class="customization-sections"></div>
    </div>
    <div class="customization-footer">
      <div class="price-display">
        <span class="base-price">Prezzo base: €${item.price.toFixed(2)}</span>
        <span class="total-price">Totale: €${item.price.toFixed(2)}</span>
      </div>
      <button class="add-to-cart-btn">Conferma</button>
    </div>
  `;
  
  document.body.appendChild(screen);
  document.body.classList.add("noscroll");
  
  const sectionsContainer = screen.querySelector(".customization-sections");
  const totalPriceEl = screen.querySelector(".total-price");
  const addBtn = screen.querySelector(".add-to-cart-btn");
  const backBtn = screen.querySelector(".back-btn");
  
  const customizationState = {};
  
  // Carica le sezioni di customizzazione
  const group = customizationData[item.customizationGroup];
  if (group) {
    group.forEach(section => {
      const sectionDiv = document.createElement("div");
      sectionDiv.className = "customization-section";
      
      const title = document.createElement("h3");
      title.textContent = section.name + (section.required ? " *" : "");
      sectionDiv.appendChild(title);
      
      section.options.forEach(opt => {
        const optDiv = document.createElement("div");
        optDiv.className = "customization-option";
        
        const optLabel = document.createElement("label");
        optLabel.textContent = opt.name;
        if (opt.priceModifier !== 0) {
          optLabel.textContent += ` (+€${opt.priceModifier.toFixed(2)})`;
        }
        
        const controls = document.createElement("div");
        controls.className = "option-controls";
        
        if (section.maxSelections === 1) {
          // Radio button per scelta singola (con deselezione)
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = section.id;
          radio.value = opt.id;
          
          // Inizializza lo stato se non esiste
          if (customizationState[opt.id] === undefined) {
            customizationState[opt.id] = 0;
          }
          
          radio.addEventListener("click", (e) => {
            // Se già selezionato, deseleziona
            if (customizationState[opt.id] === 1) {
              e.preventDefault();
              radio.checked = false;
              customizationState[opt.id] = 0;
            } else {
              // Altrimenti seleziona e resetta gli altri
              section.options.forEach(o => {
                customizationState[o.id] = 0;
              });
              customizationState[opt.id] = 1;
            }
            updateTotalPrice();
          });
          
          controls.appendChild(radio);
        } else {
          // Counter per selezioni multiple
          const minusBtn = document.createElement("button");
          minusBtn.textContent = "−";
          minusBtn.className = "counter-btn";
          
          const qtySpan = document.createElement("span");
          qtySpan.textContent = "0";
          qtySpan.className = "counter-qty";
          
          const plusBtn = document.createElement("button");
          plusBtn.textContent = "+";
          plusBtn.className = "counter-btn";
          
          customizationState[opt.id] = 0;
          
          minusBtn.addEventListener("click", () => {
            if (customizationState[opt.id] > 0) {
              customizationState[opt.id]--;
              qtySpan.textContent = customizationState[opt.id];
              updateTotalPrice();
            }
          });
          
          plusBtn.addEventListener("click", () => {
            const currentTotal = section.options.reduce((sum, o) => 
              sum + (customizationState[o.id] || 0), 0);
            
            if (!section.maxSelections || currentTotal < section.maxSelections) {
              customizationState[opt.id]++;
              qtySpan.textContent = customizationState[opt.id];
              updateTotalPrice();
            }
          });
          
          controls.appendChild(minusBtn);
          controls.appendChild(qtySpan);
          controls.appendChild(plusBtn);
        }
        
        optDiv.appendChild(optLabel);
        optDiv.appendChild(controls);
        sectionDiv.appendChild(optDiv);
      });
      
      sectionsContainer.appendChild(sectionDiv);
    });
  }
  
  function updateTotalPrice() {
    const totalPrice = calculateItemPrice(item.name, customizationState);
    totalPriceEl.textContent = `Totale: €${totalPrice.toFixed(2)}`;
    
    // Verifica se tutte le sezioni required sono compilate
    let allRequiredFilled = true;
    if (group) {
      for (const section of group) {
        if (section.required) {
          const hasSelection = section.options.some(opt => 
            customizationState[opt.id] > 0
          );
          if (!hasSelection) {
            allRequiredFilled = false;
            break;
          }
        }
      }
    }
    
    addBtn.disabled = !allRequiredFilled;
    if (!allRequiredFilled) {
      addBtn.classList.add("disabled");
    } else {
      addBtn.classList.remove("disabled");
    }
  }
  
  addBtn.addEventListener("click", () => {
    const itemKey = generateItemKey(item.name, customizationState);
    const itemPrice = calculateItemPrice(item.name, customizationState);
    
    if (selectedItems.has(itemKey)) {
      const data = selectedItems.get(itemKey);
      data.qty++;
    } else {
      selectedItems.set(itemKey, {
        qty: 1,
        customizations: { ...customizationState }
      });
    }
    
    total += itemPrice;
    count += 1;
    
    updateCart();
    saveSelectionToStorage();
    updateItemButtonUI(item.name);
    
    // Chiudi schermata
    document.body.removeChild(screen);
    document.body.classList.remove("noscroll");
  });
  
  backBtn.addEventListener("click", () => {
    document.body.removeChild(screen);
    document.body.classList.remove("noscroll");
  });
  
  updateTotalPrice();
}

// === MENU ===
async function loadMenu() {
  const params = new URLSearchParams(window.location.search);
  restaurantId = params.get("id");
  if (!restaurantId) {
    console.error("ID del menu non specificato nell'URL.");
    return;
  }

  const res = await fetch(`IDs/${restaurantId}/menu.json`);
  const menuJson = await res.json();
  
  // ✅ Carica settings per verificare menu types disponibili
  let availableMenuTypes = [];
  try {
    const settingsRes = await fetch(`IDs/${restaurantId}/settings.json`);
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      availableMenuTypes = settings.menuTypes || [];
    }
  } catch (e) {
    console.warn("Settings non trovati, nessun filtro disponibile");
  }
  
  // ✅ FILTRO MENU TYPE con validazione
  const requestedType = params.get("type");
  let menuTypeFilter = null;
  
  if (requestedType) {
    // Controlla se il type esiste nei menu types configurati
    const typeExists = availableMenuTypes.some(t => t.id === requestedType);
    
    if (typeExists) {
      menuTypeFilter = requestedType;
      
    } else {
      console.warn(`⚠️ Menu type "${requestedType}" non trovato, mostro tutto il menu`);
      // Opzionale: rimuovi il parametro dall'URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('type');
      window.history.replaceState({}, '', newUrl);
    }
  }
  
  menuJson.categories = menuJson.categories
  .map(cat => ({
    ...cat,
    items: cat.items.filter(item => item.visible)
  }))
  .filter(cat => cat.items.length > 0);

  if (menuTypeFilter) {
    menuJson.categories = menuJson.categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => 
          item.menuType && item.menuType.includes(menuTypeFilter)
        )
      }))
      .filter(cat => cat.items.length > 0);
  }

  if (menuJson.categories.length === 0) {
    console.error("Nessuna categoria disponibile dopo i filtri");
    itemsContainer.innerHTML = "<p style='text-align:center;padding:2rem;'>Nessun prodotto disponibile</p>";
    return;
  }
  
  await loadCustomizations();

  categories = menuJson.categories.map(cat => cat.name);

  nav.innerHTML = "";
  const pill = document.createElement("div");
  pill.className = "pill";
  nav.appendChild(pill);

  categories.forEach((cat, index) => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    if (index === 0) btn.classList.add("active");  // ✅ AGGIUNGI QUESTA RIGA
    btn.addEventListener("click", () => setActiveCategory(index));
    nav.appendChild(btn);
  });

  nav.addEventListener("scroll", () => {
    const active = document.querySelector(".categories button.active");
    if (active) movePillTo(active);
  });
  window.addEventListener("resize", () => {
    const active = document.querySelector(".categories button.active");
    if (active) movePillTo(active);
  });

  window.menuData = {};

  menuJson.categories.forEach(category => {
    const categoryName = category.name;
    window.menuData[categoryName] = [];

    category.items.forEach(item => {
      if (!item.visible) return;

      window.menuData[categoryName].push({
        name: item.name,
        displayName: item.name,
        price: item.price,
        img: item.imagePath,
        ingredients: item.description.split(",").map(i => i.trim()).filter(Boolean),
        allergens: item.allergens.map(a => a.toString()),
        isNew: item.featured,
        customizable: item.customizable || false,
        customizationGroup: item.customizationGroup || null
      });
    });
  });

  loadSelectionFromStorage();
  const checkAndActivate = () => {
    const firstButton = nav.querySelector("button");
    if (firstButton && firstButton.offsetWidth > 0) {
      // Il pulsante è renderizzato e ha dimensioni
      setActiveCategory(0);
    } else {
      // Riprova dopo 50ms
      setTimeout(checkAndActivate, 50);
    }
  };
  
  setTimeout(checkAndActivate, 0);
}

function movePillTo(button) {
  const pill = document.querySelector(".pill");
  if (!pill) return;
  pill.style.width = `${button.offsetWidth}px`;
  pill.style.transform = `translateX(${button.offsetLeft}px)`;
}

function setActiveCategory(index) {
  if (index < 0 || index >= categories.length) return;
  lastSwipeDirection = index > currentCategoryIndex ? "left" : "right";
  currentCategoryIndex = index;

  document.querySelectorAll(".categories button").forEach((b, i) => {
    b.classList.toggle("active", i === index);
  });

  const activeBtn = document.querySelector(".categories button.active");
  if (activeBtn) movePillTo(activeBtn);
  renderItems(categories[index]);
  updateCart();

  activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  if (!nextBtn) return;

  if (currentCategoryIndex === categories.length - 1) {
    nextBtn.innerText = "Completa";

    if (count === 0) {
      nextBtn.classList.remove("paga", "animate-glow");
      nextBtn.classList.add("locked");
      nextBtn.disabled = true;
    } else {
      nextBtn.classList.remove("locked");
      nextBtn.classList.add("paga", "animate-glow");
      nextBtn.disabled = false;
    }
  } else {
    nextBtn.innerText = "Avanti";
    nextBtn.classList.remove("paga", "animate-glow", "locked");
    nextBtn.disabled = false;
  }
}

function renderItems(category) {
  if (!itemsContainer) return;

  itemsContainer.classList.remove("fade-in-left", "fade-in-right", "fade-out-left", "fade-out-right");
  itemsContainer.classList.add(lastSwipeDirection === "left" ? "fade-out-left" : "fade-out-right");

  setTimeout(() => {
    itemsContainer.innerHTML = "";

    const items = window.menuData[category] || [];

    items.forEach(item => {
      const btn = document.createElement("button");

      if (item.isNew) {
        const badge = document.createElement("div");
        badge.className = "novita";
        badge.textContent = "Novità";
        btn.appendChild(badge);
      }

      const infoBtn = document.createElement("div");
      infoBtn.className = "info-btn";
      const infoImg = document.createElement("img");
      infoImg.src = "img/info.png";
      infoImg.alt = "Info";
      infoBtn.appendChild(infoImg);
      btn.appendChild(infoBtn);

      const img = document.createElement("img");
      img.src = `IDs/${restaurantId}/${item.img}`;
      img.alt = item.displayName;
      img.onerror = () => {
        img.src = 'img/placeholder.png';
      };
      
      const title = document.createElement("h3");
      title.setAttribute('data-item-name', item.name);
      
      // Conta TUTTE le varianti di questo item
      let totalQty = 0;
      for (const [key, data] of selectedItems) {
        const parsed = parseItemKey(key);
        if (parsed.name === item.name) {
          totalQty += data.qty;
        }
      }
      
      if (totalQty > 1) {
        title.textContent = `${item.displayName} (x${totalQty})`;
      } else {
        title.textContent = item.displayName;
      }

      const price = document.createElement("p");
      if (item.customizable) {
        if (totalQty > 0) {
          // Calcola il prezzo totale di tutte le varianti
          let totalPrice = 0;
          for (const [key, data] of selectedItems) {
            const parsed = parseItemKey(key);
            if (parsed.name === item.name) {
              totalPrice += calculateItemPrice(parsed.name, parsed.customizations) * data.qty;
            }
          }
          price.textContent = `€${totalPrice.toFixed(2)}`;
        } else {
          if (item.price < 0.01) 
            price.textContent = "Seleziona";
          else
            price.textContent = `€${item.price.toFixed(2)} + Modifica`;
          price.classList.add("customizable-price");
        }
      } else {
        price.textContent = `€${item.price.toFixed(2)}`;
      }

      btn.appendChild(img);
      btn.appendChild(title);
      btn.appendChild(price);

      if (totalQty > 0) {
        btn.classList.add("selected");
      }

      btn.addEventListener("click", (event) => {
        if (event.target.closest(".info-btn")) return;
      
        if (item.customizable) {
          let isItemSelected = false;
          for (const [key] of selectedItems) {
            if (parseItemKey(key).name === item.name) {
              isItemSelected = true;
              break;
            }
          }
      
          if (isItemSelected) {
            // Rimuovi TUTTE le varianti
            const keysToRemove = [];
            for (const [key, data] of selectedItems) {
              const parsed = parseItemKey(key);
              if (parsed.name === item.name) {
                keysToRemove.push(key);
                total -= calculateItemPrice(parsed.name, parsed.customizations) * data.qty;
                count -= data.qty;
              }
            }
            keysToRemove.forEach(key => selectedItems.delete(key));
            updateCart();
            saveSelectionToStorage();
            updateItemButtonUI(item.name);
          } else {
            openCustomizationScreen(item);
          }
        } else {
          const itemKey = item.name;
          if (selectedItems.has(itemKey)) {
            let data = selectedItems.get(itemKey);
            if (data.qty <= 1) {
              selectedItems.delete(itemKey);
              total -= item.price;
              count -= 1;
              btn.classList.remove("selected");
            } else {
              data.qty--;
              total -= item.price;
              count -= 1;
            }
          } else {
            selectedItems.set(itemKey, { qty: 1, customizations: {} });
            total += item.price;
            count += 1;
            btn.classList.add("selected");
          }
          updateCart();
          saveSelectionToStorage();
          updateItemButtonUI(item.name);
        }
      });

      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopup(item);
      });

      itemsContainer.appendChild(btn);
    });

    itemsContainer.classList.remove("fade-out-left", "fade-out-right");
    itemsContainer.classList.add(lastSwipeDirection === "left" ? "fade-in-right" : "fade-in-left");
    
  }, 250);
}

function updateCart() {
  if (Math.abs(total) < 0.01) total = 0;

  total = 0;
  count = 0;
  for (const [key, data] of selectedItems) {
    const parsed = parseItemKey(key);
    const itemPrice = calculateItemPrice(parsed.name, parsed.customizations);
    total += itemPrice * data.qty;
    count += data.qty;
  }

  priceDisplay.textContent = `€${total.toFixed(2)}`;
  counterDisplay.textContent = count;

  if (currentCategoryIndex === categories.length - 1) {
    if (count === 0) {
      nextBtn.classList.remove("paga", "animate-glow");
      nextBtn.classList.add("locked");
      nextBtn.disabled = true;
    } else {
      nextBtn.classList.remove("locked");
      nextBtn.classList.add("paga", "animate-glow");
      nextBtn.disabled = false;
    }
  }
}

function findItemByName(name) {
  for (const cat of categories) {
    const arr = window.menuData[cat];
    if (!arr) continue;
    for (const item of arr) {
      if (item.name === name) return item;
    }
  }
  return null;
}

function openPopup(item) {
  const popup = document.querySelector(".popup");
  const popupImg = popup.querySelector(".popup-img");
  const popupTitle = popup.querySelector(".popup-title");
  const popupIngredients = popup.querySelector(".popup-ingredients");
  const popupAllergens = popup.querySelector(".popup-allergens");
  const popupControls = popup.querySelector(".popup-controls");
  const allergenTitle = document.getElementById("titolo-allergeni");

  allergenTitle.style.display = item.allergens.length === 0 ? "none" : "block";
  
  popupImg.src = `IDs/${restaurantId}/${item.img}`;
  popupImg.onerror = () => { popupImg.src = 'img/placeholder.png'; };
  popupTitle.textContent = item.displayName;
  popupIngredients.textContent = item.ingredients.join(", ").replace(/\\n/g, '\n');
  popupAllergens.innerHTML = "";
  popupControls.innerHTML = "";
  
  // Calcola quantità totale dell'item
  let totalQty = 0;
  for (const [key, data] of selectedItems) {
    const parsed = parseItemKey(key);
    if (parsed.name === item.name) totalQty += data.qty;
  }
  
  if (item.customizable && totalQty === 0) {
    // Item customizzabile NON selezionato: solo "Personalizza"
    const customizeBtn = document.createElement("button");
    customizeBtn.textContent = "Personalizza";
    customizeBtn.className = "popup-customize-btn";
    customizeBtn.addEventListener("click", () => {
      closePopup();
      openCustomizationScreen(item);
    });
    popupControls.appendChild(customizeBtn);
  } else {
    // Item customizzabile SELEZIONATO o NON customizzabile: mostra + e -
    const minusBtn = document.createElement("button");
    minusBtn.textContent = "−";
    minusBtn.className = "popup-minus";

    const qtyDisplay = document.createElement("span");
    qtyDisplay.className = "popup-qty";

    const plusBtn = document.createElement("button");
    plusBtn.textContent = "+";
    plusBtn.className = "popup-plus";

    const itemKey = item.name;
    let qty = item.customizable ? totalQty : (selectedItems.has(itemKey) ? selectedItems.get(itemKey).qty : 0);
    qtyDisplay.textContent = qty;

    minusBtn.addEventListener("click", () => {
      if (qty > 0) {
        if (item.customizable) {
          // Rimuovi una unità dalla prima variante
          for (const [key, data] of selectedItems) {
            const parsed = parseItemKey(key);
            if (parsed.name === item.name) {
              const itemPrice = calculateItemPrice(parsed.name, parsed.customizations);
              if (data.qty > 1) {
                data.qty--;
              } else {
                selectedItems.delete(key);
              }
              total -= itemPrice;
              count -= 1;
              qty--;
              break;
            }
          }
          if (qty === 0) closePopup();
        } else {
          qty--;
          if (qty === 0) {
            selectedItems.delete(itemKey);
          } else {
            selectedItems.set(itemKey, { qty, customizations: {} });
          }
          total -= item.price;
          count -= 1;
        }
        qtyDisplay.textContent = qty;
        updateCart();
        saveSelectionToStorage();
        updateItemButtonUI(item.name);
      }
    });
    
    plusBtn.addEventListener("click", () => {
      if (item.customizable) {
        // Aggiungi una unità alla prima variante
        for (const [key, data] of selectedItems) {
          const parsed = parseItemKey(key);
          if (parsed.name === item.name) {
            const itemPrice = calculateItemPrice(parsed.name, parsed.customizations);
            data.qty++;
            total += itemPrice;
            count += 1;
            qty++;
            break;
          }
        }
      } else {
        qty++;
        selectedItems.set(itemKey, { qty, customizations: {} });
        total += item.price;
        count += 1;
      }
      qtyDisplay.textContent = qty;
      updateCart();
      saveSelectionToStorage();
      updateItemButtonUI(item.name);
    });

    popupControls.appendChild(minusBtn);
    popupControls.appendChild(qtyDisplay);
    popupControls.appendChild(plusBtn);
  }

  // Allergeni
  item.allergens.forEach(id => {
    const img = document.createElement("img");
    img.src = `img/allergeni/${id}.png`;
    img.alt = `Allergene ${id}`;
    img.style.cursor = "pointer";
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const popupMsg = document.getElementById("allergen-popup");
      popupMsg.textContent = allergenNames[id] || "Allergene sconosciuto";
      const rect = img.getBoundingClientRect();
      popupMsg.style.top = `${rect.top + rect.height / 2 - 60}px`;
      popupMsg.style.left = `${rect.left + rect.width / 2 - popupMsg.offsetWidth / 2}px`;
      clearTimeout(allergenPopupTimeout);
      popupMsg.classList.remove("hidden");
      popupMsg.classList.add("show");
      allergenPopupTimeout = setTimeout(() => {
        popupMsg.classList.remove("show");
        setTimeout(() => popupMsg.classList.add("hidden"), 200);
      }, 1200);
    });
    popupAllergens.appendChild(img);
  });

  popup.classList.remove("hidden");
  document.body.classList.add("noscroll");
}

function closePopup() {
  const popup = document.querySelector(".popup");
  if (!popup.classList.contains("hidden")) {
    popup.classList.add("hidden");
    document.body.classList.remove("noscroll");
  }
  clearTimeout(allergenPopupTimeout);
  const popupMsg = document.getElementById("allergen-popup");
  popupMsg.classList.remove("show");
  popupMsg.classList.add("hidden");
}

document.querySelector(".close-popup").addEventListener("click", closePopup);
document.querySelector(".popup").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closePopup();
});

if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    if (currentCategoryIndex < categories.length - 1) {
      lastSwipeDirection = "left";
      setActiveCategory(currentCategoryIndex + 1);
    } else {
      // ✅ Costruisci URL con tutti i parametri
      const params = new URLSearchParams(window.location.search);
      const checkoutUrl = new URL('checkout.html', window.location.origin);
      
      checkoutUrl.searchParams.set('id', restaurantId);
      
      // ✅ Passa il type se presente
      const menuType = params.get('type');
      if (menuType) {
        checkoutUrl.searchParams.set('type', menuType);
      }
      
      window.location.href = checkoutUrl.toString();
    }
  });
}

let startX = 0, startY = 0, isSwipe = false;

if (itemsContainer) {
  itemsContainer.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwipe = true; // inizialmente assumiamo che sia uno swipe valido
  });

  itemsContainer.addEventListener("touchmove", (e) => {
    const deltaX = Math.abs(e.touches[0].clientX - startX);
    const deltaY = Math.abs(e.touches[0].clientY - startY);
    
    if (deltaY > deltaX) {
      // movimento verticale maggiore di quello orizzontale → blocca swipe
      isSwipe = false;
    }
  });

  itemsContainer.addEventListener("touchend", (e) => {
    if (!isSwipe) return; // se è verticale, non fare swipe

    const endX = e.changedTouches[0].clientX;
    const threshold = 50;
    if (endX - startX > threshold) {
      lastSwipeDirection = "right";
      setActiveCategory(currentCategoryIndex - 1);
    } else if (startX - endX > threshold) {
      lastSwipeDirection = "left";
      setActiveCategory(currentCategoryIndex + 1);
    }
  });
}



loadMenu();











