document.addEventListener("DOMContentLoaded", function() {
    const container = document.getElementById("create-billing-comparison");
    if (!container) return;

    const htmlContent = `
<section class="packages-section">
  <div class="packages-container">
    <h2 class="section-title">Migliora il tuo ristorante.</h2>
    <p class="section-subtitle">Aumenta i tuoi guadagni con meno di €1 al giorno – Cancella o migliora quando vuoi.</p>

    <div class="billing-toggle-container">
      <div class="billing-toggle">
        <button class="billing-toggle-btn billing-active" data-period="annual">Annuale</button>
        <button class="billing-toggle-btn" data-period="semiannual">Semestrale</button>
      </div>
    </div>

    <div class="packages-grid">

      <!-- Premium standard -->
      <div class="package-card" id="p-base">
        <h3 class="package-title">Premium</h3>
        <p class="package-description">Per gestire tutto con semplicità</p>
        <div class="package-price">
          <span class="billing-original-price">€49</span>
          <h4 class="billing-price" data-annual="19" data-semiannual="25">€19</h4>
          <div>
            <p>al mese</p>
            <p class="billing-period-text">per un anno</p>
          </div>
        </div>
        <button class="package-btn billing-upgrade-btn" 
                data-plan="premium"
                data-annual="price_1S3joh7dAnRE04PkAvL3Eko4"
                data-semiannual="price_1S3jp47dAnRE04PkZGVDqPCs">
          Upgrade
        </button>
        <ul class="package-features">
          <li>Menu digitale completo</li>
          <li>Tutte le ordinazioni in una sola pagina</li>
          <li>Servizio multilingua</li>
          <li>Strumenti di Gestione</li>
        </ul>
      </div>

      <!-- Premium attivo -->
      <div id="p-base-paid" style="display:none;">
          <h3>Hai attivato<br>Premium</h3>
      </div>

      <!-- Pro standard -->
      <div class="package-card" id="p-pro">
        <div id="consigliato">
          <h3 class="package-title">Pro</h3>
          <button class="novita">Consigliato</button>
        </div>
        <p class="package-description">Per crescere e aumentare i profitti</p>
        <div class="package-price">
          <span class="billing-original-price">€79</span>
          <h4 class="billing-price" data-annual="29" data-semiannual="35">€29</h4>
          <div>
            <p>al mese</p>
            <p class="billing-period-text">per un anno</p>
          </div>
        </div>
        <button class="package-btn billing-upgrade-btn"
                data-plan="pro"
                data-annual="price_1S3iS97dAnRE04PkFnZ0jIau"
                data-semiannual="price_1S3iVC7dAnRE04PkpODLwhOV">
          Passa a Pro
        </button>
        <ul class="package-features">
          <li>Tutti i servizi Premium</li>
          <li>Suggerimenti in fase di checkout con IA</li>
          <li>Statistiche e report settimanali</li>
          <li>Servizio di supporto prioritario</li>
        </ul>
      </div>

      <!-- Pro attivo -->
      <div id="p-pro-paid" style="display:none;">
          <h3>Hai attivato<br>Pro</h3>
      </div>

    </div>
  </div>
</section>
`;


    container.innerHTML = htmlContent;

    // Funzionalità di toggle
    const toggleButtons = document.querySelectorAll('.billing-toggle-btn');
    const toggleContainer = document.querySelector('.billing-toggle');
    const prices = document.querySelectorAll('.billing-price');
    const periodTexts = document.querySelectorAll('.billing-period-text');
    const upgradeButtons = document.querySelectorAll('.billing-upgrade-btn');

    let currentPeriod = 'annual';

    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const period = this.dataset.period;
            currentPeriod = period;
            
            toggleButtons.forEach(btn => btn.classList.remove('billing-active'));
            this.classList.add('billing-active');
            
            if (period === 'semiannual') {
                toggleContainer.classList.add('semiannual-active');
            } else {
                toggleContainer.classList.remove('semiannual-active');
            }
            
            prices.forEach(price => {
                const newPrice = period === 'annual' ? price.dataset.annual : price.dataset.semiannual;
                price.textContent = `€${newPrice}`;
            });
            
            const periodText = period === 'annual' ? 'per un anno' : 'per sei mesi';
            periodTexts.forEach(text => {
                text.textContent = periodText;
            });
        });
    });

    // Gestione click sui bottoni di upgrade (FIXED)
    upgradeButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            const planType = this.dataset.plan;
            const priceId = currentPeriod === 'annual' ? this.dataset.annual : this.dataset.semiannual;
            
            // Disabilita il bottone durante il caricamento
            this.disabled = true;
            const originalText = this.textContent;
            this.textContent = 'Caricamento...';
            
            try {
                console.log('📤 Creazione checkout:', { planType, priceId });

                const response = await fetch('/api/create-checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // ✅ IMPORTANTE per session
                    body: JSON.stringify({
                        priceId: priceId,
                        planType: planType
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    // Gestione errori specifici
                    if (response.status === 401) {
                        window.location.href = '/login.html';
                        return;
                    }
                    throw new Error(data.error || 'Errore nella creazione della sessione di pagamento');
                }

                console.log('✅ Sessione creata:', data.sessionId);

                // Reindirizza a Stripe Checkout
                window.location.href = data.url;

            } catch (error) {
                console.error('❌ Errore:', error);
                
                let errorMessage = 'Si è verificato un errore. Riprova più tardi.';
                
                if (error.message.includes('login')) {
                    errorMessage = 'Devi effettuare il login per procedere.';
                } else if (error.message.includes('rete')) {
                    errorMessage = 'Problema di connessione. Controlla la tua rete.';
                }
                
                alert(errorMessage);
                
                // Ripristina il bottone
                this.disabled = false;
                this.textContent = originalText;
            }
        });
    });

// ✅ Verifica stato utente al caricamento
checkUserStatus();
});

// Funzione per verificare lo status dell'utente
async function checkUserStatus() {
  try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) return console.log('⚠️ Utente non loggato');

      const data = await response.json();
      
      // ✅ Controlla se l'utente è loggato
      if (!data.success || !data.user) {
          console.log('⚠️ Utente non autenticato');
          return;
      }
      
      const status = data.user.status;  // ✅ Accesso corretto
      console.log('👤 Status utente:', status);

      const cards = {
          'premium': { normal: 'p-base', paid: 'p-base-paid' },
          'pro': { normal: 'p-pro', paid: 'p-pro-paid' }
      };

      // Nascondi tutte le card inizialmente
      Object.values(cards).forEach(c => {
          const normalCard = document.getElementById(c.normal);
          const paidCard = document.getElementById(c.paid);
          if (normalCard) normalCard.style.display = 'none';
          if (paidCard) paidCard.style.display = 'none';
      });

      if (status === 'paid') {
          // Mostra solo Premium paid e card Pro normale per upgrade
          document.getElementById(cards.premium.paid).style.display = 'block';
          document.getElementById(cards.pro.normal).style.display = 'block';
      } else if (status === 'pro') {
          // Mostra solo card paid
          document.getElementById(cards.premium.paid).style.display = 'block';
          document.getElementById(cards.pro.paid).style.display = 'block';
      } else {
          // Utente standard: mostra tutte le card normali
          Object.values(cards).forEach(c => {
              const normalCard = document.getElementById(c.normal);
              if (normalCard) normalCard.style.display = 'block';
          });
      }
  } catch (err) {
      console.error('Errore verifica utente:', err);
      // In caso di errore, mostra tutte le card normali
      const normalCards = ['p-base', 'p-pro'];
      normalCards.forEach(id => {
          const card = document.getElementById(id);
          if (card) card.style.display = 'block';
      });
  }
}