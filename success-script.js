// success-script.js

let installPrompt = null;

document.addEventListener('DOMContentLoaded', () => {

    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('id');

    // Recupera dettagli ultimo ordine (solo debug)
    const lastOrder = JSON.parse(sessionStorage.getItem('lastOrder') || '{}');

    // 🔙 Pulsante indietro
    document.getElementById('back-btn').onclick = () => {
        window.location.href = 'index-user.html';
    };

    // 🔽 Bottone installazione PWA (che aggiungerai in HTML)
    const installBtn = document.getElementById('installApp');
    if (installBtn) {
        installBtn.style.display = "none";

        installBtn.addEventListener("click", async () => {
            if (!installPrompt) return;

            installPrompt.prompt();
            const outcome = await installPrompt.userChoice;

            console.log("📦 Installazione PWA:", outcome.outcome);

            installPrompt = null;
            installBtn.style.display = "none";
        });
    }
});

// 📲 Evento che permette il prompt di installazione
window.addEventListener("beforeinstallprompt", (e) => {
    console.log("📥 Evento beforeinstallprompt intercettato");
    e.preventDefault();
    installPrompt = e;

    const installBtn = document.getElementById("installApp");
    if (installBtn) {
        installBtn.style.display = "block"; // Mostra il bottone
    }
});
