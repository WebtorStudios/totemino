document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');
    
    // Shop again button
    document.getElementById('shop-again').onclick = () => {
        if (!restaurantId) {
            window.location.href = 'index-user.html';
            return;
        }
        
        const menuUrl = new URL('menu-select.html', window.location.origin);
        menuUrl.searchParams.set('id', restaurantId);
        window.location.href = menuUrl.toString();
    };
    
    // Back button (rimosso duplicato)
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };
    
    // Gestione bottone "Scarica l'app"
    checkInstallPrompt();
});

// Variabile globale per salvare il prompt
let deferredPrompt;

// Cattura l'evento beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('✅ beforeinstallprompt catturato');
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostra il bottone "Scarica l'app"
    const installBtn = document.getElementById('get-app');
    if (installBtn) {
        installBtn.style.display = 'block';
    }
});

// Funzione per installare l'app
function installApp() {
    const installBtn = document.getElementById('get-app');
    
    if (!deferredPrompt) {
        console.log('❌ Nessun prompt disponibile');
        
        // Controlla se l'app è già installata
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            alert('L\'app è già installata!');
        } else {
            alert('L\'installazione non è disponibile su questo dispositivo o l\'app è già installata.');
        }
        return;
    }
    
    // Mostra il prompt di installazione
    deferredPrompt.prompt();
    
    // Attendi la scelta dell'utente
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('✅ Utente ha accettato l\'installazione');
        } else {
            console.log('❌ Utente ha rifiutato l\'installazione');
        }
        // Reset del prompt
        deferredPrompt = null;
        
        // Nascondi il bottone dopo l'installazione
        if (installBtn) {
            installBtn.style.display = 'none';
        }
    });
}

// Controlla se mostrare il bottone di installazione
function checkInstallPrompt() {
    const installBtn = document.getElementById('get-app');
    
    // Nascondi il bottone se l'app è già installata
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        console.log('ℹ️ App già installata');
        return;
    }
    
    // Se non abbiamo ancora il prompt, nascondi il bottone
    if (!deferredPrompt && installBtn) {
        installBtn.style.display = 'none';
    }
}

// Listener per quando l'app viene installata
window.addEventListener('appinstalled', () => {
    console.log('✅ App installata con successo!');
    deferredPrompt = null;
    
    const installBtn = document.getElementById('get-app');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
});