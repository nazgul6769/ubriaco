const STORAGE_PLAYERS_KEY = 'methysmenos_giocatori';
const STORAGE_STATS_KEY = 'methysmenos_statistiche';

function getTodayFormatted() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function showBanner(msg, type = 'success') {
  const banner = document.getElementById('statusBanner');
  banner.className = `alert alert-${type}`;
  banner.textContent = msg;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 4000);
}

async function initPlayersData() {
  if (!localStorage.getItem(STORAGE_PLAYERS_KEY)) {
    try {
      const res = await fetch('giocatori.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify(data));
      } else {
        localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify([]));
      }
    } catch (e) {
      localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify([]));
    }
  }
}

function getPlayers() {
  return JSON.parse(localStorage.getItem(STORAGE_PLAYERS_KEY) || '[]');
}

function savePlayersToStorage(players) {
  localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify(players));
  syncPlayersWithStats(players);
}

function syncPlayersWithStats(players) {
  let stats = JSON.parse(localStorage.getItem(STORAGE_STATS_KEY) || '[]');
  players.forEach(p => {
    const existing = stats.find(s => String(s.id) === String(p.id));
    if (existing) {
      existing.nome = p.nome;
      existing.cognome = p.cognome;
      existing.nickname = p.nickname;
    } else {
      stats.push({
        id: p.id,
        nome: p.nome,
        cognome: p.cognome,
        nickname: p.nickname,
        partiteGiocate: 0,
        shottiniBevuti: 0,
        totSoldiGuadagnati: 0,
        totSoldiSpesi: 0
      });
    }
  });
  localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
}

function renderPlayersTable() {
  const players = getPlayers();
  const tbody = document.getElementById('playersTableBody');
  tbody.innerHTML = '';

  if (players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Nessun giocatore presente. Inseriscine uno sopra o carica il file JSON.</td></tr>';
    return;
  }

  players.forEach(player => {
    const tr = document.createElement('tr');
    const isAttivo = player.stato === 'attivo';
    tr.innerHTML = `
      <td>${player.nome}</td>
      <td>${player.cognome}</td>
      <td><strong>${player.nickname}</strong></td>
      <td>${player.dataInserimento || '-'}</td>
      <td>${player.dataEliminazione || '-'}</td>
      <td><span class="badge ${isAttivo ? 'badge-active' : 'badge-inactive'}">${player.stato}</span></td>
      <td>
        <button class="btn btn-info btn-sm" onclick="editPlayer('${player.id}')">✏️ Modifica</button>
      </td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deactivatePlayer('${player.id}')" ${!isAttivo ? 'disabled' : ''}>🗑️ Elimina</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editPlayer = function(id) {
  const players = getPlayers();
  const p = players.find(item => String(item.id) === String(id));
  if (!p) return;

  document.getElementById('editPlayerId').value = p.id;
  document.getElementById('inputNome').value = p.nome;
  document.getElementById('inputCognome').value = p.cognome;
  document.getElementById('inputNickname').value = p.nickname;

  document.getElementById('formTitle').textContent = `✏️ Modifica Giocatore (${p.nickname})`;
  document.getElementById('btnSubmitPlayer').textContent = 'Salva Modifiche';
  document.getElementById('btnCancelEdit').style.display = 'inline-flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deactivatePlayer = function(id) {
  const players = getPlayers();
  const index = players.findIndex(item => String(item.id) === String(id));
  if (index === -1) return;

  players[index].stato = 'disattivo';
  players[index].dataEliminazione = getTodayFormatted();
  savePlayersToStorage(players);
  renderPlayersTable();
  showBanner(`Giocatore "${players[index].nickname}" impostato come disattivo.`, 'warning');
};

function resetForm() {
  document.getElementById('editPlayerId').value = '';
  document.getElementById('playerForm').reset();
  document.getElementById('formTitle').textContent = '➕ Inserisci Giocatore';
  document.getElementById('btnSubmitPlayer').textContent = 'Aggiungi Giocatore';
  document.getElementById('btnCancelEdit').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  await initPlayersData();
  renderPlayersTable();

  // Submit form (Aggiunta o Modifica)
  document.getElementById('playerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editPlayerId').value;
    const nome = document.getElementById('inputNome').value.trim();
    const cognome = document.getElementById('inputCognome').value.trim();
    const nickname = document.getElementById('inputNickname').value.trim();

    if (!nome || !cognome || !nickname) return;

    const players = getPlayers();

    if (editId) {
      const idx = players.findIndex(p => String(p.id) === String(editId));
      if (idx !== -1) {
        players[idx].nome = nome;
        players[idx].cognome = cognome;
        players[idx].nickname = nickname;
        showBanner(`Giocatore "${nickname}" aggiornato con successo!`);
      }
    } else {
      const newPlayer = {
        id: Date.now().toString(),
        nome,
        cognome,
        nickname,
        dataInserimento: getTodayFormatted(),
        dataEliminazione: '-',
        stato: 'attivo'
      };
      players.push(newPlayer);
      showBanner(`Giocatore "${nickname}" inserito con successo!`);
    }

    savePlayersToStorage(players);
    resetForm();
    renderPlayersTable();
  });

  document.getElementById('btnCancelEdit').addEventListener('click', resetForm);

  // Gestione Modali Carica / Salva
  document.getElementById('btnOpenLoadModal').addEventListener('click', () => {
    document.getElementById('loadModal').classList.add('open');
  });

  document.getElementById('btnOpenSaveModal').addEventListener('click', () => {
    document.getElementById('saveModal').classList.add('open');
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close')).classList.remove('open');
    });
  });

  // Carica JSON
  document.getElementById('confirmLoadJson').addEventListener('click', () => {
    const fileInput = document.getElementById('jsonFileInput');
    const file = fileInput.files[0];
    if (!file) {
      alert('Seleziona prima un file .json!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!Array.isArray(parsed)) throw new Error('Formato non valido');
        savePlayersToStorage(parsed);
        renderPlayersTable();
        document.getElementById('loadModal').classList.remove('open');
        showBanner('Dati giocatori caricati correttamente dal file JSON!');
      } catch (err) {
        alert('Errore nel file JSON: assicurati che contenga un array valido di giocatori.');
      }
    };
    reader.readAsText(file);
  });

  // Salva JSON (con supporto File System Access API per sovrascrittura diretta + fallback download)
  document.getElementById('confirmSaveJson').addEventListener('click', async () => {
    const players = getPlayers();
    const jsonStr = JSON.stringify(players, null, 2);
    const fileName = document.getElementById('saveFileName').value.trim() || 'giocatori.json';

    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'File JSON',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        document.getElementById('saveModal').classList.remove('open');
        showBanner('File JSON salvato e sovrascritto con successo!');
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
    }

    // Fallback classico download
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('saveModal').classList.remove('open');
    showBanner('File JSON scaricato! Sostituiscilo nella cartella /giocatori se necessario.');
  });
});
