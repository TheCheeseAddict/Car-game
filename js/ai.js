import { state } from './state.js';
import { MAPS } from './maps.js';
import { pointOnTrack, segCross } from './track.js';
import { get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── GENOME PARAMETER BOUNDS ────────────────────────────────────────────────────
// Each AI's "brain" is a set of driving parameters that evolve across races.
const BOUNDS = {
  speedFactor:      [0.55, 1.05],  // fraction of ghost/max speed to target
  lookahead:        [5,   35],     // frames ahead to aim for (ghost mode) or spline pts (fallback)
  steerAgg:         [1.0,  1.8],   // multiplier on STEER_SPEED
  steerNoise:       [0.000, 0.025],// random jitter per frame (imperfection)
  recoveryStrength: [0.20, 0.90],  // how hard to pull back when off-track
  momentumDecay:    [0.02, 0.15],  // momentum lost per frame off-track (penalty rate)
  momentumBoost:    [0.01, 0.08],  // momentum gained per checkpoint hit (reward rate)
};

// Seed genomes = current difficulty defaults, so AI starts at existing behavior
const SEEDS = {
  easy:   { speedFactor: 0.68, lookahead: 25, steerAgg: 1.2, steerNoise: 0.018, recoveryStrength: 0.40, momentumDecay: 0.08, momentumBoost: 0.04 },
  medium: { speedFactor: 0.82, lookahead: 15, steerAgg: 1.3, steerNoise: 0.008, recoveryStrength: 0.55, momentumDecay: 0.06, momentumBoost: 0.05 },
  hard:   { speedFactor: 0.96, lookahead:  8, steerAgg: 1.5, steerNoise: 0.001, recoveryStrength: 0.70, momentumDecay: 0.04, momentumBoost: 0.06 },
};

// Hard AI fine-tunes (small mutations); Easy AI explores widely (large mutations)
const MUTATION_RATES = { easy: 0.12, medium: 0.08, hard: 0.04 };
// How many top genomes to keep and evolve between races
const POPULATION_SIZE = 3;

const AI_NAMES  = ['NITRO', 'BLAZE', 'STORM'];
const AI_COLORS = ['#33cc44', '#9933ff', '#00cccc'];

// Shared ghost path loaded once per race (null = no ghost saved for this map)
let ghostFrames = null;

// ── GENOME PERSISTENCE ─────────────────────────────────────────────────────────
function genomeKey(mapIndex, diff) {
  return `ai_genome_v2_map${mapIndex}_${diff}`;
}

// Stored format: { population:[{genome,score},...], bestScore, totalRaces, generation, stagnantRaces }
function loadPopulation(mapIndex, diff) {
  try {
    const s = localStorage.getItem(genomeKey(mapIndex, diff));
    if (!s) return null;
    const d = JSON.parse(s);
    // Backward compat: old v1 format had champion key
    if (d.champion && !d.population) {
      return { population: [{ genome: d.champion, score: d.bestScore || 0 }],
               bestScore: d.bestScore || 0, totalRaces: d.totalRaces || 0,
               generation: d.generation || 0, stagnantRaces: 0 };
    }
    return d;
  } catch { return null; }
}

function savePopulation(mapIndex, diff, data) {
  try { localStorage.setItem(genomeKey(mapIndex, diff), JSON.stringify(data)); } catch {}
}

// ── FIREBASE GENOME SYNC ────────────────────────────────────────────────────────
function fbPath(mapIndex, diff) { return `ai_genomes/map${mapIndex}/${diff}`; }

async function loadFirebaseGenome(mapIndex, diff) {
  if (!state.db || !state.fbRef) return null;
  try {
    const snap = await get(state.fbRef(state.db, fbPath(mapIndex, diff)));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}

function saveFirebaseGenome(mapIndex, diff, population, bestScore) {
  if (!state.db || !state.fbRef || !state.fbSet) return;
  try { state.fbSet(state.fbRef(state.db, fbPath(mapIndex, diff)), { population, bestScore }); } catch {}
}

// Adaptive mutation rate: higher when AI is stuck, lower when improving
function getMutationRate(diff, stagnantRaces) {
  const base  = MUTATION_RATES[diff] || 0.08;
  const boost = Math.min((stagnantRaces || 0) * 0.015, 0.20);
  return Math.min(base + boost, 0.28);
}

// Merge Firebase population into local; return combined sorted list
function mergePopulations(local, fb) {
  const all = [...(local || [])];
  for (const m of (fb || [])) {
    if (!all.some(a => a.score >= m.score)) all.push(m);
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, POPULATION_SIZE);
}

// Load genomes for all AI cars — one genome per car, each a different mutation
async function getStartGenomesAsync(mapIndex, diff, count) {
  const localData = loadPopulation(mapIndex, diff);
  const fbData    = await loadFirebaseGenome(mapIndex, diff);

  const fbPop = fbData?.population
    || (fbData?.champion ? [{ genome: fbData.champion, score: fbData.bestScore || 0 }] : []);
  const population = mergePopulations(localData?.population, fbPop);

  // If Firebase had a better population, write it back to localStorage
  const fbBest    = fbData?.bestScore ?? -Infinity;
  const localBest = localData?.bestScore ?? -Infinity;
  if (fbBest > localBest && population.length > 0) {
    savePopulation(mapIndex, diff, { ...(localData || {}), population, bestScore: fbBest });
  }

  const stagnantRaces = localData?.stagnantRaces || 0;
  const rate = getMutationRate(diff, stagnantRaces);

  return Array.from({ length: count }, (_, i) => {
    const src = population[i % Math.max(population.length, 1)];
    return src ? mutateGenome(src.genome, diff, rate) : { ...SEEDS[diff] };
  });
}

// After a race: merge car results into population, save, push best to Firebase
function saveAllResults(mapIndex, diff, results) {
  const prev      = loadPopulation(mapIndex, diff) || { population: [], bestScore: -Infinity, totalRaces: 0, generation: 0, stagnantRaces: 0 };
  const prevBest  = prev.bestScore ?? -Infinity;
  const merged    = mergePopulations(prev.population, results);
  const newBest   = merged[0]?.score ?? 0;
  const improved  = newBest > prevBest;
  const newData   = {
    population:    merged,
    bestScore:     Math.max(newBest, prevBest),
    totalRaces:    (prev.totalRaces   || 0) + 1,
    generation:    (prev.generation   || 0) + 1,
    stagnantRaces: improved ? 0 : (prev.stagnantRaces || 0) + 1,
  };
  savePopulation(mapIndex, diff, newData);
  // Push top-2 to Firebase whenever we improve
  if (improved) saveFirebaseGenome(mapIndex, diff, merged.slice(0, 2), newData.bestScore);
  return newData;
}

export function getAIStats(mapIndex, diff) {
  const d = loadPopulation(mapIndex, diff);
  return d ? { generation: d.generation || 0, bestScore: d.bestScore ?? 0,
               totalRaces: d.totalRaces || 0, stagnantRaces: d.stagnantRaces || 0 } : null;
}

// Gaussian mutation: each parameter gets a small random nudge, clamped to valid range
function mutateGenome(genome, diff, rate) {
  rate = rate ?? MUTATION_RATES[diff] ?? 0.08;
  const out  = {};
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const range = hi - lo;
    const u1    = Math.random() + 1e-10;
    const u2    = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out[key]    = Math.max(lo, Math.min(hi, (genome[key] ?? SEEDS[diff]?.[key] ?? lo) + gauss * rate * range));
  }
  return out;
}

// ── GHOST PATH LOADING ─────────────────────────────────────────────────────────
function loadGhostFrames(mapIndex) {
  try {
    const s  = localStorage.getItem(`ghost_map${mapIndex}`);
    if (!s) return null;
    const d  = JSON.parse(s);
    const f  = Array.isArray(d) ? d : (d.frames || []);
    return f.length > 30 ? f : null;
  } catch { return null; }
}

// Average speed (px/tick) at a ghost frame index over a 6-frame window
function ghostSpeed(frames, idx) {
  let total = 0;
  for (let i = 0; i < 6; i++) {
    const a  = frames[(idx + i)     % frames.length];
    const b  = frames[(idx + i + 1) % frames.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    total   += Math.sqrt(dx * dx + dy * dy);
  }
  return total / 6;
}

// ── INIT ───────────────────────────────────────────────────────────────────────
export async function initAICars() {
  const { splinePts, NSPLINE, aiCount, aiDifficulty, currentMapIndex } = state;
  ghostFrames    = loadGhostFrames(currentMapIndex);
  state.aiCars   = [];

  // Fetch one genome per car — each car explores a different mutation of the population
  const genomes = await getStartGenomesAsync(currentMapIndex, aiDifficulty, aiCount);

  for (let i = 0; i < aiCount; i++) {
    const genome = genomes[i];

    let startX, startY, startAngle, ghostFrameIdx;
    if (ghostFrames) {
      // Stagger: car 0 starts at ghost frame 0, each subsequent car is ~1 second behind
      ghostFrameIdx = (ghostFrames.length - i * 60 + ghostFrames.length) % ghostFrames.length;
      const f       = ghostFrames[ghostFrameIdx];
      const fNext   = ghostFrames[(ghostFrameIdx + 1) % ghostFrames.length];
      startX        = f.x;
      startY        = f.y;
      startAngle    = Math.atan2(fNext.y - f.y, fNext.x - f.x);
    } else {
      const idx  = (NSPLINE - (i + 1) * 10 + NSPLINE) % NSPLINE;
      const sp   = splinePts[idx];
      const spN  = splinePts[(idx + 1) % NSPLINE];
      startX     = sp.x;  startY = sp.y;
      startAngle = Math.atan2(spN.y - sp.y, spN.x - sp.x);
      ghostFrameIdx = 0;
    }

    state.aiCars.push({
      x: startX, y: startY,
      prevX: startX, prevY: startY,
      angle: startAngle, speed: 0, vx: 0, vy: 0,
      splineIdx: 0, ghostFrameIdx,
      laps: 0,
      checkpointsHit: [false, false, false, false],
      finished: false, finishTime: null,
      name: AI_NAMES[i], color: AI_COLORS[i],
      genome,
      // ── Mid-race adaptation ──────────────────────────────────────────────
      momentum: 1.0,               // [0.5, 1.2] — confidence; affects speed
      // ── Performance counters (for fitness scoring at race end) ───────────
      totalCheckpointsHit: 0,
      totalCheckpointOpportunities: 0,
      framesOffTrack: 0,
      totalFrames: 0,
      // ── Visual reward/penalty feedback ───────────────────────────────────
      rewardFlash: 0,              // countdown frames for gold glow on checkpoint
      penaltyFlash: 0,             // countdown frames for red glow when off-track
      recoveryTimer: 0,
    });
  }
}

// ── GHOST-FOLLOWING UPDATE ─────────────────────────────────────────────────────
function updateAIGhost(ai) {
  if (ai.finished || state.paused) return;
  const frames = ghostFrames;
  const n      = frames.length;
  const g      = ai.genome;

  ai.totalFrames++;

  // 1. Steer toward lookahead frame on ghost path
  const targetIdx   = (ai.ghostFrameIdx + Math.round(g.lookahead)) % n;
  const target      = frames[targetIdx];
  const desiredAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
  let diff          = desiredAngle - ai.angle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxSteer    = state.STEER_SPEED * g.steerAgg;
  ai.angle += Math.max(-maxSteer, Math.min(maxSteer, diff));
  ai.angle += (Math.random() - 0.5) * 2 * g.steerNoise;

  // 2. Speed = ghost reference speed × genome factor × current momentum
  const refSpd    = ghostSpeed(frames, ai.ghostFrameIdx);
  const targetSpd = refSpd * g.speedFactor * ai.momentum;
  if (ai.speed < targetSpd) {
    ai.speed += state.ACCEL * 0.8;
  } else {
    ai.speed = Math.max(ai.speed - state.ACCEL * 0.4, targetSpd);
  }

  // 3. Off-track: PENALTY — drain momentum, cap speed, steer back to ghost path
  const onTrack = pointOnTrack(ai.x, ai.y);
  if (!onTrack) {
    ai.framesOffTrack++;
    ai.recoveryTimer++;
    ai.momentum    = Math.max(ai.momentum - g.momentumDecay, 0.5);
    ai.penaltyFlash = Math.max(ai.penaltyFlash, 8);
    ai.speed       = Math.min(ai.speed, state.OFFTRACK_MAX);
    // Find nearest ghost frame and steer toward it
    let bestDist = Infinity, bestIdx = ai.ghostFrameIdx;
    for (let k = -20; k <= 20; k++) {
      const ki = (ai.ghostFrameIdx + k + n) % n;
      const f  = frames[ki];
      const dx = f.x - ai.x, dy = f.y - ai.y;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = ki; }
    }
    const rf   = frames[bestIdx];
    let rDiff  = Math.atan2(rf.y - ai.y, rf.x - ai.x) - ai.angle;
    while (rDiff >  Math.PI) rDiff -= Math.PI * 2;
    while (rDiff < -Math.PI) rDiff += Math.PI * 2;
    ai.angle  += Math.max(-maxSteer, Math.min(maxSteer, rDiff * g.recoveryStrength));
  } else {
    ai.recoveryTimer = 0;
    ai.momentum = Math.min(ai.momentum + 0.0008, 1.0); // slow natural recovery
  }

  // 4. Friction + move
  ai.speed  *= 0.97;
  ai.prevX   = ai.x;  ai.prevY = ai.y;
  ai.x      += Math.cos(ai.angle) * ai.speed;
  ai.y      += Math.sin(ai.angle) * ai.speed;

  // 5. Advance ghost frame index (find nearest frame in forward window)
  let bestDist2 = Infinity;
  for (let k = 1; k <= 90; k++) {
    const ki  = (ai.ghostFrameIdx + k) % n;
    const f   = frames[ki];
    const dx  = f.x - ai.x, dy = f.y - ai.y;
    const d   = dx * dx + dy * dy;
    if (d < bestDist2) { bestDist2 = d; ai.ghostFrameIdx = ki; }
    else if (k > 15 && d > bestDist2 * 4) break;
  }

  if (ai.rewardFlash  > 0) ai.rewardFlash--;
  if (ai.penaltyFlash > 0) ai.penaltyFlash--;
}

// ── SPLINE-FOLLOWING FALLBACK (no ghost saved for this map) ───────────────────
function updateAISpline(ai) {
  if (ai.finished || state.paused) return;
  const { splinePts, NSPLINE } = state;
  const g = ai.genome;

  ai.totalFrames++;

  const look      = Math.round(g.lookahead);
  const targetIdx = (ai.splineIdx + look) % NSPLINE;
  const target    = splinePts[targetIdx];
  let diff        = Math.atan2(target.y - ai.y, target.x - ai.x) - ai.angle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxSteer  = state.STEER_SPEED * g.steerAgg;
  ai.angle += Math.max(-maxSteer, Math.min(maxSteer, diff));
  ai.angle += (Math.random() - 0.5) * 2 * g.steerNoise;

  // Corner detection for speed reduction
  const a1    = splinePts[ai.splineIdx % NSPLINE];
  const a2    = splinePts[(ai.splineIdx + look) % NSPLINE];
  const a3    = splinePts[(ai.splineIdx + look * 2) % NSPLINE];
  let cDiff   = Math.atan2(a3.y - a2.y, a3.x - a2.x) - Math.atan2(a2.y - a1.y, a2.x - a1.x);
  while (cDiff >  Math.PI) cDiff -= Math.PI * 2;
  while (cDiff < -Math.PI) cDiff += Math.PI * 2;
  const isCorner  = Math.abs(cDiff) > 0.12;
  const targetSpd = state.MAX_SPEED * g.speedFactor * ai.momentum * (isCorner ? 0.65 : 1.0);
  if (ai.speed < targetSpd) {
    ai.speed += state.ACCEL * 0.8;
  } else {
    ai.speed = Math.max(ai.speed - state.ACCEL * 0.4, targetSpd);
  }

  // Off-track: PENALTY
  const onTrack = pointOnTrack(ai.x, ai.y);
  if (!onTrack) {
    ai.framesOffTrack++;
    ai.recoveryTimer++;
    ai.momentum    = Math.max(ai.momentum - g.momentumDecay, 0.5);
    ai.penaltyFlash = Math.max(ai.penaltyFlash, 8);
    ai.speed       = Math.min(ai.speed, state.OFFTRACK_MAX);
    let bestDist = Infinity, bestIdx = ai.splineIdx;
    for (let k = -30; k <= 30; k++) {
      const ki = (ai.splineIdx + k + NSPLINE) % NSPLINE;
      const sp = splinePts[ki];
      const dx = sp.x - ai.x, dy = sp.y - ai.y;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = ki; }
    }
    const rsp  = splinePts[bestIdx];
    let rDiff  = Math.atan2(rsp.y - ai.y, rsp.x - ai.x) - ai.angle;
    while (rDiff >  Math.PI) rDiff -= Math.PI * 2;
    while (rDiff < -Math.PI) rDiff += Math.PI * 2;
    ai.angle  += Math.max(-maxSteer, Math.min(maxSteer, rDiff * g.recoveryStrength));
  } else {
    ai.recoveryTimer = 0;
    ai.momentum = Math.min(ai.momentum + 0.0008, 1.0);
  }

  ai.speed  *= 0.97;
  ai.prevX   = ai.x;  ai.prevY = ai.y;
  ai.x      += Math.cos(ai.angle) * ai.speed;
  ai.y      += Math.sin(ai.angle) * ai.speed;

  let bestDist2 = Infinity;
  for (let k = 1; k <= 50; k++) {
    const ki = (ai.splineIdx + k) % NSPLINE;
    const sp = splinePts[ki];
    const dx = sp.x - ai.x, dy = sp.y - ai.y;
    const d  = dx * dx + dy * dy;
    if (d < bestDist2) { bestDist2 = d; ai.splineIdx = ki; }
    else if (k > 5 && d > bestDist2 * 4) break;
  }

  if (ai.rewardFlash  > 0) ai.rewardFlash--;
  if (ai.penaltyFlash > 0) ai.penaltyFlash--;
}

// ── CHECKPOINT / LAP TRACKING ─────────────────────────────────────────────────
function checkAILapCross(ai) {
  if (ai.finished) return;
  const { checkpoints, sfDx, sfDy, finishA, finishB, car } = state;
  const px = ai.prevX, py = ai.prevY, cx = ai.x, cy = ai.y;

  // Checkpoints — REWARD each hit in correct order
  for (let i = 0; i < checkpoints.length; i++) {
    if (!ai.checkpointsHit[i]) {
      const cp = checkpoints[i];
      if (segCross(px, py, cx, cy, cp.ax, cp.ay, cp.bx, cp.by) !== null) {
        ai.checkpointsHit[i]   = true;
        ai.totalCheckpointsHit++;
        ai.momentum  = Math.min(ai.momentum + ai.genome.momentumBoost, 1.2);
        ai.rewardFlash = 20;  // 20 frames of gold glow
      }
    }
  }
  // Track how many checkpoints were possible to hit
  ai.totalCheckpointOpportunities =
    ai.laps * checkpoints.length + ai.checkpointsHit.filter(h => h).length;

  // Finish line
  const dir = segCross(px, py, cx, cy, finishA.x, finishA.y, finishB.x, finishB.y);
  if (dir !== null) {
    const forward = (cx - px) * sfDx + (cy - py) * sfDy > 0;
    if (forward && ai.checkpointsHit.every(h => h)) {
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

// ── FITNESS SCORING + EVOLUTION ────────────────────────────────────────────────
// Score = weighted sum of checkpoint efficiency, on-track ratio, lap completion
function scoreAI(ai) {
  const cpRatio     = ai.totalCheckpointOpportunities > 0
    ? ai.totalCheckpointsHit / ai.totalCheckpointOpportunities : 0;
  const trackRatio  = ai.totalFrames > 0
    ? 1 - (ai.framesOffTrack / ai.totalFrames) : 0;
  const lapRatio    = ai.laps / Math.max(state.car.totalLaps, 1);
  return cpRatio * 0.5 + trackRatio * 0.3 + lapRatio * 0.2;
}

function evolveAllAI() {
  if (!state.aiRaceMode) return;
  const { currentMapIndex, aiDifficulty } = state;
  const results = state.aiCars.map(ai => ({ genome: ai.genome, score: scoreAI(ai) }));
  return saveAllResults(currentMapIndex, aiDifficulty, results);
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────
export function updateAllAI() {
  if (!state.aiRaceMode) return;
  for (const ai of state.aiCars) {
    if (ghostFrames && ghostFrames.length > 10) {
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
    ctx.save();
    ctx.translate(ai.x, ai.y);
    ctx.rotate(ai.angle - Math.PI / 2);

    // Reward glow (gold) or penalty glow (red) via canvas shadow
    if (ai.rewardFlash > 0) {
      ctx.shadowColor = '#ffe000';
      ctx.shadowBlur  = 18 * (ai.rewardFlash / 20);
    } else if (ai.penaltyFlash > 0) {
      ctx.shadowColor = '#ff3300';
      ctx.shadowBlur  = 14 * (ai.penaltyFlash / 8);
    }

    const col = ai.color;
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

    // Reset shadow before drawing name label
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';
    ctx.rotate(-(ai.angle - Math.PI / 2));

    // Name label: gold = just hit checkpoint, red = just went off-track,
    // otherwise gradient from red (low momentum) to green (high momentum)
    const m01 = (ai.momentum - 0.5) / 0.7;
    ctx.fillStyle = ai.rewardFlash  > 0 ? '#ffe000'
                  : ai.penaltyFlash > 0 ? '#ff5522'
                  : `hsl(${Math.round(m01 * 120)}, 90%, 65%)`;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ai.name, 0, -20);
    ctx.restore();
  }
}

export function maybeShowResults() {
  if (!state.car.finished) return;
  if (state.aiCars.every(ai => ai.finished)) {
    showResultsOverlay();
  } else if (!state.resultsTimer) {
    state.resultsTimer = setTimeout(showResultsOverlay, 5000);
  }
}

function showResultsOverlay() {
  if (state.resultsVisible) return;
  evolveAllAI();  // score this race and save best genome before showing results
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
      const score = (scoreAI(ai) * 100).toFixed(0);
      const tr    = document.createElement('tr');
      tr.innerHTML = `<td class="pos-col">${pos++}</td><td class="name-col">${ai.name}</td><td class="time-col">DNF <span style="font-size:10px;color:#777">${score}%</span></td>`;
      tbody.appendChild(tr);
    }
  }
  // Show AI learning progress footer
  const { currentMapIndex, aiDifficulty } = state;
  const saved = loadPopulation(currentMapIndex, aiDifficulty);
  if (saved && saved.population?.length > 0) {
    const stag   = saved.stagnantRaces || 0;
    const stagTxt = stag >= 3 ? ` · exploring wider (${stag} races)` : '';
    const info = document.createElement('tr');
    info.innerHTML = `<td colspan="3" style="padding-top:10px;font-size:10px;color:#555;text-align:center">
      gen ${saved.generation || 1} · best ${((saved.bestScore || 0) * 100).toFixed(0)}% · ${saved.totalRaces || 1} races${stagTxt}
    </td>`;
    tbody.appendChild(info);
  }

  document.getElementById('resultsOverlay').classList.add('open');
}
