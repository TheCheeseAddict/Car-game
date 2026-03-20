import { state } from './state.js';
import { segCross, pointOnTrack } from './track.js';
import { showWinner } from './hud.js';

const AI_COLORS = ['#3388ff', '#33cc55', '#cc33ff'];
const AI_NAMES  = ['CYBORG', 'BLAZE', 'SPECTER'];

// noiseAmp: max correlated drift | steerSmooth: steering inertia (higher = snappier)
// cornerBias: min speed fraction in corners (lower = harder braking)
const DIFF_CONFIG = {
  easy:   { noiseAmp: 0.014, lookahead: 16, steerSmooth: 0.10, cornerBias: 0.58 },
  medium: { noiseAmp: 0.007, lookahead: 20, steerSmooth: 0.16, cornerBias: 0.50 },
  hard:   { noiseAmp: 0.003, lookahead: 26, steerSmooth: 0.24, cornerBias: 0.42 },
};

const AI_SUBPOINT_COUNT = 15;
const AI_SUBPOINT_RADIUS = 40; // px — how close before advancing to next sub-point

export function initAICars() {
  const { splinePts, NSPLINE, aiCount, aiDifficulty } = state;
  const cfg = DIFF_CONFIG[aiDifficulty] || DIFF_CONFIG.medium;

  // Build 15 evenly-spaced navigation sub-points along the spline center line.
  // Each stores a perpendicular vector so cars can aim for different parts of the gate.
  // These are only used by AI for steering — they never affect lap/timer logic.
  state.aiSubpoints = [];
  for (let s = 0; s < AI_SUBPOINT_COUNT; s++) {
    const idx  = Math.floor(s * NSPLINE / AI_SUBPOINT_COUNT);
    const next = (idx + 1) % NSPLINE;
    const dx = splinePts[next].x - splinePts[idx].x;
    const dy = splinePts[next].y - splinePts[idx].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    state.aiSubpoints.push({
      x: splinePts[idx].x, y: splinePts[idx].y,
      nx:  dy / len,  // perpendicular (90° clockwise from tangent)
      ny: -dx / len,
    });
  }

  state.aiCars = [];
  state.aiFinished = 0;

  for (let i = 0; i < aiCount; i++) {
    // Stagger starting positions so cars don't stack at the line
    const startIdx = (NSPLINE - (i + 1) * 14 + NSPLINE) % NSPLINE;
    const sp     = splinePts[startIdx];
    const spNext = splinePts[(startIdx + 1) % NSPLINE];
    const startAngle = Math.atan2(spNext.y - sp.y, spNext.x - sp.x);

    // Find the first sub-point ahead of this car's starting spline position
    let startSubIdx = 0;
    let minFwdDist = NSPLINE;
    for (let s = 0; s < AI_SUBPOINT_COUNT; s++) {
      const subSplinePos = Math.floor(s * NSPLINE / AI_SUBPOINT_COUNT);
      const fwdDist = (subSplinePos - startIdx + NSPLINE) % NSPLINE;
      if (fwdDist < minFwdDist) { minFwdDist = fwdDist; startSubIdx = s; }
    }

    // Per-car personality — random variation within the difficulty's range
    const rand = () => Math.random() * 2 - 1; // [-1, 1]
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
      nextSubIdx: startSubIdx, // index into state.aiSubpoints — navigation target

      // Individuality
      lineOffset:   rand() * 22,                          // lateral offset from track center (px)
      steerInput:   0,                                    // smoothed steering value
      steerAmount:  0,                                    // steering buildup (same as player car.steerAmount)
      steerSmooth:  cfg.steerSmooth + rand() * 0.04,      // how fast steering reacts
      cornerBias:   cfg.cornerBias  + rand() * 0.06,      // min speed fraction in tight corners
      noiseOffset:  0,                                    // current correlated drift angle
      noiseAmp:     cfg.noiseAmp    + rand() * 0.003,

      finished: false,
      finishTime: null,
      lookahead:   cfg.lookahead,
    });
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Greedy forward advance: step forward only while the next spline point is
// closer to the car than the current one. Never goes backward, which prevents
// inner-track snapping on oval maps where inner/outer points are equidistant.
function findNearestSplineIdx(ai) {
  const pts = state.splinePts;
  const N   = state.NSPLINE;
  for (let guard = 0; guard < N; guard++) {
    const curr = pts[ai.splineIdx];
    const next = pts[(ai.splineIdx + 1) % N];
    const dxC = ai.x - curr.x, dyC = ai.y - curr.y;
    const dxN = ai.x - next.x, dyN = ai.y - next.y;
    if (dxN * dxN + dyN * dyN < dxC * dxC + dyC * dyC) {
      ai.splineIdx = (ai.splineIdx + 1) % N;
    } else {
      break;
    }
  }
  return ai.splineIdx;
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
  if (!state.obstaclesEnabled) return;
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
      if (segCross(px, py, cx, cy, cp.ax, cp.ay, cp.bx, cp.by) !== null) {
        ai.checkpointsHit[i] = true;
      }
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

  const { currentMapIndex } = state;

  for (const ai of state.aiCars) {
    if (ai.finished) continue;

    // 1. Locate car on spline
    ai.splineIdx = findNearestSplineIdx(ai);

    // 2. Corner factor: 0 = sharp bend, 1 = straight (used for speed scaling)
    const cf = getCornerFactor(ai.splineIdx, 22);

    // 3. Advance to next sub-point when close enough; each car aims for a
    //    laterally-offset position so they take different racing lines.
    const sub = state.aiSubpoints[ai.nextSubIdx];
    const dxS = sub.x - ai.x, dyS = sub.y - ai.y;
    if (dxS * dxS + dyS * dyS < AI_SUBPOINT_RADIUS * AI_SUBPOINT_RADIUS) {
      ai.nextSubIdx = (ai.nextSubIdx + 1) % AI_SUBPOINT_COUNT;
    }
    const tgt = state.aiSubpoints[ai.nextSubIdx];
    let targetX = tgt.x + ai.lineOffset * tgt.nx;
    let targetY = tgt.y + ai.lineOffset * tgt.ny;

    // 4. Heading from current angle — computed BEFORE steering (same as player)
    const hx = Math.cos(ai.angle), hy = Math.sin(ai.angle);
    const longSpd = ai.vx * hx + ai.vy * hy;
    const spd     = Math.abs(longSpd);

    // 5. Obstacle avoidance: scan ahead and deflect the target sideways away
    //    from any obstacle that lies in the forward path.
    if (state.obstaclesEnabled) {
      const avoidRange = 110;
      for (const o of state.obstacles) {
        const odx = o.x - ai.x, ody = o.y - ai.y;
        const odist = Math.sqrt(odx * odx + ody * ody);
        if (odist < 1 || odist > avoidRange) continue;
        const fwdDot  = (odx * hx  + ody * hy)  / odist; // 1 = straight ahead
        if (fwdDot < 0.1) continue;                       // ignore behind/beside
        const sideDot = (odx * (-hy) + ody * hx) / odist; // +1 = obstacle left of car
        const effR    = (currentMapIndex === 2 ? o.r * 2.4 : o.r * 1.6) + 14;
        if (Math.abs(sideDot) * odist > effR) continue;   // car won't hit it
        // Push target to the opposite side of the obstacle
        const strength = (1 - odist / avoidRange) * effR * 1.5;
        const pushSign = sideDot >= 0 ? 1 : -1; // push right if obstacle on left
        targetX += hy  *  pushSign * strength;   // (hy, -hx) = right perpendicular
        targetY += -hx *  pushSign * strength;
      }
    }

    // 6. Speed-dependent steer rate — identical formula to player
    let steerAmt;
    if (currentMapIndex === 3) {
      const SPD_LOW = 2.0, SPD_HIGH = state.MAX_SPEED;
      if (spd <= SPD_LOW) {
        steerAmt = 0.055 * (spd / 3.25);
      } else {
        const STEER_LOW = 0.055 * (SPD_LOW / 3.25);
        const t = Math.min(1, (spd - SPD_LOW) / (SPD_HIGH - SPD_LOW));
        steerAmt = STEER_LOW + (0.010 - STEER_LOW) * (t * t);
      }
    } else {
      steerAmt = state.STEER_SPEED * (spd / state.MAX_SPEED);
    }

    // 7. Smooth AI steering toward (possibly avoidance-adjusted) target
    const desiredAngle = Math.atan2(targetY - ai.y, targetX - ai.x);
    let angleDiff = desiredAngle - ai.angle;
    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    const desiredSteer = Math.max(-steerAmt, Math.min(steerAmt, angleDiff * 0.4));
    ai.steerInput += (desiredSteer - ai.steerInput) * ai.steerSmooth;

    // 8. Correlated noise — drifts gradually and decays; far less robotic than white noise
    ai.noiseOffset += (Math.random() - 0.5) * ai.noiseAmp;
    ai.noiseOffset *= 0.90;

    // 9. steerAmount buildup/decay (same values as player: +0.06 / -0.04, cap 0.7).
    //    Threshold is based on angleDiff so it doesn't falsely trigger at near-zero
    //    speeds where steerAmt ≈ 0 would make any tiny steerInput count as "turning".
    const isTurning = Math.abs(angleDiff) > 0.08;
    if (isTurning) {
      ai.steerAmount = Math.min(0.7, ai.steerAmount + 0.06);
    } else {
      ai.steerAmount = Math.max(0, ai.steerAmount - 0.04);
    }

    // 9. On-track check and speed target
    const onTrack  = pointOnTrack(ai.x, ai.y);
    const maxSpd   = onTrack ? state.MAX_SPEED : state.OFFTRACK_MAX;
    const targetSpd = maxSpd * (ai.cornerBias + (1 - ai.cornerBias) * cf);

    // 10. Accelerate toward target speed — same two-phase as player
    const curSpd = Math.sqrt(ai.vx * ai.vx + ai.vy * ai.vy);
    if (curSpd < targetSpd) {
      const accelMult = curSpd > state.SPEED_PHASE1 ? 0.55 : 1.0;
      ai.vx += hx * state.ACCEL * accelMult;
      ai.vy += hy * state.ACCEL * accelMult;
    }

    // 11. Speed cap with reverse penalty — same as player
    const totalSpd    = Math.sqrt(ai.vx * ai.vx + ai.vy * ai.vy);
    const effectiveMax = longSpd >= 0 ? maxSpd : maxSpd * 0.5;
    if (totalSpd > effectiveMax) { ai.vx *= effectiveMax / totalSpd; ai.vy *= effectiveMax / totalSpd; }

    // 12. Lateral grip modified by steerAmount — identical to player
    const baseGrip = onTrack ? (currentMapIndex === 3 ? 0.38 : 0.58) : 0.42;
    const grip     = Math.max(0.07, baseGrip - ai.steerAmount * 0.85);
    const latVx = ai.vx - longSpd * hx;
    const latVy = ai.vy - longSpd * hy;
    ai.vx -= latVx * grip;
    ai.vy -= latVy * grip;

    // 13. Friction — same as player; map 3 reduces it when steering
    let friction = onTrack ? state.FRICTION : 0.94;
    if (currentMapIndex === 3) friction *= (1 - ai.steerAmount * 0.06);
    ai.vx *= friction;
    ai.vy *= friction;

    // 14. Apply steering + noise to angle — AFTER physics, same order as player
    ai.angle += ai.steerInput + ai.noiseOffset;

    // 15. Obstacle collisions (same logic as player)
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
