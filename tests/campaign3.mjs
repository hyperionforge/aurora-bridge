// Campaign walkthrough: plays "THE LONG SLEEP" start to finish against the simulation.
//   node tests/campaign3.mjs [route]
// routes: ice (bring ice, kind to Wren, he comes aboard, Skarra, cure, council, MOTHER rests) - the default
//         wake (wake bay 3, hard on Wren, he stays, pay Vask, no cure, Vespera, MOTHER stays)
//         late (let bay 3 die, fight Vask, cure, the council is gone -> Fleet, MOTHER archived)
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng, distTo } from '../web/js/util.js';
import { SYS_INDEX, planetPos } from '../web/js/galaxy.js';
import { LAB_ART, LAB_CLASSES } from '../web/js/lab.js';
const route = process.argv[2] || 'ice';
const R = {
  ice: { l_mother1: 'BEAMING 4', l_wren1: ['IT WASN', 'COME ABOARD'], l_okafor: 'TAKE 3 SPARE', l_vask: 'SKARRA', l_skarra: 'ENGINEER', l_mother4: 'BEAMING', l_dest: 'COUNCIL', l_final: 'REST' },
  wake: { l_mother1: 'WAKE BAY 3', l_wren1: ['YOU HID', 'STAY WITH'], l_okafor: 'THANK', l_vask: 'PRICE', l_mother4: 'WAKE THEM ANYWAY', l_dest: 'VESPERA', l_final: 'STAY WITH' },
  late: { l_mother1: 'WE\'LL BE BACK', l_wren1: ['IT WASN', 'COME ABOARD'], l_okafor: 'THANK', l_vask: 'BATTLE', l_mother4: 'BEAMING', l_dest: 'COUNCIL', l_final: 'ARCHIVE' },
}[route];
const s = new Sim(makeRng(51));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, 2); cmd(K.CMD.START);
if (!s.camp || s.camp.id !== 'sleep') { console.log('WRONG CAMPAIGN', s.camp && s.camp.id); process.exit(1); }
let lastSeq = 0, lastStep = '';
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const fail = (why) => { console.log('FAIL', route, why, 'step', s.camp && s.camp.step); process.exit(1); };
const run = (sec, hook) => { for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN; i++) { s.tick(0.05); s.events.length = 0; if (hook) hook(); tick(); } };
function tick() {
  const c = s.camp;
  if (c && c.step !== lastStep) { lastStep = c.step; log('STEP ' + c.step + ' :: ' + s.M.objective.slice(0, 150)); }
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.id !== lastSeq) {
    lastSeq = m0.id;
    const vis = s.dlg.vis.map((o) => o.t);
    let want = R[s.dlg.key];
    if (Array.isArray(want)) want = want.find((w) => vis.some((t) => t.includes(w)));
    // the charter, once we have it, and the questions that move things on
    let idx = -1;
    if (s.dlg.key === 'l_mother1' && s.dlg.node === 'start') idx = vis.findIndex((t) => t.startsWith('"WE GO') || (c.charterOk && t.startsWith('TELL US')));
    if (s.dlg.key === 'l_mother1' && s.dlg.node === 'start' && idx < 0) idx = vis.findIndex((t) => t.startsWith('WE ARE THE FLEET'));
    if (s.dlg.key === 'l_mother2') idx = vis.findIndex((t) => t.startsWith('POD 2-117'));
    if (s.dlg.key === 'l_pell') idx = vis.findIndex((t) => t.includes('COVENANT') || t.includes('CHARTER'));
    if (s.dlg.key === 'l_vask' && s.dlg.node === 'price') idx = vis.findIndex((t) => t.startsWith('PAY'));
    if (s.dlg.key === 'l_okafor' && s.dlg.node === 'skarra') idx = 0;
    if (idx < 0 && want) idx = vis.findIndex((t) => t.includes(want));
    if (idx < 0) idx = 0;
    log(`  ${s.dlg.key}/${s.dlg.node} "${m0.text.slice(0, 70)}..." -> ${vis[idx]}`);
    cmd(K.CMD.DREPLY, s.dlg.seq, idx);
  }
}
const goSys = (id) => { if (s.game !== K.GS_RUN) return; s.P.dock = 0; s.arrive(SYS_INDEX[id]); run(1); };
const atXY = (x, y) => { s.P.dock = 0; s.P.x = x; s.P.y = y; s.P.speed = 0; s.P.throttle = 0; s.P.vx = s.P.vy = 0; };
const at = (n, dx = 1500) => { if (n) atXY(n.x + dx, n.y); };
const godmode = () => { s.P.hull = 100; s.P.energy = 1000; for (let i = 0; i < 6; i++) s.P.health[i] = 100; };
const fullScan = (id) => { for (let k = 0; k < 2 && s.npc[id].scan < 2; k++) { s.P.scanId = id; s.P.scanProg = 0.99; run(1, godmode); } };
const orbit = (name) => {
  const i = s.sysDef.planets.findIndex((p) => p.name === name), [px, py] = planetPos(s.sysDef, i, s.now / 1000);
  atXY(px + s.sysDef.planets[i].r * 3, py);
  cmd(K.CMD.AUTOPILOT, K.AP_ESCORT, 100 + i);
  for (let k = 0; k < 40 && s.P.orbitPl !== i; k++) run(2, godmode);
  if (s.P.orbitPl !== i) fail('no orbit of ' + name);
  return s.npc.findIndex((n) => n.active && n.type === K.CT_GROUND && n.pl === i);
};
const cov = () => s.npc[s.camp.covId];
run(6, godmode);
// ---- ch1: find the cold contact, scan, hail, get the charter from Vespera, bay 3
if (s.camp.step !== 'l1_find') fail('no brief');
atXY(104000 - 7000, 58000); run(2, godmode);
if (s.camp.covId === undefined) fail('no covenant');
fullScan(s.camp.covId);
if (s.camp.step !== 'l1_hail') fail('scan did not lead to hail');
cmd(K.CMD.HAIL, s.camp.covId); run(10, godmode);
if (s.camp.step !== 'l1_charter') fail('mother did not refuse');
const site = orbit('VESPERA');
cmd(K.CMD.HAIL, site); run(8, godmode);
if (!s.camp.charter) fail('no charter');
at(cov(), 2500); cmd(K.CMD.AUTOPILOT, 0);
cmd(K.CMD.HAIL, s.camp.covId); run(8, godmode);
if (!s.camp.charterOk) fail('charter not accepted');
if (route === 'ice') {
  // the comet: tractor its ice in, then beam it across
  at(s.npc[s.camp.cometId], 1500); cmd(K.CMD.SHIELDS, 0); s.P.shieldRaise = 0;
  cmd(K.CMD.EXTRACT, s.camp.cometId); run(40, godmode);
  log(`  ice aboard: ${s.P.cargo[G.R_ICE]}`);
  if (s.P.cargo[G.R_ICE] < 4) fail('not enough ice from the comet');
  at(cov(), 2500); cmd(K.CMD.HAIL, s.camp.covId); run(8, godmode);
} else if (route === 'late') {
  run(430, godmode);
}
run(12, godmode);
log(`  bay 3: ${s.camp.f.bay3}`);
if (s.camp.ch !== 2) fail('chapter 1 did not end');
// ---- ch2: deeper scans, confront MOTHER, meet Wren
for (let k = 0; k < 3 && s.camp.pass < 3; k++) { s.npc[s.camp.covId].scan = Math.min(s.npc[s.camp.covId].scan, 1); fullScan(s.camp.covId); }
if (s.camp.step !== 'l2_talk') fail('passes ' + s.camp.pass);
cmd(K.CMD.HAIL, s.camp.covId); run(14, godmode);
log(`  wren: ${s.camp.f.wren} (${s.camp.f.wrenTone})`);
if (s.camp.ch !== 3) { run(8, godmode); if (s.camp.ch !== 3) fail('chapter 2 did not end'); }
// ---- ch3: Deep Hollow, the Drift, Vask
goSys('meridian'); at(s.npc[0], 4000); run(10, godmode);
if (s.camp.step !== 'l3_drift') fail('okafor');
goSys('drift'); at(s.npc[s.camp.vaskId], 4000); run(8, godmode);
if (route === 'ice') {
  if (s.camp.step !== 'l3_skarra') fail('not sent to skarra');
  const den = orbit('CINDER');
  cmd(K.CMD.HAIL, den); run(14, godmode);
} else if (route === 'wake') {
  s.P.cargo[G.R_ALLOY] = Math.max(s.P.cargo[G.R_ALLOY], 4); s.P.cargo[G.R_CELL] = Math.max(s.P.cargo[G.R_CELL], 1);
  cmd(K.CMD.HAIL, s.camp.vaskId); run(6, godmode); // hail again: the dialog reached PAY only after the cargo was there
} else {
  for (let k = 0; k < 40 && s.camp.step === 'l3_fight'; k++) { const v = s.npc[s.camp.vaskId]; if (v.alive) s.damageNpc(s.camp.vaskId, 25, K.SUB_HULL, K.US); run(1, godmode); }
}
log(`  vask: ${s.camp.f.vask}`);
if (s.camp.step !== 'l3_tow') fail('bay 1 not released');
at(s.npc[s.camp.modId], 1500); cmd(K.CMD.AUTOPILOT, 0); cmd(K.CMD.SHIELDS, 0); s.P.shieldRaise = 0; run(3, godmode);
cmd(K.CMD.EXTRACT, s.camp.modId); run(40, godmode);
if (s.camp.ch !== 4) { run(8, godmode); if (s.camp.ch !== 4) fail('bay 1 not recovered'); }
// ---- ch4: home, the lab, the cure, Haven's Rest
goSys('kalos'); at(cov(), 2000); run(4, godmode);
if (s.camp.step !== 'l4_lab') fail('bay 1 not delivered');
const h = s.P.arts.find((q) => G.ART[q.a].id === 'stasis');
if (!h) fail('no sample');
// science: two tests, then the class whose signature matches
for (const t of [0, 1]) { cmd(K.CMD.LAB, 1, h.uid, t); run(6, godmode); }
log(`  readings: ${h.read}`);
const L = LAB_ART.stasis, j = L.choices.findIndex((k) => (h.read || []).every((v, i) => !v || v === LAB_CLASSES[k].p[i]));
cmd(K.CMD.LAB, 2, h.uid, j); run(2, godmode);
if (s.camp.step !== 'l4_cure') fail('lab did not lead to the cure');
s.P.cargo[G.R_CRYSTAL] = Math.max(s.P.cargo[G.R_CRYSTAL], 2); s.P.cargo[G.R_PLASMA] = Math.max(s.P.cargo[G.R_PLASMA], 1);
cmd(K.CMD.HAIL, s.camp.covId); run(40, godmode);
log(`  cure ${s.camp.f.cure}, dest ${s.camp.f.dest}`);
if (s.camp.ch !== 5) { run(8, godmode); if (s.camp.ch !== 5) fail('chapter 4 did not end'); }
// ---- ch5: hold the watch
s.P.shieldsOn = true; s.P.shieldRaise = 1; cmd(K.CMD.SHRANGE, 50, 1); cmd(K.CMD.AUTOPILOT, K.AP_ESCORT, s.camp.covId);
for (let k = 0; k < 60 && s.game === K.GS_RUN; k++) {
  run(5, () => { godmode(); s.P.shieldsOn = true; for (let q = 0; q < 4; q++) s.P.shield[q] = Math.max(s.P.shield[q], 50); });
  for (const id of s.M.foes) if (s.npc[id].alive && s.missionT % 20 < 5) s.damageNpc(id, 30, K.SUB_HULL, K.US);
}
log(`  rev ${Math.round(s.camp.rev)} foes ${s.foesLeft()} ids ${s.M.foes.map((i) => s.npc[i].alive + '/' + s.npc[i].ai + '/' + s.npc[i].faction).join(' ')}`);
log(`  allies: ${[...(s.camp.allies || [])].join(', ')}  covenant hull ${Math.round(cov() ? cov().hull : 0)}`);
if (!s.camp.ending) fail('no ending');
log(`EPILOGUE ${s.camp.ending.title}: ${s.camp.ending.text}`);
console.log(s.game === K.GS_WON || s.camp.ending ? 'WON ' + route : 'LOST');
