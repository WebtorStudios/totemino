// ============================================
// SISTEMA SUGGERIMENTI - GDPR COMPLIANT
// ============================================

class SuggestionsEngine {
  constructor() {
    this.menuData = {};
    this.currentOrder = [];
    this.userPreferences = null;
    this.userId = null;
  }

  // ===== CONTROLLO CONSENSO =====
  canUsePreferences() {
    if (typeof window.CookieConsent === 'undefined') {
      console.warn('⚠️ Sistema cookie non caricato');
      return false;
    }
    return window.CookieConsent.canTrackUser();
  }

  // ===== OTTIENI USER ID (CON CONTROLLO CONSENSO) =====
  getUserId() {
    if (!this.canUsePreferences()) {
      console.log('🚫 Suggerimenti personalizzati disabilitati (consenso negato)');
      return null;
    }
    
    // Usa la funzione globale sicura
    if (typeof window.getUserId === 'function') {
      return window.getUserId();
    }
    
    // Fallback (non dovrebbe mai accadere)
    return localStorage.getItem("totemino_user_id");
  }

  // ===== CARICA PREFERENZE (CON CONTROLLO CONSENSO) =====
  async loadUserPreferences() {
    try {
      // ✅ CONTROLLO CONSENSO
      if (!this.canUsePreferences()) {
        console.log('ℹ️ Suggerimenti generici (senza profilazione)');
        this.userPreferences = null;
        return null;
      }

      this.userId = this.getUserId();
      
      if (!this.userId) {
        console.log('ℹ️ Nessun userId, suggerimenti generici');
        return null;
      }

      // ✅ Consenso OK: carica preferenze
      const response = await fetch('/userdata/users-preferences.json');
      
      if (!response.ok) {
        console.log('ℹ️ File preferenze non trovato');
        return null;
      }

      const allPreferences = await response.json();
      this.userPreferences = allPreferences[this.userId] || null;
      
      if (this.userPreferences) {
        console.log('✅ Preferenze utente caricate:', Object.keys(this.userPreferences).length, 'ingredienti');
      } else {
        console.log('ℹ️ Nessuna preferenza salvata per questo utente');
      }
      
      return this.userPreferences;
      
    } catch (error) {
      console.error('❌ Errore caricamento preferenze:', error);
      return null;
    }
  }

  // ===== CARICA DATI MENU =====
  loadMenuData(menuData) {
    this.menuData = menuData;
    console.log('📋 Menu caricato:', Object.keys(menuData).length, 'categorie');
  }

  // ===== CARICA ORDINE CORRENTE =====
  loadCurrentOrder() {
    const selectedItems = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    this.currentOrder = [];
    
    for (let i = 0; i < selectedItems.length; i += 2) {
      const itemName = selectedItems[i];
      const quantity = parseInt(selectedItems[i + 1]) || 1;
      
      const itemDetails = this.findItemInMenu(itemName);
      if (itemDetails) {
        this.currentOrder.push({
          name: itemName,
          quantity: quantity,
          category: itemDetails.category
        });
      }
    }
    
    console.log('🛒 Ordine corrente:', this.currentOrder.length, 'items');
  }

  // ===== TROVA ITEM NEL MENU =====
  findItemInMenu(itemName) {
    for (const [category, items] of Object.entries(this.menuData)) {
      const found = items.find(item => item.name === itemName);
      if (found) {
        return { ...found, category };
      }
    }
    return null;
  }

  // ===== ANALISI CATEGORIE ORDINE =====
  getCategoryAnalysis() {
    const analysis = {};
    
    this.currentOrder.forEach(item => {
      if (!analysis[item.category]) {
        analysis[item.category] = {
          count: 0,
          items: []
        };
      }
      analysis[item.category].count += item.quantity;
      analysis[item.category].items.push(item.name);
    });
    
    return analysis;
  }

  // ===== CATEGORIE DA SUGGERIRE =====
  getCategoriesToSuggest() {
    const categoryAnalysis = this.getCategoryAnalysis();
    const allCategories = Object.keys(this.menuData);
    
    const categoriesToSuggest = allCategories.filter(cat => {
      const count = categoryAnalysis[cat]?.count || 0;
      return count === 0;
    });
    
    console.log('🎯 Categorie mancanti:', categoriesToSuggest);
    return categoriesToSuggest;
  }

  // ===== ESTRAI INGREDIENTI =====
  extractIngredientsFromDescription(description) {
    if (!description) return [];
    
    return description
      .toLowerCase()
      .replace(/[^\w\s,]/g, '')
      .split(',')
      .map(ing => ing.trim())
      .filter(ing => ing.length > 0);
  }

  // ===== CALCOLA SCORE PREFERENZE =====
  calculatePreferenceScore(item) {
    // Se non ci sono preferenze, score = 0 (suggerimenti casuali)
    if (!this.userPreferences) {
      return 0;
    }

    const itemIngredients = this.extractIngredientsFromDescription(item.description);
    
    if (itemIngredients.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let matchedIngredients = 0;

    itemIngredients.forEach(ingredient => {
      const cleanIngredient = ingredient.toLowerCase().trim();
      if (this.userPreferences[cleanIngredient]) {
        totalScore += this.userPreferences[cleanIngredient];
        matchedIngredients++;
      }
    });

    const bonusScore = matchedIngredients * 2;
    return totalScore + bonusScore;
  }

  // ===== GENERA SUGGERIMENTI =====
  async generateSuggestions() {
    this.loadCurrentOrder();
    
    // ✅ Carica preferenze (con controllo consenso interno)
    await this.loadUserPreferences();

    const suggestions = [];
    const currentItems = new Set(this.currentOrder.map(item => item.name));
    const categoriesToSuggest = this.getCategoriesToSuggest();

    console.log('🔍 Generazione suggerimenti...');
    
    if (this.userPreferences) {
      console.log('✨ Modalità: PERSONALIZZATI (con preferenze)');
    } else {
      console.log('🎲 Modalità: GENERICI (senza preferenze)');
    }

    // STEP 1: Per ogni categoria, trova i migliori 2 items
    const suggestionsByCategory = {};
    
    for (const category of categoriesToSuggest) {
      const categoryItems = this.menuData[category] || [];
      const scoredItems = [];

      for (const item of categoryItems) {
        if (currentItems.has(item.name)) continue;
        
        const score = this.calculatePreferenceScore(item);
        scoredItems.push({ 
          ...item, 
          category, 
          preferenceScore: score 
        });
      }

      // Ordina per score (o casualmente se score = 0)
      scoredItems.sort((a, b) => {
        if (a.preferenceScore === 0 && b.preferenceScore === 0) {
          return Math.random() - 0.5; // Casuale
        }
        return b.preferenceScore - a.preferenceScore;
      });
      
      suggestionsByCategory[category] = scoredItems.slice(0, 2);
    }

    // STEP 2: Raccogli fino a 4 suggerimenti
    const maxSuggestions = 4;
    let remainingSlots = maxSuggestions;
    const categorizedSuggestions = [];

    for (const category of categoriesToSuggest) {
      const items = suggestionsByCategory[category];
      if (items && items.length > 0) {
        items.forEach(item => {
          if (remainingSlots > 0) {
            categorizedSuggestions.push(item);
            currentItems.add(item.name);
            remainingSlots--;
          }
        });
      }
    }

    // STEP 3: Riempimento se necessario
    if (remainingSlots > 0) {
      const allRemainingItems = [];
      
      Object.entries(this.menuData).forEach(([category, items]) => {
        items.forEach(item => {
          if (!currentItems.has(item.name)) {
            const score = this.calculatePreferenceScore(item);
            allRemainingItems.push({ ...item, category, preferenceScore: score });
          }
        });
      });

      allRemainingItems.sort((a, b) => {
        if (a.preferenceScore === 0 && b.preferenceScore === 0) {
          return Math.random() - 0.5;
        }
        return b.preferenceScore - a.preferenceScore;
      });
      
      while (remainingSlots > 0 && allRemainingItems.length > 0) {
        const item = allRemainingItems.shift();
        categorizedSuggestions.push(item);
        currentItems.add(item.name);
        remainingSlots--;
      }
    }

    // STEP 4: Ordina per categoria
    const categoryOrder = Object.keys(this.menuData);
    categorizedSuggestions.sort((a, b) => {
      return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    });

    suggestions.push(...categorizedSuggestions);

    console.log(`🎉 ${suggestions.length} suggerimenti generati`);
    return suggestions.slice(0, maxSuggestions);
  }

  // ===== RENDERIZZA SUGGERIMENTI =====
  async renderSuggestions(restaurantId) {
    const suggestions = await this.generateSuggestions();
    const wrapper = document.querySelector(".suggestions-wrapper");
    const suggestionsList = document.querySelector(".suggestions-list");
    
    if (!wrapper || !suggestionsList) return;

    suggestionsList.innerHTML = "";

    if (suggestions.length === 0) {
      wrapper.style.display = "none";
      return;
    }

    // Titolo
    const wrapperTitle = document.createElement("h3");
    const spanTotemino = document.createElement("span");
    spanTotemino.id = "title-name";
    spanTotemino.textContent = "Totemino";
    wrapperTitle.appendChild(spanTotemino);
    wrapperTitle.appendChild(document.createTextNode(" ti consiglia:"));
    suggestionsList.appendChild(wrapperTitle);

    // Renderizza suggerimenti
    suggestions.forEach(suggestion => {
      const container = document.createElement("div");
      container.className = "suggested-single";

      const img = document.createElement("img");
      img.src = `IDs/${restaurantId}/${suggestion.img}`;
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
    
    let itemExists = false;
    
    for (let i = 0; i < currentSelected.length; i += 2) {
      if (currentSelected[i] === suggestion.name) {
        const currentQty = parseInt(currentSelected[i + 1]) || 0;
        currentSelected[i + 1] = (currentQty + 1).toString();
        itemExists = true;
        break;
      }
    }
    
    if (!itemExists) {
      currentSelected.push(suggestion.name, "1");
      currentNotes.push("");
    }
    
    localStorage.setItem("totemino_selected", JSON.stringify(currentSelected));
    localStorage.setItem("totemino_notes", JSON.stringify(currentNotes));
    
    window.location.reload();
  }
}

// ===== INIZIALIZZAZIONE =====
const suggestionsEngine = new SuggestionsEngine();

async function initializeSuggestions(menuData, restaurantId) {
  suggestionsEngine.loadMenuData(menuData);
  await suggestionsEngine.renderSuggestions(restaurantId);
}

// ===== EXPORT =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SuggestionsEngine, initializeSuggestions };
}

console.log('💡 Sistema suggerimenti GDPR caricato');
