let deferredPrompt;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');
    
    // Shop again button
    document.getElementById('shop-again').onclick = () => {
        const menuUrl = new URL('menu-select.html', window.location.origin);
        if (restaurantId) menuUrl.searchParams.set('id', restaurantId);
        window.location.href = menuUrl.toString();
    };
    
    // Back button
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };

    document.getElementById('get-app').onclick = () => {
        installApp();
    };
});

// Cattura evento installazione
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// Installa app
function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
        });
    }
}

// Reset dopo installazione
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
});

