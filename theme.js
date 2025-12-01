// ===== GESTIONE TEMA =====
class ThemeManager {
  constructor() {
    this.themeButton = document.getElementById('theme');
    this.html = document.documentElement;
    // FIX: Escludi #logoSwap dalla gestione automatica
    this.logo = document.querySelector('.theme-img:not(#logoSwap)');
    this.oldTheme = null;
    this.init();
  }
  
  init() {
    const savedTheme = localStorage.getItem('totemino_theme') || 
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.setTheme(savedTheme);
    
    this.themeButton?.addEventListener('click', () => this.toggleTheme());
  }
  
  setTheme(theme) {
    this.html.setAttribute('data-theme', theme);
    localStorage.setItem('totemino_theme', theme);
    
    // FIX: Escludi #logoSwap dall'aggiornamento automatico
    document.querySelectorAll('.theme-img:not(#logoSwap)').forEach(img => {
      const src = img.getAttribute(`data-${theme}`);
      if (src) img.src = src;
    });
    
    // FIX: Lancia l'evento per logo-pop.js
    dispatchThemeChange(theme);
  }
  
  toggleTheme() {
    const newTheme = this.html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    this.themeButton?.classList.add('theme-clicked');
    setTimeout(() => this.themeButton?.classList.remove('theme-clicked'), 200);
  }
}

// Inizializza ThemeManager
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
  });
} else {
  window.themeManager = new ThemeManager();
}

// ===== GESTIONE IMMAGINI =====
function updateThemeImages() {
  const theme = localStorage.getItem("totemino_theme") || "light";
  // FIX: Escludi #logoSwap
  document.querySelectorAll(".theme-img:not(#logoSwap)").forEach(img => {
    const light = img.getAttribute("data-light");
    const dark  = img.getAttribute("data-dark");
    if (light && dark) img.src = theme === "dark" ? dark : light;
  });
}

// Aggiorna subito al caricamento
updateThemeImages();

// Aggiorna ogni volta che cambia tema
document.addEventListener("themeChanged", updateThemeImages);

// ===== EVENTO PERSONALIZZATO =====
function dispatchThemeChange(theme) {
  const event = new CustomEvent('themeChanged', { detail: { theme } });
  document.dispatchEvent(event);
}