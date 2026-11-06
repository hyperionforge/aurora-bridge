// ============================================================================
// world.js - what a station knows: the host's snapshots, smoothed
// ============================================================================
// Fast snapshots (10/s) carry the ship, contacts and projectiles; slow ones
// (2/s, or at once when something changes) carry mission, messages, orders,
// trails. Positions are interpolated ~110 ms behind the newest snapshot so
// everything moves smoothly at 30-60 fps.
import * as K from './config.js';
import { lerp, lerpAng, shortName, contactName, distTo, bearingTo } from './util.js';
import { sysAt } from './galaxy.js';
import { buildField } from './field.js';

const DELAY = 110;
const EMPTY_P = { x: 0, y: 0, hdg: 0, desHdg: 0, speed: 0, throttle: 0, warpSet: 0, warpCap: 4, impCap: 160, warpCharge: 0, warping: false, evasive: false, autopilot: 0,
  apTarget: K.NO_ID, wpValid: false, wpx: 0, wpy: 0, dock: 0, dockT: 0, energy: 1000, energyRate: 0, hull: 100, shield: [0, 0, 0, 0],
  shieldMax: [100, 100, 100, 100], shieldsOn: false, shieldRaise: 0, reinforce: 0, phFreq: 0, health: [100, 100, 100, 100, 100, 100],
  power: [100, 100, 100, 100, 100, 100], coolant: [0, 0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0, 0], team: [K.NO_ID, K.NO_ID], phCharge: 0,
  autoFire: false, torps: [0, 0], tubeState: [0, 0], tubeType: [0, 0], tubeTimer: [0, 0], target: K.NO_ID, sub: 0, scanId: K.NO_ID, scanProg: 0, lrs: 0,
  cargo: [0, 0, 0, 0, 0, 0, 0, 0, 0], arts: [], refQ: [], refProg: 0, xId: K.NO_ID, xMode: 0, xProg: 0, anaUid: 0, anaProg: 0, anaDeep: 0, jumpTo: K.NO_ID, jumpCharge: 0, jumping: 0, jumpPlot: K.NO_ID, icPlot: K.NO_ID, jumpVec: -1,
  orb: null, orbitPl: -1, orbPlot: -1, oort: 0, bubR: 600, shRange: 0 };

export class World {
  constructor() {
    this.f0 = null;
    this.f1 = null;
    this.a1 = 0;
    this.slow = null;
    this.lobby = null;
    this.P = EMPTY_P;
    this.npc = [];
    this.byId = new Array(K.MAX_CONTACTS).fill(null);
    this.torp = [];
    this.beams = [];
    this.booms = [];
    this.now = 0;
    this.rt = 0;
    this.game = K.GS_TITLE;
    this.lastRx = 0;
    this.listeners = [];
  }
  get have() { return !!this.f1; }
  get M() { return this.slow ? this.slow.M : { type: 0, diff: 1, stage: 0, fail: 0, objective: '', mk: [], fr: K.NO_ID, wave: 0, waves: 0 }; }
  get msgs() { return this.slow ? this.slow.msgs : []; }
  get orders() { return this.slow ? this.slow.orders : []; }
  get nameSeed() { return this.slow ? this.slow.nameSeed : 0; }
  get captain() { return this.slow ? this.slow.captain : false; }
  get sysIdx() { return this.f1 ? this.f1.sys : 0; }
  get sys() { return sysAt(this.sysIdx); }
  get mode() { return this.f1 ? this.f1.mode : 0; }
  get tSec() { return this.now / 1000; }  // game clock for orbits
  get flux() { return this.f1 && this.f1.flux !== undefined ? this.f1.flux : -1; }
  // the asteroids around us: the field's rocks (rebuilt from its spec) minus destroyed ones, plus drifting boulders
  rocks() {
    const fs = this.slow && this.slow.field;
    const drift = (this.f1 && this.f1.drift) || [];
    if (!fs) { this._rk = null; return drift.length ? drift.map(([id, x, y, r]) => ({ id, x, y, r, drift: true })) : []; }
    const key = fs.spec.seed + ':' + fs.gone.length;
    if (!this._rk || this._rk.key !== key) {
      const gone = new Set(fs.gone);
      this._rk = { key, list: buildField(fs.spec).rocks.filter((q) => !gone.has(q.id)) };
    }
    if (!drift.length) return this._rk.list;
    return this._rk.list.concat(drift.map(([id, x, y, r]) => ({ id, x, y, r, drift: true })));
  }
  get fieldSpec() { return this.slow && this.slow.field ? this.slow.field.spec : null; }

  onMessage(m) {
    this.lastRx = performance.now();
    if (m.t === 'f') {
      // a restarted host has a smaller clock: drop the old snapshot
      if (this.f1 && m.now < this.f1.now) this.f0 = null;
      else this.f0 = this.f1;
      this.f1 = m;
      this.a1 = performance.now();
      this.game = m.game;
    } else if (m.t === 's') this.slow = m;
    else if (m.t === 'lobby') this.lobby = m;
  }

  // interpolate - call once per frame
  update() {
    const f1 = this.f1;
    if (!f1) return;
    const f0 = this.f0 || f1;
    const est = f1.now + (performance.now() - this.a1);
    this.now = est;
    const rt = est - DELAY;
    this.rt = rt;
    const span = f1.now - f0.now;
    const a = span > 0 ? Math.max(0, Math.min(1.6, (rt - f0.now) / span)) : 1;
    const P0 = f0.P, P1 = f1.P;
    this.P = { ...P1, x: lerp(P0.x, P1.x, a), y: lerp(P0.y, P1.y, a), hdg: lerpAng(P0.hdg, P1.hdg, Math.min(a, 1.2)), speed: lerp(P0.speed, P1.speed, Math.min(a, 1)) };
    // a big jump (new mission / docking snap) - don't slide across the map
    if (distTo(P0.x, P0.y, P1.x, P1.y) > 5000 && !P1.warping) { this.P.x = P1.x; this.P.y = P1.y; }
    const prev = new Map(f0.npc.map((n) => [n.id, n]));
    this.npc = f1.npc.map((n) => {
      const p = prev.get(n.id);
      if (!p || p.type !== n.type || distTo(p.x, p.y, n.x, n.y) > 4000) return n;
      return { ...n, x: lerp(p.x, n.x, a), y: lerp(p.y, n.y, a), hdg: lerpAng(p.hdg, n.hdg, Math.min(a, 1.2)) };
    });
    this.byId = new Array(K.MAX_CONTACTS).fill(null);
    for (const n of this.npc) this.byId[n.id] = n;
    const tp = new Map(f0.torp.map((t) => [t.id, t]));
    this.torp = f1.torp.map((t) => {
      const p = tp.get(t.id);
      return p ? { ...t, x: lerp(p.x, t.x, a), y: lerp(p.y, t.y, a) } : t;
    });
    this.beams = f1.beams.filter((b) => rt - b.t0 >= -50 && rt - b.t0 < 600);
    this.booms = f1.booms.filter((b) => rt - b.t0 < 1500);
  }
  get alert() { return this.f1 ? this.f1.alert : 0; }
  get view() { return this.f1 ? this.f1.view : 0; }
  get viewId() { return this.f1 ? this.f1.viewId : K.NO_ID; }
  get missionT() { return this.f1 ? this.f1.missionT : 0; }
  get kills() { return this.f1 ? this.f1.kills : 0; }
  get bonus() { return this.f1 ? this.f1.bonus : false; }
  get sensorRange() { return this.f1 ? this.f1.sr : K.SENSOR_RANGE; }
  get inNebula() { return this.f1 ? this.f1.nebula : false; }
  hostOK() { return this.lastRx && performance.now() - this.lastRx < 3000; }

  // ---------------------------------------------------------------- contacts
  n(id) { return id < K.MAX_CONTACTS ? this.byId[id] : null; }
  visible(id) { const n = this.n(id); return !!(n && n.vis); }
  known(id) { const n = this.n(id); return !!(n && (n.scan > 0 || n.type === K.CT_STARBASE)); }
  typeOf(id) { const n = this.n(id); return n ? n.type : id === K.ID_BASE ? K.CT_STARBASE : K.CT_RAIDER; }
  shortName(id, known = this.known(id)) {
    const n = this.n(id);
    if (n && n.short && (known || n.type === K.CT_STARBASE)) return n.short;
    return shortName(id, this.typeOf(id), known, this.nameSeed);
  }
  contactName(id, known = this.known(id)) {
    const n = this.n(id);
    if (n && n.name && (known || n.type === K.CT_STARBASE)) return n.name;
    return contactName(id, this.typeOf(id), known, this.nameSeed);
  }
  // what the sensors show: visible contacts, unknown ones masked (the hardware's ContactRec)
  contacts() {
    const out = [];
    for (const n of this.npc) {
      if (!n.vis) continue;
      const known = n.scan >= 1 || n.type === K.CT_STARBASE;
      const full = n.scan >= 2;
      out.push({
        id: n.id, x: n.x, y: n.y, hdg: n.hdg, speed: n.speed, alive: n.alive, scan: n.scan, known, kind: n.kind, civ: n.civ, poi: n.poi, res: n.res, art: n.art, haz: n.haz, smp: n.smp, note: n.note,
        type: known ? n.type : n.type === K.CT_ANOMALY || n.type === K.CT_POI ? n.type : K.CT_FREIGHTER,
        faction: known ? n.faction : K.F_UNKNOWN,
        surrender: n.ai === 6, fleeing: n.ai === 5,
        hull: full ? n.hull : null, shields: full ? (n.shMax > 0 ? n.shields * 100 / n.shMax : 0) : null,
        freq: full ? n.freq : null, eng: full ? n.eng : null, wpn: full ? n.wpn : null, sgen: full ? n.sgen : null,
      });
    }
    return out;
  }
  findC(id) { return this.contacts().find((c) => c.id === id) || null; }
  range(c) { return distTo(this.P.x, this.P.y, c.x, c.y); }
  bearing(c) { return bearingTo(this.P.x, this.P.y, c.x, c.y); }
  targetValid() { const P = this.P, n = this.n(P.target); return !!(n && n.alive && n.vis); }
  shieldsUp() { return this.P.shieldRaise >= 0.99; }
}

// ---------------------------------------------------------------- network link
export class Link {
  constructor(url, onMsg, onState) {
    this.url = url;
    this.onMsg = onMsg;
    this.onState = onState || (() => {});
    this.ws = null;
    this.hello = null;
    this.open = false;
    this.connect();
  }
  connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch { setTimeout(() => this.connect(), 1500); return; }
    this.ws = ws;
    ws.onopen = () => { this.open = true; this.onState(true); if (this.hello) this.send(this.hello); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'who') { if (this.hello) this.send(this.hello); return; }
      this.onMsg(m, e.data);
    };
    ws.onclose = () => { this.open = false; this.onState(false); setTimeout(() => this.connect(), 1200); };
    ws.onerror = () => {};
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  setHello(h) { this.hello = h; this.send(h); }
}
