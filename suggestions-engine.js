class SuggestionsEngine {
  constructor() {
    this.menuData = {};
    this.currentOrder = [];
    this.userPreferences = null;
    this.userId = null;
    this.restaurantId = null;
  }

  canUsePreferences() {
    return typeof window.CookieConsent !== 'undefined' && window.CookieConsent.canTrackUser();
  }

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
      
      return this.userPreferences;
    } catch (error) {
      return null;
    }
  }

  loadMenuData(menuData, restaurantId) {
    this.restaurantId = restaurantId;
    this.menuData = {};
    
    if (menuData && menuData.categories && Array.isArray(menuData.categories)) {
      menuData.categories.forEach(cat => {
        if (cat.name && cat.items) {
          this.menuData[cat.name] = cat.items || [];
        }
      });
    }
  }

  getAvailableItemsByCategory() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeFilter = urlParams.get('type');
    
    if (Object.keys(this.menuData).length === 0) {
      return {};
    }
    
    const itemsByCategory = {};
    
    for (const [category, items] of Object.entries(this.menuData)) {
      const validItems = items.filter(item => {
        if (item.visible === false) {
          return false;
        }
        
        if (typeFilter) {
          const hasMenuType = item.menuType && Array.isArray(item.menuType);
          const includesType = hasMenuType && item.menuType.includes(typeFilter);
          return includesType;
        } else {
          return true;
        }
      });
      
      if (validItems.length > 0) {
        itemsByCategory[category] = validItems;
      }
    }
    
    return itemsByCategory;
  }

  loadCurrentOrder() {
    const selectedItems = JSON.parse(localStorage.getItem("totemino_selected") || "[]");
    this.currentOrder = [];
    
    if (selectedItems.length === 0) {
      return;
    }
    
    if (selectedItems.length % 3 !== 0) {
      return;
    }
    
    for (let i = 0; i < selectedItems.length; i += 3) {
      const itemName = selectedItems[i];
      const quantity = parseInt(selectedItems[i + 2]) || 1;
      
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

  getMissingCategories(availableCategories) {
    const orderedCategories = new Set(
      this.currentOrder
        .map(item => item.category)
        .filter(cat => cat !== null)
    );
    
    const missing = availableCategories.filter(cat => !orderedCategories.has(cat));
    return missing;
  }

  calculatePreferenceScore(item) {
    if (!this.userPreferences) return 0;

    let totalScore = 0;
    
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

  generateSeed() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeFilter = urlParams.get('type') || 'all';
    
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

  async generateSuggestions() {
    this.loadCurrentOrder();
    await this.loadUserPreferences();
    
    const itemsByCategory = this.getAvailableItemsByCategory();
    const availableCategories = Object.keys(itemsByCategory);
    
    if (availableCategories.length === 0) {
      return [];
    }
    
    const missingCategories = this.getMissingCategories(availableCategories);
    const categoriesToSuggest = missingCategories.length > 0 ? missingCategories : availableCategories;
    const currentItemNames = new Set(this.currentOrder.map(item => item.name));
    const seed = this.generateSeed();
    const suggestions = [];
    
    for (const category of categoriesToSuggest) {
      const categoryItems = itemsByCategory[category].filter(
        item => !currentItemNames.has(item.name)
      );
      
      if (categoryItems.length === 0) {
        continue;
      }
      
      const scoredItems = categoryItems.map(item => ({
        ...item,
        img: item.imagePath,
        category,
        preferenceScore: this.calculatePreferenceScore(item)
      }));
      
      let selectedFromCategory;
      
      if (scoredItems.some(item => item.preferenceScore > 0)) {
        scoredItems.sort((a, b) => b.preferenceScore - a.preferenceScore);
        selectedFromCategory = scoredItems.slice(0, 2);
      } else {
        const shuffled = this.seededShuffle(scoredItems, seed + suggestions.length);
        selectedFromCategory = shuffled.slice(0, 2);
      }
      
      suggestions.push(...selectedFromCategory);
      
      if (suggestions.length >= 4) {
        break;
      }
    }
    
    return suggestions.slice(0, 4);
  }

  async renderSuggestions(restaurantId) {
    const suggestions = await this.generateSuggestions();
    const wrapper = document.querySelector(".suggestions-wrapper");
    const suggestionsList = document.querySelector(".suggestions-list");
    
    if (!wrapper || !suggestionsList) {
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
      img.src = suggestion.imagePath;
      img.alt = suggestion.name;
      img.onerror = () => { img.src = 'img/placeholder.png'; };

      const text = document.createElement("div");
      text.className = "suggested-text";

      const title = document.createElement("h4");
      title.textContent = suggestion.name;

      const price = document.createElement("p");
      if (suggestion.customizable) {
        price.textContent = suggestion.price < 0.01 ? "Seleziona" : `€${suggestion.price.toFixed(2)} + Modifica`;
        price.classList.add("customizable-price");
      } else {
        price.textContent = `€${suggestion.price.toFixed(2)}`;
      }

      const addBtn = document.createElement("button");
      addBtn.className = "add-btn";
      addBtn.textContent = "+";

      addBtn.onclick = () => {
        if (suggestion.customizable) {
          this.openCustomizationForSuggestion(suggestion, restaurantId);
        } else {
          this.addSuggestionToOrder(suggestion, restaurantId);
        }
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

  openCustomizationForSuggestion(suggestion, restaurantId) {
    const item = {
      name: suggestion.name,
      displayName: suggestion.name,
      price: suggestion.price,
      originalPrice: suggestion.price,
      img: suggestion.imagePath,
      ingredients: suggestion.description ? suggestion.description.split(",").map(i => i.trim()) : [],
      customizable: true,
      customizationGroup: suggestion.customizationGroup,
      category: suggestion.category
    };
    
    if (typeof CustomizationScreen !== 'undefined' && CustomizationScreen.open) {
      CustomizationScreen.open(item);
    }
  }

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

const suggestionsEngine = new SuggestionsEngine();

async function initializeSuggestions(menuData, restaurantId) {
  if (!menuData) {
    return;
  }
  
  if (!restaurantId) {
    return;
  }
  
  suggestionsEngine.loadMenuData(menuData, restaurantId);
  await suggestionsEngine.renderSuggestions(restaurantId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SuggestionsEngine, initializeSuggestions };
}
