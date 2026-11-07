// Campaign walkthrough: plays "IRON TIDE" (five chapters, Task Force 9 flying with the Aurora).
//   node tests/campaign5.mjs [route]
// routes: guardian (save Brand's crew, Raze allied, cover the Valiant, crack the carrier, free the 11,402,
//                   rewrite Directive One) - the default
//         iron     (stay with the convoy - the Heron is lost; no Raze; the Valiant rams the foundry;
//                   burn the foundry; finish WARDEN)
//         tide     (the Valiant tows the Heron; Raze for a pardon; cover the Valiant; override; shut WARDEN down)
// Wing orders are given with CMD.SQUAD, the way tactical gives them.
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng } from '../web/js/util.js';
import { SYS_INDEX, SYS_C } from '../web/js/galaxy.js';
import { ringJoins, RING_JOINS, ARCHIVES } from '../web/js/puzzles.js';
import { CAMPAIGNS } from '../web/js/campaign.js';
const route = process.argv[2] || 'guardian';
const REPORT_RE = /^i_(rep|lane|fleet)/;
const R = {
  guardian: { i_voss1: 'KESSARI', i_okon1: ['HOW DO WE', 'KEEP AN EYE'], i_pell: ['WHAT HAPPENED', 'FIND OUT', 'TASK FORCE 9'], i_brand2: 'HOLD ON', i_warden1: ['THE PEOPLE YOU TOOK', 'FAMILIES', 'COME FOR THEM'], i_rep3: ['ELEVEN THOUSAND', 'ONLY ONE VOICE', 'SEND US'], i_raze: ['FIGHT WITH US', 'PEOPLE BACK'], i_okon4: 'COVERING', i_warden2: 'OVERRIDE', i_warden3: ['REWRITE', 'WARDEN?', 'WELCOME'] },
  iron: { i_okon1: 'STAY IN FORMATION', i_pell: 'MAKE FOR', i_brand2: 'SORRY', i_warden1: ['STAND DOWN', 'CLOSE'], i_rep3: ['ONLY ONE VOICE', 'SEND US'], i_raze: 'STAY OUT', i_okon4: 'DO IT', i_warden2: ['DESTROY THE FOUNDRY', 'TACTICAL'], i_warden3: 'FINISH IT' },
  tide: { i_pell: 'MAKE FOR', i_brand2: 'VALIANT', i_warden1: ['WHAT ARE YOU', 'WHY ARE YOU', 'THE PEOPLE YOU', 'FAMILIES', 'COME FOR'], i_rep3: ['ELEVEN', 'ONLY ONE', 'SEND US'], i_raze: ['FIGHT WITH US', 'PARDON'], i_okon4: 'COVERING', i_warden2: 'OVERRIDE', i_warden3: 'SHUT DOWN' },
}[route];
const s = new Sim(makeRng(91));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
const ci = CAMPAIGNS.findIndex((c) => c.id === 'tide');
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN, ci); cmd(K.CMD.START);
if (!s.camp || s.camp.id !== 'tide') { console.log('WRONG CAMPAIGN', s.camp && s.camp.id); process.exit(1); }
let lastSeq = 0, lastStep = '', seenFleet = 0, answered = 0;
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const fail = (why) => { if (s.camp && s.camp.convoyIds) console.log('CONVOY', s.camp.convoyIds.map((id) => { const n = s.npc[id]; return `${n.short} a${+n.active} l${+n.alive} ai${n.ai} hp${Math.round(n.hull)} d${Math.round(Math.hypot(n.x - 30000, n.y - 128000))}`; }).join(' | '), 'tide', tide().map((id) => `${s.npc[id].short} ai${s.npc[id].ai} hp${Math.round(s.npc[id].hull)}`).join(','), 'wave', s.camp.waveN, s.camp.runT|0); console.log('FAIL', route, why, '| step', s.camp && s.camp.step, '|', s.M.objective); process.exit(1); };
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
  for (const i of which) { cmd(K.CMD.PUZ, 1, h.uid, i); run(0.2); log(`  READ: ${ARCHIVES.tide[i].title}${h.pz.open === i ? '' : ' (REFUSED)'}`); }
}
const tide = () => { const out = []; for (let i = 0; i < K.MAX_CONTACTS; i++) if (s.npc[i].tide && s.hostileAlive(i)) out.push(i); return out; };
// the wing does most of the killing in a real game; here we help it along, and give orders like tactical would
let orders = 0;
const fight = (n = 12) => () => { godmode(); const t = tide(); if (t.length) { if (s.P.target === K.NO_ID || !s.hostileAlive(s.P.target)) { s.P.target = t[0]; cmd(K.CMD.SQUAD, 1); orders++; } for (const id of t) s.damageNpc(id, n, K.SUB_HULL, K.US); } };
const wing = () => s.wingStatus();
run(5, godmode);
// ================================================= CHAPTER ONE
until(() => s.camp.step === 'i1_post', 40, 'no briefing');
log(`  wing: ${wing()}`);
if (s.wingIds().length !== 2) fail('task force 9 is not with us');
const M1 = s.M.mk[0]; atXY(M1.x + 3000, M1.y);
until(() => s.camp.step === 'i1_wave1', 40, 'no first wave');
until(() => s.camp.step === 'i1_core', 120, 'first wave not beaten', fight());
const hulk = s.npc.findIndex((n) => n.active && n.hulk);
fullScan(hulk); at(s.npc[hulk], 1200); shieldsDown(); cmd(K.CMD.EXTRACT, hulk);
until(() => s.camp.step === 'i1_wave2', 60, 'core not aboard', () => { godmode(); shieldsDown(); });
until(() => s.fleetCall, 160, 'second wave not beaten', fight());
log(`  wing after the picket: ${wing()}`);
report();
// ================================================= CHAPTER TWO (the core in the jammed lane)
hook = () => { const h = art('tidecore'); if (!h || !(s.P.jumping > 0)) return; if (!h.pz || h.pz.kind === 'cipher') solveCipher(h); if (h.pz.kind === 'archive' && !h.pz.done) readArchive(h, [0, 1, 2, 3, 4, 5]); };
jumpTo('kalos'); hook = null;
log(`  jump length (jammed + core): ${s.P.jumpLen}s, flags ${JSON.stringify(s.camp.f)}`);
if (!s.camp.f.warden || !s.camp.f.preserved) fail('core records not read');
until(() => s.camp.ch === 2 && s.camp.convoyIds, 20, 'chapter two did not start');
if (s.wingIds().length !== 2) fail('the wing did not jump with us');
at(s.npc[s.camp.convoyIds[0]], 4000);
until(() => s.camp.step === 'i2_escort', 40, 'Pell never spoke');
run(4, godmode);
if (s.camp.sqOrder !== 3) fail('wing not set to defend the convoy');
const keepConvoy = () => { for (const id of s.camp.convoyIds) { const n = s.npc[id]; if (n.convoy && n.alive && n.active) n.hull = Math.max(n.hull, 60); } };
until(() => s.camp.step === 'i2_heron' || s.camp.heronAsked || s.camp.f.heron !== 'up', 260, 'the Heron was never hit', () => { fight(14)(); keepConvoy(); const n = s.npc[s.camp.convoyIds[0]]; if (n.active) at(n, 2500); });
log(`  heron choice: ${s.camp.f.heron}`);
if (s.camp.step === 'i2_heron') { const h = s.wingOf('heron'); at(s.npc[h], 2000); shieldsDown(); until(() => s.camp.step === 'i2_escort', 30, 'Brand not beamed', () => { godmode(); shieldsDown(); }); }
until(() => s.fleetCall, 400, 'convoy never arrived', () => { fight(14)(); if (s.camp.f.heron !== 'crew' || s.camp.t > 30) keepConvoy(); const a = s.camp.convoyIds.find((id) => s.camp.cst && s.camp.cst[id] === 'go'); if (a !== undefined) at(s.npc[a], 2500); });
log(`  convoy ${s.camp.f.convoy}; wing ${wing()}`);
report();
// ================================================= CHAPTER THREE
jumpTo('halcyon');
until(() => s.camp.ch === 3 && s.camp.convIds, 20, 'chapter three did not start');
at(s.npc[0], 5000);
until(() => s.camp.wardenAsked, 160, 'converters not destroyed', () => { godmode(); kill(s.camp.convIds.slice(0, 1 + ((s.camp.t / 6) | 0))); fight(14)(); });
log(`  array ${s.camp.f.array} at ${Math.round(s.camp.conv)}%`);
until(() => s.camp.step === 'i3_tune', 60, 'WARDEN never spoke');
solveTune(art('wardensong'));
report();
// ================================================= CHAPTER FOUR
jumpTo('orra'); jumpTo('shroud');
until(() => s.camp.ch === 4 && s.camp.foundryId !== undefined, 20, 'chapter four did not start');
until(() => s.camp.step === 'i4_go', 40, 'Raze never hailed');
log(`  raze ${s.camp.f.raze}`);
at(s.npc[s.camp.foundryId], 12000);
until(() => s.camp.step === 'i4_hail' || s.camp.step === 'i4_cover', 200, 'assault stalled', fight(16));
if (s.camp.step === 'i4_cover') { const v = s.wingOf('valiant'); until(() => s.camp.step !== 'i4_cover', 120, 'Valiant cover failed', () => { fight(16)(); const n = s.npc[s.wingOf('valiant')]; if (n) at(n, 2000); }); void v; }
until(() => s.camp.step === 'i4_hail', 160, 'foundry never opened', () => { fight(16)(); });
log(`  valiant ${s.camp.f.valiant}; wing ${wing()}`);
at(s.npc[s.camp.foundryId], 6000);
until(() => s.camp.f.crews, 60, 'no decision at the foundry', godmode);
if (s.camp.step === 'i4_burn') until(() => s.fleetCall || s.camp.step === 'i4_report', 120, 'foundry not destroyed', () => { godmode(); s.damageNpc(s.camp.foundryId, 40, K.SUB_HULL, K.US); });
log(`  crews ${s.camp.f.crews}`);
report();
// ================================================= CHAPTER FIVE
jumpTo('meridian'); jumpTo('kalos');
until(() => s.camp.ch === 5 && s.camp.sieged, 20, 'chapter five did not start');
at(s.npc[0], 4000);
until(() => s.camp.step === 'i5_carrier', 300, 'waves not held', () => { fight(16)(); s.npc[0].hull = Math.max(s.npc[0].hull, 50); });
log(`  carrier! wing ${wing()}, allies ${[...(s.camp.allies || [])].join(',')}`);
until(() => s.game !== K.GS_RUN, 200, 'no ending', () => { godmode(); s.npc[0].hull = Math.max(s.npc[0].hull, 50); const cr = s.npc[s.camp.carrierId]; if (cr.alive && cr.faction === K.F_HOSTILE) s.damageNpc(s.camp.carrierId, 10, K.SUB_HULL, K.US); for (const id of tide()) if (id !== s.camp.carrierId) s.damageNpc(id, 20, K.SUB_HULL, K.US); });
const e = s.camp.ending;
if (!e) fail('no ending');
console.log(`${s.game === K.GS_WIN ? 'GAME WON' : 'GAME OVER'} ENDING ${e.title} | ALLIES ${e.allies.join(', ') || '-'} | REPORTS ${seenFleet} | HAILS ANSWERED ${answered} | WING ORDERS ${orders}`);
console.log(e.text);
console.log('FLAGS', JSON.stringify(s.camp.f));
const expect = { guardian: 'THE WARDEN', iron: 'IRON AND ASH', tide: 'THE TIDE GOES OUT' }[route];
if (e.title !== expect) fail(`expected ${expect}`);
console.log('OK', route);
