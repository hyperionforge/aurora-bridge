// ============================================================================
// campaign.js - "ECHOES OF THE CHORUS", a five-chapter story.
//   1 DEAD AIR             - a mining colony goes silent; the first shard; a Kessari captain's life
//   2 THE LANTERN'S PRICE  - a smuggler, refugees, and an Orran hunter
//   3 THE SHROUD           - a lost ship, a harmonic lock, Marek Draal
//   4 BLOOD AND HONOUR     - the Orran truth; Draal's last throw
//   5 THE SILENT CHOIR     - free it, seal it, or take it - and who comes to help
// Choices are kept in camp.f and decide who returns in the finale and how it ends.
// The campaign runs as a state machine of steps (camp.step) driven by campTick.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { SYS_INDEX, SYS_C, CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_NONE, SK_CITADEL, SK_MONOLITH } from './galaxy.js';
import { distTo, bearingTo, clampf } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE, FROM_CREW, FROM_COMMAND, FROM_COMPUTER, GS_RUN, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_ATTACK = 4, AI_FLEE = 5, AI_SURRENDER = 6, AI_ALLY = 8;

import { ARGUS_CHAPTERS, ARGUS_DESC } from './campaign2.js';
export const CHAPTERS = ['DEAD AIR', 'THE LANTERN\'S PRICE', 'THE SHROUD', 'BLOOD AND HONOUR', 'THE SILENT CHOIR'];
export const CHAPTER_DESC = [
  'DEEP HOLLOW, A MINING COLONY IN MERIDIAN REACH, HAS GONE SILENT. ITS LAST TRANSMISSION WAS SINGING.',
  'A SECOND SHARD IS IN THE HANDS OF A SMUGGLER AT THE VELORI LANTERN - AND SO ARE TWELVE ORRAN FUGITIVES.',
  'THE LOST SHIP TALLIS LIES SOMEWHERE IN THE SHROUD, HER VAULT SEALED BY THE SONG ITSELF.',
  'THE HIDDEN LANE RUNS THROUGH ORRAN SPACE. THE DOMINION HAS KEPT ITS SECRET FOR A THOUSAND YEARS.',
  'THE SILENT CHOIR. THE MONOLITH. THE DOOR. WHAT YOU DO HERE CANNOT BE UNDONE.',
];
// every campaign the lobby offers
export const CAMPAIGNS = [
  { id: 'chorus', name: 'ECHOES OF THE CHORUS', chapters: CHAPTERS, desc: CHAPTER_DESC,
    blurb: 'A MINING COLONY GOES SILENT, AND A SONG LEADS ACROSS THE GALAXY TO A SECRET THE ORRANS HAVE KEPT FOR A THOUSAND YEARS.' },
  { id: 'argus', name: 'THE ARGUS PARADOX', chapters: ARGUS_CHAPTERS, desc: ARGUS_DESC,
    blurb: 'A DISTRESS CALL FROM THE AURORA HERSELF - SENT NINE DAYS FROM NOW. A RIFT IN TIME, A MACHINE THAT DREAMS, AND A WORLD THAT MUST NOT KNOW YOU EXIST.' },
];
const NUM_WORD = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
// defaults used when a chapter is started without having played the ones before
const DEFAULT_F = { ressh: 'freed', refugees: 'fought', silk: 'ally', korvath: 'wary', draal: 'fleet', linSaved: false };
const LOCK = [3, 2, 7];

// ---------------------------------------------------------------- cast
Object.assign(CHARS, {
  ressh: { name: 'RESSH', role: 'KESSARI RAIDER CAPTAIN', civ: CIV_KESSARI, look: 'kessari' },
  thane: { name: 'HUNT-MASTER THANE', role: 'ORRAN DOMINION', civ: CIV_ORRAN, look: 'orran' },
  vault: { name: 'HARMONIC LOCK', role: 'ISV TALLIS - CAPTAIN\'S VAULT', civ: CIV_NONE, look: 'computer' },
  teo: { name: 'CAPT. AMARA TEO (RECORDING)', role: 'ISV TALLIS', civ: CIV_FLEET, look: { skin: '#a0785a', hair: '#28140a', uniform: '#c83c28' } },
});

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.campStep(k); return null; };
Object.assign(DIALOGS, {
  // ------------------------------------------------ chapter 1
  c_voss1: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. DEEP HOLLOW - THE MINING COLONY IN MERIDIAN REACH - WENT SILENT FORTY HOURS AGO. THEIR LAST TRANSMISSION WAS... SINGING. FIND OUT WHAT HAPPENED.',
      opts: [{ t: 'ON OUR WAY, ADMIRAL', do: step('c1_go') }, { t: 'SINGING?', go: 'sing' }] },
    sing: { say: 'SEVEN NOTES, OVER AND OVER, FOR SIX HOURS. THEN NOTHING. OUR ANALYSTS CAN\'T PLACE IT. DR. MARRIN AT THE EPSILON ARRAY CAN\'T STOP LISTENING TO IT. GO.',
      opts: [{ t: 'ON OUR WAY', do: step('c1_go') }] },
  } },
  c_okafor1: { who: 'okafor', nodes: {
    start: { say: 'AURORA? THANK THE STARS. FOUR DAYS AGO WE CUT INTO A CRYSTAL SEAM AND IT STARTED... SINGING. PEOPLE WALKED INTO THE AIRLOCKS IN THEIR SLEEP. WE SHUT OFF COMMS - THE SONG WAS GETTING INTO THEM TOO. THEN THE KESSARI CAME FOR THE CRYSTAL.',
      opts: [{ t: 'WHERE IS THE SEAM?', go: 'seam' }, { t: 'ARE YOUR PEOPLE SAFE?', go: 'safe' }] },
    safe: { say: 'FOURTEEN DEAD. THE REST ARE LOCKED IN THE DEEP SHAFTS WHERE IT\'S QUIET. JUST... MAKE IT STOP.', opts: [{ t: 'WHERE IS THE SEAM?', go: 'seam' }] },
    seam: { say: 'THE ROCK SPINWARD OF US. WE\'VE MARKED IT FOR YOU. DON\'T LISTEN TO IT TOO LONG.', opts: [{ t: 'WE\'LL HANDLE IT', do: step('c1_seam') }] },
  } },
  c_ressh1: { who: 'ressh', timeout: 20, onTimeout: (s, ctx) => s.kessariAttack(ctx), nodes: {
    start: { say: 'FLEET SHIP. THAT CRYSTAL BELONGS TO MAREK DRAAL. HAND IT OVER AND NOBODY ELSE HAS TO DIE TODAY.',
      opts: [{ t: 'COME AND TAKE IT', do: (s, ctx) => { s.sayAs('ressh', 'AS YOU WISH.'); s.kessariAttack(ctx); return null; } },
        { t: 'WHY DOES DRAAL WANT IT?', go: 'why' }] },
    why: { say: 'HE SAYS IT IS A KEY. TO WHAT, HE DOES NOT SAY - AND I DO NOT ASK DRAAL TWICE. ENOUGH TALK!',
      opts: [{ t: 'THEN WE FIGHT', do: (s, ctx) => { s.kessariAttack(ctx); return null; } }] },
  } },
  c_ressh2: { who: 'ressh', nodes: {
    start: { say: 'ENOUGH! I YIELD. MY CREW IS HALF DEAD. BUT HEAR ME, FLEET: IF I GO HOME EMPTY-HANDED, DRAAL SPACES MY FAMILY. DO WHAT YOU MUST.',
      opts: [
        { t: 'YOU\'RE UNDER ARREST - FLEET CUSTODY', do: (s) => { s.camp.f.ressh = 'arrested'; s.repAdd(CIV_FLEET, 5); s.repAdd(CIV_KESSARI, -10); s.sayAs('ressh', '...THEN MY FAMILY IS DEAD. I HOPE YOUR LAWS KEEP YOU WARM.'); s.campRemove(s.camp.resshId, 10); s.campStep('c1_report'); return null; } },
        { t: 'GO HOME, RESSH. TELL DRAAL YOU FAILED', do: (s) => { s.camp.f.ressh = 'freed'; s.repAdd(CIV_KESSARI, 10); s.sayAs('ressh', 'YOU LET ME GO? ...I WILL NOT FORGET THIS, FLEET.'); s.npcLeave([s.camp.resshId]); s.campStep('c1_report'); return null; } },
        { t: 'TAKE 3 CRYSTAL - TELL DRAAL YOU FOUGHT', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 3, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 3; s.camp.f.ressh = 'friend'; s.repAdd(CIV_KESSARI, 20); s.sayAs('ressh', '...A FLEET CAPTAIN WITH A HEART. RESSH OWES YOU A LIFE. CALL, AND I WILL COME.'); s.npcLeave([s.camp.resshId]); s.campStep('c1_report'); return null; } },
      ] },
  } },
  c_marrin1: { who: 'marrin', nodes: {
    start: { say: 'LET ME SEE IT... THIS IS EXTRAORDINARY. IT\'S NOT A CRYSTAL, AURORA - IT\'S A RECORDING. THE SONG IS A CARRIER WAVE, AND ON IT IS ONE THIRD OF A JUMP VECTOR. THERE ARE TWO MORE PIECES OUT THERE.',
      opts: [{ t: 'WHERE DO WE LOOK?', go: 'where' }] },
    where: { say: 'THE VELORI HAVE BEEN BUYING SINGING CRYSTAL AT THE LANTERN. START IN VEL\'ANAR. AND AURORA - THE SONG IS GETTING STRONGER.',
      opts: [{ t: 'WE\'RE ON IT', do: (s) => { s.campChapter(2); return null; } }] },
  } },
  // ------------------------------------------------ chapter 2
  c_ysolde2: { who: 'ysolde', nodes: {
    start: { say: 'THE GUILD DOES NOT SELL WHAT SINGS, OUTWORLDER. BUT A HUMAN CALLED SILK BOUGHT SUCH A STONE FROM A KESSARI THIEF. HER SHIP, THE NIGHTJAR, LIES OFF OUR STARBOARD LAMPS.',
      opts: [{ t: 'THANK YOU, FACTOR', do: step('c2_silk') }] },
  } },
  c_silk1: { who: 'silk', nodes: {
    start: { say: 'FLEET. OF COURSE. YES, I HAVE YOUR SINGING ROCK, AND YOU CAN HAVE IT. BUT I\'VE GOT TWELVE ORRAN DISSIDENTS IN MY HOLD AND THE DOMINION WANTS THEM BACK. THEY\'RE NOT GENTLE WITH TRAITORS. KEEP THEM OFF ME.',
      opts: [{ t: 'AGREED', do: step('c2_hunter') }, { t: 'WHAT DID THEY DO?', go: 'what' }, { t: 'WE DON\'T DEAL WITH SMUGGLERS', go: 'no' }] },
    what: { say: 'THEY TOLD PEOPLE WHAT\'S BEHIND ORRA. THAT\'S ALL IT TAKES IN THE DOMINION.', opts: [{ t: 'AGREED', do: step('c2_hunter') }, { t: 'WE DON\'T DEAL WITH SMUGGLERS', go: 'no' }] },
    no: { say: 'THEN YOU DON\'T GET THE ROCK, FLEET. CALL ME WHEN YOU GROW UP.', opts: [{ t: 'FINE - WE\'LL HELP', do: step('c2_hunter') }, { t: 'CLOSE CHANNEL' }] },
  } },
  c_hunter: { who: 'thane', timeout: 30,
    onTimeout: (s) => { s.sayAs('thane', 'SILENCE. THEN WE TAKE THEM.'); s.campHunterFight(true); },
    nodes: {
      start: { say: 'OUTSIDER. THAT VESSEL CARRIES FUGITIVES OF THE DOMINION. STAND ASIDE AND WE TAKE THEM HOME FOR JUDGEMENT. INTERFERE, AND YOU JOIN THEM.',
        opts: [
          { t: 'STAND ASIDE', do: (s) => {
            const c = s.camp; c.f.refugees = 'taken'; c.f.silk = 'betrayed';
            s.repAdd(CIV_ORRAN, 20); s.repAdd(CIV_VELORI, -10);
            s.say(c.silkId, 2, 'COWARD.'); s.msgs[0].who = 'silk';
            s.sayAs('thane', 'WISE. THIS TRINKET WAS IN THEIR HOLD - TAKE IT, WITH THE DOMINION\'S THANKS.');
            s.addArt('shard2', 1); s.campRemove(c.silkId, 6); s.npcLeave(c.hunterIds);
            s.campStep('c2_done'); return null;
          } },
          { t: 'THEY ARE UNDER FLEET PROTECTION', do: (s) => { s.sayAs('thane', 'THEN YOU ARE AN ENEMY OF ORR.'); s.campHunterFight(false); return null; } },
          { t: 'NAME YOUR PRICE (4 ALLOY + 2 EXOTIC)', if: (s) => s.P.cargo[G.R_ALLOY] >= 4 && s.P.cargo[G.R_EXOTIC] >= 2, do: (s) => {
            const c = s.camp; s.P.cargo[G.R_ALLOY] -= 4; s.P.cargo[G.R_EXOTIC] -= 2; c.f.refugees = 'bought'; c.f.silk = 'ally';
            s.repAdd(CIV_ORRAN, -5); s.sayAs('thane', 'THE DOMINION IS... PRAGMATIC. KEEP YOUR TRAITORS.'); s.npcLeave(c.hunterIds);
            s.campSilkPays(); return null;
          } },
        ] },
    } },
  // ------------------------------------------------ chapter 3
  c_vault: { who: 'vault', nodes: {
    start: { say: (s) => `HARMONIC LOCK. THREE TONES REQUIRED.${s.camp.lockFails ? ' (PREVIOUS ATTEMPTS: ' + s.camp.lockFails + ')' : ''} FIRST TONE?`, opts: tones(0) },
    t2: { say: 'SECOND TONE?', opts: tones(1) },
    t3: { say: 'THIRD TONE?', opts: tones(2) },
  } },
  c_draal1: { who: 'draal', timeout: 18, onTimeout: (s, ctx) => s.kessariAttack(ctx), nodes: {
    start: { say: 'THANK YOU FOR OPENING IT, FLEET. I HAVE WANTED INTO THAT VAULT FOR NINE YEARS. NOW GIVE ME THE KEY - ALL THREE PIECES - OR I PEEL THEM OUT OF YOUR WRECK.',
      opts: [{ t: 'NEVER', do: (s, ctx) => { s.sayAs('draal', 'GOOD. I PREFER IT THIS WAY.'); s.kessariAttack(ctx); return null; } },
        { t: 'WHAT IS THE KEY FOR?', go: 'why' }] },
    why: { say: 'THE ORRANS LOCKED SOMETHING AWAY, LONG AGO. SOMETHING THAT SINGS. WHOEVER OPENS THE DOOR OWNS WHAT IS BEHIND IT. ENOUGH!',
      opts: [{ t: 'FIGHT', do: (s, ctx) => { s.kessariAttack(ctx); return null; } }] },
  } },
  // ------------------------------------------------ chapter 4
  c_korvath4: { who: 'korvath', nodes: {
    start: { say: 'YOU CARRY THE SONG INTO ORRA, OUTSIDER. THE DOMINION SEALED THAT DOOR BEFORE YOUR FLEET WAS BORN. SURRENDER THE SHARDS.',
      opts: [
        { t: 'WHY DID YOU SEAL IT?', go: 'why' },
        { t: 'WE WILL NOT SURRENDER THEM', go: 'duel' },
        { t: 'TAKE THEM. WE WANT NO PART OF THIS', go: 'give' },
      ] },
    why: { say: (s) => (s.rep[CIV_ORRAN] >= 0 || s.camp.f.refugees === 'taken'
      ? '...BECAUSE WE ARE ASHAMED. THE CHORUS WAS A PEOPLE - A LIVING CHOIR OF CRYSTAL. OUR ANCESTORS MINED THEM FOR THEIR LATTICE AND SILENCED WHAT WAS LEFT. THE SONG IS THEIR GRIEF. WE LOCKED THE DOOR SO WE WOULD NOT HAVE TO HEAR IT.'
      : 'THAT IS NOT FOR OUTSIDERS WHO SHELTER TRAITORS AND DEFY THE DOMINION. SURRENDER THE SHARDS.'),
    opts: [
      { t: 'THEN HELP US MAKE IT RIGHT', if: (s) => s.rep[CIV_ORRAN] >= 0 || s.camp.f.refugees === 'taken', do: (s) => { s.camp.f.korvath = 'ally'; s.camp.f.truth = true; s.repAdd(CIV_ORRAN, 20); s.sayAs('korvath', '...PERHAPS IT IS TIME. ORR WILL STAND WITH YOU, AURORA.'); s.campStep('c4_draal'); return null; } },
      { t: 'WE\'LL DECIDE WHEN WE GET THERE', if: (s) => s.rep[CIV_ORRAN] >= 0 || s.camp.f.refugees === 'taken', do: (s) => { s.camp.f.korvath = 'wary'; s.camp.f.truth = true; s.sayAs('korvath', 'THEN GO. AND REMEMBER WHAT I TOLD YOU.'); s.campStep('c4_draal'); return null; } },
      { t: 'WE WILL NOT SURRENDER THEM', go: 'duel' },
    ] },
    duel: { say: 'THEN PROVE YOUR RIGHT TO CARRY THEM. MY CHAMPION WAITS BEYOND THE BASTION. TO YIELD - NOT TO DEATH.',
      opts: [{ t: 'WE ACCEPT', do: (s) => { s.camp.duel = true; s.orranDuel(); s.campStep('c4_duel'); return null; } }] },
    give: { say: 'A WISE CHOICE, AND A COWARD\'S ONE. GIVE THEM TO ME.',
      opts: [{ t: 'HAND OVER THE SHARDS', do: (s) => { s.campEnding('silence'); return null; } }, { t: 'NO - WAIT', go: 'start' }] },
  } },
  c_draal2: { who: 'draal', nodes: {
    start: { say: '...ENOUGH. YOU WIN, FLEET. NOW WHAT? THE ORRANS WOULD KILL ME. YOUR FLEET WOULD BURY ME IN A CELL. AND MY OWN PEOPLE WILL TEAR ME APART FOR LOSING.',
      opts: [
        { t: 'HAND HIM TO THE ORRANS', if: (s) => s.camp.f.korvath === 'ally' || s.camp.f.korvath === 'respect', do: (s) => { s.camp.f.draal = 'orran'; s.repAdd(CIV_ORRAN, 10); s.repAdd(CIV_KESSARI, -30); s.sayAs('korvath', 'THE WARLORD WILL FACE THE HALL OF ORR.'); s.campRemove(s.camp.draalId, 8); s.campChapter(5); return null; } },
        { t: 'HE STANDS TRIAL IN FLEET COURT', do: (s) => { s.camp.f.draal = 'fleet'; s.repAdd(CIV_FLEET, 10); s.repAdd(CIV_KESSARI, -10); s.sayAs('draal', 'A CELL, THEN. WE WILL SEE HOW LONG IT HOLDS ME.'); s.campRemove(s.camp.draalId, 8); s.campChapter(5); return null; } },
        { t: 'GO HOME. THE KESSARI NEED A LEADER WHO LIVES', do: (s) => { s.camp.f.draal = 'freed'; s.repAdd(CIV_KESSARI, 25); s.sayAs('draal', '...YOU ARE A STRANGE ONE, FLEET. DRAAL REMEMBERS.'); s.npcLeave([s.camp.draalId]); s.campChapter(5); return null; } },
      ] },
  } },
  // ------------------------------------------------ chapter 5
  c_voss5: { who: 'voss', nodes: {
    start: { say: 'AURORA, FLEET COMMAND HAS READ MARRIN\'S REPORTS. THAT MONOLITH BROADCASTS A SIGNAL THAT REACHES MINDS ACROSS LIGHT-YEARS. THAT IS A WEAPON, CAPTAIN. YOUR ORDERS ARE TO SECURE IT FOR FLEET RESEARCH. DO NOT RELEASE IT.',
      opts: [
        { t: 'UNDERSTOOD, ADMIRAL', do: step('c5_monolith') },
        { t: 'WITH RESPECT - IT\'S A PEOPLE, NOT A WEAPON', do: (s) => { s.camp.f.defied = true; s.sayAs('voss', '...NOTED, CAPTAIN. YOUR ORDERS STAND.'); s.campStep('c5_monolith'); return null; } },
      ] },
  } },
  c_chorus5: { who: 'chorus', nodes: {
    start: { say: (s) => (s.camp.f.truth
      ? 'WE HEAR YOU, SMALL VOICE. YOU BRING OUR PIECES HOME. THE DOOR. OPEN IT, AND WE SING AGAIN. CLOSE IT, AND WE SLEEP. OR {CAGE} US, AS THE ONES BEFORE DID.'
      : 'WE {HEAR} YOU, SMALL {VOICE}. YOU BRING OUR {PIECES}. THE DOOR. {OPEN} IT, AND WE {SING}. {CLOSE} IT, AND WE {SLEEP}. OR {CAGE} US, AS THE {ONES} BEFORE.'),
    opts: [
      { t: 'WE WILL FREE YOU', do: (s) => { s.campFinale('free'); return null; } },
      { t: 'WE WILL SEAL THE DOOR FOREVER', do: (s) => { s.campFinale('seal'); return null; } },
      { t: 'THE FLEET WILL TAKE YOU FOR STUDY', do: (s) => { s.campFinale('fleet'); return null; } },
    ] },
  } },
});
function tones(i) {
  const out = [];
  for (let k = 1; k <= 7; k++) out.push({ t: `TONE ${k}`, do: (s) => s.campTone(i, k) });
  return out;
}

// ---------------------------------------------------------------- the mixin
export function installCampaign(Sim) {
  Object.assign(Sim.prototype, {
    // saved progress, one entry per campaign ({ maxCh, f, done })
    campSaveOf(id) {
      if (!this.campSave || this.campSave.maxCh !== undefined) this.campSave = { chorus: this.campSave && this.campSave.maxCh ? this.campSave : { maxCh: 1, f: {} } };
      return this.campSave[id] || (this.campSave[id] = { maxCh: 1, f: {} });
    },
    campMaxes() { return CAMPAIGNS.map((cp) => Math.max(1, Math.min(cp.chapters.length, this.campSaveOf(cp.id).maxCh || 1))); },
    startCampaign(ch) {
      if (CAMPAIGNS[this.selCamp | 0] && CAMPAIGNS[this.selCamp | 0].id === 'argus') { this.argusStart(ch); return; }
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('chorus');
      this.camp = { id: 'chorus', ch: 0, step: '', t: 0, f: { ...DEFAULT_F, ...(ch > 1 ? save.f || {} : {}) }, lockFails: 0, lock: [], bondOf: (w) => this.chorusBond(w) };
      this.camp.f.linSaved = false;
      this.greeted.add(0); // Voss speaks first
      // skipping ahead: you have what earlier chapters would have given you
      if (ch >= 2) this.addArt('shard1', 2);
      if (ch >= 3) this.addArt('shard2', 1);
      if (ch >= 4) { this.addArt('shard3', 1); for (const h of this.P.arts) h.ident = 2; this.revealed.add(SYS_INDEX.chorus); }
      if (ch >= 4 && this.camp.f.refugees === 'fought') this.repAdd(CIV_ORRAN, -20);
      this.campChapter(ch, true);
    },
    campChapter(ch, first = false) {
      const c = this.camp;
      c.ch = ch;
      c.t0 = this.now;
      const sv = this.campSaveOf('chorus');
      sv.maxCh = Math.max(sv.maxCh || 1, ch);
      sv.f = { ...c.f };
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `CHAPTER ${NUM_WORD[ch - 1]}: ${CHAPTERS[ch - 1]}`);
      if (ch === 1) this.after(first ? 2 : 1, () => this.startDialog('c_voss1', FROM_COMMAND));
      else this.campStep(['', '', 'c2_go', 'c3_go', 'c4_go', 'c5_go'][ch]);
      if (ch === 1) this.campStep('c1_brief');
    },
    campStep(k, refresh = false) {
      const c = this.camp;
      if (!refresh) { c.step = k; c.t = 0; }
      const obj = {
        c1_brief: 'LISTEN TO ADMIRAL VOSS',
        c1_go: 'JUMP TO MERIDIAN REACH (NAV > GALAXY) AND FIND OUT WHAT HAPPENED AT DEEP HOLLOW',
        c1_near: 'APPROACH DEEP HOLLOW',
        c1_seam: 'SCIENCE: SCAN THE SINGING SEAM, THEN EXTRACT IT',
        c1_raid: 'DRIVE OFF THE KESSARI',
        c1_report: 'TAKE THE SHARD TO DR. MARRIN - EPSILON ARRAY, HALCYON',
        c2_go: 'FIND THE SECOND SHARD - ASK AT THE LANTERN IN VEL\'ANAR',
        c2_silk: 'HAIL SILK\'S SHIP, THE NIGHTJAR',
        c2_hunter: 'STAY CLOSE TO THE NIGHTJAR',
        c2_fight: 'PROTECT THE NIGHTJAR FROM THE ORRAN HUNTERS',
        c2_done: 'FIND THE WRECK OF THE TALLIS IN THE SHROUD',
        c3_go: 'SEARCH THE SHROUD FOR THE WRECK OF THE ISV TALLIS',
        c3_lock: 'OPEN THE TALLIS VAULT - HAIL IT. HER ESCAPE PODS\' LOGS MAY HOLD THE TONES',
        c3_draal: 'DEFEAT MAREK DRAAL',
        c3_shards: 'SCIENCE: DEEP SCAN ALL THREE CHORUS SHARDS',
        c4_go: 'JUMP TO ORRA PRIME - THE HIDDEN LANE STARTS THERE',
        c4_duel: 'DEFEAT THE ORRAN CHAMPION (TO YIELD)',
        c4_draal: 'DRAAL IS GOING FOR THE LANE - STOP HIM',
        c5_go: 'JUMP TO THE SILENT CHOIR',
        c5_monolith: 'APPROACH THE MONOLITH AND OPEN A CHANNEL',
        c5_hold: 'DEFEND THE MONOLITH',
      }[k];
      if (obj) this.setObjective(`CH${c.ch}: ${obj}`);
      if (!refresh) this.campEnter(k);
    },
    // things that happen the moment a step starts
    campEnter(k) {
      const c = this.camp, P = this.P;
      if (k === 'c1_raid') this.after(5, () => this.campResshArrives());
      if (k === 'c1_report') this.clearMarkers();
      if (k === 'c2_hunter') this.after(12, () => this.campHunterArrives());
      if (k === 'c2_done') {
        this.clearMarkers();
        this.after(4, () => {
          if (c.f.silk === 'ally') { this.say(c.silkId < MAX_CONTACTS ? c.silkId : FROM_COMMAND, 3, 'THE LAST SHARD? THE ONLY STORY I KNOW: THE ISV TALLIS, LOST IN THE SHROUD NINE YEARS BACK. HER CAPTAIN WAS OBSESSED WITH THE SONG.'); this.msgs[0].who = 'silk'; }
          else { this.say(FROM_COMMAND, 3, 'AURORA, MARRIN. THE TALLIS - A FLEET SHIP LOST IN THE SHROUD NINE YEARS AGO - WAS CHASING THIS SAME SONG. IF THE THIRD SHARD IS ANYWHERE, IT\'S IN HER VAULT.'); this.msgs[0].who = 'marrin'; }
          this.campChapter(3);
        });
      }
      if (k === 'c3_draal') this.after(10, () => this.campDraalArrives(3));
      if (k === 'c4_draal') this.after(15, () => this.campDraalArrives(4));
      if (k === 'c3_shards') this.clearMarkers();
    },
    campTick(dt) {
      const c = this.camp, P = this.P;
      if (!c || this.game !== GS_RUN) return;
      if (c.id === 'argus') { this.argusTick(dt); return; }
      c.t += dt;
      const sys = this.sysDef.id;
      const near = (id, r) => id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      switch (c.step) {
        case 'c1_near':
          if (sys === 'meridian' && near(0, 9000) && !this.dlg) this.startDialog('c_okafor1', 0);
          break;
        case 'c1_seam':
          if (this.hasArt('shard1')) this.campStep('c1_raid');
          break;
        case 'c1_raid': {
          if (!c.resshIds) break;
          const r = this.npc[c.resshId];
          if (r.active && r.alive && r.ai !== AI_SURRENDER && r.hull < 35 && r.faction === F_HOSTILE) {
            r.ai = AI_SURRENDER; r.faction = F_NEUTRAL; r.speed = 0;
            for (const id of c.resshIds) if (id !== c.resshId) this.npcLeave([id]);
          }
          const fighting = c.resshIds.some((id) => this.hostileAlive(id));
          if (!fighting && !this.dlg) {
            if (r.active && r.alive) this.startDialog('c_ressh2', c.resshId);
            else { c.f.ressh = 'dead'; this.campStep('c1_report'); }
          }
          break;
        }
        case 'c1_report':
          if (sys === 'halcyon' && near(0, 14000) && !this.dlg) this.startDialog('c_marrin1', 0);
          break;
        case 'c2_go':
          if (sys === 'velanar' && near(0, 14000) && !this.dlg) this.startDialog('c_ysolde2', 0);
          break;
        case 'c2_fight': {
          const nj = this.npc[c.silkId];
          if (!nj.active || !nj.alive) { // the Nightjar is gone; the shard is in the wreck
            c.f.refugees = 'lost'; c.f.silk = 'dead';
            this.say(FROM_CREW, 2, 'THE NIGHTJAR IS GONE. ALL HANDS... SENSORS SHOW THE SHARD SURVIVED IN THE DEBRIS - WE\'VE BEAMED IT ABOARD.');
            this.addArt('shard2', 1); this.npcLeave(c.hunterIds); this.repAdd(CIV_ORRAN, -10);
            this.campStep('c2_done');
            break;
          }
          const hunters = c.hunterIds.filter((id) => this.npc[id].active && this.npc[id].alive && this.npc[id].faction === F_HOSTILE);
          for (const id of hunters) if (this.npc[id].hull < 30) { this.npcLeave([id]); }
          if (!hunters.some((id) => this.npc[id].hull >= 30) && !this.dlg) {
            c.f.refugees = 'saved'; c.f.silk = 'ally';
            this.say(c.hunterIds[0], 2, 'THE DOMINION WILL HEAR OF THIS, OUTSIDER.'); this.msgs[0].who = 'thane';
            this.repAdd(CIV_ORRAN, -25);
            this.campSilkPays();
          }
          break;
        }
        case 'c3_go':
          if (sys === 'shroud' && c.tallisId !== undefined && near(c.tallisId, 12000)) this.campStep('c3_lock');
          break;
        case 'c3_draal':
        case 'c4_draal': {
          if (!c.draalIds) break;
          const d = this.npc[c.draalId];
          const allyIn = c.allyCalled;
          if (!allyIn && c.t > 22) { c.allyCalled = true; this.campAllies(c.step === 'c3_draal' ? ['ressh'] : ['ressh', 'korvath']); }
          if (d.active && d.alive && d.faction === F_HOSTILE && d.hull < (c.step === 'c3_draal' ? 45 : 28)) {
            if (c.step === 'c3_draal') {
              this.say(c.draalId, 2, 'THIS IS NOT OVER, FLEET. I WILL SEE YOU AT THE DOOR.'); this.msgs[0].who = 'draal';
              this.npcLeave(c.draalIds); c.draalIds = null; c.allyCalled = false;
              this.campStep('c3_shards');
            } else {
              d.ai = AI_SURRENDER; d.faction = F_NEUTRAL; d.speed = 0;
              this.npcLeave(c.draalIds.filter((id) => id !== c.draalId));
              this.startDialog('c_draal2', c.draalId);
              c.draalIds = null;
            }
          } else if (!d.active || !d.alive) {
            c.f.draal = c.step === 'c3_draal' ? c.f.draal : 'dead';
            this.npcLeave(c.draalIds); c.draalIds = null;
            if (c.step === 'c3_draal') { this.say(FROM_CREW, 3, 'DRAAL\'S FLAGSHIP IS BREAKING UP - NO, AN ESCAPE POD JUMPED CLEAR. HE\'LL BE BACK.'); this.campStep('c3_shards'); }
            else { this.say(FROM_CREW, 3, 'DRAAL\'S FLAGSHIP IS DESTROYED. THE KESSARI ARE SCATTERING.'); this.campChapter(5); }
          }
          break;
        }
        case 'c3_shards':
          if (this.revealed.has(SYS_INDEX.chorus)) this.campChapter(4);
          break;
        case 'c4_go':
          if (sys === 'orra' && c.t > 2 && !this.dlg && !c.korvathSpoke) { c.korvathSpoke = true; const st = this.npc.findIndex((n) => n.active && n.kind === SK_CITADEL); this.startDialog('c_korvath4', st >= 0 ? st : FROM_COMMAND); }
          break;
        case 'c4_duel':
          if (!this.duel && this.lastDuel) {
            c.f.korvath = this.lastDuel === 'won' ? 'respect' : 'hostile';
            if (this.lastDuel !== 'won') this.say(FROM_CREW, 1, 'THE ORRANS WILL NOT STAND WITH US NOW.');
            this.lastDuel = null;
            this.campStep('c4_draal');
          }
          break;
        case 'c5_go':
          if (sys === 'chorus' && c.t > 1 && !c.vossSpoke && !this.dlg) { c.vossSpoke = true; this.after(6, () => this.startDialog('c_voss5', FROM_COMMAND)); }
          break;
        case 'c5_monolith':
          if (sys === 'chorus' && near(c.monoId ?? 0, 16000) && !this.dlg) this.startDialog('c_chorus5', c.monoId ?? 0);
          break;
        case 'c5_hold': {
          const left = Math.ceil(c.holdT - c.t);
          if (c.t > 14 && !c.allyCalled) { c.allyCalled = true; this.campAllies(['ressh', 'silk', 'korvath', 'lin', 'draal']); }
          if (left <= 0) { this.campEnding(c.finale); break; }
          this.setObjective(`CH5: DEFEND THE MONOLITH - ${left}s${distTo(P.x, P.y, this.npc[c.monoId].x, this.npc[c.monoId].y) > 15000 ? ' (GET BACK WITHIN 15K!)' : ''}`);
          if (distTo(P.x, P.y, this.npc[c.monoId].x, this.npc[c.monoId].y) > 15000) c.t -= dt; // the clock only runs while we guard it
          if (c.t > c.nextWave) { c.nextWave += 30; this.campWave(); }
          break;
        }
      }
    },
    // ---- arrivals in each system set up that chapter's scene
    onArrive(to) {
      if (this.mode !== K.MODE_CAMPAIGN || !this.camp) return;
      if (this.camp.id === 'argus') { this.argusArrive(to); return; }
      const c = this.camp, sid = this.sysDef.id;
      if (c.step === 'c1_go' && sid === 'meridian') {
        this.greeted.add(0); // Deep Hollow is silent
        const st = this.npc[0];
        const [x, y] = [st.x + 3200, st.y - 1800];
        const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, 0);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { poi: G.PK_SPIRE, kind: G.PK_SPIRE, civ: 2, hull: 100, armor: 0, haz: 0.3, art: G.ART_INDEX.shard1, poiKey: 'camp1', short: 'SINGING SEAM', name: 'THE SINGING SEAM' });
          this.npc[id].res = [0, 0, 4, 0, 0, 2];
          c.seamId = id;
        }
        this.M.mk.push({ x: Math.round(st.x), y: Math.round(st.y), kind: MK_POINT, r: 0 }); this.M.ver++;
        this.campStep('c1_near');
        if (!this.flags.linMet) this.after(25, () => { if (this.game === GS_RUN && !this.dlg && !this.job) { this.flags.linMet = true; this.runEvent('mayday'); } });
      }
      if (c.step === 'c1_seam' && sid === 'meridian' && c.seamId === undefined) this.campStep('c1_near');
      if (sid === 'velanar' && (c.step === 'c2_go' || c.step === 'c2_silk' || c.step === 'c2_hunter')) {
        const st = this.npc[0];
        const id = this.spawnAt(CT_FREIGHTER, F_NEUTRAL, st.x - 6000, st.y + 2500, 90);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_NONE, name: 'NIGHTJAR', short: 'NIGHTJAR', talk: 'c_silk1', talkCtx: {}, hull: 100, shMax: 120, shields: 120 });
          c.silkId = id;
          this.M.mk.push({ x: Math.round(st.x - 6000), y: Math.round(st.y + 2500), kind: MK_POINT, r: 0 }); this.M.ver++;
        }
        if (c.step !== 'c2_go') this.campStep('c2_silk');
        this.greeted.add(0);
      }
      if (sid === 'shroud' && (c.step === 'c3_go' || c.step === 'c3_lock')) {
        const [x, y] = [70000, 84000];
        const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, 40);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { poi: G.PK_WRECK, kind: G.PK_WRECK, civ: 3, hull: 100, armor: 0, haz: 0, art: -1, poiKey: 'tallis', short: 'ISV TALLIS', name: 'ISV TALLIS (WRECK)', talk: 'c_vault', vault: true });
          this.npc[id].res = [0, 0, 0, 0, 3, 0];
          c.tallisId = id;
        }
        const logs = [
          'POD LOG - CAPT. AMARA TEO: "THE VAULT IS KEYED TO THE SONG. THREE TONES. THE FIRST: COUNT THE WORLDS THAT CIRCLE THE STAR OUR FLEET CALLS HOME."',
          'POD LOG - CAPT. AMARA TEO: "...THE SECOND TONE: AS MANY AS THE SUNS THAT LIGHT THE EPSILON ARRAY."',
          'POD LOG - CAPT. AMARA TEO: "...AND THE LAST: THE NUMBER OF NOTES IN THE SONG ITSELF. IF YOU HAVE HEARD IT, YOU KNOW."',
        ];
        c.podIds = [];
        logs.forEach((log, k) => {
          const a = k * 2.1 + 0.6, pid = this.spawnAt(CT_POI, F_NEUTRAL, x + Math.cos(a) * (7000 + k * 2500), y + Math.sin(a) * (7000 + k * 2500), 0);
          if (pid === NO_ID) return;
          Object.assign(this.npc[pid], { poi: G.PK_CAPSULE, kind: G.PK_CAPSULE, civ: k, hull: 100, armor: 0, haz: 0, art: -1, poiKey: 'pod' + k, short: `TALLIS POD ${'ABC'[k]}`, name: `ISV TALLIS ESCAPE POD ${'ABC'[k]}`, log });
          this.npc[pid].res = [0, 0, 0, 0, 1, 0];
          c.podIds.push(pid);
        });
        this.M.mk.push({ x, y, kind: MK_AREA, r: 14000 }); this.M.ver++;
      }
      if (sid === 'chorus' && c.ch === 5) {
        c.monoId = this.npc.findIndex((n) => n.active && n.kind === SK_MONOLITH);
        this.greeted.add(c.monoId);
        this.npc[c.monoId].talk = 'c_chorus5';
      }
      if (sid === 'orra' && c.step === 'c4_go') c.korvathSpoke = false;
      // the people the story needs to talk to don't open with their usual greeting
      if ((sid === 'halcyon' && c.step === 'c1_report') || (sid === 'velanar' && c.step === 'c2_go') || (sid === 'orra' && c.step === 'c4_go'))
        for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].active && this.npc[i].type === CT_STARBASE) this.greeted.add(i);
    },
    // a hidden log is read when a pod is fully scanned or sampled
    campOnScan(id) {
      if (this.camp && this.camp.id === 'argus') { this.argusOnScan(id); return; }
      const n = this.npc[id];
      if (n && n.log && n.scan >= 2 && !n.logRead) { n.logRead = true; this.say(FROM_CREW, 0, n.log); this.msgs[0].who = 'teo'; }
    },
    campTone(i, k) {
      const c = this.camp;
      c.lock[i] = k;
      if (i < 2) return i === 0 ? 't2' : 't3';
      const ok = LOCK.every((v, j) => c.lock[j] === v);
      c.lock = [];
      if (ok) {
        this.sayAs('vault', 'HARMONY ACCEPTED. VAULT OPEN.');
        this.say(FROM_CREW, 3, 'THE VAULT HELD ONE THING: A SINGING CRYSTAL. THE THIRD SHARD IS ABOARD.');
        this.addArt('shard3', 0);
        this.npc[c.tallisId].talk = null;
        this.campStep('c3_draal');
        return null;
      }
      c.lockFails++;
      this.sayAs('vault', 'DISCORD. THE LOCK RESETS.', 2);
      this.P.health[K.S_SENSORS] = clampf(this.P.health[K.S_SENSORS] - 20, 0, 100);
      this.say(FROM_CREW, 1, 'A RESONANCE PULSE FROM THE VAULT - SENSORS DAMAGED.');
      if (c.lockFails === 2) this.after(4, () => { this.say(FROM_COMMAND, 3, 'AURORA, MARRIN. THE POD LOGS - TEO TELLS YOU EXACTLY WHAT TO COUNT. COUNT IT. WORLDS AROUND KALOS, SUNS OVER HALCYON, NOTES IN THE SONG VOSS PLAYED YOU.'); this.msgs[0].who = 'marrin'; });
      return null;
    },
    // ---- set pieces
    campResshArrives() {
      const c = this.camp, P = this.P;
      const [x, y] = this.pointNear(P.x, P.y, 6500);
      c.resshIds = [];
      for (let i = 0; i < 3; i++) {
        const id = this.spawnAt(i === 0 ? CT_DESTROYER : CT_RAIDER, F_HOSTILE, this.clampSec(x + i * 1400), this.clampSec(y + (i % 2) * 1300), bearingTo(x, y, P.x, P.y));
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { ai: AI_STATIC, aiTarget: US, scan: 1, civ: CIV_KESSARI });
        if (i === 0) Object.assign(this.npc[id], { name: 'RESSH\'S RAIDER', short: 'RESSH' });
        this.boomAt(this.npc[id].x, this.npc[id].y, 2);
        c.resshIds.push(id);
      }
      c.resshId = c.resshIds[0];
      this.emit(K.EV_WARP_IN, c.resshId);
      this.startDialog('c_ressh1', c.resshId, { ids: c.resshIds });
    },
    campHunterArrives() {
      const c = this.camp;
      const nj = this.npc[c.silkId];
      const [x, y] = this.pointNear(nj.x, nj.y, 7000);
      c.hunterIds = [];
      for (let i = 0; i < 2; i++) {
        const id = this.spawnAt(CT_DESTROYER, F_NEUTRAL, this.clampSec(x + i * 1800), this.clampSec(y), bearingTo(x, y, nj.x, nj.y));
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_ORRAN, name: i ? 'ORRAN HUNTER II' : 'ORRAN HUNTER', short: i ? 'HUNTER II' : 'HUNTER', shMax: 150, shields: 150 });
        this.boomAt(this.npc[id].x, this.npc[id].y, 2);
        c.hunterIds.push(id);
      }
      this.startDialog('c_hunter', c.hunterIds[0], { ids: c.hunterIds });
    },
    campHunterFight(atNightjar) {
      const c = this.camp;
      c.f.refugees = 'fought';
      c.hunterIds.forEach((id, i) => {
        const n = this.npc[id];
        n.ai = AI_ATTACK; n.aiT = 0; n.faction = F_HOSTILE;
        n.aiTarget = i === 0 && atNightjar ? c.silkId : (i === 1 ? c.silkId : US);
      });
      const nj = this.npc[c.silkId];
      nj.faction = F_FRIEND;
      this.campStep('c2_fight');
    },
    campSilkPays() {
      const c = this.camp;
      this.say(c.silkId, 3, 'YOU\'RE ALL RIGHT, FLEET. HERE - YOUR ROCK. AND IF YOU EVER NEED A FAVOUR, SILK PAYS HER DEBTS.');
      this.msgs[0].who = 'silk';
      this.addArt('shard2', 0);
      this.repAdd(CIV_VELORI, 5);
      this.campStep('c2_done');
    },
    campDraalArrives(ch) {
      const c = this.camp, P = this.P;
      const [x, y] = this.pointNear(P.x, P.y, 7000);
      c.draalIds = [];
      const n = ch === 3 ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const id = this.spawnAt(i === 0 || i === 3 ? CT_DESTROYER : CT_RAIDER, F_HOSTILE, this.clampSec(x + (i % 3) * 1500), this.clampSec(y + Math.floor(i / 3) * 1600), bearingTo(x, y, P.x, P.y));
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { ai: AI_STATIC, aiTarget: US, scan: 1, civ: CIV_KESSARI });
        if (i === 0) Object.assign(this.npc[id], { name: 'DRAAL\'S FLAGSHIP', short: 'DRAAL', shMax: 200, shields: 200 });
        this.boomAt(this.npc[id].x, this.npc[id].y, 2);
        c.draalIds.push(id);
      }
      c.draalId = c.draalIds[0];
      c.allyCalled = false;
      this.emit(K.EV_WARP_IN, c.draalId);
      if (ch === 3) this.startDialog('c_draal1', c.draalId, { ids: c.draalIds, who: 'draal' });
      else {
        this.say(c.draalId, 2, 'THE DOOR IS MINE, FLEET! KESSARI - TAKE THE LANE!'); this.msgs[0].who = 'draal';
        this.kessariAttack({ ids: c.draalIds });
      }
    },
    // friends you made come back
    campAllies(which) {
      const c = this.camp, f = c.f, P = this.P;
      // how much each friend will do depends on how we treated them (allies.js)
      const call = (who, n, type, civ, name, line, grudging) => this.callAlly(who, { ships: n, type, civ, name, line, grudging });
      if (which.includes('ressh')) call('ressh', 3, CT_RAIDER, CIV_KESSARI, 'RESSH\'S RAIDER', 'THIS FLEET SHIP SPARED MY CREW. TODAY RESSH PAYS HIS DEBT!', 'YOU LET ME GO, FLEET. RESSH PAYS WHAT HE OWES - NO MORE.');
      if (which.includes('silk')) call('silk', 2, CT_RAIDER, CIV_NONE, 'NIGHTJAR', 'YOU HELPED MY PEOPLE, FLEET. NOW I HELP YOURS. TRY TO KEEP UP.');
      if (which.includes('korvath')) call('korvath', 3, CT_DESTROYER, CIV_ORRAN, 'ORRAN WARSHIP', 'ORR STANDS WITH THE AURORA!', 'YOU BEAT ME IN THE CIRCLE, OUTSIDER. ONE SHIP OF ORR WILL HONOUR THAT.');
      if (which.includes('lin')) call('lin', 3, CT_FREIGHTER, CIV_COLONY, 'MERIDIAN MILITIA', 'THE MERIDIAN STAR AND THE DEEP HOLLOW MILITIA, AURORA! WE OWE YOU!');
      if (which.includes('draal')) call('draal', 3, CT_RAIDER, CIV_KESSARI, 'KESSARI WAR-BAND', 'THE KESSARI PAY THEIR DEBTS, FLEET. DRAAL IS HERE.');
    },
    chorusBond(who) { // how the Chorus campaign's choices translate into an ally's bond
      const f = this.camp.f;
      switch (who) {
        case 'ressh': return f.ressh === 'friend' ? 3 : f.ressh === 'freed' ? 1 : 0;           // let him go = grudging; paid him off = devoted
        case 'silk': return f.refugees === 'bought' ? 3 : f.silk === 'ally' ? 2 : 0;           // bought their freedom = devoted
        case 'korvath': return f.korvath === 'ally' ? 3 : f.korvath === 'respect' ? 1 : 0;     // the truth = devoted; a duel won = grudging
        case 'lin': return this.flags.linSaved ? (f.linGift ? 4 : 2) : 0;
        case 'draal': return f.draal === 'freed' ? 2 : 0;
      }
      return 0;
    },
    campFinale(choice) {
      const c = this.camp, P = this.P;
      c.finale = choice;
      c.holdT = 90; c.nextWave = 4;
      c.allyCalled = false; c.allies = new Set();
      this.say(FROM_CREW, 2, choice === 'free' ? 'THE MONOLITH IS OPENING. SENSORS: SHIPS DROPPING OUT OF THE LANE - THEY MEAN TO STOP IT!'
        : choice === 'seal' ? 'THE MONOLITH IS CLOSING ITS DOOR. KESSARI SHIPS INBOUND - THEY WANT THE SHARDS BEFORE IT SEALS!'
          : 'A FLEET TUG IS NINETY SECONDS OUT. THE MONOLITH IS... FIGHTING BACK. CRYSTAL CONSTRUCTS IN THE BELT!');
      this.campStep('c5_hold');
    },
    campWave() {
      const c = this.camp, mono = this.npc[c.monoId];
      const [x, y] = this.pointNear(mono.x, mono.y, 9000);
      const nm = c.finale === 'free' ? ['ORRAN SILENCER', CIV_ORRAN] : c.finale === 'seal' ? ['KESSARI RAIDER', CIV_KESSARI] : ['CRYSTAL GUARDIAN', 6];
      const n = 2 + (this.M.diff % 3);
      for (let i = 0; i < n; i++) {
        const id = this.spawnFoe(i === 0 && c.finale !== 'fleet' ? CT_DESTROYER : CT_RAIDER, this.clampSec(x + i * 1300), this.clampSec(y + (i % 2) * 1100), US, 3);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: nm[1], name: `${nm[0]} ${i + 1}`, short: `${nm[0].split(' ')[1]} ${i + 1}` });
      }
      if (c.finale === 'free' && !c.thaneSpoke) { c.thaneSpoke = true; this.say(FROM_COMMAND, 2, 'THE DOOR STAYS SHUT, OUTSIDER. FOR ORR!'); this.msgs[0].who = 'thane'; this.msgs[0].lang = CIV_ORRAN; }
    },
    campEnding(kind) {
      const c = this.camp, f = c.f;
      const allies = [...(c.allies || [])].map((w) => CHARS[w].name);
      const T = {
        free: ['THE SONG RETURNS', 'THE DOOR OPENS. FOR THE FIRST TIME IN A THOUSAND YEARS THE CHORUS SINGS IN FULL, AND EVERY CRYSTAL IN THE GALAXY RINGS WITH IT. NO ONE WALKS INTO AN AIRLOCK AGAIN. THE ORRANS WEEP. THE CHORUS REMEMBERS YOUR NAME.'
          + (f.defied ? ' ADMIRAL VOSS RELIEVES YOU OF COMMAND - FOR A WEEK.' : ' FLEET COMMAND IS FURIOUS. YOU DISOBEYED ORDERS.')],
        seal: ['THE QUIET', 'THE MONOLITH GOES DARK. THE SONG STOPS - IN DEEP HOLLOW, IN THE LANTERN\'S LAMPS, IN EVERY SLEEPING MIND. THE DOMINION\'S SECRET IS SAFE. SOMETIMES, LATE AT NIGHT, YOU STILL HEAR SEVEN NOTES.'],
        fleet: ['THE WEAPON', 'A FLEET TUG TOWS THE MONOLITH TOWARDS THE EPSILON ARRAY. VOSS IS PROMOTED. MARRIN RESIGNS. THE SONG, CAGED AGAIN, TURNS FROM GRIEF INTO SOMETHING COLDER.'],
        silence: ['SILENCE', 'KORVATH CRUSHES THE SHARDS IN HIS GAUNTLET. THE LANE CLOSES. WHATEVER WAITED BEYOND ORRA WILL WAIT FOREVER. FLEET COMMAND CALLS IT A SENSIBLE CHOICE. YOU ARE NOT SO SURE.'],
      }[kind];
      c.ending = { kind, title: T[0], text: T[1], allies };
      this.campSaveOf(c.id || 'chorus').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    campRemove(id, sec) { this.after(sec, () => { const n = this.npc[id]; if (n && n.active) { n.active = false; this.boomAt(n.x, n.y, 2); } }); },
    // ally AI: pick the nearest hostile, otherwise keep station on the Aurora
    allyRetarget(n) {
      let best = NO_ID, bd = 26000;
      for (let i = 0; i < MAX_CONTACTS; i++) {
        if (!this.hostileAlive(i) || this.npc[i].type === CT_STARBASE || this.npc[i].ai === 3) continue;
        const d = distTo(n.x, n.y, this.npc[i].x, this.npc[i].y);
        if (d < bd) { bd = d; best = i; }
      }
      n.aiTarget = best;
      // and some enemies turn on the newcomers
      if (best !== NO_ID && this.npc[best].aiTarget === US && this.frand() < 0.3) this.npc[best].aiTarget = this.npc.indexOf(n);
    },
  });
}
