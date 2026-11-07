// Pulsar rescue walkthrough: plays the PULSAR RESCUE mission against the simulation with one strategy.
//   node tests/pulsar.mjs shield|tow|supply|none [diff]
// shield: escort the Meridian with the bubble open. tow: tractor her into a rock shadow.
// supply: send everything we have and lend a repair team, but leave her exposed. none: do nothing (she should be lost).
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng, distTo, bearingTo } from '../web/js/util.js';
import { pulLit, pulShadowed } from '../web/js/pulsar.js';
const how = process.argv[2] || 'shield', diff = +(process.argv[3] ?? 1);
const s = new Sim(makeRng(7));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, K.MT_PULSAR, diff, K.MODE_MISSION); cmd(K.CMD.START);
const M = s.M, pul = M.pul;
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)}] ${t}`);
const fail = (why) => { console.log('FAIL', how, why); process.exit(1); };
if (M.type !== K.MT_PULSAR || !pul) fail('mission did not start');
// the lead-in: Voss's briefing, cut off by the Meridian's mayday
for (let i = 0; i < 400 && s.pulS.held; i++) {
  s.tick(0.05); s.events.length = 0;
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.dopt.length && m0.id !== s._seen) { s._seen = m0.id; console.log(`  brief/${s.dlg.node} (${s.dlg.who}): ${m0.text.slice(0, 60)}...`); s.handleCmd({ cmd: K.CMD.DREPLY, a: s.dlg.seq, b: 0 }); }
}
if (s.pulS.held) fail('the mayday never came');
console.log('  mayday heard - ' + s.M.objective);
for (let i = 0; i < 200 && s.dlg; i++) { s.tick(0.05); s.events.length = 0; const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq); if (m0 && m0.dopt.length) s.handleCmd({ cmd: K.CMD.DREPLY, a: s.dlg.seq, b: 0 }); }
const atXY = (x, y) => { s.P.dock = 0; s.P.x = x; s.P.y = y; s.P.speed = 0; s.P.throttle = 0; s.P.vx = s.P.vy = 0; };
const f = s.npc[M.fr];
let lastSeq = 0, asked = false, hits = 0, lastHull = 100;
const talk = () => {
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (!s.dlg || !m0 || m0.id === lastSeq) return;
  lastSeq = m0.id;
  const vis = s.dlg.vis.map((o) => o.t);
  let idx = vis.findIndex((t) => t.startsWith('CLOSE'));
  if (s.dlg.node === 'start' && !asked) { asked = true; idx = vis.findIndex((t) => t.startsWith('WHAT DO YOU NEED')); }
  if (s.dlg.node === 'need') { idx = vis.findIndex((t) => t.startsWith('SEND') || t.startsWith('BEAM OVER')); if (idx < 0) idx = vis.findIndex((t) => t.startsWith('THAT')); }
  log(`  ${s.dlg.node}: -> ${vis[idx]}`);
  cmd(K.CMD.DREPLY, s.dlg.seq, idx);
};
const run = (sec, hook) => {
  for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN && M.stage < K.ST_RETURN; i++) {
    s.tick(0.05); s.events.length = 0; talk();
    s.P.hull = Math.max(s.P.hull, 60); s.P.energy = 1000;
    if (f.alive && f.hull < lastHull - 0.5) { hits++; lastHull = f.hull; } else if (f.alive) lastHull = f.hull;
    // the pirates: Tactical's problem, not this test's - they die 20s after they arrive
    for (const id of M.foes) { const n = s.npc[id]; if (n.alive && (n.bornAt ??= s.now) && s.now - n.bornAt > 20000) s.damageNpc(id, 999, K.SUB_HULL, K.US); }
    if (hook) hook();
  }
};
log(`pulsar at ${pul.x},${pul.y}; meridian ${Math.round(distTo(pul.x, pul.y, f.x, f.y))}m out; rocks ${pul.rocks.map((r) => Math.round(distTo(pul.x, pul.y, r.x, r.y))).join(',')}`);
// every strategy starts beside her
atXY(f.x + 1500, f.y);
if (how !== 'none') { s.startDialog('p_meridian', M.fr); }
if (how === 'shield') {
  cmd(K.CMD.SHIELDS, 1); s.P.shieldRaise = 1;
  cmd(K.CMD.SHRANGE, 40, 1); cmd(K.CMD.AUTOPILOT, K.AP_ESCORT, M.fr);
  run(600, () => { s.P.shieldsOn = true; for (let q = 0; q < 4; q++) s.P.shield[q] = Math.max(s.P.shield[q], 40); });
} else if (how === 'tow') {
  cmd(K.CMD.SHIELDS, 0); s.P.shieldRaise = 0;
  run(2);
  cmd(K.CMD.EXTRACT, M.fr);
  if (!s.pulS.tow) fail('tractor did not lock');
  // the nearest rock's shadow: sit well inside it, the Meridian trails us in
  const r = pul.rocks.slice().sort((a, b) => distTo(a.x, a.y, f.x, f.y) - distTo(b.x, b.y, f.x, f.y))[0];
  const ar = Math.atan2(r.y - pul.y, r.x - pul.x), dr = distTo(pul.x, pul.y, r.x, r.y);
  const tx = pul.x + Math.cos(ar) * (dr + r.r + 3400), ty = pul.y + Math.sin(ar) * (dr + r.r + 3400);
  // round the rock, not through it: come in from the Meridian's side of the shadow
  const side = Math.sign(Math.sin(Math.atan2(f.y - pul.y, f.x - pul.x) - ar)) || 1;
  const sx = tx - Math.sin(ar) * 4500 * side, sy = ty + Math.cos(ar) * 4500 * side;
  for (const [wx, wy] of [[sx, sy], [tx, ty]]) {
    cmd(K.CMD.WAYPOINT, 1, 0, wx, wy); cmd(K.CMD.AUTOPILOT, K.AP_WAYPOINT); cmd(K.CMD.THROTTLE, 0, 0, 30);
    for (let k = 0; k < 30 && s.P.autopilot === K.AP_WAYPOINT; k++) { run(5); if (process.env.DBG) log(`    ${Math.round(distTo(s.P.x, s.P.y, wx, wy))} spd ${Math.round(s.P.speed)} thr ${s.P.throttle} hdg ${Math.round(s.P.hdg)}/${Math.round(s.P.desHdg)} game ${s.game} stage ${M.stage}`); }
  }
  log(`  aurora ${Math.round(distTo(s.P.x, s.P.y, tx, ty))}m from the target, autopilot ${s.P.autopilot}`);
  log(`  towed: meridian shadowed=${pulShadowed(pul, f.x, f.y)} ${Math.round(distTo(f.x, f.y, r.x, r.y))}m from the rock, tow=${s.pulS.tow}`);
  if (!pulShadowed(pul, f.x, f.y)) fail('the Meridian is not in the shadow');
  cmd(K.CMD.STOP);
  run(600);
} else if (how === 'supply') {
  run(600);
} else run(600);
log(`  end: game ${s.game} stage ${M.stage} saved ${M.frSaved} lost ${M.frLost} meridian hull ${Math.round(f.hull)} hits ${hits} repairs ${Math.round(s.pulS.rep)} glitch ${!!s.pulS.said.glitch}`);
log(`  objective: ${M.objective}`);
if (how === 'none') { if (!M.frLost) fail('she should have been lost'); }
else if (how === 'supply') log(M.frSaved ? '  supplies alone got her out' : '  supplies alone were not enough (as designed: she needs cover too)');
else if (!M.frSaved) fail('the Meridian was lost');
console.log('OK', how);
