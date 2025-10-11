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
        console.log('🚫 Tracking utente non consentito');
        return null;
    }
    
    // ✅ Consenso OK: procedi
    let userId = localStorage.getItem("totemino_user_id");
    
    if (!userId) {
        // Genera nuovo ID
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("totemino_user_id", userId);
        console.log('✅ Nuovo userId generato:', userId);
    } else {
        console.log('✅ UserId esistente:', userId);
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
        console.log('🚫 Impossibile salvare userId: consenso negato');
        return false;
    }
    
    localStorage.setItem("totemino_user_id", userId);
    console.log('✅ UserId salvato:', userId);
    return true;
}

/**
 * Inizializza userId quando il sistema è pronto
 */
function initializeUserId() {
    // Aspetta che il sistema cookie sia caricato
    if (typeof window.CookieConsent === 'undefined') {
        console.log('⏳ In attesa sistema cookie...');
        setTimeout(initializeUserId, 100);
        return;
    }
    
    // Prova a ottenere/generare userId
    const userId = getUserId();
    
    if (userId) {
        console.log('✅ Sistema userId inizializzato:', userId);
    } else {
        console.log('ℹ️ Sistema userId in standby (consenso non dato)');
    }
}

// ===== LISTENER PER CAMBI DI CONSENSO =====
window.addEventListener('cookieConsentChanged', function(e) {
    const consent = e.detail;
    console.log('🔄 Consenso cambiato:', consent);
    
    if (consent.profiling) {
        // Consenso dato: inizializza userId
        console.log('✅ Profilazione abilitata: inizializzo userId');
        getUserId();
    } else {
        // Consenso revocato: pulisci userId
        console.log('🚫 Profilazione disabilitata: rimuovo userId');
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

console.log('👤 Sistema user ID GDPR caricato');
