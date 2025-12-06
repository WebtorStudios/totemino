// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    currentMonthIndex: 0,
    currentCategory: 'all',
    restaurantId: new URLSearchParams(location.search).get('id'),
    statistics: null,
    previousStatistics: null,
    menu: {},
    availableMonths: [],
    dailySalesData: [],
    salesChart: null,
    usersData: null
};

const MONTH_NAMES = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const DAY_NAMES = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const TIME_SLOT_NAMES = {
    mattina: 'Mattina (6-12)',
    pranzo: 'Pranzo (12-17)', 
    sera: 'Sera (17-23)',
    notte: 'Notte (23-6)'
};

// ============================================================================
// DOM UTILITIES
// ============================================================================

const $ = id => document.getElementById(id);
const show = id => $(id).style.display = 'block';
const hide = id => $(id).style.display = 'none';

const showError = msg => {
    hide('loading');
    $('errorContainer').innerHTML = `<div class="error">${msg}</div>`;
};

const showDashboard = () => {
    hide('loading');
    show('dashboard');
};

// ============================================================================
// DATA LOADING
// ============================================================================

const loadMenu = async () => {
    const response = await fetch(`IDs/${state.restaurantId}/menu.json`);
    if (!response.ok) throw new Error(`Menu non trovato (${response.status})`);
    
    const menuJson = await response.json();
    state.menu = {};
    
    menuJson.categories.forEach(category => {
        state.menu[category.name] = {};
        category.items.forEach(item => {
            state.menu[category.name][item.name] = {
                prezzo: item.price,
                immagine: item.imagePath
            };
        });
    });
};

const loadAvailableMonths = async () => {
    const response = await fetch(`/api/months/${state.restaurantId}`);
    if (!response.ok) throw new Error('Impossibile caricare mesi');
    state.availableMonths = await response.json();
    populateMonthDropdown();
};

const loadStatistics = async () => {
    const currentMonth = state.availableMonths[state.currentMonthIndex];
    const response = await fetch(`IDs/${state.restaurantId}/statistics/${currentMonth}.json`);
    if (!response.ok) throw new Error(`Statistiche non trovate per ${currentMonth}`);
    
    state.statistics = await response.json();
    
    // Load previous month if available
    if (state.currentMonthIndex > 0) {
        try {
            const prevMonth = state.availableMonths[state.currentMonthIndex - 1];
            const prevResponse = await fetch(`IDs/${state.restaurantId}/statistics/${prevMonth}.json`);
            state.previousStatistics = prevResponse.ok ? await prevResponse.json() : null;
        } catch {
            state.previousStatistics = null;
        }
    }
};

const loadDailySalesData = async () => {
    try {
        const currentMonth = state.availableMonths[state.currentMonthIndex];
        const response = await fetch(`IDs/${state.restaurantId}/daily-sales/${currentMonth}.json`);
        state.dailySalesData = response.ok ? await response.json() : [];
    } catch {
        state.dailySalesData = [];
    }
};

const loadUsersData = async () => {
    try {
        const response = await fetch(`IDs/${state.restaurantId}/statistics/users/general.json`);
        state.usersData = response.ok ? await response.json() : null;
    } catch {
        state.usersData = null;
    }
};

// ============================================================================
// UI POPULATION
// ============================================================================

const populateMonthDropdown = () => {
    $('monthDropdown').innerHTML = state.availableMonths
        .map(month => `<option value="${month}">${formatMonth(month)}</option>`)
        .join('');
};

const populateCategoryFilter = () => {
    $('categoryFilter').innerHTML = '<option value="all">Tutte</option>' +
        Object.keys(state.menu)
            .map(cat => `<option value="${cat}">${cat}</option>`)
            .join('');
};

// ============================================================================
// EVENT HANDLING
// ============================================================================

const setupEventListeners = () => {
    $('monthDropdown').addEventListener('change', e => {
        changeMonth(state.availableMonths.indexOf(e.target.value));
    });

    $('prevMonth').addEventListener('click', () => {
        changeMonth(state.currentMonthIndex - 1);
    });

    $('nextMonth').addEventListener('click', () => {
        changeMonth(state.currentMonthIndex + 1);
    });

    $('categoryFilter').addEventListener('change', e => {
        changeCategory(e.target.value);
    });

    $('back-btn').addEventListener('click', () => {
        window.location.href = `gestione.html?id=${state.restaurantId}`;
    });
};

const changeMonth = newIndex => {
    if (newIndex < 0 || newIndex >= state.availableMonths.length) return;
    state.currentMonthIndex = newIndex;
    updateMonthDisplay();
    loadStatisticsAndUpdate();
};

const changeCategory = category => {
    state.currentCategory = category;
    updateSellersCharts();
};

// ============================================================================
// MONTH MANAGEMENT
// ============================================================================

const setCurrentMonth = () => {
    if (state.availableMonths.length > 0) {
        state.currentMonthIndex = state.availableMonths.length - 1;
        updateMonthDisplay();
    }
};

const formatMonth = monthYear => {
    const [month, year] = monthYear.split('-');
    return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
};

const updateMonthDisplay = () => {
    const currentMonth = state.availableMonths[state.currentMonthIndex];
    $('currentMonthDisplay').textContent = formatMonth(currentMonth);
    $('monthDropdown').value = currentMonth;
    
    $('prevMonth').disabled = state.currentMonthIndex === 0;
    $('nextMonth').disabled = state.currentMonthIndex === state.availableMonths.length - 1;
};

const loadStatisticsAndUpdate = async () => {
    try {
        show('loading');
        hide('dashboard');
        await Promise.all([loadStatistics(), loadDailySalesData(), loadUsersData()]);
        updateDashboard();
        showDashboard();
    } catch (error) {
        showError(`Errore: ${error.message}`);
    }
};

// ============================================================================
// DASHBOARD UPDATES
// ============================================================================

const updateDashboard = () => {
    updateOverview();
    updateSellersCharts();
    updatePerformanceInsights();
    updateSalesChart();
    updateUsersAnalytics();
};

const updateOverview = () => {
    const { statistics: stats, previousStatistics: prevStats } = state;
    
    const updates = [
        ['totalSales', `€${stats.totale_incasso.toFixed(2)}`, 'salesChange', stats.totale_incasso, prevStats?.totale_incasso],
        ['avgTicket', `€${stats.scontrino_medio.toFixed(2)}`, 'ticketChange', stats.scontrino_medio, prevStats?.scontrino_medio],
        ['totalOrders', stats.totale_ordini, 'ordersChange', stats.totale_ordini, prevStats?.totale_ordini]
    ];
    
    updates.forEach(([valueId, value, changeId, current, previous]) => {
        $(valueId).textContent = value;
        updateChange(changeId, current, previous);
    });
};

const updateChange = (elementId, current, previous) => {
    const element = $(elementId);
    if (!previous) {
        element.textContent = '-';
        element.className = 'change';
        return;
    }
    
    const change = ((current - previous) / previous * 100).toFixed(1);
    const isPositive = change >= 0;
    element.textContent = `${isPositive ? '▲' : '▼'}${Math.abs(change)}%`;
    element.className = `change ${isPositive ? 'positive' : 'negative'}`;
};

// ============================================================================
// SALES CHART
// ============================================================================

const updateSalesChart = () => {
    typeof Chart !== 'undefined' ? renderChartJs() : renderCanvasFallback();
};

const renderChartJs = () => {
    const ctx = $('salesTrendChart');
    if (!ctx) return;
    
    if (state.salesChart) {
        state.salesChart.destroy();
        state.salesChart = null;
    }
    
    const rootStyles = getComputedStyle(document.documentElement);
    const mainColor = rootStyles.getPropertyValue('--main-color').trim() || '#3b82f6';
    const mainColorBg = rootStyles.getPropertyValue('--main-color-bg').trim() || 'rgba(59, 130, 246, 0.1)';
    const textColor = rootStyles.getPropertyValue('--text-primary').trim() || '#000';
    
    state.salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: state.dailySalesData.map(d => `${d.day}`),
            datasets: [{
                data: state.dailySalesData.map(d => d.sales),
                borderColor: mainColor,
                backgroundColor: mainColorBg,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `€${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    grid: { color: 'rgba(149, 154, 163, 0.2)' },
                    ticks: { 
                        callback: value => '€' + value,
                        color: '#959AA3',
                        stepSize: 100
                    }
                },
                x: { 
                    grid: { display: false },
                    ticks: {
                        color: '#959AA3'
                    }
                }
            }
        }
    });
};

const renderCanvasFallback = () => {
    const canvas = $('salesTrendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 200;
    
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    
    if (state.dailySalesData.length === 0) {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📊 Dati vendite in arrivo...', width / 2, height / 2);
        return;
    }
    
    drawChart(ctx, width, height);
};

const drawChart = (ctx, width, height) => {
    const padding = 40;
    const data = state.dailySalesData;
    const maxSales = Math.max(...data.map(d => d.sales));
    const minSales = Math.min(...data.map(d => d.sales));
    const range = maxSales - minSales || 1;
    
    const rootStyles = getComputedStyle(document.documentElement);
    const mainColor = rootStyles.getPropertyValue('--main-color').trim() || '#3b82f6';
    
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    data.forEach((point, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((point.sales - minSales) / range) * (height - 2 * padding);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    
    ctx.stroke();
};

// ============================================================================
// SELLERS CHARTS
// ============================================================================

const updateSellersCharts = () => {
    const items = getFilteredItems();
    const rankings = {
        bestSellers: [...items].sort((a, b) => b.quantita - a.quantita).slice(0, 3),
        bestRevenue: [...items].sort((a, b) => b.ricavo - a.ricavo).slice(0, 3),
        worstSellers: [...items].sort((a, b) => a.quantita - b.quantita).slice(0, 3)
    };
    
    Object.entries(rankings).forEach(([id, data]) => renderPodium(id, data));
};

const getFilteredItems = () => {
    const venduti = state.statistics.numero_piatti_venduti;
    const items = [];
    const categories = state.currentCategory === 'all' ? 
        Object.keys(state.menu) : [state.currentCategory];
    
    categories.forEach(categoria => {
        if (!state.menu[categoria]) return;
        Object.entries(state.menu[categoria]).forEach(([nome, item]) => {
            const vendutiData = venduti[nome];
            const quantita = vendutiData ? (vendutiData.count || vendutiData) : 0;
            const ricavo = vendutiData ? (vendutiData.revenue || quantita * item.prezzo) : 0;
            
            items.push({ nome, quantita, prezzo: item.prezzo, immagine: item.immagine, ricavo });
        });
    });
    
    return items;
};

const renderPodium = (containerId, items) => {
    const container = $(containerId);
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Nessun dato</p>';
        return;
    }
    
    container.innerHTML = items.map(item => `
        <div class="podium-item">
            <img src="${item.immagine}" alt="${item.nome}" 
                 onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;60&quot; height=&quot;60&quot;><rect width=&quot;60&quot; height=&quot;60&quot; fill=&quot;%23e5e7eb&quot;/><text x=&quot;30&quot; y=&quot;30&quot; text-anchor=&quot;middle&quot; dy=&quot;.3em&quot; fill=&quot;%23999&quot; font-size=&quot;20&quot;>?</text></svg>'">
            <div class="name" title="${item.nome}">${item.nome}</div>
            <div class="revenue">€${item.ricavo.toFixed(2)} (${item.quantita} pz)</div>
        </div>
    `).join('');
};

// ============================================================================
// PERFORMANCE INSIGHTS
// ============================================================================

const updatePerformanceInsights = () => {
    const { statistics: stats } = state;
    const suggestions = stats.suggerimenti;
    const totalItems = Object.values(stats.numero_piatti_venduti).reduce((sum, item) => 
        sum + (item.count || item || 0), 0);
    
    const metrics = {
        suggestionConversionRate: totalItems > 0 ? (suggestions.totale_items_suggeriti / totalItems * 100).toFixed(1) : 0,
        avgSuggestionValue: suggestions.totale_items_suggeriti > 0 ? 
            (suggestions.totale_valore_suggeriti / suggestions.totale_items_suggeriti).toFixed(2) : 0,
        revenueImpact: stats.totale_incasso > 0 ? 
            (suggestions.totale_valore_suggeriti / stats.totale_incasso * 100).toFixed(1) : 0
    };
    
    Object.entries(metrics).forEach(([key, value]) => {
        $(key).textContent = key.includes('Value') ? `€${value}` : `${value}%`;
    });
    
    updateCategoryPerformance();
    updateTrendAnalysis();
};

const updateCategoryPerformance = () => {
    const categoryRevenue = Object.keys(state.menu).reduce((acc, categoria) => {
        acc[categoria] = Object.entries(state.menu[categoria]).reduce((sum, [nome, item]) => {
            const vendutiData = state.statistics.numero_piatti_venduti[nome];
            const ricavo = vendutiData ? (vendutiData.revenue || 0) : 0;
            return sum + ricavo;
        }, 0);
        return acc;
    }, {});
    
    const sortedCategories = Object.entries(categoryRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    $('categoryPerformance').innerHTML = sortedCategories
        .map(([categoria, revenue]) => `
            <div class="metric-item">
                <span class="metric-label">${categoria}</span>
                <span class="metric-value">€${revenue.toFixed(2)}</span>
            </div>
        `).join('');
};

const calculateMoMGrowth = async () => {
    const { statistics: current, dailySalesData } = state;
    
    if (!current || dailySalesData.length === 0) return 'Primo mese';
    
    const workingDaysInCurrentMonth = dailySalesData.filter(day => day.sales > 1);
    const workingDaysCount = workingDaysInCurrentMonth.length;
    
    if (workingDaysCount === 0) return 'Nessun giorno lavorativo';
    if (state.currentMonthIndex === 0) return 'Primo mese';
    
    try {
        const prevMonth = state.availableMonths[state.currentMonthIndex - 1];
        const response = await fetch(`IDs/${state.restaurantId}/daily-sales/${prevMonth}.json`);
        
        if (!response.ok) return 'Dati non disponibili';
        
        const prevDailySalesData = await response.json();
        const prevWorkingDays = prevDailySalesData.filter(day => day.sales > 1);
        
        if (prevWorkingDays.length === 0) return 'Dati insufficienti';
        
        const currentWorkingDaysAvg = workingDaysInCurrentMonth.reduce((sum, day) => sum + day.sales, 0) / workingDaysCount;
        const previousWorkingDaysAvg = prevWorkingDays.reduce((sum, day) => sum + day.sales, 0) / prevWorkingDays.length;
        
        if (previousWorkingDaysAvg === 0) {
            return currentWorkingDaysAvg > 0 ? '▲ Nuova attività' : '0%';
        }
        
        const growth = ((currentWorkingDaysAvg - previousWorkingDaysAvg) / previousWorkingDaysAvg * 100);
        const cappedGrowth = Math.max(-99, Math.min(999, growth));
        
        return `${cappedGrowth >= 0 ? '▲' : '▼'}${Math.abs(cappedGrowth).toFixed(1)}%`;
        
    } catch (error) {
        console.warn('Errore calcolo MoM:', error);
        return 'Errore calcolo';
    }
};

const updateTrendAnalysis = () => {
    const { statistics: current, dailySalesData } = state;
    
    calculateMoMGrowth().then(monthlyGrowth => {
        $('monthlyGrowth').textContent = monthlyGrowth;
    });
    
    let bestDayText = 'In attesa dati';
    if (dailySalesData.length > 0) {
        const bestDayData = dailySalesData.reduce((max, day) => day.sales > max.sales ? day : max);
        
        const currentMonth = state.availableMonths[state.currentMonthIndex];
        const [month, year] = currentMonth.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, bestDayData.day);
        
        bestDayText = `${DAY_NAMES[dateObj.getDay()]} ${bestDayData.day}`;
    }
    
    let forecastText = 'Non disponibile';
    if (dailySalesData.length > 0 && current.totale_incasso > 0) {
        const currentMonth = state.availableMonths[state.currentMonthIndex];
        const [month, year] = currentMonth.split('-');
        
        const today = new Date();
        const monthDate = new Date(parseInt(year), parseInt(month) - 1);
        const isMonthFinished = today.getFullYear() > parseInt(year) || 
                            (today.getFullYear() === parseInt(year) && today.getMonth() >= parseInt(month));
        
        if (isMonthFinished) {
            forecastText = 'Finito';
        } else {
            const currentDay = today.getDate();
            const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
            forecastText = `€${((current.totale_incasso / currentDay) * lastDayOfMonth).toFixed(2)}`;
        }
    }
    
    $('bestDay').textContent = bestDayText;
    $('forecast').textContent = forecastText;
};

// ============================================================================
// USERS ANALYTICS
// ============================================================================

const updateUsersAnalytics = () => {
    if (!state.usersData) {
        $('repeatCustomers').textContent = '0';
        $('newCustomers').textContent = '0';
        $('avgCustomerValue').textContent = '€0';
        $('avgOrdersPerCustomer').textContent = '0';
        $('preferredTimeSlot').textContent = '-';
        $('purchaseChannel').textContent = '-';
        return;
    }

    const users = state.usersData;
    const userIds = Object.keys(users);
    const totalUsers = userIds.length;
    
    if (totalUsers === 0) {
        $('repeatCustomers').textContent = '0';
        $('newCustomers').textContent = '0';
        $('avgCustomerValue').textContent = '€0';
        $('avgOrdersPerCustomer').textContent = '0';
        $('preferredTimeSlot').textContent = '-';
        $('purchaseChannel').textContent = '-';
        return;
    }

    const repeatCustomers = userIds.filter(userId => users[userId].ordersCount > 1).length;
    const newCustomers = totalUsers - repeatCustomers;
    
    const totalSpent = userIds.reduce((sum, userId) => sum + users[userId].totalSpent, 0);
    const avgCustomerValue = totalUsers > 0 ? totalSpent / totalUsers : 0;
    
    const totalOrders = userIds.reduce((sum, userId) => sum + users[userId].ordersCount, 0);
    const avgOrdersPerCustomer = totalUsers > 0 ? totalOrders / totalUsers : 0;

    const timeSlots = { mattina: 0, pranzo: 0, sera: 0, notte: 0 };

    userIds.forEach(userId => {
        const lastOrderDate = users[userId].lastOrderDate;
        if (lastOrderDate && lastOrderDate.includes('_')) {
            const timePart = lastOrderDate.split('_')[1];
            if (timePart) {
                const hour = parseInt(timePart.split('-')[0]);
                
                if (hour >= 6 && hour < 12) timeSlots.mattina++;
                else if (hour >= 12 && hour < 17) timeSlots.pranzo++;
                else if (hour >= 17 && hour < 23) timeSlots.sera++;
                else timeSlots.notte++;
            }
        }
    });
    
    const preferredTimeSlot = Object.entries(timeSlots)
        .sort((a, b) => b[1] - a[1])[0][0];

    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    userIds.forEach(userId => {
        const lastOrderDate = users[userId].lastOrderDate;
        if (lastOrderDate && lastOrderDate.includes('_')) {
            const datePart = lastOrderDate.split('_')[0];
            const [day, month, year] = datePart.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const dayOfWeek = dateObj.getDay();
            dayCounts[dayOfWeek]++;
        }
    });

    const preferredDay = dayCounts.indexOf(Math.max(...dayCounts));

    $('repeatCustomers').textContent = repeatCustomers.toString();
    $('newCustomers').textContent = newCustomers.toString();
    $('avgCustomerValue').textContent = `€${avgCustomerValue.toFixed(2)}`;
    $('avgOrdersPerCustomer').textContent = avgOrdersPerCustomer.toFixed(1);
    $('preferredTimeSlot').textContent = TIME_SLOT_NAMES[preferredTimeSlot] || '-';
    $('purchaseChannel').textContent = DAY_NAMES[preferredDay] || '-';
};

// ============================================================================
// AUTO-UPDATE
// ============================================================================

const startAutoUpdate = () => {
    setInterval(async () => {
        try {
            await loadDailySalesData();
            updateSalesChart();
        } catch (error) {
            console.warn('Auto-update failed:', error);
        }
    }, 3600000); // 1 hour
};

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = async () => {
    if (!state.restaurantId) {
        return showError('ID ristorante non specificato. Aggiungi ?id=XXXX');
    }
    try {
        await Promise.all([loadMenu(), loadAvailableMonths()]);
        setupEventListeners();
        setCurrentMonth();
        await Promise.all([loadStatistics(), loadDailySalesData(), loadUsersData()]);
        populateCategoryFilter();
        updateDashboard();
        showDashboard();
        startAutoUpdate();
    } catch (error) {
        showError(`Errore: ${error.message}`);
    }
};

document.addEventListener('DOMContentLoaded', () => init());