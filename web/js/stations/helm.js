// stations/helm.js - HELM, NAV, SCIENCE and COMMS sub-stations (port of helm.h)
import * as K from '../config.js';
import { C, CMD } from '../config.js';
import { DEG, wrap360, distTo, bearingTo, fmtDist, pad3, sectorName, clampf, angDiff, mmss, warpTxt } from '../util.js';
import { dim, flash, healthColor } from '../gfx.js';
import { drawShip, drawMarker, drawContact, factionColor, ART_CRUISER } from '../ships.js';
import { drawSystemLayer, drawGalaxy, drawStation, drawPoi, galaxyKnown, drawCampLines, drawOortFrame, drawOortWarn, drawBubble } from '../sysdraw.js';
import * as O from '../orbit.js';
import { drawRocks, BOULDER_COL } from '../field.js';
import { drawLab, drawRing, isRare } from '../lab.js';
import { CHARS, subtitle } from '../dialogue.js';
import { drawPortrait } from '../portraits.js';
import { ART, POI_TIP, POI_NAME, RES_SHORT, hazWord, SAMPLE_R, EXTRACT_R, ANALYSE_COST, DEEP_COST } from '../cargo.js';
import { SYSTEMS, SYS_SIZE, SYS_C, WELL_R, sysAt, lanesOf, planetPos, CIV_NAME, CIV_COL, SK_NAME, SK_RELAY, SK_MONOLITH } from '../galaxy.js';
import { drawRadar, radarPick } from './common.js';

export function fromName(w, from) {
  if (from === K.FROM_COMMAND) return 'FLEET COMMAND';
  if (from === K.FROM_COMPUTER) return 'COMPUTER';
  if (from === K.FROM_CREW) return 'BRIDGE';
  return w.shortName(from);
}

// ============================================================================ HELM
export const helm = {
  page: 0, dialDrag: false, localHdg: 0, thrDrag: false, localThr: 0, warpDrag: false, localWarp: 0, lastSend: 0,
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
    if (P.jumpVec >= 0) { // the jump vector: a cyan diamond on the ring
      const b = P.jumpVec * DEG, jx = cx + Math.sin(b) * (R - 42), jy = cy - Math.cos(b) * (R - 42), k = flash(300) ? 9 : 7;
      g.tri(jx, jy - k, jx + k, jy, jx, jy + k, '#78f0ff'); g.tri(jx, jy - k, jx - k, jy, jx, jy + k, '#78f0ff');
    }
    { // rocks within 4k on the compass (bow-relative is not used: north up, like the ring)
      const rk = w.rocks();
      if (rk.length) {
        const kk = (R - 34) / 4000;
        g.clip(cx - R + 34, cy - R + 34, 2 * (R - 34), 2 * (R - 34));
        const nearR = rk.filter((q) => Math.abs(q.x - P.x) < 4500 && Math.abs(q.y - P.y) < 4500 && Math.hypot(q.x - P.x, q.y - P.y) < 4000);
        drawRocks(g, nearR, (x, y) => [cx + (x - P.x) * kk, cy + (y - P.y) * kk], kk, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, { minR: 1.5, mark: true });
        g.unclip();
        if (nearR.length) g.text(cx, cy + R - 50, 'ROCKS WITHIN 4K', 11, C.TAN, 'center');
      }
    }
    const dr = des * DEG;
    g.tri(cx + Math.sin(dr) * (R + 1), cy - Math.cos(dr) * (R + 1), cx + Math.sin(dr - 0.07) * (R - 22), cy - Math.cos(dr - 0.07) * (R - 22),
      cx + Math.sin(dr + 0.07) * (R - 22), cy - Math.cos(dr + 0.07) * (R - 22), P.autopilot ? C.VIOLET : C.WHITE);
    const hr = P.hdg * DEG;
    g.line(cx, cy, cx + Math.sin(hr) * (R - 32), cy - Math.cos(hr) * (R - 32), C.ORANGE, 3);
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, L.BIG / 520, P.hdg);
    // where we're really going: with momentum the track can differ from the heading
    const vs = Math.hypot(P.vx || 0, P.vy || 0), trk = vs > 2 ? (Math.atan2(P.vx, -P.vy) / DEG + 360) % 360 : null;
    if (trk !== null && !P.warping) {
      const tr = trk * DEG, tx = cx + Math.sin(tr) * (R - 44), ty = cy - Math.cos(tr) * (R - 44);
      g.circle(tx, ty, 9, '#78f0ff', false, 2); g.circle(tx, ty, 2.5, '#78f0ff');
      g.line(tx, ty - 9, tx, ty - 15, '#78f0ff', 2); g.line(tx - 9, ty, tx - 15, ty, '#78f0ff', 2); g.line(tx + 9, ty, tx + 15, ty, '#78f0ff', 2);
    }
    g.text(L.bx + 2, L.by, 'HDG ' + pad3(P.hdg), 19, C.ORANGE);
    g.text(L.bx + 2, L.by + 22, 'CRS ' + pad3(des), 19, P.autopilot ? C.VIOLET : C.WHITE);
    if (P.autopilot) g.text(L.bx + 2, L.by + 45, ['', 'AUTOPILOT: WAYPOINT', 'AUTOPILOT: INTERCEPT', 'AUTOPILOT: ESCORT'][P.autopilot], 12, C.VIOLET);
    g.text(L.bx + L.BIG - 2, L.by, P.warping ? warpTxt(P) : Math.round(P.speed) + ' KM/S', 19, C.SKY, 'right');
    g.text(L.bx + L.BIG - 2, L.by + 22, 'SECTOR ' + sectorName(P.x, P.y), 13, C.GREY_TXT, 'right');
    if (P.evasive) g.text(L.bx + 2, L.by + 60, 'EVASIVE MANOEUVRES', 12, flash(400) ? C.YELLOW : C.ORANGE);
    if (trk !== null && !P.warping) {
      const drift = Math.abs(angDiff(P.hdg, trk));
      g.text(L.bx + L.BIG - 2, L.by + 40, `TRACK ${pad3(Math.round(trk))}`, 13, '#78f0ff', 'right');
      if (drift > 8 && !P.autoBrake) g.text(L.bx + L.BIG - 2, L.by + 56, `DRIFTING ${Math.round(drift)}° OFF THE BOW`, 11, flash(500) ? C.YELLOW : '#78f0ff', 'right');
    }
    if (!P.orb) g.text(L.bx + L.BIG / 2, L.by + L.BIG - 14, 'DRAG THE RING TO SET COURSE', 12, C.GREY_TXT, 'center');
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
    const nl = ['<<10', '<1', '1>', '10>>'], nv = [-10, -1, 1, 10], nw = (L.uw - 30) / 6;
    nl.forEach((l, i) => g.button('nud' + i, L.ux + i * (nw + 6), L.uy, nw, L.uh, l, C.LILAC, C.BLACK, 16, () => {
      const base = P.autopilot ? P.hdg : P.desHdg;
      app.send(CMD.HEADING, 0, 0, Math.round(wrap360(base + nv[i])));
    }));
    const hot = P.jumpPlot !== K.NO_ID || P.jumpTo !== K.NO_ID;
    g.button('hpage', L.ux + 4 * (nw + 6), L.uy, nw * 2 + 6, L.uh, this.page ? 'ENGINES' : 'AUTOPILOT / JUMP', this.page ? C.ORANGE : hot && flash(500) ? '#78f0ff' : C.SKY, C.BLACK, 15,
      () => { this.page = this.page ? 0 : 1; }, { sound: 'toggle' });
    drawOortWarn(g, { x: L.bx, y: L.by + 40, w: L.BIG, h: L.BIG * 0.5 }, P.oort);
    if (this.page === 1) { this.drawOrbit(g, w, L); this.drawAuto(g, w, app, L); return; }
    // ---- right column: impulse and warp sliders (their tops are set by engineering's power), stop, evasive, dock
    const x = L.rx, y0 = L.y0, sw = 72, sh = 246, gap = 10;
    const bx = x + 2 * sw + 2 * gap, bw = L.x1 - bx;
    const impCap = Math.max(0, P.impCap ?? K.IMPULSE_MAX), warpCap = Math.max(0, P.warpCap ?? K.WARP_MAX);
    // impulse: the slider is in km/s; we send the throttle as a share of what the engines can give
    const spd = S.thrDrag ? S.localThr : Math.max(0, P.throttle) / 100 * impCap;
    g.text(x + sw / 2, y0, 'IMPULSE', 13, C.PEACH, 'center');
    g.capSlider('thr', x, y0 + 20, sw, sh, spd, K.IMPULSE_TOP, impCap, C.ORANGE, 2, (v, final, start, over) => {
      if (start) { S.thrDrag = true; app.sound.tap(); }
      if (Math.floor(v / 20) !== Math.floor(S.localThr / 20)) app.sound.sliderTick();
      S.localThr = v; S.overImp = over ? performance.now() : S.overImp;
      const thr = impCap > 1 ? Math.round(clampf(v / impCap * 100, 0, 100)) : 0;
      if (final) { S.thrDrag = false; app.send(CMD.THROTTLE, 0, 0, thr); }
      else if (performance.now() - S.lastSend > 150) { S.lastSend = performance.now(); app.send(CMD.THROTTLE, 0, 0, thr); }
    }, S.thrDrag);
    g.text(x + sw / 2, y0 + sh + 26, Math.round(spd) + '', 19, C.PEACH, 'center');
    g.text(x + sw / 2, y0 + sh + 46, `MAX ${Math.round(impCap)}`, 11, C.GREY_TXT, 'center');
    // warp: 0 - 6, the reachable part set by warp power
    const wx = x + sw + gap, wv = S.warpDrag ? S.localWarp : P.warpSet;
    g.text(wx + sw / 2, y0, 'WARP', 13, P.warping ? C.SKY : C.PEACH, 'center');
    g.capSlider('wrp', wx, y0 + 20, sw, sh, wv, K.WARP_TOP, warpCap, P.warping ? C.SKY : C.YELLOW, 0.1, (v, final, start, over) => {
      if (start) { S.warpDrag = true; app.sound.tap(); }
      if (Math.floor(v) !== Math.floor(S.localWarp || 0)) app.sound.sliderTick();
      S.localWarp = v; if (over) S.overWarp = performance.now();
      if (final) { S.warpDrag = false; app.send(CMD.WARP, Math.round(v * 10), 1); }
      else if (performance.now() - S.lastSend > 200) { S.lastSend = performance.now(); app.send(CMD.WARP, Math.round(v * 10), 1); }
    }, S.warpDrag);
    g.text(wx + sw / 2, y0 + sh + 26, (Math.round(Math.min(wv, warpCap) * 10) / 10).toFixed(1), 19, P.warping ? C.SKY : C.PEACH, 'center');
    g.text(wx + sw / 2, y0 + sh + 46, `MAX ${warpCap.toFixed(1)}`, 11, C.GREY_TXT, 'center');
    // buttons
    let by = y0 + 20;
    g.button('stop', bx, by, bw, 42, P.allStop ? 'BRAKING...' : 'FULL STOP', P.allStop && flash(300) ? C.YELLOW : C.RED, C.BLACK, 19, () => app.send(CMD.STOP)); by += 48;
    // AUTO BRAKE: the flight computer cancels drift and brakes when the throttle is cut. Off = pure momentum.
    g.button('abrk', bx, by, bw, 34, P.autoBrake ? 'AUTO BRAKE: ON' : 'AUTO BRAKE: OFF', P.autoBrake ? '#78f0ff' : C.GREY, P.autoBrake ? C.BLACK : C.GREY_TXT, 15,
      () => app.send(CMD.AUTOBRAKE, P.autoBrake ? 0 : 1), { sound: 'toggle' }); by += 38;
    g.button('wdrop', bx, by, bw, 30, P.warpSet ? 'DROP TO IMPULSE' : 'AT IMPULSE', P.warpSet ? C.YELLOW : C.GREY, C.BLACK, 14, () => app.send(CMD.WARP, 0)); by += 34;
    g.button('rev', bx, by, bw, 30, P.throttle < 0 ? 'REVERSE: ON' : 'REVERSE', P.throttle < 0 ? C.RED : C.GREY, P.throttle < 0 ? C.BLACK : C.GREY_TXT, 15,
      () => app.send(CMD.THROTTLE, 0, 0, P.throttle < 0 ? 0 : -25), { sound: 'toggle' }); by += 34;
    g.button('evade', bx, by, bw, 30, P.evasive ? 'EVASIVE: ON' : 'EVASIVE: OFF', P.evasive ? C.YELLOW : C.GREY, P.evasive ? C.BLACK : C.GREY_TXT, 15,
      () => app.send(CMD.EVASIVE, P.evasive ? 0 : 1), { sound: 'toggle' }); by += 34;
    const st = nearestStation(w), db = st ? st.d : 1e9;
    let dl = 'DOCK', dc = db < K.DOCK_RANGE ? C.GREEN : C.GREY;
    if (P.dock === 1) { dl = `DOCKING ${Math.round(P.dockT / K.DOCK_TIME_S * 100)}%`; dc = C.YELLOW; }
    else if (P.dock === 2) { dl = 'UNDOCK'; dc = C.LILAC; }
    g.button('dock', bx, by, bw, 30, dl, dc, C.BLACK, 16, () => app.send(P.dock === 2 ? CMD.UNDOCK : CMD.DOCK)); by += 36;
    // status lines
    g.progress(bx, by, bw, 8, P.warpCharge, C.SKY); by += 14;
    let ws = P.warping ? 'AT ' + warpTxt(P) : P.warpSet ? 'WARP CHARGING...' : 'WARP DRIVE READY';
    if (P.health[K.S_WARP] <= 0) ws = 'WARP DRIVE OFFLINE';
    else if (P.orb && P.orb.alt < w.sys.planets[P.orb.pl].r * 3.5 && !P.warping) ws = 'TOO DEEP IN A GRAVITY WELL FOR WARP';
    g.textFit(bx, by, ws, 12, P.health[K.S_WARP] <= 0 ? C.RED : C.GREY_TXT, 'left', bw); by += 16;
    const now = performance.now();
    if (now - (S.overWarp || 0) < 2500 || now - (S.overImp || 0) < 2500) g.wrap(bx, by, bw, 'THE GREY ZONE NEEDS MORE POWER - ASK ENGINEERING.', 12, flash(300) ? C.YELLOW : C.ORANGE, 1.2, 2);
    else if (db < 6000 && !P.dock) g.wrap(bx, by, bw, `${st.n.short || 'STATION'} ${fmtDist(db)} - DOCK < 1.8K, < 25 KM/S, SHIELDS DOWN`, 11, C.GREY_TXT, 1.2, 2);
    this.drawOrbit(g, w, L);
    if (P.jumpTo !== K.NO_ID) g.text(L.bx + 2, L.by + 76, P.jumping > 0 ? 'IN THE JUMP LANE' : `JUMP CHARGING ${Math.round(P.jumpCharge * 100)}%`, 13, flash(400) ? C.WHITE : C.SKY);
    else if (P.jumpPlot !== K.NO_ID) g.text(L.bx + 2, L.by + 76, 'JUMP PLOTTED - SEE AUTOPILOT / JUMP', 12, '#78f0ff');
    if (w.flux >= 0) g.text(L.bx + L.BIG - 2, L.by + 40, `TACHYON FLUX ${w.flux}%`, 15, w.flux >= 85 ? C.GREEN : C.YELLOW, 'right');
  },
  // gravity well readout in the compass corner: what helm needs to get into (and stay in) orbit
  drawOrbit(g, w, L) {
    const P = w.P, o = P.orb;
    if (!o) return;
    const pl = w.sys.planets[o.pl]; if (!pl) return;
    const x = L.bx + 2, y = L.by + 96; // top-left corner, clear of the compass labels
    const stc = [C.GREY_TXT, C.GREEN, C.RED, C.YELLOW][o.st];
    g.text(x, y, `${pl.name} GRAVITY WELL`, 13, '#78f0ff');
    g.text(x, y + 16, `ALT ${fmtDist(o.alt)}   ORBIT SPEED HERE ${o.vc}`, 12, C.PEACH);
    g.text(x, y + 32, O.ORB_NAME[o.st] + (o.st === O.ORB_STABLE && !o.coast ? ' - CUT ENGINES TO HOLD IT' : ''), 12, o.st === O.ORB_DESCENT && flash(300) ? C.WHITE : stc);
    if (o.st !== O.ORB_ESCAPE) g.text(x, y + 48, `LOW ${fmtDist(Math.max(0, o.peri))}  HIGH ${o.apo < 0 ? '--' : fmtDist(o.apo)}`, 11, C.GREY_TXT);
    else g.text(x, y + 48, Math.round(P.speed) > o.vc * 1.3 ? 'TOO FAST TO BE CAUGHT - SLOW DOWN' : 'FLY ACROSS THE PULL AT ORBIT SPEED', 11, C.GREY_TXT);
  },
  // the second page: autopilot and the jump drive
  drawAuto(g, w, app, L) {
    const P = w.P, x = L.rx, rw = L.x1 - L.rx;
    let y = L.y0;
    g.header(x, y, rw, 'AUTOPILOT', C.VIOLET);
    y += 26;
    const wpOn = P.autopilot === K.AP_WAYPOINT;
    const wpTxt = P.wpValid ? `WAYPOINT ${sectorName(P.wpx, P.wpy)}  ${fmtDist(distTo(P.x, P.y, P.wpx, P.wpy))}` : 'NO WAYPOINT - NAV SETS ONE';
    g.text(x, y, wpTxt, 13, P.wpValid ? C.PEACH : C.GREY_TXT);
    g.button('apwp', x + rw - 150, y - 4, 150, 30, wpOn ? 'ON COURSE' : 'SET COURSE', wpOn ? C.VIOLET : P.wpValid ? C.ORANGE : C.GREY, C.BLACK, 15,
      () => app.send(CMD.AUTOPILOT, wpOn ? K.AP_OFF : K.AP_WAYPOINT));
    y += 34;
    const icId = w.findC(P.icPlot) ? P.icPlot : w.findC(P.target) ? P.target : K.NO_ID;
    const icOn = P.autopilot === K.AP_TARGET;
    g.text(x, y, icId !== K.NO_ID ? `INTERCEPT ${w.shortName(icId)}  ${fmtDist(w.range(w.findC(icId)))}` : 'NO INTERCEPT PLOTTED', 13, icId !== K.NO_ID ? C.PEACH : C.GREY_TXT);
    g.button('apic', x + rw - 150, y - 4, 150, 30, icOn ? 'INTERCEPTING' : 'INTERCEPT', icOn ? C.VIOLET : icId !== K.NO_ID ? C.ORANGE : C.GREY, C.BLACK, 15,
      () => { if (icOn) app.send(CMD.AUTOPILOT, K.AP_OFF); else if (icId !== K.NO_ID) app.send(CMD.AUTOPILOT, K.AP_TARGET, icId); else app.sound.denied(); });
    y += 34;
    // escort: hold station beside a friendly or neutral ship (the plotted intercept, or the tactical target)
    const esc = icId !== K.NO_ID && w.findC(icId) && w.findC(icId).faction !== K.F_HOSTILE ? icId : K.NO_ID, escOn = P.autopilot === K.AP_ESCORT;
    g.text(x, y, escOn ? `ESCORTING ${w.shortName(P.apTarget)} - HOLDING 900M OFF HER STARBOARD SIDE` : esc !== K.NO_ID ? `ESCORT ${w.shortName(esc)} - MATCH HER COURSE AND SPEED` : 'ESCORT: NAV PLOTS A FRIENDLY SHIP', 12, escOn ? C.VIOLET : esc !== K.NO_ID ? C.PEACH : C.GREY_TXT);
    g.button('apesc', x + rw - 150, y - 4, 150, 30, escOn ? 'ESCORTING' : 'ESCORT', escOn ? C.VIOLET : esc !== K.NO_ID ? C.ORANGE : C.GREY, C.BLACK, 15,
      () => { if (escOn) app.send(CMD.AUTOPILOT, K.AP_OFF); else if (esc !== K.NO_ID) app.send(CMD.AUTOPILOT, K.AP_ESCORT, esc); else app.sound.denied(); });
    y += 34;
    g.button('apoff', x, y, rw, 30, P.autopilot ? 'AUTOPILOT OFF - HAND STEERING' : 'HAND STEERING', P.autopilot ? C.LILAC : C.GREY, C.BLACK, 15, () => app.send(CMD.AUTOPILOT, K.AP_OFF));
    y += 44;
    // ---- jump drive
    g.header(x, y, rw, 'JUMP DRIVE', '#78f0ff');
    y += 26;
    const to = P.jumpTo !== K.NO_ID ? P.jumpTo : P.jumpPlot;
    if (to === K.NO_ID) {
      g.wrap(x, y, rw, 'NO JUMP PLOTTED. NAV PLOTS A JUMP ON THE GALAXY CHART; THEN HELM ALIGNS THE SHIP TO THE JUMP VECTOR AND ENGAGES.', 13, C.GREY_TXT, 1.25, 4);
      return;
    }
    const v = P.jumpVec >= 0 ? P.jumpVec : 0, off = Math.round(Math.abs(angDiff(P.hdg, v)));
    g.text(x, y, sysAt(to).name, 20, '#78f0ff', 'left', true);
    y += 26;
    g.text(x, y, `JUMP VECTOR ${pad3(v)}   HEADING ${pad3(P.hdg)}`, 15, C.PEACH);
    g.text(x + rw, y, off <= 5 ? 'ALIGNED' : `${off}° OFF`, 15, off <= 5 ? C.GREEN : C.YELLOW, 'right');
    y += 24;
    g.button('jalign', x, y, rw, 32, 'ALIGN TO THE JUMP VECTOR', off <= 5 ? C.GREY : C.SKY, C.BLACK, 16, () => { if (P.evasive) app.send(CMD.EVASIVE, 0); app.send(CMD.HEADING, 0, 0, v); });
    y += 40;
    const why = (w.slow && w.slow.jumpWhy && w.slow.jumpWhy[to]) || '';
    const by = L.y1 - 44;
    if (P.jumping > 0) {
      g.text(x, by - 22, `IN THE JUMP LANE - ARRIVING IN ${Math.ceil(P.jumping)}s`, 14, flash(400) ? C.WHITE : C.SKY);
      g.button('jgo', x, by, rw, 42, 'JUMPING...', C.GREY, C.GREY_TXT, 20, () => {}, { silent: true });
    } else if (P.jumpTo !== K.NO_ID) {
      g.progress(x, by - 18, rw, 10, P.jumpCharge, '#78f0ff');
      g.text(x, by - 36, `CHARGING ${Math.round(P.jumpCharge * 100)}% - HOLD THE VECTOR`, 13, C.YELLOW);
      g.button('jgo', x, by, rw, 42, 'ABORT JUMP', C.RED, C.BLACK, 20, () => app.send(CMD.JUMP, K.NO_ID));
    } else {
      g.wrap(x, y, rw, why || 'READY. ENGAGE WHEN YOU ARE.', 13, why ? C.YELLOW : C.GREEN, 1.2, 3);
      g.button('jgo', x, by, rw, 42, 'ENGAGE JUMP DRIVE', why ? C.GREY : C.ORANGE, why ? C.GREY_TXT : C.BLACK, 20,
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
export const nav = {
  zoom: 0, gsel: -1, zf: 1, zDrag: false, // zf: map zoom 0 (8k across, centred on us) .. 1 (the whole system)
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
      const M = 9000; // the system view shows a strip of the Oort cloud round the grid
      const FULL = SYS_SIZE + 2 * M, span = Math.exp(Math.log(8000) + (Math.log(FULL) - Math.log(8000)) * clampf(this.zf, 0, 1));
      const local = span < 60000; // close in: bigger symbols, finer grid
      k = B / span;
      x0 = clampf(P.x - span / 2, -M, FULL - M - span); y0 = clampf(P.y - span / 2, -M, FULL - M - span);
      const p2 = (wx, wy) => [ox + (wx - x0) * k, oy + (wy - y0) * k];
      const gs = [1000, 2000, 4000, 8000, SYS_SIZE / 10].find((v) => span / v <= 12) || SYS_SIZE / 10;
      const [gx0, gy0] = p2(0, 0), [gx1, gy1] = p2(SYS_SIZE, SYS_SIZE);
      for (let gx = Math.max(0, Math.floor(x0 / gs) * gs); gx < Math.min(SYS_SIZE + 1, x0 + B / k); gx += gs) g.rect(p2(gx, 0)[0], Math.max(oy, gy0), 1, Math.min(oy + B, gy1) - Math.max(oy, gy0), '#121832');
      for (let gy = Math.max(0, Math.floor(y0 / gs) * gs); gy < Math.min(SYS_SIZE + 1, y0 + B / k); gy += gs) g.rect(Math.max(ox, gx0), p2(0, gy)[1], Math.min(ox + B, gx1) - Math.max(ox, gx0), 1, '#121832');
      drawOortFrame(g, p2, { x: ox, y: oy, w: B, h: B }, w.tSec);
      if (span >= FULL * 0.98) for (let i = 0; i < 10; i++) {
        const cw = (gx1 - gx0) / 10;
        g.text(gx0 + i * cw + cw / 2, oy + 2, String.fromCharCode(65 + i), 10, C.GRID, 'center');
        g.text(ox + 2, gy0 + i * cw + cw / 2 - 6, String(i + 1), 10, C.GRID);
      }
      drawSystemLayer(g, w.sys, w.tSec, p2, k, { minR: local ? 3 : 2.5, well: true, dots: local ? 1 : 0.7 });
      if (P.orbPlot >= 0 && w.sys.planets[P.orbPlot]) {
        const [ppx, ppy] = p2(...planetPos(w.sys, P.orbPlot, w.tSec));
        g.ctx.save(); g.ctx.setLineDash([3, 3]); g.circle(ppx, ppy, w.sys.planets[P.orbPlot].r * 2.5 * k, '#78f0ff', false, 1); g.ctx.restore();
      }
      drawCampLines(g, w, p2);
      { const rk = w.rocks(); if (rk.length) drawRocks(g, rk, p2, k, { x: ox, y: oy, w: B, h: B }, { minR: local ? 1 : 0.6, mark: true }); }
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
        if (c.rk !== undefined) { /* drawn with the rocks */ }
        else if (c.type === K.CT_STARBASE) drawStation(g, c.kind ?? 0, sx, sy, local ? 0.3 : 0.13, w.now, c.civ);
        else if (c.type === K.CT_POI) drawPoi(g, c.kind ?? 0, sx, sy, local ? 0.22 : 0.1, w.now, (c.civ ?? 0) * 0.7);
        else if (c.type === K.CT_BUOY || c.type === K.CT_GROUND) drawContact(g, c.type, sx, sy, local ? 0.12 : 0.08, c.hdg, w.now);
        else g.circle(sx, sy, 3.5, col);
        g.text(sx + 8, sy + 3, w.shortName(c.id, c.known), 11, col);
      }
      drawShip(g, ART_CRUISER, C.SKY, clampf(px, ox + 6, ox + B - 6), clampf(py, oy + 6, oy + B - 6), local ? 0.18 : 0.12, P.hdg);
      g.text(ox + B - 4, oy + B - 15, 'TAP MAP = WAYPOINT, TAP A PLANET = ORBIT', 11, C.GREY_TXT, 'right');
      g.text(ox + 4, oy + B - 15, `${Math.round(span / 1000)}K ACROSS`, 11, C.GREY_TXT);
      g.hit(ox, oy, B, B, { down: (x, y) => {
        app.sound.toggle();
        // a tap on (or near) a planet plots its orbit insertion point
        for (let i = 0; i < w.sys.planets.length; i++) {
          const [sx, sy] = p2(...planetPos(w.sys, i, w.tSec));
          if (Math.hypot(x - sx, y - sy) < Math.max(14, w.sys.planets[i].r * 2 * k)) { app.send(CMD.PLOT, 2, i); return; }
        }
        app.send(CMD.WAYPOINT, 1, 0, Math.round(x0 + (x - ox) / k), Math.round(y0 + (y - oy) / k));
      } });
      drawOortWarn(g, { x: ox, y: oy, w: B, h: B }, P.oort);
    }
    g.unclip();
    g.strokeRect(ox, oy, B, B, C.GRID);
    // under
    // under: the zoom slider (in close .. whole system), the galaxy chart, clear waypoint
    const bw = (L.uw - 18) / 4, zx = L.ux, zw = bw * 2 + 6, gal = this.zoom === 2;
    g.rrect(zx, L.uy, zw, L.uh, L.uh / 2, gal ? '#1a1a2a' : '#262640');
    g.text(zx + 12, L.uy + L.uh / 2 - 7, 'ZOOM', 13, gal ? C.GREY_TXT : C.VIOLET);
    const tx0 = zx + 62, tx1 = zx + zw - 18, ty = L.uy + L.uh / 2;
    g.rect(tx0, ty - 2, tx1 - tx0, 4, C.GREY);
    const kx = tx0 + (tx1 - tx0) * clampf(this.zf, 0, 1);
    g.rect(tx0, ty - 2, kx - tx0, 4, C.VIOLET);
    g.circle(kx, ty, this.zDrag ? 13 : 11, this.zDrag ? C.WHITE : C.VIOLET);
    g.text(tx0 - 2, ty + 8, 'IN', 9, C.GREY_TXT, 'center'); g.text(tx1, ty + 8, 'SYSTEM', 9, C.GREY_TXT, 'center');
    const setZ = (x) => { this.zf = clampf((x - tx0) / (tx1 - tx0), 0, 1); if (this.zoom === 2) this.zoom = 0; };
    g.hit(zx, L.uy, zw, L.uh, { down: (x) => { this.zDrag = true; app.sound.tap(); setZ(x); }, move: (x) => setZ(x), up: (x) => { this.zDrag = false; setZ(x); } });
    g.button('z2', L.ux + 2 * (bw + 6), L.uy, bw, L.uh, gal ? 'BACK TO MAP' : 'GALAXY', gal ? C.VIOLET : C.GREY, C.BLACK, 17, () => { this.zoom = gal ? 0 : 2; });
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
    g.rrect(x, y, rw, 38, 19, ap ? C.VIOLET : '#1c1c2c');
    g.text(x + rw / 2, y + 9, ap ? 'HELM HAS US ON COURSE' : P.wpValid ? 'COURSE PLOTTED - HELM ENGAGES AUTOPILOT' : 'NO COURSE PLOTTED', 15, ap ? C.BLACK : C.PEACH, 'center');
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
      g.text(x, y, 'ORBIT INSERTION (THEN HELM SLOWS DOWN AND CUTS ENGINES)', 11, C.GREY_TXT);
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
      g.progress(x, by - 18, rw, 10, 1 - P.jumping / K.JUMP_TRANSIT_S, C.SKY);
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
    const nArt = (P.arts || []).length, unread = (P.arts || []).some((h) => !h.ident);
    const hx = L.ux + 5 * (bw + 6), hw = L.ux + L.uw - hx;
    g.button('hold', hx, L.uy, hw, L.uh, this.hold ? '< BACK TO SENSORS' : `CARGO HOLD${nArt ? ' (' + nArt + ')' : ''}`, this.hold ? C.ORANGE : unread && flash(600) ? C.YELLOW : C.LILAC, C.BLACK, 18, () => { this.hold = !this.hold; }, { sound: 'toggle', bold: true });
    if (this.hold) { this.drawHold(g, w, app, L); return; }
    if (this.sel !== K.NO_ID && !w.findC(this.sel)) this.sel = K.NO_ID;
    drawRadar(g, w, cx, cy, R, SCI_RANGE[this.rangeI], false, this.sel, true);
    g.text(L.bx, L.by, 'N ^  SENSOR SWEEP', 12, C.GREY_TXT);
    if (P.lrs > 0) g.text(L.bx + B, L.by, `LONG RANGE SCAN ${Math.ceil(P.lrs)}s`, 12, C.YELLOW, 'right');
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
    g.text(x, by - 18, `SENSORS ${Math.round(P.health[K.S_SENSORS])}% HEALTH, ${P.power[K.S_SENSORS]}% POWER`, 12, P.health[K.S_SENSORS] < 50 ? C.RED : C.GREY_TXT);
    const hw = (rw - 6) / 2;
    g.button('sview', x, by, hw, 36, 'ON VIEWER', C.ORANGE, C.BLACK, 17, () => app.send(CMD.VIEW, K.VM_TARGET, c.id));
    const ic = P.icPlot === c.id;
    g.button('sint', x + hw + 6, by, hw, 36, ic ? 'PLOTTED FOR HELM' : 'PLOT INTERCEPT', ic ? C.VIOLET : C.LILAC, C.BLACK, 16,
      () => app.send(CMD.PLOT, 1, ic ? K.NO_ID : c.id));
  },
  // assembling the relic ring: tap two shards to swap them, FLIP the selected one, then ALIGN
  drawRingPage(g, w, app, L, ring) {
    const box = { x: L.x0 + 8, y: L.y0, w: L.x1 - L.x0 - 16, h: L.uy - L.y0 - 84 };
    g.header(box.x, box.y, box.w - 140, 'RELIC RING - FIT THE SHARDS EDGE TO EDGE', C.ORANGE);
    g.button('ringx', box.x + box.w - 132, box.y - 2, 132, 24, '< BACK TO HOLD', C.LILAC, C.BLACK, 13, () => { this.ringMode = false; }, { sound: 'toggle' });
    if (this.rsel >= ring.order.length) this.rsel = -1;
    drawRing(g, w, ring, { x: box.x, y: box.y + 30, w: box.w, h: box.h - 30 }, 1, app, this.rsel ?? -1, (sl) => {
      app.sound.toggle();
      if (this.rsel === undefined || this.rsel < 0) this.rsel = sl;
      else if (this.rsel === sl) this.rsel = -1;
      else { app.send(CMD.LAB, 5, this.rsel, sl); this.rsel = -1; }
    });
    const by = L.uy - 52, bw = (box.w - 18) / 4, sel = this.rsel ?? -1;
    g.text(box.x, by - 18, sel >= 0 ? 'TAP ANOTHER SHARD TO SWAP, OR FLIP THIS ONE' : 'TAP A SHARD TO PICK IT UP', 12, C.GREY_TXT);
    g.button('rflip', box.x, by, bw, 40, 'FLIP SHARD', sel >= 0 && !ring.solved ? C.LILAC : C.GREY, C.BLACK, 16, () => { if (sel >= 0) { app.send(CMD.LAB, 7, sel); } else app.sound.denied(); });
    g.button('rlock', box.x + bw + 6, by, bw * 2 + 6, 40, ring.solved ? 'RING ALIGNED' : 'ALIGN THE RING', ring.solved ? C.GREEN : C.ORANGE, C.BLACK, 18, () => app.send(CMD.LAB, 6), { bold: true });
    const shown = w.view === K.VM_LAB;
    g.button('rview', box.x + 3 * (bw + 6), by, bw, 40, shown ? 'ON VIEWER' : 'TO VIEWER', shown ? C.ORANGE : C.SKY, C.BLACK, 16, () => app.send(CMD.LAB, 4, 0));
  },
  drawPoiPanel(g, w, app, L, c, y) {
    const P = w.P, x = L.rx, rw = L.rw, d = w.range(c);
    if (c.rk !== undefined) { // a loose boulder: what it's made of, which phaser frequency cracks it, and the tractor beam
      const comp = ['ICE', 'IRON', 'CRYSTAL'][c.rk], col = BOULDER_COL[c.rk];
      g.rect(x, y, 14, 14, col);
      g.text(x + 20, y, `${['BLUE', 'RUST-RED', 'VIOLET'][c.rk]} BOULDER - ${c.speed} KM/S`, 14, col); y += 20;
      if (c.scan >= 2) { g.text(x, y, `${comp}: PHASER FREQUENCY ${K.FREQ_CHAR[c.freq]} BREAKS IT`, 15, C.YELLOW, 'left', true); y += 20; g.text(x, y, `TRACTOR IT IN FOR ${['ICE', 'ORE', 'CRYSTAL'][c.rk]}`, 13, C.SKY); y += 18; }
      else { g.text(x, y, 'SCAN IT TO FIND ITS PHASER FREQUENCY', 13, C.YELLOW); y += 18; }
      const tr = (w.rocks().find((q) => q.nid === c.id) || {}).tr;
      g.button('ext', x, L.y1 - 38, rw, 36, tr ? 'TRACTOR LOCKED - TAP TO RELEASE' : d <= 3500 ? 'TRACTOR BEAM' : `TRACTOR BEAM (GET WITHIN 3.5K)`, tr ? C.YELLOW : d <= 3500 ? C.ORANGE : C.GREY, C.BLACK, 17, () => app.send(CMD.EXTRACT, c.id));
      return;
    }
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
    const cp = w.slow && w.slow.camp, ring = cp && cp.ring;
    if (ring && this.ringMode) { this.drawRingPage(g, w, app, L, ring); return; }
    let x = L.bx, y = L.by;
    g.header(x, y, ring ? B - 132 : B, 'ARTEFACT HOLD', C.LILAC);
    if (ring) g.button('ringm', x + B - 126, y - 2, 126, 24, ring.solved ? 'THE RING' : 'ASSEMBLE RING', ring.solved ? C.GREEN : flash(700) ? C.YELLOW : C.ORANGE, C.BLACK, 13, () => { this.ringMode = true; }, { sound: 'toggle' });
    y += 28;
    if (!arts.length) g.wrap(x, y, B, 'NOTHING HERE YET. TRACTOR IN WRECKS, DERELICTS, RUINS AND CAPSULES TO FIND ARTEFACTS. A FULL SCAN SHOWS WHETHER SOMETHING IS INSIDE.', 13, C.GREY_TXT);
    if (this.artSel >= arts.length) this.artSel = Math.max(0, arts.length - 1);
    const per = Math.max(1, Math.floor((B - 100) / 32)), first = Math.max(0, Math.min(this.artSel - per + 1, arts.length - per));
    arts.forEach((h, i) => {
      if (i < first || i >= first + per) return;
      const d = ART[h.a], sel = i === this.artSel;
      const col = !h.ident ? C.GREY : d.cursed ? C.RED : h.on ? C.GREEN : h.ident >= 2 ? C.LILAC : C.SKY;
      const nm = h.ident ? d.name : d.unk;
      g.button('art' + h.uid, x, y, B, 28, (sel ? '> ' : '') + nm + (h.ident ? (h.on ? '  [ACTIVE]' : '') : '  (?)'), sel ? col : dim(col, 0.6), C.BLACK, 15, () => { this.artSel = i; }, { sound: 'toggle' });
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
export function drawMsgLog(g, w, x, y, wd, y1, size = 13) {
  g.header(x, y, wd, 'MESSAGE LOG', C.LILAC);
  y += 26;
  const msgs = w.msgs;
  if (!msgs.length) g.text(x, y + 4, 'NO MESSAGES YET', 12, C.GREY_TXT);
  for (let i = 0; i < msgs.length && y < y1 - size; i++) {
    const m = msgs[i];
    const col = i === 0 ? K.MSG_COL[m.col % 4] : dim(K.MSG_COL[m.col % 4], 0.7);
    g.textFit(x, y, (m.who && CHARS[m.who] ? CHARS[m.who].name : fromName(w, m.from)) + (m.lang ? '  (TRANSLATED)' : ''), 12, i === 0 ? C.ORANGE : C.TAN, 'left', wd);
    const lines = g.wrapLines(subtitle(m.text), wd - 8, size);
    y += 14;
    for (const l of lines) { if (y > y1 - size) break; g.text(x + 6, y, l, size, col); y += size * 1.2; }
    y += 5;
  }
}
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
    const dl = dialogLine(w);
    if (dl) {
      const { d, m } = dl, ch = CHARS[d.who] || CHARS.computer, ph = 92;
      drawPortrait(g, d.who, x, y, ph * 0.9, ph, performance.now(), true);
      g.textFit(x + ph, y + 2, ch.name, 18, C.PEACH, 'left', rw - ph, true);
      g.textFit(x + ph, y + 24, ch.role || '', 12, C.GREY_TXT, 'left', rw - ph);
      if (m.lang) g.text(x + ph, y + 42, 'AUTO-TRANSLATED', 11, C.LILAC);
      if (d.left) g.text(x + rw, y + 42, `ANSWER IN ${d.left}s`, 13, flash(400) ? C.RED : C.YELLOW, 'right');
      y = g.wrap(x + ph, y + 58, rw - ph, subtitle(m.text), 13, C.WHITE, 1.2, 4);
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
    // surface sites first (only seen in a planet's gravity well; they answer from a standard orbit)
    const all = w.contacts().filter((c) => c.alive), ground = all.filter((c) => c.type === K.CT_GROUND);
    const list = ground.concat(all.filter((c) => c.type !== K.CT_GROUND)).slice(0, 5);
    if (this.sel !== K.NO_ID && !list.some((c) => c.id === this.sel)) this.sel = K.NO_ID;
    if (!list.length) g.text(x, y + 4, 'NO CONTACTS IN RANGE', 12, C.GREY_TXT);
    const P = w.P, orbPl = P.orbitPl;
    for (const c of list) {
      const sel = this.sel === c.id, gr = c.type === K.CT_GROUND;
      const ok = !gr || (orbPl >= 0 && P.orb && P.orb.pl === orbPl);
      const lab = gr ? `SURFACE: ${c.short || w.shortName(c.id, true)}${ok ? '' : ' (NEED ORBIT)'}` : `${w.shortName(c.id, c.known)}  ${fmtDist(w.range(c))}`;
      g.button('hail' + c.id, x, y, rw, 28, lab, sel ? (gr ? '#a0c8b4' : factionColor(c.faction)) : gr ? '#2c4a40' : C.GREY, sel ? C.BLACK : gr ? '#a0c8b4' : C.GREY_TXT, gr ? 14 : 16,
        () => { this.sel = c.id; }, { sound: 'toggle' });
      y += 32;
    }
    y = Math.max(y, L.y0 + 24 + 5 * 32) + 4;
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
