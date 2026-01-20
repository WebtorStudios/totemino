// ===============================
// THEME MANAGER
// ===============================
class ThemeManager {
  constructor() {
    this.html = document.documentElement;
    this.themeButton = document.getElementById("theme");
    this.customTheme = null;

    this.init();
  }

  init() {
    const savedTheme =
      localStorage.getItem("totemino_theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");

    this.setTheme(savedTheme);
    this.loadCustomTheme();

    this.themeButton?.addEventListener("click", () => this.toggleTheme());
  }

  setTheme(theme) {
    this.html.setAttribute("data-theme", theme);
    localStorage.setItem("totemino_theme", theme);

    // Applica tema custom se presente
    if (this.customTheme) {
      this.applyCustomTheme();
    }

    // Notifica il cambio tema
    this.dispatchThemeChange(theme);
  }

  toggleTheme() {
    const current = this.html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    this.setTheme(next);

    // Animazione bottone
    this.themeButton?.classList.add("theme-clicked");
    setTimeout(() => {
      this.themeButton?.classList.remove("theme-clicked");
    }, 200);
  }

  async loadCustomTheme() {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get("id");
    if (!restaurantId) return;

    try {
      const res = await fetch(`/IDs/${restaurantId}/settings.json`);
      if (!res.ok) return;

      const settings = await res.json();

      if (
        settings.customTheme &&
        settings.customTheme.light &&
        settings.customTheme.dark
      ) {
        this.customTheme = settings.customTheme;
        this.applyCustomTheme();
      }
    } catch (err) {
      console.error("Errore caricamento tema custom:", err);
    }
  }

  applyCustomTheme() {
    if (!this.customTheme) return;

    const currentTheme =
      this.html.getAttribute("data-theme") || "light";

    const themeConfig = this.customTheme[currentTheme];
    if (!themeConfig) return;

    document.documentElement.style.setProperty(
      "--bg-hue",
      `${themeConfig.hue}deg`
    );
    document.documentElement.style.setProperty(
      "--bg-sat",
      themeConfig.sat
    );
  }

  dispatchThemeChange(theme) {
    document.dispatchEvent(
      new CustomEvent("themeChanged", {
        detail: { theme }
      })
    );
  }
}

// ===============================
// THEME IMAGES HANDLER
// ===============================
function updateThemeImages() {
  const theme =
    localStorage.getItem("totemino_theme") || "light";

  document
    .querySelectorAll(".theme-img:not(#logoSwap)")
    .forEach(img => {
      const light = img.getAttribute("data-light");
      const dark = img.getAttribute("data-dark");

      if (!light || !dark) return;
      img.src = theme === "dark" ? dark : light;
    });
}

// Applica subito
updateThemeImages();

// Aggiorna a ogni cambio tema
document.addEventListener("themeChanged", updateThemeImages);

// ===============================
// INIT
// ===============================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.themeManager = new ThemeManager();
  });
} else {
  window.themeManager = new ThemeManager();
}
