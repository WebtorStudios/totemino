// ============================================
// SISTEMA COOKIE CONSENT - GDPR COMPLIANT
// ============================================

const COOKIE_CONSENT_KEY = 'totemino_cookie_consent';
const CONSENT_VERSION = '1.0'; // Incrementa se cambi il consenso

// ===== UTILITÀ GLOBALI =====
window.CookieConsent = {
    hasConsent: function(type) {
        const consent = getCookieConsent();
        if (!consent) return false;
        
        switch(type) {
            case 'necessary': return true; // Sempre consentiti
            case 'profiling': return consent.profiling === true;
            case 'analytics': return consent.analytics === true;
            default: return false;
        }
    },
    
    canTrackUser: function() {
        return this.hasConsent('profiling');
    },
    
    canUseAnalytics: function() {
        return this.hasConsent('analytics');
    },
    
    getUserIdSafe: function() {
        if (!this.canTrackUser()) return null;
        return localStorage.getItem("totemino_user_id");
    },
    
    setUserIdSafe: function(userId) {
        if (!this.canTrackUser()) {
            console.warn('🚫 Profilazione non consentita');
            return false;
        }
        localStorage.setItem("totemino_user_id", userId);
        return true;
    }
};

// ===== BANNER HTML =====
function injectCookieBanner() {
    if (document.getElementById('cookie-banner')) return;
    
    const bannerHTML = `
    <div id="cookie-banner">
        <div class="cookie-content">
            <div class="cookie-text">
                <h3>🍪 Questo sito utilizza cookie</h3>
                <p>
                    Utilizziamo cookie per migliorare la tua esperienza.
                    <a href="privacy-policy.html">Maggiori informazioni</a>
                </p>
                
                <div class="cookie-buttons">
                    <button class="cookie-btn cookie-btn-accept" onclick="acceptAllCookies()">
                        Accetta tutti
                    </button>
                    <button class="cookie-btn cookie-btn-necessary" onclick="acceptNecessaryCookies()">
                        Solo necessari
                    </button>
                    <button class="cookie-btn cookie-btn-settings" onclick="openCookieSettings()">
                        Personalizza
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div id="cookie-settings">
        <div class="settings-modal">
            <div class="settings-header">
                <h3>Impostazioni Cookie</h3>
                <button class="close-settings" onclick="closeCookieSettings()">×</button>
            </div>

            <div class="cookie-category">
                <div class="category-header">
                    <h4>Cookie Tecnici</h4>
                    <label class="toggle-switch">
                        <input type="checkbox" id="cookie-necessary" checked disabled>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <p class="category-description">
                    Necessari per il funzionamento del sito. Non possono essere disattivati.
                </p>
            </div>

            <div class="cookie-category">
                <div class="category-header">
                    <h4>Cookie di Profilazione</h4>
                    <label class="toggle-switch">
                        <input type="checkbox" id="cookie-profiling">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <p class="category-description">
                    Memorizzano le tue preferenze per suggerimenti personalizzati.
                </p>
            </div>

            <div class="cookie-category">
                <div class="category-header">
                    <h4>Cookie Analitici</h4>
                    <label class="toggle-switch">
                        <input type="checkbox" id="cookie-analytics">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <p class="category-description">
                    Raccolgono statistiche anonime per migliorare il sito.
                </p>
            </div>

            <div class="settings-actions">
                <button class="cookie-btn cookie-btn-accept" style="flex: 1" onclick="saveCustomCookieSettings()">
                    Salva preferenze
                </button>
                <button class="cookie-btn cookie-btn-necessary" onclick="closeCookieSettings()">
                    Annulla
                </button>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', bannerHTML);
}

// ===== GESTIONE CONSENSO =====
function getCookieConsent() {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!saved) return null;
    
    try {
        const consent = JSON.parse(saved);
        // Verifica versione consenso
        if (consent.version !== CONSENT_VERSION) {
            
            localStorage.removeItem(COOKIE_CONSENT_KEY);
            return null;
        }
        return consent;
    } catch (e) {
        console.error('Errore parsing consenso:', e);
        return null;
    }
}

function saveCookieConsent(consent) {
    consent.version = CONSENT_VERSION;
    consent.timestamp = new Date().toISOString();
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    
}

// ===== AZIONI BANNER =====
function acceptAllCookies() {
    const consent = {
        necessary: true,
        profiling: true,
        analytics: true
    };
    saveCookieConsent(consent);
    applyCookieSettings(consent);
    hideBanner();
}

function acceptNecessaryCookies() {
    const consent = {
        necessary: true,
        profiling: false,
        analytics: false
    };
    saveCookieConsent(consent);
    applyCookieSettings(consent);
    hideBanner();
}

function openCookieSettings() {
    const consent = getCookieConsent() || {
        necessary: true,
        profiling: false,
        analytics: false
    };
    document.getElementById('cookie-profiling').checked = consent.profiling;
    document.getElementById('cookie-analytics').checked = consent.analytics;
    document.getElementById('cookie-settings').classList.add('show');
}

function closeCookieSettings() {
    document.getElementById('cookie-settings').classList.remove('show');
}

function saveCustomCookieSettings() {
    const consent = {
        necessary: true,
        profiling: document.getElementById('cookie-profiling').checked,
        analytics: document.getElementById('cookie-analytics').checked
    };
    saveCookieConsent(consent);
    applyCookieSettings(consent);
    closeCookieSettings();
    hideBanner();
}

function hideBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('show');
}

// ===== APPLICAZIONE CONSENSO =====
function applyCookieSettings(consent) {
    
    
    // PROFILAZIONE
    if (consent.profiling) {
        
        window.PROFILING_ENABLED = true;
    } else {
        
        window.PROFILING_ENABLED = false;
        
        // PULISCI DATI DI PROFILAZIONE
        localStorage.removeItem('totemino_user_id');
        
    }
    
    // ANALYTICS
    if (consent.analytics) {
        
        window.ANALYTICS_ENABLED = true;
    } else {
        
        window.ANALYTICS_ENABLED = false;
    }
    
    // Dispatch evento per notificare altri script
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { 
        detail: consent 
    }));
}

// ===== INIZIALIZZAZIONE =====
function initCookieBanner() {
    const consent = getCookieConsent();
    
    if (!consent) {
        // Nessun consenso: mostra banner
        
        injectCookieBanner();
        document.getElementById('cookie-banner').classList.add('show');
        
        // Imposta tutto a false di default
        window.PROFILING_ENABLED = false;
        window.ANALYTICS_ENABLED = false;
    } else {
        // Consenso esistente: applica impostazioni
        
        applyCookieSettings(consent);
    }
}

// ===== AVVIO =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieBanner);
} else {
    initCookieBanner();
}

// Chiudi popup cliccando fuori
document.addEventListener('click', function(e) {
    const settings = document.getElementById('cookie-settings');
    if (settings && e.target === settings) {
        closeCookieSettings();
    }
});


