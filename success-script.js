document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');
    
    document.getElementById('shop-again').onclick = () => {
        if (!restaurantId) {
            window.location.href = 'index-user.html';
            return;
        }
        
        const menuUrl = new URL('menu-select.html', window.location.origin);
        menuUrl.searchParams.set('id', restaurantId);

        window.location.href = menuUrl.toString();
    };
    
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };

    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function installApp() {
    if (deferredPrompt) deferredPrompt.prompt();
}