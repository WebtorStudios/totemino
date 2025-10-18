// ===== GESTIONE TEMA SCURO =====
class ThemeManager {
  constructor() {
    this.themeButton = document.getElementById('theme');
    this.html = document.documentElement;
    this.init();
  }

  init() {
    // Carica tema salvato o preferenza sistema
    const savedTheme = this.getSavedTheme();
    this.setTheme(savedTheme);

    // Event listener per il bottone
    this.themeButton?.addEventListener('click', () => this.toggleTheme());

    // Rileva cambi di preferenza sistema (opzionale)
    this.watchSystemTheme();
  }

  getSavedTheme() {
    const current = this.html.getAttribute('data-theme');
    if (current) return current;
    const saved = localStorage.getItem('totemino_theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  setTheme(theme) {
    this.html.setAttribute('data-theme', theme);
    localStorage.setItem('totemino_theme', theme);
    updateThemeImages(); // aggiorna tutte le immagini (incluso il bottone)
  }

  toggleTheme() {
    const current = this.html.getAttribute('data-theme') || 'light';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    this.addToggleAnimation();

    dispatchThemeChange(newTheme);
  }

  addToggleAnimation() {
    this.themeButton?.classList.add('theme-clicked');
    setTimeout(() => this.themeButton?.classList.remove('theme-clicked'), 200);
  }

  watchSystemTheme() {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        if (!localStorage.getItem('totemino_theme')) {
          const newTheme = e.matches ? 'dark' : 'light';
          this.setTheme(newTheme);
        }
      });
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
document.addEventListener("themeChanged", () => {
  updateThemeImages();
});

// ===== EVENTO PERSONALIZZATO =====
function dispatchThemeChange(theme) {
  const event = new CustomEvent('themeChanged', { detail: { theme } });
  document.dispatchEvent(event);
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
document.addEventListener("themeChanged", () => {
  updateThemeImages();
});

// ===== EVENTO PERSONALIZZATO =====
function dispatchThemeChange(theme) {
  const event = new CustomEvent('themeChanged', { detail: { theme } });
  document.dispatchEvent(event);
}


