import { state, W, H } from './state.js';
import { MAPS } from './maps.js';
import { pointOnTrack } from './track.js';
import { checkLapCross } from './lap.js';
import { checkObstacleCollisions, spawnParticles } from './rendering.js';

export function update() {
  const { car, keys, currentMapIndex } = state;
  if (car.finished || state.paused) return;

  const up    = keys['ArrowUp']    || keys['w'] || keys['W'];
  const down  = keys['ArrowDown']  || keys['s'] || keys['S'];
  const left  = keys['ArrowLeft']  || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];

  if (!car.raceStarted && (up || down || left || right)) {
    car.raceStarted = true;
    car.lapStartTime = performance.now();
    car.raceStartTime = car.lapStartTime;
  }

  const hx = Math.cos(car.angle), hy = Math.sin(car.angle);

  if (up) {
    const spd = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
    const accelMult = spd > state.SPEED_PHASE1 ? 0.55 : 1.0;
    car.vx += hx * state.ACCEL * accelMult;
    car.vy += hy * state.ACCEL * accelMult;
  }
  if (down) { car.vx -= hx * state.BRAKE; car.vy -= hy * state.BRAKE; }

  car.onTrack = pointOnTrack(car.x, car.y);
  const maxSpd = car.onTrack ? state.MAX_SPEED : state.OFFTRACK_MAX;

  const longSpd = car.vx * hx + car.vy * hy;

  const totalSpd = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
  const effectiveMax = longSpd >= 0 ? maxSpd : maxSpd * 0.5;
  if (totalSpd > effectiveMax) { car.vx *= effectiveMax/totalSpd; car.vy *= effectiveMax/totalSpd; }

  if (left || right) {
    car.steerAmount = Math.min(0.7, car.steerAmount + 0.06);
  } else {
    car.steerAmount = Math.max(0, car.steerAmount - 0.04);
  }

  const baseGrip = car.onTrack ? (currentMapIndex === 3 ? 0.38 : 0.58) : 0.42;
  const grip = Math.max(0.07, baseGrip - car.steerAmount * 0.85);
  const latVx = car.vx - longSpd * hx;
  const latVy = car.vy - longSpd * hy;
  car.vx -= latVx * grip;
  car.vy -= latVy * grip;

  let friction = car.onTrack ? state.FRICTION : 0.94;
  if (currentMapIndex === 3) friction *= (1 - car.steerAmount * 0.06);
  car.vx *= friction;
  car.vy *= friction;

  if (Math.abs(longSpd) > 0.05) {
    let steerAmt;
    if (currentMapIndex === 3) {
      const spd = Math.abs(longSpd);
      const SPD_LOW  = 2.0;
      const SPD_HIGH = state.MAX_SPEED;
      const STEER_LOW  = 0.055 * (SPD_LOW / 3.25);
      const STEER_HIGH = 0.010;
      let rate;
      if (spd <= SPD_LOW) {
        rate = 0.055 * (spd / 3.25);
      } else {
        const t = Math.min(1, (spd - SPD_LOW) / (SPD_HIGH - SPD_LOW));
        rate = STEER_LOW + (STEER_HIGH - STEER_LOW) * (t * t);
      }
      steerAmt = Math.sign(longSpd) * rate;
    } else {
      steerAmt = state.STEER_SPEED * (longSpd / state.MAX_SPEED);
    }
    if (left)  car.angle -= steerAmt;
    if (right) car.angle += steerAmt;
  }

  car.prevX = car.x;
  car.prevY = car.y;
  car.x += car.vx;
  car.y += car.vy;

  if (MAPS[currentMapIndex].scrolling) {
    const xBound = currentMapIndex === 4 ? 3400 : 3500;
    car.x = Math.max(-500, Math.min(xBound, car.x));
    car.y = Math.max(-300, Math.min(1000, car.y));
  } else {
    car.x = Math.max(5, Math.min(W-5, car.x));
    car.y = Math.max(5, Math.min(H-5, car.y));
  }

  checkLapCross();
  checkObstacleCollisions();
  spawnParticles();

  if (!state.roomCode) {
    if (car.raceStarted && !car.finished) {
      if (state.ghostReplay.length > 0 && state.ghostIndex < state.ghostReplay.length - 1) {
        state.ghostIndex++;
      }
      state.ghostFrames.push({ x: car.x, y: car.y, angle: car.angle });
    }
    if (car.finished && state.ghostFrames.length > 0 && !state.ghostSaved) {
      state.ghostSaved = true;
      const prevBest = parseFloat(localStorage.getItem(`ghost_best_map${currentMapIndex}`)) || Infinity;
      const thisTime = (performance.now() - car.raceStartTime) / 1000;
      if (thisTime < prevBest) {
        localStorage.setItem(`ghost_best_map${currentMapIndex}`, thisTime.toString());
        localStorage.setItem(`ghost_map${currentMapIndex}`, JSON.stringify({
          frames: state.ghostFrames,
          checkpointTimes: state.ghostRecordingCpTimes,
        }));
      }
      state.ghostFrames           = [];
      state.ghostRecordingCpTimes = [];
    }
  }
}
