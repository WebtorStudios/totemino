// Get restaurant ID
const urlParams = new URLSearchParams(window.location.search);
const restaurantId = urlParams.get('id') || localStorage.getItem('restaurantId') || '1001';

// Display code digits
function displayCode() {
    const codeDigits = restaurantId.toString().padStart(4, '0').split('');
    const codeDisplay = document.getElementById('codeDisplay');
    
    codeDisplay.innerHTML = codeDigits
        .map(digit => `<div class="code-digit">${digit}</div>`)
        .join('');
}

// Load and display user plan
async function loadUserPlan() {
    try {
        const response = await fetch('userdata/users.json');
        const users = await response.json();
        const user = users[restaurantId];
        
        if (user) {
            const userPlan = user.status || user.planType || 'free';
            updatePlanDisplay(userPlan);
        } else {
            updatePlanDisplay('free');
        }
    } catch (error) {
        console.error('Error loading user plan:', error);
        updatePlanDisplay('free');
    }
}

function updatePlanDisplay(plan) {
    const planCard = document.getElementById('planCard');
    const planName = document.getElementById('planName');
    const normalizedPlan = plan.toLowerCase();
    
    // Remove all plan classes
    planCard.classList.remove('free', 'premium', 'paid', 'pro');
    planCard.classList.add(normalizedPlan);
    
    // Set plan name
    const planNames = {
        'free': 'Free',
        'premium': 'Premium',
        'paid': 'Premium',
        'pro': 'Pro'
    };
    
    planName.textContent = planNames[normalizedPlan] || 'Free';
}

// Set menu links
function setMenuLinks() {
    document.getElementById('gestioneCard').href = `gestione.html?id=${restaurantId}`;
    document.getElementById('menuCard').href = `gestione-menu.html?id=${restaurantId}`;
    document.getElementById('statsCard').href = `statistics.html?id=${restaurantId}`;
    document.getElementById('previewCard').href = `menu.html?id=${restaurantId}`;
}

// Back button - va a index.html
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Manage billing button
document.getElementById('manageBillingBtn').addEventListener('click', () => {
    window.location.href = 'accesso-negato.html';
});

// Logout popup handlers
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

deleteBtn.addEventListener('click', () => {
    localStorage.removeItem('restaurantId');
    window.location.href = 'index.html';
});

// Close popup on overlay click
logoutPopup.addEventListener('click', (e) => {
    if (e.target === logoutPopup) {
        logoutPopup.classList.remove('show');
    }
});

// Initialize
displayCode();
loadUserPlan();
setMenuLinks();