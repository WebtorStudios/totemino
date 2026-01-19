const restaurantId = new URLSearchParams(window.location.search).get('id') || 'default';

let currentStep = 1;
let settings = null;
let existingBookings = [];
let selectedDate = null;
let selectedTime = null;
let selectedTables = [];
let peopleCount = 2;
let maxSeats = 0;
let currentMonth = new Date();
let lastSelectedDate = null;
let lastSelectedTime = null;

const bookingData = {
  date: null,
  time: null,
  tables: [],
  people: 2,
  name: '',
  phone: '',
  notes: ''
};

async function init() {
  try {
    const [settingsRes, bookingsRes] = await Promise.all([
      fetch(`/IDs/${restaurantId}/settings.json`),
      fetch(`/IDs/${restaurantId}/bookings.json`).catch(() => ({ ok: false }))
    ]);

    if (!settingsRes.ok) {
      window.location.href = 'index-user.html';
      return;
    }

    settings = await settingsRes.json();

    // 🔧 FIX: maxSeats con tablesEnabled false
    if (settings.reservations.tablesEnabled) {
      maxSeats = settings.reservations.tables.reduce((sum, t) => sum + t.seats, 0);
    } else {
      maxSeats = settings.reservations.maxPeoplePerSlot;
    }

    document.getElementById('loading-logo').src = settings.restaurant.logo;
    document.getElementById('loading-restaurant-name').textContent = settings.restaurant.name;

    if (bookingsRes.ok) {
      existingBookings = await bookingsRes.json();
    }

    setupEventListeners();
    checkEventSuggestion();
  } catch (error) {
    window.location.href = 'index-user.html';
  }
}

function setupEventListeners() {
  document.getElementById('btn-next').addEventListener('click', nextStep);
  document.getElementById('btn-back').addEventListener('click', prevStep);
  document.getElementById('people-plus').addEventListener('click', () => changePeople(1));
  document.getElementById('people-minus').addEventListener('click', () => changePeople(-1));
  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  const eventSuggestion = document.getElementById('event-suggestion');
  eventSuggestion.addEventListener('click', () => {
    if (settings?.restaurant?.phone) {
      window.location.href = `tel:${settings.restaurant.phone}`;
    }
  });

  document.getElementById('customer-name').addEventListener('input', updateNextButtonState);
  document.getElementById('customer-phone').addEventListener('input', updateNextButtonState);
}

function checkEventSuggestion() {
  const suggestion = document.getElementById('event-suggestion');
  if (peopleCount >= 10) {
    suggestion.classList.remove('hidden');
  } else {
    suggestion.classList.add('hidden');
  }
}

function nextStep() {
  if (currentStep === 1) {
    if (!canAccommodatePeople(peopleCount)) return;

  } else if (currentStep === 2) {
    if (!selectedDate || !selectedTime) return;

    bookingData.date = selectedDate;
    bookingData.time = selectedTime;
    bookingData.people = peopleCount;

    // 🔧 FIX: bypass tavoli
    if (settings.reservations.tablesEnabled) {
      const optimal = findOptimalTables(peopleCount, selectedDate, selectedTime);
      if (!optimal) return;

      selectedTables = optimal;
      bookingData.tables = selectedTables.map(t => t.name);
    } else {
      selectedTables = [];
      bookingData.tables = [];
    }

  } else if (currentStep === 3) {
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();

    if (!name || !phone) return;

    bookingData.name = name;
    bookingData.phone = phone;
    bookingData.notes = document.getElementById('customer-notes').value.trim();

    submitBooking();
    return;
  }

  currentStep++;
  updateStepUI();

  if (currentStep === 2) {
    renderCalendar();
    if (lastSelectedDate) restoreSelectedDate();
  }

  if (currentStep === 3) renderFinalSummary();
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateStepUI();
    if (currentStep === 2 && lastSelectedDate) restoreSelectedDate();
  }
}

function restoreSelectedDate() {
  const dayElements = document.querySelectorAll('.calendar-day');
  dayElements.forEach(el => {
    const day = parseInt(el.textContent);
    if (!isNaN(day)) {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      if (dateStr === lastSelectedDate) el.classList.add('selected');
    }
  });

  if (lastSelectedDate) renderTimeSlots(lastSelectedDate);

  if (lastSelectedTime) {
    const timeElements = document.querySelectorAll('.time-slot');
    timeElements.forEach(el => {
      if (el.textContent === lastSelectedTime) {
        el.classList.add('selected');
        selectedTime = lastSelectedTime;
      }
    });
    updateNextButtonState();
  }
}

function updateStepUI() {
  document.querySelectorAll('.step-indicator').forEach((step, i) => {
    step.classList.remove('active', 'completed');
    if (i + 1 === currentStep) step.classList.add('active');
    if (i + 1 < currentStep) step.classList.add('completed');
  });

  document.querySelectorAll('.step-content').forEach((content, i) => {
    content.classList.toggle('active', i + 1 === currentStep);
  });

  document.getElementById('btn-back').classList.toggle('hidden', currentStep === 1);

  const btnNext = document.getElementById('btn-next');
  btnNext.innerHTML = currentStep === 3
    ? 'Prenota <i class="fas fa-check"></i>'
    : 'Avanti <i class="fas fa-arrow-right"></i>';

  updateNextButtonState();
}

function changePeople(delta) {
  const newCount = peopleCount + delta;
  if (newCount < 1 || newCount > maxSeats) return;

  peopleCount = newCount;
  document.getElementById('people-count').textContent = peopleCount;
  checkEventSuggestion();

  selectedDate = null;
  selectedTime = null;
  lastSelectedDate = null;
  lastSelectedTime = null;

  if (currentStep === 2) renderCalendar();

  updateNextButtonState();
}

function canAccommodatePeople(people) {
  if (!settings.reservations.tablesEnabled) {
    return people <= settings.reservations.maxPeoplePerSlot;
  }

  const allTables = [...settings.reservations.tables];
  return findOptimalTablesGeneric(people, allTables) !== null;
}

function changeMonth(delta) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
  renderCalendar();

  if (lastSelectedDate) {
    const lastDate = new Date(lastSelectedDate);
    if (
      lastDate.getMonth() === currentMonth.getMonth() &&
      lastDate.getFullYear() === currentMonth.getFullYear()
    ) {
      restoreSelectedDate();
    } else {
      selectedDate = null;
      selectedTime = null;
      lastSelectedDate = null;
      lastSelectedTime = null;
      document.getElementById('time-slots').innerHTML = '';
      updateNextButtonState();
    }
  }
}

function renderCalendar() {
  const calendar = document.getElementById('calendar');
  const monthLabel = document.getElementById('current-month');

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthLabel.textContent = currentMonth.toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric'
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDayOfWeek = firstDay.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const daysInMonth = lastDay.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  calendar.innerHTML = '';

  for (let i = 0; i < startDayOfWeek; i++) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'calendar-day empty';
    calendar.appendChild(emptyEl);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];

    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.textContent = day;

    const isToday = dateStr === today.toISOString().split('T')[0];
    if (isToday) dayEl.classList.add('today');

    const dayOfWeek = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'][date.getDay()];
    const isOpen = settings.schedule.openingHours[dayOfWeek]?.slot1;
    const isClosed = settings.schedule.exceptionalClosures.includes(dateStr);
    const isPast = date < today;

    const maxDays = settings.reservations.advanceBookingDays;
    const daysDiff = Math.floor((date - today) / (1000 * 60 * 60 * 24));
    const isTooFar = daysDiff >= maxDays;

    const isFullyBooked = checkIfFullyBooked(dateStr);

    if (!isOpen || isClosed || isPast || isFullyBooked || isTooFar) {
      dayEl.classList.add('disabled');
    } else {
      dayEl.addEventListener('click', () => selectDate(dateStr, dayEl));
    }

    calendar.appendChild(dayEl);
  }
}

function checkIfFullyBooked(dateStr) {
  if (!settings.reservations.tablesEnabled) {
    const totalPeople = existingBookings
      .filter(b => b.date === dateStr && b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.people || 0), 0);

    return totalPeople >= settings.reservations.maxPeoplePerSlot;
  }

  const date = new Date(dateStr);
  const dayOfWeek = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'][date.getDay()];
  const hours = settings.schedule.openingHours[dayOfWeek];

  if (!hours?.slot1) return true;

  const [openH, openM] = hours.slot1.open.split(':').map(Number);
  const [closeH, closeM] = hours.slot1.close.split(':').map(Number);
  const slotDuration = settings.reservations.slotDuration;

  let currentTime = openH * 60 + openM;
  const endTime = closeH * 60 + closeM - slotDuration;

  const now = new Date();
  const minAdvance = settings.reservations.minAdvanceMinutes;

  while (currentTime <= endTime) {
    const h = Math.floor(currentTime / 60);
    const m = currentTime % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const slotDate = new Date(`${dateStr}T${timeStr}`);
    const isPast = slotDate < new Date(now.getTime() + minAdvance * 60000);

    if (!isPast) {
      const availableTables = getAvailableTables(dateStr, timeStr);
      const canFit = findOptimalTablesGeneric(peopleCount, availableTables) !== null;
      if (canFit) return false;
    }

    currentTime += slotDuration;
  }

  return true;
}

function selectDate(date, element) {
  document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');

  selectedDate = date;
  lastSelectedDate = date;
  selectedTime = null;
  lastSelectedTime = null;

  renderTimeSlots(date);
  updateNextButtonState();

  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  });
}

function renderTimeSlots(date) {
  const container = document.getElementById('time-slots');
  container.innerHTML = '';

  const dayOfWeek = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'][new Date(date).getDay()];
  const hours = settings.schedule.openingHours[dayOfWeek];

  if (!hours?.slot1) return;

  const [openH, openM] = hours.slot1.open.split(':').map(Number);
  const [closeH, closeM] = hours.slot1.close.split(':').map(Number);
  const slotDuration = settings.reservations.slotDuration;

  let currentTime = openH * 60 + openM;
  const endTime = closeH * 60 + closeM - slotDuration;

  while (currentTime <= endTime) {
    const h = Math.floor(currentTime / 60);
    const m = currentTime % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const now = new Date();
    const minAdvance = settings.reservations.minAdvanceMinutes;
    const slotDate = new Date(`${date}T${timeStr}`);
    const isPast = slotDate < new Date(now.getTime() + minAdvance * 60000);

    const slotEl = document.createElement('div');
    slotEl.className = 'time-slot';
    slotEl.textContent = timeStr;

    if (isPast) {
      slotEl.classList.add('disabled');
    } else {
      slotEl.addEventListener('click', () => selectTime(timeStr, slotEl));
    }

    container.appendChild(slotEl);
    currentTime += slotDuration;
  }
}

function selectTime(time, element) {
  document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');

  selectedTime = time;
  lastSelectedTime = time;

  updateNextButtonState();
}

function findOptimalTables(people, date, time) {
  if (!settings.reservations.tablesEnabled) return [];
  const availableTables = getAvailableTables(date, time);
  return findOptimalTablesGeneric(people, availableTables);
}

function getAvailableTables(date, time) {
  const occupied = getOccupiedTables(date, time);
  return settings.reservations.tables.filter(t => !occupied.includes(t.name));
}

function getOccupiedTables(date, time) {
  const slotDuration = settings.reservations.slotDuration;
  const [h, m] = time.split(':').map(Number);
  const slotStart = h * 60 + m;
  const slotEnd = slotStart + slotDuration;

  const occupied = [];

  existingBookings.forEach(booking => {
    if (booking.date === date && booking.status !== 'cancelled') {
      const [bh, bm] = booking.time.split(':').map(Number);
      const bookingStart = bh * 60 + bm;
      const bookingEnd = bookingStart + slotDuration;

      if (!(slotEnd <= bookingStart || slotStart >= bookingEnd)) {
        occupied.push(...booking.tables);
      }
    }
  });

  return occupied;
}

function findOptimalTablesGeneric(people, availableTables) {
  if (availableTables.length === 0) return null;

  const sortedTables = [...availableTables].sort((a, b) => a.seats - b.seats);
  const maxWaste = people <= 8 ? 2 : 4;

  let bestCombo = null;
  let minWaste = Infinity;

  function tryCombo(tables, remaining, used, waste) {
    if (remaining <= 0) {
      if (waste < minWaste) {
        minWaste = waste;
        bestCombo = [...used];
      }
      return;
    }

    if (waste > maxWaste || used.length >= 5) return;

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      if (used.includes(table)) continue;

      const newRemaining = remaining - table.seats;
      const newWaste = waste + (newRemaining < 0 ? -newRemaining : 0);

      tryCombo(tables, newRemaining, [...used, table], newWaste);
    }
  }

  tryCombo(sortedTables, people, [], 0);

  return bestCombo && minWaste <= maxWaste ? bestCombo : null;
}

function isCurrentStepValid() {
  if (currentStep === 1) {
    return canAccommodatePeople(peopleCount);
  } else if (currentStep === 2) {
    return selectedDate && selectedTime;
  } else if (currentStep === 3) {
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    return name && phone;
  }
  return true;
}

function updateNextButtonState() {
  const btnNext = document.getElementById('btn-next');
  const isValid = isCurrentStepValid();

  btnNext.style.opacity = isValid ? '1' : '0.3';
  btnNext.style.cursor = isValid ? 'pointer' : 'not-allowed';
}

function renderFinalSummary() {
  const summary = document.getElementById('final-summary');
  const formattedDate = new Date(selectedDate).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  summary.innerHTML = `
    <h3>Riepilogo prenotazione</h3>
    <div class="summary-grid">
      <div class="summary-item">
        <span class="label">Data</span>
        <span class="value">${formattedDate}</span>
      </div>
      <div class="summary-item">
        <span class="label">Ora</span>
        <span class="value">${selectedTime}</span>
      </div>
      <div class="summary-item">
        <span class="label">Persone</span>
        <span class="value">${peopleCount}</span>
      </div>
    </div>
  `;
}

async function submitBooking() {
  try {
    const res = await fetch(`/IDs/${restaurantId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: bookingData.name,
        phone: bookingData.phone,
        date: bookingData.date,
        time: bookingData.time,
        people: bookingData.people,
        notes: bookingData.notes,
        tables: bookingData.tables
      })
    });

    const result = await res.json();

    if (result.success) {
      document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
      document.querySelector('.booking-steps').style.display = 'none';
      document.querySelector('.navigation').style.display = 'none';

      const successMessage = document.getElementById('success-message');
      successMessage.classList.remove('hidden');
      successMessage.style.display = 'flex';
    } else {
      alert('Errore nella prenotazione: ' + (result.message || 'Riprova'));
    }
  } catch (error) {
    console.error('Errore:', error);
    alert('Errore di connessione. Riprova.');
  }
}

init();

