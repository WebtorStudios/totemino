// collect-user-info.js - Solo funzioni client-side

/**
 * Funzione per generare/recuperare user ID
 */
function getUserId() {
  let userId = localStorage.getItem("totemino_user_id");
  if (!userId) {
    // Genera ID unico basato su timestamp + random
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("totemino_user_id", userId);
    console.log('Nuovo userId generato:', userId);
  } else {
    console.log('UserId esistente:', userId);
  }
  return userId;
}

// Inizializza l'userId quando il file viene caricato
getUserId();