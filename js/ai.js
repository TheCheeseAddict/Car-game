import { state } from './state.js';
import { segCross, pointOnTrack } from './track.js';
import { showWinner } from './hud.js';

const AI_COLORS = ['#3388ff', '#33cc55', '#cc33ff'];
const AI_NAMES  = ['CYBORG', 'BLAZE', 'SPECTER'];

// speedFactor: fraction of MAX_SPEED | steerFactor: steering aggressiveness
// noiseAmp: random angle jitter per frame | lookahead: waypoints to look ahead
const DIFF_CONFIG = {
  easy:   { speedFactor: 0.68, steerFactor: 0.7,  noiseAmp: 0.018, lookahead: 16 },
  medium: { speedFactor: 0.82, steerFactor: 0.85, noiseAmp: 0.008, lookahead: 20 },
  hard:   { speedFactor: 0.96, steerFactor: 1.0,  noiseAmp: 0.001, lookahead: 26 },
};

export function initAICars() {
  const { splinePts, NSPLINE, aiCount, aiDifficulty } = state;
  const cfg = DIFF_CONFIG[aiDifficulty] || DIFF_CONFIG.medium;

  state.aiCars = [];
  state.aiFinished = 0;

  for (let i = 0; i < aiCount; i++) {
    // Stagger starting positions so cars don't stack at the line
    const startIdx = (NSPLINE - (i + 1) * 14 + NSPLINE) % NSPLINE;
    const sp     = splinePts[startIdx];
    const spNext = splinePts[(startIdx + 1) % NSPLINE];
    const startAngle = Math.atan2(spNext.y - sp.y, spNext.x - sp.x);

    state.aiCars.push({
      name:  AI_NAMES[i % AI_NAMES.length],
      color: AI_COLORS[i % AI_COLORS.length],
      x: sp.x, y: sp.y,
      prevX: sp.x, prevY: sp.y,
      angle: startAngle,
      vx: 0, vy: 0,
      splineIdx: startIdx,    // cached nearest spline index
      laps: 0,
      checkpointsHit: new Array(state.checkpoints.length).fill(false),
      finished: false,
      finishTime: null,
      speedFactor: cfg.speedFactor,
      steerFactor: cfg.steerFactor,
      noiseAmp:    cfg.noiseAmp,
      lookahead:   cfg.lookahead,
    });
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Full scan to find the true nearest spline point, but only accept it if it
// is within 30% of the track ahead (modular). This prevents snapping backward
// on looped tracks while still recovering correctly when off-track.
function findNearestSplineIdx(ai) {
  const pts = state.splinePts;
  const N   = state.NSPLINE;
  let best = ai.splineIdx, bestDist = Infinity;
  for (let i = 0; i < N; i++) {
    const pt = pts[i];
    const dx = ai.x - pt.x, dy = ai.y - pt.y;
    const d  = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  // Only advance forward — reject if the found index is further than 30% of
  // the track *behind* the current index (i.e. require it to be in the forward arc).
  const diff = (best - ai.splineIdx + N) % N;
  return diff < Math.floor(N * 0.7) ? best : ai.splineIdx;
}

// Returns 0 (sharp corner ahead) → 1 (straight ahead).
// Used to reduce speed before tight corners.
function getCornerFactor(nearestIdx, lookAhead) {
  const pts = state.splinePts;
  const N   = state.NSPLINE;
  let maxDelta = 0;
  for (let i = 1; i < lookAhead - 1; i++) {
    const a = pts[(nearestIdx + i - 1) % N];
    const b = pts[(nearestIdx + i)     % N];
    const c = pts[(nearestIdx + i + 1) % N];
    let diff = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
    if (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
    if (diff > maxDelta) maxDelta = diff;
  }
  return Math.max(0, 1 - maxDelta * 5);
}

// Mirrors checkObstacleCollisions() from rendering.js but for an AI car object.
function checkAIObstacles(ai) {
  const { obstacles, currentMapIndex } = state;
  const carR = 8;
  for (const o of obstacles) {
    if (currentMapIndex === 2) {
      // Forest map: log obstacles (box shape)
      const hw = o.r * 1.2, hh = o.r * 2.1;
      const angle = o.angle + Math.PI / 2;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const dx = ai.x - o.x, dy = ai.y - o.y;
      const lx =  dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA;
      const clampX = Math.max(-hw, Math.min(hw, lx));
      const clampY = Math.max(-hh, Math.min(hh, ly));
      const distX = lx - clampX, distY = ly - clampY;
      const dist = Math.sqrt(distX * distX + distY * distY);
      if (dist < carR) {
        let pushX, pushY;
        if (dist > 0.001) {
          pushX = distX / dist; pushY = distY / dist;
        } else {
          const ox = hw - Math.abs(lx), oy = hh - Math.abs(ly);
          if (ox < oy) { pushX = lx > 0 ? 1 : -1; pushY = 0; }
          else         { pushX = 0; pushY = ly > 0 ? 1 : -1; }
        }
        const overlap = carR - dist;
        const wpx = pushX * cosA - pushY * sinA;
        const wpy = pushX * sinA + pushY * cosA;
        ai.x += wpx * overlap;
        ai.y += wpy * overlap;
        const dot = ai.vx * wpx + ai.vy * wpy;
        if (dot < 0) { ai.vx -= dot * wpx * 1.4; ai.vy -= dot * wpy * 1.4; ai.vx *= 0.55; ai.vy *= 0.55; }
      }
    } else {
      // All other maps: round obstacles
      const dx = ai.x - o.x, dy = ai.y - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = carR + o.r;
      if (dist < minDist && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        ai.x += nx * overlap;
        ai.y += ny * overlap;
        const dot = ai.vx * nx + ai.vy * ny;
        if (dot < 0) { ai.vx -= dot * nx * 1.4; ai.vy -= dot * ny * 1.4; ai.vx *= 0.55; ai.vy *= 0.55; }
      }
    }
  }
}

// Mirrors checkLapCross() from lap.js but for an AI car object.
function checkAILapCross(ai) {
  const { checkpoints, finishA, finishB, sfDx, sfDy, car } = state;
  const px = ai.prevX, py = ai.prevY, cx = ai.x, cy = ai.y;

  for (let i = 0; i < checkpoints.length; i++) {
    if (!ai.checkpointsHit[i]) {
      const cp = checkpoints[i];
      if (segCross(px, py, cx, cy, cp.ax, cp.ay, cp.bx, cp.by) !== null)
        ai.checkpointsHit[i] = true;
    }
  }

  const dir = segCross(px, py, cx, cy, finishA.x, finishA.y, finishB.x, finishB.y);
  if (dir !== null) {
    const moveDot = (cx - px) * sfDx + (cy - py) * sfDy;
    if (moveDot > 0 && car.raceStarted && ai.checkpointsHit.every(Boolean)) {
      ai.laps++;
      ai.checkpointsHit.fill(false);
      if (ai.laps >= car.totalLaps && !ai.finished) {
        ai.finished = true;
        ai.finishTime = performance.now();
        state.aiFinished++;
        if (!car.finished) showWinner(ai.name + ' WINS!', false, null);
      }
    }
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export function updateAllAI(_dt) {
  if (!state.aiRaceMode || !state.aiCars.length) return;
  if (state.paused) return;

  const { splinePts, NSPLINE, currentMapIndex } = state;

  for (const ai of state.aiCars) {
    if (ai.finished) continue;

    // 1. Locate car on spline
    ai.splineIdx = findNearestSplineIdx(ai);

    // 2. Corner factor: 0 = sharp bend, 1 = straight (used for both lookahead and speed)
    const cf = getCornerFactor(ai.splineIdx, 22);

    // 3. Pick a target point ahead — shorter lookahead through tight corners
    const dynamicLookahead = Math.max(5, Math.round(ai.lookahead * (0.35 + 0.65 * cf)));
    const targetIdx = (ai.splineIdx + dynamicLookahead) % NSPLINE;
    const target = splinePts[targetIdx];

    // 4. Steer angle toward target (clamped to steer rate)
    const desiredAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
    let angleDiff = desiredAngle - ai.angle;
    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    const steerRate = state.STEER_SPEED * ai.steerFactor * 2.5;
    ai.angle += Math.max(-steerRate, Math.min(steerRate, angleDiff));

    // 5. Slight random jitter (lower difficulties weave more)
    if (ai.noiseAmp > 0) ai.angle += (Math.random() - 0.5) * 2 * ai.noiseAmp;

    // 6. Determine speed limit (mirrors player: on-track vs off-track)
    const onTrack = pointOnTrack(ai.x, ai.y);
    const maxSpd  = onTrack ? state.MAX_SPEED * ai.speedFactor : state.OFFTRACK_MAX;

    // 7. Reduce speed before sharp corners (reuse cf from above)
    const targetSpd = maxSpd * (0.55 + 0.45 * cf); // 55–100% of max based on curvature

    // 8. Accelerate toward target speed (same two-phase as player)
    const hx = Math.cos(ai.angle), hy = Math.sin(ai.angle);
    const spd = Math.sqrt(ai.vx * ai.vx + ai.vy * ai.vy);
    if (spd < targetSpd) {
      const accelMult = spd > state.SPEED_PHASE1 ? 0.55 : 1.0;
      ai.vx += hx * state.ACCEL * accelMult;
      ai.vy += hy * state.ACCEL * accelMult;
    }

    // 8. Hard speed cap
    const totalSpd = Math.sqrt(ai.vx * ai.vx + ai.vy * ai.vy);
    if (totalSpd > maxSpd) { ai.vx *= maxSpd / totalSpd; ai.vy *= maxSpd / totalSpd; }

    // 9. Lateral grip — bleeds off sideways velocity (same values as player)
    const longSpd = ai.vx * hx + ai.vy * hy;
    const grip = onTrack ? (currentMapIndex === 3 ? 0.38 : 0.58) : 0.42;
    ai.vx -= (ai.vx - longSpd * hx) * grip;
    ai.vy -= (ai.vy - longSpd * hy) * grip;

    // 10. Friction (same as player)
    const friction = onTrack ? state.FRICTION : 0.94;
    ai.vx *= friction;
    ai.vy *= friction;

    // 11. Obstacle collisions (same logic as player)
    checkAIObstacles(ai);

    // 12. Move
    ai.prevX = ai.x; ai.prevY = ai.y;
    ai.x += ai.vx;   ai.y += ai.vy;

    checkAILapCross(ai);
  }
}

export function drawAICars() {
  if (!state.aiRaceMode || !state.aiCars.length) return;
  const ctx    = state.ctx;
  const mapIdx = state.currentMapIndex;

  for (const ai of state.aiCars) {
    ctx.save();
    ctx.translate(ai.x, ai.y);
    ctx.rotate(ai.angle - Math.PI / 2);

    if (mapIdx === 3) {
      const cw = 10, ch = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(3,3,cw/2+2,ch/2+2,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = ai.color;
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
      ctx.fillStyle = ai.color;
      ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,4); ctx.fill();
      ctx.fillStyle = 'rgba(150,220,255,0.7)';
      ctx.fillRect(-cw/2+3,-ch/2+4,cw-6,ch/2.5);
      ctx.fillStyle = 'rgba(150,220,255,0.5)';
      ctx.fillRect(-cw/2+3,ch/2-8,cw-6,5);
      ctx.fillStyle = '#222';
      ctx.fillRect(-cw/2-3,-ch/2+2,4,7); ctx.fillRect(cw/2-1,-ch/2+2,4,7);
      ctx.fillRect(-cw/2-3,ch/2-9,4,7);  ctx.fillRect(cw/2-1,ch/2-9,4,7);
    }

    ctx.rotate(-(ai.angle - Math.PI/2));
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ai.name, 0, -20);
    ctx.restore();
  }
}

export function maybeShowResults() {
  if (!state.aiRaceMode || !state.aiCars.length) return;
  const overlay = document.getElementById('aiResultsOverlay');
  if (!overlay) return;

  const tbody = document.getElementById('aiResultsBody');
  tbody.innerHTML = '';

  const entries = [];
  if (state.car.finished) {
    entries.push({ name: state.playerName || 'YOU', time: state.car.raceFinishTime || performance.now(), isPlayer: true });
  }
  for (const ai of state.aiCars) {
    entries.push(ai.finished
      ? { name: ai.name, time: ai.finishTime, color: ai.color }
      : { name: ai.name, time: Infinity,      color: ai.color, laps: ai.laps });
  }
  entries.sort((a, b) => a.time - b.time);

  entries.forEach((e, idx) => {
    const tr = document.createElement('tr');
    const pos  = document.createElement('td'); pos.textContent  = `#${idx + 1}`;
    const name = document.createElement('td'); name.textContent = e.name;
    const info = document.createElement('td');
    name.style.color = e.isPlayer ? '#fc0' : (e.color || '#fff');
    info.textContent = e.time === Infinity ? `Lap ${e.laps || 0}/${state.car.totalLaps}` : 'FINISHED';
    tr.append(pos, name, info);
    tbody.appendChild(tr);
  });

  overlay.style.display = 'flex';
}
