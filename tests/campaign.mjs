// Campaign walkthrough: plays "ECHOES OF THE CHORUS" start to finish against the
// simulation, answering each conversation as told and cheating through the fights.
//   node tests/campaign.mjs '{"c_ressh2":"GO HOME","c_chorus5":"FREE", ...}'
// (dialogue key -> part of the reply to pick; anything not listed takes the first reply)
import * as K from '../web/js/config.js';
import * as G from '../web/js/cargo.js';
import { Sim } from '../web/js/sim.js';
import { makeRng } from '../web/js/util.js';
import { SYS_INDEX } from '../web/js/galaxy.js';
const pick = JSON.parse(process.argv[2] || '{"c_okafor1":"SEAM","c_silk1":"AGREED","c_hunter":"FLEET PROTECTION","c_ressh2":"GO HOME","c_korvath4":"WHY","c_draal2":"GO HOME","c_chorus5":"FREE","array":"CLOSE","mayday":"COMING"}'); // dialog key -> option label substring
const s = new Sim(makeRng(21)); s.autoAnswer = true; // hails open at once (no COMMS player to answer)
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, 0, 1, K.MODE_CAMPAIGN); cmd(K.CMD.START);
let lastSeq = 0, lastStep = '';
const log = (t) => console.log(`[${(s.missionT | 0).toString().padStart(4)} ${s.sysDef.name.padEnd(16)}] ${t}`);
const run = (sec, hook) => { for (let i = 0; i < sec / 0.05 && s.game === K.GS_RUN; i++) { s.tick(0.05); s.events.length = 0; if (hook) hook(); tick(); } };
function tick() {
  const c = s.camp;
  if (c && c.step !== lastStep) { lastStep = c.step; log('STEP ' + c.step + ' :: ' + s.M.objective); }
  const m0 = s.dlg && s.msgs.find((q) => q.dseq === s.dlg.seq);
  if (s.dlg && m0 && m0.id !== lastSeq) {
    lastSeq = m0.id;
    const m = m0;
    const want = pick[s.dlg.key];
    let idx = 0;
    if (want) { const j = s.dlg.vis.findIndex((o) => o.t.includes(want)); if (j >= 0) idx = j; }
    if (s.dlg.key === 'c_vault') idx = [2, 1, 6][s.dlg.node === 'start' ? 0 : s.dlg.node === 't2' ? 1 : 2] ?? 0;
    log(`  ${s.dlg.key}/${s.dlg.node} "${m.text.slice(0, 60)}..." -> ${s.dlg.vis[idx].t}`);
    const seq = s.dlg.seq; cmd(K.CMD.DREPLY, seq, idx);
  }
}
const goSys = (id) => { if (s.game !== K.GS_RUN) return; s.P.dock = 0; s.arrive(SYS_INDEX[id]); run(1); };
const at = (n, dx = 1500) => { if (s.game !== K.GS_RUN || !n) return; s.P.x = n.x + dx; s.P.y = n.y; s.P.speed = 0; s.P.throttle = 0; s.P.vx = s.P.vy = 0; };
const godmode = () => { s.P.hull = 100; s.P.energy = 1000; for (let i = 0; i < 6; i++) s.P.health[i] = 100; };
const killHostiles = (frac = 0.2) => { for (let i = 0; i < 32; i++) if (s.hostileAlive(i) && s.npc[i].type !== 0) s.npc[i].hull = Math.min(s.npc[i].hull, 100 * frac); };
run(4);
goSys('meridian'); at(s.npc[0], 6000); run(3);
const seam = s.npc[s.camp.seamId]; at(seam, 1500); seam.scan = 2; s.P.shieldsOn = false; s.P.shieldRaise = 0;
cmd(K.CMD.EXTRACT, s.camp.seamId); run(25, godmode);
run(10, godmode);
// Ressh: weaken him so he yields, finish the others
run(3, () => { godmode(); for (const id of s.camp.resshIds || []) { const n = s.npc[id]; if (n.active && n.alive && n.faction === K.F_HOSTILE) n.hull = id === s.camp.resshId ? 30 : 0.1; } });
run(8, godmode);
if (s.job) { const n = s.npc[s.job.ids[0]]; if (n) { at(n, 3000); run(3, godmode); s.job.repairT = 0.1; run(2, godmode); } }
goSys('halcyon'); at(s.npc[0], 8000); run(4, godmode);
// chapter 2
goSys('velanar'); at(s.npc[0], 8000); run(4, godmode);
cmd(K.CMD.HAIL, s.camp.silkId); run(2, godmode);
run(16, godmode);
run(20, () => { godmode(); killHostiles(0.2); });
run(6, godmode);
// chapter 3
goSys('shroud'); at(s.npc[s.camp.tallisId], 3000); run(3, godmode);
for (const id of s.camp.podIds) { s.npc[id].scan = 1; s.P.scanId = id; s.P.scanProg = 0.99; run(1); s.P.scanId = id; s.P.scanProg = 0.99; run(1); }
cmd(K.CMD.HAIL, s.camp.tallisId); run(3, godmode);
run(14, godmode); run(25, godmode); run(5, () => { godmode(); killHostiles(0.3); }); run(5, godmode);
for (const h of s.P.arts) if (G.ART[h.a].set) { cmd(K.CMD.ANALYSE, h.uid, 1); run(30, godmode); }
run(3, godmode);
// chapter 4
goSys('orra'); run(5, godmode);
for (let k = 0; k < 40 && s.camp.ch === 4; k++) run(5, () => { godmode(); if (s.camp.step === 'c4_draal' && s.camp.t > 30) killHostiles(0.2); if (s.duel) { const n = s.npc[s.duel.id]; n.hull = Math.min(n.hull, 25); } });
run(6, godmode);
// chapter 5
goSys('chorus'); run(10, godmode);
at(s.npc[s.camp.monoId], 9000); run(4, godmode);
run(100, () => { godmode(); if (Math.random() < 0.01) killHostiles(0); });
console.log('GAME', s.game === K.GS_WIN ? 'WON' : s.game, 'ENDING', s.camp && s.camp.ending && s.camp.ending.title, '| ALLIES', s.camp && s.camp.ending && s.camp.ending.allies.join(', '), '| CHOICES', JSON.stringify(s.camp && s.camp.f));
process.exit(s.game === K.GS_WIN ? 0 : 1);
