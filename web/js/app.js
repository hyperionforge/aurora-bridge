// ============================================================================
// app.js - a player's phone: lobby, station frame, tabs, orders, viewer page
// ============================================================================
// URL parameters:  ?host=1  this page also runs the game (the hosting phone)
//                  &name=..  &pid=..  (set by the Android app)
import * as K from './config.js';
import { CHAPTERS, CHAPTER_DESC } from './campaign.js';
import { C, CMD } from './config.js';
import { Gfx, loadFonts, dim, flash, healthColor } from './gfx.js';
import { World, Link } from './world.js';
import { sound } from './sound.js';
import { Scene } from './viewscreen.js';
import { mmss } from './util.js';
import { helm, nav, science, comms } from './stations/helm.js';
import { tactical, shields, engineer, damage } from './stations/tactical.js';

const TABS = [helm, nav, science, comms, tactical, shields, engineer, damage];
const params = new URLSearchParams(location.search);
const Native = window.AuroraNative || null; // the Android app's bridge (absent in a browser)
const SB_W = 100, TOP_H = 34;

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; }
function makePid() {
  let p = params.get('pid') || store('aurora.pid');
  if (!p) { p = 'p' + Math.random().toString(36).slice(2, 10); store('aurora.pid', p); }
  return p;
}

class App {
  constructor(name) {
    this.name = name;
    this.pid = makePid();
    this.isHost = params.get('host') === '1';
    this.cv = document.getElementById('cv');
    this.g = new Gfx(this.cv, { height: 440 });
    this.g.onTapSound = (k) => (k === 'toggle' ? sound.toggle() : sound.tap());
    this.w = new World();
    this.scene = new Scene();
    this.sound = sound;
    this.tab = -1;          // index into my station's tabs, -1 = viewer page
    this.capTab = 0;
    this.viewerPage = false;
    this.menu = false;
    this.lastTabKey = '';
    this.unread = false;
    this.newestMsg = 0;
    this.lastOrderSeen = 0;
    this.status = 'connecting';
    this.casting = false;
    this.joinUrls = [];
    this.qr = null;
    sound.enabled = store('aurora.sound') !== '0';
    this.edge = store('aurora.edge') || 'auto';
    this.applyEdge();
    setInterval(() => this.applyEdge(), 1500);
    this.vibrate = store('aurora.vibrate') !== '0';
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    if (this.isHost) this.startHost(wsUrl);
    this.link = new Link(wsUrl, (m, raw) => this.onMsg(m, raw), (up) => { if (!up) this.status = 'connecting'; });
    this.link.setHello({ t: 'hello', pid: this.pid, name: this.name, kind: 'player', isHost: this.isHost });
    window.onCastState = (on) => { this.casting = !!on; if (on) this.castCatchUp(); };
    try { if (Native && Native.castState) this.casting = !!Native.castState(); } catch { this.casting = false; }
    this.fetchJoin();
    document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
    requestAnimationFrame(() => this.frame());
  }
  async startHost(wsUrl) {
    const { Host } = await import('./host.js');
    this.host = new Host({ url: wsUrl + '?role=host', name: (this.name || 'AURORA') + "'S BRIDGE" });
    this.host.start();
    window.auroraHost = this.host;
  }
  async fetchJoin() {
    try {
      const r = await fetch('/lan', { cache: 'no-store' });
      const j = await r.json();
      this.joinUrls = j.urls || [];
      if (this.joinUrls[0] && window.qrcode) {
        const q = window.qrcode(0, 'M');
        q.addData(this.joinUrls[0]);
        q.make();
        this.qr = q;
      }
    } catch { /* no /lan endpoint */ }
  }
  // margin that keeps buttons out of the phone's rounded corners
  edgePx() {
    if (this.edge === 'off') return 0;
    if (this.edge === 'small') return 14;
    if (this.edge === 'large') return 30;
    let r = 0;
    try { if (Native && Native.getCornerRadius) r = +Native.getCornerRadius() || 0; } catch { r = 0; }
    if (!Native) return 12;          // a phone browser can't tell us, so allow a little
    return Math.min(40, r * 0.6);
  }
  applyEdge() { this.g.setPad(this.edgePx()); }
  send(cmd, a = 0, b = 0, c = 0, d = 0) { this.link.send({ t: 'cmd', cmd, a, b, c, d }); }

  // ---------------------------------------------------------------- messages from the host
  onMsg(m, raw) {
    if (m.t === 'nohost') { this.status = 'nohost'; return; }
    if (m.t === 'full') { this.status = 'full'; return; }
    if (m.t === 'welcome') { this.status = 'ok'; return; }
    this.w.onMessage(m);
    if (m.t === 'ev') {
      for (const e of m.e) {
        this.scene.onEvent(e);
        if (e.type === K.EV_ORDER) { if (this.myTabs().includes(e.arg)) { sound.order(); this.buzz([80, 60, 80]); } continue; }
        if (e.type === K.EV_WE_HIT_HULL || e.type === K.EV_SYS_DAMAGED) this.buzz(e.flash === 'hull' ? 120 : 60);
        sound.event(e);
      }
    }
    if (m.t === 's' && m.msgs.length && m.msgs[0].id > this.newestMsg) { this.newestMsg = m.msgs[0].id; this.unread = true; }
    if (this.casting && Native && raw && (m.t === 'f' || m.t === 's' || m.t === 'lobby' || m.t === 'ev')) { try { Native.castSend(raw); } catch { /* TV gone */ } }
  }
  castCatchUp() {
    const w = this.w;
    if (!Native) return;
    try {
    if (w.lobby) Native.castSend(JSON.stringify(w.lobby));
    if (w.slow) Native.castSend(JSON.stringify(w.slow));
    if (this.joinUrls[0]) Native.castSend(JSON.stringify({ t: 'join', url: this.joinUrls[0] }));
    } catch { /* TV gone */ }
  }
  buzz(p) {
    if (!this.vibrate) return;
    if (Native && Native.vibrate) Native.vibrate(Array.isArray(p) ? p[0] : p);
    else if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p);
  }
  me() { return this.w.lobby ? this.w.lobby.players.find((p) => p.pid === this.pid) : null; }
  // my "station" = the roles I picked in the lobby
  myStation() {
    const me = this.me();
    if (!me || !me.roles || !me.roles.length) return null;
    return { key: me.roles.join(','), name: me.roles.map((t) => K.TAB_NAME[t]).join(' + '), tabs: me.roles, col: me.col };
  }
  myTabs() { const s = this.myStation(); return s ? s.tabs : []; }

  // ---------------------------------------------------------------- frame
  frame() {
    requestAnimationFrame(() => this.frame());
    const g = this.g, w = this.w;
    w.update();
    g.begin();
    if (innerHeight > innerWidth * 1.05) { this.drawRotate(); return; }
    if (this.status !== 'ok' || !w.lobby) this.drawConnecting();
    else if (this.menu) this.drawMenu();
    else if (w.game === K.GS_TITLE || !this.myStation()) this.drawLobby();
    else if (w.game === K.GS_RUN) this.drawRun();
    else this.drawEnd();
  }

  drawRotate() {
    const g = this.g;
    g.text(g.W / 2, g.H / 2 - 30, 'ROTATE TO LANDSCAPE', 34, C.ORANGE, 'center', true);
    g.text(g.W / 2, g.H / 2 + 14, 'THE BRIDGE CONSOLES ARE DESIGNED FOR A SIDEWAYS PHONE', 15, C.PEACH, 'center');
  }
  drawConnecting() {
    const g = this.g, cx = g.W / 2;
    const msg = this.status === 'nohost' ? 'NO HOST - THE HOSTING PHONE IS NOT RUNNING A GAME' : this.status === 'full' ? 'THIS BRIDGE IS FULL (5 PLAYERS)' : 'CONNECTING TO THE BRIDGE...';
    g.text(cx, 150, 'STARSHIP AURORA', 40, C.ORANGE, 'center', true);
    g.text(cx, 210, msg, 19, this.status === 'connecting' ? C.PEACH : flash(600) ? C.RED : C.RED_DIM, 'center');
    g.text(cx, 240, location.host, 13, C.GREY_TXT, 'center');
    if (Native) g.button('leave0', cx - 90, 290, 180, 40, 'LEAVE', C.LILAC, C.BLACK, 18, () => Native.leave());
  }

  // ---------------------------------------------------------------- top bar pieces
  elbow(col) {
    // one path for the whole LCARS corner piece (separate shapes leave hairline seams)
    const g = this.g, c = g.ctx, T = TOP_H - 4;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, 80);
    c.lineTo(0, 30);
    c.arc(30, 30, 30, Math.PI, Math.PI * 1.5);
    c.lineTo(SB_W + 46, 0);
    c.lineTo(SB_W + 46, T);
    c.lineTo(SB_W + 14, T);
    c.arc(SB_W + 14, T + 14, 14, -Math.PI / 2, Math.PI, true);
    c.lineTo(SB_W, 80);
    c.closePath();
    c.fill();
  }
  topRight(x0) {
    // VIEWER, CAST, MENU buttons + energy; returns the x where they start
    const g = this.g, w = this.w, P = w.P;
    let x = g.W - 6;
    const btn = (id, wd, label, col, tc, fn) => { x -= wd; g.button(id, x, 2, wd, TOP_H - 6, label, col, tc, 15, fn); x -= 6; };
    btn('menu', 44, '☰', C.PEACH, C.BLACK, () => { this.menu = true; });
    if (Native && Native.castAvailable && (() => { try { return Native.castAvailable(); } catch { return false; } })())
      btn('cast', 76, this.casting ? 'CASTING' : 'CAST TV', this.casting ? C.SKY : C.GREY, this.casting ? C.BLACK : C.SKY, () => Native.castToggle());
    if (w.game === K.GS_RUN) btn('viewer', 76, 'VIEWER', this.viewerPage ? C.ORANGE : C.GREY, this.viewerPage ? C.BLACK : C.ORANGE, () => { this.viewerPage = !this.viewerPage; });
    g.circle(x - 6, TOP_H / 2 - 2, 5, w.hostOK() ? C.GREEN : C.RED);
    x -= 16;
    if (w.game === K.GS_RUN && x - x0 > 170) {
      const e = P.energy, col = e > 300 ? C.SKY : e > 120 ? C.YELLOW : flash(300) ? C.RED : C.RED_DIM;
      const bw = Math.min(150, x - x0 - 80);
      g.text(x, 6, String(Math.round(e)), 18, col, 'right');
      g.segBar(x - 44 - bw, 7, bw, 16, e / 10, col, 12);
      g.text(x - 50 - bw, 6, 'EN', 18, C.PEACH, 'right');
      x -= bw + 76;
    }
    return x;
  }

  // ---------------------------------------------------------------- the lobby
  // Players tap the roles they want. START only lights up when all 8 roles
  // are taken and everyone has at least one.
  drawLobby() {
    const g = this.g, w = this.w, lb = w.lobby, s = w.slow, me = this.me();
    const W = g.W, H = g.H;
    const inTitle = w.game === K.GS_TITLE;
    this.elbow(C.ORANGE);
    const tx = this.topRight(SB_W + 60);
    g.textFit(SB_W + 56, 2, inTitle ? 'CREW ASSEMBLY' : 'MISSION IN PROGRESS - TAKE A FREE ROLE', 24, C.ORANGE, 'left', tx - SB_W - 60, true);
    // sidebar: the crew and how many roles each holds
    let y = 86;
    g.text(4, y, 'CREW', 13, C.PEACH);
    y += 18;
    for (const p of lb.players) {
      const n = p.roles.length;
      g.rect(0, y, SB_W, 40, p.online ? p.col : C.SEG_OFF);
      g.textFit(SB_W - 6, y + 2, p.name + (p.pid === this.pid ? ' (YOU)' : ''), 14, C.BLACK, 'right', SB_W - 8, true);
      g.textFit(SB_W - 6, y + 21, !p.online ? 'DISCONNECTED' : n ? `${n} ROLE${n > 1 ? 'S' : ''}` : 'CHOOSING...', 11, C.BLACK, 'right', SB_W - 8);
      y += 44;
    }
    if (lb.screens) g.text(4, y + 2, `+ ${lb.screens} VIEWSCREEN${lb.screens > 1 ? 'S' : ''}`, 12, C.SKY);
    // left panel: mission, auto-assign, start
    const lx = SB_W + 10, lw = Math.min(300, Math.floor((W - SB_W) * 0.36));
    y = TOP_H + 10;
    const st = s ? s.selType : 0, sd = s ? s.selDiff : 1, sm = s ? s.selMode || 0 : 0;
    const sel = (t, d, m) => this.send(CMD.SELECT, t, d, m);
    const NM = K.MODES_READY;
    g.header(lx, y, lw, 'GAME', C.SKY);
    y += 24;
    const arrow = 44;
    if (inTitle) g.button('gp', lx, y, arrow, 32, '<', C.LILAC, C.BLACK, 20, () => sel(st, sd, (sm + NM - 1) % NM), { sound: 'toggle' });
    g.textFit(lx + lw / 2, y + 5, K.MODE_NAME[sm], 20, C.ORANGE, 'center', lw - 2 * arrow - 8, true);
    if (inTitle) g.button('gn', lx + lw - arrow, y, arrow, 32, '>', C.LILAC, C.BLACK, 20, () => sel(st, sd, (sm + 1) % NM), { sound: 'toggle' });
    y += 36;
    if (sm === K.MODE_CAMPAIGN) {
      const cm = Math.max(1, Math.min(5, (s && s.campMax) || 1)), ch = st % cm;
      if (inTitle) g.button('cp', lx, y, arrow, 32, '<', C.LILAC, C.BLACK, 20, () => sel((ch + cm - 1) % cm, sd, sm), { sound: 'toggle' });
      g.textFit(lx + lw / 2, y + 5, `CH ${ch + 1}: ${CHAPTERS[ch]}`, 19, C.SKY, 'center', lw - 2 * arrow - 8);
      if (inTitle) g.button('cn', lx + lw - arrow, y, arrow, 32, '>', C.LILAC, C.BLACK, 20, () => sel((ch + 1) % cm, sd, sm), { sound: 'toggle' });
      y += 36;
    }
    if (sm === K.MODE_MISSION) {
      if (inTitle) g.button('mp', lx, y, arrow, 32, '<', C.LILAC, C.BLACK, 20, () => sel((st + K.NUM_MT - 1) % K.NUM_MT, sd, sm), { sound: 'toggle' });
      g.textFit(lx + lw / 2, y + 5, K.MT_NAME[st], 20, C.SKY, 'center', lw - 2 * arrow - 8);
      if (inTitle) g.button('mn', lx + lw - arrow, y, arrow, 32, '>', C.LILAC, C.BLACK, 20, () => sel((st + 1) % K.NUM_MT, sd, sm), { sound: 'toggle' });
      y += 36;
    }
    if (inTitle) g.button('dp', lx, y, arrow, 32, '<', C.LILAC, C.BLACK, 20, () => sel(st, (sd + 2) % 3, sm), { sound: 'toggle' });
    g.text(lx + lw / 2, y + 5, 'DIFFICULTY: ' + K.DIFF_NAME[sd], 20, C.SKY, 'center');
    if (inTitle) g.button('dn', lx + lw - arrow, y, arrow, 32, '>', C.LILAC, C.BLACK, 20, () => sel(st, (sd + 1) % 3, sm), { sound: 'toggle' });
    y += 38;
    const cdesc = sm === K.MODE_CAMPAIGN ? (st % Math.max(1, (s && s.campMax) || 1) ? CHAPTER_DESC[st % 5] + ' (EARLIER CHOICES ARE REMEMBERED.)' : K.MODE_DESC[sm] + ((s && s.campMax) > 1 ? ' UNLOCKED CHAPTERS CAN BE STARTED DIRECTLY.' : '')) : null;
    y = g.wrap(lx, y, lw, sm === K.MODE_MISSION ? K.MT_DESC[st] : cdesc || K.MODE_DESC[sm], 12, C.PEACH, 1.2, sm === K.MODE_MISSION ? 3 : 4) + 6;
    if (inTitle) {
      g.header(lx, y, lw, 'ROLES', C.LILAC);
      y += 24;
      g.button('auto', lx, y, lw, 34, 'AUTO-ASSIGN ROLES', C.LILAC, C.BLACK, 18, () => this.link.send({ t: 'auto' }), { sound: 'toggle' });
      y += 40;
      g.wrap(lx, y, lw, 'OR TAP THE ROLE CARDS YOU WANT. TAP ONE OF YOURS TO GIVE IT BACK.', 12, C.GREY_TXT, 1.2, 2);
      const by = H - 52;
      g.button('start', lx, by, lw, 46, ['START MISSION', 'LAUNCH VOYAGE', 'BEGIN CAMPAIGN'][sm], lb.canStart ? C.ORANGE : C.GREY, lb.canStart ? C.BLACK : C.GREY_TXT, 24, () => {
        if (lb.canStart) this.send(CMD.START); else sound.denied();
      }, { silent: !lb.canStart, bold: true });
      g.textFit(lx + lw / 2, by - 20, lb.canStart ? 'ALL ROLES ASSIGNED - READY' : lb.why, 13, lb.canStart ? C.GREEN : C.YELLOW, 'center', lw);
    }
    // right panel: the 8 role cards
    const rx = lx + lw + 14, rw = W - 6 - rx;
    y = TOP_H + 10;
    g.header(rx, y, rw, 'ROLES - TAP TO TAKE ONE, TAP AGAIN TO GIVE IT BACK', C.ORANGE);
    y += 24;
    const joinH = this.joinUrls.length ? 44 : 0;
    const cols = 4, rows = 2, gap = 6;
    const cw = (rw - (cols - 1) * gap) / cols, ch = (H - y - 6 - joinH - (rows - 1) * gap) / rows;
    const byPid = new Map(lb.players.map((p) => [p.pid, p]));
    for (let t = 0; t < K.TAB_NAME.length; t++) {
      const cx = rx + (t % cols) * (cw + gap), cy = y + Math.floor(t / cols) * (ch + gap);
      const owner = lb.roles[t] ? byPid.get(lb.roles[t]) : null;
      const mine = owner && owner.pid === this.pid;
      const free = !owner || !owner.online;
      const col = K.TAB_COL[t];
      g.rrect(cx, cy, cw, ch, 12, mine ? col : C.PANEL);
      const c = g.ctx;
      c.strokeStyle = owner && !mine ? owner.col : col; c.lineWidth = 2;
      c.beginPath(); c.roundRect(cx + 1, cy + 1, cw - 2, ch - 2, 12); c.stroke();
      g.textFit(cx + 10, cy + 6, K.TAB_NAME[t], 19, mine ? C.BLACK : col, 'left', cw - 20, true);
      g.wrap(cx + 10, cy + 32, cw - 20, K.TAB_DESC[t], 12, mine ? C.BLACK : C.PEACH, 1.2, Math.max(1, Math.floor((ch - 62) / 14.4)));
      // holder chip along the bottom
      const hy = cy + ch - 26;
      if (owner) {
        g.rrect(cx + 8, hy, cw - 16, 20, 10, mine ? C.BLACK : owner.online ? owner.col : C.GREY);
        g.textFit(cx + cw / 2, hy + 2, owner.name + (owner.online ? '' : ' (GONE)'), 14, mine ? col : C.BLACK, 'center', cw - 24, true);
      } else g.text(cx + cw / 2, hy + 2, 'OPEN', 14, C.GREEN, 'center', true);
      g.hit(cx, cy, cw, ch, { down: () => {
        if (!mine && !free) { sound.denied(); return; }
        sound.toggle();
        this.link.send({ t: 'role', tab: t });
      } });
    }
    if (joinH) {
      const jy = H - joinH;
      if (this.qr) this.drawQR(W - 46, jy + 2, 40);
      g.text(rx, jy + 6, 'MORE CREW: OPEN THE AURORA APP, OR IN ANY PHONE BROWSER GO TO', 12, C.GREY_TXT);
      g.textFit(rx, jy + 22, this.joinUrls.join('   '), 16, C.SKY, 'left', rw - 52);
    }
  }
  drawQR(x, y, size) {
    const q = this.qr, n = q.getModuleCount(), c = size / n;
    this.g.rect(x - 2, y - 2, size + 4, size + 4, C.WHITE);
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (q.isDark(r, cc)) this.g.rect(x + cc * c, y + r * c, c + 0.3, c + 0.3, C.BLACK);
  }

  // ---------------------------------------------------------------- running mission
  layout() {
    const g = this.g;
    const x0 = SB_W + 8, y0 = TOP_H + 8, x1 = g.W - 6, y1 = g.H - 4;
    const BIG = y1 - y0 - 44;
    return { x0, y0, x1, y1, BIG, bx: x0, by: y0, ux: x0, uy: y0 + BIG + 6, uw: BIG, uh: 38, rx: x0 + BIG + 12, rw: x1 - (x0 + BIG + 12) };
  }
  myOrder() {
    const tabs = this.myTabs();
    return this.w.orders.find((o) => tabs.includes(o.tab)) || null;
  }
  bannerState(o) {
    if (!o) return 0;
    if (o.status === K.ORD_SENT) return 1;
    if (o.status === K.ORD_ACK) return 2;
    if (o.status === K.ORD_DONE && o.age - o.took < 4) return 3;
    return 0;
  }
  drawRun() {
    const g = this.g, w = this.w, stn = this.myStation();
    const names = stn.tabs.map((t) => K.TAB_NAME[t]);
    const cols = stn.tabs.map((t) => K.TAB_COL[t]);
    if (this.lastTabKey !== stn.key) { // roles changed: stay on the same one if I still have it
      const keep = this.curTab;
      this.lastTabKey = stn.key;
      this.tab = Math.max(0, stn.tabs.indexOf(keep));
    }
    let ti = this.tab;
    if (ti >= names.length) ti = 0;
    this.curTab = stn.tabs[ti];
    if (stn.tabs[ti] === K.T_COMMS) this.unread = false;
    const tabCol = this.viewerPage ? C.ORANGE : cols[ti];
    this.elbow(tabCol);
    // ---- sidebar tabs
    const top = 84, condH = 86, avail = g.H - condH - top - 4;
    const th = Math.min(64, avail / names.length - 4);
    names.forEach((nm, i) => {
      const act = i === ti && !this.viewerPage;
      let col = act ? cols[i] : dim(cols[i], 0.42);
      if (!act && stn.tabs[i] === K.T_COMMS && this.unread && flash(400)) col = C.WHITE;
      g.block('tab' + i, 0, top + i * (th + 4), SB_W, th, nm, col, C.BLACK, Math.min(20, th * 0.5), () => {
        this.tab = i;
        this.viewerPage = false;
      });
      if (act) g.rect(6, top + i * (th + 4) + 6, 7, th - 12, C.BLACK);
    });
    const al = w.alert;
    const cc = al === K.AL_RED ? (flash(500) ? C.RED : C.RED_DIM) : al === K.AL_YELLOW ? C.YELLOW : C.GREEN;
    const cy = g.H - condH;
    g.rrect(0, cy, SB_W, condH, 28, cc);
    g.rect(0, cy, SB_W, 30, cc);
    g.rect(28, cy, SB_W - 28, condH, cc);
    g.text(SB_W - 6, cy + 4, 'CONDITION', 11, C.BLACK, 'right');
    g.text(SB_W - 6, cy + 17, al === K.AL_RED ? 'RED' : al === K.AL_YELLOW ? 'YELLOW' : 'GREEN', 26, C.BLACK, 'right', true);
    g.text(SB_W - 6, cy + condH - 16, 'T+' + mmss(w.missionT), 12, C.BLACK, 'right');
    // ---- top bar: title or captain's order, alert buttons for the captain
    const tx0 = SB_W + 54;
    let tx1;
    {
      tx1 = this.topRight(tx0 + 200) - 6;
      const o = this.myOrder(), st = this.bannerState(o);
      if (!st) g.textFit(tx0, 0, this.viewerPage ? 'MAIN VIEWER' : names[ti], 27, C.ORANGE, 'left', tx1 - tx0, true);
      else {
        const bg = st === 1 ? (flash(350) ? C.ORANGE : C.WHITE) : st === 2 ? C.TAN : C.GREEN;
        g.rrect(tx0, 1, tx1 - tx0, TOP_H - 4, 12, bg);
        const l1 = st === 1 ? `CAPTAIN TO ${K.TAB_NAME[o.tab]} - TAP TO ACKNOWLEDGE` : st === 2 ? `${K.TAB_NAME[o.tab]}: ACKNOWLEDGED - CARRY IT OUT` : `ORDER CARRIED OUT IN ${o.took}s - WELL DONE`;
        g.textFit((tx0 + tx1) / 2, 2, l1, 11, C.BLACK, 'center', tx1 - tx0 - 16);
        g.textFit((tx0 + tx1) / 2, 13, o.text, 17, C.BLACK, 'center', tx1 - tx0 - 16, true);
        if (st === 1) g.hit(tx0, 0, tx1 - tx0, TOP_H, { down: () => {
          sound.tap();
          this.link.send({ t: 'cmd', cmd: CMD.ORDER_ACK, a: o.id });
          o.status = K.ORD_ACK; // show it straight away
          const i = stn.tabs.indexOf(o.tab);
          if (i >= 0) { this.tab = i; this.viewerPage = false; }
        } });
      }
    }
    // ---- content
    const L = this.layout();
    if (this.viewerPage) this.drawViewerPage(L);
    else TABS[stn.tabs[ti]].draw(g, w, this, L);
  }

  drawViewerPage(L) {
    const g = this.g, w = this.w;
    const bh = 40, ah = L.y1 - L.y0 - bh - 8;
    let vw = L.x1 - L.x0, vh = ah;
    if (vw / vh > 16 / 9) vw = vh * 16 / 9; else vh = vw * 9 / 16;
    const vx = L.x0 + (L.x1 - L.x0 - vw) / 2;
    this.scene.draw(g, w, vx, L.y0, vw, vh);
    g.strokeRect(vx, L.y0, vw, vh, C.GRID);
    const by = L.y1 - bh, n = K.NUM_VM, bw = (L.x1 - L.x0 - (n - 1) * 6 - 130) / n;
    for (let i = 0; i < n; i++) {
      const sel = w.view === i;
      g.button('vm' + i, L.x0 + i * (bw + 6), by, bw, bh, K.VM_SHORT[i], sel ? C.ORANGE : C.GREY, sel ? C.BLACK : C.GREY_TXT, 19,
        () => this.send(CMD.VIEW, i, i === K.VM_TARGET ? w.P.target : K.NO_ID));
    }
    g.wrap(L.x1 - 124, by, 124, 'CHANGES THE MAIN VIEWER FOR THE WHOLE BRIDGE', 12, C.GREY_TXT, 1.15, 3);
  }

  drawEnd() {
    const g = this.g, w = this.w;
    this.elbow(w.game === K.GS_WIN ? C.GREEN : C.RED);
    this.topRight(SB_W + 300);
    g.text(SB_W + 56, 0, 'MISSION OVER', 27, C.ORANGE, 'left', true);
    const L = this.layout();
    this.scene.draw(g, w, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0 - 56);
    g.button('restart', (L.x0 + L.x1) / 2 - 150, L.y1 - 50, 300, 46, 'BACK TO CREW ASSEMBLY', C.LILAC, C.BLACK, 21, () => this.send(CMD.RESTART));
  }

  drawMenu() {
    const g = this.g, cx = g.W / 2;
    this.elbow(C.PEACH);
    g.text(SB_W + 56, 0, 'SETTINGS', 27, C.ORANGE, 'left', true);
    let y = 70;
    const bw = 340;
    g.button('msnd', cx - bw / 2, y, bw, 44, sound.enabled ? 'SOUND: ON' : 'SOUND: OFF', sound.enabled ? C.SKY : C.GREY, C.BLACK, 20, () => {
      sound.enabled = !sound.enabled; store('aurora.sound', sound.enabled ? '1' : '0');
    });
    y += 54;
    g.button('mvib', cx - bw / 2, y, bw, 44, this.vibrate ? 'VIBRATE ON HITS: ON' : 'VIBRATE ON HITS: OFF', this.vibrate ? C.SKY : C.GREY, C.BLACK, 20, () => {
      this.vibrate = !this.vibrate; store('aurora.vibrate', this.vibrate ? '1' : '0');
    });
    y += 54;
    const modes = ['auto', 'off', 'small', 'large'];
    g.button('medge', cx - bw / 2, y, bw, 44, `SCREEN EDGE MARGIN: ${this.edge.toUpperCase()} (${Math.round(this.edgePx())}PX)`, C.SKY, C.BLACK, 18, () => {
      this.edge = modes[(modes.indexOf(this.edge) + 1) % modes.length];
      store('aurora.edge', this.edge);
      this.applyEdge();
    });
    y += 54;
    if (!Native && document.documentElement.requestFullscreen) {
      g.button('mfs', cx - bw / 2, y, bw, 44, 'FULL SCREEN', C.LILAC, C.BLACK, 20, () => {
        document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
        this.menu = false;
      });
      y += 54;
    }
    if (this.w.game === K.GS_RUN) {
      g.button('mswap', cx - bw / 2, y, bw, 44, 'GIVE BACK MY ROLES (PICK AGAIN)', C.TAN, C.BLACK, 18, () => {
        this.link.send({ t: 'unclaim' }); this.menu = false;
      });
      y += 54;
    }
    g.button('mleave', cx - bw / 2, y, bw, 44, this.isHost ? 'END GAME AND LEAVE' : 'LEAVE GAME', C.RED, C.BLACK, 20, () => {
      if (Native) Native.leave(); else { store('aurora.name', ''); location.href = location.pathname; }
    });
    y += 64;
    g.button('mclose', cx - bw / 2, y, bw, 44, 'BACK TO THE BRIDGE', C.ORANGE, C.BLACK, 20, () => { this.menu = false; });
    if (this.isHost) g.text(cx, g.H - 22, 'YOU ARE HOSTING: KEEP THIS APP OPEN AND THE SCREEN ON WHILE YOU PLAY', 13, C.YELLOW, 'center');
  }
}

// ---------------------------------------------------------------- start: ask for a name first
async function boot() {
  await loadFonts();
  let name = params.get('name') || store('aurora.name');
  const form = document.getElementById('name');
  const begin = (n) => {
    store('aurora.name', n);
    form.style.display = 'none';
    window.auroraApp = new App(n.toUpperCase().slice(0, 14));
  };
  if (name) return begin(name);
  form.style.display = 'flex';
  const input = form.querySelector('input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = input.value.trim();
    if (n) begin(n);
  });
  input.focus();
}
boot();
