import { state, W, H } from './state.js';
import { MAPS } from './maps.js';
import { loadMap } from './track.js';
import { loadGhost } from './hud.js';
import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export function openMenu() {
  state.paused = true;
  document.getElementById('menuOverlay').classList.add('open');
  document.getElementById('menuGhostSection').style.display = state.roomCode ? 'none' : 'block';
  document.getElementById('menuGhostOn').classList.toggle('active',  state.ghostEnabled);
  document.getElementById('menuGhostOff').classList.toggle('active', !state.ghostEnabled);
}

export function closeMenu() {
  state.paused = false;
  document.getElementById('menuOverlay').classList.remove('open');
}

export function setGhost(enabled) {
  state.ghostEnabled = enabled;
  document.getElementById('menuGhostOn').classList.toggle('active',   enabled);
  document.getElementById('menuGhostOff').classList.toggle('active',  !enabled);
  document.getElementById('lobbyGhostOn').classList.toggle('active',  enabled);
  document.getElementById('lobbyGhostOff').classList.toggle('active', !enabled);
}

export function resetGame() {
  const { car, sfPt, sfNx, sfNy, sfDx, sfDy, checkpoints,
          roomCode, isHost, currentMapIndex } = state;
  car.x = sfPt.x + sfNx * 5;
  car.y = sfPt.y + sfNy * 5;
  car.prevX = car.x; car.prevY = car.y;
  car.angle = Math.atan2(sfDy, sfDx);
  car.vx = 0; car.vy = 0;
  car.laps = 0;
  car.bestLap = null;
  car.worstLap = null;
  car.lapStartTime = null;
  car.raceStartTime = null;
  car.raceStarted = false;
  car.finished = false;
  checkpoints.forEach(c => c.hit = false);
  car.steerAmount = 0;
  document.getElementById('msg').style.display = 'none';
  document.getElementById('winnerBanner').style.display = 'none';
  if (roomCode && isHost && state.db) set(ref(state.db, `rooms/${roomCode}/winner`), null);
  if (MAPS[currentMapIndex].scrolling) { state.camX = car.x - W/2; state.camY = car.y - H/2; }
  if (!roomCode) loadGhost();

  state.raceResults    = [];
  state.resultsVisible = false;
  clearTimeout(state.resultsTimer);
  state.resultsTimer   = null;
  const ro = document.getElementById('resultsOverlay');
  if (ro) ro.classList.remove('open');
  if (state.aiRaceMode) state.initAICars?.();
}

export function setLaps(n) {
  n = Math.max(1, Math.min(20, n));
  state.car.totalLaps = n;
  document.getElementById('lobbyLapsVal').textContent = n;
  document.getElementById('mpLapsVal').textContent    = n;
  if (state.isHost && state.roomCode && state.db) {
    set(ref(state.db, `rooms/${state.roomCode}/laps`), n);
  }
}

export function switchMap(index) {
  loadMap(index);
  resetGame();
  closeMenu();
  document.querySelectorAll('.map-btn').forEach((btn, i) =>
    btn.classList.toggle('active', i === index));
  document.querySelectorAll('.menu-map-btn').forEach((btn, i) =>
    btn.classList.toggle('active', i === index));
  if (state.isHost && state.roomCode && state.db) {
    set(ref(state.db, `rooms/${state.roomCode}/mapIndex`), index);
  }
}

export function setupInputListeners() {
  document.addEventListener('keydown', e => {
    if (state.soloSetupActive && e.key === 'Escape') {
      document.getElementById('soloSetupOverlay').classList.remove('open');
      state.soloSetupActive = false;
      return;
    }
    if (e.key === 'Escape') { state.paused ? closeMenu() : openMenu(); return; }
    if (e.target.tagName === 'INPUT') return;
    state.keys[e.key] = true;
    if (e.key === 'r' || e.key === 'R') resetGame();
  });
  document.addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT') return;
    state.keys[e.key] = false;
  });
  document.addEventListener('focusin', e => {
    if (e.target.tagName === 'INPUT') Object.keys(state.keys).forEach(k => state.keys[k] = false);
  });
}
