// === GREETING ===
const now = new Date();
const utcHour = now.getUTCHours();
const gmt1Hour = (utcHour + 1) % 24;

let greeting = "";
if (gmt1Hour >= 5 && gmt1Hour < 12) {
  greeting = "Buongiorno!";
} else if (gmt1Hour >= 12 && gmt1Hour < 18) {
  greeting = "Buon pomeriggio!";
} else {
  greeting = "Buonasera!";
}
document.getElementById("greeting").textContent = greeting;

// === ELEMENTI DOM ===
const startBtn = document.querySelector('.start-btn');
const loginCard = document.querySelector('.login-card');
const logo = document.querySelector('.logo');
const title = document.querySelector('.main-title');
const inputs = document.querySelectorAll('.pin-inputs input');
const submitBtn = document.querySelector('.submit-btn');
const hero = document.querySelector('.hero');


async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    
    if (data.success) {
      const profiloBtnEl = document.getElementById('profiloBtn');
      if (profiloBtnEl) {
        profiloBtnEl.style.display = 'inline-block';
        const restaurantId = data.user.restaurantId; // ✅ prende l'id dalla sessione
        profiloBtnEl.addEventListener('click', () => {
          window.location.href = `profile.html?id=${restaurantId}`;
        });
      }
      document.getElementById('loginBtn').style.display = 'none';
    }
  } catch (e) {
    console.error('Errore checkAuth:', e);
  }
}

// === AUTH CHECK ===
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    
    if (data.success) {
      document.getElementById('loginBtn').style.display = 'none';
      const profiloBtnEl = document.getElementById('profiloBtn');
      if (profiloBtnEl) {
        profiloBtnEl.style.display = 'inline-block';
        const restaurantId = data.user.restaurantId;
        profiloBtnEl.addEventListener('click', () => {
          window.location.href = `profile.html?id=${restaurantId}`;
        });
      }
    }
  } catch (e) {
    console.error('Errore checkAuth:', e);
  }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});



// === EXISTING LOGIC ===
startBtn.addEventListener('click', () => {
  document.querySelector('.hero').scrollIntoView({ behavior: 'smooth' })
  loginCard.classList.add('active');
  hero.classList.add('active');
  startBtn.classList.add('hidden');
  logo.style.transform = 'translateY(6.2em)';
  logo.style.width = '16rem';
  title.style.transform = 'translateY(-13.5rem)';
  title.style.fontSize = '2.4rem';
});

function allInputsFilled() {
  return Array.from(inputs).every(input => input.value.trim() !== '');
}

inputs.forEach((input, index) => {
  input.addEventListener('focus', () => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  input.addEventListener('input', () => {
    if (input.value && index < inputs.length - 1) {
      inputs[index + 1].focus();
    }
    if (allInputsFilled()) {
      inputs[inputs.length - 1].blur();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === "Backspace" && !input.value && index > 0) {
      inputs[index - 1].focus();
    }
  });
});

submitBtn.addEventListener('click', async () => {
  const code = Array.from(inputs, i => i.value).join("");
  
  if (!/^\d{4}$/.test(code)) return;
  
  const users = await (await fetch('userdata/users.json')).json();
  const isValid = users[code];
  
  inputs.forEach((input, i) => {
    if (isValid) {
      input.style.animationDelay = `${i * 0.15}s`;
      input.classList.add('animate');
      setTimeout(() => input.classList.add('success'), i * 150 + 200);
    } else {
      input.classList.add('error');
    }
  });
  
  setTimeout(() => {
    if (isValid) {
      window.location.href = `menu.html?id=${code}`;
    } else {
      inputs.forEach(i => {
        i.classList.remove('error');
        i.value = '';
      });
      inputs[0].focus();
    }
  }, 1200);
});

submitBtn.addEventListener("click", function () {
  this.classList.toggle("clicked");
});

// === FAQ ACCORDION ===
document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    const icon = item.querySelector('.faq-icon');
    
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      
      // Chiudi tutte le altre FAQ
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
          otherItem.querySelector('.faq-answer').style.maxHeight = '0';
          otherItem.querySelector('.faq-icon').style.transform = 'rotate(0deg)';
        }
      });
      
      // Toggle della FAQ corrente
      if (isOpen) {
        item.classList.remove('active');
        answer.style.maxHeight = '0';
        icon.style.transform = 'rotate(0deg)';
      } else {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
        icon.style.transform = 'rotate(180deg)';
      }
    });
  });
});
