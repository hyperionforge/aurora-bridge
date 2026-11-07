// ============================================================================
// recurrence.js - "RECURRENCE": the Aurora meets herself.
// Star Trek's favourite tricks with time - the loop the crew can't remember, the message
// from yourself, the future ship come back to warn you, the timeship that erases history,
// the villain made by your own future - told as KISHOTENKETSU with a teaser:
//   TEASER      THE SAME NINETY SECONDS  A survey of a temporal fold in the Cerulean Deep. A ship comes out of it
//                                        and hits the Aurora. Then it's ninety seconds ago. Again. The crew keeps
//                                        a little more each time - and a signal in the fold is in their own voice.
//   PART ONE    THE OTHER AURORA (KI)    Break the loop and the ship is the Aurora, three weeks older, dying.
//                                        Her last engineer, Noor Haskell, carries the future's logs.
//   PART TWO    ERASED (SHO)             Halcyon: the Orran timeship SPINDLE is erasing the Epsilon Array from
//                                        history. Temporal shielding, or Marrin was never born.
//   PART THREE  THE OLDEST STORY (TEN)   The twist: at Orra, Vizier Ossan Tel is erasing the path that brings the
//                                        Aurora here - because in his history, the Aurora's shot is what wiped out
//                                        his people. Defend your enemy, or become the reason he exists.
//   PART FOUR   TOMORROW (KETSU)         Back at the fold where it began. One last rewind - restore, sacrifice, or end.
// Built on story.js (Fleet Command on call, report-ins, chapters on arrival, slow lanes,
// in-lane puzzles) and puzzles.js (the echo, the future log crystal, the chroniton wave).
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { STORY } from './story.js';
import { ARCHIVES } from './puzzles.js';
import { SYS_INDEX, SYS_C, sysAt, CIV_FLEET, CIV_ORRAN, CIV_NONE } from './galaxy.js';
import { distTo, bearingTo, clampf, sectorName } from './util.js';
import { DEG } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_RAIDER, CT_DESTROYER, CT_ANOMALY, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_WARPIN = 3, AI_ATTACK = 4, AI_SURRENDER = 6;

export const REC_CHAPTERS = ['THE SAME NINETY SECONDS', 'THE OTHER AURORA', 'ERASED', 'THE OLDEST STORY', 'TOMORROW'];
export const REC_LABELS = ['TEASER', 'PART ONE', 'PART TWO', 'PART THREE', 'PART FOUR'];
export const REC_DESC = [
  'A SURVEY OF A TEMPORAL FOLD IN THE CERULEAN DEEP. ROUTINE. YOU\'VE DONE IT BEFORE. HAVEN\'T YOU?',
  'THE SHIP THAT CAME OUT OF THE FOLD IS THE AURORA. SHE IS THREE WEEKS OLDER THAN YOU, AND SHE IS DYING.',
  'SOMETHING IS ERASING THE EPSILON ARRAY - NOT DESTROYING IT. ERASING IT.',
  'ORRA, AND A MAN WHO HAS BEEN UNDOING HISTORY FOR A REASON YOU WILL NOT WANT TO HEAR.',
  'THE FOLD WHERE IT BEGAN. ONE LAST REWIND.',
];
export const REC_BLURB = 'A SHIP COMES OUT OF A TEMPORAL FOLD AND DESTROYS THE AURORA. THEN IT\'S NINETY SECONDS AGO. A TIME LOOP, A MESSAGE FROM YOURSELVES, THE AURORA FROM THREE WEEKS IN THE FUTURE, AND A TIMESHIP ERASING HISTORY - FOR A REASON THAT STARTS WITH YOU.';
const DEFAULT_AT = {
  2: { looped: 3 },
  3: { other: 'saved', noor: 'aboard', cracked: true, halcyon: true, spindle: true, tshieldRec: true },
  4: { array: 'saved', tshield: true, ashar: true },
  5: { tel: 'talk', asharFate: 'saved', senna: 'calmed' },
};
const defaultsFor = (ch) => { const out = {}; for (let k = 2; k <= ch; k++) Object.assign(out, DEFAULT_AT[k]); return out; };

const FOLD = [98000, 64000];      // the temporal fold by Glacia, Cerulean Deep
const START = [98000, 78000];     // where the survey begins, every time
const ASHAR = [62000, 104000];    // the Orran colony habitat at Tel-Ashar, Orra Prime
export const FOLD_SECTOR = sectorName(FOLD[0], FOLD[1]);

Object.assign(CHARS, {
  noor: { name: 'LT. NOOR HASKELL', role: 'CHIEF ENGINEER - THE AURORA, THREE WEEKS FROM NOW', civ: CIV_FLEET, look: { skin: '#b4825a', hair: '#28140a', uniform: '#d2aa28', pips: 2, scar: true } },
  tel: { name: 'VIZIER OSSAN TEL', role: 'THE SPINDLE', civ: CIV_ORRAN, look: 'orran' },
  senna: { name: 'HIERARCH SENNA', role: 'BASTION OF ORR', civ: CIV_ORRAN, look: 'orran' },
  aurora2: { name: 'FSS AURORA', role: 'THREE WEEKS FROM NOW', civ: CIV_FLEET, look: 'computer' },
});

G.ART.push(
  { id: 'echo', name: 'FOLD ECHO', unk: 'SIGNAL INSIDE THE FOLD', fx: {}, story: true, puz: ['tune'], tune: [5, 9, 2],
    effect: 'A MESSAGE IN THE FOLD, IN OUR OWN TRANSPONDER CODE. MATCH IT TO HEAR IT.',
    puzHint: 'THERE\'S A SIGNAL CAUGHT IN THE FOLD - AND IT\'S USING OUR OWN TRANSPONDER CODE. MATCH ITS CARRIER AND WE CAN HEAR WHAT IT SAYS.',
    lore: 'THE SIGNAL IS WEAKER EVERY TIME WE HEAR IT, AS IF IT HAS BEEN SENT MANY TIMES.' },
  { id: 'futurelog', name: 'FUTURE LOG CRYSTAL', unk: 'FLEET DATA CRYSTAL, DATED THREE WEEKS AHEAD', fx: {}, story: true, puz: ['cipher', 'archive'], archive: 'recurrence', drag: 1.5,
    effect: 'THE OTHER AURORA\'S LOGS. THE NEXT THREE WEEKS, WRITTEN BY US.',
    puzHint: 'IT\'S LOCKED WITH OUR OWN SECURITY LOCK - THREE WEEKS NEWER THAN OURS. FOUR GLYPHS. IT WILL RE-KEY IF WE GUESS TOO OFTEN. IT\'S ALSO TEMPORALLY OUT OF PHASE - IT DRAGS ON THE JUMP FIELD.',
    lore: 'OUR OWN SHIP\'S LOG FORMAT. OUR OWN CAPTAIN\'S CODE. DATES THAT HAVEN\'T HAPPENED.' },
  { id: 'chroniton', name: 'CHRONITON WAVEFORM', unk: 'RECORDING OF THE SPINDLE\'S TIME FIELD', fx: {}, story: true, puz: ['tune'], tune: [8, 2, 3],
    effect: 'THE SPINDLE\'S TIME FIELD. MATCHED, IT IS THE AURORA\'S TEMPORAL SHIELDING: WE STAY OUT OF ITS ERASURES, AND OUR SHOTS STICK.',
    puzHint: 'HASKELL\'S NOTES: PHASE THE SHIELD GRID TO THE SPINDLE\'S CHRONITON WAVE AND WE STEP OUTSIDE ITS HISTORY. MATCH THE WAVE.',
    lore: 'EIGHT BEATS TO A CYCLE. THE WAVE RUNS BACKWARDS, WHICH SHOULD NOT BE POSSIBLE.' },
);
for (let i = 0; i < G.ART.length; i++) G.ART_INDEX[G.ART[i].id] = i;

ARCHIVES.recurrence = [
  { title: 'CAPTAIN\'S LOG - NINE DAYS FROM NOW', from: 'FSS AURORA', hook: 'halcyon',
    text: 'HALCYON. AN ORRAN SHIP WE COULD NOT HURT WENT INTO ORBIT OF THE EPSILON ARRAY, AND THEN THE ARRAY WAS NOT THERE. NOT DESTROYED. NOT THERE. FLEET HAS NO RECORD OF IT. DR. MARRIN WAS NEVER BORN. ONLY WE REMEMBER.' },
  { title: 'THE SPINDLE', from: 'HASKELL - TECHNICAL NOTES', hook: 'spindle',
    text: 'ORRAN TIMESHIP, VIZIER OSSAN TEL COMMANDING. IT DOESN\'T SHOOT. IT REWINDS - A STATION, A SHIP, ITSELF. DAMAGE IT AND IT ROLLS ITSELF BACK TO WHOLE. EVERY REWIND LEAVES A HOLE IN HISTORY.' },
  { title: 'TEMPORAL SHIELDING', from: 'HASKELL - TECHNICAL NOTES', hook: 'tshieldRec', key: true,
    text: 'IF THE SHIELD GRID IS PHASED TO THE SPINDLE\'S CHRONITON WAVE, THE SHIP STEPS OUTSIDE ITS HISTORY. ITS ERASURES CAN\'T TOUCH US, AND OUR WEAPONS STAY FIRED - IT CAN\'T REWIND OUR DAMAGE. RECORD THE WAVE AT HALCYON AND MATCH IT.' },
  { title: 'CAPTAIN\'S LOG - SIXTEEN DAYS FROM NOW', from: 'FSS AURORA', hook: 'ashar',
    text: 'ORRA. WE CORNERED THE SPINDLE ABOVE THE COLONY AT TEL-ASHAR AND WE FIRED. IT REWOUND - AND TOOK TEL-ASHAR WITH IT. FORTY THOUSAND PEOPLE. HIERARCH SENNA SAYS THE COLONY WAS FOUNDED BY THE VIZIER\'S FAMILY. WE DID THAT.' },
  { title: 'CAPTAIN\'S LOG - TWENTY-ONE DAYS FROM NOW', from: 'FSS AURORA', hook: 'kalos',
    text: 'KALOS IS GONE. STARBASE 12 IS GONE. ADMIRAL VOSS NEVER EXISTED. WE ARE THE ONLY SHIP THAT REMEMBERS ANY OF IT. HASKELL THINKS THE FOLD IN THE CERULEAN DEEP CAN TAKE US BACK THREE WEEKS. IT IS ALL WE HAVE LEFT TO TRY.' },
  { title: 'PERSONAL - NOOR HASKELL', from: 'LT. N. HASKELL', hook: 'noorNote', lock: 'tshield', lockMsg: 'PHASE-LOCKED TO THE SPINDLE\'S WAVE - MATCH THE CHRONITON WAVEFORM FIRST.',
    text: 'IF THIS WORKS, I WON\'T EXIST. THE VERSION OF ME YOU PICK UP AT MERIDIAN NEXT MONTH WILL. SHE\'S GOING TO BE AWFUL AT CARDS AND SHE\'S GOING TO LOVE THIS SHIP. BE GOOD TO HER.' },
];

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.rcStep(k); return null; };
const f = (s) => s.camp.f;
Object.assign(DIALOGS, {
  r_voss0: { who: 'voss', nodes: {
    start: { say: (s) => (s.camp.loop ? 'AURORA, VOSS. THE EPSILON ARRAY HAS PICKED UP A TEMPORAL FOLD NEAR GLACIA - ...AURORA? YOU\'RE LOOKING AT ME LIKE YOU KNEW WHAT I WAS GOING TO SAY.' : 'AURORA, VOSS. THE EPSILON ARRAY HAS PICKED UP A TEMPORAL FOLD NEAR GLACIA, IN THE CERULEAN DEEP. TETRYONS, CHRONITONS, THE USUAL NONSENSE. GO AND TAKE A LOOK.'),
      opts: [{ t: 'ANY RISK TO THE SHIP?', go: 'risk' }, { t: 'ON OUR WAY', go: 'go' }] },
    risk: { say: 'MARRIN SAYS THE FOLD IS STABLE. MARRIN ALSO SAYS THAT ABOUT HIS COFFEE. KEEP YOUR DISTANCE AND YOUR SENSORS UP.', opts: [{ t: 'ON OUR WAY', go: 'go' }] },
    go: { say: `THE FOLD IS IN SECTOR ${FOLD_SECTOR}. VOSS OUT.`, opts: [{ t: 'ACKNOWLEDGED', do: step('r0_go') }] },
  } },
  r_noor1: { who: 'noor', nodes: {
    start: { say: 'AURORA. ...GOD, LOOK AT YOU. NOT A SCRATCH. I\'M LIEUTENANT NOOR HASKELL, CHIEF ENGINEER OF THE FSS AURORA. YOU DON\'T HAVE ONE YET. YOU PICK ME UP AT MERIDIAN NEXT MONTH.',
      opts: [{ t: 'THAT\'S NOT POSSIBLE', go: 'nope' }, { t: 'WHAT HAPPENED TO YOU?', go: 'what' }, { t: 'THE LOOP - WAS THAT YOU?', if: (s) => (s.camp.f.looped || 0) > 0, go: 'loop' }] },
    nope: { say: 'CHECK MY TRANSPONDER. CHECK MY HULL REGISTRY. CHECK THE SCORCH MARK ON THE PORT NACELLE - YOU\'RE GOING TO GET IT AT HALCYON IN NINE DAYS.', opts: [{ t: 'WHAT HAPPENED TO YOU?', go: 'what' }] },
    loop: { say: (s) => `WE CAME THROUGH THE FOLD AND YOUR SHIELD BUBBLE CAUGHT OUR WARP FIELD. WE HIT YOU. ${f(s).looped} TIMES, BY YOUR COUNT. EVERY TIME, THE FOLD SNAPPED US BACK. WE KEPT SENDING THE SAME MESSAGE INTO IT. YOU FINALLY HEARD IT.`, opts: [{ t: 'WHAT HAPPENED TO YOU?', go: 'what' }] },
    what: { say: 'A TIMESHIP CALLED THE SPINDLE. IT ERASES THINGS. HALCYON, THEN ORRA, THEN KALOS. IN THREE WEEKS THERE IS NO STARBASE 12, NO ADMIRAL VOSS, NO FLEET. WE CAME BACK TO STOP IT. ...AND MY WARP CORE IS ABOUT TO GO.',
      opts: [{ t: 'WE\'LL BEAM YOU ACROSS - DROPPING SHIELDS', do: (s) => { s.rcStep('r1_beam'); return null; } }, { t: 'WE CAN STABILISE YOUR CORE - SENDING 3 PLASMA', if: (s) => s.P.cargo[G.R_PLASMA] >= 3, do: (s) => { s.P.cargo[G.R_PLASMA] -= 3; s.camp.f.other = 'saved'; s.sayAs('noor', 'THAT... THAT\'LL HOLD HER. YOU JUST SAVED YOUR OWN SHIP, AURORA. I\'M STILL COMING ACROSS - THERE\'S NOBODY LEFT HERE BUT ME AND THE COMPUTER.'); s.rcStep('r1_beam'); return null; } }] },
  } },
  r_rep1: { who: 'voss', nodes: {
    start: { say: (s) => `AURORA... I'VE READ YOUR REPORT FOUR TIMES. A SECOND AURORA. ${f(s).other === 'saved' ? 'STILL FLYING, WITH NOBODY ABOARD BUT HER COMPUTER.' : 'GONE, AND A LIEUTENANT IN YOUR SICKBAY WHO SAYS SHE\'S YOUR FUTURE ENGINEER.'} I WOULD HAVE CALLED IT A HOAX, EXCEPT THAT I RECEIVED A SEALED MESSAGE THREE WEEKS AGO, FROM YOU, THAT SAID: "SHE'S TELLING THE TRUTH."`,
      opts: [{ t: 'WE DIDN\'T SEND ANYTHING', go: 'didnt' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    didnt: { say: 'NOT YET, YOU HAVEN\'T. I\'M GETTING A HEADACHE, AURORA.', opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: (s) => `${f(s).halcyon ? 'THE LOGS SAY HALCYON IS FIRST. NINE DAYS FROM NOW - OR SOONER, IF HISTORY IS ALREADY BENDING.' : 'HASKELL SAYS HALCYON IS FIRST - CRACK THOSE LOGS, AURORA, AND KNOW WHAT YOU\'RE FLYING INTO.'} GO TO THE EPSILON ARRAY AND STAND IN FRONT OF IT. AND AURORA - BRING YOUR ENGINEER.`,
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR HALCYON', do: (s) => { s.storyNext(3, 'halcyon', 'JUMP TO HALCYON AND PROTECT THE EPSILON ARRAY'); s.camp.step = 'r1_jump'; return null; } }] },
  } },
  r_lane2: { who: 'noor', nodes: {
    start: { say: 'LONG CROSSING. YOUR DRIVE STILL HAS THE SAME FLUTTER MINE HAD - I\'LL FIX IT WHEN I... WELL. CAN I ASK YOU SOMETHING?',
      opts: [{ t: 'GO AHEAD', go: 'ask' }] },
    ask: { say: 'IN MY TIMELINE, YOU WERE THE BEST CREW I EVER SERVED WITH. IF WE WIN, THIS VERSION OF ME NEVER HAPPENS. ...IS IT STRANGE THAT I\'M ALL RIGHT WITH THAT?',
      opts: [{ t: 'YOU\'RE CREW, NOOR. WHATEVER HAPPENS', do: (s) => { s.bondAdd('noor', 2); s.sayAs('noor', '...THANKS. CREW. YEAH.'); return null; } }, { t: 'LET\'S MAKE SURE IT\'S WORTH IT', do: (s) => { s.bondAdd('noor', 1); s.sayAs('noor', 'THAT\'S THE IDEA.'); return null; } }] },
  } },
  r_tel3: { who: 'tel', nodes: {
    start: { say: (s) => `AURORA. YOU ARE NOT IN MY HISTORY THIS EARLY. INTERESTING. ${f(s).noor === 'aboard' ? 'AND YOU CARRY SOMEONE WHO SHOULD NOT EXIST AT ALL.' : ''} STAND ASIDE. THIS STATION IS A THREAD THAT LEADS TO YOU, AND I AM CUTTING IT.`,
      opts: [{ t: 'WHY THE ARRAY? WHAT DID IT DO?', go: 'why' }, { t: 'STAND DOWN, OR WE FIRE', go: 'fight' }] },
    why: { say: 'IT SAW THE FOLD. IT SENT YOU THERE. EVERYTHING THAT SENDS YOU TOWARD ORRA, I UNDO. YOU WOULD NOT UNDERSTAND - YOU HAVEN\'T DONE IT YET.', opts: [{ t: 'DONE WHAT?', go: 'what' }, { t: 'STAND DOWN, OR WE FIRE', go: 'fight' }] },
    what: { say: '...ASK YOUR GHOST. SHE KNOWS.', opts: [{ t: 'STAND DOWN, OR WE FIRE', go: 'fight' }] },
    fight: { say: 'FIRE, THEN. IT WILL NOT STICK.', opts: [{ t: 'TACTICAL - ENGAGE THE SPINDLE', do: (s) => { s.rcSpindleFight(); return null; } }] },
  } },
  r_rep2: { who: 'voss', nodes: {
    start: { say: (s) => (f(s).array === 'erased' ? 'AURORA, VOSS. YOU\'RE AT HALCYON? WHY? THERE\'S NOTHING AT HALCYON - THERE\'S NEVER BEEN A STATION THERE. WHO IS "MARRIN"?' : 'AURORA, VOSS. MARRIN SAYS AN ORRAN SHIP TRIED TO MAKE HIS STATION NEVER HAVE EXISTED, AND THAT YOU STOOD IN THE WAY. I\'M CHOOSING TO BELIEVE ALL OF THAT.'),
      opts: [{ t: 'THE ARRAY WAS REAL. WE REMEMBER IT', if: (s) => f(s).array === 'erased', go: 'real' }, { t: 'THE SPINDLE IS HEADING FOR ORRA', go: 'orra' }] },
    real: { say: '...YOUR LOGS SAY SO. MY LOGS SAY NOTHING. I\'VE NEVER BEEN SO FRIGHTENED OF A BLANK PAGE IN MY LIFE.', opts: [{ t: 'THE SPINDLE IS HEADING FOR ORRA', go: 'orra' }] },
    orra: { say: (s) => `${f(s).ashar ? 'AND YOUR FUTURE LOGS SAY WHAT HAPPENS THERE. TEL-ASHAR. FORTY THOUSAND PEOPLE.' : 'THE ORRANS WILL NOT THANK US FOR FOLLOWING ONE OF THEIR SHIPS HOME.'} GO TO ORRA PRIME, AURORA. AND THIS TIME - THINK BEFORE YOU SHOOT.`,
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR ORRA', do: (s) => { s.storyNext(4, 'orra', 'JUMP TO ORRA PRIME AND FIND THE SPINDLE AT TEL-ASHAR'); s.camp.step = 'r2_jump'; return null; } }] },
  } },
  r_senna: { who: 'senna', nodes: {
    start: { say: 'FLEET VESSEL. YOU ARE IN ORRAN SPACE, CHASING AN ORRAN SHIP. VIZIER TEL IS A HERETIC AND A THIEF; THE SPINDLE WAS SEALED BY THE HIERARCHY THREE CENTURIES AGO. MY SHIPS WILL DESTROY IT. YOU WILL HELP, OR YOU WILL LEAVE.',
      opts: [{ t: 'IT\'S ABOVE TEL-ASHAR. IF IT REWINDS, THE COLONY GOES WITH IT', if: (s) => f(s).ashar, go: 'warn' }, { t: 'WE\'LL HANDLE THE SPINDLE', go: 'handle' }] },
    warn: { say: '...YOU KNOW THIS HOW? NO. DON\'T TELL ME. I HAVE SEEN WHAT THE SPINDLE DOES TO PEOPLE WHO KNOW THINGS. MY SHIPS WILL HOLD FIRE - FOR NOW. SPEAK TO HIM.', opts: [{ t: 'THANK YOU, HIERARCH', do: (s) => { s.camp.f.senna = 'calmed'; s.rcStep('r3_find'); return null; } }] },
    handle: { say: 'THEN HANDLE IT QUICKLY. MY PATIENCE IS OLDER THAN YOUR FLEET AND NEARLY AS THIN.', opts: [{ t: 'UNDERSTOOD', do: (s) => { s.camp.f.senna = 'angry'; s.rcStep('r3_find'); return null; } }] },
  } },
  r_tel4: { who: 'tel', nodes: {
    start: { say: 'HERE YOU ARE. EXACTLY WHERE YOU WERE THE FIRST TIME. ABOVE TEL-ASHAR, WHERE MY DAUGHTER LIVES. IN THE HISTORY I REMEMBER, THE AURORA FIRES ON ME HERE, AND THE SPINDLE REWINDS, AND TEL-ASHAR IS GONE.',
      opts: [{ t: 'THAT\'S WHY YOU\'VE BEEN ERASING EVERYTHING', go: 'why' }, { t: 'WE KNOW. WE READ IT IN OUR OWN LOGS', if: (s) => f(s).ashar, go: 'logs' }, { t: 'SURRENDER THE SPINDLE, OR WE FIRE', go: 'threat' }] },
    why: { say: 'EVERY THREAD THAT BRINGS YOU HERE, I CUT. THE ARRAY. THE FOLD. YOUR ADMIRAL. EVENTUALLY, YOU. AND STILL YOU COME.', opts: [{ t: 'WE WON\'T FIRE. TALK TO US', go: 'talk' }, { t: 'SURRENDER THE SPINDLE, OR WE FIRE', go: 'threat' }] },
    logs: { say: '...THEN YOU KNOW WHAT YOU ARE TO ME. WHAT WILL YOU DO WITH IT?', opts: [{ t: 'WE WON\'T FIRE. TALK TO US', go: 'talk' }, { t: 'SURRENDER THE SPINDLE, OR WE FIRE', go: 'threat' }] },
    talk: { say: (s) => `${f(s).senna === 'angry' ? 'SENNA\'S SHIPS ARE ALREADY ARMING. IF THEY FIRE, I REWIND - I CANNOT STOP IT, IT IS HOW THE SPINDLE DEFENDS ITSELF. ' : ''}YOU WOULD STAND BETWEEN ME AND MY OWN PEOPLE? FOR THE MAN WHO ERASED YOUR STATION?`,
      opts: [{ t: 'YES. NOBODY ELSE DIES HERE', do: (s) => { s.camp.f.tel = 'talk'; s.rcDefendTel(); return null; } }] },
    threat: { say: 'THEN IT HAPPENS AGAIN. I AM SO TIRED OF WATCHING IT HAPPEN.', opts: [{ t: 'TACTICAL - FIRE', do: (s) => { s.camp.f.tel = 'fight'; s.rcSpindleFight(); return null; } }, { t: '...NO. WAIT. TALK TO US', go: 'talk' }] },
  } },
  r_rep3: { who: 'voss', nodes: {
    start: { say: (s) => `${f(s).asharFate === 'saved' ? 'TEL-ASHAR IS STILL THERE. HIERARCH SENNA SENT ME A MESSAGE THAT JUST SAYS "THANK THEM". I THINK THAT\'S THE FIRST THANK-YOU THE ORRANS HAVE SENT THE FLEET IN A CENTURY.' : 'TEL-ASHAR... THE ORRANS SAY THERE NEVER WAS A COLONY THERE. THEIR MAPS SAY OTHERWISE. NOBODY CAN EXPLAIN IT.'} WHERE IS TEL NOW?`,
      opts: [{ t: 'GOING BACK TO THE FOLD', go: 'fold' }] },
    fold: { say: (s) => `${f(s).tel === 'talk' ? 'HE TOLD YOU THAT? THEN HE\'S ASKING FOR HELP, IN HIS WAY.' : 'TO FINISH WHAT HE STARTED, I\'D WAGER.'} HASKELL SAYS ONE MORE REWIND AT THE FOLD COULD UNDO EVERYTHING - OR UNDO US. GO, AURORA. END IT WHERE IT STARTED.`,
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR THE CERULEAN DEEP', do: (s) => { s.storyNext(5, 'cerulean', 'JUMP TO THE CERULEAN DEEP AND MEET THE SPINDLE AT THE FOLD'); s.camp.step = 'r3_jump'; return null; } }] },
  } },
  r_tel5: { who: 'tel', nodes: {
    start: { say: (s) => (f(s).tel === 'talk' ? 'AURORA. YOU STOOD BETWEEN MY PEOPLE AND THEIR GUNS. I HAVE NOT KNOWN WHAT TO DO WITH THAT. THE SPINDLE CAN REWIND ONCE MORE, HERE, WHERE TIME IS THIN. TELL ME WHAT TO UNDO.' : 'AURORA. ONE LAST REWIND, HERE AT THE FOLD, AND YOU WILL NEVER HAVE COME. I AM SORRY. I AM SO TIRED.'),
      opts: [
        { t: 'UNDO WHAT YOU ERASED - THEN LET US DESTROY THE SPINDLE', if: (s) => f(s).tel === 'talk', go: 'restore' },
        { t: 'AURORA - THE OTHER ONE. TAKE HIM INTO THE FOLD', if: (s) => f(s).other === 'saved', go: 'sacrifice' },
        { t: 'NOT TODAY, VIZIER. TACTICAL - FIRE', do: (s) => { s.rcSpindleFight(); s.rcStep('r4_fight'); return null; } },
      ] },
    restore: { say: 'THE ARRAY. YOUR ADMIRAL\'S MEMORY OF IT. EVERY HOLE I CUT. ...IT WILL TAKE THE SPINDLE EVERYTHING IT HAS, AND IT WILL NOT SURVIVE. KEEP THE HIERARCHY\'S ZEALOTS OFF ME WHILE IT WORKS.',
      opts: [{ t: 'WE\'LL HOLD THEM OFF', do: (s) => { s.camp.f.plan = 'restore'; s.rcStep('r4_hold'); return null; } }] },
    sacrifice: { who: 'aurora2', say: 'FSS AURORA - THE OTHER ONE. AUTOMATED. HASKELL LEFT ME ONE LAST ORDER, IN CASE: "IF THEY NEED A SHIP TO GO INTO THE FOLD, IT\'S US." COURSE PLOTTED. I HAVE ENJOYED BEING YOU.',
      opts: [{ t: '...GOODBYE, AURORA', do: (s) => { s.camp.f.plan = 'sacrifice'; s.rcSacrifice(); return null; } }] },
  } },
  r_fleet: { who: 'voss', nodes: {
    start: { say: (s) => (f(s).array === 'erased' && s.camp.ch >= 3 ? 'VOSS HERE. ...I KEEP WRITING "MARRIN" IN MY NOTES AND NOT KNOWING WHY. GO AHEAD, AURORA.' : 'VOSS HERE, AURORA. GO AHEAD.'),
      opts: [
        { t: 'CONFIRM OUR ORDERS', do: (s) => { s.sayAs('voss', 'YOUR ORDERS: ' + s.M.objective.replace(/^[A-Z ]+: /, '')); return 'start'; } },
        { t: 'WHAT DO WE KNOW SO FAR?', do: (s) => { s.sayAs('voss', s.rcSoFar()); return 'start'; } },
        { t: 'REQUEST A SITREP ON THE SHIP', do: (s) => { s.sayAs('voss', s.fleetSitrep()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
});

STORY.loop = {
  labels: REC_LABELS,
  fleet: () => 'r_fleet',
  lane: (s) => (s.camp.ch >= 2 ? 6 : 1),
  chapter: (s, ch) => s.rcChapter(ch),
  arrive: (s) => s.rcScene(),
  jump: (s, to) => s.rcJump(to),
  puzzle: (s, h, kind) => s.rcPuzzle(h, kind),
  archive: (s, h, hook) => s.rcArchive(hook),
};

export function installRecurrence(Sim) {
  Object.assign(Sim.prototype, {
    rcStart(ch) {
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('loop');
      const was = ch > 1 ? (save.fAt && save.fAt[ch]) || defaultsFor(ch) : {};
      this.camp = { id: 'loop', ch: 0, step: '', t: 0, loop: 0, f: { looped: 0, ...JSON.parse(JSON.stringify(was)) }, bondOf: (w) => this.rcBond(w) };
      const c = this.camp;
      this.greeted.add(0);
      if (ch >= 3) { const h = this.addArt('futurelog', 1); if (h) { this.puzStart(h, 1); h.ident = 2; } }
      if (ch >= 4) { const h = this.addArt('chroniton', 1); if (h) { this.puzStart(h); h.pz.done = true; h.ident = 2; } }
      c.next = { ch, sys: ['', 'cerulean', 'cerulean', 'halcyon', 'orra', 'cerulean'][ch] };
      this.P.dock = 0;
      this.arrive(SYS_INDEX[c.next.sys]);
      if (ch <= 2) this.rcPlace();
    },
    rcPlace() { const P = this.P; P.x = START[0]; P.y = START[1]; P.hdg = P.desHdg = 0; P.speed = 0; P.vx = P.vy = 0; P.throttle = 0; P.thrFrac = null; },
    rcChapter(ch) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('loop');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = JSON.parse(JSON.stringify(c.f));
      (sv.fAt || (sv.fAt = {}))[ch] = JSON.parse(JSON.stringify(c.f));
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `${REC_LABELS[ch - 1]}: ${REC_CHAPTERS[ch - 1]}`);
      if (ch >= 3) { c.spinId = undefined; c.spinBroken = false; }
      this.rcStep(['', 'r0_brief', 'r1_other', 'r2_arrive', 'r3_senna', 'r4_meet'][ch]);
      if (ch === 1) this.after(3, () => this.startDialog('r_voss0', FROM_COMMAND));
      this.rcScene();
    },
    rcSay(who, text, col = 3, from = FROM_CREW) { this.say(from, col, text); this.msgs[0].who = who; const ch = CHARS[who]; if (ch && ch.civ >= 3) this.msgs[0].lang = ch.civ; },
    rcObjective() {
      const c = this.camp, s = c.step, F = c.f;
      const O = {
        r0_brief: 'STAND BY - ADMIRAL VOSS IS CALLING',
        r0_go: `SURVEY THE TEMPORAL FOLD - SECTOR ${FOLD_SECTOR} (MARKED). SCIENCE: FULL-SCAN IT`,
        r0_loop: c.loop ? `SURVEY THE TEMPORAL FOLD. ...THIS FEELS FAMILIAR${this.hasArt('echo') && !F.echo ? ' - SCIENCE: THE FOLD ECHO IS IN THE ARTEFACT HOLD' : ''}` : 'SURVEY THE TEMPORAL FOLD - SCIENCE: FULL-SCAN IT',
        r1_other: 'THE SHIP FROM THE FOLD IS HAILING - COMMS: ANSWER',
        r1_beam: 'BEAM HASKELL ACROSS: WITHIN 5K OF THE OTHER AURORA, SHIELDS DOWN',
        r1_crystal: 'SCIENCE: ARTEFACT HOLD > FUTURE LOG CRYSTAL - CRACK IT AND READ IT ON THE VIEWER',
        r2_arrive: 'APPROACH THE EPSILON ARRAY - THE SPINDLE IS HERE',
        r2_fight: `${F.tshield ? 'TEMPORAL SHIELDING ONLINE - BREAK THE SPINDLE' : 'THE SPINDLE REWINDS ITS DAMAGE - SCIENCE: MATCH THE CHRONITON WAVEFORM FOR TEMPORAL SHIELDING'}. ERASURE IN ${Math.max(0, Math.ceil(c.erase || 0))}s`,
        r3_senna: 'THE BASTION OF ORR IS HAILING',
        r3_find: 'FIND THE SPINDLE ABOVE THE COLONY AT TEL-ASHAR (MARKED)',
        r3_defend: `DON'T FIRE ON THE SPINDLE - KEEP SENNA'S ZEALOTS OFF IT - ${Math.max(0, Math.ceil(45 - (c.t || 0)))}s`,
        r3_fight: F.tshield ? 'BREAK THE SPINDLE' : 'BREAK THE SPINDLE (IT REWINDS - TEMPORAL SHIELDING NEEDED)',
        r4_meet: 'THE SPINDLE IS AT THE FOLD (MARKED) - GO TO IT',
        r4_hold: `HOLD OFF THE ZEALOTS WHILE THE SPINDLE UNDOES ITS ERASURES - ${Math.floor(c.restore || 0)}%`,
        r4_fight: 'DESTROY THE SPINDLE',
      };
      return O[s] || '';
    },
    rcStep(k) { const c = this.camp; c.step = k; c.t = 0; const o = this.rcObjective(); if (o) this.setObjective(this.campTag() + o); },
    rcScene() {
      const c = this.camp, sid = this.sysDef.id;
      if (sid === 'cerulean' && c.ch <= 2 && (c.foldId === undefined || !this.npc[c.foldId].active)) this.rcFold();
      if (sid === 'cerulean' && c.ch === 2 && c.otherId === undefined) {
        const id = this.rcOther(FOLD[0], FOLD[1] + 2500, true);
        this.after(5, () => { if (id !== undefined && !this.dlg) this.startDialog('r_noor1', id); });
      }
      if (sid === 'halcyon' && c.ch === 3 && c.spinId === undefined) {
        this.greeted.add(0);
        this.rcSpindle(this.npc[0].x + 4000, this.npc[0].y - 3000);
        c.erase = 75;
        this.addArt('chroniton', 0);
        this.clearMarkers(); this.addMarker(this.npc[0].x, this.npc[0].y, MK_AREA, 7000);
      }
      if (sid === 'orra' && c.ch === 4 && c.ashId === undefined) {
        this.greeted.add(0); this.npc[0].talk = 'r_senna';
        const id = this.spawnAt(CT_STARBASE, F_NEUTRAL, ASHAR[0], ASHAR[1], 0);
        if (id !== NO_ID) { Object.assign(this.npc[id], { civ: CIV_ORRAN, name: 'TEL-ASHAR HABITAT', short: 'TEL-ASHAR', scan: 2, shMax: 60, shields: 60, note: 'AN ORRAN COLONY HABITAT. FORTY THOUSAND LIFE SIGNS.' }); c.ashId = id; this.greeted.add(id); }
        this.rcSpindle(ASHAR[0] + 3000, ASHAR[1] - 2500);
        this.npc[c.spinId].talk = 'r_tel4';
        this.after(4, () => { if (c.step === 'r3_senna' && !this.dlg) this.startDialog('r_senna', 0); });
      }
      if (sid === 'cerulean' && c.ch === 5 && c.spinId === undefined) {
        this.rcFold();
        this.rcSpindle(FOLD[0] + 2500, FOLD[1] + 1500);
        this.npc[c.spinId].talk = 'r_tel5'; this.npc[c.spinId].faction = F_NEUTRAL;
        if (c.f.other === 'saved') this.rcOther(FOLD[0] - 4000, FOLD[1] + 8000, false);
        this.clearMarkers(); this.addMarker(FOLD[0], FOLD[1], MK_AREA, 6000);
      }
    },
    rcFold() {
      const c = this.camp;
      const id = this.spawnAt(CT_ANOMALY, F_NEUTRAL, FOLD[0], FOLD[1], 0);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { name: 'TEMPORAL FOLD', short: 'FOLD', scan: 1, fold: true, note: 'A KNOT IN SPACETIME, A FEW HUNDRED METRES ACROSS. CHRONITON FLUX IS OFF THE SCALE, AND IT\'S RISING ON A CYCLE - ABOUT NINETY SECONDS LONG.' });
      c.foldId = id;
      this.clearMarkers(); this.addMarker(FOLD[0], FOLD[1], MK_AREA, 5000);
    },
    rcSpindle(x, y) {
      const c = this.camp;
      const id = this.spawnAt(CT_DESTROYER, F_NEUTRAL, x, y, 0);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { ai: AI_STATIC, civ: CIV_ORRAN, name: 'THE SPINDLE', short: 'SPINDLE', scan: 2, spindle: true, shMax: 160, shields: 160, talk: 'r_tel3', talkCtx: {},
        note: 'AN ORRAN SHIP OF A DESIGN THREE CENTURIES OLD, WRAPPED IN A FIELD THAT READS AS... BACKWARDS. ITS HULL IS IN SEVERAL MOMENTS AT ONCE.' });
      c.spinId = id; c.rewinds = 0; c.spinBroken = false; this.greeted.add(id);
    },
    rcOther(x, y, dying) {
      const c = this.camp;
      const id = this.spawnAt(CT_DESTROYER, F_FRIEND, x, y, 180);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { ai: AI_STATIC, civ: CIV_FLEET, name: 'FSS AURORA', short: 'AURORA (2)', scan: 2, hull: dying ? 38 : 70, shMax: 0, shields: 0, eng: dying ? 0 : 60, talk: dying ? 'r_noor1' : null, talkCtx: {}, other: true,
        note: 'OUR TRANSPONDER. OUR REGISTRY. OUR HULL - SCORCHED, PATCHED, THREE WEEKS OLDER. ONE LIFE SIGN ABOARD. HER WARP CORE IS FAILING.' });
      this.greeted.add(id);
      c.otherId = id;
      return id;
    },
    // ---- the teaser's loop
    rcLoopTick(dt) {
      const c = this.camp, P = this.P;
      c.loopT = (c.loopT || 0) + dt;
      const L = c.loop;
      if (c.loopT > 8 && !c.lt1) { c.lt1 = true; this.say(FROM_CREW, 1, L ? 'CHRONITON SURGE FROM THE FOLD - ...THAT\'S THE SAME READING AS... NO. NEVER MIND.' : 'CHRONITON SURGE FROM THE FOLD - RADIATION RISING. RECOMMEND SHIELDS, CAPTAIN.'); }
      if (c.loopT > 22 && !c.lt2) {
        c.lt2 = true;
        const [x, y] = [FOLD[0], FOLD[1] + 1200];
        const id = this.spawnAt(CT_DESTROYER, F_NEUTRAL, x, y, bearingTo(x, y, P.x, P.y));
        if (id !== NO_ID) { Object.assign(this.npc[id], { ai: AI_STATIC, speed: 0, scan: 0, name: 'UNKNOWN VESSEL', short: 'UNKNOWN', shMax: 0, shields: 0, inbound: true }); c.vesselId = id; this.boomAt(x, y, 2); this.emit(K.EV_WARP_IN, id); }
        this.say(FROM_CREW, 2, L >= 2 ? 'SHE\'S COMING OUT OF THE FOLD - THE SAME SHIP. IT\'S ALWAYS THE SAME SHIP, ISN\'T IT?' : 'SOMETHING IS COMING OUT OF THE FOLD - A SHIP! SHE\'S OUT OF CONTROL, HEADING STRAIGHT FOR US!');
        if (L >= 4 && !c.f.echo) this.after(3, () => this.say(FROM_CREW, 1, 'CAPTAIN - I DON\'T KNOW HOW I KNOW THIS. SHIELDS DOWN. ALL STOP. NOW.'));
      }
      if (c.vesselId !== undefined) { // she comes straight at us
        const n = this.npc[c.vesselId];
        if (n.active) {
          const d = distTo(n.x, n.y, P.x, P.y), pull = c.loop === 0 || P.shieldRaise > 0.05 || Math.abs(P.speed) > 12; // the first time, it always happens
          n.hdg = n.desHdg = bearingTo(n.x, n.y, P.x, P.y);
          const v = pull ? Math.max(260, d / Math.max(1, 40 - c.loopT)) : 160;
          if (!pull && d < 1500) { // she slides past
            c.f.looped = c.loop; this.rcLoopBroken(); return;
          }
          n.x += Math.sin(n.hdg * DEG) * v * dt * (pull || d > 1500 ? 1 : 0); n.y -= Math.cos(n.hdg * DEG) * v * dt * (pull || d > 1500 ? 1 : 0);
          if (c.loopT > 30 && !c.lt3) { c.lt3 = true; this.say(FROM_CREW, 2, pull ? 'SHE\'S ACCELERATING - IT\'S LIKE SOMETHING IS PULLING HER IN! COLLISION IN SECONDS!' : 'SHE\'S DRIFTING... SLOWING... SHE\'S GOING TO MISS US!'); }
          if (pull && (d < 400 || c.loopT > 42)) { this.rcLoopReset(); return; }
          if (!pull && c.loopT > 48) { c.f.looped = c.loop; this.rcLoopBroken(); return; }
        }
      }
    },
    rcLoopReset() {
      const c = this.camp, P = this.P;
      this.boomAt(P.x, P.y, 3); this.emit(K.EV_HIT);
      this.say(FROM_CREW, 2, 'BRACE FOR IMPACT-');
      // ...and it's ninety seconds ago
      if (c.vesselId !== undefined) { const n = this.npc[c.vesselId]; n.active = false; n.alive = false; c.vesselId = undefined; }
      c.loop++; c.loopT = 0; c.lt1 = c.lt2 = c.lt3 = false;
      this.rcPlace(); P.shieldsOn = false; P.shieldRaise = 0; P.hull = 100; for (let i = 0; i < P.health.length; i++) P.health[i] = 100;
      P.autopilot = K.AP_OFF;
      this.say(FROM_COMPUTER, 3, `TIME INDEX ERROR - RESYNCHRONISING... ${c.loop >= 2 ? `(THIS ERROR HAS BEEN LOGGED ${c.loop + 1} TIMES TODAY)` : ''}`);
      const DJ = [
        'HAS ANYONE ELSE GOT THE STRANGEST FEELING WE\'VE DONE THIS BEFORE?',
        'THE FOLD... I KNOW THIS FOLD. I KNOW WHAT IT\'S GOING TO DO. HOW DO I KNOW THAT?',
        'CAPTAIN, THE SENSOR LOGS HAVE ENTRIES TIME-STAMPED IN THE NEXT NINETY SECONDS. WE\'RE IN A LOOP. AND WE KEEP LOSING.',
        'WE\'VE BEEN HERE AT LEAST FIVE TIMES. EVERY TIME, SHE HITS US BECAUSE SOMETHING PULLS HER IN. WHAT ARE WE DOING THAT PULLS HER IN?',
      ];
      this.after(3, () => this.say(FROM_CREW, 1, DJ[Math.min(DJ.length - 1, c.loop - 1)]));
      if (c.loop === 1) this.after(7, () => { if (!this.hasArt('echo')) { this.addArt('echo', 1); this.say(FROM_CREW, 0, 'SCIENCE HERE - THERE\'S A SIGNAL INSIDE THE FOLD. IT\'S USING OUR TRANSPONDER CODE. IT\'S IN THE ARTEFACT HOLD AS "FOLD ECHO" - I CAN TRY TO MATCH IT.'); } });
      if (c.f.echo) this.after(6, () => this.say(FROM_CREW, 3, 'THE MESSAGE FROM THE FOLD, CAPTAIN: WHEN SHE COMES - SHIELDS DOWN, ALL STOP.'));
      this.rcStep('r0_loop');
    },
    rcLoopBroken() {
      const c = this.camp;
      const n = this.npc[c.vesselId]; if (n) { n.active = false; }
      const id = this.rcOther(n ? n.x : FOLD[0], n ? n.y : FOLD[1], true);
      c.vesselId = undefined; c.loopDone = true;
      this.say(FROM_CREW, 3, 'SHE SLID RIGHT PAST US! ...CAPTAIN. HER TRANSPONDER. SHE\'S THE FSS AURORA. SHE\'S US.');
      this.after(4, () => { c.next = { ch: 2, sys: 'cerulean' }; this.storyArrive(); });
      this.after(9, () => { if (id !== undefined && !this.dlg) this.startDialog('r_noor1', id); });
    },
    rcJump(to) {
      const c = this.camp, sid = sysAt(to).id;
      if (c.step === 'r1_jump' && sid === 'halcyon' && c.f.noor === 'aboard') this.after(8, () => { if (this.P.jumping > 0 && !this.dlg) this.startDialog('r_lane2', FROM_CREW, { answered: true }); });
      const cr = this.P.arts.find((h) => G.ART[h.a].id === 'futurelog');
      if (cr && !(cr.pz && cr.pz.done) && !c.f.cracked) this.after(4, () => this.say(FROM_CREW, 0, `THE FUTURE LOG CRYSTAL IS DRAGGING ON THE FIELD - ${Math.round(this.P.jumpLen)} SECONDS IN THE LANE. SCIENCE: ARTEFACT HOLD > FUTURE LOG CRYSTAL. LET'S READ OUR OWN NEXT THREE WEEKS.`));
    },
    rcPuzzle(h, kind) {
      const c = this.camp, id = G.ART[h.a].id;
      if (id === 'echo') {
        c.f.echo = true;
        const L = [['computer', 'SIGNAL RECOVERED. PLAYING.'], ['aurora2', `"THIS IS THE FSS AURORA. WE HAVE COLLIDED WITH YOU ${Math.max(2, c.loop)} TIMES. YOUR SHIELD BUBBLE CATCHES OUR WARP FIELD AND PULLS US IN. WHEN WE COME OUT OF THE FOLD: SHIELDS DOWN. ALL STOP. PLEASE."`]];
        L.forEach(([w, t], i) => this.after(1 + i * 4, () => this.rcSay(w, t, 3, FROM_COMPUTER)));
        this.after(10, () => this.say(FROM_CREW, 1, 'OUR OWN SHIP. TALKING TO US. ...SHIELDS DOWN, ALL STOP, WHEN SHE COMES. EVERYONE GOT THAT?'));
      }
      if (id === 'futurelog' && kind === 'cipher') { c.f.cracked = true; this.after(1, () => this.say(FROM_CREW, 3, 'WE\'RE IN. OUR OWN LOGS - THE NEXT THREE WEEKS. SCIENCE CAN OPEN THEM ON THE VIEWER. I\'M NOT SURE I WANT TO READ THEM.')); }
      if (id === 'chroniton') {
        c.f.tshield = true;
        this.say(FROM_CREW, 3, 'SHIELD GRID PHASED TO THE CHRONITON WAVE - TEMPORAL SHIELDING IS ONLINE! WE\'RE OUTSIDE ITS HISTORY NOW.');
        if (c.f.noor === 'aboard') this.after(3, () => this.rcSay('noor', 'THAT\'S IT. THAT\'S WHAT WE FIGURED OUT TOO LATE. NOW IT CAN\'T TAKE BACK WHAT WE DO TO IT.', 3));
        if (c.step === 'r2_fight' || c.step === 'r3_fight') this.setObjective(this.campTag() + this.rcObjective());
      }
    },
    rcArchive(hook) {
      const c = this.camp, F = c.f;
      F[hook] = true;
      if (hook === 'kalos' && F.noor === 'aboard') this.after(3, () => this.rcSay('noor', 'I WAS ON THE BRIDGE WHEN KALOS WENT. ONE MOMENT IT WAS ON THE SCREEN. THE NEXT, WE WERE AIMED AT EMPTY SPACE AND NOBODY KNEW WHY.', 1));
      if (hook === 'ashar') this.after(3, () => this.say(FROM_CREW, 1, 'WE DO THAT. THREE WEEKS FROM NOW, WE KILL FORTY THOUSAND PEOPLE. ...UNLESS WE DON\'T.'));
    },
    rcSoFar() {
      const c = this.camp, F = c.f, out = [];
      out.push(F.looped ? `YOU WERE CAUGHT IN A LOOP AT THE FOLD - ${F.looped + 1} TIMES, BY YOUR LOGS.` : 'THERE\'S A TEMPORAL FOLD IN THE CERULEAN DEEP.');
      if (c.ch >= 2) out.push('THE SHIP FROM THE FOLD IS THE AURORA, THREE WEEKS OLDER.');
      if (F.spindle) out.push('AN ORRAN TIMESHIP, THE SPINDLE, IS ERASING HISTORY.');
      if (F.array === 'erased') out.push('YOU SAY THERE WAS A STATION AT HALCYON. I HAVE NO RECORD OF IT.');
      if (F.ashar) out.push('YOUR OWN LOGS SAY YOU DESTROY TEL-ASHAR.');
      if (F.tel === 'talk') out.push('VIZIER TEL HAS STOPPED FIGHTING YOU.');
      return out.join(' ');
    },
    // ---- the Spindle: hit it and it rewinds, unless the Aurora has temporal shielding
    rcSpindleFight() {
      const c = this.camp, n = this.npc[c.spinId];
      if (!n) return;
      n.faction = F_HOSTILE; n.ai = AI_ATTACK; n.aiTarget = US; n.talk = null;
      this.M.foes = this.M.foes.filter((id) => this.npc[id].active && this.npc[id].alive);
      if (!this.M.foes.includes(c.spinId)) this.M.foes.push(c.spinId);
      this.P.target = c.spinId;
      if (c.ch === 3) this.rcStep('r2_fight');
      if (c.ch === 4) this.rcStep('r3_fight');
    },
    rcSpindleTick() {
      const c = this.camp, n = this.npc[c.spinId];
      if (!n || n.faction !== F_HOSTILE || c.spinBroken) return;
      if (!n.alive) { c.spinBroken = true; this.rcSpindleDown(n); return; }
      if (!n.active) return;
      if (n.hull < 40 && !c.f.tshield) { // it rolls itself back
        c.rewinds = (c.rewinds || 0) + 1;
        n.hull = 100; n.shields = n.shMax; this.boomAt(n.x, n.y, 1);
        const [x, y] = this.pointNear(n.x, n.y, 3000); n.x = x; n.y = y;
        if (c.rewinds <= 2 || c.rewinds % 5 === 0) this.say(FROM_CREW, 2, c.rewinds === 1 ? 'IT... REWOUND. HULL BACK TO FULL - IT\'S A MINUTE AGO FOR THAT SHIP. OUR DAMAGE NEVER HAPPENED!' : 'IT REWOUND AGAIN! WE NEED THAT TEMPORAL SHIELDING - SCIENCE, THE CHRONITON WAVEFORM!');
        if (c.ch === 4 && c.ashId !== undefined && this.npc[c.ashId].active && !c.f.asharFate) { // the history Tel was afraid of
          const a = this.npc[c.ashId];
          a.active = false; a.alive = false; c.f.asharFate = 'lost';
          this.after(2, () => this.say(FROM_CREW, 2, 'CAPTAIN... TEL-ASHAR. IT\'S NOT ON SENSORS. IT\'S NOT ON THE CHARTS. IT WAS NEVER THERE. ...WE DID IT. JUST LIKE THE LOG SAID.'));
          this.after(5, () => this.rcSay('tel', 'AND SO IT HAPPENS. AGAIN.', 1, c.spinId));
        }
      }
      if (n.hull < 30 && c.f.tshield) { c.spinBroken = true; this.rcSpindleDown(n); }
    },
    rcSpindleDown(n) { // broken (or destroyed) by a ship it can't rewind
      const c = this.camp;
      if (n.alive) {
        n.ai = AI_SURRENDER; n.faction = F_NEUTRAL; n.speed = 0;
        this.rcSay('tel', c.ch === 4 ? 'ENOUGH. YOU HAVE PROVED YOU CAN. I WILL BE AT THE FOLD, AURORA. END IT THERE.' : 'YOUR SHIELDING... YOU ARE OUTSIDE MY REACH. THEN I WILL GO WHERE YOU ARE GOING.', 1, c.spinId);
        if (c.ch !== 5) this.after(4, () => { this.npcLeave([c.spinId]); this.campRemove(c.spinId, 10); });
      }
      {
        if (c.ch === 3) this.rcHalcyonDone();
        if (c.ch === 4) { if (!c.f.asharFate) c.f.asharFate = 'saved'; this.after(6, () => this.storyReport('r_rep3')); c.step = 'r3_report'; }
        if (c.ch === 5) this.rcEnding('destroyed');
      }
    },
    rcHalcyonDone() {
      const c = this.camp;
      if (!c.f.array) c.f.array = 'saved';
      c.step = 'r2_report';
      this.after(3, () => { this.say(0, 3, 'AURORA, MARRIN. I DON\'T KNOW WHAT THAT WAS. FOR A MOMENT I COULDN\'T REMEMBER MY MOTHER\'S NAME. ...THANK YOU.'); this.msgs[0].who = 'marrin'; });
      this.after(8, () => this.storyReport('r_rep2'));
    },
    rcErase() { // the Array was never there - and the comms log forgets Marrin ever spoke
      const c = this.camp, st = this.npc[0];
      c.f.array = 'erased';
      if (st && st.active) { this.boomAt(st.x, st.y, 2); st.active = false; st.alive = false; }
      this.msgs = this.msgs.filter((m) => m.who !== 'marrin' && m.from !== 0);
      this.say(FROM_CREW, 2, 'THE ARRAY - IT\'S GONE. NOT DESTROYED. NO DEBRIS. NO RECORD. ...THE COMMS LOG, CAPTAIN. EVERYTHING MARRIN EVER SAID TO US IS GONE FROM IT.');
      const n = this.npc[c.spinId]; if (n && n.alive) { n.ai = AI_SURRENDER; n.faction = F_NEUTRAL; this.after(3, () => { this.npcLeave([c.spinId]); this.campRemove(c.spinId, 10); }); }
      this.after(5, () => this.rcSay('tel', 'ONE THREAD CUT. THERE ARE MORE, AURORA. I WILL BE AT ORRA.', 1, c.spinId));
      c.step = 'r2_report';
      this.after(10, () => this.storyReport('r_rep2'));
    },
    rcDefendTel() {
      const c = this.camp;
      this.rcStep('r3_defend');
      if (c.f.senna === 'calmed') { this.after(10, () => this.rcZealots(2, 'A HIERARCHY ZEALOT CAPTAIN IS DEFYING SENNA - GOING FOR THE SPINDLE!')); return; }
      this.after(4, () => this.rcZealots(3 + (this.M.diff >= 2 ? 1 : 0), 'SENNA\'S SHIPS ARE ATTACKING THE SPINDLE! IF IT REWINDS HERE...'));
    },
    rcZealots(n, line) {
      const c = this.camp, sp = this.npc[c.spinId] || this.P;
      const [x, y] = this.pointNear(sp.x, sp.y, 7000);
      c.zeal = c.zeal || [];
      for (let i = 0; i < n; i++) {
        const id = this.spawnFoe(i ? CT_RAIDER : CT_DESTROYER, this.clampSec(x + i * 1400), this.clampSec(y + (i % 2) * 1200), c.ch === 4 ? c.spinId : this.frand() < 0.5 ? c.spinId : US, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: CIV_ORRAN, name: 'HIERARCHY ZEALOT', short: `ZEALOT ${c.zeal.length + 1}`, scan: 2 });
        c.zeal.push(id);
      }
      this.emit(K.EV_WARP_IN);
      this.say(FROM_CREW, 2, line);
    },
    rcSacrifice() {
      const c = this.camp, o = this.npc[c.otherId];
      if (o && o.alive) { o.ai = 2; o.destX = FOLD[0]; o.destY = FOLD[1]; o.cruise = 120; o.eng = 100; }
      this.rcStep('r4_sac');
      this.setObjective(this.campTag() + 'THE OTHER AURORA IS TAKING THE SPINDLE INTO THE FOLD');
      c.sacT = 0;
    },
    rcBond(who) { return 0; },
    rcEnding(kind) {
      const c = this.camp, F = c.f;
      const T = {
        restored: ['EVERYTHING THAT WAS', 'THE SPINDLE SPENDS ITSELF UNDOING ITS OWN WORK, AND COMES APART IN THE FOLD WITH OSSAN TEL STILL ABOARD, SMILING. THE EPSILON ARRAY IS WHERE IT ALWAYS WAS. NOBODY BUT THE AURORA REMEMBERS THAT IT WASN\'T.'],
        sacrifice: ['THE OTHER AURORA', 'THE OTHER AURORA TAKES THE SPINDLE INTO THE FOLD, AND THE FOLD CLOSES BEHIND THEM BOTH. THE THREE WEEKS SHE CAME FROM NEVER HAPPEN. SOMEWHERE THAT ISN\'T ANYWHERE, A SHIP WITH YOUR NAME IS STILL FLYING.'],
        destroyed: ['THE THREAD IS CUT', 'THE SPINDLE BREAKS APART IN THE FOLD. WHAT IT ERASED STAYS ERASED - BUT NOTHING ELSE EVER WILL BE. THE FOLD CLOSES. THE CERULEAN DEEP IS QUIET.'],
      }[kind];
      const bits = [];
      if (kind !== 'restored') bits.push(F.array === 'erased' ? 'THERE IS NO EPSILON ARRAY AT HALCYON. THE AURORA\'S CREW KEEP A PICTURE OF DR. MARRIN ON THE BRIDGE ANYWAY.' : 'DR. MARRIN NEVER QUITE REMEMBERS HIS MOTHER\'S NAME AGAIN, BUT HE THINKS IT WAS SOMETHING LOVELY.');
      bits.push(F.asharFate === 'lost' ? 'TEL-ASHAR IS GONE FROM EVERY MAP. THE ORRANS CLOSE THEIR BORDER TO THE FLEET FOR A GENERATION.' : 'TEL-ASHAR STILL TURNS ABOVE ORRA PRIME. A SMALL MONUMENT IN ITS PLAZA SHOWS A FLEET SHIP WITH ITS SHIELDS DOWN.');
      bits.push(F.noor === 'aboard' ? 'NOOR HASKELL STAYS ABOARD AS CHIEF ENGINEER. A MONTH LATER, AT MERIDIAN, A YOUNG ENGINEER WITH HER FACE APPLIES FOR THE SAME POST. THEY GET ALONG UNSETTLINGLY WELL.' : '');
      c.ending = { kind, title: T[0], text: [T[1], ...bits].filter(Boolean).join(' '), allies: [] };
      this.campSaveOf('loop').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    rcOnScan(id) {
      const c = this.camp, n = this.npc[id];
      if (n && n.fold && n.scan >= 2 && c.step === 'r0_go') { this.say(FROM_CREW, 3, 'FOLD SCANNED. CHRONITON FLUX IS RISING ON A NINETY-SECOND CYCLE... AND THE NEXT PEAK IS NOW.'); this.rcStep('r0_loop'); }
    },
    rcTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      this.storyTick();
      const near = (id, r) => id !== undefined && id !== NO_ID && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      this.rcSpindleTick();
      switch (c.step) {
        case 'r0_go': if (near(c.foldId, 12000) && c.t > 4 && !c.goWarned) { c.goWarned = true; this.say(FROM_CREW, 0, 'FOLD IN SENSOR RANGE. SCIENCE, START YOUR SCAN.'); } if (near(c.foldId, 16000) && c.t > 30) this.rcStep('r0_loop'); break;
        case 'r0_loop': if (sid === 'cerulean' && !c.loopDone) this.rcLoopTick(dt); break;
        case 'r1_beam': {
          const n = this.npc[c.otherId];
          if (!n || !n.alive) { this.rcStep('r1_crystal'); break; }
          if (near(c.otherId, 5000) && P.shieldRaise < 0.05) {
            c.f.noor = 'aboard'; this.bondSet('noor', Math.max(2, this.bondOf('noor')));
            this.emit(K.EV_REFINED);
            this.say(FROM_CREW, 3, 'ONE TO BEAM ACROSS - LIEUTENANT HASKELL IS ABOARD. SHE\'S CARRYING A DATA CRYSTAL.');
            this.addArt('futurelog', 1);
            this.after(3, () => this.rcSay('noor', 'OUR LOGS. EVERYTHING THAT HAPPENS IN THE NEXT THREE WEEKS. YOUR LOCK - WELL, MY LOCK. YOU\'LL HAVE TO CRACK IT; I DON\'T KNOW YOUR CAPTAIN\'S CODE YET.', 3));
            if (c.f.other !== 'saved') this.after(12, () => { const o = this.npc[c.otherId]; if (o && o.alive) { o.alive = false; o.deadAt = this.now; this.boomAt(o.x, o.y, 3); this.say(FROM_CREW, 2, 'THERE SHE GOES. ...WE JUST WATCHED OURSELVES DIE, CAPTAIN.'); } });
            else { n.talk = null; this.after(8, () => this.rcSay('aurora2', 'FSS AURORA, AUTOMATED. CORE STABLE. I WILL FOLLOW YOU, AURORA, AT A DISTANCE. IN CASE.', 3, c.otherId)); }
            this.rcStep('r1_crystal');
          }
          break;
        }
        case 'r1_crystal': if (c.f.cracked && !this.fleetCall && c.t > 3 && !c.rep1) { c.rep1 = true; this.storyReport('r_rep1'); } break;
        case 'r2_arrive':
          if (sid === 'halcyon' && near(c.spinId, 14000) && !this.dlg && !c.telSpoke) { c.telSpoke = true; this.say(FROM_CREW, 2, 'THE SPINDLE - IN ORBIT OF THE ARRAY. ITS FIELD IS SPREADING OVER THE STATION. SCIENCE HAS RECORDED THE WAVE - IT\'S IN THE ARTEFACT HOLD.'); this.after(2, () => this.startDialog('r_tel3', c.spinId)); }
          if (c.telSpoke && c.t > 40 && this.npc[c.spinId].faction !== F_HOSTILE && !this.dlg) this.rcSpindleFight();
          break;
        case 'r2_fight':
          c.erase -= dt * (c.f.tshield ? 0.35 : 1);
          this.setObjective(this.campTag() + this.rcObjective());
          if (c.erase <= 0 && c.f.array !== 'erased') this.rcErase();
          break;
        case 'r3_find':
          if (near(c.spinId, 11000) && !this.dlg && !c.tel4) { c.tel4 = true; this.startDialog('r_tel4', c.spinId); }
          break;
        case 'r3_defend': {
          const sp = this.npc[c.spinId];
          if (sp && sp.hull < 40 && !c.f.asharFate) { // the zealots got it to the edge: it rewinds, and takes the colony
            sp.faction = F_HOSTILE; this.rcSpindleTick(); sp.faction = F_NEUTRAL; sp.ai = AI_STATIC;
          }
          this.setObjective(this.campTag() + this.rcObjective());
          const z = (c.zeal || []).filter((id) => this.hostileAlive(id)).length;
          if (c.t >= 45 && !z) {
            if (!c.f.asharFate) c.f.asharFate = 'saved';
            this.rcSay('tel', 'YOU DID NOT FIRE. IN ALL THE HISTORIES I REMEMBER, YOU FIRED. ...I WILL BE AT THE FOLD, AURORA. COME, AND WE WILL END THIS TOGETHER.', 3, c.spinId);
            this.after(4, () => { this.npcLeave([c.spinId]); this.campRemove(c.spinId, 10); });
            this.after(8, () => this.storyReport('r_rep3')); c.step = 'r3_report';
          }
          break;
        }
        case 'r4_meet':
          if (near(c.spinId, 9000) && !this.dlg && !c.tel5) { c.tel5 = true; this.startDialog('r_tel5', c.spinId); }
          break;
        case 'r4_hold': {
          c.restore = Math.min(100, (c.restore || 0) + dt * 100 / 70);
          if (c.t > 6 && !c.z1) { c.z1 = true; this.rcZealots(3, 'HIERARCHY ZEALOTS - THEY FOLLOWED THE SPINDLE HERE. THEY WANT IT FOR THEMSELVES!'); }
          if (c.t > 36 && !c.z2) { c.z2 = true; this.rcZealots(2 + (this.M.diff >= 1 ? 1 : 0), 'MORE ZEALOTS!'); }
          const sp = this.npc[c.spinId];
          if (!sp || !sp.alive) { this.say(FROM_CREW, 2, 'THE SPINDLE IS GONE - THE RESTORATION WITH IT.'); this.rcEnding('destroyed'); return; }
          this.setObjective(this.campTag() + this.rcObjective());
          if (c.restore >= 100) {
            if (c.f.array === 'erased') { c.f.array = 'restored'; }
            if (c.f.asharFate === 'lost') c.f.asharFate = 'restored';
            for (const id of c.zeal || []) if (this.hostileAlive(id)) this.npcLeave([id]);
            this.rcSay('tel', 'IT IS DONE. EVERY THREAD MENDED. TELL MY DAUGHTER... NO. SHE WILL NEVER KNOW ANYTHING WAS WRONG. THAT IS THE POINT.', 3, c.spinId);
            this.after(4, () => { const n = this.npc[c.spinId]; if (n && n.alive) { n.alive = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 3); } });
            this.after(7, () => this.rcEnding('restored'));
            c.step = 'r4_done';
          }
          break;
        }
        case 'r4_sac': {
          c.sacT += dt;
          const o = this.npc[c.otherId], sp = this.npc[c.spinId];
          if (o && sp && sp.alive) { sp.ai = AI_STATIC; if (distTo(o.x, o.y, sp.x, sp.y) < 2500 || c.sacT > 30) { sp.x = o.x; sp.y = o.y; } }
          if (c.sacT > 22 && !c.sacDone) {
            c.sacDone = true;
            for (const n of [o, sp]) if (n && n.alive) { n.alive = false; n.active = false; this.boomAt(n.x, n.y, 3); }
            this.say(FROM_CREW, 2, 'THEY\'RE IN THE FOLD - IT\'S COLLAPSING! ...IT\'S GONE. BOTH OF THEM. THE FOLD IS GONE.');
            this.after(5, () => this.rcEnding('sacrifice'));
          }
          break;
        }
      }
    },
  });
}
