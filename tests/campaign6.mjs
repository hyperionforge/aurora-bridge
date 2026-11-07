// Campaign walkthrough: plays "RECURRENCE" (teaser + four parts: the loop, the other Aurora, the Spindle).
//   node tests/campaign6.mjs [route]
// routes: restore   (loop broken with the echo's message, save the other Aurora, temporal shielding at Halcyon,
//                    warn Senna, defend Tel, let the Spindle undo its erasures) - the default
//         sacrifice (no shielding at Halcyon - the Array is erased; fire on Tel at Orra - Tel-Ashar is erased;
//                    the other Aurora takes the Spindle into the fold)
//         destroyed (the other Aurora dies; shielding; threaten Tel and break him; destroy the Spindle at the fold)
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng } from '../web/js/util.js';
import { SYS_INDEX, SYS_C } from '../web/js/galaxy.js';
import { ringJoins, RING_JOINS, ARCHIVES } from '../web/js/puzzles.js';
import { CAMPAIGNS } from '../web/js/campaign.js';
const route = process.argv[2] || 'restore';
const REPORT_RE = /^r_(rep|lane|fleet|voss)/;
const R = {
  restore: { r_noor1: ['THE LOOP', 'STABILISE'], r_lane2: 'CREW', r_tel3: ['WHY THE ARRAY', 'DONE WHAT', 'STAND DOWN', 'TACTICAL'], r_senna: 'TEL-ASHAR', r_tel4: ['LOGS', 'TALK TO US', 'NOBODY'], r_tel5: ['UNDO', 'HOLD THEM'] },
  sacrifice: { r_noor1: ['NOT POSSIBLE', 'STABILISE'], r_lane2: 'WORTH', r_tel3: ['STAND DOWN', 'TACTICAL'], r_senna: 'HANDLE', r_tel4: ['SURRENDER', 'TACTICAL'], r_tel5: ['OTHER ONE', 'GOODBYE'] },
  destroyed: { r_noor1: ['WHAT HAPPENED', 'BEAM YOU'], r_tel3: ['STAND DOWN', 'TACTICAL'], r_senna: 'TEL-ASHAR', r_tel4: ['SURRENDER', 'TACTICAL'], r_tel5: 'NOT TODAY' },
}[route];
const s = new Sim(makeRng(23));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
const ci = CAMPAIGNS.findIndex((c) => c.id === 'loop');
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, ci); cmd(K.CMD.START);
if (!s.camp || s.camp.id !== 'loop') { console.log('WRONG CAMPAIGN', s.camp && s.camp.id); process.exit(1); }
let lastSeq = 0, lastStep = '', seenFleet = 0, answered = 0;
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const fail = (why) => { if (false) console.log('CONVOY', s.camp.convoyIds.map((id) => { const n = s.npc[id]; return `${n.short} a${+n.active} l${+n.alive} ai${n.ai} hp${Math.round(n.hull)} d${Math.round(Math.hypot(n.x - 30000, n.y - 128000))}`; }).join(' | '), 'tide', tide().map((id) => `${s.npc[id].short} ai${s.npc[id].ai} hp${Math.round(s.npc[id].hull)}`).join(','), 'wave', s.camp.waveN, s.camp.runT|0); console.log('FAIL', route, why, '| step', s.camp && s.camp.step, '|', s.M.objective); process.exit(1); };
const godmode = () => { s.P.hull = 100; s.P.energy = 1000; for (let i = 0; i < 6; i++) s.P.health[i] = 100; };
const picks = {};
function tick() {
  const c = s.camp;
  // an incoming hail: COMMS answers it on screen (and checks the main viewer switched)
  if (s.dlg && s.dlg.pending) { const seq = s.dlg.seq; cmd(K.CMD.ANSWER, seq, 1); answered++; if (s.view !== K.VM_COMMS) fail('answered on screen but the viewer is not on COMMS'); }
  if (c && c.step !== lastStep) { lastStep = c.step; log('STEP ' + c.step + ' :: ' + s.M.objective.slice(0, 150)); }
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.id !== lastSeq && m0.dopt.length) {
    lastSeq = m0.id;
    const vis = s.dlg.vis.map((o) => o.t), key = s.dlg.key;
    let want = R[key];
    if (Array.isArray(want)) { const n = picks[key] || 0; want = want.slice(n).find((w) => vis.some((t) => t.includes(w))); }
    let idx = want ? vis.findIndex((t) => t.includes(want)) : -1;
    if (idx >= 0 && Array.isArray(R[key])) picks[key] = R[key].indexOf(want) + 1;
    // reports and briefings: ask every question first, then acknowledge
    if (idx < 0 && REPORT_RE.test(key)) { idx = vis.findIndex((t) => !/^(ACKNOWLEDGED|THAT'S EVERYTHING|WHAT ARE OUR ORDERS)/.test(t)); if (idx < 0) idx = vis.findIndex((t) => /^WHAT ARE OUR ORDERS/.test(t)); if (idx < 0) idx = 0; }
        if (idx < 0) idx = 0;
    log(`  ${key}/${s.dlg.node} (${s.dlg.who}) "${m0.text.slice(0, 64)}..." -> ${vis[idx]}`);
    cmd(K.CMD.DREPLY, s.dlg.seq, idx);
  }
}
const run = (sec, hook) => { for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN; i++) { s.tick(0.05); s.events.length = 0; if (hook) hook(); tick(); } };
const until = (fn, sec, why, hook = godmode) => { for (let i = 0; i < sec / 0.5 && !fn(); i++) run(0.5, hook); if (!fn()) fail(why); };
const atXY = (x, y) => { s.P.dock = 0; s.P.x = x; s.P.y = y; s.P.speed = 0; s.P.throttle = 0; s.P.vx = s.P.vy = 0; s.P.autopilot = 0; };
const at = (n, dx = 1500) => { if (n) atXY(n.x + dx, n.y); };
const fullScan = (id) => { for (let k = 0; k < 2 && s.npc[id].scan < 2; k++) { s.P.scanId = id; s.P.scanProg = 0.99; run(1, godmode); } };
const shieldsDown = () => { cmd(K.CMD.SHIELDS, 0); s.P.shieldRaise = 0; s.P.shieldsOn = false; };
const kill = (ids) => { for (const id of ids || []) { const n = s.npc[id]; if (n.active && n.alive) s.damageNpc(id, 999, K.SUB_HULL, K.US); } };
const report = () => { until(() => s.fleetCall, 60, 'no report requested'); seenFleet++; cmd(K.CMD.HAIL, K.FROM_COMMAND); run(2, godmode); until(() => !s.fleetCall && !s.dlg, 40, 'report not finished'); };
const art = (id) => s.P.arts.find((h) => G.ART[h.a].id === id);
function jumpTo(id) {
  const to = SYS_INDEX[id], v = s.jumpVector(to);
  const a = (v - 90) * Math.PI / 180;
  atXY(SYS_C + Math.cos(a) * 50000, SYS_C + Math.sin(a) * 50000); s.P.hdg = s.P.desHdg = v; s.P.evasive = false;
  cmd(K.CMD.PLOT, 0, to); cmd(K.CMD.JUMP, to);
  if (s.P.jumpTo !== to) fail('jump refused: ' + s.jumpBlock(to));
  for (let i = 0; i < 800 && s.sysIdx !== to; i++) { run(0.5, godmode); hook && hook(); }
  if (s.sysIdx !== to) fail('never arrived at ' + id);
}
let hook = null;
// ---- puzzles, solved through the science station's commands
function solveTune(h) {
  cmd(K.CMD.PUZ, 0, h.uid);
  for (let i = 0; i < 3; i++) { cmd(K.CMD.PUZ, 1, h.uid, i); for (let k = 0; k < 14 && h.pz && !h.pz.done && h.pz.kind === 'tune' && h.pz.v[i] !== h.pz.t[i]; k++) cmd(K.CMD.PUZ, 2, h.uid, h.pz.v[i] < h.pz.t[i] ? 1 : -1); }
  if (!h.pz.done) fail('tune unsolved ' + JSON.stringify(h.pz));
  log(`  TUNE solved: ${G.ART[h.a].name}`);
}
function solveRings(h) {
  cmd(K.CMD.PUZ, 0, h.uid);
  const start = h.pz.rot.join('');
  for (let i = 0; i < 3 && !h.pz.done; i++) { cmd(K.CMD.PUZ, 1, h.uid, i); for (let k = 0; k < 8 && !h.pz.done && h.pz.rot[i] !== 0; k++) cmd(K.CMD.PUZ, 2, h.uid, -1); }
  if (!h.pz.done) fail('rings unsolved ' + JSON.stringify(h.pz));
  log(`  RINGS solved from ${start} in ${h.pz.moves} moves (joins ${ringJoins([0, 0, 0])}/${RING_JOINS})`);
}
function solveCipher(h) {
  cmd(K.CMD.PUZ, 0, h.uid);
  const key = s.pzSecret[h.uid];
  // one honest wrong guess first, to check the feedback
  const wrong = [...key].reverse();
  for (const g of wrong) cmd(K.CMD.PUZ, 1, h.uid, g);
  cmd(K.CMD.PUZ, 3, h.uid);
  const t = h.pz.tries[0];
  if (!t || t.hit + t.near !== 4) fail('cipher feedback wrong ' + JSON.stringify(t));
  for (const g of key) cmd(K.CMD.PUZ, 1, h.uid, g);
  cmd(K.CMD.PUZ, 3, h.uid);
  if (h.pz.kind !== 'archive') fail('cipher did not open the archive');
  log(`  CIPHER opened (wrong try scored ${t.hit} right / ${t.near} misplaced)`);
}
function readArchive(h, which) {
  for (const i of which) { cmd(K.CMD.PUZ, 1, h.uid, i); run(0.2); log(`  READ: ${ARCHIVES.recurrence[i].title}${h.pz.open === i ? '' : ' (REFUSED)'}`); }
}
const spin = () => s.npc[s.camp.spinId];
run(5, godmode);
// ================================================= TEASER: the loop
until(() => s.camp.step === 'r0_go', 40, 'no briefing');
atXY(98000, 72000);
fullScan(s.camp.foldId);
until(() => s.camp.step === 'r0_loop', 30, 'fold scan did not start the loop');
// loop one: shields up, like any sensible crew
cmd(K.CMD.SHIELDS, 1);
until(() => s.camp.loop >= 1, 80, 'the first loop never reset', () => { godmode(); cmd(K.CMD.SHIELDS, 1); });
log(`  loop ${s.camp.loop}: ${s.P.x},${s.P.y} hull ${s.P.hull}`);
until(() => art('echo'), 20, 'no echo after the first loop');
if (route !== 'destroyed') { solveTune(art('echo')); run(12, godmode); }
// loop two: (the destroyed route ignores the echo once more and loses again)
if (route === 'destroyed') { cmd(K.CMD.SHIELDS, 1); until(() => s.camp.loop >= 2, 80, 'the second loop never reset', () => { godmode(); cmd(K.CMD.SHIELDS, 1); }); solveTune(art('echo')); }
// heeding the message: shields down, all stop
until(() => s.camp.loopDone, 80, 'the loop never broke', () => { godmode(); shieldsDown(); cmd(K.CMD.STOP); });
log(`  loop broken after ${s.camp.f.looped} resets`);
if (route !== 'destroyed') s.P.cargo[G.R_PLASMA] = 3;
until(() => s.camp.ch === 2, 20, 'part one never started');
until(() => s.camp.step === 'r1_beam', 40, 'Haskell never spoke');
at(s.npc[s.camp.otherId], 3000); shieldsDown();
until(() => s.camp.f.noor === 'aboard', 30, 'Haskell not beamed', () => { godmode(); shieldsDown(); });
log(`  other Aurora: ${s.camp.f.other || 'lost'}`);
hook = () => { const h = art('futurelog'); if (!h || !(s.P.jumping > 0) || h.pz && h.pz.done) return; if (!h.pz || h.pz.kind === 'cipher') solveCipher(h); if (h.pz.kind === 'archive') readArchive(h, [0, 1, 2, 3, 4, 5]); };
const h0 = art('futurelog'); solveCipher(h0); readArchive(h0, [0, 1, 2, 3, 4]);
report();
// ================================================= PART TWO: Halcyon
jumpTo('orra'); jumpTo('halcyon'); hook = null;
until(() => s.camp.ch === 3 && s.camp.spinId !== undefined, 20, 'part two did not start');
at(s.npc[0], 8000);
until(() => s.camp.step === 'r2_fight', 60, 'Tel never spoke');
if (route !== 'sacrifice') solveTune(art('chroniton'));
until(() => s.camp.step === 'r2_report' || s.fleetCall, 160, 'Halcyon did not resolve', () => { godmode(); const n = spin(); if (n && n.alive && n.faction === K.F_HOSTILE) s.damageNpc(s.camp.spinId, 6, K.SUB_HULL, K.US); });
log(`  array ${s.camp.f.array}, rewinds ${s.camp.rewinds}; comms log mentions Marrin: ${s.msgs.some((m) => m.who === 'marrin')}`);
report();
// ================================================= PART THREE: Orra
jumpTo('orra');
until(() => s.camp.ch === 4 && s.camp.spinId !== undefined, 20, 'part three did not start');
until(() => s.camp.step === 'r3_find', 40, 'Senna never hailed');
at(spin(), 6000);
until(() => s.camp.step === 'r3_defend' || s.camp.step === 'r3_fight', 40, 'Tel never spoke at Orra');
if (route === 'sacrifice' && !s.camp.f.tshield) { /* fire without shielding: it rewinds over the colony */ }
until(() => s.fleetCall || s.camp.step === 'r3_report', 200, 'Orra did not resolve', () => {
  godmode();
  const n = spin();
  if (s.camp.step === 'r3_fight' && n && n.alive && n.faction === K.F_HOSTILE) s.damageNpc(s.camp.spinId, 6, K.SUB_HULL, K.US);
  if (route === 'sacrifice' && s.camp.f.asharFate === 'lost' && !s.camp.f.tshield) solveTune(art('chroniton'));
  if (s.camp.step === 'r3_defend') { n.hull = Math.max(n.hull, 60); kill((s.camp.zeal || []).filter((id) => s.hostileAlive(id))); }
});
log(`  tel ${s.camp.f.tel}, Tel-Ashar ${s.camp.f.asharFate}`);
report();
// ================================================= PART FOUR: the fold
jumpTo('cerulean');
until(() => s.camp.ch === 5 && s.camp.spinId !== undefined, 20, 'part four did not start');
at(spin(), 5000);
until(() => s.camp.f.plan || s.camp.step === 'r4_fight', 40, 'Tel never spoke at the fold');
until(() => s.game !== K.GS_RUN, 200, 'no ending', () => { godmode(); kill((s.camp.zeal || []).filter((id) => s.hostileAlive(id))); const n = spin(); if (n && n.alive) { if (s.camp.step === 'r4_fight' && n.faction === K.F_HOSTILE) s.damageNpc(s.camp.spinId, 6, K.SUB_HULL, K.US); else n.hull = Math.max(n.hull, 60); } });
const e = s.camp.ending;
if (!e) fail('no ending');
console.log(`${s.game === K.GS_WIN ? 'GAME WON' : 'GAME OVER'} ENDING ${e.title} | REPORTS ${seenFleet} | HAILS ANSWERED ${answered} | LOOPS ${s.camp.f.looped}`);
console.log(e.text);
console.log('FLAGS', JSON.stringify(s.camp.f));
const expect = { restore: 'EVERYTHING THAT WAS', sacrifice: 'THE OTHER AURORA', destroyed: 'THE THREAD IS CUT' }[route];
if (e.title !== expect) fail(`expected ${expect}`);
console.log('OK', route);
