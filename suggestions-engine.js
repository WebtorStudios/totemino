// Sistema di suggerimenti intelligenti per Totemino - Versione Avanzata
class SuggestionsEngine {
  constructor() {
    this.menuData = {};
    this.currentOrder = [];
    this.userPreferences = null;
    this.userId = null;
  }

  // Ottiene l'ID utente dal localStorage
  getUserId() {
    return localStorage.getItem("totemino_user_id");
  }

  // Carica le preferenze dell'utente dal file locale
  async loadUserPreferences() {
    try {
      this.userId = this.getUserId();
      if (!this.userId) {
        console.log("Nessun userId trovato, utente nuovo");
        return null;
      }

      const response = await fetch('/userdata/users-preferences.json');
      if (!response.ok) {
        console.log("File preferenze non trovato");
        return null;
      }

      const allPreferences = await response.json();
      this.userPreferences = allPreferences[this.userId] || null;
      
      console.log("Preferenze utente caricate:", this.userPreferences);
      return this.userPreferences;
    } catch (error) {
      console.error("Errore caricamento preferenze:", error);
      return null;
    }
  }

  // Carica i dati del menu
  loadMenuData(menuData) {
    this.menuData = menuData;
  }

  // Carica l'ordine corrente dal localStorage
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
  }

  // Trova un prodotto nel menu
  findItemInMenu(itemName) {
    for (const [category, items] of Object.entries(this.menuData)) {
      const found = items.find(item => item.name === itemName);
      if (found) {
        return { ...found, category };
      }
    }
    return null;
  }

  // Analizza l'ordine corrente per categoria
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

  // Determina le categorie da cui suggerire (escludi quelle con 1+ items)
  getCategoriesToSuggest() {
    const categoryAnalysis = this.getCategoryAnalysis();
    const allCategories = Object.keys(this.menuData);
    
    // Filtra categorie: prendi solo quelle con 0 items nell'ordine
    const categoriesToSuggest = allCategories.filter(cat => {
      const count = categoryAnalysis[cat]?.count || 0;
      return count === 0;
    });
    
    console.log("📊 Analisi ordine corrente:", categoryAnalysis);
    console.log("🎯 Categorie da suggerire:", categoriesToSuggest);
    
    return categoriesToSuggest;
  }

  // Estrae gli ingredienti dalla descrizione del menu
  extractIngredientsFromDescription(description) {
    if (!description) return [];
    
    // Rimuovi punteggiatura e splitta per virgole
    return description
      .toLowerCase()
      .replace(/[^\w\s,]/g, '')
      .split(',')
      .map(ing => ing.trim())
      .filter(ing => ing.length > 0);
  }

  // Calcola lo score basato sul matching con le preferenze utente
  calculatePreferenceScore(item) {
    if (!this.userPreferences) {
      return 0;
    }

    // Estrae ingredienti dalla descrizione
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

    // Bonus per maggior numero di ingredienti matchati
    const matchPercentage = matchedIngredients / itemIngredients.length;
    const bonusScore = matchedIngredients * 2;
    
    return totalScore + bonusScore;
  }

  // Algoritmo principale per generare suggerimenti
  async generateSuggestions() {
    this.loadCurrentOrder();
    await this.loadUserPreferences();

    const suggestions = [];
    const currentItems = new Set(this.currentOrder.map(item => item.name));
    const categoriesToSuggest = this.getCategoriesToSuggest();

    console.log("🔍 Inizio generazione suggerimenti...");

    // STEP 1: Per ogni categoria mancante, trova i migliori 2 items
    const suggestionsByCategory = {};
    
    for (const category of categoriesToSuggest) {
      const categoryItems = this.menuData[category] || [];
      const scoredItems = [];

      // Calcola score per ogni item disponibile
      for (const item of categoryItems) {
        if (currentItems.has(item.name)) continue;
        
        const score = this.calculatePreferenceScore(item);
        scoredItems.push({ 
          ...item, 
          category, 
          preferenceScore: score 
        });
      }

      // Ordina per score decrescente
      scoredItems.sort((a, b) => b.preferenceScore - a.preferenceScore);
      
      // Prendi i top 2 items per categoria
      suggestionsByCategory[category] = scoredItems.slice(0, 2);
      
      console.log(`📦 ${category}: ${scoredItems.length} items disponibili, top 2 selezionati`);
    }

    // STEP 2: Distribuisci equamente tra le categorie per arrivare a 4 suggerimenti
    const maxSuggestions = 4;
    let remainingSlots = maxSuggestions;

    // Raccogli tutti i suggerimenti per categoria
    const categorizedSuggestions = [];

    for (const category of categoriesToSuggest) {
      const items = suggestionsByCategory[category];
      if (items && items.length > 0) {
        items.forEach(item => {
          if (remainingSlots > 0) {
            categorizedSuggestions.push(item);
            currentItems.add(item.name);
            remainingSlots--;
            console.log(`✅ Aggiunto: ${item.name} (${category}) - Score: ${item.preferenceScore}`);
          }
        });
      }
    }

    // STEP 3: Se ancora mancano slot, cerca items con alto score
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

      allRemainingItems.sort((a, b) => b.preferenceScore - a.preferenceScore);
      
      while (remainingSlots > 0 && allRemainingItems.length > 0) {
        const item = allRemainingItems.shift();
        categorizedSuggestions.push(item);
        currentItems.add(item.name);
        remainingSlots--;
        console.log(`✅ Aggiunto (riempimento): ${item.name} (${item.category}) - Score: ${item.preferenceScore}`);
      }
    }

    // STEP 4: Ordina per categoria (stesso ordine del menu)
    const categoryOrder = Object.keys(this.menuData);
    categorizedSuggestions.sort((a, b) => {
      return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    });

    suggestions.push(...categorizedSuggestions);

    console.log(`🎉 Generati ${suggestions.length} suggerimenti totali`);
    return suggestions.slice(0, maxSuggestions);
  }

  // Renderizza i suggerimenti nell'interfaccia
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

    // Renderizza ogni suggerimento
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

  // Aggiunge un suggerimento all'ordine
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

// Inizializza il sistema di suggerimenti
const suggestionsEngine = new SuggestionsEngine();

// Funzione di utilità per inizializzare i suggerimenti (async)
async function initializeSuggestions(menuData, restaurantId) {
  suggestionsEngine.loadMenuData(menuData);
  await suggestionsEngine.renderSuggestions(restaurantId);
}

// Esporta per l'uso in altri file
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SuggestionsEngine, initializeSuggestions };
}