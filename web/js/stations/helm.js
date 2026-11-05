// stations/helm.js - HELM, NAV, SCIENCE and COMMS sub-stations (port of helm.h)
import * as K from '../config.js';
import { C, CMD } from '../config.js';
import { DEG, wrap360, distTo, bearingTo, fmtDist, pad3, sectorName, clampf, angDiff, mmss } from '../util.js';
import { dim, flash, healthColor } from '../gfx.js';
import { drawShip, drawMarker, factionColor, ART_CRUISER } from '../ships.js';
import { drawSystemLayer, drawGalaxy, drawStation, galaxyKnown } from '../sysdraw.js';
import { SYSTEMS, SYS_SIZE, SYS_C, WELL_R, sysAt, lanesOf, CIV_NAME, SK_NAME, SK_RELAY, SK_MONOLITH } from '../galaxy.js';
import { drawRadar, radarPick } from './common.js';

export function fromName(w, from) {
  if (from === K.FROM_COMMAND) return 'FLEET COMMAND';
  if (from === K.FROM_COMPUTER) return 'COMPUTER';
  if (from === K.FROM_CREW) return 'BRIDGE';
  return w.shortName(from);
}

// ============================================================================ HELM
export const helm = {
  dialDrag: false, localHdg: 0, thrDrag: false, localThr: 0, lastSend: 0,
  draw(g, w, app, L) {
    const P = w.P, S = this;
    // ---- compass (big square)
    const cx = L.bx + L.BIG / 2, cy = L.by + L.BIG / 2, R = L.BIG / 2 - 6;
    const des = S.dialDrag ? S.localHdg : P.desHdg;
    g.circle(cx, cy, R, C.GRID, false, 1.5);
    g.circle(cx, cy, R - 30, C.GRID, false, 1);
    for (let a = 0; a < 360; a += 5) {
      const r = a * DEG, l = a % 30 === 0 ? 14 : a % 10 === 0 ? 8 : 4;
      g.line(cx + Math.sin(r) * (R - l), cy - Math.cos(r) * (R - l), cx + Math.sin(r) * R, cy - Math.cos(r) * R, a % 30 ? C.BLUE : C.SKY, 1.5);
      if (a % 30 === 0) g.text(cx + Math.sin(r) * (R - 25), cy - Math.cos(r) * (R - 25) - 7, pad3(a), 12, C.PEACH, 'center');
    }
    if (P.wpValid) {
      const b = bearingTo(P.x, P.y, P.wpx, P.wpy) * DEG;
      g.rect(cx + Math.sin(b) * (R - 42) - 5, cy - Math.cos(b) * (R - 42) - 5, 10, 10, C.VIOLET);
    }
    const t = w.findC(P.target);
    if (t) { const b = w.bearing(t) * DEG; g.circle(cx + Math.sin(b) * (R - 42), cy - Math.cos(b) * (R - 42), 6, C.RED); }
    const dr = des * DEG;
    g.tri(cx + Math.sin(dr) * (R + 1), cy - Math.cos(dr) * (R + 1), cx + Math.sin(dr - 0.07) * (R - 22), cy - Math.cos(dr - 0.07) * (R - 22),
      cx + Math.sin(dr + 0.07) * (R - 22), cy - Math.cos(dr + 0.07) * (R - 22), P.autopilot ? C.VIOLET : C.WHITE);
    const hr = P.hdg * DEG;
    g.line(cx, cy, cx + Math.sin(hr) * (R - 32), cy - Math.cos(hr) * (R - 32), C.ORANGE, 3);
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, L.BIG / 520, P.hdg);
    g.text(L.bx + 2, L.by, 'HDG ' + pad3(P.hdg), 19, C.ORANGE);
    g.text(L.bx + 2, L.by + 22, 'CRS ' + pad3(des), 19, P.autopilot ? C.VIOLET : C.WHITE);
    if (P.autopilot) g.text(L.bx + 2, L.by + 45, P.autopilot === K.AP_WAYPOINT ? 'AUTOPILOT: WAYPOINT' : 'AUTOPILOT: INTERCEPT', 12, C.VIOLET);
    g.text(L.bx + L.BIG - 2, L.by, P.warping ? 'WARP ' + P.warpSet : Math.round(P.speed) + ' KM/S', 19, C.SKY, 'right');
    g.text(L.bx + L.BIG - 2, L.by + 22, 'SECTOR ' + sectorName(P.x, P.y), 13, C.GREY_TXT, 'right');
    if (P.evasive) g.text(L.bx + 2, L.by + 60, 'EVASIVE MANOEUVRES', 12, flash(400) ? C.YELLOW : C.ORANGE);
    g.text(L.bx + L.BIG / 2, L.by + L.BIG - 14, 'DRAG THE RING TO SET COURSE', 12, C.GREY_TXT, 'center');
    const angAt = (x, y) => wrap360(Math.atan2(x - cx, -(y - cy)) / DEG);
    g.hitCircle(cx, cy, R + 14, {
      down: (x, y) => { if ((x - cx) ** 2 + (y - cy) ** 2 < 60 * 60) return; S.dialDrag = true; S.localHdg = angAt(x, y); app.sound.tap(); },
      move: (x, y) => {
        if (!S.dialDrag) return;
        if ((x - cx) ** 2 + (y - cy) ** 2 > 20 * 20) S.localHdg = angAt(x, y);
        if (performance.now() - S.lastSend > 150) { S.lastSend = performance.now(); app.send(CMD.HEADING, 0, 0, Math.round(S.localHdg)); }
      },
      up: () => { if (S.dialDrag) app.send(CMD.HEADING, 0, 0, Math.round(S.localHdg)); S.dialDrag = false; },
    });
    // ---- nudges
    const nl = ['<< 10', '< 1', '1 >', '10 >>'], nv = [-10, -1, 1, 10], nw = (L.uw - 18) / 4;
    nl.forEach((l, i) => g.button('nud' + i, L.ux + i * (nw + 6), L.uy, nw, L.uh, l, C.LILAC, C.BLACK, 17, () => {
      const base = P.autopilot ? P.hdg : P.desHdg;
      app.send(CMD.HEADING, 0, 0, Math.round(wrap360(base + nv[i])));
    }));
    // ---- right column: impulse slider, warp, stop, evasive, dock
    const x = L.rx, y0 = L.y0;
    const sw = 76, wx = x + sw + 12, ww = L.x1 - wx;
    g.text(x + sw / 2, y0, 'IMPULSE', 13, C.PEACH, 'center');
    const thr = S.thrDrag ? S.localThr : P.throttle;
    g.vslider('thr', x, y0 + 20, sw, 250, Math.max(0, thr), 100, C.ORANGE, 5, (v, final, start) => {
      if (start) { S.thrDrag = true; app.sound.tap(); }
      if (Math.floor(v / 10) !== Math.floor(S.localThr / 10)) app.sound.sliderTick();
      S.localThr = v;
      if (final) { S.thrDrag = false; app.send(CMD.THROTTLE, 0, 0, v); }
      else if (performance.now() - S.lastSend > 150) { S.lastSend = performance.now(); app.send(CMD.THROTTLE, 0, 0, v); }
    }, S.thrDrag);
    g.text(x + sw / 2, y0 + 278, thr + '%', 19, thr < 0 ? C.RED : C.PEACH, 'center');
    g.button('rev', x, y0 + 304, sw, 34, 'REVERSE', P.throttle < 0 ? C.RED : C.GREY, P.throttle < 0 ? C.BLACK : C.GREY_TXT, 15,
      () => app.send(CMD.THROTTLE, 0, 0, P.throttle < 0 ? 0 : -25), { sound: 'toggle' });
    g.text(wx, y0, 'WARP FACTOR', 13, C.PEACH);
    for (let wf = 4; wf >= 0; wf--) {
      const sel = P.warpSet === wf;
      const col = sel ? (wf ? (P.warping ? C.SKY : C.YELLOW) : C.ORANGE) : C.GREY;
      g.button('warp' + wf, wx, y0 + 20 + (4 - wf) * 38, ww, 33, wf ? 'WARP ' + wf : 'IMPULSE', col, sel ? C.BLACK : C.GREY_TXT, 17, () => app.send(CMD.WARP, wf));
    }
    g.progress(wx, y0 + 214, ww, 8, P.warpCharge, C.SKY);
    let ws = P.warping ? 'AT WARP' : P.warpSet ? 'ENGAGING...' : 'WARP DRIVE READY';
    if (P.health[K.S_WARP] <= 0) ws = 'WARP DRIVE OFFLINE';
    g.text(wx, y0 + 226, ws, 12, P.health[K.S_WARP] <= 0 ? C.RED : C.GREY_TXT);
    g.button('stop', wx, y0 + 246, ww, 40, 'FULL STOP', C.RED, C.BLACK, 19, () => app.send(CMD.STOP));
    g.button('evade', wx, y0 + 292, ww, 34, P.evasive ? 'EVASIVE: ON' : 'EVASIVE: OFF', P.evasive ? C.YELLOW : C.GREY, P.evasive ? C.BLACK : C.GREY_TXT, 17,
      () => app.send(CMD.EVASIVE, P.evasive ? 0 : 1), { sound: 'toggle' });
    const st = nearestStation(w), db = st ? st.d : 1e9;
    let dl = 'DOCK', dc = db < K.DOCK_RANGE ? C.GREEN : C.GREY;
    if (P.dock === 1) { dl = `DOCKING ${Math.round(P.dockT / K.DOCK_TIME_S * 100)}%`; dc = C.YELLOW; }
    else if (P.dock === 2) { dl = 'UNDOCK'; dc = C.LILAC; }
    g.button('dock', wx, y0 + 332, ww, 34, dl, dc, C.BLACK, 17, () => app.send(P.dock === 2 ? CMD.UNDOCK : CMD.DOCK));
    if (db < 6000 && !P.dock) g.textFit(wx, y0 + 372, `${st.n.short || 'STATION'} ${fmtDist(db)} - DOCK < 1.8k, < 25 KM/S, SHIELDS DOWN`, 11, C.GREY_TXT, 'left', ww);
    if (P.jumpTo !== K.NO_ID) g.text(L.bx + 2, L.by + 76, P.jumping > 0 ? 'IN THE JUMP LANE' : `JUMP CHARGING ${Math.round(P.jumpCharge * 100)}%`, 13, flash(400) ? C.WHITE : C.SKY);
  },
};

// ============================================================================ NAV
// SYSTEM: the whole star system with orbits.  LOCAL: 20k around the ship.
// GALAXY: the jump chart - pick a neighbouring system and JUMP.
function routeTo(w, from, to) { // shortest lane route through known systems
  const known = galaxyKnown(w), prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const a = q.shift();
    if (a === to) break;
    for (const b of lanesOf(a)) if (known[b] && !prev.has(b)) { prev.set(b, a); q.push(b); }
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let n = to; n !== -1; n = prev.get(n)) path.unshift(n);
  return path;
}
export function nearestStation(w, dockable = true) {
  let best = null, bd = 1e12;
  for (const n of w.npc) {
    if (!n.alive || n.type !== K.CT_STARBASE) continue;
    if (dockable && (n.faction === K.F_HOSTILE || n.kind === SK_RELAY || n.kind === SK_MONOLITH)) continue;
    const d = distTo(w.P.x, w.P.y, n.x, n.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best ? { n: best, d: bd } : null;
}
export const nav = {
  zoom: 0, gsel: -1,
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, ox = L.bx, oy = L.by;
    if (this.gsel < 0 || this.gsel >= SYSTEMS.length) this.gsel = lanesOf(w.sysIdx)[0] ?? 0;
    if (P.jumpTo !== K.NO_ID) this.gsel = P.jumpTo;
    let k = 1, x0 = 0, y0 = 0;
    g.clip(ox, oy, B, B);
    if (this.zoom === 2) {
      g.rect(ox, oy, B, B, '#04060e');
      drawGalaxy(g, w, ox + 6, oy + 18, B - 12, B - 30, { sel: this.gsel, onPick: (i) => { this.gsel = i; app.sound.toggle(); } });
      g.text(ox + 4, oy + 2, 'GALAXY CHART - JUMP LANES', 11, C.GREY_TXT);
    } else {
      if (this.zoom === 0) k = B / SYS_SIZE; else { k = B / 20000; x0 = P.x - 10000; y0 = P.y - 10000; }
      const p2 = (wx, wy) => [ox + (wx - x0) * k, oy + (wy - y0) * k];
      const gs = this.zoom ? 2000 : SYS_SIZE / 10;
      for (let gx = Math.floor(x0 / gs) * gs; gx < x0 + B / k; gx += gs) g.rect(p2(gx, 0)[0], oy, 1, B, '#121832');
      for (let gy = Math.floor(y0 / gs) * gs; gy < y0 + B / k; gy += gs) g.rect(ox, p2(0, gy)[1], B, 1, '#121832');
      if (!this.zoom) for (let i = 0; i < 10; i++) {
        g.text(ox + i * B / 10 + B / 20, oy + 2, String.fromCharCode(65 + i), 11, C.GRID, 'center');
        g.text(ox + 3, oy + i * B / 10 + B / 20 - 6, String(i + 1), 11, C.GRID);
      }
      drawSystemLayer(g, w.sys, w.tSec, p2, k, { minR: this.zoom ? 3 : 2.5, well: true, dots: this.zoom ? 1 : 0.7 });
      for (const m of w.M.mk) { const [sx, sy] = p2(m.x, m.y); drawMarker(g, sx, sy, m.kind, m.r * k, 11); }
      const pt = (w.slow && w.slow.ptrail) || [];
      for (let i = 0; i < pt.length; i += 2) { const [sx, sy] = p2(pt[i], pt[i + 1]); g.rect(sx, sy, 1.5, 1.5, C.SKY); }
      const [px, py] = p2(P.x, P.y);
      if (P.wpValid) {
        const [sx, sy] = p2(P.wpx, P.wpy);
        g.line(px, py, sx, sy, '#50468c', 1);
        g.strokeRect(sx - 5, sy - 5, 11, 11, C.VIOLET, 1.5);
        g.strokeRect(sx - 2, sy - 2, 5, 5, C.VIOLET, 1);
      }
      for (const c of w.contacts()) {
        if (!c.alive) continue;
        const [sx, sy] = p2(c.x, c.y);
        const col = factionColor(c.faction);
        if (c.type === K.CT_STARBASE) drawStation(g, c.kind ?? 0, sx, sy, this.zoom ? 0.3 : 0.13, w.now, c.civ);
        else g.circle(sx, sy, 3.5, col);
        g.text(sx + 8, sy + 3, w.shortName(c.id, c.known), 11, col);
      }
      drawShip(g, ART_CRUISER, C.SKY, px, py, this.zoom ? 0.18 : 0.12, P.hdg);
      g.text(ox + B - 4, oy + B - 15, 'TAP MAP = SET WAYPOINT', 11, C.GREY_TXT, 'right');
      g.hit(ox, oy, B, B, { down: (x, y) => { app.sound.toggle(); app.send(CMD.WAYPOINT, 1, 0, Math.round(x0 + (x - ox) / k), Math.round(y0 + (y - oy) / k)); } });
    }
    g.unclip();
    g.strokeRect(ox, oy, B, B, C.GRID);
    // under
    const bw = (L.uw - 18) / 4;
    ['SYSTEM', 'LOCAL 20K', 'GALAXY'].forEach((l, i) =>
      g.button('z' + i, L.ux + i * (bw + 6), L.uy, bw, L.uh, l, this.zoom === i ? C.VIOLET : C.GREY, C.BLACK, 17, () => { this.zoom = i; }));
    g.button('cwp', L.ux + 3 * (bw + 6), L.uy, bw, L.uh, 'CLEAR WP', C.RED_DIM, C.PEACH, 17, () => app.send(CMD.WAYPOINT, 0));
    if (this.zoom === 2) { this.jumpPanel(g, w, app, L); return; }
    // right column
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    g.header(x, y, rw, 'WAYPOINT - ' + w.sys.name, C.VIOLET);
    y += 24;
    if (P.wpValid) {
      const d = distTo(P.x, P.y, P.wpx, P.wpy);
      g.text(x, y, `SECTOR ${sectorName(P.wpx, P.wpy)}   BRG ${pad3(bearingTo(P.x, P.y, P.wpx, P.wpy))}   ${fmtDist(d)}`, 17, C.PEACH);
      const sp = Math.abs(P.speed);
      g.text(x, y + 22, sp > 5 ? `ETA ${mmss(d / sp)} AT CURRENT SPEED` : 'ETA -- (NOT MOVING)', 12, C.GREY_TXT);
      if (d > 15000 && !P.warping) g.text(x + rw, y + 22, 'LONG HAUL - CONSIDER WARP', 12, C.SKY, 'right');
    } else {
      g.text(x, y, 'NO WAYPOINT', 17, C.GREY_TXT);
      g.text(x, y + 22, 'TAP THE MAP OR A QUICK WAYPOINT', 12, C.GREY_TXT);
    }
    y += 42;
    const ap = P.autopilot === K.AP_WAYPOINT;
    g.button('course', x, y, rw, 38, ap ? 'AUTOPILOT ENGAGED' : 'SET COURSE', ap ? C.VIOLET : P.wpValid ? C.ORANGE : C.GREY, C.BLACK, 19,
      () => app.send(CMD.AUTOPILOT, ap ? K.AP_OFF : K.AP_WAYPOINT));
    y += 46;
    g.text(x, y, 'QUICK WAYPOINTS', 12, C.GREY_TXT);
    y += 16;
    const qn = ['NEAREST STATION', 'MISSION TARGET', 'LEAVE STAR WELL'], qw = (rw - 12) / 3;
    qn.forEach((n, i) => g.button('q' + i, x + i * (qw + 6), y, qw, 32, n, C.LILAC, C.BLACK, 13, () => {
      let qx, qy;
      if (i === 0) { const st = nearestStation(w, false); if (!st) { app.sound.denied(); return; } qx = st.n.x; qy = st.n.y + 1200; }
      else if (i === 1) { const m = w.M.mk[0]; if (!m) { app.sound.denied(); return; } qx = m.x; qy = m.y; }
      else {
        const a = Math.atan2(P.y - SYS_C, P.x - SYS_C), d = Math.max(WELL_R + 5000, distTo(P.x, P.y, SYS_C, SYS_C));
        qx = SYS_C + Math.cos(a) * d; qy = SYS_C + Math.sin(a) * d;
      }
      app.send(CMD.WAYPOINT, 1, 0, Math.round(qx), Math.round(qy));
    }, { sound: 'toggle' }));
    y += 40;
    g.header(x, y, rw, 'CONTACTS', C.VIOLET);
    y += 24;
    const list = w.contacts().filter((c) => c.alive).sort((a, b) => w.range(a) - w.range(b)).slice(0, 4);
    if (!list.length) g.text(x, y + 4, 'NOTHING ON SENSORS', 12, C.GREY_TXT);
    const bw2 = Math.min(92, (rw - 120) / 2);
    for (const c of list) {
      if (y > L.y1 - 80) break;
      const col = factionColor(c.faction);
      g.textFit(x, y + 2, w.shortName(c.id, c.known), 15, col, 'left', rw - 2 * bw2 - 16);
      g.text(x, y + 19, `${fmtDist(w.range(c))}  BRG ${pad3(w.bearing(c))}`, 11, C.GREY_TXT);
      const ic = P.autopilot === K.AP_TARGET && P.apTarget === c.id;
      g.button('ic' + c.id, x + rw - 2 * bw2 - 6, y + 1, bw2, 30, ic ? 'INTERCEPTING' : 'INTERCEPT', ic ? C.VIOLET : C.LILAC, C.BLACK, 14,
        () => app.send(CMD.AUTOPILOT, ic ? K.AP_OFF : K.AP_TARGET, c.id));
      g.button('fc' + c.id, x + rw - bw2, y + 1, bw2, 30, 'FACE', C.TAN, C.BLACK, 14, () => app.send(CMD.HEADING, 0, 0, Math.round(w.bearing(c))));
      y += 36;
    }
    y = Math.max(y, L.y1 - 46);
    g.text(x, y, 'OBJECTIVE:', 12, C.ORANGE);
    g.wrap(x, y + 14, rw, w.M.objective, 12, C.PEACH, 1.2, 2);
  },
  jumpPanel(g, w, app, L) {
    const P = w.P, x = L.rx, rw = L.rw, cur = w.sysIdx, sel = this.gsel, S = sysAt(sel);
    const visited = new Set((w.slow && w.slow.visited) || [cur]);
    let y = L.y0;
    g.header(x, y, rw, 'JUMP DRIVE', C.SKY);
    y += 26;
    g.textFit(x, y, S.name, 22, sel === cur ? C.SKY : C.PEACH, 'left', rw, true);
    g.text(x + rw, y + 6, S.star.type, 12, C.GREY_TXT, 'right');
    y += 28;
    y = g.wrap(x, y, rw, visited.has(sel) ? S.desc : 'UNCHARTED - NO DETAILED SURVEY ON FILE. ' + S.desc, 12, C.GREY_TXT, 1.2, 3) + 4;
    if (visited.has(sel) && S.stations.length)
      y = g.wrap(x, y, rw, 'STATIONS: ' + S.stations.map((s) => `${s.name} (${CIV_NAME[s.civ] || 'UNKNOWN'})`).join(', '), 12, C.TAN, 1.2, 2) + 4;
    y += 4;
    // status line + the big button
    let why = '', ready = false;
    const lanes = lanesOf(cur);
    if (sel === cur) why = 'WE ARE IN THIS SYSTEM.';
    else if (!lanes.includes(sel)) {
      const r = routeTo(w, cur, sel);
      why = r ? 'NO DIRECT LANE. ROUTE: ' + r.map((i) => sysAt(i).name).join(' > ') : 'NO KNOWN ROUTE.';
    } else {
      why = (w.slow && w.slow.jumpWhy && w.slow.jumpWhy[sel]) || '';
      ready = !why;
      if (ready) why = `LANE OPEN - ${K.JUMP_CHARGE_S}s CHARGE, ${K.JUMP_COST} ENERGY.`;
    }
    const by = L.y1 - 44;
    if (P.jumping > 0) {
      g.text(x, by - 40, `IN THE JUMP LANE - ARRIVING IN ${Math.ceil(P.jumping)}s`, 15, flash(400) ? C.WHITE : C.SKY);
      g.progress(x, by - 18, rw, 10, 1 - P.jumping / K.JUMP_TRANSIT_S, C.SKY);
      g.button('jump', x, by, rw, 42, 'JUMPING...', C.GREY, C.GREY_TXT, 20, () => {}, { silent: true });
      return;
    }
    if (P.jumpTo !== K.NO_ID) {
      g.text(x, by - 40, `CHARGING FOR ${sysAt(P.jumpTo).name}  ${Math.round(P.jumpCharge * 100)}%`, 15, C.YELLOW);
      g.progress(x, by - 18, rw, 10, P.jumpCharge, C.YELLOW);
      g.button('jump', x, by, rw, 42, 'ABORT JUMP', C.RED, C.BLACK, 20, () => app.send(CMD.JUMP, K.NO_ID));
      return;
    }
    // neighbours as quick picks
    g.text(x, y, 'LANES FROM ' + w.sys.name, 12, C.GREY_TXT);
    y += 16;
    const known = galaxyKnown(w), nb = lanes.filter((i) => known[i]);
    const lw = (rw - 6 * (nb.length - 1)) / Math.max(1, nb.length);
    nb.forEach((i, n) => g.button('ln' + i, x + n * (lw + 6), y, lw, 30, sysAt(i).name, sel === i ? C.SKY : C.GREY, sel === i ? C.BLACK : C.GREY_TXT, 12,
      () => { this.gsel = i; }, { sound: 'toggle' }));
    g.wrap(x, by - 36, rw, why, 12, ready ? C.GREEN : sel === cur ? C.SKY : C.YELLOW, 1.2, 2);
    g.button('jump', x, by, rw, 42, ready ? 'ENGAGE JUMP DRIVE' : 'JUMP UNAVAILABLE', ready ? C.ORANGE : C.GREY, ready ? C.BLACK : C.GREY_TXT, 20,
      () => { if (ready) app.send(CMD.JUMP, sel); else app.sound.denied(); }, { silent: !ready, bold: true });
  },
};

// ============================================================================ SCIENCE
const SCI_RANGE = [5000, 10000, 20000, 40000];
export const science = {
  sel: K.NO_ID, rangeI: 1,
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, cx = L.bx + B / 2, cy = L.by + B / 2, R = B / 2 - 4;
    if (this.sel !== K.NO_ID && !w.findC(this.sel)) this.sel = K.NO_ID;
    drawRadar(g, w, cx, cy, R, SCI_RANGE[this.rangeI], false, this.sel, true);
    g.text(L.bx, L.by, 'N ^  SENSOR SWEEP', 12, C.GREY_TXT);
    if (P.lrs > 0) g.text(L.bx + B, L.by, `LONG RANGE SCAN ${Math.ceil(P.lrs)}s`, 12, C.YELLOW, 'right');
    if (w.inNebula) g.text(L.bx, L.by + B - 14, 'IN NEBULA - SENSOR RANGE REDUCED', 12, C.LILAC);
    g.hitCircle(cx, cy, R, { down: (x, y) => {
      const id = radarPick(w, x, y, cx, cy, R, SCI_RANGE[this.rangeI], false);
      if (id !== K.NO_ID) { this.sel = id; app.sound.toggle(); }
    } });
    const rl = ['5K', '10K', '20K', '40K'], bw = (L.uw - 30) / 5;
    rl.forEach((l, i) => g.button('sr' + i, L.ux + i * (bw + 6), L.uy, bw, L.uh, l, this.rangeI === i ? C.SKY : C.GREY, C.BLACK, 17, () => { this.rangeI = i; }));
    g.button('lrs', L.ux + 4 * (bw + 6), L.uy, bw, L.uh, 'LRS', P.lrs > 0 ? C.YELLOW : C.LILAC, C.BLACK, 17, () => app.send(CMD.LRS));
    // detail
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    const c = w.findC(this.sel);
    if (!c) {
      g.text(x, y + 4, 'NO CONTACT SELECTED', 19, C.GREY_TXT);
      y = g.wrap(x, y + 34, rw, 'TAP A CONTACT ON THE SENSOR DISPLAY TO SELECT IT. SCAN ONCE TO IDENTIFY IT, TWICE FOR A FULL ANALYSIS (SHIELDS, SYSTEMS, SHIELD FREQUENCY).', 13, C.GREY_TXT);
      y = g.wrap(x, y + 10, rw, 'LONG RANGE SCAN (LRS) TRIPLES SENSOR RANGE FOR 10 SECONDS AND COSTS 60 ENERGY.', 13, C.GREY_TXT);
      const list = w.contacts().filter((cc) => cc.alive && cc.id !== K.ID_BASE).sort((a, b) => w.range(a) - w.range(b)).slice(0, 4);
      y += 12;
      for (const cc of list) {
        g.button('pick' + cc.id, x, y, rw, 30, `${w.shortName(cc.id, cc.known)}  ${fmtDist(w.range(cc))}`, C.GREY, factionColor(cc.faction), 15, () => { this.sel = cc.id; });
        y += 36;
      }
      return;
    }
    g.textFit(x, y, w.shortName(c.id, c.known), 22, factionColor(c.faction), 'left', rw);
    g.text(x, y + 26, w.contactName(c.id, c.known), 13, C.PEACH);
    g.text(x, y + 42, `${c.known ? K.CT_NAME[c.type] : 'UNKNOWN'} / ${K.FACTION_NAME[c.faction]}`, 12, C.GREY_TXT);
    g.text(x, y + 60, `RANGE ${fmtDist(w.range(c))}  BRG ${pad3(w.bearing(c))}  HDG ${pad3(c.hdg)}  SPD ${Math.round(c.speed)}`, 15, C.SKY);
    const lvl = c.scan >= 2 ? 2 : c.scan;
    g.text(x, y + 84, 'SCAN LEVEL: ' + ['NOT SCANNED', 'IDENTIFIED', 'FULL SCAN'][lvl], 17, lvl === 2 ? C.GREEN : C.YELLOW);
    const scanning = P.scanId === c.id;
    g.progress(x, y + 106, rw, 10, scanning ? P.scanProg : lvl / 2, scanning ? C.YELLOW : C.GREEN);
    g.button('scan', x, y + 122, rw, 38, scanning ? 'SCANNING...' : lvl === 0 ? 'SCAN (IDENTIFY)' : lvl === 1 ? 'SCAN (FULL)' : 'SCAN COMPLETE',
      scanning ? C.YELLOW : lvl < 2 ? C.SKY : C.GREY, C.BLACK, 19, () => app.send(CMD.SCAN, c.id));
    y += 170;
    if (lvl === 2 && c.type !== K.CT_ANOMALY && c.type !== K.CT_STARBASE && c.type !== K.CT_BUOY) {
      const rows = [['HULL', c.hull, healthColor(c.hull)], ['SHIELDS', c.shields, C.SKY], ['ENGINES', c.eng, healthColor(c.eng)],
        ['WEAPONS', c.wpn, healthColor(c.wpn)], ['SHLD GEN', c.sgen, healthColor(c.sgen)]];
      for (const [n, v, col] of rows) {
        g.text(x, y, n, 12, C.PEACH);
        g.bar(x + 70, y + 2, rw - 120, 9, v, col);
        g.text(x + rw, y, Math.round(v) + '%', 12, C.PEACH, 'right');
        y += 16;
      }
      g.text(x, y + 4, 'SHIELD FREQUENCY: ' + K.FREQ_CHAR[c.freq], 17, C.GREEN);
      g.text(x + rw, y + 8, 'TELL TACTICAL: MATCHED PHASERS +50%', 11, C.GREY_TXT, 'right');
    } else if (lvl === 2 && c.type === K.CT_ANOMALY) g.wrap(x, y, rw, 'TETRYON EMISSIONS AND AN UNSTABLE SUBSPACE FOLD. DATA TRANSMITTED TO FLEET COMMAND.', 13, C.LILAC);
    else if (c.type === K.CT_STARBASE) g.wrap(x, y, rw, `${SK_NAME[c.kind ?? 0]}${CIV_NAME[c.civ] ? ' (' + CIV_NAME[c.civ] + ')' : ''}. ` +
      (c.faction === K.F_HOSTILE ? 'HOSTILE - KEEP CLEAR OF ITS GUNS.' : c.kind === SK_RELAY || c.kind === SK_MONOLITH ? 'NO DOCKING FACILITIES.' : 'DOCK HERE FOR REPAIRS, ENERGY AND TORPEDOES.'), 13, factionColor(c.faction));
    else g.wrap(x, y, rw, 'FULL SCAN NEEDED FOR SHIELDS, HULL, SYSTEMS AND SHIELD FREQUENCY.', 13, C.GREY_TXT);
    const by = L.y1 - 38;
    g.text(x, by - 18, `SENSORS ${Math.round(P.health[K.S_SENSORS])}% HEALTH, ${P.power[K.S_SENSORS]}% POWER`, 12, P.health[K.S_SENSORS] < 50 ? C.RED : C.GREY_TXT);
    const hw = (rw - 6) / 2;
    g.button('sview', x, by, hw, 36, 'ON VIEWER', C.ORANGE, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_TARGET, c.id));
    const ic = P.autopilot === K.AP_TARGET && P.apTarget === c.id;
    g.button('sint', x + hw + 6, by, hw, 36, ic ? 'INTERCEPTING' : 'INTERCEPT', ic ? C.VIOLET : C.LILAC, C.BLACK, 17,
      () => app.send(CMD.AUTOPILOT, ic ? K.AP_OFF : K.AP_TARGET, c.id));
  },
};

// ============================================================================ COMMS
export function commsOptMsg(msgs) { // newest message that offers replies
  for (let i = 0; i < msgs.length && i < 3; i++) if (msgs[i].opt.length && msgs[i].from < K.MAX_CONTACTS) return msgs[i];
  return null;
}
export function drawMsgLog(g, w, x, y, wd, y1, size = 13) {
  g.header(x, y, wd, 'MESSAGE LOG', C.LILAC);
  y += 26;
  const msgs = w.msgs;
  if (!msgs.length) g.text(x, y + 4, 'NO MESSAGES YET', 12, C.GREY_TXT);
  for (let i = 0; i < msgs.length && y < y1 - size; i++) {
    const m = msgs[i];
    const col = i === 0 ? K.MSG_COL[m.col % 4] : dim(K.MSG_COL[m.col % 4], 0.7);
    g.text(x, y, fromName(w, m.from), 12, i === 0 ? C.ORANGE : C.TAN);
    const lines = g.wrapLines(m.text, wd - 8, size);
    y += 14;
    for (const l of lines) { if (y > y1 - size) break; g.text(x + 6, y, l, size, col); y += size * 1.2; }
    y += 5;
  }
}
export const comms = {
  sel: K.NO_ID,
  draw(g, w, app, L) {
    drawMsgLog(g, w, L.bx, L.by, L.BIG, L.y1);
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    g.header(x, y, rw, 'HAIL', C.LILAC);
    y += 24;
    const list = w.contacts().filter((c) => c.alive).slice(0, 5);
    if (this.sel !== K.NO_ID && !list.some((c) => c.id === this.sel)) this.sel = K.NO_ID;
    if (!list.length) g.text(x, y + 4, 'NO CONTACTS IN RANGE', 12, C.GREY_TXT);
    for (const c of list) {
      const sel = this.sel === c.id;
      g.button('hail' + c.id, x, y, rw, 28, `${w.shortName(c.id, c.known)}  ${fmtDist(w.range(c))}`, sel ? factionColor(c.faction) : C.GREY, sel ? C.BLACK : C.GREY_TXT, 16,
        () => { this.sel = c.id; }, { sound: 'toggle' });
      y += 32;
    }
    y = Math.max(y, L.y0 + 24 + 5 * 32) + 4;
    g.button('open', x, y, rw, 36, 'OPEN CHANNEL', this.sel !== K.NO_ID ? C.ORANGE : C.GREY, C.BLACK, 19, () => { if (this.sel !== K.NO_ID) app.send(CMD.HAIL, this.sel); });
    y += 46;
    g.text(x, y, 'REPLY OPTIONS', 12, C.GREY_TXT);
    y += 16;
    const m = commsOptMsg(w.msgs);
    if (m) m.opt.forEach((o, i) => { g.button('opt' + i, x, y, rw, 28, K.OPT_NAME[o], C.PEACH, C.BLACK, 16, () => app.send(CMD.REPLY, m.from, o)); y += 32; });
    else g.text(x, y + 4, '(NONE - HAIL SOMEONE FIRST)', 12, C.GREY_TXT);
    g.button('cview', x, L.y1 - 36, rw, 34, 'PUT ON VIEWER', w.view === K.VM_COMMS ? C.ORANGE : C.LILAC, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_COMMS, K.NO_ID));
  },
};
