// ============================================================================
// host.js - the game host (runs in the hosting phone's app, or any browser)
// ============================================================================
// Owns the Sim, the lobby (players, station layout, claims) and talks to
// every station through the relay server:
//   relay -> host   "J <cid>"  a connection opened
//                   "L <cid>"  a connection closed
//                   "M <cid> <json>"  a message from a connection
//   host -> relay   "B <json>"  broadcast to every connection
//                   "T <cid> <json>"  send to one connection
//                   "I <json>"  public info for the /info endpoint (discovery)
import * as K from './config.js';
import { Sim } from './sim.js';
const r2 = (v) => Math.round(v * 100) / 100;
import { lanesOf as lanesOfSys } from './galaxy.js';

const TICK = 0.02;        // simulation step (s)
const FAST_MS = 100;      // ship / contacts / projectiles
const SLOW_MS = 500;      // mission, messages, orders, trails, lobby

const r1 = (v) => Math.round(v * 10) / 10;

export class Host {
  constructor(opts = {}) {
    this.sim = new Sim(opts.rand || Math.random);
    // campaign progress survives restarts (browser / app WebView only)
    try { const v = globalThis.localStorage && globalThis.localStorage.getItem('aurora.campaign'); if (v) this.sim.campSave = JSON.parse(v); } catch { /* no storage */ }
    this.sim.campSaveOf('chorus'); // creates / upgrades the save
    this.players = new Map();   // pid -> {pid, name, cid, station, kind, joinedAt}
    this.conns = new Map();     // cid -> pid
    this.layoutCrew = 0;
    this.stations = [];
    this.ws = null;
    this.url = opts.url;
    this.lastFast = 0;
    this.lastSlow = 0;
    this.slowDirty = true;
    this.lobbyDirty = true;
    this.lastMVer = -1;
    this.lastGame = -1;
    this.joinSeq = 0;
    this.gameName = opts.name || 'AURORA';
    this.out = opts.send || null; // test hook: send(line)
    this.recomputeLayout();
  }

  // ---------------------------------------------------------------- relay link
  connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (e) => this.onLine(String(e.data));
    ws.onclose = () => { this.ws = null; setTimeout(() => this.connect(), 1000); };
    ws.onerror = () => {};
  }
  send(line) {
    if (this.out) this.out(line);
    else if (this.ws && this.ws.readyState === 1) this.ws.send(line);
  }
  to(cid, obj) { this.send('T ' + cid + ' ' + JSON.stringify(obj)); }
  all(obj) { this.send('B ' + JSON.stringify(obj)); }
  onLine(line) {
    const sp = line.indexOf(' ');
    const op = line.slice(0, sp < 0 ? line.length : sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1);
    if (op === 'J') { this.to(rest.trim(), { t: 'who' }); return; } // ask it to say hello
    if (op === 'L') return this.onLeave(rest.trim());
    if (op === 'M') {
      const sp2 = rest.indexOf(' ');
      const cid = rest.slice(0, sp2);
      let msg;
      try { msg = JSON.parse(rest.slice(sp2 + 1)); } catch { return; }
      this.onMessage(cid, msg);
    }
  }

  start() {
    if (this.url) this.connect();
    let last = performance.now(), acc = 0;
    this.timer = setInterval(() => {
      const t = performance.now();
      acc += Math.min(0.25, (t - last) / 1000);
      last = t;
      while (acc >= TICK) { this.step(TICK); acc -= TICK; }
    }, 20);
  }

  // ---------------------------------------------------------------- one simulation step
  step(dt) {
    const sim = this.sim;
    sim.tick(dt);
    if (sim.game !== this.lastGame) {
      this.lastGame = sim.game;
      if (sim.game === K.GS_TITLE) this.recomputeLayout();
      this.lobbyDirty = true;
      this.slowDirty = true;
    }
    if (sim.events.length) {
      if (sim.events.some((e) => e.type === K.EV_MESSAGE || e.type === K.EV_ORDER)) this.slowDirty = true;
      if (sim.campSaveDirty) {
        sim.campSaveDirty = false;
        try { if (globalThis.localStorage) globalThis.localStorage.setItem('aurora.campaign', JSON.stringify(sim.campSave)); } catch { /* no storage */ }
      }
      this.all({ t: 'ev', e: sim.events });
      sim.events = [];
    }
    if (sim.M.ver !== this.lastMVer) { this.lastMVer = sim.M.ver; this.slowDirty = true; }
    if (sim.now - this.lastFast >= FAST_MS) { this.lastFast = sim.now; this.all(this.buildFast()); }
    if (this.slowDirty || sim.now - this.lastSlow >= SLOW_MS) {
      this.slowDirty = false;
      this.lastSlow = sim.now;
      this.all(this.buildSlow());
    }
    if (this.lobbyDirty) { this.lobbyDirty = false; this.all(this.buildLobby()); this.publishInfo(); }
  }

  // ---------------------------------------------------------------- lobby
  // Every player picks the roles (sub-stations) they want; each role has one
  // holder. A mission can start once all 8 roles are taken and nobody is idle.
  activePlayers() {
    return [...this.players.values()].filter((p) => p.kind === 'player' && p.cid).sort((a, b) => a.joinedAt - b.joinedAt);
  }
  allPlayers() {
    return [...this.players.values()].filter((p) => p.kind === 'player').sort((a, b) => a.joinedAt - b.joinedAt);
  }
  recomputeLayout() { this.lobbyDirty = true; }
  ownerOfTab(tab) { for (const p of this.players.values()) if (p.kind === 'player' && p.roles.includes(tab)) return p; return null; }
  colourOf(p) { return K.PLAYER_COL[this.allPlayers().indexOf(p) % K.PLAYER_COL.length]; }
  toggleRole(p, tab) {
    if (!(tab >= 0 && tab < K.TAB_NAME.length) || p.kind !== 'player') return;
    if (p.roles.includes(tab)) { p.roles = p.roles.filter((t) => t !== tab); this.lobbyDirty = true; return; }
    const owner = this.ownerOfTab(tab);
    if (owner && owner.cid) return;                                  // someone here already has it
    if (owner) owner.roles = owner.roles.filter((t) => t !== tab);   // left behind by someone who dropped out
    p.roles = [...p.roles, tab].sort((x, y) => x - y);
    this.lobbyDirty = true;
  }
  autoAssign() {
    const act = this.activePlayers();
    if (!act.length) return;
    const split = K.AUTO_SPLIT[Math.min(act.length, 5)];
    for (const p of this.players.values()) p.roles = [];
    act.forEach((p, i) => { p.roles = i < split.length ? [...split[i]] : []; });
    this.lobbyDirty = true;
  }
  canStart() {
    const act = this.activePlayers();
    if (!act.length) return { ok: false, why: 'WAITING FOR PLAYERS' };
    const open = K.TAB_NAME.slice(0, K.NUM_CORE).filter((_, t) => { const o = this.ownerOfTab(t); return !o || !o.cid; });
    if (open.length) return { ok: false, why: 'STILL TO ASSIGN: ' + open.join(', ') };
    const idle = act.filter((p) => !p.roles.length);
    if (idle.length) return { ok: false, why: idle.map((p) => p.name).join(', ') + (idle.length > 1 ? ' HAVE' : ' HAS') + ' NO ROLE YET' };
    return { ok: true, why: '' };
  }
  buildLobby() {
    const cs = this.canStart();
    return {
      t: 'lobby',
      name: this.gameName,
      roles: K.TAB_NAME.map((_, t) => { const o = this.ownerOfTab(t); return o ? o.pid : null; }),
      players: this.allPlayers().map((p) => ({ pid: p.pid, name: p.name, roles: p.roles, online: !!p.cid, col: this.colourOf(p) })),
      screens: [...this.players.values()].filter((p) => p.kind === 'screen' && p.cid).length,
      canStart: cs.ok,
      why: cs.why,
      game: this.sim.game,
    };
  }
  publishInfo() {
    const s = this.sim;
    this.send('I ' + JSON.stringify({ name: this.gameName, players: this.activePlayers().length, game: s.game,
      mission: s.game === K.GS_RUN ? K.MT_NAME[s.M.type] : '' }));
  }

  onLeave(cid) {
    const pid = this.conns.get(cid);
    this.conns.delete(cid);
    const p = pid && this.players.get(pid);
    if (!p || p.cid !== cid) return;
    p.cid = null;
    if (this.sim.game === K.GS_TITLE) {
      // gone from the lobby: forget them after a short grace period (a page reload keeps the seat)
      setTimeout(() => {
        if (!p.cid && this.sim.game === K.GS_TITLE) { this.players.delete(pid); this.recomputeLayout(); }
      }, 4000);
    }
    this.lobbyDirty = true;
  }

  onMessage(cid, m) {
    const sim = this.sim;
    if (m.t === 'hello') {
      const pid = String(m.pid || cid).slice(0, 40);
      let p = this.players.get(pid);
      if (!p) {
        if (m.kind !== 'screen' && this.activePlayers().length >= K.MAX_PLAYERS) {
          this.to(cid, { t: 'full' });
          return;
        }
        p = { pid, name: '', cid: null, roles: [], kind: m.kind === 'screen' ? 'screen' : 'player', joinedAt: ++this.joinSeq };
        this.players.set(pid, p);
      }
      if (p.cid && p.cid !== cid) this.conns.delete(p.cid);
      p.cid = cid;
      p.name = String(m.name || 'CREW').toUpperCase().slice(0, 14) || 'CREW';
      this.conns.set(cid, pid);
      this.to(cid, { t: 'welcome', pid, host: !!m.isHost });
      if (sim.game === K.GS_TITLE) this.recomputeLayout();
      this.lobbyDirty = true;
      this.slowDirty = true;
      this.to(cid, this.buildLobby());
      return;
    }
    const pid = this.conns.get(cid);
    const p = pid && this.players.get(pid);
    if (!p) return;
    switch (m.t) {
      case 'role': this.toggleRole(p, m.tab | 0); return;
      case 'auto': if (sim.game !== K.GS_RUN) this.autoAssign(); return;
      case 'unclaim': p.roles = []; this.lobbyDirty = true; return;
      case 'cmd': {
        const c = { cmd: m.cmd | 0, a: m.a | 0, b: m.b | 0, c: +m.c || 0, d: +m.d || 0 };
        if (c.cmd === K.CMD.START && !this.canStart().ok) return;
        if (c.cmd === K.CMD.ORDER && !p.roles.includes(K.T_CAPTAIN)) return; // only the captain gives orders
        if (c.cmd === K.CMD.START) { const cap = this.ownerOfTab(K.T_CAPTAIN); sim.captainMode = !!(cap && cap.cid); }
        sim.handleCmd(c);
        if (c.cmd === K.CMD.SELECT || c.cmd === K.CMD.START || c.cmd === K.CMD.RESTART) { this.lobbyDirty = true; this.slowDirty = true; }
        if (c.cmd === K.CMD.ORDER || c.cmd === K.CMD.ORDER_ACK) this.slowDirty = true;
      }
    }
  }

  // ---------------------------------------------------------------- snapshots
  buildFast() {
    const s = this.sim, P = s.P;
    const npc = [];
    for (let id = 0; id < K.MAX_CONTACTS; id++) {
      const n = s.npc[id];
      if (!n.active) continue;
      npc.push({
        id, type: n.type, faction: n.faction, x: Math.round(n.x), y: Math.round(n.y), hdg: r1(n.hdg), speed: Math.round(n.speed),
        hull: r1(n.hull), shields: r1(n.shields), shMax: n.shMax, freq: n.freq, eng: Math.round(n.eng), wpn: Math.round(n.wpn),
        sgen: Math.round(n.sgen), scan: n.scan, ai: n.ai, aiTarget: n.aiTarget, alive: n.alive, vis: s.visible(id), deadAt: n.deadAt,
        ...(n.name ? { name: n.name, short: n.short, kind: n.kind, civ: n.civ } : {}), ...(n.note && n.scan >= 2 ? { note: n.note } : {}), ...(n.rock ? { rk: n.rock.c } : {}), ...(n.poi >= 0 ? { poi: n.poi, smp: n.sampled, ...(n.scan >= 2 ? { res: n.res, art: n.art >= 0 && (n.sampled > 0 || n.scan >= 2), haz: n.haz } : {}) } : {}),
      });
    }
    return {
      t: 'f', now: s.now, game: s.game, sys: s.sysIdx, mode: s.mode, flux: s.campFlux ? s.campFlux() : -1, alert: s.alert, view: s.view, viewId: s.viewId, missionT: r1(s.missionT), kills: s.kills, bonus: s.bonus,
      sr: Math.round(s.sensorRange()), nebula: s.inNebula(P.x, P.y),
      P: {
        x: r1(P.x), y: r1(P.y), hdg: r1(P.hdg), desHdg: r1(P.desHdg), speed: r1(P.speed), throttle: P.throttle, warpSet: P.warpSet, warpCap: r1(s.warpCap() * 10) / 10, impCap: Math.round(s.impulseCap()),
        warpCharge: r1(P.warpCharge * 100) / 100, warping: P.warping, evasive: P.evasive, autopilot: P.autopilot, apTarget: P.apTarget,
        wpValid: P.wpValid, wpx: Math.round(P.wpx), wpy: Math.round(P.wpy), dock: P.dock, dockT: r1(P.dockT), energy: r1(P.energy),
        energyRate: r1(P.energyRate), hull: r1(P.hull), shield: P.shield.map(r1), shieldMax: [0, 1, 2, 3].map((q) => Math.round(s.shieldCap(q))),
        shieldsOn: P.shieldsOn, shieldRaise: r1(P.shieldRaise * 100) / 100, reinforce: P.reinforce, phFreq: P.phFreq,
        health: P.health.map(r1), power: P.power, coolant: P.coolant, heat: P.heat.map(r1), team: P.team,
        phCharge: Math.round(P.phCharge * 100) / 100, autoFire: P.autoFire, torps: P.torps, tubeState: P.tubeState, tubeType: P.tubeType,
        tubeTimer: P.tubeTimer.map(r1), target: P.target, sub: P.sub, scanId: P.scanId, scanProg: Math.round(P.scanProg * 100) / 100, lrs: r1(P.lrs),
        cargo: P.cargo, arts: P.arts, xId: P.xId, xMode: P.xMode, xProg: r2(P.xProg), refQ: P.refQ, refProg: r2(P.refProg),
        anaUid: P.anaUid, anaProg: r2(P.anaProg), anaDeep: P.anaDeep, fxPh: this.sim.fx('ph'),
        dockId: P.dockId, jumpTo: P.jumpTo, jumpPlot: P.jumpPlot, icPlot: P.icPlot, jumpVec: P.jumpPlot !== K.NO_ID ? s.jumpVector(P.jumpPlot) : -1, jumpCharge: Math.round(P.jumpCharge * 100) / 100, jumping: r1(P.jumping),
        labUid: P.labUid, labTest: P.labTest, labProg: r2(P.labProg),
        orb: P.orb, orbitPl: P.orbitPl, orbPlot: P.orbPlot, oort: Math.round(P.oort), bubR: Math.round(s.bubR()), shRange: Math.round(P.shRange * 100) / 100, vx: r1(P.vx), vy: r1(P.vy), autoBrake: P.autoBrake, allStop: P.allStop,
      },
      npc,
      torp: s.torp.map((t) => ({ id: t.id, owner: t.owner, type: t.type, x: Math.round(t.x), y: Math.round(t.y), hdg: r1(t.hdg) })),
      beams: s.beams.map((b) => (b.tx !== undefined ? { from: b.from, to: b.to, hit: b.hit, t0: b.t0, tx: Math.round(b.tx), ty: Math.round(b.ty) } : { from: b.from, to: b.to, hit: b.hit, t0: b.t0 })),
      drift: s.boulders ? s.boulders() : [],
      booms: s.booms.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), size: b.size, t0: b.t0 })),
    };
  }
  // why each neighbouring system can't be jumped to right now ('' = go)
  jumpReasons() {
    const s = this.sim, out = {};
    if (s.game !== K.GS_RUN) return out;
    for (const i of lanesOfSys(s.sysIdx)) out[i] = s.jumpBlock(i);
    return out;
  }
  buildSlow() {
    const s = this.sim, M = s.M;
    s.adviseTick(); // the first officer's advice, for the STATUS viewscreen
    const threat = {}, trails = {};
    for (let id = 0; id < K.MAX_CONTACTS; id++) {
      const n = s.npc[id];
      if (!n.active) continue;
      if (n.alive && s.visible(id)) threat[id] = s.threatText(id);
      if (n.trail.length) trails[id] = n.trail;
    }
    const orders = s.orders.map((o) => {
      const owner = this.ownerOfTab(K.ORDERS[o.code].tab);
      return {
        id: o.id, code: o.code, arg: o.arg, status: o.status, tab: K.ORDERS[o.code].tab, text: s.orderText(o.code, o.arg),
        age: Math.round((s.now - o.t0) / 1000), took: o.status === K.ORD_DONE ? Math.round((o.tDone - o.t0) / 1000) : 0,
        to: owner ? owner.pid : null, toName: owner ? owner.name : '',
      };
    });
    return {
      t: 's', now: s.now, selType: s.selType, selDiff: s.selDiff, selMode: s.selMode, mode: s.mode, sys: s.sysIdx,
      selCamp: s.selCamp | 0, campMaxes: s.campMaxes(), camp: s.camp ? { id: s.camp.id, ch: s.camp.ch, t0: s.camp.t0, ending: s.camp.ending || null, lines: s.camp.lines || null, ring: s.camp.ring || null, obj2: s.camp.danger || null } : null, stats: s.stats, visitedN: s.visited.size,
      field: s.fieldSnap ? s.fieldSnap() : null, labShow: s.labShow || 0,
      visited: [...s.visited], revealed: [...s.revealed], jumpWhy: s.P.jumpTo === K.NO_ID ? this.jumpReasons() : {}, captain: s.captainMode, nameSeed: s.nameSeed, endAt: s.endAt,
      M: { type: M.type, diff: M.diff, stage: M.stage, fail: M.fail, objective: M.objective, mk: M.mk, fr: M.fr, wave: M.wave,
        waves: M.waves, frLost: M.frLost, ver: M.ver },
      msgs: s.msgs,
      dlg: s.dlg ? { seq: s.dlg.seq, key: s.dlg.key, who: s.dlg.who, from: s.dlg.from, left: s.dlg.deadline ? Math.max(0, Math.round((s.dlg.deadline - s.now) / 1000)) : 0 } : null,
      rep: s.rep, job: s.job ? { type: s.job.type, objective: s.job.objective, giver: s.job.giverName, reward: s.rewardText(s.job.reward) } : null,
      orders,
      ord: { issued: s.ordIssued, done: s.ordDone, avg: s.ordDone ? s.ordTimeSum / s.ordDone : 0 },
      advice: s.advice.map((a) => ({ ...a, otext: a.code < K.NUM_ORDERS ? s.orderText(a.code, a.arg) : '' })),
      threat, trails, ptrail: s.ptrail,
    };
  }
}
