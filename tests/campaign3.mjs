// Campaign walkthrough: plays "THE CARTOGRAPHERS" start to finish against the simulation.
//   node tests/campaign3.mjs [rime: peace|force] [saresh: pay|expose|fooled] [ending text]
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng, distTo } from '../web/js/util.js';
import { SYS_INDEX, planetPos } from '../web/js/galaxy.js';
import { LAB_ART } from '../web/js/lab.js';
import { pathAt } from '../web/js/field.js';
import * as O from '../web/js/orbit.js';
const rimeWay = process.argv[2] || 'peace', sareshWay = process.argv[3] || 'pay', endWant = process.argv[4] || 'FINISH';
const s = new Sim(makeRng(21));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, 2); cmd(K.CMD.START);
if (!s.camp || s.camp.id !== 'carto') { console.log('WRONG CAMPAIGN', s.camp && s.camp.id); process.exit(1); }
const P = () => s.P;
let lastSeq = 0, lastStep = '', missiles = 0, shieldHits = 0;
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const pickFor = { e_reyes1: 'TAKE 3 SPARE', e_elder: 'STUDY IT', e_keeper: rimeWay === 'peace' ? 'UNDERSTAND' : 'FIRE AGAIN', e_elder2: 'TAKE THE SHARD', e_vhel: 'CODEX', e_atlas: endWant };
let want = {};
function tick() {
  const c = s.camp;
  if (c && c.step !== lastStep) { lastStep = c.step; log('STEP ' + c.step + ' :: ' + s.M.objective.slice(0, 150)); }
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.id !== lastSeq) {
    lastSeq = m0.id;
    const vis = s.dlg.vis; let idx = 0;
    const w = want[s.dlg.key + '/' + s.dlg.node] || (s.dlg.key === 'e_keeper' && s.dlg.node === 'why' ? 'STAYS IN YOUR VAULT' : pickFor[s.dlg.key]);
    if (w) { const j = vis.findIndex((o) => o.t.includes(w)); if (j >= 0) idx = j; }
    log(`  ${s.dlg.key}/${s.dlg.node} "${m0.text.slice(0, 60)}..." -> ${vis[idx].t}`);
    cmd(K.CMD.DREPLY, s.dlg.seq, idx);
  }
}
const run = (sec, hook) => { for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN; i++) { s.tick(0.05); for (const e of s.events) { if (e.type === K.EV_WE_HIT_SHIELD) shieldHits++; } s.events.length = 0; if (hook) hook(); tick(); } };
const goSys = (id) => { s.P.dock = 0; s.arrive(SYS_INDEX[id]); run(1); };
const atXY = (x, y) => { s.P.x = x; s.P.y = y; s.P.speed = 0; s.P.throttle = 0; s.P.vx = s.P.vy = 0; };
const god = () => { s.P.hull = 100; s.P.energy = 1000; for (let i = 0; i < 6; i++) s.P.health[i] = 100; };
const fail = (why) => { console.log('FAIL', why, 'step', s.camp && s.camp.step); process.exit(1); };
const art = (id) => s.P.arts.find((h) => G.ART[h.a].id === id);
const labIt = (h, tests = [0, 4]) => { for (const t of tests) { cmd(K.CMD.LAB, 1, h.uid, t); run(5, god); } const cls = s.labClass(h); cmd(K.CMD.LAB, 2, h.uid, LAB_ART[G.ART[h.a].id].choices.indexOf(cls)); run(1, god); };
const orbit = (name) => { // put the ship in a circular orbit at 2.5 radii
  const i = s.sysDef.planets.findIndex((p) => p.name === name), p = s.sysDef.planets[i];
  const [px, py] = planetPos(s.sysDef, i, s.now / 1000), d = p.r * 2.5, v = O.circSpeed(p, d);
  atXY(px + d, py); s.P.hdg = s.P.desHdg = 180; s.P.autopilot = 0; run(0.1); s.P.vx = 0; s.P.vy = v; s.P.speed = v; s.P.inWell = true;
  return i;
};
run(5);
// ---- ch1
if (s.camp.step !== 'e1_go') fail('voss');
s.P.cargo[G.R_SPARES] = 6;
goSys('meridian');
if (!s.field) fail('no field');
const cal = s.npc[s.camp.calId]; atXY(cal.x - 2500, cal.y); run(4, god);
if (s.camp.step !== 'e1_out') fail('reyes');
labIt(art('rshard'));
if (art('rshard').ident < 2) fail('lab');
atXY(s.field.spec.x1 + 6000, s.field.spec.y1 + 6000); run(8, god);
if (s.camp.ch !== 2) fail('ch2');
// ---- ch2
goSys('cerulean');
if (s.camp.step !== 'e2_orbit') fail('rime orbit step');
const ri = orbit('RIME'); run(5);
if (s.camp.step !== 'e2_hail') fail('not in orbit ' + JSON.stringify(s.P.orb));
cmd(K.CMD.SHIELDS, 1);
cmd(K.CMD.HAIL, s.camp.elderId); run(10, god);
if (s.camp.step !== 'e2_keepers') fail('no keepers');
run(30, () => { god(); s.P.shieldsOn = true; s.P.shieldRaise = 1; });
log(`  shield hits so far ${shieldHits}, torps in flight ${s.torp.length}, hull ${s.P.hull | 0}`);
if (rimeWay === 'peace') { cmd(K.CMD.HAIL, s.camp.siteId); run(14, god); }
else { s.damageNpc(s.camp.siteId, 500, K.SUB_HULL, K.US); run(2, god); cmd(K.CMD.HAIL, s.camp.elderId); run(10, god); }
if (s.camp.ch !== 3) fail('ch3 (rime ' + s.camp.f.rime + ')');
log(`  rime=${s.camp.f.rime} codex=${!!art('codex')}`);
// ---- ch3
goSys('velanar');
{ const n = s.npc[s.camp.sareshId]; atXY(n.x - 3000, n.y); run(3, god); }
cmd(K.CMD.HAIL, s.camp.sareshId); run(2, god);
if (s.camp.step !== 'e3_test') fail('samples');
labIt(art('gsample1')); labIt(art('gsample2'));
s.P.cargo[G.R_CRYSTAL] = 8; s.P.cargo[G.R_EXOTIC] = 4;
const real = s.camp.realSample;
if (sareshWay === 'expose') want = { 'e_saresh/start': 'REPORTING' };
else if (sareshWay === 'fooled') want = { 'e_saresh/start': real === 0 ? 'SHARD B' : 'SHARD A', 'e_saresh/payA': 'FOUR CRYSTAL', 'e_saresh/payB': 'FOUR CRYSTAL' };
else want = { 'e_saresh/start': real === 0 ? 'SHARD A' : 'SHARD B', 'e_saresh/payA': 'FOUR CRYSTAL', 'e_saresh/payB': 'FOUR CRYSTAL' };
cmd(K.CMD.HAIL, s.camp.sareshId); run(12, god);
if (sareshWay === 'fooled') { log('  fooled: bought ' + (art('gfake') ? 'the fake' : '?')); want = { 'e_saresh/start': real === 0 ? 'SHARD A' : 'SHARD B', 'e_saresh/payA': 'FOUR CRYSTAL', 'e_saresh/payB': 'FOUR CRYSTAL' }; s.P.cargo[G.R_CRYSTAL] = 8; s.P.cargo[G.R_EXOTIC] = 4; cmd(K.CMD.HAIL, s.camp.sareshId); run(8, god); }
want = {};
if (s.camp.ch !== 4) fail('ch4 (saresh ' + s.camp.f.saresh + ')');
// ---- ch4
goSys('orra');
atXY(s.npc[0].x + 3000, s.npc[0].y); run(3, god);
cmd(K.CMD.HAIL, 0); run(6, god);
if (s.camp.step !== 'e4_ring' || !s.camp.ring) fail('ring');
cmd(K.CMD.LAB, 6); run(0.5); log('  wrong lock -> ' + s.camp.ring.msg.slice(0, 50));
cmd(K.CMD.LAB, 7, 2); cmd(K.CMD.LAB, 5, 0, 1); cmd(K.CMD.LAB, 5, 1, 3); cmd(K.CMD.LAB, 5, 2, 3); cmd(K.CMD.LAB, 6); run(7, god);
if (!s.camp.ring.solved) fail('ring not solved ' + JSON.stringify(s.camp.ring.order) + JSON.stringify(s.camp.ring.flip));
log('  ' + s.camp.ring.msg);
if (s.camp.ch !== 5) fail('ch5');
// ---- ch5: the lane must be open from Cerulean, on bearing 072
goSys('cerulean');
log(`  jump vector to the Atlas: ${s.jumpVector(SYS_INDEX.atlas)}  block: "${s.jumpBlock(SYS_INDEX.atlas, 360)}"`);
goSys('atlas');
const at = s.npc[s.camp.atlasId]; atXY(at.x + 6000, at.y); run(6, god);
run(130, () => { god(); atXY(at.x + 6000, at.y); });
run(10, god);
const e = s.camp.ending;
console.log('GAME', s.game === K.GS_WIN ? 'WON' : s.game, 'ENDING', e && e.title, '| ALLIES', e && e.allies.join(', '), '| CHOICES', JSON.stringify(s.camp.f));
process.exit(s.game === K.GS_WIN ? 0 : 1);
