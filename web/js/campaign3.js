// ============================================================================
// campaign3.js - "THE CARTOGRAPHERS", a five-chapter story.
// Forty thousand years ago a people who mapped the stars left a ring of crystal
// shards - and something at the end of the map. Everyone wants the shards.
//   1 THE SHATTER          - a survey ship is lost inside an asteroid field. The whole
//                            bridge flies the channel: helm steers, tactical shoots loose
//                            boulders, shields take the hits, science scans the markers.
//                            Choice: the survey team's discovery - seize it, credit them, or partner.
//                            Puzzle: the science LAB classifies the first shard.
//   2 THE KEEPERS OF RIME  - the second shard is sacred to settlers on an ice world. Enter
//                            orbit, hail the surface... and a missile comes up out of the ice.
//                            Choice: bombard the launch site, or talk the Keepers down.
//   3 THE COLLECTOR        - a relic dealer sells two green shards; one is forged.
//                            Puzzle: lab-date both samples. Choice: pay, bargain, or expose him.
//   4 THE ATLAS KEY        - the Orran Archive keeps the last shard. Then the crew assembles
//                            the RING (on the main viewer) and reads it with the codex.
//   5 THE ATLAS            - a hidden lane, a machine that moves stars, and everyone you
//                            helped (or didn't) along the way.
// Installed onto Sim; called from campaign.js when the third campaign is chosen.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { SYS_INDEX, CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_NONE, sysAt } from './galaxy.js';
import { distTo, bearingTo, clampf } from './util.js';
import { pathAt, insideBox } from './field.js';
import { LAB_ART } from './lab.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_BUOY, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, GS_RUN, MK_AREA, MK_POINT, MK_RENDEZVOUS } = K;
const AI_STATIC = 0, AI_WARPIN = 3, AI_ATTACK = 4;

export const CARTO_CHAPTERS = ['THE SHATTER', 'THE KEEPERS OF RIME', 'THE COLLECTOR', 'THE ATLAS KEY', 'THE ATLAS'];
export const CARTO_DESC = [
  'THE SURVEY SHIP CALLIOPE FLEW INTO THE SHATTER, AN ASTEROID FIELD IN MERIDIAN REACH, CHASING AN ANCIENT SIGNAL. SHE HAS NOT COME OUT.',
  'THE SECOND SHARD IS THE HOLIEST THING ON RIME, A FROZEN WORLD WHOSE SETTLERS WANT TO BE LEFT ALONE.',
  'A VELORI RELIC DEALER IS SELLING A GREEN SHARD AT THE LANTERN. HE IS SELLING TWO, ACTUALLY. ONLY ONE IS REAL.',
  'THE ORRAN ARCHIVE HAS KEPT THE LAST SHARD FOR NINE HUNDRED YEARS. PUT THE RING TOGETHER AND READ IT.',
  'ONE LANE BEYOND THE BLUE GIANT LIES WHATEVER THE CARTOGRAPHERS LEFT AT THE END OF THEIR MAP.',
];
export const CARTO_BLURB = 'A PEOPLE WHO MAPPED EVERY STAR VANISHED FORTY THOUSAND YEARS AGO. THEIR SHARDS ARE SCATTERED ACROSS THE GALAXY - IN ASTEROID FIELDS, SACRED VAULTS AND DEALERS\' VELVET. WHAT DID THEY LEAVE AT THE END OF THE MAP?';
const NUM_WORD = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const DEFAULT_F = { reyes: 'credit', rime: 'peace', saresh: 'paid', vhel: 'codex' };
// the ring: four shards, edge runes (L, R) and the middle rune (M). Solved order: red, blue, green, gold.
const TILES = [
  { k: 'r', art: ['rshard'], name: 'RED', col: '#ff7a64', L: 8, R: 4, M: 10 },
  { k: 'b', art: ['bshard', 'bcopy'], name: 'BLUE', col: '#78a8ff', L: 4, R: 6, M: 0 },
  { k: 'g', art: ['gshard'], name: 'GREEN', col: '#64d28c', L: 6, R: 1, M: 7 },
  { k: 'o', art: ['oshard'], name: 'GOLD', col: '#ffd24a', L: 1, R: 8, M: 2 },
];
const SHARD_PRICE = [[G.R_CRYSTAL, 4], [G.R_EXOTIC, 2]];

// ---------------------------------------------------------------- cast
Object.assign(CHARS, {
  reyes: { name: 'DR. ANA REYES', role: 'SURVEY SHIP CALLIOPE', civ: CIV_COLONY, look: { skin: '#b4825a', hair: '#28140a', uniform: '#3c8c78', glasses: true } },
  tamsin: { name: 'ELDER TAMSIN', role: 'COUNCIL OF RIME', civ: CIV_COLONY, look: { skin: '#f0d7be', hair: '#f0f0f0', uniform: '#a0b4c8' } },
  oduya: { name: 'BROTHER ODUYA', role: 'THE KEEPERS OF THE FIRST MAP', civ: CIV_COLONY, look: { skin: '#5a3c28', hair: '#141414', uniform: '#5a3c64', beard: true, scar: true } },
  saresh: { name: 'SARESH OF THE GILDED HAND', role: 'DEALER IN ANTIQUITIES', civ: CIV_VELORI, look: 'velori' },
  vhel: { name: 'ARCHIVIST VHEL', role: 'THE ORRAN ARCHIVE', civ: CIV_ORRAN, look: 'orran' },
  atlas: { name: 'THE ATLAS', role: 'THE CARTOGRAPHERS\' ENGINE', civ: CIV_NONE, look: 'argus' },
  guild: { name: 'FACTOR YSOLDE ITHANI', role: 'VELORI MERCHANT GUILD', civ: CIV_VELORI, look: 'velori' },
});

const has = (s, give) => give.every(([r, n]) => s.P.cargo[r] >= n);
const pay = (s, give) => { for (const [r, n] of give) s.P.cargo[r] -= n; };
const step = (k) => (s) => { s.cartoStep(k); return null; };

// ---------------------------------------------------------------- conversations
Object.assign(DIALOGS, {
  e_voss1: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. THREE DAYS AGO THE SURVEY SHIP CALLIOPE FOLLOWED AN ANCIENT SIGNAL INTO THE SHATTER - THE WORST ASTEROID FIELD IN MERIDIAN REACH. WE HAVEN\'T HEARD FROM HER SINCE. DR. REYES BELIEVED THE SIGNAL CAME FROM THE CARTOGRAPHERS.',
      opts: [{ t: 'THE CARTOGRAPHERS?', go: 'who' }, { t: 'WE\'RE ON OUR WAY', do: step('e1_go') }] },
    who: { say: 'A PEOPLE WHO MAPPED EVERY STAR WE KNOW OF, FORTY THOUSAND YEARS AGO - THEN VANISHED. EVERY FEW YEARS SOMEONE FINDS A SHARD OF THEIR CRYSTAL, AND EVERY TIME SOMEONE GETS HURT OVER IT. GET THE CALLIOPE\'S PEOPLE OUT, CAPTAIN. WHATEVER SHE FOUND COMES SECOND.',
      opts: [{ t: 'UNDERSTOOD', do: step('e1_go') }] },
  } },
  e_reyes1: { who: 'reyes', nodes: {
    start: { say: 'AURORA! THANK GOD. WE LOST OUR ENGINES TO A BOULDER TWO DAYS AGO. BUT CAPTAIN - WE FOUND IT. A CARTOGRAPHER CAIRN ON A ROCK IN HERE, AND INSIDE IT A RED SHARD. MY TEAM HAS SPENT TEN YEARS LOOKING FOR THIS.',
      opts: [{ t: 'FLEET HAS ORDERED US TO TAKE CHARGE OF ANY RELICS', go: 'orders' }, { t: 'TELL ME ABOUT THE SHARD', go: 'shard' }] },
    shard: { say: 'IT\'S A PIECE OF A RING - THE RUNES ON ITS EDGES ARE MEANT TO MEET OTHER SHARDS. THE LEGENDS SAY THE WHOLE RING IS A MAP TO SOMETHING THE CARTOGRAPHERS BUILT. PLEASE, CAPTAIN. DON\'T JUST TAKE IT.',
      opts: [{ t: 'WHAT DO YOU WANT US TO DO?', go: 'orders' }] },
    orders: { say: 'I KNOW YOUR ORDERS. I\'M ASKING ANYWAY. THIS IS OUR DISCOVERY. WHAT HAPPENS TO IT NOW?',
      opts: [
        { t: 'FLEET ORDERS. WE TAKE THE SHARD - AND THE CREDIT', do: (s) => { s.camp.f.reyes = 'seized'; s.repAdd(CIV_FLEET, 5); s.repAdd(CIV_COLONY, -10); s.sayAs('reyes', '...OF COURSE YOU DO. TEN YEARS. TAKE IT, THEN.'); s.cartoShard1(); return null; } },
        { t: 'IT\'S YOUR DISCOVERY - YOUR NAME GOES ON IT. WE\'LL KEEP IT SAFE', do: (s) => { s.camp.f.reyes = 'credit'; s.repAdd(CIV_COLONY, 5); s.sayAs('reyes', 'THAT\'S... FAIR. MORE THAN FAIR. KEEP IT SAFE, AURORA. I\'LL BE WATCHING THE NEWS.'); s.cartoShard1(); return null; } },
        { t: 'TAKE 3 SPARE PARTS FOR YOUR ENGINES. WE DO THIS TOGETHER', if: (s) => s.P.cargo[G.R_SPARES] >= 3, do: (s) => { s.P.cargo[G.R_SPARES] -= 3; s.camp.f.reyes = 'partner'; s.repAdd(CIV_COLONY, 15); s.sayAs('reyes', 'PARTNERS. I LIKE THE SOUND OF THAT. WHEREVER THIS RING LEADS, CAPTAIN - THE CALLIOPE WILL BE THERE.'); s.cartoShard1(); return null; } },
      ] },
  } },
  e_elder: { who: 'tamsin', nodes: {
    start: { say: 'A FLEET SHIP IN OUR SKY. WE CAME TO RIME TWO HUNDRED YEARS AGO TO BE FORGOTTEN, CAPTAIN. WHY ARE YOU HERE?',
      opts: [{ t: 'WE\'VE COME ABOUT THE SHARD IN YOUR VAULT', go: 'eye' }, { t: 'JUST PASSING. WE\'LL LEAVE YOU IN PEACE', do: (s) => { s.sayAs('tamsin', 'THEN GO WELL.'); return null; } }] },
    eye: { say: 'THE EYE OF THE FIRST MAP. OUR ANCESTORS FOUND IT IN THE ICE AND IT GUIDED THEIR SHIP HERE. TO US IT IS HOLY. THE KEEPERS GUARD IT - AND THE KEEPERS DO NOT LOVE OUTSIDERS.',
      opts: [
        { t: 'WE\'D LIKE TO STUDY IT - ONLY WITH YOUR PERMISSION', do: (s) => { s.camp.f.asked = 'polite'; s.sayAs('tamsin', 'THE COUNCIL WILL CONSIDER IT. BUT I MUST WARN YOU - BROTHER ODUYA HAS WEAPONS, AND HE WILL NOT ASK THE COUNCIL FIRST.'); s.cartoSignal(); return null; } },
        { t: 'THE FLEET NEEDS THAT SHARD. WE\'LL PAY FOR IT', do: (s) => { s.camp.f.asked = 'demand'; s.repAdd(CIV_COLONY, -5); s.sayAs('tamsin', 'THE EYE IS NOT FOR SALE, CAPTAIN. AND YOU HAVE JUST BEEN HEARD BY THE WRONG PEOPLE.'); s.cartoSignal(); return null; } },
      ] },
  } },
  e_keeper: { who: 'oduya', timeout: 40, nodes: {
    start: { say: 'LEAVE OUR SKY, THIEVES. EVERY SHIP THAT EVER CAME TO RIME CAME TO TAKE SOMETHING. THE EYE STAYS IN THE ICE.',
      opts: [
        { t: 'FIRE AGAIN AND WE DESTROY YOUR LAUNCHER', do: (s) => { s.sayAs('oduya', 'THEN DO IT, FLEET - AND LET THE SETTLEMENT SEE WHAT YOU ARE.'); return null; } },
        { t: 'WE DON\'T WANT TO TAKE IT. WE WANT TO UNDERSTAND IT', go: 'why' },
      ] },
    why: { say: 'WORDS. THEY ALL SAID WORDS. WHAT WILL YOU DO THAT THE OTHERS DID NOT?',
      opts: [
        { t: 'THE EYE STAYS IN YOUR VAULT. WE SCAN IT FROM ORBIT AND TAKE NOTHING', do: (s) => { s.cartoRimePeace('peace'); return null; } },
        { t: 'TAKE 4 ICE AND 2 SPARE PARTS FOR THE SETTLEMENT - AND LET THE COUNCIL DECIDE', if: (s) => has(s, [[G.R_ICE, 4], [G.R_SPARES, 2]]), do: (s) => { pay(s, [[G.R_ICE, 4], [G.R_SPARES, 2]]); s.cartoRimePeace('gift'); return null; } },
        { t: 'NOTHING. BUT WE\'RE NOT LEAVING', do: (s) => { s.sayAs('oduya', 'THEN NEITHER ARE MY MISSILES.'); return null; } },
      ] },
  } },
  e_elder2: { who: 'tamsin', nodes: {
    start: { say: 'YOU FIRED ON OUR WORLD. THE KEEPERS WERE FOOLS - BUT THEY WERE OUR FOOLS. THE VAULT IS OPEN NOW. WHAT WILL YOU DO, CAPTAIN?',
      opts: [
        { t: 'WE TAKE THE SHARD. IT\'S SAFER WITH US', do: (s) => { const f = s.camp.f; f.rime = 'force'; s.repAdd(CIV_COLONY, -20); s.addArt('bshard', 0); s.sayAs('tamsin', 'TAKE IT AND GO. RIME WILL REMEMBER YOUR NAME, AURORA. NOT KINDLY.'); s.cartoChapterEnd(2); return null; } },
        { t: 'WE\'RE SORRY. WE\'LL SCAN IT, AND LEAVE IT WHERE IT IS', do: (s) => { const f = s.camp.f; f.rime = 'regret'; s.repAdd(CIV_COLONY, -5); s.addArt('bcopy', 0); s.sayAs('tamsin', '...THAT IS MORE THAN I EXPECTED. SCAN IT. THEN PLEASE LEAVE US.'); s.cartoChapterEnd(2); return null; } },
      ] },
  } },
  e_saresh: { who: 'saresh', nodes: {
    start: { say: (s) => (s.camp.f.sareshMet ? 'BACK SO SOON, CAPTAIN? HAVE YOUR CLEVER SCIENTISTS DECIDED?' : 'AH, THE FAMOUS AURORA. YOU WANT A GREEN SHARD. I HAVE TWO - BUT ONLY ONE OF THEM IS QUITE... AUTHENTIC. HERE: A SLIVER OF EACH, FOR YOUR LABORATORY. THE PRICE IS FOUR CRYSTAL AND TWO EXOTIC MATTER. ALL SALES FINAL.'),
      opts: [
        { t: 'WE\'LL TAKE SHARD A', if: (s) => s.camp.f.sareshMet && !s.cartoHasGreen(), go: 'payA' },
        { t: 'WE\'LL TAKE SHARD B', if: (s) => s.camp.f.sareshMet && !s.cartoHasGreen(), go: 'payB' },
        { t: 'YOUR OTHER SHARD IS A FORGERY. WE DATED IT', if: (s) => s.cartoFakeFound() && !s.cartoHasGreen() && !s.camp.f.bargained, go: 'caught' },
        { t: 'WE\'RE REPORTING YOUR FORGERIES TO THE GUILD', if: (s) => s.cartoFakeFound() && !s.cartoHasGreen(), do: (s) => { s.cartoExpose(); return null; } },
        { t: 'WE\'LL BE IN TOUCH', do: (s) => { s.cartoSamples(); return null; } },
      ] },
    caught: { say: '...YOUR LAB IS BETTER THAN MOST. VERY WELL. FOR A BUYER WHO KNOWS THE DIFFERENCE, TWO CRYSTAL. AND WE NEVER SPEAK OF THE OTHER ONE.',
      opts: [
        { t: 'DEAL - THE GENUINE ONE', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 2, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 2; s.camp.f.saresh = 'bargained'; s.camp.f.bargained = true; s.cartoGreen(true); return null; } },
        { t: 'NOT TODAY', go: 'start' },
      ] },
    payA: { say: 'SHARD A. HOW WILL YOU PAY?', opts: [
      { t: 'FOUR CRYSTAL AND TWO EXOTIC MATTER', if: (s) => has(s, SHARD_PRICE), do: (s) => { pay(s, SHARD_PRICE); s.cartoBuy(0, 'paid'); return null; } },
      { t: 'THE CALLIOPE\'S SURVEY DATA', if: (s) => s.camp.f.reyes !== 'seized' && !s.camp.f.dataSold, do: (s) => { s.camp.f.dataSold = true; s.cartoBuy(0, 'data'); return null; } },
      { t: 'NEVER MIND', go: 'start' }] },
    payB: { say: 'SHARD B. HOW WILL YOU PAY?', opts: [
      { t: 'FOUR CRYSTAL AND TWO EXOTIC MATTER', if: (s) => has(s, SHARD_PRICE), do: (s) => { pay(s, SHARD_PRICE); s.cartoBuy(1, 'paid'); return null; } },
      { t: 'THE CALLIOPE\'S SURVEY DATA', if: (s) => s.camp.f.reyes !== 'seized' && !s.camp.f.dataSold, do: (s) => { s.camp.f.dataSold = true; s.cartoBuy(1, 'data'); return null; } },
      { t: 'NEVER MIND', go: 'start' }] },
  } },
  e_vhel: { who: 'vhel', nodes: {
    start: { say: 'THE GOLD SHARD. THE ARCHIVE HAS KEPT IT NINE HUNDRED YEARS, OUTSIDER, AND NEVER READ IT. YOU HAVE THREE OF ITS SISTERS. WHAT WILL YOU GIVE TO KNOWLEDGE?',
      opts: [
        { t: 'A COPY OF THE RIME CODEX - KNOWLEDGE FOR KNOWLEDGE', if: (s) => s.hasArt('codex'), do: (s) => { s.camp.f.vhel = 'codex'; s.repAdd(CIV_ORRAN, 15); s.sayAs('vhel', 'THE KEY TO THE RUNES. NINE HUNDRED YEARS... THE ARCHIVE IS IN YOUR DEBT, AURORA. TAKE THE SHARD. AND WHEN YOU FIND WHAT IT OPENS - CALL ME.'); s.cartoGold(); return null; } },
        { t: 'WE CAN\'T READ THE RUNES. CAN THE ARCHIVE?', if: (s) => !s.hasArt('codex'), go: 'read' },
        { t: 'WE\'LL SHARE EVERYTHING THE RING TELLS US', do: (s) => { s.camp.f.vhel = 'promise'; s.repAdd(CIV_ORRAN, 5); s.sayAs('vhel', 'A PROMISE. ORRANS KEEP THEIRS. I WILL TRUST THAT YOU KEEP YOURS.'); s.cartoGold(); return null; } },
        { t: 'FIVE CRYSTAL FOR THE SHARD', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 5, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 5; s.camp.f.vhel = 'bought'; s.sayAs('vhel', 'A TRADER\'S ANSWER. VERY WELL. KNOWLEDGE HAS BEEN SOLD FOR LESS.'); s.cartoGold(); return null; } },
      ] },
    read: { say: 'THE ARCHIVE HAS COPIED CARTOGRAPHER RUNES FOR A THOUSAND YEARS. WE HAVE A PARTIAL LEXICON. SEND US YOUR SHARD SCANS AND YOUR SENSOR LOGS, AND YOU SHALL HAVE IT - AND THE GOLD SHARD.',
      opts: [{ t: 'AGREED - SEND THE LEXICON', do: (s) => { s.camp.f.vhel = 'lexicon'; s.repAdd(CIV_ORRAN, 10); s.addArt('codex', 2); s.sayAs('vhel', 'THE LEXICON IS YOURS. READ WELL, OUTSIDER.'); s.cartoGold(); return null; } }] },
  } },
  e_sareshf: { who: 'saresh', timeout: 18, onTimeout: (s) => s.cartoBattle(), nodes: {
    start: { say: (s) => (s.camp.f.saresh === 'exposed' ? 'YOU COST ME EVERYTHING AT THE LANTERN, AURORA. NOW I TAKE THE GREATEST RELIC IN THE GALAXY - OVER YOUR WRECK.' : 'THANK YOU FOR THE MAP, AURORA. I\'VE BROUGHT FRIENDS - THE KESSARI LOVE A SALVAGE JOB. STAND ASIDE AND I\'LL EVEN LET YOU WATCH.'),
      opts: [{ t: 'THE ATLAS ISN\'T FOR SALE, SARESH', do: (s) => { s.cartoBattle(); return null; } }, { t: 'COME AND TAKE IT', do: (s) => { s.cartoBattle(); return null; } }] },
  } },
  e_atlas: { who: 'atlas', nodes: {
    start: { say: 'MAPMAKERS. YOU READ THE RING. FORTY THOUSAND YEARS I HAVE WAITED TO BE ASKED ONE QUESTION. THE MAP IS UNFINISHED: ONE STAR REMAINS. THE BLUE GIANT WILL DIE WITHIN TWO CENTURIES, AND TAKE THE WORLD YOU CALL RIME WITH IT. I CAN MOVE THAT WORLD - ONCE. THEN I AM DONE. SHALL I FINISH THE MAP?',
      opts: [
        { t: 'FINISH YOUR MAP. SAVE RIME', do: (s) => { s.cartoEnding('finish'); return null; } },
        { t: 'THE PEOPLE OF RIME ARE YOUR HEIRS. ASK THEM', if: (s) => s.bondOf('tamsin') >= 3, do: (s) => { s.cartoEnding('heirs'); return null; } },
        { t: 'THE FLEET WILL STUDY YOU FIRST', do: (s) => { s.cartoEnding('fleet'); return null; } },
        { t: 'SLEEP. NO ONE SHOULD HOLD THIS POWER', do: (s) => { s.cartoEnding('sleep'); return null; } },
      ] },
  } },
});

// ---------------------------------------------------------------- the mixin
export function installCarto(Sim) {
  Object.assign(Sim.prototype, {
    cartoStart(ch) {
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('carto');
      this.camp = { id: 'carto', ch: 0, step: '', t: 0, f: { ...DEFAULT_F, ...(ch > 1 ? save.f || {} : {}) }, seed: 1 + this.irand(1e6), bondOf: (w) => this.cartoBond(w) };
      this.greeted.add(0);
      const f = this.camp.f;
      if (ch >= 2) this.addArt('rshard', 2);
      if (ch >= 3) { this.addArt(f.rime === 'force' ? 'bshard' : 'bcopy', 2); if (f.rime === 'peace' || f.rime === 'gift') this.addArt('codex', 2); }
      if (ch >= 4) this.addArt('gshard', 2);
      if (ch >= 5) { this.addArt('oshard', 2); if (!this.hasArt('codex')) this.addArt('codex', 2); this.revealed.add(SYS_INDEX.atlas); }
      this.cartoChapter(ch, true);
    },
    cartoChapter(ch, first = false) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('carto');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = { ...c.f };
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `CHAPTER ${NUM_WORD[ch - 1]}: ${CARTO_CHAPTERS[ch - 1]}`);
      if (ch === 1) { this.cartoStep('e1_brief'); this.after(first ? 2 : 1, () => this.startDialog('e_voss1', FROM_COMMAND)); }
      else this.cartoStep(['', '', 'e2_go', 'e3_go', 'e4_go', 'e5_go'][ch]);
    },
    cartoChapterEnd(ch) { this.after(5, () => { if (this.camp && this.camp.ch === ch) this.cartoChapter(ch + 1); }); },
    cartoBond(who) { // how this campaign's choices translate into each ally's bond (allies.js)
      const f = this.camp.f;
      switch (who) {
        case 'reyes': return Math.max(0, ({ seized: 0, credit: 1, partner: 3 }[f.reyes] ?? 0) - (f.dataSold ? 1 : 0)); // selling her data costs trust
        case 'tamsin': return { peace: 4, gift: 3, regret: 1, force: 0 }[f.rime] ?? 0;
        case 'guild': return f.saresh === 'exposed' ? 3 : 0;
        case 'vhel': return { codex: 3, lexicon: 2, promise: 2, bought: 1 }[f.vhel] ?? 0;
        case 'hale': return this.rep[CIV_FLEET] >= 50 ? 2 : this.rep[CIV_FLEET] >= 20 ? 1 : 0;
      }
      return 0;
    },
    cartoSay(who, text, col = 3, from = FROM_COMMAND) {
      this.say(from, col, text);
      const m = this.msgs[0], ch = CHARS[who];
      m.who = who; if (ch && ch.civ >= 3) m.lang = ch.civ;
    },
    cartoStep(k) {
      const c = this.camp;
      c.step = k; c.t = 0;
      const obj = {
        e1_brief: 'STAND BY - ADMIRAL VOSS IS CALLING',
        e1_go: 'THE SURVEY SHIP CALLIOPE IS LOST IN THE SHATTER ASTEROID FIELD. NAV: PLOT A JUMP TO MERIDIAN REACH. HELM: ALIGN AND ENGAGE',
        e1_field: 'FIND THE CALLIOPE INSIDE THE SHATTER. HELM: FLY THE CLEAR CHANNEL SLOWLY - ROCKS HURT. TACTICAL: POINT DEFENCE ON LOOSE BOULDERS. SHIELDS: REINFORCE TOWARDS THEM. SCIENCE: SCAN THE CARTOGRAPHER MARKERS',
        e1_out: 'SCIENCE: RUN LAB TESTS ON THE RED SHARD IN THE CARGO HOLD AND CLASSIFY IT (PUT THE LAB ON THE VIEWER - EVERYONE CAN HELP). AND GET US OUT OF THE SHATTER',
        e2_go: 'THE SECOND SHARD IS ON THE ICE WORLD RIME, IN CERULEAN DEEP. JUMP THERE (VIA VEL\'ANAR OR THE SHROUD)',
        e2_orbit: 'ENTER A STANDARD ORBIT OF RIME. NAV: TAP RIME TO PLOT THE INSERTION POINT. HELM: ARRIVE SLOWLY, TURN ALONG THE ORBIT AT ORBIT SPEED, THEN CUT THE ENGINES',
        e2_hail: 'WE\'RE IN ORBIT. COMMS: HAIL THE RIME SETTLEMENT ON THE SURFACE',
        e2_keepers: 'THE KEEPERS ARE FIRING MISSILES FROM THE SURFACE! KEEP SHIELDS UP - THEY STOP A MISSILE COLD. THEN CHOOSE: TACTICAL CAN DESTROY THE LAUNCH SITE, OR COMMS CAN HAIL IT AND TRY TO TALK THE KEEPERS DOWN',
        e2_after: 'COMMS: THE LAUNCH SITE IS GONE. HAIL THE RIME SETTLEMENT AGAIN',
        e3_go: 'A RELIC DEALER CALLED SARESH IS SELLING A GREEN SHARD AT THE LANTERN. JUMP TO VEL\'ANAR',
        e3_meet: 'COMMS: HAIL SARESH\'S SHIP, THE GILDED HAND, NEAR THE LANTERN',
        e3_test: 'SARESH GAVE US A SAMPLE OF EACH SHARD - ONE IS FORGED. SCIENCE: LAB-TEST BOTH (DATING TELLS ANCIENT FROM NEW), THEN COMMS: HAIL SARESH AND DEAL',
        e4_go: 'THE LAST SHARD IS IN THE ORRAN ARCHIVE. JUMP TO ORRA PRIME',
        e4_meet: 'COMMS: HAIL THE BASTION OF ORR AND ASK FOR ARCHIVIST VHEL',
        e4_ring: 'SCIENCE: CARGO HOLD > ASSEMBLE RING. FIT THE FOUR SHARDS EDGE TO EDGE (SWAP AND FLIP THEM; THE RING CLOSES ON ITSELF), THEN ALIGN IT. PUT IT ON THE VIEWER SO THE WHOLE CREW CAN HELP',
        e5_go: 'THE RING SAYS: FROM THE BLUE GIANT, BEARING 072. JUMP TO CERULEAN DEEP, THEN NAV PLOTS THE HIDDEN LANE TO THE ATLAS AND HELM ALIGNS TO 072',
        e5_near: 'APPROACH THE ATLAS ENGINE',
        e5_hold: 'SARESH AND HIS KESSARI WANT THE ENGINE. HOLD THEM OFF - STAY WITHIN 12K OF THE ATLAS',
        e5_choice: 'THE ATLAS IS SPEAKING. COMMS: ANSWER IT',
      }[k];
      if (obj) this.setObjective(`CH${c.ch}: ${obj}`);
      this.cartoEnter(k);
    },
    cartoEnter(k) {
      const c = this.camp, sid = this.sysDef.id;
      if (k === 'e1_go' && sid === 'meridian') this.cartoShatter();
      if (k === 'e2_go' && sid === 'cerulean') this.cartoRime();
      if (k === 'e3_go' && sid === 'velanar') this.cartoLantern();
      if (k === 'e4_go' && sid === 'orra') this.cartoOrra();
      if (k === 'e5_go' && sid === 'atlas') this.cartoAtlasArrive();
      if (k === 'e4_ring') this.cartoRingStart();
      void c;
    },
    hasArt(id) { return this.P.arts.some((h) => G.ART[h.a].id === id); },
    artOf(id) { return this.P.arts.find((h) => G.ART[h.a].id === id); },
    // ---- chapter 1: the Shatter
    cartoShatter() {
      const c = this.camp;
      if (this.field && c.fspec && this.field.spec.seed === c.fspec.seed) return;
      if (!c.fspec) c.fspec = { seed: c.seed, ...this.fieldSite(26000, 14000), w: [2400, 2100, 1800][this.M.diff % 3], bends: 5, driftEvery: [14, 11, 8][this.M.diff % 3] };
      this.fieldStart(c.fspec);
      const pts = this.field.f.pts;
      c.markers = [];
      [[0.28, 'CARTOGRAPHER MARKER I', 'RUNES CUT INTO THE ROCK: AN EYE-SHAPED SIGIL, THEN A RING OF FOUR MARKS. THE TRANSLATOR CAN\'T PARSE IT.'],
        [0.78, 'CARTOGRAPHER MARKER II', 'MORE RUNES. THE EYE SIGIL AGAIN - BESIDE A CARVING OF A HUGE BLUE STAR.']].forEach(([f, nm, note]) => {
        const [x, y] = pathAt(pts, f);
        const id = this.spawnAt(CT_BUOY, F_NEUTRAL, x + 300, y + 300, 0);
        if (id !== NO_ID) { Object.assign(this.npc[id], { name: nm, short: nm.replace('CARTOGRAPHER ', ''), scan: 1, note }); c.markers.push(id); }
      });
      if (c.calId === undefined || !this.npc[c.calId] || !this.npc[c.calId].active) {
        const [x, y] = pathAt(pts, 0.55);
        const id = this.spawnAt(CT_FREIGHTER, F_FRIEND, x, y, 90);
        if (id !== NO_ID) { Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_COLONY, name: 'SURVEY SHIP CALLIOPE', short: 'CALLIOPE', hull: 35, speed: 0 }); c.calId = id; }
      }
      const e = pathAt(pts, 0), x = pathAt(pts, 1);
      this.clearMarkers();
      this.M.mk.push({ x: e[0], y: e[1], kind: MK_POINT, r: 0 }, { x: x[0], y: x[1], kind: MK_RENDEZVOUS, r: 0 }); this.M.ver++;
      this.say(FROM_CREW, 0, `THE SHATTER IS IN SECTOR ${this.sec(e[0], e[1])}. THERE'S ONE CLEAR CHANNEL THROUGH IT - THE ENTRY IS MARKED ON NAV.`);
      this.cartoStep('e1_field');
    },
    cartoShard1() {
      const c = this.camp;
      this.addArt('rshard', 0);
      this.say(FROM_CREW, 0, 'THE RED SHARD IS IN OUR HOLD. IT\'S A RARE SPECIMEN - SCIENCE WILL NEED THE LAB TO CLASSIFY IT.');
      this.cartoSay('reyes', c.f.reyes === 'seized' ? 'WE\'LL LIMP OUT BEHIND YOU. DON\'T WAIT FOR US.' : 'WE\'LL PATCH UP AND FOLLOW YOU OUT ON THRUSTERS. GO - AND GOOD LUCK WITH THE RING.', 3, c.calId);
      this.cartoStep('e1_out');
    },
    // ---- chapter 2: Rime
    cartoRime() {
      const c = this.camp, sd = this.sysDef, ri = sd.planets.findIndex((p) => p.name === 'RIME');
      c.rimeI = ri;
      for (let i = 0; i < MAX_CONTACTS; i++) {
        const n = this.npc[i];
        if (n.active && n.type === K.CT_GROUND && n.pl === ri) { n.talk = 'e_elder'; n.name = 'RIME SETTLEMENT (COUNCIL)'; n.short = 'RIME COUNCIL'; c.elderId = i; }
      }
      const v = this.addGround(ri, { name: 'VAULT OF THE FIRST MAP', short: 'THE VAULT', civ: CIV_COLONY, talk: null, ga: 1.6 });
      if (v !== NO_ID) { this.npc[v].note = 'AN ICE-CUT VAULT. INSIDE: A BLUE CRYSTAL SHARD. LIFE SIGNS: 6 - GUARDS.'; c.vaultId = v; }
      this.cartoStep('e2_orbit');
    },
    onOrbit(i) {
      const c = this.camp;
      if (!c || c.id !== 'carto') return;
      if (c.step === 'e2_orbit' && this.sysDef.id === 'cerulean' && i === c.rimeI) this.cartoStep('e2_hail');
    },
    cartoSignal() {
      const c = this.camp;
      if (c.signal) return;
      c.signal = true;
      this.after(7, () => {
        if (!this.camp || this.camp.step.startsWith('e3')) return;
        this.say(FROM_CREW, 1, 'CAPTAIN - A STRANGE SIGNAL FROM THE SURFACE. A HEAT BLOOM IN THE SOUTHERN ICE... IT\'S MOVING. IT\'S COMING UP AT US!');
        const id = this.addGround(c.rimeI, { name: 'KEEPER LAUNCH SITE', short: 'LAUNCH SITE', civ: CIV_COLONY, talk: 'e_keeper', ga: 3.9, hostile: true });
        if (id !== NO_ID) { Object.assign(this.npc[id], { hull: 100, armor: 1, note: 'A HIDDEN MISSILE SILO. FOUR LAUNCH TUBES. LIFE SIGNS: 11.' }); c.siteId = id; }
        c.missileT = 2;
        this.cartoStep('e2_keepers');
      });
    },
    cartoMissile() {
      const c = this.camp, n = this.npc[c.siteId], P = this.P;
      if (!n || !n.alive) return;
      this.launchTorp(K.HAZARD, K.T_QUANTUM, n.x, n.y, bearingTo(n.x, n.y, P.x, P.y), US, 42, K.SUB_HULL);
      this.say(FROM_CREW, 2, this.shieldsUp() ? 'MISSILE LAUNCH FROM THE SURFACE! SHIELDS ARE UP - BRACE!' : 'MISSILE LAUNCH FROM THE SURFACE! SHIELDS ARE DOWN - RAISE SHIELDS!');
      this.emit(K.EV_ALERT, K.AL_RED);
    },
    cartoRimePeace(kind) {
      const c = this.camp, f = c.f;
      f.rime = kind;
      const n = this.npc[c.siteId]; if (n && n.alive) { n.faction = F_NEUTRAL; n.talk = null; }
      this.repAdd(CIV_COLONY, kind === 'peace' ? 20 : 15);
      this.sayAs('oduya', kind === 'peace' ? '...NO ONE HAS EVER OFFERED TO TAKE NOTHING. STAND DOWN THE SILO. SCAN YOUR EYE, OUTSIDERS.' : 'A GIFT, AND THE COUNCIL\'S VOICE. VERY WELL. THE SILO IS SILENT.');
      this.after(4, () => {
        this.cartoSay('tamsin', kind === 'peace'
          ? 'YOU STOPPED A WAR WITH WORDS, CAPTAIN. TAKE YOUR SCAN - AND TAKE THIS: OUR SCRIPTURE. IT IS THE CARTOGRAPHERS\' OWN KEY TO THEIR RUNES. WE NEVER HAD ANYONE TO READ IT FOR.'
          : 'THE COUNCIL HAS DECIDED: THE EYE GOES WITH YOU, WITH OUR BLESSING - AND OUR SCRIPTURE, THE KEY TO ITS RUNES. BRING IT HOME ONE DAY.', 3, c.elderId ?? FROM_COMMAND);
        this.addArt(kind === 'peace' ? 'bcopy' : 'bshard', 0);
        this.addArt('codex', 2);
        this.cartoChapterEnd(2);
      });
    },
    // ---- chapter 3: Saresh
    cartoLantern() {
      const c = this.camp, st = this.npc[0];
      if (c.sareshId === undefined || !this.npc[c.sareshId].active) {
        const id = this.spawnAt(CT_FREIGHTER, F_NEUTRAL, st.x + 5000, st.y - 3000, 270);
        if (id !== NO_ID) { Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_VELORI, name: 'THE GILDED HAND', short: 'GILDED HAND', talk: 'e_saresh', talkCtx: {}, note: 'A YACHT FULL OF ANTIQUITIES. TWO GREEN CRYSTAL SHARDS IN A SHIELDED DISPLAY CASE.' }); c.sareshId = id; }
      }
      this.greeted.add(0);
      this.cartoStep('e3_meet');
    },
    cartoSamples() {
      const c = this.camp, f = c.f;
      if (f.sareshMet) return;
      f.sareshMet = true;
      this.addArt('gsample1', 0); this.addArt('gsample2', 0);
      c.realSample = this.frand() < 0.5 ? 0 : 1;   // which of A/B is genuine
      const a = this.artOf('gsample1'), b = this.artOf('gsample2');
      this.labCls = this.labCls || {};
      this.labCls[a.uid] = c.realSample === 0 ? 'chart' : 'forge';
      this.labCls[b.uid] = c.realSample === 1 ? 'chart' : 'forge';
      this.say(FROM_CREW, 0, 'TWO SAMPLES ARE IN THE HOLD - A AND B. THE LAB CAN TELL US WHICH ONE IS REAL.');
      this.cartoStep('e3_test');
    },
    cartoFakeFound() { // the lab has classified one of the samples as a forgery
      const c = this.camp;
      return this.P.arts.some((h) => (G.ART[h.a].id === 'gsample1' || G.ART[h.a].id === 'gsample2') && h.ident >= 2 && h.cls === 'forge');
    },
    cartoHasGreen() { return this.hasArt('gshard'); },
    cartoBuy(which, how) {
      const c = this.camp, f = c.f;
      if (which === c.realSample) { f.saresh = f.saresh === 'fooled' ? 'fooled' : how; this.cartoGreen(false); return; }
      f.saresh = 'fooled';
      this.addArt('gfake', 0);
      this.sayAs('saresh', 'A PLEASURE DOING BUSINESS, CAPTAIN. ALL SALES FINAL.');
      this.say(FROM_CREW, 1, 'SCIENCE HERE - CAPTAIN, I DON\'T LIKE THIS ONE. WE SHOULD HAVE TESTED THE SAMPLES FIRST. (THE LAB CAN STILL CHECK IT.)');
    },
    cartoGreen(fair) {
      this.addArt('gshard', 0);
      for (const id of ['gsample1', 'gsample2']) { const i = this.P.arts.findIndex((h) => G.ART[h.a].id === id); if (i >= 0) this.P.arts.splice(i, 1); }
      this.sayAs('saresh', fair ? 'THE GENUINE ARTICLE. YOU HAVE A GOOD EYE, CAPTAIN. I WILL REMEMBER IT.' : 'THE GENUINE ARTICLE. TAKE GOOD CARE OF IT - I\'D HATE FOR SOMETHING TO HAPPEN TO IT.');
      const n = this.npc[this.camp.sareshId]; if (n) n.talk = null;
      this.cartoChapterEnd(3);
    },
    cartoExpose() {
      const c = this.camp;
      c.f.saresh = 'exposed';
      this.repAdd(CIV_VELORI, 15);
      this.sayAs('saresh', 'YOU WOULDN\'T DARE - ...YOU DARE. YOU WILL REGRET THIS, AURORA.');
      this.after(3, () => {
        this.cartoSay('guild', 'THE GUILD THANKS YOU, AURORA. SARESH HAS SOLD FORGERIES IN OUR NAME FOR YEARS. HIS STOCK IS CONFISCATED - AND THE GENUINE SHARD IS YOURS, WITH THE GUILD\'S GRATITUDE. WHEN YOU NEED SHIPS, CALL.', 3, 0);
        const n = this.npc[c.sareshId]; if (n && n.active) { this.npcLeave([c.sareshId]); n.talk = null; }
        this.addArt('gshard', 0);
        for (const id of ['gsample1', 'gsample2']) { const i = this.P.arts.findIndex((h) => G.ART[h.a].id === id); if (i >= 0) this.P.arts.splice(i, 1); }
        this.cartoChapterEnd(3);
      });
    },
    // ---- chapter 4: Vhel and the ring
    cartoOrra() {
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === CT_STARBASE) { this.npc[i].talk = 'e_vhel'; this.greeted.add(i); }
      this.cartoStep('e4_meet');
    },
    cartoGold() {
      this.addArt('oshard', 2);
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === CT_STARBASE && this.npc[i].talk === 'e_vhel') this.npc[i].talk = null;
      this.after(3, () => this.cartoStep('e4_ring'));
    },
    cartoRingStart() {
      const c = this.camp;
      if (c.ring) return;
      c.ring = { tiles: TILES.map((t) => ({ name: t.name, col: t.col, L: t.L, R: t.R, M: t.M })), order: [2, 0, 3, 1], flip: [false, false, true, false], solved: false, msg: '' };
      this.say(FROM_CREW, 0, 'ALL FOUR SHARDS ARE ABOARD. SCIENCE: THE CARGO HOLD HAS AN "ASSEMBLE RING" PAGE. MATCH THE RUNES ON THE EDGES.');
    },
    ringCmd(a, b, c2) {
      const c = this.camp, R = c && c.ring;
      if (!R || R.solved) { this.denied(R ? 'THE RING IS ALREADY ALIGNED.' : 'NOTHING TO ASSEMBLE.'); return; }
      const n = R.order.length;
      if (a === 5) { if (b < 0 || b >= n || c2 < 0 || c2 >= n || b === c2) return; [R.order[b], R.order[c2]] = [R.order[c2], R.order[b]]; [R.flip[b], R.flip[c2]] = [R.flip[c2], R.flip[b]]; R.msg = ''; return; }
      if (a === 7) { if (b < 0 || b >= n) return; R.flip[b] = !R.flip[b]; R.msg = ''; return; }
      if (a === 6) {
        const s0 = R.order.indexOf(0);
        const ok = R.flip.every((f) => !f) && [0, 1, 2, 3].every((k) => R.order[(s0 + k) % n] === k);
        if (!ok) { R.msg = 'THE EDGES DON\'T MEET - THE RING WON\'T CLOSE. EVERY EDGE RUNE MUST MATCH ITS NEIGHBOUR\'S, AND THE LAST MEETS THE FIRST.'; this.denied('THE RING WON\'T CLOSE.'); return; }
        R.solved = true;
        this.emit(K.EV_FOUND);
        if (this.hasArt('codex')) {
          R.msg = 'THE RING READS: "THE BLUE GIANT - 0 - 7 - 2". FROM THE BLUE GIANT, BEARING 072. THE BLUE GIANT IS CERULEAN DEEP!';
          this.say(FROM_CREW, 3, 'THE RING IS WHOLE AND IT\'S GLOWING. WITH THE CODEX IT READS: "FROM THE BLUE GIANT, BEARING ZERO-SEVEN-TWO." CERULEAN DEEP HAS A HIDDEN LANE, CAPTAIN - ON BEARING 072!');
          this.revealed.add(SYS_INDEX.atlas);
          this.cartoChapterEnd(4);
        } else R.msg = 'THE RING IS WHOLE - BUT WITHOUT THE CODEX WE CAN\'T READ IT.';
      }
    },
    // ---- chapter 5: the Atlas
    cartoAtlasArrive() {
      const c = this.camp;
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === CT_STARBASE) { this.npc[i].talk = null; this.npc[i].faction = F_NEUTRAL; this.npc[i].shMax = this.npc[i].shields = 600; c.atlasId = i; this.greeted.add(i); }
      const a = this.npc[c.atlasId];
      this.clearMarkers();
      if (a) { this.M.mk.push({ x: a.x, y: a.y, kind: MK_AREA, r: 12000 }); this.M.ver++; }
      this.say(FROM_CREW, 0, 'WE\'RE THROUGH. CAPTAIN... THERE\'S A STRUCTURE AHEAD THE SIZE OF A SMALL MOON. IT\'S ALL CRYSTAL. IT\'S THE ATLAS.');
      this.cartoStep('e5_near');
    },
    cartoBattle() {
      const c = this.camp;
      if (c.battle) return;
      c.battle = true; c.holdT = 90; c.nextWave = 0; c.allies = new Set();
      this.cartoStep('e5_hold');
    },
    cartoWave() {
      const c = this.camp, a = this.npc[c.atlasId], n = 2 + (this.M.diff % 3) + (c.f.saresh === 'exposed' ? 1 : 0);
      const [x, y] = this.pointNear(a.x, a.y, 11000);
      for (let i = 0; i < n; i++) {
        const id = this.spawnFoe(i === 0 && c.wave === 0 ? CT_DESTROYER : CT_RAIDER, this.clampSec(x + i * 1300), this.clampSec(y + (i % 2) * 1100), US, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: i === 0 && c.wave === 0 ? CIV_VELORI : CIV_KESSARI, name: i === 0 && c.wave === 0 ? 'THE GILDED HAND' : `MERCENARY ${i}`, short: i === 0 && c.wave === 0 ? 'GILDED HAND' : `MERC ${i}` });
      }
      c.wave = (c.wave || 0) + 1;
    },
    cartoAllies() {
      const call = (who, n, type, civ, name, line, grudging) => this.callAlly(who, { ships: n, type, civ, name, line, grudging });
      call('reyes', 3, CT_DESTROYER, CIV_COLONY, 'SURVEY CUTTER', 'THE CALLIOPE AND TWO CUTTERS FROM THE SURVEY GUILD, AURORA! PARTNERS, REMEMBER?', 'THE CALLIOPE IS HERE - SHE\'S NOT MUCH OF A WARSHIP, BUT SHE OWES YOU.');
      call('tamsin', 3, CT_RAIDER, CIV_COLONY, 'RIME ICE-RUNNER', 'RIME HAS SHIPS TOO, CAPTAIN. YOU TOOK NOTHING FROM US. NOW WE GIVE.', 'ONE SHIP FROM RIME. THE COUNCIL WAS... DIVIDED.');
      call('guild', 3, CT_DESTROYER, CIV_VELORI, 'GUILD ESCORT', 'THE GUILD PAYS ITS DEBTS, AURORA. SARESH WILL LEARN THAT TODAY.');
      call('vhel', 2, CT_DESTROYER, CIV_ORRAN, 'ARCHIVE GUARDIAN', 'THE ARCHIVE WILL SEE WHAT THE RING OPENED, OUTSIDER - AND IT WILL NOT SEE IT STOLEN.', 'ONE GUARDIAN OF THE ARCHIVE. A SHARD FOR A FIGHT, OUTSIDER. NO MORE.');
      call('hale', 2, CT_DESTROYER, CIV_FLEET, 'FLEET CRUISER', 'FLEET IS HERE, AURORA. VOSS SAYS DON\'T LET THEM TOUCH IT.', 'ONE CRUISER, AURORA. IT\'S ALL WE COULD SPARE.');
    },
    cartoEnding(kind) {
      const c = this.camp, f = c.f;
      const T = {
        finish: ['THE LAST STAR', 'THE ATLAS SINGS ONCE, AND RIME MOVES - A WHOLE WORLD SLIDING ACROSS THE SKY TO A YOUNGER, KINDER SUN. THEN THE CRYSTAL GOES DARK. THE CARTOGRAPHERS\' MAP IS FINISHED, AND SO ARE THEY.'],
        heirs: ['THE HEIRS', 'THE PEOPLE OF RIME COME UP FROM THE ICE TO MEET THE MACHINE THEIR ANCESTORS DREAMED OF. ELDER TAMSIN LISTENS TO IT FOR A LONG TIME. "MOVE US," SHE SAYS AT LAST. "AND THEN REST." THE ATLAS OBEYS ITS HEIRS.'],
        fleet: ['THE STUDY', 'FLEET SCIENCE SHIPS ARRIVE BY THE DOZEN. THE ATLAS ANSWERS EVERY QUESTION BUT ONE: IT WILL NOT MOVE A STAR FOR SOLDIERS. ON RIME, THE BLUE GIANT SWELLS A LITTLE MORE EACH YEAR. THERE IS STILL TIME. PROBABLY.'],
        sleep: ['THE SLEEPER', 'THE ATLAS DIMS, CRYSTAL BY CRYSTAL, UNTIL IT IS ONLY A GLITTERING RUIN AT THE EDGE OF THE MAP. NO ONE WILL MOVE A STAR AGAIN. ON RIME, THE KEEPERS LIGHT A LAMP FOR THE THING THAT CHOSE TO SLEEP.'],
      }[kind];
      const rime = { peace: 'RIME REMEMBERS THE SHIP THAT TOOK NOTHING.', gift: 'RIME REMEMBERS THE SHIP THAT ASKED.', regret: 'RIME REMEMBERS THE SHIP THAT FIRED - AND SAID SORRY.', force: 'RIME REMEMBERS THE SHIP THAT TOOK ITS EYE BY FORCE.' }[f.rime] || '';
      c.ending = { kind, title: T[0], text: T[1] + ' ' + rime + (f.saresh === 'fooled' ? ' SOMEWHERE, SARESH IS STILL TELLING THE STORY OF THE FLEET CAPTAIN WHO BOUGHT A FAKE.' : ''), allies: [...(c.allies || [])].filter((w) => CHARS[w]).map((w) => CHARS[w].name) };
      this.campSaveOf('carto').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    // ---- arrivals and the tick
    cartoArrive() {
      const c = this.camp, sid = this.sysDef.id;
      if (sid === 'meridian' && (c.step === 'e1_go' || c.step === 'e1_field' || c.step === 'e1_out')) { this.cartoShatter(); if (c.step !== 'e1_go') this.cartoStep(c.step === 'e1_out' ? 'e1_out' : 'e1_field'); }
      if (sid === 'cerulean' && c.step === 'e2_go') this.cartoRime();
      if (sid === 'velanar' && c.step === 'e3_go') this.cartoLantern();
      if (sid === 'orra' && c.step === 'e4_go') this.cartoOrra();
      if (sid === 'atlas' && c.step === 'e5_go') this.cartoAtlasArrive();
    },
    cartoOnScan(id) {
      const n = this.npc[id];
      if (n && n.note && n.scan >= 2 && !n.noted) { n.noted = true; this.say(FROM_CREW, 0, `${n.short}: ${n.note}`); }
    },
    cartoTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      const near = (id, r) => id !== undefined && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      switch (c.step) {
        case 'e1_field':
          if (sid === 'meridian' && near(c.calId, 3500) && !this.dlg && !c.reyesSpoke) { c.reyesSpoke = true; this.startDialog('e_reyes1', c.calId); }
          break;
        case 'e1_out': {
          const h = this.artOf('rshard'), out = !this.field || !insideBox(this.field.spec, P.x, P.y, 500);
          const parts = [h && h.ident >= 2 ? 'SHARD CLASSIFIED' : 'SHARD NOT YET CLASSIFIED', out ? 'CLEAR OF THE FIELD' : 'STILL IN THE FIELD'];
          this.setObjective(`CH1: ${h && h.ident >= 2 ? '' : 'SCIENCE: LAB-TEST THE RED SHARD IN THE CARGO HOLD AND CLASSIFY IT. '}${out ? '' : 'HELM: GET US OUT OF THE SHATTER. '}(${parts.join(', ')})`);
          if (h && h.ident >= 2 && out && !c.done1) { c.done1 = true; this.say(FROM_COMMAND, 3, 'VOSS HERE. A CARTOGRAPHER STAR CHART... AND THE CALLIOPE\'S PEOPLE ALIVE. GOOD WORK. THE RING HAS THREE MORE PIECES, CAPTAIN - AND OUR ANALYSTS THINK ONE IS ON A WORLD CALLED RIME.'); this.cartoChapterEnd(1); }
          break;
        }
        case 'e2_keepers': {
          const n = this.npc[c.siteId];
          if (!n || !n.alive) { // bombarded
            if (!c.bombed) { c.bombed = true; this.say(FROM_CREW, 2, 'THE LAUNCH SITE IS DESTROYED. ...SENSORS READ ELEVEN LIFE SIGNS - NOW NONE.'); this.repAdd(CIV_COLONY, -15); this.cartoStep('e2_after');
              for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === K.CT_GROUND && this.npc[i].talk === 'e_elder') this.npc[i].talk = 'e_elder2'; }
            break;
          }
          if (P.orb && P.orb.pl === c.rimeI) { c.missileT -= dt; if (c.missileT <= 0) { c.missileT = 20 + this.frand() * 6; this.cartoMissile(); } }
          break;
        }
        case 'e5_near':
          if (sid === 'atlas' && near(c.atlasId, 9000) && !this.dlg && !c.sareshCame) {
            c.sareshCame = true;
            this.cartoWave();
            this.after(3, () => this.startDialog('e_sareshf', FROM_COMMAND));
          }
          break;
        case 'e5_hold': {
          const a = this.npc[c.atlasId], inZone = a && distTo(P.x, P.y, a.x, a.y) < 12000;
          if (c.t > 10 && !c.alliesCalled) { c.alliesCalled = true; this.cartoAllies(); }
          if (inZone) c.holdT -= dt;
          c.nextWave -= dt;
          if (c.nextWave <= 0 && c.holdT > 15) { c.nextWave = 32; if (c.wave) this.cartoWave(); }
          this.setObjective(`CH5: HOLD THE ATLAS AGAINST SARESH - STAY WITHIN 12K: ${Math.max(0, Math.ceil(c.holdT))}s${inZone ? '' : ' (TOO FAR - GET BACK!)'}`);
          if (c.holdT <= 0) {
            for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].alive && this.npc[i].faction === F_HOSTILE) this.npcLeave([i]);
            this.say(FROM_CREW, 3, 'THEY\'RE BREAKING OFF! SARESH IS RUNNING!');
            this.cartoStep('e5_choice');
            this.after(4, () => this.startDialog('e_atlas', c.atlasId));
          }
          break;
        }
      }
    },
  });
}
void LAB_ART; void sysAt; void CIV_KESSARI; void AI_ATTACK;
