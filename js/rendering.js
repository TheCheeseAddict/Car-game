import { state, TRACK_WIDTH, W, H } from './state.js';
import { MAPS } from './maps.js';

// Deterministic window-lit hash (no flicker)
function winLit(bx, by, wx, wy) {
  const n = Math.sin(bx * 12.7 + by * 31.1 + wx * 5.3 + wy * 17.9) * 43758.5453;
  return (n - Math.floor(n)) > 0.38;
}

function drawCityBackground() {
  const ctx = state.ctx;
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
  for (let gy = 0; gy < H; gy += 60) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }

  const buildings = [
    {x:162, y:158, w:566, h:72},
    {x:162, y:452, w:566, h:68},
    {x:300, y:268, w:288, h:112},
    {x:158, y:268, w:112, h:112},
    {x:668, y:268, w:82, h:112},
    {x:0,   y:0,   w:148, h:92},
    {x:172, y:0,   w:488, h:68},
    {x:762, y:0,   w:138, h:92},
    {x:0,   y:562, w:148, h:88},
    {x:172, y:604, w:488, h:46},
    {x:762, y:562, w:138, h:88},
    {x:0,   y:102, w:56,  h:152},
    {x:0,   y:422, w:56,  h:132},
    {x:848, y:102, w:52,  h:152},
    {x:848, y:422, w:52,  h:132},
  ];

  for (const b of buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(b.x+5, b.y+5, b.w, b.h);

    const shade = 26 + ((b.x * 7 + b.y * 13) % 18);
    ctx.fillStyle = `rgb(${shade},${shade},${shade+2})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(b.x, b.y, b.w, 3);
    ctx.fillRect(b.x, b.y, 3, b.h);

    const ww = 7, wh = 6, gapX = 6, gapY = 5;
    for (let wx = b.x + 9; wx + ww <= b.x + b.w - 6; wx += ww + gapX) {
      for (let wy = b.y + 9; wh <= b.y + b.h - wy - 6; wy += wh + gapY) {
        ctx.fillStyle = winLit(b.x, b.y, wx, wy) ? 'rgba(255,220,120,0.55)' : 'rgba(0,0,0,0.4)';
        ctx.fillRect(wx, wy, ww, wh);
      }
    }
  }
}

function drawDesertBackground() {
  const ctx = state.ctx;
  const { camX, camY } = state;
  ctx.fillStyle = '#D4B080';
  ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);

  ctx.strokeStyle = 'rgba(180,135,60,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([50, 18]);
  const startY = Math.floor(camY / 24) * 24;
  for (let gy = startY; gy < camY + H + 24; gy += 24) {
    ctx.beginPath(); ctx.moveTo(camX, gy); ctx.lineTo(camX + W, gy); ctx.stroke();
  }
  ctx.setLineDash([]);

  const cellSize = 120;
  const startCX = Math.floor(camX / cellSize) - 1;
  const startCY = Math.floor(camY / cellSize) - 1;
  for (let cx = startCX; cx < startCX + W / cellSize + 2; cx++) {
    for (let cy = startCY; cy < startCY + H / cellSize + 2; cy++) {
      const h = Math.sin(cx * 31.7 + cy * 17.3) * 43758.5453;
      const r = h - Math.floor(h);
      if (r > 0.72) {
        const wx = cx * cellSize + (r * 80 - 40);
        const wy = cy * cellSize + (Math.sin(cx * 7 + cy * 13) * 0.5 + 0.5) * cellSize;
        const rad = 18 + r * 30;
        ctx.fillStyle = `rgba(195,155,75,${0.12 + r * 0.1})`;
        ctx.beginPath();
        ctx.ellipse(wx, wy, rad * 2.5, rad * 0.7, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawForestBackground() {
  const ctx = state.ctx;
  const { camX, camY } = state;
  ctx.fillStyle = '#1e3a1e';
  ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);

  const cellSize = 90;
  const startCX = Math.floor(camX / cellSize) - 1;
  const startCY = Math.floor(camY / cellSize) - 1;
  for (let cx = startCX; cx < startCX + W / cellSize + 2; cx++) {
    for (let cy = startCY; cy < startCY + H / cellSize + 2; cy++) {
      const h = Math.sin(cx * 37.1 + cy * 19.7) * 43758.5453;
      const r = h - Math.floor(h);
      if (r > 0.55) {
        const wx = cx * cellSize + (r * 70 - 35);
        const wy = cy * cellSize + (Math.sin(cx * 11 + cy * 7) * 0.5 + 0.5) * cellSize;
        const rad = 14 + r * 28;
        const g = Math.floor(50 + r * 35);
        ctx.fillStyle = `rgba(20,${g},18,${0.35 + r * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(wx, wy, rad * 1.8, rad, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const fogGrad = ctx.createLinearGradient(0, camY, 0, camY + H);
  fogGrad.addColorStop(0,   'rgba(30,50,30,0.30)');
  fogGrad.addColorStop(0.2, 'rgba(0,0,0,0)');
  fogGrad.addColorStop(0.8, 'rgba(0,0,0,0)');
  fogGrad.addColorStop(1,   'rgba(10,30,10,0.25)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(camX, camY, W, H);
}

export function drawTrack() {
  const ctx = state.ctx;
  const { splinePts, outerPts, innerPts, sfPt, sfNx, sfNy, currentMapIndex } = state;
  const isCity   = currentMapIndex === 2;
  const isDesert = currentMapIndex === 3;
  const isForest = currentMapIndex === 4;

  if (isCity) {
    drawCityBackground();
  } else if (isDesert) {
    drawDesertBackground();
  } else if (isForest) {
    drawForestBackground();
  } else {
    ctx.fillStyle = '#3a7d44';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.beginPath();
  ctx.moveTo(innerPts[0].x, innerPts[0].y);
  for (const p of innerPts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.moveTo(outerPts[0].x, outerPts[0].y);
  for (const p of outerPts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = isCity ? '#444' : isDesert ? '#B87B38' : isForest ? '#5a4a30' : '#C49A5A';
  ctx.fill('evenodd');

  const sn = splinePts.length;
  if (isCity) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 22]);
    for (let i = 0; i < sn; i++) {
      const a = splinePts[i], b = splinePts[(i+1)%sn];
      const ddx = b.x-a.x, ddy = b.y-a.y;
      const dl = Math.sqrt(ddx*ddx+ddy*ddy)||1;
      const dnx = -ddy/dl, dny = ddx/dl;
      for (const off of [-18, -6, 6, 18]) {
        ctx.beginPath();
        ctx.moveTo(a.x+dnx*off, a.y+dny*off);
        ctx.lineTo(b.x+dnx*off, b.y+dny*off);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = 'rgba(100,60,20,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 18]);
    for (let i = 0; i < sn; i++) {
      const a = splinePts[i], b = splinePts[(i+1)%sn];
      const ddx = b.x-a.x, ddy = b.y-a.y;
      const dl = Math.sqrt(ddx*ddx+ddy*ddy)||1;
      const dnx = -ddy/dl, dny = ddx/dl;
      for (const off of [-16, 16]) {
        ctx.beginPath();
        ctx.moveTo(a.x+dnx*off, a.y+dny*off);
        ctx.lineTo(b.x+dnx*off, b.y+dny*off);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  if (isCity) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
  } else if (isDesert) {
    ctx.strokeStyle = '#e07820';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
  } else if (isForest) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = '#5a3010';
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);
  }
  ctx.beginPath();
  ctx.moveTo(innerPts[0].x, innerPts[0].y);
  for (const p of innerPts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(outerPts[0].x, outerPts[0].y);
  for (const p of outerPts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = isCity ? 'rgba(255,220,0,0.7)' : isDesert ? 'rgba(255,255,255,0.55)' : isForest ? 'rgba(255,220,0,0.6)' : 'rgba(200,150,80,0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([15, 20]);
  ctx.beginPath();
  ctx.moveTo(splinePts[0].x, splinePts[0].y);
  for (const p of splinePts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  const lx1 = sfPt.x + sfNx * (TRACK_WIDTH / 2);
  const ly1 = sfPt.y + sfNy * (TRACK_WIDTH / 2);
  const lx2 = sfPt.x - sfNx * (TRACK_WIDTH / 2);
  const ly2 = sfPt.y - sfNy * (TRACK_WIDTH / 2);

  ctx.save();
  ctx.translate(lx1, ly1);
  const ang = Math.atan2(ly2-ly1, lx2-lx1);
  ctx.rotate(ang);
  const sqSize = 8;
  const lineLen = TRACK_WIDTH;
  const cols = Math.ceil(lineLen / sqSize);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i+j)%2===0 ? '#fff' : '#000';
      ctx.fillRect(i*sqSize, j*sqSize, sqSize, sqSize);
    }
  }
  ctx.restore();
}

export function drawBushes() {
  const ctx = state.ctx;
  const { bushes, currentMapIndex } = state;
  if (currentMapIndex === 2) return;
  for (const b of bushes) {
    if (currentMapIndex === 4) {
      const baseR = b.r * 1.1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(b.x + 3, b.y + 5, baseR + 2, baseR * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      const g1 = Math.floor(38 + b.shade * 28);
      ctx.fillStyle = `rgb(15,${g1},12)`;
      ctx.beginPath(); ctx.arc(b.x, b.y, baseR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(22,${g1 + 20},18)`;
      ctx.beginPath(); ctx.arc(b.x - baseR * 0.15, b.y - baseR * 0.15, baseR * 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(35,${g1 + 38},28)`;
      ctx.beginPath(); ctx.arc(b.x - baseR * 0.22, b.y - baseR * 0.25, baseR * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(60,${g1 + 55},45,0.7)`;
      ctx.beginPath(); ctx.arc(b.x - baseR * 0.28, b.y - baseR * 0.32, baseR * 0.18, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (currentMapIndex === 3) {
      if (b.shade < 0.55) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(b.x+2, b.y+3, b.r+1, b.r*0.7, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#3d6e2e';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#52943d';
        ctx.beginPath(); ctx.arc(b.x-b.r*0.25, b.y-b.r*0.25, b.r*0.55, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
          ctx.beginPath();
          ctx.arc(b.x+Math.cos(a)*b.r*0.85, b.y+Math.sin(a)*b.r*0.85, 0.9, 0, Math.PI*2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(b.x+3, b.y+4, b.r+2, b.r*0.7, 0, 0, Math.PI*2);
        ctx.fill();
        const g = Math.floor(105 + b.shade * 45);
        ctx.fillStyle = `rgb(${g+18},${g+5},${g-10})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = `rgb(${g+35},${g+20},${g+5})`;
        ctx.beginPath(); ctx.arc(b.x-b.r*0.25, b.y-b.r*0.28, b.r*0.58, 0, Math.PI*2); ctx.fill();
      }
      continue;
    }

    ctx.beginPath();
    ctx.ellipse(b.x+3, b.y+4, b.r, b.r*0.65, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    const green = Math.floor(100 + b.shade * 55);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = `rgb(30,${green},25)`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x - b.r*0.25, b.y - b.r*0.25, b.r*0.55, 0, Math.PI*2);
    ctx.fillStyle = `rgb(45,${green+25},38)`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x - b.r*0.3, b.y - b.r*0.35, b.r*0.28, 0, Math.PI*2);
    ctx.fillStyle = `rgba(80,${green+50},60,0.6)`;
    ctx.fill();
  }
}

export function drawObstacles() {
  if (!state.obstaclesEnabled) return;
  const ctx = state.ctx;
  const { obstacles, currentMapIndex } = state;
  if (currentMapIndex === 2) {
    const CAR_COLORS = ['#c0392b','#2471a3','#7f8c8d','#d4ac0d','#1e8449','#7d3c98','#ca6f1e'];
    for (let idx = 0; idx < obstacles.length; idx++) {
      const o = obstacles[idx];
      const cw = o.r * 2.4;
      const ch = o.r * 4.2;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(3, 4, cw/2+3, ch/2+3, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = CAR_COLORS[idx % CAR_COLORS.length];
      ctx.beginPath();
      ctx.roundRect(-cw/2, -ch/2, cw, ch, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,220,255,0.75)';
      ctx.fillRect(-cw/2+2, -ch/2+3, cw-4, ch*0.27);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-cw/2+2, -ch/2+3+ch*0.27, cw-4, ch*0.32);
      ctx.fillStyle = 'rgba(150,220,255,0.55)';
      ctx.fillRect(-cw/2+2, ch/2-3-ch*0.16, cw-4, ch*0.14);
      ctx.fillStyle = '#111';
      const frontY = -ch/2 + ch*0.18;
      const rearY  =  ch/2 - ch*0.18;
      ctx.fillRect(-cw/2-3, frontY-4, 3.5, 7);
      ctx.fillRect( cw/2-0.5, frontY-4, 3.5, 7);
      ctx.fillRect(-cw/2-3, rearY-4,  3.5, 7);
      ctx.fillRect( cw/2-0.5, rearY-4,  3.5, 7);
      ctx.restore();
    }
  } else {
    for (const o of obstacles) {
      const logR = o.r;
      const logHalfLen = logR * 2.8;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(3, 5, logHalfLen + 2, logR + 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6B3E1E';
      ctx.beginPath();
      ctx.roundRect(-logHalfLen, -logR, logHalfLen * 2, logR * 2, logR);
      ctx.fill();
      ctx.fillStyle = '#8B5A2B';
      ctx.beginPath();
      ctx.roundRect(-logHalfLen + 2, -logR + 2, logHalfLen * 2 - 4, logR * 2 - 4, logR - 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,18,5,0.30)';
      ctx.lineWidth = 1;
      for (let g = -logHalfLen + logR + 4; g < logHalfLen - logR - 2; g += 5) {
        ctx.beginPath(); ctx.moveTo(g, -logR + 3); ctx.lineTo(g, logR - 3); ctx.stroke();
      }
      for (const ex of [-logHalfLen + logR, logHalfLen - logR]) {
        ctx.beginPath(); ctx.arc(ex, 0, logR - 1, 0, Math.PI * 2);
        ctx.fillStyle = '#3D1F08'; ctx.fill();
        ctx.beginPath(); ctx.arc(ex, 0, logR * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = '#6B3E1E'; ctx.fill();
        ctx.beginPath(); ctx.arc(ex, 0, logR * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = '#3D1F08'; ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function checkObstacleCollisions() {
  if (!state.obstaclesEnabled) return;
  const { obstacles, currentMapIndex, car } = state;
  const carR = 8;
  for (const o of obstacles) {
    if (currentMapIndex === 2) {
      const hw = o.r * 1.2;
      const hh = o.r * 2.1;
      const angle = o.angle + Math.PI / 2;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);

      const dx = car.x - o.x, dy = car.y - o.y;
      const lx =  dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA;

      const clampX = Math.max(-hw, Math.min(hw, lx));
      const clampY = Math.max(-hh, Math.min(hh, ly));
      const distX = lx - clampX, distY = ly - clampY;
      const dist = Math.sqrt(distX * distX + distY * distY);

      if (dist < carR) {
        let pushX, pushY;
        if (dist > 0.001) {
          pushX = distX / dist;
          pushY = distY / dist;
        } else {
          const ox = hw - Math.abs(lx), oy = hh - Math.abs(ly);
          if (ox < oy) { pushX = lx > 0 ? 1 : -1; pushY = 0; }
          else         { pushX = 0; pushY = ly > 0 ? 1 : -1; }
        }
        const overlap = carR - dist;
        const wpx = pushX * cosA - pushY * sinA;
        const wpy = pushX * sinA + pushY * cosA;
        car.x += wpx * overlap;
        car.y += wpy * overlap;
        const dot = car.vx * wpx + car.vy * wpy;
        if (dot < 0) {
          car.vx -= dot * wpx * 1.4;
          car.vy -= dot * wpy * 1.4;
          car.vx *= 0.55;
          car.vy *= 0.55;
        }
      }
    } else {
      const dx = car.x - o.x, dy = car.y - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = carR + o.r;
      if (dist < minDist && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        car.x += nx * overlap;
        car.y += ny * overlap;
        const dot = car.vx * nx + car.vy * ny;
        if (dot < 0) {
          car.vx -= dot * nx * 1.4;
          car.vy -= dot * ny * 1.4;
          car.vx *= 0.55;
          car.vy *= 0.55;
        }
      }
    }
  }
}

export function spawnParticles() {
  const { car, particles } = state;
  const totalSpd = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
  if (totalSpd < 0.3) return;

  const count = Math.floor(totalSpd * 1.8);
  const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
  const rx = car.x - hx * 12, ry = car.y - hy * 12;

  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 8;
    const nx = -hy, ny = hx;
    particles.push({
      x: rx + nx * spread + (Math.random() - 0.5) * 3,
      y: ry + ny * spread + (Math.random() - 0.5) * 3,
      vx: -hx * (0.3 + Math.random() * 0.5) * totalSpd * 0.4 + (Math.random()-0.5) * 0.4,
      vy: -hy * (0.3 + Math.random() * 0.5) * totalSpd * 0.4 + (Math.random()-0.5) * 0.4,
      life: 1,
      decay: 0.06 + Math.random() * 0.06,
      size: 1 + Math.random() * 1.5,
      r: 130 + Math.floor(Math.random() * 50),
      g: 80 + Math.floor(Math.random() * 40),
      b: 30 + Math.floor(Math.random() * 30),
    });
  }
}

export function updateAndDrawParticles() {
  const ctx = state.ctx;
  const { particles } = state;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.life * 0.85})`;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  }
}

export function drawCar() {
  const ctx = state.ctx;
  const { car, currentMapIndex, myColor, playerName } = state;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle - Math.PI / 2);

  if (currentMapIndex === 3) {
    const cw = 10, ch = 34;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(3,3,cw/2+2,ch/2+2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = myColor;
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
    ctx.fillStyle = myColor;
    ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,4); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,255,0.7)';
    ctx.fillRect(-cw/2+3,-ch/2+4,cw-6,ch/2.5);
    ctx.fillStyle = 'rgba(150,220,255,0.5)';
    ctx.fillRect(-cw/2+3,ch/2-8,cw-6,5);
    ctx.fillStyle = '#222';
    ctx.fillRect(-cw/2-3,-ch/2+2,4,7); ctx.fillRect(cw/2-1,-ch/2+2,4,7);
    ctx.fillRect(-cw/2-3,ch/2-9,4,7);  ctx.fillRect(cw/2-1,ch/2-9,4,7);
  }

  ctx.rotate(-(car.angle - Math.PI/2));
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(playerName, 0, -20);
  ctx.restore();
}

export function drawGhost() {
  const ctx = state.ctx;
  const { roomCode, ghostEnabled, ghostReplay, ghostIndex, car, currentMapIndex } = state;
  if (roomCode || !ghostEnabled || ghostReplay.length === 0 || !car.raceStarted) return;
  if (ghostIndex >= ghostReplay.length - 1) return;

  const g = ghostReplay[ghostIndex];

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.translate(g.x, g.y);
  ctx.rotate(g.angle - Math.PI / 2);

  if (currentMapIndex === 3) {
    const cw = 10, ch = 34;
    ctx.fillStyle = '#bbb';
    ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,3); ctx.fill();
    ctx.fillStyle = 'rgba(100,200,255,0.75)';
    ctx.fillRect(-cw/2+2,-ch/2+6,cw-4,7);
    ctx.fillStyle = '#333';
    ctx.fillRect(-cw/2-5,-ch/2+3,5,8); ctx.fillRect(cw/2,-ch/2+3,5,8);
    ctx.fillRect(-cw/2-6,ch/2-11,6,10); ctx.fillRect(cw/2,ch/2-11,6,10);
  } else {
    const cw = 14, ch = 24;
    ctx.fillStyle = '#bbb';
    ctx.beginPath(); ctx.roundRect(-cw/2,-ch/2,cw,ch,4); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,255,0.7)';
    ctx.fillRect(-cw/2+3,-ch/2+4,cw-6,ch/2.5);
    ctx.fillStyle = 'rgba(150,220,255,0.5)';
    ctx.fillRect(-cw/2+3,ch/2-8,cw-6,5);
    ctx.fillStyle = '#333';
    ctx.fillRect(-cw/2-3,-ch/2+2,4,7); ctx.fillRect(cw/2-1,-ch/2+2,4,7);
    ctx.fillRect(-cw/2-3,ch/2-9,4,7);  ctx.fillRect(cw/2-1,ch/2-9,4,7);
  }

  ctx.rotate(-(g.angle - Math.PI/2));
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GHOST', 0, -20);
  ctx.restore();
}

export function drawRemotePlayers() {
  const ctx = state.ctx;
  const { remotePlayers, currentMapIndex } = state;
  for (const [id, p] of Object.entries(remotePlayers)) {
    const col = p.color || '#36f';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle - Math.PI / 2);

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

    ctx.rotate(-(p.angle - Math.PI/2));
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || id.slice(0,4), 0, -20);
    ctx.restore();
  }
}
