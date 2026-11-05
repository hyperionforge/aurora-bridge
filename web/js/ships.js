// ships.js - ship artwork (original designs), planets, map markers.
// Ships are lists of simple shapes, nose pointing UP (-y), about -85..+85.
import { C, CT_RAIDER, CT_DESTROYER, CT_FREIGHTER, CT_STARBASE, CT_ANOMALY, CT_BUOY, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  MK_BEACON, MK_AREA, MK_POINT, MK_RENDEZVOUS } from './config.js';
import { DEG } from './util.js';
import { dim, flash } from './gfx.js';
import { drawStation, drawPoi } from './sysdraw.js';

const TRI = 0, RECT = 1, CIRC = 2, LINE = 3, MIR = 0x80;
const L = 0, Mi = 1, D = 2, A = 3, G = 4, O = 5, R = 6, W = 7, Pn = 8, X = 9;
const S = (t, c, ...v) => ({ t, c, v });

const CRUISER = [
  S(TRI | MIR, D, 16, -14, 74, 30, 20, 34), S(TRI | MIR, D, 20, 34, 74, 30, 74, 42), S(LINE | MIR, Mi, 16, -14, 74, 30),
  S(LINE | MIR, Pn, 30, 10, 64, 33), S(RECT | MIR, Mi, 70, -2, 16, 64), S(RECT | MIR, G, 72, 6, 3, 46), S(RECT | MIR, O, 73, -4, 10, 6),
  S(RECT | MIR, G, 73, 58, 10, 4), S(TRI, L, 0, -80, -24, -20, 24, -20), S(TRI, Mi, -24, -20, 24, -20, 32, 42),
  S(TRI, Mi, -24, -20, -32, 42, 32, 42), S(TRI, D, -32, 42, 32, 42, 20, 56), S(TRI, D, -32, 42, -20, 56, 20, 56),
  S(TRI, X, 0, -72, -14, -18, 14, -18), S(RECT, L, -3, -20, 6, 62), S(LINE | MIR, L, 0, -80, 24, -20), S(LINE | MIR, L, 24, -20, 32, 42),
  S(LINE, Pn, -22, 4, 22, 4), S(LINE, Pn, -26, 24, 26, 24), S(LINE | MIR, Pn, 12, -40, 20, 0), S(RECT | MIR, A, 26, 30, 6, 8),
  S(CIRC, D, 0, -8, 7), S(CIRC, X, 0, -8, 5), S(CIRC, A, 0, -9, 2), S(RECT | MIR, W, 16, 12, 2, 2), S(RECT | MIR, W, 13, 15, 2, 2),
  S(RECT | MIR, W, 10, 18, 2, 2), S(RECT, R, -14, 54, 28, 4), S(RECT, O, -10, 55, 20, 2), S(CIRC, O, 0, -70, 2), S(RECT, R, -3, -52, 6, 4),
];
const DREADNOUGHT = [
  S(RECT | MIR, Mi, 44, -12, 16, 42), S(RECT | MIR, Mi, 44, 36, 16, 30), S(RECT | MIR, G, 48, 27, 8, 3), S(RECT | MIR, G, 48, 63, 8, 3),
  S(RECT | MIR, G, 57, -6, 2, 30), S(RECT | MIR, D, 30, -44, 14, 96), S(RECT, Mi, -30, -60, 60, 112), S(TRI, L, -30, -60, 30, -60, 0, -84),
  S(RECT, L, -22, -56, 44, 102), S(LINE, Pn, -22, -30, 22, -30), S(LINE, Pn, -22, 0, 22, 0), S(LINE, Pn, -22, 24, 22, 24),
  S(LINE | MIR, Pn, 11, -56, 11, 46), S(CIRC, D, 0, -34, 8), S(CIRC, A, 0, -34, 4), S(CIRC | MIR, D, 16, -12, 6), S(CIRC | MIR, A, 16, -12, 3),
  S(CIRC | MIR, D, 16, 14, 6), S(CIRC | MIR, A, 16, 14, 3), S(RECT, D, -9, 30, 18, 12), S(RECT | MIR, W, 2, 34, 2, 2), S(RECT | MIR, W, 6, 34, 2, 2),
  S(RECT, D, -26, 52, 52, 10), S(RECT, R, -22, 60, 44, 4), S(RECT | MIR, A, 30, -50, 14, 5),
];
const RAIDER = [
  S(TRI | MIR, D, 14, 10, 70, 40, 30, 40), S(TRI | MIR, Mi, 30, 40, 70, 40, 64, 52), S(RECT | MIR, G, 58, 44, 8, 3),
  S(TRI | MIR, Mi, 14, -10, 54, -72, 40, 12), S(TRI | MIR, D, 40, 12, 54, -72, 60, -20), S(LINE | MIR, A, 16, -10, 54, -72),
  S(TRI | MIR, A, 54, -72, 47, -56, 57, -58), S(TRI, Mi, 0, -62, -15, 10, 15, 10), S(TRI, L, 0, -56, -8, 4, 8, 4), S(TRI, D, -15, 10, 15, 10, 0, 42),
  S(CIRC, D, 0, 40, 10), S(CIRC, G, 0, 40, 6), S(CIRC, X, 0, 40, 2), S(CIRC, D, 0, -12, 7), S(CIRC, X, 0, -12, 5), S(CIRC, A, 0, -13, 2),
  S(LINE | MIR, Pn, 26, 20, 56, 40), S(RECT | MIR, W, 6, 12, 2, 2), S(RECT | MIR, R, 42, -14, 4, 4),
];
const FREIGHTER = [
  S(RECT, Mi, -7, -54, 14, 112), S(RECT | MIR, A, 8, -42, 18, 22), S(RECT | MIR, A, 8, -16, 18, 22), S(RECT | MIR, A, 8, 10, 18, 22),
  S(RECT | MIR, D, 26, -42, 3, 74), S(LINE | MIR, Pn, 8, -20, 26, -20), S(LINE | MIR, Pn, 8, 6, 26, 6), S(RECT, D, -16, -60, 32, 10),
  S(TRI, L, 0, -76, -16, -60, 16, -60), S(RECT | MIR, W, 4, -57, 3, 3), S(RECT | MIR, W, 10, -57, 3, 3), S(RECT | MIR, D, 6, 52, 9, 14),
  S(RECT | MIR, G, 7, 64, 7, 4), S(RECT, L, -2, -50, 4, 100),
];
export const ART_CRUISER = 0, ART_RAIDER = 1, ART_DESTROYER = 2, ART_FREIGHTER = 3;
const ART = [CRUISER, RAIDER, DREADNOUGHT, FREIGHTER];

function shipColor(idx, accent) {
  switch (idx) {
    case L: return '#bec3cd';
    case Mi: return '#8c929e';
    case D: return '#585e6c';
    case A: return accent;
    case G: return '#6ebeff';
    case O: return C.ORANGE;
    case R: return C.RED;
    case W: return C.YELLOW;
    case Pn: return '#464b58';
    default: return '#e1e4eb';
  }
}

// draw a design at any heading (0 = nose up, clockwise); dim < 1 darkens it
export function drawShip(g, art, accent, cx, cy, scale, hdg, dimF = 1) {
  const c = g.ctx;
  c.save();
  c.translate(cx, cy);
  c.rotate(hdg * DEG);
  c.scale(scale, scale);
  c.lineWidth = 1 / scale;
  for (const p of ART[art % 4]) {
    const t = p.t & 0x7f;
    let col = shipColor(p.c, accent);
    if (dimF < 0.99) col = dim(col.startsWith('#') ? col : C.WHITE, dimF);
    c.fillStyle = col;
    c.strokeStyle = col;
    for (let m = 0; m < (p.t & MIR ? 2 : 1); m++) {
      const v = p.v.slice();
      if (m) {
        if (t === RECT) v[0] = -v[0] - v[2];
        else { v[0] = -v[0]; if (t !== CIRC) v[2] = -v[2]; if (t === TRI) v[4] = -v[4]; }
      }
      c.beginPath();
      switch (t) {
        case TRI: c.moveTo(v[0], v[1]); c.lineTo(v[2], v[3]); c.lineTo(v[4], v[5]); c.closePath(); c.fill(); break;
        case RECT: c.fillRect(v[0], v[1], v[2], v[3]); break;
        case CIRC: c.arc(v[0], v[1], Math.max(v[2], 1 / scale), 0, Math.PI * 2); c.fill(); break;
        case LINE: c.moveTo(v[0], v[1]); c.lineTo(v[2], v[3]); c.stroke(); break;
      }
    }
  }
  c.restore();
}

export function drawStarbase(g, cx, cy, scale, rot, t) {
  const R = Math.max(4, 70 * scale);
  const hull = '#969ca8', dark = '#505664';
  for (let i = 0; i < 4; i++) {
    const a = (rot + i * 90) * DEG;
    g.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, hull, Math.max(1, R / 25));
  }
  g.circle(cx, cy, R, hull, false, Math.max(1, R / 18));
  if (R > 6) g.circle(cx, cy, R - 2, dark, false, 1);
  g.circle(cx, cy, R / 3 + 1, hull);
  g.circle(cx, cy, R / 5 + 1, C.SKY);
  for (let i = 0; i < 8; i++) {
    const a = (rot * 0.5 + i * 45) * DEG;
    const on = (Math.floor(t / 300) + i) % 4 === 0;
    g.circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R > 20 ? 2.2 : 1.2, on ? C.YELLOW : C.ORANGE);
  }
}

export function drawAnomaly(g, cx, cy, scale, t) {
  const R = Math.max(4, 60 * scale);
  for (let i = 4; i >= 1; i--) {
    const r = Math.max(2, R * i / 4 + (Math.floor(t / 60 + i * 7) % 6) - 3);
    g.circle(cx, cy, r, i % 2 ? C.VIOLET : '#783cc8', false, Math.max(1, R / 40));
  }
  for (let i = 0; i < 6; i++) {
    const a = (t / 8 + i * 60) * DEG;
    g.line(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, cx + Math.cos(a + 0.9) * R, cy + Math.sin(a + 0.9) * R, C.LILAC, Math.max(1, R / 50));
  }
  g.circle(cx, cy, R / 5 + 1, C.WHITE);
}

export const artFor = (type) => (type === CT_RAIDER ? ART_RAIDER : type === CT_DESTROYER ? ART_DESTROYER : type === CT_FREIGHTER ? ART_FREIGHTER : ART_CRUISER);
export const accentFor = (type) => (type === CT_RAIDER ? C.RED : type === CT_DESTROYER ? '#c82828' : type === CT_FREIGHTER ? '#a0825a' : C.SKY);
export const factionColor = (f) => (f === F_FRIEND ? C.GREEN : f === F_NEUTRAL ? C.SKY : f === F_HOSTILE ? C.RED : C.YELLOW);

export function drawContact(g, type, cx, cy, scale, hdg, t, dimF = 1, kind, civ) {
  if (type === CT_STARBASE) { if (kind !== undefined && kind !== null) drawStation(g, kind, cx, cy, scale, t, civ); else drawStarbase(g, cx, cy, scale, t / 100, t); }
  else if (type === CT_ANOMALY) drawAnomaly(g, cx, cy, scale, t);
  else if (type === CT_POI) drawPoi(g, kind ?? 0, cx, cy, scale, t, (civ ?? 0) * 0.7);
  else if (type === CT_BUOY) {
    const r = Math.max(3, 14 * scale * 4);
    g.circle(cx, cy, r, '#787e8c');
    g.line(cx - r * 2, cy, cx + r * 2, cy, '#969caa');
    g.line(cx, cy - r * 2, cx, cy + r * 2, '#969caa');
    g.circle(cx, cy, r / 2 + 1, Math.floor(t / 500) % 2 ? C.GREEN : C.GREEN_DIM);
  } else drawShip(g, artFor(type), accentFor(type), cx, cy, scale, hdg, dimF);
}

export function drawPlanet(g, x, y, r, c1, c2) {
  r = Math.min(r, 900);
  g.circle(x, y, r, c1);
  for (let i = 1; i <= 3; i++) g.circle(x + r * i / 8, y - r * i / 10, r - r * i / 5, i % 2 ? c2 : c1);
  g.circle(x + r / 3, y - r / 4, r / 3, dim(c2, 1.2));
  g.circle(x, y, r + 1, dim(C.SKY, 0.5), false, 1);
}

export function drawMarker(g, x, y, kind, rpx, size = 11) {
  switch (kind) {
    case MK_BEACON:
      if (flash(400)) g.circle(x, y, 7, C.YELLOW, false, 1.5);
      g.circle(x, y, 2.5, C.YELLOW);
      g.text(x + 10, y - size / 2, 'BEACON', size, C.YELLOW);
      break;
    case MK_AREA: {
      const c = g.ctx;
      c.save();
      c.setLineDash([3, 5]);
      g.circle(x, y, rpx, C.ORANGE, false, 1.2);
      c.restore();
      g.text(x, y - size / 2, 'SEARCH AREA', size, C.ORANGE, 'center');
      break;
    }
    case MK_POINT:
      g.line(x - 6, y, x, y - 6, C.LILAC, 1.5); g.line(x, y - 6, x + 6, y, C.LILAC, 1.5);
      g.line(x + 6, y, x, y + 6, C.LILAC, 1.5); g.line(x, y + 6, x - 6, y, C.LILAC, 1.5);
      break;
    case MK_RENDEZVOUS:
      g.circle(x, y, 6, C.GREEN, false, 1.5);
      if (flash(400)) g.circle(x, y, 10, C.GREEN, false, 1.5);
      g.text(x + 13, y - size / 2, 'RENDEZVOUS', size, C.GREEN);
      break;
  }
}

// nebula as a cloud of points, deterministic
export function drawNebula(g, sx, sy, r, n, col) {
  const c = g.ctx;
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const h = Math.imul(i, 2654435761) >>> 0;
    const a = (h % 628) / 100;
    const rr = Math.sqrt(((Math.imul(h, 1103515245) + 12345) >>> 16) % 1000 / 1000) * r;
    c.fillRect(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, 1.5, 1.5);
  }
}
