// ============================================================================
// portraits.js - faces for the people who hail the Aurora (all original,
// drawn from simple shapes), alien glyph text and the translator effect.
// ============================================================================
import { C } from './config.js';
import { CHARS, ALIEN, alienParts, subtitle } from './dialogue.js';
import { CIV_COL } from './galaxy.js';
import { dim } from './gfx.js';

// ---------------------------------------------------------------- translator timing
const seen = new Map();
export function msgAge(m) {
  if (!seen.has(m.id)) { seen.set(m.id, performance.now()); if (seen.size > 200) seen.delete(seen.keys().next().value); }
  return performance.now() - seen.get(m.id);
}
export const TR_GLYPH_MS = 900, TR_DECODE_MS = 1400;
// what a reader sees of m right now: { text, decoding (0..1), alien }
export function translated(m) {
  const alien = !!m.lang;
  const sub = subtitle(m.text);
  if (!alien) return { text: sub, p: 1, alien };
  const age = msgAge(m);
  if (age < TR_GLYPH_MS) return { text: '', p: 0, alien };
  const p = Math.min(1, (age - TR_GLYPH_MS) / TR_DECODE_MS);
  return { text: sub.slice(0, Math.ceil(sub.length * p)), p, alien };
}
export function speakerName(w, m) {
  if (m.who && CHARS[m.who]) return CHARS[m.who].name;
  return null;
}

// ---------------------------------------------------------------- alien glyphs
// each letter becomes a small rune made of 2-4 strokes, picked from its code
function rune(g, x, y, s, code, col, lw) {
  const c = g.ctx;
  let h = Math.imul(code + 17, 2654435761) >>> 0;
  const pts = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath();
  const n = 2 + (h % 3);
  for (let i = 0; i < n; i++) {
    const a = pts[(h >>> (i * 4)) % 9], b = pts[(h >>> (i * 4 + 2)) % 9];
    c.moveTo(x + a[0] * s * 0.6, y + a[1] * s); c.lineTo(x + b[0] * s * 0.6, y + b[1] * s);
  }
  c.stroke();
  if (h & 0x100) { c.beginPath(); c.arc(x + s * 0.3, y + s * 0.5, s * 0.12, 0, Math.PI * 2); c.stroke(); }
}
// draws text as runes, wrapping at maxW; returns the y after the last line
export function drawGlyphs(g, x, y, text, size, col, maxW, maxLines = 3) {
  const cw = size * 0.72, lh = size * 1.35, lw = Math.max(1, size / 10);
  let cx = x, line = 0;
  for (const word of text.split(' ')) {
    if (cx + word.length * cw > x + maxW && cx > x) { cx = x; y += lh; if (++line >= maxLines) return y; }
    for (const ch of word) { rune(g, cx, y, size, ch.charCodeAt(0), col, lw); cx += cw; }
    cx += cw * 0.8;
  }
  return y + lh;
}
// mixed line: plain words in text, {alien} words as runes (Chorus speech)
export function drawMixed(g, x, y, text, size, col, alienCol, maxW, maxLines = 4) {
  const lh = size * 1.3;
  let cx = x, line = 0;
  for (const [part, alien] of alienParts(text)) {
    for (const word of part.split(' ')) {
      if (!word) { cx += size * 0.3; continue; }
      const wpx = alien ? word.length * size * 0.72 : g.textW(word + " ", size);
      if (cx + wpx > x + maxW && cx > x) { cx = x; y += lh; if (++line >= maxLines) return y + lh; }
      if (alien) { for (const ch of word) { rune(g, cx, y + size * 0.1, size * 0.85, ch.charCodeAt(0), alienCol, Math.max(1, size / 10)); cx += size * 0.72; } cx += size * 0.4; }
      else { g.text(cx, y, word, size, col); cx += wpx; }
    }
  }
  return y + lh;
}

// ---------------------------------------------------------------- portraits
// draws who's face into the box (x,y,w,h); talking animates the mouth
export function drawPortrait(g, who, x, y, w, h, t, talking) {
  const ch = CHARS[who] || CHARS.computer, look = ch.look, c = g.ctx;
  const col = CIV_COL[ch.civ] || C.SKY;
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(w, h) * 0.06); c.clip();
  // backdrop: a room lit in the speaker's colours
  const bg = c.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, dim(col, 0.18)); bg.addColorStop(1, '#05060a');
  c.fillStyle = bg; c.fillRect(x, y, w, h);
  for (let i = 0; i < 5; i++) { c.fillStyle = dim(col, 0.08 + 0.04 * (i % 2)); c.fillRect(x + w * (0.05 + i * 0.2), y + h * 0.1, w * 0.12, h * 0.55); }
  const cx = x + w / 2, cy = y + h * 0.48, S = Math.min(w, h * 0.95) / 2;
  const mouth = talking ? 0.25 + 0.75 * Math.abs(Math.sin(t / 95) * Math.sin(t / 37)) : 0.1;
  if (look === 'computer') drawComputer(g, cx, cy, S, t, talking);
  else if (look === 'chorus') drawChorus(g, cx, cy, S, t, talking);
  else if (look === 'velori') drawVelori(g, cx, cy, S, mouth, t);
  else if (look === 'kessari') drawKessari(g, cx, cy, S, mouth, t, ch.chief);
  else if (look === 'orran') drawOrran(g, cx, cy, S, mouth, t, ch.chief);
  else drawHuman(g, cx, cy, S, mouth, t, look);
  // scanlines
  c.globalAlpha = 0.08; c.fillStyle = '#000';
  for (let yy = y; yy < y + h; yy += 4) c.fillRect(x, yy, w, 2);
  c.globalAlpha = 1;
  c.restore();
}
const ell = (c, x, y, rx, ry, col, rot = 0) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); c.fill(); };
function blink(t) { return (t % 4200) < 140; }
function eyes(c, cx, cy, S, iris, sclera = '#f0ebe1', t = 0, sep = 0.32, size = 0.11) {
  const b = blink(t);
  for (const s of [-1, 1]) {
    const ex = cx + s * S * sep;
    if (b) { c.fillStyle = '#2a1a10'; c.fillRect(ex - S * size, cy - S * 0.01, S * size * 2, S * 0.025); continue; }
    ell(c, ex, cy, S * size, S * size * 0.62, sclera);
    ell(c, ex + Math.sin(t / 2100) * S * 0.02, cy, S * size * 0.55, S * size * 0.55, iris);
    ell(c, ex + Math.sin(t / 2100) * S * 0.02, cy, S * size * 0.25, S * size * 0.25, '#050505');
  }
}
function shoulders(c, cx, cy, S, col, trim) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(cx - S * 1.05, cy + S * 1.2); c.quadraticCurveTo(cx - S * 0.95, cy + S * 0.62, cx - S * 0.32, cy + S * 0.55);
  c.lineTo(cx + S * 0.32, cy + S * 0.55); c.quadraticCurveTo(cx + S * 0.95, cy + S * 0.62, cx + S * 1.05, cy + S * 1.2); c.closePath(); c.fill();
  if (trim) { c.fillStyle = trim; c.fillRect(cx - S * 1.05, cy + S * 0.95, S * 2.1, S * 0.05); }
}
function drawHuman(g, cx, cy, S, mouth, t, L) {
  const c = g.ctx, skin = L.skin, shade = dim(skin, 0.78);
  shoulders(c, cx, cy, S, L.uniform, '#14141a');
  c.fillStyle = '#14141a'; c.fillRect(cx - S * 0.32, cy + S * 0.55, S * 0.64, S * 0.12);
  if (L.pips) for (let i = 0; i < L.pips; i++) ell(c, cx + S * 0.45 + i * S * 0.09, cy + S * 0.75, S * 0.03, S * 0.03, C.YELLOW);
  ell(c, cx, cy + S * 0.5, S * 0.2, S * 0.18, shade);       // neck
  ell(c, cx - S * 0.5, cy, S * 0.08, S * 0.13, shade);      // ears
  ell(c, cx + S * 0.5, cy, S * 0.08, S * 0.13, shade);
  ell(c, cx, cy - S * 0.02, S * 0.5, S * 0.62, skin);       // head
  // hair
  c.fillStyle = L.hair;
  c.beginPath(); c.ellipse(cx, cy - S * 0.3, S * 0.54, S * 0.38, 0, Math.PI, Math.PI * 2); c.fill();
  c.fillRect(cx - S * 0.54, cy - S * 0.32, S * 0.1, S * 0.3); c.fillRect(cx + S * 0.44, cy - S * 0.32, S * 0.1, S * 0.3);
  eyes(c, cx, cy - S * 0.05, S, '#466e8c', '#f0ebe1', t, 0.2, 0.085);
  c.strokeStyle = dim(L.hair, 1.2); c.lineWidth = S * 0.035;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * S * 0.1, cy - S * 0.17); c.lineTo(cx + s * S * 0.3, cy - S * 0.19); c.stroke(); }
  c.strokeStyle = shade; c.lineWidth = S * 0.03;
  c.beginPath(); c.moveTo(cx, cy - S * 0.02); c.lineTo(cx - S * 0.05, cy + S * 0.16); c.lineTo(cx + S * 0.03, cy + S * 0.18); c.stroke();
  if (L.beard) { c.fillStyle = L.hair; c.beginPath(); c.ellipse(cx, cy + S * 0.32, S * 0.4, S * 0.3, 0, 0, Math.PI); c.fill(); }
  ell(c, cx, cy + S * 0.32, S * 0.13, S * 0.05 * (0.4 + mouth * 1.6), '#5a2828');
  if (L.glasses) { c.strokeStyle = '#c8c8d2'; c.lineWidth = S * 0.025; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * S * 0.2, cy - S * 0.05, S * 0.12, 0, Math.PI * 2); c.stroke(); } }
  if (L.scar) { c.strokeStyle = '#b4646e'; c.lineWidth = S * 0.025; c.beginPath(); c.moveTo(cx + S * 0.15, cy - S * 0.3); c.lineTo(cx + S * 0.32, cy + S * 0.15); c.stroke(); }
}
function drawVelori(g, cx, cy, S, mouth, t) {
  const c = g.ctx, skin = '#b496d2', shade = '#8c6eaa';
  shoulders(c, cx, cy, S, '#2c1e46', '#d2b45a');
  for (let i = 0; i < 5; i++) ell(c, cx - S * 0.4 + i * S * 0.2, cy + S * 0.7, S * 0.06, S * 0.06, '#d2b45a');
  ell(c, cx, cy + S * 0.48, S * 0.14, S * 0.2, shade);
  // tall crest
  c.fillStyle = '#6e4a96';
  c.beginPath(); c.moveTo(cx - S * 0.25, cy - S * 0.5); c.quadraticCurveTo(cx, cy - S * 1.25, cx + S * 0.25, cy - S * 0.5); c.closePath(); c.fill();
  ell(c, cx, cy - S * 0.08, S * 0.38, S * 0.66, skin);
  for (const s of [-1, 1]) { c.fillStyle = shade; c.beginPath(); c.moveTo(cx + s * S * 0.36, cy - S * 0.1); c.lineTo(cx + s * S * 0.62, cy - S * 0.42); c.lineTo(cx + s * S * 0.38, cy + S * 0.12); c.fill(); }
  eyes(c, cx, cy - S * 0.08, S, '#78f0ff', '#1e1432', t, 0.16, 0.11);
  ell(c, cx, cy - S * 0.45, S * 0.04, S * 0.04, '#78f0ff');
  ell(c, cx, cy + S * 0.3, S * 0.09, S * 0.035 * (0.4 + mouth * 1.6), '#4a2c5a');
}
function drawKessari(g, cx, cy, S, mouth, t, chief) {
  const c = g.ctx, skin = '#8c3c28', shade = '#5a2418';
  shoulders(c, cx, cy, S, '#3c3c3c', '#781e14');
  for (const s of [-1, 1]) { c.fillStyle = '#5a5a5a'; c.beginPath(); c.moveTo(cx + s * S * 0.6, cy + S * 0.65); c.lineTo(cx + s * S * 0.95, cy + S * 0.45); c.lineTo(cx + s * S * 0.9, cy + S * 0.85); c.fill(); }
  ell(c, cx, cy + S * 0.45, S * 0.3, S * 0.22, shade);
  // horns
  c.fillStyle = chief ? '#d2a03c' : '#c8b496';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * S * 0.3, cy - S * 0.4); c.quadraticCurveTo(cx + s * S * 0.75, cy - S * 0.7, cx + s * S * 0.6, cy - S * 1.05); c.lineTo(cx + s * S * 0.42, cy - S * 0.45); c.fill(); }
  // wide angular head
  c.fillStyle = skin;
  c.beginPath(); c.moveTo(cx - S * 0.45, cy - S * 0.45); c.lineTo(cx + S * 0.45, cy - S * 0.45); c.lineTo(cx + S * 0.55, cy + S * 0.1);
  c.lineTo(cx + S * 0.3, cy + S * 0.5); c.lineTo(cx - S * 0.3, cy + S * 0.5); c.lineTo(cx - S * 0.55, cy + S * 0.1); c.closePath(); c.fill();
  for (let i = 0; i < 6; i++) ell(c, cx - S * 0.3 + (i % 3) * S * 0.3, cy - S * 0.35 + Math.floor(i / 3) * S * 0.1, S * 0.05, S * 0.03, shade);
  // slit eyes
  const b = blink(t);
  for (const s of [-1, 1]) {
    ell(c, cx + s * S * 0.22, cy - S * 0.08, S * 0.1, b ? S * 0.01 : S * 0.05, '#ffd200');
    if (!b) ell(c, cx + s * S * 0.22, cy - S * 0.08, S * 0.015, S * 0.045, '#000');
  }
  c.fillStyle = '#280a06'; c.fillRect(cx - S * 0.2, cy + S * 0.28, S * 0.4, S * 0.04 + mouth * S * 0.07);
  c.fillStyle = '#e6e0c8'; for (let i = 0; i < 5; i++) c.fillRect(cx - S * 0.18 + i * S * 0.08, cy + S * 0.28, S * 0.03, S * 0.03);
  if (chief) { c.strokeStyle = '#e6c8a0'; c.lineWidth = S * 0.03; c.beginPath(); c.moveTo(cx - S * 0.4, cy - S * 0.25); c.lineTo(cx - S * 0.1, cy + S * 0.15); c.stroke(); }
}
function drawOrran(g, cx, cy, S, mouth, t, chief) {
  const c = g.ctx, skin = '#b48c50', shade = '#8c6a3a';
  shoulders(c, cx, cy, S, '#5a3c1e', '#d2a03c');
  // high armoured collar
  c.fillStyle = '#d2a03c';
  c.beginPath(); c.moveTo(cx - S * 0.7, cy + S * 0.7); c.lineTo(cx - S * 0.5, cy + S * 0.15); c.lineTo(cx - S * 0.3, cy + S * 0.55); c.lineTo(cx + S * 0.3, cy + S * 0.55); c.lineTo(cx + S * 0.5, cy + S * 0.15); c.lineTo(cx + S * 0.7, cy + S * 0.7); c.closePath(); c.fill();
  ell(c, cx, cy - S * 0.02, S * 0.48, S * 0.56, skin);
  // heavy ridged brow
  c.fillStyle = shade;
  c.beginPath(); c.ellipse(cx, cy - S * 0.2, S * 0.5, S * 0.14, 0, Math.PI, Math.PI * 2); c.fill();
  for (let i = -2; i <= 2; i++) { c.fillRect(cx + i * S * 0.12 - S * 0.015, cy - S * 0.58, S * 0.03, S * 0.3); }
  eyes(c, cx, cy - S * 0.08, S, '#ff9628', '#3c2814', t, 0.2, 0.07);
  // braided beard
  c.fillStyle = chief ? '#e6e6e6' : '#5a3c1e';
  for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(cx + i * S * 0.18 - S * 0.06, cy + S * 0.35); c.lineTo(cx + i * S * 0.2, cy + S * 0.85); c.lineTo(cx + i * S * 0.18 + S * 0.06, cy + S * 0.35); c.fill(); }
  ell(c, cx, cy + S * 0.28, S * 0.14, S * 0.04 * (0.4 + mouth * 1.6), '#3c1e0a');
  if (chief) for (let i = 0; i < 3; i++) ell(c, cx - S * 0.2 + i * S * 0.2, cy - S * 0.62, S * 0.05, S * 0.05, '#ff6a28');
}
function drawChorus(g, cx, cy, S, t, talking) {
  const c = g.ctx, k = talking ? 1 + 0.15 * Math.sin(t / 80) : 1;
  for (let ring = 3; ring >= 1; ring--) {
    c.strokeStyle = dim('#9ff0e6', 0.3 + ring * 0.2); c.lineWidth = S * 0.02;
    c.beginPath();
    const n = 6 + ring, R = S * 0.25 * ring * k, a0 = t / (900 * ring) * (ring % 2 ? 1 : -1);
    for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI * 2; if (i) c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); else c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    c.stroke();
  }
  const gr = c.createRadialGradient(cx, cy, 0, cx, cy, S * 0.35 * k);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#9ff0e6'); gr.addColorStop(1, '#9ff0e600');
  c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, S * 0.35 * k, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 7; i++) { const a = t / 700 + i / 7 * Math.PI * 2; ell(c, cx + Math.cos(a) * S * 0.85, cy + Math.sin(a) * S * 0.55, S * 0.04, S * 0.04, '#9ff0e6'); }
}
function drawComputer(g, cx, cy, S, t, talking) {
  const c = g.ctx;
  c.strokeStyle = C.SKY; c.lineWidth = S * 0.025;
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = cx - S * 0.8 + i * S * 1.6 / 60;
    const a = talking ? Math.sin(i * 0.7 + t / 60) * Math.sin(i * 0.13 + t / 300) * S * 0.3 : Math.sin(i * 0.4 + t / 500) * S * 0.03;
    if (i) c.lineTo(x, cy + a); else c.moveTo(x, cy + a);
  }
  c.stroke();
  c.strokeStyle = dim(C.SKY, 0.4); c.strokeRect(cx - S * 0.85, cy - S * 0.45, S * 1.7, S * 0.9);
}
