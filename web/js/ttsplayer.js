// ============================================================================
// ttsplayer.js - plays speech the casting phone rendered (Android text-to-
// speech -> 8-bit mu-law, base64, in chunks over the Cast channel). Used by
// the Chromecast receiver when it has no speech engine of its own.
// ============================================================================
function mulawToPcm(u) {
  u = ~u & 0xff;
  const sign = u & 0x80, exp = (u >> 4) & 7, man = u & 0x0f;
  let x = ((man << 3) + 0x84) << exp;
  x -= 0x84;
  return sign ? -x : x;
}
function wavBlob(bytes, rate) {
  const n = bytes.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, mulawToPcm(bytes[i]), true);
  return new Blob([buf], { type: 'audio/wav' });
}
export class TtsPlayer {
  constructor() { this.parts = new Map(); this.queue = []; this.audio = null; this.gen = 0; }
  onMsg(d) {
    if (d.t === 'ttsstop') { this.stop(); if (d.g) this.gen = d.g; return true; }
    if (d.t !== 'tts') return false;
    if (d.g !== undefined && d.g < this.gen) return true; // from before the last stop
    if (d.g !== undefined) this.gen = d.g;
    let p = this.parts.get(d.id);
    if (!p) { p = { n: d.n, got: 0, data: new Array(d.n), rate: d.sr, seq: d.id }; this.parts.set(d.id, p); }
    if (!p.data[d.i]) { p.data[d.i] = d.d; p.got++; }
    if (p.got === p.n) {
      this.parts.delete(d.id);
      const bin = atob(p.data.join('')), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      this.queue.push(URL.createObjectURL(wavBlob(bytes, p.rate)));
      if (!this.audio) this.next();
    }
    return true;
  }
  next() {
    const url = this.queue.shift();
    if (!url) { this.audio = null; return; }
    const a = new Audio(url);
    this.audio = a;
    const done = () => { URL.revokeObjectURL(url); if (this.audio === a) this.next(); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  }
  stop() {
    for (const u of this.queue) URL.revokeObjectURL(u);
    this.queue = []; this.parts.clear();
    if (this.audio) { try { this.audio.pause(); } catch { /* gone */ } this.audio = null; }
  }
}
