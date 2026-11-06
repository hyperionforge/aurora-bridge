// stations/common.js - pieces shared by the station tabs
import * as K from '../config.js';
import { C } from '../config.js';
import { DEG } from '../util.js';
import { dim, flash, lerpCol } from '../gfx.js';
import { drawShip, drawStarbase, drawAnomaly, factionColor, artFor, accentFor, ART_CRUISER } from '../ships.js';
import { fmtDist } from '../util.js';
import { bodies, drawStation, drawPoi } from '../sysdraw.js';
import { drawRocks } from '../field.js';

// world -> radar screen. headingUp rotates the picture so the bow points up
export function w2r(w, wx, wy, range, cx, cy, R, headingUp) {
  let dx = wx - w.P.x, dy = wy - w.P.y;
  if (headingUp) {
    const a = -w.P.hdg * DEG, c = Math.cos(a), s = Math.sin(a);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  const k = R / range;
  return [cx + dx * k, cy + dy * k];
}

export function drawRadar(g, w, cx, cy, R, range, headingUp, selected, sweep) {
  for (let i = 1; i <= 4; i++) g.circle(cx, cy, R * i / 4, C.GRID, false, 1);
  g.rect(cx - R, cy, 2 * R, 1, C.GRID);
  g.rect(cx, cy - R, 1, 2 * R, C.GRID);
  g.text(cx + R - 4, cy + 4, fmtDist(range), 11, C.GRID, 'right');
  g.text(cx + R / 2 - 4, cy + 4, fmtDist(range / 2), 11, C.GRID, 'right');
  if (sweep) {
    const a = (performance.now() / 6) % 360;
    for (let i = 0; i < 20; i++) {
      const aa = (a - i * 1.5) * DEG;
      g.line(cx, cy, cx + Math.sin(aa) * R, cy - Math.cos(aa) * R, lerpCol([0, 0, 0], [30, 80, 140], 1 - i / 20), 2);
    }
  }
  g.clip(cx - R, cy - R, 2 * R, 2 * R);
  for (const b of bodies(w.sys, w.tSec)) {
    const [sx, sy] = w2r(w, b.x, b.y, range, cx, cy, R, headingUp);
    g.circle(sx, sy, Math.max(2, b.r * R / range), dim(b.c1, b.star ? 0.9 : 0.6));
  }
  for (const nb of w.sys.nebulae) {
    const [sx, sy] = w2r(w, nb.x, nb.y, range, cx, cy, R, headingUp);
    g.circle(sx, sy, nb.r * R / range, nb.col, false, 1.5);
  }
  { const rk = w.rocks(); if (rk.length) drawRocks(g, rk, (x, y) => w2r(w, x, y, range, cx, cy, R, headingUp), R / range, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, { minR: 1, mark: true }); }
  if (w.P.wpValid) {
    const [sx, sy] = w2r(w, w.P.wpx, w.P.wpy, range, cx, cy, R, headingUp);
    g.strokeRect(sx - 4, sy - 4, 9, 9, C.VIOLET, 1.5);
  }
  g.unclip();
  for (const c of w.contacts()) {
    if (!c.alive) continue;
    const [sx, sy] = w2r(w, c.x, c.y, range, cx, cy, R, headingUp);
    if ((sx - cx) ** 2 + (sy - cy) ** 2 > R * R) continue;
    const col = factionColor(c.faction);
    const h = c.hdg - (headingUp ? w.P.hdg : 0);
    if (c.type === K.CT_STARBASE) drawStation(g, c.kind ?? 0, sx, sy, 0.13, w.now, c.civ);
    else if (c.type === K.CT_ANOMALY) drawAnomaly(g, sx, sy, 0.15, w.now);
    else if (c.type === K.CT_POI) drawPoi(g, c.kind ?? 0, sx, sy, 0.16, w.now, (c.civ ?? 0) * 0.7);
    else if (c.known) drawShip(g, artFor(c.type), accentFor(c.type), sx, sy, 0.17, h);
    else { g.circle(sx, sy, 5, col); g.circle(sx, sy, 8, col, false, 1.5); }
    g.text(sx, sy + 14, w.shortName(c.id, c.known), 12, col, 'center');
    if (c.id === selected) g.brackets(sx, sy, 15, flash(300) ? C.RED : C.ORANGE);
  }
  for (const t of w.torp) {
    const [sx, sy] = w2r(w, t.x, t.y, range, cx, cy, R, headingUp);
    if ((sx - cx) ** 2 + (sy - cy) ** 2 > R * R) continue;
    g.circle(sx, sy, 2.5, t.owner === K.US ? C.ORANGE : C.GREEN);
  }
  for (const b of w.beams) {
    const f = w.n(b.from), t = w.n(b.to);
    const [x0, y0] = b.from !== K.US && f ? w2r(w, f.x, f.y, range, cx, cy, R, headingUp) : [cx, cy];
    const [x1, y1] = b.to !== K.US && t ? w2r(w, t.x, t.y, range, cx, cy, R, headingUp) : [cx, cy];
    g.line(x0, y0, x1, y1, b.from === K.US ? C.ORANGE : C.GREEN, 1.5);
  }
  drawShip(g, ART_CRUISER, C.SKY, cx, cy, 0.2, headingUp ? 0 : w.P.hdg);
}

// tap on a radar -> nearest contact id (or NO_ID)
export function radarPick(w, tx, ty, cx, cy, R, range, headingUp) {
  let best = K.NO_ID, bd = 34 * 34;
  for (const c of w.contacts()) {
    if (!c.alive) continue;
    const [sx, sy] = w2r(w, c.x, c.y, range, cx, cy, R, headingUp);
    const d = (sx - tx) ** 2 + (sy - ty) ** 2;
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}

export const DIM_BTN = C.GREY;
