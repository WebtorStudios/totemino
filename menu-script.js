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

function updateItemButtonUI(itemName) {
  const buttons = itemsContainer.querySelectorAll("button");
  buttons.forEach(btn => {
    const titleEl = btn.querySelector("h3");
    if (!titleEl) return;

    let baseName = titleEl.textContent.replace(/\s*\(x\d+\)$/, "");

    if (baseName === itemName) {
      const qty = selectedItems.get(itemName) || 0;

      if (qty > 1) {
        titleEl.textContent = `${itemName} (x${qty})`;
      } else {
        titleEl.textContent = itemName;
      }

      if (qty > 0) {
        btn.classList.add("selected");
      } else {
        btn.classList.remove("selected");
      }
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
  for (const [name, qty] of selectedItems) {
    arr.push(name, qty.toString());
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
    for (let i = 0; i < arr.length; i += 2) {
      const name = arr[i];
      const qty = parseInt(arr[i + 1]);
      if (name && qty && qty > 0) {
        selectedItems.set(name, qty);
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
  
  for (const [name, qty] of selectedItems) {
    const item = findItemByName(name);
    if (!item) continue;
    
    const itemDiv = document.createElement("div");
    itemDiv.className = "cart-popup-item";
    
    const img = document.createElement("img");
    img.src = `IDs/${restaurantId}/${item.img}`;
    img.onerror = () => { img.src = 'img/placeholder.png'; };
    
    itemDiv.appendChild(img);
    
    if (qty > 1) {
      const badge = document.createElement("span");
      badge.className = "cart-popup-badge";
      badge.textContent = qty;
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

  categories = menuJson.categories.map(cat => cat.name);

  nav.innerHTML = "";
  const pill = document.createElement("div");
  pill.className = "pill";
  nav.appendChild(pill);

  categories.forEach((cat, index) => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    if (index === 0) btn.classList.add("active");
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
        isSuggested: false
      });
    });
  });

  loadSelectionFromStorage();
  setActiveCategory(0);
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
      const itemKey = item.name;

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
      const qty = selectedItems.get(itemKey) || 0;
      if (qty > 1) {
        title.textContent = `${item.displayName} (x${qty})`;
      } else {
        title.textContent = item.displayName;
      }

      const price = document.createElement("p");
      price.textContent = `€${item.price.toFixed(2)}`;

      btn.appendChild(img);
      btn.appendChild(title);
      btn.appendChild(price);

      if (selectedItems.has(itemKey)) {
        btn.classList.add("selected");
      }

      btn.addEventListener("click", (event) => {
        if (event.target.closest(".info-btn")) return;
      
        if (selectedItems.has(itemKey)) {
          let oldQty = selectedItems.get(itemKey);
          if (oldQty <= 1) {
            selectedItems.delete(itemKey);
            total -= item.price;
            count -= 1;
            btn.classList.remove("selected");
          } else {
            selectedItems.set(itemKey, oldQty - 1);
            total -= item.price;
            count -= 1;
          }
        } else {
          selectedItems.set(itemKey, 1);
          total += item.price;
          count += 1;
          btn.classList.add("selected");
        }
      
        updateCart();
        saveSelectionToStorage();
        updateItemButtonUI(itemKey);
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
  for (const [name, qty] of selectedItems) {
    const item = findItemByName(name);
    if (item) {
      total += item.price * qty;
      count += qty;
    }
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

  if (item.allergens.length === 0) {
    allergenTitle.style.display = "none";
  } else {
    allergenTitle.style.display = "block";
  }
  
  popupImg.src = `IDs/${restaurantId}/${item.img}`;
  popupImg.onerror = () => {
    popupImg.src = 'img/placeholder.png';
  };
  popupTitle.textContent = item.displayName;
  popupIngredients.textContent = item.ingredients.join(", ");
  popupAllergens.innerHTML = "";

  popupControls.innerHTML = "";
  const minusBtn = document.createElement("button");
  minusBtn.textContent = "−";
  minusBtn.className = "popup-minus";

  const qtyDisplay = document.createElement("span");
  qtyDisplay.className = "popup-qty";

  const plusBtn = document.createElement("button");
  plusBtn.textContent = "+";
  plusBtn.className = "popup-plus";

  let qty = selectedItems.get(item.name) || 0;
  qtyDisplay.textContent = qty;

  minusBtn.addEventListener("click", () => {
    if (qty > 0) {
      qty--;
      if (qty === 0) {
        selectedItems.delete(item.name);
      } else {
        selectedItems.set(item.name, qty);
      }
      total -= item.price;
      count -= 1;
      qtyDisplay.textContent = qty;
      updateCart();
      saveSelectionToStorage();
      updateItemButtonUI(item.name);
    }
  });
  
  plusBtn.addEventListener("click", () => {
    qty++;
    selectedItems.set(item.name, qty);
    total += item.price;
    count += 1;
    qtyDisplay.textContent = qty;
    updateCart();
    saveSelectionToStorage();
    updateItemButtonUI(item.name);
  });

  popupControls.appendChild(minusBtn);
  popupControls.appendChild(qtyDisplay);
  popupControls.appendChild(plusBtn);

  if (item.allergens.length > 0) {
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
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        popupMsg.style.top = `${centerY - 60}px`;
        popupMsg.style.left = `${centerX - popupMsg.offsetWidth / 2}px`;

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
  }

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
      window.location.href = `checkout.html?id=${encodeURIComponent(restaurantId)}`;
    }
  });
}

let startX = 0, endX = 0;
if (itemsContainer) {
  itemsContainer.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });
  itemsContainer.addEventListener("touchend", (e) => {
    endX = e.changedTouches[0].clientX;
    handleSwipe();
  });
}

function handleSwipe() {
  const threshold = 50;
  if (endX - startX > threshold) {
    lastSwipeDirection = "right";
    setActiveCategory(currentCategoryIndex - 1);
  } else if (startX - endX > threshold) {
    lastSwipeDirection = "left";
    setActiveCategory(currentCategoryIndex + 1);
  }
}

loadMenu();
