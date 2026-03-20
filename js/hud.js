import { state } from './state.js';

export function updateHUD() {
  const { car } = state;
  const spd = Math.sqrt(car.vx*car.vx + car.vy*car.vy) * 40;
  document.getElementById('speedVal').textContent = spd.toFixed(0);
  document.getElementById('lapDisplayVal').textContent = `${Math.min(car.laps, car.totalLaps)}/${car.totalLaps}`;

  const timerEl = document.getElementById('raceTimer');
  if (car.raceStarted && !car.finished) {
    const elapsed = (performance.now() - car.lapStartTime) / 1000;
    document.getElementById('lapTimeVal').textContent = elapsed.toFixed(1) + 's';
    timerEl.textContent = elapsed.toFixed(2) + 's';
    timerEl.style.display = 'block';
  } else {
    timerEl.style.display = 'none';
  }
}

export function showWinner(title, isYou, stats) {
  const { roomCode, currentMapIndex } = state;
  document.getElementById('winnerTitle').textContent = title;
  document.getElementById('winnerTitle').style.color = isYou ? '#fc0' : '#f55';
  document.getElementById('wsBest').textContent  = stats && stats.best  != null ? stats.best.toFixed(2)  + 's' : '—';
  document.getElementById('wsWorst').textContent = stats && stats.worst != null ? stats.worst.toFixed(2) + 's' : '—';
  document.getElementById('wsAvg').textContent   = stats && stats.avg   != null ? stats.avg.toFixed(2)  + 's' : '—';

  const allTimeEl = document.getElementById('wsAllTimeBest');
  if (!roomCode && stats && stats.best != null) {
    const key = `best_lap_map${currentMapIndex}`;
    const stored = parseFloat(localStorage.getItem(key)) || Infinity;
    if (stats.best < stored) localStorage.setItem(key, stats.best.toString());
    const allTime = Math.min(stats.best, stored);
    allTimeEl.textContent = allTime.toFixed(2) + 's';
  } else {
    allTimeEl.textContent = '—';
  }

  document.getElementById('winnerBanner').style.display = 'block';
  state.car.finished = true;
}

export function loadGhost() {
  const { currentMapIndex } = state;
  try {
    const saved = localStorage.getItem(`ghost_map${currentMapIndex}`);
    if (saved) {
      const data = JSON.parse(saved);
      state.ghostReplay          = Array.isArray(data) ? data : (data.frames || []);
      state.ghostCheckpointTimes = Array.isArray(data) ? [] : (data.checkpointTimes || []);
    } else {
      state.ghostReplay          = [];
      state.ghostCheckpointTimes = [];
    }
  } catch (e) {
    state.ghostReplay          = [];
    state.ghostCheckpointTimes = [];
  }
  state.ghostFrames           = [];
  state.ghostRecordingCpTimes = [];
  state.ghostIndex            = 0;
  state.ghostSplitIdx         = 0;
  state.ghostSaved            = false;
}

export function clearSplit() {
  clearTimeout(state.splitFadeTimer);
  clearTimeout(state.splitHideTimer);
  state.splitFadeTimer = null;
  state.splitHideTimer = null;
  const el = document.getElementById('splitDisplay');
  el.style.display = 'none';
  el.style.opacity = '1';
}

export function showSplit(delta) {
  clearSplit();
  const el = document.getElementById('splitDisplay');
  el.textContent   = (delta >= 0 ? '+' : '-') + Math.abs(delta).toFixed(2);
  el.style.color   = delta >= 0 ? '#f44' : '#4f4';
  el.style.opacity = '1';
  el.style.display = 'block';
  state.splitFadeTimer = setTimeout(() => {
    el.style.opacity = '0';
    state.splitHideTimer = setTimeout(() => {
      el.style.display = 'none';
      el.style.opacity = '1';
    }, 400);
  }, 2200);
}
