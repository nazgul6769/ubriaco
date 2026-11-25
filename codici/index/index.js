const STORAGE_PLAYERS_KEY = 'methysmenos_giocatori';
const STORAGE_STATS_KEY = 'methysmenos_statistiche';
const STORAGE_ACTIVE_GAME_KEY = 'methysmenos_partita_attiva';

async function ensureDefaultData() {
  if (!localStorage.getItem(STORAGE_PLAYERS_KEY)) {
    try {
      const res = await fetch('../giocatori/giocatori.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify(data));
      }
    } catch (e) {
      localStorage.setItem(STORAGE_PLAYERS_KEY, JSON.stringify([]));
    }
  }
  if (!localStorage.getItem(STORAGE_STATS_KEY)) {
    try {
      const res = await fetch('../statistiche/statistiche.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(data));
      }
    } catch (e) {
      localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify([]));
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await ensureDefaultData();

  const btnOpen = document.getElementById('btnOpenStartModal');
  const modal = document.getElementById('startModal');
  const btnClose = document.getElementById('closeStartModal');
  const listContainer = document.getElementById('playerCheckList');
  const alertBox = document.getElementById('startAlert');
  const btnConfirm = document.getElementById('confirmStartGame');

  btnOpen.addEventListener('click', () => {
    const players = JSON.parse(localStorage.getItem(STORAGE_PLAYERS_KEY) || '[]');
    const activePlayers = players.filter(p => p.stato === 'attivo');

    listContainer.innerHTML = '';
    alertBox.style.display = 'none';

    if (activePlayers.length < 3) {
      alertBox.textContent = `Attenzione: ci sono solo ${activePlayers.length} giocatori attivi. Ne servono almeno 3 per giocare!`;
      alertBox.style.display = 'block';
      btnConfirm.disabled = true;
    } else {
      btnConfirm.disabled = false;
    }

    activePlayers.forEach(p => {
      const label = document.createElement('label');
      label.className = 'player-check-item';
      label.innerHTML = `
        <input type="checkbox" value="${p.id}" checked>
        <div>
          <strong>${p.nickname}</strong><br>
          <small style="color:var(--text-muted)">${p.nome} ${p.cognome}</small>
        </div>
      `;
      listContainer.appendChild(label);
    });

    modal.classList.add('open');
  });

  btnClose.addEventListener('click', () => modal.classList.remove('open'));

  btnConfirm.addEventListener('click', () => {
    const checked = Array.from(listContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    if (checked.length < 3) {
      alertBox.textContent = 'Devi selezionare ALMENO 3 giocatori per avviare la partita!';
      alertBox.style.display = 'block';
      return;
    }

    const allPlayers = JSON.parse(localStorage.getItem(STORAGE_PLAYERS_KEY) || '[]');
    const selectedPlayers = allPlayers.filter(p => checked.includes(String(p.id)));

    // Prepara stato iniziale partita
    const gameState = {
      startedAt: new Date().toISOString(),
      round: 1,
      currentPlayerIndex: 0,
      hasRolled: false,
      hasDrawn: false,
      players: selectedPlayers.map(p => ({
        id: p.id,
        nome: p.nome,
        cognome: p.cognome,
        nickname: p.nickname,
        soldi: 200,
        shottini: 0,
        scudo: false,
        // Effetti persistenti / per turni successivi
        nextInvestSafe: false,        // "il tuo prossimo investimento, non perdi nulla"
        nextInvestPenalty40: false,   // "il tuo prossimo investimento, perdi il 40% del tuo guadagno"
        doubleNextGain: false,        // "raddoppi il tuo prossimo guadagno"
        halveNextGain: false,         // "dimezzi il tuo prossimo guadagno"
        nextTurnProtected: false,     // "SUPER BONUS: non bevi, il prossimo turno sei protetto..."
        doubleNextPenalty: false,     // "il tuo scudo viene rotto: la prossima penalità la raddoppi"
        nextTurnDrawTwice: false,     // "SUPER MALUS: ... il prossimo turno peschi due volte..."
        drawsRemainingThisTurn: 1,
        investments: [],              // { amount, type, targetRound, rate }
        totGuadagnatiSessione: 200,
        totSpesiSessione: 0
      })),
      logs: ['Partita avviata! Ogni giocatore inizia con 200$.']
    };

    localStorage.setItem(STORAGE_ACTIVE_GAME_KEY, JSON.stringify(gameState));
    window.location.href = '../partita/partita.html';
  });
});
