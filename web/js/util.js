// util.js - maths and naming helpers shared by the host and every screen
import {
  CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_ANOMALY, CT_BUOY, ID_FIRST_DYN, ID_BONUS,
  FREIGHTER_NAMES, ORDERS, NUM_ORDERS, SUBJ_CONTACT, SUBJ_SYSTEM, SUBJ_QUAD, SYS_NAME, QUAD_NAME, MAX_CONTACTS,
} from './config.js';

// 'WARP 3.4' - the factor we're really doing (capped by warp power)
export const warpTxt = (P) => 'WARP ' + (Math.round(Math.min(P.warpSet, P.warpCap ?? 9) * 10) / 10);
export const DEG = Math.PI / 180;
export const clampf = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function wrap360(a) {
  a %= 360;
  return a < 0 ? a + 360 : a;
}
export function angDiff(a, b) { // b - a, -180..180
  const d = wrap360(b - a);
  return d > 180 ? d - 360 : d;
}
// compass bearing (0 = north/up, clockwise); y grows downward
export const bearingTo = (x0, y0, x1, y1) => wrap360(Math.atan2(x1 - x0, -(y1 - y0)) / DEG);
export const distTo = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpAng = (a, b, t) => wrap360(a + angDiff(a, b) * t);

export function sectorName(x, y) {
  const cx = clampf(Math.floor(x / 16000), 0, 9), cy = clampf(Math.floor(y / 16000), 0, 9);
  return String.fromCharCode(65 + cx) + '-' + (cy + 1);
}
export function fmtDist(d) {
  return d >= 10000 ? Math.floor(d / 1000) + 'k' : (d / 1000).toFixed(1) + 'k';
}
export function quadFromRel(rel) {
  rel = wrap360(rel);
  if (rel < 45 || rel >= 315) return 0;
  if (rel < 135) return 3;
  if (rel < 225) return 1;
  return 2;
}
export const pad3 = (n) => String(Math.round(n) % 360).padStart(3, '0');
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- names
export function contactName(id, type, identified, nameSeed) {
  if (!identified) return 'UNKNOWN CONTACT';
  const letter = String.fromCharCode(65 + (id >= ID_FIRST_DYN ? id - ID_FIRST_DYN : 0));
  switch (type) {
    case CT_STARBASE: return 'STARBASE 12';
    case CT_FREIGHTER: return 'FREIGHTER ' + FREIGHTER_NAMES[(id + nameSeed) % 8];
    case CT_RAIDER: return 'KESSARI RAIDER ' + letter;
    case CT_DESTROYER: return 'KESSARI DESTROYER ' + letter;
    case CT_ANOMALY: return id === ID_BONUS ? 'SUBSPACE ANOMALY' : 'ANOMALY ' + letter;
    case CT_BUOY: return 'NAV BUOY ' + letter;
  }
  return 'CONTACT';
}
export function shortName(id, type, identified, nameSeed) {
  if (!identified) return 'UNKNOWN';
  const letter = String.fromCharCode(65 + (id >= ID_FIRST_DYN ? id - ID_FIRST_DYN : 0));
  switch (type) {
    case CT_STARBASE: return 'SB-12';
    case CT_FREIGHTER: return FREIGHTER_NAMES[(id + nameSeed) % 8];
    case CT_RAIDER: return 'RAIDER ' + letter;
    case CT_DESTROYER: return 'DESTROYER ' + letter;
    case CT_ANOMALY: return id === ID_BONUS ? 'ANOMALY' : 'ANOMALY ' + letter;
    case CT_BUOY: return 'BUOY ' + letter;
  }
  return '?';
}
// order text with its subject filled in. nameOf(id) -> short name of a contact
export function orderText(code, arg, nameOf) {
  const d = ORDERS[code % NUM_ORDERS];
  let subj = '';
  if (d.subj === SUBJ_CONTACT) subj = arg < MAX_CONTACTS ? nameOf(arg) : '?';
  else if (d.subj === SUBJ_SYSTEM) subj = SYS_NAME[arg % 6];
  else if (d.subj === SUBJ_QUAD) subj = QUAD_NAME[arg % 4];
  return d.label.replace('%s', subj);
}

// small seeded RNG (mulberry32) so test runs repeat exactly
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
