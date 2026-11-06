// ============================================================================
// sound.js - bridge sounds synthesised with WebAudio, in the spirit of a
// starship bridge: soft computer chirps, a whooping red-alert klaxon,
// sustained phaser beams, torpedo launches with an echo, and engines that
// spool up (warp and jump drive whine while they charge, then engage).
// sound.update(w) each frame drives the charging hum; sound.event(e) plays
// the sound for a host event. API kept from the original buzzer library.
// ============================================================================
import * as K from './config.js';

class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 1;   // overall level (TV is a little quieter than phones)
    this.wave = 'sine'; // kept for compatibility
    this.active = 0;
    this.loops = {};
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      // a little room: a short generated reverb most sounds feed into
      this.verb = this.ctx.createConvolver();
      const len = this.ctx.sampleRate * 1.6, ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      this.verb.buffer = ir;
      this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = 0.25;
      this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
      const nl = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, nl, this.ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  // ---------------------------------------------------------------- building blocks
  out(level, wet = 0.3) { // a gain node routed to the speakers (and some reverb)
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    if (wet > 0) { const s = this.ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.verb); }
    g.level = level * this.volume;
    return g;
  }
  env(g, t, a, hold, r, level = g.level) { // attack / hold / release
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + a);
    g.gain.setValueAtTime(level, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return t + a + hold + r;
  }
  osc(type, f0, f1, t, dur, dest, curve = 'exp') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) { if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, t + dur); else o.frequency.linearRampToValueAtTime(f1, t + dur); }
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    this.track(o, dur);
    return o;
  }
  noise(t, dur, dest, type = 'bandpass', f0 = 1000, f1 = f0, q = 1) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f); f.connect(dest); src.start(t); src.stop(t + dur + 0.05);
    this.track(src, dur);
    return src;
  }
  track(node, dur) { this.active++; setTimeout(() => { this.active--; }, (dur + 0.1) * 1000); }
  busy(max = 6) { return this.active > max; }
  chirp(notes, type = 'sine', level = 0.5, gap = 0.012) { // LCARS-style note sequences [[freq, ms], ...]
    if (!this.ok) return;
    let t = this.ctx.currentTime + 0.005;
    for (const [f, ms] of notes) {
      const d = ms / 1000;
      if (f) { const g = this.out(level, 0.15); this.env(g, t, 0.004, d * 0.6, d * 0.4 + 0.03); this.osc(type, f, f * 1.015, t, d + 0.05, g); }
      t += d + gap;
    }
  }
  // ---------------------------------------------------------------- user interface
  tap() { this.chirp([[1760, 35]], 'sine', 0.35); }
  toggle() { this.chirp([[1480, 30], [2217, 45]], 'sine', 0.35); }
  denied() { this.chirp([[440, 90], [330, 140]], 'triangle', 0.5); }
  sliderTick() { if (!this.busy(3)) this.chirp([[2600, 8]], 'sine', 0.12); }
  // ---------------------------------------------------------------- weapons
  phaser() { // a sustained, slightly warbling beam
    if (!this.ok || this.busy(8)) return;
    const t = this.ctx.currentTime, g = this.out(0.32, 0.35), dur = 0.75;
    this.env(g, t, 0.03, dur - 0.25, 0.22);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2; f.connect(g);
    const o = this.osc('sawtooth', 820, 780, t, dur, f, 'lin');
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 60;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    this.osc('sine', 1640, 1560, t, dur, g, 'lin');
    this.noise(t, dur, g, 'bandpass', 3000, 2500, 3);
  }
  torpLaunch() { // a bright "pew" falling away, with an echo
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.45, 0.6);
    this.env(g, t, 0.005, 0.12, 0.6);
    this.osc('sine', 1900, 180, t, 0.7, g);
    this.osc('triangle', 950, 120, t, 0.7, g);
    const n = this.out(0.25, 0.4); this.env(n, t, 0.005, 0.05, 0.35); this.noise(t, 0.4, n, 'lowpass', 4000, 400, 0.7);
  }
  torpHit() { this.boom(0.55, 0.9, 120); }
  weBlocked() { // a shimmering shield impact
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.4, 0.5);
    this.env(g, t, 0.005, 0.08, 0.5);
    this.noise(t, 0.6, g, 'bandpass', 2400, 900, 4);
    this.osc('sine', 700, 380, t, 0.5, g);
    this.osc('sine', 1050, 560, t, 0.5, g);
  }
  weHit() { this.boom(0.8, 1.2, 70); }
  boom(level = 0.6, dur = 1, low = 90) { // explosion / hull impact
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(level, 0.5);
    this.env(g, t, 0.005, 0.06, dur);
    this.noise(t, dur, g, 'lowpass', 1800, 120, 0.8);
    this.osc('sine', low * 1.6, low * 0.5, t, dur * 0.8, g);
  }
  enemyMissed() { this.chirp([[1200, 40], [1600, 50]], 'sine', 0.25); }
  enemyDestroyed() { this.boom(0.7, 1.6, 60); setTimeout(() => this.chirp([[1568, 60], [2093, 110]], 'sine', 0.3), 700); }
  // ---------------------------------------------------------------- alerts and events
  redAlert() { // the whooping klaxon, three times
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.75, g = this.out(0.42, 0.25);
      this.env(g, t, 0.03, 0.4, 0.12);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.connect(g);
      this.osc('square', 330, 900, t, 0.55, f, 'lin');
      this.osc('sawtooth', 332, 905, t, 0.55, f, 'lin');
    }
  }
  yellowAlert() { this.chirp([[988, 180], [0, 60], [988, 180]], 'triangle', 0.45); }
  greenAlert() { this.chirp([[1318, 90], [988, 90], [784, 180]], 'sine', 0.35); }
  systemOffline() { this.chirp([[880, 120], [660, 160], [0, 80], [880, 120], [660, 160]], 'triangle', 0.45); }
  overheat() { this.chirp([[700, 70], [0, 60], [700, 70], [0, 60], [700, 70]], 'square', 0.18); }
  scanComplete() { // a sensor trill that resolves upward
    const n = []; for (let i = 0; i < 6; i++) n.push([i % 2 ? 2350 : 2000, 28]);
    n.push([2637, 110]); this.chirp(n, 'sine', 0.28, 0.004);
  }
  radarPing() { // something arriving: a deep ping with a tail
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.35, 0.8);
    this.env(g, t, 0.005, 0.05, 1.2);
    this.osc('sine', 1180, 1150, t, 1.3, g);
  }
  message() { this.chirp([[1047, 70], [1319, 70], [1568, 140]], 'sine', 0.35); } // incoming hail whistle
  docked() {
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.5, 0.3); this.env(g, t, 0.003, 0.03, 0.25); this.noise(t, 0.3, g, 'lowpass', 900, 200, 1);
    setTimeout(() => this.chirp([[880, 90], [1109, 90], [1319, 160]], 'sine', 0.3), 250);
  }
  order() { this.chirp([[1318, 50], [1760, 50], [0, 40], [1318, 50], [1760, 90]], 'sine', 0.45); }
  victory() { this.chirp([[523, 180], [659, 180], [784, 180], [1047, 520]], 'triangle', 0.4, 0.03); }
  defeat() { this.chirp([[392, 300], [349, 300], [311, 300], [262, 700]], 'triangle', 0.4, 0.04); }
  // ---------------------------------------------------------------- engines
  warpEngage() { // the stretch and the snap into warp - soft, not a bang
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.4, 0.7);
    this.env(g, t, 0.25, 0.15, 1.3);
    this.osc('sine', 160, 1100, t, 0.5, g);
    this.osc('triangle', 80, 520, t, 0.5, g);
    const n = this.out(0.28, 0.6); this.env(n, t + 0.2, 0.05, 0.1, 1.2); this.noise(t + 0.2, 1.4, n, 'bandpass', 600, 3500, 1.5);
  }
  jumpEngage() { // the jump drive fires: a deep drop and a long rush
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.6, 0.8);
    this.env(g, t, 0.05, 0.4, 2.2);
    this.osc('sine', 220, 35, t, 2.5, g);
    this.osc('sawtooth', 110, 30, t, 1.2, g);
    const n = this.out(0.35, 0.8); this.env(n, t, 0.3, 1.0, 2.0); this.noise(t, 3.3, n, 'bandpass', 300, 2600, 1.2);
  }
  arrive() {
    if (!this.ok) return;
    const t = this.ctx.currentTime, g = this.out(0.45, 0.7);
    this.env(g, t, 0.01, 0.1, 1.4);
    this.osc('sine', 900, 120, t, 1.4, g);
    this.noise(t, 1.2, g, 'lowpass', 3000, 200, 0.7);
  }
  // a looping hum that rises with charge (kind: 'warp' | 'jump'); p = 0..1, or -1 to stop
  charge(kind, p) {
    if (!this.ctx) return;
    let L = this.loops[kind];
    if (p < 0 || !this.ok) {
      if (L) { const t = this.ctx.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0.0001, t, 0.08); L.o1.stop(t + 0.4); L.o2.stop(t + 0.4); L.lfo.stop(t + 0.4); delete this.loops[kind]; }
      return;
    }
    const t = this.ctx.currentTime;
    if (!L) {
      const g = this.out(kind === 'jump' ? 0.32 : 0.22, 0.4);
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      o1.type = 'sine'; o2.type = kind === 'jump' ? 'sawtooth' : 'triangle';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      o1.connect(g); o2.connect(f); f.connect(g);
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = kind === 'jump' ? 5 : 7; lg.gain.value = 0.35 * g.level;
      lfo.connect(lg); lg.connect(g.gain); lfo.start(); o1.start(); o2.start();
      L = this.loops[kind] = { g, o1, o2, lfo, f };
      g.gain.setTargetAtTime(g.level, t, 0.2);
    }
    const base = kind === 'jump' ? 55 : 110, top = kind === 'jump' ? 420 : 880;
    L.o1.frequency.setTargetAtTime(base + (top - base) * p, t, 0.1);
    L.o2.frequency.setTargetAtTime((base + (top - base) * p) / 2, t, 0.1);
    L.f.frequency.setTargetAtTime(400 + 2200 * p, t, 0.1);
    L.lfo.frequency.setTargetAtTime((kind === 'jump' ? 4 : 6) + 14 * p, t, 0.1);
  }
  // call every frame: keeps the charging hums in step with the ship
  update(w) {
    if (!this.ctx || !w || !w.have) return;
    const P = w.P, run = w.game === K.GS_RUN;
    const wc = run && P.warpSet > 0 && !P.warping && P.warpCharge > 0 && P.warpCharge < 1;
    this.charge('warp', wc ? P.warpCharge : -1);
    const jc = run && P.jumpTo !== K.NO_ID && !(P.jumping > 0) && P.jumpCharge > 0;
    this.charge('jump', jc ? P.jumpCharge : -1);
  }
  // sound for a host event
  event(e) {
    switch (e.type) {
      case K.EV_PHASER_HIT: case K.EV_PHASER_MISS: this.phaser(); break;
      case K.EV_TORP_LAUNCH: this.torpLaunch(); break;
      case K.EV_WE_HIT_SHIELD: this.weBlocked(); break;
      case K.EV_WE_HIT_HULL: this.weHit(); break;
      case K.EV_SYS_DAMAGED: this.systemOffline(); break;
      case K.EV_ENEMY_DESTROYED: this.enemyDestroyed(); break;
      case K.EV_SCAN_DONE: this.scanComplete(); break;
      case K.EV_MESSAGE: this.message(); break;
      case K.EV_DOCKED: this.docked(); break;
      case K.EV_WARP_IN: this.radarPing(); break;
      case K.EV_OVERHEAT: this.overheat(); break;
      case K.EV_TORP_HIT: this.torpHit(); break;
      case K.EV_ENEMY_MISSED: this.enemyMissed(); break;
      case K.EV_DENIED: this.denied(); break;
      case K.EV_WARP_ENGAGED: this.charge('warp', -1); this.warpEngage(); break;
      case K.EV_JUMP: this.charge('jump', -1); this.jumpEngage(); break;
      case K.EV_ARRIVE: this.arrive(); break;
      case K.EV_ALERT: if (e.arg === K.AL_RED) this.redAlert(); else if (e.arg === K.AL_YELLOW) this.yellowAlert(); else this.greenAlert(); break;
      case K.EV_VICTORY: this.victory(); break;
      case K.EV_DEFEAT: this.defeat(); break;
    }
  }
}
export const sound = new Sound();
