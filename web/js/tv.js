// ============================================================================
// tv.js - the big viewscreen (a TV browser via screen.html, or a Chromecast
// via receiver.html). Shows the title card while the crew assembles, the
// view mode the bridge picked during a mission, and the debrief afterwards.
// ============================================================================
import * as K from './config.js';
import { Gfx, loadFonts, drawCracks, crackOf } from './gfx.js';
import { World } from './world.js';
import { Scene, drawViewer, drawTitleCard } from './viewscreen.js';
import { sound } from './sound.js';
import { Narrator, WebVoice } from './voice.js';

export class TvApp {
  constructor(canvas, opts = {}) {
    this.g = new Gfx(canvas, { width: 960, height: 540, touch: false, safe: opts.safe || 0 });
    this.w = new World();
    this.scene = new Scene();
    this.joinUrl = opts.joinUrl || '';
    this.status = opts.status || '';
    sound.volume = 0.9;
    this.voice = new WebVoice();
    this.narrator = new Narrator(this.voice);
    this.narrator.enabled = opts.voice !== false;
    requestAnimationFrame(() => this.frame());
  }
  onMsg(m) {
    if (m.t === 'join') { this.joinUrl = m.url; return; }
    if (m.t === 'nohost') { this.status = 'NO HOST - START A GAME ON THE HOSTING PHONE'; return; }
    this.status = '';
    this.w.onMessage(m);
    if (m.t === 'ev') for (const e of m.e) { this.scene.onEvent(e); if (e.type !== K.EV_ORDER && e.type !== K.EV_DENIED) sound.event(e); }
  }
  frame() {
    requestAnimationFrame(() => this.frame());
    const g = this.g, w = this.w;
    w.update();
    this.narrator.hear(w);
    sound.update(w, { hail: true, screen: true });
    g.begin();
    if (!w.have) {
      const u = g.H / 540;
      g.text(g.W / 2, 200 * u, 'STARSHIP AURORA', 50 * u, K.C.ORANGE, 'center', true);
      g.text(g.W / 2, 270 * u, this.status || 'MAIN VIEWER - WAITING FOR THE BRIDGE...', 20 * u, K.C.PEACH, 'center');
      return;
    }
    try { drawViewer(g, w, this.scene, { title: (r) => drawTitleCard(g, w, r, this.joinUrl) }); if (w.game === K.GS_RUN) drawCracks(g, g.W, g.H, crackOf(w.P.hull)); }
    catch (e) { // never leave the TV frozen on one bad frame; show what broke
      if (!this.lastErr || performance.now() - this.lastErr > 5000) { this.lastErr = performance.now(); console.error(e); }
      g.text(8, g.H - 20, 'VIEWER ERROR: ' + String(e && e.message || e).slice(0, 80), 12, K.C.RED);
    }
  }
}
export { loadFonts, sound };
