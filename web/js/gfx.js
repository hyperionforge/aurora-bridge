// ============================================================================
// gfx.js - canvas drawing + immediate-mode touch UI in the LCARS panel style
// ============================================================================
// Every frame the screen is redrawn completely; widgets register "hit"
// areas while they draw, and touches are matched against the areas of the
// last frame. Coordinates are virtual pixels: a fixed height with a width
// that follows the screen's aspect ratio.
import { C } from './config.js';
import { DEG, clampf } from './util.js';

export const FONT = 'Antonio, "Arial Narrow", sans-serif';

export function loadFonts() {
  if (!document.fonts || !window.FontFace) return Promise.resolve();
  const faces = [['400', 'fonts/antonio-latin-400-normal.woff2'], ['600', 'fonts/antonio-latin-600-normal.woff2']].map(([w, u]) => {
    const base = new URL('../' + u, import.meta.url).href;
    const f = new FontFace('Antonio', `url(${base})`, { weight: w });
    document.fonts.add(f);
    return f.load().catch(() => {});
  });
  return Promise.all(faces);
}

export function dim(col, f) {
  const n = parseInt(col.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0, g = Math.min(255, ((n >> 8) & 255) * f) | 0, b = Math.min(255, (n & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}
export function lerpCol(c1, c2, t) {
  t = clampf(t, 0, 1);
  return `rgb(${(c1[0] + (c2[0] - c1[0]) * t) | 0},${(c1[1] + (c2[1] - c1[1]) * t) | 0},${(c1[2] + (c2[2] - c1[2]) * t) | 0})`;
}
export const healthColor = (v) => (v > 66 ? C.GREEN : v > 33 ? C.YELLOW : v > 0 ? C.ORANGE : C.RED);
export const flash = (ms, now = performance.now()) => Math.floor(now / ms) % 2 === 0;

// older Chromecast browsers lack roundRect: draw it with arcs
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
    r = Math.max(0, Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}
export class Gfx {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.fixedW = opts.width || 0;   // TV: fixed 960 x 540
    this.H = opts.height || 440;
    this.minW = opts.minW || 760;
    this.maxW = opts.maxW || 1000;
    this.safe = opts.safe || 0;      // TVs that crop their edges (overscan): keep this fraction clear
    this.W = this.fixedW || 900;
    this.hits = [];
    this.lastHits = [];
    this.active = null;
    this.pressedId = null;
    this.pressedUntil = 0;
    this.onTapSound = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (opts.touch !== false) this.bindTouch();
  }
  // keep clear of rounded screen corners: an empty margin (CSS px) left and right
  setPad(px) {
    px = Math.max(0, Math.round(px));
    if (px === (this.padX || 0)) return;
    this.padX = px;
    this.resize();
  }
  resize() {
    const pad = (this.padX || 0) + this.safe * window.innerWidth, padY = this.safe * window.innerHeight;
    const cssW = window.innerWidth - 2 * pad, cssH = window.innerHeight - 2 * padY;
    if (!this.fixedW) this.W = Math.round(clampf(this.H * cssW / cssH, this.minW, this.maxW));
    const s = Math.min(cssW / this.W, cssH / this.H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cssScale = s;
    this.offX = pad + (cssW - this.W * s) / 2;
    this.offY = padY + (cssH - this.H * s) / 2;
    this.cv.style.position = 'absolute';
    this.cv.style.left = this.offX + 'px';
    this.cv.style.top = this.offY + 'px';
    this.cv.style.width = this.W * s + 'px';
    this.cv.style.height = this.H * s + 'px';
    this.cv.width = Math.round(this.W * s * dpr);
    this.cv.height = Math.round(this.H * s * dpr);
    this.k = s * dpr;
  }
  begin() {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.W, this.H);
    this.lastHits = this.hits;
    this.hits = [];
    this.now = performance.now();
  }

  // ---------------------------------------------------------------- touch
  bindTouch() {
    const cv = this.cv;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * this.W, (e.clientY - r.top) / r.height * this.H];
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      for (let i = this.lastHits.length - 1; i >= 0; i--) {
        const h = this.lastHits[i];
        if (!h.test(x, y)) continue;
        if (h.down) h.down(x, y);
        if (h.move || h.up) { this.active = h; try { cv.setPointerCapture(e.pointerId); } catch {} }
        break;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.active || !this.active.move) return;
      const [x, y] = pos(e);
      this.active.move(x, y);
    });
    const end = (e) => {
      if (!this.active) return;
      const [x, y] = pos(e);
      const h = this.active;
      this.active = null;
      if (h.up) h.up(x, y);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  hit(x, y, w, h, handlers) {
    this.hits.push({ test: (px, py) => px >= x && px < x + w && py >= y && py < y + h, ...handlers });
  }
  hitCircle(cx, cy, r, handlers) {
    this.hits.push({ test: (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, ...handlers });
  }
  flashBtn(id) { this.pressedId = id; this.pressedUntil = performance.now() + 140; }
  isPressed(id) { return this.pressedId === id && performance.now() < this.pressedUntil; }

  // ---------------------------------------------------------------- primitives
  rect(x, y, w, h, col) { const c = this.ctx; c.fillStyle = col; c.fillRect(x, y, w, h); }
  strokeRect(x, y, w, h, col, lw = 1) { const c = this.ctx; c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  rrect(x, y, w, h, r, col) {
    const c = this.ctx;
    r = Math.min(r, h / 2, w / 2);
    c.fillStyle = col;
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
    c.fill();
  }
  // LCARS pill with only one side rounded: side 'l' / 'r'
  pill(x, y, w, h, col, side) {
    const c = this.ctx, r = h / 2;
    c.fillStyle = col;
    c.beginPath();
    if (side === 'l') { c.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); c.lineTo(x + w, y); c.lineTo(x + w, y + h); }
    else { c.moveTo(x, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x, y + h); }
    c.closePath();
    c.fill();
  }
  circle(x, y, r, col, fill = true, lw = 1) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    if (fill) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
  }
  line(x0, y0, x1, y1, col, lw = 1) {
    const c = this.ctx;
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  tri(x0, y0, x1, y1, x2, y2, col) {
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2);
    c.closePath();
    c.fill();
  }
  // ring segment, angles in degrees (0 = 3 o'clock, clockwise)
  arcSeg(cx, cy, ro, ri, a0, a1, col) {
    const c = this.ctx;
    if (a1 < a0) a1 += 360;
    c.fillStyle = col;
    c.beginPath();
    c.arc(cx, cy, ro, a0 * DEG, a1 * DEG);
    c.arc(cx, cy, ri, a1 * DEG, a0 * DEG, true);
    c.closePath();
    c.fill();
  }
  clip(x, y, w, h) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
  }
  unclip() { this.ctx.restore(); }

  // ---------------------------------------------------------------- text
  font(size, bold) { return `${bold ? 600 : 400} ${size}px ${FONT}`; }
  textW(s, size, bold) { const c = this.ctx; c.font = this.font(size, bold); return c.measureText(s).width; }
  text(x, y, s, size, col, align = 'left', bold = false) {
    const c = this.ctx;
    c.font = this.font(size, bold);
    c.fillStyle = col;
    c.textAlign = align;
    c.textBaseline = 'top';
    c.fillText(s, x, y);
  }
  // fit text into maxW by shrinking it
  textFit(x, y, s, size, col, align, maxW, bold = false) {
    let sz = size;
    while (sz > 9 && this.textW(s, sz, bold) > maxW) sz -= 1;
    this.text(x, y, s, sz, col, align, bold);
    return sz;
  }
  wrapLines(s, w, size) {
    const words = String(s).split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (this.textW(t, size) > w && cur) { lines.push(cur); cur = wd; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // word-wrapped text; returns the y below the last line
  wrap(x, y, w, s, size, col, lh = 1.25, maxLines = 99) {
    const lines = this.wrapLines(s, w, size).slice(0, maxLines);
    for (const l of lines) { this.text(x, y, l, size, col); y += size * lh; }
    return y;
  }

  // ---------------------------------------------------------------- widgets
  // rounded pill button; tap fires on touch-down like the hardware panels
  button(id, x, y, w, h, label, fill, textCol, size, onTap, opts = {}) {
    const pressed = this.isPressed(id);
    this.rrect(x, y, w, h, opts.r ?? Math.min(h / 2, 18), pressed ? C.WHITE : fill);
    const lines = String(label).split('\n');
    const lh = size * 1.05;
    const ty = y + (h - lines.length * lh) / 2 + size * 0.02;
    lines.forEach((l, i) => this.textFit(x + w / 2, ty + i * lh, l, size, pressed ? C.BLACK : textCol, 'center', w - 10, opts.bold));
    if (onTap) this.hit(x, y, w, h, { down: () => { this.flashBtn(id); if (this.onTapSound && !opts.silent) this.onTapSound(opts.sound || 'tap'); onTap(); } });
  }
  // flat-ended block (sidebar style), label bottom-right
  block(id, x, y, w, h, label, fill, textCol, size, onTap) {
    const pressed = this.isPressed(id);
    this.rect(x, y, w, h, pressed ? C.WHITE : fill);
    this.textFit(x + w - 6, y + h - size - 4, label, size, pressed ? C.BLACK : textCol, 'right', w - 10);
    if (onTap) this.hit(x, y, w, h, { down: () => { this.flashBtn(id); if (this.onTapSound) this.onTapSound('tap'); onTap(); } });
  }
  // header bar: rounded cap, label, bar running to the end
  header(x, y, w, label, col, h = 18) {
    this.pill(x, y, 24, h, col, 'l');
    const tw = this.textW(label, h - 2, true);
    this.text(x + 30, y + 1, label, h - 2, col, 'left', true);
    const bx = x + 30 + tw + 8;
    if (bx < x + w - 12) this.pill(bx, y, x + w - bx, h, col, 'r');
  }
  segBar(x, y, w, h, value, col, segs = 20) {
    const sw = w / segs;
    for (let i = 0; i < segs; i++) {
      const on = value >= (i + 1) * 100 / segs - 100 / segs / 2;
      this.rect(x + i * sw, y, sw - 2, h, on ? col : C.SEG_OFF);
    }
  }
  progress(x, y, w, h, frac, col) {
    frac = clampf(frac, 0, 1);
    this.rect(x, y, w, h, C.SEG_OFF);
    if (frac > 0) this.rect(x, y, w * frac, h, col);
    for (let i = 1; i < 10; i++) this.rect(x + w * i / 10, y, 1, h, C.BLACK);
  }
  bar(x, y, w, h, v, col) { // v 0..100
    this.rect(x, y, w, h, C.SEG_OFF);
    this.rect(x, y, w * clampf(v, 0, 100) / 100, h, col);
  }
  // vertical slider with 10 segments; onChange(value, final)
  vslider(id, x, y, w, h, value, vmax, col, step, onChange, active) {
    const tx = x + 10, tw = w - 20, segs = 10, sh = h / segs;
    for (let s = 0; s < segs; s++) {
      const sy = y + h - (s + 1) * sh + 2;
      const on = value >= (s + 1) * vmax / segs - vmax / segs / 2;
      this.rect(tx, sy, tw, sh - 3, on ? (s >= segs / 2 && vmax > 100 ? C.ORANGE : col) : C.SEG_OFF);
    }
    this.rect(x + 4, y, 1, h, C.GRID);
    this.rect(x + w - 5, y, 1, h, C.GRID);
    let ty = y + h - value * h / vmax;
    ty = clampf(ty, y + 4, y + h - 4);
    this.rrect(x + 2, ty - 5, w - 4, 10, 5, active ? C.WHITE : C.PEACH);
    const val = (py) => Math.round(clampf((y + h - py) * vmax / h, 0, vmax) / step) * step;
    this.hit(x - 6, y - 12, w + 12, h + 24, {
      down: (px, py) => onChange(val(py), false, true),
      move: (px, py) => onChange(val(py), false, false),
      up: (px, py) => onChange(val(py), true, false),
    });
  }
  brackets(x, y, r, col) {
    const l = r / 2;
    const c = this.ctx;
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x - r, y - r + l); c.lineTo(x - r, y - r); c.lineTo(x - r + l, y - r);
    c.moveTo(x + r - l, y - r); c.lineTo(x + r, y - r); c.lineTo(x + r, y - r + l);
    c.moveTo(x - r, y + r - l); c.lineTo(x - r, y + r); c.lineTo(x - r + l, y + r);
    c.moveTo(x + r - l, y + r); c.lineTo(x + r, y + r); c.lineTo(x + r, y + r - l);
    c.stroke();
  }
}
