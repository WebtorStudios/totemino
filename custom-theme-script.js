class CustomThemeManager {
  constructor() {
    this.hueSlider = document.getElementById('hue-slider');
    this.satSlider = document.getElementById('sat-slider');
    this.hueValue = document.getElementById('hue-value');
    this.satValue = document.getElementById('sat-value');
    this.saveBtn = document.getElementById('save-theme-btn');
    this.backBtn = document.getElementById('back-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.presetCards = document.querySelectorAll('.preset-card');
    this.modeButtons = document.querySelectorAll('.mode-btn');
    this.lightPreview = document.querySelector('.light-preview');
    this.darkPreview = document.querySelector('.dark-preview');
    
    this.restaurantId = null;
    this.activeMode = 'light';
    
    this.lightTheme = {
      hue: 0,
      sat: 1
    };
    
    this.darkTheme = {
      hue: 0,
      sat: 1
    };
    
    this.init();
  }
  
  getPageTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
  
  async init() {
    await this.checkAuth();
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    this.applyColors();
    this.updateResetButton();
  }
  
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      
      if (!data.success || data.requireLogin) {
        window.location.href = 'login.html';
        return;
      }
      
      this.restaurantId = data.user.restaurantId;
    } catch (error) {
      console.error('Errore verifica autenticazione:', error);
      window.location.href = 'login.html';
    }
  }
  
  async loadSettings() {
    if (!this.restaurantId) return;
    
    try {
      const response = await fetch(`/IDs/${this.restaurantId}/settings.json`);
      
      if (response.ok) {
        const settings = await response.json();
        
        if (settings.customTheme) {
          if (settings.customTheme.light && settings.customTheme.dark) {
            this.lightTheme.hue = settings.customTheme.light.hue || 0;
            this.lightTheme.sat = settings.customTheme.light.sat || 1;
            this.darkTheme.hue = settings.customTheme.dark.hue || 0;
            this.darkTheme.sat = settings.customTheme.dark.sat || 1;
          } else {
            this.lightTheme.hue = settings.customTheme.hue || 0;
            this.lightTheme.sat = settings.customTheme.sat || 1;
            this.darkTheme.hue = 0;
            this.darkTheme.sat = 1;
          }
        }
      }
    } catch (error) {
      console.error('Errore caricamento impostazioni:', error);
    }
  }
  
  setupEventListeners() {
    this.hueSlider.addEventListener('input', () => {
      this.handleSliderChange();
    });
    
    this.satSlider.addEventListener('input', () => {
      this.handleSliderChange();
    });
    
    this.modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchMode(btn.dataset.mode);
      });
    });
    
    this.presetCards.forEach(card => {
      card.addEventListener('click', () => {
        this.applyPreset(card);
      });
    });
    
    this.resetBtn.addEventListener('click', () => {
      this.resetToDefault();
    });
    
    this.saveBtn.addEventListener('click', () => this.saveTheme());
    this.backBtn.addEventListener('click', () => {
      window.location.href = `profile.html?id=${this.restaurantId}`;
    });
    
    // Listener per il cambio tema della pagina
    const themeObserver = new MutationObserver(() => {
      this.applyColors();
      this.updateResetButton();
    });
    
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }
  
  handleSliderChange() {
    const currentTheme = this.activeMode === 'light' ? this.lightTheme : this.darkTheme;
    
    currentTheme.hue = parseInt(this.hueSlider.value);
    currentTheme.sat = parseFloat(this.satSlider.value);
    
    this.updateValues();
    this.applyColors();
    this.clearActivePreset();
    this.updateResetButton();
  }
  
  switchMode(mode) {
    this.activeMode = mode;
    
    this.modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    this.lightPreview.classList.toggle('editing', mode === 'light');
    this.darkPreview.classList.toggle('editing', mode === 'dark');
    
    this.updateUI();
  }
  
  updateUI() {
    const currentTheme = this.activeMode === 'light' ? this.lightTheme : this.darkTheme;
    
    this.hueSlider.value = currentTheme.hue;
    this.satSlider.value = currentTheme.sat;
    
    this.updateValues();
  }
  
  updateValues() {
    const currentTheme = this.activeMode === 'light' ? this.lightTheme : this.darkTheme;
    
    this.hueValue.textContent = `${currentTheme.hue}°`;
    this.satValue.textContent = currentTheme.sat.toFixed(1);
  }
  
  applyPreset(card) {
    const lightHue = parseInt(card.dataset.lightHue);
    const lightSat = parseFloat(card.dataset.lightSat);
    const darkHue = parseInt(card.dataset.darkHue);
    const darkSat = parseFloat(card.dataset.darkSat);
    
    this.lightTheme.hue = lightHue;
    this.lightTheme.sat = lightSat;
    this.darkTheme.hue = darkHue;
    this.darkTheme.sat = darkSat;
    
    this.updateUI();
    this.applyColors();
    this.setActivePreset(card);
    this.updateResetButton();
  }
  
  applyColors() {
    const pageTheme = this.getPageTheme();
    const backgroundTheme = pageTheme === 'light' ? this.lightTheme : this.darkTheme;
    
    document.documentElement.style.setProperty('--bg-hue', `${backgroundTheme.hue}deg`);
    document.documentElement.style.setProperty('--bg-sat', backgroundTheme.sat);
    
    const lightCircles = document.querySelectorAll('.light-preview .preview-circle');
    lightCircles.forEach(circle => {
      circle.style.filter = `hue-rotate(${this.lightTheme.hue}deg) saturate(${this.lightTheme.sat})`;
    });
    
    const darkCircles = document.querySelectorAll('.dark-preview .preview-circle');
    darkCircles.forEach(circle => {
      circle.style.filter = `hue-rotate(${this.darkTheme.hue}deg) saturate(${this.darkTheme.sat})`;
    });
  }
  
  setActivePreset(activeCard) {
    this.presetCards.forEach(card => card.classList.remove('active'));
    activeCard.classList.add('active');
  }
  
  clearActivePreset() {
    this.presetCards.forEach(card => card.classList.remove('active'));
  }
  
  resetToDefault() {
    this.lightTheme.hue = 0;
    this.lightTheme.sat = 1;
    this.darkTheme.hue = 0;
    this.darkTheme.sat = 1;
    
    this.updateUI();
    this.applyColors();
    this.clearActivePreset();
    this.updateResetButton();
  }
  
  updateResetButton() {
    const isDefault = this.lightTheme.hue === 0 && this.lightTheme.sat === 1 &&
                      this.darkTheme.hue === 0 && this.darkTheme.sat === 1;
    
    this.resetBtn.style.display = isDefault ? 'none' : 'flex';
  }
  
  async saveTheme() {
    if (!this.restaurantId) {
      this.showNotification('Errore: ID ristorante non trovato', 'error');
      return;
    }
    
    try {
      const settingsResponse = await fetch(`/IDs/${this.restaurantId}/settings.json`);
      
      if (!settingsResponse.ok) {
        throw new Error('Impossibile caricare le impostazioni');
      }
      
      const settings = await settingsResponse.json();
      
      settings.customTheme = {
        light: {
          hue: this.lightTheme.hue,
          sat: this.lightTheme.sat
        },
        dark: {
          hue: this.darkTheme.hue,
          sat: this.darkTheme.sat
        }
      };
      
      const saveResponse = await fetch(`/save-settings/${this.restaurantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      });
      
      const result = await saveResponse.json();
      
      if (result.success) {
        this.showNotification('✓ Tema applicato con successo!', 'success');
      } else {
        throw new Error(result.message || 'Errore nel salvataggio');
      }
      
    } catch (error) {
      console.error('Errore salvataggio tema:', error);
      this.showNotification('✗ Errore nel salvataggio del tema', 'error');
    }
  }
  
  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CustomThemeManager();
  });
} else {
  new CustomThemeManager();
}