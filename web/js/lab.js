// ============================================================================
// lab.js - the science lab for rare artefacts.
//   LAB: a rare artefact isn't identified by waiting - SCIENCE runs tests
//   (spectrometry, resonance, thermal, gravimetry, dating; energy and time each)
//   and then classifies it against the reference table. A wrong call costs a
//   cool-down. The panel can be put on the main viewer so the crew can help.
// ============================================================================
import * as K from './config.js';
import { C } from './config.js';
import * as G from './cargo.js';
import { clampf } from './util.js';
const { FROM_CREW } = K;

export const LAB_TESTS = [
  { name: 'SPECTROMETRY', short: 'SPECTRO', what: 'MATERIAL' },
  { name: 'RESONANCE SWEEP', short: 'RESONANCE', what: 'RESONANCE' },
  { name: 'THERMAL IMAGING', short: 'THERMAL', what: 'TEMPERATURE' },
  { name: 'GRAVIMETRY', short: 'GRAVITY', what: 'DENSITY' },
  { name: 'CHRONOMETRIC DATING', short: 'DATING', what: 'AGE' },
];
export const LAB_TIME = 3.5, LAB_COST = 15, LAB_LOCK_MS = 12000;
// the reference signatures science compares its readings with
export const LAB_CLASSES = {
  chart: { name: 'STAR CHART SHARD', p: ['CRYSTAL', '7.4 THZ', 'COLD', 'NORMAL', 'ANCIENT'] },
  datac: { name: 'DATA CRYSTAL', p: ['CRYSTAL', 'BROADBAND', 'COLD', 'NORMAL', 'ANCIENT'] },
  forge: { name: 'MODERN FORGERY', p: ['CRYSTAL', '7.4 THZ', 'COLD', 'NORMAL', 'RECENT'] },
  song: { name: 'RESONANT CRYSTAL', p: ['CRYSTAL', '4.1 THZ', 'WARM', 'LIGHT', 'ANCIENT'] },
  cell: { name: 'POWER CELL', p: ['METALLIC', 'NONE', 'HOT', 'DENSE', 'ANCIENT'] },
  focus: { name: 'WEAPON FOCUS', p: ['METALLIC', '31 THZ', 'WARM', 'DENSE', 'OLD'] },
  engine: { name: 'GRAVITIC PART', p: ['METALLIC', 'NONE', 'WARM', 'EXTREME', 'OLD'] },
  icon: { name: 'RITUAL CARVING', p: ['STONE', 'NONE', 'COLD', 'NORMAL', 'OLD'] },
  bio: { name: 'LIVING CULTURE', p: ['ORGANIC', 'PULSING', 'WARM', 'LIGHT', 'RECENT'] },
  sedative: { name: 'KESSARI SEDATIVE', p: ['ORGANIC', '9.2 THZ', 'COLD', 'LIGHT', 'RECENT'] },
  glycol: { name: 'CLEAN STASIS FLUID', p: ['ORGANIC', 'NONE', 'COLD', 'LIGHT', 'OLD'] },
  swarm: { name: 'NANITE SWARM', p: ['METALLIC', 'PULSING', 'COLD', 'DENSE', 'RECENT'] },
};
// what a rare artefact really is, and the four classes science chooses between
export const LAB_ART = {
  shard1: { cls: 'song', choices: ['song', 'chart', 'datac', 'bio'] },
  shard2: { cls: 'song', choices: ['chart', 'song', 'icon', 'datac'] },
  shard3: { cls: 'song', choices: ['datac', 'chart', 'bio', 'song'] },
  keel: { cls: 'engine', choices: ['cell', 'engine', 'focus', 'icon'] },
  nanite: { cls: 'bio', choices: ['bio', 'song', 'cell', 'datac'] },
  stasis: { cls: 'sedative', choices: ['glycol', 'bio', 'sedative', 'swarm'] },
};
export const isRare = (h) => !!LAB_ART[G.ART[h.a].id];

// ---------------------------------------------------------------- host side
export function installLab(Sim) {
  Object.assign(Sim.prototype, {
    labClass(h) { return (this.labCls && this.labCls[h.uid]) || LAB_ART[G.ART[h.a].id].cls; },
    labCmd(a, b, c, d) {
      const P = this.P;
      const h = P.arts.find((q) => q.uid === b);
      if (a === 4) { if (h) this.labShow = b; this.view = K.VM_LAB; this.viewRevertAt = 0; this.say(FROM_CREW, 0, 'SCIENCE LAB ON THE MAIN VIEWER.'); return; }
      if (!h || !isRare(h)) { this.denied('THAT ISN\'T A LAB SPECIMEN.'); return; }
      if (a === 1) { // run a test
        const t = c | 0;
        if (t < 0 || t >= LAB_TESTS.length) return;
        if (h.read && h.read[t]) { this.denied('WE ALREADY HAVE THAT READING.'); return; }
        if (P.labUid) { this.denied('THE LAB IS BUSY WITH ANOTHER TEST.'); return; }
        if (P.energy < LAB_COST) { this.denied('NOT ENOUGH ENERGY FOR THE TEST.'); return; }
        if (P.health[K.S_SENSORS] <= 0) { this.denied('SENSORS OFFLINE - THE LAB IS BLIND.'); return; }
        P.energy -= LAB_COST; P.labUid = h.uid; P.labTest = t; P.labProg = 0;
        this.labShow = this.labShow || h.uid;
      } else if (a === 2) { // classify it
        const L = LAB_ART[G.ART[h.a].id], key = L.choices[c | 0];
        if (!key) return;
        if (h.ident >= 2) { this.denied('IT IS ALREADY CLASSIFIED.'); return; }
        if (h.lockAt && this.now < h.lockAt) { this.denied('THE SPECIMEN IS STILL SETTLING AFTER THE LAST CALL.'); return; }
        if ((h.read || []).filter(Boolean).length < 2) { this.denied('RUN AT LEAST TWO TESTS BEFORE CLASSIFYING IT.'); return; }
        if (key === this.labClass(h)) {
          h.ident = 2; h.cls = key;
          const d = G.ART[h.a];
          this.emit(K.EV_SCAN_DONE);
          this.say(FROM_CREW, 3, `CLASSIFIED: ${LAB_CLASSES[key].name}. ${d.name}: ${d.effect}`);
          this.say(FROM_CREW, 0, `LAB REPORT - ${d.name}: ${d.lore}`);
          if (d.set === 'chorus') this.checkShards();
          if (this.onClassified) this.onClassified(h, key);
        } else {
          h.lockAt = this.now + LAB_LOCK_MS; P.energy = Math.max(0, P.energy - 10);
          this.say(FROM_CREW, 1, `THE READINGS DON'T FIT ${LAB_CLASSES[key].name}. COMPARE THEM WITH THE REFERENCE TABLE - RECALIBRATING (12s).`);
        }
      }
    },
    labTick(dt) {
      const P = this.P;
      if (!P.labUid) return;
      const h = P.arts.find((q) => q.uid === P.labUid);
      if (!h || P.health[K.S_SENSORS] <= 0) { P.labUid = 0; P.labProg = 0; return; }
      P.labProg += (dt / LAB_TIME) * clampf(this.eff(K.S_SENSORS), 0.4, 1.4);
      if (P.labProg >= 1) {
        const t = P.labTest, cls = LAB_CLASSES[this.labClass(h)];
        h.read = h.read || [0, 0, 0, 0, 0];
        h.read[t] = cls.p[t];
        P.labUid = 0; P.labProg = 0;
        this.emit(K.EV_SCAN_DONE);
        this.say(FROM_CREW, 0, `${LAB_TESTS[t].name}: ${LAB_TESTS[t].what} - ${cls.p[t]}.`);
      }
    },
  });
}

// ---------------------------------------------------------------- drawing (science station and main viewer)
// box {x,y,w,h}; u = scale; app = interactive (station) or null (viewer)
export function drawLab(g, w, h, box, u = 1, app = null) {
  const P = w.P, d = G.ART[h.a], L = LAB_ART[d.id];
  const x = box.x, rw = box.w;
  let y = box.y;
  g.textFit(x, y, (h.ident ? d.name : d.unk) + (h.ident >= 2 ? '' : '  - LAB SPECIMEN'), 20 * u, C.LILAC, 'left', rw, true); y += 26 * u;
  if (h.ident >= 2) {
    g.text(x, y, `CLASSIFIED: ${LAB_CLASSES[h.cls || L.cls].name}`, 14 * u, C.GREEN); y += 20 * u;
    y = g.wrap(x, y, rw, d.effect, 13 * u, C.SKY, 1.2, 2) + 4 * u;
    g.wrap(x, y, rw, d.lore, 12 * u, C.PEACH, 1.25, app ? 5 : 8);
    return;
  }
  g.text(x, y, 'RUN TESTS, THEN TAP THE CLASS WHOSE SIGNATURE MATCHES THE READINGS', 11 * u, C.GREY_TXT); y += 16 * u;
  // the tests and their readings
  const n = LAB_TESTS.length, cw = (rw - (n - 1) * 4 * u) / n, busy = P.labUid === h.uid;
  LAB_TESTS.forEach((t, i) => {
    const bx = x + i * (cw + 4 * u), got = h.read && h.read[i], running = busy && P.labTest === i;
    if (app) g.button('lt' + i, bx, y, cw, 28 * u, running ? `${Math.round(P.labProg * 100)}%` : t.short, got ? C.GREY : running ? C.YELLOW : C.SKY, C.BLACK, 12 * u, () => app.send(K.CMD.LAB, 1, h.uid, i), { silent: !!got });
    else { g.rrect(bx, y, cw, 28 * u, 14 * u, got ? C.GREY : running ? C.YELLOW : '#1c2c44'); g.textFit(bx + cw / 2, y + 7 * u, running ? `${Math.round(P.labProg * 100)}%` : t.short, 12 * u, got ? C.BLACK : C.SKY, 'center', cw - 6 * u); }
    g.textFit(bx + cw / 2, y + 32 * u, got || '?', 13 * u, got ? C.WHITE : C.GREY_TXT, 'center', cw - 2 * u, !!got);
  });
  y += 54 * u;
  g.text(x, y, `REFERENCE SIGNATURES (EACH TEST ${LAB_COST} EN)`, 11 * u, C.GREY_TXT); y += 15 * u;
  const locked = h.lockAt && w.now < h.lockAt, rh = 30 * u;
  L.choices.forEach((key, j) => {
    const cl = LAB_CLASSES[key], ry = y + j * (rh + 3 * u);
    const match = (h.read || []).every((v, i) => !v || v === cl.p[i]);
    const col = locked ? '#2a2a34' : match ? '#24384c' : '#1c1c24';
    if (app) g.hit(x, ry, rw, rh, { down: () => { if (locked) app.sound.denied(); else { app.sound.toggle(); app.send(K.CMD.LAB, 2, h.uid, j); } } });
    g.rrect(x, ry, rw, rh, 8 * u, col);
    g.textFit(x + 6 * u, ry + 8 * u, cl.name, 12 * u, match ? C.PEACH : C.GREY_TXT, 'left', rw * 0.3, true);
    cl.p.forEach((v, i) => {
      const got = h.read && h.read[i], cx = x + rw * 0.32 + (i * rw * 0.68) / n;
      g.textFit(cx, ry + 9 * u, v, 11 * u, got ? (got === v ? C.GREEN : C.RED_DIM) : C.GREY_TXT, 'left', (rw * 0.68) / n - 3 * u);
    });
  });
  y += L.choices.length * (rh + 3 * u) + 2 * u;
  if (locked) g.text(x, y, `RECALIBRATING - ${Math.ceil((h.lockAt - w.now) / 1000)}s`, 12 * u, C.YELLOW);
  else g.text(x, y, app ? 'TAP A ROW TO CLASSIFY (AT LEAST TWO TESTS FIRST)' : 'SCIENCE: TAP A ROW TO CLASSIFY', 11 * u, C.GREY_TXT);
}
