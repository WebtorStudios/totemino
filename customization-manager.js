// ===== GESTIONE CUSTOMIZZAZIONI =====

let customizationData = {};
let currentEditingGroupId = null;

/**
 * Carica il file customization.json
 */
async function loadCustomizations() {
  try {
    const response = await fetch(`IDs/${restaurantId}/customization.json`);
    if (response.ok) {
      customizationData = await response.json();
      
    } else {
      customizationData = createDefaultCustomizations();
      
      await saveCustomizations();
    }
  } catch (error) {
    
    customizationData = createDefaultCustomizations();
    await saveCustomizations();
  }
}

/**
 * Crea struttura di customizzazione di default con 2 gruppi di esempio
 */
function createDefaultCustomizations() {
  return {
    "1": [
      {
        "id": "carne",
        "name": "Scegli la carne",
        "required": true,
        "maxSelections": 1,
        "options": [
          {
            "id": "manzo",
            "name": "Manzo",
            "priceModifier": 0
          },
          {
            "id": "pollo",
            "name": "Pollo",
            "priceModifier": -1
          },
          {
            "id": "vegetariano",
            "name": "Burger Vegetariano",
            "priceModifier": 0.5
          }
        ]
      },
      {
        "id": "contorno",
        "name": "Scegli il contorno",
        "required": false,
        "maxSelections": 2,
        "options": [
          {
            "id": "patatine",
            "name": "Patatine Fritte",
            "priceModifier": 0
          },
          {
            "id": "insalata",
            "name": "Insalata",
            "priceModifier": 0
          },
          {
            "id": "onion-rings",
            "name": "Onion Rings",
            "priceModifier": 1.5
          }
        ]
      }
    ],
    "2": [
      {
        "id": "salsa",
        "name": "Scegli la salsa",
        "required": false,
        "maxSelections": 3,
        "options": [
          {
            "id": "ketchup",
            "name": "Ketchup",
            "priceModifier": 0
          },
          {
            "id": "mayo",
            "name": "Maionese",
            "priceModifier": 0
          },
          {
            "id": "bbq",
            "name": "BBQ",
            "priceModifier": 0.5
          },
          {
            "id": "piccante",
            "name": "Salsa Piccante",
            "priceModifier": 0.5
          }
        ]
      }
    ]
  };
}

/**
 * Salva le customizzazioni sul server
 */
async function saveCustomizations() {
  try {
    const response = await fetch(`/save-customizations/${restaurantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customizations: customizationData })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('Customizzazioni salvate con successo!', 'success');
      return true;
    } else {
      throw new Error(result.message || 'Errore durante il salvataggio');
    }
  } catch (error) {
    console.error('Errore salvataggio customizzazioni:', error);
    showNotification('Errore nel salvataggio delle customizzazioni', 'error');
    return false;
  }
}

/**
 * Ottiene il prossimo ID gruppo disponibile
 */
function getNextGroupId() {
  const existingIds = Object.keys(customizationData).map(id => parseInt(id));
  if (existingIds.length === 0) return 1;
  return Math.max(...existingIds) + 1;
}

/**
 * Apre il popup di selezione gruppo
 */
function openGroupSelectionPopup() {
  const popup = document.getElementById('group-selection-popup');
  renderGroupsList();
  popup.classList.remove('hidden');
  document.body.classList.add('noscroll');
}

/**
 * Chiude il popup di selezione gruppo
 */
function closeGroupSelectionPopup() {
  const popup = document.getElementById('group-selection-popup');
  popup.classList.add('hidden');
  document.body.classList.remove('noscroll');
}

/**
 * Renderizza la lista dei gruppi disponibili
 */
function renderGroupsList() {
  const container = document.getElementById('groups-list');
  container.innerHTML = '';
  
  const groups = Object.keys(customizationData).sort((a, b) => parseInt(a) - parseInt(b));
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="no-groups-message">Nessun gruppo disponibile. Creane uno nuovo!</p>';
    return;
  }
  
  groups.forEach(groupId => {
    const group = customizationData[groupId];
    const card = document.createElement('div');
    card.className = 'group-card';
    
    const sectionsPreview = group.map(s => s.name).join(', ');
    
    card.innerHTML = `
      <div class="group-card-header">
        <h3>Gruppo ${groupId}</h3>
        <div class="group-card-actions">
          <button class="group-edit-btn" onclick="editGroup('${groupId}')">
            <img src="img/edit.png" alt="Modifica">
          </button>
          <button class="group-delete-btn" onclick="deleteGroup('${groupId}')">
            <img src="img/delete.png" alt="Elimina">
          </button>
        </div>
      </div>
      <p class="group-sections">${sectionsPreview}</p>
      <button class="btn-primary select-group-btn" onclick="selectGroup('${groupId}')">
        Seleziona Gruppo
      </button>
    `;
    
    container.appendChild(card);
  });
}

/**
 * Seleziona un gruppo per l'item corrente
 */
function selectGroup(groupId) {
  const checkbox = document.getElementById('item-customizable');
  const groupInput = document.getElementById('customization-group-id');
  
  checkbox.checked = true;
  groupInput.value = groupId;
  
  closeGroupSelectionPopup();
  showNotification(`Gruppo ${groupId} selezionato`, 'success');
}

/**
 * Apre il popup di gestione gruppo customizzazione
 */
function openCustomizationGroupPopup(groupId = null) {
  currentEditingGroupId = groupId;
  const popup = document.getElementById('customization-popup');
  const title = document.getElementById('customization-popup-title');
  
  if (groupId === null) {
    title.textContent = 'Crea Nuovo Gruppo Customizzazione';
    resetCustomizationForm();
  } else {
    title.textContent = `Modifica Gruppo ${groupId}`;
    loadCustomizationGroup(groupId);
  }
  
  popup.classList.remove('hidden');
  document.body.classList.add('noscroll');
}

/**
 * Chiude il popup di gestione gruppo
 */
function closeCustomizationGroupPopup() {
  const popup = document.getElementById('customization-popup');
  popup.classList.add('hidden');
  document.body.classList.remove('noscroll');
  currentEditingGroupId = null;
}

/**
 * Reset del form di customizzazione
 */
function resetCustomizationForm() {
  document.getElementById('customization-sections-container').innerHTML = '';
  addCustomizationSection();
}

/**
 * Carica un gruppo di customizzazione nel form
 */
function loadCustomizationGroup(groupId) {
  const container = document.getElementById('customization-sections-container');
  container.innerHTML = '';
  
  const sections = customizationData[groupId] || [];
  
  if (sections.length === 0) {
    addCustomizationSection();
  } else {
    sections.forEach(section => {
      addCustomizationSection(section);
    });
  }
}

/**
 * Aggiunge una nuova sezione di customizzazione
 */
function addCustomizationSection(data = null) {
  const container = document.getElementById('customization-sections-container');
  const sectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const section = document.createElement('div');
  section.className = 'customization-section';
  section.dataset.sectionId = sectionId;
  
  section.innerHTML = `
    <div class="customization-section-header">
      <input type="text" class="section-name-input" placeholder="Es. Scegli la carne" value="${data?.name || ''}" />
      <button class="remove-section-btn" onclick="removeCustomizationSection('${sectionId}')">
        <img src="img/delete.png" alt="Rimuovi">
      </button>
    </div>
    
    <div class="section-settings">
      <label class="checkbox-label">
        <input type="checkbox" class="section-required" ${data?.required ? 'checked' : ''}>
        <span class="checkmark"></span>
        <span class="checkbox-text">Obbligatorio</span>
      </label>
      
      <div class="max-selections-field">
        <label>Selezioni massime:</label>
        <input type="number" class="section-max-selections" min="1" value="${data?.maxSelections || 1}" />
      </div>
    </div>
    
    <div class="options-container">
      <h4>Opzioni:</h4>
      <div class="options-list" data-section-id="${sectionId}">
        <!-- Le opzioni verranno aggiunte qui -->
      </div>
      <button class="btn-secondary add-option-btn" onclick="addCustomizationOption('${sectionId}')">
        + Aggiungi Opzione
      </button>
    </div>
  `;
  
  container.appendChild(section);
  
  if (data?.options && data.options.length > 0) {
    data.options.forEach(option => {
      addCustomizationOption(sectionId, option);
    });
  } else {
    addCustomizationOption(sectionId);
  }
}

/**
 * Rimuove una sezione di customizzazione
 */
function removeCustomizationSection(sectionId) {
  const section = document.querySelector(`[data-section-id="${sectionId}"]`);
  if (section) {
    section.remove();
  }
}

/**
 * Aggiunge un'opzione a una sezione
 */
function addCustomizationOption(sectionId, data = null) {
  const optionsList = document.querySelector(`.options-list[data-section-id="${sectionId}"]`);
  const optionId = `option-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const option = document.createElement('div');
  option.className = 'customization-option';
  option.dataset.optionId = optionId;
  
  option.innerHTML = `
    <input type="text" class="option-name-input" placeholder="Nome opzione" value="${data?.name || ''}" />
    <div class="option-price-group">
      <label>Modifica prezzo (€):</label>
      <input type="number" class="option-price-modifier" step="0.1" value="${data?.priceModifier || 0}" />
    </div>
    <button class="remove-option-btn" onclick="removeCustomizationOption('${optionId}')">
      <img src="img/delete.png" alt="Rimuovi">
    </button>
  `;
  
  optionsList.appendChild(option);
}

/**
 * Rimuove un'opzione
 */
function removeCustomizationOption(optionId) {
  const option = document.querySelector(`[data-option-id="${optionId}"]`);
  if (option) {
    option.remove();
  }
}

/**
 * Salva il gruppo di customizzazione corrente
 */
async function saveCustomizationGroup() {
  const sections = document.querySelectorAll('.customization-section');
  
  if (sections.length === 0) {
    showNotification('Aggiungi almeno una sezione', 'error');
    return;
  }
  
  const groupData = [];
  
  for (const section of sections) {
    const nameInput = section.querySelector('.section-name-input');
    const requiredInput = section.querySelector('.section-required');
    const maxSelectionsInput = section.querySelector('.section-max-selections');
    
    const name = nameInput.value.trim();
    if (!name) {
      showNotification('Ogni sezione deve avere un nome', 'error');
      nameInput.focus();
      return;
    }
    
    const options = [];
    const optionElements = section.querySelectorAll('.customization-option');
    
    if (optionElements.length === 0) {
      showNotification(`La sezione "${name}" deve avere almeno un'opzione`, 'error');
      return;
    }
    
    for (const optionEl of optionElements) {
      const optionName = optionEl.querySelector('.option-name-input').value.trim();
      const priceModifier = parseFloat(optionEl.querySelector('.option-price-modifier').value) || 0;
      
      if (!optionName) {
        showNotification('Ogni opzione deve avere un nome', 'error');
        optionEl.querySelector('.option-name-input').focus();
        return;
      }
      
      options.push({
        id: optionName.toLowerCase().replace(/\s+/g, '-'),
        name: optionName,
        priceModifier: priceModifier
      });
    }
    
    groupData.push({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name: name,
      required: requiredInput.checked,
      maxSelections: parseInt(maxSelectionsInput.value) || 1,
      options: options
    });
  }
  
  // Salva il gruppo
  if (currentEditingGroupId === null) {
    const newGroupId = getNextGroupId();
    customizationData[newGroupId] = groupData;
    showNotification(`Gruppo ${newGroupId} creato!`, 'success');
  } else {
    customizationData[currentEditingGroupId] = groupData;
    showNotification(`Gruppo ${currentEditingGroupId} aggiornato!`, 'success');
  }
  
  const saved = await saveCustomizations();
  if (saved) {
    closeCustomizationGroupPopup();
    renderGroupsList();
  }
}

/**
 * Modifica un gruppo esistente
 */
function editGroup(groupId) {
  closeGroupSelectionPopup();
  openCustomizationGroupPopup(groupId);
}

/**
 * Elimina un gruppo
 */
async function deleteGroup(groupId) {
  const confirmDelete = confirm(`Sei sicuro di voler eliminare il Gruppo ${groupId}?\n\nGli elementi del menu che usano questo gruppo non saranno più customizzabili.`);
  
  if (confirmDelete) {
    delete customizationData[groupId];
    const saved = await saveCustomizations();
    if (saved) {
      showNotification(`Gruppo ${groupId} eliminato`, 'success');
      renderGroupsList();
    }
  }
}

/**
 * Crea un nuovo gruppo
 */
function createNewGroup() {
  closeGroupSelectionPopup();
  openCustomizationGroupPopup(null);
}

// Export per uso in gestione-menu-script.js
window.loadCustomizations = loadCustomizations;
window.openGroupSelectionPopup = openGroupSelectionPopup;
window.closeGroupSelectionPopup = closeGroupSelectionPopup;
window.openCustomizationGroupPopup = openCustomizationGroupPopup;
window.closeCustomizationGroupPopup = closeCustomizationGroupPopup;
window.saveCustomizationGroup = saveCustomizationGroup;
window.createNewGroup = createNewGroup;
window.addCustomizationSection = addCustomizationSection;
window.removeCustomizationSection = removeCustomizationSection;
window.addCustomizationOption = addCustomizationOption;
window.removeCustomizationOption = removeCustomizationOption;
window.selectGroup = selectGroup;
window.editGroup = editGroup;
window.deleteGroup = deleteGroup;