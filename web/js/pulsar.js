// ============================================================================
// pulsar.js - the PULSAR RESCUE mission.
//   The freighter MERIDIAN is dead in space near a pulsar. Its twin beams sweep
//   round (out at 0 and 180 degrees from the star, rotating) and anything they
//   cross takes a beating. The Aurora keeps the Meridian alive until its jump
//   drive is repaired and it can jump out:
//     - shield it: fly alongside (HELM: ESCORT) with the shield bubble wide
//       enough to cover it - our shields take the hits;
//     - hide it: SCIENCE tractors it (shields down) into the shadow of a large
//       asteroid - the beam can't pass through rock;
//     - hurry the repairs: COMMS sends spare parts, plasma, crystal, alloy or a
//       repair team across (within 5K).
//   Surprises: pirates come for the helpless freighter at 40%, the pulsar
//   glitches (spins up, beam widens) at 70%, and the drive needs a 15s charge.
// Shared by the host (installPulsar) and every screen (drawing helpers).
// ============================================================================
import * as K from './config.js';
import { C } from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { distTo, bearingTo, DEG } from './util.js';
import { CIV_FLEET } from './galaxy.js';

const { NO_ID, US, HAZARD, FROM_CREW, FROM_COMMAND, F_FRIEND, F_UNKNOWN, CT_FREIGHTER, CT_ANOMALY, CT_RAIDER } = K;

export const PUL_LEN = 34000;           // the beams fade out beyond this
export const PUL_CORE = 2200;           // fly closer than this to the pulsar and it hurts
const XFER_R = 5000;                    // transporter range for sending supplies
const TOW_R = 2500, TOW_BREAK = 3800, TOW_BACK = 1100;
const CHARGE_S = 15;                    // the Meridian's jump drive charge once repaired
const REPAIR_S = [240, 300, 360];       // seconds of repairs with no help, by difficulty
const HIT = [11, 14, 17];               // hull the Meridian loses per beam sweep, by difficulty

// ---------------------------------------------------------------- geometry (host and screens)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const pulAngle = (pul, nowMs) => pul.a0 + pul.w * (nowMs - pul.t0) / 1000;
// is a point in the shadow of a large asteroid (seen from the pulsar)?
export function pulShadowed(pul, x, y) {
  const d = Math.hypot(x - pul.x, y - pul.y), a = Math.atan2(y - pul.y, x - pul.x);
  for (const r of pul.rocks) {
    const dr = Math.hypot(r.x - pul.x, r.y - pul.y);
    if (dr >= d) continue;
    if (Math.abs(wrapPi(a - Math.atan2(r.y - pul.y, r.x - pul.x))) < Math.asin(Math.min(1, r.r / dr))) return true;
  }
  return false;
}
// 0 = clear of the beams, 1 = in a beam, 2 = in a beam's path but shadowed by rock
export function pulLit(pul, nowMs, x, y) {
  const d = Math.hypot(x - pul.x, y - pul.y);
  if (d > PUL_LEN || d < 1) return 0;
  const a = Math.atan2(y - pul.y, x - pul.x), b = pulAngle(pul, nowMs);
  let da = wrapPi(a - b);
  if (Math.abs(da) > Math.PI / 2) da = wrapPi(da + Math.PI);
  if (Math.abs(da) > pul.hw) return 0;
  return pulShadowed(pul, x, y) ? 2 : 1;
}
// seconds until the next beam sweeps across a point
export function pulNext(pul, nowMs, x, y) {
  const a = Math.atan2(y - pul.y, x - pul.x), b = pulAngle(pul, nowMs);
  let da = (pul.w > 0 ? a - b : b - a) % Math.PI;
  if (da < 0) da += Math.PI;
  return da / Math.abs(pul.w);
}

// ---------------------------------------------------------------- drawing
// a large asteroid: a lumpy brown rock
export function drawRock(g, x, y, R, seed = 1, u = 1) {
  const c = g.ctx, n = 11;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, h = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const k = 0.78 + (h - Math.floor(h)) * 0.3;
    const px = x + Math.cos(a) * R * k, py = y + Math.sin(a) * R * k;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
  c.fillStyle = '#4a3a2c'; c.fill();
  c.strokeStyle = '#8c7254'; c.lineWidth = Math.max(1, u); c.stroke();
  if (R > 6) { g.circle(x - R * 0.25, y - R * 0.2, R * 0.18, '#3a2c20'); g.circle(x + R * 0.3, y + R * 0.15, R * 0.12, '#3a2c20'); }
}
// the pulsar, its two beams and the rock shadows on any overhead map. p2 maps world -> screen, k = pixels per metre
export function drawPulsarMap(g, w, p2, k, u = 1) {
  const pul = w.M && w.M.pul;
  if (!pul) return;
  const c = g.ctx, b = pulAngle(pul, w.now), [sx, sy] = p2(pul.x, pul.y);
  // the beams: soft wedges with a bright core
  for (const off of [0, Math.PI]) {
    const a = b + off, L = PUL_LEN;
    const [x1, y1] = p2(pul.x + Math.cos(a - pul.hw) * L, pul.y + Math.sin(a - pul.hw) * L);
    const [x2, y2] = p2(pul.x + Math.cos(a + pul.hw) * L, pul.y + Math.sin(a + pul.hw) * L);
    const [xm, ym] = p2(pul.x + Math.cos(a) * L, pul.y + Math.sin(a) * L);
    const gr = c.createLinearGradient(sx, sy, xm, ym);
    gr.addColorStop(0, 'rgba(190,230,255,0.55)'); gr.addColorStop(1, 'rgba(120,180,255,0)');
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fillStyle = gr; c.fill();
    const gl = c.createLinearGradient(sx, sy, xm, ym);
    gl.addColorStop(0, 'rgba(255,255,255,0.9)'); gl.addColorStop(1, 'rgba(200,230,255,0)');
    c.strokeStyle = gl; c.lineWidth = Math.max(1, 1.5 * u); c.beginPath(); c.moveTo(sx, sy); c.lineTo(xm, ym); c.stroke();
  }
  // each large asteroid casts a shadow away from the pulsar: the safe zone
  c.save(); c.setLineDash([3 * u, 5 * u]);
  for (const r of pul.rocks) {
    const dr = Math.hypot(r.x - pul.x, r.y - pul.y), ar = Math.atan2(r.y - pul.y, r.x - pul.x), h = Math.asin(Math.min(1, r.r / dr));
    const L = Math.min(PUL_LEN, dr + 9000);
    const p = [p2(r.x - Math.sin(ar) * r.r, r.y + Math.cos(ar) * r.r), p2(pul.x + Math.cos(ar + h) * L, pul.y + Math.sin(ar + h) * L),
      p2(pul.x + Math.cos(ar - h) * L, pul.y + Math.sin(ar - h) * L), p2(r.x + Math.sin(ar) * r.r, r.y - Math.cos(ar) * r.r)];
    c.beginPath(); p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    c.strokeStyle = '#5a6a5a'; c.lineWidth = u; c.stroke();
  }
  c.restore();
  pul.rocks.forEach((r, i) => {
    const [rx, ry] = p2(r.x, r.y), R = Math.max(3 * u, r.r * k);
    drawRock(g, rx, ry, R, i + 1, u);
    if (R > 5 * u) g.text(rx, ry + R + 3 * u, 'ROCK SHADOW', 10 * u, '#8c9a8c', 'center');
  });
  // the pulsar itself: a hard white point that throbs
  const ph = (w.now / 1000) * Math.abs(pul.w) * 2 / Math.PI;
  const pr = (4 + 2 * Math.abs(Math.sin(ph * Math.PI))) * u;
  g.circle(sx, sy, pr * 2.2, 'rgba(150,200,255,0.25)');
  g.circle(sx, sy, pr, C.WHITE);
}
// the forward view: the pulsar as a blinding point, its beams as lines of light, the rocks as boulders
export function drawPulsarFwd(g, w, r, project) {
  const pul = w.M && w.M.pul, P = w.P;
  if (!pul) return;
  const u = r.u, b = pulAngle(pul, w.now), c = g.ctx;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'butt';
  for (const off of [0, Math.PI]) {
    const a = b + off;
    let prev = null;
    for (let i = 1; i <= 48; i++) {
      const d = (i / 48) * PUL_LEN, wx = pul.x + Math.cos(a) * d, wy = pul.y + Math.sin(a) * d;
      const p = project(w, r, wx, wy, 0.02);
      if (p && prev) {
        // a soft blue sheath round a hot white core, fading with distance from the star
        const halfW = Math.min(14 * u, Math.max(1.2 * u, (d * Math.sin(pul.hw)) / Math.max(400, p.d) * r.F));
        const al = Math.max(0, 1 - i / 48);
        c.strokeStyle = `rgba(90,150,255,${al * 0.18})`; c.lineWidth = halfW * 3; c.beginPath(); c.moveTo(prev.sx, prev.sy); c.lineTo(p.sx, p.sy); c.stroke();
        c.strokeStyle = `rgba(150,200,255,${al * 0.35})`; c.lineWidth = halfW * 1.4; c.beginPath(); c.moveTo(prev.sx, prev.sy); c.lineTo(p.sx, p.sy); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${al * 0.8})`; c.lineWidth = Math.max(1, halfW * 0.35); c.beginPath(); c.moveTo(prev.sx, prev.sy); c.lineTo(p.sx, p.sy); c.stroke();
      }
      prev = p;
    }
  }
  c.restore();
  pul.rocks.forEach((rk, i) => {
    const p = project(w, r, rk.x, rk.y, 0.01);
    if (p && p.d > rk.r) drawRock(g, p.sx, p.sy, Math.max(2 * u, (rk.r / p.d) * r.F), i + 1, u);
  });
  const p = project(w, r, pul.x, pul.y, 0.02);
  if (p) {
    // a hard point of light that throbs with each turn
    const R = Math.max(2.5 * u, Math.min(9 * u, (500 / p.d) * r.F)), th = 0.75 + 0.25 * Math.abs(Math.sin((w.now / 1000) * Math.abs(pul.w) * 2));
    const gr = c.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, R * 6 * th);
    gr.addColorStop(0, 'rgba(230,240,255,0.9)'); gr.addColorStop(0.25, 'rgba(140,190,255,0.35)'); gr.addColorStop(1, 'rgba(80,120,255,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(p.sx, p.sy, R * 6 * th, 0, Math.PI * 2); c.fill();
    g.circle(p.sx, p.sy, R, C.WHITE);
  }
  // we're in the beam: the screen whites out
  const lit = pulLit(pul, w.now, P.x, P.y);
  if (lit === 1) {
    c.fillStyle = 'rgba(210,235,255,0.45)'; c.fillRect(r.x, r.y, r.w, r.h);
    g.text(r.x + r.w / 2, r.y + r.h * 0.7, 'IN THE PULSAR BEAM!', 22 * u, C.BLACK, 'center', true);
  }
}

// ---------------------------------------------------------------- the Meridian's captain
Object.assign(CHARS, {
  odili: { name: 'CAPT. RUTH ODILI', role: 'FREIGHTER MERIDIAN', civ: CIV_FLEET, look: { skin: '#6e4632', hair: '#1e1410', uniform: '#5a6e8c' } },
});
const send = (res, n, pct, what) => ({
  t: `SEND ${n} ${G.RES_NAME[res]} (+${n * pct}% REPAIRS)`,
  if: (s) => s.P.cargo[res] >= n,
  do: (s) => s.pulsarSend(res, n, n * pct, what),
});
Object.assign(DIALOGS, {
  // the lead-in: Voss briefs a routine escort - and the Meridian's mayday cuts across her
  p_brief: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. A SMALL JOB BEFORE YOUR PATROL. THE FREIGHTER MERIDIAN IS RUNNING CRITICAL MEDICAL SUPPLIES TO VESPERA - A RED-FEVER OUTBREAK IN THE SOUTHERN SETTLEMENTS. NINE HUNDRED SICK, AND RISING. I WANT YOU TO MEET HER AND SEE HER IN.',
      opts: [{ t: 'WHAT IS SHE CARRYING?', go: 'cargo' }, { t: 'WHERE IS SHE NOW?', go: 'route' }, { t: 'ON OUR WAY, ADMIRAL', go: 'route2' }] },
    cargo: { say: 'FOUR TONNES OF ANTIVIRAL SERUM, AND THE SYNTHESISERS TO MAKE MORE. VESPERA\'S OWN STOCKS RAN OUT YESTERDAY. WITHOUT THAT SHIP THE FEVER RUNS ITS COURSE - AND IT IS NOT A KIND ONE.',
      opts: [{ t: 'WHERE IS SHE NOW?', go: 'route' }, { t: 'UNDERSTOOD', go: 'route2' }] },
    route: { say: 'CUTTING PAST THE PSR J-7 PULSAR TO SAVE SIX HOURS. THE BEAMS ARE PREDICTABLE IF YOU KEEP YOUR DISTANCE, AND CAPTAIN ODILI HAS RUN THAT ROUTE A DOZEN TI-', auto: [4, 'mayday'] },
    route2: { say: 'GOOD. SHE\'S CUTTING PAST THE PSR J-7 PULSAR TO SAVE SIX HOURS - CAPTAIN ODILI HAS RUN THAT ROUTE A DOZEN TI-', auto: [4, 'mayday'] },
    mayday: { who: 'odili', col: 2, ev: K.EV_ALERT, on: (s) => s.pulsarGo(),
      say: '-AYDAY, MAYDAY, MAYDAY! THIS IS THE FREIGHTER MERIDIAN! COOLANT FIRE - WE\'VE LOST ENGINES AND THE JUMP DRIVE - WE\'RE DRIFTING INTO THE PULSAR\'S SWEEP! ANYONE WHO CAN HEAR THIS-', auto: [6, 'orders'] },
    orders: { who: 'voss', col: 2,
      say: '...AURORA, YOU HEARD HER. YOU ARE THE ONLY SHIP WITHIN TWO HOURS OF THAT PULSAR. GET OUT THERE AND KEEP THAT SHIP - AND THAT SERUM - IN ONE PIECE UNTIL HER JUMP DRIVE IS BACK. AND MIND THOSE BEAMS YOURSELVES.',
      opts: [{ t: 'UNDERSTOOD. WE\'RE ON OUR WAY', go: 'out' }, { t: 'HOW LONG CAN SHE LAST?', go: 'last' }] },
    last: { who: 'voss', say: 'A FREIGHTER\'S HULL IN A PULSAR BEAM? A DOZEN SWEEPS, MAYBE FEWER. THE BIG ASTEROIDS AROUND IT CAST SHADOWS THE BEAM CAN\'T CROSS - THAT MAY BE YOUR BEST FRIEND. AND YOUR SHIELD BUBBLE, IF YOU CAN GET IT OVER HER.',
      opts: [{ t: 'ON OUR WAY', go: 'out' }] },
    out: { who: 'voss', say: 'NINE HUNDRED PEOPLE, AURORA. VOSS OUT.', opts: [] },
  } },
  p_meridian: { who: 'odili', nodes: {
    start: { say: (s) => s.pulsarHello(),
      opts: [
        { t: 'WHAT DO YOU NEED FOR REPAIRS?', go: 'need' },
        { t: 'HOW DO WE KEEP THE BEAM OFF YOU?', go: 'protect' },
        { t: 'STATUS?', do: (s) => { s.sayAs('odili', s.pulsarStatus()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
    need: { say: 'SPARE PARTS MOST OF ALL - EVERY BOX SAVES US HOURS. PLASMA TO RE-PRIME THE DRIVE COILS, LATTICE CRYSTAL FOR THE FIELD REGULATOR, ALLOY FOR PATCHING. OR LEND US HANDS: ONE OF YOUR REPAIR TEAMS WOULD SPEED US UP BY HALF AGAIN. YOU\'LL NEED TO BE WITHIN 5K TO BEAM ANYTHING ACROSS.',
      opts: [
        send(G.R_SPARES, 3, 4, 'SPARE PARTS'), send(G.R_PLASMA, 1, 5, 'PLASMA'), send(G.R_CRYSTAL, 1, 4, 'LATTICE CRYSTAL'), send(G.R_ALLOY, 2, 2, 'ALLOY'),
        { t: 'BEAM OVER REPAIR TEAM 2 (FASTER REPAIRS - WE LOSE THAT TEAM)', if: (s) => !s.pulS.lent, do: (s) => s.pulsarLend() },
        { t: 'THAT\'S ALL', go: 'start' },
      ] },
    protect: { say: 'TWO WAYS I CAN SEE. GET CLOSE AND OPEN YOUR SHIELD BUBBLE OVER US - YOUR SHIELDS TAKE THE HITS INSTEAD OF MY HULL. OR HIDE US: THOSE BIG ASTEROIDS CAST A SHADOW - THE BEAM CAN\'T GO THROUGH ROCK. YOUR SCIENCE OFFICER CAN TRACTOR US INTO ONE, BUT ONLY WITH YOUR SHIELDS DOWN AND WITHIN 2.5K. THE SHADOWS ARE ON YOUR NAV MAP.',
      opts: [{ t: 'UNDERSTOOD', go: 'start' }] },
  } },
});

// ---------------------------------------------------------------- host side
export function installPulsar(Sim) {
  Object.assign(Sim.prototype, {
    pulsarStart() {
      const M = this.M, P = this.P;
      this.pulS = { rep: 0, hitT: {}, lent: false, tow: false, stage: 0, chargeT: 0, warned: 0, said: {} };
      const [px, py] = this.randomPoint(42000, 62000);
      const am = this.frand() * Math.PI * 2, spin = this.frand() < 0.5 ? -1 : 1;
      const at = (a, d) => [this.clampSec(px + Math.cos(a) * d), this.clampSec(py + Math.sin(a) * d)];
      const rocks = [[am + 0.27, 10200, 1300], [am - 0.46, 8800, 1150], [am + 2.4, 11500, 1400]].map(([a, d, r]) => { const [x, y] = at(a, d); return { x: Math.round(x), y: Math.round(y), r }; });
      // start the beam well away from the Meridian so the crew has time to arrive
      M.pul = { x: Math.round(px), y: Math.round(py), a0: am + Math.PI / 2, w: spin * (Math.PI * 2) / 50, t0: this.now, hw: 2.3 * Math.PI / 180, rocks };
      const [fx, fy] = at(am, 13000);
      M.fr = this.spawnAt(CT_FREIGHTER, F_FRIEND, fx, fy, bearingTo(fx, fy, px, py));
      Object.assign(this.npc[M.fr], { ai: 0, scan: 1, name: 'FREIGHTER MERIDIAN', short: 'MERIDIAN', civ: CIV_FLEET, hull: 100, shields: 0, shMax: 0, eng: 0, speed: 0, talk: 'p_meridian' });
      this.pulS.anom = this.spawnAt(CT_ANOMALY, F_UNKNOWN, px, py, 0);
      if (this.pulS.anom !== NO_ID) Object.assign(this.npc[this.pulS.anom], { name: 'PULSAR PSR J-7', short: 'PULSAR', scan: 1,
        note: 'A NEUTRON STAR SPINNING ONCE EVERY 50 SECONDS. TWO BEAMS OF HARD RADIATION, OPPOSITE EACH OTHER, SWEEP THE SYSTEM - A SHIP IS HIT TWICE A TURN. SOLID ROCK BLOCKS THE BEAM: THE LARGE ASTEROIDS NEARBY CAST SAFE SHADOWS. THE CRUST IS UNDER STRAIN - WATCH FOR A GLITCH.' });
      // the mission opens on a routine briefing; the Meridian's mayday interrupts it (p_brief).
      // Until then the pulsar does no harm - the beams start counting from the mayday.
      this.pulS.held = true; this.pulS.fx = fx; this.pulS.fy = fy;
      this.setObjective('STAND BY - ADMIRAL VOSS IS ON THE LINE');
      this.after(2, () => { if (this.M.type === K.MT_PULSAR && this.pulS && this.pulS.held) this.startDialog('p_brief', FROM_COMMAND); });
      this.after(70, () => { if (this.M.type === K.MT_PULSAR && this.pulS && this.pulS.held) this.pulsarGo(); }); // nobody listened: the mayday comes anyway
      M.ver++;
    },
    pulsarGo() {
      const s = this.pulS, M = this.M;
      if (!s || !s.held) return;
      s.held = false;
      const { fx, fy } = s;
      M.pul.t0 = this.now; // the beams were placed clear of her: start their sweep from there now
      this.addMarker(fx, fy, K.MK_RENDEZVOUS);
      this.setWaypoint(fx, fy);
      this.setObjective(`PULSAR RESCUE: REACH THE MERIDIAN IN SECTOR ${this.sec(fx, fy)} - SHE'S DEAD IN SPACE IN THE PULSAR'S BEAMS, CARRYING VESPERA'S FEVER SERUM`);
      if (!this.dlg) this.say(FROM_COMMAND, 2, `AURORA, THE FREIGHTER MERIDIAN - CARRYING SERUM FOR VESPERA'S FEVER OUTBREAK - HAS LOST HER ENGINES BESIDE A PULSAR IN SECTOR ${this.sec(fx, fy)}. YOU'RE THE ONLY SHIP IN RANGE. KEEP HER ALIVE UNTIL HER JUMP DRIVE IS REPAIRED. HAIL HER CAPTAIN WHEN YOU ARRIVE.`);
      else this.after(1, () => this.say(FROM_CREW, 0, `THE MERIDIAN'S BEACON: SECTOR ${this.sec(fx, fy)}. POSITION MARKED AND SET AS OUR WAYPOINT, CAPTAIN.`));
      M.ver++;
    },
    pulsarHello() {
      const s = this.pulS;
      if (s.held) this.pulsarGo(); // they found her before the mayday finished
      if (!s.met) { s.met = true; return 'AURORA! THANK GOD. RUTH ODILI, MASTER OF THE MERIDIAN. A COOLANT FIRE TOOK OUR ENGINES AND THE JUMP DRIVE WITH THEM - WE DRIFTED INTO THIS THING\'S PATH. EVERY TIME THE BEAM COMES ROUND WE LOSE MORE HULL. MY ENGINEERS ARE ON THE JUMP DRIVE NOW. KEEP US IN ONE PIECE UNTIL IT\'S BACK AND WE\'RE GONE.'; }
      return 'AURORA, ODILI HERE. WHAT DO YOU NEED?';
    },
    pulsarStatus() {
      const n = this.npc[this.M.fr], s = this.pulS;
      return `HULL ${Math.round(n.hull)}%. JUMP DRIVE ${Math.floor(s.rep)}% REPAIRED${s.lent ? ' - YOUR TEAM IS WORKING WONDERS' : ''}. NEXT SWEEP IN ${Math.ceil(pulNext(this.M.pul, this.now, n.x, n.y))} SECONDS.`;
    },
    pulsarSend(res, n, pct, what) {
      const f = this.npc[this.M.fr], P = this.P, s = this.pulS;
      if (distTo(P.x, P.y, f.x, f.y) > XFER_R) { this.sayAs('odili', 'YOU\'RE TOO FAR OUT FOR THE TRANSPORTERS, AURORA - CLOSE TO 5K.'); return 'need'; }
      if (s.stage >= 1) { this.sayAs('odili', 'THE DRIVE IS DONE - WE DON\'T NEED ANY MORE. THANK YOU.'); return 'start'; }
      P.cargo[res] -= n;
      s.rep = Math.min(100, s.rep + pct);
      this.emit(K.EV_REFINED);
      this.say(FROM_CREW, 3, `${n} ${what} BEAMED ACROSS TO THE MERIDIAN. JUMP DRIVE REPAIRS +${pct}% - NOW ${Math.floor(s.rep)}%.`);
      return 'need';
    },
    pulsarLend() {
      const f = this.npc[this.M.fr], P = this.P, s = this.pulS;
      if (distTo(P.x, P.y, f.x, f.y) > XFER_R) { this.sayAs('odili', 'YOU\'RE TOO FAR OUT FOR THE TRANSPORTERS, AURORA - CLOSE TO 5K.'); return 'need'; }
      s.lent = true; P.team[1] = NO_ID;
      this.say(FROM_CREW, 0, 'REPAIR TEAM 2 HAS BEAMED ACROSS TO THE MERIDIAN. WE HAVE ONE REPAIR TEAM LEFT UNTIL THEY\'RE BACK.');
      this.sayAs('odili', 'YOUR PEOPLE ARE ALREADY IN THE DRIVE ROOM. THAT\'S HALF AGAIN AS MANY HANDS - THANK YOU.');
      return 'start';
    },
    // the TRACTOR BEAM button on the Meridian (or release): returns true when it handled the command
    towCmd(id) {
      const M = this.M, s = this.pulS, P = this.P;
      if (M.type !== K.MT_PULSAR || !s || M.stage >= K.ST_RETURN) return false;
      if (id === NO_ID && s.tow) { s.tow = false; this.say(FROM_CREW, 0, 'TRACTOR BEAM RELEASED. THE MERIDIAN IS DRIFTING FREE.'); return true; }
      if (id !== M.fr) return false;
      if (s.tow) { s.tow = false; this.say(FROM_CREW, 0, 'TRACTOR BEAM RELEASED.'); return true; }
      const f = this.npc[M.fr], d = distTo(P.x, P.y, f.x, f.y);
      if (d > TOW_R) { this.denied(`TOO FAR FOR THE TRACTOR BEAM - GET WITHIN ${TOW_R / 1000}K OF THE MERIDIAN.`); return true; }
      if (P.shieldRaise > 0.05) { this.denied('LOWER SHIELDS - THE TRACTOR BEAM CANNOT WORK THROUGH THEM.'); return true; }
      s.tow = true;
      this.say(FROM_CREW, 0, 'TRACTOR BEAM LOCKED ON THE MERIDIAN. SHE WILL FOLLOW ASTERN OF US - HELM, TAKE HER INTO A ROCK SHADOW, AND GO GENTLY.');
      return true;
    },
    towOk() { const M = this.M; return M.type === K.MT_PULSAR && this.pulS && M.stage < K.ST_RETURN && this.npc[M.fr] && this.npc[M.fr].alive ? M.fr : NO_ID; },
    pulsarTick(dt) {
      const M = this.M, P = this.P, s = this.pulS, pul = M.pul, f = this.npc[M.fr];
      if (!s || !f || !f.alive || s.held) return;
      const diff = M.diff;
      // ---- the beams
      const beam = (key, x, y, hit) => {
        const lit = pulLit(pul, this.now, x, y);
        if (lit === 1 && !(this.now - (s.hitT[key] || -1e9) < 2000)) { s.hitT[key] = this.now; hit(); }
        return lit;
      };
      const fLit = beam('fr', f.x, f.y, () => {
        let dmg = HIT[diff];
        if (this.sheltered(f)) { dmg = this.absorb(pul.x, pul.y, dmg); if (dmg <= 0.01) { this.say(FROM_CREW, 3, 'BEAM SWEEP - OUR SHIELDS TOOK IT FOR THE MERIDIAN.'); return; } }
        this.damageNpc(M.fr, dmg, K.SUB_HULL, HAZARD, true);
        if (f.alive) this.sayAs('odili', `BEAM HIT! HULL ${Math.round(f.hull)}%.`, f.hull < 35 ? 2 : 1);
      });
      if (fLit === 2 && !s.said.shadow) { s.said.shadow = true; this.say(FROM_CREW, 3, 'THE BEAM PASSED RIGHT OVER THE MERIDIAN - THE ROCK TOOK IT. SHE\'S SAFE IN THE SHADOW.'); }
      beam('us', P.x, P.y, () => { this.damagePlayer(pul.x, pul.y, 14); this.emit(K.EV_HAZARD); this.say(FROM_CREW, 2, 'WE\'RE IN THE PULSAR BEAM!'); });
      for (const id of M.foes) { const n = this.npc[id]; if (n && n.alive) beam('n' + id, n.x, n.y, () => this.damageNpc(id, 18, K.SUB_HULL, HAZARD, true)); }
      // don't fly into the neutron star
      const dp = distTo(P.x, P.y, pul.x, pul.y);
      if (dp < PUL_CORE) {
        const a = Math.atan2(P.y - pul.y, P.x - pul.x);
        P.x = pul.x + Math.cos(a) * PUL_CORE; P.y = pul.y + Math.sin(a) * PUL_CORE;
        if ((s.coreT = (s.coreT || 0) - dt) <= 0) { s.coreT = 1.5; this.damagePlayer(pul.x, pul.y, 8); this.say(FROM_CREW, 2, 'TOO CLOSE TO THE NEUTRON STAR - GRAVITATIONAL SHEAR! PULL AWAY!'); }
      }
      // the rocks are solid
      for (const r of pul.rocks) {
        for (const o of [P, ...(s.tow ? [f] : [])]) {
          const d = distTo(o.x, o.y, r.x, r.y), R = r.r + (o === P ? 250 : 200);
          if (d < R) { const a = Math.atan2(o.y - r.y, o.x - r.x); o.x = r.x + Math.cos(a) * R; o.y = r.y + Math.sin(a) * R; if (o === P) { P.vx *= 0.3; P.vy *= 0.3; } }
        }
      }
      // ---- the tow
      if (s.tow) {
        const d = distTo(P.x, P.y, f.x, f.y);
        if (P.shieldRaise > 0.05) { s.tow = false; this.say(FROM_CREW, 1, 'SHIELDS UP - THE TRACTOR BEAM HAS DROPPED THE MERIDIAN.'); }
        else if (d > TOW_BREAK) { s.tow = false; this.say(FROM_CREW, 1, 'TOO FAST - THE TRACTOR BEAM SNAPPED. GO BACK FOR HER, AND GENTLER THIS TIME.'); }
        else {
          const hr = P.hdg * DEG, tx = P.x - Math.sin(hr) * TOW_BACK, ty = P.y + Math.cos(hr) * TOW_BACK;
          const dd = distTo(f.x, f.y, tx, ty), step = Math.min(dd, 190 * dt);
          if (dd > 1) { f.x += (tx - f.x) / dd * step; f.y += (ty - f.y) / dd * step; }
          f.hdg = P.hdg;
        }
      }
      // ---- repairs
      if (s.stage === 0) {
        s.rep = Math.min(100, s.rep + (100 / REPAIR_S[diff]) * (s.lent ? 1.6 : 1) * dt);
        if (s.rep >= 40 && !s.said.pirates) {
          s.said.pirates = true;
          this.warpInGroup(2 + (diff >= 2 ? 1 : 0), 0, f.x, f.y, 12000, M.fr, US);
          this.sayAs('odili', 'AURORA - SHIPS DROPPING OUT OF WARP! KESSARI PIRATES - THEY\'VE HEARD A HELPLESS FREIGHTER IS SITTING HERE. THEY\'LL STRIP US!', 2);
          this.after(4, () => this.say(FROM_CREW, 3, 'TACTICAL NOTE: THE BEAM HITS THEM TOO. DRAW THEM ACROSS ITS PATH IF YOU CAN.'));
        }
        if (s.rep >= 62 && !s.said.quake) { s.said.quake = true; this.say(FROM_CREW, 1, 'SCIENCE: MICRO-QUAKES IN THE PULSAR\'S CRUST. IT\'S ABOUT TO GLITCH - WHEN IT DOES IT WILL SPIN FASTER AND THE BEAMS WILL WIDEN. GET THE MERIDIAN COVERED.'); }
        if (s.rep >= 70 && !s.said.glitch) {
          s.said.glitch = true;
          const b = pulAngle(pul, this.now);
          Object.assign(pul, { a0: b, t0: this.now, w: pul.w * 1.45, hw: pul.hw * 1.35 }); M.ver++;
          this.emit(K.EV_ALERT);
          this.say(FROM_CREW, 2, 'THE PULSAR HAS GLITCHED! ROTATION UP 45%, THE BEAMS ARE WIDER - A SWEEP EVERY 17 SECONDS NOW.');
        }
        if (s.rep >= 100) {
          s.stage = 1; s.chargeT = CHARGE_S;
          this.sayAs('odili', `JUMP DRIVE IS ONLINE! CHARGING NOW - ${CHARGE_S} SECONDS. WE CAN'T MOVE WHILE IT CHARGES, SO HOLD THAT BEAM OFF US A LITTLE LONGER.`, 3);
        }
      } else if (s.stage === 1) {
        s.chargeT -= dt;
        if (s.tow && s.chargeT < CHARGE_S - 1) { s.tow = false; this.say(FROM_CREW, 0, 'RELEASING THE TRACTOR BEAM FOR THE MERIDIAN\'S JUMP.'); }
        if (s.chargeT <= 0) {
          s.stage = 2;
          M.frSaved = true;
          this.sayAs('odili', 'WE\'RE GOING. AURORA - THE MERIDIAN AND ALL TWENTY-THREE OF US OWE YOU. CLEAR SKIES.', 3);
          this.boomAt(f.x, f.y, 2); this.emit(K.EV_JUMP);
          f.active = false;
          if (s.lent) { s.lent = false; this.say(FROM_CREW, 0, 'REPAIR TEAM 2 BEAMED BACK ABOARD BEFORE SHE JUMPED.'); }
          this.repAdd(CIV_FLEET, 5);
        }
      }
      // ---- the objective
      const fin = s.stage === 2;
      if (fin) {
        if (this.foesDone()) this.beginReturn('THE MERIDIAN IS SAFE. A FINE PIECE OF WORK, AURORA - RETURN TO STARBASE 12.');
        else this.setObjective(`THE MERIDIAN IS AWAY - DRIVE OFF THE PIRATES (${this.foesLeft()} LEFT)`);
        return;
      }
      const near = distTo(P.x, P.y, f.x, f.y) < 15000;
      if (!near && !s.met) return;
      const cover = fLit === 2 || pulShadowed(pul, f.x, f.y) ? 'IN ROCK SHADOW' : this.sheltered(f) ? 'UNDER OUR SHIELDS' : 'EXPOSED';
      const nx = Math.ceil(pulNext(pul, this.now, f.x, f.y));
      const what = s.stage === 1 ? `JUMP DRIVE CHARGING ${Math.max(0, Math.ceil(s.chargeT))}s` : `JUMP DRIVE ${Math.floor(s.rep)}%`;
      const foes = this.foesLeft() ? `  PIRATES ${this.foesLeft()}` : '';
      this.setObjective(`PULSAR RESCUE: MERIDIAN HULL ${Math.round(f.hull)}%  ${what}  NEXT SWEEP ${nx}s - ${cover}${s.tow ? '  (IN TOW)' : ''}${foes}`);
      if (!s.said.howto && near) {
        s.said.howto = true;
        this.say(FROM_CREW, 3, 'OPTIONS, CAPTAIN: SHIELDS - WIDEN THE BUBBLE OVER HER (HELM ESCORTS HER). SCIENCE - TRACTOR HER INTO A ROCK SHADOW (SHIELDS DOWN). COMMS - HAIL HER AND SEND SUPPLIES TO SPEED HER REPAIRS.');
      }
    },
  });
}
