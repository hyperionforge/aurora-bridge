// ============================================================================
// orbit.js - planets as places to hold station (an "orbit" is the escort
// autopilot keeping us alongside a planet), the edge of the system, and the
// shield bubble size. Shared by the host (sim.js) and the screens.
// ============================================================================
import { planetPos, SYS_SIZE } from './galaxy.js';

export const ORBIT_K = 2.4;          // a standard orbit holds this many planet radii from the centre
export const SURFACE_K = 1.08;       // closer than this (x radius) and we're in the atmosphere
export const ORBIT_OK = 900;         // within this of the orbit station point = "in orbit"
export const GROUND_SEEN_K = 8;      // surface sites show on sensors within this many radii

// the orbit station point for planet i at time t, on the side given by angle a (radians, from the planet)
export function orbitPoint(sys, i, t, a) {
  const p = sys.planets[i], [px, py] = planetPos(sys, i, t), d = p.r * ORBIT_K;
  return [px + Math.cos(a) * d, py + Math.sin(a) * d];
}
// a planet's velocity (m/s) at time t
export function planetVel(sys, i, t) {
  const [x0, y0] = planetPos(sys, i, t), [x1, y1] = planetPos(sys, i, t + 1);
  return [x1 - x0, y1 - y0];
}

// how far outside the system's grid a point is (<= 0 = inside)
export const outDepth = (x, y) => Math.max(-x, -y, x - SYS_SIZE, y - SYS_SIZE);
// leaving the system: 30s of warnings, then 30s until the warp core breaches
export const OOB_WARN = 30, OOB_DEAD = 60;
export const OOB_TEXT = [
  'OUTSIDE THE SYSTEM - NO NAV BEACON FIXES, AND THE HELIOPAUSE SHEAR IS STRAINING THE WARP CORE. TURN BACK',
  'WARP CORE CONTAINMENT FAILING IN THE HELIOPAUSE SHEAR - GET BACK INSIDE OR THE CORE BREACHES',
];

// shield range, set by SHIELDS with a slider (t = 0..1): a wider bubble covers ships alongside us but
// spreads the shields thinner. shK = shield drained per point of damage stopped (strength = 1 / shK).
export const SH_MIN_R = 200, SH_MAX_R = 1000; // bubble radius: tight 0.2k (full strength) .. wide 1k (40%)
export const bubbleR = (t) => SH_MIN_R + (SH_MAX_R - SH_MIN_R) * Math.max(0, Math.min(1, t || 0));
export const shK = (t) => 1 + 1.5 * Math.max(0, Math.min(1, t || 0));
