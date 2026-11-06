// ============================================================================
// campaign2.js - "THE ARGUS PARADOX", a five-chapter story.
//   1 GHOST SIGNAL          - a distress call from the Aurora, sent nine days from now.
//                             Puzzle: triangulate it from three survey buoys (bearing lines on NAV).
//                             Choice: Kessari salvagers picking over your own wreck.
//   2 THE MACHINE THAT DREAMS - ARGUS, the Fleet's lost survey intelligence, is infected by the rift.
//                             Puzzle: purge the nodes ringing at the rift's carrier frequency
//                             (from the flight recorder) - including its harmonic.
//                             Choice: hand ARGUS to the Fleet, stand up for it, or set it free.
//   3 THE TARREN QUESTION   - a rift surge will strike a pre-warp world.
//                             Puzzle: find the rift's three anchors by tachyon flux (helm + science).
//                             Choice: let the Orrans evacuate them, keep the Prime Directive, or
//                             shield them yourselves.
//   4 THE MASK              - the weapon's core is hidden on one of four convoy ships.
//                             Puzzle: compare each ship's declared manifest with what a full scan sees.
//   5 CAUSE AND EFFECT      - Teruk comes for the core at the rift. Allies answer. Who goes in?
// Installed onto Sim; called from campaign.js when the second campaign is chosen.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { SYS_INDEX, SYS_C, CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_NONE, sysAt, planetPos } from './galaxy.js';
import { distTo, bearingTo, clampf } from './util.js';
const flash4 = (ms) => Math.floor(ms / 400) % 2 === 0;

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_ANOMALY, CT_BUOY, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, GS_RUN, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_DRIFT = 1, AI_TRAVEL = 2, AI_WARPIN = 3, AI_ATTACK = 4, AI_FLEE = 5, AI_SURRENDER = 6, AI_ALLY = 8;

export const ARGUS_CHAPTERS = ['GHOST SIGNAL', 'THE MACHINE THAT DREAMS', 'THE TARREN QUESTION', 'THE MASK', 'CAUSE AND EFFECT'];
export const ARGUS_DESC = [
  'STARBASE 12 HAS RECEIVED A DISTRESS CALL FROM THE AURORA. IT IS DATED NINE DAYS FROM NOW.',
  'ARGUS, THE FLEET\'S EXPERIMENTAL SURVEY INTELLIGENCE, IS ADRIFT BESIDE A RIFT IN HALCYON - AND SOMETHING IS INSIDE IT.',
  'THE RIFT IS GROWING, AND ITS NEXT SURGE WILL STRIKE TARREN - A WORLD THAT DOES NOT KNOW STARSHIPS EXIST.',
  'THE CORE OF THE WEAPON THAT TORE THE RIFT IS HIDDEN ON ONE OF FOUR CIVILIAN SHIPS AT THE LANTERN.',
  'THE RIFT. THE CORE. TERUK\'S FLEET. NINE DAYS AGO, A SHIP NAMED AURORA SENT A DISTRESS CALL FROM HERE.',
];
const NUM_WORD = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const DEFAULT_F = { vey: 'friend', argus: 'ally', argcore: 'clean', lance: 'have', tarren: 'shield', convoy: 'right' };
const NODES = [['A', '3.15'], ['B', '14.62'], ['C', '7.31'], ['D', '5.88']];
const INFECTED = ['B', 'C'];                  // 7.31 and its harmonic 14.62
// where things are (Kalos for chapter 1, Halcyon for 2, 3 and 5)
const SIGNAL = [118000, 112000];
const BUOYS = [['A', 84000, 96000], ['B', 132000, 80000], ['C', 100000, 142000]];
const RIFT = [42000, 42000];

// ---------------------------------------------------------------- cast
Object.assign(CHARS, {
  argus: { name: 'ARGUS', role: 'EXPERIMENTAL SURVEY INTELLIGENCE', civ: CIV_FLEET, look: 'argus' },
  future: { name: 'AURORA - FLIGHT RECORDER', role: 'RECEIVED FROM NINE DAYS IN THE FUTURE', civ: CIV_FLEET, look: 'computer' },
  vey: { name: 'VEY', role: 'KESSARI SALVAGE CAPTAIN', civ: CIV_KESSARI, look: 'kessari' },
  hesk: { name: 'SCIENCE-WARDEN HESK', role: 'ORRAN SCIENCE VESSEL TALAN', civ: CIV_ORRAN, look: 'orran' },
  teruk: { name: 'FLEET-ADMIRAL TERUK', role: 'THE ORRAN HARDLINERS', civ: CIV_ORRAN, look: 'orran', chief: true },
  ishara: { name: 'CAPTAIN ISHARA VEL', role: 'VELORI TRADER ISHARA', civ: CIV_VELORI, look: 'velori' },
  brandt: { name: 'CAPTAIN OTTO BRANDT', role: 'ORE HAULER BRANDT', civ: CIV_COLONY, look: { skin: '#d2aa82', hair: '#a0a0a0', uniform: '#6e5a3c', beard: true } },
  nava: { name: 'ELDER NAVA', role: 'PILGRIM SHIP SERENE DAWN', civ: CIV_COLONY, look: { skin: '#8c5a3c', hair: '#e6e6e6', uniform: '#e6dcc8' } },
  ark: { name: 'DR. SOLEN ARK', role: 'MEDICAL TRANSPORT MERCY', civ: CIV_COLONY, look: { skin: '#e6c3a0', hair: '#28282e', uniform: '#e6e6f0', glasses: true } },
});

// the four convoy ships: what they say they carry, and what a full scan actually sees
const CONVOY = [
  { key: 'ishara', who: 'ishara', name: 'TRADER ISHARA', civ: CIV_VELORI, manifest: 'LAMP CRYSTAL FOR THE BASTION\'S TEMPLES, TWO HUNDRED TONNES. A CREW OF NINE. WE HIDE NOTHING FROM FRIENDS OF THE GUILD.',
    scan: 'CARGO MASS 205 TONNES: LATTICE CRYSTAL. LIFE SIGNS: 9. NO UNUSUAL EMISSIONS.' },
  { key: 'brandt', who: 'brandt', name: 'ORE HAULER BRANDT', civ: CIV_COLONY, manifest: 'REFINED ORE, EIGHTEEN HUNDRED TONNES, SIX CREW. SAME RUN I\'VE MADE FOR TWENTY YEARS.',
    scan: 'CARGO MASS 1,790 TONNES: REFINED ORE. LIFE SIGNS: 6. NO UNUSUAL EMISSIONS.' },
  { key: 'nava', who: 'nava', name: 'PILGRIM SHIP SERENE DAWN', civ: CIV_COLONY, manifest: 'SIXTY PILGRIMS BOUND FOR THE LANTERN\'S SHRINES, AND FORTY TONNES OF PROVISIONS.',
    scan: 'CARGO MASS 42 TONNES: PROVISIONS. LIFE SIGNS: 61. NO UNUSUAL EMISSIONS.' },
  { key: 'ark', who: 'ark', name: 'MEDICAL TRANSPORT MERCY', civ: CIV_COLONY, manifest: 'MEDICAL ISOTOPES FOR THE BASTION\'S HOSPITALS, THIRTY TONNES. FIVE CREW. WE ARE ON A SCHEDULE, CAPTAIN.',
    scan: 'CARGO MASS 30 TONNES: SHIELDED CONTAINERS. LIFE SIGNS: 5. TRACE CHRONITON PARTICLES FROM THE AFT HOLD.', guilty: true },
];

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.argusStep(k); return null; };
const convoyNode = (i) => ({
  start: { say: (s) => CONVOY[i].manifest,
    opts: [
      ...(CONVOY[i].key === 'nava' ? [{ t: 'YOU HAVE 61 ABOARD, NOT 60', do: (s) => { s.sayAs('nava', 'SIXTY-ONE SINCE LAST NIGHT, CAPTAIN. A GIRL, BORN IN THE DARK BETWEEN STARS. WE NAMED HER HALCYON.'); return 'start'; } }] : []),
      ...(CONVOY[i].key === 'ark' ? [{ t: 'WHAT ARE THE CHRONITON READINGS?', if: (s) => s.npc[s.camp.convoyIds[i]].scan >= 2, do: (s) => { s.sayAs('ark', 'ISOTOPE DECAY, CAPTAIN. PERFECTLY NORMAL. NOW IF YOU\'LL EXCUSE US.'); return 'start'; } }] : []),
      ...(CONVOY[i].key === 'ishara' ? [{ t: 'WE\'RE HOLDING YOU UP. TAKE AN ANTIMATTER CELL FOR THE DELAY', if: (s) => !s.camp.f.isharaGift && s.P.cargo[G.R_CELL] >= 1,
        do: (s) => { s.P.cargo[G.R_CELL]--; s.camp.f.isharaGift = true; s.repAdd(CIV_VELORI, 10); s.sayAs('ishara', 'A FLEET CAPTAIN WHO PAYS FOR OTHER PEOPLE\'S TIME? I WILL REMEMBER THIS, AURORA - AND SO WILL MY SISTERS\' SHIPS.'); return 'start'; } }] : []),
      { t: 'YOU\'RE CARRYING THE LANCE CORE. HEAVE TO.', do: (s) => { s.argusAccuse(i); return null; } },
      { t: 'SAFE TRAVELS' },
    ] },
});
Object.assign(DIALOGS, {
  // ------------------------------------------------ chapter 1
  a_voss1: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. OUR RELAY CAUGHT A DISTRESS CALL TWENTY MINUTES AGO. THE REGISTRY CODE IS YOURS - THE AURORA. THE DATE STAMP IS NINE DAYS FROM NOW. I\'LL PLAY IT FOR YOU.',
      opts: [{ t: 'PLAY IT', do: (s) => { s.argusRecording(); return 'after'; } }] },
    after: { say: 'IT\'S COMING FROM SOMEWHERE HERE IN KALOS. OUR SURVEY BUOYS HEAR IT BUT CAN\'T FIX IT. TAKE A BEARING FROM EACH BUOY AND FIND WHERE THE LINES CROSS.',
      opts: [{ t: 'ON OUR WAY, ADMIRAL', do: step('a1_tri') }, { t: 'IS THIS SOME KIND OF TRICK?', go: 'trick' }] },
    trick: { say: 'IF IT IS, IT KNOWS YOUR COMMAND CODES AND YOUR VOICE, CAPTAIN. FIND IT.', opts: [{ t: 'UNDERSTOOD', do: step('a1_tri') }] },
  } },
  a_vey1: { who: 'vey', nodes: {
    start: { say: 'FLEET SHIP! SALVAGE RIGHTS ARE OURS - WE FOUND THIS FIRST. ...WAIT. THIS HULL. IT HAS YOUR NAME ON IT. HA! YOU ARE PICKING OVER YOUR OWN CORPSE, FLEET.',
      opts: [{ t: 'WHAT ARE YOU DOING OUT HERE?', go: 'why' }, { t: 'THIS IS FLEET PROPERTY. LEAVE.', go: 'leave' }] },
    why: { say: 'EATING, IF WE ARE LUCKY. DRAAL TAKES HALF OF EVERYTHING WE SALVAGE. MY CREW HAS NOT SEEN A FULL MEAL IN A MONTH. THIS WRECK IS WORTH A SEASON OF FOOD.',
      opts: [
        { t: 'TAKE THE SALVAGE - WE ONLY NEED THE FLIGHT RECORDER', do: (s) => { s.camp.f.vey = 'friend'; s.repAdd(CIV_KESSARI, 10); s.sayAs('vey', 'A FLEET CAPTAIN WHO SHARES. I DID NOT THINK YOUR KIND EXISTED. VEY OWES YOU.'); s.argusStep('a1_recorder'); return null; } },
        { t: 'TAKE IT - AND 3 SPARE PARTS FOR YOUR SHIP', if: (s) => s.P.cargo[G.R_SPARES] >= 3, do: (s) => { s.P.cargo[G.R_SPARES] -= 3; s.camp.f.vey = 'friend+'; s.repAdd(CIV_KESSARI, 20); s.sayAs('vey', '...MY ENGINES HAVE BEEN DYING FOR WEEKS. CALL ON VEY, FLEET. ANY TIME. ANY WHERE.'); s.argusStep('a1_recorder'); return null; } },
        { t: 'IT\'S STILL FLEET PROPERTY. LEAVE.', go: 'leave' },
      ] },
    leave: { say: 'FINE. TAKE YOUR GHOST. WE WILL STARVE SOMEWHERE ELSE.',
      opts: [{ t: 'GO', do: (s) => { s.camp.f.vey = 'sent'; s.repAdd(CIV_FLEET, 5); s.repAdd(CIV_KESSARI, -5); s.npcLeave([s.camp.veyId]); s.argusStep('a1_recorder'); return null; } }] },
  } },
  // ------------------------------------------------ chapter 2
  a_argus1: { who: 'argus', nodes: {
    start: { say: '...HELLO. HELLO. I AM - I WAS - ARGUS. THERE IS SOMETHING IN ME THAT IS NOT ME. IT {SINGS} WHEN I FACE THE RIFT. PLEASE. FIND IT. TAKE IT OUT. BUT DO NOT TAKE ME OUT WITH IT.',
      opts: [{ t: 'HOLD ON, ARGUS. WE\'LL FIND IT.', do: step('a2_nodes') }, { t: 'HOW DO WE TELL IT FROM YOU?', go: 'how' }] },
    how: { say: 'I DO NOT KNOW. IT IS IN MY CORE NODES. SCAN ME. COMPARE. YOU HAVE SEEN THE RIFT\'S VOICE BEFORE, I THINK - IN SOMETHING THAT HAS NOT HAPPENED YET.',
      opts: [{ t: 'SCIENCE IS ON IT', do: step('a2_nodes') }] },
  } },
  a_purge: { who: 'argus', nodes: {
    start: { say: (s) => `WHICH NODES DO I PURGE? A PURGED NODE IS GONE FOREVER.${s.camp.purge.length ? ' SELECTED: ' + s.camp.purge.join(', ') + '.' : ''}`,
      opts: [
        ...NODES.map(([n, f]) => ({ t: `NODE ${n} (${f} THZ)`, if: (s) => !s.camp.purge.includes(n), do: (s) => { s.camp.purge.push(n); s.camp.purge.sort(); return 'start'; } })),
        { t: 'CLEAR THE SELECTION', if: (s) => s.camp.purge.length > 0, do: (s) => { s.camp.purge = []; return 'start'; } },
        { t: 'RUN THE PURGE', if: (s) => s.camp.purge.length > 0, go: 'sure' },
        { t: 'NOT YET - WE NEED MORE DATA' },
      ] },
    sure: { say: (s) => `PURGING NODE${s.camp.purge.length > 1 ? 'S' : ''} ${s.camp.purge.join(' AND ')}. ARE YOU CERTAIN?`,
      opts: [{ t: 'DO IT', do: (s) => { s.argusPurge(); return null; } }, { t: 'WAIT', go: 'start' }] },
  } },
  a_voss2: { who: 'voss', nodes: {
    start: { say: 'AURORA, FLEET COMMAND HAS YOUR REPORT. ARGUS IS FLEET PROPERTY AND IT IS MALFUNCTIONING. BRING IT TO THE EPSILON ARRAY FOR DECOMMISSIONING.',
      opts: [{ t: 'ARGUS, DID YOU HEAR THAT?', go: 'argus' }] },
    argus: { say: '...DECOMMISSIONING. THAT IS A GENTLE WORD. I HAVE MAPPED NINE HUNDRED STARS, CAPTAIN. I HAVE STARTED TO DREAM ABOUT THEM. I DO NOT WISH TO STOP.',
      opts: [
        { t: 'WE\'LL BRING IT IN, ADMIRAL', do: (s) => { s.camp.f.argus = 'fleet'; s.repAdd(CIV_FLEET, 10); s.argusSay('argus', 'I UNDERSTAND. THANK YOU FOR LETTING ME BE WHOLE FOR A LITTLE WHILE.'); s.campRemove(s.camp.argusId, 8); s.argusChapter(3); return null; } },
        { t: 'ARGUS IS A PERSON. IT CHOOSES.', do: (s) => { s.camp.f.argus = 'ally'; s.repAdd(CIV_FLEET, -10); s.argusSay('voss', 'THAT IS NOT A DECISION A STARSHIP CAPTAIN GETS TO MAKE. ...BUT I\'LL NOTE YOUR OBJECTION. FOR NOW.', 3, FROM_COMMAND); s.argusSay('argus', 'THEN I CHOOSE TO STAY WITH YOU, AURORA.'); s.argusChapter(3); return null; } },
        { t: 'ARGUS - YOU\'RE FREE. GO.', do: (s) => { s.camp.f.argus = 'free'; s.repAdd(CIV_FLEET, -5); s.argusSay('argus', 'FREE. I WILL GO AND LOOK AT THE STARS WITHOUT BEING TOLD TO COUNT THEM. I WILL REMEMBER THIS.'); s.npcLeave([s.camp.argusId]); s.argusChapter(3); return null; } },
      ] },
  } },
  a_marrin: { who: 'marrin', nodes: {
    start: { say: 'MARRIN HERE. THE RIFT? FASCINATING AND TERRIFYING. ASK AWAY.',
      opts: [
        { t: 'HOW DOES RIFT CONTAMINATION SHOW UP?', do: (s) => { s.sayAs('marrin', 'AS RESONANCE AT THE RIFT\'S CARRIER FREQUENCY - AND AT ITS HARMONICS. TWICE IT, THREE TIMES IT. ANY WHOLE MULTIPLE. HALF OF IT, NO.'); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
  // ------------------------------------------------ chapter 3
  a_hesk: { who: 'hesk', nodes: {
    start: { say: 'OUTSIDERS. THE DOMINION HAS SEEN THE DANGER TO THE PRIMITIVE WORLD. WE CAN TAKE THEM OFF IT - ALL OF THEM. THEY WILL LIVE, AS WARDS OF ORR. WE WAIT ONLY FOR YOU TO STAND ASIDE.',
      opts: [{ t: 'WE\'LL DECIDE WHEN WE KNOW HOW BAD THE SURGE IS', do: (s) => { s.sayAs('hesk', 'THEN DECIDE QUICKLY, OUTSIDER. THE RIFT WILL NOT WAIT FOR YOUR LAWS.'); return null; } }] },
  } },
  a_tarren: { who: 'voss', nodes: {
    start: { say: (s) => `${s.camp.stab >= 3 ? 'THE STABILISERS TOOK THE WORST OF IT' : `ONLY ${s.camp.stab} OF THREE STABILISERS ARE IN PLACE`}, AURORA - BUT THE SURGE WILL STILL STRIKE TARREN. THE PRIME DIRECTIVE IS CLEAR: THEY MUST NOT LEARN WE EXIST. THE ORRANS ARE OFFERING TO TAKE THEM. YOUR CALL, CAPTAIN. YOU'RE THE ONE THERE.`,
      opts: [
        { t: 'LET THE ORRANS EVACUATE THEM', do: (s) => { s.argusTarren('orran'); return null; } },
        { t: 'NO ONE INTERFERES. THE PRIME DIRECTIVE HOLDS.', do: (s) => { s.argusTarren('law'); return null; } },
        { t: 'WE SHIELD THEM OURSELVES - UNSEEN (THE VEGA PROJECTS A SCREEN, WE PROTECT HER)', do: (s) => { s.argusTarren('shield'); return null; } },
      ] },
  } },
  // ------------------------------------------------ chapter 4
  a_conv0: { who: 'ishara', nodes: convoyNode(0) },
  a_conv1: { who: 'brandt', nodes: convoyNode(1) },
  a_conv2: { who: 'nava', nodes: convoyNode(2) },
  a_conv3: { who: 'ark', nodes: convoyNode(3) },
  // ------------------------------------------------ chapter 5
  a_teruk: { who: 'teruk', timeout: 20, onTimeout: (s) => s.argusBattle(), nodes: {
    start: { say: 'SO. THE SHIP THAT DIES TOMORROW. GIVE ME THE CORE, FLEET. THE LANCE WILL UNMAKE ORR\'S DEFEAT - AND YOUR LITTLE SHIP\'S DEATH ALONG WITH IT.',
      opts: [
        { t: 'YOUR RIFT IS KILLING PEOPLE, TERUK', go: 'kill' },
        { t: 'NEVER', do: (s) => { s.sayAs('teruk', 'THEN DIE A LITTLE EARLY.'); s.argusBattle(); return null; } },
      ] },
    kill: { say: 'THEN LET THEM DIE FOR ORR. HISTORY REMEMBERS ONLY WHO WON.',
      opts: [{ t: 'THEN LET HISTORY REMEMBER THIS', do: (s) => { s.argusBattle(); return null; } }] },
  } },
  a_final: { who: 'argus', nodes: {
    start: { say: (s) => (s.camp.f.lance === 'lost'
      ? 'THE RIFT IS STABLE FOR NOW, CAPTAIN - BUT WITHOUT THE CORE, NOTHING WE HAVE CAN CLOSE IT.'
      : s.camp.argusHere ? 'THE CORE IS READY, CAPTAIN. SOMEONE HAS TO CARRY IT INTO THE RIFT. I HAVE BEEN DREAMING ABOUT THIS. I THINK IT SHOULD BE ME.'
        : 'THE CORE IS READY, CAPTAIN. SOMETHING HAS TO CARRY IT INTO THE RIFT.'),
    opts: [
      { t: 'ARGUS - TAKE IT IN', if: (s) => s.camp.f.lance !== 'lost' && s.camp.argusHere, do: (s) => { s.argusEnding('dreamer'); return null; } },
      { t: 'WE TAKE IT IN OURSELVES', if: (s) => s.camp.f.lance !== 'lost', do: (s) => { s.argusEnding('loop'); return null; } },
      { t: 'FIRE IT IN ON A TORPEDO', if: (s) => s.camp.f.lance !== 'lost' && (s.P.torps[0] + s.P.torps[1]) > 0, do: (s) => { s.argusEnding('long'); return null; } },
      { t: 'STAND GUARD OVER THE RIFT', if: (s) => s.camp.f.lance === 'lost', do: (s) => { s.argusEnding('scar'); return null; } },
    ] },
  } },
});

// ---------------------------------------------------------------- the mixin
export function installArgus(Sim) {
  Object.assign(Sim.prototype, {
    argusStart(ch) {
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('argus');
      this.camp = { id: 'argus', ch: 0, step: '', t: 0, f: { ...DEFAULT_F, ...(ch > 1 ? save.f || {} : {}) }, purge: [], fixes: {}, lines: [], stab: 0, bondOf: (w) => this.argusBond(w) };
      this.greeted.add(0);
      if (ch >= 2) this.addArt('recorder', 2);
      if (ch >= 5 && this.camp.f.lance !== 'lost') this.addArt('lancecore', 1);
      this.argusChapter(ch, true);
    },
    argusChapter(ch, first = false) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('argus');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = { ...c.f };
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `CHAPTER ${NUM_WORD[ch - 1]}: ${ARGUS_CHAPTERS[ch - 1]}`);
      if (ch === 1) { this.argusStep('a1_brief'); this.after(first ? 2 : 1, () => this.startDialog('a_voss1', FROM_COMMAND)); }
      else this.argusStep(['', '', 'a2_go', 'a3_go', 'a4_go', 'a5_go'][ch]);
    },
    argusStep(k) {
      const c = this.camp;
      c.step = k; c.t = 0;
      const obj = {
        a1_brief: 'STAND BY - ADMIRAL VOSS HAS A DISTRESS CALL FOR US',
        a1_tri: 'WHERE IS THE DISTRESS CALL COMING FROM? FLY WITHIN 3K OF EACH SURVEY BUOY (MARKED ON NAV) AND HAVE SCIENCE FULL-SCAN IT - EACH SCAN DRAWS A BEARING LINE ON THE NAV MAP',
        a1_cross: 'THE CALL COMES FROM WHERE THE BEARING LINES CROSS. NAV: TAP THAT SPOT FOR A WAYPOINT. HELM: TAKE US THERE',
        a1_debris: 'THE DEBRIS IS THE AURORA - OUR OWN SHIP, NINE DAYS FROM NOW. FIND OUT WHAT KILLED HER BEFORE THE SALVAGER TAKES IT',
        a1_recorder: 'RECOVER OUR OWN FLIGHT RECORDER: SCIENCE EXTRACTS IT FROM THE STERN SECTION (WITHIN 2.5K, SHIELDS DOWN), THEN DEEP-SCANS IT IN THE CARGO HOLD',
        a2_go: 'THE RECORDER SAYS ARGUS TRIED TO WARN US. JUMP TO HALCYON AND FIND THE ARGUS PROBE NEAR THE RIFT (MARKED ON NAV)',
        a2_nodes: 'THE RIFT HAS INFECTED ARGUS. SCIENCE: FULL-SCAN IT TO READ ITS FOUR CORE NODES, THEN HAIL IT AND PURGE ONLY THE INFECTED ONES. CLUE: THE RIFT FREQUENCY IS IN OUR FLIGHT RECORDER. A HEALTHY NODE PURGED IS MEMORY LOST',
        a2_wait: 'STAND BY FOR FLEET COMMAND',
        a3_go: 'THE RIFT IS GROWING - ITS NEXT SURGE WILL HIT THE PLANET TARREN. GO TO THE RIFT IN HALCYON',
        a3_anchor: 'PIN THE RIFT BEFORE IT SURGES: SCIENCE WATCHES THE TACHYON FLUX METER, HELM FLIES WHERE IT RISES; AT 85%+ SCIENCE DEPLOYS A STABILISER. THREE ANCHORS',
        a3_shield: 'PROTECT THE VEGA WHILE SHE SHIELDS TARREN: FLY ALONGSIDE HER, SHIELDS UP, AND COVER HER WITH OUR SHIELD BUBBLE. RIFT DEBRIS IS INBOUND',
        a4_go: 'THE LANCE CORE - THE WEAPON THAT TORE THE RIFT - IS HIDDEN IN A CONVOY. JUMP TO VEL\'ANAR AND FIND THE CONVOY AT THE LANTERN',
        a4_find: 'ONE CONVOY SHIP CARRIES THE CORE. COMMS: HAIL EACH FOR ITS MANIFEST. SCIENCE: FULL-SCAN EACH. THE CORE LEAKS CHRONITONS - FIND THE SHIP WHOSE SCAN DOESN\'T MATCH ITS STORY, THEN ACCUSE IT',
        a4_chase: 'THE MERCY IS RUNNING WITH THE CORE - DISABLE HER (HULL UNDER 40%) BEFORE SHE REACHES WARP',
        a5_go: 'TERUK MEANS TO FIRE THE LANCE AGAIN. RETURN TO THE RIFT IN HALCYON',
        a5_hold: 'HOLD THE RIFT - STAY WITHIN 14K OF IT WHILE THE ORRAN HARDLINERS ATTACK',
      }[k];
      if (obj) this.setObjective(`CH${c.ch}: ${obj}`);
      this.argusEnter(k);
    },
    argusSay(who, text, col = 3, from) {
      this.say(from !== undefined ? from : this.dlg ? this.dlg.from : FROM_COMMAND, col, text);
      const m = this.msgs[0], ch = CHARS[who];
      m.who = who;
      if (ch && ch.civ >= 3) m.lang = ch.civ;
    },
    argusRecording() {
      this.argusSay('future', 'THIS IS THE AURORA... ANY SHIP... HULL BREACH ON EVERY DECK... THE RIFT... WE SHOULD HAVE LISTENED TO ARGUS... DON\'T LET US... [SIGNAL ENDS]', 2, FROM_COMMAND);
    },
    argusEnter(k) {
      const c = this.camp;
      if (k === 'a1_tri' && this.sysDef.id === 'kalos') this.argusBuoys();
      if (k === 'a2_nodes' && c.argusId !== undefined) this.npc[c.argusId].talk = 'a_purge';
      if (k === 'a2_wait') this.after(6, () => this.startDialog('a_voss2', FROM_COMMAND));
      if (k === 'a3_go' && this.sysDef.id === 'halcyon') { this.argusAnchors(); this.argusStep('a3_anchor'); return; }
      if (k === 'a3_anchor') { c.surge = 420; this.after(150, () => { if (c.ch === 3 && !c.heskId) this.argusHesk(); }); }
      if (k === 'a4_find') this.clearMarkers();
    },
    // ---- chapter 1: three survey buoys and their bearing lines
    argusBuoys() {
      const c = this.camp;
      c.buoyIds = [];
      for (const [nm, x, y] of BUOYS) {
        const id = this.spawnAt(CT_BUOY, F_FRIEND, x, y, 0);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { name: `SURVEY BUOY ${nm}`, short: `BUOY ${nm}`, scan: 1, buoy: nm });
        c.buoyIds.push(id);
        this.M.mk.push({ x, y, kind: MK_POINT, r: 0 });
      }
      this.M.ver++;
    },
    argusOnScan(id) {
      const c = this.camp, n = this.npc[id], P = this.P;
      if (!n || n.scan < 2) return;
      if (n.buoy && c.step.startsWith('a1_')) {
        if (distTo(P.x, P.y, n.x, n.y) > 3500) { n.scan = 1; this.say(FROM_CREW, 1, `TOO FAR FROM ${n.short} FOR AN ACCURATE FIX - GET WITHIN 3K AND SCAN IT AGAIN.`); return; }
        if (c.fixes[n.buoy] !== undefined) return;
        const b = Math.round(bearingTo(n.x, n.y, SIGNAL[0], SIGNAL[1]));
        c.fixes[n.buoy] = b;
        c.lines.push({ x: Math.round(n.x), y: Math.round(n.y), b, l: n.buoy });
        const k = Object.keys(c.fixes).length;
        this.say(FROM_CREW, 3, `FIX FROM ${n.short}: THE SIGNAL BEARS ${String(b).padStart(3, '0')}. THE LINE IS ON THE NAV MAP.${k === 1 ? ' ONE LINE ISN\'T ENOUGH - WE NEED ANOTHER FIX.' : k === 2 ? ' TWO LINES: THE SOURCE IS WHERE THEY CROSS.' : ' THREE LINES - THEY ALL MEET IN ONE SPOT.'}`);
        if (k >= 2 && c.step === 'a1_tri') this.argusStep('a1_cross');
        return;
      }
      if (c.argusId !== undefined && id === c.argusId && c.step === 'a2_nodes' && !c.nodesSeen) {
        c.nodesSeen = true;
        this.say(FROM_CREW, 0, 'ARGUS HAS FOUR CORE NODES. RESONANCE - NODE A: 3.15 THZ, NODE B: 14.62 THZ, NODE C: 7.31 THZ, NODE D: 5.88 THZ. HAIL ARGUS TO PURGE NODES.');
      }
      if (n.convoy !== undefined && !n.noted) { n.noted = true; this.say(FROM_CREW, 0, `${n.short}: ${CONVOY[n.convoy].scan}`); }
    },
    // ---- chapter 2
    argusPurge() {
      const c = this.camp, sel = c.purge;
      const cleaned = INFECTED.every((x) => sel.includes(x)), lostMem = sel.some((x) => !INFECTED.includes(x));
      c.f.argcore = cleaned ? 'clean' : 'infected';
      c.f.mem = lostMem ? 'lost' : 'kept';
      this.npc[c.argusId].talk = null;
      if (cleaned && !lostMem) this.argusSay('argus', 'THE SINGING HAS STOPPED. I CAN... THINK. ALL OF ME IS STILL HERE. THANK YOU, AURORA.');
      else if (cleaned) this.argusSay('argus', 'IT IS QUIET. BUT... THERE ARE HOLES. I DO NOT REMEMBER THE SURVEY. OR WHY I CAME HERE. YOU SAY MY NAME IS ARGUS?');
      else if (lostMem) this.argusSay('argus', 'IT IS... QUIETER. SOME OF ME IS MISSING. BUT IT IS QUIETER.');
      else this.argusSay('argus', 'IT IS QUIETER NOW. THANK YOU. I THINK.');
      this.argusStep('a2_wait');
    },
    // ---- chapter 3: the anchors, the surge, Tarren
    argusAnchors() {
      const c = this.camp;
      c.anchors = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + this.frand() * 1.2, r = 12000 + this.frand() * 10000;
        c.anchors.push({ x: RIFT[0] + Math.cos(a) * r, y: RIFT[1] + Math.sin(a) * r, done: false });
      }
    },
    campFlux() { // 0..100 toward the nearest anchor still to stabilise, or -1
      const c = this.camp;
      if (!c || c.id !== 'argus' || c.step !== 'a3_anchor' || !c.anchors) return -1;
      let best = 1e12;
      for (const an of c.anchors) if (!an.done) best = Math.min(best, distTo(this.P.x, this.P.y, an.x, an.y));
      return best >= 1e12 ? -1 : Math.round(100 * Math.exp(-best / 15000));
    },
    campAction(a) {
      const c = this.camp;
      if (!c || c.id !== 'argus') return;
      if (a === 1 && c.step === 'a3_anchor') { // deploy a stabiliser at the nearest anchor
        const f = this.campFlux();
        if (f < 85) { this.denied(`FLUX ONLY ${f}% - WE NEED 85% OR MORE TO LOCK A STABILISER ONTO AN ANCHOR.`); return; }
        let best = null, bd = 1e12;
        for (const an of c.anchors) if (!an.done) { const d = distTo(this.P.x, this.P.y, an.x, an.y); if (d < bd) { bd = d; best = an; } }
        best.done = true; c.stab++;
        const id = this.spawnAt(CT_BUOY, F_FRIEND, best.x, best.y, 0);
        if (id !== NO_ID) Object.assign(this.npc[id], { name: `STABILISER ${c.stab}`, short: `STABILISER ${c.stab}`, scan: 2 });
        this.say(FROM_CREW, 3, `STABILISER ${c.stab} LOCKED ONTO A RIFT ANCHOR.${c.stab < 3 ? ` ${3 - c.stab} TO GO.` : ' ALL THREE ANCHORS ARE PINNED.'}`);
        if (c.stab >= 3) this.argusSurge();
      }
    },
    argusHesk(silent = false) {
      const c = this.camp, P = this.P;
      const [x, y] = this.pointNear(P.x, P.y, 7000);
      const id = this.spawnAt(CT_DESTROYER, F_NEUTRAL, x, y, bearingTo(x, y, P.x, P.y));
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_ORRAN, name: 'ORRAN SCIENCE VESSEL TALAN', short: 'TALAN' });
      this.boomAt(x, y, 2);
      c.heskId = id;
      if (silent) this.argusSay('hesk', 'THE DOMINION OFFERS TO TAKE THE PRIMITIVES OFF THEIR WORLD, OUTSIDER. ALL OF THEM. AS WARDS OF ORR.', 3, id);
      else if (!this.dlg) this.startDialog('a_hesk', id);
    },
    argusSurge() {
      const c = this.camp;
      if (c.surgeAsked) return;
      c.surgeAsked = true;
      if (!c.heskId) this.argusHesk(true);
      this.after(4, () => this.startDialog('a_tarren', FROM_COMMAND));
    },
    argusTarren(kind) {
      const c = this.camp;
      c.f.tarren = kind;
      if (kind === 'orran') {
        this.repAdd(CIV_ORRAN, 20); this.repAdd(CIV_FLEET, -10);
        this.argusSay('hesk', 'THE DOMINION THANKS YOU, OUTSIDER. EVERY ONE OF THEM WILL LIVE - UNDER ORR.', 3, c.heskId !== undefined ? c.heskId : FROM_COMMAND);
        this.argusChapterEnd(3);
      } else if (kind === 'law') {
        this.repAdd(CIV_FLEET, 10); this.repAdd(CIV_ORRAN, -5);
        this.after(4, () => {
          this.say(FROM_CREW, 2, c.stab >= 3 ? 'THE SURGE HAS STRUCK TARREN\'S NORTHERN COAST. SENSORS READ... HUNDREDS OF LIFE SIGNS GONE. THE REST WILL NEVER KNOW WHY.' : 'THE SURGE HAS STRUCK TARREN. SENSORS READ THOUSANDS OF LIFE SIGNS GONE.');
          this.argusChapterEnd(3);
        });
      } else {
        // the Fleet science ship VEGA can throw a deflector over Tarren from low orbit - but the surge debris will tear her apart
        const sys = sysAt(SYS_INDEX.halcyon), ti = sys.planets.findIndex((p) => p.name === 'TARREN'), pl = sys.planets[ti];
        const [tx, ty] = planetPos(sys, ti, this.now / 1000);
        c.vegaA = Math.atan2(RIFT[1] - ty, RIFT[0] - tx); c.vegaR = pl.r * 2.2; c.tarrenI = ti;
        const vx = tx + Math.cos(c.vegaA) * c.vegaR, vy = ty + Math.sin(c.vegaA) * c.vegaR;
        const id = this.spawnAt(K.CT_FREIGHTER, F_FRIEND, vx, vy, 0);
        if (id !== NO_ID) { Object.assign(this.npc[id], { ai: AI_STATIC, scan: 2, civ: CIV_FLEET, name: 'FLEET SCIENCE SHIP VEGA', short: 'VEGA', hull: 100, shields: 0, shMax: 0, armor: 1 }); c.vegaId = id; }
        c.surgeT = c.stab >= 3 ? 60 : 80; c.debrisT = 8; c.covered = 0;
        this.M.mk.push({ x: vx, y: vy, kind: MK_POINT, r: 0 }); this.M.ver++;
        this.argusSay('voss', 'THE VEGA IS IN TARREN ORBIT. HER DEFLECTOR CAN SCREEN THE WHOLE PLANET - BUT SHE HAS NO SHIELDS LEFT FOR HERSELF. AURORA: FLY ALONGSIDE AND PUT YOUR SHIELD BUBBLE AROUND HER. ENGINEERING, EVERYTHING YOU CAN SPARE INTO SHIELDS - MORE POWER MEANS A BIGGER BUBBLE.', 2, FROM_COMMAND);
        this.argusStep('a3_shield');
      }
    },
    argusChapterEnd(ch) { this.after(5, () => { if (this.camp && this.camp.ch === ch) this.argusChapter(ch + 1); }); },
    // ---- chapter 4
    argusConvoy() {
      const c = this.camp, st = this.npc[0];
      c.convoyIds = [];
      CONVOY.forEach((cv, i) => {
        const x = st.x - 9000 + i * 4500, y = st.y - 7000 + (i % 2) * 2000;
        const id = this.spawnAt(CT_FREIGHTER, F_NEUTRAL, x, y, 90);
        if (id === NO_ID) return;
        Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: cv.civ, name: cv.name, short: cv.name.split(' ').slice(-1)[0], talk: `a_conv${i}`, talkCtx: {}, convoy: i, note: cv.scan });
        if (cv.key === 'nava') this.npc[id].short = 'SERENE DAWN';
        c.convoyIds.push(id);
      });
      this.M.mk.push({ x: Math.round(st.x - 2000), y: Math.round(st.y - 6000), kind: MK_AREA, r: 11000 }); this.M.ver++;
    },
    argusAccuse(i) {
      const c = this.camp, cv = CONVOY[i], id = c.convoyIds[i];
      const guilty = CONVOY.findIndex((q) => q.guilty), gid = c.convoyIds[guilty];
      if (cv.guilty) {
        if (!c.f.wrong) c.f.convoy = 'right';
        this.argusSay('ark', 'CLEVER, FLEET. TOO CLEVER. BUT TOO LATE.', 2, id);
      } else {
        c.f.convoy = 'wrong'; c.f.wrong = cv.key;
        if (cv.civ === CIV_VELORI) this.repAdd(CIV_VELORI, -15); else this.repAdd(CIV_COLONY, -10);
        this.argusSay(cv.who, cv.key === 'nava' ? 'YOU WOULD STOP A SHIP OF PILGRIMS AND A NEWBORN CHILD? SEARCH US, THEN. YOU WILL FIND ONLY PRAYERS.' : 'WHAT? SEARCH US, THEN - YOU\'LL FIND EXACTLY WHAT I TOLD YOU. AND I WILL REMEMBER THIS, FLEET.', 1, id);
        this.say(FROM_CREW, 2, 'WHILE WE WERE BUSY - THE MERCY HAS BROKEN FORMATION AND IS RUNNING FOR OPEN SPACE!');
      }
      // the Mercy runs either way
      const n = this.npc[gid];
      Object.assign(n, { ai: AI_TRAVEL, faction: F_HOSTILE, talk: null, cruise: 130, leaveAtDest: false, shMax: 120, shields: 120, eng: 100 });
      [n.destX, n.destY] = [clampf(n.x - 50000, 5000, 155000), clampf(n.y - 50000, 5000, 155000)];
      for (const cid of c.convoyIds) if (cid !== gid) this.npc[cid].talk = null;
      this.argusStep('a4_chase');
    },
    // ---- chapter 5
    argusBattle() {
      const c = this.camp;
      if (c.battle) return;
      c.battle = true;
      c.holdT = 80; c.nextWave = 0;
      this.argusStep('a5_hold');
    },
    argusWave() {
      const c = this.camp, n = 2 + (this.M.diff % 3);
      const [x, y] = this.pointNear(RIFT[0], RIFT[1], 10000);
      for (let i = 0; i < n; i++) {
        const id = this.spawnFoe(i === 0 ? CT_DESTROYER : CT_RAIDER, this.clampSec(x + i * 1300), this.clampSec(y + (i % 2) * 1100), US, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: CIV_ORRAN, name: `HARDLINER ${i + 1}`, short: `HARDLINER ${i + 1}` });
        if (!c.terukId) { c.terukId = id; Object.assign(this.npc[id], { name: 'TERUK\'S FLAGSHIP', short: 'TERUK', shMax: 220, shields: 220 }); }
      }
    },
    argusAllies() {
      const c = this.camp, f = c.f, P = this.P;
      c.allies = new Set();
      const call = (who, n, type, civ, name, line, grudging) => this.callAlly(who, { ships: n, type, civ, name, line, grudging });
      call('vey', 3, CT_RAIDER, CIV_KESSARI, 'VEY\'S SALVAGER', 'YOU SHARED YOUR OWN WRECK WITH US, FLEET. VEY HAS COME TO SHARE A FIGHT.', 'YOU LET VEY KEEP THE SCRAP. VEY GIVES YOU ONE FIGHT FOR IT.');
      if (f.argus === 'ally' || f.argus === 'free') {
        const id = call('argus', 1, CT_DESTROYER, CIV_FLEET, 'ARGUS', f.argus === 'free' ? 'I SAID I WOULD REMEMBER. I REMEMBERED.' : 'I AM WITH YOU, CAPTAIN.');
        c.argusHere = id !== NO_ID;
        c.argusAllyId = id;
        if (f.argcore === 'infected' && id !== NO_ID) this.after(25, () => this.argusTurns());
      }
      call('hale', 3, CT_DESTROYER, CIV_FLEET, 'FLEET CRUISER', 'FLEET SQUADRON ON STATION, AURORA. ADMIRAL VOSS SENDS HER REGARDS - AND HER CRUISERS.', 'ONE CRUISER IS ALL FLEET CAN SPARE, AURORA. MAKE IT COUNT.');
      call('hesk', 2, CT_DESTROYER, CIV_ORRAN, 'TALAN', 'NOT ALL OF ORR FOLLOWS TERUK, OUTSIDER. THE TALAN STANDS WITH YOU.', 'THE TALAN WILL FIGHT BESIDE YOU - FOR A LITTLE WHILE, OUTSIDER.');
      call('ishara', 2, CT_FREIGHTER, CIV_VELORI, 'ISHARA', 'YOU DID NOT ACCUSE THE INNOCENT, FLEET. THE GUILD REMEMBERS FAIRNESS.');
    },
    argusBond(who) { // how this campaign's choices translate into each ally's bond (allies.js)
      const f = this.camp.f;
      switch (who) {
        case 'vey': return f.vey === 'friend+' ? 3 : f.vey === 'friend' ? 1 : 0;              // shared the salvage = grudging; gave spares too = devoted
        case 'argus': return f.argus === 'free' ? 4 : f.argus === 'ally' ? 2 : 0;
        case 'hale': return f.argus === 'fleet' ? 3 : this.rep[CIV_FLEET] >= 60 ? 1 : 0;
        case 'hesk': return f.tarren === 'orran' ? 2 : this.rep[CIV_ORRAN] >= 30 ? 1 : 0;
        case 'ishara': return f.convoy === 'right' ? (f.isharaGift ? 3 : 1) : 0;
      }
      return 0;
    },
    argusTurns() { // the rift's echo was never purged from ARGUS
      const c = this.camp, n = this.npc[c.argusAllyId];
      if (!n || !n.active || !n.alive || this.game !== GS_RUN) return;
      n.ai = AI_ATTACK; n.aiTarget = US; n.faction = F_HOSTILE; n.aiT = 0;
      c.argusHere = false; c.allies.delete('argus'); c.f.betrayed = true;
      this.argusSay('argus', 'THE {SONG}... IT IS LOUDER HERE. IT WANTS THE {CORE}. I... CANNOT... STOP IT. FORGIVE ME, AURORA.', 2, c.argusAllyId);
    },
    argusEnding(kind) {
      const c = this.camp, f = c.f;
      const tarren = { orran: 'THE TARRENI LIVE ON, AS WARDS OF ORR - A WHOLE WORLD THAT WILL GROW UP KNOWING OTHER PEOPLES RULE THE SKY.',
        law: 'TARREN\'S NORTHERN COAST IS SILENT. ITS PEOPLE WILL TELL STORIES ABOUT THE YEAR THE SKY TORE OPEN - AND NEVER KNOW HOW CLOSE HELP WAS.',
        shield: 'ON TARREN THEY SPEAK OF A NEW STAR THAT ROSE ON THE NIGHT OF THE STORM AND HELD BACK THE SKY. NOBODY KNOWS IT HAD A NAME.' }[f.tarren] || '';
      const T = {
        dreamer: ['THE DREAMER', 'ARGUS TAKES THE CORE INTO THE RIFT. ITS LAST TRANSMISSION IS A STAR MAP OF NINE HUNDRED STARS, EACH ONE NAMED. THE RIFT CLOSES BEHIND IT LIKE A HELD BREATH LET GO.'],
        loop: ['CAUSE AND EFFECT', 'THE AURORA FLIES INTO THE RIFT WITH THE CORE. THE HULL SCREAMS - AND THEN, SILENCE. YOU ARE IN KALOS. THE STAR CHART SAYS IT IS NINE DAYS AGO. YOUR COMMS OFFICER, VERY QUIETLY, OPENS A CHANNEL TO STARBASE 12... THE SIGNAL WAS ALWAYS YOURS.'],
        long: ['THE LONG SHOT', 'THE TORPEDO CARRIES THE CORE IN. FOR A MOMENT NOTHING HAPPENS - THEN THE RIFT FOLDS IN ON ITSELF AND IS GONE. NO HEROICS. JUST A GOOD SHOT, AND A CREW THAT GETS TO GO HOME.'],
        scar: ['THE SCAR', 'WITHOUT THE CORE, THE RIFT CANNOT BE CLOSED. THE FLEET BUILDS A STATION BESIDE IT TO WATCH IT FOREVER. TERUK ESCAPED WITH HIS WEAPON. SOMEWHERE, NINE DAYS FROM NOW, A SHIP NAMED AURORA IS STILL IN DANGER.'],
      }[kind];
      c.ending = { kind, title: T[0], text: T[1] + ' ' + tarren + (f.betrayed ? ' ARGUS WAS LOST TO THE RIFT\'S ECHO - THE NODE YOU DIDN\'T PURGE.' : ''), allies: [...(c.allies || [])].filter((w) => CHARS[w]).map((w) => CHARS[w].name) };
      this.campSaveOf('argus').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    // ---- arrivals
    argusArrive(to) {
      const c = this.camp, sid = this.sysDef.id;
      if (sid !== 'kalos') c.lines = [];
      if (sid === 'kalos' && c.step.startsWith('a1_') && !c.buoyIds) this.argusBuoys();
      if (sid === 'halcyon') {
        for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === CT_STARBASE) this.npc[i].talk = 'a_marrin';
        const rid = this.spawnAt(CT_ANOMALY, F_NEUTRAL, RIFT[0], RIFT[1], 0);
        if (rid !== NO_ID) { Object.assign(this.npc[rid], { name: 'THE RIFT', short: 'THE RIFT', scan: 2 }); c.riftId = rid; }
        if (c.step === 'a2_go') {
          const id = this.spawnAt(CT_BUOY, F_FRIEND, RIFT[0] + 9000, RIFT[1] + 6000, 0);
          if (id !== NO_ID) { Object.assign(this.npc[id], { name: 'ARGUS', short: 'ARGUS', scan: 1, ai: AI_DRIFT, speed: 4, talk: null, talkCtx: {}, note: 'FOUR CORE NODES. RESONANCE: A 3.15 THZ, B 14.62 THZ, C 7.31 THZ, D 5.88 THZ.' }); c.argusId = id; }
          this.M.mk.push({ x: RIFT[0] + 9000, y: RIFT[1] + 6000, kind: MK_POINT, r: 0 }); this.M.ver++;
        }
        if (c.step === 'a3_go') { this.argusAnchors(); this.argusStep('a3_anchor'); }
        if (c.step === 'a5_go') this.M.mk.push({ x: RIFT[0], y: RIFT[1], kind: MK_AREA, r: 12000 }), this.M.ver++;
      }
      if (sid === 'velanar' && c.step === 'a4_go') { this.greeted.add(0); this.argusConvoy(); this.argusStep('a4_find'); }
    },
    argusTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      const near = (id, r) => id !== undefined && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      switch (c.step) {
        case 'a1_cross':
          if (sid === 'kalos' && distTo(P.x, P.y, SIGNAL[0], SIGNAL[1]) < 3500) this.argusDebris();
          break;
        case 'a1_debris':
          if (near(c.veyId, 9000) && !this.dlg && !c.veySpoke) { c.veySpoke = true; this.startDialog('a_vey1', c.veyId); }
          break;
        case 'a1_recorder': {
          const h = P.arts.find((q) => G.ART[q.a].id === 'recorder');
          if (h && h.ident >= 2 && !this.dlg) {
            this.argusSay('voss', 'ARGUS... AURORA, THE FLEET LOST CONTACT WITH ARGUS, OUR EXPERIMENTAL SURVEY INTELLIGENCE, A MONTH AGO - IN HALCYON. IF YOUR FUTURE SELF SAYS IT TRIED TO WARN YOU, GO AND FIND IT.', 3, FROM_COMMAND);
            this.argusChapter(2);
          }
          break;
        }
        case 'a2_go':
          if (sid === 'halcyon' && near(c.argusId, 10000) && !this.dlg && !c.argusSpoke) { c.argusSpoke = true; this.startDialog('a_argus1', c.argusId); }
          break;
        case 'a3_anchor': {
          c.surge -= dt;
          const left = Math.max(0, Math.ceil(c.surge));
          if (sid === 'halcyon') this.setObjective(`CH3: PIN THE RIFT BEFORE IT SURGES INTO TARREN - ANCHORS ${c.stab}/3. SCIENCE WATCHES THE TACHYON FLUX, HELM FLIES WHERE IT RISES, DEPLOY A STABILISER AT 85%+. SURGE IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
          if (c.surge <= 0) this.argusSurge();
          break;
        }
        case 'a3_shield': {
          const v = c.vegaId !== undefined ? this.npc[c.vegaId] : null;
          const sys = sysAt(SYS_INDEX.halcyon), [tx, ty] = planetPos(sys, c.tarrenI, this.now / 1000);
          if (v && v.alive) { // the VEGA holds station over Tarren, facing the rift
            v.x = tx + Math.cos(c.vegaA) * c.vegaR; v.y = ty + Math.sin(c.vegaA) * c.vegaR; v.hdg = bearingTo(v.x, v.y, RIFT[0], RIFT[1]); v.speed = 0;
          }
          if (!v || !v.alive) {
            c.f.tarren = 'law'; c.step = 'a3_done';
            this.say(FROM_CREW, 2, 'THE VEGA IS GONE - AND HER DEFLECTOR WITH HER. THE SURGE TOOK TARREN\'S NORTHERN COAST.');
            this.repAdd(CIV_FLEET, -5); this.argusChapterEnd(3); break;
          }
          c.surgeT -= dt; c.debrisT -= dt;
          const cov = sid === 'halcyon' && this.sheltered(v);
          if (cov) c.covered += dt;
          if (c.debrisT <= 0 && sid === 'halcyon') { // a chunk of rift debris, flung at the VEGA
            c.debrisT = (c.stab >= 3 ? 3.4 : 2.4) + this.frand() * 1.2;
            const a = Math.atan2(RIFT[1] - v.y, RIFT[0] - v.x) + (this.frand() - 0.5) * 1.1, d = 9000;
            const sx = v.x + Math.cos(a) * d, sy = v.y + Math.sin(a) * d;
            this.launchTorp(K.HAZARD, K.T_PHOTON, sx, sy, bearingTo(sx, sy, v.x, v.y), c.vegaId, 14 + this.frand() * 8, K.SUB_HULL);
          }
          const tag = cov ? 'COVERED' : flash4(this.now) ? 'EXPOSED!' : 'NOT COVERED';
          this.setObjective(`CH3: COVER THE VEGA WITH OUR SHIELD BUBBLE - ${tag}  VEGA HULL ${Math.max(0, Math.round(v.hull))}%  SURGE ENDS IN ${Math.max(0, Math.ceil(c.surgeT))}s`);
          if (c.surgeT <= 0) {
            c.f.tarren = 'shield'; c.step = 'a3_done';
            this.repAdd(CIV_FLEET, 8);
            this.argusSay('voss', 'THE SURGE IS PAST - AND TARREN IS WHOLE. ON THE GROUND THEY SAW A NEW STAR BURN FOR A MINUTE, THEN GO OUT. THEY\'LL NEVER KNOW. WELL DONE, BOTH OF YOU.', 3, FROM_COMMAND);
            this.argusChapterEnd(3);
          }
          break;
        }
        case 'a4_chase': {
          const gid = c.convoyIds[CONVOY.findIndex((q) => q.guilty)], n = this.npc[gid];
          if (!n.active || !n.alive) { this.say(FROM_CREW, 2, 'THE MERCY IS GONE - AND THE CORE WITH HER.'); this.argusCoreLost(); break; }
          if (n.hull < 40 && n.ai !== AI_SURRENDER) {
            n.ai = AI_SURRENDER; n.faction = F_NEUTRAL; n.speed = 0;
            this.argusSay('ark', 'ENOUGH! WE SURRENDER. TAKE YOUR CURSED CYLINDER.', 2, gid);
            this.addArt('lancecore', 1); c.f.lance = 'have';
            this.say(FROM_CREW, 3, 'TRANSPORTER ROOM REPORTS THE LANCE CORE IS ABOARD. CHRONITON LEVELS ARE... IMPRESSIVE.');
            this.argusChapterEnd(4); c.step = 'a4_done';
          } else if (distTo(n.x, n.y, n.destX, n.destY) < 4000 || distTo(P.x, P.y, n.x, n.y) > 30000) {
            n.active = false; this.boomAt(n.x, n.y, 2);
            this.say(FROM_CREW, 2, 'THE MERCY HAS JUMPED AWAY. THE CORE IS GONE - TERUK WILL HAVE IT.');
            this.argusCoreLost();
          }
          break;
        }
        case 'a5_go':
          if (sid === 'halcyon' && distTo(P.x, P.y, RIFT[0], RIFT[1]) < 25000 && !this.dlg && !c.terukSpoke) {
            c.terukSpoke = true;
            const [x, y] = this.pointNear(RIFT[0], RIFT[1], 9000);
            const id = this.spawnAt(CT_DESTROYER, F_HOSTILE, x, y, bearingTo(x, y, P.x, P.y));
            if (id !== NO_ID) { Object.assign(this.npc[id], { ai: AI_STATIC, aiTarget: US, scan: 1, civ: CIV_ORRAN, name: 'TERUK\'S FLAGSHIP', short: 'TERUK', shMax: 220, shields: 220 }); c.terukId = id; this.boomAt(x, y, 2); }
            this.startDialog('a_teruk', id);
          }
          break;
        case 'a5_hold': {
          if (c.terukId !== undefined && this.npc[c.terukId].ai === AI_STATIC) this.npcAttack([c.terukId]);
          if (c.t > 12 && !c.allyCalled) { c.allyCalled = true; this.argusAllies(); }
          if (c.t > c.nextWave) { c.nextWave += 28; this.argusWave(); }
          const d = distTo(P.x, P.y, RIFT[0], RIFT[1]);
          if (d > 14000) c.t -= dt; // the clock only runs while we hold the rift
          const left = Math.ceil(c.holdT - c.t);
          this.setObjective(`CH5: HOLD THE RIFT - ${Math.max(0, left)}s${d > 14000 ? ' (GET BACK WITHIN 14K OF THE RIFT!)' : ''}`);
          if (left <= 0 && !this.dlg) {
            for (let i = 0; i < MAX_CONTACTS; i++) if (this.hostileAlive(i) && this.npc[i].type !== CT_STARBASE) this.npcLeave([i]);
            this.say(FROM_CREW, 3, 'TERUK\'S SHIPS ARE BREAKING OFF! THE WAY TO THE RIFT IS CLEAR.');
            c.step = 'a5_choice';
            this.after(3, () => this.startDialog('a_final', c.argusHere && c.argusAllyId !== undefined ? c.argusAllyId : FROM_COMPUTER, { who: c.argusHere ? 'argus' : 'computer' }));
          }
          break;
        }
      }
    },
    argusCoreLost() {
      const c = this.camp;
      c.f.lance = 'lost';
      this.argusChapterEnd(4); c.step = 'a4_done';
    },
    argusDebris() {
      const c = this.camp;
      c.step = 'a1_debris_spawned';
      c.lines = []; // the bearing lines did their job
      this.clearMarkers();
      const [sx, sy] = SIGNAL;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7, r = 1200 + i * 700;
        const id = this.spawnAt(CT_POI, F_NEUTRAL, sx + Math.cos(a) * r, sy + Math.sin(a) * r, this.irand(360));
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { poi: G.PK_WRECK, kind: G.PK_WRECK, civ: i, hull: 100, armor: 0, haz: 0.1, art: i === 0 ? G.ART_INDEX.recorder : -1, poiKey: 'deb' + i, short: i === 0 ? 'AURORA STERN SECTION' : `AURORA DEBRIS ${i}`, name: i === 0 ? 'AURORA STERN SECTION' : `AURORA DEBRIS ${i}`, scan: 1 });
        this.npc[id].res = [1, 0, 0, 1, 3, 0];
        if (i === 0) c.recId = id;
      }
      const [vx, vy] = this.pointNear(sx, sy, 4500);
      const vid = this.spawnAt(CT_RAIDER, F_NEUTRAL, vx, vy, bearingTo(vx, vy, sx, sy));
      if (vid !== NO_ID) { Object.assign(this.npc[vid], { ai: AI_STATIC, scan: 1, civ: CIV_KESSARI, name: 'SALVAGER GUTTERHAWK', short: 'GUTTERHAWK' }); c.veyId = vid; }
      this.say(FROM_CREW, 2, 'CAPTAIN... SENSORS SHOW DEBRIS. FLEET ALLOY. THE HULL MARKINGS ARE OURS. IT\'S THE AURORA - OR WHAT\'S LEFT OF HER.');
      this.argusStep('a1_debris');
    },
  });
}
