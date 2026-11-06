// Crew-bot harness: plays every mission type x difficulty against the JS
// simulation (port of tools/pc-harness/main.cpp crew logic).
//   node tests/bots.mjs [seed] [captain]
import * as K from '../web/js/config.js';
import { Sim, AI_PATROL, AI_FLEE } from '../web/js/sim.js';
import { distTo, angDiff, bearingTo, makeRng } from '../web/js/util.js';

const { CMD, NO_ID, MAX_CONTACTS } = K;
const DT = 0.02;

export function makeCrew(sim) {
  const send = (cmd, a = 0, b = 0, c = 0, d = 0) => sim.handleCmd({ cmd, a, b, c, d });
  const P = () => sim.P;
  let fightSince = -1, lastLrs = -1e9;
  const hostileNear = (range) => {
    for (let i = 0; i < MAX_CONTACTS; i++)
      if (sim.hostileAlive(i) && sim.npc[i].ai !== AI_PATROL && sim.visible(i) && distTo(P().x, P().y, sim.npc[i].x, sim.npc[i].y) < range) return true;
    return false;
  };
  function tacBot() {
    let best = NO_ID, bd = 1e9;
    for (let i = 0; i < MAX_CONTACTS; i++) {
      const n = sim.npc[i];
      if (!n.active || !n.alive || !sim.visible(i)) continue;
      const fac = n.scan >= 1 || n.type === K.CT_STARBASE ? n.faction : K.F_UNKNOWN;
      if (fac === K.F_HOSTILE && n.ai !== 6) {
        const d = distTo(P().x, P().y, n.x, n.y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best !== NO_ID && P().target !== best) send(CMD.TARGET, best);
    if (best !== NO_ID && !P().autoFire) send(CMD.AUTOFIRE, 1);
    const t = best !== NO_ID ? sim.npc[best] : null;
    if (t && t.scan >= 2 && P().phFreq !== t.freq) send(CMD.PH_FREQ, t.freq);
    if (t && t.scan >= 2 && P().sub !== K.SUB_WEAPONS && t.wpn > 0) send(CMD.SUB, K.SUB_WEAPONS);
    for (let tb = 0; tb < 2; tb++) {
      if (P().tubeState[tb] === K.TUBE_EMPTY && (P().torps[0] || P().torps[1])) send(CMD.TUBE_LOAD, tb, P().torps[0] ? 0 : 1);
      if (P().tubeState[tb] === K.TUBE_LOADED && t && bd < 7000 && Math.abs(angDiff(P().hdg, bearingTo(P().x, P().y, t.x, t.y))) < 40) send(CMD.TUBE_FIRE, tb);
    }
    for (let s = 0; s < K.NSYS; s++)
      if (P().health[s] < 60 && !P().team.includes(s)) {
        const k = P().team.indexOf(NO_ID);
        if (k >= 0) send(CMD.TEAM, k, s);
      }
  }
  function helmFight() {
    const id = P().target;
    if (!(id < MAX_CONTACTS) || !sim.visible(id)) return;
    const t = sim.npc[id];
    if (t.scan < 2 && P().scanId === NO_ID) send(CMD.SCAN, id);
    const d = distTo(P().x, P().y, t.x, t.y), want = bearingTo(P().x, P().y, t.x, t.y);
    if (P().autopilot || Math.abs(angDiff(P().desHdg, want)) > 8) send(CMD.HEADING, 0, 0, Math.round(want));
    const thr = d > 5000 ? 100 : 40;
    if (P().throttle !== thr) send(CMD.THROTTLE, 0, 0, thr);
    if (P().warpSet) send(CMD.WARP, 0);
  }
  function goTo(x, y, warpOk = true) {
    const d = distTo(P().x, P().y, x, y);
    if (!P().wpValid || Math.abs(P().wpx - x) > 300 || Math.abs(P().wpy - y) > 300) send(CMD.WAYPOINT, 1, 0, x, y);
    if (d > 900 && P().autopilot !== K.AP_WAYPOINT) send(CMD.AUTOPILOT, K.AP_WAYPOINT);
    const thr = d > 4000 ? 100 : d > 1500 ? 30 : 10;
    if (P().throttle !== thr) send(CMD.THROTTLE, 0, 0, thr);
    const w = warpOk && d > 20000 ? 4 : 0;
    if (P().warpSet !== w && !(w === 0 && !P().warpSet)) send(CMD.WARP, w);
  }
  return function crewTick(now) {
    const M = sim.M;
    if (sim.game !== K.GS_RUN) return;
    if (hostileNear(14000)) {
      if (fightSince < 0) fightSince = now;
      tacBot();
      helmFight();
      if (!P().evasive) send(CMD.EVASIVE, 1);
      if (sim.alert !== K.AL_RED) send(CMD.ALERT, K.AL_RED);
      if (P().reinforce !== K.RF_FORE) send(CMD.REINFORCE, K.RF_FORE);
      if (P().power[K.S_SHIELDS] < 150) send(CMD.PRESET, 1);
      return;
    }
    fightSince = -1;
    if (P().evasive) send(CMD.EVASIVE, 0);
    if (P().autoFire) send(CMD.AUTOFIRE, 0);
    for (let i = K.ID_FIRST_DYN; i < MAX_CONTACTS; i++) {
      const n = sim.npc[i];
      if (!n.active || !n.alive || !sim.visible(i)) continue;
      const need = (n.type === K.CT_FREIGHTER && n.scan < 1) || (n.type === K.CT_BUOY && n.scan < 1) || (n.type === K.CT_ANOMALY && n.scan < 2);
      if (need) {
        const d = distTo(P().x, P().y, n.x, n.y);
        if (P().scanId === NO_ID && (n.type !== K.CT_BUOY || d < 7500)) send(CMD.SCAN, i);
        if (d > (n.type === K.CT_BUOY ? 7000 : 6000)) goTo(n.x, n.y, false);
        else if (P().throttle) send(CMD.THROTTLE, 0, 0, 0);
        return;
      }
    }
    const bd = distTo(P().x, P().y, sim.bx, sim.by);
    if (M.stage >= K.ST_RETURN || (M.type === K.MT_DEFEND && M.stage === 0)) {
      if (M.stage >= K.ST_RETURN && sim.alert !== K.AL_GREEN) send(CMD.ALERT, K.AL_GREEN);
      if (P().dock) return;
      if (bd > 1300) goTo(sim.bx, sim.by);
      else if (M.stage >= K.ST_RETURN) {
        if (Math.abs(P().speed) > 20 || P().throttle) send(CMD.STOP);
        else send(CMD.DOCK);
      }
      return;
    }
    if (M.type === K.MT_ESCORT && M.stage === 1 && M.fr < MAX_CONTACTS && sim.npc[M.fr].alive) {
      if (P().autopilot !== K.AP_TARGET) send(CMD.AUTOPILOT, K.AP_TARGET, M.fr);
      if (P().throttle !== 100) send(CMD.THROTTLE, 0, 0, 100);
      if (P().warpSet) send(CMD.WARP, 0);
      return;
    }
    if (M.type === K.MT_HUNT && P().wpValid && distTo(P().x, P().y, P().wpx, P().wpy) < 3000) {
      if (sim.now - lastLrs > 12000) { lastLrs = sim.now; send(CMD.LRS); }
      for (let i = 0; i < MAX_CONTACTS; i++) if (sim.hostileAlive(i) && sim.visible(i)) { goTo(sim.npc[i].x, sim.npc[i].y, false); return; }
      return;
    }
    if (P().wpValid) goTo(P().wpx, P().wpy);
  };
}

export function playMission(sim, type, diff, maxSec = 1500, hook) {
  sim.game = K.GS_TITLE;
  sim.handleCmd({ cmd: CMD.SELECT, a: type, b: diff });
  sim.handleCmd({ cmd: CMD.START });
  const crew = makeCrew(sim);
  let acc = 0;
  while (sim.game === K.GS_RUN && sim.missionT < maxSec) {
    sim.tick(DT);
    sim.events.length = 0;
    acc += DT;
    if (acc >= 0.3) { acc = 0; crew(sim.now / 1000); if (hook) hook(sim); }
  }
  return { type: sim.M.type, diff: sim.M.diff, game: sim.game, fail: sim.M.fail, t: sim.missionT, kills: sim.kills, hull: sim.P.hull };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1];
  let tot = 0, won = 0;
  for (const seed of seeds) {
    const sim = new Sim(makeRng(seed));
    let ok = 0;
    for (let type = 1; type <= K.MT_DEFEND; type++) // the asteroid field is flown by tests/field.mjs
      for (let diff = 0; diff < 3; diff++) {
        const r = playMission(sim, type, diff);
        if (r.game === K.GS_WIN) ok++;
        if (seeds.length === 1)
          console.log(`${K.MT_NAME[r.type].padEnd(16)} ${K.DIFF_NAME[r.diff].padEnd(8)} -> ${r.game === K.GS_WIN ? 'WIN' : r.game === K.GS_LOST ? 'LOST ' + K.FAIL_TEXT[r.fail] : 'TIMEOUT'} t=${r.t.toFixed(0).padStart(4)}s kills=${r.kills} hull=${r.hull.toFixed(0).padStart(3)}`);
      }
    console.log(`seed ${seed}: ${ok}/18 won`);
    tot += 18; won += ok;
  }
  if (seeds.length > 1) console.log(`TOTAL ${won}/${tot} = ${(100 * won / tot).toFixed(0)}%`);
}
