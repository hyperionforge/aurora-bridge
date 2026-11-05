// stations/tactical.js - TACTICAL, SHIELDS, ENGINEER, DAMAGE (port of tactical.h)
import * as K from '../config.js';
import { C, CMD } from '../config.js';
import { DEG, wrap360, angDiff, fmtDist, pad3, clampf } from '../util.js';
import { dim, flash, healthColor, lerpCol } from '../gfx.js';
import { drawShip, factionColor, ART_CRUISER } from '../ships.js';
import { drawRadar, radarPick } from './common.js';

// ============================================================================ TACTICAL
const TAC_RANGE = [5000, 10000, 20000];
export const tactical = {
  rangeI: 1,
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, cx = L.bx + B / 2, cy = L.by + B / 2, R = B / 2 - 4, range = TAC_RANGE[this.rangeI];
    const pr = Math.min(R, K.PH_RANGE / range * R);
    for (const s of [-1, 1]) { const a = s * K.PH_ARC * DEG; g.line(cx, cy, cx + Math.sin(a) * pr, cy - Math.cos(a) * pr, '#5a3214', 1.5); }
    g.circle(cx, cy, pr, '#5a3214', false, 1.5);
    drawRadar(g, w, cx, cy, R, range, true, P.target, false);
    g.text(L.bx, L.by, 'BOW UP - ORANGE = PHASER ARC / RANGE', 12, C.GREY_TXT);
    g.text(L.bx, L.by + B - 14, 'TAP A CONTACT TO TARGET IT', 12, C.GREY_TXT);
    g.hitCircle(cx, cy, R, { down: (x, y) => {
      const id = radarPick(w, x, y, cx, cy, R, range, true);
      if (id !== K.NO_ID) { app.sound.toggle(); app.send(CMD.TARGET, id); }
    } });
    const bw = (L.uw - 24) / 4.6;
    ['5K', '10K', '20K'].forEach((l, i) => g.button('tr' + i, L.ux + i * (bw + 6), L.uy, bw, L.uh, l, this.rangeI === i ? C.RED : C.GREY, C.BLACK, 17, () => { this.rangeI = i; }));
    g.button('clrt', L.ux + 3 * (bw + 6), L.uy, L.uw - 3 * (bw + 6), L.uh, 'CLEAR TARGET', C.RED_DIM, C.PEACH, 17, () => app.send(CMD.TARGET, K.NO_ID));

    const x = L.rx, rw = L.rw;
    let y = L.y0;
    const t = w.findC(P.target);
    const scan2 = !!(t && t.scan >= 2);
    if (!t || !t.alive) {
      g.text(x, y, 'NO TARGET', 20, C.GREY_TXT);
      g.text(x, y + 26, 'TAP A CONTACT ON THE RADAR', 12, C.GREY_TXT);
    } else {
      g.textFit(x, y, w.shortName(t.id, t.known), 20, factionColor(t.faction), 'left', rw);
      const d = w.range(t), rel = angDiff(P.hdg, w.bearing(t));
      g.text(x, y + 24, `RANGE ${fmtDist(d)}  BRG ${pad3(w.bearing(t))}`, 13, C.SKY);
      const inR = d <= K.PH_RANGE, inA = Math.abs(rel) <= K.PH_ARC;
      g.text(x, y + 40, inR ? 'IN PHASER RANGE' : 'OUT OF RANGE (6K)', 12, inR ? C.GREEN : C.RED);
      g.text(x + rw * 0.55, y + 40, inA ? 'IN ARC' : 'BEHIND US', 12, inA ? C.GREEN : C.RED);
      if (scan2) {
        g.text(x, y + 56, 'SHIELDS', 12, C.PEACH); g.bar(x + 56, y + 58, rw - 120, 8, t.shields, C.SKY);
        g.text(x, y + 69, 'HULL', 12, C.PEACH); g.bar(x + 56, y + 71, rw - 120, 8, t.hull, healthColor(t.hull));
        g.text(x + rw, y + 60, 'FREQ ' + K.FREQ_CHAR[t.freq], 15, C.GREEN, 'right');
      } else g.text(x, y + 60, 'FULL SCAN NEEDED (SCIENCE)', 13, C.YELLOW);
    }
    y += 88;
    g.text(x, y, 'AIM AT', 12, C.GREY_TXT);
    const sl = ['HULL', 'ENGINES', 'WEAPONS', 'SHIELDS'], sw = (rw - 18) / 4;
    sl.forEach((l, i) => {
      const sel = P.sub === i, en = i === 0 || scan2;
      g.button('sub' + i, x + i * (sw + 6), y + 14, sw, 28, l, sel ? C.RED : en ? C.GREY : C.SEG_OFF, sel ? C.BLACK : en ? C.GREY_TXT : C.GREY, 14, () => {
        if (i && !scan2) { app.sound.denied(); return; }
        app.send(CMD.SUB, i);
      }, { silent: i && !scan2 });
    });
    y += 50;
    g.text(x, y, 'PHASERS', 17, C.ORANGE, 'left', true);
    g.progress(x + 80, y + 4, rw - 80, 10, P.phCharge, P.phCharge >= 1 ? C.ORANGE : C.YELLOW);
    const ready = P.phCharge >= 1;
    g.button('fire', x, y + 22, rw - 96, 42, ready ? 'FIRE PHASERS' : 'CHARGING', ready ? C.ORANGE : C.GREY, ready ? C.BLACK : C.GREY_TXT, 20, () => app.send(CMD.FIRE_PH));
    g.button('auto', x + rw - 90, y + 22, 90, 42, P.autoFire ? 'AUTO\nON' : 'AUTO\nOFF', P.autoFire ? C.YELLOW : C.GREY, P.autoFire ? C.BLACK : C.GREY_TXT, 14,
      () => app.send(CMD.AUTOFIRE, P.autoFire ? 0 : 1), { sound: 'toggle' });
    y += 72;
    g.text(x, y, 'PHASER FREQUENCY', 12, C.GREY_TXT);
    const tf = t && scan2 ? t.freq : -1;
    if (tf >= 0) g.text(x + rw, y, tf === P.phFreq ? 'MATCHED +50%' : 'NOT MATCHED', 12, tf === P.phFreq ? C.GREEN : C.YELLOW, 'right');
    const fw = (rw - 24) / 5;
    for (let i = 0; i < 5; i++) {
      const sel = P.phFreq === i;
      const col = sel ? (i === tf ? C.GREEN : C.ORANGE) : i === tf ? C.GREEN_DIM : C.GREY;
      g.button('frq' + i, x + i * (fw + 6), y + 14, fw, 28, K.FREQ_CHAR[i], col, sel ? C.BLACK : C.PEACH, 17, () => app.send(CMD.PH_FREQ, i), { sound: 'toggle' });
    }
    y += 50;
    g.text(x, y, `TORPEDOES   PHOTON ${P.torps[0]}   QUANTUM ${P.torps[1]}`, 13, C.LILAC);
    y += 18;
    for (let tb = 0; tb < 2; tb++) {
      const s = P.tubeState[tb];
      let txt;
      if (s === K.TUBE_EMPTY) txt = `T${tb + 1}: EMPTY`;
      else if (s === K.TUBE_LOADED) txt = `T${tb + 1}: ${K.TORP_NAME[P.tubeType[tb]]} READY`;
      else txt = `T${tb + 1}: ${s === K.TUBE_LOADING ? K.TORP_NAME[P.tubeType[tb]] : 'UNLOADING'} ${P.tubeTimer[tb].toFixed(1)}s`;
      const bx = x + rw * 0.42, bwid = (x + rw - bx - 12) / 3.4;
      g.textFit(x, y + 6, txt, 16, s === K.TUBE_LOADED ? C.GREEN : s === K.TUBE_EMPTY ? C.GREY_TXT : C.YELLOW, 'left', rw * 0.42 - 4);
      const can = s === K.TUBE_EMPTY;
      g.button('lp' + tb, bx, y, bwid, 30, 'LOAD P', can && P.torps[0] ? C.LILAC : C.GREY, C.BLACK, 13, () => app.send(CMD.TUBE_LOAD, tb, 0));
      g.button('lq' + tb, bx + bwid + 6, y, bwid, 30, 'LOAD Q', can && P.torps[1] ? C.VIOLET : C.GREY, C.BLACK, 13, () => app.send(CMD.TUBE_LOAD, tb, 1));
      g.button('tf' + tb, bx + 2 * (bwid + 6), y, x + rw - (bx + 2 * (bwid + 6)), 30, s === K.TUBE_LOADED ? 'FIRE' : 'UNLOAD', s === K.TUBE_LOADED ? C.RED : C.GREY, C.BLACK, 16,
        () => app.send(s === K.TUBE_LOADED ? CMD.TUBE_FIRE : CMD.TUBE_UNLOAD, tb));
      y += 38;
    }
  },
};

// ============================================================================ SHIELDS (+ alert)
const SH_DIM = [25, 55, 140], SH_BRIGHT = [130, 225, 255];
export const shields = {
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, cx = L.bx + B / 2, cy = L.by + B / 2 + 6, R = B * 0.38;
    const raise = P.shieldRaise;
    const base = [270, 90, 180, 0];
    for (let q = 0; q < 4; q++) {
      const a = base[q], cap = P.shieldMax[q], v = P.shield[q];
      g.arcSeg(cx, cy, R + 2, R, wrap360(a - 40), wrap360(a + 40), C.GRID);
      if (v > 0.5) {
        const th = 3 + clampf(v / 160, 0, 1) * 14;
        g.arcSeg(cx, cy, R, R - th, wrap360(a - 40), wrap360(a + 40), raise >= 0.99 ? lerpCol(SH_DIM, SH_BRIGHT, clampf(v / 100, 0, 1)) : C.GREY);
      }
      const lbl = `${Math.round(v)}/${Math.round(cap)}`;
      if (q === K.Q_FORE) g.text(cx, L.by, `FORE ${lbl}`, 18, C.SKY, 'center');
      else if (q === K.Q_AFT) g.text(cx, L.by + B - 20, `AFT ${lbl}`, 18, C.SKY, 'center');
      else if (q === K.Q_PORT) { g.text(L.bx, cy - 30, 'PORT', 13, C.SKY); g.text(L.bx, cy - 15, lbl, 13, C.SKY); }
      else { g.text(L.bx + B, cy - 30, 'STBD', 13, C.SKY, 'right'); g.text(L.bx + B, cy - 15, lbl, 13, C.SKY, 'right'); }
    }
    for (const c of w.contacts()) { // threat markers, bow up
      if (!c.alive || c.faction !== K.F_HOSTILE) continue;
      const rel = angDiff(P.hdg, w.bearing(c)) * DEG;
      const tx = cx + Math.sin(rel) * (R + 14), ty = cy - Math.cos(rel) * (R + 14);
      const bx = cx + Math.sin(rel) * (R + 30), by = cy - Math.cos(rel) * (R + 30);
      g.tri(tx, ty, bx + Math.cos(rel) * 8, by + Math.sin(rel) * 8, bx - Math.cos(rel) * 8, by - Math.sin(rel) * 8, C.RED);
    }
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, B / 320, 0);
    if (raise < 0.99) g.text(cx, cy + 40, raise > 0 ? 'RAISING' : 'SHIELDS DOWN', 19, raise > 0 ? C.YELLOW : C.GREY_TXT, 'center');

    const x = L.rx, rw = L.rw;
    let y = L.y0;
    g.header(x, y, rw, 'SHIELDS', C.SKY);
    const on = P.shieldsOn;
    g.button('shtog', x, y + 24, rw, 48, on && raise < 0.99 ? `RAISING ${Math.round(raise * 100)}%` : on ? 'SHIELDS UP' : 'SHIELDS DOWN',
      on ? C.SKY : C.GREY, on ? C.BLACK : C.PEACH, 21, () => app.send(CMD.SHIELDS, on ? 0 : 1), { sound: 'toggle' });
    g.text(x, y + 78, `GENERATOR ${Math.round(P.health[K.S_SHIELDS])}% HEALTH  ${P.power[K.S_SHIELDS]}% POWER`, 12, P.health[K.S_SHIELDS] < 50 ? C.RED : C.GREY_TXT);
    g.text(x, y + 94, 'REINFORCE (MORE HERE, LESS OPPOSITE)', 12, C.GREY_TXT);
    const hw = (rw - 6) / 2;
    for (let i = 0; i < 5; i++) {
      const sel = P.reinforce === i;
      const bx = i === 0 ? x : x + ((i - 1) % 2) * (hw + 6), by = i === 0 ? y + 110 : y + 146 + Math.floor((i - 1) / 2) * 34, bw = i === 0 ? rw : hw;
      g.button('rf' + i, bx, by, bw, 30, K.RF_NAME[i], sel ? C.SKY : C.GREY, sel ? C.BLACK : C.GREY_TXT, 17, () => app.send(CMD.REINFORCE, i), { sound: 'toggle' });
    }
    y += 222;
    g.header(x, y, rw, 'ALERT', C.RED);
    const al = ['RED ALERT', 'YELLOW ALERT', 'STAND DOWN'], ac = [C.RED, C.YELLOW, C.GREEN];
    for (let i = 0; i < 3; i++) {
      const lvl = 2 - i;
      g.button('al' + i, x, y + 24 + i * 40, rw, 35, al[i], w.alert === lvl ? ac[i] : dim(ac[i], 0.35), C.BLACK, 19, () => app.send(CMD.ALERT, lvl));
    }
    g.text(x, L.y1 - 12, 'RED/YELLOW RAISE SHIELDS; STAND DOWN LOWERS THEM (NEEDED TO DOCK)', 11, C.GREY_TXT);
  },
};

// ============================================================================ ENGINEER - power, heat, coolant
const PRESET_NAME = ['BALANCE', 'COMBAT', 'CRUISE', 'SCIENCE'];
export const engineer = {
  drag: -1, local: 0, lastSend: 0,
  draw(g, w, app, L) {
    const P = w.P, cw = L.x1 - L.x0, colW = cw / K.NSYS, y0 = L.y0;
    for (let s = 0; s < K.NSYS; s++) {
      const x = L.x0 + s * colW, cwid = colW - 8;
      const lc = P.health[s] <= 0 ? C.RED : P.heat[s] >= 80 ? (flash(300) ? C.RED : C.ORANGE) : C.ORANGE;
      g.rrect(x, y0, cwid, 22, 11, lc);
      g.text(x + cwid / 2, y0 + 1, K.SYS_SHORT[s], 18, C.BLACK, 'center', true);
      const pw = this.drag === s ? this.local : P.power[s];
      const sx = x + cwid / 2 - 30;
      g.vslider('pw' + s, sx, y0 + 30, 60, 180, pw, 200, C.SKY, 10, (v, final, start) => {
        if (start) { this.drag = s; app.sound.tap(); }
        if (Math.floor(v / 50) !== Math.floor(this.local / 50)) app.sound.sliderTick();
        this.local = v;
        if (final) { this.drag = -1; app.send(CMD.POWER, s, v); }
        else if (performance.now() - this.lastSend > 150) { this.lastSend = performance.now(); app.send(CMD.POWER, s, v); }
      }, this.drag === s);
      g.rect(x + 6, y0 + 30 + 90, cwid - 12, 1.5, C.PEACH); // 100% mark
      g.text(x + cwid / 2, y0 + 214, pw + '%', 19, pw > 100 ? C.ORANGE : C.PEACH, 'center');
      const h = P.heat[s];
      g.bar(x, y0 + 240, cwid, 9, h, h > 80 ? C.RED : h > 50 ? C.ORANGE : C.YELLOW);
      g.text(x, y0 + 251, 'HEAT ' + Math.round(h) + '%', 12, h > 80 ? C.RED : C.GREY_TXT);
      const pip = (cwid - 9) / K.COOLANT_MAX;
      for (let i = 0; i < K.COOLANT_MAX; i++) g.rect(x + i * (pip + 3), y0 + 268, pip, 12, i < P.coolant[s] ? C.SKY : C.SEG_OFF);
      const bw = (cwid - 6) / 2;
      g.button('cm' + s, x, y0 + 285, bw, 30, '-', C.LILAC, C.BLACK, 22, () => { if (P.coolant[s]) app.send(CMD.COOLANT, s, P.coolant[s] - 1); });
      g.button('cp' + s, x + bw + 6, y0 + 285, bw, 30, '+', C.LILAC, C.BLACK, 22, () => {
        const used = P.coolant.reduce((a, b) => a + b, 0);
        if (used >= K.COOLANT_TOTAL || P.coolant[s] >= K.COOLANT_MAX) { app.sound.denied(); return; }
        app.send(CMD.COOLANT, s, P.coolant[s] + 1);
      });
      g.text(x, y0 + 318, 'HEALTH ' + Math.round(P.health[s]) + '%', 12, healthColor(P.health[s]));
    }
    // bottom strip
    const by = y0 + 342, rate = P.energyRate;
    const pwBtn = Math.min(92, (cw - 300) / 4 - 6);
    const ew = cw - 4 * (pwBtn + 6) - 10;
    g.text(L.x0, by - 2, `ENERGY ${Math.round(P.energy)} / ${K.ENERGY_MAX}   ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}/S`, 16, rate < 0 ? C.ORANGE : C.SKY);
    if (rate < 0) {
      const secs = Math.floor(P.energy / -rate);
      g.text(L.x0 + ew, by, `EMPTY IN ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 12, secs < 60 ? C.RED : C.ORANGE, 'right');
    }
    g.segBar(L.x0, by + 20, ew, 12, P.energy / 10, P.energy > 300 ? C.SKY : P.energy > 120 ? C.YELLOW : C.RED, 20);
    const used = P.coolant.reduce((a, b) => a + b, 0), total = P.power.reduce((a, b) => a + b, 0);
    g.text(L.x0, by + 36, `COOLANT ${K.COOLANT_TOTAL - used}/${K.COOLANT_TOTAL} FREE    TOTAL POWER ${total}%`, 12, C.GREY_TXT);
    for (let i = 0; i < 4; i++) g.button('pre' + i, L.x1 - (4 - i) * (pwBtn + 6) + 6, by + 6, pwBtn, 38, PRESET_NAME[i], C.TAN, C.BLACK, 16, () => app.send(CMD.PRESET, i), { sound: 'toggle' });
  },
};

// ============================================================================ DAMAGE CONTROL
const DBOX = [[10, 300], [262, 300], [262, 40], [10, 170], [262, 170], [10, 40]];
const DPT = [[-14, 52], [14, 52], [10, -60], [-50, 22], [50, 22], [-10, -60]];
export const damage = {
  draw(g, w, app, L) {
    const P = w.P, B = L.BIG, s = B / 392, cx = L.bx + B / 2, cy = L.by + B / 2;
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, 1.7 * s, 0, 0.55);
    const DBW = 120 * s, DBH = 50 * s;
    for (let i = 0; i < K.NSYS; i++) {
      const bx = L.bx + DBOX[i][0] * s, by = L.by + DBOX[i][1] * s;
      const px = cx + DPT[i][0] * 1.7 * s, py = cy + DPT[i][1] * 1.7 * s;
      const h = P.health[i];
      const col = h <= 0 ? (flash(300) ? C.RED : C.RED_DIM) : h < 100 ? healthColor(h) : C.GREEN_DIM;
      g.line(bx + DBW / 2, by + DBH / 2, px, py, dim(col, 0.7), 1.5);
      g.circle(px, py, 5, col);
      g.rrect(bx, by, DBW, DBH, 8, col);
      g.text(bx + DBW / 2, by + 3, K.SYS_NAME[i], 12, C.BLACK, 'center');
      g.text(bx + DBW / 2, by + 15, h > 0 ? Math.round(h) + '%' : 'OFFLINE', 19, C.BLACK, 'center', true);
      for (let t = 0; t < K.REPAIR_TEAMS; t++)
        if (P.team[t] === i) { g.rrect(bx + 4 + t * 28, by + DBH - 6, 24, 13, 6, C.WHITE); g.text(bx + 16 + t * 28, by + DBH - 6, 'T' + (t + 1), 11, C.BLACK, 'center'); }
      if (P.heat[i] >= 80) g.text(bx + DBW - 4, by + DBH - 15, 'HOT', 11, C.BLACK, 'right');
      g.hit(bx, by, DBW, DBH, { down: () => {
        if (P.health[i] >= 100) { app.sound.denied(); return; }
        let team = P.team.indexOf(K.NO_ID);
        if (team < 0) { // both busy: move the team on the healthiest system
          team = 0;
          for (let t = 1; t < K.REPAIR_TEAMS; t++) if (P.health[P.team[t]] > P.health[P.team[team]]) team = t;
          if (P.team[team] === i) team = (team + 1) % K.REPAIR_TEAMS;
        }
        app.sound.toggle();
        app.send(CMD.TEAM, team, i);
      } });
    }
    g.text(cx, L.by + B - 22, `HULL ${Math.round(P.hull)}%`, 19, healthColor(P.hull), 'center');
    g.text(cx, L.by, 'TAP A SYSTEM TO SEND A REPAIR TEAM', 12, C.GREY_TXT, 'center');

    const x = L.rx, rw = L.rw;
    let y = L.y0;
    g.header(x, y, rw, 'REPAIR TEAMS', C.TAN);
    y += 26;
    for (let t = 0; t < K.REPAIR_TEAMS; t++) {
      const sy = P.team[t];
      g.text(x, y, 'TEAM ' + (t + 1), 18, C.PEACH);
      if (sy < K.NSYS) {
        const on = P.team.filter((q) => q === sy).length;
        g.text(x, y + 22, `${K.SYS_NAME[sy]} - DONE IN ${Math.ceil((100 - P.health[sy]) / (K.REPAIR_RATE * on))}s`, 13, C.YELLOW);
        g.button('rc' + t, x + rw - 96, y + 2, 96, 34, 'RECALL', C.LILAC, C.BLACK, 17, () => app.send(CMD.TEAM, t, K.NO_ID));
      } else g.text(x, y + 22, 'STANDING BY', 13, C.GREEN);
      y += 48;
    }
    g.header(x, y, rw, 'SYSTEMS', C.TAN);
    y += 26;
    for (let i = 0; i < K.NSYS; i++) {
      const h = P.health[i];
      g.text(x, y, K.SYS_NAME[i], 13, healthColor(h));
      g.bar(x + 84, y + 2, rw - 130, 9, h, healthColor(h));
      g.rect(x + 84, y + 13, (rw - 130) * P.heat[i] / 100, 3, P.heat[i] > 80 ? C.RED : C.ORANGE);
      g.text(x + rw, y, h > 0 ? Math.round(h) + '%' : 'OFF', 13, healthColor(h), 'right');
      y += 22;
    }
    g.wrap(x, y + 6, rw, 'TWO TEAMS. EACH REPAIRS 3% PER SECOND; BOTH ON ONE SYSTEM DOUBLES THE SPEED. A SYSTEM AT 0% DOES NOTHING. THE HULL IS ONLY REPAIRED BY DOCKING AT STARBASE 12. OVERHEATING ALSO CAUSES DAMAGE.', 12, C.GREY_TXT, 1.2, 5);
  },
};
