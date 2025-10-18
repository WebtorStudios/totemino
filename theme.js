// ===== GESTIONE TEMA =====
class ThemeManager {
  constructor() {
    this.themeButton = document.getElementById('theme');
    this.html = document.documentElement;
    this.logo = document.querySelector('.theme-img');
    this.faqSection = document.querySelector('.faq-section');
    this.faqVisible = false;
    this.faqSavedTheme = null;
    this.init();
  }

  init() {
    const savedTheme = localStorage.getItem('totemino_theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    this.setTheme(savedTheme, { updateStorage: false, emitEvent: false });
    this.themeButton?.addEventListener('click', () => this.toggleTheme());
    this.initFaqObserver();
  }

  setTheme(theme, opts = { updateStorage: true, emitEvent: true }) {
    this.html.setAttribute('data-theme', theme);
    if (opts.updateStorage) localStorage.setItem('totemino_theme', theme);
    this.updateThemeImages(theme);

    // Se la FAQ è visibile mantieni logo forzato in versione dark
    if (this.faqVisible && this.logo) {
      const darkSrc = this.logo.getAttribute('data-dark');
      if (darkSrc) this.logo.src = darkSrc;
    }

    if (opts.emitEvent) dispatchThemeChange(theme);
  }

  toggleTheme() {
    const current = this.html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    this.themeButton?.classList.add('theme-clicked');
    setTimeout(() => this.themeButton?.classList.remove('theme-clicked'), 200);
  }

  updateThemeImages(theme) {
    const t = theme || localStorage.getItem('totemino_theme') || 'light';
    document.querySelectorAll('.theme-img').forEach(img => {
      // Non sovrascrivere il logo principale quando la faq è visibile.
      if (this.faqVisible && this.logo && img === this.logo) return;
      const src = img.getAttribute(`data-${t}`);
      if (src) img.src = src;
    });
  }

  initFaqObserver() {
    if (!this.faqSection || !this.logo) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!this.faqVisible) {
            this.faqVisible = true;
            this.faqSavedTheme = this.html.getAttribute('data-theme') || 'light';
            const darkSrc = this.logo.getAttribute('data-dark');
            if (darkSrc) this.logo.src = darkSrc;
          }
        } else {
          if (this.faqVisible) {
            this.faqVisible = false;
            const restoreSrc = this.logo.getAttribute(`data-${this.faqSavedTheme}`) ||
                               this.logo.getAttribute('data-light');
            if (restoreSrc) this.logo.src = restoreSrc;
            this.faqSavedTheme = null;
          }
        }
      });
    }, { threshold: 0.5 });

    observer.observe(this.faqSection);
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

// ===== EVENTO PERSONALIZZATO =====
function dispatchThemeChange(theme) {
  const event = new CustomEvent('themeChanged', { detail: { theme } });
  document.dispatchEvent(event);
}

// ===== GESTIONE IMMAGINI (listener esterno compatibile) =====
document.addEventListener('themeChanged', (e) => {
  // aggiorna tutte le immagini tranne il logo quando la faq è visibile
  const theme = e?.detail?.theme || localStorage.getItem('totemino_theme') || 'light';
  document.querySelectorAll('.theme-img').forEach(img => {
    // se il logo è forzato dalla FAQ, skip (il ThemeManager gestisce questo)
    if (window.themeManager?.faqVisible && img === window.themeManager.logo) return;
    const src = img.getAttribute(`data-${theme}`);
    if (src) img.src = src;
  });
});

// Aggiorna subito al caricamento (compatibilità se script caricato dopo DOM)
(function initialUpdate() {
  const theme = localStorage.getItem('totemino_theme') || 
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.querySelectorAll('.theme-img').forEach(img => {
    const src = img.getAttribute(`data-${theme}`);
    if (src) img.src = src;
  });
})();
