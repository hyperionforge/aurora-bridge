// ============================================================================
// threshold.js - "THRESHOLD", told like an hour of television: a cold open, then five acts,
// each ending on a turn that sends the story somewhere new.
//   COLD OPEN   LATE ARRIVAL     The freighter SOLACE falls out of the Meridian lane nine days late by
//                                her clock, glazed in frost, chased by something white. Save her crew,
//                                catch her flight recorder, pull her last log out of the lane's noise -
//                                and hear, under it, a ship that was lost twenty-two years ago.
//   ACT ONE     LANE FROST       The lanes are failing; jumps take minutes. Voss briefs the crew in the
//                                lane. At Vel'anar the Velori guild has been cutting lane anchors open
//                                for "lane silk". The anchor's core shard comes aboard - and the wraiths
//                                come for it. Guildmistress Ithel tells what she sold to the Fleet.
//   ACT TWO     THE LIGHTHOUSE   The shard drags on the jump field: the crew solves its rings in the lane.
//               KEY              It is a key to a language. Marrin: the lanes are a machine. Commodore Dace
//                                of Fleet Intelligence comes for the probe Ithel sold. Wraiths at the Array.
//   ACT THREE   GHOST SIGNAL     The probe's data crystal is cracked in the lane, and read on the viewer:
//                                Project THRESHOLD, the ISV LODESTAR, a security officer called Dace who
//                                buried 140 people alive. Find the buoy, give the code, hear Neve Castellan
//                                - eleven weeks into a twenty-two year night. Dace wants the buoy gone.
//   ACT FOUR    THE KEEPER       The first lighthouse, by the broken moon of the Cerulean Deep. Match its
//                                carrier and the Keeper of the Roads speaks. Dace comes to kill it and
//                                take the lanes for the Fleet.
//   ACT FIVE    THE DOOR         The Keeper opens a door, once. Hold it while the Lodestar comes home -
//                                or force it, or let the lane close on her.
// The campaign is built on story.js: Fleet Command on call, report-ins as cut-scenes, chapters
// starting on arrival, slow lanes, and science puzzles on the main viewer (puzzles.js).
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { STORY, chapterLabel } from './story.js';
import { ARCHIVES } from './puzzles.js';
import { SYS_INDEX, SYS_C, sysAt, CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_NONE, CIV_CHORUS, SK_MONOLITH } from './galaxy.js';
import { distTo, bearingTo, clampf, sectorName } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_POI, CT_BUOY, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, GS_RUN, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_WARPIN = 3, AI_ATTACK = 4, AI_FLEE = 5, AI_SURRENDER = 6;

export const THR_CHAPTERS = ['LATE ARRIVAL', 'LANE FROST', 'THE LIGHTHOUSE KEY', 'GHOST SIGNAL', 'THE KEEPER', 'THE DOOR'];
export const THR_LABELS = ['COLD OPEN', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE'];
export const THR_DESC = [
  'A FREIGHTER IS SIX HOURS OVERDUE ON THE MERIDIAN LANE. NOBODY TAKES SIX HOURS TO CROSS A LANE.',
  'THE JUMP LANES ARE FAILING. THE FROST ON THE SOLACE\'S HULL IS SOMETHING THE VELORI SELL.',
  'A SHARD FROM THE HEART OF A LANE ANCHOR, A PROBE NOBODY WILL TALK ABOUT, AND A COMMODORE WHO WANTS IT BACK.',
  'A DATA CRYSTAL TWENTY-TWO YEARS OLD, AND A SHIP THAT NEVER CAME HOME.',
  'SOMETHING BUILT THE LANES. SOMETHING STILL KEEPS THEM. IT IS IN PAIN.',
  'ONE DOOR, OPENED ONCE. HOLD IT.',
];
export const THR_BLURB = 'THE JUMP LANES ARE FAILING, A FREIGHTER FALLS OUT OF ONE NINE DAYS LATE, AND UNDER THE NOISE ON HER RECORDER A SHIP LOST TWENTY-TWO YEARS AGO IS STILL CALLING FOR HELP. A COLD OPEN AND FIVE ACTS.';
// what the choices default to when an act is started without playing the ones before it (only those made before it)
const DEFAULT_AT = {
  2: { rook: 'aboard', fray: true },
  3: { harv: 'bought', ithel: 'ally', rings: true },
  4: { marrin: 'gave', dace: 'defied' },
  5: { neve: 'trusts', told22: true, memo: true, fix: true, code: true, keeperNote: true, buoy: 'kept', daceFought: true },
  6: { keeper: 'agreed', harvestEnd: true, daceEnd: 'arrested' },
};
const defaultsFor = (ch) => { const out = {}; for (let k = 2; k <= ch; k++) Object.assign(out, DEFAULT_AT[k]); return out; };

// ---------------------------------------------------------------- places
// the end of the lane from system a toward system b (a little inside where ships arrive)
function laneMouth(a, b, d = 60000) {
  const A = sysAt(SYS_INDEX[a]), B = sysAt(SYS_INDEX[b]), an = Math.atan2(B.gy - A.gy, B.gx - A.gx);
  return [Math.round(SYS_C + Math.cos(an) * d), Math.round(SYS_C + Math.sin(an) * d)];
}
const BUOY = [54000, 78000];            // the Lodestar's last fix, deep in the Shroud's nebula
const DOOR = [112000, 116000];          // the thickest frost, near Outpost Null
const LIGHT = [44000, 56000];           // the first lighthouse, by the broken moon of the Cerulean Deep
export const BUOY_SECTOR = sectorName(BUOY[0], BUOY[1]);
const CODES = ['ALDER-SEVEN-NINE', 'ALDER-NINE-SEVEN', 'ASHFALL-SEVEN-NINE', 'THRESHOLD-ONE'];

// ---------------------------------------------------------------- the cast
Object.assign(CHARS, {
  rook: { name: 'CAPT. TAMSIN ROOK', role: 'FREIGHTER SOLACE', civ: CIV_COLONY, look: { skin: '#d2a078', hair: '#7a3c1e', uniform: '#5a6450', scar: true } },
  orel: { name: 'SKIFF-MASTER OREL', role: 'VELORI HARVEST GUILD', civ: CIV_VELORI, look: 'velori' },
  ithel: { name: 'GUILDMISTRESS ITHEL', role: 'VELORI MERCHANT GUILD - THE LANTERN', civ: CIV_VELORI, look: 'velori' },
  dace: { name: 'COMMODORE ARLEN DACE', role: 'FLEET INTELLIGENCE', civ: CIV_FLEET, look: { skin: '#e8c8aa', hair: '#46464e', uniform: '#28283c', pips: 3 } },
  neve: { name: 'CAPT. NEVE CASTELLAN', role: 'ISV LODESTAR', civ: CIV_FLEET, look: { skin: '#8c5a3c', hair: '#1a1a1a', uniform: '#b48c28' } },
  keeper: { name: 'THE KEEPER', role: 'THE FIRST LIGHTHOUSE', civ: CIV_CHORUS, look: 'chorus' },
  wraith: { name: 'LANE WRAITH', role: 'UNKNOWN', civ: CIV_CHORUS, look: 'chorus' },
  thrbuoy: { name: 'THRESHOLD RELAY', role: 'FLEET BUOY - SEALED', civ: CIV_NONE, look: 'computer' },
});

// ---------------------------------------------------------------- story items (cargo.js ART)
G.ART.push(
  { id: 'recorder2', name: 'SOLACE FLIGHT RECORDER', unk: 'FROSTED FLIGHT RECORDER', fx: {}, story: true, puz: ['tune'], tune: [4, 7, 2],
    effect: 'THE SOLACE\'S BLACK BOX. ITS DATA IS SMEARED ACROSS THE LANE\'S CARRIER WAVE - MATCH THE CARRIER TO RECOVER IT.',
    puzHint: 'THE RECORDING IS SMEARED ACROSS THE LANE\'S CARRIER WAVE. MATCH OUR SIGNAL TO THE CARRIER - FREQUENCY, PHASE AND HARMONIC - AND THE COMPUTER CAN PULL THE AUDIO OUT.',
    lore: 'NINE DAYS OF LOG ENTRIES RECORDED IN SIX HOURS OF REAL TIME. AND UNDER THE LAST ONE, ANOTHER SHIP\'S VOICE.' },
  { id: 'anchorshard', name: 'LIGHTHOUSE KEY', unk: 'RINGED SHARD FROM A LANE ANCHOR', fx: {}, story: true, puz: ['rings'], drag: 1.6,
    effect: 'A KEY TO THE LANE-BUILDERS\' LANGUAGE. THE COMPUTER CAN NOW TRANSLATE MORE OF WHAT THE WRAITHS SAY. IT DRAGS ON THE JUMP FIELD.',
    puzHint: 'THREE RINGS OF GLYPHS AROUND A CORE, KNOCKED OUT OF TRUE WHEN IT WAS CUT FREE. IT HUMS - AND IT\'S DRINKING OUR JUMP FIELD. TURN THE RINGS UNTIL EVERY SPOKE RUNS STRAIGHT FROM THE CORE TO THE FRAME.',
    lore: 'EVERY ANCHOR CARRIES ONE OF THESE. ALIGNED, THE GLYPHS ARE A GRAMMAR - THE LANGUAGE THE LANES ARE WRITTEN IN.' },
  { id: 'datacrystal', name: 'THRESHOLD DATA CRYSTAL', unk: 'SEALED FLEET DATA CRYSTAL', fx: {}, story: true, puz: ['cipher', 'archive'], archive: 'threshold', drag: 1.4,
    effect: 'THE PROBE\'S MEMORY: PROJECT THRESHOLD. OPEN IT ON THE VIEWER AND READ IT TOGETHER.',
    puzHint: 'A FLEET SECURITY LOCK, TWENTY-TWO YEARS OLD. FOUR GLYPHS OPEN IT. IT WILL TELL US HOW CLOSE WE ARE - AND IT WILL NOTICE IF WE GUESS TOO OFTEN.',
    lore: 'THE PROBE WAS LAUNCHED FROM INSIDE A JUMP LANE. IT HAS BEEN DRIFTING OUT OF THE FROST FOR TWENTY-TWO YEARS.' },
  { id: 'carrier', name: 'KEEPER CARRIER SAMPLE', unk: 'RECORDING OF THE LIGHTHOUSE\'S HUM', fx: {}, story: true, puz: ['tune'], tune: [7, 3, 3],
    effect: 'THE FIRST LIGHTHOUSE\'S CARRIER. MATCH IT, AND IT CAN HEAR US.',
    puzHint: 'THE LIGHTHOUSE IS TALKING TO ITSELF ON A CARRIER WE DON\'T USE. MATCH IT - AND IT CAN HEAR US.',
    lore: 'SEVEN BEATS TO A CYCLE, A THIRD HARMONIC UNDER IT. CASTELLAN\'S NOTES CALLED IT "THE KEEPER\'S HEARTBEAT".' },
);
for (let i = 0; i < G.ART.length; i++) G.ART_INDEX[G.ART[i].id] = i;

// ---------------------------------------------------------------- the data crystal
ARCHIVES.threshold = [
  { title: 'MANIFEST - ISV LODESTAR', from: 'FLEET REGISTRY, SEALED 22 YEARS AGO',
    text: 'SURVEY TENDER ISV LODESTAR. CREW 140. COMMANDING: CAPT. NEVE CASTELLAN. ASSIGNED TO PROJECT THRESHOLD. CARGO: TWELVE LANE-BREAKER CHARGES. STATUS: LOST WITH ALL HANDS. NEXT OF KIN INFORMED: "REACTOR ACCIDENT".' },
  { title: 'PROJECT THRESHOLD', from: 'FLEET R&D - EYES ONLY',
    text: 'THE JUMP LANES ARE NOT A NATURAL FEATURE OF SPACE. SOMETHING HOLDS THEM OPEN. THRESHOLD WILL PIERCE A LANE WALL FROM THE INSIDE WITH SHAPED LANE-BREAKER CHARGES AND MAP WHAT LIES BEHIND IT. IF THE LANES CAN BE BUILT, THEY CAN BE OWNED.' },
  { title: 'SECURITY MEMO', from: 'LT. ARLEN DACE, PROJECT SECURITY', hook: 'memo',
    text: 'THE CHARGES WORKED TOO WELL. THE LODESTAR IS INSIDE THE WALL AND CANNOT GET OUT; HER SIGNALS REACH US TIME-SLOWED, DAYS FOR EVERY HOUR OF HERS. THE LANES WERE SHAKEN FOR A WEEK. RECOMMEND THRESHOLD BE SEALED, THE CREW DECLARED LOST, AND THE RECALL BUOY LEFT DARK. NO ONE CAN EVER LEARN THE LANES ARE BREAKABLE. - A.D.' },
  { title: 'LAST TELEMETRY', from: 'LODESTAR, FINAL PACKET', hook: 'fix', key: true,
    text: `LAST FIX BEFORE THE WALL CLOSED: THE SHROUD, SECTOR ${BUOY_SECTOR}, INSIDE THE NEBULA. THE RECALL BUOY WAS LEFT ON STATION THERE.` },
  { title: 'RECALL PROTOCOL', from: 'THRESHOLD OPERATIONS', hook: 'code', key: true,
    text: 'TO REACH A THRESHOLD VESSEL INSIDE A LANE, HAIL THE RECALL BUOY AND AUTHENTICATE WITH THE OPERATIONS CODE: ALDER-SEVEN-NINE. A WRONG CODE IS LOGGED. (DO NOT CONFUSE WITH THE PROBE CODE, ALDER-NINE-SEVEN.)' },
  { title: 'CASTELLAN - PERSONAL', from: 'CAPT. N. CASTELLAN', hook: 'keeper', lock: 'rings', lockMsg: 'ENCRYPTED IN THE LANE-BUILDERS\' GLYPHS - WE NEED THE LIGHTHOUSE KEY (THE SHARD\'S RINGS) TO READ IT.',
    text: 'DAY 9. THE WALL HEALS EVERY TIME WE CUT IT. THE WHITE SHAPES ARE NOT ATTACKING US - THEY ARE REPAIRING IT. WHATEVER THE LANES ARE, THEY ARE ALIVE, OR SOMETHING ALIVE TENDS THEM. I CALL IT THE KEEPER. I THINK WE ARE HURTING IT. I DON\'T KNOW HOW ELSE TO GET MY PEOPLE HOME.' },
];

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.thrStep(k); return null; };
const f = (s) => s.camp.f;
const aboard = (s) => f(s).rook === 'aboard';
Object.assign(DIALOGS, {
  // ================================================= COLD OPEN
  t_voss0: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. THE FREIGHTER SOLACE IS SIX HOURS OVERDUE ON THE MERIDIAN LANE. LANE CONTROL SAYS SHE WENT IN ON TIME. NOBODY TAKES SIX HOURS TO CROSS A LANE.',
      opts: [{ t: 'COULD SHE HAVE TURNED BACK?', go: 'back' }, { t: 'WE\'LL MEET HER AT THE LANE MOUTH', go: 'go' }] },
    back: { say: 'MERIDIAN SAYS NO. SHE\'S IN THERE SOMEWHERE. SHE\'S A COLONY HAULER - EIGHT CREW, CAPTAIN ROOK. A GOOD SKIPPER.', opts: [{ t: 'WE\'LL MEET HER AT THE LANE MOUTH', go: 'go' }] },
    go: { say: 'THE KALOS END OF THE MERIDIAN LANE IS ON YOUR NAV MAP. GET THERE AND WAIT FOR HER. AND AURORA - I DON\'T LIKE THIS.', opts: [{ t: 'ON OUR WAY', do: step('t0_mouth') }] },
  } },
  t_rook0: { who: 'rook', nodes: {
    start: { say: (s) => { const t = s.camp.rookMet ? 'ROOK HERE - WHAT DO YOU NEED? MAKE IT QUICK.' : 'AURORA - THIS IS THE SOLACE... ROOK. WE\'VE BEEN IN THAT LANE NINE DAYS. NINE DAYS BY OUR CLOCK! SOMETHING WAS IN THERE WITH US - WHITE SHAPES, TEARING AT THE LANE WALLS. THE REACTOR\'S GOING. I HAVE EIGHT PEOPLE LEFT.'; s.camp.rookMet = true; return t; },
      opts: [
        { t: 'BEAM YOUR CREW ACROSS - NOW', if: (s) => !s.camp.crewOff, do: (s) => s.thrBeamCrew() },
        { t: 'WHAT ATTACKED YOU?', go: 'what' },
        { t: 'NINE DAYS? IT\'S BEEN SIX HOURS', go: 'days' },
        { t: 'CLOSE CHANNEL' },
      ] },
    what: { say: 'I DON\'T KNOW. THEY CAME OUT OF THE LANE WALL. THEY DIDN\'T WANT US - THEY WANTED THE WALL. WE WERE JUST... IN THE WAY.', opts: [{ t: 'BEAM YOUR CREW ACROSS', if: (s) => !s.camp.crewOff, do: (s) => s.thrBeamCrew() }, { t: 'BACK', go: 'start' }] },
    days: { say: 'SIX HOURS... THEN WHAT HAPPENED TO THE OTHER NINE DAYS? HARLAN SAID HE SAW ANOTHER SHIP IN THERE. OLD FLEET LINES. I TOLD HIM HE WAS SEEING THINGS.', opts: [{ t: 'BEAM YOUR CREW ACROSS', if: (s) => !s.camp.crewOff, do: (s) => s.thrBeamCrew() }, { t: 'BACK', go: 'start' }] },
  } },
  t_rep0: { who: 'voss', nodes: {
    start: { say: 'AURORA... I\'VE HEARD THE RECORDING. IT ISN\'T ONLY THE SOLACE. IN THE LAST HOUR LANE CONTROL HAS LOST FOUR SHIPS, AND TRANSIT TIMES ON EVERY LANE IN THE FRONTIER ARE CLIMBING. SOMETHING IS HAPPENING TO THE JUMP LANES.',
      opts: [{ t: 'WHAT DOES THAT MEAN FOR THE FRONTIER?', go: 'trade' }, { t: 'CAN WE STILL JUMP?', go: 'jump' }, { t: 'THE LODESTAR - WHO ARE THEY?', go: 'lode' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    trade: { say: 'DISASTER. HALF THE FRONTIER EATS FOOD THAT CROSSES A LANE. FREIGHTERS ARE REFUSING TO JUMP, AND I CAN\'T BLAME THEM.', opts: [{ t: 'CAN WE STILL JUMP?', go: 'jump' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    jump: { say: 'THE AURORA\'S DRIVE IS A FAR BETTER ENGINE THAN A FREIGHTER\'S - YOU CAN STILL CROSS. BUT SLOWLY: A MINUTE OR MORE IN THE LANE INSTEAD OF SECONDS. USE THE TIME.', opts: [{ t: 'THE LODESTAR - WHO ARE THEY?', go: 'lode' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    lode: { say: 'THE NAME MEANS NOTHING TO ME. I HAVE THE ARCHIVES LOOKING. A FLEET SHIP I\'VE NEVER HEARD OF, CALLING FOR HELP FROM INSIDE A LANE... I DON\'T LIKE THAT EITHER.', opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: (s) => `THAT FROST ON THE SOLACE'S HULL - THE VELORI CALL IT LANE SILK, AND THEIR HARVESTERS SELL IT AT THE LANTERN. SET COURSE FOR VEL'ANAR. START THE JUMP AND I'LL BRIEF YOU ON THE WAY.${aboard(s) ? ' AND TAKE CAPTAIN ROOK WITH YOU - SHE\'S SEEN THEM.' : ''}`,
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR VEL\'ANAR', do: (s) => { s.camp.f.fray = true; s.storyNext(2, 'velanar', 'JUMP TO VEL\'ANAR: NAV - PLOT IT ON THE GALAXY CHART; HELM - ALIGN AND ENGAGE. ADMIRAL VOSS WILL BRIEF US IN THE LANE'); s.camp.step = 't0_jump'; return null; } }] },
  } },
  // in the lane to Vel'anar: the briefing
  t_brief1: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. YOU\'VE GOT A MINUTE OR SO IN THE LANE - LET\'S USE IT. ASK WHAT YOU NEED.', opts: qopts('b1') },
    silk: { say: 'A CRYSTAL RESIDUE THAT GROWS ON THE OLD LANE ANCHORS. THE VELORI HARVEST IT AND SELL IT AS LAMP-STONE - IT GLOWS FOR CENTURIES. THE GUILD HAS GUARDED THAT TRADE FOR THIRTY YEARS.', opts: qopts('b1') },
    anch: { say: 'DERELICTS AT THE MOUTH OF EVERY LANE. NOBODY KNOWS WHO BUILT THEM. FLEET SURVEYS CALL THEM INERT. THERE\'S ONE AT THE KALOS END OF VEL\'ANAR - YOU\'LL ARRIVE RIGHT BESIDE IT. SCAN IT.', opts: qopts('b1') },
    who: { say: 'GUILDMISTRESS ITHEL RUNS THE HARVEST FROM THE LANTERN. SHE WON\'T LIKE QUESTIONS. HER SKIFFS WORK THE ANCHORS - START WITH THEM.', opts: qopts('b1') },
    crew: { say: (s) => (aboard(s) ? 'CAPTAIN ROOK IS IN YOUR SICKBAY, AND SHE\'S ASKED TO HELP. THAT\'S YOUR CALL - SHE KNOWS WHAT SHE SAW.' : 'EIGHT NAMES ON THE LIST, AURORA. I\'LL WRITE TO THEIR FAMILIES. YOU FIND OUT WHY.'), opts: qopts('b1') },
    done: { say: 'GOOD HUNTING. VOSS OUT.', opts: [] },
  } },
  // ================================================= ACT ONE
  t_orel: { who: 'orel', nodes: {
    start: { say: (s) => `THIS ANCHOR IS GUILD-LICENSED, OUTWORLDER. WE CUT SILK HERE BY RIGHT. ${s.camp.anchorScanned ? 'YES, IT BLEEDS. ANCHORS ALWAYS BLEED.' : 'WHAT DO YOU WANT?'}`,
      opts: [
        { t: 'THE LANES ARE FAILING. STOP CUTTING', go: 'stop' },
        { t: 'WE NEED THE SHARD IN ITS CORE', go: 'shard' },
        { t: 'WE\'LL BUY IT (3 LATTICE CRYSTAL)', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 3, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 3; s.camp.f.harv = 'bought'; s.repAdd(CIV_VELORI, 5); s.sayAs('orel', 'A FAIR PRICE. THE GUILD THANKS YOU. THE CORE IS YOURS - WE WERE NOT GOING TO REACH IT ANYWAY.'); s.thrFreeAnchor(); return null; } },
      ] },
    stop: { say: 'WE HAVE CUT FOR THIRTY YEARS AND THE LANES WERE FINE. SOMETHING ELSE IS BREAKING YOUR ROADS, OUTWORLDER. ASK THE GUILDMISTRESS.', opts: [{ t: 'WE NEED THE SHARD IN ITS CORE', go: 'shard' }] },
    shard: { say: 'THE SINGING STONE? WE CANNOT CUT TO IT - EVERY TIME WE TRY, THE WHITE ONES COME. WHAT WILL YOU GIVE THE GUILD FOR IT?',
      opts: [
        { t: 'WE\'LL BUY IT (3 LATTICE CRYSTAL)', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 3, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 3; s.camp.f.harv = 'bought'; s.repAdd(CIV_VELORI, 5); s.sayAs('orel', 'A FAIR PRICE. IT IS YOURS - AND THE WHITE ONES WITH IT.'); s.thrFreeAnchor(); return null; } },
        { t: 'FLEET BUSINESS. STAND ASIDE', do: (s) => { s.camp.f.harv = 'forced'; s.repAdd(CIV_VELORI, -8); s.sayAs('orel', 'THE GUILDMISTRESS WILL HEAR HOW THE FLEET ASKS FOR THINGS.', 1); s.thrFreeAnchor(); return null; } },
        { t: 'A FAVOUR - WE\'LL KEEP THE WHITE ONES OFF YOU', do: (s) => { s.camp.f.harv = 'favour'; s.repAdd(CIV_VELORI, 3); s.sayAs('orel', 'THEN WE OWE YOU, AND THE GUILD PAYS ITS DEBTS. TAKE IT.'); s.thrFreeAnchor(); return null; } },
      ] },
  } },
  t_ithel: { who: 'ithel', nodes: {
    start: { say: (s) => ({ forced: 'THE FLEET SHIP THAT TAKES WHAT IT WANTS FROM MY SKIFFS. OREL TOLD ME. SAY WHAT YOU CAME TO SAY.', bought: 'THE FLEET SHIP THAT PAYS ITS WAY. OREL SPEAKS WELL OF YOU. WHAT DO YOU WANT OF THE GUILD?', favour: 'THE FLEET SHIP THAT STOOD BETWEEN MY SKIFFS AND THE WHITE ONES. YOU HAVE A FRIEND IN THE LANTERN. ASK.' }[f(s).harv] || 'THE LANTERN GREETS THE FLEET. WHAT DO YOU WANT?'),
      opts: [
        { t: 'YOUR GUILD IS CUTTING THE LANE ANCHORS OPEN', go: 'cut' },
        { t: 'TELL US ABOUT THE WHITE ONES', go: 'white' },
        { t: '(ROOK) WHAT DID YOU SELL THAT GOT MY CREW KILLED?', if: (s) => aboard(s) && !s.camp.ithelRook, do: (s) => { s.camp.ithelRook = true; s.sayAs('rook', 'MY SHIP IS SCRAP AND HARLAN IS DEAD, GUILDMISTRESS. SO TELL ME WHAT YOU KNOW.', 1); return 'probe'; } },
      ] },
    cut: { say: '{THIRTY YEARS}. THIRTY YEARS WE HAVE CUT SILK, AND THE LANES WERE QUIET. THREE MONTHS AGO THE ANCHORS BEGAN TO HEAL - NEW SKIN OVERNIGHT. AND THE WHITE ONES CAME. IT IS NOT US, CAPTAIN. BUT I DO NOT THINK WE HELPED.', opts: [{ t: 'WHAT CHANGED THREE MONTHS AGO?', go: 'probe' }, { t: 'TELL US ABOUT THE WHITE ONES', go: 'white' }] },
    white: { say: 'MY HARVESTERS CALL THEM WRAITHS. THEY DO NOT FIGHT FOR THEMSELVES. THEY MEND. WHEN YOU CUT, THEY COME. WHEN YOU STOP, THEY GO.', opts: [{ t: 'WHAT CHANGED THREE MONTHS AGO?', go: 'probe' }] },
    probe: { say: 'ONE OF MY SKIFFS PULLED SOMETHING OUT OF THE FROST BY THE HALCYON LANE. A PROBE - FLEET MARKINGS, TWENTY YEARS OLD AT LEAST. WE SOLD IT TO YOUR EPSILON ARRAY. THEY PAID FAR TOO MUCH AND ASKED FAR TOO LITTLE. ASK THEM WHY.',
      opts: [
        { t: 'THE CUTTING HAS TO STOP. WE\'LL KEEP THE FLEET OUT OF YOUR TRADE IF IT DOES', do: (s) => { s.camp.f.ithel = 'ally'; s.repAdd(CIV_VELORI, 8); s.bondSet('ithel', f(s).harv === 'forced' ? 1 : f(s).harv === 'favour' ? 3 : 2); s.sayAs('ithel', 'A BARGAIN, THEN. THE SKIFFS WILL REST. AND IF YOU NEED THE GUILD, CAPTAIN - CALL.'); s.thrActOneOut(); return null; } },
        { t: 'FLEET COMMAND WILL HEAR ABOUT YOUR HARVEST', do: (s) => { s.camp.f.ithel = 'warned'; s.repAdd(CIV_VELORI, -10); s.bondSet('ithel', 0); s.sayAs('ithel', 'THEN TELL THEM. AND TELL THEM WHAT THEIR OWN ARRAY BOUGHT FROM ME.', 1); s.thrActOneOut(); return null; } },
      ] },
  } },
  t_rep1: { who: 'voss', nodes: {
    start: { say: (s) => `${f(s).ithel === 'ally' ? 'A BARGAIN WITH THE GUILD. GOOD - WE\'LL NEED FRIENDS.' : 'SO THE GUILD KNOWS WE\'RE WATCHING. FINE.'} BUT THE ARRAY BOUGHT A FLEET PROBE AND NEVER TOLD ME. MARRIN WOULD HAVE TOLD ME - UNLESS SOMEONE ORDERED HIM NOT TO.`,
      opts: [{ t: 'THE ANCHORS ARE HEALING THEMSELVES', go: 'heal' }, { t: 'WHAT ABOUT THE WRAITHS?', go: 'wraith' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    heal: { say: 'LIKE SOMETHING IS REPAIRING THEM. OR SOMEONE. TWO DAYS AGO I\'D HAVE CALLED THAT ABSURD.', opts: [{ t: 'WHAT ABOUT THE WRAITHS?', go: 'wraith' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    wraith: { say: 'THEY CAME FOR THAT SHARD THE MOMENT IT LEFT THE ANCHOR. WHATEVER IT IS, IT MATTERS TO THEM.', opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: 'GO TO HALCYON AND TALK TO DR. MARRIN. AND AURORA - THAT SHARD IS PULLING ON YOUR JUMP FIELD. THE CROSSING WILL BE LONG. USE IT: PUT THE SHARD ON YOUR MAIN VIEWER AND WORK IT OUT AS A CREW. I WANT TO KNOW WHAT IT IS BEFORE YOU DOCK.',
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR HALCYON', do: (s) => { s.storyNext(3, 'halcyon', 'JUMP TO HALCYON (THE EPSILON ARRAY). IN THE LANE: SCIENCE - ARTEFACT HOLD > LIGHTHOUSE KEY > BEGIN ANALYSIS, AND SOLVE ITS RINGS TOGETHER ON THE VIEWER'); s.camp.step = 't1_jump'; return null; } }] },
  } },
  // ================================================= ACT TWO
  t_marrin2: { who: 'marrin', nodes: {
    start: { say: (s) => (f(s).rings ? 'YOU ALIGNED THE RINGS IN THE LANE? EXTRAORDINARY. DO YOU KNOW WHAT YOU\'VE GOT? A GRAMMAR. THOSE GLYPHS ARE A LANGUAGE, AND THE LANES ARE WRITTEN IN IT.'
      : 'LET ME SEE THAT SHARD... OH. OH MY. THOSE RINGS ARE OUT OF TRUE - SOMEONE CUT IT FREE BADLY. ALIGN THEM, CAPTAIN; IT\'S ON YOUR VIEWER IF YOU WANT IT. I\'LL WAIT.'),
      opts: [
        { t: 'WE\'LL FINISH THE RINGS', if: (s) => !f(s).rings, do: (s) => { s.thrStep('t2_rings'); return null; } },
        { t: 'A LANGUAGE? FOR WHAT?', if: (s) => f(s).rings, go: 'lanes' },
      ] },
    lanes: { say: 'THE LANES AREN\'T NATURAL, CAPTAIN. THE ANCHORS ARE LIGHTHOUSES - PIECES OF ONE ENORMOUS MACHINE THAT HOLDS THE LANES OPEN. AND IT\'S BEEN TALKING. THE WRAITHS\' CHATTER IS IN THIS LANGUAGE.',
      opts: [{ t: 'ITHEL SOLD YOU A FLEET PROBE', go: 'probe' }] },
    probe: { say: '...YES. I WAS ORDERED TO KEEP IT SEALED AND TELL NO ONE - NOT EVEN THE ADMIRAL - UNTIL FLEET INTELLIGENCE COLLECTED IT. A COMMODORE DACE. HE\'S DUE TODAY. IT HAS A DATA CRYSTAL IN IT. I NEVER OPENED IT.',
      opts: [
        { t: 'GIVE IT TO US, DOCTOR. WE\'LL ANSWER FOR IT', do: (s) => { s.camp.f.marrin = 'gave'; s.bondSet('marrin', 3); s.addArt('datacrystal', 0); s.sayAs('marrin', 'I SUPPOSE I\'VE BEEN WAITING FOR SOMEONE TO SAY THAT. BEAMING IT ACROSS. IT\'S LANE-CHARGED - IT WILL DRAG ON YOUR JUMP FIELD.'); s.thrStep('t2_dace'); return null; } },
        { t: 'FOLLOW YOUR ORDERS, DOCTOR', do: (s) => { s.camp.f.marrin = 'kept'; s.bondSet('marrin', 1); s.sayAs('marrin', 'THANK YOU, CAPTAIN. I THINK.'); s.thrStep('t2_dace'); return null; } },
      ] },
  } },
  t_dace2: { who: 'dace', nodes: {
    start: { say: (s) => (s.hasArt('datacrystal') ? 'CAPTAIN. COMMODORE DACE, FLEET INTELLIGENCE. YOU HAVE SOMETHING THAT BELONGS TO MY DIRECTORATE. HAND OVER THE DATA CRYSTAL.'
      : 'CAPTAIN. COMMODORE DACE, FLEET INTELLIGENCE. I\'M HERE FOR A PIECE OF FLEET PROPERTY DR. MARRIN HAS BEEN KEEPING FOR ME. NO NEED FOR YOU TO STAY.'),
      opts: [
        { t: 'WHAT\'S ON IT, COMMODORE?', go: 'what' },
        { t: 'IT\'S EVIDENCE. IT STAYS WITH US', if: (s) => s.hasArt('datacrystal'), do: (s) => { s.camp.f.dace = 'defied'; s.repAdd(CIV_FLEET, -5); s.sayAs('dace', 'THIS WILL BE REMEMBERED, CAPTAIN. BY PEOPLE WITH LONG MEMORIES.', 1); s.thrDaceLeaves(); return null; } },
        { t: 'TAKE IT, COMMODORE', if: (s) => s.hasArt('datacrystal'), do: (s) => { s.camp.f.dace = 'obeyed'; s.removeArt('datacrystal'); s.sayAs('dace', 'A SENSIBLE OFFICER. YOU\'LL GO FAR.'); s.thrDaceLeaves(); return null; } },
        { t: 'UNDERSTOOD, COMMODORE', if: (s) => !s.hasArt('datacrystal'), do: (s) => { s.camp.f.dace = 'obeyed'; s.sayAs('dace', 'GOOD. DOCTOR - THE PROBE, IF YOU PLEASE.'); s.thrDaceLeaves(); return null; } },
      ] },
    what: { say: 'THE KIND OF THING THAT ENDS CAREERS, CAPTAIN. YOURS, IF YOU KEEP ASKING.', opts: [{ t: 'BACK', go: 'start' }] },
  } },
  t_rep2: { who: 'voss', nodes: {
    start: { say: 'DACE. FLEET INTELLIGENCE. I ASKED WHAT HIS INTEREST IS AND WAS TOLD IT\'S ABOVE MY CLEARANCE. THAT HAS NEVER HAPPENED TO ME, AURORA. NOT ONCE IN THIRTY YEARS.',
      opts: [{ t: 'WHAT DID THE WRAITHS SAY?', go: 'said' }, { t: 'DO WE STILL HAVE THE CRYSTAL?', go: 'crys' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    said: { say: (s) => (f(s).rings ? 'MARRIN RAN THEIR CHATTER THROUGH YOUR KEY: "THE WOUND", "THE SPLINTER", "CLOSE". SOMETHING IS HURT, AND IT THINKS SOMETHING IS STUCK INSIDE IT.' : 'NOTHING WE CAN READ. MARRIN SAYS THAT SHARD\'S RINGS ARE THE KEY TO THEIR LANGUAGE - FINISH THEM.'), opts: [{ t: 'DO WE STILL HAVE THE CRYSTAL?', go: 'crys' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    crys: { say: (s) => (f(s).dace === 'defied' ? 'YOU DO - AND DACE KNOWS IT. WATCH YOUR BACK.' : 'DACE HAS THE ORIGINAL. MARRIN IMAGED IT FIRST - YOUR COPY CARRIES THE SAME LOCK. HE WAS QUITE PLEASED WITH HIMSELF.'), opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: 'ITHEL\'S HARVESTERS SAY THE FROST IS THICKEST IN THE SHROUD, AROUND OUTPOST NULL. GO THERE - VIA ORRA PRIME, THERE\'S NO DIRECT LANE. CRACK THAT CRYSTAL IN THE LANE; IT WILL SLOW YOU DOWN, SO YOU\'LL HAVE THE TIME. AND TELL ME WHAT\'S ON IT BEFORE ANYONE ELSE.',
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR THE SHROUD', do: (s) => { s.storyNext(4, 'shroud', 'JUMP TO THE SHROUD, VIA ORRA PRIME (NAV SHOWS THE ROUTE). IN THE LANE: SCIENCE - ARTEFACT HOLD > THRESHOLD DATA CRYSTAL - CRACK ITS LOCK AND READ IT ON THE VIEWER'); s.camp.step = 't2_jump'; return null; } }] },
  } },
  // ================================================= ACT THREE
  t_buoy: { who: 'thrbuoy', nodes: {
    start: { say: 'THRESHOLD RECALL RELAY. THIS BUOY IS SEALED BY ORDER OF FLEET SECURITY. AUTHENTICATE.',
      opts: CODES.map((code) => ({ t: `TRANSMIT "${code}"`, do: (s) => s.thrCode(code) })).concat([{ t: 'CLOSE CHANNEL' }]) },
  } },
  t_neve3: { who: 'neve', nodes: {
    start: { say: 'WHO IS THIS? FLEET? ...THANK GOD. CASTELLAN, ISV LODESTAR. WE\'VE BEEN TRAPPED IN THE LANE WALL ELEVEN WEEKS. EVERY TIME WE BLAST AT IT, THE WHITE THINGS COME AND SEAL IT AGAIN. WE HAVE FOUR CHARGES LEFT.',
      opts: [{ t: 'CAPTAIN... IT\'S BEEN TWENTY-TWO YEARS OUT HERE', go: 'years' }, { t: 'YOUR CHARGES ARE TEARING THE LANES APART', go: 'tear' }] },
    years: { on: (s) => { s.camp.f.told22 = true; }, say: '...NO. NO, THAT\'S - ELEVEN WEEKS. I HAVE A DAUGHTER. SHE\'S SIX. SHE\'S... SHE\'S TWENTY-EIGHT. OH GOD.', opts: [{ t: 'WE\'LL GET YOU HOME. BUT YOUR CHARGES ARE TEARING THE LANES APART', go: 'tear' }] },
    tear: { say: '"TEARING"? WE\'RE TRYING TO GET OUT! WHAT ELSE CAN WE DO?',
      opts: [
        { t: 'STOP FIRING. WE\'LL FIND ANOTHER WAY - I GIVE YOU MY WORD', do: (s) => { s.camp.f.neve = 'trusts'; s.bondSet('neve', 3); s.sayAs('neve', '...ALL RIGHT. ALL RIGHT. CHARGES SAFED. DON\'T LEAVE US IN HERE, AURORA.'); s.thrStep('t3_dace'); return null; } },
        { t: 'HOLD YOUR FIRE FOR NOW. WE\'RE WORKING ON IT', do: (s) => { s.camp.f.neve = 'warned'; s.bondSet('neve', 1); s.sayAs('neve', 'ONE DAY. MY TIME. THEN WE FIRE AGAIN - I WON\'T LET MY PEOPLE DIE IN HERE.', 1); s.thrStep('t3_dace'); return null; } },
      ] },
  } },
  t_dace3: { who: 'dace', nodes: {
    start: { say: (s) => `${f(s).dace === 'defied' ? 'YOU AGAIN, CAPTAIN.' : 'I HOPED YOU\'D LEARNED TO LEAVE THINGS ALONE, CAPTAIN.'} THAT BUOY IS SEALED FLEET PROPERTY AND IT IS BROADCASTING. DESTROY IT. NOBODY CAN EVER KNOW THE LANES CAN BE BROKEN.`,
      opts: [
        { t: 'YOU BURIED 140 PEOPLE ALIVE, DACE', if: (s) => s.camp.f.memo, go: 'buried' },
        { t: 'DESTROY THE BUOY', do: (s) => { s.camp.f.buoy = 'destroyed'; s.thrBuoyGone(); s.sayAs('dace', 'GOOD. THIS NEVER HAPPENED, CAPTAIN.'); s.thrDaceLeaves(); s.thrActThreeOut(); return null; } },
        { t: 'NO. THERE ARE 140 PEOPLE IN THERE', do: (s) => { s.sayAs('dace', 'THEN I\'LL DO IT MYSELF.', 2); s.thrDaceFight(3); return null; } },
      ] },
    buried: { say: '...I SAVED THE LANES. TWENTY-TWO YEARS OF SAFE ROADS FOR A HUNDRED BILLION PEOPLE, FOR 140 WHO ALREADY KNEW THE RISK. ANYONE WITH THE STOMACH FOR IT WOULD HAVE DONE THE SAME. NOW DESTROY THAT BUOY.',
      opts: [{ t: 'NO', do: (s) => { s.sayAs('dace', 'THEN I\'LL DO IT MYSELF.', 2); s.thrDaceFight(3); return null; } }, { t: 'DESTROY THE BUOY', do: (s) => { s.camp.f.buoy = 'destroyed'; s.thrBuoyGone(); s.sayAs('dace', 'GOOD. THIS NEVER HAPPENED.'); s.thrDaceLeaves(); s.thrActThreeOut(); return null; } }] },
  } },
  t_rep3: { who: 'voss', nodes: {
    start: { say: (s) => (f(s).memo ? 'I\'VE READ THE MEMO. DACE BURIED 140 PEOPLE ALIVE AND CALLED IT SECURITY. I HAVE ASKED FOR HIS ARREST. IT WILL TAKE TIME - HE HAS FRIENDS ABOVE ME.' : 'A FLEET SHIP, TRAPPED IN A LANE FOR TWENTY-TWO YEARS, AND A COMMODORE WHO WANTS IT FORGOTTEN. I\'VE ASKED FOR DACE\'S ARREST. IT WILL TAKE TIME.'),
      opts: [{ t: 'HOW DO WE GET THEM OUT WITHOUT BREAKING THE LANES?', go: 'how' }, { t: 'WHAT ABOUT THE BUOY?', go: 'buoy' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    how: { say: (s) => `MARRIN THINKS ONLY WHATEVER BUILT THAT WALL CAN OPEN IT SAFELY - AND THAT IT'S STILL ALIVE.${s.camp.f.keeperNote ? ' CASTELLAN\'S OWN NOTES GIVE IT A NAME: THE KEEPER.' : ''}`, opts: [{ t: 'WHAT ABOUT THE BUOY?', go: 'buoy' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    buoy: { say: (s) => (f(s).buoy === 'destroyed' ? 'GONE. MARRIN SAYS HE CAN RIG A RELAY IN ITS PLACE - SLOWER, AND HE CAN\'T PROMISE IT WILL HOLD.' : 'STILL BROADCASTING. GOOD. IT\'S THEIR ONLY VOICE.'), opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: 'THE OLDEST ANCHOR ON ANY CHART IS IN THE CERULEAN DEEP, BY THE BROKEN MOON. IF THE THING THAT KEEPS THE LANES HAS A FRONT DOOR, IT\'S THERE. GO AND KNOCK.',
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR THE CERULEAN DEEP', do: (s) => { s.storyNext(5, 'cerulean', 'JUMP TO THE CERULEAN DEEP AND FIND THE FIRST LIGHTHOUSE BY THE BROKEN MOON'); s.camp.step = 't3_jump'; return null; } }] },
  } },
  // ================================================= ACT FOUR
  t_keeper: { who: 'keeper', nodes: {
    start: { say: (s) => (f(s).rings ? 'SMALL ONES. YOU CARRY A PIECE OF MY VOICE. YOU HAVE LEARNED TO SPEAK A LITTLE. SPEAK.' : '{SMALL ONES}. YOU {CARRY} A PIECE OF MY {VOICE}. {SPEAK}.'),
      opts: [{ t: 'WHAT ARE YOU?', go: 'what' }, { t: 'SOMETHING IS TRAPPED INSIDE YOUR LANE', go: 'splinter' }] },
    what: { say: (s) => (f(s).rings ? 'I AM THE KEEPER OF THE ROADS. THE ONES WHO WENT AWAY MADE ME TO HOLD THE ROADS OPEN UNTIL THEY CAME BACK. THEY HAVE NOT COME BACK. YOU USE MY ROADS. I DID NOT MIND.' : 'I {KEEP} THE {ROADS}. THE ONES WHO {WENT AWAY} MADE ME. THEY HAVE NOT {RETURNED}. YOU USE MY ROADS. I DID NOT {MIND}.'),
      opts: [{ t: 'SOMETHING IS TRAPPED INSIDE YOUR LANE', go: 'splinter' }] },
    splinter: { say: 'THERE IS A SPLINTER IN ME. IT BURNS, AND BURNS AGAIN. I CLOSE AROUND IT, AND IT BURNS. SOON I CLOSE FOR GOOD.',
      opts: [{ t: 'THE SPLINTER IS A SHIP - 140 PEOPLE. THEY\'RE TRYING TO GET HOME', go: 'people' }, { t: 'THEN CLOSE IT', go: 'close' }] },
    people: { say: (s) => (f(s).rings ? 'PEOPLE. LIKE THE ONES WHO CUT MY SKIN FOR LIGHT? THEY CUT. THEY BURN. WHY SHOULD I OPEN FOR THEM?' : '{PEOPLE}. LIKE THE ONES WHO {CUT MY SKIN} FOR {LIGHT}? WHY SHOULD I {OPEN}?'),
      opts: [
        { t: 'THE CUTTING HAS STOPPED - THE GUILD MADE A BARGAIN WITH US', if: (s) => f(s).ithel === 'ally', do: (s) => { s.camp.f.harvestEnd = true; return 'door'; } },
        { t: 'THEY ONLY BURN BECAUSE THEY\'RE TRAPPED. IF YOU OPEN, IT STOPS', go: 'door' },
      ] },
    door: { say: (s) => (f(s).neve === 'trusts' || s.camp.f.harvestEnd ? 'THEN I WILL OPEN. ONCE. AT THE PLACE OF THE THICKEST FROST. IF THE BURNING STOPS, THE SPLINTER GOES FREE. IF IT BURNS AGAIN, I CLOSE.' : 'THEY HAVE NOT STOPPED BURNING. BUT... I WILL TRY. ONCE, AT THE PLACE OF THE THICKEST FROST. IF IT BURNS, I CLOSE.'),
      opts: [{ t: 'WE\'LL TELL THEM. THANK YOU', do: (s) => { s.camp.f.keeper = 'agreed'; s.bondSet('keeper', s.camp.f.harvestEnd ? 3 : 2); s.thrStep('t4_dace'); return null; } }] },
    close: { say: 'YES. IT WILL BE QUIET THEN.', opts: [{ t: 'WAIT - NO. THEY\'RE PEOPLE', go: 'people' }, { t: '...DO IT', do: (s) => { s.camp.f.keeper = 'close'; s.thrStep('t4_dace'); return null; } }] },
  } },
  t_dace4: { who: 'dace', nodes: {
    start: { say: (s) => (f(s).dace === 'obeyed' && !f(s).daceFought ? 'CAPTAIN. YOU\'VE DONE THE FLEET A GREAT SERVICE: YOU FOUND THE THING THAT HOLDS THE LANES. MY SHIPS CARRY A LANE-BREAKER. ONE SHOT INTO THAT LIGHTHOUSE AND ITS CORE IS OURS - AND EVERY ROAD IN THE GALAXY WITH IT. STAND WITH ME.'
      : 'CAPTAIN. MY SHIPS CARRY A LANE-BREAKER, AND THAT LIGHTHOUSE IS THE HEART OF THE LANES. ONE SHOT AND ITS CORE IS OURS. STAND ASIDE.'),
      opts: [
        { t: 'WHAT HAPPENS TO THE KEEPER?', go: 'keeper' },
        { t: 'NEVER', do: (s) => { s.sayAs('dace', 'THEN YOU\'RE IN MY WAY.', 2); s.thrDaceFight(4); return null; } },
        { t: 'DO IT. THE FLEET SHOULD HOLD THE ROADS', if: (s) => f(s).dace === 'obeyed', do: (s) => { s.thrEnding('crown'); return null; } },
      ] },
    keeper: { say: 'IT DIES, OBVIOUSLY. IT\'S A MACHINE, CAPTAIN - A VERY OLD ONE THAT NOBODY OWNS. NO MORE KESSARI RAIDS. NO MORE ORRAN BORDERS. WHOEVER HOLDS THE ROADS HOLDS EVERYTHING.',
      opts: [{ t: 'NEVER', do: (s) => { s.sayAs('dace', 'THEN YOU\'RE IN MY WAY.', 2); s.thrDaceFight(4); return null; } }, { t: 'DO IT', if: (s) => f(s).dace === 'obeyed', do: (s) => { s.thrEnding('crown'); return null; } }] },
  } },
  t_dace4b: { who: 'dace', nodes: {
    start: { say: 'ENOUGH. MY SHIPS ARE BROKEN AND THE BREAKER\'S GONE. YOU\'VE WON, CAPTAIN. FOR TODAY.',
      opts: [
        { t: 'YOU\'RE UNDER ARREST, COMMODORE', do: (s) => { s.camp.f.daceEnd = 'arrested'; s.repAdd(CIV_FLEET, 5); s.sayAs('dace', 'FOR SAVING THE LANES? GOOD LUCK MAKING THAT STICK.'); s.thrDaceDone(); return null; } },
        { t: 'GET OUT. THE ADMIRAL WILL FIND YOU', do: (s) => { s.camp.f.daceEnd = 'fled'; s.sayAs('dace', 'SHE CAN TRY.'); s.npcLeave(s.camp.daceIds || []); s.thrDaceDone(); return null; } },
      ] },
  } },
  t_rep4: { who: 'voss', nodes: {
    start: { say: (s) => `${f(s).daceEnd === 'arrested' ? 'DACE IS IN A CELL. HIS FRIENDS ABOVE ME HAVE GONE VERY QUIET.' : f(s).daceEnd === 'fled' ? 'DACE IS RUNNING. HE WON\'T RUN FAR.' : 'DACE IS GONE.'} AND THE KEEPER?`,
      opts: [{ t: 'IT WILL OPEN THE WALL - ONCE', if: (s) => f(s).keeper === 'agreed', go: 'door' }, { t: 'IT WILL CLOSE THE WALL', if: (s) => f(s).keeper !== 'agreed', go: 'closed' }] },
    door: { say: 'THEN WE GET ONE CHANCE. MARRIN WORKED OUT WHERE: THE THICKEST FROST IN THE SHROUD, BY OUTPOST NULL. CASTELLAN HAS TO STOP FIRING AND STEER FOR IT. YOU HOLD THE DOOR WHILE SHE COMES THROUGH.',
      opts: [{ t: 'ACKNOWLEDGED - SETTING COURSE FOR THE SHROUD', do: (s) => { s.storyNext(6, 'shroud', 'JUMP TO THE SHROUD. TELL CASTELLAN THROUGH THE BUOY, THEN HOLD THE DOOR AT THE THICKEST FROST'); s.camp.step = 't4_jump'; return null; } }] },
    closed: { say: '...THEN THE LODESTAR HAS TWO CHOICES: FIRE EVERYTHING SHE HAS AND TEAR HER WAY OUT, AND DAMN THE LANES - OR STAY. SOMEBODY HAS TO TELL HER. GO TO THE SHROUD, AURORA.',
      opts: [{ t: 'ACKNOWLEDGED', do: (s) => { s.storyNext(6, 'shroud', 'JUMP TO THE SHROUD AND TALK TO CASTELLAN THROUGH THE BUOY'); s.camp.step = 't4_jump'; return null; } }] },
  } },
  // ================================================= ACT FIVE
  t_neve5: { who: 'neve', nodes: {
    start: { say: (s) => (f(s).told22 ? 'AURORA. I\'VE HAD A DAY TO THINK ABOUT TWENTY-TWO YEARS. TELL ME YOU HAVE SOMETHING.' : 'AURORA? IT\'S BEEN A DAY. TELL ME YOU HAVE SOMETHING.'),
      opts: [
        { t: 'THE KEEPER WILL OPEN THE WALL, ONCE. STAND DOWN YOUR CHARGES', if: (s) => f(s).keeper === 'agreed', do: (s) => { s.camp.f.plan = 'door'; s.sayAs('neve', f(s).neve === 'trusts' ? 'YOU KEPT YOUR WORD. CHARGES STANDING DOWN - ALL OF THEM. STEERING FOR YOUR MARK.' : '...ONE DOOR. ALL RIGHT. CHARGES STANDING DOWN. GOD HELP US IF YOU\'RE WRONG.'); s.thrStep('t5_door'); return null; } },
        { t: 'FIRE EVERYTHING AT ONCE. WE\'LL HOLD THE WALL FROM OUR SIDE', do: (s) => { s.camp.f.plan = 'force'; s.sayAs('neve', 'ALL FOUR CHARGES, ON YOUR MARK. IF THIS DOESN\'T WORK... THANK YOU FOR TRYING.', 1); s.thrStep('t5_door'); return null; } },
        { t: 'I\'M SORRY, CAPTAIN. THE LANE HAS TO CLOSE', go: 'sorry' },
      ] },
    sorry: { say: (s) => (f(s).told22 ? '...I UNDERSTAND. A HUNDRED BILLION PEOPLE ON THOSE ROADS. TELL MY DAUGHTER - TELL HER WE TRIED TO COME HOME.' : 'I... UNDERSTAND. TELL THEM WE TRIED TO COME HOME.'),
      opts: [{ t: 'I WILL. GOODBYE, CAPTAIN', do: (s) => { s.camp.f.plan = 'seal'; s.thrEnding('sealed'); return null; } }, { t: 'NO - WAIT. THERE HAS TO BE ANOTHER WAY', go: 'start' }] },
  } },
  t_final: { who: 'neve', nodes: {
    start: { say: (s) => (f(s).told22 ? 'AURORA... WE\'RE OUT. WE\'RE ACTUALLY OUT. MY DAUGHTER IS TWENTY-EIGHT AND I\'M GOING TO MEET HER. THANK YOU.' : 'AURORA, WE\'RE OUT - WAIT. THE DATE ON YOUR TRANSPONDER. THAT CAN\'T BE RIGHT. ...TWENTY-TWO YEARS? MY DAUGHTER...'),
      opts: [{ t: 'WELCOME HOME, CAPTAIN', go: 'keeper' }] },
    keeper: { who: 'keeper', say: (s) => (f(s).plan === 'door' ? 'THE SPLINTER IS OUT. THE ROADS ARE WHOLE. GO GENTLY ON THEM, SMALL ONES. I WILL KEEP THEM.' : '...THE ROADS ARE {TORN}. I WILL {MEND}. IT WILL TAKE A LONG {TIME}.'),
      opts: [
        { t: 'THE GALAXY SHOULD KNOW WHAT THE LANES ARE', do: (s) => { s.camp.f.truth = 'public'; s.thrEnding(f(s).plan === 'force' ? 'scar' : 'home'); return null; } },
        { t: 'THE KEEPER IS SAFER IF NOBODY KNOWS', do: (s) => { s.camp.f.truth = 'secret'; s.thrEnding(f(s).plan === 'force' ? 'scar' : 'home'); return null; } },
      ] },
  } },
  // ---- Fleet Command, any time: orders, and what we know so far
  t_fleet: { who: 'voss', nodes: {
    start: { say: 'VOSS HERE, AURORA. GO AHEAD.',
      opts: [
        { t: 'CONFIRM OUR ORDERS', do: (s) => { s.sayAs('voss', 'YOUR ORDERS: ' + s.M.objective.replace(/^[A-Z ]+: /, '')); return 'start'; } },
        { t: 'WHAT DO WE KNOW SO FAR?', do: (s) => { s.sayAs('voss', s.thrSoFar()); return 'start'; } },
        { t: 'HOW ARE THE LANES?', do: (s) => { s.sayAs('voss', f(s).fray ? `BAD. A JUMP THAT TOOK SIX SECONDS NOW TAKES A MINUTE OR MORE${s.P.arts.some((h) => G.ART[h.a].drag) ? ' - LONGER WITH THAT RELIC DRAGGING ON YOUR FIELD' : ''}. FREIGHTERS ARE STAYING HOME.` : 'NORMAL, AS FAR AS ANYONE CAN TELL. FOR NOW.'); return 'start'; } },
        { t: 'ANY WORD ON COMMODORE DACE?', if: (s) => s.camp.ch >= 3, do: (s) => { s.sayAs('voss', { arrested: 'IN A CELL, AND COMPLAINING.', fled: 'RUNNING. WE\'LL FIND HIM.' }[f(s).daceEnd] || 'NOTHING I\'M ALLOWED TO HEAR. WHICH TELLS ME PLENTY.'); return 'start'; } },
        { t: 'REQUEST A SITREP ON THE SHIP', do: (s) => { s.sayAs('voss', s.fleetSitrep()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
});
// the briefing's questions, each asked once
function qopts(set) {
  const Q = { b1: [['WHAT IS LANE SILK?', 'silk'], ['WHAT ARE LANE ANCHORS?', 'anch'], ['WHO DO WE TALK TO AT VEL\'ANAR?', 'who'], ['AND THE SOLACE\'S CREW?', 'crew']] }[set];
  return Q.map(([t, k]) => ({ t, if: (s) => !(s.camp.asked || []).includes(k), do: (s) => { (s.camp.asked || (s.camp.asked = [])).push(k); return k; } }))
    .concat([{ t: 'THAT\'S EVERYTHING, ADMIRAL', go: 'done' }]);
}

// ---------------------------------------------------------------- the story hooks (story.js)
STORY.threshold = {
  fleet: (s) => 't_fleet',
  lane: (s) => (s.camp.f.fray ? 10 : 1),
  chapter: (s, ch) => s.thrChapter(ch),
  arrive: (s) => s.thrArrive(),
  jump: (s, to) => s.thrJump(to),
  puzzle: (s, h, kind) => s.thrPuzzle(h, kind),
  archive: (s, h, hook) => s.thrArchive(hook),
};

// ---------------------------------------------------------------- the mixin
export function installThreshold(Sim) {
  Object.assign(Sim.prototype, {
    thrStart(ch) {
      ch = clampf(ch | 0, 1, 6);
      const save = this.campSaveOf('threshold');
      // the choices as they stood when that act began (saved per act), or sensible defaults
      const was = ch > 1 ? (save.fAt && save.fAt[ch]) || defaultsFor(ch) : {};
      this.camp = { id: 'threshold', ch: 0, step: '', t: 0, f: { rook: 'none', ...JSON.parse(JSON.stringify(was)) }, bondOf: (w) => this.thrBond(w) };
      const c = this.camp;
      this.greeted.add(0);
      // starting later: you have what the earlier acts would have given you
      if (ch >= 2) c.f.fray = true;
      if (ch >= 3) { const h = this.addArt('anchorshard', 2); if (h) { this.puzStart(h); h.pz.done = true; } c.f.rings = true; }
      if (ch >= 4 && ch <= 4) this.addArt('datacrystal', 0);
      if (ch === 1) { this.thrChapter(1, true); return; }
      c.next = { ch, sys: ['', 'kalos', 'velanar', 'halcyon', 'shroud', 'cerulean', 'shroud'][ch] };
      this.P.dock = 0;
      this.arrive(SYS_INDEX[c.next.sys]);
    },
    campTag() { return this.camp ? `${THR_LABELS[this.camp.ch - 1] || ''}: ` : ''; },
    thrChapter(ch, first = false) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('threshold');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = JSON.parse(JSON.stringify(c.f));
      (sv.fAt || (sv.fAt = {}))[ch] = JSON.parse(JSON.stringify(c.f)); // replaying this act later starts from these choices
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `${chapterLabel({ labels: THR_LABELS }, ch)}: ${THR_CHAPTERS[ch - 1]}`);
      const k = ['', 't0_brief', 't1_anchor', 't2_marrin', 't3_fix', 't4_go', 't5_call'][ch];
      this.thrStep(k);
      if (ch === 1) this.after(first ? 3 : 1, () => this.startDialog('t_voss0', FROM_COMMAND));
      this.thrScene();
    },
    thrSay(who, text, col = 3, from) {
      this.say(from !== undefined ? from : this.dlg ? this.dlg.from : FROM_CREW, col, text);
      const m = this.msgs[0], ch = CHARS[who];
      m.who = who; if (ch && ch.civ >= 3) m.lang = ch.civ;
    },
    thrObjective() {
      const c = this.camp, s = c.step;
      const O = {
        t0_brief: 'STAND BY - ADMIRAL VOSS IS CALLING',
        t0_mouth: 'HELM: TAKE US TO THE KALOS END OF THE MERIDIAN LANE (MARKED ON NAV) AND WAIT FOR THE SOLACE',
        t0_solace: `THE SOLACE IS BREAKING UP - COMMS: HAIL CAPTAIN ROOK AND GET HER CREW OFF (TRANSPORTERS REACH 5K). ${c.wraithsOut ? 'TACTICAL: DRIVE OFF THE WRAITH. ' : ''}SHIELDS: THE BUBBLE CAN COVER HER`,
        t0_rec: 'SCIENCE: TRACTOR THE SOLACE\'S FLIGHT RECORDER ABOARD (WITHIN 2.5K, SHIELDS DOWN, SLOW)',
        t0_tune: 'SCIENCE: ARTEFACT HOLD > SOLACE FLIGHT RECORDER > BEGIN ANALYSIS. MATCH THE LANE\'S CARRIER ON THE MAIN VIEWER TO RECOVER THE LOG',
        t1_anchor: 'FIND THE LANE ANCHOR BY THE KALOS LANE MOUTH (MARKED) - SCIENCE: FULL-SCAN IT',
        t1_orel: 'VELORI HARVESTERS ARE CUTTING THE ANCHOR OPEN. COMMS: HAIL SKIFF-MASTER OREL',
        t1_core: 'SCIENCE: TRACTOR THE ANCHOR\'S CORE SHARD ABOARD (WITHIN 2.5K, SHIELDS DOWN)',
        t1_wraiths: 'THE WRAITHS HAVE COME FOR THE SHARD - DRIVE THEM OFF',
        t1_ithel: 'TAKE THE SHARD TO GUILDMISTRESS ITHEL AT THE LANTERN - COMMS: HAIL THE LANTERN',
        t2_marrin: 'HAIL DR. MARRIN AT THE EPSILON ARRAY',
        t2_rings: 'SCIENCE: ARTEFACT HOLD > LIGHTHOUSE KEY - ALIGN ITS RINGS (PUT IT ON THE VIEWER), THEN HAIL MARRIN AGAIN',
        t2_dace: 'A FLEET INTELLIGENCE SHIP IS ARRIVING AT THE ARRAY',
        t2_defend: 'WRAITHS AT THE EPSILON ARRAY - DEFEND IT',
        t3_fix: c.f.fix ? `GO TO THE LODESTAR'S LAST FIX: SECTOR ${BUOY_SECTOR}, INSIDE THE NEBULA (MARKED). FIND THE THRESHOLD BUOY` : 'WHERE WAS THE LODESTAR LAST SEEN? IT\'S IN THE DATA CRYSTAL\'S RECORDS - SCIENCE: CRACK IT AND READ THEM ON THE VIEWER',
        t3_hail: 'COMMS: HAIL THE THRESHOLD BUOY. IT WANTS AN AUTHENTICATION CODE (THE CRYSTAL\'S RECALL PROTOCOL)',
        t3_dace: 'COMMODORE DACE IS HERE',
        t3_fight: 'DACE IS ATTACKING THE BUOY - PROTECT IT AND DRIVE HIM OFF',
        t4_go: 'APPROACH THE FIRST LIGHTHOUSE BY THE BROKEN MOON (MARKED)',
        t4_tune: 'SCIENCE: ARTEFACT HOLD > KEEPER CARRIER SAMPLE - MATCH THE LIGHTHOUSE\'S CARRIER SO IT CAN HEAR US',
        t4_talk: 'COMMS: HAIL THE FIRST LIGHTHOUSE',
        t4_dace: 'SHIPS DROPPING OUT OF WARP...',
        t4_fight: 'STOP DACE - HIS SHIPS ARE ARMING A LANE-BREAKER AGAINST THE LIGHTHOUSE. PROTECT IT',
        t5_call: c.f.buoy === 'destroyed' ? 'COMMS: HAIL THE LODESTAR THROUGH MARRIN\'S RELAY (MARKED)' : 'COMMS: HAIL THE LODESTAR THROUGH THE THRESHOLD BUOY (MARKED)',
        t5_door: `HOLD THE DOOR: STAY WITHIN 9K OF THE THICKEST FROST (MARKED) - ${Math.floor(c.door || 0)}% OPEN`,
        t5_escort: `THE LODESTAR IS THROUGH! KEEP HER ALIVE WHILE HER DRIVE SPOOLS UP - ${Math.max(0, Math.ceil(30 - (c.t || 0)))}s`,
      };
      return O[s] || '';
    },
    thrStep(k) {
      const c = this.camp;
      c.step = k; c.t = 0;
      const o = this.thrObjective();
      if (o) this.setObjective(this.campTag() + o);
      this.thrEnter(k);
    },
    thrEnter(k) {
      const c = this.camp;
      if (k === 't0_mouth') { const [x, y] = laneMouth('kalos', 'meridian'); this.clearMarkers(); this.addMarker(x, y, MK_POINT); }
      if (k === 't2_dace') this.after(8, () => this.thrDaceArrives(2));
      if (k === 't3_dace') this.after(8, () => this.thrDaceArrives(3));
      if (k === 't4_dace') this.after(10, () => this.thrDaceArrives(4));
      if (k === 't5_door') { c.door = 0; c.waveN = 0; c.nextWave = 8; this.clearMarkers(); this.addMarker(DOOR[0], DOOR[1], MK_AREA, 9000); this.setWaypoint(DOOR[0], DOOR[1]); }
    },
    // ---- what's in each system for the chapter we're in
    thrScene() {
      const c = this.camp, sid = this.sysDef.id;
      if (sid === 'velanar' && c.ch === 2 && c.anchorId === undefined) {
        this.greeted.add(0); this.npc[0].talk = 't_ithel';
        const [mx, my] = laneMouth('velanar', 'kalos', 54000);
        const id = this.spawnAt(CT_POI, F_NEUTRAL, mx, my, 0);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { poi: G.PK_RUINS, kind: G.PK_RUINS, civ: 3, hull: 100, armor: 0, haz: 0.05, art: G.ART_INDEX.anchorshard, poiKey: 'anchor5', short: 'LANE ANCHOR', name: 'LANE ANCHOR VA-5', scan: 1,
            lockMsg: 'THE HARVESTERS\' CUTTING RIGS ARE CLAMPED ON THE CORE - TALK TO SKIFF-MASTER OREL FIRST.', anchor: true,
            note: 'AN ANCIENT STRUCTURE, NOT ON ANY BUILDER\'S REGISTER. ITS SKIN IS CUT OPEN - FRESH MINING-LASER CUTS - AND LANE SILK IS BLEEDING OUT OF THE WOUNDS. THE CUTS ARE ALREADY HEALING. DEEP IN THE CORE, SOMETHING IS STILL ACTIVE: A RINGED SHARD, HUMMING.' });
          this.npc[id].res = [0, 0, 2, 0, 1, 0];
          c.anchorId = id;
        }
        c.skiffIds = [];
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1, sk = this.spawnAt(CT_FREIGHTER, F_NEUTRAL, mx + Math.cos(a) * 1800, my + Math.sin(a) * 1800, (a * 57 + 180) % 360);
          if (sk === NO_ID) continue;
          Object.assign(this.npc[sk], { ai: AI_STATIC, scan: 1, civ: CIV_VELORI, name: i ? `HARVESTER SKIFF ${i + 1}` : 'SKIFF-MASTER OREL', short: i ? `SKIFF ${i + 1}` : 'OREL', talk: i ? null : 't_orel', talkCtx: {}, shMax: 30, shields: 30 });
          c.skiffIds.push(sk);
        }
        c.orelId = c.skiffIds[0];
        this.clearMarkers(); this.addMarker(mx, my, MK_AREA, 5000);
      }
      if (sid === 'halcyon' && c.ch === 3) { this.greeted.add(0); this.npc[0].talk = 't_marrin2'; this.clearMarkers(); this.addMarker(this.npc[0].x, this.npc[0].y, MK_POINT); }
      if (sid === 'shroud' && c.ch >= 4) this.thrBuoy();
      if (sid === 'cerulean' && c.ch === 5 && (c.lightId === undefined || !this.npc[c.lightId].active)) {
        const id = this.spawnAt(CT_STARBASE, F_NEUTRAL, LIGHT[0], LIGHT[1], 0);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { kind: SK_MONOLITH, civ: CIV_NONE, name: 'THE FIRST LIGHTHOUSE', short: 'LIGHTHOUSE', talk: 't_keeper', talkCtx: {}, scan: 2, shMax: 0, shields: 0, armor: 0.25, hull: 100, light: true });
          c.lightId = id; this.greeted.add(id);
        }
        this.clearMarkers(); this.addMarker(LIGHT[0], LIGHT[1], MK_POINT);
      }
    },
    thrBuoy() {
      const c = this.camp;
      if (c.buoyId !== undefined && this.npc[c.buoyId].active && this.npc[c.buoyId].buoy) return;
      const relay = c.f.buoy === 'destroyed';
      const [x, y] = relay ? [BUOY[0] + 6000, BUOY[1] - 4000] : BUOY;
      const id = this.spawnAt(CT_BUOY, F_NEUTRAL, x, y, 0);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { name: relay ? 'ARRAY RELAY' : 'THRESHOLD BUOY', short: relay ? 'RELAY' : 'THRESHOLD', scan: relay ? 2 : 0, civ: CIV_FLEET, buoy: true, talk: c.ch >= 6 ? 't_neve5' : 't_buoy', talkCtx: {}, hull: 100, shMax: 0, shields: 0, armor: 1 });
      c.buoyId = id;
      if (c.ch >= 6 || c.f.fix) { this.addMarker(x, y, MK_POINT); }
    },
    thrBuoyGone() { const c = this.camp, n = this.npc[c.buoyId]; if (n && n.active) { n.alive = false; n.active = false; this.boomAt(n.x, n.y, 1); this.emit(K.EV_ENEMY_DESTROYED); } },
    // ---- arrivals
    thrArrive() { this.thrScene(); },
    thrJump(to) {
      const c = this.camp, sid = sysAt(to).id;
      if (c.step === 't0_jump' && sid === 'velanar') this.after(3, () => { if (this.P.jumping > 0) this.startDialog('t_brief1', FROM_COMMAND); });
      const sh = this.P.arts.find((h) => G.ART[h.a].id === 'anchorshard'), cr = this.P.arts.find((h) => G.ART[h.a].id === 'datacrystal');
      if (sh && !(sh.pz && sh.pz.done)) this.after(4, () => this.say(FROM_CREW, 0, `THE SHARD IS DRINKING OUR JUMP FIELD - ${Math.round(this.P.jumpLen)} SECONDS IN THE LANE. SCIENCE, IT'S ALL YOURS: ARTEFACT HOLD > LIGHTHOUSE KEY. PUT IT ON THE VIEWER AND WE'LL ALL LOOK.`));
      else if (cr && !(cr.pz && cr.pz.done)) this.after(4, () => this.say(FROM_CREW, 0, `THE CRYSTAL IS DRAGGING ON THE FIELD - ${Math.round(this.P.jumpLen)} SECONDS IN TRANSIT. SCIENCE: ARTEFACT HOLD > THRESHOLD DATA CRYSTAL. LET'S SEE WHAT DACE DIDN'T WANT US TO READ.`));
    },
    thrPuzzle(h, kind) {
      const c = this.camp, id = G.ART[h.a].id;
      if (id === 'recorder2') this.thrPlayLog();
      if (id === 'anchorshard') {
        c.f.rings = true;
        this.after(2, () => this.say(FROM_CREW, 3, 'IT\'S NOT JUST A SHARD - IT\'S A KEY. ALIGNED, THE GLYPHS ARE A GRAMMAR. THE COMPUTER CAN NOW TRANSLATE A GOOD PART OF WHAT THE WRAITHS SAY.'));
        if (c.step === 't2_rings') this.after(5, () => { this.thrStep('t2_marrin'); if (this.sysDef.id === 'halcyon') this.startDialog('t_marrin2', 0); });
      }
      if (id === 'datacrystal' && kind === 'cipher') this.after(1, () => this.say(FROM_CREW, 3, 'WE\'RE IN. SIX RECORDS - ONE STILL IN THE LANE-BUILDERS\' GLYPHS. SCIENCE CAN OPEN THEM ON THE VIEWER; I SUGGEST WE ALL READ THIS.'));
      if (id === 'carrier' && c.step === 't4_tune') { this.say(FROM_CREW, 3, 'CARRIER MATCHED. THE LIGHTHOUSE HAS GONE QUIET... I THINK IT\'S LISTENING, CAPTAIN.'); this.thrStep('t4_talk'); }
    },
    thrArchive(hook) {
      const c = this.camp;
      if (hook === 'memo') { c.f.memo = true; if (c.f.rook === 'aboard') this.after(3, () => this.thrSay('rook', 'DACE. HE LEFT THEM THERE. HARLAN SAW THAT SHIP AND DIED FOR IT, AND DACE KNEW IT WAS IN THERE ALL ALONG.', 1)); }
      if (hook === 'code') c.f.code = true;
      if (hook === 'keeper') c.f.keeperNote = true;
      if (hook === 'fix') { c.f.fix = true; if (this.sysDef.id === 'shroud') { this.thrBuoy(); this.addMarker(BUOY[0], BUOY[1], MK_POINT); } if (c.step === 't3_fix') this.setObjective(this.campTag() + this.thrObjective()); this.say(FROM_CREW, 0, `THE LODESTAR'S LAST FIX: THE SHROUD, SECTOR ${BUOY_SECTOR}. MARKED ON THE NAV MAP.`); }
    },
    thrSoFar() {
      const c = this.camp, F = c.f, out = [];
      if (c.ch >= 1) out.push(c.ch === 1 && !F.fray ? 'THE SOLACE WAS SIX HOURS LATE ON THE MERIDIAN LANE.' : `THE SOLACE CAME OUT OF THE MERIDIAN LANE NINE DAYS LATE BY HER OWN CLOCK${F.rook === 'aboard' ? ' - ROOK AND HER CREW ARE WITH YOU' : F.rook === 'lost' ? ', AND HER CREW DIED WITH HER' : ''}.`);
      if (F.fray) out.push('THE LANES ARE FAILING EVERYWHERE.');
      if (c.ch >= 2 && c.anchorScanned) out.push('THE VELORI HAVE BEEN CUTTING THE LANE ANCHORS FOR SILK, AND THE ANCHORS HEAL.');
      if (F.rings) out.push('THE SHARD IS A KEY TO THE LANE-BUILDERS\' LANGUAGE.');
      if (c.ch >= 3 && F.dace) out.push(`DACE OF FLEET INTELLIGENCE WANTS THE PROBE BURIED${F.dace === 'defied' ? ', AND YOU TOLD HIM NO' : ''}.`);
      if (F.memo) out.push('HE BURIED THE LODESTAR TWENTY-TWO YEARS AGO.');
      if (F.neve) out.push(`THE LODESTAR IS ALIVE INSIDE THE LANE WALL, AND HER CHARGES ARE WHAT'S TEARING THE LANES.${F.neve === 'trusts' ? ' CASTELLAN HAS STOPPED FIRING ON YOUR WORD.' : ''}`);
      if (F.keeper === 'agreed') out.push('THE KEEPER WILL OPEN THE WALL ONCE, AT THE THICKEST FROST.');
      return out.join(' ') || 'VERY LITTLE, AURORA. THAT\'S WHY YOU\'RE OUT THERE.';
    },
    // ---- cold open set pieces
    thrSolaceArrives() {
      const c = this.camp, [x, y] = laneMouth('kalos', 'meridian');
      const id = this.spawnAt(CT_FREIGHTER, F_FRIEND, x, y, bearingTo(x, y, SYS_C, SYS_C));
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { ai: AI_STATIC, speed: 20, scan: 1, civ: CIV_COLONY, name: 'FREIGHTER SOLACE', short: 'SOLACE', hull: 46, shMax: 0, shields: 0, eng: 0, talk: 't_rook0', talkCtx: {},
        note: 'COLONY HAULER SOLACE. HULL BREACHED IN SIX PLACES, REACTOR CONTAINMENT FAILING. EIGHT LIFE SIGNS. THE HULL IS GLAZED WITH A WHITE CRYSTAL FROST - NOT ICE. LANE-DRIVE CHRONOMETER READS NINE DAYS IN TRANSIT; THE LANE TAKES SIX SECONDS.' });
      c.solId = id;
      this.boomAt(x, y, 2); this.emit(K.EV_WARP_IN, id);
      this.say(FROM_CREW, 2, 'CONTACT AT THE LANE MOUTH - IT\'S THE SOLACE! SHE\'S BURNING, CAPTAIN. AND HER HULL IS... FROSTED?');
      this.thrStep('t0_solace');
      this.after(4, () => { if (!this.dlg && this.npc[id].alive) this.startDialog('t_rook0', id); });
      this.after(14, () => this.thrWraiths(1, 'solace'));
    },
    thrBeamCrew() {
      const c = this.camp, n = this.npc[c.solId], P = this.P;
      if (!n || !n.alive) return null;
      if (distTo(P.x, P.y, n.x, n.y) > 5000) { this.thrSay('rook', 'YOU\'RE TOO FAR OUT FOR TRANSPORTERS - CLOSE TO 5K. HURRY!', 1); return 'start'; }
      if (P.shieldRaise > 0.05) { this.say(FROM_CREW, 1, 'WE CAN\'T BEAM THROUGH OUR SHIELDS, CAPTAIN - DROP THEM FOR A MOMENT.'); return 'start'; }
      c.crewOff = true; c.f.rook = 'aboard'; this.bondSet('rook', 3);
      this.emit(K.EV_REFINED);
      this.say(FROM_CREW, 3, 'ALL EIGHT ABOARD - CAPTAIN ROOK TOO. SICKBAY HAS THEM.');
      this.thrSay('rook', 'THANK YOU, AURORA. I\'M EJECTING THE FLIGHT RECORDER - EVERYTHING WE SAW IS ON IT. GET IT BEFORE SHE GOES.', 3);
      this.thrEjectRecorder();
      this.after(16, () => this.thrSolaceDies());
      return null;
    },
    thrEjectRecorder() {
      const c = this.camp, n = this.npc[c.solId];
      if (c.recId !== undefined) return;
      const x = n ? n.x + 900 : SYS_C, y = n ? n.y - 600 : SYS_C;
      const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, 0);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { poi: G.PK_CAPSULE, kind: G.PK_CAPSULE, civ: 1, hull: 100, armor: 0, haz: 0, art: G.ART_INDEX.recorder2, poiKey: 'solrec', short: 'FLIGHT RECORDER', name: 'SOLACE FLIGHT RECORDER', scan: 2, note: 'THE SOLACE\'S BLACK BOX, BEACON BLINKING. TRACTOR IT ABOARD.' });
      this.npc[id].res = [0, 0, 0, 0, 0, 0];
      c.recId = id;
    },
    thrSolaceDies() {
      const c = this.camp, n = this.npc[c.solId];
      if (!n || !n.active || c.solDead) return;
      c.solDead = true;
      if (n.alive) { n.hull = 0; n.alive = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 2); this.emit(K.EV_ENEMY_DESTROYED); }
      if (!c.crewOff) { c.f.rook = 'lost'; this.say(FROM_CREW, 2, 'THE SOLACE\'S REACTOR... SHE\'S GONE, CAPTAIN. NO LIFE SIGNS. ...HER BLACK BOX IS STILL TRANSMITTING.'); }
      else this.say(FROM_CREW, 2, 'THERE GOES THE SOLACE. CAPTAIN ROOK IS WATCHING FROM SICKBAY. SHE ASKED US TO GET THAT RECORDER.');
      this.thrEjectRecorder();
      this.thrStep('t0_rec');
    },
    thrPlayLog() {
      const c = this.camp, L = [
        ['rook', 'SOLACE LOG, DAY FOUR IN THE LANE. THE STARS OUTSIDE HAVEN\'T MOVED SINCE WE WENT IN. THE DRIVE SAYS WE\'RE AT FULL SPEED.'],
        ['rook', 'DAY SEVEN. HARLAN SAYS HE SAW A SHIP IN THE LANE WALL - FLEET LINES, OLD. I TOLD HIM TO GET SOME SLEEP.'],
        ['rook', 'DAY NINE. THEY\'RE HERE. WHITE SHAPES, COMING OUT OF THE WALL. THEY\'RE NOT ATTACKING US. THEY\'RE ATTACKING THE LANE. WE\'RE JUST IN THE WAY-'],
        ['computer', 'END OF LOG. ...CAPTAIN, THERE\'S A SECOND SIGNAL UNDER THE NOISE. CLEANING IT UP.'],
        ['neve', '"...THIS IS THE ISV LODESTAR. IF ANYONE CAN HEAR THIS, WE ARE TRAPPED INSIDE THE LANE WALL. WE CANNOT-" ...THAT\'S ALL OF IT.'],
      ];
      L.forEach(([who, t], i) => this.after(2 + i * 6, () => { this.thrSay(who, t, i >= 2 ? 1 : 3, FROM_COMPUTER); if (i === 4 && c.f.rook === 'aboard') this.after(4, () => this.thrSay('rook', 'THE LODESTAR. HARLAN WAS RIGHT. THERE WAS A SHIP IN THERE.', 1, FROM_CREW)); }));
      this.after(2 + L.length * 6 + 4, () => this.storyReport('t_rep0'));
    },
    // ---- lane wraiths: they mend the lanes, and come for whatever hurts them
    thrWraiths(n, target) {
      const c = this.camp, P = this.P;
      this.M.foes = this.M.foes.filter((id) => this.npc[id].active && this.npc[id].alive);
      let cx = P.x, cy = P.y;
      const tgt = target === 'solace' ? c.solId : target === 'array' ? 0 : target === 'light' ? c.lightId : US;
      if (tgt !== US && this.npc[tgt]) { cx = this.npc[tgt].x; cy = this.npc[tgt].y; }
      const [x, y] = this.pointNear(cx, cy, 6000);
      c.wraiths = c.wraiths || [];
      for (let i = 0; i < n; i++) {
        const id = this.spawnFoe(CT_RAIDER, this.clampSec(x + i * 1300), this.clampSec(y + (i % 2) * 1100), i % 2 && tgt !== US ? US : tgt, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: CIV_CHORUS, name: 'LANE WRAITH', short: `WRAITH ${c.wraiths.length + 1}`, wraith: true, scan: 2, shMax: 70, shields: 70,
          note: 'NOT A SHIP. A SHAPE OF THE SAME WHITE CRYSTAL AS THE LANE FROST, HELD TOGETHER BY A FIELD WE DON\'T UNDERSTAND. IT IS NOT ARMED WITH WEAPONS SO MUCH AS... TOOLS. DAMAGE IT ENOUGH AND IT CAN\'T HOLD ITS SHAPE.' });
        c.wraiths.push(id);
      }
      c.wraithsOut = true;
      this.emit(K.EV_WARP_IN);
      this.say(FROM_CREW, 2, n > 1 ? 'THE LANE MOUTH IS FLICKERING - THOSE WHITE SHAPES! WRAITHS, CAPTAIN!' : 'SOMETHING\'S COMING OUT OF THE LANE AFTER HER - A WHITE SHAPE. IT\'S GOING FOR THE SOLACE!');
      if (c.f.rook === 'aboard' && target !== 'solace' && !c.rookWraith) { c.rookWraith = true; this.after(3, () => this.thrSay('rook', 'THAT\'S THEM. THAT\'S WHAT CAME OUT OF THE WALL.', 1, FROM_CREW)); }
      const said = c.f.rings ? 'THE WOUND... THE SPLINTER... CLOSE THE WOUND...' : '{WOUND}... {SPLINTER}... {CLOSE}...';
      this.after(4, () => { const w = c.wraiths.find((q) => this.npc[q].alive); if (w !== undefined) this.thrSay('wraith', said, 2, w); });
    },
    thrWraithTick() { // a wraith that can't hold its shape dissolves back into the lane
      const c = this.camp;
      for (const id of c.wraiths || []) {
        const n = this.npc[id];
        if (!n.active || !n.alive || !n.wraith) continue;
        if (n.hull < 45) { n.alive = false; n.active = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 1); this.emit(K.EV_ENEMY_DESTROYED); this.say(FROM_CREW, 3, `${n.short} IS COMING APART - IT\'S DISSOLVING BACK INTO FROST.`); }
      }
      c.wraiths = (c.wraiths || []).filter((id) => this.npc[id].active && this.npc[id].alive);
      return c.wraiths.length;
    },
    // ---- act one
    thrFreeAnchor() {
      const c = this.camp, n = this.npc[c.anchorId];
      if (n) n.lockMsg = '';
      if (c.f.harv !== 'favour') this.npcLeave(c.skiffIds || []);
      this.thrStep('t1_core');
    },
    thrActOneOut() {
      const c = this.camp;
      this.after(4, () => this.say(FROM_CREW, 0, 'CAPTAIN - THE SHARD IS HUMMING LOUDER SINCE WE CAME ABOARD. IT\'S PULLING ON THE JUMP FIELD; THE NEXT CROSSING WILL BE A LONG ONE.'));
      this.after(9, () => this.storyReport('t_rep1'));
      c.step = 't1_report';
    },
    // ---- Dace
    thrDaceArrives(act) {
      const c = this.camp, P = this.P;
      const base = act === 2 ? this.npc[0] : act === 3 ? this.npc[c.buoyId] || P : this.npc[c.lightId] || P;
      const [x, y] = this.pointNear(base.x, base.y, act === 2 ? 5000 : 8000);
      c.daceIds = [];
      const n = act === 2 ? 1 : act === 3 ? 2 : 3 + (this.M.diff >= 2 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const id = this.spawnAt(i === 0 || i === 3 ? CT_DESTROYER : CT_RAIDER, F_NEUTRAL, this.clampSec(x + i * 1500), this.clampSec(y + (i % 2) * 1200), bearingTo(x, y, P.x, P.y));
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { ai: AI_STATIC, scan: 2, civ: CIV_FLEET, name: i ? `FIS ESCORT ${i}` : 'FIS NIGHTSHADE', short: i ? `ESCORT ${i}` : 'NIGHTSHADE', shMax: i ? 90 : 180, shields: i ? 90 : 180 });
        this.boomAt(this.npc[id].x, this.npc[id].y, 2);
        c.daceIds.push(id);
      }
      c.daceId = c.daceIds[0];
      this.emit(K.EV_WARP_IN, c.daceId);
      this.startDialog(['', '', 't_dace2', 't_dace3', 't_dace4'][act], c.daceId);
    },
    thrDaceLeaves() {
      const c = this.camp;
      this.npcLeave(c.daceIds || []);
      for (const id of c.daceIds || []) this.campRemove(id, 12);
      if (c.step === 't2_dace') this.after(7, () => {
        this.thrStep('t2_defend');
        this.thrWraiths(2 + (this.M.diff >= 1 ? 1 : 0), 'array');
      });
    },
    thrDaceFight(act) {
      const c = this.camp;
      c.f.daceFought = true; c.daceAct = act;
      this.M.foes = this.M.foes.filter((id) => this.npc[id].active && this.npc[id].alive);
      (c.daceIds || []).forEach((id, i) => {
        const n = this.npc[id];
        n.ai = AI_ATTACK; n.aiT = 0; n.faction = F_HOSTILE;
        n.aiTarget = i === 0 ? US : act === 3 ? c.buoyId : act === 4 ? c.lightId : US;
        if (this.M.foes.length < 8) this.M.foes.push(id);
      });
      this.thrStep(act === 3 ? 't3_fight' : 't4_fight');
      c.allyCalled = false;
    },
    thrDaceDone() {
      const c = this.camp;
      for (const id of c.daceIds || []) { const n = this.npc[id]; if (n.active && n.alive && n.faction === F_HOSTILE) this.npcLeave([id]); }
      for (const id of c.daceIds || []) this.campRemove(id, 14);
      const act3 = c.step === 't3_fight' || c.daceAct === 3;
      c.step = act3 ? 't3_done' : 't4_done';
      this.setObjective(this.campTag() + (act3 ? 'DACE IS DRIVEN OFF' : 'DACE IS FINISHED. THE LIGHTHOUSE IS SAFE'));
      if (act3) this.thrActThreeOut();
      else this.after(4, () => this.storyReport('t_rep4'));
    },
    thrActThreeOut() {
      this.after(3, () => this.say(FROM_CREW, 0, this.camp.f.buoy === 'destroyed' ? 'THE BUOY IS GONE, CAPTAIN. THE LODESTAR\'S SIGNAL WENT WITH IT.' : 'THE BUOY IS STILL BROADCASTING. CASTELLAN KNOWS WE\'RE OUT HERE.'));
      this.after(7, () => this.storyReport('t_rep3'));
      this.camp.step = 't3_report';
    },
    thrCode(code) {
      const c = this.camp;
      if (code === CODES[0]) {
        this.thrSay('thrbuoy', 'AUTHENTICATED. OPENING THE RECALL CHANNEL TO ISV LODESTAR. SIGNAL IS TIME-COMPRESSED - PLEASE WAIT.');
        this.after(4, () => this.startDialog('t_neve3', c.buoyId));
        return null;
      }
      c.codeFails = (c.codeFails || 0) + 1;
      this.thrSay('thrbuoy', 'AUTHENTICATION FAILED. ATTEMPT LOGGED.', 2);
      if (c.codeFails === 2) this.after(3, () => this.say(FROM_CREW, 0, c.f.code ? 'CAPTAIN, THE RECALL PROTOCOL RECORD HAD THE CODE - AND WARNED US NOT TO MIX IT UP WITH THE PROBE\'S. IT\'S STILL ON THE CRYSTAL IF WE NEED TO READ IT AGAIN.' : 'CAPTAIN, THE CODE MUST BE ON THE DATA CRYSTAL - THERE WAS A RECORD CALLED "RECALL PROTOCOL". SCIENCE CAN PUT IT ON THE VIEWER.'));
      return 'start';
    },
    // ---- act five
    thrDoorTick(dt) {
      const c = this.camp, P = this.P, near = distTo(P.x, P.y, DOOR[0], DOOR[1]) < 9000;
      const force = c.f.plan === 'force';
      if (near) c.door = Math.min(100, c.door + dt * (100 / (force ? 95 : 110)));
      if (c.t > c.nextWave && c.waveN < (force ? 3 : 1)) { c.waveN++; c.nextWave = c.t + (force ? 32 : 1e9); this.thrWraiths(force ? 3 : 2, 'us'); if (!force && c.waveN === 1) this.after(3, () => this.say(FROM_CREW, 1, 'WRAITHS - BUT FEWER THAN WE FEARED. THE KEEPER IS HOLDING MOST OF THEM BACK. THESE ONES DON\'T KNOW YET.')); }
      if (c.t > 15 && !c.allyCalled) { c.allyCalled = true; this.thrAllies(); }
      this.setObjective(this.campTag() + this.thrObjective() + (near ? '' : ' (GET BACK WITHIN 9K!)'));
      if (c.door >= 100) {
        const id = this.spawnAt(CT_FREIGHTER, F_FRIEND, DOOR[0], DOOR[1], 270);
        if (id !== NO_ID) Object.assign(this.npc[id], { ai: AI_STATIC, speed: 15, scan: 2, civ: CIV_FLEET, name: 'ISV LODESTAR', short: 'LODESTAR', hull: force ? 40 : 70, shMax: 0, shields: 0, eng: 0, talk: null,
          note: 'SURVEY TENDER, A DESIGN TWENTY-FIVE YEARS OUT OF DATE. 140 LIFE SIGNS. HER HULL IS SCORCHED AND FROSTED, HER PAINT IS THE OLD FLEET GOLD.' });
        c.lodeId = id; this.boomAt(DOOR[0], DOOR[1], 2); this.emit(K.EV_WARP_IN, id);
        this.say(FROM_CREW, 3, 'THE WALL IS OPEN - THERE SHE IS! THE LODESTAR IS THROUGH!');
        for (const w of c.wraiths || []) { const n = this.npc[w]; if (n.alive && n.faction === F_HOSTILE) n.aiTarget = force ? id : US; }
        this.thrStep('t5_escort');
      }
    },
    thrAllies() {
      const call = (who, n, type, civ, name, line, grudging) => this.callAlly(who, { ships: n, type, civ, name, line, grudging });
      call('ithel', 3, CT_FREIGHTER, CIV_VELORI, 'GUILD SKIFF', 'THE GUILD PAYS ITS DEBTS, AURORA. THE SKIFFS ARE YOURS.', 'THE GUILD SENDS ONE SKIFF. WE ARE EVEN AFTER THIS.');
      call('marrin', 2, CT_FREIGHTER, CIV_FLEET, 'ARRAY TENDER', 'MARRIN HERE, WITH EVERY TENDER THE ARRAY HAS. I WOULDN\'T MISS THIS.', 'ONE TENDER, CAPTAIN. IT\'S ALL I COULD TAKE WITHOUT PERMISSION.');
      call('hale', 3, CT_DESTROYER, CIV_FLEET, 'FLEET CRUISER', 'STARBASE 12 SQUADRON, AURORA. THE ADMIRAL SENDS HER REGARDS.', 'ONE CRUISER, AURORA. THE REST ARE GUARDING THE LANES.');
    },
    thrBond(who) {
      const F = this.camp.f;
      if (who === 'hale') return this.rep[CIV_FLEET] >= 55 ? 2 : 1;
      if (who === 'marrin') return F.marrin === 'gave' ? 3 : 1;
      if (who === 'ithel') return F.ithel === 'ally' ? 2 : 0;
      return 0;
    },
    thrEnding(kind) {
      const c = this.camp, F = c.f;
      const T = {
        home: ['THE LODESTAR COMES HOME', 'ONE HUNDRED AND FORTY PEOPLE STEP OFF THE LODESTAR AT STARBASE 12 INTO A WORLD TWENTY-TWO YEARS OLDER. NEVE CASTELLAN MEETS HER DAUGHTER ON THE CONCOURSE; THEY ARE NEARLY THE SAME AGE NOW. THE LANES SETTLE WITHIN A WEEK, AND THE FREIGHTERS COME BACK.'],
        scar: ['SCAR TISSUE', 'THE LODESTAR TEARS HER WAY OUT AND COMES HOME. THE LANES DO NOT FULLY HEAL: A JUMP THAT TOOK SIX SECONDS NOW TAKES TWENTY, AND WILL FOR A GENERATION. SOMEWHERE OUT IN THE DARK, THE KEEPER MENDS, SLOWLY, AND SAYS NOTHING TO ANYONE.'],
        sealed: ['THE QUIET', 'THE KEEPER CLOSES THE WALL. THE LANES HEAL IN A DAY, AND THE FREIGHTERS RUN AGAIN, AND NO ONE ON THEM KNOWS WHAT IT COST. ON STARBASE 12 THERE IS A NEW PLAQUE WITH 140 NAMES. NEVE CASTELLAN\'S DAUGHTER COMES TO SEE IT EVERY YEAR.'],
        crown: ['THE CROWN OF ROADS', 'THE LANE-BREAKER FIRES. THE FIRST LIGHTHOUSE GOES DARK, AND ITS CORE IS TOWED TO A FLEET YARD UNDER GUARD. THE FLEET HOLDS EVERY ROAD IN THE GALAXY NOW - ROADS THAT NO ONE MENDS. THEY ARE ALREADY STARTING TO FRAY. THE LODESTAR IS NEVER HEARD FROM AGAIN.'],
      }[kind];
      const bits = [];
      if (kind !== 'crown') {
        bits.push(F.rook === 'aboard' ? 'TAMSIN ROOK GETS A NEW SHIP - THE FIRST HAULER BACK THROUGH THE MERIDIAN LANE. SHE NAMES IT HARLAN.' : 'THE SOLACE\'S EIGHT ARE REMEMBERED ON MERIDIAN. THEIR RECORDER IS IN THE FLEET ARCHIVE, WHERE IT STARTED EVERYTHING.');
        bits.push(F.harvestEnd || F.ithel === 'ally' ? 'THE VELORI HARVEST STOPS. ITHEL\'S GUILD SELLS GLASS LAMPS NOW, AND HER SKIFFS GUARD THE ANCHORS INSTEAD.' : 'THE VELORI KEEP CUTTING, MORE CAREFULLY. THE WRAITHS KEEP COMING.');
        bits.push({ arrested: 'COMMODORE DACE IS TRIED FOR THE LODESTAR. HE NEVER STOPS SAYING HE SAVED THE LANES.', fled: 'COMMODORE DACE IS NEVER FOUND.' }[F.daceEnd] || '');
        if (kind !== 'sealed') bits.push(F.truth === 'public' ? 'THE TRUTH ABOUT THE LANES GOES PUBLIC. EVERY SCHOOLCHILD LEARNS THE KEEPER\'S NAME, AND SOME OF THEM SING TO IT.' : F.truth === 'secret' ? 'THE KEEPER STAYS A SECRET, KEPT BY A HANDFUL OF PEOPLE WHO OWE IT EVERYTHING.' : '');
      }
      c.ending = { kind, title: T[0], text: [T[1], ...bits].filter(Boolean).join(' '), allies: [...(c.allies || [])].filter((w) => CHARS[w]).map((w) => CHARS[w].name) };
      this.campSaveOf('threshold').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(kind !== 'crown');
    },
    thrOnScan(id) {
      const c = this.camp, n = this.npc[id];
      if (!n || n.scan < 2) return;
      if (n.anchor && !c.anchorScanned) {
        c.anchorScanned = true;
        this.say(FROM_CREW, 3, 'THE ANCHOR IS CUT OPEN, CAPTAIN - FRESH MINING-LASER CUTS, AND LANE SILK IS BLEEDING OUT OF THEM. THE CUTS ARE ALREADY HEALING. AND IN THE CORE: A RINGED SHARD, HUMMING. THOSE SKIFFS ARE VELORI HARVESTERS.');
        if (c.step === 't1_anchor') this.thrStep('t1_orel');
      }
      if (n.buoy && c.step === 't3_fix') this.thrStep('t3_hail');
    },
    thrTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      this.storyTick();
      const near = (id, r) => id !== undefined && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      const wr = this.thrWraithTick();
      switch (c.step) {
        case 't0_mouth': {
          const [mx, my] = laneMouth('kalos', 'meridian');
          if (sid !== 'kalos' || distTo(P.x, P.y, mx, my) > 9000) { c.wait = 0; break; }
          c.wait = (c.wait || 0) + dt;
          if (c.wait > 1 && !c.flick) { c.flick = true; this.say(FROM_CREW, 1, 'ON STATION AT THE LANE MOUTH. SENSORS... THE MOUTH IS FLICKERING, CAPTAIN. SOMETHING IS COMING THROUGH.'); }
          if (c.wait > 7) this.thrSolaceArrives();
          break;
        }
        case 't0_solace': {
          const n = this.npc[c.solId];
          if (!n || !n.active) break;
          if (n.alive) { n.hull -= dt * 0.3; if (n.hull <= 2) this.thrSolaceDies(); }
          else this.thrSolaceDies();
          if (c.wraithsOut) this.setObjective(this.campTag() + this.thrObjective());
          break;
        }
        case 't0_rec': if (this.hasArt('recorder2')) { this.say(FROM_CREW, 3, 'RECORDER ABOARD. IT\'S... ODD. THE DATA IS SMEARED ACROSS THE LANE\'S CARRIER WAVE. SCIENCE CAN PULL IT APART IF WE MATCH THE CARRIER.'); this.thrStep('t0_tune'); } break;
        case 't1_orel':
          if (sid === 'velanar' && near(c.orelId, 9000) && !this.dlg && !c.orelSpoke && c.t > 4) { c.orelSpoke = true; this.startDialog('t_orel', c.orelId); }
          break;
        case 't1_core':
          if (this.hasArt('anchorshard')) {
            this.say(FROM_CREW, 2, 'SHARD ABOARD - AND THE ANCHOR JUST... SCREAMED. SUBSPACE SPIKE AT THE LANE MOUTH!');
            this.after(3, () => this.thrWraiths(2 + (this.M.diff >= 2 ? 1 : 0), 'us'));
            this.thrStep('t1_wraiths');
          }
          break;
        case 't1_wraiths':
          if (c.t > 6 && !wr) { this.say(FROM_CREW, 3, c.f.harv === 'favour' ? 'THE WRAITHS ARE GONE. OREL\'S SKIFFS ARE CHEERING ON OPEN CHANNELS.' : 'THE WRAITHS ARE GONE - BACK INTO THE FROST.'); this.thrStep('t1_ithel'); }
          break;
        case 't1_ithel':
          if (sid === 'velanar' && near(0, 13000) && !this.dlg) this.startDialog('t_ithel', 0);
          break;
        case 't2_marrin':
          if (sid === 'halcyon' && near(0, 14000) && !this.dlg && !c.marrinSpoke) { c.marrinSpoke = true; this.startDialog('t_marrin2', 0); }
          break;
        case 't2_defend':
          if (c.t > 8 && !wr && !this.dlg) {
            if (!this.hasArt('datacrystal')) { this.say(0, 3, 'AURORA, MARRIN. DACE TOOK THE PROBE - BUT I IMAGED ITS DATA CRYSTAL BEFORE HE CAME. A LATTICE COPY, LOCK AND ALL. BEAMING IT ACROSS. YOU\'LL HAVE TO CRACK IT YOURSELVES.'); this.msgs[0].who = 'marrin'; this.addArt('datacrystal', 0); }
            this.storyReport('t_rep2'); c.step = 't2_report';
          }
          break;
        case 't3_fix':
          if (sid === 'shroud' && c.buoyId !== undefined && near(c.buoyId, 7000)) this.thrStep('t3_hail');
          break;
        case 't3_fight': case 't4_fight': {
          const d = this.npc[c.daceId];
          if (c.step === 't3_fight' && (!this.npc[c.buoyId].alive || !this.npc[c.buoyId].active)) { c.f.buoy = 'destroyed'; c.buoyId = undefined; this.say(FROM_CREW, 2, 'THEY GOT THE BUOY. THE LODESTAR\'S SIGNAL IS GONE.'); }
          if (c.step === 't4_fight' && (!this.npc[c.lightId].alive)) { this.say(FROM_CREW, 2, 'THE LIGHTHOUSE... IT\'S GONE DARK. ALL OF IT. THE LANES - CAPTAIN, EVERY LANE ON THE CHART JUST COLLAPSED.'); this.endMission(false, K.FAIL_RESCUE); return; }
          if (c.step === 't4_fight' && c.t > 14 && !c.allyCalled) { c.allyCalled = true; this.thrAllies(); }
          if (d && d.active && d.alive && d.faction === F_HOSTILE && d.hull < 30) {
            d.ai = AI_SURRENDER; d.faction = F_NEUTRAL; d.speed = 0;
            this.npcLeave((c.daceIds || []).filter((id) => id !== c.daceId));
            if (c.step === 't3_fight') { this.thrSay('dace', 'YOU\'VE CHOSEN A SIDE, CAPTAIN. SO HAVE I.', 2, c.daceId); this.npcLeave([c.daceId]); this.thrDaceDone(); }
            else this.startDialog('t_dace4b', c.daceId);
          } else if (d && (!d.alive || !d.active) && !c.daceGone) {
            c.daceGone = true; c.f.daceEnd = 'dead';
            this.say(FROM_CREW, 3, 'THE NIGHTSHADE IS GONE. DACE WITH HER.');
            this.thrDaceDone();
          }
          break;
        }
        case 't4_go':
          if (sid === 'cerulean' && near(c.lightId, 12000)) {
            this.say(FROM_CREW, 3, 'IT\'S... ALIVE, CAPTAIN. NOT A STATION - SOMETHING ALIVE, OR NEAR ENOUGH. AND IT\'S TALKING TO ITSELF ON A CARRIER WE DON\'T USE. I\'VE RECORDED IT. IF WE MATCH IT, IT MIGHT HEAR US.');
            if (!this.hasArt('carrier')) this.addArt('carrier', 1);
            this.thrStep('t4_tune');
          }
          break;
        case 't4_talk':
          if (sid === 'cerulean' && near(c.lightId, 16000) && !this.dlg && !c.keeperSpoke && c.t > 3) { c.keeperSpoke = true; this.startDialog('t_keeper', c.lightId); }
          break;
        case 't5_call':
          if (sid === 'shroud' && c.buoyId !== undefined && near(c.buoyId, 9000) && !this.dlg && !c.neve5 && c.t > 2) { c.neve5 = true; this.startDialog('t_neve5', c.buoyId); }
          break;
        case 't5_door': this.thrDoorTick(dt); break;
        case 't5_escort': {
          const L = this.npc[c.lodeId];
          if (!L || !L.alive) { this.say(FROM_CREW, 2, 'THE LODESTAR... NO. NO. SHE\'S GONE.'); this.endMission(false, K.FAIL_RESCUE); return; }
          this.setObjective(this.campTag() + this.thrObjective() + ` - HER HULL ${Math.round(L.hull)}%`);
          if (c.t >= 30 && !c.finalAsked) {
            c.finalAsked = true;
            for (let i = 0; i < MAX_CONTACTS; i++) if (this.hostileAlive(i)) this.npcLeave([i]);
            for (const id of c.wraiths || []) { const n = this.npc[id]; if (n.active && n.alive) { n.alive = false; n.active = false; this.boomAt(n.x, n.y, 1); } }
            this.after(2, () => this.startDialog('t_final', c.lodeId));
          }
          break;
        }
      }
    },
  });
}
