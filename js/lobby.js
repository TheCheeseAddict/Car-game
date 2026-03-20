import { state } from './state.js';
import { MAPS } from './maps.js';
import { computeSpline, loadMap } from './track.js';
import { resetGame } from './menu.js';

export function showMainLobby() {
  document.getElementById('mpScreen').style.display     = 'none';
  document.getElementById('lobbyScreen').style.display  = 'flex';
  document.getElementById('mpBtn').style.display        = 'block';
  document.getElementById('mpBack').style.display       = 'none';
}

export function showMpLobby() {
  document.getElementById('lobbyScreen').style.display  = 'none';
  document.getElementById('mpScreen').style.display     = 'flex';
  document.getElementById('mpBtn').style.display        = 'none';
  document.getElementById('mpBack').style.display       = 'block';
  document.getElementById('lobbyStatus').textContent    = '';
  document.getElementById('btnStartRace').style.display = 'none';
  drawMapPreview('mpLmapCanvas');
}

export function drawMapPreview(canvasId) {
  const previewCanvas = document.getElementById(canvasId);
  if (!previewCanvas) return;
  const index = state.lobbyMapIndex;
  const pctx = previewCanvas.getContext('2d');
  const pw = previewCanvas.width, ph = previewCanvas.height;
  pctx.clearRect(0, 0, pw, ph);

  const pts = computeSpline(MAPS[index].trackPoints);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const pad = 10;
  const scale = Math.min((pw - pad*2) / (maxX - minX), (ph - pad*2) / (maxY - minY));
  const ox = pad + ((pw - pad*2) - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = pad + ((ph - pad*2) - (maxY - minY) * scale) / 2 - minY * scale;

  pctx.strokeStyle = '#888';
  pctx.lineWidth = 4;
  pctx.lineJoin = 'round';
  pctx.lineCap = 'round';
  pctx.beginPath();
  pctx.moveTo(pts[0].x * scale + ox, pts[0].y * scale + oy);
  for (let i = 1; i < pts.length; i++) pctx.lineTo(pts[i].x * scale + ox, pts[i].y * scale + oy);
  pctx.closePath();
  pctx.stroke();
}

export function updateLobbyMapDisplay() {
  const { lobbyMapIndex } = state;
  const name = MAPS[lobbyMapIndex].name;
  const best = parseFloat(localStorage.getItem(`best_lap_map${lobbyMapIndex}`));
  const bestStr = isFinite(best) ? `Best: ${best.toFixed(2)}s` : 'No best time yet';

  document.getElementById('lmapName').textContent   = name;
  document.getElementById('lmapBest').textContent   = bestStr;
  document.getElementById('mpLmapName').textContent = name;
  document.getElementById('mpLmapBest').textContent = bestStr;

  drawMapPreview('lmapCanvas');
  drawMapPreview('mpLmapCanvas');

  document.querySelectorAll('.lmap-dot').forEach((d, i) => d.classList.toggle('active', i === lobbyMapIndex));
}

export function spinLobbyMap(direction) {
  const card   = document.getElementById('lmapCard');
  const mpCard = document.getElementById('mpLmapCard');

  function slideOut(el) {
    el.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    el.style.transform  = direction > 0 ? 'translateX(-115%)' : 'translateX(115%)';
    el.style.opacity    = '0';
  }
  function slideIn(el) {
    el.style.transition = 'none';
    el.style.transform  = direction > 0 ? 'translateX(115%)' : 'translateX(-115%)';
    el.style.opacity    = '0';
    void el.offsetWidth;
    el.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    el.style.transform  = 'translateX(0)';
    el.style.opacity    = '1';
  }

  slideOut(card);
  slideOut(mpCard);

  setTimeout(() => {
    state.lobbyMapIndex = (state.lobbyMapIndex + direction + MAPS.length) % MAPS.length;
    loadMap(state.lobbyMapIndex);
    resetGame();
    updateLobbyMapDisplay();
    slideIn(card);
    slideIn(mpCard);
  }, 150);
}
