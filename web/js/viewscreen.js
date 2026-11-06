// ============================================================================
// viewscreen.js - the main viewer picture (port of viewscreen.h)
// ============================================================================
// A Scene draws one of the view modes into any rectangle: the TV draws it
// full screen, the phones draw it on their VIEWER page.
import * as K from './config.js';
import { C } from './config.js';
import { DEG, clampf, wrap360, angDiff, bearingTo, distTo, fmtDist, pad3, sectorName, mmss, warpTxt } from './util.js';
import { dim, lerpCol, healthColor, flash } from './gfx.js';
import { drawShip, drawContact, drawPlanet, drawMarker, drawStarbase, drawNebula, factionColor, ART_CRUISER } from './ships.js';
import { bodies, drawStar, drawRingedPlanet, drawSystemLayer, drawGalaxy, drawStation, drawPoi, drawJumpTunnel, drawCampLines, drawBubble, drawOortWarn, drawOortFrame } from './sysdraw.js';
import { POI_TIP, POI_NAME, RES_SHORT, hazWord } from './cargo.js';
import { drawRocks, BOULDER_COL } from './field.js';
import { drawLab, drawRing } from './lab.js';
import { CHARS } from './dialogue.js';
import { CAMPAIGNS } from './campaign.js';
const campOf = (id) => CAMPAIGNS.find((c) => c.id === id) || CAMPAIGNS[0];
import { drawPortrait, drawGlyphs, translated, msgAge } from './portraits.js';
import { SYS_SIZE, inNebulaOf, sysAt, SK_NAME, CIV_NAME, CIV_COL } from './galaxy.js';

const NSTARS = 160;
// the main viewer always shows the forward view; what a station puts on screen opens over it
export const VIEW_OVERLAY = true;
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
      const vm = opts.view ?? w.view;
      if (VIEW_OVERLAY && opts.view === undefined && vm !== K.VM_FORWARD) {
        this.drawFwd(g, w, r);
        // the pushed screen in a frame over the forward view; it slides open when it changes
        if (this.ovView !== vm) { this.ovView = vm; this.ovT = now; }
        const op = clampf((now - this.ovT) / 260, 0, 1), e = 1 - (1 - op) ** 3, u = r.u;
        const ow = r.w * 0.76, oh = r.h * 0.8 * (0.35 + 0.65 * e), ox = r.x + (r.w - ow) / 2, oy = r.y + r.h * 0.12 + r.h * 0.8 * (1 - (0.35 + 0.65 * e)) / 2;
        const r2 = { x: ox, y: oy, w: ow, h: oh, u: (r.h * 0.8) / 416, F: (ow / 2) / Math.tan(40 * DEG) };
        g.ctx.globalAlpha = 0.9 * e; g.rect(ox - 4 * u, oy - 22 * u, ow + 8 * u, oh + 26 * u, '#000008'); g.ctx.globalAlpha = 1;
        g.rrect(ox - 4 * u, oy - 22 * u, 120 * u, 18 * u, 9 * u, K.VM_COL ? K.VM_COL[vm] : C.ORANGE);
        g.text(ox + 8 * u, oy - 20 * u, K.VM_NAME[vm], 13 * u, C.BLACK, 'left', true);
        g.rect(ox + 122 * u, oy - 14 * u, ow - 118 * u, 3 * u, C.ORANGE);
        g.strokeRect(ox - 4 * u, oy - 4 * u, ow + 8 * u, oh + 8 * u, C.ORANGE, 1.5 * u);
        g.clip(ox, oy, ow, oh);
        g.rect(ox, oy, ow, oh, C.BLACK);
        if (op > 0.6) this.drawMode(g, w, r2, vm);
        g.unclip();
      } else this.drawMode(g, w, r, vm);
      const u = r.u;
      if (now < this.hitFlashUntil) for (let i = 0; i < 4; i++) g.strokeRect(x + i * u, y + i * u, wd - 2 * i * u, ht - 2 * i * u, C.RED, u);
      else if (now < this.shieldFlashUntil) for (let i = 0; i < 3; i++) g.strokeRect(x + i * u, y + i * u, wd - 2 * i * u, ht - 2 * i * u, C.SKY, u);
      if (w.alert === K.AL_RED && flash(500) && (opts.view ?? w.view) !== K.VM_STATUS) {
        g.text(x + 8 * u, y + ht - 22 * u, 'RED ALERT', 18 * u, C.RED);
        g.text(x + wd - 8 * u, y + ht - 22 * u, 'RED ALERT', 18 * u, C.RED, 'right');
      }
      const vw = opts.view ?? w.view;
      if (P.dock === 1 && vw !== K.VM_COMMS) g.text(x + wd / 2, y + 80 * u, 'DOCKING...', 18 * u, C.GREEN, 'center');
      if (P.dock === 2 && vw !== K.VM_COMMS) g.text(x + wd / 2, y + 80 * u, 'DOCKED - REPAIRING AND RESUPPLYING', 18 * u, C.GREEN, 'center');
      // a new campaign chapter: its title over whatever is on screen
      const cp = w.slow && w.slow.camp;
      if (cp && cp.ch && w.now - cp.t0 < 7000) {
        const a = clampf(Math.min((w.now - cp.t0) / 600, (7000 - (w.now - cp.t0)) / 900), 0, 1);
        g.ctx.globalAlpha = a * 0.85; g.rect(x, y + ht * 0.3, wd, ht * 0.4, '#000'); g.ctx.globalAlpha = a;
        g.text(x + wd / 2, y + ht * 0.36, campOf(cp.id).name, 16 * u, C.LILAC, 'center');
        g.text(x + wd / 2, y + ht * 0.42, `CHAPTER ${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][cp.ch - 1]}`, 22 * u, C.ORANGE, 'center');
        g.text(x + wd / 2, y + ht * 0.5, campOf(cp.id).chapters[cp.ch - 1], 44 * u, C.PEACH, 'center', true);
        g.ctx.globalAlpha = 1;
      }
    } else {
      this.starsUpdate(dt, this.lastStarHdg + dt * 3, w.game === K.GS_TITLE ? 40 : 10);
      this.starsDraw(g, r, false);
      if (w.game !== K.GS_TITLE) this.drawEnd(g, w, r);
      else if (opts.title) opts.title(r);
    }
    g.unclip();
  }

  drawMode(g, w, r, vm) {
    switch (vm) {
      case K.VM_FORWARD: this.drawFwd(g, w, r); break;
      case K.VM_TACTICAL: this.drawTac(g, w, r); break;
      case K.VM_MAP: this.drawMap(g, w, r); break;
      case K.VM_TARGET: this.drawTarget(g, w, r); break;
      case K.VM_COMMS: this.drawComms(g, w, r); break;
      case K.VM_STATUS: this.drawStatus(g, w, r); break;
      case K.VM_LAB: this.drawLabView(g, w, r); break;
    }
  }
  // the science lab on the main viewer, so the whole crew can puzzle over it
  drawLabView(g, w, r) {
    const u = r.u, P = w.P, cp = w.slow && w.slow.camp, ring = cp && cp.ring;
    const uid = (w.slow && w.slow.labShow) || 0, h = (P.arts || []).find((q) => q.uid === uid);
    g.rect(r.x, r.y, r.w, r.h, '#05070e');
    g.text(r.x + 14 * u, r.y + 8 * u, 'SCIENCE LAB', 18 * u, C.SKY, 'left', true);
    const pad = 14 * u, top = r.y + 34 * u;
    if (ring && (!ring.solved || !h)) {
      drawRing(g, w, ring, { x: r.x + pad, y: top, w: r.w - 2 * pad, h: h ? r.h * 0.45 : r.h - 50 * u }, u);
      if (h) drawLab(g, w, h, { x: r.x + pad, y: r.y + r.h * 0.55, w: r.w - 2 * pad, h: r.h * 0.43 }, u * 0.8);
    } else if (h) drawLab(g, w, h, { x: r.x + pad, y: top, w: r.w - 2 * pad, h: r.h - 44 * u }, u);
    else g.text(r.x + r.w / 2, r.y + r.h / 2, 'NO SPECIMEN ON THE BENCH', 16 * u, C.GREY_TXT, 'center');
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
    if (P.jumping > 0) {
      drawJumpTunnel(g, r, performance.now(), 1, P.jumping);
      const to = sysAt(P.jumpTo);
      g.text(SCX, r.y + 24 * u, 'IN THE JUMP LANE', 22 * u, C.SKY, 'center', true);
      g.text(SCX, r.y + 52 * u, `DESTINATION ${to.name}  -  ARRIVAL IN ${Math.ceil(P.jumping)}s`, 14 * u, C.PEACH, 'center');
      return;
    }
    const neb = inNebulaOf(w.sys, P.x, P.y);
    if (neb) {
      const ctx = g.ctx;
      for (let i = 0; i < 1400; i++) {
        const h = (Math.imul(i, 2654435761) ^ Math.floor(P.hdg * 7)) >>> 0;
        ctx.fillStyle = i & 3 ? '#3c1c5a' : '#6e3c96';
        ctx.fillRect(r.x + ((h >>> 8) % 800) / 800 * r.w, r.y + ((h >>> 18) % 416) / 416 * r.h, 2 * u, 2 * u);
      }
      g.text(r.x + 8 * u, r.y + 30 * u, `INSIDE THE ${neb.name} - SENSORS REDUCED`, 12 * u, C.LILAC);
    }
    const objs = [];
    for (const b of bodies(w.sys, w.tSec)) { const p = this.project(w, r, b.x, b.y, b.star ? 0.02 : 0.05); if (p) objs.push({ ...p, kind: -1, b }); }
    for (const n of w.npc) {
      if (!n.alive || n.type === K.CT_GROUND || n.rk !== undefined) continue; // boulders are drawn as rocks
      const p = this.project(w, r, n.x, n.y, ((n.id * 37) % 11 - 5) * 0.025);
      if (p && p.d < 40000) objs.push({ ...p, kind: 1, n });
    }
    for (const q of w.rocks()) {
      if (Math.abs(q.x - P.x) > 9000 || Math.abs(q.y - P.y) > 9000) continue;
      const p = this.project(w, r, q.x, q.y, (((q.id * 13) % 9) - 4) * 0.07);
      if (p && p.d > 250) objs.push({ ...p, kind: 2, q });
    }
    objs.sort((a, b) => b.d - a.d);
    for (const o of objs) {
      if (o.kind === 2) { // an asteroid
        const q = o.q, rad = Math.min(90 * u, Math.max(1.2 * u, (q.r / o.d) * r.F)), sh = Math.max(0.15, 1 - o.d / 9000);
        g.circle(o.sx, o.sy, rad, q.drift ? BOULDER_COL[q.c ?? 1] : dim('#8a8076', sh));
        if (rad > 4) g.circle(o.sx + rad * 0.3, o.sy + rad * 0.25, rad * 0.55, dim('#3c3630', sh));
        if (q.drift && rad > 2) g.circle(o.sx, o.sy, rad + 4 * u, flash(250) ? C.RED : C.ORANGE, false, 1.5 * u);
        continue;
      }
      if (o.kind < 0) {
        const pl = o.b;
        const rad = Math.max(pl.star ? 3 * u : 2, pl.r / o.d * r.F);
        if (pl.star) drawStar(g, o.sx, o.sy, rad, pl.c1, pl.c2);
        else drawRingedPlanet(g, o.sx, o.sy, rad, pl.c1, pl.c2, pl.ring);
        if (rad < 60 * u) g.text(o.sx, o.sy + rad + 6 * u, pl.name, 11 * u, C.GREY_TXT, 'center');
      } else {
        const c = o.n;
        let sc = clampf(1100 / o.d, 0.04, 1.8) * u;
        if (c.type === K.CT_STARBASE) sc *= 1.8;
        drawContact(g, c.type, o.sx, o.sy, sc, angDiff(P.hdg, c.hdg), t, c.vis ? 1 : 0.6, c.kind, c.civ);
        if (c.id === P.target) g.brackets(o.sx, o.sy, sc * 70 + 10 * u, flash(300) ? C.RED : C.ORANGE);
        if (o.d < 25000) {
          const known = c.scan > 0 || c.type === K.CT_STARBASE;
          g.text(o.sx, o.sy + sc * 70 + 14 * u, w.shortName(c.id, known), 11 * u, factionColor(known ? c.faction : K.F_UNKNOWN), 'center');
          g.text(o.sx, o.sy + sc * 70 + 26 * u, fmtDist(o.d), 10 * u, C.GREY_TXT, 'center');
        }
      }
    }
    if (P.oort > 0) { // ice streaking past in the Oort cloud
      const c = g.ctx; c.fillStyle = 'rgba(200,230,255,0.5)';
      for (let i = 0; i < 90; i++) { const h = Math.imul(i + 3, 2654435761) >>> 0, ph = ((performance.now() / 900 + (h % 1000) / 1000) % 1); c.fillRect(SCX + (((h >>> 10) % 1000) / 500 - 1) * r.w * ph, SCY + (((h >>> 20) % 1000) / 500 - 1) * r.h * ph, 2 * u * ph + 1, 2 * u * ph + 1); }
    }
    drawOortWarn(g, r, P.oort, u);
    if (P.jumpTo !== K.NO_ID && P.jumpCharge > 0) {
      drawJumpTunnel(g, r, performance.now(), P.jumpCharge, 0);
      g.text(SCX, r.y + 24 * u, `JUMP DRIVE CHARGING  ${Math.round(P.jumpCharge * 100)}%`, 16 * u, flash(400) ? C.WHITE : C.SKY, 'center', true);
      g.text(SCX, r.y + 46 * u, 'DESTINATION ' + sysAt(P.jumpTo).name, 12 * u, C.PEACH, 'center');
    }
    for (const tp of w.torp) {
      const p = this.project(w, r, tp.x, tp.y, 0);
      if (p && p.d > 150) {
        const rad = clampf(2500 / p.d, 2, 14) * u;
        g.circle(p.sx, p.sy, rad, tp.owner === K.US ? '#ff501e' : tp.owner === K.HAZARD ? '#d2b48c' : '#50ff78');
        g.circle(p.sx, p.sy, rad / 2 + 1, C.WHITE);
      }
    }
    const rt = w.rt;
    for (const b of w.beams) {
      const age = (rt - b.t0) / 600;
      const nf = w.n(b.from), nt = b.tx !== undefined ? { x: b.tx, y: b.ty, id: 0 } : w.n(b.to);
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
    if (P.warping) g.text(SCX, r.y + 34 * u, warpTxt(P), 30 * u, Math.floor(performance.now() / 300) % 2 ? C.SKY : C.WHITE, 'center');
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
    drawSystemLayer(g, w.sys, w.tSec, w2t, k, { u, orbits: true, minR: 3 });
    { const rk = w.rocks(); if (rk.length) drawRocks(g, rk, w2t, k, r, { minR: 1, mark: true }); }
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
      if (n.rk === undefined) drawContact(g, n.type, sx, sy, sc, n.hdg, t, 1, n.kind, n.civ);
      g.text(sx, sy + 26 * u, w.shortName(n.id, known), 11 * u, fc, 'center');
      if (n.scan >= 2 && n.type !== K.CT_ANOMALY && n.type !== K.CT_POI) {
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
      // the bubble grows with shield power; friendly ships inside it are covered
      const BR = Math.max(30 * u, (P.bubR || 600) * k), hit = clampf((this.shieldFlashUntil - performance.now()) / 300, 0, 1);
      const thin = 1 / (1 + 1.5 * clampf(P.shRange || 0, 0, 1));
      drawBubble(g, cx, cy, BR, P.hdg, [0, 1, 2, 3].map((q) => clampf(P.shield[q] / 100, 0, 1) * thin), P.shieldRaise, hit);
      if (w.shieldsUp()) for (const n of w.npc) {
        if (!n.alive || !n.vis || n.faction === K.F_HOSTILE || n.type === K.CT_POI || n.type === K.CT_ANOMALY) continue;
        if (distTo(P.x, P.y, n.x, n.y) < (P.bubR || 600)) { const [sx, sy] = w2t(n.x, n.y); g.text(sx, sy - 30 * u, 'COVERED', 10 * u, C.SKY, 'center'); }
      }
    }
    if (P.xId !== K.NO_ID && w.n(P.xId)) {
      const [sx, sy] = w2t(w.n(P.xId).x, w.n(P.xId).y);
      g.ctx.save(); g.ctx.setLineDash([6 * u, 4 * u]); g.ctx.lineDashOffset = -performance.now() / 30;
      g.line(cx, cy, sx, sy, P.xMode === 2 ? '#78c8ff' : '#c8a0ff', 2.5 * u);
      g.ctx.restore();
      g.text((cx + sx) / 2, (cy + sy) / 2 - 16 * u, `${P.xMode === 2 ? 'TRACTOR BEAM' : 'SAMPLING'} ${Math.round(P.xProg * 100)}%`, 12 * u, C.SKY, 'center');
    }
    drawShip(g, ART_CRUISER, C.SKY, cx, cy, 0.3 * u, P.hdg);
    for (const tp of w.torp) {
      const [sx, sy] = w2t(tp.x, tp.y);
      g.circle(sx, sy, 3 * u, tp.owner === K.US ? '#ff501e' : tp.owner === K.HAZARD ? '#d2b48c' : '#50ff78');
      g.circle(sx, sy, u, C.WHITE);
    }
    for (const b of w.beams) {
      const nf = w.n(b.from), nt = b.tx !== undefined ? { x: b.tx, y: b.ty } : w.n(b.to);
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
    // the system's grid with a strip of the Oort cloud round it
    const S = r.h - 16 * u, mx = r.x + (r.w - S) / 2, my = r.y + 8 * u, M = 9000, k = S / (SYS_SIZE + 2 * M), G = SYS_SIZE * k;
    const gx = mx + M * k, gy = my + M * k;
    g.clip(mx, my, S, S);
    drawOortFrame(g, (x, y) => [gx + x * k, gy + y * k], { x: mx, y: my, w: S, h: S }, w.tSec);
    g.unclip();
    g.strokeRect(mx, my, S, S, '#1c2440', u);
    for (let i = 1; i < 10; i++) { g.rect(gx + i * G / 10, gy, 1, G, '#121832'); g.rect(gx, gy + i * G / 10, G, 1, '#121832'); }
    for (let i = 0; i < 10; i++) {
      g.text(gx + i * G / 10 + G / 20, my + 1 * u, String.fromCharCode(65 + i), 10 * u, C.GRID, 'center');
      g.text(mx + 2 * u, gy + i * G / 10 + G / 20 - 6 * u, String(i + 1), 10 * u, C.GRID);
    }
    g.clip(mx, my, S, S);
    drawSystemLayer(g, w.sys, w.tSec, (x, y) => [gx + x * k, gy + y * k], k, { u, minR: 3.5, well: true });
    drawCampLines(g, w, (x, y) => [gx + x * k, gy + y * k], u);
    { const rk = w.rocks(); if (rk.length) drawRocks(g, rk, (x, y) => [gx + x * k, gy + y * k], k, { x: mx, y: my, w: S, h: S }, { minR: 0.6 }); }
    g.unclip();
    for (const m of w.M.mk) drawMarker(g, gx + m.x * k, gy + m.y * k, m.kind, m.r * k, 11 * u);
    g.circle(gx + P.x * k, gy + P.y * k, w.sensorRange * k, '#1e3c5a', false, u);
    const pt = (w.slow && w.slow.ptrail) || [];
    for (let i = 0; i < pt.length; i += 2) g.rect(gx + pt[i] * k, gy + pt[i + 1] * k, 1.5 * u, 1.5 * u, dim(C.SKY, 0.3 + 0.7 * i / pt.length));
    if (P.wpValid) {
      g.line(gx + P.x * k, gy + P.y * k, gx + P.wpx * k, gy + P.wpy * k, '#50468c', u);
      g.strokeRect(gx + P.wpx * k - 4 * u, gy + P.wpy * k - 4 * u, 9 * u, 9 * u, C.VIOLET, 1.5 * u);
    }
    for (const n of w.npc) {
      if (!n.alive || !n.vis) continue;
      const x = gx + n.x * k, y = gy + n.y * k;
      const known = n.scan > 0 || n.type === K.CT_STARBASE;
      const col = factionColor(known ? n.faction : K.F_UNKNOWN);
      if (n.type === K.CT_STARBASE) drawStation(g, n.kind ?? 0, x, y, 0.14 * u, w.now, n.civ);
      else if (n.type === K.CT_POI) drawPoi(g, n.kind ?? 0, x, y, 0.1 * u, w.now, (n.civ ?? 0) * 0.7);
      else g.circle(x, y, 3 * u, col);
      g.text(x + 9 * u, y + 3 * u, w.shortName(n.id, known), 11 * u, col);
    }
    drawShip(g, ART_CRUISER, C.SKY, clampf(gx + P.x * k, mx + 6 * u, mx + S - 6 * u), clampf(gy + P.y * k, my + 6 * u, my + S - 6 * u), 0.12 * u, P.hdg);
    drawOortWarn(g, { x: mx, y: my, w: S, h: S }, P.oort, u);
    const lw = mx - r.x - 16 * u;
    if (lw > 120 * u) {
      const sy = w.sys;
      g.textFit(r.x + 12 * u, r.y + 12 * u, sy.name, 22 * u, C.SKY, 'left', lw, true);
      g.text(r.x + 12 * u, r.y + 40 * u, sy.star.type, 13 * u, C.PEACH);
      g.text(r.x + 12 * u, r.y + 58 * u, 'AURORA IN SECTOR ' + sectorName(P.x, P.y), 13 * u, C.SKY);
      let yy = g.wrap(r.x + 12 * u, r.y + 80 * u, lw, sy.desc, 11 * u, C.GREY_TXT, 1.25, 4);
      if (P.jumpTo !== K.NO_ID) {
        g.text(r.x + 12 * u, yy + 6 * u, P.jumping > 0 ? 'IN THE JUMP LANE' : `JUMP CHARGING ${Math.round(P.jumpCharge * 100)}%`, 14 * u, flash(400) ? C.WHITE : C.SKY);
        g.text(r.x + 12 * u, yy + 24 * u, '-> ' + sysAt(P.jumpTo).name, 12 * u, C.PEACH);
      }
      const gh = Math.min(lw * 0.75, r.h * 0.45);
      g.text(r.x + 12 * u, r.y + r.h - gh - 26 * u, 'GALAXY', 12 * u, C.ORANGE);
      drawGalaxy(g, w, r.x + 8 * u, r.y + r.h - gh - 10 * u, lw, gh, { u, labelSize: 8 });
    }
    const rw2 = r.x + r.w - (mx + S) - 16 * u;
    if (rw2 > 120 * u) {
      let yy = r.y + 12 * u;
      g.text(mx + S + 12 * u, yy, 'IN THIS SYSTEM', 13 * u, C.ORANGE); yy += 20 * u;
      for (const n of w.npc) {
        if (!n.alive || n.type !== K.CT_STARBASE) continue;
        g.textFit(mx + S + 12 * u, yy, n.name || w.shortName(n.id, true), 13 * u, factionColor(n.faction), 'left', rw2); yy += 15 * u;
        g.text(mx + S + 12 * u, yy, `${SK_NAME[n.kind ?? 0]}${CIV_NAME[n.civ] ? ' - ' + CIV_NAME[n.civ] : ''}`, 10 * u, C.GREY_TXT); yy += 18 * u;
      }
      for (const p of w.sys.planets) { g.text(mx + S + 12 * u, yy, p.name, 11 * u, C.GREY_TXT); yy += 14 * u; }
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
    drawContact(g, c.type, mx, my, (c.type === K.CT_STARBASE ? 2.2 : 1.9) * u, performance.now() / 60, w.now, c.alive ? 1 : 0.4, c.kind, c.civ);
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
    g.text(x, y, `${known ? (c.type === K.CT_STARBASE && c.kind != null ? SK_NAME[c.kind] : c.type === K.CT_POI ? POI_NAME[c.kind ?? 0] : K.CT_NAME[c.type]) : 'UNKNOWN TYPE'}  ${K.FACTION_NAME[known ? c.faction : K.F_UNKNOWN]}`, 13 * u, C.GREY_TXT); y += 28 * u;
    g.text(x, y, `RANGE ${fmtDist(distTo(P.x, P.y, c.x, c.y))}  BEARING ${pad3(bearingTo(P.x, P.y, c.x, c.y))}`, 18 * u, C.SKY); y += 24 * u;
    g.text(x, y, `HEADING ${pad3(c.hdg)}  SPEED ${Math.round(c.speed)}`, 18 * u, C.SKY); y += 36 * u;
    if (c.scan >= 2 && c.type !== K.CT_ANOMALY && c.type !== K.CT_POI && c.type !== K.CT_STARBASE) {
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
    } else if (c.note && c.scan >= 2) {
      g.wrap(x, y, tw, c.note, 17 * u, C.SKY, 1.3, 6);
    } else if (c.type === K.CT_POI) {
      y = g.wrap(x, y, tw, POI_TIP[c.kind ?? 0], 15 * u, C.PEACH, 1.25, 3) + 6 * u;
      if (c.res) {
        const got = c.res.map((v, i) => (v ? `${v} ${RES_SHORT[i]}` : '')).filter(Boolean);
        g.wrap(x, y, tw, 'CONTAINS: ' + (got.length ? got.join(', ') : 'NOTHING USEFUL'), 15 * u, C.SKY, 1.25, 2);
        y += 44 * u;
        if (c.art) g.text(x, y, 'ARTEFACT SIGNATURE DETECTED', 17 * u, flash(500) ? C.WHITE : C.LILAC), y += 24 * u;
        g.text(x, y, 'EXTRACTION HAZARD: ' + hazWord(c.haz), 15 * u, c.haz > 0.25 ? C.RED : c.haz > 0.12 ? C.YELLOW : C.GREEN);
      } else g.text(x, y, 'FULL SCAN FOR CONTENTS', 16 * u, C.YELLOW);
    } else if (c.type === K.CT_ANOMALY) {
      g.wrap(x, y, tw, c.scan >= 2 ? 'TETRYON EMISSIONS, UNSTABLE SUBSPACE FOLD. DATA SENT TO FLEET COMMAND.' : 'FULL SCAN NEEDED TO ANALYSE.', 17 * u, c.scan >= 2 ? C.LILAC : C.GREY_TXT);
    } else if (flash(500)) g.text(x, y, 'DETAILED SCAN REQUIRED', 18 * u, C.YELLOW);
    if (!c.alive) g.text(mx, my + 120 * u, 'DESTROYED', 28 * u, C.RED, 'center');
  }

  // ---------------------------------------------------------------- incoming transmission
  // the comms station on the big screen: message log, who's calling, who's in range
  // a hail on the main viewer: the speaker's face, the alien original and subtitles
  drawHail(g, w, r, m) {
    const u = r.u, d = w.slow && w.slow.dlg, who = m.who, ch = CHARS[who] || CHARS.computer, pad = 16 * u;
    const tr = translated(m), talking = tr.p < 1 || msgAge(m) < 2500 + m.text.length * 45;
    const ph = r.h * 0.56, pw = Math.min(r.w * 0.42, ph * 1.2);
    const px = r.x + pad, py = r.y + pad;
    drawPortrait(g, who, px, py, pw, ph, performance.now(), talking);
    g.ctx.strokeStyle = CIV_COL[ch.civ] || C.SKY; g.ctx.lineWidth = 2 * u;
    g.ctx.beginPath(); g.ctx.roundRect(px, py, pw, ph, Math.min(pw, ph) * 0.06); g.ctx.stroke();
    let y = py + ph + 10 * u;
    g.textFit(px, y, ch.name, 26 * u, C.PEACH, 'left', pw, true);
    g.textFit(px, y + 32 * u, ch.role || '', 15 * u, CIV_COL[ch.civ] || C.GREY_TXT, 'left', pw);
    // right: header, original language, replies
    const rx = px + pw + 24 * u, rw = r.x + r.w - rx - pad;
    y = py;
    g.header(rx, y, rw, d && d.seq === m.dseq ? 'INCOMING HAIL' : 'TRANSMISSION', flash(700) ? C.ORANGE : C.SKY, 22 * u);
    y += 36 * u;
    if (m.lang) {
      g.text(rx, y, `LANGUAGE: ${CIV_NAME[m.lang]}   ${tr.p < 1 ? 'TRANSLATING' + '.'.repeat(1 + Math.floor(performance.now() / 300) % 3) : 'TRANSLATED'}`, 14 * u, C.LILAC);
      y += 24 * u;
      y = drawGlyphs(g, rx, y, m.text.replace(/[{}]/g, ''), 15 * u, dim(CIV_COL[m.lang] || C.LILAC, 0.8), rw, 3) + 6 * u;
      if (tr.p < 1) g.progress(rx, y, rw, 6 * u, tr.p, C.LILAC);
      y += 18 * u;
    }
    const live = d && d.seq === m.dseq;
    if (live && m.dopt && m.dopt.length) {
      g.text(rx, y, 'REPLIES - COMMS STATION', 14 * u, C.GREY_TXT);
      y += 22 * u;
      m.dopt.forEach((o, i) => { if (y < r.y + r.h * 0.74) { g.textFit(rx, y, `${i + 1}. ${o}`, 18 * u, C.PEACH, 'left', rw); y += 25 * u; } });
      if (d.left) { g.text(rx, y + 6 * u, `ANSWER IN ${d.left}s`, 18 * u, flash(400) ? C.RED : C.YELLOW); }
    }
    // subtitles across the bottom
    const sh = r.h * 0.2, sy = r.y + r.h - sh - 6 * u;
    g.ctx.fillStyle = 'rgba(0,0,0,0.78)'; g.ctx.fillRect(r.x + pad, sy, r.w - 2 * pad, sh);
    const lines = g.wrapLines(tr.text || ' ', r.w - 6 * pad, 24 * u).slice(0, 3);
    lines.forEach((l, i) => g.text(r.x + r.w / 2, sy + sh / 2 - lines.length * 15 * u + i * 30 * u, l, 24 * u, m.col === 2 ? '#ffb4a0' : C.WHITE, 'center'));
    if (!tr.text && m.lang) g.text(r.x + r.w / 2, sy + sh / 2 - 12 * u, '...', 24 * u, C.GREY_TXT, 'center');
  }
  drawComms(g, w, r) {
    const u = r.u, msgs = w.msgs, P = w.P;
    {
      const d = w.slow && w.slow.dlg;
      const m = msgs.find((q) => q.who && !q.reply);
      if (m && ((d && d.seq === m.dseq) || (msgs.indexOf(m) <= 1 && msgAge(m) < 9000))) { this.drawHail(g, w, r, m); return; }
    }
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
        drawContact(g, type, px, py, (type === K.CT_STARBASE || type === K.CT_ANOMALY ? 1.2 : 0.95) * bh / 220, (performance.now() / 40) % 360, w.now, 1, w.n(m.from)?.kind, w.n(m.from)?.civ);
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
    g.textFit(x, y, `HDG ${pad3(P.hdg)}  ${P.warping ? warpTxt(P) : Math.round(P.speed) + ' KM/S'}  ${ap}${P.evasive ? '  EVASIVE' : ''}`, fs, C.SKY, 'left', lw);
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
      if (n.scan >= 2 && n.type !== K.CT_ANOMALY && n.type !== K.CT_BUOY && n.type !== K.CT_POI) g.bar(lx + lwid - 50 * u, ly + 19 * u, 50 * u, 5 * u, n.hull, healthColor(n.hull));
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
    const cp = s && s.camp;
    if (won && cp && cp.ending) { // campaign epilogue
      const e = cp.ending;
      g.text(cx, r.y + 30 * u, campOf(cp.id).name + ' - EPILOGUE', 16 * u, C.LILAC, 'center');
      g.text(cx, r.y + 56 * u, e.title, 50 * u, C.PEACH, 'center', true);
      let yy = g.wrap(r.x + r.w * 0.12, r.y + 130 * u, r.w * 0.76, e.text, 19 * u, C.WHITE, 1.35, 8) + 16 * u;
      g.wrap(r.x + r.w * 0.12, yy, r.w * 0.76, e.allies.length ? 'THEY ANSWERED YOUR CALL: ' + e.allies.join(', ') + '.' : 'NOBODY CAME TO HELP. YOU STOOD ALONE.', 16 * u, e.allies.length ? C.GREEN : C.GREY_TXT, 1.3, 3);
      g.text(cx, r.y + r.h - 40 * u, `TIME ${mmss(w.missionT)}   ENEMIES DEFEATED ${w.kills}   HULL ${Math.round(P.hull)}%`, 15 * u, C.SKY, 'center');
      return;
    }
    if (w.mode) { // a voyage: how far you got
      g.text(cx, r.y + 40 * u, won ? 'VOYAGE COMPLETE' : 'THE AURORA IS LOST', 50 * u, won ? C.GREEN : C.RED, 'center', true);
      let yy = r.y + 130 * u;
      const line = (txt, col) => { g.text(cx, yy, txt, 19 * u, col, 'center'); yy += 28 * u; };
      if (cp && cp.ch) line(`${campOf(cp.id).name} - REACHED CHAPTER ${cp.ch}: ${campOf(cp.id).chapters[cp.ch - 1]}`, C.LILAC);
      line(`VOYAGE TIME   ${mmss(w.missionT)}`, C.SKY);
      line(`STAR SYSTEMS VISITED  ${s ? s.visitedN : 1}`, C.SKY);
      line(`CONTRACTS COMPLETED  ${(s && s.stats && s.stats.jobs) || 0}`, C.SKY);
      line(`ARTEFACTS IN THE HOLD  ${(P.arts || []).length}`, C.SKY);
      line(`ENEMIES DEFEATED  ${w.kills}`, C.SKY);
      return;
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
    if (w.mode) { const j = w.slow && w.slow.job; if (j && w.mode === K.MODE_CAMPAIGN) g.textFit(200 * u, 21 * u, 'CONTRACT: ' + j.objective, 13 * u, C.YELLOW, 'left', W - 210 * u); }
    else g.textFit(200 * u, 21 * u, w.bonus ? 'BONUS COMPLETE: ANOMALY DATA RECOVERED' : K.BONUS_TEXT, 13 * u, w.bonus ? C.GREEN_DIM : C.LILAC, 'left', W - 210 * u);
  } else g.text(200 * u, 7 * u, 'STARSHIP AURORA - MAIN VIEWER', 22 * u, C.ORANGE);
  scene.draw(g, w, 0, top, W, H - top - bot, opts);
  // bottom bar
  const y = H - bot + 4 * u;
  if (w.game === K.GS_RUN) {
    const P = w.P;
    g.text(6 * u, y, 'HDG ' + pad3(P.hdg), 20 * u, C.SKY);
    g.text(6 * u, y + 21 * u, P.warping ? warpTxt(P) : Math.round(P.speed) + ' KM/S', 12 * u, C.SKY);
    g.text(120 * u, y, 'ENERGY', 12 * u, C.PEACH);
    g.segBar(120 * u, y + 16 * u, 150 * u, 14 * u, P.energy / 10, P.energy > 300 ? C.SKY : P.energy > 120 ? C.YELLOW : C.RED, 12);
    g.text(290 * u, y, `HULL ${Math.ceil(P.hull)}%`, 20 * u, healthColor(P.hull));
    g.text(290 * u, y + 21 * u, w.shieldsUp() ? 'SHIELDS UP' : P.shieldRaise > 0 ? 'SHIELDS RAISING' : 'SHIELDS DOWN', 12 * u, w.shieldsUp() ? C.SKY : C.GREY_TXT);
    for (let q = 0; q < 4; q++) g.text(420 * u + q * 50 * u, y + 8 * u, K.QUAD_NAME[q][0] + Math.round(P.shield[q]), 15 * u, w.shieldsUp() ? C.SKY : C.GREY, 'left');
    g.text(W - 8 * u, y + 2 * u, 'VIEW: ' + K.VM_NAME[w.view], 16 * u, C.ORANGE, 'right');
    g.text(W - 8 * u, y + 21 * u, `T+${mmss(w.missionT)}   ${w.mode ? K.MODE_NAME[w.mode] + ' - ' + w.sys.name : K.MT_NAME[w.M.type]}`, 12 * u, C.GREY_TXT, 'right');
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
    const sm = s.selMode || 0;
    if (sm === K.MODE_CAMPAIGN) {
      const cpn = CAMPAIGNS[s.selCamp | 0], chn = s.selType % Math.max(1, (s.campMaxes || [])[s.selCamp | 0] || 1);
      g.text(cx, r.y + 222 * u, `${cpn.name} - CHAPTER ${chn + 1}: ${cpn.chapters[chn]}   -   ${K.DIFF_NAME[s.selDiff]}`, 19 * u, C.SKY, 'center');
      g.wrap(cx - 300 * u, r.y + 250 * u, 600 * u, chn ? cpn.desc[chn] : cpn.blurb, 13 * u, C.GREY_TXT, 1.3, 2);
    } else {
      g.text(cx, r.y + 222 * u, sm ? `${K.MODE_NAME[sm]}   -   DIFFICULTY: ${K.DIFF_NAME[s.selDiff]}` : `MISSION: ${K.MT_NAME[s.selType]}   -   DIFFICULTY: ${K.DIFF_NAME[s.selDiff]}`, 19 * u, C.SKY, 'center');
      g.wrap(cx - 300 * u, r.y + 250 * u, 600 * u, sm ? K.MODE_DESC[sm] : K.MT_DESC[s.selType], 13 * u, C.GREY_TXT, 1.3, 2);
    }
  }
  // the 8 roles and who holds them
  const byPid = new Map(lb.players.map((p) => [p.pid, p]));
  const cols = 4, bw = Math.min(205 * u, (r.w - 40 * u) / cols - 10 * u), bh = 30 * u;
  const x0 = cx - (cols * (bw + 10 * u) - 10 * u) / 2;
  {
    const co = lb.roles[K.T_CAPTAIN] ? byPid.get(lb.roles[K.T_CAPTAIN]) : null;
    g.text(cx, r.y + 368 * u, co ? `CAPTAIN: ${co.name}` : 'CAPTAIN: OPEN', 14 * u, co ? co.col : C.GREY_TXT, 'center');
  }
  for (let t = 0; t < K.NUM_CORE; t++) {
    const x = x0 + (t % cols) * (bw + 10 * u), y = r.y + 290 * u + Math.floor(t / cols) * (bh + 8 * u);
    const o = lb.roles[t] ? byPid.get(lb.roles[t]) : null;
    g.rrect(x, y, bw, bh, bh / 2, o ? o.col : dim(K.TAB_COL[t], 0.3));
    g.textFit(x + 14 * u, y + 6 * u, K.TAB_NAME[t], 15 * u, C.BLACK, 'left', bw * 0.5, true);
    g.textFit(x + bw - 14 * u, y + 6 * u, o ? o.name : 'OPEN', 15 * u, o ? C.BLACK : C.GREY_TXT, 'right', bw * 0.45);
  }
  g.text(cx, r.y + 390 * u, lb.canStart ? 'ALL ROLES ASSIGNED - START THE MISSION FROM ANY PHONE' : lb.why, 15 * u, lb.canStart ? C.GREEN : C.YELLOW, 'center');
  if (joinUrl) g.text(cx, r.y + 394 * u, 'JOIN FROM A PHONE BROWSER:  ' + joinUrl, 13 * u, C.GREY_TXT, 'center');
}
