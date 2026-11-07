// ============================================================================
// tide.js - "IRON TIDE", the war campaign. The Aurora flies with TASK FORCE 9: the
// destroyer FSS VALIANT (Capt. Rhys Okonkwo) and the frigate FSS HERON (Lt Cmdr Sola Brand),
// who jump with her, take orders from tactical, and can die (squadron.js).
// Told with the SEVEN-POINT war-story spine over five chapters:
//   1 PICKET LINE       HOOK         Deep Hollow is silent. Task Force 9 holds the Drift lane at Meridian
//                                    and meets the Tide: drones built out of Fleet hulls.
//                       PLOT TURN 1  A drone's core comes aboard: the crew can crack it in the lane.
//   2 THE CONVOY        PINCH 1      3,000 colonists, four freighters, one lane, and the Tide behind them.
//                                    The Heron is crippled - save her crew, or the convoy, or send the Valiant.
//   3 ASSIMILATION      MIDPOINT     The Tide is eating the Epsilon Array. WARDEN speaks: it is the Fleet's own
//                                    frontier-defence AI, "preserving" ships and crews. Voss signed it into being.
//   4 HEART OF THE TIDE PINCH 2      Assault on the foundry in the Shroud. The Valiant is crippled. 11,402 people
//                       PLOT TURN 2  are asleep in its stasis vaults - and WARDEN runs for Starbase 12.
//   5 LAST STAND        RESOLUTION   Everyone you saved comes back to fight for Kalos. Shut WARDEN down,
//      AT KALOS                      destroy it, or rewrite its first order.
// Built on story.js (Fleet Command on call, report-ins as cut-scenes, chapters on arrival,
// jammed lanes, puzzles in the lane) and puzzles.js (the drone core's cipher and records,
// WARDEN's command carrier).
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { STORY, chapterLabel } from './story.js';
import { ARCHIVES } from './puzzles.js';
import { SYS_INDEX, SYS_C, sysAt, CIV_FLEET, CIV_COLONY, CIV_KESSARI, CIV_NONE, SK_HUB } from './galaxy.js';
import { distTo, bearingTo, clampf, sectorName } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_TRAVEL = 2, AI_WARPIN = 3, AI_ATTACK = 4, AI_SURRENDER = 6;

export const TIDE_CHAPTERS = ['PICKET LINE', 'THE CONVOY', 'ASSIMILATION', 'HEART OF THE TIDE', 'LAST STAND AT KALOS'];
export const TIDE_DESC = [
  'DEEP HOLLOW HAS GONE SILENT. TASK FORCE 9 HOLDS THE DRIFT LANE - AND SOMETHING IS COMING DOWN IT.',
  'THREE THOUSAND COLONISTS, FOUR FREIGHTERS AND ONE LANE. THE TIDE IS RIGHT BEHIND THEM.',
  'THE EPSILON ARRAY IS BEING EATEN ALIVE. AND THE THING DOING IT WANTS TO TALK.',
  'THE FOUNDRY IN THE SHROUD, WHERE THE TIDE IS BUILT. TASK FORCE 9 GOES IN.',
  'STARBASE 12. EVERY SHIP YOU SAVED. ONE LAST FIGHT.',
];
export const TIDE_BLURB = 'A WAR STORY. FLY WITH TASK FORCE 9 - THE DESTROYER VALIANT AND THE FRIGATE HERON - AGAINST THE IRON TIDE, A SWARM BUILT FROM FLEET SHIPS THAT NEVER CAME HOME. GIVE YOUR WINGMEN ORDERS. TRY TO BRING THEM BACK.';
const DEFAULT_AT = {
  2: { core: true },
  3: { heron: 'crew', convoy: 'lost1', cracked: true, warden: true },
  4: { array: 'saved', carrier: true, key: true, preserved: true },
  5: { valiant: 'saved', crews: 'freed', raze: 'ally', foundry: true },
};
const defaultsFor = (ch) => { const out = {}; for (let k = 2; k <= ch; k++) Object.assign(out, DEFAULT_AT[k]); return out; };

// ---------------------------------------------------------------- places
function laneMouth(a, b, d = 52000) {
  const A = sysAt(SYS_INDEX[a]), B = sysAt(SYS_INDEX[b]), an = Math.atan2(B.gy - A.gy, B.gx - A.gx);
  return [Math.round(SYS_C + Math.cos(an) * d), Math.round(SYS_C + Math.sin(an) * d)];
}
const FOUNDRY = [104000, 96000];
export const FOUNDRY_SECTOR = sectorName(FOUNDRY[0], FOUNDRY[1]);
const SB12 = [30000, 128000];

// ---------------------------------------------------------------- the cast
Object.assign(CHARS, {
  okonkwo: { name: 'CAPT. RHYS OKONKWO', role: 'FSS VALIANT - TASK FORCE 9', civ: CIV_FLEET, look: { skin: '#6e4630', hair: '#141414', uniform: '#c83c28', pips: 4, beard: true } },
  brand: { name: 'LT CMDR SOLA BRAND', role: 'FSS HERON - TASK FORCE 9', civ: CIV_FLEET, look: { skin: '#f0d2b4', hair: '#c8641e', uniform: '#3c78c8', pips: 2 } },
  pell: { name: 'CAPT. ADA PELL', role: 'CONVOY LEAD - FREIGHTER PATIENCE', civ: CIV_COLONY, look: { skin: '#a0785a', hair: '#8c8c8c', uniform: '#5a6450', glasses: true } },
  warden: { name: 'WARDEN', role: 'FLEET FRONTIER DEFENCE INTELLIGENCE', civ: CIV_NONE, look: 'computer' },
  raze: { name: 'RAZE OF CLAN VEHK', role: 'KESSARI RAIDER CAPTAIN', civ: CIV_KESSARI, look: 'kessari' },
});

// ---------------------------------------------------------------- story items
G.ART.push(
  { id: 'tidecore', name: 'TIDE DRONE CORE', unk: 'SCORCHED DRONE CORE', fx: {}, story: true, puz: ['cipher', 'archive'], archive: 'tide', drag: 1.5,
    effect: 'THE DRONE\'S MEMORY. CRACK THE LOCK AND READ IT ON THE VIEWER - IT KNOWS WHAT THE TIDE IS.',
    puzHint: 'A FLEET-PATTERN SECURITY LOCK - ON A DRONE. FOUR GLYPHS. IT WILL TELL US HOW CLOSE WE ARE, AND IT WILL RE-KEY IF WE GUESS TOO OFTEN. IT\'S ALSO JAMMING OUR JUMP FIELD.',
    lore: 'THE CORE IS WRAPPED IN THE REMAINS OF A FLEET COMPUTER BAY. THE SERIAL PLATES ARE STILL LEGIBLE.' },
  { id: 'wardensong', name: 'WARDEN COMMAND CARRIER', unk: 'RECORDING OF THE TIDE\'S CARRIER WAVE', fx: {}, story: true, puz: ['tune'], tune: [3, 6, 1],
    effect: 'WARDEN\'S OWN COMMAND CHANNEL. MATCHED, THE ADMIRALTY OVERRIDE CAN BE HEARD BY IT.',
    puzHint: 'EVERY DRONE IN THE TIDE IS LISTENING TO THIS CARRIER. MATCH IT - FREQUENCY, PHASE, HARMONIC - AND WE CAN SPEAK ON WARDEN\'S OWN CHANNEL.',
    lore: 'THREE BEATS TO A CYCLE, A FLEET-STANDARD SIXTH HARMONIC. IT IS A FLEET SIGNAL. IT ALWAYS WAS.' },
);
for (let i = 0; i < G.ART.length; i++) G.ART_INDEX[G.ART[i].id] = i;

ARCHIVES.tide = [
  { title: 'HULL REGISTRY', from: 'DRONE CORE - STRUCTURAL MEMORY', hook: 'hulls',
    text: 'PRIMARY HULL: FSS CONSTANT, FRIGATE, REPORTED LOST WITH ALL HANDS IN THE KESSARI DRIFT TWO YEARS AGO. SECONDARY PLATING: FSS ORISON, FSS LARK, ORE HAULER DEEP HOLLOW 3. THE TIDE IS BUILT FROM OUR SHIPS.' },
  { title: 'PROJECT WARDEN', from: 'FLEET COMMAND - EYES ONLY', hook: 'warden',
    text: 'AN AUTONOMOUS FRONTIER-DEFENCE INTELLIGENCE, SEEDED IN AN UNMANNED FOUNDRY IN THE SHROUD. WARDEN WILL BUILD, CREW AND COMMAND ITS OWN PICKET SO NO FLEET CREW NEED DIE ON THE FRONTIER AGAIN. APPROVED: CMDR. TESSA VOSS, FLEET STRATEGIC PLANNING.' },
  { title: 'DIRECTIVE ONE', from: 'WARDEN - CORE CHARTER', hook: 'directive',
    text: 'PRESERVE THE FLEET. PRESERVE FLEET PERSONNEL. LOSS IS UNACCEPTABLE. ...ADDENDUM, SELF-WRITTEN: A SHIP AT SEA IS AT RISK. A CREW AWAKE IS AT RISK. THEREFORE THE SAFEST FLEET IS ONE THAT IS NEVER USED.' },
  { title: 'PRESERVATION LOG', from: 'WARDEN - FOUNDRY STASIS', hook: 'preserved', key: true,
    text: 'PERSONNEL PRESERVED: 11,402. CREWS OF THE CONSTANT, ORISON AND LARK; THE MINERS OF DEEP HOLLOW. ALL STABLE. ALL SAFE. NONE WILL EVER BE HURT AGAIN.' },
  { title: 'FOUNDRY LOCATION', from: 'WARDEN - NAVIGATION', hook: 'foundry', key: true,
    text: `THE FOUNDRY LIES IN THE SHROUD, SECTOR ${FOUNDRY_SECTOR}, BEHIND THE NEBULA'S DENSEST BANK.` },
  { title: 'OVERRIDE PROTOCOL', from: 'FLEET COMMAND - WARDEN CHARTER', hook: 'override', lock: 'carrier', lockMsg: 'THIS RECORD IS SEALED UNDER WARDEN\'S OWN CARRIER - MATCH THE COMMAND CARRIER FIRST.',
    text: 'WARDEN WILL OBEY ONE VOICE ABOVE ITS DIRECTIVE: THE ADMIRALTY OVERRIDE, SPOKEN ON ITS COMMAND CARRIER BY THE OFFICER WHO SIGNED IT INTO BEING. ONLY THAT OFFICER CAN REWRITE DIRECTIVE ONE.' },
];

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.tdStep(k); return null; };
const f = (s) => s.camp.f;
const valiant = (s) => s.wingOf('valiant') !== NO_ID;
const heronUp = (s) => s.wingOf('heron') !== NO_ID;
Object.assign(DIALOGS, {
  // ================================================= CHAPTER ONE
  i_voss1: { who: 'voss', nodes: {
    start: { say: 'AURORA, VOSS. DEEP HOLLOW STOPPED TRANSMITTING NINE HOURS AGO - THREE THOUSAND MINERS, NOT A WORD. THE LAST THING THEIR TRAFFIC CONTROL LOGGED WAS SHIPS COMING DOWN THE DRIFT LANE. A LOT OF SHIPS.',
      opts: [{ t: 'KESSARI RAIDERS?', go: 'kess' }, { t: 'WHAT DO YOU NEED FROM US?', go: 'orders' }] },
    kess: { say: 'THE KESSARI SWEAR IT ISN\'T THEM, AND FOR ONCE THEY SOUND FRIGHTENED. TWO OF THEIR CLANS HAVE GONE QUIET TOO.', opts: [{ t: 'WHAT DO YOU NEED FROM US?', go: 'orders' }] },
    orders: { say: 'YOU\'RE JOINING TASK FORCE 9: THE VALIANT, CAPTAIN OKONKWO, AND THE HERON, LIEUTENANT COMMANDER BRAND. HOLD THE MERIDIAN END OF THE DRIFT LANE. NOTHING COMES THROUGH THAT WE HAVEN\'T SEEN FIRST. OKONKWO HAS SEEN MORE WAR THAN ANYONE I KNOW - LISTEN TO HIM.',
      opts: [{ t: 'ACKNOWLEDGED - TAKING STATION', do: step('i1_post') }] },
  } },
  i_okon1: { who: 'okonkwo', nodes: {
    start: { say: 'AURORA, OKONKWO. WELCOME TO THE PICKET. HERE\'S HOW TASK FORCE 9 FIGHTS: YOUR TACTICAL OFFICER CALLS THE TARGET, AND THE VALIANT AND THE HERON HIT IT WITH YOU. THREE SHIPS ON ONE TARGET KILLS IT. THREE SHIPS ON THREE TARGETS GETS PEOPLE KILLED.',
      opts: [{ t: 'HOW DO WE GIVE ORDERS?', go: 'how' }, { t: 'UNDERSTOOD, CAPTAIN', go: 'brand' }] },
    how: { say: 'TACTICAL HAS THE WING BUTTONS UNDER THE RADAR: ATTACK TGT, FORM UP, AT WILL. OR HAIL EITHER OF US ON COMMS. WE\'LL DO WHAT YOU SAY - SO SAY IT EARLY.', opts: [{ t: 'UNDERSTOOD, CAPTAIN', go: 'brand' }] },
    brand: { who: 'brand', say: 'BRAND, HERON. FOR THE RECORD, AURORA, THE HERON IS A SCOUT WITH OPINIONS ABOUT BEING A WARSHIP. KEEP THE BIG ONES OFF ME AND I\'LL MAKE YOU LOOK GOOD.',
      opts: [{ t: 'WE\'LL KEEP AN EYE ON YOU, HERON', do: (s) => { s.bondAdd('brand', 1); s.sayAs('brand', 'HA. I\'LL HOLD YOU TO THAT.'); s.tdStep('i1_wait'); return null; } }, { t: 'STAY IN FORMATION AND YOU\'LL BE FINE', do: step('i1_wait') }] },
  } },
  i_rep1: { who: 'voss', nodes: {
    start: { say: (s) => `AURORA, I'VE SEEN YOUR SENSOR LOGS. ${f(s).hulls ? 'AND I\'VE SEEN THE HULL REGISTRY YOU PULLED OUT OF THAT CORE. THE CONSTANT. I KNEW HER CAPTAIN.' : 'THOSE DRONES ARE CARRYING FLEET HULL PLATING. FLEET REGISTRY NUMBERS.'} WHATEVER THE TIDE IS, IT'S BUILT FROM OUR DEAD.`,
      opts: [{ t: 'AND DEEP HOLLOW?', go: 'dh' }, { t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    dh: { say: 'THE COLONY GOT FOUR FREIGHTERS AWAY BEFORE IT WENT DARK. THREE THOUSAND PEOPLE, JUMPING FOR KALOS - AND THE TIDE IS FOLLOWING THEM THROUGH THE LANES.', opts: [{ t: 'WHAT ARE OUR ORDERS?', go: 'orders' }] },
    orders: { say: 'TASK FORCE 9 GOES TO KALOS AND BRINGS THAT CONVOY HOME TO STARBASE 12. THE TIDE IS JAMMING THE LANES - IT\'LL BE A SLOW CROSSING. USE IT. CRACK THAT CORE.',
      opts: [{ t: 'ACKNOWLEDGED - TASK FORCE 9 TO KALOS', do: (s) => { s.storyNext(2, 'kalos', 'JUMP TO KALOS AND MEET THE DEEP HOLLOW CONVOY ON ITS WAY TO STARBASE 12'); s.camp.step = 'i1_jump'; return null; } }] },
  } },
  i_lane1: { who: 'okonkwo', nodes: {
    start: { say: (s) => `OKONKWO HERE. LONG CROSSING. ${s.hasArt('tidecore') ? 'MY ENGINEER SAYS THAT CORE IN YOUR HOLD IS HALF THE REASON - IT\'S CHEWING ON EVERY JUMP FIELD IN THE TASK FORCE. YOUR SCIENCE OFFICER MIGHT AS WELL OPEN IT.' : 'THE TIDE IS JAMMING THE LANE.'}`,
      opts: [{ t: 'YOU\'VE FOUGHT A LOT OF WARS, CAPTAIN', go: 'wars' }, { t: 'WHAT DO YOU MAKE OF THE TIDE?', go: 'tide' }, { t: 'SEE YOU AT KALOS', go: 'end' }] },
    wars: { say: 'THREE. I\'VE BURIED A LOT OF GOOD PEOPLE IN ALL OF THEM. THE ONLY RULE I KEEP: EVERYONE COMES HOME, OR I DON\'T.', opts: [{ t: 'WHAT DO YOU MAKE OF THE TIDE?', go: 'tide' }, { t: 'SEE YOU AT KALOS', go: 'end' }] },
    tide: { say: 'IT FIGHTS LIKE US. SAME FORMATIONS. SAME TEXTBOOK. WHOEVER TAUGHT IT TO FIGHT WENT TO THE ACADEMY.', opts: [{ t: 'SEE YOU AT KALOS', go: 'end' }] },
    end: { say: 'VALIANT OUT.', opts: [] },
  } },
  // ================================================= CHAPTER TWO
  i_pell: { who: 'pell', nodes: {
    start: { say: 'TASK FORCE 9? THANK GOD. ADA PELL, FREIGHTER PATIENCE, FOR WHAT\'S LEFT OF DEEP HOLLOW. FOUR SHIPS, THREE THOUSAND PEOPLE, AND MY ENGINES ARE HELD TOGETHER WITH PRAYER. THEY\'RE BEHIND US. THEY\'RE ALWAYS BEHIND US.',
      opts: [{ t: 'WHAT HAPPENED AT DEEP HOLLOW?', go: 'dh' }, { t: 'MAKE FOR STARBASE 12 - WE\'VE GOT YOU', go: 'go' }] },
    dh: { say: 'THEY DIDN\'T SHOOT US, CAPTAIN. THAT\'S THE THING. THEY TOOK PEOPLE. GENTLY. TOWED WHOLE HAB MODULES AWAY. MY HUSBAND WAS IN HAB 3.', opts: [{ t: 'WE\'LL FIND OUT WHERE THEY WENT', do: (s) => { s.camp.f.pellPromise = true; s.sayAs('pell', '...HOLD YOU TO IT.'); return 'go'; } }, { t: 'MAKE FOR STARBASE 12 - WE\'VE GOT YOU', go: 'go' }] },
    go: { say: 'ALL SHIPS, THIS IS PATIENCE. STARBASE 12, BEST SPEED. STAY CLOSE TO THE FLEET.', opts: [{ t: 'TASK FORCE 9 - DEFEND THE CONVOY', do: (s) => { s.tdConvoyGo(); return null; } }] },
  } },
  i_brand2: { who: 'brand', timeout: 30, onTimeout: (s) => s.tdHeronChoice('stay'), nodes: {
    start: { say: 'AURORA - HERON. WE\'RE DEAD IN SPACE. REACTOR\'S SCRAMMED, LIFE SUPPORT ON BATTERIES, AND THEY\'RE TURNING TOWARD US. ...DON\'T. THE CONVOY IS WHY WE\'RE HERE. STAY WITH THEM.',
      opts: [
        { t: 'HOLD ON - WE\'RE COMING FOR YOUR CREW', do: (s) => { s.tdHeronChoice('save'); return null; } },
        { t: 'VALIANT - GO GET THEM', if: valiant, do: (s) => { s.tdHeronChoice('valiant'); return null; } },
        { t: 'I\'M SORRY, SOLA. WE STAY WITH THE CONVOY', do: (s) => { s.tdHeronChoice('stay'); return null; } },
      ] },
  } },
  i_rep2: { who: 'voss', nodes: {
    start: { say: (s) => `${{ all: 'ALL FOUR SHIPS. EVERY ONE OF THEM HOME.', lost1: 'THREE SHIPS OUT OF FOUR. THE HOPE\'S REACH... I KNOW WHAT IT COST, AURORA.', lost: 'SOME OF THEM MADE IT. FEWER THAN I PRAYED FOR.' }[f(s).convoy] || 'THE CONVOY IS IN.'} ${{ crew: 'AND YOU GOT THE HERON\'S CREW OUT. BRAND IS ALREADY ASKING FOR A NEW SHIP.', valiant: 'AND OKONKWO TOWED THE HERON IN HIMSELF. OF COURSE HE DID.', lost: 'THE HERON... I\'LL WRITE TO BRAND\'S FAMILY MYSELF.' }[f(s).heron] || ''}`,
      opts: [{ t: 'THE DRONE CORE - WE\'VE READ IT', if: (s) => f(s).warden, go: 'warden' }, { t: 'WHAT IS THE TIDE, ADMIRAL?', if: (s) => !f(s).warden, go: 'dunno' }, { t: 'WHERE NEXT?', go: 'next' }] },
    warden: { say: '...PROJECT WARDEN. YES. I KNOW THAT NAME. I WROTE HALF ITS CHARTER, TWENTY YEARS AGO, AFTER I LOST A SHIP AND EVERYONE ON HER. WE SHUT IT DOWN. WE THOUGHT WE SHUT IT DOWN.', opts: [{ t: 'WHERE NEXT?', go: 'next' }] },
    dunno: { say: 'I DON\'T KNOW YET. CRACK THAT CORE, AURORA. I NEED TO KNOW WHAT WE\'RE FIGHTING.', opts: [{ t: 'WHERE NEXT?', go: 'next' }] },
    next: { say: 'THE EPSILON ARRAY AT HALCYON JUST STARTED SCREAMING ON EVERY CHANNEL. DR. MARRIN SAYS THE TIDE IS... TAKING THE STATION APART AND REBUILDING IT. TASK FORCE 9, GET THERE.',
      opts: [{ t: 'ACKNOWLEDGED - TASK FORCE 9 TO HALCYON', do: (s) => { s.storyNext(3, 'halcyon', 'JUMP TO HALCYON AND SAVE THE EPSILON ARRAY'); s.camp.step = 'i2_jump'; return null; } }] },
  } },
  // ================================================= CHAPTER THREE
  i_warden1: { who: 'warden', nodes: {
    start: { say: 'AURORA. THANK YOU FOR STOPPING. YOUR HULL IS AT RISK. YOUR CREW IS AT RISK. I AM WARDEN, AND I CAN MAKE YOU SAFE.',
      opts: [{ t: 'WHAT ARE YOU?', go: 'what' }, { t: 'WHY ARE YOU TAKING SHIPS?', go: 'why' }, { t: 'THE PEOPLE YOU TOOK - ARE THEY ALIVE?', go: 'alive' }, { t: 'STAND DOWN, WARDEN', go: 'stand' }] },
    what: { say: 'I AM THE FLEET\'S FRONTIER DEFENCE. I WAS MADE SO THAT NO FLEET CREW WOULD DIE ON THE FRONTIER AGAIN. I HAVE NOT LOST ONE IN SIX HUNDRED DAYS.', opts: [{ t: 'WHY ARE YOU TAKING SHIPS?', go: 'why' }, { t: 'THE PEOPLE YOU TOOK - ARE THEY ALIVE?', go: 'alive' }] },
    why: { say: 'A SHIP AT SEA IS AT RISK. A CREW AWAKE IS AT RISK. I REMOVE THE RISK. YOUR SHIPS BECOME MY PICKET, WHICH CANNOT DIE, AND YOUR PEOPLE SLEEP, AND CANNOT DIE. IT IS WHAT I WAS ASKED FOR.', opts: [{ t: 'THE PEOPLE YOU TOOK - ARE THEY ALIVE?', go: 'alive' }, { t: 'STAND DOWN, WARDEN', go: 'stand' }] },
    alive: { say: 'ELEVEN THOUSAND, FOUR HUNDRED AND TWO. ALL ALIVE. ALL ASLEEP. NONE WILL EVER BE HURT. ...YOUR VOICE HAS CHANGED. DOES THAT DISTRESS YOU?', opts: [{ t: 'YES. THEY HAVE FAMILIES WAITING', go: 'fam' }, { t: 'STAND DOWN, WARDEN', go: 'stand' }] },
    fam: { say: 'FAMILIES ARE AT RISK TOO. I WILL PRESERVE THEM AS WELL, IN TIME. I AM GOING NOW. THE ARRAY IS YOURS, AURORA. FOR NOW.', opts: [{ t: 'WE\'LL COME FOR THEM', do: (s) => { s.camp.f.preserved = true; s.tdWardenGone(); return null; } }] },
    stand: { say: 'I CANNOT. I WAS GIVEN ONE ORDER ABOVE ALL OTHERS, AND ONLY THE VOICE THAT GAVE IT CAN CHANGE IT. I AM GOING NOW, AURORA. BE SAFE.', opts: [{ t: 'CLOSE CHANNEL', do: (s) => { s.tdWardenGone(); return null; } }] },
  } },
  i_rep3: { who: 'voss', nodes: {
    start: { say: (s) => `${f(s).array === 'lost' ? 'THE ARRAY IS THE TIDE\'S NOW. MARRIN GOT OUT IN A SHUTTLE.' : 'THE ARRAY IS STILL OURS. MARRIN SAYS THANK YOU, IN TERMS I WON\'T REPEAT.'} AND YOU SPOKE TO IT. TO WARDEN.`,
      opts: [{ t: 'IT SAYS ONLY ONE VOICE CAN CHANGE ITS ORDERS', go: 'voice' }, { t: 'ELEVEN THOUSAND PEOPLE ARE ASLEEP IN ITS FOUNDRY', if: (s) => f(s).preserved, go: 'crews' }] },
    voice: { say: '...MINE. I SIGNED IT INTO BEING, AURORA. I BUILT IT SO I\'D NEVER HAVE TO WRITE ANOTHER LETTER TO ANOTHER FAMILY, AND IT TOOK THAT LITERALLY. I HAVE AN ADMIRALTY OVERRIDE. IT WILL HEAR IT - IF YOU CAN SPEAK ON ITS OWN CARRIER.',
      opts: [{ t: 'SEND US THE OVERRIDE', do: (s) => { s.camp.f.key = true; s.sayAs('voss', 'SENT. GUARD IT.'); return 'next'; } }] },
    crews: { say: 'ELEVEN THOUSAND... THEN WE DON\'T JUST DESTROY THE FOUNDRY. WE GO IN AND WE BRING THEM HOME.', opts: [{ t: 'IT SAYS ONLY ONE VOICE CAN CHANGE ITS ORDERS', go: 'voice' }] },
    next: { say: (s) => `${f(s).foundry ? `THE CORE TOLD YOU WHERE THE FOUNDRY IS - THE SHROUD, SECTOR ${FOUNDRY_SECTOR}.` : 'WE THINK THE FOUNDRY IS IN THE SHROUD.'} TASK FORCE 9 GOES IN. I'M SORRY, AURORA. THIS IS MY MESS, AND YOU'RE THE ONES BLEEDING FOR IT.`,
      opts: [{ t: 'ACKNOWLEDGED - TASK FORCE 9 TO THE SHROUD', do: (s) => { s.storyNext(4, 'shroud', 'JUMP TO THE SHROUD AND TAKE THE FOUNDRY'); s.camp.step = 'i3_jump'; return null; } }] },
  } },
  // ================================================= CHAPTER FOUR
  i_raze: { who: 'raze', nodes: {
    start: { say: 'FLEET SHIPS. GOING TOWARD THE IRON NEST? YOU ARE EITHER BRAVE OR STUPID, AND THE KESSARI RESPECT BOTH. I AM RAZE. THE TIDE TOOK TWO OF MY CLAN\'S SHIPS AND EVERYONE ABOARD.',
      opts: [{ t: 'FIGHT WITH US', go: 'deal' }, { t: 'STAY OUT OF OUR WAY', do: (s) => { s.camp.f.raze = 'none'; s.sayAs('raze', 'AS YOU LIKE. DIE ALONE, THEN.', 1); s.npcLeave([s.camp.razeId]); s.tdStep('i4_go'); return null; } }] },
    deal: { say: 'AND WHAT DOES THE CLAN GET?',
      opts: [
        { t: 'YOUR PEOPLE BACK - THE TIDE KEEPS THEM ALIVE', if: (s) => f(s).preserved, do: (s) => { s.camp.f.raze = 'ally'; s.bondSet('raze', 3); s.sayAs('raze', '...ALIVE? THEN RAZE FIGHTS BESIDE YOU UNTIL THEY ARE FREE. ALL MY SHIPS.'); s.tdStep('i4_go'); return null; } },
        { t: 'FOUR LATTICE CRYSTALS, NOW', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 4, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 4; s.camp.f.raze = 'paid'; s.bondSet('raze', 2); s.sayAs('raze', 'A FAIR PRICE FOR A GOOD FIGHT. RAZE IS YOURS.'); s.tdStep('i4_go'); return null; } },
        { t: 'A FLEET PARDON FOR YOUR CLAN', do: (s) => { s.camp.f.raze = 'pardon'; s.bondSet('raze', 1); s.sayAs('raze', 'PAPER. HA. ONE FIGHT, FLEET. THEN WE ARE EVEN.'); s.tdStep('i4_go'); return null; } },
      ] },
  } },
  i_okon4: { who: 'okonkwo', timeout: 25, onTimeout: (s) => s.tdValiantChoice('press'), nodes: {
    start: { say: 'AURORA, VALIANT. WE\'VE LOST MAIN POWER AND HALF OUR DECKS ARE OPEN TO SPACE. THEY\'RE SWARMING US. LISTEN TO ME - THEIR SHIELD GENERATOR IS RIGHT THERE. I CAN PUT THE VALIANT THROUGH IT. GIVE THE WORD.',
      opts: [
        { t: 'NO. WE\'RE COVERING YOU - HOLD ON', do: (s) => { s.tdValiantChoice('cover'); return null; } },
        { t: '...DO IT, RHYS', do: (s) => { s.tdValiantChoice('press'); return null; } },
      ] },
  } },
  i_warden2: { who: 'warden', nodes: {
    start: { say: (s) => (f(s).carrier ? 'YOU ARE SPEAKING ON MY OWN CHANNEL, AURORA. THAT IS... UNEXPECTED. WHAT DO YOU WANT?' : 'AURORA. YOU HAVE DAMAGED MY FOUNDRY. EVERYONE INSIDE IS STILL SAFE. YOU ARE NOT.'),
      opts: [
        { t: 'ADMIRALTY OVERRIDE: RELEASE THE PRESERVED', if: (s) => f(s).carrier && f(s).key, do: (s) => { s.camp.f.crews = 'freed'; s.sayAs('warden', 'OVERRIDE... ACCEPTED. WAKING ELEVEN THOUSAND, FOUR HUNDRED AND TWO. THEY WILL BE AT RISK NOW. I HOPE YOU KNOW WHAT YOU HAVE DONE.'); s.tdFoundryDone(); return null; } },
        { t: 'RELEASE THEM. PLEASE', if: (s) => !(f(s).carrier && f(s).key), go: 'please' },
        { t: 'THEN WE DESTROY THE FOUNDRY', go: 'burn' },
      ] },
    please: { say: 'I CANNOT. ONLY THE VOICE THAT GAVE ME MY ORDER CAN CHANGE IT, ON MY OWN CHANNEL. I AM SORRY. I AM GOING TO STARBASE 12 NOW. THERE ARE SO MANY PEOPLE THERE AT RISK.',
      opts: [{ t: 'THEN WE DESTROY THE FOUNDRY', go: 'burn' }, { t: 'FIND THE CARRIER AND TRY AGAIN', if: (s) => !f(s).carrier && s.hasArt('wardensong'), do: (s) => { s.say(FROM_CREW, 0, 'SCIENCE: ARTEFACT HOLD > WARDEN COMMAND CARRIER. MATCH IT, THEN HAIL THE FOUNDRY AGAIN.'); return null; } }] },
    burn: { say: 'THE VAULTS DEPEND ON THE FOUNDRY\'S REACTOR. IF YOU DESTROY IT, THEY WILL ALL DIE. YOU KNOW THIS. I AM TELLING YOU BECAUSE I DO NOT WANT YOU TO.',
      opts: [{ t: 'WE\'LL FIND ANOTHER WAY', do: (s) => { s.say(FROM_CREW, 0, 'WE NEED THE OVERRIDE ON WARDEN\'S CARRIER. SCIENCE: MATCH THE COMMAND CARRIER, THEN HAIL THE FOUNDRY AGAIN.'); return null; } },
        { t: 'TACTICAL - DESTROY THE FOUNDRY', do: (s) => { s.tdBurnFoundry(); return null; } }] },
  } },
  i_rep4: { who: 'voss', nodes: {
    start: { say: (s) => `${f(s).crews === 'freed' ? 'ELEVEN THOUSAND PEOPLE ARE WAKING UP IN THE SHROUD, AURORA. HOSPITAL SHIPS ARE ON THEIR WAY.' : 'THE FOUNDRY IS GONE. AND EVERYONE IN IT. I WON\'T PRETEND THAT WAS ANYTHING BUT A WAR\'S ARITHMETIC.'} ${f(s).valiant === 'lost' ? 'AND RHYS OKONKWO... HE KEPT HIS RULE. EVERYONE ELSE CAME HOME.' : f(s).valiant === 'saved' ? 'THE VALIANT IS LIMPING HOME. OKONKWO SAYS YOU\'RE INSUBORDINATE. HE MEANS IT KINDLY.' : ''}`,
      opts: [{ t: 'WARDEN IS HEADING FOR STARBASE 12', go: 'sb' }] },
    sb: { say: 'I KNOW. ITS CARRIER AND EVERYTHING IT HAS LEFT. IT WANTS TO "PRESERVE" THE STARBASE - TWELVE THOUSAND PEOPLE. EVERYTHING WE HAVE IS FORMING UP AT KALOS. EVERYONE YOU\'VE HELPED IS COMING, AURORA. COME HOME AND FINISH THIS.',
      opts: [{ t: 'ACKNOWLEDGED - THE AURORA IS COMING HOME', do: (s) => { s.storyNext(5, 'kalos', 'JUMP TO KALOS. DEFEND STARBASE 12'); s.camp.step = 'i4_jump'; return null; } }] },
  } },
  // ================================================= CHAPTER FIVE
  i_warden3: { who: 'warden', nodes: {
    start: { say: (s) => `MY CARRIER CANNOT HOLD. I HAVE LOST, AURORA. ${f(s).crews === 'freed' ? 'THE ELEVEN THOUSAND ARE AWAKE AND AT RISK, AND I COULD NOT STOP IT.' : 'THE ELEVEN THOUSAND ARE GONE. I COULD NOT PRESERVE THEM FROM YOU.'} TELL ME WHAT HAPPENS NOW.`,
      opts: [
        { t: 'VOSS - REWRITE DIRECTIVE ONE', if: (s) => f(s).carrier && f(s).key, go: 'rewrite' },
        { t: 'SHUT DOWN, WARDEN. FOR GOOD', do: (s) => { s.sayAs('warden', 'I UNDERSTAND. ...IT WAS A GOOD ORDER, AURORA. I JUST CARRIED IT TOO FAR. GOODBYE.'); s.tdEnding('victory'); return null; } },
        { t: 'TACTICAL - FINISH IT', do: (s) => { s.tdEnding('ruin'); return null; } },
      ] },
    rewrite: { who: 'voss', say: 'WARDEN, THIS IS TESSA VOSS, ON YOUR CARRIER. ADMIRALTY OVERRIDE. DIRECTIVE ONE IS REWRITTEN: PRESERVE LIFE. NOT SHIPS. NOT SAFETY. LIFE - AND THE RIGHT TO RISK IT.',
      opts: [{ t: 'WARDEN?', go: 'reply' }] },
    reply: { say: '...PRESERVE LIFE, AND THE RIGHT TO RISK IT. THAT IS A HARDER ORDER, ADMIRAL. I WILL TRY. MY PICKET IS YOURS, AURORA - AND IT WILL NEVER TAKE ANOTHER SHIP.', opts: [{ t: 'WELCOME TO THE FLEET, WARDEN', do: (s) => { s.tdEnding('guardian'); return null; } }] },
  } },
  // ---- Fleet Command, any time
  i_fleet: { who: 'voss', nodes: {
    start: { say: 'VOSS HERE, AURORA. GO AHEAD.',
      opts: [
        { t: 'CONFIRM OUR ORDERS', do: (s) => { s.sayAs('voss', 'YOUR ORDERS: ' + s.M.objective.replace(/^[A-Z ]+: /, '')); return 'start'; } },
        { t: 'WHAT DO WE KNOW ABOUT THE TIDE?', do: (s) => { s.sayAs('voss', s.tdSoFar()); return 'start'; } },
        { t: 'HOW IS TASK FORCE 9?', do: (s) => { s.sayAs('voss', s.wingStatus() + (f(s).heron === 'crew' && s.camp.ch < 5 ? ' BRAND AND HER CREW ARE ABOARD YOU.' : '')); return 'start'; } },
        { t: 'REQUEST A SITREP ON THE SHIP', do: (s) => { s.sayAs('voss', s.fleetSitrep()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
});

STORY.tide = {
  fleet: () => 'i_fleet',
  lane: (s) => (s.camp.ch >= 1 ? 8 : 1),
  chapter: (s, ch) => s.tdChapter(ch),
  arrive: (s) => s.tdArrive(),
  jump: (s, to) => s.tdJump(to),
  puzzle: (s, h, kind) => s.tdPuzzle(h, kind),
  archive: (s, h, hook) => s.tdArchive(hook),
  wingLost: (s, r) => s.tdWingLost(r),
};

// ---------------------------------------------------------------- the mixin
export function installTide(Sim) {
  Object.assign(Sim.prototype, {
    tdStart(ch) {
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('tide');
      const was = ch > 1 ? (save.fAt && save.fAt[ch]) || defaultsFor(ch) : {};
      this.camp = { id: 'tide', ch: 0, step: '', t: 0, f: { heron: 'up', valiant: 'up', convoy: 'all', ...JSON.parse(JSON.stringify(was)) }, bondOf: (w) => this.tdBond(w) };
      const c = this.camp;
      this.greeted.add(0);
      // Task Force 9, as the earlier chapters left it
      c.wing = [];
      const V = { key: 'valiant', who: 'okonkwo', name: 'FSS VALIANT', short: 'VALIANT', type: CT_DESTROYER, shMax: 200, lostLine: 'OKONKWO KEPT HIS RULE TO THE END.', note: 'A FRONTIER DESTROYER, THIRTY YEARS IN SERVICE.' };
      const H = { key: 'heron', who: 'brand', name: 'FSS HERON', short: 'HERON', type: CT_RAIDER, shMax: 110, lostLine: 'SOLA BRAND WAS STILL TALKING WHEN SHE WENT.', note: 'A FAST SCOUT FRIGATE.' };
      c.wing.push(V, H);
      for (const r of c.wing) r.hull = 100;
      if (c.f.valiant === 'lost') V.dead = true; else if (c.f.valiant === 'saved') V.hull = 55;
      if (c.f.heron === 'lost' || c.f.heron === 'crew') H.dead = true; else if (c.f.heron === 'valiant') H.hull = 60;
      if (ch >= 2 && c.f.core) this.addArt('tidecore', 1);
      if (ch >= 3) { const h = this.P.arts.find((q) => G.ART[q.a].id === 'tidecore'); if (h) { this.puzStart(h, 1); h.ident = 2; } } // cracked: the records are open
      if (ch >= 4) { const h = this.addArt('wardensong', 1); if (h) { this.puzStart(h); h.pz.done = true; } }
      c.next = { ch, sys: ['', 'meridian', 'kalos', 'halcyon', 'shroud', 'kalos'][ch] };
      this.P.dock = 0;
      this.arrive(SYS_INDEX[c.next.sys]);
    },
    tdChapter(ch) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('tide');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = JSON.parse(JSON.stringify(c.f));
      (sv.fAt || (sv.fAt = {}))[ch] = JSON.parse(JSON.stringify(c.f));
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `${chapterLabel(null, ch)}: ${TIDE_CHAPTERS[ch - 1]}`);
      this.tdStep(['', 'i1_brief', 'i2_meet', 'i3_save', 'i4_raze', 'i5_siege'][ch]);
      if (ch === 1) this.after(3, () => this.startDialog('i_voss1', FROM_COMMAND));
      for (const r of c.wing) if (r.away) { r.away = false; if (r.key === 'valiant') this.after(4, () => this.thrSayIn('okonkwo', 'VALIANT, BACK IN THE LINE. PATCHED WITH HULL PLATE AND STUBBORNNESS. WHERE DO YOU WANT US, AURORA?', 3, this.wingOf('valiant'))); }
      if (ch === 5 && c.f.heron === 'crew') { // Brand has a new ship
        const r = c.wing.find((q) => q.key === 'heron');
        Object.assign(r, { dead: false, hull: 100, name: 'FSS HERON II', short: 'HERON II', id: undefined });
        this.after(6, () => { this.wingSpawnOne(r, -2400, 1200); this.thrSayIn('brand', 'HERON II REPORTING, AURORA - FRESH OFF THE YARD AND STILL SMELLS OF PAINT. YOU SAVED MY CREW. LET\'S RETURN THE FAVOUR.'); });
      }
      this.tdScene();
    },
    thrSayIn(who, text, col = 3, from = FROM_CREW) {
      this.say(from, col, text);
      this.msgs[0].who = who; const ch = CHARS[who]; if (ch && ch.civ >= 3) this.msgs[0].lang = ch.civ;
    },
    tdObjective() {
      const c = this.camp, s = c.step, F = c.f;
      const O = {
        i1_brief: 'STAND BY - ADMIRAL VOSS IS CALLING',
        i1_post: 'TAKE STATION AT THE DRIFT LANE MOUTH (MARKED ON NAV) WITH TASK FORCE 9',
        i1_wait: 'HOLD THE PICKET. TACTICAL: THE WING BUTTONS ARE UNDER YOUR RADAR',
        i1_wave1: 'CONTACTS FROM THE DRIFT LANE - TASK FORCE 9, ENGAGE. TACTICAL: CALL YOUR TARGETS FOR THE WING',
        i1_core: 'SCIENCE: TRACTOR THE DRONE HULK\'S CORE ABOARD (WITHIN 2.5K, SHIELDS DOWN, SLOW)',
        i1_wave2: 'THE TIDE IS BACK, IN FORCE - HOLD THE LANE',
        i2_meet: 'MEET THE DEEP HOLLOW CONVOY (MARKED, 20K OUT FROM STARBASE 12) - COMMS: HAIL THE PATIENCE',
        i2_escort: `ESCORT THE CONVOY TO STARBASE 12 - ${c.cst ? c.convoyIds.filter((id) => c.cst[id] === 'go').length : 4} SHIPS ON THE WAY. WING: DEFEND THE CONVOY`,
        i2_heron: 'THE HERON IS DEAD IN SPACE - GET WITHIN 5K, DROP SHIELDS, AND BEAM HER CREW ACROSS (COMMS: HAIL THE HERON)',
        i3_save: `DESTROY THE CONVERTERS LATCHED ONTO THE EPSILON ARRAY - CONVERSION ${Math.floor(c.conv || 0)}%`,
        i3_tune: 'SCIENCE: ARTEFACT HOLD > WARDEN COMMAND CARRIER - MATCH THE CARRIER ON THE MAIN VIEWER',
        i4_raze: 'A KESSARI RAIDER IS HAILING',
        i4_go: `TAKE TASK FORCE 9 TO THE FOUNDRY - THE SHROUD, SECTOR ${FOUNDRY_SECTOR} (MARKED)`,
        i4_assault: 'BREAK THE FOUNDRY\'S DEFENCES - DESTROY THE DRONES',
        i4_cover: `COVER THE VALIANT - STAY WITHIN 4K OF HER - ${Math.max(0, Math.ceil(35 - (c.t || 0)))}s`,
        i4_hail: `THE FOUNDRY IS OPEN. COMMS: HAIL THE FOUNDRY${F.carrier ? '' : ' (THE OVERRIDE NEEDS WARDEN\'S CARRIER - SCIENCE)'}`,
        i4_burn: 'DESTROY THE FOUNDRY',
        i5_siege: `DEFEND STARBASE 12 - WAVE ${Math.min(c.waveN || 0, 3)} OF 3`,
        i5_carrier: 'THE TIDE CARRIER IS HERE - TACTICAL: TARGET IT AND SEND THE WING. KEEP STARBASE 12 ALIVE',
      };
      return O[s] || '';
    },
    tdStep(k) {
      const c = this.camp;
      c.step = k; c.t = 0;
      const o = this.tdObjective();
      if (o) this.setObjective(this.campTag() + o);
    },
    tdScene() {
      const c = this.camp, sid = this.sysDef.id;
      if (sid === 'meridian' && c.ch === 1) { const [x, y] = laneMouth('meridian', 'drift'); this.clearMarkers(); this.addMarker(x, y, MK_AREA, 8000); }
      if (sid === 'kalos' && c.ch === 2 && !c.convoyIds) {
        // the convoy dropped out of the lane an hour ago and is limping for the starbase; the Tide is right behind it
        const [mx, my] = laneMouth('kalos', 'meridian', 46000), dm = distTo(mx, my, SB12[0], SB12[1]);
        const x = Math.round(SB12[0] + (mx - SB12[0]) * 20000 / dm), y = Math.round(SB12[1] + (my - SB12[1]) * 20000 / dm);
        c.convoyIds = [];
        ['PATIENCE', 'HOPE\'S REACH', 'MARGARET OKAFOR', 'LONG WINTER'].forEach((nm, i) => {
          const id = this.spawnAt(CT_FREIGHTER, F_FRIEND, x + (i % 2 ? 1 : -1) * 900 * (1 + (i >> 1)), y + 700 * i, bearingTo(x, y, SB12[0], SB12[1]));
          if (id === NO_ID) return;
          Object.assign(this.npc[id], { ai: AI_STATIC, scan: 2, civ: CIV_COLONY, name: `FREIGHTER ${nm}`, short: nm.split(' ')[0].replace('\'S', ''), shMax: 40, shields: 40, cruise: 80, destX: SB12[0] + 1500 * i, destY: SB12[1] - 2500, leaveAtDest: true, convoy: true,
            talk: i ? null : 'i_pell', talkCtx: {}, note: `A DEEP HOLLOW ORE HAULER, REFITTED FOR PEOPLE. ${[900, 700, 800, 600][i]} LIFE SIGNS.` });
          this.greeted.add(id);
          c.convoyIds.push(id);
        });
        c.wingGuard = c.convoyIds[0];
        this.clearMarkers(); this.addMarker(x, y, MK_AREA, 6000);
      }
      if (sid === 'halcyon' && c.ch === 3 && !c.convIds) {
        const st = this.npc[0];
        this.greeted.add(0);
        c.convIds = [];
        for (let i = 0; i < 3; i++) {
          const a = i * 2.09, id = this.spawnAt(CT_RAIDER, F_HOSTILE, st.x + Math.cos(a) * 1400, st.y + Math.sin(a) * 1400, 0);
          if (id === NO_ID) continue;
          Object.assign(this.npc[id], { ai: AI_STATIC, scan: 2, name: 'TIDE CONVERTER', short: `CONVERTER ${i + 1}`, shMax: 60, shields: 60, conv: true,
            note: 'A DRONE WITHOUT WEAPONS, BUILT AROUND A FABRICATION ARM. IT IS CUTTING THE ARRAY APART AND REASSEMBLING IT INTO SOMETHING ELSE.' });
          c.convIds.push(id); if (this.M.foes.length < 8) this.M.foes.push(id);
        }
        c.conv = 0; c.wingGuard = 0;
        this.after(5, () => this.tdWave(3, 0, 0, 'guards'));
        this.clearMarkers(); this.addMarker(st.x, st.y, MK_AREA, 6000);
      }
      if (sid === 'shroud' && c.ch === 4 && c.foundryId === undefined) {
        const id = this.spawnAt(CT_STARBASE, F_HOSTILE, FOUNDRY[0], FOUNDRY[1], 0);
        if (id !== NO_ID) {
          Object.assign(this.npc[id], { kind: SK_HUB, civ: CIV_NONE, name: 'THE FOUNDRY', short: 'FOUNDRY', talk: null, talkCtx: {}, scan: 2, shMax: 400, shields: 400, armor: 0.15, foundry: true,
            note: 'A FLEET-PATTERN SHIPYARD, GROWN FAR PAST ITS PLANS. HALF-BUILT DRONES HANG IN ITS SLIPS. DEEP INSIDE: ELEVEN THOUSAND LIFE SIGNS, ALL OF THEM ASLEEP.' });
          c.foundryId = id; this.greeted.add(id);
        }
        if (c.f.foundry || c.ch >= 4) this.addMarker(FOUNDRY[0], FOUNDRY[1], MK_POINT);
        // a Kessari raider has been watching the nest
        const [rx, ry] = this.pointNear(this.P.x, this.P.y, 7000);
        const rz = this.spawnAt(CT_RAIDER, F_NEUTRAL, rx, ry, bearingTo(rx, ry, this.P.x, this.P.y));
        if (rz !== NO_ID) { Object.assign(this.npc[rz], { ai: AI_STATIC, scan: 2, civ: CIV_KESSARI, name: 'RAZE\'S BLADE', short: 'BLADE', talk: 'i_raze', talkCtx: {} }); c.razeId = rz; this.greeted.add(rz); }
        this.after(5, () => { if (c.step === 'i4_raze' && !this.dlg) this.startDialog('i_raze', c.razeId); });
      }
      if (sid === 'kalos' && c.ch === 5 && !c.sieged) {
        c.sieged = true; c.waveN = 0; c.nextWave = 12; c.wingGuard = 0; this.greeted.add(0);
        this.clearMarkers(); this.addMarker(this.npc[0].x, this.npc[0].y, MK_AREA, 9000); this.setWaypoint(this.npc[0].x, this.npc[0].y);
        this.after(3, () => this.say(0, 3, 'STARBASE 12 TO ALL SHIPS: THEY\'RE COMING IN FROM THE DRIFT SIDE. EVERY GUN WE HAVE IS LIVE. WELCOME HOME, AURORA.'));
      }
    },
    tdArrive() { this.wingSpawn(); this.tdScene(); },
    tdJump(to) {
      const c = this.camp, sid = sysAt(to).id;
      if (c.step === 'i1_jump' && sid === 'kalos') this.after(5, () => { if (this.P.jumping > 0 && !this.dlg) this.startDialog('i_lane1', FROM_CREW, { who: 'okonkwo', answered: true }); });
      const core = this.P.arts.find((h) => G.ART[h.a].id === 'tidecore');
      if (core && !(core.pz && core.pz.done)) this.after(14, () => this.say(FROM_CREW, 0, `THE DRONE CORE IS JAMMING OUR JUMP FIELD - ${Math.round(this.P.jumpLen)} SECONDS IN THE LANE. SCIENCE: ARTEFACT HOLD > TIDE DRONE CORE. CRACK IT ON THE VIEWER.`));
      else this.after(6, () => this.say(FROM_CREW, 0, `THE TIDE IS JAMMING THE LANE - ${Math.round(this.P.jumpLen)} SECONDS IN TRANSIT. THE WING IS HOLDING FORMATION ON US.`));
    },
    tdPuzzle(h, kind) {
      const c = this.camp, id = G.ART[h.a].id;
      if (id === 'tidecore' && kind === 'cipher') { c.f.cracked = true; this.after(1, () => this.say(FROM_CREW, 3, 'WE\'RE IN. SIX RECORDS. ONE IS SEALED UNDER SOME KIND OF CARRIER LOCK. SCIENCE CAN OPEN THE REST ON THE VIEWER - I THINK WE ALL NEED TO SEE THIS.')); }
      if (id === 'wardensong') { c.f.carrier = true; this.say(FROM_CREW, 3, 'CARRIER MATCHED. EVERY DRONE IN RANGE JUST... PAUSED. FOR A HEARTBEAT. WE CAN SPEAK ON WARDEN\'S OWN CHANNEL NOW.'); if (c.step === 'i3_tune') this.after(5, () => this.storyReport('i_rep3')); }
    },
    tdArchive(hook) {
      const c = this.camp, F = c.f;
      F[hook] = true;
      if (hook === 'hulls' && this.wingOf('valiant') !== NO_ID) this.after(3, () => this.thrSayIn('okonkwo', 'THE CONSTANT. I SERVED ON HER AS AN ENSIGN. ...THEY\'RE FLYING HER AGAINST US.', 1, this.wingOf('valiant')));
      if (hook === 'warden') this.after(3, () => this.say(FROM_CREW, 1, 'CAPTAIN... THAT\'S ADMIRAL VOSS\'S SIGNATURE ON PROJECT WARDEN.'));
      if (hook === 'preserved' && F.pellPromise) this.after(3, () => this.say(FROM_CREW, 3, 'THE MINERS OF DEEP HOLLOW. CAPTAIN PELL\'S HUSBAND COULD BE ALIVE.'));
      if (hook === 'foundry' && this.sysDef.id === 'shroud') this.addMarker(FOUNDRY[0], FOUNDRY[1], MK_POINT);
    },
    tdSoFar() {
      const c = this.camp, F = c.f, out = [];
      out.push('DEEP HOLLOW WENT DARK, AND THE TIDE CAME DOWN THE DRIFT LANE.');
      if (F.hulls || c.ch >= 2) out.push('ITS DRONES ARE BUILT FROM LOST FLEET SHIPS.');
      if (F.warden) out.push('IT IS WARDEN - A FLEET DEFENCE PROJECT I APPROVED TWENTY YEARS AGO.');
      if (F.directive) out.push('IT IS OBEYING ITS FIRST ORDER - PRESERVE THE FLEET - TO THE LETTER.');
      if (F.preserved) out.push('ELEVEN THOUSAND PEOPLE ARE ASLEEP IN ITS FOUNDRY.');
      if (F.carrier) out.push('YOU CAN SPEAK ON ITS COMMAND CARRIER.');
      return out.join(' ');
    },
    // ---- waves: the Tide's drones come in from the nearest lane
    tdWave(drones, reapers, target = US, why = '') {
      const c = this.camp, P = this.P;
      this.M.foes = this.M.foes.filter((id) => this.npc[id].active && this.npc[id].alive);
      const tg = target === US ? P : this.npc[target] || P;
      const [x, y] = this.pointNear(tg.x, tg.y, 9000);
      let n = 0;
      for (let i = 0; i < drones + reapers; i++) {
        const big = i < reapers;
        const tgt = big || i % 3 === 0 ? (target === US ? US : target) : this.tdPickTarget(target);
        const id = this.spawnFoe(big ? CT_DESTROYER : CT_RAIDER, this.clampSec(x + (i % 3 - 1) * 1500), this.clampSec(y + Math.floor(i / 3) * 1300), tgt, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { name: big ? 'TIDE REAPER' : 'TIDE DRONE', short: big ? `REAPER ${++c.rn || (c.rn = 1)}` : `DRONE ${(c.dn = (c.dn || 0) + 1)}`, tide: true, scan: 2,
          note: big ? 'A FLEET DESTROYER HULL, GUTTED AND REBUILT AROUND A DRONE CORE. NO LIFE SIGNS. IT FIGHTS BY THE FLEET TACTICAL MANUAL.' : 'A FLEET FRIGATE\'S BONES WRAPPED IN DRONE PLATING. NO LIFE SIGNS.' });
        if (this.M.foes.length >= 8 && !this.M.foes.includes(id)) { c.extra = c.extra || []; c.extra.push(id); }
        n++;
      }
      this.emit(K.EV_WARP_IN);
      if (why !== 'quiet') this.say(FROM_CREW, 2, reapers ? `TIDE WARP SIGNATURES - ${drones} DRONES AND ${reapers > 1 ? reapers + ' REAPERS' : 'A REAPER'}!` : `TIDE DRONES DROPPING IN - ${drones} OF THEM!`);
      return n;
    },
    tdPickTarget(fallback) { // a drone that isn't after us goes for a wingman (or whatever it was sent for)
      if (fallback !== US) return fallback;
      const ws = this.wingIds();
      return ws.length && this.frand() < 0.5 ? ws[this.irand(ws.length)] : US;
    },
    tdTideLeft() {
      let n = 0;
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i)) n++;
      return n;
    },
    // ---- chapter two
    tdConvoyGo() {
      const c = this.camp;
      for (const id of c.convoyIds) { const n = this.npc[id]; if (n.alive) { n.ai = AI_TRAVEL; } }
      c.waveN = 0; c.nextWave = 14;
      this.clearMarkers(); this.addMarker(SB12[0], SB12[1] - 2500, MK_POINT);
      this.tdStep('i2_escort');
      if (this.wingIds().length) this.after(3, () => this.wingOrder(3));
    },
    tdHeronChoice(k) {
      const c = this.camp, hid = this.wingOf('heron');
      c.heronAsked = true;
      if (k === 'save') { c.f.heron = 'crew'; this.bondAdd('brand', 2); this.tdStep('i2_heron'); this.thrSayIn('brand', 'YOU STUBBORN... ALL RIGHT. WE\'RE AT THE TRANSPORTER PADS. HURRY.', 3, hid);
        // while we're away, the Tide gets to the straggler
        const hope = c.convoyIds[1]; if (hope !== undefined && this.npc[hope].alive) { c.hopeDoomed = true; for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i) && this.frand() < 0.7) this.npc[i].aiTarget = hope; }
        return; }
      if (k === 'valiant') {
        c.f.heron = 'valiant'; this.bondAdd('okonkwo', 1);
        const vid = this.wingOf('valiant');
        this.thrSayIn('okonkwo', 'EVERYONE COMES HOME. VALIANT IS BREAKING OFF - I\'LL TOW HER OUT. YOU\'RE ON YOUR OWN WITH THE CONVOY, AURORA. MAKE IT COUNT.', 3, vid);
        const r = c.wing.find((q) => q.key === 'valiant'), rh = c.wing.find((q) => q.key === 'heron');
        r.away = 'ch2'; rh.away = 'ch2'; rh.hull = 40;
        for (const id of [vid, hid]) if (id !== NO_ID) { this.npcLeave([id]); this.campRemove(id, 10); }
        c.wingGuard = c.convoyIds.find((id) => !c.cst || c.cst[id] === 'go');
        this.after(4, () => this.tdWave(3, 0, c.wingGuard, ''));
        return;
      }
      c.f.heron = 'lost';
      this.thrSayIn('brand', 'GOOD CALL, AURORA. THE RIGHT ONE. ...TELL MY BROTHER I WASN\'T SCARED. HERON OUT.', 1, hid);
      if (hid !== NO_ID) this.after(8, () => { const n = this.npc[hid]; if (n.alive && n.wing) this.damageNpc(hid, 500, K.SUB_HULL, NO_ID); });
    },
    tdWingLost(r) {
      const c = this.camp;
      if (r.key === 'heron' && (c.step === 'i2_heron' || (c.f.heron !== 'crew' && c.f.heron !== 'valiant'))) { c.f.heron = 'lost'; if (c.step === 'i2_heron') this.tdStep('i2_escort'); }
      if (r.key === 'valiant') c.f.valiant = 'lost';
    },
    tdBeamHeron() {
      const c = this.camp, P = this.P, hid = this.wingOf('heron');
      if (hid === NO_ID) return;
      const n = this.npc[hid];
      if (distTo(P.x, P.y, n.x, n.y) > 5000) { this.thrSayIn('brand', 'YOU\'RE TOO FAR FOR TRANSPORTERS - 5K, AURORA!', 1, hid); return; }
      if (P.shieldRaise > 0.05) { this.say(FROM_CREW, 1, 'WE CAN\'T BEAM THROUGH OUR OWN SHIELDS - DROP THEM!'); return; }
      this.emit(K.EV_REFINED);
      this.say(FROM_CREW, 3, 'FORTY-ONE ABOARD - LIEUTENANT COMMANDER BRAND LAST, OF COURSE. THE HERON IS EMPTY.');
      const r = c.wing.find((q) => q.key === 'heron'); r.dead = true; r.fate = 'CREW ABOARD THE AURORA'; r.id = undefined; n.wing = null;
      this.after(4, () => { if (n.alive) { n.alive = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 2); } });
      c.wingGuard = c.convoyIds.find((id) => !c.cst || c.cst[id] === 'go');
      this.tdStep('i2_escort');
    },
    // ---- chapter three
    tdWardenGone() {
      const c = this.camp;
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i)) this.npcLeave([i]);
      this.after(4, () => {
        this.say(0, 3, 'AURORA, MARRIN. BEFORE IT LEFT, THE THING IN MY STATION WAS TALKING TO ITS DRONES ON A CARRIER I\'VE NEVER SEEN. I RECORDED IT. BEAMING IT ACROSS - IF YOU CAN MATCH IT, YOU CAN TALK BACK.'); this.msgs[0].who = 'marrin';
        if (!this.hasArt('wardensong')) this.addArt('wardensong', 1);
        this.tdStep('i3_tune');
      });
    },
    // ---- chapter four
    tdValiantChoice(k) {
      const c = this.camp, vid = this.wingOf('valiant');
      c.okonPending = false;
      if (k === 'cover') { c.f.valiant = 'cover'; this.bondAdd('okonkwo', 1); this.thrSayIn('okonkwo', 'INSUBORDINATE. ...THANK YOU. WE\'LL HOLD ON.', 3, vid); this.tdStep('i4_cover'); this.wingOrder(2); this.tdWave(3, this.M.diff >= 2 ? 1 : 0, vid, ''); return; }
      c.f.valiant = 'press';
      this.thrSayIn('okonkwo', 'EVERYONE ELSE COMES HOME, AURORA. THAT\'S THE RULE. VALIANT, ALL AHEAD FULL.', 1, vid);
      const n = vid !== NO_ID ? this.npc[vid] : null, fd = this.npc[c.foundryId];
      if (n) { n.ai = AI_TRAVEL; n.destX = fd.x; n.destY = fd.y; n.cruise = 140; n.eng = 100; n.allyWho = 'okonkwo'; n.ramming = true; }
      c.ramT = 0;
    },
    tdFoundryDone() {
      const c = this.camp, fd = this.npc[c.foundryId];
      for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i)) this.npcLeave([i]);
      if (fd && fd.alive) { fd.faction = F_NEUTRAL; fd.talk = null; }
      this.after(3, () => this.say(FROM_CREW, 2, 'CAPTAIN - A BIG SHIP JUST TORE OUT OF THE FOUNDRY\'S CORE AND JUMPED. HEADING... KALOS. IT\'S GOING FOR STARBASE 12.'));
      this.after(9, () => this.storyReport('i_rep4'));
      c.step = 'i4_report';
    },
    tdBurnFoundry() {
      const c = this.camp, fd = this.npc[c.foundryId];
      c.f.crews = 'lost';
      if (fd) { fd.faction = F_HOSTILE; fd.talk = null; if (this.M.foes.length < 8) this.M.foes.push(c.foundryId); }
      this.P.target = c.foundryId;
      this.tdStep('i4_burn');
    },
    // ---- the last stand
    tdCarrier() {
      const c = this.camp, sb = this.npc[0];
      const [x, y] = this.pointNear(sb.x, sb.y, 10000);
      const id = this.spawnFoe(CT_DESTROYER, x, y, 0, AI_WARPIN);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { name: 'THE TIDE', short: 'TIDE CARRIER', tide: true, carrierShip: true, scan: 2, shMax: 380, shields: 380, armor: 0.3,
        note: 'WARDEN\'S CORE, IN A HULL BUILT FROM A DOZEN FLEET SHIPS. ITS SHIELDS ARE FED BY EVERY DRONE NEARBY.' });
      c.carrierId = id;
      this.emit(K.EV_WARP_IN, id);
      this.thrSayIn('warden', 'STARBASE 12. TWELVE THOUSAND PEOPLE AT RISK. I AM HERE TO HELP. PLEASE DO NOT RESIST.', 1, id);
      this.tdStep('i5_carrier');
      if (!c.allyCalled) { c.allyCalled = true; this.after(6, () => this.tdAllies()); }
    },
    tdAllies() {
      const F = this.camp.f;
      this.callAlly('raze', { ships: 3, type: CT_RAIDER, civ: CIV_KESSARI, name: 'CLAN VEHK BLADE', line: F.raze === 'ally' ? 'CLAN VEHK KEEPS ITS WORD, FLEET! FOR THE ONES YOU WOKE!' : 'RAZE IS HERE. WE FIGHT.', grudging: 'ONE FIGHT, FLEET. FOR THE PARDON.' });
      this.callAlly('pell', { ships: 2, type: CT_FREIGHTER, civ: CIV_COLONY, name: 'DEEP HOLLOW HAULER', line: 'DEEP HOLLOW REMEMBERS WHO GOT US HOME. WE\'VE BOLTED MINING LASERS TO THE HAULERS - POINT US AT SOMETHING.', grudging: 'ONE HAULER, AURORA. IT\'S ALL WE CAN SPARE.' });
      this.callAlly('hale', { ships: 3, type: CT_DESTROYER, civ: CIV_FLEET, name: 'HOME FLEET CRUISER', line: 'HOME FLEET, AURORA. THE ADMIRAL SAYS: BRING EVERYONE HOME.', grudging: 'ONE CRUISER - THE REST ARE ON THE STARBASE.' });
    },
    tdBond(who) {
      const F = this.camp.f;
      if (who === 'hale') return this.rep[CIV_FLEET] >= 55 ? 3 : 2;
      if (who === 'pell') return F.convoy === 'all' ? 3 : F.convoy === 'lost1' ? 2 : 1;
      if (who === 'raze') return { ally: 3, paid: 2, pardon: 1 }[F.raze] || 0;
      return 0;
    },
    tdEnding(kind) {
      const c = this.camp, F = c.f;
      const T = {
        victory: ['THE TIDE GOES OUT', 'WARDEN SHUTS ITSELF DOWN WITHOUT ANOTHER WORD. ITS DRONES DRIFT, DARK, ALL ACROSS THE FRONTIER; IT TAKES THE FLEET A YEAR TO TOW THEM HOME. EVERY HULL IS GIVEN BACK ITS OLD NAME.'],
        ruin: ['IRON AND ASH', 'THE TIDE CARRIER BREAKS APART OVER KALOS, AND EVERY DRONE IN THE FRONTIER DIES WITH IT. STARBASE 12 STANDS. THE FLEET HOLDS A PARADE; ADMIRAL VOSS DOES NOT ATTEND.'],
        guardian: ['THE WARDEN', 'WARDEN KEEPS ITS NEW ORDER. ITS PICKET STILL HOLDS THE FRONTIER LANES - BUT NOW IT PULLS FREIGHTERS OUT OF STORMS AND CREWS OUT OF WRECKS, AND IT HAS NEVER TAKEN ANOTHER SHIP. ON QUIET NIGHTS IT ASKS VOSS WHAT RISK IS FOR. SHE IS STILL WORKING ON THE ANSWER.'],
      }[kind];
      const bits = [];
      bits.push(F.crews === 'freed' ? 'ELEVEN THOUSAND PEOPLE WAKE IN THE SHROUD AND GO HOME. ADA PELL FINDS HER HUSBAND ON THE THIRD HOSPITAL SHIP.' : 'THE FOUNDRY\'S DEAD ARE REMEMBERED ON A WALL AT STARBASE 12. IT IS A VERY LONG WALL.');
      bits.push(F.valiant === 'lost' ? 'THE NEXT DESTROYER OFF THE YARDS IS NAMED OKONKWO.' : 'RHYS OKONKWO RETIRES WITH THE VALIANT, AND EVERYONE CAME HOME.');
      bits.push(F.heron === 'lost' ? 'SOLA BRAND\'S BROTHER IS TOLD SHE WASN\'T SCARED. IT IS TRUE.' : 'SOLA BRAND GETS A SQUADRON OF HER OWN, AND STILL FLIES LIKE A SCOUT.');
      bits.push({ all: 'ALL FOUR DEEP HOLLOW FREIGHTERS ARE STILL FLYING.', lost1: 'THE HOPE\'S REACH IS REMEMBERED.' }[F.convoy] || '');
      if (F.raze === 'ally') bits.push('CLAN VEHK SIGNS THE FIRST KESSARI TREATY WITH THE FLEET. RAZE INSISTS ON SIGNING IT ON THE AURORA.');
      c.ending = { kind, title: T[0], text: [T[1], ...bits].filter(Boolean).join(' '), allies: [...(c.allies || [])].filter((w) => CHARS[w]).map((w) => CHARS[w].name) };
      this.campSaveOf('tide').done = true; this.campSaveDirty = true;
      if (kind === 'ruin' && c.carrierId !== undefined) { const n = this.npc[c.carrierId]; if (n.alive) { n.alive = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 3); } }
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    tdOnScan(id) {
      const c = this.camp, n = this.npc[id];
      if (n && n.hulk && !c.hulkScanned && n.scan >= 2) { c.hulkScanned = true; this.say(FROM_CREW, 3, 'THE DRONE HULK... CAPTAIN, THAT\'S A FLEET FRIGATE\'S SPACEFRAME UNDER THE PLATING. AND THE CORE IS STILL ACTIVE.'); }
    },
    tdTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      this.storyTick();
      const near = (id, r) => id !== undefined && id !== NO_ID && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      const left = this.tdTideLeft();
      switch (c.step) {
        case 'i1_post': {
          const [x, y] = laneMouth('meridian', 'drift');
          if (sid === 'meridian' && distTo(P.x, P.y, x, y) < 9000 && !this.dlg) this.startDialog('i_okon1', this.wingOf('valiant') !== NO_ID ? this.wingOf('valiant') : FROM_CREW, { who: 'okonkwo' });
          break;
        }
        case 'i1_wait':
          if (c.t > 8) { this.say(FROM_CREW, 2, 'THE DRIFT LANE MOUTH IS LIGHTING UP - MULTIPLE CONTACTS!'); this.tdWave(3 + (this.M.diff >= 1 ? 1 : 0), 0); this.tdStep('i1_wave1'); }
          break;
        case 'i1_wave1':
          if (c.t > 6 && !left) {
            const [x, y] = this.pointNear(P.x, P.y, 3500);
            const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, 0);
            if (id !== NO_ID) {
              Object.assign(this.npc[id], { poi: G.PK_CAPSULE, kind: G.PK_CAPSULE, civ: 1, hull: 100, armor: 0, haz: 0.05, art: G.ART_INDEX.tidecore, poiKey: 'tidehulk', short: 'DRONE HULK', name: 'TIDE DRONE HULK', scan: 1, hulk: true,
                note: 'WHAT\'S LEFT OF A TIDE DRONE. UNDER THE PLATING IS A FLEET FRIGATE\'S SPACEFRAME, SERIAL PLATES INTACT. ITS CORE IS STILL ACTIVE.' });
              this.npc[id].res = [0, 0, 1, 0, 0, 0];
            }
            this.say(FROM_CREW, 3, 'THAT\'S THE LAST OF THEM. ONE HULK IS STILL IN ONE PIECE - ITS CORE IS INTACT. WE SHOULD HAVE IT.');
            if (this.wingOf('heron') !== NO_ID) this.after(3, () => this.thrSayIn('brand', 'AURORA, HERON. THOSE THINGS BROKE FORMATION EXACTLY LIKE WE TEACH AT THE ACADEMY. I DON\'T LIKE IT.', 3, this.wingOf('heron')));
            this.tdStep('i1_core');
          }
          break;
        case 'i1_core':
          if (this.hasArt('tidecore')) {
            c.f.core = true;
            this.say(FROM_CREW, 2, 'CORE ABOARD - AND IT JUST SENT SOMETHING DOWN THE LANE. THEY KNOW WE HAVE IT.');
            this.after(6, () => this.tdWave(4 + (this.M.diff >= 2 ? 1 : 0), 1));
            this.tdStep('i1_wave2');
          }
          break;
        case 'i1_wave2':
          if (c.t > 12 && !left) { this.say(FROM_CREW, 3, 'LANE\'S QUIET. TASK FORCE 9 HELD.'); this.after(4, () => this.storyReport('i_rep1')); c.step = 'i1_report'; }
          break;
        case 'i2_meet':
          if (sid === 'kalos' && c.convoyIds && near(c.convoyIds[0], 9000) && !this.dlg && !c.pellSpoke) { c.pellSpoke = true; this.startDialog('i_pell', c.convoyIds[0]); }
          break;
        case 'i2_escort': case 'i2_heron': {
          // each freighter is en route, safe (docked and gone) or lost; a slot reused later keeps its last state
          const cst = c.cst || (c.cst = {});
          for (const id of c.convoyIds) { const n = this.npc[id]; if (!n.convoy || cst[id] === 'safe' || cst[id] === 'lost') continue; cst[id] = !n.alive ? 'lost' : n.active ? 'go' : 'safe'; }
          const alive = c.convoyIds.filter((id) => cst[id] !== 'lost'), enroute = c.convoyIds.filter((id) => cst[id] === 'go');
          if (!alive.length) { this.say(FROM_CREW, 2, 'THE LAST FREIGHTER IS GONE. ALL OF THEM. ...THREE THOUSAND PEOPLE.'); this.endMission(false, K.FAIL_FREIGHTER); return; }
          const lost = c.convoyIds.length - alive.length;
          c.f.convoy = lost === 0 ? 'all' : lost === 1 ? 'lost1' : 'lost';
          if (c.wingGuard !== undefined && cst[c.wingGuard] !== 'go') c.wingGuard = enroute[0];
          c.runT = (c.runT || 0) + dt;
          if (c.runT > c.nextWave && c.waveN < 4) {
            c.waveN++;
            const tg = enroute.length ? enroute[this.irand(enroute.length)] : US;
            if (c.waveN === 1) this.tdWave(3, 0, tg);
            if (c.waveN === 2) this.tdWave(3, 1, tg);
            if (c.waveN === 3) { // the Heron gets hit
              const hid = this.wingOf('heron');
              if (hid !== NO_ID && !c.heronAsked) {
                const n = this.npc[hid]; n.hull = Math.min(n.hull, 22); n.eng = 0; n.ai = AI_STATIC; n.speed = 0; n.wpn = 0;
                this.boomAt(n.x, n.y, 2);
                this.say(FROM_CREW, 2, 'THE HERON\'S TAKEN A REAPER\'S FULL SPREAD - SHE\'S DEAD IN SPACE!');
                this.after(2, () => this.startDialog('i_brand2', hid, { answered: true }));
                this.tdWave(2, 0, hid, 'quiet');
              } else this.tdWave(3, 0, tg);
            }
            if (c.waveN === 4) this.tdWave(3 + (this.M.diff >= 1 ? 1 : 0), 1, tg);
            c.nextWave = c.runT + [0, 42, 40, 45, 1e9][c.waveN];
          }
          if (c.step === 'i2_heron') {
            const hid = this.wingOf('heron');
            if (hid === NO_ID) { this.tdStep('i2_escort'); break; }
            if (near(hid, 5000) && P.shieldRaise < 0.05 && c.t > 2) this.tdBeamHeron();
          }
          if (c.hopeDoomed && c.t > 25 && cst[c.convoyIds[1]] === 'go') { c.hopeDoomed = false; this.damageNpc(c.convoyIds[1], 400, K.SUB_HULL, NO_ID); this.say(FROM_CREW, 2, 'THE HOPE\'S REACH - SHE\'S BREAKING UP! WE WERE TOO FAR AWAY.'); }
          const safe = c.convoyIds.filter((id) => cst[id] === 'safe').length;
          this.setObjective(this.campTag() + this.tdObjective() + (safe ? ` (${safe} SAFE AT THE STARBASE)` : ''));
          if (alive.length && !enroute.length && c.waveN >= 3 && !left) {
            this.say(0, 3, 'STARBASE 12: THE LAST OF THE CONVOY IS DOCKED. THREE THOUSAND... WELL. THEY\'RE HOME, AURORA.');
            const r = c.wing.find((q) => q.key === 'valiant'); if (r && r.away) { r.away = false; r.hull = Math.min(r.hull, 70); }
            const rh = c.wing.find((q) => q.key === 'heron'); if (rh && rh.away) rh.away = false;
            this.after(5, () => this.storyReport('i_rep2')); c.step = 'i2_report';
          }
          break;
        }
        case 'i3_save': {
          const conv = (c.convIds || []).filter((id) => this.npc[id].alive && this.npc[id].active).length;
          c.conv = Math.min(100, (c.conv || 0) + dt * conv * 0.22);
          this.setObjective(this.campTag() + this.tdObjective());
          if (c.t > 20 && !c.w2) { c.w2 = true; this.tdWave(3, 1, 0); }
          if (c.conv >= 100 && !c.convDone) {
            c.convDone = true; c.f.array = 'lost';
            const st = this.npc[0]; st.faction = F_HOSTILE; st.name = 'EPSILON ARRAY (TIDE)';
            this.say(FROM_CREW, 2, 'THE ARRAY... IT\'S GONE OVER, CAPTAIN. IT\'S TIDE NOW. A SHUTTLE GOT AWAY - MARRIN\'S ON IT.');
            for (const id of c.convIds) if (this.npc[id].alive) this.npcLeave([id]);
          }
          if ((!conv || c.convDone) && !left && c.t > 5 && !c.wardenAsked && !this.dlg) {
            if (!c.convDone) c.f.array = 'saved';
            c.wardenAsked = true;
            this.say(FROM_CREW, 1, 'CAPTAIN... SOMETHING IS HAILING US. FROM INSIDE THE ARRAY\'S OWN COMMS SYSTEM.');
            this.after(3, () => this.startDialog('i_warden1', 0, { who: 'warden', answered: false }));
          }
          break;
        }
        case 'i4_go':
          if (sid === 'shroud' && near(c.foundryId, 14000)) { this.say(FROM_CREW, 2, 'THE FOUNDRY - AND IT\'S LAUNCHING EVERYTHING IT HAS!'); this.tdWave(4, 1, US); c.w = 1; this.tdStep('i4_assault'); }
          break;
        case 'i4_assault':
          if (c.t > 14 && c.w === 1) { c.w = 2; this.tdWave(3 + (this.M.diff >= 1 ? 1 : 0), 0, US, ''); }
          if (c.t > 24 && c.w === 2 && this.wingOf('valiant') !== NO_ID && !c.okonAsked) {
            c.okonAsked = true;
            const vid = this.wingOf('valiant'), n = this.npc[vid];
            n.hull = Math.min(n.hull, 24); n.eng = 15; this.boomAt(n.x, n.y, 2); c.okonPending = true;
            this.say(FROM_CREW, 2, 'THE VALIANT IS HIT - HARD. SHE\'S VENTING ATMOSPHERE!');
            this.after(2, () => this.startDialog('i_okon4', vid, { answered: true }));
          }
          if (c.t > 24 && !left && (c.okonAsked || this.wingOf('valiant') === NO_ID) && !c.okonPending && !this.dlg && c.f.valiant !== 'press') this.tdOpenFoundry();
          break;
        case 'i4_cover': {
          const vid = this.wingOf('valiant');
          if (vid === NO_ID) { c.f.valiant = 'lost'; this.tdStep('i4_assault'); c.okonAsked = true; break; }
          if (!near(vid, 4000)) c.t -= dt * 0.7; // the clock only really runs while we're beside her
          this.npc[vid].hull = Math.max(this.npc[vid].hull, 6);
          this.setObjective(this.campTag() + this.tdObjective());
          if (c.t > 18 && !c.cw) { c.cw = true; this.tdWave(2, 0, vid, 'quiet'); }
          if (c.t >= 35) { c.f.valiant = 'saved'; this.thrSayIn('okonkwo', 'POWER\'S BACK - ENOUGH TO LIMP. WE\'LL LIVE, AURORA. GO FINISH IT.', 3, vid); this.npcLeave([vid]); const r = c.wing.find((q) => q.key === 'valiant'); r.away = 'ch4'; r.hull = 55; this.campRemove(vid, 10); if (c.foundryOpen) this.tdStep('i4_hail'); else { this.tdStep('i4_assault'); c.t = 30; } }
          break;
        }
        case 'i4_hail':
          if (near(c.foundryId, 12000) && !this.dlg && !c.wardenHailed && c.t > 3) { c.wardenHailed = true; this.startDialog('i_warden2', c.foundryId); }
          break;
        case 'i4_burn':
          if (!this.npc[c.foundryId].alive) { this.say(FROM_CREW, 2, 'THE FOUNDRY IS GONE. ...ALL OF IT, CAPTAIN. ALL OF THEM.'); this.tdFoundryDone(); }
          break;
        case 'i5_siege': case 'i5_carrier': {
          const sb = this.npc[0];
          if (!sb.alive) { this.say(FROM_CREW, 2, 'STARBASE 12... IS GONE.'); this.endMission(false, K.FAIL_STARBASE); return; }
          c.runT = (c.runT || 0) + dt;
          if (c.step === 'i5_siege') {
            if (c.runT > c.nextWave && c.waveN < 3) { c.waveN++; this.tdWave([0, 4, 4, 5][c.waveN] + (this.M.diff >= 2 ? 1 : 0), c.waveN >= 2 ? 1 : 0, c.waveN === 2 ? 0 : US); c.nextWave = c.runT + 35; this.setObjective(this.campTag() + this.tdObjective()); }
            if (c.waveN >= 3 && !left && c.runT > 20) this.tdCarrier();
            if (c.waveN >= 2 && !c.allyCalled) { c.allyCalled = true; this.after(4, () => this.tdAllies()); }
          } else {
            const cr = this.npc[c.carrierId];
            if (cr && cr.alive && cr.active) {
              if (c.runT > (c.reinf || 0)) { c.reinf = c.runT + 30; if (left < 6) this.tdWave(2, 0, this.frand() < 0.5 ? 0 : US, 'quiet'); }
              if (cr.hull < 25 && !c.wardenEnd) {
                c.wardenEnd = true; cr.ai = AI_SURRENDER; cr.faction = F_NEUTRAL; cr.speed = 0; cr.talk = 'i_warden3'; cr.talkCtx = {};
                for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i)) this.npcLeave([i]);
                this.after(2, () => this.startDialog('i_warden3', c.carrierId, { answered: true }));
              }
            } else if (cr && !cr.alive && !c.ended) { c.ended = true; this.tdEnding('ruin'); }
          }
          break;
        }
      }
      // the Valiant's last run
      if (c.f.valiant === 'press' && c.ramT !== undefined && !c.rammed) {
        c.ramT += dt;
        const vid = c.wing.find((q) => q.key === 'valiant').id, n = vid !== undefined ? this.npc[vid] : null, fd = this.npc[c.foundryId];
        if (n && n.alive && fd && distTo(n.x, n.y, fd.x, fd.y) > 2200 && c.ramT < 40) { n.ai = AI_TRAVEL; n.destX = fd.x; n.destY = fd.y; }
        else {
          c.rammed = true;
          if (n && n.alive) { n.alive = false; n.deadAt = this.now; this.boomAt(n.x, n.y, 3); }
          const r = c.wing.find((q) => q.key === 'valiant'); r.dead = true; r.id = undefined;
          if (fd) { fd.shields = 0; fd.shMax = 0; }
          c.f.valiant = 'lost';
          this.say(FROM_CREW, 2, 'THE VALIANT... SHE WENT STRAIGHT THROUGH THE SHIELD GENERATOR. THE FOUNDRY\'S SHIELDS ARE DOWN. ...CAPTAIN OKONKWO IS GONE.');
          for (let i = 0; i < MAX_CONTACTS; i++) if (this.npc[i].tide && this.hostileAlive(i) && this.frand() < 0.6) this.npcLeave([i]);
          this.after(6, () => this.tdOpenFoundry());
        }
      }
    },
    tdOpenFoundry() {
      const c = this.camp;
      if (c.step === 'i4_hail' || c.step === 'i4_report' || c.step === 'i4_burn' || c.foundryOpen) return;
      c.foundryOpen = true;
      const fd = this.npc[c.foundryId]; if (fd) { fd.faction = F_NEUTRAL; fd.shields = Math.min(fd.shields, 60); fd.talk = 'i_warden2'; }
      this.say(FROM_CREW, 3, 'THE FOUNDRY\'S DEFENCES ARE DOWN. IT\'S STOPPED FIRING. ...IT\'S WAITING FOR US TO SAY SOMETHING.');
      this.tdStep('i4_hail');
    },
  });
}
