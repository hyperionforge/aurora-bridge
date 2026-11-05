// ============================================================================
// viewscreen.js - the main viewer picture (port of viewscreen.h)
// ============================================================================
// A Scene draws one of the view modes into any rectangle: the TV draws it
// full screen, the phones draw it on their VIEWER page.
import * as K from './config.js';
import { C } from './config.js';
import { DEG, clampf, wrap360, angDiff, bearingTo, distTo, fmtDist, pad3, sectorName, mmss } from './util.js';
import { dim, lerpCol, healthColor, flash } from './gfx.js';
import { drawShip, drawContact, drawPlanet, drawMarker, drawStarbase, drawNebula, factionColor, ART_CRUISER } from './ships.js';

const NSTARS = 160;
const SHIELD_DIM = [25, 55, 140], SHIELD_BRIGHT = [130, 225, 255];

export class Scene {
  constructor() {
    this.stars = [];
    for (let i = 0; i < NSTARS; i++) this.stars.push(this.starReset({}, false));
    this.lastStarHdg = 0;
    this.lastMs = performance.now();
    this.tacRange = 10000;
    this.hitFlashUntil = 0;
    this.shieldFlashUntil = 0;
  }
  starReset(s, far) {
    s.x = (Math.random() - 0.5) * 1600;
    s.y = (Math.random() - 0.5) * 900;
    s.z = far ? 700 + Math.random() * 300 : 20 + Math.random() * 980;
    return s;
  }
  onEvent(e) {
    const t = performance.now();
    if (e.flash === 'hull') this.hitFlashUntil = t + 400;
    else if (e.flash === 'shield') this.shieldFlashUntil = t + 300;
  }
  starsUpdate(dt, hdg, speed) {
    const dh = angDiff(this.lastStarHdg, hdg) * DEG;
    this.lastStarHdg = hdg;
    const c = Math.cos(-dh), s = Math.sin(-dh);
    const v = speed < 300 ? 30 + speed * 1.2 : 300 + speed * 0.25;
    for (const st of this.stars) {
      const x = st.x * c - st.z * s, z = st.x * s + st.z * c;
      st.x = x;
      st.z = z - v * dt;
      if (st.z < 10 || Math.abs(st.x / st.z) > 1.2) this.starReset(st, true);
    }
  }
  starsDraw(g, r, warp) {
    const F = r.F, cx = r.x + r.w / 2, cy = r.y + r.h / 2, ctx = g.ctx;
    for (const st of this.stars) {
      const sx = cx + st.x / st.z * F, sy = cy + st.y / st.z * F;
      if (sx < r.x || sx >= r.x + r.w || sy < r.y || sy >= r.y + r.h) continue;
      const b = clampf(255 - st.z / 4, 40, 255) | 0;
      const col = `rgb(${b},${b},${Math.min(255, b + 30)})`;
      if (warp) {
        const z2 = st.z + 140;
        g.line(cx + st.x / z2 * F, cy + st.y / z2 * F, sx, sy, col, r.u);
      } else {
        ctx.fillStyle = col;
        const sz = (st.z < 200 ? 2 : 1.2) * r.u;
        ctx.fillRect(sx, sy, sz, sz);
      }
    }
  }

  // draw the whole scene for the current game state into rect (x,y,w,h)
  draw(g, w, x, y, wd, ht, opts = {}) {
    const now = performance.now();
    let dt = (now - this.lastMs) / 1000;
    this.lastMs = now;
    if (dt > 0.2) dt = 0.2;
    const r = { x, y, w: wd, h: ht, u: ht / 416, F: (wd / 2) / Math.tan(40 * DEG) };
    g.clip(x, y, wd, ht);
    g.rect(x, y, wd, ht, C.BLACK);
    const P = w.P;
    if (now < this.hitFlashUntil) { r.x += (Math.random() * 9 - 4) * r.u; r.y += (Math.random() * 7 - 3) * r.u; }
    if (w.game === K.GS_RUN) {
      this.starsUpdate(dt, P.hdg, P.speed);
      switch (opts.view ?? w.view) {
        case K.VM_FORWARD: this.drawFwd(g, w, r); break;
        case K.VM_TACTICAL: this.drawTac(g, w, r); break;
        case K.VM_MAP: this.drawMap(g, w, r); break;
        case K.VM_TARGET: this.drawTarget(g, w, r); break;
        case K.VM_COMMS: this.drawComms(g, w, r); break;
        case K.VM_STATUS: this.drawStatus(g, w, r); break;
      }
      const u = r.u;
      if (now < this.hitFlashUntil) for (let i = 0; i < 4; i++) g.strokeRect(x + i * u, y + i * u, wd - 2 * i * u, ht - 2 * i * u, C.RED, u);
      else if (now < this.shieldFlashUntil) for (let i = 0; i < 3; i++) g.strokeRect(x + i * u, y + i * u, wd - 2 * i * u, ht - 2 * i * u, C.SKY, u);
      if (w.alert === K.AL_RED && flash(500) && (opts.view ?? w.view) !== K.VM_STATUS) {
        g.text(x + 8 * u, y + ht - 22 * u, 'RED ALERT', 18 * u, C.RED);
        g.text(x + wd - 8 * u, y + ht - 22 * u, 'RED ALERT', 18 * u, C.RED, 'right');
      }
      if (P.dock === 1) g.text(x + wd / 2, y + 80 * u, 'DOCKING...', 18 * u, C.GREEN, 'center');
      if (P.dock === 2) g.text(x + wd / 2, y + 80 * u, 'DOCKED - REPAIRING AND RESUPPLYING', 18 * u, C.GREEN, 'center');
    } else {
      this.starsUpdate(dt, this.lastStarHdg + dt * 3, w.game === K.GS_TITLE ? 40 : 10);
      this.starsDraw(g, r, false);
      if (w.game !== K.GS_TITLE) this.drawEnd(g, w, r);
      else if (opts.title) opts.title(r);
    }
    g.unclip();
  }

  // ---------------------------------------------------------------- forward view
  project(w, r, wx, wy, elev) {
    const P = w.P;
    const d = distTo(P.x, P.y, wx, wy);
    const rel = angDiff(P.hdg, bearingTo(P.x, P.y, wx, wy));
    if (Math.abs(rel) > 60) return null;
    return { d, sx: r.x + r.w / 2 + Math.tan(rel * DEG) * r.F, sy: r.y + r.h / 2 - Math.tan(elev) * r.F };
  }
  drawFwd(g, w, r) {
    const P = w.P, u = r.u, t = w.now, SCX = r.x + r.w / 2, SCY = r.y + r.h / 2;
    this.starsDraw(g, r, P.warping);
    if (w.inNebula) {
      const ctx = g.ctx;
      for (let i = 0; i < 1400; i++) {
        const h = (Math.imul(i, 2654435761) ^ Math.floor(P.hdg * 7)) >>> 0;
        ctx.fillStyle = i & 3 ? '#3c1c5a' : '#6e3c96';
        ctx.fillRect(r.x + ((h >>> 8) % 800) / 800 * r.w, r.y + ((h >>> 18) % 416) / 416 * r.h, 2 * u, 2 * u);
      }
      g.text(r.x + 8 * u, r.y + 30 * u, 'INSIDE THE KALOS NEBULA - SENSORS REDUCED', 12 * u, C.LILAC);
    }
    const objs = [];
    K.PLANETS.forEach((pl, i) => { const p = this.project(w, r, pl.x, pl.y, 0.05); if (p) objs.push({ ...p, kind: -1, i }); });
    for (const n of w.npc) {
      if (!n.alive) continue;
      const p = this.project(w, r, n.x, n.y, ((n.id * 37) % 11 - 5) * 0.025);
      if (p && p.d < 40000) objs.push({ ...p, kind: 1, n });
    }
    objs.sort((a, b) => b.d - a.d);
    for (const o of objs) {
      if (o.kind < 0) {
        const pl = K.PLANETS[o.i];
        const rad = Math.max(2, pl.r / o.d * r.F);
        drawPlanet(g, o.sx, o.sy, rad, pl.c1, pl.c2);
        if (rad < 60 * u) g.text(o.sx, o.sy + rad + 6 * u, pl.name, 11 * u, C.GREY_TXT, 'center');
      } else {
        const c = o.n;
        let sc = clampf(1100 / o.d, 0.04, 1.8) * u;
        if (c.type === K.CT_STARBASE) sc *= 1.8;
        drawContact(g, c.type, o.sx, o.sy, sc, angDiff(P.hdg, c.hdg), t, c.vis ? 1 : 0.6);
        if (c.id === P.target) g.brackets(o.sx, o.sy, sc * 70 + 10 * u, flash(300) ? C.RED : C.ORANGE);
        if (o.d < 25000) {
          const known = c.scan > 0 || c.type === K.CT_STARBASE;
          g.text(o.sx, o.sy + sc * 70 + 14 * u, w.shortName(c.id, known), 11 * u, factionColor(known ? c.faction : K.F_UNKNOWN), 'center');
          g.text(o.sx, o.sy + sc * 70 + 26 * u, fmtDist(o.d), 10 * u, C.GREY_TXT, 'center');
        }
      }
    }
    for (const tp of w.torp) {
      const p = this.project(w, r, tp.x, tp.y, 0);
      if (p && p.d > 150) {
        const rad = clampf(2500 / p.d, 2, 14) * u;
        g.circle(p.sx, p.sy, rad, tp.owner === K.US ? '#ff501e' : '#50ff78');
        g.circle(p.sx, p.sy, rad / 2 + 1, C.WHITE);
      }
    }
    const rt = w.rt;
    for (const b of w.beams) {
      const age = (rt - b.t0) / 600;
      const nf = w.n(b.from), nt = w.n(b.to);
      if (b.from === K.US && nt) {
        const p = this.project(w, r, nt.x, nt.y, ((nt.id * 37) % 11 - 5) * 0.025);
        if (p) {
          const ex = p.sx + (b.hit ? 0 : 30 * u), ey = p.sy + (b.hit ? 0 : -20 * u);
          const col = age < 0.5 ? C.ORANGE : C.RED;
          for (const bx of [r.x + r.w * 0.325, r.x + r.w * 0.675]) {
            g.line(bx, r.y + r.h - 1, ex, ey, col, 3 * u);
            g.line(bx, r.y + r.h - 1, ex, ey, C.YELLOW, u);
          }
        }
      } else if (nf && nt) {
        const p1 = this.project(w, r, nf.x, nf.y, ((nf.id * 37) % 11 - 5) * 0.025), p2 = this.project(w, r, nt.x, nt.y, ((nt.id * 37) % 11 - 5) * 0.025);
        if (p1 && p2) g.line(p1.sx, p1.sy, p2.sx + (b.hit ? 0 : 12 * u), p2.sy, nf.faction === K.F_FRIEND ? C.SKY : '#50ff78', 1.5 * u);
      } else if (b.to === K.US && nf) {
        const p = this.project(w, r, nf.x, nf.y, ((nf.id * 37) % 11 - 5) * 0.025);
        if (p) g.line(p.sx, p.sy, SCX + (b.hit ? 0 : 260 * u), r.y + r.h - 1, '#50ff78', 3 * u);
      }
    }
    for (const b of w.booms) {
      const p = this.project(w, r, b.x, b.y, 0);
      if (!p) continue;
      const tt = (rt - b.t0) / (b.size === 1 ? 1500 : 600);
      if (tt > 1 || tt < 0) continue;
      const R = clampf((b.size === 1 ? 9000 : 2500) / clampf(p.d, 300, 1e6), 4, 160) * (0.3 + tt) * u;
      if (b.size === 2) g.circle(p.sx, p.sy, R, C.SKY, false, 1.5 * u);
      else {
        g.circle(p.sx, p.sy, R, tt < 0.3 ? C.WHITE : tt < 0.6 ? C.YELLOW : C.ORANGE);
        g.circle(p.sx, p.sy, R + 4 * u, C.RED, false, 1.5 * u);
      }
    }
    // HUD
    for (let a = -40; a <= 40; a += 5) {
      const h = wrap360(P.hdg + a);
      const x = SCX + Math.tan(a * DEG) * r.F;
      g.rect(x, r.y + 4 * u, u, (Math.round(h) % 10 === 0 ? 8 : 4) * u, C.GRID);
    }
    g.text(SCX, r.y + 14 * u, pad3(P.hdg), 11 * u, C.SKY, 'center');
    g.rect(SCX - 20 * u, SCY, 12 * u, u, C.GRID); g.rect(SCX + 9 * u, SCY, 12 * u, u, C.GRID);
    g.rect(SCX, SCY - 20 * u, u, 12 * u, C.GRID); g.rect(SCX, SCY + 9 * u, u, 12 * u, C.GRID);
    if (P.warping) g.text(SCX, r.y + 34 * u, 'WARP ' + P.warpSet, 30 * u, Math.floor(performance.now() / 300) % 2 ? C.SKY : C.WHITE, 'center');
    else if (P.warpSet && P.warpCharge > 0) {
      g.text(SCX, r.y + 36 * u, 'WARP DRIVE ENGAGING', 18 * u, C.SKY, 'center');
      g.progress(SCX - 100 * u, r.y + 60 * u, 200 * u, 8 * u, P.warpCharge, C.SKY);
    }
    if (w.targetValid()) {
      const tn = w.n(P.target);
      const rel = angDiff(P.hdg, bearingTo(P.x, P.y, tn.x, tn.y));
      if (Math.abs(rel) > 40) {
        const ax = rel < 0 ? r.x + 14 * u : r.x + r.w - 14 * u, ay = SCY, dx = (rel < 0 ? -10 : 10) * u;
        g.tri(ax + dx, ay, ax - dx, ay - 10 * u, ax - dx, ay + 10 * u, C.RED);
        g.text(rel < 0 ? ax + 30 * u : ax - 30 * u, ay + 14 * u, fmtDist(distTo(P.x, P.y, tn.x, tn.y)), 11 * u, C.RED, 'center');
      }
    }
  }

  // ---------------------------------------------------------------- overhead tactical
  drawTac(g, w, r) {
    const P = w.P, u = r.u, t = w.now, rt = w.rt;
    let want = 6000;
    for (const n of w.npc)
      if (n.alive && n.vis && ((n.faction === K.F_HOSTILE && n.ai !== 6) || n.id === P.target)) want = Math.max(want, distTo(P.x, P.y, n.x, n.y) * 1.15);
    want = clampf(want, 6000, 24000);
    this.tacRange += (want - this.tacRange) * 0.05;
    const R2 = 190 * u, k = R2 / this.tacRange, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const w2t = (wx, wy) => [cx + (wx - P.x) * k, cy + (wy - P.y) * k];
    const step = this.tacRange > 15000 ? 10000 : 5000;
    for (let gx = Math.floor((P.x - r.w / 2 / k) / step) * step; gx < P.x + r.w / 2 / k; gx += step) g.rect(cx + (gx - P.x) * k, r.y, 1, r.h, '#10162c');
    for (let gy = Math.floor((P.y - r.h / 2 / k) / step) * step; gy < P.y + r.h / 2 / k; gy += step) g.rect(r.x, cy + (gy - P.y) * k, r.w, 1, '#10162c');
    g.circle(cx, cy, R2 / 2, C.GRID, false, u);
    g.circle(cx, cy, R2, C.GRID, false, u);
    g.text(cx + R2 + 4 * u, cy - 6 * u, fmtDist(this.tacRange), 11 * u, C.GRID);
    g.text(cx + R2 / 2 + 4 * u, cy - 6 * u, fmtDist(this.tacRange / 2), 11 * u, C.GRID);
    const [nx, ny] = w2t(K.NEB_X, K.NEB_Y);
    drawNebula(g, nx, ny, K.NEB_R * k, 500, '#46235f');
    for (const pl of K.PLANETS) {
      const [sx, sy] = w2t(pl.x, pl.y);
      const pr = Math.max(3, pl.r * k);
      if (sx + pr < r.x || sx - pr > r.x + r.w || sy + pr < r.y || sy - pr > r.y + r.h) continue;
      drawPlanet(g, sx, sy, pr, pl.c1, pl.c2);
      g.text(sx, sy + pr + 4 * u, pl.name, 11 * u, C.GREY_TXT, 'center');
    }
    if (P.wpValid) {
      const [sx, sy] = w2t(P.wpx, P.wpy);
      if (sx > r.x + 10 && sx < r.x + r.w - 10 && sy > r.y + 10 && sy < r.y + r.h - 10) {
        const d8 = 8 * u;
        g.line(sx - d8, sy, sx, sy - d8, C.VIOLET, 1.5 * u); g.line(sx, sy - d8, sx + d8, sy, C.VIOLET, 1.5 * u);
        g.line(sx + d8, sy, sx, sy + d8, C.VIOLET, 1.5 * u); g.line(sx, sy + d8, sx - d8, sy, C.VIOLET, 1.5 * u);
        g.text(sx, sy + 12 * u, 'WAYPOINT', 11 * u, C.VIOLET, 'center');
      } else {
        const a = bearingTo(P.x, P.y, P.wpx, P.wpy) * DEG;
        const ex = cx + Math.sin(a) * (R2 + 10 * u), ey = cy - Math.cos(a) * (R2 + 10 * u);
        g.circle(ex, ey, 4 * u, C.VIOLET);
        g.text(ex, ey + 8 * u, 'WP', 11 * u, C.VIOLET, 'center');
      }
    }
    const trails = (w.slow && w.slow.trails) || {};
    for (const n of w.npc) {
      if (!n.alive || !n.vis) continue;
      const known = n.scan > 0 || n.type === K.CT_STARBASE;
      const fc = factionColor(known ? n.faction : K.F_UNKNOWN);
      const tr = trails[n.id] || [];
      for (let i = 0; i < tr.length; i += 2) { const [sx, sy] = w2t(tr[i], tr[i + 1]); g.rect(sx, sy, 1.5 * u, 1.5 * u, dim(fc, 0.25 + 0.75 * i / tr.length)); }
      const [sx, sy] = w2t(n.x, n.y);
      if (sx < r.x - 40 || sx > r.x + r.w + 40 || sy < r.y - 40 || sy > r.y + r.h + 40) continue;
      const sc = (n.type === K.CT_STARBASE ? clampf(1500 * k / u / 70, 0.25, 1.2) : 0.28) * u;
      drawContact(g, n.type, sx, sy, sc, n.hdg, t);
      g.text(sx, sy + 26 * u, w.shortName(n.id, known), 11 * u, fc, 'center');
      if (n.scan >= 2 && n.type !== K.CT_ANOMALY) {
        g.rect(sx - 15 * u, sy + 40 * u, 30 * u, 3 * u, C.SEG_OFF);
        g.rect(sx - 15 * u, sy + 40 * u, 30 * u * n.hull / 100, 3 * u, healthColor(n.hull));
        if (n.shMax > 0) g.rect(sx - 15 * u, sy + 44 * u, 30 * u * n.shields / n.shMax, 2 * u, C.SKY);
      }
      if (n.id === P.target) g.brackets(sx, sy, 24 * u, flash(300) ? C.RED : C.ORANGE);
    }
    const pt = (w.slow && w.slow.ptrail) || [];
    for (let i = Math.max(0, pt.length - 40); i < pt.length; i += 2) { const [sx, sy] = w2t(pt[i], pt[i + 1]); g.rect(sx, sy, 1.5 * u, 1.5 * u, C.SKY); }
    const pr = K.PH_RANGE * k;
    for (const s of [-1, 1]) {
      const a = (P.hdg + s * K.PH_ARC) * DEG;
      g.line(cx, cy, cx + Math.sin(a) * pr, cy - Math.cos(a) * pr, '#3c2814', u);
    }
    g.circle(cx, cy, pr, '#3c2814', false, u);
    if (w.shieldsUp() || P.shieldRaise > 0) {
      const base = [270, 90, 180, 0];
      for (let q = 0; q < 4; q++) {
        const a = wrap360(base[q] + P.hdg);
        const tt = clampf(P.shield[q] / 100, 0, 1) * P.shieldRaise;
        if (tt < 0.02) continue;
        const col = performance.now() < this.shieldFlashUntil ? C.WHITE : lerpCol(SHIELD_DIM, SHIELD_BRIGHT, tt);
        g.arcSeg(cx, cy, 36 * u, (33 - tt * 4) * u, wrap360(a - 40), wrap360(a + 40), col);
      }
    }
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, 0.3 * u, P.hdg);
    for (const tp of w.torp) {
      const [sx, sy] = w2t(tp.x, tp.y);
      g.circle(sx, sy, 3 * u, tp.owner === K.US ? '#ff501e' : '#50ff78');
      g.circle(sx, sy, u, C.WHITE);
    }
    for (const b of w.beams) {
      const nf = w.n(b.from), nt = w.n(b.to);
      const [x0, y0] = b.from === K.US ? [cx, cy] : nf ? w2t(nf.x, nf.y) : [cx, cy];
      let [x1, y1] = b.to === K.US ? [cx, cy] : nt ? w2t(nt.x, nt.y) : [cx, cy];
      if (!b.hit) { x1 += 14 * u; y1 -= 10 * u; }
      const col = b.from === K.US ? C.ORANGE : '#50ff78';
      g.line(x0, y0, x1, y1, col, 2 * u);
      g.line(x0, y0, x1, y1, Math.floor((rt - b.t0) / 60) % 2 ? C.YELLOW : col, u);
    }
    for (const b of w.booms) {
      const tt = (rt - b.t0) / (b.size === 1 ? 1500 : 600);
      if (tt > 1 || tt < 0) continue;
      const [sx, sy] = w2t(b.x, b.y);
      const R = (b.size === 1 ? 30 : 10) * (0.3 + tt) * u;
      if (b.size === 2) g.circle(sx, sy, R * 2, C.SKY, false, 1.5 * u);
      else { g.circle(sx, sy, R, tt < 0.3 ? C.WHITE : tt < 0.6 ? C.YELLOW : C.ORANGE); g.circle(sx, sy, R + 3 * u, C.RED, false, 1.5 * u); }
    }
    g.text(r.x + 8 * u, r.y + 6 * u, 'N ^  OVERHEAD TACTICAL', 12 * u, C.GREY_TXT);
  }

  // ---------------------------------------------------------------- sector map
  drawMap(g, w, r) {
    const P = w.P, u = r.u;
    const S = r.h - 16 * u, mx = r.x + (r.w - S) / 2, my = r.y + 8 * u, k = S / K.SECTOR;
    g.strokeRect(mx, my, S, S, C.GRID, u);
    for (let i = 1; i < 10; i++) { g.rect(mx + i * S / 10, my, 1, S, '#121832'); g.rect(mx, my + i * S / 10, S, 1, '#121832'); }
    for (let i = 0; i < 10; i++) {
      g.text(mx + i * S / 10 + S / 20, my + 3 * u, String.fromCharCode(65 + i), 11 * u, C.GRID, 'center');
      g.text(mx + 3 * u, my + i * S / 10 + S / 20 - 6 * u, String(i + 1), 11 * u, C.GRID);
    }
    drawNebula(g, mx + K.NEB_X * k, my + K.NEB_Y * k, K.NEB_R * k, 600, '#5a2d82');
    g.text(mx + K.NEB_X * k, my + (K.NEB_Y + K.NEB_R) * k + 4 * u, 'KALOS NEBULA', 11 * u, '#8250aa', 'center');
    for (const pl of K.PLANETS) {
      g.circle(mx + pl.x * k, my + pl.y * k, 4 * u, pl.c1);
      g.text(mx + pl.x * k + 7 * u, my + pl.y * k - 6 * u, pl.name, 11 * u, C.GREY_TXT);
    }
    for (const m of w.M.mk) drawMarker(g, mx + m.x * k, my + m.y * k, m.kind, m.r * k, 11 * u);
    g.circle(mx + P.x * k, my + P.y * k, w.sensorRange * k, '#1e3c5a', false, u);
    const pt = (w.slow && w.slow.ptrail) || [];
    for (let i = 0; i < pt.length; i += 2) g.rect(mx + pt[i] * k, my + pt[i + 1] * k, 1.5 * u, 1.5 * u, dim(C.SKY, 0.3 + 0.7 * i / pt.length));
    if (P.wpValid) {
      g.line(mx + P.x * k, my + P.y * k, mx + P.wpx * k, my + P.wpy * k, '#50468c', u);
      g.strokeRect(mx + P.wpx * k - 4 * u, my + P.wpy * k - 4 * u, 9 * u, 9 * u, C.VIOLET, 1.5 * u);
    }
    for (const n of w.npc) {
      if (!n.alive || !n.vis) continue;
      const x = mx + n.x * k, y = my + n.y * k;
      const known = n.scan > 0 || n.type === K.CT_STARBASE;
      const col = factionColor(known ? n.faction : K.F_UNKNOWN);
      if (n.type === K.CT_STARBASE) drawStarbase(g, x, y, 0.12 * u, w.now / 50, w.now);
      else g.circle(x, y, 3 * u, col);
      g.text(x + 6 * u, y + 3 * u, w.shortName(n.id, known), 11 * u, col);
    }
    drawShip(g, ART_CRUISER, C.SKY, mx + P.x * k, my + P.y * k, 0.12 * u, P.hdg);
    const lw = mx - r.x - 16 * u;
    if (lw > 120 * u) {
      g.text(r.x + 12 * u, r.y + 12 * u, 'AURORA', 22 * u, C.SKY);
      g.text(r.x + 12 * u, r.y + 40 * u, 'SECTOR ' + sectorName(P.x, P.y), 18 * u, C.SKY);
      g.wrap(r.x + 12 * u, r.y + 70 * u, lw, 'PATH SHOWN FOR THE LAST 2 MINUTES', 11 * u, C.GREY_TXT);
    }
  }

  // ---------------------------------------------------------------- target view
  drawTarget(g, w, r) {
    const P = w.P, u = r.u;
    const id = w.viewId < K.MAX_CONTACTS ? w.viewId : P.target;
    const c = w.n(id);
    if (!c || !c.vis) {
      g.text(r.x + r.w / 2, r.y + r.h / 2 - 14 * u, 'NO TARGET ON SCREEN', 28 * u, C.GREY_TXT, 'center');
      return;
    }
    const known = c.scan > 0 || c.type === K.CT_STARBASE;
    const mx = r.x + r.w * 0.29, my = r.y + r.h / 2;
    for (let rr = 50; rr <= 200; rr += 50) g.circle(mx, my, rr * u, C.GRID, false, u);
    const sy = my - 190 * u + ((performance.now() / 12) % 380) * u;
    g.rect(mx - 190 * u, sy, 380 * u, u, '#28508c');
    drawContact(g, c.type, mx, my, (c.type === K.CT_STARBASE ? 2.2 : 1.9) * u, performance.now() / 60, w.now, c.alive ? 1 : 0.4);
    if (!known) {
      const ctx = g.ctx;
      ctx.fillStyle = C.GREY;
      for (let i = 0; i < 500; i++) ctx.fillRect(mx - 150 * u + Math.random() * 300 * u, my - 150 * u + Math.random() * 300 * u, 1.5 * u, 1.5 * u);
    }
    const x = r.x + r.w * 0.59, tw = r.x + r.w - x - 10 * u;
    let y = r.y + 30 * u;
    g.textFit(x, y, w.shortName(id, known), 30 * u, factionColor(known ? c.faction : K.F_UNKNOWN), 'left', tw);
    y += 38 * u;
    g.text(x, y, w.contactName(id, known), 13 * u, C.PEACH); y += 18 * u;
    g.text(x, y, `${known ? K.CT_NAME[c.type] : 'UNKNOWN TYPE'}  ${K.FACTION_NAME[known ? c.faction : K.F_UNKNOWN]}`, 13 * u, C.GREY_TXT); y += 28 * u;
    g.text(x, y, `RANGE ${fmtDist(distTo(P.x, P.y, c.x, c.y))}  BEARING ${pad3(bearingTo(P.x, P.y, c.x, c.y))}`, 18 * u, C.SKY); y += 24 * u;
    g.text(x, y, `HEADING ${pad3(c.hdg)}  SPEED ${Math.round(c.speed)}`, 18 * u, C.SKY); y += 36 * u;
    if (c.scan >= 2 && c.type !== K.CT_ANOMALY) {
      const nm = ['HULL', 'SHIELDS', 'ENGINES', 'WEAPONS'];
      const v = [c.hull, c.shMax > 0 ? c.shields * 100 / c.shMax : 0, c.eng, c.wpn];
      const bw = Math.min(170 * u, tw - 150 * u);
      for (let i = 0; i < 4; i++) {
        g.text(x, y, nm[i], 17 * u, C.PEACH);
        g.segBar(x + 90 * u, y + 2 * u, bw, 15 * u, v[i], i === 1 ? C.SKY : healthColor(v[i]), 16);
        g.text(x + 100 * u + bw, y, Math.round(v[i]) + '%', 17 * u, C.PEACH);
        y += 26 * u;
      }
      g.text(x, y + 4 * u, 'SHIELD FREQUENCY ' + K.FREQ_CHAR[c.freq], 18 * u, C.GREEN);
    } else if (c.type === K.CT_ANOMALY) {
      g.wrap(x, y, tw, c.scan >= 2 ? 'TETRYON EMISSIONS, UNSTABLE SUBSPACE FOLD. DATA SENT TO FLEET COMMAND.' : 'FULL SCAN NEEDED TO ANALYSE.', 17 * u, c.scan >= 2 ? C.LILAC : C.GREY_TXT);
    } else if (flash(500)) g.text(x, y, 'DETAILED SCAN REQUIRED', 18 * u, C.YELLOW);
    if (!c.alive) g.text(mx, my + 120 * u, 'DESTROYED', 28 * u, C.RED, 'center');
  }

  // ---------------------------------------------------------------- incoming transmission
  // the comms station on the big screen: message log, who's calling, who's in range
  drawComms(g, w, r) {
    const u = r.u, msgs = w.msgs, P = w.P;
    const fromName = (f) => (f < K.MAX_CONTACTS ? w.shortName(f) : f === K.FROM_COMMAND ? 'FLEET COMMAND' : f === K.FROM_COMPUTER ? 'COMPUTER' : 'BRIDGE');
    const pad = 16 * u, lw = r.w * 0.6;
    // ---- message log (left)
    let x = r.x + pad, y = r.y + 12 * u;
    g.header(x, y, lw - pad, 'MESSAGE LOG', C.LILAC, 22 * u);
    y += 34 * u;
    if (!msgs.length) g.text(x, y, 'NO MESSAGES YET', 16 * u, C.GREY_TXT);
    msgs.forEach((m, i) => {
      if (y > r.y + r.h - 30 * u) return;
      const col = i === 0 ? K.MSG_COL[m.col % 4] : dim(K.MSG_COL[m.col % 4], 0.7);
      g.text(x, y, fromName(m.from), 14 * u, i === 0 ? C.ORANGE : C.TAN);
      y += 18 * u;
      for (const l of g.wrapLines(m.text, lw - pad * 2 - 10 * u, (i === 0 ? 20 : 16) * u)) {
        if (y > r.y + r.h - 22 * u) break;
        g.text(x + 10 * u, y, l, (i === 0 ? 20 : 16) * u, col);
        y += (i === 0 ? 24 : 19) * u;
      }
      y += 8 * u;
    });
    // ---- who is calling (right, top)
    const rx = r.x + lw + pad, rw = r.x + r.w - rx - pad;
    y = r.y + 12 * u;
    const m = msgs.find((q) => q.from < K.MAX_CONTACTS || q.from === K.FROM_COMMAND);
    const fresh = m && msgs.indexOf(m) === 0;
    g.header(rx, y, rw, fresh ? 'INCOMING TRANSMISSION' : 'LAST TRANSMISSION', fresh && flash(600) ? C.ORANGE : C.SKY, 22 * u);
    y += 34 * u;
    const bh = Math.min(170 * u, r.h * 0.38), bw = rw;
    g.ctx.strokeStyle = C.GRID; g.ctx.lineWidth = 1.5 * u;
    g.ctx.beginPath(); g.ctx.roundRect(rx, y, bw, bh, 16 * u); g.ctx.stroke();
    const px = rx + bh / 2 + 8 * u, py = y + bh / 2;
    if (m) {
      g.clip(rx + 2, y + 2, bw - 4, bh - 4);
      if (m.from < K.MAX_CONTACTS) {
        const type = w.typeOf(m.from);
        drawContact(g, type, px, py, (type === K.CT_STARBASE || type === K.CT_ANOMALY ? 1.2 : 0.95) * bh / 220, (performance.now() / 40) % 360, w.now);
      } else { // fleet emblem: an original five-point star in a ring
        const R = bh * 0.36;
        g.circle(px, py, R, '#14285a');
        g.circle(px, py, R, C.SKY, false, 1.5 * u);
        for (let i = 0; i < 5; i++) {
          const a = (i * 72 - 90) * DEG, ox = px + Math.cos(a) * R * 0.75, oy = py + Math.sin(a) * R * 0.75;
          for (const s2 of [-1, 1]) { const b2 = a + s2 * 0.6283; g.tri(px, py, ox, oy, px + Math.cos(b2) * R * 0.3, py + Math.sin(b2) * R * 0.3, C.SKY); }
        }
      }
      g.unclip();
      const tx = rx + bh + 16 * u, tw = rx + bw - tx - 10 * u;
      g.textFit(tx, y + 14 * u, m.from < K.MAX_CONTACTS ? w.contactName(m.from, true) : 'FLEET COMMAND', 22 * u, C.PEACH, 'left', tw);
      if (m.from < K.MAX_CONTACTS) {
        const n = w.n(m.from);
        if (n) g.text(tx, y + 44 * u, `${K.FACTION_NAME[w.known(m.from) ? n.faction : K.F_UNKNOWN]}   ${fmtDist(distTo(P.x, P.y, n.x, n.y))}`, 14 * u, factionColor(w.known(m.from) ? n.faction : K.F_UNKNOWN));
      }
      if (fresh && m.opt && m.opt.length) {
        let oy = y + 70 * u;
        g.text(tx, oy, 'AWAITING REPLY:', 13 * u, C.GREY_TXT);
        for (const o of m.opt) { oy += 19 * u; g.textFit(tx, oy, '> ' + K.OPT_NAME[o], 15 * u, C.PEACH, 'left', tw); }
      }
    } else g.text(rx + bw / 2, py - 10 * u, 'NO TRANSMISSIONS', 18 * u, C.GREY_TXT, 'center');
    y += bh + 16 * u;
    // ---- contacts in range (right, bottom)
    g.header(rx, y, rw, 'CONTACTS IN RANGE', C.LILAC, 22 * u);
    y += 32 * u;
    const list = w.contacts().filter((c) => c.alive).sort((a, b) => w.range(a) - w.range(b));
    if (!list.length) g.text(rx, y, 'NONE', 15 * u, C.GREY_TXT);
    for (const c of list) {
      if (y > r.y + r.h - 22 * u) break;
      g.textFit(rx, y, w.shortName(c.id, c.known), 17 * u, factionColor(c.faction), 'left', rw * 0.6);
      g.text(rx + rw, y, fmtDist(w.range(c)), 16 * u, C.GREY_TXT, 'right');
      y += 23 * u;
    }
  }

  // ---------------------------------------------------------------- ship status (the captain's readout)
  drawStatus(g, w, r) {
    const P = w.P, u = r.u, s = w.slow, pad = 16 * u;
    const up = w.shieldsUp();
    const lw = (r.w - pad * 3) / 2;
    const fs = 14 * u, hh = 18 * u, row = 17 * u;
    let x = r.x + pad, y = r.y + 10 * u;
    g.header(x, y, lw, 'SHIP', C.PEACH, hh);
    y += hh + 6 * u;
    g.text(x, y, `HULL ${Math.ceil(P.hull)}%`, fs, healthColor(P.hull));
    g.bar(x + 100 * u, y + 4 * u, lw - 100 * u, 9 * u, P.hull, healthColor(P.hull));
    y += row;
    const qw = (lw - 18 * u) / 4;
    for (let q = 0; q < 4; q++) {
      g.text(x + q * (qw + 6 * u), y, `${K.QUAD_NAME[q]} ${Math.round(P.shield[q])}`, 14 * u, up ? C.SKY : C.GREY_TXT);
      g.bar(x + q * (qw + 6 * u), y + 16 * u, qw, 4 * u, P.shield[q] / 1.6, up ? C.SKY : C.GREY);
    }
    y += row + 6 * u;
    g.text(x, y, `ENERGY ${Math.round(P.energy)}  ${P.energyRate >= 0 ? '+' : ''}${P.energyRate.toFixed(1)}/S`, fs, P.energy > 300 ? C.SKY : C.ORANGE);
    g.bar(x + 200 * u, y + 4 * u, lw - 200 * u, 9 * u, P.energy / 10, P.energy > 300 ? C.SKY : P.energy > 120 ? C.YELLOW : C.RED);
    y += row;
    const ap = P.autopilot === K.AP_WAYPOINT ? 'AUTOPILOT: WAYPOINT' : P.autopilot === K.AP_TARGET ? 'AUTOPILOT: INTERCEPT' : 'MANUAL HELM';
    g.textFit(x, y, `HDG ${pad3(P.hdg)}  ${P.warping ? 'WARP ' + P.warpSet : Math.round(P.speed) + ' KM/S'}  ${ap}${P.evasive ? '  EVASIVE' : ''}`, fs, C.SKY, 'left', lw);
    y += row + 4 * u;
    g.header(x, y, lw, 'SYSTEMS', C.TAN, hh);
    y += hh + 3 * u;
    g.text(x + lw * 0.55, y, 'PWR      HEAT     TEAM', 11 * u, C.GREY_TXT);
    y += 13 * u;
    for (let i = 0; i < K.NSYS; i++) {
      const col = healthColor(P.health[i]);
      g.text(x, y, K.SYS_NAME[i], 13 * u, col);
      g.bar(x + 90 * u, y + 4 * u, lw * 0.55 - 100 * u, 8 * u, P.health[i], col);
      g.text(x + lw * 0.55, y, `${P.power[i]}%`, 14 * u, C.PEACH);
      g.text(x + lw * 0.55 + 52 * u, y, `${Math.round(P.heat[i])}%`, 14 * u, P.heat[i] > 75 ? C.RED : C.PEACH);
      for (let t = 0; t < 2; t++) if (P.team[t] === i) g.text(x + lw * 0.55 + 106 * u + t * 24 * u, y, 'T' + (t + 1), 14 * u, C.YELLOW);
      y += 16 * u;
    }
    y += 4 * u;
    g.header(x, y, lw, 'WEAPONS', C.RED, hh);
    y += hh + 4 * u;
    g.text(x, y, `PHASERS ${P.phCharge >= 1 ? 'READY' : 'CHARGING'}   FREQ ${K.FREQ_CHAR[P.phFreq]}   ${P.autoFire ? 'AUTO-FIRE' : ''}`, fs, P.phCharge >= 1 ? C.ORANGE : C.YELLOW);
    y += row;
    const ts = ['EMPTY', 'LOADING', 'READY', 'UNLOADING'];
    g.text(x, y, `TUBES ${ts[P.tubeState[0]]} / ${ts[P.tubeState[1]]}   TORPEDOES P${P.torps[0]} Q${P.torps[1]}`, fs, C.LILAC);
    y += row;
    g.textFit(x, y, w.targetValid() ? `TARGET ${w.shortName(P.target)} - AIMING AT ${K.SUB_NAME[P.sub]}` : 'NO TARGET', fs, w.targetValid() ? C.RED : C.GREY_TXT, 'left', lw);
    y += row + 4 * u;
    g.header(x, y, lw, 'MISSION', C.VIOLET, hh);
    y += hh + 4 * u;
    g.text(x, y, `${K.MT_NAME[w.M.type]} - ${K.DIFF_NAME[w.M.diff]}   T+${mmss(w.missionT)}`, fs, C.PEACH);
    y += row;
    g.wrap(x, y, lw, w.M.objective, fs, C.ORANGE, 1.2, 2);

    // ---- contacts (right, top)
    const rx = r.x + pad * 2 + lw, rw = r.x + r.w - pad - rx;
    y = r.y + 10 * u;
    g.header(rx, y, rw, 'CONTACTS', C.SKY, hh);
    y += hh + 8 * u;
    const R = Math.min(78 * u, rw * 0.22), cx = rx + R + 2 * u, cy = y + R, range = 15000;
    g.circle(cx, cy, R, C.GRID, false, u);
    g.circle(cx, cy, R / 2, C.GRID, false, u);
    g.text(cx - R, cy + R - 12 * u, '15K', 12 * u, C.GRID);
    const ids = w.npc.filter((n) => n.alive && n.vis).map((n) => n.id);
    for (const id of ids) {
      const n = w.n(id);
      if (distTo(P.x, P.y, n.x, n.y) > range) continue;
      g.circle(cx + (n.x - P.x) / range * R, cy + (n.y - P.y) / range * R, 3.5 * u, factionColor(w.known(id) ? n.faction : K.F_UNKNOWN));
    }
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, 0.14 * u, P.hdg);
    const lx = rx + 2 * R + 18 * u, lwid = rx + rw - lx, threat = (s && s.threat) || {};
    let ly = y - 2 * u, shown = 0;
    for (const id of ids) {
      if (shown >= 6) break;
      if (id === K.ID_BONUS && !w.known(id)) continue;
      const n = w.n(id), k = w.known(id), tt = threat[id] || '';
      g.textFit(lx, ly, w.shortName(id, k), 15 * u, factionColor(k ? n.faction : K.F_UNKNOWN), 'left', lwid - 56 * u);
      g.text(lx + lwid, ly, fmtDist(distTo(P.x, P.y, n.x, n.y)), 14 * u, C.GREY_TXT, 'right');
      g.textFit(lx, ly + 15 * u, tt, 12 * u, tt.startsWith('ATTACKING') ? C.RED : C.GREY_TXT, 'left', lwid - 56 * u);
      if (n.scan >= 2 && n.type !== K.CT_ANOMALY && n.type !== K.CT_BUOY) g.bar(lx + lwid - 50 * u, ly + 19 * u, 50 * u, 5 * u, n.hull, healthColor(n.hull));
      ly += 28 * u;
      shown++;
    }
    // ---- first officer (right, bottom)
    y = Math.max(cy + R, ly) + 16 * u;
    g.header(rx, y, rw, 'FIRST OFFICER', C.LILAC, hh);
    y += hh + 10 * u;
    const adv = (s && s.advice) || [];
    for (const a of adv) {
      if (y > r.y + r.h - 34 * u) break;
      g.textFit(rx, y, a.text, 16 * u, a.col, 'left', rw);
      if (a.otext) g.textFit(rx + 12 * u, y + 19 * u, 'SUGGEST: ' + a.otext, 13 * u, C.GREY_TXT, 'left', rw - 12 * u);
      y += 42 * u;
    }
  }

  // ---------------------------------------------------------------- mission over
  drawEnd(g, w, r) {
    const u = r.u, s = w.slow, M = w.M, P = w.P, cx = r.x + r.w / 2;
    const won = w.game === K.GS_WIN;
    const t = s ? (w.now - s.endAt) / 1000 : 9;
    if (M.fail === K.FAIL_SHIP && t < 2.5) {
      const rr = t * 160 * u;
      g.circle(cx, r.y + r.h / 2, rr, t < 0.4 ? C.WHITE : t < 1.2 ? C.YELLOW : C.ORANGE);
      g.circle(cx, r.y + r.h / 2, rr + 8 * u, C.RED, false, 2 * u);
    }
    g.text(cx, r.y + 40 * u, won ? 'MISSION COMPLETE' : K.FAIL_TEXT[M.fail] || 'MISSION FAILED', 50 * u, won ? C.GREEN : C.RED, 'center', true);
    g.text(cx, r.y + 104 * u, `${K.MT_NAME[M.type]} - ${K.DIFF_NAME[M.diff]}`, 18 * u, C.PEACH, 'center');
    if (!won) g.text(cx, r.y + 128 * u, M.fail === K.FAIL_SHIP ? 'ALL HANDS LOST.' : 'MISSION FAILED.', 18 * u, C.PEACH, 'center');
    let y = r.y + 166 * u;
    const line = (txt, col) => { g.text(cx, y, txt, 19 * u, col, 'center'); y += 28 * u; };
    line(`MISSION TIME   ${mmss(w.missionT)}`, C.SKY);
    line(`ENEMIES DEFEATED  ${w.kills}`, C.SKY);
    if (M.fr !== K.NO_ID) line(`FREIGHTER  ${M.frLost ? 'LOST' : 'SAVED'}`, M.frLost ? C.RED : C.GREEN);
    else if (M.type === K.MT_DEFEND) line(`WAVES DEFEATED  ${M.wave}/${M.waves}`, C.SKY);
    line(`BONUS OBJECTIVE  ${w.bonus ? 'COMPLETE' : 'MISSED'}`, w.bonus ? C.GREEN : C.GREY_TXT);
    line(`HULL INTEGRITY  ${Math.round(P.hull)}%`, healthColor(P.hull));
    if (s && s.captain && s.ord.issued) line(`CAPTAIN'S ORDERS CARRIED OUT  ${s.ord.done}/${s.ord.issued}  (AVG ${s.ord.avg.toFixed(0)}s)`, C.LILAC);
  }
}

// ---------------------------------------------------------------- the TV layout (top bar, scene, bottom bar)
const ALERT_COL = [C.GREEN, C.YELLOW, C.RED];
export function drawViewer(g, w, scene, opts = {}) {
  const W = g.W, H = g.H, u = H / 540;
  const top = 40 * u, bot = 40 * u;
  // top bar
  let ac = ALERT_COL[w.alert];
  if (w.alert === K.AL_RED && !flash(500)) ac = C.RED_DIM;
  g.pill(0, 2 * u, 190 * u, top - 6 * u, ac, 'l');
  g.text(98 * u, 7 * u, w.alert === K.AL_RED ? 'RED ALERT' : w.alert === K.AL_YELLOW ? 'YELLOW ALERT' : 'CONDITION GREEN', 22 * u, C.BLACK, 'center', true);
  if (w.game === K.GS_RUN) {
    g.textFit(200 * u, 3 * u, w.M.objective, 17 * u, C.ORANGE, 'left', W - 210 * u);
    g.textFit(200 * u, 21 * u, w.bonus ? 'BONUS COMPLETE: ANOMALY DATA RECOVERED' : K.BONUS_TEXT, 13 * u, w.bonus ? C.GREEN_DIM : C.LILAC, 'left', W - 210 * u);
  } else g.text(200 * u, 7 * u, 'STARSHIP AURORA - MAIN VIEWER', 22 * u, C.ORANGE);
  scene.draw(g, w, 0, top, W, H - top - bot, opts);
  // bottom bar
  const y = H - bot + 4 * u;
  if (w.game === K.GS_RUN) {
    const P = w.P;
    g.text(6 * u, y, 'HDG ' + pad3(P.hdg), 20 * u, C.SKY);
    g.text(6 * u, y + 21 * u, P.warping ? 'WARP ' + P.warpSet : Math.round(P.speed) + ' KM/S', 12 * u, C.SKY);
    g.text(120 * u, y, 'ENERGY', 12 * u, C.PEACH);
    g.segBar(120 * u, y + 16 * u, 150 * u, 14 * u, P.energy / 10, P.energy > 300 ? C.SKY : P.energy > 120 ? C.YELLOW : C.RED, 12);
    g.text(290 * u, y, `HULL ${Math.ceil(P.hull)}%`, 20 * u, healthColor(P.hull));
    g.text(290 * u, y + 21 * u, w.shieldsUp() ? 'SHIELDS UP' : P.shieldRaise > 0 ? 'SHIELDS RAISING' : 'SHIELDS DOWN', 12 * u, w.shieldsUp() ? C.SKY : C.GREY_TXT);
    for (let q = 0; q < 4; q++) g.text(420 * u + q * 50 * u, y + 8 * u, K.QUAD_NAME[q][0] + Math.round(P.shield[q]), 15 * u, w.shieldsUp() ? C.SKY : C.GREY, 'left');
    g.text(W - 8 * u, y + 2 * u, 'VIEW: ' + K.VM_NAME[w.view], 16 * u, C.ORANGE, 'right');
    g.text(W - 8 * u, y + 21 * u, `T+${mmss(w.missionT)}   ${K.MT_NAME[w.M.type]}`, 12 * u, C.GREY_TXT, 'right');
  } else {
    g.text(8 * u, y + 8 * u, 'STARSHIP AURORA BRIDGE SIMULATOR - MAIN VIEWER', 14 * u, C.GREY_TXT);
  }
}

// title screen content for the TV while the crew is in the lobby
export function drawTitleCard(g, w, r, joinUrl) {
  const u = r.u, cx = r.x + r.w / 2, lb = w.lobby;
  drawShip(g, ART_CRUISER, C.SKY, cx, r.y + 78 * u, 0.6 * u, (performance.now() / 80) % 360);
  g.text(cx, r.y + 140 * u, 'STARSHIP AURORA', 44 * u, C.ORANGE, 'center', true);
  g.text(cx, r.y + 190 * u, 'BRIDGE SIMULATOR', 20 * u, C.PEACH, 'center');
  if (!lb) { g.text(cx, r.y + 240 * u, 'WAITING FOR THE HOST...', 18 * u, C.GREY_TXT, 'center'); return; }
  const s = w.slow;
  if (s) {
    g.text(cx, r.y + 222 * u, `MISSION: ${K.MT_NAME[s.selType]}   -   DIFFICULTY: ${K.DIFF_NAME[s.selDiff]}`, 19 * u, C.SKY, 'center');
    g.wrap(cx - 300 * u, r.y + 250 * u, 600 * u, K.MT_DESC[s.selType], 13 * u, C.GREY_TXT, 1.3, 2);
  }
  // the 8 roles and who holds them
  const byPid = new Map(lb.players.map((p) => [p.pid, p]));
  const cols = 4, bw = Math.min(205 * u, (r.w - 40 * u) / cols - 10 * u), bh = 30 * u;
  const x0 = cx - (cols * (bw + 10 * u) - 10 * u) / 2;
  for (let t = 0; t < K.TAB_NAME.length; t++) {
    const x = x0 + (t % cols) * (bw + 10 * u), y = r.y + 290 * u + Math.floor(t / cols) * (bh + 8 * u);
    const o = lb.roles[t] ? byPid.get(lb.roles[t]) : null;
    g.rrect(x, y, bw, bh, bh / 2, o ? o.col : dim(K.TAB_COL[t], 0.3));
    g.textFit(x + 14 * u, y + 6 * u, K.TAB_NAME[t], 15 * u, C.BLACK, 'left', bw * 0.5, true);
    g.textFit(x + bw - 14 * u, y + 6 * u, o ? o.name : 'OPEN', 15 * u, o ? C.BLACK : C.GREY_TXT, 'right', bw * 0.45);
  }
  g.text(cx, r.y + 372 * u, lb.canStart ? 'ALL ROLES ASSIGNED - START THE MISSION FROM ANY PHONE' : lb.why, 15 * u, lb.canStart ? C.GREEN : C.YELLOW, 'center');
  if (joinUrl) g.text(cx, r.y + 394 * u, 'JOIN FROM A PHONE BROWSER:  ' + joinUrl, 13 * u, C.GREY_TXT, 'center');
}
