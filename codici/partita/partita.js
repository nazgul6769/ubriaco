const STORAGE_PLAYERS_KEY = 'methysmenos_giocatori';
const STORAGE_STATS_KEY = 'methysmenos_statistiche';
const STORAGE_ACTIVE_GAME_KEY = 'methysmenos_partita_attiva';

const BONUS_CARDS = [
  { id: 'b1', type: 'bonus', text: 'vinci 100$' },
  { id: 'b2', type: 'bonus', text: 'vinci 200$' },
  { id: 'b3', type: 'bonus', text: 'vinci 300$' },
  { id: 'b4', type: 'bonus', text: 'scegli a chi far bere' },
  { id: 'b5', type: 'bonus', text: 'il tuo prossimo investimento, non perdi nulla' },
  { id: 'b6', type: 'bonus', text: 'passi il turno non bevendo' },
  { id: 'b7', type: 'bonus', text: 'raddoppi il tuo prossimo guadagno' },
  { id: 'b8', type: 'bonus', text: 'ottieni uno scudo: sei immune alla prossima penalità' },
  { id: 'b9', type: 'bonus', text: 'scambia il tuo bicchiere (o il tuo punteggio) con un altro giocatore' },
  { id: 'b10', type: 'bonus', text: 'pesca una carta extra e tieni la migliore' },
  { id: 'b11', type: 'bonus', text: 'ricevi 100$ da ogni altro giocatore' },
  { id: 'b12', type: 'bonus', text: 'SUPER BONUS: non bevi, il prossimo turno sei protetto e vinci 500$' }
];

const MALUS_CARDS = [
  { id: 'm1', type: 'malus', text: 'perdi 100$' },
  { id: 'm2', type: 'malus', text: 'perdi 200$' },
  { id: 'm3', type: 'malus', text: 'perdi 300$' },
  { id: 'm4', type: 'malus', text: 'bevi due volte' },
  { id: 'm5', type: 'malus', text: 'il tuo prossimo investimento, perdi il 40% del tuo guadagno' },
  { id: 'm6', type: 'malus', text: 'questo turno bevi 2 in più' },
  { id: 'm7', type: 'malus', text: 'dimezzi il tuo prossimo guadagno' },
  { id: 'm8', type: 'malus', text: 'il tuo scudo viene rotto: la prossima penalità la raddoppi' },
  { id: 'm9', type: 'malus', text: 'scambia il tuo bicchiere con un altro giocatore e bevine due (il suo più un altro)' },
  { id: 'm10', type: 'malus', text: 'pesca una carta extra e ottieni la peggiore' },
  { id: 'm11', type: 'malus', text: 'dai 100$ ad ogni altro giocatore' },
  { id: 'm12', type: 'malus', text: 'SUPER MALUS: bevi il doppio, il prossimo turno peschi due volte e perdi 500$' }
];

const ALL_CARDS = [...BONUS_CARDS, ...MALUS_CARDS];

let gameState = null;
let investingPlayerIdx = null;
let lastDiceRollValue = 0;

function getGameState() {
  const raw = localStorage.getItem(STORAGE_ACTIVE_GAME_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveGameState() {
  localStorage.setItem(STORAGE_ACTIVE_GAME_KEY, JSON.stringify(gameState));
}

function addLog(msg) {
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  gameState.logs.unshift(`[${time}] ${msg}`);
}

// Modifica denaro gestendo moltiplicatori ("raddoppi il tuo prossimo guadagno" / "dimezzi il tuo prossimo guadagno")
function addMoney(player, baseAmount) {
  let amount = baseAmount;
  if (amount > 0) {
    if (player.doubleNextGain) {
      amount *= 2;
      player.doubleNextGain = false;
      addLog(`✨ Bonus attivo! Il guadagno di ${player.nickname} è raddoppiato a +${amount}$!`);
    }
    if (player.halveNextGain) {
      amount = Math.round(amount / 2);
      player.halveNextGain = false;
      addLog(`⚠️ Malus attivo! Il guadagno di ${player.nickname} è dimezzato a +${amount}$!`);
    }
    player.soldi += amount;
    player.totGuadagnatiSessione += amount;
  } else if (amount < 0) {
    let loss = Math.abs(amount);
    if (player.doubleNextPenalty) {
      loss *= 2;
      player.doubleNextPenalty = false;
      addLog(`💥 Penalità raddoppiata! ${player.nickname} perde ${loss}$!`);
    }
    player.soldi = Math.max(0, player.soldi - loss);
    player.totSpesiSessione += loss;
  }
}

function addShots(player, count, isPenalty = true) {
  if (count <= 0) return;
  if (isPenalty && (player.scudo || player.nextTurnProtected)) {
    addLog(`🛡️ ${player.nickname} è protetto! Evita ${count} shottini.`);
    return;
  }
  let finalShots = count;
  if (isPenalty && player.doubleNextPenalty) {
    finalShots *= 2;
    player.doubleNextPenalty = false;
    addLog(`💥 Penalità raddoppiata! ${player.nickname} beve ${finalShots} shottini invece di ${count}!`);
  }
  player.shottini += finalShots;
}

// Risoluzione investimenti scaduti all'inizio del turno del giocatore
function resolveInvestmentsForPlayer(player) {
  const remaining = [];
  player.investments.forEach(inv => {
    if (gameState.round >= inv.targetRound) {
      // Probabilità di perdita: breve 40%, medio 30%, lungo 20%
      const roll = Math.random();
      let isLoss = roll < inv.risk;

      if (isLoss && player.nextInvestSafe) {
        isLoss = false;
        player.nextInvestSafe = false;
        addLog(`🛡️ Bonus investimento attivo: ${player.nickname} non perde nulla nell'investimento da ${inv.amount}$!`);
      }

      if (!isLoss) {
        // Guadagno: capitale + %
        let profit = Math.round(inv.amount * inv.rate);
        if (player.nextInvestPenalty40) {
          const cut = Math.round(profit * 0.40);
          profit -= cut;
          player.nextInvestPenalty40 = false;
          addLog(`📉 Malus investimento: ${player.nickname} perde il 40% del guadagno (-${cut}$).`);
        }
        const totalReturn = inv.amount + profit;
        player.soldi += inv.amount; // restituisce capitale
        addMoney(player, profit);   // applica eventuale raddoppio/dimezzamento al guadagno
        addLog(`📈 Investimento (${inv.type}) di ${player.nickname} RIUSCITO! Incassa ${totalReturn}$ (capitale ${inv.amount}$ + guadagno).`);
      } else {
        // Perdita: ottiene il tot investito - % dell'investito
        const lossAmount = Math.round(inv.amount * inv.rate);
        const returned = Math.max(0, inv.amount - lossAmount);
        player.soldi += returned;
        addLog(`📉 Investimento (${inv.type}) di ${player.nickname} IN PERDITA! Recupera solo ${returned}$ su ${inv.amount}$ (-${lossAmount}$).`);
      }
    } else {
      remaining.push(inv);
    }
  });
  player.investments = remaining;
}

// Lancio dado 3 facce: 1 (34%), 2 (33%), 3 (33%)
function rollThreeSidedDice() {
  const r = Math.random() * 100;
  if (r < 34) return 1;
  if (r < 67) return 2;
  return 3;
}

function drawRandomCard(filterType = null) {
  const pool = filterType ? ALL_CARDS.filter(c => c.type === filterType) : ALL_CARDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function chooseTargetPlayer(title, description, excludeIndex, callback) {
  const modal = document.getElementById('targetPlayerModal');
  document.getElementById('targetModalTitle').textContent = title;
  document.getElementById('targetModalDesc').textContent = description;
  const list = document.getElementById('targetModalList');
  list.innerHTML = '';

  gameState.players.forEach((p, idx) => {
    if (idx === excludeIndex) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.justifyContent = 'space-between';
    btn.innerHTML = `<span><strong>${p.nickname}</strong></span> <span>🥃 ${p.shottini} | 💰 ${p.soldi}$</span>`;
    btn.onclick = () => {
      modal.classList.remove('open');
      callback(idx);
    };
    list.appendChild(btn);
  });

  modal.classList.add('open');
}

function applyCardEffect(card, playerIdx, isSecondaryDraw = false) {
  const player = gameState.players[playerIdx];
  const cardBox = document.getElementById('lastCardDisplay');
  cardBox.style.display = 'block';
  cardBox.className = `card-reveal ${card.type}`;
  cardBox.innerHTML = `
    <div style="font-size:0.8rem; text-transform:uppercase; font-weight:800; letter-spacing:1px; margin-bottom:0.3rem;">
      ${card.type === 'bonus' ? '🌟 CARTA BONUS' : '💀 CARTA MALUS'}
    </div>
    <div style="font-size:1.3rem; font-weight:700;">"${card.text}"</div>
  `;

  addLog(`🃏 ${player.nickname} ha pescato [${card.type.toUpperCase()}]: "${card.text}"`);

  // Controllo scudo su carte Malus
  if (card.type === 'malus' && (player.scudo || player.nextTurnProtected)) {
    if (player.scudo) {
      player.scudo = false; // Lo scudo assorbe il malus
      addLog(`🛡️ LO SCUDO DI ${player.nickname} HA ANNULLATO IL MALUS "${card.text}"!`);
    } else {
      addLog(`✨ La protezione Super Bonus di ${player.nickname} ha annullato il malus!`);
    }
    finishCardStep();
    return;
  }

  switch (card.id) {
    // --- BONUS ---
    case 'b1': addMoney(player, 100); break;
    case 'b2': addMoney(player, 200); break;
    case 'b3': addMoney(player, 300); break;
    case 'b4': // scegli a chi far bere
      chooseTargetPlayer('🎯 Scegli a chi far bere', `${player.nickname}, scegli il giocatore che deve bere 1 shottino:`, playerIdx, (targetIdx) => {
        const target = gameState.players[targetIdx];
        addShots(target, 1, true);
        addLog(`🍻 ${player.nickname} fa bere 1 shottino a ${target.nickname}!`);
        finishCardStep();
      });
      return;
    case 'b5': // prossimo investimento non perdi nulla
      player.nextInvestSafe = true;
      break;
    case 'b6': // passi il turno non bevendo (annulla eventuali shottini del dado di questo turno)
      if (lastDiceRollValue > 0 && !player.scudo && !player.nextTurnProtected) {
        player.shottini = Math.max(0, player.shottini - lastDiceRollValue);
        addLog(`😇 ${player.nickname} non beve gli shottini del dado grazie al bonus!`);
      }
      player.nextTurnProtected = true;
      break;
    case 'b7': // raddoppi il tuo prossimo guadagno
      player.doubleNextGain = true;
      break;
    case 'b8': // ottieni uno scudo
      player.scudo = true;
      break;
    case 'b9': // scambia il tuo bicchiere (o punteggio shottini) con un altro giocatore
      chooseTargetPlayer('🔄 Scambia Bicchiere', `${player.nickname}, scegli con chi scambiare i tuoi shottini (${player.shottini}):`, playerIdx, (targetIdx) => {
        const target = gameState.players[targetIdx];
        const temp = player.shottini;
        player.shottini = target.shottini;
        target.shottini = temp;
        addLog(`🔄 ${player.nickname} e ${target.nickname} si sono scambiati i bicchieri!`);
        finishCardStep();
      });
      return;
    case 'b10': // pesca una carta extra e tieni la migliore (pesca una bonus garantita o migliore tra due)
      if (!isSecondaryDraw) {
        const extraBonus = drawRandomCard('bonus');
        addLog(`✨ Carta extra migliore ottenuta da ${player.nickname}: "${extraBonus.text}"`);
        applyCardEffect(extraBonus, playerIdx, true);
        return;
      }
      break;
    case 'b11': // ricevi 100$ da ogni altro giocatore
      let collected = 0;
      gameState.players.forEach((other, idx) => {
        if (idx !== playerIdx) {
          const pay = Math.min(other.soldi, 100);
          other.soldi -= pay;
          other.totSpesiSessione += pay;
          collected += pay;
        }
      });
      addMoney(player, collected);
      addLog(`💸 ${player.nickname} riceve ${collected}$ dagli altri giocatori!`);
      break;
    case 'b12': // SUPER BONUS: non bevi, il prossimo turno sei protetto e vinci 500$
      if (lastDiceRollValue > 0 && !player.scudo) {
        player.shottini = Math.max(0, player.shottini - lastDiceRollValue);
      }
      player.nextTurnProtected = true;
      addMoney(player, 500);
      break;

    // --- MALUS ---
    case 'm1': addMoney(player, -100); break;
    case 'm2': addMoney(player, -200); break;
    case 'm3': addMoney(player, -300); break;
    case 'm4': // bevi due volte
      addShots(player, 2, true);
      break;
    case 'm5': // prossimo investimento perdi il 40% del tuo guadagno
      player.nextInvestPenalty40 = true;
      break;
    case 'm6': // questo turno bevi 2 in più
      addShots(player, 2, true);
      break;
    case 'm7': // dimezzi il tuo prossimo guadagno
      player.halveNextGain = true;
      break;
    case 'm8': // scudo rotto: prossima penalità raddoppiata
      player.scudo = false;
      player.doubleNextPenalty = true;
      break;
    case 'm9': // scambia bicchiere con un altro giocatore e bevine due (il suo più un altro)
      chooseTargetPlayer('💀 Scambia Bicchiere + 1', `${player.nickname}, scegli con chi scambiare il bicchiere (poi berrai 1 shottino extra):`, playerIdx, (targetIdx) => {
        const target = gameState.players[targetIdx];
        const temp = player.shottini;
        player.shottini = target.shottini;
        target.shottini = temp;
        addShots(player, 1, true);
        addLog(`💀 ${player.nickname} scambia il bicchiere con ${target.nickname} e beve 1 shottino extra!`);
        finishCardStep();
      });
      return;
    case 'm10': // pesca una carta extra e ottieni la peggiore
      if (!isSecondaryDraw) {
        const extraMalus = drawRandomCard('malus');
        addLog(`💀 Carta extra peggiore ottenuta da ${player.nickname}: "${extraMalus.text}"`);
        applyCardEffect(extraMalus, playerIdx, true);
        return;
      }
      break;
    case 'm11': // dai 100$ ad ogni altro giocatore
      gameState.players.forEach((other, idx) => {
        if (idx !== playerIdx) {
          const pay = Math.min(player.soldi, 100);
          player.soldi -= pay;
          player.totSpesiSessione += pay;
          other.soldi += pay;
          other.totGuadagnatiSessione += pay;
        }
      });
      addLog(`💸 ${player.nickname} paga fino a 100$ ad ogni altro giocatore!`);
      break;
    case 'm12': // SUPER MALUS: bevi il doppio, prossimo turno peschi due volte e perdi 500$
      addShots(player, Math.max(2, lastDiceRollValue), true);
      player.nextTurnDrawTwice = true;
      addMoney(player, -500);
      break;
  }

  finishCardStep();
}

function finishCardStep() {
  const player = gameState.players[gameState.currentPlayerIndex];
  player.drawsRemainingThisTurn = Math.max(0, player.drawsRemainingThisTurn - 1);
  if (player.drawsRemainingThisTurn === 0) {
    gameState.hasDrawn = true;
  }
  saveGameState();
  renderGame();
}

function renderGame() {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  document.getElementById('roundNumber').textContent = gameState.round;
  document.getElementById('currentPlayerName').textContent = currentPlayer.nickname;

  const btnRoll = document.getElementById('btnRollDice');
  const btnDraw = document.getElementById('btnDrawCard');
  const btnNext = document.getElementById('btnNextTurn');

  btnRoll.disabled = gameState.hasRolled;
  btnDraw.disabled = gameState.hasDrawn;
  btnNext.disabled = !(gameState.hasRolled && gameState.hasDrawn);

  if (playerNeedsExtraDraw(currentPlayer)) {
    btnDraw.textContent = `🃏 Pesca carta (${currentPlayer.drawsRemainingThisTurn} rimaste)`;
  } else {
    btnDraw.textContent = '🃏 Pesca carta';
  }

  const statusParts = [];
  statusParts.push(gameState.hasRolled ? '✅ Dado lanciato' : '⏳ Lancia il dado');
  statusParts.push(gameState.hasDrawn ? '✅ Carta pescata' : '⏳ Pesca la carta');
  document.getElementById('turnStatusText').textContent = statusParts.join(' • ');

  // Render tabella giocatori
  const tbody = document.getElementById('gameTableBody');
  tbody.innerHTML = '';

  gameState.players.forEach((p, idx) => {
    const isCurrent = idx === gameState.currentPlayerIndex;
    const tr = document.createElement('tr');
    if (isCurrent) tr.className = 'active-row';

    // Pillole stati attivi
    let pillsHtml = '<div class="status-pills">';
    if (p.scudo) pillsHtml += '<span class="pill pill-shield">🛡️ Scudo Attivo</span>';
    if (p.nextTurnProtected) pillsHtml += '<span class="pill pill-bonus">✨ Protetto</span>';
    if (p.nextInvestSafe) pillsHtml += '<span class="pill pill-bonus">📈 Inv. Sicuro</span>';
    if (p.doubleNextGain) pillsHtml += '<span class="pill pill-bonus">2x Guadagno</span>';
    if (p.halveNextGain) pillsHtml += '<span class="pill pill-malus">½ Guadagno</span>';
    if (p.nextInvestPenalty40) pillsHtml += '<span class="pill pill-malus">-40% Inv.</span>';
    if (p.doubleNextPenalty) pillsHtml += '<span class="pill pill-malus">2x Penalità</span>';
    if (p.nextTurnDrawTwice) pillsHtml += '<span class="pill pill-malus">🃏 2 Carte prox turno</span>';
    p.investments.forEach(inv => {
      pillsHtml += `<span class="pill pill-invest">💼 ${inv.amount}$ (T.${inv.targetRound})</span>`;
    });
    pillsHtml += '</div>';

    tr.innerHTML = `
      <td>
        <strong>${p.nickname}</strong> ${isCurrent ? '👈' : ''}
        ${pillsHtml}
      </td>
      <td><strong style="color:#34d399; font-size:1.1rem;">${p.soldi}$</strong></td>
      <td><strong style="font-size:1.1rem;">🥃 ${p.shottini}</strong></td>
      <td>
        <button class="btn btn-info btn-sm" onclick="openInvestModal(${idx})" ${p.soldi <= 0 ? 'disabled' : ''}>
          📈 Investi
        </button>
      </td>
      <td>
        <button class="btn btn-purple btn-sm" onclick="buyDrinkAll(${idx})" ${p.soldi < 500 ? 'disabled' : ''}>
          🍻 500$
        </button>
      </td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="buyShield(${idx})" ${p.soldi < 500 || p.scudo ? 'disabled' : ''}>
          🛡️ 500$
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Render logs
  const logBox = document.getElementById('gameLogs');
  logBox.innerHTML = gameState.logs.map(l => `<div>${l}</div>`).join('');
}

function playerNeedsExtraDraw(player) {
  return !gameState.hasDrawn && player.drawsRemainingThisTurn > 1;
}

window.openInvestModal = function(playerIdx) {
  investingPlayerIdx = playerIdx;
  const p = gameState.players[playerIdx];
  document.getElementById('investPlayerNickname').textContent = `${p.nickname} (Disponibili: ${p.soldi}$)`;
  document.getElementById('investAmount').value = '';
  document.getElementById('investAmount').max = p.soldi;
  document.getElementById('investError').style.display = 'none';
  document.getElementById('investModal').classList.add('open');
};

window.buyDrinkAll = function(playerIdx) {
  const p = gameState.players[playerIdx];
  if (p.soldi < 500) return;

  p.soldi -= 500;
  p.totSpesiSessione += 500;

  gameState.players.forEach(target => {
    target.shottini += 1;
  });

  addLog(`🍻 ${p.nickname} ha speso 500$ per FAR BERE TUTTI (+1 shottino a ogni giocatore)!`);
  saveGameState();
  renderGame();
};

window.buyShield = function(playerIdx) {
  const p = gameState.players[playerIdx];
  if (p.soldi < 500 || p.scudo) return;

  p.soldi -= 500;
  p.totSpesiSessione += 500;
  p.scudo = true;

  addLog(`🛡️ ${p.nickname} ha acquistato uno SCUDO per 500$!`);
  saveGameState();
  renderGame();
};

function setupFallbackScreen() {
  document.getElementById('setupScreen').style.display = 'block';
  document.getElementById('gameArena').style.display = 'none';

  const players = JSON.parse(localStorage.getItem(STORAGE_PLAYERS_KEY) || '[]');
  const activePlayers = players.filter(p => p.stato === 'attivo');
  const list = document.getElementById('setupPlayerList');
  const alertBox = document.getElementById('setupAlert');
  const btnStart = document.getElementById('btnStartFromPartita');

  list.innerHTML = '';
  if (activePlayers.length < 3) {
    alertBox.textContent = `Ci sono solo ${activePlayers.length} giocatori attivi. Ne servono ALMENO 3 per avviare la partita!`;
    alertBox.style.display = 'block';
    btnStart.disabled = true;
  }

  activePlayers.forEach(p => {
    const label = document.createElement('label');
    label.style.cssText = 'background:#0f172a; padding:0.75rem; border-radius:8px; border:1px solid var(--border-color); display:flex; align-items:center; gap:0.6rem; cursor:pointer;';
    label.innerHTML = `<input type="checkbox" value="${p.id}" checked style="width:18px; height:18px;"> <strong>${p.nickname}</strong> (${p.nome})`;
    list.appendChild(label);
  });

  btnStart.onclick = () => {
    const checked = Array.from(list.querySelectorAll('input:checked')).map(i => i.value);
    if (checked.length < 3) {
      alertBox.textContent = 'Seleziona ALMENO 3 giocatori per giocare!';
      alertBox.style.display = 'block';
      return;
    }
    const selected = activePlayers.filter(p => checked.includes(String(p.id)));
    gameState = {
      startedAt: new Date().toISOString(),
      round: 1,
      currentPlayerIndex: 0,
      hasRolled: false,
      hasDrawn: false,
      players: selected.map(p => ({
        id: p.id,
        nome: p.nome,
        cognome: p.cognome,
        nickname: p.nickname,
        soldi: 200,
        shottini: 0,
        scudo: false,
        nextInvestSafe: false,
        nextInvestPenalty40: false,
        doubleNextGain: false,
        halveNextGain: false,
        nextTurnProtected: false,
        doubleNextPenalty: false,
        nextTurnDrawTwice: false,
        drawsRemainingThisTurn: 1,
        investments: [],
        totGuadagnatiSessione: 200,
        totSpesiSessione: 0
      })),
      logs: ['Partita avviata! Ogni giocatore parte con 200$.']
    };
    saveGameState();
    location.reload();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  gameState = getGameState();

  if (!gameState || !gameState.players || gameState.players.length < 3) {
    setupFallbackScreen();
    return;
  }

  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('gameArena').style.display = 'block';

  // Pulsante Lancia Dado
  document.getElementById('btnRollDice').addEventListener('click', () => {
    if (gameState.hasRolled) return;
    const player = gameState.players[gameState.currentPlayerIndex];
    const roll = rollThreeSidedDice();
    lastDiceRollValue = roll;
    document.getElementById('diceResultBox').textContent = `🎲 ${roll}`;

    if (player.scudo || player.nextTurnProtected) {
      addLog(`🎲 ${player.nickname} lancia ${roll}, ma ha lo SCUDO attivo: il lancio del dado non viene contato!`);
    } else {
      player.shottini += roll;
      addLog(`🎲 ${player.nickname} lancia il dado ed esce ${roll} -> +${roll} shottini!`);
    }

    gameState.hasRolled = true;
    saveGameState();
    renderGame();
  });

  // Pulsante Pesca Carta
  document.getElementById('btnDrawCard').addEventListener('click', () => {
    if (gameState.hasDrawn) return;
    const card = drawRandomCard();
    applyCardEffect(card, gameState.currentPlayerIndex, false);
  });

  // Pulsante Prossimo Turno
  document.getElementById('btnNextTurn').addEventListener('click', () => {
    if (!(gameState.hasRolled && gameState.hasDrawn)) return;

    const prevPlayer = gameState.players[gameState.currentPlayerIndex];
    // Resetta protezione temporanea di fine turno
    prevPlayer.nextTurnProtected = false;
    lastDiceRollValue = 0;
    document.getElementById('diceResultBox').textContent = '🎲 -';
    document.getElementById('lastCardDisplay').style.display = 'none';

    // Avanza indice giocatore
    gameState.currentPlayerIndex += 1;
    if (gameState.currentPlayerIndex >= gameState.players.length) {
      gameState.currentPlayerIndex = 0;
      gameState.round += 1;
    }

    const nextPlayer = gameState.players[gameState.currentPlayerIndex];
    gameState.hasRolled = false;
    gameState.hasDrawn = false;

    // Gestione doppio pescaggio da Super Malus
    if (nextPlayer.nextTurnDrawTwice) {
      nextPlayer.drawsRemainingThisTurn = 2;
      nextPlayer.nextTurnDrawTwice = false;
      addLog(`⚠️ ${nextPlayer.nickname} dovrà pescare 2 carte in questo turno!`);
    } else {
      nextPlayer.drawsRemainingThisTurn = 1;
    }

    // Regola Monopoli: dal round 2 in poi, quando torna il proprio turno ottiene +100$
    if (gameState.round >= 2) {
      addMoney(nextPlayer, 100);
      addLog(`💵 Giro completato! ${nextPlayer.nickname} riceve +100$ (Logica Monopoli).`);
    }

    // Controlla eventuali investimenti giunti a maturazione
    resolveInvestmentsForPlayer(nextPlayer);

    saveGameState();
    renderGame();
  });

  // Conferma Investimento
  document.getElementById('confirmInvestBtn').addEventListener('click', () => {
    const p = gameState.players[investingPlayerIdx];
    const amount = parseInt(document.getElementById('investAmount').value, 10);
    const type = document.getElementById('investType').value;
    const errBox = document.getElementById('investError');

    if (isNaN(amount) || amount <= 0 || amount > p.soldi) {
      errBox.textContent = `Inserisci un importo valido compreso tra 1$ e ${p.soldi}$.`;
      errBox.style.display = 'block';
      return;
    }

    let turnsDelay = 2;
    let risk = 0.40;
    let rate = 0.40;
    let label = 'Breve termine';

    if (type === 'medio') {
      turnsDelay = 3;
      risk = 0.30;
      rate = 0.30;
      label = 'Medio termine';
    } else if (type === 'lungo') {
      turnsDelay = 4;
      risk = 0.20;
      rate = 0.20;
      label = 'Lungo termine';
    }

    p.soldi -= amount;
    p.totSpesiSessione += amount;
    const targetRound = gameState.round + turnsDelay;

    p.investments.push({
      amount,
      type: label,
      risk,
      rate,
      targetRound
    });

    addLog(`📈 ${p.nickname} ha investito ${amount}$ (${label}). Esito al Turno #${targetRound}.`);
    document.getElementById('investModal').classList.remove('open');
    saveGameState();
    renderGame();
  });

  // Legenda e Chiusura Modali
  document.getElementById('btnLegenda').addEventListener('click', () => {
    document.getElementById('legendaModal').classList.add('open');
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close')).classList.remove('open');
    });
  });

  // Termina Partita e salva statistiche
  document.getElementById('btnEndGame').addEventListener('click', () => {
    if (!confirm('Vuoi terminare la partita e salvare i risultati nelle Statistiche?')) return;

    let stats = JSON.parse(localStorage.getItem(STORAGE_STATS_KEY) || '[]');
    gameState.players.forEach(gp => {
      let s = stats.find(item => String(item.id) === String(gp.id));
      if (!s) {
        s = {
          id: gp.id,
          nome: gp.nome,
          cognome: gp.cognome,
          nickname: gp.nickname,
          partiteGiocate: 0,
          shottiniBevuti: 0,
          totSoldiGuadagnati: 0,
          totSoldiSpesi: 0
        };
        stats.push(s);
      }
      s.partiteGiocate += 1;
      s.shottiniBevuti += gp.shottini;
      s.totSoldiGuadagnati += gp.totGuadagnatiSessione;
      s.totSoldiSpesi += gp.totSpesiSessione;
    });

    localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
    localStorage.removeItem(STORAGE_ACTIVE_GAME_KEY);
    window.location.href = '../statistiche/statistiche.html';
  });

  renderGame();
});
