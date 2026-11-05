// stations/captain.js - the optional CAPTAIN station (port of captain.h)
//   STATUS  whole ship at a glance + contacts + first officer's advice
//   ORDERS  pick a station, subject and order; order log with response times
//   COMMS   message log, hail anyone, choose replies
import * as K from '../config.js';
import { C, CMD } from '../config.js';
import { fmtDist, mmss, orderText, pad3 } from '../util.js';
import { dim, healthColor } from '../gfx.js';
import { drawShip, factionColor, ART_CRUISER } from '../ships.js';
import { drawMsgLog, commsOptMsg } from './helm.js';

export const CAP_TABS = ['STATUS', 'ORDERS', 'COMMS'];
const ORD_COL = [C.GREY, C.YELLOW, C.SKY, C.GREEN, C.RED, C.GREY_TXT];

function capContacts(w, max = 10) {
  return w.npc.filter((n) => n.alive && n.vis).slice(0, max).map((n) => n.id);
}

// ---------------------------------------------------------------- STATUS
export function capStatus(g, w, app, L) {
  const P = w.P, cw = L.x1 - L.x0, lw = Math.floor((cw - 14) / 2);
  const x = L.x0;
  let y = L.y0;
  const up = w.shieldsUp();
  g.header(x, y, lw, 'SHIP', C.PEACH);
  g.text(x, y + 22, `HULL ${Math.ceil(P.hull)}%`, 13, healthColor(P.hull));
  g.bar(x + 80, y + 25, lw - 80, 8, P.hull, healthColor(P.hull));
  const qw = (lw - 18) / 4;
  for (let q = 0; q < 4; q++) {
    g.text(x + q * (qw + 6), y + 38, `${K.QUAD_NAME[q]} ${Math.round(P.shield[q])}`, 12, up ? C.SKY : C.GREY_TXT);
    g.bar(x + q * (qw + 6), y + 53, qw, 5, P.shield[q] / 1.6, up ? C.SKY : C.GREY);
  }
  g.text(x, y + 62, `ENERGY ${Math.round(P.energy)}  ${P.energyRate >= 0 ? '+' : ''}${P.energyRate.toFixed(1)}/S`, 12, P.energy > 300 ? C.SKY : C.ORANGE);
  g.bar(x + 160, y + 65, lw - 160, 8, P.energy / 10, P.energy > 300 ? C.SKY : P.energy > 120 ? C.YELLOW : C.RED);
  const ap = P.autopilot === K.AP_WAYPOINT ? 'AUTOPILOT: WAYPOINT' : P.autopilot === K.AP_TARGET ? 'AUTOPILOT: INTERCEPT' : 'MANUAL HELM';
  g.textFit(x, y + 77, `HDG ${pad3(P.hdg)}  ${P.warping ? 'WARP ' + P.warpSet : Math.round(P.speed) + ' KM/S'}  ${ap}${P.evasive ? '  EVASIVE' : ''}`, 12, C.SKY, 'left', lw);
  y += 94;
  g.header(x, y, lw, 'SYSTEMS', C.TAN);
  g.text(x + lw * 0.52, y + 20, 'PWR    HEAT   TEAM', 11, C.GREY_TXT);
  for (let s = 0; s < K.NSYS; s++) {
    const yy = y + 34 + s * 15, col = healthColor(P.health[s]);
    g.text(x, yy, K.SYS_NAME[s], 12, col);
    g.bar(x + 72, yy + 3, lw * 0.52 - 80, 7, P.health[s], col);
    g.text(x + lw * 0.52, yy, `${String(P.power[s]).padStart(3)}%   ${String(Math.round(P.heat[s])).padStart(3)}%`, 12, P.heat[s] > 75 ? C.RED : C.PEACH);
    for (let t = 0; t < 2; t++) if (P.team[t] === s) g.text(x + lw * 0.52 + 92 + t * 20, yy, 'T' + (t + 1), 12, C.YELLOW);
  }
  y += 128;
  g.header(x, y, lw, 'WEAPONS', C.RED);
  g.text(x, y + 22, `PHASERS ${P.phCharge >= 1 ? 'READY' : 'CHARGING'}  FREQ ${K.FREQ_CHAR[P.phFreq]}  ${P.autoFire ? 'AUTO-FIRE' : ''}`, 12, P.phCharge >= 1 ? C.ORANGE : C.YELLOW);
  g.bar(x + lw - 80, y + 25, 80, 7, P.phCharge * 100, C.ORANGE);
  const ts = ['EMPTY', 'LOADING', 'READY', 'UNLOADING'];
  g.text(x, y + 36, `TUBES: ${ts[P.tubeState[0]]} / ${ts[P.tubeState[1]]}   TORPEDOES P${P.torps[0]} Q${P.torps[1]}`, 12, C.LILAC);
  g.textFit(x, y + 50, w.targetValid() ? `TARGET: ${w.shortName(P.target)}  AIMING AT ${K.SUB_NAME[P.sub]}` : 'TARGET: NONE', 12, w.targetValid() ? C.RED : C.GREY_TXT, 'left', lw);
  y += 68;
  g.header(x, y, lw, 'MISSION', C.VIOLET);
  g.text(x, y + 21, `${K.MT_NAME[w.M.type]} - ${K.DIFF_NAME[w.M.diff]}   T+${mmss(w.missionT)}`, 12, C.PEACH);
  g.wrap(x, y + 36, lw, w.M.objective, 12, C.ORANGE, 1.2, 2);
  const s = w.slow;
  if (s) g.text(x, Math.min(L.y1 - 12, y + 68), `ORDERS CARRIED OUT ${s.ord.done}/${s.ord.issued}`, 12, C.GREY_TXT);

  // ---- contacts
  const rx = L.x0 + lw + 14, rw = L.x1 - rx;
  y = L.y0;
  g.header(rx, y, rw, 'CONTACTS', C.SKY);
  const R = 70, cx = rx + R + 2, cy = y + 26 + R, range = 15000;
  g.circle(cx, cy, R, C.GRID, false, 1);
  g.circle(cx, cy, R / 2, C.GRID, false, 1);
  g.text(cx - R, cy + R - 10, '15K', 11, C.GRID);
  const ids = capContacts(w);
  for (const id of ids) {
    const n = w.n(id);
    const d = w.range(n);
    if (d > range) continue;
    g.circle(cx + (n.x - P.x) / range * R, cy + (n.y - P.y) / range * R, 3, factionColor(w.known(id) ? n.faction : K.F_UNKNOWN));
  }
  drawShip(g, ART_CRUISER, C.SKY, cx, cy, 0.12, P.hdg);
  const lx = rx + 2 * R + 14, lwid = rx + rw - lx;
  let ly = y + 24, shown = 0;
  const threat = (s && s.threat) || {};
  for (const id of ids) {
    if (shown >= 6) break;
    if (id === K.ID_BONUS && !w.known(id)) continue;
    const n = w.n(id), k = w.known(id);
    g.textFit(lx, ly, w.shortName(id, k), 13, factionColor(k ? n.faction : K.F_UNKNOWN), 'left', lwid - 46);
    g.text(lx + lwid, ly, fmtDist(w.range(n)), 12, C.GREY_TXT, 'right');
    const tt = threat[id] || '';
    g.textFit(lx, ly + 13, tt, 11, tt.startsWith('ATTACKING') ? C.RED : C.GREY_TXT, 'left', lwid - 46);
    if (n.scan >= 2 && n.type !== K.CT_ANOMALY && n.type !== K.CT_BUOY) g.bar(lx + lwid - 40, ly + 16, 40, 5, n.hull, healthColor(n.hull));
    ly += 27;
    shown++;
  }
  // ---- first officer
  y = L.y0 + 200;
  g.header(rx, y, rw, 'FIRST OFFICER', C.LILAC);
  y += 24;
  const adv = (s && s.advice) || [];
  adv.forEach((a, i) => {
    const yy = y + i * 34;
    g.textFit(rx, yy, a.text, 13, a.col, 'left', rw - 90);
    if (a.code < K.NUM_ORDERS) {
      g.textFit(rx, yy + 15, '> ' + a.otext, 11, C.GREY_TXT, 'left', rw - 90);
      g.button('adv' + i, rx + rw - 80, yy, 80, 28, 'ORDER', C.LILAC, C.BLACK, 15, () => app.send(CMD.ORDER, a.code, a.arg));
    }
  });
}

// ---------------------------------------------------------------- ORDERS
export const capOrders = {
  st: K.OS_HELM, contact: K.NO_ID, sys: K.S_SHIELDS, quad: K.Q_FORE,
  draw(g, w, app, L) {
    const cw = L.x1 - L.x0, lw = Math.floor(cw * 0.6), x = L.x0;
    let y = L.y0;
    const sw = (lw - 18) / 4;
    for (let i = 0; i < 4; i++) {
      const sel = this.st === i;
      g.button('ost' + i, x + i * (sw + 6), y, sw, 30, K.OS_NAME[i], sel ? C.LILAC : C.GREY, sel ? C.BLACK : C.GREY_TXT, 16, () => { this.st = i; });
    }
    y += 38;
    const ids = capContacts(w, 6);
    if (this.contact !== K.NO_ID && !ids.includes(this.contact)) this.contact = K.NO_ID;
    if (this.contact === K.NO_ID && ids.length) this.contact = ids.find((id) => w.n(id).faction === K.F_HOSTILE) ?? ids[0];
    const chipW = (lw - 5 * 6) / 6;
    if (this.st !== K.OS_ENG) {
      ids.forEach((id, i) => {
        const sel = this.contact === id, fc = factionColor(w.known(id) ? w.n(id).faction : K.F_UNKNOWN);
        g.button('ch' + id, x + i * (chipW + 6), y, chipW, 28, w.shortName(id), sel ? fc : C.GREY, sel ? C.BLACK : fc, 13, () => { this.contact = id; });
      });
      if (!ids.length) g.text(x, y + 6, 'NO CONTACTS ON SENSORS', 12, C.GREY_TXT);
    }
    y += 32;
    if (this.st === K.OS_ENG) for (let s = 0; s < K.NSYS; s++)
      g.button('sy' + s, x + s * (chipW + 6), y - 32, chipW, 28, K.SYS_SHORT[s], this.sys === s ? C.TAN : C.GREY, this.sys === s ? C.BLACK : C.TAN, 16, () => { this.sys = s; });
    if (this.st === K.OS_TAC) for (let q = 0; q < 4; q++)
      g.button('qd' + q, x + q * (chipW + 6), y, chipW, 28, K.QUAD_NAME[q], this.quad === q ? C.SKY : C.GREY, this.quad === q ? C.BLACK : C.SKY, 16, () => { this.quad = q; });
    y += 36;
    const codes = K.ORDERS.map((o, i) => i).filter((i) => K.ORDERS[i].st === this.st);
    const ow = (lw - 6) / 2;
    codes.slice(0, 8).forEach((code, i) => {
      const d = K.ORDERS[code];
      const subj = d.subj === K.SUBJ_CONTACT ? this.contact : d.subj === K.SUBJ_SYSTEM ? this.sys : d.subj === K.SUBJ_QUAD ? this.quad : 0;
      const ok = d.subj !== K.SUBJ_CONTACT || (this.contact !== K.NO_ID && w.visible(this.contact));
      const txt = orderText(code, subj, (id) => w.shortName(id));
      g.button('ord' + code, x + (i % 2) * (ow + 6), y + Math.floor(i / 2) * 40, ow, 34, txt, ok ? C.ORANGE : C.SEG_OFF, ok ? C.BLACK : C.GREY, 15, () => {
        if (!ok) { app.sound.denied(); return; }
        app.send(CMD.ORDER, code, subj);
      }, { silent: !ok });
    });
    y += 4 * 40 + 4;
    const lb = w.lobby;
    const tabsOf = (st) => [...new Set(K.ORDERS.filter((o) => o.st === st).map((o) => o.tab))];
    const who = tabsOf(this.st).map((tab) => {
      const stn = lb && lb.stations.find((s) => s.tabs.includes(tab));
      const p = stn && lb.players.find((pp) => pp.station === stn.key);
      return `${K.TAB_NAME[tab]}: ${p ? p.name : '-'}`;
    }).join('   ');
    g.textFit(x, y, 'GOES TO  ' + who, 12, C.LILAC, 'left', lw);
    g.wrap(x, y + 16, lw, 'PICK A SUBJECT ABOVE, THEN AN ORDER. IT POPS UP ON THAT CREWMATE\'S PHONE; THE LOG SHOWS WHEN IT IS ACKNOWLEDGED AND ACTUALLY CARRIED OUT.', 12, C.GREY_TXT, 1.2, 3);
    // ---- log
    const rx = x + lw + 14, rw = L.x1 - rx;
    y = L.y0;
    g.header(rx, y, rw, 'ORDER LOG', C.ORANGE);
    y += 24;
    const orders = w.orders;
    if (!orders.length) g.text(rx, y + 4, 'NO ORDERS GIVEN YET', 12, C.GREY_TXT);
    for (const o of orders.slice(0, 7)) {
      g.textFit(rx, y, `${o.toName || K.OS_NAME[K.ORDERS[o.code].st]} - ${K.ORD_STATUS[o.status]}`, 12, ORD_COL[o.status % 6], 'left', rw);
      g.textFit(rx, y + 13, o.text, 13, C.PEACH, 'left', rw);
      g.text(rx, y + 28, o.status === K.ORD_DONE ? `CARRIED OUT IN ${o.took}s` : `${o.age}s AGO`, 11, C.GREY_TXT);
      y += 44;
    }
    const s = w.slow;
    if (s) {
      g.text(rx, L.y1 - 28, `CARRIED OUT ${s.ord.done}/${s.ord.issued}`, 13, C.GREEN);
      if (s.ord.done) g.text(rx, L.y1 - 13, `AVERAGE RESPONSE ${s.ord.avg.toFixed(1)}s`, 12, C.GREEN);
    }
  },
};

// ---------------------------------------------------------------- COMMS
export const capComms = {
  sel: K.NO_ID,
  draw(g, w, app, L) {
    const cw = L.x1 - L.x0, lw = Math.floor(cw * 0.58);
    drawMsgLog(g, w, L.x0, L.y0, lw, L.y1, 14);
    const x = L.x0 + lw + 14, rw = L.x1 - x;
    let y = L.y0;
    g.header(x, y, rw, 'HAIL', C.LILAC);
    y += 24;
    const ids = capContacts(w, 6);
    if (this.sel !== K.NO_ID && !ids.includes(this.sel)) this.sel = K.NO_ID;
    for (const id of ids) {
      const n = w.n(id), sel = this.sel === id;
      g.button('ch' + id, x, y, rw, 28, `${w.shortName(id)}  ${fmtDist(w.range(n))}`, sel ? factionColor(w.known(id) ? n.faction : K.F_UNKNOWN) : C.GREY, sel ? C.BLACK : C.GREY_TXT, 15,
        () => { this.sel = id; }, { sound: 'toggle' });
      y += 31;
    }
    y = Math.max(y, L.y0 + 24 + 6 * 31) + 4;
    g.button('copen', x, y, rw, 34, 'OPEN CHANNEL', this.sel !== K.NO_ID ? C.ORANGE : C.GREY, C.BLACK, 18, () => { if (this.sel !== K.NO_ID) app.send(CMD.HAIL, this.sel); });
    y += 42;
    g.text(x, y, 'REPLY OPTIONS', 12, C.GREY_TXT);
    y += 15;
    const m = commsOptMsg(w.msgs);
    if (m) m.opt.forEach((o, i) => { g.button('copt' + i, x, y, rw, 28, K.OPT_NAME[o], C.PEACH, C.BLACK, 15, () => app.send(CMD.REPLY, m.from, o)); y += 31; });
    else g.text(x, y + 4, '(NONE - HAIL SOMEONE FIRST)', 12, C.GREY_TXT);
  },
};
