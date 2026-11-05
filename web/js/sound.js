// sound.js - the buzzer sound library from the hardware build, played with
// WebAudio. A new sound replaces the one playing if its priority is the
// same or higher (a button beep never cuts off a "SYSTEM OFFLINE" alarm).
import * as K from './config.js';

const UI = 1, WEAPON = 2, EVENT = 3, ALARM = 4, BIG = 5;

class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.05;
    this.wave = 'square';
    this.cur = null; // {osc, gain, end, prio}
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  play(prio, notes) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime;
    if (this.cur && this.cur.end > t0 && prio < this.cur.prio) return;
    if (this.cur) { try { this.cur.osc.stop(); } catch {} }
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = this.wave;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    let t = t0 + 0.005;
    gain.gain.setValueAtTime(0, t0);
    for (const [f, ms] of notes) {
      const d = ms / 1000;
      if (f) {
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(this.volume, t);
        gain.gain.setValueAtTime(0, t + Math.max(0.004, d - 0.003));
      }
      t += d;
    }
    osc.start(t0);
    osc.stop(t + 0.02);
    this.cur = { osc, gain, end: t, prio };
  }
  blip(f, ms) { // only when nothing else plays
    if (this.ctx && this.cur && this.cur.end > this.ctx.currentTime) return;
    this.play(0, [[f, ms]]);
  }
  // ---------------------------------------------------------------- library
  tap() { this.play(UI, [[2000, 50]]); }
  denied() { this.play(UI, [[500, 150]]); }
  toggle() { this.play(UI, [[1800, 30], [0, 20], [2400, 40]]); }
  sliderTick() { this.blip(2600, 10); }
  phaser() { const n = [[2000, 30]]; for (let i = 0; i < 16; i++) n.push([i % 2 ? 1850 : 2200, 35]); this.play(WEAPON, n); }
  torpLaunch() { const n = [[2000, 30]]; for (let f = 1500; f >= 350; f -= 100) n.push([f, 30]); this.play(WEAPON, n); }
  weBlocked() { this.play(EVENT, [[900, 60], [650, 60], [450, 80]]); }
  weHit() { this.play(EVENT, [[220, 90], [150, 120], [110, 160], [90, 120]]); }
  enemyMissed() { this.play(EVENT, [[1100, 40], [1500, 40]]); }
  systemOffline() { const n = []; for (let i = 0; i < 3; i++) n.push([880, 140], [587, 140]); this.play(ALARM, n); }
  scanComplete() { this.play(EVENT, [[1568, 70], [0, 30], [1568, 70], [0, 30], [2093, 160]]); }
  radarPing() { this.play(UI, [[1300, 70], [1250, 70], [1200, 90]]); }
  redAlert() { const n = []; for (let w = 0; w < 3; w++) { for (let f = 500; f <= 1400; f += 100) n.push([f, 28]); n.push([0, 140]); } this.play(BIG, n); }
  yellowAlert() { this.play(BIG, [[1400, 140], [0, 90], [1400, 140], [0, 90]]); }
  greenAlert() { this.play(EVENT, [[1600, 90], [1200, 90], [800, 160]]); }
  victory() { this.play(BIG, [[784, 150], [0, 30], [784, 150], [0, 30], [784, 150], [1047, 500], [0, 80], [988, 150], [1047, 150], [1319, 700]]); }
  defeat() {
    const n = [];
    for (let f = 900; f >= 120; f -= 30) n.push([f, 25]);
    for (let i = 0; i < 6; i++) n.push([90 + (i % 2) * 40, 120]);
    n.push([0, 200], [392, 300], [370, 300], [349, 300], [330, 800]);
    this.play(BIG, n);
  }
  warpEngage() { const n = []; for (let f = 200; f <= 1800; f += 80) n.push([f, 22]); n.push([2400, 60]); this.play(EVENT, n); }
  docked() { this.play(EVENT, [[880, 100], [1109, 100], [1319, 100], [1760, 250]]); }
  message() { this.play(EVENT, [[2637, 50], [0, 30], [2093, 50], [0, 30], [2637, 80]]); }
  overheat() { const n = []; for (let i = 0; i < 4; i++) n.push([1000, 60], [0, 60]); this.play(ALARM, n); }
  torpHit() { this.play(EVENT, [[300, 60], [200, 80], [2600, 60], [3100, 80]]); }
  enemyDestroyed() { const n = []; for (let f = 1200; f >= 150; f -= 50) n.push([f, 20]); n.push([2093, 80], [2637, 80], [3136, 160]); this.play(EVENT, n); }
  order() {
    const n = [];
    for (let f = 1400; f <= 2600; f += 100) n.push([f, 18]);
    n.push([2600, 260]);
    for (let f = 2600; f >= 1800; f -= 100) n.push([f, 18]);
    n.push([0, 60], [2200, 120]);
    this.play(ALARM, n);
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
      case K.EV_WARP_ENGAGED: this.warpEngage(); break;
      case K.EV_ALERT: if (e.arg === K.AL_RED) this.redAlert(); else if (e.arg === K.AL_YELLOW) this.yellowAlert(); else this.greenAlert(); break;
      case K.EV_VICTORY: this.victory(); break;
      case K.EV_DEFEAT: this.defeat(); break;
    }
  }
}
export const sound = new Sound();
