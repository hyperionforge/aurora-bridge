// ============================================================================
// sim.js - THE SIMULATION (runs on the host phone only)
// ============================================================================
// Straight port of sim.h + missions.h + orders.h from the ESP32 build: the
// host owns the ship, every other ship, the mission script, combat and
// engineering. Stations only send commands and draw what the host sends.
import * as K from './config.js';
import { clampf, wrap360, angDiff, bearingTo, distTo, quadFromRel, sectorName, contactName, shortName, orderText, DEG } from './util.js';

const {
  NO_ID, US, MAX_CONTACTS, NSYS, S_IMPULSE, S_WARP, S_PHASERS, S_TORPS, S_SHIELDS, S_SENSORS,
  CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_ANOMALY, CT_BUOY,
  F_FRIEND, F_NEUTRAL, F_HOSTILE, F_UNKNOWN, GS_TITLE, GS_RUN, GS_WIN, GS_LOST,
  FROM_COMMAND, FROM_COMPUTER, FROM_CREW, BASE_X, BASE_Y, ID_BASE, ID_BONUS, ID_FIRST_DYN, SECTOR,
} = K;

export const AI_STATIC = 0, AI_DRIFT = 1, AI_TRAVEL = 2, AI_WARPIN = 3, AI_ATTACK = 4, AI_FLEE = 5, AI_SURRENDER = 6, AI_PATROL = 7;
const TRAIL = 24, PTRAIL = 120, MAX_TORPS = 10, MAX_BEAMFX = 6, MAX_BOOMS = 10, MSG_KEEP = 12, MAX_ORDERS = 8, MAX_ADVICE = 5;
const DIFF_DMG = [0.7, 1.0, 1.3];

function newPlayer() {
  return {
    x: 0, y: 0, hdg: 0, desHdg: 0, speed: 0, throttle: 0, warpSet: 0, warpCharge: 0, warping: false, evasive: false,
    autopilot: 0, apTarget: NO_ID, wpValid: false, wpx: 0, wpy: 0, dock: 0, dockT: 0, energy: 0, energyRate: 0, hull: 0,
    shield: [0, 0, 0, 0], shieldsOn: false, shieldRaise: 0, reinforce: 0, phFreq: 0,
    health: [0, 0, 0, 0, 0, 0], power: [0, 0, 0, 0, 0, 0], coolant: [0, 0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0, 0],
    team: [NO_ID, NO_ID], phCharge: 0, autoFire: false, torps: [0, 0], tubeState: [0, 0], tubeType: [0, 0], tubeTimer: [0, 0],
    target: NO_ID, sub: 0, scanId: NO_ID, scanProg: 0, lrs: 0, restockT: 0, overheatWarnAt: [-1e9, -1e9, -1e9, -1e9, -1e9, -1e9],
  };
}
function newNpc() {
  return {
    active: false, alive: false, type: 0, faction: 0, x: 0, y: 0, hdg: 0, desHdg: 0, speed: 0, hull: 0, shields: 0, shMax: 0, armor: 1,
    freq: 0, eng: 0, wpn: 0, sgen: 0, scan: 0, ai: 0, aiTarget: US, aiT: 0, phCd: 0, torpCd: 0, orbitDir: 1, breakOff: 0, jinkAt: 0,
    homeX: 0, homeY: 0, cruise: 60, deadAt: 0, trail: [], trailT: 0,
  };
}

export class Sim {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.now = 1000;            // simulated milliseconds
    this.events = [];           // {type, arg, flash} - flushed by the host every tick
    this.P = newPlayer();
    this.npc = Array.from({ length: MAX_CONTACTS }, newNpc);
    this.torp = [];
    this.beams = [];
    this.booms = [];
    this.ptrail = [];
    this.ptrailT = 0;
    this.game = GS_TITLE;
    this.alert = K.AL_GREEN;
    this.view = K.VM_FORWARD;
    this.viewId = NO_ID;
    this.viewBefore = K.VM_FORWARD;
    this.viewRevertAt = 0;
    this.bonus = false;
    this.kills = 0;
    this.missionT = 0;
    this.endAt = 0;
    this.selType = K.MT_RANDOM;
    this.selDiff = 1;
    this.captainMode = false;
    this.nameSeed = 0;
    this.M = this.newMission();
    this.msgs = [];
    this.nextMsgId = 1;
    this.lastHailId = NO_ID;
    this.lastHailAt = -1;
    this.lastTorpAt = -1;
    this.torpSeq = 1;
    // captain's orders
    this.orders = [];
    this.nextOrderId = 1;
    this.ordIssued = 0;
    this.ordDone = 0;
    this.ordTimeSum = 0;
    this.advice = [];
    this.resetWorld();
  }
  newMission() {
    return { type: 0, diff: 1, stage: 0, stageT: 0, fr: NO_ID, ids: [], foes: [], wave: 0, waves: 0, encounter: 0,
      ambush: false, frLost: false, frSaved: false, ax: 0, ay: 0, bx: 0, by: 0, fail: 0, objective: '', mk: [], ver: 0 };
  }
  frand() { return this.rand(); }
  irand(n) { return Math.floor(this.rand() * n); }

  // ---------------------------------------------------------------- names
  typeOfId(id) { return id < MAX_CONTACTS ? this.npc[id].type : CT_STARBASE; }
  shortName(id, known = true) { return shortName(id, this.typeOfId(id), known, this.nameSeed); }
  contactName(id, type, known = true) { return contactName(id, type, known, this.nameSeed); }
  contactKnown(id) { return id < MAX_CONTACTS && (this.npc[id].scan > 0 || this.npc[id].type === CT_STARBASE); }
  orderText(code, arg) { return orderText(code, arg, (id) => this.shortName(id, this.contactKnown(id))); }

  // ---------------------------------------------------------------- events / messages
  emit(type, arg = 0, flash = null) { this.events.push({ type, arg, flash }); }
  say(from, col, text, o1 = 0, o2 = 0, o3 = 0) {
    const m = { id: this.nextMsgId++, from, col, text, opt: [o1, o2, o3].filter((o) => o) };
    this.msgs.unshift(m);
    if (this.msgs.length > MSG_KEEP) this.msgs.length = MSG_KEEP;
    if (from < MAX_CONTACTS || from === FROM_COMMAND) { // transmissions go on the viewer for a few seconds
      if (this.view !== K.VM_COMMS) this.viewBefore = this.view;
      this.view = K.VM_COMMS;
      this.viewRevertAt = this.now + 9000;
    }
    this.emit(K.EV_MESSAGE);
  }
  denied(why) {
    this.say(FROM_COMPUTER, 1, why);
    this.emit(K.EV_DENIED);
  }

  // ---------------------------------------------------------------- helpers
  eff(s) {
    const P = this.P;
    let e = (P.power[s] / 100) * (P.health[s] / 100);
    if (P.energy <= 0.5) e *= 0.3;
    return e;
  }
  inNebula(x, y) { return distTo(x, y, K.NEB_X, K.NEB_Y) < K.NEB_R; }
  sensorRange() {
    const P = this.P;
    let r = K.SENSOR_RANGE * clampf(this.eff(S_SENSORS), 0.3, 1.5);
    if (this.inNebula(P.x, P.y)) r *= 0.4;
    if (P.lrs > 0) r *= 3;
    return r;
  }
  visible(id) {
    const n = this.npc[id], P = this.P;
    if (!n || !n.active) return false;
    if (n.type === CT_STARBASE) return true;
    const d = distTo(P.x, P.y, n.x, n.y);
    let r = this.sensorRange();
    if (this.inNebula(n.x, n.y) && !this.inNebula(P.x, P.y) && P.lrs <= 0) r *= 0.5;
    return d < r;
  }
  shieldCap(q) {
    const P = this.P;
    let base = 100;
    if (P.reinforce !== K.RF_BAL) {
      const rq = P.reinforce - 1;
      const opp = rq === 0 ? 1 : rq === 1 ? 0 : rq === 2 ? 3 : 2;
      if (q === rq) base = 160;
      else if (q === opp) base = 40;
    }
    return base * clampf(this.eff(S_SHIELDS), 0, 1.25);
  }
  shieldsUp() { return this.P.shieldRaise >= 0.99; }
  boomAt(x, y, size) {
    this.booms.push({ x, y, t0: this.now, size });
    if (this.booms.length > MAX_BOOMS) this.booms.shift();
  }
  beamFx(from, to, hit) {
    this.beams.push({ from, to, hit, t0: this.now });
    if (this.beams.length > MAX_BEAMFX) this.beams.shift();
  }
  hostileAlive(id) {
    const n = this.npc[id];
    return n.active && n.alive && n.faction === F_HOSTILE && n.ai !== AI_SURRENDER;
  }

  // ---------------------------------------------------------------- setup
  spawnNpc(id, type, faction, x, y, hdg) {
    const n = newNpc();
    this.npc[id] = n;
    n.active = n.alive = true;
    n.type = type;
    n.faction = faction;
    n.x = x; n.y = y;
    n.hdg = n.desHdg = hdg;
    n.hull = 100;
    n.armor = 1;
    n.eng = n.wpn = n.sgen = 100;
    n.freq = this.irand(5);
    n.orbitDir = this.rand() < 0.5 ? 1 : -1;
    n.aiTarget = US;
    n.homeX = x; n.homeY = y;
    n.cruise = 60;
    n.jinkAt = 4 + this.frand() * 4;
    switch (type) {
      case CT_STARBASE: n.shMax = 200; n.ai = AI_STATIC; n.scan = 2; n.armor = 0.2; break;
      case CT_ANOMALY: n.shMax = 0; n.ai = AI_STATIC; break;
      case CT_BUOY: n.shMax = 0; n.ai = AI_STATIC; break;
      case CT_FREIGHTER: n.shMax = 20; n.ai = AI_DRIFT; break;
      case CT_RAIDER: n.shMax = 80; n.ai = AI_ATTACK; break;
      case CT_DESTROYER: n.shMax = 200; n.ai = AI_ATTACK; n.torpCd = 4; n.armor = 0.5; break;
    }
    n.shields = n.shMax;
    n.phCd = 2 + this.frand() * 2;
    if (!n.torpCd) n.torpCd = 8 + this.frand() * 6;
  }
  resetPlayer() {
    const P = (this.P = newPlayer());
    P.x = BASE_X + 2400;
    P.y = BASE_Y - 1200;
    P.hdg = P.desHdg = 45;
    P.energy = K.ENERGY_MAX;
    P.hull = 100;
    for (let i = 0; i < NSYS; i++) { P.health[i] = 100; P.power[i] = 100; }
    for (let q = 0; q < 4; q++) P.shield[q] = 100;
    P.torps = [K.TORP_START[0], K.TORP_START[1]];
  }
  resetWorld() {
    this.npc = Array.from({ length: MAX_CONTACTS }, newNpc);
    this.torp = [];
    this.beams = [];
    this.booms = [];
    this.resetPlayer();
    this.spawnNpc(ID_BASE, CT_STARBASE, F_FRIEND, BASE_X, BASE_Y, 0);
    this.spawnNpc(ID_BONUS, CT_ANOMALY, F_UNKNOWN, K.ANOM_X, K.ANOM_Y, 0);
    this.ptrail = [];
    this.missionT = 0;
    this.bonus = false;
    this.kills = 0;
    const keepT = this.M.type, keepD = this.M.diff, ver = this.M.ver;
    this.M = this.newMission();
    this.M.type = keepT;
    this.M.diff = keepD;
    this.M.ver = ver + 1;
    this.alert = K.AL_GREEN;
    this.view = K.VM_FORWARD;
    this.viewId = NO_ID;
    this.msgs = [];
  }
  endMission(won, fail = K.FAIL_NONE) {
    this.game = won ? GS_WIN : GS_LOST;
    this.M.fail = fail;
    this.M.ver++;
    this.endAt = this.now;
    this.emit(won ? K.EV_VICTORY : K.EV_DEFEAT);
  }

  // ---------------------------------------------------------------- damage
  damageNpc(id, dmg, sub, attacker) {
    const n = this.npc[id];
    if (!n.alive || n.type === CT_ANOMALY) return;
    if (n.shields > 0) {
      const a = Math.min(dmg, n.shields);
      n.shields -= a;
      dmg -= a;
    }
    if (dmg > 0) {
      if (sub === K.SUB_HULL || n.type === CT_STARBASE) {
        n.hull -= dmg * n.armor;
      } else {
        n.hull -= dmg * 0.6 * n.armor;
        const key = sub === K.SUB_ENGINES ? 'eng' : sub === K.SUB_WEAPONS ? 'wpn' : 'sgen';
        const was = n[key] > 0;
        n[key] = Math.max(0, n[key] - dmg * 1.3);
        if (was && n[key] <= 0 && attacker === US) this.say(FROM_CREW, 3, `${this.shortName(id)} ${K.SUB_NAME[sub]} DISABLED.`);
        if (sub === K.SUB_SHIELDS && n.sgen <= 0) n.shields = 0;
      }
    }
    if (attacker === US && n.type === CT_FREIGHTER && n.alive && n.hull > 0 && n.scan > 0) {
      this.say(id, 1, 'CEASE FIRE! WE ARE AN UNARMED FREIGHTER!');
    }
    if (attacker === US && (n.type === CT_RAIDER || n.type === CT_DESTROYER) && (n.ai === AI_ATTACK || n.ai === AI_PATROL)) {
      n.aiTarget = US; // shoot them and they turn on you
      n.ai = AI_ATTACK;
    }
    if (n.hull <= 0) {
      n.hull = 0;
      n.alive = false;
      n.deadAt = this.now;
      this.boomAt(n.x, n.y, 1);
      if (n.faction === F_HOSTILE || n.ai === AI_SURRENDER) this.kills++;
      this.emit(K.EV_ENEMY_DESTROYED);
      if (n.type === CT_FREIGHTER) this.say(FROM_CREW, 2, `WE'VE LOST THE ${this.shortName(id)}. NO LIFE SIGNS.`);
      else if (n.type === CT_STARBASE) this.say(FROM_CREW, 2, 'STARBASE 12 HAS BEEN DESTROYED...');
      else this.say(FROM_CREW, 3, `${this.contactName(id, n.type)} DESTROYED.`);
      if (this.P.target === id) this.P.target = NO_ID;
      this.missionOnDestroyed(id);
    }
  }
  damagePlayer(fromX, fromY, dmg) {
    if (this.game !== GS_RUN) return;
    const P = this.P;
    const rel = angDiff(P.hdg, bearingTo(P.x, P.y, fromX, fromY));
    const q = quadFromRel(rel);
    if (this.shieldsUp() && P.shield[q] > 0) {
      const a = Math.min(dmg, P.shield[q]);
      P.shield[q] -= a;
      dmg -= a;
    }
    if (dmg <= 0.01) {
      this.emit(K.EV_WE_HIT_SHIELD, q, 'shield');
      return;
    }
    P.hull -= dmg * 0.55;
    const s = K.QUAD_SYS[q][this.rand() < 0.5 ? 0 : 1];
    const was = P.health[s] > 0;
    P.health[s] = Math.max(0, P.health[s] - dmg * 0.9);
    if (was && P.health[s] <= 0) {
      this.say(FROM_CREW, 2, `${K.SYS_NAME[s]} OFFLINE! SEND A REPAIR TEAM.`);
      this.emit(K.EV_SYS_DAMAGED, s, 'hull');
    } else {
      this.emit(K.EV_WE_HIT_HULL, q, 'hull');
    }
    if (s === S_WARP && P.health[s] <= 0) P.warpSet = 0;
    if (P.hull <= 0) {
      P.hull = 0;
      this.boomAt(P.x, P.y, 1);
      this.endMission(false, K.FAIL_SHIP);
    }
  }

  // ---------------------------------------------------------------- our weapons
  targetValid() {
    const P = this.P;
    return P.target < MAX_CONTACTS && this.npc[P.target].active && this.npc[P.target].alive && this.visible(P.target);
  }
  firePhasers(manual) {
    const P = this.P;
    if (P.phCharge < 1) { if (manual) this.denied('PHASERS NOT CHARGED.'); return false; }
    if (P.dock) { if (manual) this.denied('CANNOT FIRE WHILE DOCKED.'); return false; }
    if (!this.targetValid()) { if (manual) this.denied('NO TARGET SELECTED.'); return false; }
    const n = this.npc[P.target];
    if (n.faction === F_FRIEND) { if (manual) this.denied('WEAPONS LOCKED - TARGET IS FRIENDLY.'); return false; }
    const d = distTo(P.x, P.y, n.x, n.y);
    if (d > K.PH_RANGE) { if (manual) this.denied('TARGET OUT OF PHASER RANGE (6k).'); return false; }
    if (Math.abs(angDiff(P.hdg, bearingTo(P.x, P.y, n.x, n.y))) > K.PH_ARC) { if (manual) this.denied('TARGET BEHIND US - OUT OF PHASER ARC.'); return false; }
    P.phCharge = 0;
    const p = K.PH_HIT * clampf(this.eff(S_SENSORS), 0.4, 1.0) * (n.ai === AI_FLEE ? 0.85 : 1.0);
    const hit = this.frand() < p;
    this.beamFx(US, P.target, hit);
    if (hit) {
      let dmg = K.PH_DAMAGE * clampf(this.eff(S_PHASERS), 0.3, 1.6);
      if (P.phFreq === n.freq) dmg *= K.FREQ_BONUS;
      const tid = P.target;
      this.damageNpc(tid, dmg, P.sub, US);
      this.boomAt(n.x, n.y, 0);
    }
    this.emit(hit ? K.EV_PHASER_HIT : K.EV_PHASER_MISS);
    return true;
  }
  launchTorp(owner, type, x, y, hdg, target, dmg, sub) {
    if (this.torp.length >= MAX_TORPS) return;
    this.torp.push({ id: this.torpSeq++, owner, type, target, sub, x, y, hdg, life: K.TORP_LIFE_S, dmg, missed: false });
  }

  // ---------------------------------------------------------------- commands from stations
  handleCmd(c) {
    const P = this.P, CMD = K.CMD;
    const a = c.a | 0, b = c.b | 0;
    if (c.cmd === CMD.START) { if (this.game !== GS_RUN) this.startMission(); return; }
    if (c.cmd === CMD.ORDER_ACK) { this.orderAck(a); return; }
    if (c.cmd === CMD.ORDER) { this.issueOrder(a, b); return; }
    if (c.cmd === CMD.SELECT) {
      if (this.game !== GS_RUN) { this.selType = ((a % K.NUM_MT) + K.NUM_MT) % K.NUM_MT; this.selDiff = ((b % 3) + 3) % 3; this.M.ver++; }
      return;
    }
    if (c.cmd === CMD.RESTART) { if (this.game !== GS_RUN) this.game = GS_TITLE; return; }
    if (c.cmd === CMD.VIEW) { this.view = a % K.NUM_VM; this.viewId = b; this.viewRevertAt = 0; return; }
    if (this.game !== GS_RUN) return;
    switch (c.cmd) {
      case CMD.HEADING: P.desHdg = wrap360(+c.c || 0); P.autopilot = K.AP_OFF; break;
      case CMD.THROTTLE:
        P.throttle = Math.round(clampf(+c.c || 0, -25, 100));
        if (P.dock === 2 && P.throttle > 0) { P.dock = 0; this.say(FROM_CREW, 0, 'UNDOCKED. CLEAR OF THE STARBASE.'); }
        break;
      case CMD.WARP:
        if (a > 0 && P.dock) { this.denied('UNDOCK BEFORE ENGAGING WARP.'); break; }
        if (a > 0 && P.health[S_WARP] <= 0) { this.denied('WARP DRIVE OFFLINE.'); break; }
        P.warpSet = Math.min(a, K.WARP_MAX);
        if (!P.warpSet) { P.warping = false; P.warpCharge = 0; }
        break;
      case CMD.STOP: P.throttle = 0; P.warpSet = 0; P.warping = false; P.warpCharge = 0; P.autopilot = K.AP_OFF; break;
      case CMD.EVASIVE: P.evasive = !!a; break;
      case CMD.AUTOPILOT:
        if (a === K.AP_WAYPOINT && !P.wpValid) { this.denied('NO WAYPOINT SET.'); break; }
        if (a === K.AP_TARGET && !(b < MAX_CONTACTS && this.visible(b))) { this.denied('NO CONTACT TO INTERCEPT.'); break; }
        P.autopilot = a;
        P.apTarget = b;
        break;
      case CMD.WAYPOINT:
        P.wpValid = !!a;
        P.wpx = clampf(+c.c || 0, 0, SECTOR);
        P.wpy = clampf(+c.d || 0, 0, SECTOR);
        if (!P.wpValid && P.autopilot === K.AP_WAYPOINT) P.autopilot = K.AP_OFF;
        break;
      case CMD.DOCK: {
        const d = distTo(P.x, P.y, BASE_X, BASE_Y);
        if (P.dock) break;
        if (!this.npc[ID_BASE].alive) { this.denied('THERE IS NO STARBASE TO DOCK WITH.'); break; }
        if (d > K.DOCK_RANGE) { this.denied('TOO FAR FROM THE STARBASE TO DOCK (< 1.8k).'); break; }
        if (Math.abs(P.speed) > K.DOCK_MAX_SPEED) { this.denied('TOO FAST TO DOCK - SLOW BELOW 25 KM/S.'); break; }
        if (P.shieldsOn) { this.denied('LOWER SHIELDS BEFORE DOCKING.'); break; }
        P.dock = 1; P.dockT = 0; P.throttle = 0; P.warpSet = 0;
        this.say(ID_BASE, 3, 'DOCKING CLAMPS ENGAGING. WELCOME HOME, AURORA.');
        break;
      }
      case CMD.UNDOCK: if (P.dock) { P.dock = 0; this.say(FROM_CREW, 0, 'UNDOCKED.'); } break;
      case CMD.SCAN:
        if (!(a < MAX_CONTACTS && this.visible(a))) { this.denied('NO SENSOR CONTACT TO SCAN.'); break; }
        if (this.npc[a].scan >= 2) { this.denied('CONTACT ALREADY FULLY SCANNED.'); break; }
        if (P.health[S_SENSORS] <= 0) { this.denied('SENSORS OFFLINE.'); break; }
        if (this.npc[a].type === CT_BUOY && distTo(P.x, P.y, this.npc[a].x, this.npc[a].y) > 8000) { this.denied('GET WITHIN 8K OF THE BUOY TO DOWNLOAD ITS LOG.'); break; }
        P.scanId = a;
        P.scanProg = 0;
        break;
      case CMD.LRS:
        if (P.energy < K.LRS_COST) { this.denied('NOT ENOUGH ENERGY FOR A LONG RANGE SCAN.'); break; }
        if (P.health[S_SENSORS] <= 0) { this.denied('SENSORS OFFLINE.'); break; }
        P.energy -= K.LRS_COST;
        P.lrs = K.LRS_TIME_S;
        break;
      case CMD.HAIL: this.commsHandle(a, 0); break;
      case CMD.REPLY: this.commsHandle(a, b); break;
      case CMD.TARGET: P.target = a; break;
      case CMD.SUB: P.sub = a % 4; break;
      case CMD.FIRE_PH: this.firePhasers(true); break;
      case CMD.AUTOFIRE: P.autoFire = !!a; break;
      case CMD.PH_FREQ: P.phFreq = a % 5; break;
      case CMD.TUBE_LOAD: {
        const t = a & 1, ty = b & 1;
        if (P.tubeState[t] !== K.TUBE_EMPTY) { this.denied('TUBE IS NOT EMPTY.'); break; }
        if (!P.torps[ty]) { this.denied('NO TORPEDOES OF THAT TYPE LEFT.'); break; }
        P.torps[ty]--;
        P.tubeType[t] = ty;
        P.tubeState[t] = K.TUBE_LOADING;
        P.tubeTimer[t] = K.TORP_LOAD_S;
        break;
      }
      case CMD.TUBE_UNLOAD: {
        const t = a & 1;
        if (P.tubeState[t] !== K.TUBE_LOADED) break;
        P.tubeState[t] = K.TUBE_UNLOADING;
        P.tubeTimer[t] = K.TORP_UNLOAD_S;
        break;
      }
      case CMD.TUBE_FIRE: {
        const t = a & 1;
        if (P.tubeState[t] !== K.TUBE_LOADED) { this.denied('TUBE NOT LOADED.'); break; }
        if (P.dock) { this.denied('CANNOT FIRE WHILE DOCKED.'); break; }
        if (this.targetValid() && this.npc[P.target].faction === F_FRIEND) { this.denied('WEAPONS LOCKED - TARGET IS FRIENDLY.'); break; }
        const r = P.hdg * DEG;
        this.launchTorp(US, P.tubeType[t], P.x + Math.sin(r) * 200, P.y - Math.cos(r) * 200, P.hdg,
          this.targetValid() ? P.target : NO_ID, K.TORP_DMG[P.tubeType[t]], P.sub);
        P.tubeState[t] = K.TUBE_EMPTY;
        this.emit(K.EV_TORP_LAUNCH);
        this.lastTorpAt = this.now;
        break;
      }
      case CMD.SHIELDS:
        if (a && P.dock) { this.denied('CANNOT RAISE SHIELDS WHILE DOCKED.'); break; }
        P.shieldsOn = !!a;
        break;
      case CMD.REINFORCE: P.reinforce = a % 5; break;
      case CMD.ALERT:
        if (a === this.alert) break;
        this.alert = a % 3;
        if (this.alert !== K.AL_GREEN) { if (!P.dock) P.shieldsOn = true; }
        else P.shieldsOn = false;
        this.emit(K.EV_ALERT, this.alert);
        break;
      case CMD.POWER: if (a < NSYS) P.power[a] = clampf(b, 0, K.POWER_MAX); break;
      case CMD.COOLANT:
        if (a < NSYS) {
          let used = 0;
          for (let i = 0; i < NSYS; i++) if (i !== a) used += P.coolant[i];
          let v = Math.min(b, K.COOLANT_MAX);
          if (used + v > K.COOLANT_TOTAL) v = K.COOLANT_TOTAL - used;
          P.coolant[a] = Math.max(0, v);
        }
        break;
      case CMD.TEAM: if (a < K.REPAIR_TEAMS) P.team[a] = b < NSYS ? b : NO_ID; break;
      case CMD.PRESET: {
        //       IMP  WRP  PHS  TRP  SHD  SEN
        const pw = [[100, 100, 100, 100, 100, 100], [100, 40, 160, 130, 160, 100], [150, 160, 40, 40, 60, 100], [60, 40, 60, 60, 80, 200]];
        const cl = [[0, 0, 0, 0, 0, 0], [0, 0, 3, 2, 3, 0], [2, 3, 0, 0, 0, 0], [0, 0, 0, 0, 0, 4]];
        const p = a % 4;
        for (let i = 0; i < NSYS; i++) { P.power[i] = pw[p][i]; P.coolant[i] = cl[p][i]; }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- comms
  commsHandle(id, opt) {
    if (!(id < MAX_CONTACTS) || !this.visible(id)) { this.denied('NO CONTACT TO HAIL.'); return; }
    if (opt === 0) { this.lastHailId = id; this.lastHailAt = this.now; }
    const n = this.npc[id], M = this.M;
    if (!n.alive) { this.denied('NO RESPONSE - THE VESSEL HAS BEEN DESTROYED.'); return; }
    if (opt === K.OPT_CLOSE) { this.say(FROM_CREW, 0, 'CHANNEL CLOSED.'); return; }
    switch (n.type) {
      case CT_ANOMALY: this.say(FROM_CREW, 0, "IT'S A SUBSPACE ANOMALY, CAPTAIN. THERE IS NOBODY TO HAIL."); return;
      case CT_STARBASE:
        if (opt === 0) this.say(id, 3, 'STARBASE 12 HERE, AURORA. HOW CAN WE HELP?', K.OPT_DOCK, K.OPT_STATUS, K.OPT_CLOSE);
        else if (opt === K.OPT_DOCK) this.say(id, 3, 'CLEARANCE GRANTED. COME IN BELOW 25 KM/S, SHIELDS DOWN, WITHIN 1.8K, THEN DOCK.');
        else this.say(id, 3, `ORDERS: ${M.objective}`);
        return;
      case CT_BUOY: this.say(FROM_CREW, 0, "IT'S AN AUTOMATED NAV BUOY - NOBODY ABOARD. A SCAN WILL READ ITS LOG."); return;
      case CT_FREIGHTER:
        if (n.scan === 0) { this.say(FROM_CREW, 1, 'NO RESPONSE. WE NEED TO IDENTIFY THEM FIRST - SCAN THE CONTACT.'); return; }
        if (opt === 0) {
          if (M.type === K.MT_DISTRESS && M.stage <= 3) this.say(id, 3, "RAIDERS HIT US AND TOOK OUR ENGINES OUT. THEY'LL BE BACK!", K.OPT_HELP, K.OPT_ASK, K.OPT_CLOSE);
          else if (M.type === K.MT_ESCORT) this.say(id, 3, "GOOD TO SEE YOU, AURORA. STAY CLOSE - WE CAN'T OUTRUN RAIDERS.", K.OPT_STATUS, K.OPT_ASK, K.OPT_CLOSE);
          else this.say(id, 3, "WE'RE HOLDING TOGETHER. THANK YOU, AURORA.", K.OPT_STATUS, K.OPT_CLOSE);
        } else if (opt === K.OPT_HELP) {
          this.say(id, 3, 'BLESS YOU. PLEASE HURRY...');
          if (M.type === K.MT_DISTRESS && M.stage === 2 && M.stageT < 20) M.stageT = 20;
        } else if (opt === K.OPT_ASK) {
          this.say(id, 3, 'KESSARI. FAST SHIPS, LIGHT SHIELDS - THEY HIT HARD AND RUN.');
        } else {
          this.say(id, 3, `HULL ${Math.round(n.hull)}%. ENGINES ${n.ai === AI_TRAVEL ? 'RUNNING' : 'OFFLINE'}.`);
        }
        return;
      default: // raiders / destroyer
        if (n.ai === AI_SURRENDER) { this.say(id, 0, 'WE HAVE SURRENDERED. PLEASE... NO MORE.'); return; }
        if (opt === 0) {
          this.say(id, 2, 'THIS SPACE IS OURS NOW. LEAVE, OR BURN.', K.OPT_SURRENDER, K.OPT_WARN, K.OPT_CLOSE);
        } else if (opt === K.OPT_SURRENDER) {
          if (n.hull < 40 || n.eng <= 0 || n.wpn <= 0) {
            n.ai = AI_SURRENDER;
            n.faction = F_NEUTRAL;
            this.say(id, 0, '...ENOUGH. WE SURRENDER. HOLD YOUR FIRE.');
          } else {
            this.say(id, 2, 'SURRENDER? WE ARE WINNING, FOOL.');
            n.aiTarget = US;
          }
        } else if (opt === K.OPT_WARN) {
          if (n.hull < 60 && this.frand() < 0.6) {
            n.ai = AI_FLEE;
            n.aiT = 0;
            this.say(id, 1, "THIS ISN'T OVER. ALL SHIPS, BREAK OFF!");
          } else {
            this.say(id, 2, 'YOUR THREATS MEAN NOTHING.');
            n.aiTarget = US;
          }
        }
    }
  }

  // ---------------------------------------------------------------- NPCs
  targetPos(t) {
    if (t === US) return [this.P.x, this.P.y];
    if (t < MAX_CONTACTS && this.npc[t].active && this.npc[t].alive) return [this.npc[t].x, this.npc[t].y];
    return null;
  }
  npcTick(id, dt) {
    const n = this.npc[id], P = this.P, game = this.game;
    if (!n.active || !n.alive) return;
    let targetSpeed = 0, turn = 45, fight = false;
    let tp = this.targetPos(n.aiTarget);
    if (!tp) { n.aiTarget = US; tp = [P.x, P.y]; }
    const [tx, ty] = tp;
    const d = distTo(n.x, n.y, tx, ty), brg = bearingTo(n.x, n.y, tx, ty);
    const engF = n.eng / 100;
    const destroyer = n.type === CT_DESTROYER;
    const full = (destroyer ? 95 : 135) * engF;
    n.aiT += dt;

    switch (n.ai) {
      case AI_STATIC:
        if (n.type === CT_STARBASE && game === GS_RUN) { // starbase defence phasers
          n.phCd -= dt;
          if (n.phCd <= 0) {
            let best = NO_ID, bd = 6000;
            for (let i = 0; i < MAX_CONTACTS; i++)
              if (this.hostileAlive(i) && this.npc[i].ai !== AI_WARPIN) {
                const dd = distTo(n.x, n.y, this.npc[i].x, this.npc[i].y);
                if (dd < bd) { bd = dd; best = i; }
              }
            if (best !== NO_ID) {
              n.phCd = 4;
              const hit = this.frand() < 0.7;
              this.beamFx(id, best, hit);
              if (hit) this.damageNpc(best, 10, K.SUB_HULL, id);
            }
          }
        }
        return;
      case AI_DRIFT: targetSpeed = 0; break;
      case AI_TRAVEL: {
        const db = distTo(n.x, n.y, BASE_X, BASE_Y);
        n.desHdg = bearingTo(n.x, n.y, BASE_X, BASE_Y);
        targetSpeed = db > 2500 ? n.cruise * clampf(engF, 0.3, 1) : 0;
        turn = 20;
        break;
      }
      case AI_PATROL: {
        const dh = distTo(n.x, n.y, n.homeX, n.homeY);
        if (dh > 2500 || n.aiT > n.jinkAt) {
          n.desHdg = wrap360(bearingTo(n.x, n.y, n.homeX, n.homeY) + (this.frand() - 0.5) * 120);
          n.jinkAt = n.aiT + 6 + this.frand() * 6;
        }
        targetSpeed = 35 * engF;
        const detect = this.inNebula(n.x, n.y) ? 5000 : 9000;
        if (distTo(n.x, n.y, P.x, P.y) < detect && game === GS_RUN) { n.ai = AI_ATTACK; n.aiTarget = US; }
        break;
      }
      case AI_WARPIN:
        n.desHdg = brg;
        n.hdg = brg;
        n.speed = 2500;
        if (d < 6000) { n.ai = AI_ATTACK; n.speed = 120; this.boomAt(n.x, n.y, 2); }
        break;
      case AI_ATTACK: {
        // ATTACK RUNS: close in, hold a firing position with side-steps, break away when too close
        fight = game === GS_RUN;
        const hold = destroyer ? 4200 : 3600;
        turn = destroyer ? 30 : 55;
        if (n.breakOff > 0) {
          n.breakOff -= dt;
          n.desHdg = wrap360(brg + 180 + 35 * n.orbitDir);
          targetSpeed = full;
        } else if (d > hold + 1500) {
          n.desHdg = brg;
          targetSpeed = full;
        } else if (d < 2200) {
          n.breakOff = 3 + this.frand() * 3;
          n.orbitDir = -n.orbitDir;
          targetSpeed = full;
        } else {
          n.desHdg = wrap360(brg + 22 * n.orbitDir);
          targetSpeed = full * (d > hold ? 0.5 : 0.2);
          if (n.aiT > n.jinkAt) { n.orbitDir = -n.orbitDir; n.jinkAt = n.aiT + 5 + this.frand() * 5; }
        }
        if (n.hull < 22 && !destroyer) {
          n.ai = AI_FLEE;
          n.aiT = 0;
          this.say(FROM_CREW, 1, `${this.shortName(id, n.scan > 0)} IS BREAKING OFF AND RUNNING!`);
        }
        break;
      }
      case AI_FLEE:
        n.desHdg = wrap360(bearingTo(n.x, n.y, P.x, P.y) + 180);
        targetSpeed = 160 * engF;
        if (n.eng > 0 && ((n.aiT > 15 && distTo(n.x, n.y, P.x, P.y) > 12000) || n.aiT > 25)) {
          n.active = false; // warped away
          this.boomAt(n.x, n.y, 2);
          return;
        }
        break;
      case AI_SURRENDER: targetSpeed = 0; break;
    }

    // steering (tighter turns when slow) + movement
    if (n.ai !== AI_WARPIN) {
      const slowBoost = 1 + 0.8 * clampf(1 - n.speed / 140, 0, 1);
      const diff = angDiff(n.hdg, n.desHdg), step = turn * slowBoost * clampf(engF, 0.2, 1) * dt;
      n.hdg = wrap360(n.hdg + clampf(diff, -step, step));
      const acc = 40 * dt;
      n.speed += clampf(targetSpeed - n.speed, -acc, acc);
    }
    const r = n.hdg * DEG;
    n.x = clampf(n.x + Math.sin(r) * n.speed * dt, 500, SECTOR - 500);
    n.y = clampf(n.y - Math.cos(r) * n.speed * dt, 500, SECTOR - 500);

    n.trailT += dt;
    if (n.trailT > 0.5) {
      n.trailT = 0;
      n.trail.push(Math.round(n.x), Math.round(n.y));
      if (n.trail.length > TRAIL * 2) n.trail.splice(0, 2);
    }
    if (n.sgen > 0 && n.shields < n.shMax) n.shields = clampf(n.shields + (destroyer ? 3.0 : 2.0) * n.sgen / 100 * dt, 0, n.shMax);

    // weapons
    if (!fight || n.wpn <= 0) return;
    n.phCd -= dt;
    n.torpCd -= dt;
    const wF = clampf(n.wpn / 100, 0.3, 1) * DIFF_DMG[this.M.diff % 3];
    const toPlayer = n.aiTarget === US;
    if (n.phCd <= 0 && d < 6000 && Math.abs(angDiff(n.hdg, brg)) < 120) {
      n.phCd = 3.0;
      let p = 0.75;
      if (toPlayer) {
        if (P.evasive && this.eff(S_IMPULSE) > 0.2) p *= 0.6;
        if (Math.abs(P.speed) > 80) p *= 0.85;
      }
      const hit = this.frand() < p;
      this.beamFx(id, n.aiTarget, hit);
      if (hit) {
        const dmg = (destroyer ? 18 : 14) * wF;
        if (toPlayer) this.damagePlayer(n.x, n.y, dmg);
        else this.damageNpc(n.aiTarget, dmg * 0.5, K.SUB_HULL, id);
      } else if (toPlayer) {
        this.emit(K.EV_ENEMY_MISSED);
      }
    }
    if (n.torpCd <= 0 && d < 9000 && d > 1500) {
      n.torpCd = destroyer ? 12 : 14;
      this.launchTorp(id, K.T_PHOTON, n.x, n.y, brg, n.aiTarget, (destroyer ? 40 : 28) * wF, K.SUB_HULL);
    }
  }

  // ---------------------------------------------------------------- torpedoes in flight
  torpTick(dt) {
    const P = this.P;
    for (const t of this.torp) {
      if (!t.active && t.active !== undefined) continue;
      t.life -= dt;
      if (t.life <= 0) { t.dead = true; continue; }
      let tx = -1, ty = -1;
      if (t.target === US) { tx = P.x; ty = P.y; }
      else if (t.target < MAX_CONTACTS && this.npc[t.target].alive) { tx = this.npc[t.target].x; ty = this.npc[t.target].y; }
      if (tx >= 0 && !t.missed) {
        const diff = angDiff(t.hdg, bearingTo(t.x, t.y, tx, ty)), step = K.TORP_TURN * dt;
        t.hdg = wrap360(t.hdg + clampf(diff, -step, step));
      }
      const r = t.hdg * DEG;
      t.x += Math.sin(r) * K.TORP_SPEED * dt;
      t.y -= Math.cos(r) * K.TORP_SPEED * dt;
      if (t.owner === US) {
        for (let id = 0; id < MAX_CONTACTS; id++) {
          const n = this.npc[id];
          if (!n.active || !n.alive || n.type === CT_ANOMALY) continue;
          if (n.faction === F_FRIEND && id !== t.target) continue; // fuse ignores friendly transponders
          if (distTo(t.x, t.y, n.x, n.y) < 350) {
            this.damageNpc(id, t.dmg, id === P.target ? t.sub : K.SUB_HULL, US);
            this.boomAt(t.x, t.y, 0);
            this.emit(K.EV_TORP_HIT);
            t.dead = true;
            break;
          }
        }
      } else if (t.target === US && !t.missed && distTo(t.x, t.y, P.x, P.y) < 350) {
        if (P.evasive && Math.abs(P.speed) > 60 && this.eff(S_IMPULSE) > 0.2 && this.frand() < 0.4) {
          t.missed = true; // dodged - it flies on past
          this.emit(K.EV_ENEMY_MISSED);
        } else {
          this.damagePlayer(t.x - Math.sin(r) * 400, t.y + Math.cos(r) * 400, t.dmg);
          this.boomAt(t.x, t.y, 0);
          t.dead = true;
        }
      } else if (t.target < MAX_CONTACTS && this.npc[t.target].alive && distTo(t.x, t.y, this.npc[t.target].x, this.npc[t.target].y) < 350) {
        this.damageNpc(t.target, t.dmg * 0.5, K.SUB_HULL, t.owner);
        this.boomAt(t.x, t.y, 0);
        t.dead = true;
      }
    }
    this.torp = this.torp.filter((t) => !t.dead);
  }

  // ---------------------------------------------------------------- our ship
  dropWarp() { const P = this.P; P.warpSet = 0; P.warping = false; P.warpCharge = 0; }
  playerTick(dt) {
    const P = this.P, npc = this.npc;
    // ---- steering
    if (P.autopilot === K.AP_WAYPOINT && P.wpValid) {
      const d = distTo(P.x, P.y, P.wpx, P.wpy);
      P.desHdg = bearingTo(P.x, P.y, P.wpx, P.wpy);
      if (P.warping && d < 5000) { this.dropWarp(); this.say(FROM_CREW, 0, 'APPROACHING WAYPOINT - DROPPING OUT OF WARP.'); }
      if (d < 800) { P.autopilot = K.AP_OFF; P.throttle = 0; this.say(FROM_CREW, 0, 'WAYPOINT REACHED. ALL STOP.'); }
    } else if (P.autopilot === K.AP_TARGET) {
      if (P.apTarget < MAX_CONTACTS && npc[P.apTarget].active && npc[P.apTarget].alive) {
        const n = npc[P.apTarget];
        const d = distTo(P.x, P.y, n.x, n.y);
        P.desHdg = bearingTo(P.x, P.y, n.x, n.y);
        if (P.warping && d < 7000) { this.dropWarp(); this.say(FROM_CREW, 0, 'INTERCEPT RANGE - DROPPING OUT OF WARP.'); }
      } else P.autopilot = K.AP_OFF;
    }
    let want = P.desHdg;
    if (P.evasive && !P.warping) want = wrap360(want + 35 * Math.sin(this.missionT * 1.4));
    const slowBoost = 1 + 0.8 * clampf(1 - Math.abs(P.speed) / K.IMPULSE_MAX, 0, 1);
    let tr = K.TURN_RATE * slowBoost * clampf(this.eff(S_IMPULSE), 0.15, 1.6) * (P.warping ? 0.4 : 1.0);
    if (P.dock) tr = 0;
    const diff = angDiff(P.hdg, want), step = tr * dt;
    P.hdg = wrap360(P.hdg + clampf(diff, -step, step));

    // ---- warp
    const effW = this.eff(S_WARP);
    if (P.warpSet && !P.warping && !P.dock) {
      if (effW < 0.1 || P.energy <= 0) P.warpCharge = 0;
      else {
        P.warpCharge += dt / K.WARP_CHARGE_S * clampf(effW, 0.3, 1.5);
        if (P.warpCharge >= 1) { P.warping = true; P.warpCharge = 1; this.emit(K.EV_WARP_ENGAGED); }
      }
    }
    if (P.warping && (effW < 0.1 || P.energy <= 0 || !P.warpSet)) {
      P.warping = false; P.warpCharge = 0;
      if (P.warpSet) { P.warpSet = 0; this.say(FROM_CREW, 1, 'WARP FIELD COLLAPSED!'); }
    }

    // ---- speed
    let targetSpeed, acc;
    if (P.warping) {
      targetSpeed = P.warpSet * K.WARP_SPEED * clampf(effW, 0.3, 1.5);
      acc = 1500;
    } else {
      targetSpeed = P.throttle / 100 * K.IMPULSE_MAX * clampf(this.eff(S_IMPULSE), 0, 1.6);
      // INTERCEPT closes to ~2.5k then holds there facing the target
      if (P.autopilot === K.AP_TARGET && P.apTarget < MAX_CONTACTS && npc[P.apTarget].alive) {
        const d = distTo(P.x, P.y, npc[P.apTarget].x, npc[P.apTarget].y);
        const lim = clampf((d - 2500) / 2000, 0, 1) * K.IMPULSE_MAX;
        if (targetSpeed > lim) targetSpeed = lim;
      }
      acc = P.speed > K.IMPULSE_MAX * 1.7 ? 2500 : K.IMPULSE_ACCEL * clampf(this.eff(S_IMPULSE), 0.3, 1.6);
    }
    if (P.dock) { targetSpeed = 0; acc = 200; }
    P.speed += clampf(targetSpeed - P.speed, -acc * dt, acc * dt);
    const r = P.hdg * DEG;
    let nx = P.x + Math.sin(r) * P.speed * dt, ny = P.y - Math.cos(r) * P.speed * dt;
    if (nx < 500 || ny < 500 || nx > SECTOR - 500 || ny > SECTOR - 500) {
      if (P.warping || Math.abs(P.speed) > 50) this.say(FROM_CREW, 1, 'SECTOR BOUNDARY - ALL STOP.');
      this.dropWarp(); P.speed = 0; P.throttle = 0;
      nx = clampf(nx, 500, SECTOR - 500);
      ny = clampf(ny, 500, SECTOR - 500);
    }
    P.x = nx;
    P.y = ny;

    // ---- docking
    if (P.dock === 1) {
      P.dockT += dt;
      P.x += (BASE_X + 400 - P.x) * dt * 0.8;
      P.y += (BASE_Y - 400 - P.y) * dt * 0.8;
      if (P.dockT >= K.DOCK_TIME_S) { P.dock = 2; this.emit(K.EV_DOCKED); }
    }
    if (P.dock === 2) {
      P.energy += 60 * dt;
      P.hull = clampf(P.hull + 3 * dt, 0, 100);
      for (let i = 0; i < NSYS; i++) { P.health[i] = clampf(P.health[i] + 8 * dt, 0, 100); P.heat[i] = 0; }
      P.restockT += dt;
      if (P.restockT > 1.5) {
        P.restockT = 0;
        for (let t = 0; t < 2; t++) if (P.torps[t] < K.TORP_START[t]) P.torps[t]++;
      }
    }

    // ---- energy use
    let use = 0;
    if (!P.warping && !P.dock) use += P.power[S_IMPULSE] / 100 * (0.4 + Math.abs(P.throttle) / 100 * 2.6);
    if (P.warping || P.warpCharge > 0) use += P.power[S_WARP] / 100 * P.warpSet * 4.0;
    if (P.phCharge < 1) use += P.power[S_PHASERS] / 100 * 2.0;
    for (let t = 0; t < 2; t++) if (P.tubeState[t] === K.TUBE_LOADING) use += P.power[S_TORPS] / 100 * 1.0;
    if (P.shieldsOn) use += P.power[S_SHIELDS] / 100 * 2.5;
    use += P.power[S_SENSORS] / 100 * (0.8 + (P.scanId !== NO_ID ? 1.2 : 0));
    P.energyRate = K.ENERGY_GEN - use + (P.dock === 2 ? 60 : 0);
    P.energy = clampf(P.energy + (K.ENERGY_GEN - use) * dt, 0, K.ENERGY_MAX);

    // ---- heat
    for (let i = 0; i < NSYS; i++) {
      const over = P.power[i] > 100 ? (P.power[i] - 100) / 100 : 0;
      const dh = over > 0 ? over * K.HEAT_RATE - P.coolant[i] * K.COOL_PER_UNIT : -(2 + P.coolant[i] * K.COOL_PER_UNIT);
      P.heat[i] = clampf(P.heat[i] + dh * dt, 0, 100);
      if (P.heat[i] >= 100) {
        const was = P.health[i] > 0;
        P.health[i] = clampf(P.health[i] - K.HEAT_DAMAGE * dt, 0, 100);
        if (this.now - P.overheatWarnAt[i] > 4000) {
          P.overheatWarnAt[i] = this.now;
          this.say(FROM_CREW, 2, `${K.SYS_NAME[i]} OVERHEATING! CUT POWER OR ADD COOLANT.`);
          this.emit(K.EV_OVERHEAT, i);
        }
        if (was && P.health[i] <= 0) this.emit(K.EV_SYS_DAMAGED, i);
      }
    }

    // ---- repairs
    for (let t = 0; t < K.REPAIR_TEAMS; t++) {
      const s = P.team[t];
      if (s >= NSYS) continue;
      P.health[s] += K.REPAIR_RATE * dt;
      if (P.health[s] >= 100) {
        P.health[s] = 100;
        P.team[t] = NO_ID;
        this.say(FROM_CREW, 3, `REPAIR TEAM ${t + 1}: ${K.SYS_NAME[s]} FULLY REPAIRED.`);
      }
    }

    // ---- shields
    const raiseTarget = P.shieldsOn && P.health[S_SHIELDS] > 0 && !P.dock;
    if (!raiseTarget) P.shieldsOn = P.shieldsOn && P.health[S_SHIELDS] > 0 && !P.dock;
    P.shieldRaise = clampf(P.shieldRaise + (raiseTarget ? dt / K.SHIELD_RAISE_S : -dt * 2), 0, 1);
    for (let q = 0; q < 4; q++) {
      const cap = this.shieldCap(q);
      if (P.shield[q] > cap) P.shield[q] = clampf(P.shield[q] - 15 * dt, cap, 999);
      else if (P.shieldsOn && P.energy > 0) P.shield[q] = clampf(P.shield[q] + K.SHIELD_REGEN * clampf(this.eff(S_SHIELDS), 0, 1.6) * dt, 0, cap);
    }

    // ---- weapons
    if (P.phCharge < 1) P.phCharge = clampf(P.phCharge + dt / K.PH_RECHARGE_S * clampf(this.eff(S_PHASERS), 0, 1.6), 0, 1);
    if (P.autoFire && P.phCharge >= 1 && this.targetValid() && npc[P.target].faction === F_HOSTILE) this.firePhasers(false);
    for (let t = 0; t < 2; t++) {
      if (P.tubeState[t] !== K.TUBE_LOADING && P.tubeState[t] !== K.TUBE_UNLOADING) continue;
      P.tubeTimer[t] -= dt * (P.tubeState[t] === K.TUBE_LOADING ? clampf(this.eff(S_TORPS), 0, 1.6) : 1);
      if (P.tubeTimer[t] <= 0) {
        if (P.tubeState[t] === K.TUBE_LOADING) P.tubeState[t] = K.TUBE_LOADED;
        else { P.torps[P.tubeType[t]]++; P.tubeState[t] = K.TUBE_EMPTY; }
        P.tubeTimer[t] = 0;
      }
    }

    // ---- sensors
    if (P.lrs > 0) P.lrs = Math.max(0, P.lrs - dt);
    if (P.scanId !== NO_ID) {
      const sn = npc[P.scanId];
      const buoyFar = sn.type === CT_BUOY && distTo(P.x, P.y, sn.x, sn.y) > 8000;
      if (!this.visible(P.scanId) || P.health[S_SENSORS] <= 0 || buoyFar) {
        P.scanId = NO_ID;
        this.say(FROM_CREW, 1, 'SCAN INTERRUPTED - LOST SENSOR LOCK.');
      } else {
        P.scanProg += dt / K.SCAN_TIME_S * clampf(this.eff(S_SENSORS), 0.2, 2.0);
        if (P.scanProg >= 1) {
          const n = sn;
          n.scan++;
          if (n.type === CT_ANOMALY && n.scan === 1) n.faction = F_NEUTRAL;
          if ((n.type === CT_RAIDER || n.type === CT_DESTROYER) && n.scan === 1) n.faction = F_HOSTILE;
          this.say(FROM_CREW, 0, `SCAN ${n.scan >= 2 ? 'COMPLETE' : 'IDENTIFIED'}: ${this.contactName(P.scanId, n.type)}`);
          this.emit(K.EV_SCAN_DONE);
          P.scanId = NO_ID;
        }
      }
    }

    // ---- path trail (sector map)
    this.ptrailT += dt;
    if (this.ptrailT > 1.0) {
      this.ptrailT = 0;
      this.ptrail.push(Math.round(P.x), Math.round(P.y));
      if (this.ptrail.length > PTRAIL * 2) this.ptrail.splice(0, 2);
    }
  }

  tick(dt) {
    this.now += dt * 1000;
    if (this.game !== GS_RUN) {
      for (let i = 0; i < MAX_CONTACTS; i++) this.npcTick(i, dt);
    } else {
      this.missionT += dt;
      this.playerTick(dt);
      if (this.game === GS_RUN) {
        for (let i = 0; i < MAX_CONTACTS; i++) this.npcTick(i, dt);
        this.torpTick(dt);
        if (this.game === GS_RUN) this.missionTick(dt);
      }
    }
    const now = this.now;
    this.beams = this.beams.filter((b) => now - b.t0 <= 600);
    this.booms = this.booms.filter((b) => now - b.t0 <= 1500);
    if (this.viewRevertAt && now > this.viewRevertAt) {
      this.viewRevertAt = 0;
      if (this.view === K.VM_COMMS) this.view = this.viewBefore;
    }
    this.ordersTick();
  }

  // ======================================================================
  // MISSIONS (missions.h)
  // ======================================================================
  setObjective(s) { if (s !== this.M.objective) { this.M.objective = s; this.M.ver++; } }
  addMarker(x, y, kind, r = 0) {
    if (this.M.mk.length >= K.MAX_MARKERS) return;
    this.M.mk.push({ x, y, kind, r });
    this.M.ver++;
  }
  clearMarkers() { this.M.mk = []; this.M.ver++; }
  setWaypoint(x, y) { const P = this.P; P.wpValid = true; P.wpx = x; P.wpy = y; }
  clampSec(v) { return clampf(v, 6000, SECTOR - 6000); }
  clearOfPlanets(x, y) {
    for (const p of K.PLANETS) if (distTo(x, y, p.x, p.y) < p.r + 3000) return false;
    return true;
  }
  randomPoint(minBase, maxBase = 1e9) {
    let x = 0, y = 0;
    for (let t = 0; t < 80; t++) {
      x = 8000 + this.frand() * (SECTOR - 16000);
      y = 8000 + this.frand() * (SECTOR - 16000);
      const d = distTo(x, y, BASE_X, BASE_Y);
      if (d >= minBase && d <= maxBase && this.clearOfPlanets(x, y)) break;
    }
    return [x, y];
  }
  pointNear(cx, cy, dist) {
    const a = this.frand() * 6.2832;
    return [this.clampSec(cx + Math.sin(a) * dist), this.clampSec(cy - Math.cos(a) * dist)];
  }
  freeSlot() {
    for (let i = ID_FIRST_DYN; i < MAX_CONTACTS; i++) if (!this.npc[i].active) return i;
    for (let i = ID_FIRST_DYN; i < MAX_CONTACTS; i++) // reuse old wrecks
      if (!this.npc[i].alive && this.now - this.npc[i].deadAt > 4000 && i !== this.M.fr) return i;
    return NO_ID;
  }
  spawnAt(type, faction, x, y, hdg) {
    const id = this.freeSlot();
    if (id !== NO_ID) this.spawnNpc(id, type, faction, x, y, hdg);
    return id;
  }
  tgtX(t) { return t === US ? this.P.x : this.npc[t].x; }
  tgtY(t) { return t === US ? this.P.y : this.npc[t].y; }
  spawnFoe(type, x, y, target, ai) {
    const id = this.spawnAt(type, F_HOSTILE, x, y, bearingTo(x, y, this.tgtX(target), this.tgtY(target)));
    if (id === NO_ID) return id;
    const n = this.npc[id];
    n.scan = 1;
    n.ai = ai;
    n.aiTarget = target;
    if (this.M.foes.length < 8) this.M.foes.push(id);
    return id;
  }
  warpInGroup(raiders, destroyers, cx, cy, dist, target1, target2) {
    const [x, y] = this.pointNear(cx, cy, dist);
    let n = 0;
    for (let i = 0; i < destroyers + raiders; i++) {
      const k = Math.floor((i + 1) / 2);
      const ox = x + (i % 2 ? 1 : -1) * 1500 * k, oy = y + 1200 * k;
      this.spawnFoe(i < destroyers ? CT_DESTROYER : CT_RAIDER, this.clampSec(ox), this.clampSec(oy), n++ === 0 ? target1 : target2, AI_WARPIN);
    }
    this.emit(K.EV_WARP_IN);
  }
  foesLeft() {
    let n = 0;
    for (const id of this.M.foes) if (this.hostileAlive(id) && this.npc[id].ai !== AI_FLEE) n++; // runners count as driven off
    return n;
  }
  foesDone() { return this.foesLeft() === 0; }
  beginReturn(msg) {
    const M = this.M;
    M.stage = K.ST_RETURN;
    M.stageT = 0;
    M.foes = [];
    this.clearMarkers();
    this.setWaypoint(BASE_X, BASE_Y);
    this.setObjective('RETURN TO STARBASE 12 AND DOCK');
    if (msg) this.say(FROM_COMMAND, 3, msg);
  }
  sec(x, y) { return sectorName(x, y); }

  // ---- DISTRESS
  distressStart() {
    const M = this.M;
    [M.ax, M.ay] = this.randomPoint(45000);
    this.addMarker(M.ax, M.ay, K.MK_BEACON);
    this.setWaypoint(M.ax, M.ay);
    this.setObjective(`PROCEED TO THE DISTRESS BEACON IN SECTOR ${this.sec(M.ax, M.ay)}`);
    this.say(FROM_COMMAND, 0, `AURORA, FLEET COMMAND. A DISTRESS BEACON HAS ACTIVATED IN SECTOR ${this.sec(M.ax, M.ay)}. INVESTIGATE AND RENDER ASSISTANCE.`);
  }
  distressTick() {
    const M = this.M, P = this.P, npc = this.npc;
    switch (M.stage) {
      case 0:
        if (distTo(P.x, P.y, M.ax, M.ay) < 12000) {
          M.fr = this.spawnAt(CT_FREIGHTER, F_UNKNOWN, M.ax, M.ay, this.frand() * 360);
          const f = npc[M.fr];
          f.hull = 55; f.shields = 0; f.eng = 0;
          M.stage = 1; M.stageT = 0;
          this.setObjective('SCAN THE UNKNOWN CONTACT AT THE BEACON');
          this.say(FROM_CREW, 1, 'SENSOR CONTACT AT THE BEACON - UNIDENTIFIED. RECOMMEND A SCAN.');
        }
        break;
      case 1:
        if (npc[M.fr].scan >= 1) {
          npc[M.fr].faction = F_FRIEND;
          M.stage = 2; M.stageT = 0;
          this.setObjective(`TALK TO THE ${this.shortName(M.fr)} - SENSORS SHOW SHIPS INBOUND`);
          this.say(M.fr, 3, "TO ANY SHIP! RAIDERS CRIPPLED US AND THEY'RE COMING BACK!", K.OPT_HELP, K.OPT_ASK);
        }
        break;
      case 2:
        if (M.stageT > 25) {
          this.warpInGroup(1 + M.diff, 0, M.ax, M.ay, 15000, npc[M.fr].alive ? M.fr : US, US);
          M.stage = 3; M.stageT = 0;
          this.say(FROM_CREW, 2, 'SHIPS DROPPING OUT OF WARP - KESSARI RAIDERS, WEAPONS HOT!');
        }
        break;
      case 3:
        this.setObjective(`PROTECT THE ${this.shortName(M.fr)} - DEAL WITH THE RAIDERS (${this.foesLeft()} LEFT)`);
        if (this.foesDone()) {
          if (npc[M.fr].alive) {
            npc[M.fr].ai = AI_TRAVEL;
            npc[M.fr].eng = 30;
            M.frSaved = true;
            this.say(M.fr, 3, "THEY'RE GONE! WE'VE PATCHED THE ENGINES - HEADING FOR STARBASE 12. THANK YOU!");
            this.beginReturn(null);
          } else this.beginReturn('RAIDERS REPELLED. RETURN TO STARBASE 12 FOR DEBRIEF.');
        }
        break;
    }
  }

  // ---- PATROL
  patrolStart() {
    const M = this.M, npc = this.npc;
    const nb = M.diff === 2 ? 4 : 3;
    M.ids = [];
    for (let i = 0; i < nb; i++) {
      let x = 0, y = 0;
      for (let t = 0; t < 40; t++) { // spread them out
        [x, y] = this.randomPoint(18000);
        let ok = true;
        for (const k of M.ids) if (distTo(x, y, npc[k].x, npc[k].y) < 20000) ok = false;
        if (ok) break;
      }
      M.ids.push(this.spawnAt(CT_BUOY, F_FRIEND, x, y, 0));
      this.addMarker(x, y, K.MK_POINT);
    }
    M.encounter = this.irand(M.ids.length);
    M.wave = 0; // buoys scanned
    const b0 = npc[M.ids[0]];
    this.setWaypoint(b0.x, b0.y);
    this.setObjective(`PATROL: SCAN THE NAV BUOYS (0/${M.ids.length}) - START IN SECTOR ${this.sec(b0.x, b0.y)}`);
    this.say(FROM_COMMAND, 0, 'AURORA, YOUR PATROL ROUTE IS LOGGED. SCAN EACH NAV BUOY TO DOWNLOAD ITS SENSOR LOG. KESSARI ACTIVITY REPORTED.');
  }
  patrolTick() {
    const M = this.M, P = this.P, npc = this.npc;
    let done = 0;
    for (const id of M.ids) if (npc[id].scan >= 1) done++;
    if (done !== M.wave) {
      M.wave = done;
      let best = 1e9;
      for (const id of M.ids) {
        const b = npc[id];
        const d = distTo(P.x, P.y, b.x, b.y);
        if (b.scan === 0 && d < best) { best = d; this.setWaypoint(b.x, b.y); }
      }
      this.say(FROM_CREW, 3, `BUOY LOG DOWNLOADED (${done}/${M.ids.length}).${done < M.ids.length ? ' NEXT BUOY SET AS WAYPOINT.' : ''}`);
    }
    const e = npc[M.ids[M.encounter]];
    if (M.stage === 0 && distTo(P.x, P.y, e.x, e.y) < 13000) {
      M.stage = 1;
      for (let i = 0; i < 1 + M.diff; i++) {
        const [x, y] = this.pointNear(e.x, e.y, 1500);
        this.spawnFoe(CT_RAIDER, x, y, US, AI_PATROL);
      }
    }
    if (M.stage === 1 && e.scan >= 1) { // scanning that buoy alerts whoever is lurking there
      M.stage = 2;
      for (const id of M.foes) if (this.hostileAlive(id) && npc[id].ai === AI_PATROL) { npc[id].ai = AI_ATTACK; npc[id].aiTarget = US; }
      this.say(FROM_CREW, 2, "KESSARI SHIPS POWERING UP NEAR THE BUOY - THEY'VE SEEN US!");
    }
    if (this.foesLeft()) this.setObjective(`PATROL: BUOYS ${done}/${M.ids.length} - KESSARI SHIPS AT THE BUOY (${this.foesLeft()})`);
    else this.setObjective(`PATROL: SCAN THE NAV BUOYS (${done}/${M.ids.length})`);
    if (done === M.ids.length && this.foesDone()) this.beginReturn('PATROL COMPLETE, AURORA. RETURN TO STARBASE 12.');
  }

  // ---- HUNT
  huntStart() {
    const M = this.M;
    if (this.frand() < 0.6) [M.ax, M.ay] = this.pointNear(K.NEB_X, K.NEB_Y, this.frand() * K.NEB_R * 0.6); // hiding in the nebula
    else [M.ax, M.ay] = this.randomPoint(35000);
    const raiders = M.diff === 1 ? 3 : 2, dest = M.diff === 2 ? 1 : 0;
    for (let i = 0; i < raiders + dest; i++) {
      const [x, y] = this.pointNear(M.ax, M.ay, 1000 + this.frand() * 2500);
      this.spawnFoe(i < dest ? CT_DESTROYER : CT_RAIDER, x, y, US, AI_PATROL);
    }
    const [gx, gy] = this.pointNear(M.ax, M.ay, this.frand() * 5000); // intelligence is only approximate
    this.addMarker(gx, gy, K.MK_AREA, 12000);
    this.setWaypoint(gx, gy);
    this.setObjective(`HUNT: FIND AND DESTROY THE RAIDING GROUP NEAR ${this.sec(gx, gy)}`);
    this.say(FROM_COMMAND, 0, `INTELLIGENCE PLACES A KESSARI RAIDING GROUP NEAR SECTOR ${this.sec(gx, gy)}. FIND THEM. LONG RANGE SCANS WILL HELP.`);
  }
  huntTick() {
    const M = this.M, P = this.P;
    let seen = false;
    for (const id of M.foes) if (this.hostileAlive(id) && this.visible(id)) seen = true;
    if (seen) this.setObjective(`HUNT: RAIDING GROUP FOUND - DESTROY THEM (${this.foesLeft()} LEFT)`);
    if (M.stage === 0 && M.mk.length && distTo(P.x, P.y, M.mk[0].x, M.mk[0].y) < 12000) { M.stage = 1; M.stageT = 0; }
    if (M.stage === 1 && !seen && M.stageT > 40) {
      M.stage = 2;
      this.say(FROM_CREW, 1, 'NOTHING ON SHORT RANGE SENSORS. TRY A LONG RANGE SCAN (SCIENCE - LRS).');
    }
    if (this.foesDone()) this.beginReturn('GOOD HUNTING, AURORA. THE RAIDING GROUP IS BROKEN. RETURN TO STARBASE 12.');
  }

  // ---- ESCORT
  escortStart() {
    const M = this.M;
    [M.ax, M.ay] = this.randomPoint(32000, 46000);
    M.fr = this.spawnAt(CT_FREIGHTER, F_FRIEND, M.ax, M.ay, bearingTo(M.ax, M.ay, BASE_X, BASE_Y));
    const f = this.npc[M.fr];
    f.scan = 1;
    f.shMax = f.shields = 40;
    f.cruise = 110;
    M.bx = distTo(M.ax, M.ay, BASE_X, BASE_Y); // route length
    M.waves = 2 + (M.diff === 2 ? 1 : 0);
    M.wave = 0;
    this.addMarker(M.ax, M.ay, K.MK_RENDEZVOUS);
    this.setWaypoint(M.ax, M.ay);
    this.setObjective(`RENDEZVOUS WITH THE ${this.shortName(M.fr)} IN SECTOR ${this.sec(M.ax, M.ay)}`);
    this.say(FROM_COMMAND, 0, `AURORA, MEET THE ${this.contactName(M.fr, CT_FREIGHTER)} IN SECTOR ${this.sec(M.ax, M.ay)} AND ESCORT HER TO STARBASE 12. SHE MUST NOT BE LOST.`);
  }
  escortTick() {
    const M = this.M, P = this.P;
    const f = this.npc[M.fr];
    if (!f.alive) return;
    switch (M.stage) {
      case 0:
        if (distTo(P.x, P.y, f.x, f.y) < 6000) {
          f.ai = AI_TRAVEL;
          M.stage = 1;
          this.clearMarkers();
          this.say(M.fr, 3, 'AURORA, WE SEE YOU. GETTING UNDER WAY - PLEASE STAY CLOSE.');
        }
        break;
      case 1: {
        const prog = 1 - distTo(f.x, f.y, BASE_X, BASE_Y) / M.bx;
        if (M.wave < M.waves && this.foesDone() && prog > (M.wave + 1) / (M.waves + 1)) {
          const last = M.wave === M.waves - 1;
          this.warpInGroup(1 + (M.diff >= 1 ? 1 : 0), last && M.diff >= 1 ? 1 : 0, f.x, f.y, 11000, M.fr, US);
          M.wave++;
          this.say(M.fr, 2, "AURORA! SHIPS DROPPING OUT OF WARP - THEY'RE COMING FOR US!");
        }
        if (P.autopilot === K.AP_OFF && !P.wpValid) this.setWaypoint(f.x, f.y);
        if (this.foesLeft()) this.setObjective(`ESCORT: PROTECT THE ${this.shortName(M.fr)} - ${this.foesLeft()} ATTACKERS`);
        else this.setObjective(`ESCORT THE ${this.shortName(M.fr)} TO STARBASE 12 (${Math.round(clampf(prog * 100, 0, 100))}% OF THE WAY)`);
        if (distTo(f.x, f.y, BASE_X, BASE_Y) < 3000) {
          M.frSaved = true;
          f.ai = AI_DRIFT;
          this.say(M.fr, 3, "WE'VE MADE IT! DOCKING NOW. WE OWE YOU, AURORA.");
          M.stage = 2;
        }
        break;
      }
      case 2:
        this.setObjective(`FINISH OFF THE ATTACKERS (${this.foesLeft()} LEFT)`);
        if (this.foesDone()) this.beginReturn('THE FREIGHTER IS SAFE. WELL DONE, AURORA - DOCK AT STARBASE 12.');
        break;
    }
  }

  // ---- SURVEY
  surveyStart() {
    const M = this.M, npc = this.npc;
    M.ids = [];
    for (let i = 0; i < 3; i++) {
      let x = 0, y = 0;
      for (let t = 0; t < 40; t++) {
        if (i === 0) [x, y] = this.pointNear(K.NEB_X, K.NEB_Y, this.frand() * K.NEB_R * 0.7); // one hides in the nebula
        else [x, y] = this.randomPoint(20000);
        let ok = distTo(x, y, K.ANOM_X, K.ANOM_Y) > 6000;
        for (const k of M.ids) if (distTo(x, y, npc[k].x, npc[k].y) < 18000) ok = false;
        if (ok) break;
      }
      M.ids.push(this.spawnAt(CT_ANOMALY, F_UNKNOWN, x, y, 0));
      this.addMarker(x, y, K.MK_POINT);
    }
    M.wave = 0;
    this.setWaypoint(npc[M.ids[1]].x, npc[M.ids[1]].y);
    this.setObjective(`SURVEY: FULL-SCAN THE ANOMALIES (0/${M.ids.length})`);
    this.say(FROM_COMMAND, 0, 'AURORA, THREE UNUSUAL SUBSPACE READINGS HAVE BEEN LOGGED. GET A FULL SCAN OF EACH. THE KESSARI WILL WANT THEM TOO.');
  }
  surveyTick() {
    const M = this.M, P = this.P, npc = this.npc;
    let done = 0;
    for (const id of M.ids) if (npc[id].scan >= 2) done++;
    if (done !== M.wave) {
      M.wave = done;
      let best = 1e9;
      for (const id of M.ids) {
        const a = npc[id];
        const d = distTo(P.x, P.y, a.x, a.y);
        if (a.scan < 2 && d < best) { best = d; this.setWaypoint(a.x, a.y); }
      }
      this.say(FROM_CREW, 3, `ANOMALY ANALYSED (${done}/${M.ids.length}).${done < M.ids.length ? ' NEXT ONE SET AS WAYPOINT.' : ''}`);
      if (done === 2 && M.stage === 0) {
        M.stage = 1;
        this.warpInGroup(1 + M.diff, 0, P.x, P.y, 12000, US, US);
        this.say(FROM_CREW, 2, 'KESSARI SHIPS DROPPING OUT OF WARP - THEY WANT OUR SENSOR DATA!');
      }
    }
    if (this.foesLeft()) this.setObjective(`SURVEY ${done}/${M.ids.length} - KESSARI ATTACK! (${this.foesLeft()} LEFT)`);
    else this.setObjective(`SURVEY: FULL-SCAN THE ANOMALIES (${done}/${M.ids.length})`);
    if (done === M.ids.length && this.foesDone()) this.beginReturn('EXCELLENT SURVEY DATA, AURORA. RETURN TO STARBASE 12.');
  }

  // ---- DEFEND
  defendStart() {
    const M = this.M, P = this.P;
    P.x = BASE_X + 3000;
    P.y = BASE_Y - 3000;
    M.waves = 2 + M.diff;
    M.wave = 0;
    M.stage = 0;
    this.setWaypoint(BASE_X, BASE_Y);
    this.setObjective('DEFEND STARBASE 12 - FIRST WAVE EXPECTED IN 30 SECONDS');
    this.say(ID_BASE, 2, 'AURORA, LONG RANGE SENSORS SHOW KESSARI ATTACK GROUPS ON THEIR WAY. WE NEED YOU HERE.');
  }
  defendTick() {
    const M = this.M;
    if (!this.npc[ID_BASE].alive) return;
    switch (M.stage) {
      case 0: {
        const wait = M.wave === 0 ? 30 : 25;
        this.setObjective(`DEFEND STARBASE 12 - WAVE ${M.wave + 1}/${M.waves} IN ${Math.ceil(wait - M.stageT)} SECONDS`);
        if (M.stageT >= wait) {
          const last = M.wave === M.waves - 1;
          const raiders = 2 + (M.wave >= 2 && M.diff >= 1 ? 1 : 0);
          this.warpInGroup(raiders, last && M.diff >= 1 ? 1 : 0, BASE_X, BASE_Y, 22000, ID_BASE, M.wave % 2 ? US : ID_BASE);
          M.stage = 1;
          M.stageT = 0;
          this.say(FROM_CREW, 2, 'ATTACK WAVE INBOUND!');
        }
        break;
      }
      case 1:
        this.setObjective(`DEFEND STARBASE 12 - WAVE ${M.wave + 1}/${M.waves} (${this.foesLeft()} LEFT)  BASE HULL ${Math.round(this.npc[ID_BASE].hull)}%`);
        if (this.foesDone()) {
          M.wave++;
          M.foes = [];
          if (M.wave >= M.waves) this.beginReturn('THE ATTACK IS BROKEN! STARBASE 12 STANDS. DOCK FOR REPAIRS, AURORA.');
          else { M.stage = 0; M.stageT = 0; this.say(ID_BASE, 3, 'WAVE DESTROYED! STAND BY - MORE ARE COMING.'); }
        }
        break;
    }
  }

  // ---- common
  startMission() {
    this.resetWorld();
    this.ordersReset();
    this.game = GS_RUN;
    const M = this.M;
    M.type = this.selType === K.MT_RANDOM ? 1 + this.irand(K.NUM_MT - 1) : this.selType;
    M.diff = this.selDiff % 3;
    M.fr = NO_ID;
    this.nameSeed = this.irand(256);
    const ambushChance = [0.3, 0.45, 0.6];
    M.ambush = this.frand() < (M.type === K.MT_DISTRESS ? ambushChance[M.diff] + 0.3 : ambushChance[M.diff]);
    if (M.type === K.MT_ESCORT || M.type === K.MT_DEFEND) M.ambush = false;
    switch (M.type) {
      case K.MT_DISTRESS: this.distressStart(); break;
      case K.MT_PATROL: this.patrolStart(); break;
      case K.MT_HUNT: this.huntStart(); break;
      case K.MT_ESCORT: this.escortStart(); break;
      case K.MT_SURVEY: this.surveyStart(); break;
      case K.MT_DEFEND: this.defendStart(); break;
    }
    M.ver++;
  }
  missionOnDestroyed(id) {
    if (this.game !== GS_RUN) return;
    if (id === this.M.fr) {
      this.M.frLost = true;
      if (this.M.type === K.MT_ESCORT) this.endMission(false, K.FAIL_FREIGHTER);
    }
    if (id === ID_BASE) this.endMission(false, K.FAIL_STARBASE);
  }
  missionTick(dt) {
    const M = this.M, P = this.P;
    M.stageT += dt;
    if (M.stage < K.ST_RETURN) {
      switch (M.type) {
        case K.MT_DISTRESS: this.distressTick(); break;
        case K.MT_PATROL: this.patrolTick(); break;
        case K.MT_HUNT: this.huntTick(); break;
        case K.MT_ESCORT: this.escortTick(); break;
        case K.MT_SURVEY: this.surveyTick(); break;
        case K.MT_DEFEND: this.defendTick(); break;
      }
    } else if (M.stage === K.ST_RETURN) {
      const db = distTo(P.x, P.y, BASE_X, BASE_Y);
      if (M.ambush && M.stageT > 10 && db < 34000 && db > 9000) {
        const r = P.hdg * DEG;
        const sx = this.clampSec(P.x + Math.sin(r) * 14000), sy = this.clampSec(P.y - Math.cos(r) * 14000);
        this.spawnFoe(CT_DESTROYER, sx, sy, US, AI_WARPIN);
        if (M.diff >= 1) this.spawnFoe(CT_RAIDER, this.clampSec(sx + 2500), this.clampSec(sy + 2000), US, AI_WARPIN);
        this.dropWarp();
        M.stage = K.ST_AMBUSH;
        M.stageT = 0;
        this.boomAt(P.x, P.y, 2);
        this.emit(K.EV_WARP_IN);
        this.say(FROM_CREW, 2, "PULLED OUT OF WARP! KESSARI SHIPS DECLOAKING AHEAD - IT'S AN AMBUSH!");
      } else if (P.dock === 2) this.endMission(true);
    } else if (M.stage === K.ST_AMBUSH) {
      this.setObjective(`AMBUSH! DEFEAT THE KESSARI SHIPS (${this.foesLeft()} LEFT)`);
      if (this.foesDone()) {
        M.stage = K.ST_DOCK;
        this.setObjective('DOCK AT STARBASE 12 (SLOW DOWN, SHIELDS DOWN, THEN DOCK)');
        this.say(FROM_COMMAND, 3, 'WELL DONE, AURORA. COME HOME AND DOCK FOR REPAIRS.');
      }
    } else if (M.stage === K.ST_DOCK) {
      if (P.dock === 2) this.endMission(true);
    }
    if (!this.bonus && this.npc[ID_BONUS].scan >= 2) {
      this.bonus = true;
      P.torps[K.T_QUANTUM] += 2;
      this.say(FROM_COMMAND, 3, 'SUPERB ANOMALY DATA. 2 EXTRA QUANTUM TORPEDOES AUTHORISED.');
    }
  }

  // ======================================================================
  // CAPTAIN'S ORDERS + FIRST OFFICER (orders.h)
  // ======================================================================
  issueOrder(code, arg) {
    if (this.game !== GS_RUN || !(code >= 0 && code < K.NUM_ORDERS)) return null;
    const tab = K.ORDERS[code].tab;
    for (const o of this.orders) // a new order to the same sub-station replaces its unfinished one
      if (K.ORDERS[o.code].tab === tab && (o.status === K.ORD_SENT || o.status === K.ORD_ACK)) o.status = K.ORD_REPLACED;
    const o = { id: this.nextOrderId++, code, arg, status: K.ORD_SENT, t0: this.now, tAck: 0, tDone: 0,
      base: arg < MAX_CONTACTS ? this.npc[arg].scan : 0 };
    this.orders.unshift(o);
    if (this.orders.length > MAX_ORDERS) this.orders.length = MAX_ORDERS;
    this.ordIssued++;
    this.emit(K.EV_ORDER, tab);
    return o;
  }
  orderAck(id) {
    for (const o of this.orders) if (o.id === id && o.status === K.ORD_SENT) { o.status = K.ORD_ACK; o.tAck = this.now; }
  }
  orderDone(o) {
    const a = o.arg, P = this.P, npc = this.npc;
    const ok = a < MAX_CONTACTS && npc[a].active && npc[a].alive;
    switch (o.code) {
      case K.O_COURSE: return P.autopilot === K.AP_WAYPOINT;
      case K.O_INTERCEPT: return P.autopilot === K.AP_TARGET && P.apTarget === a;
      case K.O_FACE: return ok && Math.abs(angDiff(P.hdg, bearingTo(P.x, P.y, npc[a].x, npc[a].y))) < 15;
      case K.O_EVASIVE: return P.evasive;
      case K.O_AHEAD: return P.throttle >= 100 || P.warping;
      case K.O_STOP: return Math.abs(P.speed) < 5;
      case K.O_WARP: return P.warping;
      case K.O_DOCK: return P.dock === 2;
      case K.O_SCAN: return a < MAX_CONTACTS && npc[a].scan > o.base;
      case K.O_FULLSCAN: return a < MAX_CONTACTS && npc[a].scan >= 2;
      case K.O_LRS: return P.lrs > 0;
      case K.O_HAIL: return this.lastHailId === a && this.lastHailAt >= o.t0;
      case K.O_SHIELDS: return P.shieldsOn;
      case K.O_TARGET: return P.target === a;
      case K.O_FIRE: return P.autoFire;
      case K.O_HOLD: return !P.autoFire;
      case K.O_TORPS: return this.lastTorpAt >= o.t0;
      case K.O_AIM_ENG: return P.sub === K.SUB_ENGINES;
      case K.O_AIM_WPN: return P.sub === K.SUB_WEAPONS;
      case K.O_REINF: return P.reinforce === (a % 4) + 1;
      case K.O_PWR_WPN: return P.power[S_PHASERS] >= 150;
      case K.O_PWR_SHD: return P.power[S_SHIELDS] >= 150;
      case K.O_PWR_ENG: return P.power[S_IMPULSE] >= 150;
      case K.O_PWR_BAL: return P.power.every((p) => p === 100);
      case K.O_PWR_SAVE: return P.power.reduce((s, p) => s + p, 0) <= 520;
      case K.O_REPAIR: return P.health[a % NSYS] >= 100 || P.team[0] === a || P.team[1] === a;
      case K.O_COOL: return P.heat[a % NSYS] < 40;
    }
    return false;
  }
  ordersTick() {
    for (const o of this.orders) {
      if (o.status !== K.ORD_SENT && o.status !== K.ORD_ACK) continue;
      if (this.game !== GS_TITLE && this.orderDone(o)) {
        o.status = K.ORD_DONE;
        o.tDone = this.now;
        this.ordDone++;
        this.ordTimeSum += (this.now - o.t0) / 1000;
      } else if (this.game === GS_RUN && this.now - o.t0 > K.ORDER_TIMEOUT_S * 1000) {
        o.status = K.ORD_STALE;
      }
    }
  }
  ordersReset() {
    this.orders = [];
    this.ordIssued = this.ordDone = 0;
    this.ordTimeSum = 0;
  }

  // ---- first officer's advisories
  adviseTick() {
    const adv = (this.advice = []);
    if (this.game !== GS_RUN) return adv;
    const P = this.P, npc = this.npc;
    const already = (code, arg) => this.orders.some((o) => o.code === code && o.arg === arg && (o.status === K.ORD_SENT || o.status === K.ORD_ACK));
    const add = (col, code, arg, text) => {
      if (adv.length >= MAX_ADVICE || already(code, arg)) return;
      if (adv.some((v) => v.code === code)) return;
      adv.push({ text, code, arg, col });
    };
    let foe = NO_ID, fd = 1e9;
    for (let i = 0; i < MAX_CONTACTS; i++)
      if (this.hostileAlive(i) && this.visible(i) && npc[i].ai !== AI_FLEE) {
        const d = distTo(P.x, P.y, npc[i].x, npc[i].y);
        if (d < fd) { fd = d; foe = i; }
      }
    const combat = foe !== NO_ID && fd < 15000;
    const C = K.C;
    if (P.hull < 30 && combat) add(C.RED, K.O_EVASIVE, 0, 'HULL CRITICAL - EVASIVE, OR BREAK OFF');
    if (combat && !P.shieldsOn) add(C.RED, K.O_SHIELDS, 0, 'HOSTILES CLOSING - SHIELDS ARE DOWN');
    if (combat && (!this.targetValid() || !this.hostileAlive(P.target))) add(C.ORANGE, K.O_TARGET, foe, `NO TARGET LOCK - TARGET ${this.shortName(foe, this.contactKnown(foe))}`);
    if (combat) {
      const rel = angDiff(P.hdg, bearingTo(P.x, P.y, npc[foe].x, npc[foe].y));
      const q = quadFromRel(rel);
      if (this.shieldsUp() && P.shield[q] < 35 && P.reinforce !== q + 1) add(C.ORANGE, K.O_REINF, q, `${K.QUAD_NAME[q]} SHIELDS FACING THE ENEMY ARE LOW`);
      if (Math.abs(rel) > K.PH_ARC && fd < K.PH_RANGE) add(C.ORANGE, K.O_FACE, foe, `${this.shortName(foe)} IS BEHIND US - OUT OF PHASER ARC`);
      if (!P.evasive && npc[foe].aiTarget === US && fd < 7000) add(C.YELLOW, K.O_EVASIVE, 0, 'WE ARE UNDER FIRE - EVASIVE MANOEUVRES');
    }
    if (this.targetValid() && this.hostileAlive(P.target) && npc[P.target].scan < 2)
      add(C.YELLOW, K.O_FULLSCAN, P.target, `${this.shortName(P.target)}: SHIELD FREQUENCY UNKNOWN`);
    if (combat && !P.autoFire && this.targetValid() && this.hostileAlive(P.target)) add(C.YELLOW, K.O_FIRE, 0, 'TARGET LOCKED - WEAPONS NOT FIRING');
    for (let s = 0; s < NSYS; s++) {
      if (P.health[s] <= 0 && P.team[0] !== s && P.team[1] !== s) add(C.RED, K.O_REPAIR, s, `${K.SYS_NAME[s]} OFFLINE - NO REPAIR TEAM ON IT`);
      if (P.heat[s] > 75) add(C.ORANGE, K.O_COOL, s, `${K.SYS_NAME[s]} IS OVERHEATING`);
    }
    if (P.energy < 150) add(C.ORANGE, K.O_PWR_SAVE, 0, 'ENERGY RESERVE LOW');
    if (!combat) {
      for (let i = ID_FIRST_DYN; i < MAX_CONTACTS; i++)
        if (npc[i].active && npc[i].alive && this.visible(i) && npc[i].scan === 0 && npc[i].type !== CT_RAIDER && npc[i].type !== CT_DESTROYER)
          add(C.SKY, K.O_SCAN, i, 'UNIDENTIFIED CONTACT ON SENSORS');
      if (P.wpValid && !P.warping && P.autopilot === K.AP_OFF && distTo(P.x, P.y, P.wpx, P.wpy) > 25000) add(C.SKY, K.O_COURSE, 0, 'LONG WAY TO THE WAYPOINT - SET COURSE');
      if (P.wpValid && !P.warping && P.autopilot === K.AP_WAYPOINT && distTo(P.x, P.y, P.wpx, P.wpy) > 25000) add(C.SKY, K.O_WARP, 0, 'ON COURSE AT IMPULSE - WARP WOULD BE FASTER');
      if (this.M.stage >= K.ST_RETURN && distTo(P.x, P.y, BASE_X, BASE_Y) < 6000 && P.dock === 0) add(C.GREEN, K.O_DOCK, 0, 'STARBASE IN RANGE - TAKE US IN TO DOCK');
    }
    if (!adv.length) adv.push({ text: 'NO RECOMMENDATIONS, CAPTAIN', code: 255, arg: 0, col: C.GREEN_DIM });
    return adv;
  }

  threatText(id) {
    const n = this.npc[id];
    if (!this.contactKnown(id)) return 'UNIDENTIFIED';
    if (n.type === CT_STARBASE) return 'FRIENDLY BASE';
    if (n.ai === AI_SURRENDER) return 'SURRENDERED';
    if (n.ai === AI_FLEE) return 'RUNNING';
    if (n.ai === AI_PATROL) return 'LURKING';
    if (n.faction === F_HOSTILE && (n.ai === AI_ATTACK || n.ai === AI_WARPIN)) {
      if (n.aiTarget === US) return 'ATTACKING US';
      return 'ATTACKING ' + this.shortName(n.aiTarget);
    }
    if (n.type === CT_FREIGHTER) return n.ai === AI_TRAVEL ? 'UNDER WAY' : 'DISABLED';
    return K.FACTION_NAME[n.faction];
  }
}
