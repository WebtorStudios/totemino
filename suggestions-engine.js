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
    
    // Priorità categorie mancanti
    const allCategories = Object.keys(this.menuData);
    const missingCategories = allCategories.filter(cat => !currentOrderCategories.has(cat));
    
    // Step 1: Raccogli items dalle categorie MANCANTI
    const itemsFromMissingCategories = [];
    for (const category of missingCategories) {
      const items = this.menuData[category];
      items.forEach(item => {
        if (
          item.visible !== false &&
          !currentOrderNames.has(item.name) &&
          item.imagePath && 
          !item.customizable && 
          item.imagePath.trim() !== '' &&
          (!typeFilter || item.menuType?.includes(typeFilter))
        ) {
          itemsFromMissingCategories.push({ 
            ...item, 
            img: item.imagePath, 
            category,
            priority: 'missing'
          });
        }
      });
    }
    
    // Step 2: Raccogli items dalle categorie GIÀ PRESENTI (con filtro prezzo)
    const suggestExpensive = avgPrice < 7;
    const priceMin = suggestExpensive ? 7.01 : 0.01;
    const priceMax = suggestExpensive ? Infinity : 6.99;
    
    const itemsFromExistingCategories = [];
    for (const [category, items] of Object.entries(this.menuData)) {
      if (currentOrderCategories.has(category)) {
        items.forEach(item => {
          if (
            item.visible !== false &&
            !currentOrderNames.has(item.name) &&
            item.imagePath && // ✅ Escludi senza immagine
            item.imagePath.trim() !== '' && // ✅ Escludi immagine vuota
            item.price >= priceMin &&            
            item.price <= priceMax &&
            !item.customizable &&
            (!typeFilter || item.menuType?.includes(typeFilter))
          ) {
            itemsFromExistingCategories.push({ 
              ...item, 
              img: item.imagePath, 
              category,
              priority: 'existing'
            });
          }
        });
      }
    }

    // Step 3: Ordina ogni pool per prezzo
    itemsFromMissingCategories.sort((a, b) => 
      suggestExpensive ? b.price - a.price : a.price - b.price
    );
    itemsFromExistingCategories.sort((a, b) => 
      suggestExpensive ? b.price - a.price : a.price - b.price
    );

    const suggestions = [];
    const usedCategories = new Set();
    const TARGET_COUNT = 4;

    // Step 4: Prima riempi con categorie MANCANTI (1 item per categoria)
    for (const item of itemsFromMissingCategories) {
      if (suggestions.length >= TARGET_COUNT) break;
      
      if (!usedCategories.has(item.category)) {
        suggestions.push(item);
        usedCategories.add(item.category);
      }
    }

    // Step 5: Se non hai ancora 4 suggerimenti, aggiungi dalle categorie ESISTENTI
    for (const item of itemsFromExistingCategories) {
      if (suggestions.length >= TARGET_COUNT) break;
      
      if (!usedCategories.has(item.category)) {
        suggestions.push(item);
        usedCategories.add(item.category);
      }
    }

    // Step 6: Se ancora non hai 4, accetta duplicati di categoria (come fallback)
    if (suggestions.length < TARGET_COUNT) {
      const allItems = [...itemsFromMissingCategories, ...itemsFromExistingCategories];
      
      for (const item of allItems) {
        if (suggestions.length >= TARGET_COUNT) break;
        
        if (suggestions.find(s => s.name === item.name)) continue;
        
        suggestions.push(item);
      }
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

    // Trova categoria dell'item
    let itemCategory = null;
    for (const [category, items] of Object.entries(this.menuData)) {
      if (items.find(item => item.name === itemName)) {
        itemCategory = category;
        break;
      }
    }

    // Ricostruisci selected ordinato per categoria
    const itemsByCategory = new Map();
    
    let noteIndex = 0;
    for (let i = 0; i < selected.length; i += 3) {
      const name = selected[i];
      const customizations = selected[i + 1];
      const qty = selected[i + 2];
      const note = notes[noteIndex] || ""; 
      
      let foundCategory = null;
      for (const [category, items] of Object.entries(this.menuData)) {
        if (items.find(item => item.name === name)) {
          foundCategory = category;
          break;
        }
      }
      
      if (!foundCategory) foundCategory = 'Unknown';
      
      if (!itemsByCategory.has(foundCategory)) {
        itemsByCategory.set(foundCategory, []);
      }
      itemsByCategory.get(foundCategory).push({ name, customizations, qty, note });
      noteIndex++;
    }

    // Aggiungi nuovo item nella sua categoria
    if (!itemsByCategory.has(itemCategory)) {
      itemsByCategory.set(itemCategory, []);
    }
    itemsByCategory.get(itemCategory).push({ 
      name: itemName, 
      customizations: "{}", 
      qty: "1",
      note: "" 
    });

    const newSelected = [];
    const newNotes = [];
    const categoryOrder = Object.keys(this.menuData);
    
    categoryOrder.forEach(category => {
      if (itemsByCategory.has(category)) {
        itemsByCategory.get(category).forEach(item => {
          newSelected.push(item.name, item.customizations, item.qty);
          newNotes.push(item.note);
        });
      }
    });
    
    // Aggiungi eventuali categorie non trovate
    for (const [category, items] of itemsByCategory) {
      if (!categoryOrder.includes(category)) {
        items.forEach(item => {
          newSelected.push(item.name, item.customizations, item.qty);
          newNotes.push(item.note);
        });
      }
    }

    if (!suggested.includes(itemName)) suggested.push(itemName);

    localStorage.setItem("totemino_selected", JSON.stringify(newSelected));
    localStorage.setItem("totemino_notes", JSON.stringify(newNotes));
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