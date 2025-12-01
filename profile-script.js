// Get restaurant ID from URL or session
const urlParams = new URLSearchParams(window.location.search);
const restaurantId = urlParams.get('id');

// Check session if no ID in URL
if (!restaurantId) {
    fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
            if (!data.success || data.requireLogin) {
                window.location.href = 'index.html';
            } else {
                window.location.href = `profile.html?id=${data.user.restaurantId}`;
            }
        })
        .catch(() => window.location.href = 'index.html');
}

// Display code digits
function displayCode() {
    const codeDigits = restaurantId.toString().padStart(4, '0').split('');
    const codeDisplay = document.getElementById('codeDisplay');
    
    codeDisplay.innerHTML = codeDigits
        .map(digit => `<div class="code-digit">${digit}</div>`)
        .join('');
}

// Load user plan
async function loadUserPlan() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.success || data.requireLogin) {
            window.location.href = 'index.html';
            return;
        }
        
        const userPlan = data.user.status || 'free';
        updatePlanDisplay(userPlan, data.user);
        
    } catch (error) {
        console.error('Error loading user plan:', error);
        updatePlanDisplay('free', null);
    }
}

function updatePlanDisplay(plan, userData) {
    const planCard = document.getElementById('planCard');
    const planName = document.getElementById('planName');
    
    planCard.classList.remove('free', 'premium', 'paid', 'pro', 'trial');
    
    const displayPlan = plan.toLowerCase();
    
    if (displayPlan === 'free' && userData?.isTrialActive) {
        planCard.classList.add('trial');
        planName.textContent = `Prova gratuita Pro (${userData.trialDaysLeft}g)`;
    } else {
        const planNames = {
            'premium': 'Premium',
            'paid': 'Premium',
            'pro': 'Pro',
            'free': 'Free'
        };
        
        planCard.classList.add(displayPlan);
        planName.textContent = planNames[displayPlan] || 'Free';
    }
}

// Set menu links
function setMenuLinks() {
    document.getElementById('informazioniCard').href = `info.html?id=${restaurantId}`;
    document.getElementById('promoCard').href = `create-promo.html?id=${restaurantId}`;
    document.getElementById('gestioneCard').href = `gestione.html?id=${restaurantId}`;
    document.getElementById('menuCard').href = `gestione-menu.html?id=${restaurantId}`;
    document.getElementById('statsCard').href = `statistics.html?id=${restaurantId}`;
    document.getElementById('bannersCard').href = `create-banners.html?id=${restaurantId}`;
    document.getElementById('previewCard').href = `menu-select.html?id=${restaurantId}`;
}

// QR Code functionality
function initQRCode() {
    const qrCard = document.getElementById('qrCard');
    const qrMenuPopup = document.getElementById('qrMenuPopup');
    const qrDisplayPopup = document.getElementById('qrDisplayPopup');
    const closeMenuSelect = document.getElementById('closeMenuSelect');
    const closeQR = document.getElementById('closeQR');
    const downloadQR = document.getElementById('downloadQR');
    const qrMenuList = document.getElementById('qrMenuList');
    
    let currentMenuName = '';

    // Open menu selection
    qrCard.addEventListener('click', async (e) => {
        e.preventDefault();
        await loadMenuTypes();
        qrMenuPopup.classList.add('show');
    });

    // Close menu selection
    closeMenuSelect.addEventListener('click', () => qrMenuPopup.classList.remove('show'));
    qrMenuPopup.addEventListener('click', (e) => {
        if (e.target === qrMenuPopup) qrMenuPopup.classList.remove('show');
    });

    // Close QR display
    closeQR.addEventListener('click', () => qrDisplayPopup.classList.remove('show'));
    qrDisplayPopup.addEventListener('click', (e) => {
        if (e.target === qrDisplayPopup) qrDisplayPopup.classList.remove('show');
    });

    // Load menu types
    async function loadMenuTypes() {
        try {
            const response = await fetch(`IDs/${restaurantId}/menuTypes.json`);
            const data = await response.json();
            
            qrMenuList.innerHTML = '';
            
            // Add menu-select option
            const selectItem = document.createElement('div');
            selectItem.className = 'qr-menu-item';
            selectItem.textContent = 'Selezione Menu';
            selectItem.addEventListener('click', () => {
                currentMenuName = 'Selezione Menu';
                generateQRCode('menu-select');
                qrMenuPopup.classList.remove('show');
                qrDisplayPopup.classList.add('show');
            });
            qrMenuList.appendChild(selectItem);
            
            // Add other menu types
            data.menuTypes.forEach(menu => {
                const menuItem = document.createElement('div');
                menuItem.className = 'qr-menu-item';
                menuItem.textContent = menu.name;
                menuItem.addEventListener('click', () => {
                    currentMenuName = menu.name;
                    generateQRCode(menu.id);
                    qrMenuPopup.classList.remove('show');
                    qrDisplayPopup.classList.add('show');
                });
                qrMenuList.appendChild(menuItem);
            });
            
        } catch (error) {
            console.error('Error loading menu types:', error);
            qrMenuList.innerHTML = '<div class="qr-error">Errore nel caricamento dei menu</div>';
        }
    }

    // Generate QR code using API with short URL and logo
    async function generateQRCode(menuType) {
        const canvas = document.getElementById('qrCanvas');
        const qrMenuName = document.getElementById('qrMenuName');
        
        const menuUrl = menuType === 'menu-select' 
            ? `https://totemino.it/menu-select.html?id=${restaurantId}`
            : `https://totemino.it/menu.html?id=${restaurantId}&type=${menuType}`;
        
        qrMenuName.textContent = currentMenuName;
        canvas.innerHTML = 'Generazione QR Code...';
        
        try {
            // Usa is.gd per creare short URL (nessun redirect intermedio, gratis)
            const shortUrlResponse = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(menuUrl)}`);
            const shortData = await shortUrlResponse.json();
            
            // Se is.gd fallisce, usa l'URL originale
            const finalUrl = shortData.shorturl || menuUrl;
            
            // Genera QR Code con API gratuita (QuickChart.io) con logo
            const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(finalUrl)}&size=400&format=png&margin=1&ecLevel=H&centerImageUrl=${encodeURIComponent('https://totemino.it/img/faviconQR.png')}&centerImageSizeRatio=0.2`;
            
            // Crea immagine QR
            const img = document.createElement('img');
            img.src = qrImageUrl;
            img.alt = 'QR Code';
            img.style.width = '100%';
            img.style.height = 'auto';
            
            canvas.innerHTML = '';
            canvas.appendChild(img);
            
            // Salva l'URL dell'immagine per il download
            canvas.dataset.qrImageUrl = qrImageUrl;
            
        } catch (error) {
            console.error('Errore generazione QR:', error);
            canvas.innerHTML = 'Errore nella generazione del QR Code';
        }
    }

    // Download QR code
    downloadQR.addEventListener('click', async () => {
        const canvas = document.getElementById('qrCanvas');
        const qrImageUrl = canvas.dataset.qrImageUrl;
        
        if (qrImageUrl) {
            try {
                // Scarica l'immagine dal servizio API
                const response = await fetch(qrImageUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                const fileName = currentMenuName.toLowerCase().replace(/\s+/g, '-');
                link.download = `totemino-qr-${fileName}-${restaurantId}.png`;
                link.href = url;
                link.click();
                
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Errore download QR:', error);
                alert('Errore durante il download del QR Code');
            }
        }
    });
}

// Manage billing
document.getElementById('manageBillingBtn').addEventListener('click', () => {
    window.location.href = 'accesso-negato.html';
});

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
const logoutPopup = document.getElementById('logoutPopup');
const cancelLogout = document.getElementById('cancelLogout');
const confirmLogout = document.getElementById('confirmLogout');

logoutBtn.addEventListener('click', () => logoutPopup.classList.add('show'));
cancelLogout.addEventListener('click', () => logoutPopup.classList.remove('show'));
logoutPopup.addEventListener('click', (e) => {
    if (e.target === logoutPopup) logoutPopup.classList.remove('show');
});

confirmLogout.addEventListener('click', async () => {
    try {
        confirmLogout.disabled = true;
        confirmLogout.textContent = 'Disconnessione...';
        
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.removeItem('restaurantId');
            window.location.href = 'index.html';
        } else {
            throw new Error('Logout fallito');
        }
        
    } catch (error) {
        console.error('Errore durante il logout:', error);
        alert('Errore durante la disconnessione. Riprova.');
        confirmLogout.disabled = false;
        confirmLogout.textContent = 'Esci';
    }
});

// Initialize
if (restaurantId) {
    displayCode();
    loadUserPlan();
    setMenuLinks();
}

// Initialize QR Code (non serve più la libreria QRCode.js)
window.addEventListener('load', () => {
    if (restaurantId) {
        initQRCode();
    }
});