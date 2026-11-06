// Campaign walkthrough: plays "THE ARGUS PARADOX" start to finish against the
// simulation, answering each conversation as told and cheating through the fights.
//   node tests/campaign2.mjs '{"a_voss2":"PERSON","a_tarren":"SHIELD"}' '["B","C"]' 3
// arg 1: dialogue key -> part of the reply to pick; arg 2: nodes to purge; arg 3: convoy ship to accuse (0-3)
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng } from '../web/js/util.js';
import { SYS_INDEX, sysAt, planetPos } from '../web/js/galaxy.js';
const pick = JSON.parse(process.argv[2] || '{"a_vey1":"WHAT ARE YOU","a_voss2":"PERSON","a_tarren":"SHIELD","a_final":"ARGUS"}');
const purge = JSON.parse(process.argv[3] || '["B","C"]');
const accuse = +(process.argv[4] ?? 3);
const s = new Sim(makeRng(33));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, 1); cmd(K.CMD.START);
if (s.camp.id !== 'argus') { console.log('WRONG CAMPAIGN', s.camp.id); process.exit(1); }
let lastSeq = 0, lastStep = '';
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const run = (sec, hook) => { for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN; i++) { s.tick(0.05); s.events.length = 0; if (hook) hook(); tick(); } };
function tick() {
  const c = s.camp;
  if (c && c.step !== lastStep) { lastStep = c.step; log('STEP ' + c.step + ' :: ' + s.M.objective); }
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.id !== lastSeq) {
    lastSeq = m0.id;
    let idx = 0;
    const want = pick[s.dlg.key];
    if (want) { const j = s.dlg.vis.findIndex((o) => o.t.includes(want)); if (j >= 0) idx = j; }
    if (s.dlg.key === 'a_purge') {
      const left = purge.filter((n) => !c.purge.includes(n));
      const j = left.length ? s.dlg.vis.findIndex((o) => o.t.startsWith('NODE ' + left[0])) : s.dlg.vis.findIndex((o) => o.t.includes('RUN THE PURGE') || o.t.includes('DO IT'));
      if (j >= 0) idx = j;
    }
    if (/^a_conv\d$/.test(s.dlg.key)) {
      const i = +s.dlg.key.slice(6);
      const j = s.dlg.vis.findIndex((o) => (i === accuse ? o.t.includes('HEAVE TO') : o.t.includes('SAFE TRAVELS')));
      if (j >= 0) idx = j;
    }
    log(`  ${s.dlg.key}/${s.dlg.node} "${m0.text.slice(0, 60)}..." -> ${s.dlg.vis[idx].t}`);
    cmd(K.CMD.DREPLY, s.dlg.seq, idx);
  }
}
const goSys = (id) => { if (s.game !== K.GS_RUN) return; s.P.dock = 0; s.arrive(SYS_INDEX[id]); run(1); };
const atXY = (x, y) => { s.P.x = x; s.P.y = y; s.P.speed = 0; s.P.throttle = 0; };
const at = (n, dx = 1500) => { if (n) atXY(n.x + dx, n.y); };
const godmode = () => { s.P.hull = 100; s.P.energy = 1000; for (let i = 0; i < 6; i++) s.P.health[i] = 100; };
const fullScan = (id) => { for (let k = 0; k < 2 && s.npc[id].scan < 2; k++) { s.P.scanId = id; s.P.scanProg = 0.99; run(1); } };
const fail = (why) => { console.log('FAIL', why, 'step', s.camp && s.camp.step); process.exit(1); };
run(6);
// ch1: buoys, cross bearings, debris, Vey, recorder
if (!s.camp.buoyIds || s.camp.buoyIds.length !== 3) fail('no buoys');
for (const id of s.camp.buoyIds.slice(0, 2)) { at(s.npc[id], 1000); fullScan(id); }
if (s.camp.lines.length !== 2 || s.camp.step !== 'a1_cross') fail('fixes');
// solve the crossing from the two lines, like the crew would
const [L1, L2] = s.camp.lines, r = (b) => (b * Math.PI) / 180;
const d1 = [Math.sin(r(L1.b)), -Math.cos(r(L1.b))], d2 = [Math.sin(r(L2.b)), -Math.cos(r(L2.b))];
const det = d1[0] * -d2[1] + d2[0] * d1[1], t1 = ((L2.x - L1.x) * -d2[1] + d2[0] * (L2.y - L1.y)) / det;
const X = L1.x + d1[0] * t1, Y = L1.y + d1[1] * t1;
log(`  crossing at ${X | 0}, ${Y | 0}`);
atXY(X, Y); run(2);
if (s.camp.recId === undefined) fail('no debris at crossing');
at(s.npc[s.camp.veyId], 2000); run(8, godmode);
const rec = s.npc[s.camp.recId]; at(rec, 800); rec.scan = 2; s.P.shieldsOn = false; s.P.shieldRaise = 0;
cmd(K.CMD.EXTRACT, s.camp.recId); run(30, godmode);
const h = s.P.arts.find((q) => G.ART[q.a].id === 'recorder');
if (!h) fail('recorder not extracted');
cmd(K.CMD.ANALYSE, h.uid, 1); run(40, godmode);
if (s.camp.ch !== 2) fail('ch2 not reached');
// ch2: ARGUS
goSys('halcyon'); at(s.npc[s.camp.argusId], 3000); run(6, godmode);
fullScan(s.camp.argusId);
cmd(K.CMD.HAIL, s.camp.argusId); run(4, godmode);
run(16, godmode);
if (s.camp.ch !== 3) fail('ch3 not reached');
// ch3: anchors via the flux meter (walk downhill like helm would)
for (let k = 0; k < 3; k++) {
  for (let it = 0; it < 400 && s.campFlux() < 90; it++) {
    const f0 = s.campFlux(); let best = null, bf = f0;
    for (const st of [5000, 1500, 500, 200]) { for (let a = 0; a < 16; a++) { const ox = s.P.x, oy = s.P.y; s.P.x += Math.cos(a / 16 * 6.283) * st; s.P.y += Math.sin(a / 16 * 6.283) * st; const f = s.campFlux(); if (f > bf) { bf = f; best = [s.P.x, s.P.y]; } s.P.x = ox; s.P.y = oy; } if (best) break; }
    if (!best) break; atXY(...best);
  }
  log(`  flux ${s.campFlux()} at ${s.P.x | 0},${s.P.y | 0} anchors ${JSON.stringify(s.camp.anchors.map((a) => [a.x | 0, a.y | 0, a.done]))}`);
  cmd(K.CMD.CAMP, 1); run(1, godmode);
}
if (s.camp.stab !== 3) fail('stabilisers ' + s.camp.stab);
run(8, godmode);
if (s.camp.step === 'a3_shield') {
  // fly alongside the VEGA with shields up so the bubble covers her (shields topped up: we test the mechanic, not the balance)
  s.P.shieldsOn = true; s.P.shieldRaise = 1;
  run(90, () => { godmode(); const v = s.npc[s.camp.vegaId]; if (v && v.alive) atXY(v.x + 600, v.y); s.P.shieldsOn = true; for (let q = 0; q < 4; q++) s.P.shield[q] = 100; });
  log(`  vega hull ${s.npc[s.camp.vegaId] && Math.round(s.npc[s.camp.vegaId].hull)} covered ${Math.round(s.camp.covered)}s tarren=${s.camp.f.tarren}`);
}
run(8, godmode);
if (s.camp.ch !== 4) fail('ch4 not reached');
// ch4: convoy
goSys('velanar'); run(2, godmode);
for (const id of s.camp.convoyIds) { at(s.npc[id], 2000); fullScan(id); }
for (let i = 0; i < 4 && s.camp.step === 'a4_find'; i++) { const id = s.camp.convoyIds[i]; at(s.npc[id], 2000); cmd(K.CMD.HAIL, id); run(6, godmode); }
const gid = s.camp.convoyIds[3];
run(30, () => { godmode(); const n = s.npc[gid]; if (n.active) { at(n, 2000); n.hull = Math.min(n.hull, 35); } });
run(8, godmode);
if (s.camp.ch !== 5) fail('ch5 not reached');
// ch5
goSys('halcyon'); atXY(42000 + 6000, 42000); run(4, godmode);
run(30, godmode);
run(160, () => { godmode(); atXY(42000 + 5000, 42000); });
run(10, godmode);
const e = s.camp.ending;
console.log('GAME', s.game === K.GS_WIN ? 'WON' : s.game, 'ENDING', e && e.title, '| ALLIES', e && e.allies.join(', '), '| CHOICES', JSON.stringify(s.camp.f));
process.exit(s.game === K.GS_WIN ? 0 : 1);
