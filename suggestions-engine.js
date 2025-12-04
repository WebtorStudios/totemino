class SuggestionsEngine {
  constructor() {
    this.menuData = {};
  }

  loadMenuData(menuData, restaurantId) {
    this.menuData = {};
    if (menuData?.categories) {
      menuData.categories.forEach(cat => {
        if (cat.items) this.menuData[cat.name] = cat.items;
      });
    }
  }

  async generateSuggestions() {
    const typeFilter = new URLSearchParams(window.location.search).get('type');
    const selectedItems = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    
    // Estrai nomi e categorie degli articoli nel carrello
    const currentOrderNames = new Set();
    const currentOrderCategories = new Set();
    const currentOrderPrices = [];
    
    for (let i = 0; i < selectedItems.length; i += 3) {
      const itemName = selectedItems[i];
      currentOrderNames.add(itemName);
      
      // Trova categoria e prezzo dell'item
      for (const [category, items] of Object.entries(this.menuData)) {
        const foundItem = items.find(item => item.name === itemName);
        if (foundItem) {
          currentOrderCategories.add(category);
          currentOrderPrices.push(foundItem.price);
          break;
        }
      }
    }

    // Calcola il prezzo medio degli articoli nel carrello
    const avgPrice = currentOrderPrices.length > 0 
      ? currentOrderPrices.reduce((sum, price) => sum + price, 0) / currentOrderPrices.length 
      : 0;
    
    // Determina la fascia di prezzo da suggerire
    const suggestExpensive = avgPrice < 7;
    const priceMin = suggestExpensive ? 7.01 : 0.01;
    const priceMax = suggestExpensive ? Infinity : 6.99;

    // Raccogli tutti gli items validi (senza filtro categoria)
    const allItems = [];
    for (const [category, items] of Object.entries(this.menuData)) {
      items.forEach(item => {
        if (
          item.visible !== false &&
          !currentOrderNames.has(item.name) &&
          !item.customizable &&
          item.price >= priceMin &&
          item.price <= priceMax &&
          (!typeFilter || item.menuType?.includes(typeFilter))
        ) {
          allItems.push({ ...item, img: item.imagePath, category });
        }
      });
    }

    if (allItems.length === 0) return [];

    // Ordina per prezzo
    allItems.sort((a, b) => suggestExpensive ? b.price - a.price : a.price - b.price);

    const suggestions = [];
    const TARGET_COUNT = 4;
    let maxItemsPerCategory = 1; // Inizia con 1 item per categoria

    // Loop infinito finché non raggiungiamo 4 suggerimenti o esauriamo tutti gli items
    while (suggestions.length < TARGET_COUNT && suggestions.length < allItems.length) {
      const categoryCounts = new Map();
      
      for (const item of allItems) {
        // Salta se già aggiunto
        if (suggestions.find(s => s.name === item.name)) continue;
        
        // Conta quanti items di questa categoria abbiamo già
        const currentCount = categoryCounts.get(item.category) || 0;
        
        // Se non abbiamo raggiunto il limite per questa categoria, aggiungi
        if (currentCount < maxItemsPerCategory) {
          // Salta categorie già presenti nel carrello solo al primo giro
          if (maxItemsPerCategory === 1 && currentOrderCategories.has(item.category)) {
            continue;
          }
          
          suggestions.push(item);
          categoryCounts.set(item.category, currentCount + 1);
          
          if (suggestions.length >= TARGET_COUNT) break;
        }
      }
      
      // Se non abbiamo raggiunto 4 items, incrementa il limite per categoria
      if (suggestions.length < TARGET_COUNT) {
        maxItemsPerCategory++;
      } else {
        break;
      }
      
      // Safety: se maxItemsPerCategory supera il numero totale di items, esci
      if (maxItemsPerCategory > allItems.length) break;
    }

    // Riordina: 2°, 3°, 4°, 1° (se abbiamo 4 elementi)
    if (suggestions.length === 4) {
      return [suggestions[1], suggestions[2], suggestions[3], suggestions[0]];
    }
    
    return suggestions;
  }

  async generateSuggestionsForCheckout() {
    return this.generateSuggestions();
  }

  async renderSuggestions(restaurantId) {
    const suggestions = await this.generateSuggestions();
    const wrapper = document.querySelector(".suggestions-wrapper");
    const list = document.querySelector(".suggestions-list");
    
    if (!wrapper || !list) return;
    
    if (suggestions.length === 0) {
      wrapper.style.display = "none";
      return;
    }

    list.innerHTML = `<h3><span id="title-name">Totemino</span> ti consiglia:</h3>` +
      suggestions.map(s => `
        <div class="suggested-single">
          <img src="${s.imagePath}" alt="${s.name}" onerror="this.src='img/placeholder.png'">
          <div class="suggested-text">
            <h4>${s.name}</h4>
            <p>€${s.price.toFixed(2)}</p>
          </div>
          <button class="add-btn" onclick="suggestionsEngine.add('${s.name.replace(/'/g, "\\'")}', '${restaurantId}')">+</button>
        </div>
      `).join('');

    wrapper.style.display = "";
  }

  add(itemName, restaurantId) {
    const selected = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    const notes = JSON.parse(localStorage.getItem("totemino_notes") || "[]");
    const suggested = JSON.parse(localStorage.getItem("totemino_suggested_items") || "[]");

    // Cerca se esiste già
    for (let i = 0; i < selected.length; i += 3) {
      if (selected[i] === itemName) {
        selected[i + 2] = (parseInt(selected[i + 2]) + 1).toString();
        localStorage.setItem("totemino_selected", JSON.stringify(selected));
        this.updateUI(restaurantId);
        return;
      }
    }

    // Aggiungi nuovo (prima del coperto se esiste)
    let copertoIndex = selected.findIndex((item, i) => i % 3 === 0 && item === "Coperto");
    if (copertoIndex !== -1) {
      selected.splice(copertoIndex, 0, itemName, "{}", "1");
      notes.splice(copertoIndex / 3, 0, "");
    } else {
      selected.push(itemName, "{}", "1");
      notes.push("");
    }

    if (!suggested.includes(itemName)) suggested.push(itemName);

    localStorage.setItem("totemino_selected", JSON.stringify(selected));
    localStorage.setItem("totemino_notes", JSON.stringify(notes));
    localStorage.setItem("totemino_suggested_items", JSON.stringify(suggested));

    this.updateUI(restaurantId);
  }

  updateUI(restaurantId) {
    // Aggiorna totale
    const selected = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    let total = 0;
    for (let i = 0; i < selected.length; i += 3) {
      for (const items of Object.values(this.menuData)) {
        const item = items.find(it => it.name === selected[i]);
        if (item) {
          total += item.price * parseInt(selected[i + 2]);
          break;
        }
      }
    }
    localStorage.setItem("totemino_total", total.toFixed(2));
    localStorage.setItem("totemino_count", (selected.length / 3).toString());

    // Ri-renderizza se siamo in checkout
    if (typeof STATE !== 'undefined' && typeof UI !== 'undefined') {
      location.reload();
    }
  }
}

const suggestionsEngine = new SuggestionsEngine();

async function initializeSuggestions(menuData, restaurantId) {
  if (menuData && restaurantId) {
    suggestionsEngine.loadMenuData(menuData, restaurantId);
    await suggestionsEngine.renderSuggestions(restaurantId);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SuggestionsEngine, initializeSuggestions };
}