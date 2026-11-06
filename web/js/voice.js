// ============================================================================
// voice.js - the main viewer reads hails out loud. Every speaker has a voice
// (accent, pitch, pace); each alien race has its own manner, and speaks a
// little of its own language before the translator cuts in. The Aurora's own
// replies are spoken by the captain: low, calm, measured, British.
//   web speech (speechSynthesis) on a TV / laptop browser or the Chromecast,
//   or the phone's own text-to-speech (window.AuroraNative.speak) as fallback.
// ============================================================================
import * as K from './config.js';
import { CHARS } from './dialogue.js';
import { CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_CHORUS } from './galaxy.js';

// how each speaker sounds. g = preferred gender of the synthetic voice
const P = (lang, g, pitch, rate, extra = {}) => ({ lang, g, pitch, rate, ...extra });
export const CAPTAIN_VOICE = P('en-GB', 'm', 0.82, 0.88);
const RACE = {
  [CIV_VELORI]: P('en-IN', 'f', 1.5, 0.84, { style: 'velori' }),
  [CIV_KESSARI]: P('en-ZA', 'm', 0.55, 1.12, { style: 'kessari' }),
  [CIV_ORRAN]: P('en-GB', 'm', 0.35, 0.76, { style: 'orran' }),
  [CIV_CHORUS]: P('en-US', 'f', 1.9, 0.62, { style: 'chorus' }),
};
const WHO = {
  computer: P('en-US', 'f', 1.0, 1.08), relay: P('en-US', 'f', 0.85, 0.9), vault: P('en-US', 'f', 0.7, 0.85),
  hale: P('en-US', 'f', 1.05, 1.0), voss: P('en-GB', 'f', 0.95, 0.94), marrin: P('en-GB', 'm', 1.1, 1.1),
  okafor: P('en-AU', 'm', 0.78, 0.95), lin: P('en-US', 'f', 1.12, 1.06), silk: P('en-AU', 'f', 0.92, 1.12),
  hauler: P('en-US', 'm', 0.9, 1.0), teo: P('en-GB', 'f', 1.0, 0.9),
  argus: P('en-US', 'f', 1.25, 0.95), future: CAPTAIN_VOICE, brandt: P('en-AU', 'm', 0.75, 0.98), nava: P('en-GB', 'f', 0.85, 0.85),
  ark: P('en-US', 'm', 1.0, 1.1), vey: null, hesk: null, teruk: null, ishara: null,
  draal: { ...RACE[CIV_KESSARI], pitch: 0.4, rate: 0.98 }, ressh: { ...RACE[CIV_KESSARI], pitch: 0.65 },
  korvath: { ...RACE[CIV_ORRAN], pitch: 0.3, rate: 0.72 }, thane: { ...RACE[CIV_ORRAN], pitch: 0.42, rate: 0.82 },
};
WHO.vey = { ...RACE[CIV_KESSARI], pitch: 0.8, rate: 1.05 };
WHO.hesk = { ...RACE[CIV_ORRAN], pitch: 0.5, rate: 0.85 };
WHO.teruk = { ...RACE[CIV_ORRAN], pitch: 0.28, rate: 0.74 };
WHO.ishara = { ...RACE[CIV_VELORI], pitch: 1.35 };
export function voiceFor(who) {
  if (WHO[who]) return WHO[who];
  const ch = CHARS[who];
  return (ch && RACE[ch.civ]) || P('en-US', 'm', 1.0, 1.0);
}

// a few words of the speaker's own tongue, made from the line itself
const SYL = {
  velori: ['ae', 'li', 'sha', 'vel', 'ith', 'ora', 'nai', 'sel', 'yu', 'meh'],
  kessari: ['khar', 'skeh', 'trak', 'ssa', 'grek', 'tzur', 'ka', 'vhesk', 'rrak', 'zhet'],
  orran: ['orr', 'dum', 'khaz', 'bor', 'gath', 'umm', 'drogh', 'ra', 'thul', 'ka'],
  chorus: ['aah', 'ooh', 'eeh', 'ahh', 'mmm', 'oon', 'aae', 'eio', 'uuh', 'aah'],
};
export function alienWords(text, style, n = 4) {
  const syl = SYL[style];
  if (!syl) return '';
  const words = text.replace(/[^A-Z ]/gi, ' ').split(/\s+/).filter(Boolean).slice(0, n);
  return words.map((w) => {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const k = 1 + (w.length > 5 ? 1 : 0) + (h % 2);
    let out = '';
    for (let i = 0; i < k; i++) out += syl[(h >>> (i * 3)) % syl.length];
    return out;
  }).join(' ') + '.';
}

// ALL CAPS game text -> something a speech engine reads naturally
const KEEP = new Set(['ISV', 'USS', 'SB', 'LRS', 'OK']);
export function speakable(text) {
  let t = text.replace(/^"|"$/g, '').replace(/\{([^}]*)\}/g, '$1').replace(/ - /g, ', ').replace(/\.\.\./g, '... ');
  t = t.replace(/\b(\d+)K\b/g, '$1 thousand').replace(/\bKM\/S\b/g, 'kilometres per second');
  t = t.split(/(\s+)/).map((w) => (KEEP.has(w.replace(/[^A-Z]/g, '')) ? w : w.toLowerCase())).join('');
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  t = t.replace(/\bi\b/g, 'I').replace(/\baurora\b/g, 'Aurora').replace(/\bfleet\b/gi, (m) => m);
  return t;
}
// spoken replies read better as whole sentences
export function captainLine(label) {
  let t = label.replace(/^"|"$/g, '');
  t = t.replace(/^(\d+) (\w+) FOR (\d+) (.+)$/, 'We will trade $1 $2 for $3 $4.');
  t = t.replace(/^TONE (\d)$/, 'Tone $1.');
  t = t.replace(/^CLOSE CHANNEL$/, 'Close channel.').replace(/^ANY NEWS\?$/, 'Any news?');
  return speakable(t);
}
// how each race delivers its line
function styled(text, style) {
  if (style === 'kessari') return text.replace(/s(\s|$|[.,!?])/g, 'ss$1');               // a hiss on the end of words
  if (style === 'orran') return text.replace(/([.!?]) /g, '$1... ').replace(/, /g, ', ... '); // slow, weighty pauses
  if (style === 'velori') return text.replace(/, /g, ', ... ');                             // a sing-song lilt
  return text;
}

// ---------------------------------------------------------------- engines
const MALE = /male|daniel|george|arthur|fred|alex|david|mark|rishi|oliver|james|tom|thomas|gordon|lee|aaron|ralph/i;
const FEMALE = /female|samantha|karen|moira|tessa|victoria|zira|susan|serena|kate|libby|hazel|catherine|veena|fiona|sonia|natasha/i;
export class WebVoice {
  constructor() { this.ok = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; this.voices = []; this.load(); }
  load() {
    if (!this.ok) return;
    const get = () => { this.voices = speechSynthesis.getVoices() || []; };
    get();
    try { speechSynthesis.addEventListener('voiceschanged', get); } catch { /* old engine */ }
  }
  hasVoices() { return this.ok && this.voices.length > 0; }
  pick(v) {
    const vs = this.voices.filter((x) => x.lang && x.lang.toLowerCase().startsWith('en'));
    if (!vs.length) return null;
    const lang = vs.filter((x) => x.lang.replace('_', '-').toLowerCase() === v.lang.toLowerCase());
    const pool = lang.length ? lang : vs;
    const gend = pool.filter((x) => (v.g === 'm' ? MALE : FEMALE).test(x.name));
    return (gend[0] || pool[0]);
  }
  say(text, v, pitch = v.pitch, onerr) {
    if (!this.ok) return;
    const u = new SpeechSynthesisUtterance(text);
    const vc = this.pick(v);
    if (vc) { u.voice = vc; u.lang = vc.lang; } else u.lang = v.lang;
    u.pitch = Math.max(0, Math.min(2, pitch));
    u.rate = Math.max(0.5, Math.min(1.6, v.rate));
    u.volume = 1;
    if (onerr) u.onerror = onerr;
    speechSynthesis.speak(u);
    return u;
  }
  stop() { if (this.ok) speechSynthesis.cancel(); }
  busy() { return this.ok && (speechSynthesis.speaking || speechSynthesis.pending); }
}
export class NativeVoice { // the phone's text-to-speech (Android app only)
  constructor(native) { this.n = native; this.ok = !!(native && native.speak); }
  say(text, v, pitch = v.pitch) { try { this.n.speak(text, v.lang, pitch, v.rate); } catch { /* old app */ } }
  stop() { try { this.n.stopSpeaking && this.n.stopSpeaking(); } catch { /* old app */ } }
  busy() { return false; }
}

// the phone renders the speech and sends the audio to the Chromecast to play on the TV
export class CastVoice {
  constructor(native) { this.n = native; this.ok = !!(native && native.speakToCast); }
  say(text, v, pitch = v.pitch) { try { this.n.speakToCast(text, v.lang, pitch, v.rate); } catch { /* old app */ } }
  stop() { try { this.n.stopCastSpeech(); } catch { /* old app */ } }
  busy() { return false; }
}

// ---------------------------------------------------------------- the narrator
// Watches the message log and speaks the lines meant for the viewer.
export class Narrator {
  constructor(engine) { this.engine = engine; this.lastId = -1; this.enabled = true; this.started = false; }
  // call with the world each frame (cheap); speaks anything new
  hear(w) {
    const msgs = w.msgs, d = (w.slow && w.slow.dlg) || null;
    // the conversation ended, or the viewer left COMMS: cut the voices off
    const ended = this.dlgSeq && !d, leftComms = this.view === K.VM_COMMS && w.view !== K.VM_COMMS;
    this.dlgSeq = d ? d.seq : 0; this.view = w.view;
    if ((ended || leftComms) && this.engine) this.engine.stop();
    if (!msgs.length) return;
    if (!this.started) { this.started = true; this.lastId = msgs[0].id; return; } // don't read out the backlog
    if (w.game === K.GS_TITLE) { this.lastId = msgs[0].id; return; }
    const fresh = msgs.filter((m) => m.id > this.lastId).reverse();
    if (!fresh.length) return;
    this.lastId = msgs[0].id;
    if (!this.enabled || !this.engine || !this.engine.ok || leftComms) return;
    if (fresh.length > 4) this.engine.stop(); // a flood (e.g. after a reconnect): don't read it all
    // a reply that closed the channel isn't read; a last word from the other side still is
    for (const m of fresh.slice(-4)) if (!(ended && m.reply)) this.speak(m);
  }
  speak(m) {
    const e = this.engine;
    if (m.reply) { e.say(captainLine(m.text), CAPTAIN_VOICE); return; }
    if (!m.who) return; // only people talking: no crew reports, names or system messages
    const v = voiceFor(m.who), style = v.style;
    let raw = m.text.replace(/^[A-Z0-9 .'()-]{2,40}: (?=["A-Z])/, ''); // "POD LOG - CAPT. TEO: ..." -> just the words
    raw = style ? raw.replace(/\{([^}]*)\}/g, (x, a) => alienWords(a, style, 3).replace(/\.$/, '')) : raw;
    const text = styled(speakable(raw), style);
    if (style === 'chorus') { // many voices: phrases alternate high and low
      text.split(/(?<=[.,?!])\s+/).forEach((ph, i) => e.say(ph, v, i % 2 ? 0.25 : v.pitch));
    } else e.say(text, v);
  }
}
