import { state } from './state.js';
import { segCross } from './track.js';
import { showSplit, showWinner } from './hud.js';
import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export function checkLapCross() {
  const { car, checkpoints, roomCode, myPlayerId,
          finishA, finishB, sfDx, sfDy } = state;
  const px = car.prevX, py = car.prevY;
  const cx = car.x, cy = car.y;

  for (const cp of checkpoints) {
    if (!cp.hit) {
      const hit = segCross(px, py, cx, cy, cp.ax, cp.ay, cp.bx, cp.by);
      if (hit !== null) {
        cp.hit = true;
        if (!roomCode && car.raceStarted) {
          const elapsed = (performance.now() - car.raceStartTime) / 1000;
          state.ghostRecordingCpTimes.push(elapsed);
          if (state.ghostCheckpointTimes.length > 0 &&
              state.ghostSplitIdx < state.ghostCheckpointTimes.length) {
            showSplit(elapsed - state.ghostCheckpointTimes[state.ghostSplitIdx]);
          }
          state.ghostSplitIdx++;
        }
      }
    }
  }

  const dir = segCross(px, py, cx, cy, finishA.x, finishA.y, finishB.x, finishB.y);
  if (dir !== null) {
    const moveDot = (cx - px) * sfDx + (cy - py) * sfDy;
    const forward = moveDot > 0;
    if (forward && car.raceStarted) {
      const allHit = checkpoints.every(c => c.hit);
      if (allHit) {
        const now = performance.now();
        const lapTime = (now - car.lapStartTime) / 1000;
        if (!car.bestLap  || lapTime < car.bestLap)  car.bestLap  = lapTime;
        if (!car.worstLap || lapTime > car.worstLap) car.worstLap = lapTime;
        car.laps++;
        car.lapStartTime = now;
        if (car.laps >= car.totalLaps) {
          const totalTime = (now - car.raceStartTime) / 1000;
          const avg = totalTime / car.totalLaps;
          showWinner('WINNER!!', true, { best: car.bestLap, worst: car.worstLap, avg });
          if (roomCode && state.db) {
            set(ref(state.db, `rooms/${roomCode}/winner`), myPlayerId);
          }
        }
      }
      checkpoints.forEach(c => c.hit = false);
    }
  }
}
