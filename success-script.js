
class RestaurantDashboard {
    constructor() {
        this.currentMonthIndex = 0;
        this.currentCategory = 'all';
        this.statistics = null;
        this.previousStatistics = null;
        this.menu = {};
        this.restaurantId = this.getRestaurantId();
        this.availableMonths = [];
        
        this.monthNames = [
            'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
        ];
        
        this.init();
    }
    
    getRestaurantId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }
    
    async init() {
        if (!this.restaurantId) {
            this.showError('ID ristorante non specificato nell\'URL. Aggiungi ?id=XXXX');
            return;
        }
        
        try {
            await this.loadMenu();
            await this.discoverAvailableMonths();
            this.setupEventListeners();
            this.setCurrentMonth();
            await this.loadStatistics();
            this.populateCategoryFilter();
            this.updateDashboard();
            this.showDashboard();
        } catch (error) {
            this.showError(`Errore nel caricamento dei dati: ${error.message}`);
        }
    }
    
    showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorContainer').innerHTML = `<div class="error">${message}</div>`;
    }
    
    showDashboard() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
    }
    
    async loadMenu() {
        const response = await fetch(`IDs/${this.restaurantId}/menu.txt`);
        if (!response.ok) {
            throw new Error(`Impossibile caricare il menu (${response.status})`);
        }
        const menuText = await response.text();
        this.parseMenu(menuText);
    }
    
    parseMenu(menuText) {
        const lines = menuText.split('\n');
        let currentCategory = '';
        
        this.menu = {};
        
        for (const line of lines) {
            if (line.startsWith('# ')) {
                currentCategory = line.substring(2).trim();
                this.menu[currentCategory] = {};
            } else if (line.trim() && currentCategory) {
                const cleanLine = line.replace(/^\*/, '');
                const parts = cleanLine.split(';');
                if (parts.length >= 3) {
                    const nome = parts[0].trim();
                    const prezzo = parseFloat(parts[1]);
                    let immagine = parts[2].trim();
                    
                    // Fix image path
                    if (immagine && !immagine.startsWith('IDs/')) {
                        immagine = `IDs/${this.restaurantId}/${immagine}`;
                    }
                    
                    this.menu[currentCategory][nome] = {
                        prezzo: prezzo,
                        immagine: immagine
                    };
                }
            }
        }
    }
    
    async discoverAvailableMonths() {
        const response = await fetch(`/api/months/${this.restaurantId}`);
        if (!response.ok) throw new Error('Impossibile leggere i mesi');
        this.availableMonths = await response.json();
        this.populateMonthDropdown();
    }
    
    populateMonthDropdown() {
        const monthDropdown = document.getElementById('monthDropdown');
        monthDropdown.innerHTML = '';
        
        this.availableMonths.forEach(monthYear => {
            const option = document.createElement('option');
            option.value = monthYear;
            option.textContent = this.formatMonth(monthYear);
            monthDropdown.appendChild(option);
        });
    }
    
    setCurrentMonth() {
        if (this.availableMonths.length > 0) {
            // Set to most recent month (last in sorted array)
            this.currentMonthIndex = this.availableMonths.length - 1;
            const currentMonth = this.availableMonths[this.currentMonthIndex];
            
            // Update dropdown selection
            document.getElementById('monthDropdown').value = currentMonth;
            
            this.updateMonthDisplay();
        }
    }
    
    formatMonth(monthYear) {
        if (!monthYear) return '';
        const [month, year] = monthYear.split('-');
        const monthName = this.monthNames[parseInt(month) - 1];
        return `${monthName} ${year}`;
    }
    
    updateMonthDisplay() {
        const currentMonth = this.availableMonths[this.currentMonthIndex];
        document.getElementById('currentMonthDisplay').textContent = this.formatMonth(currentMonth);
        
        // Update dropdown selection
        document.getElementById('monthDropdown').value = currentMonth;
        
        // Update button states - only enable if there are adjacent months
        const prevButton = document.getElementById('prevMonth');
        const nextButton = document.getElementById('nextMonth');
        
        prevButton.disabled = this.currentMonthIndex === 0;
        nextButton.disabled = this.currentMonthIndex === this.availableMonths.length - 1;
    }
    
    async loadStatistics() {
        const currentMonth = this.availableMonths[this.currentMonthIndex];
        
        // Load current month statistics
        const response = await fetch(`IDs/${this.restaurantId}/statistics/${currentMonth}.json`);
        if (!response.ok) {
            throw new Error(`Impossibile caricare le statistiche per ${currentMonth}`);
        }
        this.statistics = await response.json();
        
        // Try to load previous month statistics for comparison
        if (this.currentMonthIndex > 0) {
            const previousMonth = this.availableMonths[this.currentMonthIndex - 1];
            try {
                const prevResponse = await fetch(`IDs/${this.restaurantId}/statistics/${previousMonth}.json`);
                if (prevResponse.ok) {
                    this.previousStatistics = await prevResponse.json();
                }
            } catch (error) {
                this.previousStatistics = null;
            }
        } else {
            this.previousStatistics = null;
        }
    }
    
    populateCategoryFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        categoryFilter.innerHTML = '<option value="all">Tutte</option>';
        
        Object.keys(this.menu).forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            categoryFilter.appendChild(option);
        });
    }
    
    setupEventListeners() {
        // Dropdown change
        document.getElementById('monthDropdown').addEventListener('change', (e) => {
        const selectedMonth = e.target.value;
        const index = this.availableMonths.indexOf(selectedMonth);
        if (index === -1) return; // evita valori non validi
        this.currentMonthIndex = index;
        this.updateMonthDisplay();
        this.loadStatisticsAndUpdate();
    });

        
        // Month navigation
        document.getElementById('prevMonth').addEventListener('click', () => {
            if (this.currentMonthIndex > 0) {
                this.currentMonthIndex--;
                this.updateMonthDisplay();
                this.loadStatisticsAndUpdate();
            }
        });
        
        document.getElementById('nextMonth').addEventListener('click', () => {
            if (this.currentMonthIndex < this.availableMonths.length - 1) {
                this.currentMonthIndex++;
                this.updateMonthDisplay();
                this.loadStatisticsAndUpdate();
            }
        });
        
        // Category filter
        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.updateSellersCharts();
        });
    }
    
    async loadStatisticsAndUpdate() {
        try {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
            
            await this.loadStatistics();
            this.updateDashboard();
            this.showDashboard();
        } catch (error) {
            this.showError(`Errore nel caricamento dei dati: ${error.message}`);
        }
    }
    
    updateDashboard() {
        this.updateOverview();
        this.updateSellersCharts();
        this.updateSuggestions();
    }
    
    updateOverview() {
        const stats = this.statistics;
        const prevStats = this.previousStatistics;
        
        // Total sales
        document.getElementById('totalSales').textContent = `€${stats.totale_incasso.toFixed(2)}`;
        this.updateChange('salesChange', stats.totale_incasso, prevStats?.totale_incasso);
        
        // Average ticket
        document.getElementById('avgTicket').textContent = `€${stats.scontrino_medio.toFixed(2)}`;
        this.updateChange('ticketChange', stats.scontrino_medio, prevStats?.scontrino_medio);
        
        // Total orders
        document.getElementById('totalOrders').textContent = stats.totale_ordini;
        this.updateChange('ordersChange', stats.totale_ordini, prevStats?.totale_ordini);
    }
    
    updateChange(elementId, current, previous) {
        const element = document.getElementById(elementId);
        if (!previous || previous === 0) {
            element.textContent = '-';
            element.className = 'change';
            return;
        }
        
        const change = ((current - previous) / previous * 100).toFixed(1);
        const symbol = change >= 0 ? '▲' : '▼';
        const className = change >= 0 ? 'positive' : 'negative';
        
        element.textContent = `${symbol}${Math.abs(change)}%`;
        element.className = `change ${className}`;
    }
    
    updateSellersCharts() {
        const venduti = this.statistics.numero_piatti_venduti;
        let items = [];
        
        // Filter by category if necessary
        if (this.currentCategory === 'all') {
            // All items
            Object.keys(this.menu).forEach(categoria => {
                Object.keys(this.menu[categoria]).forEach(nome => {
                    const quantita = venduti[nome] || 0;
                    items.push({
                        nome: nome,
                        quantita: quantita,
                        prezzo: this.menu[categoria][nome].prezzo,
                        immagine: this.menu[categoria][nome].immagine,
                        ricavo: quantita * this.menu[categoria][nome].prezzo
                    });
                });
            });
        } else {
            // Only selected category
            if (this.menu[this.currentCategory]) {
                Object.keys(this.menu[this.currentCategory]).forEach(nome => {
                    const quantita = venduti[nome] || 0;
                    items.push({
                        nome: nome,
                        quantita: quantita,
                        prezzo: this.menu[this.currentCategory][nome].prezzo,
                        immagine: this.menu[this.currentCategory][nome].immagine,
                        ricavo: quantita * this.menu[this.currentCategory][nome].prezzo
                    });
                });
            }
        }
        
        // Sort by quantity sold
        const bestSellers = [...items].sort((a, b) => b.quantita - a.quantita).slice(0, 3);
        const worstSellers = [...items].sort((a, b) => a.quantita - b.quantita).slice(0, 3);
        
        this.renderPodium('bestSellers', bestSellers);
        this.renderPodium('worstSellers', worstSellers);
    }
    
    renderPodium(containerId, items) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Nessun dato disponibile</p>';
            return;
        }
        
        const positions = ['second', 'first', 'third'];
        const labels = ['2°', '1°', '3°'];
        
        items.forEach((item, index) => {
            if (index >= 3) return;
            
            const podiumItem = document.createElement('div');
            podiumItem.className = 'podium-item';
            
            const img = document.createElement('img');
            img.src = item.immagine;
            img.alt = item.nome;
            img.onerror = () => { 
                img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23e5e7eb"/><text x="30" y="30" text-anchor="middle" dy=".3em" fill="%23999" font-size="20">?</text></svg>'; 
            };
            
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = item.nome;
            name.title = item.nome; // Tooltip for full name
            
            const bar = document.createElement('div');
            bar.className = `podium-bar ${positions[index]}`;
            bar.textContent = labels[index];
            
            const revenue = document.createElement('div');
            revenue.className = 'revenue';
            revenue.textContent = `€${item.ricavo.toFixed(2)} (${item.quantita} pz)`;
            
            podiumItem.appendChild(img);
            podiumItem.appendChild(name);
            podiumItem.appendChild(bar);
            podiumItem.appendChild(revenue);
            
            container.appendChild(podiumItem);
        });
    }
    
    updateSuggestions() {
        const suggestions = this.statistics.suggerimenti;
        const prevSuggestions = this.previousStatistics?.suggerimenti;
        
        // Total suggested value
        document.getElementById('suggestionValue').textContent = `€${suggestions.totale_valore_suggeriti.toFixed(2)}`;
        this.updateChange('suggestionValueChange', suggestions.totale_valore_suggeriti, prevSuggestions?.totale_valore_suggeriti);
        
        // Number of suggested orders
        document.getElementById('suggestionOrders').textContent = suggestions.totale_items_suggeriti;
        this.updateChange('suggestionOrdersChange', suggestions.totale_items_suggeriti, prevSuggestions?.totale_items_suggeriti);
        
        // Top 5 suggestions
        this.renderTopSuggestions(suggestions.items_suggeriti_venduti);
    }
    
    renderTopSuggestions(itemsSuggeriti) {
        const container = document.getElementById('topSuggestions');
        container.innerHTML = '';
        
        const items = Object.entries(itemsSuggeriti)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280;">Nessun suggerimento venduto</p>';
            return;
        }
        
        items.forEach(([nome, quantita]) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = nome;
            
            const quantitySpan = document.createElement('span');
            quantitySpan.textContent = `${quantita} venduti`;
            
            item.appendChild(nameSpan);
            item.appendChild(quantitySpan);
            container.appendChild(item);
        });
    }
}



// Initialize dashboard when page is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RestaurantDashboard();
});

document.getElementById("shop-again").onclick = () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');
    window.location.href = `menu.html?id=${restaurantId}`;
};

document.getElementById("back-btn").onclick = () => {
    window.location.href = `index.html`;
};