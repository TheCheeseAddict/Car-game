import { state } from './state.js';
import { MAPS } from './maps.js';
import { pointOnTrack, segCross } from './track.js';

// ── DIFFICULTY PARAMS ──────────────────────────────────────────────────────────
// Ghost-following mode (when saved run exists)
const AI_GHOST = {
  easy:   { speedFactor: 0.68, lookahead: 25, steerNoise: 0.018 },
  medium: { speedFactor: 0.82, lookahead: 15, steerNoise: 0.008 },
  hard:   { speedFactor: 0.96, lookahead:  8, steerNoise: 0.001 },
};
// Spline-following fallback (when no saved run exists for this map)
const AI_SPLINE = {
  easy:   { maxSpeedFactor: 0.68, lookahead: 22, cornerBrakeThreshold: 0.10, steerNoise: 0.015 },
  medium: { maxSpeedFactor: 0.82, lookahead: 16, cornerBrakeThreshold: 0.16, steerNoise: 0.007 },
  hard:   { maxSpeedFactor: 0.94, lookahead: 11, cornerBrakeThreshold: 0.22, steerNoise: 0.002 },
};

const AI_NAMES  = ['NITRO', 'BLAZE', 'STORM'];
const AI_COLORS = ['#33cc44', '#9933ff', '#00cccc'];

// Shared ghost path for all AI cars in the current race (null = no ghost, use spline)
let ghostFrames = null;

function loadGhostFrames(mapIndex) {
  try {
    const saved = localStorage.getItem(`ghost_map${mapIndex}`);
    if (!saved) return null;
    const data  = JSON.parse(saved);
    const frames = Array.isArray(data) ? data : (data.frames || []);
    return frames.length > 30 ? frames : null;  // need a meaningful recording
  } catch {
    return null;
  }
}

// Average speed (px/tick) at a ghost frame index over a small window
function ghostSpeed(frames, idx) {
  let total = 0;
  for (let i = 0; i < 6; i++) {
    const a = frames[(idx + i)     % frames.length];
    const b = frames[(idx + i + 1) % frames.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / 6;
}

// ── INIT ───────────────────────────────────────────────────────────────────────
export function initAICars() {
  const { splinePts, NSPLINE, aiCount, aiDifficulty, currentMapIndex } = state;
  ghostFrames = loadGhostFrames(currentMapIndex);

  const gd = AI_GHOST[aiDifficulty]  || AI_GHOST.easy;
  const sd = AI_SPLINE[aiDifficulty] || AI_SPLINE.easy;
  state.aiCars = [];

  for (let i = 0; i < aiCount; i++) {
    let startX, startY, startAngle, ghostFrameIdx;

    if (ghostFrames) {
      // Start each AI car at a ghost frame offset so they're staggered behind
      // car 0: frame 0 (at race start position)
      // car 1: ~1 second (60 frames) before that in the loop — physically just behind start
      // car 2: ~2 seconds before, etc.
      ghostFrameIdx = (ghostFrames.length - i * 60 + ghostFrames.length) % ghostFrames.length;
      const f     = ghostFrames[ghostFrameIdx];
      const fNext = ghostFrames[(ghostFrameIdx + 1) % ghostFrames.length];
      startX     = f.x;
      startY     = f.y;
      startAngle = Math.atan2(fNext.y - f.y, fNext.x - f.x);
    } else {
      // Spline-based stagger
      const startIdx = (NSPLINE - (i + 1) * 10 + NSPLINE) % NSPLINE;
      const sp       = splinePts[startIdx];
      const spNext   = splinePts[(startIdx + 1) % NSPLINE];
      startX         = sp.x;
      startY         = sp.y;
      startAngle     = Math.atan2(spNext.y - sp.y, spNext.x - sp.x);
      ghostFrameIdx  = 0;
    }

    state.aiCars.push({
      x: startX, y: startY,
      prevX: startX, prevY: startY,
      angle: startAngle,
      speed: 0, vx: 0, vy: 0,
      // Spline tracking (used in fallback mode)
      splineIdx: 0,
      // Ghost tracking
      ghostFrameIdx,
      laps: 0,
      checkpointsHit: [false, false, false, false],
      finished: false, finishTime: null,
      name: AI_NAMES[i], color: AI_COLORS[i],
      // Ghost-mode params
      speedFactor: gd.speedFactor,
      lookahead:   gd.lookahead,
      steerNoise:  gd.steerNoise,
      // Spline-fallback params
      maxSpeedFactor: sd.maxSpeedFactor,
      splineLookahead: sd.lookahead,
      cornerBrakeThreshold: sd.cornerBrakeThreshold,
      recoveryTimer: 0,
    });
  }
}

// ── GHOST-FOLLOWING UPDATE ─────────────────────────────────────────────────────
function updateAIGhost(ai) {
  if (ai.finished || state.paused) return;
  const frames = ghostFrames;
  const n = frames.length;

  // 1. Lookahead target position from ghost
  const targetIdx = (ai.ghostFrameIdx + ai.lookahead) % n;
  const target = frames[targetIdx];

  // 2. Steer toward target
  const desiredAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
  let diff = desiredAngle - ai.angle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxSteer = state.STEER_SPEED * 1.3;
  ai.angle += Math.max(-maxSteer, Math.min(maxSteer, diff));

  // 3. Steer noise (difficulty imperfection)
  ai.angle += (Math.random() - 0.5) * 2 * ai.steerNoise;

  // 4. Speed: mirror ghost speed × difficulty factor
  const refSpeed  = ghostSpeed(frames, ai.ghostFrameIdx);
  const targetSpd = refSpeed * ai.speedFactor;
  if (ai.speed < targetSpd) {
    ai.speed += state.ACCEL * 0.8;
  } else {
    ai.speed = Math.max(ai.speed - state.ACCEL * 0.4, targetSpd);
  }

  // 5. Off-track penalty (still useful if noise pushes AI off)
  if (!pointOnTrack(ai.x, ai.y)) {
    ai.recoveryTimer++;
    ai.speed = Math.min(ai.speed, state.OFFTRACK_MAX);
  } else {
    ai.recoveryTimer = 0;
  }

  // 6. Friction
  ai.speed *= 0.97;

  // 7. Move
  ai.prevX = ai.x; ai.prevY = ai.y;
  ai.x += Math.cos(ai.angle) * ai.speed;
  ai.y += Math.sin(ai.angle) * ai.speed;

  // 8. Advance ghost frame index: find nearest frame in a forward window
  let bestDist = Infinity;
  for (let k = 1; k <= 90; k++) {
    const ki  = (ai.ghostFrameIdx + k) % n;
    const f   = frames[ki];
    const dx  = f.x - ai.x, dy = f.y - ai.y;
    const d   = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; ai.ghostFrameIdx = ki; }
    else if (k > 15 && d > bestDist * 4) break; // past closest point
  }
}

// ── SPLINE-FOLLOWING UPDATE (fallback when no ghost exists) ───────────────────
function updateAISpline(ai) {
  if (ai.finished || state.paused) return;
  const { splinePts, NSPLINE } = state;

  const targetIdx = (ai.splineIdx + ai.splineLookahead) % NSPLINE;
  const target    = splinePts[targetIdx];

  let diff = Math.atan2(target.y - ai.y, target.x - ai.x) - ai.angle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxSteer = state.STEER_SPEED * 1.2;
  ai.angle += Math.max(-maxSteer, Math.min(maxSteer, diff));
  ai.angle += (Math.random() - 0.5) * 2 * ai.steerNoise;

  // Corner detection
  const a1 = splinePts[ai.splineIdx % NSPLINE];
  const a2 = splinePts[(ai.splineIdx + ai.splineLookahead) % NSPLINE];
  const a3 = splinePts[(ai.splineIdx + ai.splineLookahead * 2) % NSPLINE];
  let cDiff = Math.atan2(a3.y - a2.y, a3.x - a2.x) - Math.atan2(a2.y - a1.y, a2.x - a1.x);
  while (cDiff >  Math.PI) cDiff -= Math.PI * 2;
  while (cDiff < -Math.PI) cDiff += Math.PI * 2;
  const isSharpCorner = Math.abs(cDiff) > ai.cornerBrakeThreshold;

  const targetSpd = state.MAX_SPEED * ai.maxSpeedFactor * (isSharpCorner ? 0.65 : 1.0);
  if (ai.speed < targetSpd) {
    ai.speed += state.ACCEL * 0.8;
  } else {
    ai.speed = Math.max(ai.speed - state.ACCEL * 0.4, targetSpd);
  }

  if (!pointOnTrack(ai.x, ai.y)) {
    ai.recoveryTimer++;
    ai.speed = Math.min(ai.speed, state.OFFTRACK_MAX);
    let bestDist = Infinity, bestIdx = ai.splineIdx;
    for (let k = -30; k <= 30; k++) {
      const ki = (ai.splineIdx + k + NSPLINE) % NSPLINE;
      const sp = splinePts[ki];
      const dx = sp.x - ai.x, dy = sp.y - ai.y;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = ki; }
    }
    const rsp    = splinePts[bestIdx];
    let rDiff    = Math.atan2(rsp.y - ai.y, rsp.x - ai.x) - ai.angle;
    while (rDiff >  Math.PI) rDiff -= Math.PI * 2;
    while (rDiff < -Math.PI) rDiff += Math.PI * 2;
    ai.angle += Math.max(-maxSteer, Math.min(maxSteer, rDiff * 0.4));
  } else {
    ai.recoveryTimer = 0;
  }

  ai.speed *= 0.97;
  ai.prevX = ai.x; ai.prevY = ai.y;
  ai.x += Math.cos(ai.angle) * ai.speed;
  ai.y += Math.sin(ai.angle) * ai.speed;

  let bestDist2 = Infinity;
  for (let k = 1; k <= 50; k++) {
    const ki = (ai.splineIdx + k) % NSPLINE;
    const sp = splinePts[ki];
    const dx = sp.x - ai.x, dy = sp.y - ai.y;
    const d  = dx * dx + dy * dy;
    if (d < bestDist2) { bestDist2 = d; ai.splineIdx = ki; }
    else if (k > 5 && d > bestDist2 * 4) break;
  }
}

// ── LAP / CHECKPOINT TRACKING ─────────────────────────────────────────────────
function checkAILapCross(ai) {
  if (ai.finished) return;
  const { checkpoints, sfDx, sfDy, finishA, finishB, car } = state;
  const px = ai.prevX, py = ai.prevY, cx = ai.x, cy = ai.y;

  for (let i = 0; i < checkpoints.length; i++) {
    if (!ai.checkpointsHit[i]) {
      const cp = checkpoints[i];
      if (segCross(px, py, cx, cy, cp.ax, cp.ay, cp.bx, cp.by) !== null) {
        ai.checkpointsHit[i] = true;
      }
    }
  }

  const dir = segCross(px, py, cx, cy, finishA.x, finishA.y, finishB.x, finishB.y);
  if (dir !== null) {
    const moveDot = (cx - px) * sfDx + (cy - py) * sfDy;
    if (moveDot > 0 && ai.checkpointsHit.every(h => h)) {
      ai.laps++;
      ai.checkpointsHit = [false, false, false, false];
      if (ai.laps >= car.totalLaps) {
        ai.finished   = true;
        ai.finishTime = car.raceStartTime
          ? (performance.now() - car.raceStartTime) / 1000 : 0;
        state.raceResults.push({
          name: ai.name, time: ai.finishTime,
          position: state.raceResults.length + 1, isPlayer: false,
        });
        maybeShowResults();
      }
    }
  }
}

// ── PUBLIC EXPORTS ─────────────────────────────────────────────────────────────
export function updateAllAI() {
  if (!state.aiRaceMode) return;
  for (const ai of state.aiCars) {
    if (ghostFrames) {
      updateAIGhost(ai);
    } else {
      updateAISpline(ai);
    }
    checkAILapCross(ai);
  }
}

export function drawAICars() {
  if (!state.aiRaceMode) return;
  const ctx = state.ctx;
  const { currentMapIndex } = state;
  for (const ai of state.aiCars) {
    const col = ai.color;
    ctx.save();
    ctx.translate(ai.x, ai.y);
    ctx.rotate(ai.angle - Math.PI / 2);

    if (currentMapIndex === 3) {
      const cw = 10, ch = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(3,3,cw/2+2,ch/2+2,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,3); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.moveTo(-cw/2+1,-ch/2); ctx.lineTo(cw/2-1,-ch/2); ctx.lineTo(0,-ch/2-4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(100,200,255,0.75)';
      ctx.fillRect(-cw/2+2,-ch/2+6,cw-4,7);
      ctx.fillStyle = '#111';
      ctx.fillRect(-cw/2-4,ch/2-5,cw+8,3); ctx.fillRect(-cw/2-3,ch/2-9,2,5); ctx.fillRect(cw/2+1,ch/2-9,2,5);
      ctx.fillStyle = '#222';
      ctx.fillRect(-cw/2-5,-ch/2+3,5,8); ctx.fillRect(cw/2,-ch/2+3,5,8);
      ctx.fillRect(-cw/2-6,ch/2-11,6,10); ctx.fillRect(cw/2,ch/2-11,6,10);
    } else {
      const cw = 14, ch = 24;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(3,3,cw/2+2,ch/2+2,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,4); ctx.fill();
      ctx.fillStyle = 'rgba(150,220,255,0.7)';
      ctx.fillRect(-cw/2+3,-ch/2+4,cw-6,ch/2.5);
      ctx.fillStyle = 'rgba(150,220,255,0.5)';
      ctx.fillRect(-cw/2+3,ch/2-8,cw-6,5);
      ctx.fillStyle = '#222';
      ctx.fillRect(-cw/2-3,-ch/2+2,4,7); ctx.fillRect(cw/2-1,-ch/2+2,4,7);
      ctx.fillRect(-cw/2-3,ch/2-9,4,7);  ctx.fillRect(cw/2-1,ch/2-9,4,7);
    }

    ctx.rotate(-(ai.angle - Math.PI / 2));
    ctx.fillStyle = ai.color;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ai.name, 0, -20);
    ctx.restore();
  }
}

export function maybeShowResults() {
  if (!state.car.finished) return;
  const allDone = state.aiCars.every(ai => ai.finished);
  if (allDone) {
    showResultsOverlay();
  } else if (!state.resultsTimer) {
    state.resultsTimer = setTimeout(showResultsOverlay, 5000);
  }
}

function showResultsOverlay() {
  if (state.resultsVisible) return;
  state.resultsVisible = true;
  clearTimeout(state.resultsTimer);
  state.resultsTimer = null;

  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';
  let pos = 1;
  for (const r of state.raceResults) {
    const tr = document.createElement('tr');
    if (r.isPlayer) tr.classList.add('player-row');
    tr.innerHTML = `<td class="pos-col">${pos++}</td><td class="name-col">${r.name}</td><td class="time-col">${r.time.toFixed(2)}s</td>`;
    tbody.appendChild(tr);
  }
  for (const ai of state.aiCars) {
    if (!ai.finished) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="pos-col">${pos++}</td><td class="name-col">${ai.name}</td><td class="time-col">DNF</td>`;
      tbody.appendChild(tr);
    }
  }
  document.getElementById('resultsOverlay').classList.add('open');
}
