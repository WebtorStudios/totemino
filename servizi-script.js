// Theme toggle
const themeBtn = document.getElementById('theme');
const logo = document.getElementById('logoSwap');

themeBtn?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('totemino_theme', newTheme);
    updateThemeImages();
});

function updateThemeImages() {
    const theme = document.documentElement.getAttribute('data-theme');
    document.querySelectorAll('.theme-img').forEach(img => {
        img.src = theme === 'dark' ? img.dataset.dark : img.dataset.light;
    });
}

updateThemeImages();

// Intersection Observer for animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.service-card').forEach(card => {
    observer.observe(card);
});