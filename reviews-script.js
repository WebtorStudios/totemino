const reviews = [
	{
		image: "img/cliente1.jpg",
		name: "Trattoria da Maria",
		text: "Il menu digitale ha rivoluzionato il nostro modo di lavorare! Gli ordini arrivano subito e le statistiche ci aiutano a capire cosa piace davvero ai clienti."
	},
	{
		image: "img/cliente2.jpg",
		name: "Osteria del Borgo",
		text: "Finalmente un sistema intuitivo e intelligente! Modificare il menu è un gioco da ragazzi e i suggerimenti ci hanno fatto migliorare le scelte dei piatti."
	},
	{
		image: "img/cliente3.jpg",
		name: "Ristorante Il Gusto",
		text: "Non avrei mai immaginato quanto un menu digitale potesse semplificarci la vita. Ordinazioni più veloci, meno errori e una gestione super efficiente."
	},
	{
		image: "img/cliente4.jpg",
		name: "Pizzeria Bella Napoli",
		text: "Gli insight sulle vendite sono incredibili! Capire cosa funziona e cosa no non è mai stato così semplice, e il sistema è facilissimo da usare. Approvato."
	},
	{
		image: "img/cliente5.jpg",
		name: "Fast Food Express",
		text: "Il menu digitale ha migliorato l'esperienza dei clienti e il nostro lavoro quotidiano. Ordini immediati, suggerimenti intelligenti e tutto sotto controllo!"
	},
	{
		image: "img/cliente6.jpg",
		name: "La Tavola Calda",
		text: "Strumento essenziale per chi vuole gestire il ristorante senza stress. Le modifiche al menu sono immediate e le statistiche ci guidano nelle scelte giuste."
	}
];

document.addEventListener('DOMContentLoaded', () => {
	const container = document.querySelector('.create-reviews-section');
	const tripleReviews = [...reviews, ...reviews, ...reviews];
	
	container.innerHTML = `
		<div class="reviews-section">
			<h3 class="reviews-title">Cosa pensano i nostri clienti</h3>
			<div class="carousel-wrapper">
				<div class="carousel-track">
					${tripleReviews.map(r => `
						<div class="review-card">
							<div class="review-box">
								<img src="${r.image}" alt="${r.name}" class="review-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ccircle fill=%22%23601f40%22 cx=%2250%22 cy=%2250%22 r=%2250%22/%3E%3Ctext fill=%22%23fdf8db%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22 font-weight=%22bold%22%3E${r.name.charAt(0)}%3C/text%3E%3C/svg%3E'">
								<div class="stars">★★★★★</div>
								<p class="review-text">"${r.text}"</p>
								<div class="review-author">${r.name}</div>
							</div>
						</div>
					`).join('')}
				</div>
			</div>
		</div>
	`;
	
	const track = document.querySelector('.carousel-track');
	const cardWidth = track.querySelector('.review-card').offsetWidth;
	const resetPoint = cardWidth * reviews.length;
	
	let pos = 0;
	let animating = true;
	
	function animate() {
		if (animating) {
			pos += 0.5;
			if (pos >= resetPoint) pos = 0;
			track.style.transform = `translateX(-${pos}px)`;
		}
		requestAnimationFrame(animate);
	}
	animate();
	
	// Desktop: hover per fermare
	track.addEventListener('mouseenter', () => animating = false);
	track.addEventListener('mouseleave', () => animating = true);
	
	// Mobile: scroll manuale con il dito
	let startX, startPos;
	
	track.addEventListener('touchstart', (e) => {
		animating = false;
		startX = e.touches[0].clientX;
		startPos = pos;
	});
	
	track.addEventListener('touchmove', (e) => {
		const currentX = e.touches[0].clientX;
		const diff = startX - currentX;
		pos = startPos + diff;
		
		// Loop infinito
		while (pos >= resetPoint) pos -= resetPoint;
		while (pos < 0) pos += resetPoint;
		
		track.style.transform = `translateX(-${pos}px)`;
	});
	
	track.addEventListener('touchend', () => {
		animating = true;
	});
});
