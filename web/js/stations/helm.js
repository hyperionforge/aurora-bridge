// stations/helm.js - HELM, NAV, SCIENCE and COMMS sub-stations (port of helm.h)
import * as K from '../config.js';
import { C, CMD } from '../config.js';
import { DEG, wrap360, distTo, bearingTo, fmtDist, pad3, sectorName, clampf, angDiff, mmss, warpTxt } from '../util.js';
import { dim, flash, healthColor } from '../gfx.js';
import { drawShip, drawMarker, drawContact, factionColor, ART_CRUISER } from '../ships.js';
import { drawPulsarMap } from '../pulsar.js';
import { drawSystemLayer, drawGalaxy, drawStation, drawPoi, galaxyKnown, drawCampLines, drawEdgeFrame, drawOobBanner, drawBubble, bodies } from '../sysdraw.js';
import * as O from '../orbit.js';
import { drawLab, isRare } from '../lab.js';
import { drawPuzzle, hasPuz, puzKind, PZ_NAME } from '../puzzles.js';
import { CHARS, subtitle, speakerLine, callerInfo } from '../dialogue.js';
import { drawPortrait } from '../portraits.js';
import { ART, POI_TIP, POI_NAME, RES_SHORT, hazWord, SAMPLE_R, EXTRACT_R, ANALYSE_COST, DEEP_COST } from '../cargo.js';
import { SYSTEMS, SYS_SIZE, SYS_C, WELL_R, sysAt, lanesOf, planetPos, CIV_NAME, CIV_COL, SK_NAME, SK_RELAY, SK_MONOLITH } from '../galaxy.js';
import { drawRadar, radarPick, drawShipShields } from './common.js';

export function fromName(w, from) {
  if (from === K.FROM_COMMAND) return 'FLEET COMMAND';
  if (from === K.FROM_COMPUTER) return 'COMPUTER';
  if (from === K.FROM_CREW) return 'BRIDGE';
  return w.shortName(from);
}

// ============================================================================ HELM
// One screen: the compass ring (drag to steer) with a local scope inside it so helm can see what's
// around without the main viewer; the engines (sliders + preset speeds) and the autopilot / jump drive.
const CYAN = '#78f0ff';
const SCOPE_R = [2000, 5000], SCOPE_L = ['4K', '10K']; // radius in metres; the label is the width across
const IMP_PRE = [['FULL', 100], ['3/4', 75], ['1/2', 50], ['1/4', 25], ['STOP', 0], ['-1/4', -25]];
const WARP_PRE = [6, 5, 4, 3, 2, 1, 0];
// will we hit something solid on our present track in the next `secs` seconds? -> {name, t} or null
function collisionAhead(w, secs = 15) {
  const P = w.P, vx = P.vx || 0, vy = P.vy || 0, v = Math.hypot(vx, vy);
  if (v < 5 || P.warping || P.dock) return null;
  let best = null;
  const obs = bodies(w.sys, w.tSec).map((b) => ({ x: b.x, y: b.y, r: b.r * (b.star ? 1.4 : O.SURFACE_K), name: b.name }));
  const pul = w.M.pul;
  if (pul) for (const r of pul.rocks || []) obs.push({ x: r.x, y: r.y, r: r.r + 250, name: 'ASTEROID' });
  for (const o of obs) { // ray / circle
    const fx = P.x - o.x, fy = P.y - o.y, a = v * v, b = 2 * (fx * vx + fy * vy), c = fx * fx + fy * fy - o.r * o.r, disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t > 0 && t < secs && (!best || t < best.t)) best = { name: o.name, t };
  }
  return best;
}
export const helm = {
  dialDrag: false, localHdg: 0, thrDrag: false, localThr: 0, warpDrag: false, localWarp: 0, lastSend: 0, scopeI: 1,
  draw(g, w, app, L) {
    const P = w.P, S = this;
    // ---- compass ring around a local scope
    const cx = L.bx + L.BIG / 2, cy = L.by + L.BIG / 2, R = L.BIG / 2 - 6, Rs = R - 34;
    const des = S.dialDrag ? S.localHdg : P.desHdg;
    this.drawScope(g, w, cx, cy, Rs, SCOPE_R[S.scopeI]);
    g.circle(cx, cy, R, C.GRID, false, 1.5);
    g.circle(cx, cy, Rs, C.GRID, false, 1);
    for (let a = 0; a < 360; a += 5) {
      const r = a * DEG, l = a % 30 === 0 ? 14 : a % 10 === 0 ? 8 : 4;
      g.line(cx + Math.sin(r) * (R - l), cy - Math.cos(r) * (R - l), cx + Math.sin(r) * R, cy - Math.cos(r) * R, a % 30 ? C.BLUE : C.SKY, 1.5);
      if (a % 30 === 0) g.text(cx + Math.sin(r) * (R - 25), cy - Math.cos(r) * (R - 25) - 7, pad3(a), 12, C.PEACH, 'center');
    }
    const onRing = (b, rr) => [cx + Math.sin(b * DEG) * rr, cy - Math.cos(b * DEG) * rr];
    if (P.wpValid) { const [qx, qy] = onRing(bearingTo(P.x, P.y, P.wpx, P.wpy), R - 42); g.rect(qx - 5, qy - 5, 10, 10, C.VIOLET); }
    const t = w.findC(P.target);
    if (t) { const [qx, qy] = onRing(w.bearing(t), R - 42); g.circle(qx, qy, 6, C.RED); }
    if (P.jumpVec >= 0) { // the jump vector: a cyan diamond on the ring
      const [jx, jy] = onRing(P.jumpVec, R - 42), k = flash(300) ? 9 : 7;
      g.tri(jx, jy - k, jx + k, jy, jx, jy + k, CYAN); g.tri(jx, jy - k, jx - k, jy, jx, jy + k, CYAN);
    }
    const dr = des * DEG;
    g.tri(cx + Math.sin(dr) * (R + 1), cy - Math.cos(dr) * (R + 1), cx + Math.sin(dr - 0.07) * (R - 22), cy - Math.cos(dr - 0.07) * (R - 22),
      cx + Math.sin(dr + 0.07) * (R - 22), cy - Math.cos(dr + 0.07) * (R - 22), P.autopilot ? C.VIOLET : C.WHITE);
    const hr = P.hdg * DEG;
    g.line(cx + Math.sin(hr) * (Rs * 0.25), cy - Math.cos(hr) * (Rs * 0.25), cx + Math.sin(hr) * (Rs + 2), cy - Math.cos(hr) * (Rs + 2), C.ORANGE, 2);
    // where we're really going: with momentum the track can differ from the heading
    const vs = Math.hypot(P.vx || 0, P.vy || 0), trk = vs > 2 ? (Math.atan2(P.vx, -P.vy) / DEG + 360) % 360 : null;
    if (trk !== null && !P.warping) {
      const [tx, ty] = onRing(trk, R - 44);
      g.circle(tx, ty, 9, CYAN, false, 2); g.circle(tx, ty, 2.5, CYAN);
      g.line(tx, ty - 9, tx, ty - 15, CYAN, 2); g.line(tx - 9, ty, tx - 15, ty, CYAN, 2); g.line(tx + 9, ty, tx + 15, ty, CYAN, 2);
    }
    g.text(L.bx + 2, L.by, 'HDG ' + pad3(P.hdg), 19, C.ORANGE);
    g.text(L.bx + 2, L.by + 22, 'CRS ' + pad3(des), 19, P.autopilot ? C.VIOLET : C.WHITE);
    if (P.autopilot) g.text(L.bx + 2, L.by + 45, ['', 'AUTOPILOT: COURSE', 'AUTOPILOT: INTERCEPT', P.apPlanet >= 0 ? 'AUTOPILOT: ORBIT' : 'AUTOPILOT: ESCORT', 'AUTOPILOT: DOCKING'][P.autopilot], 12, C.VIOLET);
    else if (P.evasive) g.text(L.bx + 2, L.by + 45, 'EVASIVE MANOEUVRES', 12, flash(400) ? C.YELLOW : C.ORANGE);
    g.text(L.bx + L.BIG - 2, L.by, P.warping ? warpTxt(P) : Math.round(P.speed) + ' KM/S', 19, C.SKY, 'right');
    g.text(L.bx + L.BIG - 2, L.by + 22, 'SECTOR ' + sectorName(P.x, P.y), 13, C.GREY_TXT, 'right');
    if (trk !== null && !P.warping) {
      const drift = Math.abs(angDiff(P.hdg, trk));
      g.text(L.bx + L.BIG - 2, L.by + 38, `TRACK ${pad3(Math.round(trk))}`, 13, CYAN, 'right');
      if (drift > 8 && !P.autoBrake && !P.autopilot) g.text(L.bx + L.BIG - 2, L.by + 54, `DRIFTING ${Math.round(drift)}°`, 11, flash(500) ? C.YELLOW : CYAN, 'right');
    }
    if (w.flux >= 0) g.text(L.bx + L.BIG - 2, L.by + 70, `TACHYON FLUX ${w.flux}%`, 13, w.flux >= 85 ? C.GREEN : C.YELLOW, 'right');
    // dangers ahead: a collision on the present track, the autopilot steering round something
    const hit = collisionAhead(w);
    if (hit) g.textFit(cx, cy + Rs * 0.55, `COLLISION WARNING: ${hit.name} IN ${Math.ceil(hit.t)}s`, 14, flash(250) ? C.RED : C.YELLOW, 'center', Rs * 1.6, true);
    else if (P.apAvoid) g.textFit(cx, cy + Rs * 0.55, `AUTOPILOT STEERING ROUND ${P.apAvoid}`, 12, C.YELLOW, 'center', Rs * 1.6);
    if (P.jumpTo !== K.NO_ID) g.text(L.bx + 2, L.by + L.BIG - 30, P.jumping > 0 ? 'IN THE JUMP LANE' : `JUMP CHARGING ${Math.round(P.jumpCharge * 100)}%`, 13, flash(400) ? C.WHITE : C.SKY);
    this.drawOrbit(g, w, L);
    const angAt = (x, y) => wrap360(Math.atan2(x - cx, -(y - cy)) / DEG);
    // tap or drag anywhere in the circle - ring or scope - to set the course
    g.hitCircle(cx, cy, R + 14, {
      down: (x, y) => { if ((x - cx) ** 2 + (y - cy) ** 2 < 14 * 14) return; S.dialDrag = true; S.localHdg = angAt(x, y); app.sound.tap(); },
      move: (x, y) => {
        if (!S.dialDrag) return;
        if ((x - cx) ** 2 + (y - cy) ** 2 > 20 * 20) S.localHdg = angAt(x, y);
        if (performance.now() - S.lastSend > 150) { S.lastSend = performance.now(); app.send(CMD.HEADING, 0, 0, Math.round(S.localHdg)); }
      },
      up: () => { if (S.dialDrag) app.send(CMD.HEADING, 0, 0, Math.round(S.localHdg)); S.dialDrag = false; },
    });
    drawOobBanner(g, { x: L.bx, y: L.by + L.BIG - 36, w: L.BIG, h: 36 }, P.oobT);
    // ---- under the compass: nudges and the scope's range
    const nl = ['<<10', '<1', '1>', '10>>'], nv = [-10, -1, 1, 10], nw = (L.uw - 30) / 6;
    nl.forEach((l, i) => g.button('nud' + i, L.ux + i * (nw + 6), L.uy, nw, L.uh, l, C.LILAC, C.BLACK, 16, () => {
      const base = P.autopilot ? P.hdg : P.desHdg;
      app.send(CMD.HEADING, 0, 0, Math.round(wrap360(base + nv[i])));
    }));
    g.button('scope', L.ux + 4 * (nw + 6), L.uy, nw * 2 + 6, L.uh, `SCOPE ${SCOPE_L[S.scopeI]}`, '#3c6e78', C.BLACK, 16, () => { S.scopeI = (S.scopeI + 1) % SCOPE_R.length; }, { sound: 'toggle' });
    this.drawEngines(g, w, app, L);
    this.drawAuto(g, w, app, L);
  },
  // the local scope: north up like the compass, everything solid drawn to scale
  drawScope(g, w, cx, cy, Rs, range) {
    const P = w.P, k = Rs / range, c = g.ctx;
    const p2 = (x, y) => [cx + (x - P.x) * k, cy + (y - P.y) * k];
    c.save(); c.beginPath(); c.arc(cx, cy, Rs, 0, Math.PI * 2); c.clip();
    g.circle(cx, cy, Rs, '#03060e');
    drawSystemLayer(g, w.sys, w.tSec, p2, k, { minR: 2.5, well: false, dots: 0.6, orbits: false, labels: true, labelSize: 10 });
    drawPulsarMap(g, w, p2, k);
    drawEdgeFrame(g, p2, { x: cx - Rs, y: cy - Rs, w: 2 * Rs, h: 2 * Rs });
    g.circle(cx, cy, Rs / 2, '#14203a', false, 1);
    g.text(cx + Rs / 2 * 0.71 + 2, cy + Rs / 2 * 0.71, fmtDist(range / 2), 10, '#2a3a60');
    // NAV's course
    const route = P.route && P.route.length ? P.route : P.wpValid ? [[P.wpx, P.wpy]] : [];
    if (route.length) {
      c.save(); c.setLineDash([5, 4]);
      let [ax, ay] = [cx, cy];
      route.forEach(([x, y], i) => { const [bx, by] = p2(x, y); g.line(ax, ay, bx, by, P.autopilot === K.AP_WAYPOINT ? C.VIOLET : '#50468c', 1.5); [ax, ay] = [bx, by]; g.strokeRect(bx - 4, by - 4, 9, 9, C.VIOLET, 1.5); if (route.length > 1) g.text(bx + 6, by - 6, String(i + 1), 10, C.VIOLET); });
      c.restore();
    }
    for (const n of w.contacts()) {
      if (!n.alive) continue;
      const [sx, sy] = p2(n.x, n.y);
      if ((sx - cx) ** 2 + (sy - cy) ** 2 > (Rs + 10) ** 2) continue;
      const col = factionColor(n.faction);
      if (n.type === K.CT_STARBASE) drawStation(g, n.kind ?? 0, sx, sy, Math.max(0.08, Math.min(0.3, 1100 * k / 60)), w.now, n.civ);
      else if (n.type === K.CT_POI) drawPoi(g, n.kind ?? 0, sx, sy, 0.1, w.now, (n.civ ?? 0) * 0.7);
      else if (n.type === K.CT_GROUND) g.circle(sx, sy, 2.5, '#a0c8b4');
      else { const h = n.hdg * DEG; g.tri(sx + Math.sin(h) * 6, sy - Math.cos(h) * 6, sx + Math.sin(h + 2.5) * 4, sy - Math.cos(h + 2.5) * 4, sx + Math.sin(h - 2.5) * 4, sy - Math.cos(h - 2.5) * 4, col); }
      g.text(sx + 6, sy + 2, w.shortName(n.id, n.known), 10, dim(col, 0.9));
    }
    for (const tp of w.torp) { const [sx, sy] = p2(tp.x, tp.y); g.circle(sx, sy, 2, tp.owner === K.US ? C.ORANGE : C.GREEN); }
    // our track for the next 20 seconds
    if (!P.warping && Math.hypot(P.vx || 0, P.vy || 0) > 2) g.line(cx, cy, cx + (P.vx || 0) * 20 * k, cy + (P.vy || 0) * 20 * k, CYAN, 1.5);
    c.restore();
    // the ship and its shield bubble drawn to the scope's scale (340m long; the bubble 0.6-3k across)
    const ss = (340 * k) / 154;
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, ss, P.hdg);
    drawShipShields(g, w, cx, cy, Math.max(154 * ss * 0.55 + 2, (P.bubR || 600) * k), P.hdg);
  },
  // gravity well readout in the compass corner: what helm needs to get into (and stay in) orbit
  drawOrbit(g, w, L) { // orbit status (the escort autopilot holding us beside a planet)
    const P = w.P, pl = P.apPlanet >= 0 ? w.sys.planets[P.apPlanet] : null;
    if (!pl) return;
    const x = L.bx + 2, y = L.by + 62, inOrbit = P.orbitPl === P.apPlanet;
    g.text(x, y, inOrbit ? `IN ORBIT OF ${pl.name}` : `ORBITING ${pl.name}...`, 12, inOrbit ? C.GREEN : CYAN);
  },
  // ---- the engines: impulse and warp sliders with preset speeds, and the flight buttons
  drawEngines(g, w, app, L) {
    const P = w.P, S = this, x = L.rx, y0 = L.y0, rw = L.x1 - L.rx, narrow = rw < 400;
    const sw = 50, pw1 = narrow ? 44 : 56, pw2 = narrow ? 38 : 46, sh = 170, gap = 8;
    const impCap = Math.max(0, P.impCap ?? K.IMPULSE_MAX), warpCap = Math.max(0, P.warpCap ?? K.WARP_MAX);
    // impulse: the slider is in km/s; it sends the throttle as a share of full impulse
    const spd = S.thrDrag ? S.localThr : Math.max(0, P.throttle) / 100 * K.IMPULSE_TOP;
    g.text(x + (sw + pw1) / 2, y0, 'IMPULSE', 13, C.PEACH, 'center');
    g.capSlider('thr', x, y0 + 18, sw, sh, spd, K.IMPULSE_TOP, impCap, C.ORANGE, 2, (v, final, start, over) => {
      if (start) { S.thrDrag = true; app.sound.tap(); }
      if (Math.floor(v / 20) !== Math.floor(S.localThr / 20)) app.sound.sliderTick();
      S.localThr = v; S.overImp = over ? performance.now() : S.overImp;
      const thr = Math.round(clampf(v / K.IMPULSE_TOP * 100, 0, 100) * 10) / 10;
      if (final) { S.thrDrag = false; app.send(CMD.THROTTLE, 0, 0, thr); }
      else if (performance.now() - S.lastSend > 150) { S.lastSend = performance.now(); app.send(CMD.THROTTLE, 0, 0, thr); }
    }, S.thrDrag, 12);
    // presets: a share of what the engines can give right now - FULL stays full as engineering moves power
    const ph = (sh - 5 * 4) / 6, cur = P.thrFrac;
    IMP_PRE.forEach(([l, v], i) => {
      const on = cur !== null && cur !== undefined && Math.round(cur * 100) === v;
      g.button('ip' + i, x + sw + 4, y0 + 18 + i * (ph + 4), pw1, ph, l, on ? C.ORANGE : v < 0 ? '#5a2828' : '#4a3a24', on ? C.BLACK : v < 0 ? C.PEACH : C.ORANGE, narrow ? 13 : 15,
        () => app.send(CMD.THROTTLE, 1, 0, v), { sound: 'toggle' });
    });
    g.text(x + sw / 2, y0 + sh + 22, P.throttle < 0 ? `-${Math.round(-P.throttle / 100 * K.IMPULSE_TOP)}` : Math.round(spd) + '', 17, P.throttle < 0 ? C.RED : C.PEACH, 'center');
    g.text(x + sw + 4 + pw1 / 2, y0 + sh + 25, `MAX ${Math.round(impCap)}`, 11, C.GREY_TXT, 'center');
    // warp: 0 - 6, the reachable part set by warp power
    const wx = x + sw + 4 + pw1 + gap, wv = S.warpDrag ? S.localWarp : P.warpSet;
    g.text(wx + (sw + pw2) / 2, y0, 'WARP', 13, P.warping ? C.SKY : C.PEACH, 'center');
    g.capSlider('wrp', wx, y0 + 18, sw, sh, wv, K.WARP_TOP, warpCap, P.warping ? C.SKY : C.YELLOW, 0.1, (v, final, start, over) => {
      if (start) { S.warpDrag = true; app.sound.tap(); }
      if (Math.floor(v) !== Math.floor(S.localWarp || 0)) app.sound.sliderTick();
      S.localWarp = v; if (over) S.overWarp = performance.now();
      if (final) { S.warpDrag = false; app.send(CMD.WARP, Math.round(v * 10), 1); }
      else if (performance.now() - S.lastSend > 200) { S.lastSend = performance.now(); app.send(CMD.WARP, Math.round(v * 10), 1); }
    }, S.warpDrag, 12);
    const wh = (sh - 6 * 3) / 7;
    WARP_PRE.forEach((v, i) => {
      const on = Math.abs(P.warpSet - v) < 0.05, reach = v <= warpCap + 1e-6;
      g.button('wp' + i, wx + sw + 4, y0 + 18 + i * (wh + 3), pw2, wh, v ? String(v) : 'IMP', on ? (P.warping || !v ? C.SKY : C.YELLOW) : reach ? '#24384c' : '#1a1a22', on ? C.BLACK : reach ? C.SKY : C.GREY, 14,
        () => app.send(CMD.WARP, v), { sound: 'toggle' });
    });
    g.text(wx + sw / 2, y0 + sh + 22, (Math.round(Math.min(wv, warpCap) * 10) / 10).toFixed(1), 17, P.warping ? C.SKY : C.PEACH, 'center');
    g.text(wx + sw + 4 + pw2 / 2, y0 + sh + 25, `MAX ${warpCap.toFixed(1)}`, 11, C.GREY_TXT, 'center');
    // flight buttons
    const bx = wx + sw + 4 + pw2 + gap, bw = L.x1 - bx;
    let by = y0 + 18;
    g.button('stop', bx, by, bw, 40, P.allStop ? 'BRAKING...' : 'FULL STOP', P.allStop && flash(300) ? C.YELLOW : C.RED, C.BLACK, 19, () => app.send(CMD.STOP), { bold: true }); by += 44;
    // AUTO BRAKE: the flight computer cancels drift and brakes when the throttle is cut. Off = pure momentum.
    g.button('abrk', bx, by, bw, 30, P.autoBrake ? 'AUTO BRAKE: ON' : 'AUTO BRAKE: OFF', P.autoBrake ? CYAN : C.GREY, P.autoBrake ? C.BLACK : C.GREY_TXT, 14,
      () => app.send(CMD.AUTOBRAKE, P.autoBrake ? 0 : 1), { sound: 'toggle' }); by += 34;
    g.button('evade', bx, by, bw, 30, P.evasive ? 'EVASIVE: ON' : 'EVASIVE: OFF', P.evasive ? C.YELLOW : C.GREY, P.evasive ? C.BLACK : C.GREY_TXT, 14,
      () => app.send(CMD.EVASIVE, P.evasive ? 0 : 1), { sound: 'toggle' }); by += 34;
    const st = nearestStation(w), db = st ? st.d : 1e9;
    let dl = 'DOCK', dc = db < K.DOCK_RANGE ? C.GREEN : C.GREY;
    if (P.dock === 1) { dl = `DOCKING ${Math.round(P.dockT / K.DOCK_TIME_S * 100)}%`; dc = C.YELLOW; }
    else if (P.dock === 2) { dl = 'UNDOCK'; dc = C.LILAC; }
    g.button('dock', bx, by, bw, 30, dl, dc, C.BLACK, 15, () => app.send(P.dock === 2 ? CMD.UNDOCK : CMD.DOCK)); by += 36;
    g.progress(bx, by, bw, 7, P.warpCharge, C.SKY); by += 11;
    let ws = P.warping ? 'AT ' + warpTxt(P) : P.warpSet ? 'WARP CHARGING...' : 'WARP DRIVE READY';
    if (P.health[K.S_WARP] <= 0) ws = 'WARP DRIVE OFFLINE';
    g.textFit(bx, by, ws, 12, P.health[K.S_WARP] <= 0 ? C.RED : C.GREY_TXT, 'left', bw); by += 15;
    const now = performance.now();
    if (now - (S.overWarp || 0) < 2500 || now - (S.overImp || 0) < 2500) g.wrap(bx, by, bw, 'THE GREY ZONE NEEDS MORE POWER - ASK ENGINEERING.', 11, flash(300) ? C.YELLOW : C.ORANGE, 1.15, 3);
    else if (db < 6000 && !P.dock) g.wrap(bx, by, bw, `${st.n.short || 'STATION'} ${fmtDist(db)} - DOCK < 1.8K, < 25 KM/S, SHIELDS DOWN`, 11, C.GREY_TXT, 1.15, 3);
  },
  // ---- the autopilot and the jump drive, under the engines: whatever NAV has plotted lights up here
  drawAuto(g, w, app, L) {
    const P = w.P, x = L.rx, rw = L.x1 - L.rx;
    let y = L.y0 + 222;
    // whatever another station plotted last is the one thing the autopilot can fly
    const route = P.route && P.route.length ? P.route : P.wpValid ? [[P.wpx, P.wpy]] : [];
    const ic = w.findC(P.icPlot), opl = P.orbPlot >= 0 ? w.sys.planets[P.orbPlot] : null;
    const esc = ic && ic.faction !== K.F_HOSTILE && ic.type !== K.CT_STARBASE && ic.type !== K.CT_GROUND && ic.type !== K.CT_POI && ic.type !== K.CT_ANOMALY;
    const dockable = ic && ic.type === K.CT_STARBASE && ic.faction !== K.F_HOSTILE && ic.kind !== SK_RELAY && ic.kind !== SK_MONOLITH;
    const plot = P.apPlot === 1 && route.length ? 1 : P.apPlot === 2 && ic ? 2 : P.apPlot === 4 && opl ? 4 : 0;
    const mode = P.autopilot === K.AP_ESCORT ? (P.apPlanet >= 0 ? 4 : 3) : P.autopilot === K.AP_DOCK ? 5 : P.autopilot; // 1 course, 2 intercept, 3 escort, 4 orbit, 5 dock
    let status = 'HAND STEERING';
    if (mode === 1) { const d = distTo(P.x, P.y, P.wpx, P.wpy); status = `ON COURSE - ${route.length > 1 ? `LEG 1 OF ${route.length}, ` : ''}${fmtDist(d)}${P.speed > 5 ? ', ETA ' + mmss(route.reduce((a, [qx, qy], i) => a + (i ? distTo(route[i - 1][0], route[i - 1][1], qx, qy) : d), 0) / Math.max(5, P.speed)) : ''}`; }
    else if (mode === 2) status = `INTERCEPTING ${w.shortName(P.apTarget)}`;
    else if (mode === 3) status = `ESCORTING ${w.shortName(P.apTarget)}`;
    else if (mode === 4) status = P.orbitPl === P.apPlanet ? `IN STANDARD ORBIT OF ${w.sys.planets[P.apPlanet].name}` : `TAKING US INTO ORBIT OF ${w.sys.planets[P.apPlanet].name}`;
    else if (mode === 5) status = `DOCKING APPROACH - ${w.shortName(P.apTarget)}`;
    g.header(x, y, rw, 'AUTOPILOT', P.autopilot ? C.VIOLET : '#6a5aa0');
    g.textFit(x + rw - 14, y + 2, status, 13, C.BLACK, 'right', rw - 150, true);
    y += 22;
    const info = plot === 1 ? `NAV'S COURSE: ${route.length > 1 ? route.length + ' WAYPOINTS' : 'WAYPOINT ' + sectorName(route[0][0], route[0][1])} - ${fmtDist(distTo(P.x, P.y, route[0][0], route[0][1]))} BRG ${pad3(bearingTo(P.x, P.y, route[0][0], route[0][1]))}`
      : plot === 2 ? `PLOTTED: ${w.shortName(P.icPlot, ic.known)} ${fmtDist(w.range(ic))} BRG ${pad3(w.bearing(ic))}`
        : plot === 4 ? `ORBIT PLOTTED: ${opl.name} - PULL ALONGSIDE AND MOVE WITH IT` : 'NOTHING PLOTTED - NAV PLOTS A COURSE OR ORBIT; NAV, SCIENCE OR TACTICAL AN INTERCEPT';
    g.textFit(x, y, info, 13, plot ? C.PEACH : C.GREY_TXT, 'left', rw);
    y += 18;
    // every autopilot mode that makes sense for what's plotted: tap one to fly it, tap the lit one to stop
    const opts = plot === 1 ? [['COURSE', 1, () => app.send(CMD.AUTOPILOT, K.AP_WAYPOINT)]]
      : plot === 4 ? [['ORBIT', 4, () => app.send(CMD.AUTOPILOT, K.AP_ESCORT, 100 + P.orbPlot)]]
        : plot === 2 ? [['INTERCEPT', 2, () => app.send(CMD.AUTOPILOT, K.AP_TARGET, P.icPlot)]]
          .concat(esc ? [['ESCORT', 3, () => app.send(CMD.AUTOPILOT, K.AP_ESCORT, P.icPlot)]] : [])
          .concat(dockable ? [['DOCK', 5, () => app.send(CMD.AUTOPILOT, K.AP_DOCK, P.icPlot)]] : []) : [];
    const onThis = (m) => mode === m && (m === 1 || (m === 4 ? P.apPlanet === P.orbPlot : P.apTarget === P.icPlot));
    const extra = P.autopilot && !opts.some(([, m]) => onThis(m)) ? 1 : 0; // flying something older: offer to stop it
    const n = Math.max(1, opts.length + extra), bw = (rw - 6 * (n - 1)) / n;
    if (!opts.length && !extra) g.button('apgo', x, y, rw, 32, 'NO PLOT', C.GREY, C.GREY_TXT, 16, () => app.sound.denied(), { silent: true });
    opts.forEach(([l, m, go], i) => {
      const on = onThis(m);
      g.button('ap' + i, x + i * (bw + 6), y, bw, 32, on ? `${l} - STOP` : l, on ? C.VIOLET : flash(700) && !P.autopilot ? C.ORANGE : '#c88232', C.BLACK, 16,
        () => { if (on) app.send(CMD.AUTOPILOT, K.AP_OFF); else go(); }, { bold: true });
    });
    if (extra) g.button('apoff', x + opts.length * (bw + 6), y, bw, 32, 'DISENGAGE', C.VIOLET, C.BLACK, 16, () => app.send(CMD.AUTOPILOT, K.AP_OFF), { bold: true });
    y += 34;
    if (P.apAvoid) g.textFit(x, y, `STEERING ROUND ${P.apAvoid} - WE'LL COME BACK ONTO THE LINE`, 12, C.YELLOW, 'left', rw);
    y += 17;
    // ---- jump drive
    const to = P.jumpTo !== K.NO_ID ? P.jumpTo : P.jumpPlot;
    g.header(x, y, rw, 'JUMP DRIVE', to === K.NO_ID ? '#2c5a64' : CYAN);
    y += 22;
    if (to === K.NO_ID) { g.wrap(x, y, rw, 'NO JUMP PLOTTED. NAV PLOTS ONE ON THE GALAXY CHART; THEN ALIGN AND ENGAGE HERE.', 12, C.GREY_TXT, 1.2, 2); return; }
    const v = P.jumpVec >= 0 ? P.jumpVec : 0, off = Math.round(Math.abs(angDiff(P.hdg, v)));
    const why = (w.slow && w.slow.jumpWhy && w.slow.jumpWhy[to]) || '', hw = (rw - 6) / 2;
    const block = why && !/^HELM: ALIGN/.test(why) && P.jumpTo === K.NO_ID && !(P.jumping > 0);
    g.textFit(x, y, `${sysAt(to).name}  VECTOR ${pad3(v)}`, 15, CYAN, 'left', rw * 0.62, true);
    g.text(x + rw, y + 1, off <= 5 ? 'ALIGNED' : `${off}° OFF`, 14, off <= 5 ? C.GREEN : C.YELLOW, 'right');
    if (block) { y += 18; g.textFit(x, y, why, 11, C.YELLOW, 'left', rw); y += 14; } else y += 20;
    const bh = Math.max(26, Math.min(36, L.y1 - y));
    if (P.jumping > 0) {
      g.progress(x, y + 2, rw, 8, 1 - P.jumping / (P.jumpLen || K.JUMP_TRANSIT_S), C.SKY);
      g.text(x, y + 14, `IN THE JUMP LANE - ARRIVING IN ${Math.ceil(P.jumping)}s`, 14, flash(400) ? C.WHITE : C.SKY);
    } else if (P.jumpTo !== K.NO_ID) {
      g.progress(x, y + 2, hw, 8, P.jumpCharge, CYAN);
      g.text(x, y + 14, `CHARGING ${Math.round(P.jumpCharge * 100)}%`, 13, C.YELLOW);
      g.button('jgo', x + hw + 6, y, hw, bh, 'ABORT JUMP', C.RED, C.BLACK, 17, () => app.send(CMD.JUMP, K.NO_ID));
    } else {
      g.button('jalign', x, y, hw, bh, off <= 5 ? 'ALIGNED' : 'ALIGN TO VECTOR', off <= 5 ? C.GREY : C.SKY, C.BLACK, 15, () => { if (P.evasive) app.send(CMD.EVASIVE, 0); app.send(CMD.HEADING, 0, 0, v); });
      g.button('jgo', x + hw + 6, y, hw, bh, 'ENGAGE JUMP', why ? C.GREY : C.ORANGE, why ? C.GREY_TXT : C.BLACK, 17,
        () => { if (!why) app.send(CMD.JUMP, to); else app.sound.denied(); }, { silent: !!why, bold: true });
    }
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
const SHIP_LEN = 340; // metres, nose to tail
export const nav = {
  zoom: 0, gsel: -1, // zoom: 0 whole system, 1 20k across, 3 4k across (ship drawn to scale), 2 galaxy chart
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
      const M = 9000; // the system view shows a strip outside the grid
      const FULL = SYS_SIZE + 2 * M, span = this.zoom === 3 ? 4000 : this.zoom === 1 ? 20000 : FULL;
      const local = span < 60000; // close in: bigger symbols, finer grid
      k = B / span;
      x0 = clampf(P.x - span / 2, -M, FULL - M - span); y0 = clampf(P.y - span / 2, -M, FULL - M - span);
      const p2 = (wx, wy) => [ox + (wx - x0) * k, oy + (wy - y0) * k];
      const gs = [1000, 2000, 4000, 8000, SYS_SIZE / 10].find((v) => span / v <= 12) || SYS_SIZE / 10;
      const [gx0, gy0] = p2(0, 0), [gx1, gy1] = p2(SYS_SIZE, SYS_SIZE);
      for (let gx = Math.max(0, Math.floor(x0 / gs) * gs); gx < Math.min(SYS_SIZE + 1, x0 + B / k); gx += gs) g.rect(p2(gx, 0)[0], Math.max(oy, gy0), 1, Math.min(oy + B, gy1) - Math.max(oy, gy0), '#121832');
      for (let gy = Math.max(0, Math.floor(y0 / gs) * gs); gy < Math.min(SYS_SIZE + 1, y0 + B / k); gy += gs) g.rect(Math.max(ox, gx0), p2(0, gy)[1], Math.min(ox + B, gx1) - Math.max(ox, gx0), 1, '#121832');
      drawEdgeFrame(g, p2, { x: ox, y: oy, w: B, h: B });
      if (span >= FULL * 0.98) for (let i = 0; i < 10; i++) {
        const cw = (gx1 - gx0) / 10;
        g.text(gx0 + i * cw + cw / 2, oy + 2, String.fromCharCode(65 + i), 10, C.GRID, 'center');
        g.text(ox + 2, gy0 + i * cw + cw / 2 - 6, String(i + 1), 10, C.GRID);
      }
      drawSystemLayer(g, w.sys, w.tSec, p2, k, { minR: local ? 3 : 2.5, well: true, dots: local ? 1 : 0.7 });
      drawPulsarMap(g, w, p2, k);
      if (P.orbPlot >= 0 && w.sys.planets[P.orbPlot]) {
        const [ppx, ppy] = p2(...planetPos(w.sys, P.orbPlot, w.tSec));
        g.ctx.save(); g.ctx.setLineDash([3, 3]); g.circle(ppx, ppy, w.sys.planets[P.orbPlot].r * 2.4 * k, '#78f0ff', false, 1); g.ctx.restore();
      }
      drawCampLines(g, w, p2);
      for (const m of w.M.mk) { const [sx, sy] = p2(m.x, m.y); drawMarker(g, sx, sy, m.kind, m.r * k, 11); }
      const pt = (w.slow && w.slow.ptrail) || [];
      for (let i = 0; i < pt.length; i += 2) { const [sx, sy] = p2(pt[i], pt[i + 1]); g.rect(sx, sy, 1.5, 1.5, C.SKY); }
      const [px, py] = p2(P.x, P.y);
      const route = P.route && P.route.length ? P.route : P.wpValid ? [[P.wpx, P.wpy]] : [];
      { // NAV's course, leg by leg
        let [ax, ay] = [px, py];
        route.forEach(([wx, wy], i) => {
          const [sx, sy] = p2(wx, wy);
          g.line(ax, ay, sx, sy, i === 0 ? '#6a5ab4' : '#50468c', i === 0 ? 1.5 : 1);
          g.strokeRect(sx - 5, sy - 5, 11, 11, C.VIOLET, 1.5);
          g.strokeRect(sx - 2, sy - 2, 5, 5, C.VIOLET, 1);
          if (route.length > 1) g.text(sx + 8, sy - 14, String(i + 1), 11, C.VIOLET, 'left', true);
          [ax, ay] = [sx, sy];
        });
      }
      for (const c of w.contacts()) {
        if (!c.alive) continue;
        const [sx, sy] = p2(c.x, c.y);
        const col = factionColor(c.faction);
        if (c.type === K.CT_STARBASE) drawStation(g, c.kind ?? 0, sx, sy, local ? 0.3 : 0.13, w.now, c.civ);
        else if (c.type === K.CT_POI) drawPoi(g, c.kind ?? 0, sx, sy, local ? 0.22 : 0.1, w.now, (c.civ ?? 0) * 0.7);
        else if (c.type === K.CT_BUOY || c.type === K.CT_GROUND) drawContact(g, c.type, sx, sy, local ? 0.12 : 0.08, c.hdg, w.now);
        else g.circle(sx, sy, 3.5, col);
        g.text(sx + 8, sy + 3, w.shortName(c.id, c.known), 11, col);
      }
      // at 4K the ship is drawn to scale (about 340m long) so helm can judge clearances
      const shipS = this.zoom === 3 ? (SHIP_LEN * k) / 154 : local ? 0.18 : 0.12;
      drawShip(g, ART_CRUISER, C.SKY, clampf(px, ox + 6, ox + B - 6), clampf(py, oy + 6, oy + B - 6), shipS, P.hdg);
      if (this.zoom === 3) g.text(ox + 4, oy + 4, 'SHIP DRAWN TO SCALE', 11, C.GREY_TXT);
      g.text(ox + B - 4, oy + B - 15, this.addLeg ? 'TAP TO ADD A LEG TO THE COURSE' : 'TAP MAP = WAYPOINT, TAP A PLANET = ORBIT', 11, this.addLeg ? C.VIOLET : C.GREY_TXT, 'right');
      g.text(ox + 4, oy + B - 15, `${Math.round(span / 1000)}K ACROSS`, 11, C.GREY_TXT);
      g.hit(ox, oy, B, B, { down: (x, y) => {
        app.sound.toggle();
        if (this.addLeg && P.wpValid) { app.send(CMD.WAYPOINT, 2, 0, Math.round(x0 + (x - ox) / k), Math.round(y0 + (y - oy) / k)); return; }
        // a tap on (or near) a planet plots its orbit insertion point
        for (let i = 0; i < w.sys.planets.length; i++) {
          const [sx, sy] = p2(...planetPos(w.sys, i, w.tSec));
          if (Math.hypot(x - sx, y - sy) < Math.max(14, w.sys.planets[i].r * 2 * k)) { app.send(CMD.PLOT, 2, i); return; }
        }
        app.send(CMD.WAYPOINT, 1, 0, Math.round(x0 + (x - ox) / k), Math.round(y0 + (y - oy) / k));
      } });
      drawOobBanner(g, { x: ox, y: oy, w: B, h: B }, P.oobT);
    }
    g.unclip();
    g.strokeRect(ox, oy, B, B, C.GRID);
    // under
    // under: the zoom windows, the galaxy chart, clear waypoint
    const bw = (L.uw - 30) / 6;
    [['4K', 3], ['20K', 1], ['SYSTEM', 0], ['GALAXY', 2]].forEach(([l, z], i) =>
      g.button('z' + z, L.ux + i * (bw + 6), L.uy, bw, L.uh, l, this.zoom === z ? C.VIOLET : C.GREY, C.BLACK, 16, () => { this.zoom = z; }, { sound: 'toggle' }));
    // + LEG: taps add legs to the course (the autopilot flies them in order without stopping)
    g.button('leg', L.ux + 4 * (bw + 6), L.uy, bw, L.uh, '+ LEG', this.addLeg ? C.VIOLET : P.wpValid ? '#50468c' : C.GREY, this.addLeg ? C.BLACK : C.PEACH, 16,
      () => { if (!P.wpValid) { app.sound.denied(); this.addLeg = false; return; } this.addLeg = !this.addLeg; }, { sound: 'toggle', silent: !P.wpValid });
    if (!P.wpValid) this.addLeg = false;
    g.button('cwp', L.ux + 5 * (bw + 6), L.uy, bw, L.uh, 'CLEAR', C.RED_DIM, C.PEACH, 16, () => { this.addLeg = false; app.send(CMD.WAYPOINT, 0); });
    if (this.zoom === 2) { this.jumpPanel(g, w, app, L); return; }
    // right column
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    const route = P.route && P.route.length ? P.route : P.wpValid ? [[P.wpx, P.wpy]] : [];
    g.header(x, y, rw, (route.length > 1 ? `COURSE - ${route.length} LEGS - ` : 'WAYPOINT - ') + w.sys.name, C.VIOLET);
    y += 24;
    if (P.wpValid) {
      const d = distTo(P.x, P.y, P.wpx, P.wpy);
      let tot = d; for (let i = 1; i < route.length; i++) tot += distTo(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
      g.textFit(x, y, `${route.length > 1 ? 'NEXT ' : ''}SECTOR ${sectorName(P.wpx, P.wpy)}   BRG ${pad3(bearingTo(P.x, P.y, P.wpx, P.wpy))}   ${fmtDist(d)}`, 17, C.PEACH, 'left', rw);
      const sp = Math.abs(P.speed);
      g.text(x, y + 22, route.length > 1 ? `WHOLE COURSE ${fmtDist(tot)}${sp > 5 ? ', ETA ' + mmss(tot / sp) : ''}` : sp > 5 ? `ETA ${mmss(d / sp)} AT CURRENT SPEED` : 'ETA -- (NOT MOVING)', 12, C.GREY_TXT);
      if (tot > 15000 && !P.warping) g.text(x + rw, y + 22, 'LONG HAUL - CONSIDER WARP', 12, C.SKY, 'right');
    } else {
      g.text(x, y, 'NO WAYPOINT', 17, C.GREY_TXT);
      g.text(x, y + 22, 'TAP THE MAP OR A QUICK WAYPOINT. + LEG ADDS MORE.', 12, C.GREY_TXT);
    }
    y += 42;
    const ap = P.autopilot === K.AP_WAYPOINT;
    g.rrect(x, y, rw, 38, 19, ap ? C.VIOLET : '#1c1c2c');
    g.textFit(x + rw / 2, y + 9, ap ? (P.apAvoid ? `ON COURSE - STEERING ROUND ${P.apAvoid}` : 'HELM HAS US ON COURSE') : P.wpValid ? 'COURSE PLOTTED - HELM: AUTOPILOT > COURSE' : 'NO COURSE PLOTTED', 15, ap ? C.BLACK : C.PEACH, 'center', rw - 16);
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
    y += 38;
    const pls = w.sys.planets;
    if (pls.length) {
      g.text(x, y, 'PLOT AN ORBIT (HELM: AUTOPILOT > ORBIT)', 11, C.GREY_TXT);
      y += 14;
      const pw = (rw - 6 * (pls.length - 1)) / pls.length;
      pls.forEach((pl, i) => g.button('orb' + i, x + i * (pw + 6), y, pw, 30, (P.orbPlot === i ? '> ' : '') + pl.name, P.orbPlot === i ? '#78f0ff' : '#3c6e78', C.BLACK, 12,
        () => app.send(CMD.PLOT, 2, P.orbPlot === i ? K.NO_ID : i), { sound: 'toggle' }));
      y += 36;
    }
    g.header(x, y, rw, 'CONTACTS', C.VIOLET);
    y += 24;
    const list = w.contacts().filter((c) => c.alive).sort((a, b) => w.range(a) - w.range(b)).slice(0, pls.length ? 3 : 4);
    if (!list.length) g.text(x, y + 4, 'NOTHING ON SENSORS', 12, C.GREY_TXT);
    const bw2 = Math.min(92, (rw - 120) / 2);
    for (const c of list) {
      if (y > L.y1 - 80) break;
      const col = factionColor(c.faction);
      g.textFit(x, y + 2, w.shortName(c.id, c.known), 15, col, 'left', rw - 2 * bw2 - 16);
      g.text(x, y + 19, `${fmtDist(w.range(c))}  BRG ${pad3(w.bearing(c))}`, 11, C.GREY_TXT);
      const ic = P.icPlot === c.id;
      g.button('ic' + c.id, x + rw - bw2, y + 1, bw2, 30, ic ? 'PLOTTED' : 'PLOT INTERCEPT', ic ? C.VIOLET : C.LILAC, C.BLACK, 13,
        () => app.send(CMD.PLOT, 1, ic ? K.NO_ID : c.id));
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
      if (/^HELM: ALIGN/.test(why)) why = '';
      ready = !why;
      if (ready) why = `LANE OPEN - ${K.JUMP_CHARGE_S}s CHARGE, ${K.JUMP_COST} ENERGY. PLOT IT FOR THE HELM.`;
    }
    const by = L.y1 - 44;
    if (P.jumping > 0) {
      g.text(x, by - 40, `IN THE JUMP LANE - ARRIVING IN ${Math.ceil(P.jumping)}s`, 15, flash(400) ? C.WHITE : C.SKY);
      g.progress(x, by - 18, rw, 10, 1 - P.jumping / (P.jumpLen || K.JUMP_TRANSIT_S), C.SKY);
      g.button('jump', x, by, rw, 42, 'JUMPING...', C.GREY, C.GREY_TXT, 20, () => {}, { silent: true });
      return;
    }
    if (P.jumpTo !== K.NO_ID) {
      g.text(x, by - 40, `CHARGING FOR ${sysAt(P.jumpTo).name}  ${Math.round(P.jumpCharge * 100)}%`, 15, C.YELLOW);
      g.progress(x, by - 18, rw, 10, P.jumpCharge, C.YELLOW);
      g.button('jump', x, by, rw, 42, 'HELM IS ENGAGING THE JUMP', C.GREY, C.GREY_TXT, 18, () => {}, { silent: true });
      return;
    }
    // neighbours as quick picks
    g.text(x, y, 'LANES FROM ' + w.sys.name, 12, C.GREY_TXT);
    y += 16;
    const known = galaxyKnown(w), nb = lanes.filter((i) => known[i]);
    const lw = (rw - 6 * (nb.length - 1)) / Math.max(1, nb.length);
    nb.forEach((i, n) => g.button('ln' + i, x + n * (lw + 6), y, lw, 30, sysAt(i).name, sel === i ? C.SKY : C.GREY, sel === i ? C.BLACK : C.GREY_TXT, 12,
      () => { this.gsel = i; }, { sound: 'toggle' }));
    const plotted = P.jumpPlot === sel;
    const canPlot = sel !== cur && lanes.includes(sel) && !(sysAt(sel).hidden && !galaxyKnown(w)[sel]);
    if (plotted) why = `PLOTTED. HELM: ALIGN TO HEADING ${pad3(P.jumpVec)} AND ENGAGE.` + (why && !/ALIGN/.test(why) ? ' ' + why : '');
    g.wrap(x, by - 36, rw, why, 12, plotted ? '#78f0ff' : ready ? C.GREEN : sel === cur ? C.SKY : C.YELLOW, 1.2, 2);
    g.button('jump', x, by, rw, 42, plotted ? 'CLEAR THE PLOT' : canPlot ? 'PLOT JUMP COURSE' : 'NO LANE TO PLOT', plotted ? C.LILAC : canPlot ? C.ORANGE : C.GREY, canPlot || plotted ? C.BLACK : C.GREY_TXT, 20,
      () => { if (plotted) app.send(CMD.PLOT, 0, K.NO_ID); else if (canPlot) app.send(CMD.PLOT, 0, sel); else app.sound.denied(); }, { silent: !canPlot && !plotted, bold: true });
  },
};

// ============================================================================ SCIENCE
const SCI_RANGE = [5000, 10000, 20000, 40000];
export const science = {
  sel: K.NO_ID, rangeI: 1, hold: false, artSel: 0,
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, cx = L.bx + B / 2, cy = L.by + B / 2, R = B / 2 - 4;
    const rl = ['5K', '10K', '20K', '40K'], bw = (L.uw - 36) / 7.5;
    rl.forEach((l, i) => g.button('sr' + i, L.ux + i * (bw + 6), L.uy, bw, L.uh, l, !this.hold && this.rangeI === i ? C.SKY : C.GREY, C.BLACK, 17, () => { this.rangeI = i; this.hold = false; }));
    g.button('lrs', L.ux + 4 * (bw + 6), L.uy, bw, L.uh, 'LRS', P.lrs > 0 ? C.YELLOW : C.LILAC, C.BLACK, 17, () => app.send(CMD.LRS));
    const nArt = (P.arts || []).length, unread = (P.arts || []).some((h) => !h.ident || (hasPuz(h) && !(h.pz && h.pz.done)));
    const hx = L.ux + 5 * (bw + 6), hw = L.ux + L.uw - hx;
    g.button('hold', hx, L.uy, hw, L.uh, this.hold ? '< BACK TO SENSORS' : `CARGO HOLD${nArt ? ' (' + nArt + ')' : ''}`, this.hold ? C.ORANGE : unread && flash(600) ? C.YELLOW : C.LILAC, C.BLACK, 18, () => { this.hold = !this.hold; }, { sound: 'toggle', bold: true });
    if (this.hold) { this.drawHold(g, w, app, L); return; }
    if (this.sel !== K.NO_ID && !w.findC(this.sel)) this.sel = K.NO_ID;
    drawRadar(g, w, cx, cy, R, SCI_RANGE[this.rangeI], false, this.sel, true);
    { // how far the sensors reach right now (power, damage, nebulae, long range scan)
      const sr = w.sensorRange, rr = R * sr / SCI_RANGE[this.rangeI];
      if (rr < R) {
        g.ctx.save(); g.ctx.setLineDash([6, 5]); g.circle(cx, cy, rr, P.lrs > 0 ? C.YELLOW : '#4fb8c8', false, 1.5); g.ctx.restore();
        g.text(cx, cy - rr - 14, 'SENSOR EDGE', 10, '#4fb8c8', 'center');
      }
      const full = K.SENSOR_RANGE, pc = Math.round(sr / full * 100);
      g.text(L.bx + B, L.by, `SENSOR RANGE ${fmtDist(sr)}`, 14, P.lrs > 0 ? C.YELLOW : pc < 70 ? C.ORANGE : '#4fb8c8', 'right', true);
      g.text(L.bx + B, L.by + 17, P.lrs > 0 ? `LONG RANGE SCAN x3 - ${Math.ceil(P.lrs)}s` : w.inNebula ? 'NEBULA: 40%' : `${pc}% OF STANDARD (ENGINEERING: SENSOR POWER)`, 10, P.lrs > 0 ? C.YELLOW : C.GREY_TXT, 'right');
    }
    g.text(L.bx, L.by, 'N ^  SENSOR SWEEP', 12, C.GREY_TXT);
    if (P.power[K.S_SENSORS] <= 0 || P.health[K.S_SENSORS] <= 0) {
      g.text(cx, cy + 30, P.power[K.S_SENSORS] <= 0 ? 'SENSORS OFFLINE - NO POWER' : 'SENSORS OFFLINE - DAMAGED', 20, flash(500) ? C.RED : C.RED_DIM, 'center', true);
      g.text(cx, cy + 54, P.power[K.S_SENSORS] <= 0 ? 'ENGINEERING HAS CUT SENSOR POWER TO 0%' : 'DAMAGE CONTROL: SEND A REPAIR TEAM', 13, C.GREY_TXT, 'center');
    }
    if (w.inNebula) g.text(L.bx, L.by + B - 14, 'IN NEBULA - SENSOR RANGE REDUCED', 12, C.LILAC);
    if (P.xId !== K.NO_ID) g.text(L.bx + B, L.by + B - 14, `${P.xMode === 2 ? 'EXTRACTING' : 'SAMPLING'} ${Math.round(P.xProg * 100)}%`, 12, C.YELLOW, 'right');
    if (w.flux >= 0) { // the campaign's tachyon hunt
      const fx = w.flux, fcol = fx >= 85 ? C.GREEN : fx >= 50 ? C.YELLOW : C.SKY;
      g.text(L.bx, L.by + 18, `TACHYON FLUX ${fx}%`, 17, fcol);
      g.rect(L.bx, L.by + 40, B * 0.45, 8, C.SEG_OFF); g.rect(L.bx, L.by + 40, B * 0.45 * fx / 100, 8, fcol);
      g.button('stab', L.bx + B - 150, L.by + 16, 150, 34, 'DEPLOY STABILISER', fx >= 85 ? (flash(400) ? C.GREEN : C.ORANGE) : C.GREY, C.BLACK, 14, () => app.send(CMD.CAMP, 1), { silent: fx < 85 });
    }
    g.hitCircle(cx, cy, R, { down: (x, y) => {
      const id = radarPick(w, x, y, cx, cy, R, SCI_RANGE[this.rangeI], false);
      if (id !== K.NO_ID) { this.sel = id; app.sound.toggle(); }
    } });
    // detail
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    const c = w.findC(this.sel);
    if (!c) {
      g.text(x, y + 4, 'NO CONTACT SELECTED', 19, C.GREY_TXT);
      y = g.wrap(x, y + 34, rw, 'TAP A CONTACT ON THE SENSOR DISPLAY. SCAN ONCE TO IDENTIFY IT, TWICE FOR A FULL ANALYSIS. ASTEROIDS, WRECKS AND OTHER OBJECTS CAN BE SAMPLED OR EXTRACTED FOR MATERIALS AND ARTEFACTS.', 13, C.GREY_TXT);
      y = g.wrap(x, y + 8, rw, 'LONG RANGE SCAN (LRS) TRIPLES SENSOR RANGE FOR 10 SECONDS AND COSTS 60 ENERGY.', 13, C.GREY_TXT);
      const list = w.contacts().filter((cc) => cc.alive && cc.id !== K.ID_BASE).sort((a, b) => w.range(a) - w.range(b)).slice(0, 4);
      y += 10;
      for (const cc of list) {
        if (y > L.y1 - 34) break;
        g.button('pick' + cc.id, x, y, rw, 30, `${w.shortName(cc.id, cc.known)}  ${fmtDist(w.range(cc))}`, C.GREY, factionColor(cc.faction), 15, () => { this.sel = cc.id; });
        y += 36;
      }
      return;
    }
    const poi = c.type === K.CT_POI;
    g.textFit(x, y, w.shortName(c.id, c.known), 22, poi ? C.TAN : factionColor(c.faction), 'left', rw);
    g.textFit(x, y + 26, w.contactName(c.id, c.known), 13, C.PEACH, 'left', rw);
    const tn = !c.known ? 'UNKNOWN' : c.type === K.CT_STARBASE ? SK_NAME[c.kind ?? 0] : poi ? POI_NAME[c.kind ?? 0] : K.CT_NAME[c.type];
    g.text(x, y + 42, poi ? tn : `${tn} / ${K.FACTION_NAME[c.faction]}`, 12, C.GREY_TXT);
    g.text(x, y + 60, `RANGE ${fmtDist(w.range(c))}  BRG ${pad3(w.bearing(c))}${poi ? '' : `  HDG ${pad3(c.hdg)}  SPD ${Math.round(c.speed)}`}`, 15, C.SKY);
    const lvl = c.scan >= 2 ? 2 : c.scan;
    g.text(x, y + 84, 'SCAN LEVEL: ' + ['NOT SCANNED', 'IDENTIFIED', 'FULL SCAN'][lvl], 17, lvl === 2 ? C.GREEN : C.YELLOW);
    const scanning = P.scanId === c.id;
    g.progress(x, y + 106, rw, 10, scanning ? P.scanProg : lvl / 2, scanning ? C.YELLOW : C.GREEN);
    g.button('scan', x, y + 122, rw, 38, scanning ? 'SCANNING...' : lvl === 0 ? 'SCAN (IDENTIFY)' : lvl === 1 ? 'SCAN (FULL)' : 'SCAN COMPLETE',
      scanning ? C.YELLOW : lvl < 2 ? C.SKY : C.GREY, C.BLACK, 19, () => app.send(CMD.SCAN, c.id));
    y += 170;
    if (poi) { this.drawPoiPanel(g, w, app, L, c, y); return; }
    if (lvl === 2 && !c.note && c.type !== K.CT_ANOMALY && c.type !== K.CT_STARBASE && c.type !== K.CT_BUOY) {
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
    } else if (lvl === 2 && c.note) g.wrap(x, y, rw, c.note, 14, C.SKY, 1.25, 5);
    else if (lvl === 2 && c.type === K.CT_ANOMALY) g.wrap(x, y, rw, 'TETRYON EMISSIONS AND AN UNSTABLE SUBSPACE FOLD. DATA TRANSMITTED TO FLEET COMMAND.', 13, C.LILAC);
    else if (c.type === K.CT_STARBASE) g.wrap(x, y, rw, `${SK_NAME[c.kind ?? 0]}${CIV_NAME[c.civ] ? ' (' + CIV_NAME[c.civ] + ')' : ''}. ` +
      (c.faction === K.F_HOSTILE ? 'HOSTILE - KEEP CLEAR OF ITS GUNS.' : c.kind === SK_RELAY || c.kind === SK_MONOLITH ? 'NO DOCKING FACILITIES.' : 'DOCK HERE FOR REPAIRS, ENERGY AND TORPEDOES.'), 13, factionColor(c.faction));
    else g.wrap(x, y, rw, 'FULL SCAN NEEDED FOR SHIELDS, HULL, SYSTEMS AND SHIELD FREQUENCY.', 13, C.GREY_TXT);
    this.bottomButtons(g, w, app, L, c);
  },
  bottomButtons(g, w, app, L, c) {
    const P = w.P, x = L.rx, rw = L.rw, by = L.y1 - 38;
    g.text(x, by - 18, `SENSORS ${Math.round(P.health[K.S_SENSORS])}% HEALTH, ${P.power[K.S_SENSORS]}% POWER - RANGE ${fmtDist(w.sensorRange)}`, 12, P.health[K.S_SENSORS] < 50 ? C.RED : C.GREY_TXT);
    const hw = (rw - 6) / 2;
    if (P.towOk === c.id) { // a ship we can take in tow (pulsar rescue)
      g.text(x + rw, by - 18, P.tow ? 'IN TOW' : P.shieldRaise > 0.05 ? 'TRACTOR: SHIELDS DOWN' : 'TRACTOR < 2.5K', 12, P.tow ? C.YELLOW : C.GREY_TXT, 'right');
      g.button('stow', x, by, hw, 36, P.tow ? 'RELEASE TOW' : 'TRACTOR BEAM', P.tow ? C.YELLOW : C.ORANGE, C.BLACK, 17, () => app.send(CMD.EXTRACT, P.tow ? K.NO_ID : c.id));
    } else g.button('sview', x, by, hw, 36, 'ON VIEWER', C.ORANGE, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_TARGET, c.id));
    const ic = P.icPlot === c.id;
    g.button('sint', x + hw + 6, by, hw, 36, ic ? 'PLOTTED FOR HELM' : 'PLOT INTERCEPT', ic ? C.VIOLET : C.LILAC, C.BLACK, 16,
      () => app.send(CMD.PLOT, 1, ic ? K.NO_ID : c.id));
  },
  drawPoiPanel(g, w, app, L, c, y) {
    const P = w.P, x = L.rx, rw = L.rw, d = w.range(c);
    y = g.wrap(x, y - 4, rw, POI_TIP[c.kind ?? 0], 12, C.GREY_TXT, 1.2, 2) + 2;
    if (c.res) {
      const got = c.res.map((v, i) => (v ? `${v} ${RES_SHORT[i]}` : '')).filter(Boolean);
      y = g.wrap(x, y, rw, 'CONTAINS: ' + (got.length ? got.join(', ') : 'NO USEFUL MATERIALS LEFT'), 13, C.SKY, 1.2, 2) + 2;
      g.text(x, y, c.art ? 'ARTEFACT SIGNATURE!' : 'NO ARTEFACT SIGNATURE', 13, c.art ? (flash(500) ? C.WHITE : C.LILAC) : C.GREY_TXT);
      g.text(x + rw, y, 'HAZARD: ' + hazWord(c.haz), 13, c.haz > 0.25 ? C.RED : c.haz > 0.12 ? C.YELLOW : C.GREEN, 'right');
      y += 18;
    } else { g.text(x, y, c.scan ? 'FULL SCAN TO SEE WHAT IT HOLDS AND HOW RISKY IT IS.' : 'SCAN IT TO IDENTIFY IT.', 12, C.YELLOW); y += 18; }
    const by = L.y1 - 38, hw = (rw - 6) / 2;
    const on = P.xId === c.id;
    if (on) g.progress(x, by - 16, rw, 10, P.xProg, P.xMode === 2 ? C.ORANGE : C.SKY);
    else {
      const hint = d > SAMPLE_R ? `SAMPLE < ${SAMPLE_R / 1000}K, TRACTOR BEAM < ${EXTRACT_R / 1000}K` :
        d > EXTRACT_R ? `TRACTOR: CLOSE TO ${EXTRACT_R / 1000}K, SHIELDS DOWN, SLOW` : P.shieldRaise > 0.05 ? 'TRACTOR: LOWER SHIELDS FIRST' : 'IN TRACTOR RANGE';
      g.textFit(x, by - 18, hint, 12, C.GREY_TXT, 'left', rw);
    }
    const sOn = on && P.xMode === 1, eOn = on && P.xMode === 2;
    g.button('smp', x, by, hw, 36, sOn ? `SAMPLING ${Math.round(P.xProg * 100)}%` : 'SAMPLE', sOn ? C.YELLOW : d <= SAMPLE_R ? C.SKY : C.GREY, C.BLACK, 17,
      () => app.send(CMD.SAMPLE, sOn ? K.NO_ID : c.id));
    g.button('ext', x + hw + 6, by, hw, 36, eOn ? `TRACTOR ${Math.round(P.xProg * 100)}%` : 'TRACTOR BEAM', eOn ? C.YELLOW : d <= EXTRACT_R ? C.ORANGE : C.GREY, C.BLACK, 17,
      () => app.send(CMD.EXTRACT, eOn ? K.NO_ID : c.id));
    if (y < by - 60) {
      const ic = P.icPlot === c.id;
      g.button('sint', x, by - 64, hw, 30, ic ? 'PLOTTED FOR HELM' : 'PLOT APPROACH', ic ? C.VIOLET : C.LILAC, C.BLACK, 15, () => app.send(CMD.PLOT, 1, ic ? K.NO_ID : c.id));
      g.button('sview', x + hw + 6, by - 64, hw, 30, 'ON VIEWER', C.TAN, C.BLACK, 15, () => app.send(CMD.VIEW, K.VM_TARGET, c.id));
    }
  },
  // ---- the artefact hold
  drawHold(g, w, app, L) {
    const P = w.P, arts = P.arts || [], B = L.BIG;
    let x = L.bx, y = L.by;
    g.header(x, y, B, 'ARTEFACT HOLD', C.LILAC);
    y += 28;
    if (!arts.length) g.wrap(x, y, B, 'NOTHING HERE YET. TRACTOR IN WRECKS, DERELICTS, RUINS AND CAPSULES TO FIND ARTEFACTS. A FULL SCAN SHOWS WHETHER SOMETHING IS INSIDE.', 13, C.GREY_TXT);
    if (this.artSel >= arts.length) this.artSel = Math.max(0, arts.length - 1);
    const per = Math.max(1, Math.floor((B - 100) / 32)), first = Math.max(0, Math.min(this.artSel - per + 1, arts.length - per));
    arts.forEach((h, i) => {
      if (i < first || i >= first + per) return;
      const d = ART[h.a], sel = i === this.artSel;
      const col = !h.ident ? C.GREY : d.cursed ? C.RED : h.on ? C.GREEN : h.ident >= 2 ? C.LILAC : C.SKY;
      const nm = h.ident ? d.name : d.unk, pk = puzKind(h);
      g.button('art' + h.uid, x, y, B, 28, (sel ? '> ' : '') + nm + (pk ? `  [${PZ_NAME[pk]}]` : h.ident ? (h.on ? '  [ACTIVE]' : '') : '  (?)'), sel ? col : pk && flash(700) ? C.YELLOW : dim(col, 0.6), C.BLACK, 15, () => { this.artSel = i; }, { sound: 'toggle' });
      y += 32;
    });
    // supplies the crew can spend right now
    const cy0 = L.by + B - 66;
    g.header(x, cy0, B, 'SUPPLIES', C.TAN);
    const cwid = (B - 6) / 2, pl = P.cargo[7] || 0, ce = P.cargo[8] || 0;
    g.button('usepl', x, cy0 + 24, cwid, 36, `FIT HULL PLATING (${pl})`, pl ? C.TAN : C.GREY, C.BLACK, 14, () => app.send(CMD.USE, 0), { silent: !pl });
    g.button('usece', x + cwid + 6, cy0 + 24, cwid, 36, `LOAD ANTIMATTER CELL (${ce})`, ce ? C.TAN : C.GREY, C.BLACK, 14, () => app.send(CMD.USE, 1), { silent: !ce });
    // detail
    const rx = L.rx, rw = L.rw;
    y = L.y0;
    const h = arts[this.artSel];
    if (!h) {
      g.header(rx, y, rw, 'ACTIVE EFFECTS', C.LILAC);
      g.text(rx, y + 28, 'NONE', 15, C.GREY_TXT);
      return;
    }
    const d = ART[h.a];
    if (hasPuz(h)) { // something to work out together: the puzzle panel, and the main viewer for the crew
      drawPuzzle(g, w, h, { x: rx, y, w: rw, h: L.y1 - y - 42 }, 1, app);
      const by = L.y1 - 36, bw2 = (rw - 6) / 2, shown = w.view === K.VM_LAB && w.slow && w.slow.labShow === h.uid;
      if (h.pz) g.button('lview', rx, by, d.story ? rw : bw2, 34, shown ? 'ON THE MAIN VIEWER' : 'PUT IT ON THE VIEWER', shown ? C.ORANGE : C.SKY, C.BLACK, 15, () => app.send(CMD.PUZ, 9, h.uid));
      if (!d.story) g.button('jet', rx + bw2 + 6, by, bw2, 34, 'JETTISON', C.RED_DIM, C.PEACH, 16, () => app.send(CMD.JETTISON, h.uid));
      return;
    }
    if (isRare(h)) { // rare finds go through the lab rather than a timed scan
      drawLab(g, w, h, { x: rx, y, w: rw, h: L.y1 - y - 90 }, 1, app);
      const by = L.y1 - 38, bw2 = (rw - 6) / 2;
      const canOn = h.ident >= 2 && !d.cursed && Object.keys(d.fx).length;
      if (canOn) g.button('act', rx, by - 46, rw, 40, h.on ? 'ACTIVE - TAP TO POWER DOWN' : 'ACTIVATE (DRAWS 0.6 EN/S)', h.on ? C.GREEN : C.ORANGE, C.BLACK, 18, () => app.send(CMD.USE, 10, h.uid), { bold: true });
      const shown = w.view === K.VM_LAB && w.slow && w.slow.labShow === h.uid;
      g.button('lview', rx, by, bw2, 36, shown ? 'ON THE VIEWER' : 'PUT LAB ON VIEWER', shown ? C.ORANGE : C.SKY, C.BLACK, 15, () => app.send(CMD.LAB, 4, h.uid));
      g.button('jet', rx + bw2 + 6, by, bw2, 36, 'JETTISON', C.RED_DIM, C.PEACH, 16, () => app.send(CMD.JETTISON, h.uid));
      return;
    }
    g.textFit(rx, y, h.ident ? d.name : d.unk, 22, d.cursed && h.ident ? C.RED : C.LILAC, 'left', rw, true);
    y += 30;
    g.text(rx, y, ['UNIDENTIFIED', 'IDENTIFIED', 'FULLY ANALYSED'][h.ident], 13, h.ident ? C.GREEN : C.YELLOW);
    y += 22;
    if (h.ident) { y = g.wrap(rx, y, rw, d.effect, 15, d.cursed ? C.RED : C.SKY, 1.2, 3) + 8; }
    else y = g.wrap(rx, y, rw, 'ANALYSE IT TO FIND OUT WHAT IT IS AND WHAT IT DOES. ITS EFFECT ONLY WORKS ONCE WE UNDERSTAND IT.', 13, C.GREY_TXT, 1.2, 3) + 8;
    if (h.ident >= 2) y = g.wrap(rx, y, rw, d.lore, 13, C.PEACH, 1.25, h.ident && !d.cursed && Object.keys(d.fx).length ? 4 : 6) + 6;
    const by = L.y1 - 38, bw3 = (rw - 12) / 3;
    const busy = P.anaUid === h.uid;
    if (busy) g.progress(rx, by - 16, rw, 10, P.anaProg, C.YELLOW);
    else if (!(h.ident && !d.cursed && Object.keys(d.fx).length)) g.text(rx, by - 18, `ANALYSE ${ANALYSE_COST} EN   DEEP ANALYSIS ${DEEP_COST} EN`, 12, C.GREY_TXT);
    const canOn = h.ident && !d.cursed && Object.keys(d.fx).length;
    if (canOn) g.button('act', rx, by - 50, rw, 40, h.on ? 'ACTIVE - TAP TO POWER DOWN' : 'ACTIVATE (DRAWS 0.6 EN/S)', h.on ? C.GREEN : C.ORANGE, C.BLACK, 18, () => app.send(CMD.USE, 10, h.uid), { bold: true });
    g.button('ana', rx, by, bw3, 36, busy && !P.anaDeep ? `${Math.round(P.anaProg * 100)}%` : 'ANALYSE', h.ident ? C.GREY : C.SKY, C.BLACK, 16, () => app.send(CMD.ANALYSE, h.uid, 0));
    g.button('deep', rx + bw3 + 6, by, bw3, 36, busy && P.anaDeep ? `${Math.round(P.anaProg * 100)}%` : 'DEEP SCAN', h.ident >= 2 ? C.GREY : C.LILAC, C.BLACK, 16, () => app.send(CMD.ANALYSE, h.uid, 1));
    g.button('jet', rx + 2 * (bw3 + 6), by, bw3, 36, 'JETTISON', C.RED_DIM, C.PEACH, 16, () => app.send(CMD.JETTISON, h.uid));
  },
};

// ============================================================================ COMMS
export function commsOptMsg(msgs) { // newest message that offers replies
  for (let i = 0; i < msgs.length && i < 3; i++) if (msgs[i].opt.length && msgs[i].from < K.MAX_CONTACTS) return msgs[i];
  return null;
}
// the whole voyage's message log: newest at the top, drag to scroll back through it.
// A line said several times in a row shows once with a count: "... (3)".
const logView = { scroll: 0, drag: null, cache: new Map(), cacheW: 0, lastTop: 0, lastH: 0 };
export const msgText = (m) => subtitle(m.text) + ((m.n || 1) > 1 ? `  (${m.n})` : '');
export function drawMsgLog(g, w, x, y, wd, y1, size = 13) {
  const msgs = w.history, V = logView;
  if (!msgs.length) { g.header(x, y, wd, 'MESSAGE LOG', C.LILAC); g.text(x, y + 30, 'NO MESSAGES YET', 12, C.GREY_TXT); return; }
  const hy = y;
  y += 26;
  if (V.cacheW !== wd || V.cache.size > 900) { V.cache.clear(); V.cacheW = wd; }
  const lh = size * 1.2;
  const rows = msgs.map((m) => { // wrapped once per message (and again if its count changes)
    const key = m.id + ':' + (m.n || 1);
    let r = V.cache.get(key);
    if (!r) { const lines = g.wrapLines(msgText(m), wd - 14, size); r = { lines, h: 14 + lines.length * lh + 5 }; V.cache.set(key, r); }
    return r;
  });
  const total = rows.reduce((a, r) => a + r.h, 0), view = y1 - y, maxS = Math.max(0, total - view);
  // new messages arrive at the top: if we're scrolled back, keep the same lines in view
  const topId = msgs[0].id;
  if (V.lastTop && topId !== V.lastTop && V.scroll > 0) V.scroll += Math.max(0, total - V.lastH);
  V.lastTop = topId; V.lastH = total;
  V.scroll = clampf(V.scroll, 0, maxS);
  g.header(x, hy, wd, `MESSAGE LOG - ${msgs.length}${maxS > 0 ? (V.scroll > 4 ? ' - SCROLLED BACK' : ' - DRAG FOR OLDER') : ''}`, C.LILAC);
  g.clip(x, y, wd, view);
  let yy = y - V.scroll;
  msgs.forEach((m, i) => {
    const r = rows[i];
    if (yy + r.h >= y && yy <= y1) {
      const col = i === 0 ? K.MSG_COL[m.col % 4] : dim(K.MSG_COL[m.col % 4], 0.7);
      g.textFit(x, yy, (m.who && CHARS[m.who] ? CHARS[m.who].name : fromName(w, m.from)) + (m.lang ? '  (TRANSLATED)' : ''), 12, i === 0 ? C.ORANGE : C.TAN, 'left', wd - 10);
      let ly = yy + 14;
      for (const l of r.lines) { g.text(x + 6, ly, l, size, col); ly += lh; }
    }
    yy += r.h;
  });
  g.unclip();
  if (maxS > 0) { // scroll bar, and a way back to the newest
    const bh = Math.max(24, view * view / total), by = y + (view - bh) * (V.scroll / maxS);
    g.rect(x + wd - 4, y, 3, view, C.SEG_OFF); g.rect(x + wd - 4, by, 3, bh, C.LILAC);
    if (V.scroll > 4) g.button('lognew', x + wd - 132, y + 2, 124, 24, '^ NEWEST', C.LILAC, C.BLACK, 13, () => { V.scroll = 0; }, { sound: 'toggle' });
  }
  g.hit(x, y, wd - (V.scroll > 4 ? 136 : 0), view, {
    down: (px, py) => { V.drag = { y: py, s: V.scroll }; },
    move: (px, py) => { if (V.drag) V.scroll = clampf(V.drag.s - (py - V.drag.y), 0, maxS); },
    up: () => { V.drag = null; },
  });
}
const CALL_NAMES = { civ: CIV_NAME, sk: SK_NAME, ct: K.CT_NAME, fac: K.FACTION_NAME };
export function dialogLine(w) { // the conversation in progress, and its newest line
  const d = w.slow && w.slow.dlg;
  if (!d) return null;
  const m = w.msgs.find((q) => q.dseq === d.seq);
  return m ? { d, m } : null;
}
export const comms = {
  sel: K.NO_ID,
  draw(g, w, app, L) {
    drawMsgLog(g, w, L.bx, L.by, L.BIG, L.y1);
    const x = L.rx, rw = L.rw;
    let y = L.y0;
    const pend = w.slow && w.slow.dlg && w.slow.dlg.pending ? w.slow.dlg : null;
    if (pend) { // an incoming hail: who's calling, from what - and answer it
      const ci = callerInfo(w, pend, CALL_NAMES), ph = 92;
      g.header(x, y, rw, 'INCOMING HAIL', flash(450) ? C.ORANGE : C.YELLOW);
      y += 26;
      drawPortrait(g, pend.who, x, y, ph * 0.9, ph, performance.now(), false);
      g.textFit(x + ph, y + 2, ci.place, 20, C.PEACH, 'left', rw - ph, true);
      g.textFit(x + ph, y + 28, ci.vessel, 13, C.SKY, 'left', rw - ph);
      g.textFit(x + ph, y + 48, `CALLER: ${ci.ch.name}`, 14, C.WHITE, 'left', rw - ph);
      g.textFit(x + ph, y + 66, ci.ch.role || '', 12, C.GREY_TXT, 'left', rw - ph);
      const n = w.n(pend.from);
      if (n) g.text(x + ph, y + 82, `RANGE ${fmtDist(w.range(n))}  BRG ${pad3(w.bearing(n))}`, 12, C.GREY_TXT);
      y += ph + 12;
      if (pend.left) g.text(x, y, `THEY EXPECT AN ANSWER - ${pend.left}s`, 14, flash(400) ? C.RED : C.YELLOW);
      y += 22;
      g.button('ansscr', x, y, rw, 50, 'ANSWER - ON SCREEN', flash(600) ? C.ORANGE : C.YELLOW, C.BLACK, 22, () => app.send(CMD.ANSWER, pend.seq, 1), { bold: true });
      y += 58;
      g.button('anshere', x, y, rw, 36, 'ANSWER AT THIS CONSOLE', C.LILAC, C.BLACK, 17, () => app.send(CMD.ANSWER, pend.seq, 0));
      return;
    }
    const sl = speakerLine(w);
    if (sl) {
      const d = sl.d, m = sl.dm, sp = sl.sp, ch = CHARS[sl.who] || CHARS.computer, ph = 92;
      drawPortrait(g, sl.who, x, y, ph * 0.9, ph, performance.now(), true);
      g.textFit(x + ph, y + 2, ch.name, 18, C.PEACH, 'left', rw - ph, true);
      g.textFit(x + ph, y + 24, ch.role || '', 12, C.GREY_TXT, 'left', rw - ph);
      if (sp.lang) g.text(x + ph, y + 42, 'AUTO-TRANSLATED', 11, C.LILAC);
      if (d.left) g.text(x + rw, y + 42, `ANSWER IN ${d.left}s`, 13, flash(400) ? C.RED : C.YELLOW, 'right');
      y = g.wrap(x + ph, y + 58, rw - ph, subtitle(sp.text), 13, C.WHITE, 1.2, 4);
      y = Math.max(y, L.y0 + ph) + 8;
      g.header(x, y, rw, 'YOUR REPLY', C.LILAC);
      y += 24;
      const oh = Math.min(34, (L.y1 - 40 - y) / Math.max(1, m.dopt.length) - 4);
      m.dopt.forEach((o, i) => { g.button('dopt' + i, x, y, rw, oh, o, i === 0 && d.key === 'demand' ? C.RED : C.PEACH, C.BLACK, oh > 28 ? 15 : 13, () => app.send(CMD.DREPLY, d.seq, i)); y += oh + 4; });
      g.button('cview', x, L.y1 - 36, rw, 34, 'PUT ON VIEWER', w.view === K.VM_COMMS ? C.ORANGE : C.LILAC, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_COMMS, K.NO_ID));
      return;
    }
    g.header(x, y, rw, 'HAIL', C.LILAC);
    y += 24;
    // Fleet Command is always on the line - and flashes when it's waiting for our report
    const fc = w.slow && w.slow.fleetCall;
    g.button('hailfc', x, y, rw, 30, fc ? 'FLEET COMMAND - REPORT IN' : 'FLEET COMMAND', fc ? (flash(450) ? C.ORANGE : C.YELLOW) : '#3c5a8c', fc ? C.BLACK : C.SKY, 16,
      () => app.send(CMD.HAIL, K.FROM_COMMAND), { bold: !!fc });
    y += 36;
    // surface sites next (they can be called from wherever sensors see them; trading needs an orbit)
    const all = w.contacts().filter((c) => c.alive), ground = all.filter((c) => c.type === K.CT_GROUND);
    const list = ground.concat(all.filter((c) => c.type !== K.CT_GROUND)).slice(0, 4);
    if (this.sel !== K.NO_ID && !list.some((c) => c.id === this.sel)) this.sel = K.NO_ID;
    if (!list.length) g.text(x, y + 4, 'NO CONTACTS IN RANGE', 12, C.GREY_TXT);
    const P = w.P, orbPl = P.orbitPl;
    for (const c of list) {
      const sel = this.sel === c.id, gr = c.type === K.CT_GROUND;
      const inOrb = gr && w.n(c.id) && orbPl >= 0 && w.n(c.id).pl === orbPl;
      const lab = gr ? `SURFACE: ${c.short || w.shortName(c.id, true)}${inOrb ? ' (IN ORBIT)' : ` ${fmtDist(w.range(c))}`}` : `${w.shortName(c.id, c.known)}  ${fmtDist(w.range(c))}`;
      g.button('hail' + c.id, x, y, rw, 28, lab, sel ? (gr ? '#a0c8b4' : factionColor(c.faction)) : gr ? '#2c4a40' : C.GREY, sel ? C.BLACK : gr ? '#a0c8b4' : C.GREY_TXT, gr ? 14 : 16,
        () => { this.sel = c.id; }, { sound: 'toggle' });
      y += 32;
    }
    y = Math.max(y, L.y0 + 60 + 4 * 32) + 4;
    g.button('open', x, y, rw, 36, 'OPEN CHANNEL', this.sel !== K.NO_ID ? C.ORANGE : C.GREY, C.BLACK, 19, () => { if (this.sel !== K.NO_ID) app.send(CMD.HAIL, this.sel); });
    y += 46;
    const m = commsOptMsg(w.msgs);
    if (m || !w.mode) g.text(x, y, 'REPLY OPTIONS', 12, C.GREY_TXT);
    y += 16;
    if (m) m.opt.forEach((o, i) => { g.button('opt' + i, x, y, rw, 28, K.OPT_NAME[o], C.PEACH, C.BLACK, 16, () => app.send(CMD.REPLY, m.from, o)); y += 32; });
    else if (w.slow && w.slow.rep && w.mode) {
      const civs = [[1, 'FLEET'], [2, 'COLONISTS'], [3, 'VELORI'], [4, 'KESSARI'], [5, 'ORRANS']];
      g.text(x, y - 16, 'STANDING', 12, C.GREY_TXT);
      for (const [cv, nm] of civs) {
        if (y > L.y1 - 60) break;
        const v = w.slow.rep[cv];
        g.text(x, y, nm, 12, CIV_COL[cv]);
        g.rect(x + 90, y + 4, rw - 140, 6, C.SEG_OFF);
        const mid = x + 90 + (rw - 140) / 2;
        g.rect(Math.min(mid, mid + v / 100 * (rw - 140) / 2), y + 3, Math.abs(v) / 100 * (rw - 140) / 2, 8, v >= 0 ? C.GREEN : C.RED);
        g.text(x + rw, y, (v > 0 ? '+' : '') + v, 12, v >= 0 ? C.GREEN : C.RED, 'right');
        y += 17;
      }
      if (w.slow.job) g.wrap(x, y + 2, rw, 'CONTRACT: ' + w.slow.job.objective, 11, C.YELLOW, 1.2, 2);
    } else g.text(x, y + 4, '(NONE - HAIL SOMEONE FIRST)', 12, C.GREY_TXT);
    g.button('cview', x, L.y1 - 36, rw, 34, 'PUT ON VIEWER', w.view === K.VM_COMMS ? C.ORANGE : C.LILAC, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_COMMS, K.NO_ID));
  },
};
