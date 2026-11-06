// ============================================================================
// lab.js - the science lab for rare artefacts, and the relic ring puzzle.
//   LAB: a rare artefact isn't identified by waiting - SCIENCE runs tests
//   (spectrometry, resonance, thermal, gravimetry, dating; energy and time each)
//   and then classifies it against the reference table. A wrong call costs a
//   cool-down. The panel can be put on the main viewer so the crew can help.
//   RING: relic shards fit edge to edge in a closed ring (tiles can be swapped
//   and flipped); the runes along the middle spell a message - readable only
//   with the codex. Used by THE CARTOGRAPHERS campaign.
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
};
// what a rare artefact really is, and the four classes science chooses between
export const LAB_ART = {
  shard1: { cls: 'song', choices: ['song', 'chart', 'datac', 'bio'] },
  shard2: { cls: 'song', choices: ['chart', 'song', 'icon', 'datac'] },
  shard3: { cls: 'song', choices: ['datac', 'chart', 'bio', 'song'] },
  keel: { cls: 'engine', choices: ['cell', 'engine', 'focus', 'icon'] },
  nanite: { cls: 'bio', choices: ['bio', 'song', 'cell', 'datac'] },
  rshard: { cls: 'chart', choices: ['datac', 'chart', 'song', 'forge'] },
  bshard: { cls: 'chart', choices: ['chart', 'icon', 'datac', 'forge'] },
  gshard: { cls: 'chart', choices: ['forge', 'datac', 'chart', 'song'] },
  oshard: { cls: 'chart', choices: ['song', 'forge', 'chart', 'datac'] },
  bcopy: { cls: 'chart', choices: ['chart', 'icon', 'datac', 'forge'] },
  gfake: { cls: 'forge', choices: ['chart', 'forge', 'datac', 'song'] },
  gsample1: { cls: 'chart', choices: ['chart', 'forge', 'datac', 'song'] },
  gsample2: { cls: 'forge', choices: ['chart', 'forge', 'datac', 'song'] },
};
export const isRare = (h) => !!LAB_ART[G.ART[h.a].id];

// ---------------------------------------------------------------- runes (the Cartographer script)
// strokes in a unit square: ['l', x0,y0,x1,y1] line, ['c', x,y,r] circle, ['a', x,y,r,deg0,deg1] arc
const RUNES = [
  [['c', 0.5, 0.5, 0.33]],
  [['l', 0.5, 0.1, 0.5, 0.9]],
  [['l', 0.2, 0.25, 0.8, 0.25], ['l', 0.8, 0.25, 0.2, 0.8], ['l', 0.2, 0.8, 0.8, 0.8]],
  [['a', 0.5, 0.5, 0.33, 180, 360], ['l', 0.5, 0.17, 0.5, 0.9]],
  [['l', 0.15, 0.85, 0.5, 0.15], ['l', 0.5, 0.15, 0.85, 0.85], ['l', 0.3, 0.55, 0.7, 0.55]],
  [['c', 0.5, 0.3, 0.15], ['c', 0.5, 0.72, 0.15]],
  [['l', 0.15, 0.5, 0.85, 0.5], ['a', 0.5, 0.5, 0.33, 0, 180]],
  [['l', 0.2, 0.2, 0.8, 0.2], ['l', 0.8, 0.2, 0.35, 0.85]],
  [['c', 0.5, 0.5, 0.33], ['c', 0.5, 0.5, 0.1]],
  [['l', 0.5, 0.12, 0.88, 0.5], ['l', 0.88, 0.5, 0.5, 0.88], ['l', 0.5, 0.88, 0.12, 0.5], ['l', 0.12, 0.5, 0.5, 0.12]],
  [['a', 0.5, 0.5, 0.36, 200, 340], ['a', 0.5, 0.5, 0.36, 20, 160], ['c', 0.5, 0.5, 0.08], ['l', 0.5, 0.05, 0.5, 0.18], ['l', 0.5, 0.82, 0.5, 0.95]],
];
export const RUNE_MEANING = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'THE BLUE GIANT'];
export function drawRune(g, x, y, s, idx, col, mirror = false) {
  const c = g.ctx, R = RUNES[idx % RUNES.length];
  c.save(); c.strokeStyle = col; c.lineWidth = Math.max(1.5, s / 12); c.lineCap = 'round';
  const X = (v) => x + (mirror ? 1 - v : v) * s, Y = (v) => y + v * s;
  for (const st of R) {
    c.beginPath();
    if (st[0] === 'l') { c.moveTo(X(st[1]), Y(st[2])); c.lineTo(X(st[3]), Y(st[4])); }
    else if (st[0] === 'c') c.arc(X(st[1]), Y(st[2]), st[3] * s, 0, Math.PI * 2);
    else { const a0 = (st[4] * Math.PI) / 180, a1 = (st[5] * Math.PI) / 180; if (mirror) c.arc(X(st[1]), Y(st[2]), st[3] * s, Math.PI - a1, Math.PI - a0); else c.arc(X(st[1]), Y(st[2]), st[3] * s, a0, a1); }
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- host side
export function installLab(Sim) {
  Object.assign(Sim.prototype, {
    labClass(h) { return (this.labCls && this.labCls[h.uid]) || LAB_ART[G.ART[h.a].id].cls; },
    labCmd(a, b, c, d) {
      const P = this.P;
      if (a === 5 || a === 6 || a === 7) { if (this.ringCmd) this.ringCmd(a, b, c); else this.denied('NOTHING TO ASSEMBLE.'); return; }
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

// the relic ring (campaign): ring = { tiles:[{name,L,R,M,col}], order:[i...], flip:[b...], solved, msg }
export function drawRing(g, w, ring, box, u = 1, app = null, sel = -1, onSel = null) {
  const codex = (w.P.arts || []).some((h) => G.ART[h.a].id === 'codex');
  const n = ring.order.length, gap = 10 * u, tw = (box.w - (n - 1) * gap) / n, th = Math.min(box.h - 60 * u, tw * 0.9);
  const y = box.y + 18 * u;
  g.text(box.x, box.y, ring.solved ? 'THE RING IS WHOLE' : 'EDGES MUST MATCH - AND THE LAST SHARD\'S RIGHT EDGE MEETS THE FIRST ONE\'S LEFT', 11 * u, ring.solved ? C.GREEN : C.GREY_TXT);
  for (let s = 0; s < n; s++) {
    const t = ring.tiles[ring.order[s]], f = ring.flip[s], x = box.x + s * (tw + gap);
    const L = f ? t.R : t.L, R = f ? t.L : t.R;
    const ok = ring.solved, isSel = sel === s;
    g.rrect(x, y, tw, th, 10 * u, isSel ? '#3c3c60' : '#181c2c');
    g.strokeRect(x, y, tw, th, isSel ? C.WHITE : t.col, (isSel ? 2.5 : 1.5) * u);
    const es = Math.min(tw * 0.22, th * 0.3);
    // edges: does this left edge match the previous shard's right edge?
    const prev = ring.tiles[ring.order[(s + n - 1) % n]], pf = ring.flip[(s + n - 1) % n], pR = pf ? prev.L : prev.R;
    const next = ring.tiles[ring.order[(s + 1) % n]], nf = ring.flip[(s + 1) % n], nL = nf ? next.R : next.L;
    drawRune(g, x + 4 * u, y + th / 2 - es / 2, es, L, L === pR ? C.GREEN : C.ORANGE);
    drawRune(g, x + tw - es - 4 * u, y + th / 2 - es / 2, es, R, R === nL ? C.GREEN : C.ORANGE);
    const ms = Math.min(tw * 0.38, th * 0.45);
    drawRune(g, x + tw / 2 - ms / 2, y + th * 0.18, ms, t.M, ok ? C.WHITE : C.SKY, f);
    g.textFit(x + tw / 2, y + th - 32 * u, t.name + (f ? ' (FLIPPED)' : ''), 11 * u, t.col, 'center', tw - 6 * u);
    g.textFit(x + tw / 2, y + th - 17 * u, codex ? RUNE_MEANING[t.M] : 'UNREADABLE - NO CODEX', 11 * u, codex ? C.YELLOW : C.GREY_TXT, 'center', tw - 6 * u, codex);
    if (app && onSel && !ring.solved) g.hit(x, y, tw, th, { down: () => onSel(s) });
  }
  if (ring.msg) g.wrap(box.x, y + th + 6 * u, box.w, ring.msg, 13 * u, ring.solved ? C.GREEN : C.YELLOW, 1.2, 2);
}
