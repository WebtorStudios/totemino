document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');
    
    // Recupera dettagli ultimo ordine da sessionStorage (opzionale, per log)
    const lastOrder = JSON.parse(sessionStorage.getItem('lastOrder') || '{}');
    
    
    // Setup button handlers
    document.getElementById('shop-again').onclick = () => {
        if (!restaurantId) {
            window.location.href = 'index.html';
            return;
        }
        
        // ✅ Costruisci URL mantenendo il parametro type
        const menuUrl = new URL('menu.html', window.location.origin);
        menuUrl.searchParams.set('id', restaurantId);
        
        // ✅ Mantieni il parametro type se presente
        const menuType = params.get('type');
        if (menuType) {
            menuUrl.searchParams.set('type', menuType);
        }
        
        window.location.href = menuUrl.toString();
    };
    
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index.html';
    };
});