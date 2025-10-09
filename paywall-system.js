// Funzione per ottenere i parametri dall'URL
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Funzione per caricare e verificare lo status dell'utente
async function checkUserAccess() {
    try {
        // Ottieni l'ID dall'URL
        const userId = getUrlParameter('id');
        
        if (!userId) {
            window.location.href = 'accesso-negato.html';
            return;
        }

        // Carica il file users.json
        const response = await fetch('userdata/users.json');
        if (!response.ok) {
            window.location.href = 'accesso-negato.html';
            return;
        }
        
        const users = await response.json();
        
        // Trova l'utente con l'ID specificato
        const user = users[userId];
        
        if (!user) {
            window.location.href = 'accesso-negato.html';
            return;
        }

        // Ottieni il nome della pagina corrente
        const currentPage = window.location.pathname.split('/').pop();
        
        // Controlla i permessi in base alla pagina e allo status
        if (currentPage === 'gestione.html' || currentPage === 'gestione-menu.html') {
            // Queste pagine richiedono almeno 'paid'
            if (user.status !== 'paid' && user.status !== 'pro') {
                window.location.href = 'accesso-negato.html?require=paid';
                return;
            }
        } else if (currentPage === 'statistics.html') {
            // Questa pagina richiede 'pro'
            if (user.status !== 'pro') {
                window.location.href = 'accesso-negato.html?require=pro';
                return;
            }
        }

        // Accesso consentito - continua normalmente
        
    } catch (error) {
        console.error('Errore nel controllo accesso:', error);
        window.location.href = 'accesso-negato.html';
    }
}

// Esegui il controllo quando la pagina viene caricata
window.addEventListener('DOMContentLoaded', checkUserAccess);