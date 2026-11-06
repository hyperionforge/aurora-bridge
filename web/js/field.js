// ============================================================================
// field.js - dense asteroid fields with a winding channel through them.
// A field is a spec { seed, x0, y0, x1, y1, w (channel width), bends } that
// every screen turns into the same rocks (buildField), so only the spec, the
// destroyed rock ids and the few drifting rocks travel over the network.
// Used by the ASTEROID FIELD mission and the CARTOGRAPHERS campaign.
// ============================================================================
import { makeRng } from './util.js';

export const ROCK_SHIP_R = 140;
// loose boulders by composition: ice (phaser freq A), iron (C), crystal (E)
export const BOULDER_COL = ['#8cc8ff', '#c8643c', '#b482ff'];      // our ship's collision radius
export const CELL = 2000;            // spatial hash cell for collision lookups

// the channel: a polyline from the west edge to the east edge of the box
export function fieldPath(spec) {
  const r = makeRng(spec.seed * 7 + 3), pts = [], n = spec.bends || 5, my = (spec.y0 + spec.y1) / 2, h = spec.y1 - spec.y0;
  pts.push([spec.x0 - 2500, my]);
  for (let i = 0; i <= n; i++) {
    const x = spec.x0 + ((spec.x1 - spec.x0) * i) / n;
    const y = i === 0 || i === n ? my : spec.y0 + h * 0.22 + r() * h * 0.56;
    pts.push([x, y]);
  }
  pts.push([spec.x1 + 2500, my]);
  return pts;
}
export function distToPath(pts, x, y) {
  let best = 1e12;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}
// a point a fraction f (0..1) of the way along the channel
export function pathAt(pts, f) {
  let tot = 0; const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); tot += l; }
  let d = f * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const t = d / seg[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; }
    d -= seg[i];
  }
  return pts[pts.length - 1].slice();
}

const cache = new Map();
// every rock: { id, x, y, r }. Deterministic from the spec.
export function buildField(spec) {
  const key = JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key);
  const r = makeRng(spec.seed), pts = fieldPath(spec), rocks = [], sp = spec.sp || 640;
  let id = 0;
  for (let x = spec.x0; x < spec.x1; x += sp)
    for (let y = spec.y0; y < spec.y1; y += sp) {
      const rx = x + (r() - 0.5) * sp * 0.9, ry = y + (r() - 0.5) * sp * 0.9, rr = 110 + r() * r() * 420;
      const k = id++;
      if (distToPath(pts, rx, ry) < spec.w / 2 + rr) continue;
      // the edges thin out so the field has a ragged border
      const edge = Math.min(rx - spec.x0, spec.x1 - rx, ry - spec.y0, spec.y1 - ry);
      if (edge < 1500 && r() > edge / 1500) continue;
      rocks.push({ id: k, x: rx, y: ry, r: Math.round(rr) });
    }
  const out = { spec, pts, rocks, byId: new Map(rocks.map((q) => [q.id, q])) };
  cache.set(key, out);
  if (cache.size > 4) cache.delete(cache.keys().next().value);
  return out;
}
export function insideBox(spec, x, y, pad = 0) { return x > spec.x0 - pad && x < spec.x1 + pad && y > spec.y0 - pad && y < spec.y1 + pad; }

// a grid of rock lists for fast "what's near me" lookups (host side)
export function hashRocks(rocks) {
  const m = new Map();
  for (const q of rocks) { const k = Math.floor(q.x / CELL) * 100000 + Math.floor(q.y / CELL); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(q); }
  return m;
}
export function rocksNear(hash, x, y, out = []) {
  out.length = 0;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = hash.get((cx + i) * 100000 + cy + j); if (a) for (const q of a) out.push(q); }
  return out;
}

// draw rocks with a screen transform p2(wx, wy) -> [sx, sy] and scale k (px per metre)
export function drawRocks(g, rocks, p2, k, box, opts = {}) {
  const c = g.ctx, minR = opts.minR ?? 1;
  for (const q of rocks) {
    const [sx, sy] = p2(q.x, q.y), rr = Math.max(minR, q.r * k);
    if (sx < box.x - rr || sx > box.x + box.w + rr || sy < box.y - rr || sy > box.y + box.h + rr) continue;
    const h = (q.id * 2654435761) >>> 0;
    c.fillStyle = q.drift ? BOULDER_COL[q.c ?? 1] : ['#6e665c', '#5c5650', '#7a7066'][h % 3];
    if (rr < 2.5) { c.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); continue; }
    // a lumpy rock: a polygon with jittered radius
    c.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + (h % 10), f = 0.75 + (((h >>> (i * 3)) & 7) / 7) * 0.35; const px = sx + Math.cos(a) * rr * f, py = sy + Math.sin(a) * rr * f; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); c.fill();
    if (rr > 5) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(sx + rr * 0.25, sy + rr * 0.2, rr * 0.45, 0, Math.PI * 2); c.fill(); }
    if (q.drift && opts.mark) { c.strokeStyle = q.tr ? '#78f0ff' : '#ff8c3c'; c.lineWidth = 1.5; c.setLineDash(q.tr ? [3, 3] : []); c.beginPath(); c.arc(sx, sy, rr + 4, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  }
}
