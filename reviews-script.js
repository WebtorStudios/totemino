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
			<h3 class="reviews-title">Cosa dicono di noi</h3>
			<p class="reviews-subtitle">Ristoratori soddisfatti in tutto il mondo</p>
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
	const card = track.querySelector('.review-card');
	const gap = 32;
	const cardWidth = card.offsetWidth + gap;
	const singleSetWidth = cardWidth * reviews.length;
	
	let animating = true;
	let currentOffset = 0;
	
	function updatePosition() {
		const normalized = ((currentOffset % singleSetWidth) + singleSetWidth) % singleSetWidth;
		track.style.transform = `translateX(-${normalized}px)`;
	}
	
	function animate() {
		if (animating) {
			currentOffset += 0.6;
			updatePosition();
		}
		requestAnimationFrame(animate);
	}
	animate();
	
	// Desktop: hover per fermare
	track.addEventListener('mouseenter', () => animating = false);
	track.addEventListener('mouseleave', () => animating = true);
	
	// Mobile: rilevamento direzione swipe
	let startX, startY, startOffset, isHorizontal = null;
	
	track.addEventListener('touchstart', (e) => {
		startX = e.touches[0].clientX;
		startY = e.touches[0].clientY;
		startOffset = currentOffset;
		isHorizontal = null;
	});
	
	track.addEventListener('touchmove', (e) => {
		const currentX = e.touches[0].clientX;
		const currentY = e.touches[0].clientY;
		const diffX = Math.abs(currentX - startX);
		const diffY = Math.abs(currentY - startY);
		
		// Determina la direzione al primo movimento significativo
		if (isHorizontal === null && (diffX > 10 || diffY > 10)) {
			isHorizontal = diffX > diffY;
		}
		
		// Se lo swipe è orizzontale, gestiscilo; altrimenti lascia scrollare la pagina
		if (isHorizontal) {
			e.preventDefault();
			animating = false;
			const diff = startX - currentX;
			currentOffset = startOffset + diff;
			updatePosition();
		}
	}, { passive: false });
	
	track.addEventListener('touchend', () => {
		animating = true;
		isHorizontal = null;
	});
});
