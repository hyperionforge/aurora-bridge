// Campaign walkthrough: plays "THRESHOLD" (cold open + five acts) against the simulation.
//   node tests/campaign4.mjs [route]
// routes: home   (save Rook's crew, buy the shard, Ithel ally, Marrin gives the probe, defy Dace, keep the buoy,
//                 the Keeper opens the door, Castellan stands down, the truth goes public) - the default
//         scar   (Rook lost, force the harvesters, Ithel warned, defy Dace, destroy the buoy (relay), fight Dace,
//                 Keeper agrees but the Lodestar forces her way out)
//         sealed (the Keeper is told to close the wall; Castellan is told goodbye)
//         crown  (hand Dace the crystal, destroy the buoy, join him at the lighthouse)
// Every puzzle is solved with the same CMD.PUZ commands the science station sends.
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng, distTo, bearingTo } from '../web/js/util.js';
import { SYS_INDEX, SYS_C, sysAt } from '../web/js/galaxy.js';
import { ringJoins, RING_JOINS, tuneCoherence, ARCHIVES } from '../web/js/puzzles.js';
import { CAMPAIGNS } from '../web/js/campaign.js';
const route = process.argv[2] || 'home';
const R = {
  home: { t_rook0: 'BEAM', t_orel: 'BUY', t_ithel: 'CUTTING HAS TO STOP', t_marrin2: ['A LANGUAGE', 'GIVE IT'], t_dace2: 'EVIDENCE', t_neve3: ['TWENTY-TWO', 'STOP FIRING'], t_dace3: 'NO.', t_keeper: ['TRAPPED', 'SHIP', 'GUILD', 'TELL THEM'], t_dace4: 'NEVER', t_dace4b: 'ARREST', t_neve5: 'KEEPER WILL OPEN', t_final: ['WELCOME', 'SHOULD KNOW'] },
  scar: { t_rook0: 'WHAT ATTACKED', t_orel: ['SHARD IN ITS CORE', 'FLEET BUSINESS'], t_ithel: 'FLEET COMMAND WILL HEAR', t_marrin2: ['A LANGUAGE', 'GIVE IT'], t_dace2: 'EVIDENCE', t_neve3: ['TEARING', 'HOLD YOUR FIRE'], t_dace3: 'DESTROY', t_keeper: ['TRAPPED', 'SHIP', 'ONLY BURN', 'TELL THEM'], t_dace4: 'NEVER', t_dace4b: 'GET OUT', t_neve5: 'FIRE EVERYTHING', t_final: ['WELCOME', 'SAFER'] },
  sealed: { t_rook0: 'BEAM', t_orel: ['SHARD IN ITS CORE', 'FAVOUR'], t_ithel: 'CUTTING HAS TO STOP', t_marrin2: ['A LANGUAGE', 'FOLLOW'], t_dace2: 'UNDERSTOOD', t_neve3: ['TWENTY-TWO', 'STOP FIRING'], t_dace3: 'NO.', t_keeper: ['WHAT ARE YOU', 'TRAPPED', 'CLOSE IT', 'DO IT'], t_dace4: 'NEVER', t_dace4b: 'ARREST', t_neve5: ['SORRY', 'GOODBYE'] },
  crown: { t_rook0: 'BEAM', t_orel: 'BUY', t_ithel: 'CUTTING HAS TO STOP', t_marrin2: ['A LANGUAGE', 'GIVE IT'], t_dace2: 'TAKE IT', t_neve3: ['TWENTY-TWO', 'STOP FIRING'], t_dace3: 'DESTROY', t_keeper: ['TRAPPED', 'SHIP', 'GUILD', 'TELL THEM'], t_dace4: ['WHAT HAPPENS', 'DO IT'] },
}[route];
const s = new Sim(makeRng(77));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
const ci = CAMPAIGNS.findIndex((c) => c.id === 'threshold');
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, ci); cmd(K.CMD.START);
if (!s.camp || s.camp.id !== 'threshold') { console.log('WRONG CAMPAIGN', s.camp && s.camp.id); process.exit(1); }
let lastSeq = 0, lastStep = '', seenFleet = 0, answered = 0;
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const fail = (why) => { console.log('FAIL', route, why, '| step', s.camp && s.camp.step, '|', s.M.objective); process.exit(1); };
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
    if (idx < 0 && /^t_(rep|brief)/.test(key)) { idx = vis.findIndex((t) => !/^(ACKNOWLEDGED|THAT'S EVERYTHING|WHAT ARE OUR ORDERS)/.test(t)); if (idx < 0) idx = vis.findIndex((t) => /^WHAT ARE OUR ORDERS/.test(t)); if (idx < 0) idx = 0; }
    if (key === 't_buoy') idx = c.codeTry++ === 0 ? vis.findIndex((t) => t.includes('ALDER-NINE-SEVEN')) : vis.findIndex((t) => t.includes('ALDER-SEVEN-NINE'));
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
  for (const i of which) { cmd(K.CMD.PUZ, 1, h.uid, i); run(0.2); log(`  READ: ${ARCHIVES.threshold[i].title}${h.pz.open === i ? '' : ' (REFUSED)'}`); }
}
run(5, godmode);
// ================================================= COLD OPEN
until(() => s.camp.step === 't0_mouth', 30, 'no briefing');
const [mx, my] = (() => { const m = s.M.mk[0]; return [m.x, m.y]; })();
atXY(mx - 6000, my + 1000);
until(() => s.camp.step === 't0_solace', 30, 'the Solace never came');
const sol = s.npc[s.camp.solId];
if (route !== 'scar') { at(sol, 2500); shieldsDown(); }
until(() => s.camp.step === 't0_rec', 200, 'the Solace never broke up', () => { godmode(); for (const id of s.camp.wraiths || []) if (s.npc[id].alive && route !== 'scar') s.damageNpc(id, 30, K.SUB_HULL, K.US); });
log(`  rook: ${s.camp.f.rook}`);
const rec = s.npc[s.camp.recId];
at(rec, 1200); shieldsDown(); kill(s.camp.wraiths);
cmd(K.CMD.EXTRACT, s.camp.recId);
until(() => s.camp.step === 't0_tune', 60, 'recorder not aboard', () => { godmode(); shieldsDown(); });
solveTune(art('recorder2'));
report();
if (!s.camp.f.fray) fail('the lanes did not fray');
// ================================================= ACT ONE
jumpTo('velanar');
log(`  jump length ${s.P.jumpLen}s; asked in the briefing: ${(s.camp.asked || []).join(',')}`);
until(() => s.camp.ch === 2 && s.camp.anchorId !== undefined, 20, 'act one did not start');
const anc = s.npc[s.camp.anchorId];
at(anc, 3000); fullScan(s.camp.anchorId);
if (route === 'home' || route === 'crown') s.P.cargo[G.R_CRYSTAL] = 3;
until(() => s.camp.step === 't1_core', 40, 'Orel never settled');
at(anc, 1200); shieldsDown(); cmd(K.CMD.EXTRACT, s.camp.anchorId);
until(() => s.camp.step === 't1_wraiths', 60, 'no shard', () => { godmode(); shieldsDown(); });
until(() => s.camp.wraithsOut && (s.camp.wraiths || []).length, 10, 'no wraiths');
kill(s.camp.wraiths);
until(() => s.camp.step === 't1_ithel', 20, 'wraiths not cleared', () => { godmode(); kill(s.camp.wraiths); });
at(s.npc[0], 6000);
until(() => s.camp.f.ithel, 40, 'Ithel never spoke');
report();
// ================================================= ACT TWO (the shard's rings in the lane)
hook = () => { const h = art('anchorshard'); if (h && s.P.jumping > 0 && !(h.pz && h.pz.done)) solveRings(h); };
jumpTo('halcyon'); hook = null;
log(`  jump length with the shard aboard: ${s.P.jumpLen}s`);
at(s.npc[0], 6000);
until(() => s.camp.step === 't2_defend', 80, 'Marrin / Dace did not play out');
log(`  marrin ${s.camp.f.marrin}, dace ${s.camp.f.dace}`);
until(() => (s.camp.wraiths || []).length, 15, 'no wraiths at the array');
until(() => s.camp.step === 't2_report' || s.fleetCall, 60, 'array not defended', () => { godmode(); kill(s.camp.wraiths); });
if (!art('datacrystal')) fail('no data crystal');
report();
// ================================================= ACT THREE (the crystal in the lane)
hook = () => {
  const h = art('datacrystal');
  if (!h || !(s.P.jumping > 0)) return;
  if (!h.pz || h.pz.kind === 'cipher') solveCipher(h);
  if (h.pz.kind === 'archive' && !h.pz.done) readArchive(h, [0, 1, 2, 5, 3, 4]);
};
jumpTo('orra'); jumpTo('shroud'); hook = null;
if (!s.camp.f.fix || !s.camp.f.code || !s.camp.f.memo) fail('crystal records not read ' + JSON.stringify(s.camp.f));
until(() => s.camp.ch === 4 && s.camp.buoyId !== undefined, 20, 'act three did not start');
s.camp.codeTry = 0;
at(s.npc[s.camp.buoyId], 5000);
until(() => s.camp.step === 't3_hail', 20, 'buoy not found');
cmd(K.CMD.HAIL, s.camp.buoyId);
until(() => s.camp.f.neve, 60, 'no contact with the Lodestar');
until(() => s.camp.step === 't3_fight' || s.camp.step === 't3_report' || s.fleetCall, 40, 'Dace never came');
if (s.camp.step === 't3_fight') until(() => s.camp.step !== 't3_fight', 120, 'Dace fight did not end', () => { godmode(); const d = s.npc[s.camp.daceId]; if (d.alive && d.hull > 25) s.damageNpc(s.camp.daceId, 8, K.SUB_HULL, K.US); for (const id of s.camp.daceIds) if (id !== s.camp.daceId) kill([id]); });
log(`  buoy ${s.camp.f.buoy}`);
report();
// ================================================= ACT FOUR
jumpTo('cerulean');
until(() => s.camp.ch === 5 && s.camp.lightId !== undefined, 20, 'act four did not start');
at(s.npc[s.camp.lightId], 8000);
until(() => s.camp.step === 't4_tune', 20, 'no carrier');
solveTune(art('carrier'));
until(() => s.camp.f.keeper, 60, 'the Keeper never spoke');
if (route === 'crown') { until(() => s.game !== K.GS_RUN, 60, 'no crown ending'); }
else {
  until(() => s.camp.step === 't4_fight', 40, 'Dace never came to the lighthouse');
  until(() => s.fleetCall, 160, 'lighthouse fight did not end', () => { godmode(); const L = s.npc[s.camp.lightId]; L.hull = 100; const d = s.npc[s.camp.daceId]; if (d.alive && d.hull > 25 && d.faction === K.F_HOSTILE) s.damageNpc(s.camp.daceId, 8, K.SUB_HULL, K.US); for (const id of s.camp.daceIds) if (id !== s.camp.daceId) kill([id]); });
  report();
  // ================================================= ACT FIVE
  jumpTo('shroud');
  until(() => s.camp.ch === 6, 20, 'act five did not start');
  at(s.npc[s.camp.buoyId], 4000);
  until(() => s.camp.f.plan, 40, 'Castellan never answered');
  if (s.camp.f.plan !== 'seal') {
    const D = s.M.mk[0]; atXY(D.x + 2000, D.y);
    until(() => s.camp.step === 't5_escort', 200, 'the door never opened', () => { godmode(); kill(s.camp.wraiths); });
    until(() => s.game !== K.GS_RUN, 60, 'no ending', () => { godmode(); kill(s.camp.wraiths); const L = s.npc[s.camp.lodeId]; if (L && L.alive) L.hull = Math.max(L.hull, 30); });
  } else until(() => s.game !== K.GS_RUN, 20, 'no ending');
}
const e = s.camp.ending;
if (!e) fail('no ending');
console.log(`${s.game === K.GS_WIN ? 'GAME WON' : 'GAME OVER'} ENDING ${e.title} | ALLIES ${e.allies.join(', ') || '-'} | REPORTS ${seenFleet} | HAILS ANSWERED ${answered}`);
console.log(e.text);
console.log('FLAGS', JSON.stringify(s.camp.f));
const expect = { home: 'THE LODESTAR COMES HOME', scar: 'SCAR TISSUE', sealed: 'THE QUIET', crown: 'THE CROWN OF ROADS' }[route];
if (e.title !== expect) fail(`expected ${expect}`);
console.log('OK', route);
