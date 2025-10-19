// Get restaurant ID from URL or session
const urlParams = new URLSearchParams(window.location.search);
const restaurantId = urlParams.get('id');

// Se non c'è ID nell'URL, verifica la sessione
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
        .catch(() => {
            window.location.href = 'index.html';
        });
}

// Display code digits
function displayCode() {
    const codeDigits = restaurantId.toString().padStart(4, '0').split('');
    const codeDisplay = document.getElementById('codeDisplay');
    
    codeDisplay.innerHTML = codeDigits
        .map(digit => `<div class="code-digit">${digit}</div>`)
        .join('');
}

// Load and display user plan from session
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
    
    if (displayPlan === 'free' && userData && userData.isTrialActive) {
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
    document.getElementById('gestioneCard').href = `gestione.html?id=${restaurantId}`;
    document.getElementById('menuCard').href = `gestione-menu.html?id=${restaurantId}`;
    document.getElementById('statsCard').href = `statistics.html?id=${restaurantId}`;
    document.getElementById('previewCard').href = `menu.html?id=${restaurantId}`;
}

// QR Code functionality
function initQRCode() {
    const qrCard = document.getElementById('qrCard');
    const qrPopup = document.getElementById('qrPopup');
    const qrClose = document.getElementById('qrClose');
    const downloadQR = document.getElementById('downloadQR');
    
    if (!qrCard || !qrPopup || !qrClose || !downloadQR) return;
    
    let qrCode = null;

    qrCard.addEventListener('click', (e) => {
        e.preventDefault();
        generateQRCode();
        qrPopup.classList.add('show');
    });

    qrClose.addEventListener('click', () => {
        qrPopup.classList.remove('show');
    });

    qrPopup.addEventListener('click', (e) => {
        if (e.target === qrPopup) {
            qrPopup.classList.remove('show');
        }
    });

    function generateQRCode() {
        const canvas = document.getElementById('qrCanvas');
        if (!canvas) return;
        
        const menuUrl = `https://totemino.it/menu.html?id=${restaurantId}`;
        
        canvas.innerHTML = '';
        
        qrCode = new QRCode(canvas, {
            text: menuUrl,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    downloadQR.addEventListener('click', () => {
        const canvas = document.querySelector('#qrCanvas canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `totemino-qr-${restaurantId}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    });
}

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Manage billing button
document.getElementById('manageBillingBtn').addEventListener('click', () => {
    window.location.href = 'accesso-negato.html';
});

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
const logoutPopup = document.getElementById('logoutPopup');
const cancelDelete = document.getElementById('cancel-delete');
const deleteBtn = document.getElementById('delete-btn');

logoutBtn.addEventListener('click', () => {
    logoutPopup.classList.add('show');
});

cancelDelete.addEventListener('click', () => {
    logoutPopup.classList.remove('show');
});

deleteBtn.addEventListener('click', async () => {
    try {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Disconnessione...';
        
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
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
        
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Esci';
    }
});

logoutPopup.addEventListener('click', (e) => {
    if (e.target === logoutPopup) {
        logoutPopup.classList.remove('show');
    }
});

// Initialize
if (restaurantId) {
    displayCode();
    loadUserPlan();
    setMenuLinks();
    
    // Inizializza QR Code dopo che il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQRCode);
    } else {
        initQRCode();
    }
}
