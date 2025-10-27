// ============================================
// GESTIONE USER ID - GDPR COMPLIANT
// ============================================

/**
 * Genera o recupera userId SOLO se l'utente ha dato consenso
 * @returns {string|null} userId o null se consenso negato
 */
function getUserId() {
    // ✅ CONTROLLO CONSENSO PRIMA DI TUTTO
    if (typeof window.CookieConsent === 'undefined') {
        console.warn('⚠️ Sistema cookie non ancora caricato');
        return null;
    }
    
    if (!window.CookieConsent.canTrackUser()) {
        
        return null;
    }
    
    // ✅ Consenso OK: procedi
    let userId = localStorage.getItem("totemino_user_id");
    
    if (!userId) {
        // Genera nuovo ID
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("totemino_user_id", userId);
        
    } else {
        
    }
    
    return userId;
}

/**
 * Salva userId in modo sicuro (con controllo consenso)
 * @param {string} userId 
 * @returns {boolean} true se salvato, false se consenso negato
 */
function setUserIdSafe(userId) {
    if (typeof window.CookieConsent === 'undefined') {
        console.warn('⚠️ Sistema cookie non ancora caricato');
        return false;
    }
    
    if (!window.CookieConsent.canTrackUser()) {
        
        return false;
    }
    
    localStorage.setItem("totemino_user_id", userId);
    
    return true;
}

/**
 * Inizializza userId quando il sistema è pronto
 */
function initializeUserId() {
    // Aspetta che il sistema cookie sia caricato
    if (typeof window.CookieConsent === 'undefined') {
        
        setTimeout(initializeUserId, 100);
        return;
    }
    
    // Prova a ottenere/generare userId
    const userId = getUserId();
    
    if (userId) {
        
    } else {
        
    }
}

// ===== LISTENER PER CAMBI DI CONSENSO =====
window.addEventListener('cookieConsentChanged', function(e) {
    const consent = e.detail;
    
    
    if (consent.profiling) {
        // Consenso dato: inizializza userId
        
        getUserId();
    } else {
        // Consenso revocato: pulisci userId
        
        localStorage.removeItem('totemino_user_id');
    }
});

// ===== AVVIO =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUserId);
} else {
    initializeUserId();
}

// ===== ESPORTA FUNZIONI GLOBALI =====
window.getUserId = getUserId;
window.setUserIdSafe = setUserIdSafe;


