// ============================================
// SISTEMA SUGGERIMENTI V4 - CON DEBUG ESTESO
// ============================================

class SuggestionsEngine {
  constructor() {
    this.menuData = {};
    this.currentOrder = [];
    this.userPreferences = null;
    this.userId = null;
    this.restaurantId = null;
  }

  // ===== CONTROLLO CONSENSO =====
  canUsePreferences() {
    return typeof window.CookieConsent !== 'undefined' && window.CookieConsent.canTrackUser();
  }

  // ===== CARICA PREFERENZE =====
  async loadUserPreferences() {
    if (!this.canUsePreferences()) {
      
      return null;
    }
    
    this.userId = typeof window.getUserId === 'function' 
      ? window.getUserId() 
      : localStorage.getItem("totemino_user_id");
    
    
    
    if (!this.userId) return null;

    try {
      const response = await fetch('/userdata/users-preferences.json');
      if (!response.ok) {
        
        return null;
      }
      
      const allPreferences = await response.json();
      this.userPreferences = allPreferences[this.userId] || null;
      
      if (this.userPreferences) {
        
      } else {
        
      }
      
      return this.userPreferences;
    } catch (error) {
      console.error('❌ Errore caricamento preferenze:', error);
      return null;
    }
  }

  // ===== CARICA MENU (CONVERTE STRUTTURA) =====
  loadMenuData(menuData, restaurantId) {
    this.restaurantId = restaurantId;
    
    
    
    
    // Converti da {categories: [{name, items}]} a {CategoryName: [items]}
    this.menuData = {};
    if (menuData && menuData.categories && Array.isArray(menuData.categories)) {
      menuData.categories.forEach(cat => {
        if (cat.name && cat.items) {
          this.menuData[cat.name] = cat.items || [];
          
        }
      });
    } else {
      console.error('❌ menuData.categories non è valido!');
    }
    
    
  }

  // ===== FILTRA MENU IN BASE A TYPE =====
  getAvailableItemsByCategory() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeFilter = urlParams.get('type');
    
    
    
    if (Object.keys(this.menuData).length === 0) {
      console.error('❌ menuData è VUOTO! Hai chiamato loadMenuData()?');
      return {};
    }
    
    const itemsByCategory = {};
    
    for (const [category, items] of Object.entries(this.menuData)) {
      
      
      const validItems = items.filter(item => {
        // 1. Deve essere visibile
        if (item.visible === false) {
          
          return false;
        }
        
        // 2. NON deve essere customizzabile
        if (item.customizable === true) {
          
          return false;
        }
        
        // 3. LOGICA MENUTYPE
        if (typeFilter) {
          // Menu secondario: SOLO item con menuType che include il type
          const hasMenuType = item.menuType && Array.isArray(item.menuType);
          const includesType = hasMenuType && item.menuType.includes(typeFilter);
          
          if (!includesType) {
            
          } else {
            
          }
          
          return includesType;
        } else {
          // Menu intero: tutti gli item visibili e non customizzabili
          
          return true;
        }
      });
      
      if (validItems.length > 0) {
        itemsByCategory[category] = validItems;
      }
      
      
    }
    
    
    Object.entries(itemsByCategory).forEach(([cat, items]) => {
      
    });
    
    return itemsByCategory;
  }

  // ===== CARICA ORDINE CORRENTE =====
  loadCurrentOrder() {
    const selectedItems = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    
    
    
    
    this.currentOrder = [];
    
    if (selectedItems.length === 0) {
      
      return;
    }
    
    if (selectedItems.length % 3 !== 0) {
      console.error(`  ❌ Formato invalido! Lunghezza ${selectedItems.length} non è multiplo di 3`);
      return;
    }
    
    for (let i = 0; i < selectedItems.length; i += 3) {
      const itemName = selectedItems[i];
      const quantity = parseInt(selectedItems[i + 2]) || 1;
      
      // Trova categoria dell'item
      let category = null;
      for (const [cat, items] of Object.entries(this.menuData)) {
        if (items.some(item => item.name === itemName)) {
          category = cat;
          break;
        }
      }
      
      this.currentOrder.push({ name: itemName, quantity, category });
      
    }
    
    
  }

  // ===== CATEGORIE MANCANTI NELL'ORDINE =====
  getMissingCategories(availableCategories) {
    const orderedCategories = new Set(
      this.currentOrder
        .map(item => item.category)
        .filter(cat => cat !== null)
    );
    
    
    
    const missing = availableCategories.filter(cat => !orderedCategories.has(cat));
    
    
    
    return missing;
  }

  // ===== CALCOLA SCORE INGREDIENTI =====
  calculatePreferenceScore(item) {
    if (!this.userPreferences) return 0;

    let totalScore = 0;
    
    // Estrai ingredienti dalla description (separati da virgola)
    if (item.description) {
      const ingredients = item.description
        .toLowerCase()
        .split(',')
        .map(ing => ing.trim())
        .filter(ing => ing.length > 0);
      
      ingredients.forEach(ingredient => {
        if (this.userPreferences[ingredient]) {
          totalScore += this.userPreferences[ingredient];
        }
      });
    }

    return totalScore;
  }

  // ===== SEED DETERMINISTICO =====
  generateSeed() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeFilter = urlParams.get('type') || 'all';
    
    // Seed cambia in base a: restaurantId + userId + type + items nell'ordine
    const orderString = this.currentOrder
      .map(item => item.name)
      .sort()
      .join('|');
    
    const seedString = `${this.restaurantId}-${this.userId || 'anon'}-${typeFilter}-${orderString}`;
    
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      hash = ((hash << 5) - hash) + seedString.charCodeAt(i);
      hash = hash & hash;
    }
    
    return Math.abs(hash);
  }

  // ===== SHUFFLE DETERMINISTICO =====
  seededShuffle(array, seed) {
    const shuffled = [...array];
    let currentSeed = seed;
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const x = Math.sin(currentSeed++) * 10000;
      const random = x - Math.floor(x);
      const j = Math.floor(random * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }

  // ===== GENERA SUGGERIMENTI =====
  async generateSuggestions() {
    
    
    this.loadCurrentOrder();
    await this.loadUserPreferences();
    
    const itemsByCategory = this.getAvailableItemsByCategory();
    const availableCategories = Object.keys(itemsByCategory);
    
    if (availableCategories.length === 0) {
      console.error('\n❌ ERRORE: Nessuna categoria disponibile! I suggerimenti saranno VUOTI.');
      return [];
    }
    
    // Trova categorie mancanti nell'ordine
    const missingCategories = this.getMissingCategories(availableCategories);
    
    // Se tutte le categorie sono presenti, usa tutte
    const categoriesToSuggest = missingCategories.length > 0 ? missingCategories : availableCategories;
    
    const currentItemNames = new Set(this.currentOrder.map(item => item.name));
    const seed = this.generateSeed();
    
    
    
    
    
    const suggestions = [];
    
    // Per ogni categoria mancante, prendi 1-2 item
    for (const category of categoriesToSuggest) {
      
      
      const categoryItems = itemsByCategory[category].filter(
        item => !currentItemNames.has(item.name)
      );
      
      
      
      if (categoryItems.length === 0) {
        
        continue;
      }
      
      // Calcola score per ogni item
      const scoredItems = categoryItems.map(item => ({
        ...item,
        img: item.imagePath,
        category,
        preferenceScore: this.calculatePreferenceScore(item)
      }));
      
      let selectedFromCategory;
      
      // Se ci sono preferenze, ordina per score
      if (scoredItems.some(item => item.preferenceScore > 0)) {
        
        scoredItems.sort((a, b) => b.preferenceScore - a.preferenceScore);
        scoredItems.forEach(item => {
          
        });
        selectedFromCategory = scoredItems.slice(0, 2);
      } else {
        
        const shuffled = this.seededShuffle(scoredItems, seed + suggestions.length);
        selectedFromCategory = shuffled.slice(0, 2);
      }
      
      
      suggestions.push(...selectedFromCategory);
      
      // Max 4 suggerimenti totali
      if (suggestions.length >= 4) {
        
        break;
      }
    }
    
    
    suggestions.forEach((s, i) => {
      
    });
    
    return suggestions.slice(0, 4);
  }

  // ===== RENDERIZZA SUGGERIMENTI =====
  async renderSuggestions(restaurantId) {
    const suggestions = await this.generateSuggestions();
    const wrapper = document.querySelector(".suggestions-wrapper");
    const suggestionsList = document.querySelector(".suggestions-list");
    
    if (!wrapper || !suggestionsList) {
      console.error('❌ Elementi DOM non trovati: .suggestions-wrapper o .suggestions-list');
      return;
    }

    suggestionsList.innerHTML = "";

    if (suggestions.length === 0) {
      
      wrapper.style.display = "none";
      return;
    }

    const wrapperTitle = document.createElement("h3");
    const spanTotemino = document.createElement("span");
    spanTotemino.id = "title-name";
    spanTotemino.textContent = "Totemino";
    wrapperTitle.appendChild(spanTotemino);
    wrapperTitle.appendChild(document.createTextNode(" ti consiglia:"));
    suggestionsList.appendChild(wrapperTitle);

    suggestions.forEach(suggestion => {
      const container = document.createElement("div");
      container.className = "suggested-single";

      const img = document.createElement("img");
      img.src = `IDs/${restaurantId}/${suggestion.imagePath}`;
      img.alt = suggestion.name;
      img.onerror = () => { img.src = 'img/placeholder.png'; };

      const text = document.createElement("div");
      text.className = "suggested-text";

      const title = document.createElement("h4");
      title.textContent = suggestion.name;

      const price = document.createElement("p");
      price.textContent = `€${suggestion.price.toFixed(2)}`;

      const addBtn = document.createElement("button");
      addBtn.className = "add-btn";
      addBtn.textContent = "+";

      addBtn.onclick = () => {
        this.addSuggestionToOrder(suggestion, restaurantId);
      };

      text.appendChild(title);
      text.appendChild(price);

      container.appendChild(img);
      container.appendChild(text);
      container.appendChild(addBtn);

      suggestionsList.appendChild(container);
    });

    wrapper.style.display = "";
    
  }

  // ===== AGGIUNGI SUGGERIMENTO ALL'ORDINE =====
  addSuggestionToOrder(suggestion, restaurantId) {
    const currentSelected = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    const currentNotes = JSON.parse(localStorage.getItem("totemino_notes") || "[]");
    const suggestedItems = JSON.parse(localStorage.getItem("totemino_suggested_items") || "[]");
    
    let itemExists = false;
    
    if (currentSelected.length % 3 === 0 && currentSelected.length > 0) {
      for (let i = 0; i < currentSelected.length; i += 3) {
        if (currentSelected[i] === suggestion.name) {
          const currentQty = parseInt(currentSelected[i + 2]) || 0;
          currentSelected[i + 2] = (currentQty + 1).toString();
          itemExists = true;
          break;
        }
      }
    }
    
    if (!itemExists) {
      currentSelected.push(suggestion.name, "{}", "1");
      currentNotes.push("");
    }
    
    if (!suggestedItems.includes(suggestion.name)) {
      suggestedItems.push(suggestion.name);
    }
    
    localStorage.setItem("totemino_selected", JSON.stringify(currentSelected));
    localStorage.setItem("totemino_notes", JSON.stringify(currentNotes));
    localStorage.setItem("totemino_suggested_items", JSON.stringify(suggestedItems));
    
    // Ricalcola totale
    let total = 0;
    for (let i = 0; i < currentSelected.length; i += 3) {
      const itemName = currentSelected[i];
      const qty = parseInt(currentSelected[i + 2]) || 1;
      
      for (const category in this.menuData) {
        const item = this.menuData[category].find(it => it.name === itemName);
        if (item) {
          total += item.price * qty;
          break;
        }
      }
    }
    
    const count = currentSelected.length / 3;
    localStorage.setItem("totemino_total", total.toFixed(2));
    localStorage.setItem("totemino_count", count.toString());
    
    window.location.reload();
  }
}

// ===== INIZIALIZZAZIONE =====
const suggestionsEngine = new SuggestionsEngine();

async function initializeSuggestions(menuData, restaurantId) {
  
  
  if (!menuData) {
    console.error('❌ ERRORE CRITICO: menuData è undefined/null! Impossibile inizializzare suggerimenti.');
    console.error('   Assicurati di caricare il menu prima di chiamare initializeSuggestions()');
    return;
  }
  
  if (!restaurantId) {
    console.error('❌ ERRORE CRITICO: restaurantId è undefined/null!');
    return;
  }
  
  suggestionsEngine.loadMenuData(menuData, restaurantId);
  await suggestionsEngine.renderSuggestions(restaurantId);
}

// ===== EXPORT =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SuggestionsEngine, initializeSuggestions };
}