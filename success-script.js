// success-script.js

let installPrompt = null;

document.addEventListener('DOMContentLoaded', () => {

    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');

    // Recupera dettagli ultimo ordine (debug/log facoltativo)
    const lastOrder = JSON.parse(sessionStorage.getItem('lastOrder') || '{}');

    // 🔙 Pulsante indietro
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };

    // 🔽 Bottone installazione PWA (deve esistere nell’HTML)
    const installBtn = document.getElementById('installApp');
    if (installBtn) {
        installBtn.style.display = "none";

        installBtn.addEventListener("click", async () => {
            if (!installPrompt) return;

            installPrompt.prompt();
            const outcome = await installPrompt.userChoice;

            console.log("📦 Risultato installazione PWA:", outcome.outcome);

            installPrompt = null;
            installBtn.style.display = "none";
        });
    }
});

// 📲 Evento che permette di mostrare il prompt installazione
window.addEventListener("beforeinstallprompt", (e) => {
    console.log("📥 Evento beforeinstallprompt intercettato");
    e.preventDefault();
    installPrompt = e;

    const installBtn = document.getElementById("installApp");
    if (installBtn) {
        installBtn.style.display = "block"; // Mostra bottone
    }
});
