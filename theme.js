// ===== GESTIONE TEMA =====
class ThemeManager {
  constructor() {
    this.themeButton = document.getElementById('theme');
    this.html = document.documentElement;
    this.logo = document.querySelector('.theme-img');
    this.faqSection = document.querySelector('.faq-section');
    this.oldTheme = null;
    this.init();
  }
  
  init() {
    const savedTheme = localStorage.getItem('totemino_theme') || 
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.setTheme(savedTheme);
    
    this.themeButton?.addEventListener('click', () => this.toggleTheme());
    this.initFaqObserver();
  }
  
  setTheme(theme) {
    this.html.setAttribute('data-theme', theme);
    localStorage.setItem('totemino_theme', theme);
    document.querySelectorAll('.theme-img').forEach(img => {
      const src = img.getAttribute(`data-${theme}`);
      if (src) img.src = src;
    });
  }
  
  toggleTheme() {
    const newTheme = this.html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    this.themeButton?.classList.add('theme-clicked');
    setTimeout(() => this.themeButton?.classList.remove('theme-clicked'), 200);
  }
  
  initFaqObserver() {
    if (!this.faqSection || !this.logo) return;
    
    new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Salva il tema corrente solo la prima volta
          if (!this.oldTheme) {
            this.oldTheme = this.html.getAttribute('data-theme');
          }
          this.logo.src = this.logo.getAttribute('data-dark');
        } else {
          // Ripristina il tema originale
          if (this.oldTheme) {
            this.logo.src = this.logo.getAttribute(`data-${this.oldTheme}`);
          }
        }
      });
    }, { 
      threshold: 0,
      rootMargin: '20% 0px -80% 0px' // Attiva quando la sezione è al 20% dall'alto dello schermo
    }).observe(this.faqSection);
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
  document.querySelectorAll(".theme-img").forEach(img => {
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



