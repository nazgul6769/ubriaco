const STORAGE_STATS_KEY = 'methysmenos_statistiche';
const STORAGE_PLAYERS_KEY = 'methysmenos_giocatori';

function showBanner(msg, type = 'success') {
  const banner = document.getElementById('statusBanner');
  banner.className = `alert alert-${type}`;
  banner.textContent = msg;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 4000);
}

async function initStatsData() {
  if (!localStorage.getItem(STORAGE_STATS_KEY)) {
    try {
      const res = await fetch('statistiche.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(data));
      } else {
        localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify([]));
      }
    } catch (e) {
      localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify([]));
    }
  }
}

function getStats() {
  const stats = JSON.parse(localStorage.getItem(STORAGE_STATS_KEY) || '[]');
  const players = JSON.parse(localStorage.getItem(STORAGE_PLAYERS_KEY) || '[]');

  // Assicura che ogni giocatore presente in giocatori sia riflesso nelle statistiche
  players.forEach(p => {
    const found = stats.find(s => String(s.id) === String(p.id));
    if (!found) {
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
    } else {
      found.nome = p.nome;
      found.cognome = p.cognome;
      found.nickname = p.nickname;
    }
  });

  localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
  return stats;
}

function renderStats() {
  const stats = getStats();
  const tbody = document.getElementById('statsTableBody');
  const kpiContainer = document.getElementById('kpiContainer');

  tbody.innerHTML = '';

  let totalShots = 0;
  let totalEarned = 0;
  let totalSpent = 0;
  let totalMatches = 0;

  stats.forEach(s => {
    totalShots += Number(s.shottiniBevuti || 0);
    totalEarned += Number(s.totSoldiGuadagnati || 0);
    totalSpent += Number(s.totSoldiSpesi || 0);
    totalMatches += Number(s.partiteGiocate || 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.nome}</td>
      <td>${s.cognome}</td>
      <td><strong>${s.nickname}</strong></td>
      <td>${s.partiteGiocate}</td>
      <td>🥃 <strong>${s.shottiniBevuti}</strong></td>
      <td style="color: #34d399; font-weight:700;">+${s.totSoldiGuadagnati}$</td>
      <td style="color: #f87171; font-weight:700;">-${s.totSoldiSpesi}$</td>
    `;
    tbody.appendChild(tr);
  });

  if (stats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Nessuna statistica disponibile.</td></tr>';
  }

  kpiContainer.innerHTML = `
    <div class="kpi-box">
      <div class="value">${stats.length}</div>
      <div class="label">Giocatori Registrati</div>
    </div>
    <div class="kpi-box">
      <div class="value">🥃 ${totalShots}</div>
      <div class="label">Shottini Totali Bevuti</div>
    </div>
    <div class="kpi-box">
      <div class="value" style="color:#34d399;">${totalEarned}$</div>
      <div class="label">Totale Soldi Guadagnati</div>
    </div>
    <div class="kpi-box">
      <div class="value" style="color:#f87171;">${totalSpent}$</div>
      <div class="label">Totale Soldi Spesi</div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', async () => {
  await initStatsData();
  renderStats();

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
        localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(parsed));
        renderStats();
        document.getElementById('loadModal').classList.remove('open');
        showBanner('Statistiche caricate correttamente dal file JSON!');
      } catch (err) {
        alert('Errore nel file JSON: assicurati che contenga un array valido.');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('confirmSaveJson').addEventListener('click', async () => {
    const stats = getStats();
    const jsonStr = JSON.stringify(stats, null, 2);
    const fileName = document.getElementById('saveFileName').value.trim() || 'statistiche.json';

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
        showBanner('File statistiche.json salvato e sovrascritto con successo!');
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
    }

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('saveModal').classList.remove('open');
    showBanner('File JSON scaricato!');
  });
});
