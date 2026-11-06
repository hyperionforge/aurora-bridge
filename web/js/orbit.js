// ============================================================================
// orbit.js - planetary gravity wells, orbit maths, the Oort cloud edge and the
// shield bubble size. Shared by the host (sim.js) and the screens.
// ============================================================================
import { planetPos, SYS_SIZE } from './galaxy.js';

export const WELL_MULT = 6;          // a planet's gravity well reaches 6 radii out
export const GM_PER_R = 16000;       // GM = 16000 * radius -> circular speed at 2.5 radii is 80
export const SURFACE_K = 1.08;       // closer than this (x radius) and we're in the atmosphere
export const OORT_WARN = 5000;       // warn this far inside the edge
export const OORT_MAX = 40000;       // nothing can fly further out than this past the edge

export const wellR = (p) => p.r * WELL_MULT;
export const gmOf = (p) => p.r * GM_PER_R;
export const circSpeed = (p, d) => Math.sqrt(gmOf(p) / Math.max(d, p.r));
export const ORB_NONE = 0, ORB_STABLE = 1, ORB_DESCENT = 2, ORB_ESCAPE = 3;
export const ORB_NAME = ['', 'STABLE ORBIT', 'DECAYING - WILL HIT ATMOSPHERE', 'ESCAPE TRAJECTORY'];

// the well we're in (the strongest pull), or null
export function wellAt(sys, x, y, t) {
  let best = null;
  for (let i = 0; i < sys.planets.length; i++) {
    const p = sys.planets[i], [px, py] = planetPos(sys, i, t);
    const d = Math.hypot(x - px, y - py), W = wellR(p);
    if (d >= W) continue;
    const pull = gmOf(p) / (d * d);
    if (!best || pull > best.pull) best = { i, p, px, py, d, W, pull, wgt: Math.min(1, Math.max(0, (W - d) / (0.3 * W))) };
  }
  return best;
}

// orbit elements for relative position (rx, ry) and velocity (vx, vy)
export function orbitOf(p, rx, ry, vx, vy) {
  const gm = gmOf(p), d = Math.hypot(rx, ry), v2 = vx * vx + vy * vy;
  const E = v2 / 2 - gm / d;
  if (E >= 0) return { st: ORB_ESCAPE, peri: 0, apo: Infinity };
  const a = -gm / (2 * E), h = rx * vy - ry * vx;
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (gm * gm)));
  const peri = a * (1 - e), apo = a * (1 + e);
  if (peri < p.r * 1.12) return { st: ORB_DESCENT, peri, apo };
  if (apo > wellR(p) * 0.95) return { st: ORB_ESCAPE, peri, apo };
  return { st: ORB_STABLE, peri, apo };
}

// the orbit insertion point: 2.5 radii out on the far side of the planet from the star
export function insertionPoint(sys, i, t) {
  const p = sys.planets[i], [px, py] = planetPos(sys, i, t), c = SYS_SIZE / 2;
  const a = Math.atan2(py - c, px - c), d = p.r * 2.5;
  return [px + Math.cos(a) * d, py + Math.sin(a) * d];
}

// how far past the edge of the system's grid a point is (<= 0 = inside)
export const oortDepth = (x, y) => Math.max(-x, -y, x - SYS_SIZE, y - SYS_SIZE);

// shield range, set by SHIELDS: a wider bubble covers ships alongside us but spreads the shields thinner.
// SH_K = shield drained per point of damage stopped (strength = 1 / SH_K)
export const SH_RANGE_R = [600, 1400, 2200, 3000];
export const SH_K = [1, 1.4, 1.9, 2.5];
export const SH_RANGE_NAME = ['TIGHT', 'WIDE', 'WIDER', 'WIDEST'];
export const bubbleR = (lvl) => SH_RANGE_R[Math.max(0, Math.min(3, lvl | 0))];
