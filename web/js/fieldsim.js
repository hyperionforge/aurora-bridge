// ============================================================================
// fieldsim.js - the host side of asteroid fields: collisions, boulders that
// break loose and come at the ship, and TACTICAL's point defence.
// Installed onto Sim.
// ============================================================================
import * as K from './config.js';
import { buildField, hashRocks, rocksNear, insideBox, ROCK_SHIP_R, pathAt } from './field.js';
import { planetPos, SYS_C, WELL_R } from './galaxy.js';
import { wellR } from './orbit.js';
import { distTo, bearingTo, angDiff, clampf } from './util.js';
import * as G from './cargo.js';
const { NO_ID, US, FROM_CREW, FROM_COMMAND, S_PHASERS } = K;
const near = [];
// loose boulders: their colour tells you what they're made of (and science's scan confirms it)
export const BOULDER = [
  { name: 'AN ICE BOULDER', col: 'BLUE', freq: 0, res: G.R_ICE, resName: 'ICE' },
  { name: 'AN IRON BOULDER', col: 'RUST-RED', freq: 2, res: G.R_ORE, resName: 'ORE' },
  { name: 'A CRYSTAL BOULDER', col: 'VIOLET', freq: 4, res: G.R_CRYSTAL, resName: 'CRYSTAL' },
];

export function installField(Sim) {
  Object.assign(Sim.prototype, {
    fieldStart(spec) {
      const f = buildField(spec);
      this.field = { spec, f, hash: hashRocks(f.rocks), gone: new Set(), hp: new Map(), driftT: spec.driftEvery || 9, nextId: 0, hitMsgAt: 0 };
      this.drifts = [];
    },
    fieldStop() { this.field = null; this.drifts = []; },
    boulders() { const out = []; for (let i = 0; i < K.MAX_CONTACTS; i++) { const n = this.npc[i]; if (n.active && n.alive && n.rock) out.push([i, Math.round(n.x), Math.round(n.y), n.rock.r, n.rock.c, n.rock.tractor ? 1 : 0]); } return out; },
    rockHp(q) { const F = this.field; if (!F.hp.has(q.id)) F.hp.set(q.id, q.r * 0.25); return F.hp.get(q.id); },
    rockBreak(q) { // a static rock is destroyed
      const F = this.field; F.gone.add(q.id); F.hp.delete(q.id); this.boomAt(q.x, q.y, q.r > 300 ? 1 : 0);
    },
    fieldTick(dt) {
      const F = this.field, P = this.P;
      if (!F) return;
      const spec = F.spec, inside = insideBox(spec, P.x, P.y, 2500);
      // ---- we hit a rock
      if (inside && !P.jumping) for (const q of rocksNear(F.hash, P.x, P.y, near)) {
        if (F.gone.has(q.id)) continue;
        const d = distTo(P.x, P.y, q.x, q.y), lim = q.r + ROCK_SHIP_R;
        if (d >= lim) continue;
        const nx = (P.x - q.x) / (d || 1), ny = (P.y - q.y) / (d || 1);
        P.x = q.x + nx * lim; P.y = q.y + ny * lim;
        const sp = Math.abs(P.speed);
        if (sp > 8) {
          this.damagePlayer(q.x, q.y, 3 + sp * 0.09 + q.r / 90);
          if (this.now > F.hitMsgAt) { F.hitMsgAt = this.now + 4000; this.say(FROM_CREW, 2, `COLLISION! WE HIT AN ASTEROID AT ${Math.round(sp)} KM/S - SLOW DOWN AND WATCH THE CHANNEL!`); }
          if (q.r < 170) this.rockBreak(q);
        }
        P.speed *= 0.3; P.vx *= 0.3; P.vy *= 0.3;
      }
      // ---- boulders break loose and come at us: real contacts that can be scanned, shot (at the right
      // phaser frequency) or tractored in for their ore, ice or crystal
      if (inside && spec.driftEvery) {
        F.driftT -= dt;
        if (F.driftT <= 0) {
          F.driftT = spec.driftEvery * (0.7 + this.frand() * 0.6);
          let pick = null;
          for (const q of rocksNear(F.hash, P.x, P.y, near)) {
            if (F.gone.has(q.id) || q.r < 180) continue;
            const d = distTo(P.x, P.y, q.x, q.y);
            if (d < 2300 || d > 3900) continue;
            if (!pick || this.frand() < 0.3) pick = q;
          }
          if (pick) this.boulderLoose(pick);
        }
      }
      // ---- drifting boulders
      for (let i = 0; i < K.MAX_CONTACTS; i++) {
        const n = this.npc[i];
        if (!n.active || !n.alive || !n.rock) continue;
        const q = n.rock;
        if (q.tractor) { // the tractor beam reels it in, gently
          const dx = P.x - n.x, dy = P.y - n.y, d = Math.hypot(dx, dy) || 1, sp = 90;
          n.vx += ((P.vx + (dx / d) * sp) - n.vx) * Math.min(1, dt * 1.5);
          n.vy += ((P.vy + (dy / d) * sp) - n.vy) * Math.min(1, dt * 1.5);
          if (d < 450) { this.boulderLanded(i); continue; }
          if (d > 4500 || P.health[K.S_SENSORS] <= 0) { q.tractor = false; this.say(FROM_CREW, 1, 'TRACTOR LOCK LOST ON THE BOULDER!'); }
        }
        n.x += n.vx * dt; n.y += n.vy * dt; q.life -= dt;
        n.speed = Math.hypot(n.vx, n.vy); if (n.speed > 1) n.hdg = bearingTo(0, 0, n.vx, n.vy);
        const d = distTo(P.x, P.y, n.x, n.y);
        if (!q.tractor && d < q.r + ROCK_SHIP_R) {
          const rel = Math.hypot(n.vx - P.vx, n.vy - P.vy);
          this.damagePlayer(n.x, n.y, 6 + q.r / 35 + rel * 0.06);
          this.boomAt(n.x, n.y, 1); this.boulderGone(i);
          this.say(FROM_CREW, 2, 'THE BOULDER HIT US!');
        } else if (q.life <= 0 || d > 15000) this.boulderGone(i);
      }
    },
    boulderLoose(pick) {
      const F = this.field, P = this.P;
      const id = this.spawnAt(K.CT_POI, K.F_NEUTRAL, pick.x, pick.y, 0);
      if (id === NO_ID) return;
      F.gone.add(pick.id);
      const c = this.irand(BOULDER.length), B = BOULDER[c], n = this.npc[id];
      const v = 70 + this.frand() * 50, t = distTo(P.x, P.y, pick.x, pick.y) / v;
      const lx = P.x + P.vx * t * 0.6, ly = P.y + P.vy * t * 0.6, dd = distTo(pick.x, pick.y, lx, ly) || 1;
      const letter = 'ABCDEFGH'[F.nextId++ % 8];
      Object.assign(n, { kind: 0, poi: -1, ai: 0, scan: 0, freq: B.freq, hull: 100, armor: 0, shMax: 0, shields: 0, name: `BOULDER ${letter}`, short: `BOULDER ${letter}`,
        note: `${B.name}. IT ONLY BREAKS UNDER PHASERS TUNED TO FREQUENCY ${K.FREQ_CHAR[B.freq]}. A TRACTOR BEAM COULD REEL IT IN FOR ${B.resName}.`,
        vx: ((lx - pick.x) / dd) * v, vy: ((ly - pick.y) / dd) * v, rock: { r: pick.r, c, life: 75, tractor: false } });
      this.say(FROM_CREW, 1, `A ${B.col} BOULDER HAS BROKEN LOOSE - BEARING ${String(Math.round(bearingTo(P.x, P.y, pick.x, pick.y))).padStart(3, '0')}, COMING AT US! SCIENCE: SCAN IT FOR ITS FREQUENCY. TACTICAL: PHASERS. SHIELDS: REINFORCE THAT SIDE.`);
      this.emit(K.EV_HAZARD);
    },
    boulderGone(i) { const n = this.npc[i]; n.alive = false; n.active = false; if (this.P.target === i) this.P.target = NO_ID; if (this.P.scanId === i) this.P.scanId = NO_ID; },
    boulderLanded(i) {
      const n = this.npc[i], B = BOULDER[n.rock.c], amt = 2 + Math.round(n.rock.r / 150);
      const got = Math.min(amt, Math.max(0, G.HOLD_CAP - this.holdUsed()));
      this.P.cargo[B.res] += got;
      this.say(FROM_CREW, 3, got ? `BOULDER SECURED IN THE CARGO BAY: +${got} ${B.resName}.` : 'THE HOLD IS FULL - WE BROKE THE BOULDER UP AND LET IT GO.');
      this.boulderGone(i);
    },
    // science's tractor beam on a boulder (from the EXTRACT / TRACTOR BEAM button)
    boulderTractor(id) {
      const P = this.P, n = this.npc[id];
      const d = distTo(P.x, P.y, n.x, n.y);
      if (n.rock.tractor) { n.rock.tractor = false; this.say(FROM_CREW, 0, 'TRACTOR BEAM RELEASED.'); return; }
      if (d > 3500) { this.denied('TOO FAR FOR THE TRACTOR BEAM - GET WITHIN 3.5K.'); return; }
      if (P.health[K.S_SENSORS] <= 0) { this.denied('SENSORS OFFLINE.'); return; }
      if (P.energy < 15) { this.denied('NOT ENOUGH ENERGY FOR THE TRACTOR BEAM.'); return; }
      P.energy -= 15;
      n.rock.tractor = true;
      this.say(FROM_CREW, 3, `TRACTOR BEAM LOCKED ON ${n.short} - REELING IT IN SLOWLY.`);
    },
    // phasers against a boulder: only the right frequency cracks it. true = handled.
    boulderHit(id, dmg) {
      const n = this.npc[id], P = this.P;
      if (P.phFreq !== n.freq) {
        if (this.now > (n.rock.wrongAt || 0)) { n.rock.wrongAt = this.now + 3000; this.say(FROM_CREW, 1, `PHASERS ARE SCATTERING OFF ${n.short} - WRONG FREQUENCY.${n.scan >= 2 ? ` IT NEEDS ${K.FREQ_CHAR[n.freq]}.` : ' SCIENCE: SCAN IT.'}`); }
        return true;
      }
      n.hull -= dmg * (420 / Math.max(150, n.rock.r));
      if (n.hull <= 0) { this.boomAt(n.x, n.y, 1); this.boulderGone(id); this.say(FROM_CREW, 3, 'BOULDER DESTROYED.'); }
      return true;
    },
    // TACTICAL: shoot the most dangerous rock in front of us (a loose boulder first, else whatever blocks the way)
    pointDefence() {
      const P = this.P, F = this.field;
      if (!F) { this.denied('NO ASTEROIDS TO TARGET.'); return; }
      if (P.phCharge < 0.99) { this.denied('PHASERS ARE STILL CHARGING.'); return; }
      if (P.health[S_PHASERS] <= 0) { this.denied('PHASERS OFFLINE.'); return; }
      let best = null, bs = -1e9, bi = -1;
      for (let i = 0; i < K.MAX_CONTACTS; i++) {
        const n = this.npc[i];
        if (!n.active || !n.alive || !n.rock || n.rock.tractor) continue;
        const d = distTo(P.x, P.y, n.x, n.y);
        if (d < K.PH_RANGE && 10000 - d > bs) { bs = 10000 - d; best = n; bi = i; }
      }
      if (!best) for (const q of rocksNear(F.hash, P.x, P.y, near)) {
        if (F.gone.has(q.id)) continue;
        const d = distTo(P.x, P.y, q.x, q.y), rel = Math.abs(angDiff(P.hdg, bearingTo(P.x, P.y, q.x, q.y)));
        if (d > 3000 || rel > 50) continue;
        const sc = -d - rel * 40;
        if (sc > bs) { bs = sc; best = q; }
      }
      if (!best) { this.denied('NOTHING IN THE POINT DEFENCE ARC.'); return; }
      P.phCharge = 0;
      const dmg = K.PH_DAMAGE * 1.6 * clampf(this.eff(S_PHASERS), 0.3, 1.6) * this.fx('ph');
      this.beams.push({ from: US, to: NO_ID, hit: true, t0: this.now, tx: best.x, ty: best.y });
      this.emit(K.EV_PHASER_HIT);
      if (bi >= 0) this.boulderHit(bi, dmg);
      else {
        const hp = this.rockHp(best) - dmg;
        if (hp <= 0) this.rockBreak(best); else F.hp.set(best.id, hp);
      }
    },
    // a box w x h in this system clear of planet wells (for the next half hour), the star and stations
    fieldSite(w, h) {
      const cands = [];
      for (const cx of [0.2, 0.5, 0.8]) for (const cy of [0.18, 0.5, 0.82]) if (!(cx === 0.5 && cy === 0.5)) cands.push([cx * 160000, cy * 160000]);
      let best = null, bs = -1e12;
      const t0 = this.now / 1000, sd = this.sysDef;
      for (const [cx, cy] of cands) {
        let m = 1e12;
        const pts = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx - w / 2, cy + h / 2], [cx + w / 2, cy + h / 2], [cx, cy]];
        for (let i = 0; i < sd.planets.length; i++) for (let t = 0; t <= 1800; t += 120) {
          const [px, py] = planetPos(sd, i, t0 + t);
          for (const [x, y] of pts) m = Math.min(m, distTo(x, y, px, py) - wellR(sd.planets[i]));
        }
        for (const [x, y] of pts) m = Math.min(m, distTo(x, y, SYS_C, SYS_C) - WELL_R);
        for (let i = 0; i < K.MAX_CONTACTS; i++) { const n = this.npc[i]; if (n.active && n.type === K.CT_STARBASE) m = Math.min(m, distTo(cx, cy, n.x, n.y) - w / 2 - 6000); }
        const sc = m + this.frand() * 4000;
        if (sc > bs) { bs = sc; best = [cx, cy]; }
      }
      return { x0: Math.round(best[0] - w / 2), y0: Math.round(best[1] - h / 2), x1: Math.round(best[0] + w / 2), y1: Math.round(best[1] + h / 2) };
    },
    // ---- the ASTEROID FIELD mission (MT_FIELD)
    fieldMissionStart() {
      const M = this.M, d = M.diff;
      const box = this.fieldSite(26000, 14000);
      const spec = { seed: 1 + this.irand(1e6), ...box, w: [2400, 2000, 1700][d], bends: 5 + d, driftEvery: [15, 10, 7][d] };
      this.fieldStart(spec);
      const pts = this.field.f.pts;
      M.ids = [];
      [0.3, 0.55, 0.8].forEach((f, i) => {
        const [x, y] = pathAt(pts, f);
        const id = this.spawnAt(K.CT_BUOY, K.F_FRIEND, x, y, 0);
        if (id === NO_ID) return;
        Object.assign(this.npc[id], { name: `MINERAL BEACON ${'ABC'[i]}`, short: `BEACON ${'ABC'[i]}`, scan: 1, ai: 0 });
        M.ids.push(id);
      });
      M.entry = pathAt(pts, 0); M.exit = pathAt(pts, 1); M.done = [];
      this.addMarker(M.entry[0], M.entry[1], K.MK_POINT);
      this.addMarker(M.exit[0], M.exit[1], K.MK_RENDEZVOUS);
      this.setWaypoint(M.entry[0], M.entry[1]);
      this.setObjective(`ASTEROID FIELD: FLY THE CHANNEL - SCAN THE BEACONS FROM WITHIN 3K (0/${M.ids.length}), THEN EXIT THE FAR SIDE`);
      this.say(FROM_COMMAND, 0, `AURORA, A MINING SURVEY LEFT THREE BEACONS INSIDE THE FIELD IN SECTOR ${this.sec((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)}. FLY THE CHANNEL, FULL-SCAN EACH BEACON FROM CLOSE RANGE AND COME OUT THE FAR SIDE. THE ROCKS ARE UNSTABLE - EXPECT BOULDERS TO BREAK LOOSE.`);
    },
    fieldMissionTick() {
      const M = this.M, P = this.P;
      for (const id of M.ids) {
        const n = this.npc[id];
        if (M.done.includes(id) || n.scan < 2) continue;
        if (distTo(P.x, P.y, n.x, n.y) > 3500) { n.scan = 1; this.say(FROM_CREW, 1, `${n.short} IS TOO FAR FOR A CLEAN READING - GET WITHIN 3K AND SCAN AGAIN.`); continue; }
        M.done.push(id);
        this.emit(K.EV_FOUND);
        this.say(FROM_CREW, 3, `${n.short} SCANNED. ${M.done.length < M.ids.length ? `${M.ids.length - M.done.length} TO GO.` : 'ALL BEACONS LOGGED - MAKE FOR THE EXIT.'}`);
        this.setObjective(M.done.length < M.ids.length ? `ASTEROID FIELD: SCAN THE BEACONS FROM WITHIN 3K (${M.done.length}/${M.ids.length}), THEN EXIT THE FAR SIDE` : 'ASTEROID FIELD: ALL BEACONS SCANNED - REACH THE EXIT MARKER ON THE FAR SIDE');
        if (M.done.length >= M.ids.length) this.setWaypoint(M.exit[0], M.exit[1]);
      }
      if (M.done.length >= M.ids.length && distTo(P.x, P.y, M.exit[0], M.exit[1]) < 2500) {
        this.say(FROM_COMMAND, 3, 'WELL FLOWN, AURORA. THE SURVEY DATA IS IN. THAT WAS SOME PILOTING.');
        this.endMission(true);
      }
    },
    fieldSnap() { // for the slow snapshot
      const F = this.field;
      return F ? { spec: F.spec, gone: [...F.gone] } : null;
    },
  });
}
