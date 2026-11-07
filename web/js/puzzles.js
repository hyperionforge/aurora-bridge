// ============================================================================
// puzzles.js - science puzzles: things the crew works out together on the main viewer.
// Any artefact can carry a list of puzzle stages (ART entry `puz: ['rings']`,
// `['cipher', 'archive']` ...). SCIENCE drives the controls from the artefact hold;
// the main viewer's LAB mode shows the same puzzle big, so the whole bridge can help.
//   RINGS    resonance rings: three rings of a lattice glyph, scrambled. Turn them until
//            every spoke runs true through all of them and the fixed frame. Turning a ring
//            drags its outer neighbour the other way, so it takes some thought.
//   CIPHER   a data crystal's security lock: guess the four-glyph key. Each try says how
//            many glyphs are right and in the right place, and how many are right but
//            misplaced. Every wrong try raises the trace; at 100% the lock re-keys itself.
//   ARCHIVE  a cracked data store: records the crew can open and read on the viewer.
//            Some records matter for what happens next (a campaign hook fires when read).
//   TUNE     match a signal: three dials (frequency, phase, harmonic) until our trace lies
//            on top of the target and coherence reaches 100%.
// The host keeps the secrets (the cipher's key); everything else rides along on the
// artefact (h.pz) in the fast snapshot. When the last stage is solved the artefact is
// fully analysed and the campaign's onPuzzle(h, kind) hook runs.
// ============================================================================
import * as K from './config.js';
import { C } from './config.js';
import * as G from './cargo.js';
import { clampf } from './util.js';
import { flash } from './gfx.js';
const { FROM_CREW } = K;

export const PZ_NAME = { rings: 'RESONANCE RINGS', cipher: 'SECURITY LOCK', archive: 'DATA ARCHIVE', tune: 'SIGNAL MATCH' };
// ---- rings: spokes at 0, 1 and 3 (of 8) run through every ring and the frame - a set with no two
// equal gaps, so only the true alignment lines all of them up (9 joins; anything else makes 7 or fewer)
export const RING_SPOKES = [0, 1, 3];
export const RING_ARCS = [[[1, 3]], [[3, 4], [6, 7]], [[4, 6], [0, 1]]]; // decoration that forms the sigil when aligned
export const RING_JOINS = 9;
export function ringJoins(rot) {
  const r = [...rot, 0]; let n = 0;
  for (let i = 0; i < 3; i++) for (const p of RING_SPOKES) if (RING_SPOKES.some((q) => (q + r[i + 1]) % 8 === (p + r[i]) % 8)) n++;
  return n;
}
// ---- cipher glyphs
export const CIPHER_N = 6, CIPHER_LEN = 4, CIPHER_TRIES = 8;
// ---- data archives (the text lives here so every screen can show it; the host decides what's open)
export const ARCHIVES = {};
// ---- tune
export const TUNE_MAX = [9, 11, 4];
export function tuneWave(f, p, hm, x) { // x 0..1 across the trace
  const a = (x * f + p / 12) * Math.PI * 2;
  return Math.sin(a) * 0.75 + Math.sin(a * (hm + 1)) * 0.25;
}
export function tuneCoherence(v, t) {
  let e = 0;
  for (let i = 0; i <= 60; i++) { const x = i / 60; e += Math.abs(tuneWave(v[0], v[1], v[2], x) - tuneWave(t[0], t[1], t[2], x)); }
  return Math.round(clampf(100 - e / 61 * 100, 0, 100));
}

export const hasPuz = (h) => !!(h && G.ART[h.a] && G.ART[h.a].puz);
export const puzKind = (h) => (hasPuz(h) && h.pz && !h.pz.done ? G.ART[h.a].puz[h.pz.k || 0] : null);

// ---------------------------------------------------------------- host side
export function installPuzzles(Sim) {
  Object.assign(Sim.prototype, {
    // set up stage k of an artefact's puzzles
    puzStart(h, k = 0) {
      const d = G.ART[h.a], kind = d.puz[k];
      this.pzSecret = this.pzSecret || {};
      const pz = { k, kind, done: false };
      if (kind === 'rings') {
        const rot = [0, 0, 0];
        for (let i = 0; i < 9; i++) this.ringTurn(rot, this.irand(3), this.frand() < 0.5 ? 1 : -1); // scrambled by legal moves: always solvable
        if (ringJoins(rot) === RING_JOINS) this.ringTurn(rot, 1, 1);
        Object.assign(pz, { rot, sel: 0, moves: 0 });
      } else if (kind === 'cipher') {
        Object.assign(pz, { tries: [], cur: [], trace: 0, lockAt: 0, resets: 0 });
        this.pzSecret[h.uid] = this.cipherKey();
      } else if (kind === 'archive') {
        Object.assign(pz, { open: -1, read: [] });
      } else if (kind === 'tune') {
        const t = d.tune || [2 + this.irand(6), this.irand(12), 1 + this.irand(3)];
        Object.assign(pz, { v: [1, 0, 1], t, sel: 0 });
      }
      h.pz = pz;
    },
    cipherKey() { const pool = [0, 1, 2, 3, 4, 5]; const out = []; while (out.length < CIPHER_LEN) out.push(pool.splice(this.irand(pool.length), 1)[0]); return out; },
    ringTurn(rot, i, d) { rot[i] = (rot[i] + d + 8) % 8; if (i < 2) rot[i + 1] = (rot[i + 1] - d + 8) % 8; },
    // CMD.PUZ: a = action, b = artefact uid, c / d = arguments
    puzCmd(a, b, c, d) {
      const h = this.P.arts.find((q) => q.uid === b);
      if (!h || !hasPuz(h)) { this.denied('NOTHING TO WORK ON THERE.'); return; }
      if (!h.pz) { this.puzStart(h, 0); if (a === 0) a = 9; } // starting the analysis puts it on the main viewer
      const pz = h.pz;
      if (a === 9) { this.labShow = h.uid; this.view = K.VM_LAB; this.viewRevertAt = 0; this.say(FROM_CREW, 0, `${PZ_NAME[pz.kind] || 'THE LAB'} ON THE MAIN VIEWER - EVERYONE CAN HELP.`); return; }
      if (pz.done && pz.kind !== 'archive') return; // a finished archive can still be read
      if (!this.sensorsUp() && pz.kind !== 'archive') { this.denied('SENSORS OFFLINE - THE LAB IS BLIND.'); return; }
      this.labShow = this.labShow || h.uid;
      if (pz.kind === 'rings') {
        if (a === 1) pz.sel = clampf(c | 0, 0, 2);
        if (a === 2) { this.ringTurn(pz.rot, pz.sel, c < 0 ? -1 : 1); pz.moves++; if (ringJoins(pz.rot) === RING_JOINS) this.puzSolved(h); }
      } else if (pz.kind === 'cipher') {
        if (pz.lockAt && this.now < pz.lockAt) { this.denied('THE LOCK IS RE-KEYING ITSELF - WAIT.'); return; }
        if (a === 1 && pz.cur.length < CIPHER_LEN && c >= 0 && c < CIPHER_N && !pz.cur.includes(c)) pz.cur.push(c | 0);
        if (a === 2) pz.cur.pop();
        if (a === 3) {
          if (pz.cur.length < CIPHER_LEN) { this.denied(`THE KEY HAS ${CIPHER_LEN} GLYPHS.`); return; }
          const key = this.pzSecret[h.uid] || (this.pzSecret[h.uid] = this.cipherKey());
          const hit = pz.cur.filter((v, i) => key[i] === v).length, near = pz.cur.filter((v, i) => key[i] !== v && key.includes(v)).length;
          pz.tries.push({ g: pz.cur.slice(), hit, near });
          pz.cur = [];
          this.emit(hit === CIPHER_LEN ? K.EV_SCAN_DONE : K.EV_DENIED);
          if (hit === CIPHER_LEN) { this.puzSolved(h); return; }
          pz.trace = Math.min(100, Math.round(pz.tries.length / CIPHER_TRIES * 100));
          if (pz.trace >= 100) { // the lock notices us: new key, and a wait
            pz.lockAt = this.now + 15000; pz.resets++;
            this.pzSecret[h.uid] = this.cipherKey();
            this.say(FROM_CREW, 2, 'TRACE COMPLETE - THE LOCK HAS RE-KEYED ITSELF. EVERYTHING WE LEARNED IS GONE. IT WILL LET US TRY AGAIN IN 15 SECONDS.');
            this.after(15, () => { if (h.pz === pz) { pz.tries = []; pz.trace = 0; pz.lockAt = 0; } });
          }
        }
      } else if (pz.kind === 'archive') {
        const recs = ARCHIVES[G.ART[h.a].archive] || [];
        if (a === 1 && recs[c]) {
          if (recs[c].lock && !(this.camp && this.camp.f && this.camp.f[recs[c].lock])) { this.denied(recs[c].lockMsg || 'THAT RECORD IS STILL ENCRYPTED.'); return; }
          pz.open = c | 0;
          if (!pz.read.includes(c)) { pz.read.push(c | 0); if (recs[c].hook && this.onArchive) this.onArchive(h, recs[c].hook); }
          if (recs.every((r, i) => !r.key || pz.read.includes(i)) && !pz.done) this.puzSolved(h, true);
        }
      } else if (pz.kind === 'tune') {
        if (a === 1) pz.sel = clampf(c | 0, 0, 2);
        if (a === 2) { const i = pz.sel, lo = i === 1 ? 0 : 1; pz.v[i] = clampf(pz.v[i] + (c < 0 ? -1 : 1), lo, TUNE_MAX[i]); if (tuneCoherence(pz.v, pz.t) >= 99) this.puzSolved(h); }
      }
    },
    puzSolved(h, quiet = false) {
      const d = G.ART[h.a], pz = h.pz, kind = pz.kind;
      this.emit(K.EV_FOUND);
      const next = pz.k + 1;
      if (!quiet) this.say(FROM_CREW, 3, { rings: 'THE RINGS LOCK - EVERY SPOKE RUNS TRUE. THE LATTICE IS SINGING.', cipher: 'KEY ACCEPTED - THE LOCK IS OPEN.', tune: 'COHERENCE 100% - WE\'RE ON THEIR CARRIER.' }[kind] || 'SOLVED.');
      if (next < d.puz.length) { this.puzStart(h, next); h.ident = Math.max(h.ident, 1); }
      else { pz.done = true; h.ident = 2; }
      if (this.onPuzzle) this.onPuzzle(h, kind);
    },
  });
}

// ---------------------------------------------------------------- drawing (science station + main viewer)
// shapes for the cipher glyphs: ring, triangle, square, diamond, cross, wave
export function drawGlyph(g, k, x, y, r, col, lw = 2) {
  const c = g.ctx;
  c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  if (k === 0) c.arc(x, y, r * 0.8, 0, Math.PI * 2);
  else if (k === 1) { c.moveTo(x, y - r); c.lineTo(x + r * 0.9, y + r * 0.7); c.lineTo(x - r * 0.9, y + r * 0.7); c.closePath(); }
  else if (k === 2) c.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
  else if (k === 3) { c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y); c.closePath(); }
  else if (k === 4) { c.moveTo(x - r * 0.8, y - r * 0.8); c.lineTo(x + r * 0.8, y + r * 0.8); c.moveTo(x + r * 0.8, y - r * 0.8); c.lineTo(x - r * 0.8, y + r * 0.8); }
  else { for (let i = 0; i <= 12; i++) { const px = x - r + (i / 12) * 2 * r, py = y + Math.sin(i / 12 * Math.PI * 2) * r * 0.55; if (i) c.lineTo(px, py); else c.moveTo(px, py); } }
  c.stroke();
}
const GLYPH_COL = ['#78f0ff', '#ffcc00', '#cc99cc', '#5acd6e', '#ff9900', '#99ccff'];
export const glyphName = (k) => ['RING', 'TRIANGLE', 'SQUARE', 'DIAMOND', 'CROSS', 'WAVE'][k];

// box {x, y, w, h}; u = scale; app = the science station (controls) or null (the viewer)
export function drawPuzzle(g, w, h, box, u = 1, app = null) {
  const d = G.ART[h.a], pz = h.pz;
  let { x, y } = box; const bw = box.w;
  g.textFit(x, y, (h.ident ? d.name : d.unk) + (pz && !pz.done ? `  -  ${PZ_NAME[pz.kind]}` : ''), 19 * u, C.LILAC, 'left', bw, true);
  y += 24 * u;
  if (!pz) { // not started: one tap to begin
    y = g.wrap(x, y, bw, d.puzHint || 'SOMETHING IN HERE CAN BE WORKED OUT. START THE ANALYSIS.', 13 * u, C.GREY_TXT, 1.2, 4) + 6 * u;
    if (app) g.button('pzgo', x, y, bw, 40, 'BEGIN ANALYSIS', C.ORANGE, C.BLACK, 19, () => app.send(K.CMD.PUZ, 0, h.uid), { bold: true });
    else g.text(x, y, 'SCIENCE: BEGIN THE ANALYSIS FROM THE ARTEFACT HOLD', 14 * u, C.GREY_TXT);
    return;
  }
  const kind = pz.done ? d.puz[d.puz.length - 1] : pz.kind, inner = { x, y, w: bw, h: box.h - (y - box.y) };
  if (kind === 'rings') drawRings(g, w, h, pz, inner, u, app);
  else if (kind === 'cipher') drawCipher(g, w, h, pz, inner, u, app);
  else if (kind === 'archive') drawArchive(g, w, h, pz, inner, u, app);
  else if (kind === 'tune') drawTune(g, w, h, pz, inner, u, app);
}

function drawRings(g, w, h, pz, b, u, app) {
  const solved = pz.done || ringJoins(pz.rot) === RING_JOINS;
  const ctl = app ? 120 : 0, size = Math.min(b.h - 30 * u, b.w - ctl - 10), R = size / 2, cx = b.x + R, cy = b.y + R + 4 * u;
  const rot = pz.done ? [0, 0, 0] : pz.rot, rr = [R * 0.22, R * 0.45, R * 0.68, R * 0.86, R];
  g.circle(cx, cy, R, '#04070f');
  for (let i = 0; i < 4; i++) g.circle(cx, cy, rr[i + 1], i === 3 ? '#3c3c50' : '#1a2440', false, 1.5 * u);
  if (app && !pz.done) g.circle(cx, cy, (rr[pz.sel] + rr[pz.sel + 1]) / 2, '#283c64', false, (rr[pz.sel + 1] - rr[pz.sel]) * 0.92);
  const r4 = [...rot, 0];
  const ang = (p, i) => ((p + r4[i]) % 8) * Math.PI / 4 - Math.PI / 2;
  for (let i = 0; i < 4; i++) { // rings 0-2 turn; 3 is the fixed frame
    const r0 = rr[i] + 3 * u, r1 = rr[i + 1] - 3 * u;
    for (const p of RING_SPOKES) {
      const a = ang(p, i), jIn = i > 0 && RING_SPOKES.some((q) => (q + r4[i - 1]) % 8 === (p + r4[i]) % 8), jOut = i < 3 && RING_SPOKES.some((q) => (q + r4[i + 1]) % 8 === (p + r4[i]) % 8);
      const col = solved ? '#9ff0e6' : jIn && jOut ? C.SKY : jIn || jOut ? '#4f8ab0' : '#3a4a68';
      g.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, col, (solved ? 4 : 3) * u);
      if (jOut) g.circle(cx + Math.cos(a) * rr[i + 1], cy + Math.sin(a) * rr[i + 1], 3 * u, solved ? C.WHITE : C.SKY);
    }
    if (i < 3) for (const [p0, p1] of RING_ARCS[i]) {
      const a0 = ang(p0, i), a1 = ang(p1, i), rm = (rr[i] + rr[i + 1]) / 2, c = g.ctx;
      c.strokeStyle = solved ? '#9ff0e6' : '#5a4a8c'; c.lineWidth = 2 * u; c.beginPath(); c.arc(cx, cy, rm, a0, a1 < a0 ? a1 + Math.PI * 2 : a1); c.stroke();
    }
  }
  g.text(cx, cy - rr[4] - 2 * u, '▼', 12 * u, C.ORANGE, 'center'); // the frame's notch
  if (solved) { g.circle(cx, cy, rr[0] * 0.8, '#9ff0e6', false, 2 * u); g.circle(cx, cy, rr[0] * 0.3, flash(500) ? C.WHITE : '#9ff0e6'); }
  const tx = app ? cx + R + 12 : b.x + b.w * 0.62, tw = b.x + b.w - tx;
  const joins = pz.done ? RING_JOINS : ringJoins(pz.rot);
  g.text(tx, b.y + 2 * u, 'LATTICE COHERENCE', 12 * u, C.GREY_TXT);
  g.text(tx, b.y + 16 * u, `${joins} / ${RING_JOINS} JOINS`, 20 * u, solved ? C.GREEN : joins >= 7 ? C.YELLOW : C.SKY, 'left', true);
  if (!app) {
    g.wrap(tx, b.y + 46 * u, tw, solved ? 'ALIGNED. THE GLYPH IS WHOLE.' : 'TURN THE THREE RINGS UNTIL EVERY SPOKE RUNS STRAIGHT FROM THE CORE TO THE FIXED FRAME. TURNING A RING DRAGS THE NEXT RING OUT THE OTHER WAY. SCIENCE HAS THE CONTROLS.', 13 * u, C.PEACH, 1.25, 8);
    g.text(tx, b.y + b.h - 18 * u, `MOVES: ${pz.moves || 0}`, 12 * u, C.GREY_TXT);
    return;
  }
  if (pz.done) return;
  let yy = b.y + 50;
  ['INNER', 'MIDDLE', 'OUTER'].forEach((l, i) => { g.button('rsel' + i, tx, yy, tw, 28, l, pz.sel === i ? C.SKY : C.GREY, C.BLACK, 15, () => app.send(K.CMD.PUZ, 1, h.uid, i), { sound: 'toggle' }); yy += 32; });
  const hw = (tw - 6) / 2;
  g.button('rl', tx, yy + 4, hw, 40, '⟲', C.ORANGE, C.BLACK, 24, () => app.send(K.CMD.PUZ, 2, h.uid, -1));
  g.button('rr', tx + hw + 6, yy + 4, hw, 40, '⟳', C.ORANGE, C.BLACK, 24, () => app.send(K.CMD.PUZ, 2, h.uid, 1));
  g.wrap(tx, yy + 52, tw, 'A TURN DRAGS THE NEXT RING OUT THE OTHER WAY', 11, C.GREY_TXT, 1.15, 3);
  // tapping a ring on the drawing selects it
  g.hitCircle(cx, cy, rr[3], { down: (px, py) => { const d = Math.hypot(px - cx, py - cy); const i = d < rr[1] ? 0 : d < rr[2] ? 1 : 2; app.sound.toggle(); app.send(K.CMD.PUZ, 1, h.uid, i); } });
}

function drawCipher(g, w, h, pz, b, u, app) {
  const done = pz.done || pz.kind !== 'cipher', locked = pz.lockAt && w.now < pz.lockAt;
  const gw = 30 * u, rowH = 30 * u;
  let y = b.y;
  // trace meter
  g.text(b.x, y, 'TRACE', 12 * u, C.GREY_TXT);
  g.progress(b.x + 50 * u, y + 3 * u, b.w - 50 * u, 9 * u, (pz.trace || 0) / 100, pz.trace > 70 ? C.RED : pz.trace > 40 ? C.YELLOW : C.GREEN);
  y += 18 * u;
  if (done) { g.text(b.x, y, 'LOCK OPEN', 20 * u, C.GREEN, 'left', true); return; }
  if (locked) g.text(b.x + b.w / 2, y + 2 * u, `RE-KEYING - ${Math.ceil((pz.lockAt - w.now) / 1000)}s`, 16 * u, flash(400) ? C.RED : C.YELLOW, 'center', true);
  // the tries so far
  const maxRows = Math.max(3, Math.floor((b.h - (app ? 150 : 60) * u) / rowH)), tries = pz.tries || [];
  const shown = tries.slice(-maxRows);
  y += locked ? 22 * u : 4 * u;
  shown.forEach((t, j) => {
    const n = tries.length - shown.length + j + 1;
    g.text(b.x, y + 8 * u, String(n), 12 * u, C.GREY_TXT);
    t.g.forEach((k, i) => drawGlyph(g, k, b.x + 26 * u + i * (gw + 6 * u) + gw / 2, y + rowH / 2, gw * 0.38, GLYPH_COL[k], 2 * u));
    const fx = b.x + 26 * u + CIPHER_LEN * (gw + 6 * u) + 8 * u;
    for (let i = 0; i < t.hit; i++) g.circle(fx + i * 13 * u, y + rowH / 2, 5 * u, C.GREEN);
    for (let i = 0; i < t.near; i++) g.circle(fx + (t.hit + i) * 13 * u, y + rowH / 2, 5 * u, C.YELLOW, false, 2 * u);
    y += rowH;
  });
  if (!tries.length) { g.wrap(b.x, y, b.w, 'FOUR DIFFERENT GLYPHS OPEN THE LOCK. AFTER EACH TRY: A SOLID GREEN DOT FOR EACH GLYPH IN THE RIGHT PLACE, A HOLLOW YELLOW ONE FOR EACH RIGHT GLYPH IN THE WRONG PLACE.', 13 * u, C.PEACH, 1.25, 4); y += 56 * u; }
  // the try being built
  y = Math.max(y + 6 * u, b.y + b.h - (app ? 128 : 44) * u);
  g.text(b.x, y + 8 * u, '>', 14 * u, C.ORANGE);
  for (let i = 0; i < CIPHER_LEN; i++) {
    const gx = b.x + 26 * u + i * (gw + 6 * u);
    g.strokeRect(gx, y, gw, rowH - 2 * u, '#2a3a60', 1.5 * u);
    if (pz.cur[i] !== undefined) drawGlyph(g, pz.cur[i], gx + gw / 2, y + rowH / 2 - 1 * u, gw * 0.38, GLYPH_COL[pz.cur[i]], 2.5 * u);
  }
  if (!app) { g.text(b.x + b.w, y + 8 * u, `${CIPHER_TRIES - tries.length} TRIES BEFORE THE TRACE COMPLETES`, 13 * u, C.GREY_TXT, 'right'); return; }
  y += rowH + 6;
  const kw = (b.w - 5 * 6) / 6;
  for (let k = 0; k < CIPHER_N; k++) {
    const used = pz.cur.includes(k), bx = b.x + k * (kw + 6);
    g.button('gk' + k, bx, y, kw, 40, '', used ? '#1a1a22' : '#1c2c44', C.BLACK, 12, () => { if (used || locked) app.sound.denied(); else app.send(K.CMD.PUZ, 1, h.uid, k); }, { silent: used || locked, sound: 'toggle' });
    drawGlyph(g, k, bx + kw / 2, y + 20, 11, used ? '#3a3a48' : GLYPH_COL[k], 2.5);
  }
  y += 46;
  const hw = (b.w - 6) / 2;
  g.button('gdel', b.x, y, hw, 34, 'DELETE', C.LILAC, C.BLACK, 16, () => app.send(K.CMD.PUZ, 2, h.uid));
  const full = pz.cur.length === CIPHER_LEN;
  g.button('gtry', b.x + hw + 6, y, hw, 34, 'TRY THIS KEY', full && !locked ? C.ORANGE : C.GREY, C.BLACK, 16, () => { if (full && !locked) app.send(K.CMD.PUZ, 3, h.uid); else app.sound.denied(); }, { bold: true, silent: !full || locked });
}

function drawArchive(g, w, h, pz, b, u, app) {
  const recs = ARCHIVES[G.ART[h.a].archive] || [], open = pz.open ?? -1;
  const lw = Math.min(b.w * 0.42, 260 * u), tx = b.x + lw + 10 * u, tw = b.x + b.w - tx;
  let y = b.y;
  const f = (w.slow && w.slow.campF) || {};
  recs.forEach((r, i) => {
    if (y > b.y + b.h - 24 * u) return;
    const locked = r.lock && !f[r.lock], read = (pz.read || []).includes(i), sel = open === i;
    const col = sel ? C.ORANGE : locked ? '#2a2a34' : read ? '#24384c' : r.key ? '#3c3214' : '#1c2c44';
    const label = (locked ? '[ENCRYPTED] ' : read ? '' : '* ') + r.title;
    if (app) g.button('ar' + i, b.x, y, lw, 26 * u, label, col, sel ? C.BLACK : locked ? C.GREY : C.PEACH, 13, () => app.send(K.CMD.PUZ, 1, h.uid, i), { r: 6, silent: locked });
    else { g.rrect(b.x, y, lw, 26 * u, 6 * u, col); g.textFit(b.x + 8 * u, y + 6 * u, label, 13 * u, sel ? C.BLACK : locked ? C.GREY : C.PEACH, 'left', lw - 14 * u); }
    y += 30 * u;
  });
  if (open < 0 || !recs[open]) { g.wrap(tx, b.y, tw, 'OPEN A RECORD TO READ IT. RECORDS MARKED * HAVE NOT BEEN READ YET. SOME ARE STILL ENCRYPTED.', 14 * u, C.GREY_TXT, 1.25, 6); return; }
  const r = recs[open];
  g.textFit(tx, b.y, r.title, 16 * u, C.ORANGE, 'left', tw, true);
  if (r.from) g.textFit(tx, b.y + 20 * u, r.from, 11 * u, C.GREY_TXT, 'left', tw);
  g.wrap(tx, b.y + (r.from ? 38 : 24) * u, tw, r.text, (app ? 12 : 14) * u, C.PEACH, 1.3, 40);
}

function drawTune(g, w, h, pz, b, u, app) {
  const done = pz.done || pz.kind !== 'tune';
  const v = done ? pz.t || [1, 0, 1] : pz.v, t = pz.t || [1, 0, 1], coh = done ? 100 : tuneCoherence(v, t);
  const ph = app ? Math.min(b.h - 150, 150) : b.h - 60 * u, pw = b.w, px = b.x, py = b.y + 22 * u, c = g.ctx;
  g.text(b.x, b.y, 'COHERENCE', 12 * u, C.GREY_TXT);
  g.text(b.x + 80 * u, b.y - 3 * u, `${coh}%`, 18 * u, coh >= 99 ? C.GREEN : coh > 80 ? C.YELLOW : C.SKY, 'left', true);
  g.rect(px, py, pw, ph, '#04070f');
  g.rect(px, py + ph / 2, pw, 1, '#1a2440');
  const trace = (vals, col, lw, dash) => {
    c.save(); if (dash) c.setLineDash(dash); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
    for (let i = 0; i <= 120; i++) { const x = i / 120, sx = px + x * pw, sy = py + ph / 2 - tuneWave(vals[0], vals[1], vals[2], x) * ph * 0.42; if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }
    c.stroke(); c.restore();
  };
  trace(t, '#ff9900', 3 * u, [4 * u, 4 * u]);
  trace(v, done ? C.GREEN : C.SKY, 2 * u);
  g.text(px + 6 * u, py + 4 * u, 'TARGET', 11 * u, C.ORANGE); g.text(px + 6 * u, py + 18 * u, 'OURS', 11 * u, C.SKY);
  if (!app) { g.text(b.x, py + ph + 8 * u, 'SCIENCE: TURN THE DIALS UNTIL OUR TRACE LIES ON THE TARGET', 13 * u, C.PEACH); return; }
  if (done) return;
  let y = py + ph + 8;
  const names = ['FREQUENCY', 'PHASE', 'HARMONIC'], cw = (b.w - 12) / 3;
  names.forEach((n, i) => g.button('ts' + i, b.x + i * (cw + 6), y, cw, 30, `${n} ${v[i]}`, pz.sel === i ? C.SKY : C.GREY, C.BLACK, 14, () => app.send(K.CMD.PUZ, 1, h.uid, i), { sound: 'toggle' }));
  y += 36;
  const hw = (b.w - 6) / 2;
  g.button('tdn', b.x, y, hw, 36, '- LOWER', C.ORANGE, C.BLACK, 17, () => app.send(K.CMD.PUZ, 2, h.uid, -1));
  g.button('tup', b.x + hw + 6, y, hw, 36, 'HIGHER +', C.ORANGE, C.BLACK, 17, () => app.send(K.CMD.PUZ, 2, h.uid, 1));
}
