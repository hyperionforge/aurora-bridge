// Flies the ASTEROID FIELD mission with a scripted crew: helm follows the channel,
// science scans each beacon from close range, tactical shoots loose boulders.
//   node tests/field.mjs [seed] [difficulty]
import * as K from '../web/js/config.js';
import { Sim } from '../web/js/sim.js';
import { makeRng, distTo, bearingTo } from '../web/js/util.js';
const seed = +(process.argv[2] || 1), diff = +(process.argv[3] || 1);
const s = new Sim(makeRng(seed));
const cmd = (cmd, a = 0, b = 0, c = 0, d = 0) => s.handleCmd({ cmd, a, b, c, d });
cmd(K.CMD.SELECT, K.MT_FIELD, diff, K.MODE_MISSION); cmd(K.CMD.START);
const pts = s.field.f.pts, P = s.P;
console.log('field', JSON.stringify(s.field.spec), 'rocks', s.field.f.rocks.length);
// get to the entry first
P.x = s.M.entry[0] - 6000; P.y = s.M.entry[1]; P.hdg = P.desHdg = 90;
let hits = 0, pd = 0, last = '', boulders = 0, tractored = 0;
const cargo0 = P.cargo.slice(0, 3).reduce((a, b) => a + b, 0);
const proj = () => { // index of the path point we're nearest to, and fraction along that segment
  let bi = 0, bd = 1e12, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((P.x - ax) * dx + (P.y - ay) * dy) / L)); const d = Math.hypot(P.x - ax - dx * t, P.y - ay - dy * t); if (d < bd) { bd = d; bi = i; bt = t; } }
  return { bi, bt, bd };
};
cmd(K.CMD.SHIELDS, 1);
cmd(K.CMD.AUTOBRAKE, 1); // the scripted pilot flies with the flight computer's help
for (let i = 0; i < 20 * 900 && s.game === K.GS_RUN; i++) {
  s.tick(0.05);
  for (const e of s.events) if (e.type === K.EV_WE_HIT_HULL || e.type === K.EV_WE_HIT_SHIELD) hits++;
  s.events.length = 0;
  if (i % 6) continue;
  // helm: aim at a point ~1.2k further along the channel
  const { bi, bt } = proj();
  const [ax, ay] = pts[bi], [bx, by] = pts[bi + 1], L = Math.hypot(bx - ax, by - ay), ahead = Math.min(1, bt + 1200 / L);
  let tx = ax + (bx - ax) * ahead, ty = ay + (by - ay) * ahead;
  if (bt + 1200 / L > 1 && bi + 2 < pts.length) { const [cx, cy] = pts[bi + 2], f = (bt * L + 1200 - L) / Math.hypot(cx - bx, cy - by); tx = bx + (cx - bx) * Math.min(1, f); ty = by + (cy - by) * Math.min(1, f); }
  const want = Math.round(bearingTo(P.x, P.y, tx, ty));
  cmd(K.CMD.HEADING, 0, 0, want);
  const turn = Math.abs(((want - P.hdg + 540) % 360) - 180);
  cmd(K.CMD.THROTTLE, 0, 0, turn > 30 ? 15 : 35);
  // science: scan a beacon when close
  for (const id of s.M.ids) { const n = s.npc[id]; if (n.scan < 2 && distTo(P.x, P.y, n.x, n.y) < 3000 && P.scanId === K.NO_ID) cmd(K.CMD.SCAN, id); }
  // boulders: science scans them, tactical tunes the phasers to their frequency and fires; every third one gets tractored in
  const bs = []; for (let k = 0; k < K.MAX_CONTACTS; k++) { const n = s.npc[k]; if (n.active && n.alive && n.rock) bs.push(k); }
  for (const k of bs) { const n = s.npc[k]; if (n.scan < 2 && P.scanId === K.NO_ID) { cmd(K.CMD.SCAN, k); break; } }
  for (const k of bs) {
    const n = s.npc[k];
    if (n.rock.tractor) continue;
    if (n.rock.want === undefined) n.rock.want = (boulders++ % 3) === 2 ? 'tractor' : 'shoot';
    if (n.rock.want === 'tractor' && distTo(P.x, P.y, n.x, n.y) < 3400) { cmd(K.CMD.EXTRACT, k); tractored++; continue; }
    if (n.rock.want === 'shoot' && n.scan >= 2) { if (P.phFreq !== n.freq) cmd(K.CMD.PH_FREQ, n.freq); if (P.phCharge >= 0.99) { cmd(K.CMD.PD); pd++; } }
  }
  if (s.M.objective !== last) { last = s.M.objective; console.log(`[${s.missionT | 0}] ${last}`); }
}
console.log(s.game === K.GS_WIN ? 'WON' : 'NOT WON', 't', s.missionT | 0, 'hull', P.hull | 0, 'hits', hits, 'pd shots', pd, 'boulders', boulders, 'tractored', tractored, 'raw cargo gained', P.cargo.slice(0, 3).reduce((a, b) => a + b, 0) - cargo0);
console.log(s.msgs.slice(0, 5).map((m) => m.text).join('\n'));
process.exit(s.game === K.GS_WIN ? 0 : 1);
