// ============================================================================
// sysdraw.js - drawing star systems (star, orbits, belts, nebulae, planets),
// the galaxy chart with its jump lanes, and the different station designs.
// Used by the viewscreen, NAV, HELM and the sensor radars.
// ============================================================================
import { C } from './config.js';
import { SYSTEMS, SYS_C, WELL_R, sysAt, lanesOf, planetPos, starPos, beltDots, CIV_COL, SK_STARBASE, SK_OUTPOST, SK_HUB, SK_HAVEN,
  SK_CITADEL, SK_ARRAY, SK_RELAY, SK_MONOLITH } from './galaxy.js';
import { DEG } from './util.js';
import { dim, flash } from './gfx.js';
import { drawPlanet, drawNebula, drawStarbase } from './ships.js';

// every body in a system at game time t (s): stars first, then planets
export function bodies(sys, t) {
  const out = [];
  const nStar = sys.star.binary ? 2 : 1;
  for (let k = 0; k < nStar; k++) {
    const [x, y] = starPos(sys, k, t);
    out.push({ star: true, name: nStar > 1 ? sys.name + (k ? ' B' : ' A') : sys.name, x, y, r: nStar > 1 ? sys.star.r * 0.7 : sys.star.r,
      c1: sys.star.col, c2: sys.star.glow });
  }
  sys.planets.forEach((p, i) => {
    const [x, y] = planetPos(sys, i, t);
    out.push({ star: false, name: p.name, x, y, r: p.r, c1: p.c1, c2: p.c2, ring: !!p.ring, orbit: p.orbit });
  });
  return out;
}

export function drawStar(g, x, y, r, col, glow) {
  const c = g.ctx;
  const R = Math.min(r * 3.2, 2400);
  if (R > 3) {
    const gr = c.createRadialGradient(x, y, Math.min(r, R) * 0.4, x, y, R);
    gr.addColorStop(0, glow + 'aa');
    gr.addColorStop(0.35, glow + '33');
    gr.addColorStop(1, glow + '00');
    c.fillStyle = gr;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
  }
  g.circle(x, y, Math.max(1.5, Math.min(r, 900)), col);
  if (r > 4) g.circle(x, y, Math.min(r, 900) * 0.6, '#ffffff');
}

export function drawRingedPlanet(g, x, y, r, c1, c2, ring) {
  if (ring && r > 2.5) {
    const c = g.ctx;
    c.save();
    c.strokeStyle = dim(c2, 1.3);
    c.lineWidth = Math.max(1, r * 0.12);
    c.beginPath(); c.ellipse(x, y, r * 2, r * 0.55, -0.35, Math.PI, Math.PI * 2); c.stroke();
    c.restore();
    drawPlanet(g, x, y, r, c1, c2);
    c.save();
    c.strokeStyle = dim(c2, 1.3);
    c.lineWidth = Math.max(1, r * 0.12);
    c.beginPath(); c.ellipse(x, y, r * 2, r * 0.55, -0.35, 0, Math.PI); c.stroke();
    c.restore();
  } else drawPlanet(g, x, y, r, c1, c2);
}

// overhead picture of the current system. p2(wx,wy) -> [sx,sy], k = px per km
// opts: u (ui scale), orbits, labels, minR (smallest planet radius in px), dots (belt density 0..1), well
export function drawSystemLayer(g, sys, t, p2, k, opts = {}) {
  const u = opts.u || 1, minR = (opts.minR ?? 3) * u, lab = (opts.labelSize ?? 11) * u;
  const [cx, cy] = p2(SYS_C, SYS_C);
  if (opts.orbits !== false)
    for (const p of sys.planets) g.circle(cx, cy, p.orbit * k, '#16203e', false, Math.max(1, u * 0.8));
  if (opts.well) {
    const c = g.ctx;
    c.save(); c.setLineDash([4 * u, 6 * u]);
    g.circle(cx, cy, WELL_R * k, '#5a3c1e', false, u);
    c.restore();
  }
  for (const b of sys.belts) {
    const n = Math.round(b.n * (opts.dots ?? 1));
    const d = beltDots(sys, b, n), sz = Math.max(1, Math.min(3, 120 * k)) * u;
    g.ctx.fillStyle = b.col;
    for (let i = 0; i < d.length; i += 2) { const [sx, sy] = p2(d[i], d[i + 1]); g.ctx.fillRect(sx, sy, sz, sz); }
  }
  for (const nb of sys.nebulae) {
    const [sx, sy] = p2(nb.x, nb.y);
    drawNebula(g, sx, sy, nb.r * k, Math.min(900, Math.max(150, nb.r * k * 6)), nb.col);
    if (opts.labels !== false && nb.r * k > 18) g.text(sx, sy + nb.r * k + 3 * u, nb.name, lab, dim(nb.col, 1.6), 'center');
  }
  for (const b of bodies(sys, t)) {
    const [sx, sy] = p2(b.x, b.y);
    const r = Math.max(b.star ? minR * 1.6 : minR, b.r * k);
    if (b.star) drawStar(g, sx, sy, r, b.c1, b.c2);
    else drawRingedPlanet(g, sx, sy, r, b.c1, b.c2, b.ring);
    if (opts.labels !== false && !b.star && r < 80 * u) g.text(sx + r + 4 * u, sy - lab / 2, b.name, lab, C.GREY_TXT);
  }
}

// ---------------------------------------------------------------- galaxy chart
const GX0 = 90, GX1 = 960, GY0 = 50, GY1 = 500;
export function galaxyKnown(w) {
  const rev = new Set((w.slow && w.slow.revealed) || []);
  return SYSTEMS.map((s, i) => !s.hidden || rev.has(i));
}
// draws the chart into a box; returns the screen position of each system
// opts: u, sel (selected system index), cur (current system), onPick(i)
export function drawGalaxy(g, w, x, y, wd, ht, opts = {}) {
  const u = opts.u || 1, cur = opts.cur ?? w.sysIdx;
  const visited = new Set((w.slow && w.slow.visited) || [cur]);
  const known = galaxyKnown(w);
  const k = Math.min(wd / (GX1 - GX0), ht / (GY1 - GY0));
  const ox = x + (wd - (GX1 - GX0) * k) / 2, oy = y + (ht - (GY1 - GY0) * k) / 2;
  const pos = SYSTEMS.map((s) => [ox + (s.gx - GX0) * k, oy + (s.gy - GY0) * k]);
  // faint background stars
  g.ctx.fillStyle = '#1c2440';
  for (let i = 0; i < 160; i++) {
    const h = Math.imul(i + 7, 2654435761) >>> 0;
    g.ctx.fillRect(x + (h % 1000) / 1000 * wd, y + ((h >>> 10) % 1000) / 1000 * ht, 1.5 * u, 1.5 * u);
  }
  const jt = w.P.jumpTo;
  // lanes
  SYSTEMS.forEach((s, i) => {
    if (!known[i]) return;
    for (const j of lanesOf(i)) {
      if (j < i || !known[j]) continue;
      const live = i === cur || j === cur;
      const active = (i === cur && j === jt) || (j === cur && i === jt);
      const col = active ? (flash(250) ? C.WHITE : C.SKY) : live ? '#5a78b4' : '#26304e';
      if (!live) { g.ctx.save(); g.ctx.setLineDash([3 * u, 5 * u]); }
      g.line(pos[i][0], pos[i][1], pos[j][0], pos[j][1], col, (active ? 3 : live ? 2 : 1.2) * u);
      if (!live) g.ctx.restore();
    }
  });
  SYSTEMS.forEach((s, i) => {
    if (!known[i]) return;
    const [sx, sy] = pos[i];
    const r = (5 + Math.min(4, s.star.r / 1800)) * u;
    drawStar(g, sx, sy, r, s.star.col, s.star.glow);
    if (s.star.binary) g.circle(sx + r * 1.3, sy - r * 0.8, r * 0.5, s.star.col);
    const been = visited.has(i);
    if (i === opts.sel) g.brackets(sx, sy, r + 8 * u, flash(300) ? C.ORANGE : C.YELLOW);
    if (i === cur) { g.circle(sx, sy, r + 6 * u, C.SKY, false, 2 * u); }
    const col = i === cur ? C.SKY : been ? C.PEACH : C.GREY_TXT;
    g.text(sx, sy + r + 5 * u, s.name, (opts.labelSize || 11) * u, col, 'center', i === cur);
    // owners' colours under the name
    let dx = -((s.stations.length - 1) * 8 * u) / 2;
    for (const st of s.stations) { if (been) g.rect(sx + dx - 3 * u, sy + r + 19 * u, 6 * u, 3 * u, CIV_COL[st.civ]); dx += 8 * u; }
    if (opts.onPick) g.hitCircle(sx, sy, Math.max(22, r + 14 * u), { down: () => opts.onPick(i) });
  });
  return pos;
}

// ---------------------------------------------------------------- stations
// scale ~ same as drawStarbase (70*scale = outer radius)
export function drawStation(g, kind, cx, cy, scale, t, civ = 1) {
  const R = Math.max(4, 70 * scale), lw = Math.max(1, R / 22), acc = CIV_COL[civ] || C.SKY;
  const blink = (i, p = 300, n = 4) => (Math.floor(t / p) + i) % n === 0;
  const rot = t / 100;
  switch (kind) {
    case SK_STARBASE: default: drawStarbase(g, cx, cy, scale, rot / 2, t); return;
    case SK_OUTPOST: { // a hollowed asteroid with docking arms
      const c = g.ctx;
      c.fillStyle = '#5a5046';
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, rr = R * (0.55 + 0.18 * Math.sin(i * 2.7));
        if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
      for (let i = 0; i < 3; i++) {
        const a = (i * 120 + 30) * DEG;
        g.line(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, cx + Math.cos(a) * R, cy + Math.sin(a) * R, '#a09682', lw * 1.5);
        g.circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R / 9 + 1, blink(i) ? C.YELLOW : acc);
      }
      g.circle(cx - R * 0.1, cy, R / 6, '#2a2420');
      g.circle(cx - R * 0.1, cy, R / 10, C.ORANGE);
      return;
    }
    case SK_HUB: { // the Lantern: a great double ring hung with lamps
      g.circle(cx, cy, R, '#b4a078', false, lw * 1.6);
      g.circle(cx, cy, R * 0.72, '#8c7c5a', false, lw);
      for (let i = 0; i < 6; i++) {
        const a = (rot * 0.4 + i * 60) * DEG;
        g.line(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25, cx + Math.cos(a) * R, cy + Math.sin(a) * R, '#8c7c5a', lw);
      }
      for (let i = 0; i < 12; i++) {
        const a = (rot * 0.4 + i * 30 + 15) * DEG;
        g.circle(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86, R / 14 + 1, i % 3 ? '#ffd27a' : blink(i, 200, 3) ? C.WHITE : acc);
      }
      g.circle(cx, cy, R * 0.25, '#ffe6aa');
      g.circle(cx, cy, R * 0.14, C.WHITE);
      return;
    }
    case SK_HAVEN: { // spiky lash-up of hulks
      const c = g.ctx;
      c.fillStyle = '#4a3c38';
      c.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + rot * 0.002, rr = i % 2 ? R * 0.45 : R * (0.8 + 0.2 * Math.sin(i));
        if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
      c.strokeStyle = '#7a5a50'; c.lineWidth = lw; c.stroke();
      g.rect(cx - R * 0.5, cy - R * 0.12, R, R * 0.24, '#5a4440');
      for (let i = 0; i < 5; i++) g.circle(cx - R * 0.4 + i * R * 0.2, cy, R / 16 + 1, blink(i, 250, 3) ? C.RED : '#7a1e14');
      return;
    }
    case SK_CITADEL: { // the Orran fortress: a gold diamond with spires
      const c = g.ctx;
      c.fillStyle = '#6e5028';
      c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx + R * 0.65, cy); c.lineTo(cx, cy + R); c.lineTo(cx - R * 0.65, cy); c.closePath(); c.fill();
      c.strokeStyle = '#d2a03c'; c.lineWidth = lw * 1.3; c.stroke();
      for (const s of [-1, 1]) {
        g.line(cx + s * R * 0.65, cy, cx + s * R * 1.05, cy, '#d2a03c', lw * 1.5);
        g.tri(cx + s * R * 1.05, cy - R * 0.15, cx + s * R * 1.05, cy + R * 0.15, cx + s * R * 1.25, cy, '#d2a03c');
      }
      g.circle(cx, cy, R * 0.22, '#2a1c0c');
      g.circle(cx, cy, R * 0.13, blink(0, 500, 2) ? '#ff8a3c' : '#c8501e');
      return;
    }
    case SK_ARRAY: { // three sensor dishes on a long truss
      g.line(cx - R, cy, cx + R, cy, '#8c96a8', lw * 1.4);
      for (let i = -1; i <= 1; i++) {
        const x = cx + i * R * 0.7;
        g.line(x, cy, x, cy - R * 0.35, '#8c96a8', lw);
        const c = g.ctx;
        c.strokeStyle = '#c8d2e6'; c.lineWidth = lw * 1.6;
        c.beginPath(); c.arc(x, cy - R * 0.2, R * 0.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        g.circle(x, cy - R * 0.5, R / 14 + 1, blink(i + 1, 350, 3) ? C.WHITE : acc);
      }
      g.rect(cx - R * 0.2, cy - R * 0.1, R * 0.4, R * 0.35, '#5a6478');
      return;
    }
    case SK_RELAY: { // a lonely listening mast
      g.line(cx, cy - R, cx, cy + R * 0.6, '#7a7a82', lw * 1.3);
      for (let i = 0; i < 4; i++) g.line(cx - R * (0.5 - i * 0.1), cy - R * 0.7 + i * R * 0.35, cx + R * (0.5 - i * 0.1), cy - R * 0.7 + i * R * 0.35, '#5a5a64', lw);
      g.rect(cx - R * 0.25, cy + R * 0.4, R * 0.5, R * 0.3, '#46464e');
      g.circle(cx, cy - R, R / 10 + 1, blink(0, 600, 2) ? C.RED : '#3c1414');
      return;
    }
    case SK_MONOLITH: { // a black slab edged in light
      const c = g.ctx, a = Math.sin(t / 2000) * 0.08;
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.fillStyle = '#05080a'; c.fillRect(-R * 0.28, -R, R * 0.56, R * 2);
      c.strokeStyle = '#9ff0e6'; c.lineWidth = lw; c.globalAlpha = 0.5 + 0.5 * Math.sin(t / 400);
      c.strokeRect(-R * 0.28, -R, R * 0.56, R * 2);
      c.restore();
      for (let i = 0; i < 6; i++) {
        const aa = (t / 30 + i * 60) * DEG;
        g.circle(cx + Math.cos(aa) * R * 0.9, cy + Math.sin(aa) * R * 0.45, R / 20 + 1, dim('#9ff0e6', 0.7));
      }
      return;
    }
  }
}

// jump tunnel for the forward viewer: streaks pouring out of the centre
export function drawJumpTunnel(g, r, t, charge, jumping) {
  const c = g.ctx, cx = r.x + r.w / 2, cy = r.y + r.h / 2, u = r.u;
  if (jumping > 0) {
    c.fillStyle = '#02040e'; c.fillRect(r.x, r.y, r.w, r.h);
    for (let ring = 0; ring < 9; ring++) {
      const ph = ((t / 380 + ring / 9) % 1);
      const rr = ph * ph * Math.hypot(r.w, r.h) * 0.6;
      g.circle(cx, cy, rr, ring % 2 ? '#1e5aa0' : '#3c96dc', false, (1 + ph * 3) * u);
    }
    for (let i = 0; i < 140; i++) {
      const h = Math.imul(i + 1, 2654435761) >>> 0;
      const a = (h % 6283) / 1000, sp = 0.4 + ((h >>> 12) % 100) / 100;
      const ph = ((t / 900) * sp + ((h >>> 20) % 100) / 100) % 1;
      const d0 = ph * ph * r.w * 0.8, d1 = d0 + (20 + 120 * ph) * u;
      g.line(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0, cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, i % 5 ? '#9ec8ff' : C.WHITE, (0.6 + ph * 2) * u);
    }
    g.circle(cx, cy, 18 * u, C.WHITE);
    g.circle(cx, cy, 30 * u, '#9ec8ff', false, 2 * u);
    return;
  }
  if (charge > 0) {
    // the field building up in front of the ship
    const R = (40 + 60 * charge) * u;
    for (let i = 0; i < 3; i++) g.circle(cx, cy, R * (1 + i * 0.25) + Math.sin(t / 120 + i) * 4 * u, dim('#3c96dc', 0.4 + 0.6 * charge), false, (1 + charge * 2) * u);
  }
}

// ---------------------------------------------------------------- points of interest
// kind = PK_* from cargo.js; same scale convention as the stations (70*scale = radius)
export function drawPoi(g, kind, cx, cy, scale, t, seed = 0) {
  const R = Math.max(3, 55 * scale), c = g.ctx, lw = Math.max(1, R / 20);
  const rot = t / 4000 + seed;
  const blob = (n, r0, wob, col, rr = rot) => {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rr + i / n * Math.PI * 2, r = r0 * (1 + wob * Math.sin(i * 2.3 + seed * 3) * Math.cos(i * 1.7));
      if (i) c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  };
  switch (kind) {
    case 0: // asteroid
      blob(11, R * 0.75, 0.25, '#6e645a');
      blob(9, R * 0.5, 0.2, '#857a6e', rot + 0.4);
      if (R > 8) { g.circle(cx - R * 0.2, cy - R * 0.1, R * 0.12, '#554c44'); g.circle(cx + R * 0.25, cy + R * 0.2, R * 0.08, '#554c44'); }
      return;
    case 1: { // comet: tail streams away (seed carries the direction)
      const a = seed;
      for (let i = 6; i > 0; i--) {
        const d = R * i * 0.45;
        c.globalAlpha = 0.12 + 0.05 * (6 - i);
        g.circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.25 + i * 0.08), '#9ec8ff');
      }
      c.globalAlpha = 1;
      blob(9, R * 0.35, 0.2, '#d8f0ff');
      g.circle(cx, cy, R * 0.15, C.WHITE);
      return;
    }
    case 2: { // shipwreck: a broken hull in two halves, sparking
      c.save(); c.translate(cx, cy); c.rotate(rot * 0.3);
      c.fillStyle = '#5a5e68';
      c.beginPath(); c.moveTo(-R * 0.9, -R * 0.15); c.lineTo(-R * 0.1, -R * 0.25); c.lineTo(-R * 0.2, R * 0.05); c.lineTo(-R * 0.05, R * 0.22); c.lineTo(-R * 0.9, R * 0.18); c.closePath(); c.fill();
      c.fillStyle = '#4a4e58';
      c.beginPath(); c.moveTo(R * 0.15, -R * 0.3); c.lineTo(R * 0.85, -R * 0.12); c.lineTo(R * 0.9, R * 0.12); c.lineTo(R * 0.2, R * 0.3); c.lineTo(R * 0.05, 0); c.closePath(); c.fill();
      c.strokeStyle = '#2a2c32'; c.lineWidth = lw; c.stroke();
      c.restore();
      if (Math.floor(t / 180 + seed * 5) % 7 === 0) g.circle(cx + R * 0.02, cy, R * 0.08 + 1, C.YELLOW);
      return;
    }
    case 3: { // alien derelict: a long curved shell with dim teal lights
      c.save(); c.translate(cx, cy); c.rotate(rot * 0.2);
      c.fillStyle = '#1e2e30';
      c.beginPath(); c.ellipse(0, 0, R, R * 0.35, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3c6a6a'; c.lineWidth = lw; c.stroke();
      c.beginPath(); c.arc(0, R * 0.9, R * 1.05, Math.PI * 1.25, Math.PI * 1.75); c.stroke();
      c.restore();
      for (let i = -2; i <= 2; i++) g.circle(cx + i * R * 0.3, cy, R * 0.05 + 1, (Math.floor(t / 600) + i) % 3 ? '#2c5a5a' : '#9ff0e6');
      return;
    }
    case 4: // ancient ruins: a rock with an arch on it
      blob(10, R * 0.6, 0.15, '#4a4640');
      c.strokeStyle = '#b4a078'; c.lineWidth = lw * 2;
      c.beginPath(); c.arc(cx, cy - R * 0.05, R * 0.35, Math.PI, 0); c.stroke();
      g.rect(cx - R * 0.38, cy - R * 0.05, lw * 2, R * 0.35, '#b4a078');
      g.rect(cx + R * 0.35, cy - R * 0.05, lw * 2, R * 0.35, '#b4a078');
      g.circle(cx, cy - R * 0.1, R * 0.07 + 1, (Math.floor(t / 900) % 2) ? '#9ff0e6' : '#3c6a6a');
      return;
    case 5: // gas pocket
      for (let i = 0; i < 5; i++) {
        const a = rot * 2 + i * 1.3;
        c.globalAlpha = 0.25;
        g.circle(cx + Math.cos(a) * R * 0.35, cy + Math.sin(a) * R * 0.3, R * (0.45 + 0.1 * Math.sin(t / 700 + i)), i % 2 ? '#ff8a5a' : '#c8501e');
      }
      c.globalAlpha = 1;
      g.circle(cx, cy, R * 0.12 + 1, '#ffc896');
      return;
    case 6: // crystal spire
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.35, l = R * (0.6 + 0.35 * ((i * 7) % 3) / 2);
        const bx = cx + Math.cos(a + Math.PI / 2) * R * 0.08 * (i - 2);
        c.fillStyle = i % 2 ? '#a078dc' : '#c8a0ff';
        c.beginPath(); c.moveTo(bx - R * 0.07, cy + R * 0.3); c.lineTo(bx + Math.cos(a) * l, cy + R * 0.3 + Math.sin(a) * l); c.lineTo(bx + R * 0.07, cy + R * 0.3); c.closePath(); c.fill();
      }
      c.globalAlpha = 0.3 + 0.3 * Math.sin(t / 300);
      g.circle(cx, cy, R * 0.5, '#c8a0ff', false, lw);
      c.globalAlpha = 1;
      return;
    case 7: default: // drifting capsule
      c.save(); c.translate(cx, cy); c.rotate(rot);
      c.fillStyle = '#a0a8b4';
      c.beginPath(); c.roundRect(-R * 0.45, -R * 0.18, R * 0.9, R * 0.36, R * 0.18); c.fill();
      c.restore();
      g.circle(cx, cy, R * 0.07 + 1, Math.floor(t / 400) % 2 ? C.RED : '#501414');
      return;
  }
}

// campaign bearing lines (THE ARGUS PARADOX, chapter 1): a dashed line from each survey buoy
export function drawCampLines(g, w, p2, u = 1) {
  const lines = w.slow && w.slow.camp && w.slow.camp.lines;
  if (!lines || !lines.length) return;
  const c = g.ctx;
  c.save(); c.setLineDash([8 * u, 6 * u]);
  for (const l of lines) {
    const a = l.b * DEG, L = 120000;
    const [x0, y0] = p2(l.x, l.y), [x1, y1] = p2(l.x + Math.sin(a) * L, l.y - Math.cos(a) * L);
    g.line(x0, y0, x1, y1, '#78f0ff', 1.6 * u);
    g.text(x0 + 6 * u, y0 + 4 * u, `${l.l} ${String(l.b).padStart(3, '0')}`, 11 * u, '#78f0ff');
  }
  c.restore();
}
