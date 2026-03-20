import { state, TRACK_WIDTH } from './state.js';
import { MAPS, DEFAULT_CAR } from './maps.js';

export function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t*t, t3 = t*t*t;
  return {
    x: 0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
  };
}

export function computeSpline(trackPoints) {
  const pts = [];
  const n = trackPoints.length;
  for (let i = 0; i < n; i++) {
    const p0 = trackPoints[(i-1+n)%n], p1 = trackPoints[i];
    const p2 = trackPoints[(i+1)%n],   p3 = trackPoints[(i+2)%n];
    for (let s = 0; s < 12; s++) pts.push(catmullRom(p0,p1,p2,p3,s/12));
  }
  return pts;
}

export function buildTrackPaths(pts) {
  const n = pts.length;
  const outer = [], inner = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i+1)%n];
    const dx = b.x-a.x, dy = b.y-a.y;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    const nx = -dy/len, ny = dx/len;
    outer.push({x:a.x+nx*TRACK_WIDTH/2, y:a.y+ny*TRACK_WIDTH/2});
    inner.push({x:a.x-nx*TRACK_WIDTH/2, y:a.y-ny*TRACK_WIDTH/2});
  }
  return {outer, inner};
}

export function buildBushes(pts, scrolling) {
  const list = [];
  const rand = seededRand(42);
  const n = pts.length;
  const xMin = scrolling ? -600 : 20,  xMax = scrolling ? 5600 : 880;
  const yMin = scrolling ? -300 : 20,  yMax = scrolling ? 1200 : 630;
  const count1 = scrolling ? 120 : 22;
  const count2 = scrolling ? 100 : 18;
  const outerOffsets = [110,130,155];
  for (let k = 0; k < count1; k++) {
    const i = Math.floor(rand()*n);
    const a = pts[i], b = pts[(i+1)%n];
    const dx = b.x-a.x, dy = b.y-a.y;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    const nx = -dy/len, ny = dx/len;
    const off = outerOffsets[Math.floor(rand()*outerOffsets.length)];
    const bx = a.x+nx*off+(rand()-0.5)*20, by = a.y+ny*off+(rand()-0.5)*20;
    if (bx>xMin&&bx<xMax&&by>yMin&&by<yMax) list.push({x:bx,y:by,r:10+rand()*10,shade:rand()});
  }
  const innerOffsets = [90,110,140];
  for (let k = 0; k < count2; k++) {
    const i = Math.floor(rand()*n);
    const a = pts[i], b = pts[(i+1)%n];
    const dx = b.x-a.x, dy = b.y-a.y;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    const nx = -dy/len, ny = dx/len;
    const off = innerOffsets[Math.floor(rand()*innerOffsets.length)];
    const bx = a.x-nx*off+(rand()-0.5)*20, by = a.y-ny*off+(rand()-0.5)*20;
    if (bx>xMin&&bx<xMax&&by>yMin&&by<yMax) list.push({x:bx,y:by,r:9+rand()*9,shade:rand()});
  }
  return list;
}

export function buildObstacles(placements, pts, n) {
  return placements.map(([frac, latFrac]) => {
    const i = Math.floor(frac * n);
    const a = pts[i], b = pts[(i+1)%n];
    const dx = b.x-a.x, dy = b.y-a.y;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    const nx = -dy/len, ny = dx/len;
    const off = latFrac*(TRACK_WIDTH/2-10);
    return { x:a.x+nx*off, y:a.y+ny*off, r:(7+Math.abs(latFrac)*4)*0.7, angle:Math.atan2(dy,dx) };
  });
}

export function loadMap(index) {
  state.currentMapIndex = index;
  const map = MAPS[index];
  const trackPoints        = map.trackPoints;
  const obstaclePlacements = map.obstaclePlacements;

  state.splinePts = computeSpline(trackPoints);
  ({ outer: state.outerPts, inner: state.innerPts } = buildTrackPaths(state.splinePts));
  state.NSPLINE = state.splinePts.length;

  state.sfPt = state.splinePts[0];
  const sfPt2 = state.splinePts[1];
  state.sfDx = sfPt2.x - state.sfPt.x;
  state.sfDy = sfPt2.y - state.sfPt.y;
  state.sfLen = Math.sqrt(state.sfDx * state.sfDx + state.sfDy * state.sfDy);
  state.sfNx = -state.sfDy / state.sfLen;
  state.sfNy =  state.sfDx / state.sfLen;

  state.finishA = {
    x: state.sfPt.x + state.sfNx * (TRACK_WIDTH / 2),
    y: state.sfPt.y + state.sfNy * (TRACK_WIDTH / 2),
  };
  state.finishB = {
    x: state.sfPt.x - state.sfNx * (TRACK_WIDTH / 2),
    y: state.sfPt.y - state.sfNy * (TRACK_WIDTH / 2),
  };

  state.checkpoints = [0.25, 0.5, 0.75, 0.875].map(frac => {
    const i = Math.floor(frac * state.NSPLINE);
    const a = state.splinePts[i], b = state.splinePts[(i + 1) % state.NSPLINE];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    return {
      ax: a.x + nx * (TRACK_WIDTH / 2 + 18), ay: a.y + ny * (TRACK_WIDTH / 2 + 18),
      bx: a.x - nx * (TRACK_WIDTH / 2 + 18), by: a.y - ny * (TRACK_WIDTH / 2 + 18),
      hit: false,
    };
  });

  state.obstacles = buildObstacles(obstaclePlacements, state.splinePts, state.NSPLINE);
  state.bushes    = buildBushes(state.splinePts, !!MAPS[index].scrolling);
  state.camX = 0; state.camY = 0;

  const cfg = MAPS[index].carConfig || DEFAULT_CAR;
  state.MAX_SPEED    = cfg.MAX_SPEED;
  state.SPEED_PHASE1 = cfg.SPEED_PHASE1;
  state.OFFTRACK_MAX = cfg.OFFTRACK_MAX;
  state.ACCEL        = cfg.ACCEL;
  state.BRAKE        = cfg.BRAKE;
  state.FRICTION     = cfg.FRICTION;
  state.STEER_SPEED  = cfg.STEER_SPEED;
}

export function pointOnTrack(px, py) {
  const half = TRACK_WIDTH / 2;
  const halfSq = half * half;
  for (let i = 0; i < state.NSPLINE; i++) {
    const a = state.splinePts[i], b = state.splinePts[(i + 1) % state.NSPLINE];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const ddx = px - cx, ddy = py - cy;
    if (ddx * ddx + ddy * ddy <= halfSq) return true;
  }
  return false;
}

// Segment intersection: returns crossing direction (+1 forward, -1 back) or null
export function segCross(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
  const d1x = p2x-p1x, d1y = p2y-p1y;
  const d2x = p4x-p3x, d2y = p4y-p3y;
  const denom = d1x*d2y - d1y*d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const dx = p3x-p1x, dy = p3y-p1y;
  const t = (dx*d2y - dy*d2x) / denom;
  const u = (dx*d1y - dy*d1x) / denom;
  if (t > 0 && t <= 1 && u >= 0 && u <= 1) return Math.sign(denom);
  return null;
}
