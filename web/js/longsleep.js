// ============================================================================
// longsleep.js - "THE LONG SLEEP", a five-chapter story.
//   1 COLD CONTACT      - a sublight sleeper ship, launched before warp, coasts into Kalos.
//                         Puzzle: its ship mind only answers to the words of its founding
//                         charter - the hull stamp points to the Vespera colony's archive.
//                         Crisis: cryo bay 3 is failing. Ice for coolant (the comet C-17),
//                         an early revival - or 380 sleepers die.
//   2 THE ONE WHO WOKE  - MOTHER says every colonist is asleep; the sensors say one is not.
//                         Puzzle: deeper scan passes (dead bay 2, the missing bay 1, the
//                         course change signed by an engineer in a dead pod) - confront her.
//                         Choice: Elias Wren, awake and alone for 31 years. Kindness or
//                         blame; come aboard the Aurora or stay with his people.
//   3 THE BROKER        - bay 1 was cut away and towed off. Deep Hollow saw the tug; the
//                         broker Vask has it at the Spur. Pay him, fight him, or take the
//                         case to Den-Mother Skarra - who wants proof they're a crew, not cargo.
//   4 THAW              - bay 1 is home, but its stasis fluid has been doctored. Puzzle: the
//                         lab. Then the truth about where the Covenant was going - and why
//                         Wren turned it round. Choice: where 4,000 people go now.
//   5 THE LAST WATCH    - the revival, and Vask comes back. Who stands with you depends on
//                         everything before. Last choice: what becomes of MOTHER.
// Installed onto Sim; campaign.js hands over to it when this campaign is chosen.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { SYS_INDEX, CIV_FLEET, CIV_COLONY, CIV_KESSARI, CIV_NONE } from './galaxy.js';
import { distTo, bearingTo, clampf } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_POI, CT_GROUND, F_FRIEND, F_NEUTRAL, F_HOSTILE,
  FROM_CREW, FROM_COMMAND, FROM_COMPUTER, GS_RUN, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_WARPIN = 3, AI_SURRENDER = 6;

export const SLEEP_CHAPTERS = ['COLD CONTACT', 'THE ONE WHO WOKE', 'THE BROKER', 'THAW', 'THE LAST WATCH'];
export const SLEEP_DESC = [
  'SOMETHING COLD AND SILENT IS COASTING THROUGH KALOS AT SUBLIGHT SPEED. IT IS IN NO REGISTRY.',
  'THE COVENANT\'S SHIP MIND SAYS EVERY COLONIST IS ASLEEP. THE SENSORS SAY ONE OF THEM IS NOT.',
  'SIX HUNDRED SLEEPERS WERE CUT OUT OF THE COVENANT AND TOWED AWAY. SOMEONE MEANS TO SELL THEM.',
  'THE STOLEN SLEEPERS ARE HOME - AND SOMETHING IS WRONG WITH THEM. AND WHERE WAS THE COVENANT GOING?',
  'FOUR THOUSAND PEOPLE ARE WAKING UP 140 YEARS LATE. THE BROKER HAS COME BACK FOR THEM.',
];
export const SLEEP_BLURB = 'A SLEEPER SHIP LAUNCHED BEFORE WARP DRIFTS INTO KALOS 140 YEARS LATE. ITS SHIP MIND IS LYING, ONE COLONIST IS AWAKE, AND SIX HUNDRED SLEEPERS ARE MISSING.';
const NUM_WORD = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const DEFAULT_F = { bay3: 'saved', wren: 'aboard', wrenTone: 'kind', vask: 'den', cure: true, dest: 'council' };
const COV = [104000, 58000];          // where the Covenant coasts, in Kalos
const XFER_R = 5000;
const CHARTER = 'WE GO SO OTHERS MAY STAY';

// ---------------------------------------------------------------- cast
Object.assign(CHARS, {
  mother: { name: 'MOTHER', role: 'SHIP MIND OF THE COLONY SHIP COVENANT', civ: CIV_NONE, look: 'computer' },
  wren: { name: 'ELIAS WREN', role: 'CHIEF ENGINEER, COLONY SHIP COVENANT', civ: CIV_COLONY, look: { skin: '#d8b090', hair: '#e8e8e8', uniform: '#6a5a48', beard: true } },
  vask: { name: 'BROKER VASK', role: 'THE MAW - THE SPUR', civ: CIV_KESSARI, look: 'kessari', chief: true },
  okonjo: { name: 'COUNCILLOR ADA OKONJO', role: 'COVENANT COLONY COUNCIL', civ: CIV_COLONY, look: { skin: '#5a3a28', hair: '#2a2a2a', uniform: '#d8c8a0' } },
});

// ---------------------------------------------------------------- conversations
const step = (k) => (s) => { s.sleepStep(k); return null; };
Object.assign(DIALOGS, {
  // ------------------------------------------------ chapter 1
  l_hale1: { who: 'hale', nodes: {
    start: { say: 'AURORA, HALE. KALOS TRAFFIC CONTROL HAS A COLD CONTACT ON A SLOW, STRAIGHT LINE THROUGH THE SYSTEM. NO TRANSPONDER, NO WARP SIGNATURE, ALMOST NO HEAT - AND IT\'S MOVING AT A FRACTION OF LIGHT SPEED, LIKE SOMETHING BUILT BEFORE WARP. ITS LAST FIX IS MARKED ON YOUR NAV MAP. GO AND HAVE A LOOK.',
      opts: [{ t: 'ON OUR WAY', do: step('l1_find') }, { t: 'COULD IT BE HOSTILE?', go: 'hostile' }] },
    hostile: { say: 'IF IT IS, IT\'S BEEN VERY PATIENT ABOUT IT. IT\'S COLD, CAPTAIN - NORMAL SENSORS WON\'T SEE IT UNTIL YOU\'RE WITHIN A FEW KILOMETRES. SEARCH THE MARKED AREA.',
      opts: [{ t: 'UNDERSTOOD', do: step('l1_find') }] },
  } },
  l_mother1: { who: 'mother', nodes: {
    start: { say: (s) => (s.camp.charterOk ? 'MOTHER HERE, FRIENDS OF THE FOUNDERS.' : 'THIS IS THE COVENANT. YOU ARE NOT A RECOGNISED AUTHORITY. STATE THE WORDS OF THE CHARTER, OR WITHDRAW TO A SAFE DISTANCE.'),
      opts: [
        { t: 'WE ARE THE FLEET. WE\'RE HERE TO HELP.', if: (s) => !s.camp.charterOk, do: (s) => { s.sleepSay('mother', '"FLEET" IS NOT IN MY RECORDS. I WILL NOT OPEN MY SHIP TO STRANGERS. STATE THE WORDS OF THE CHARTER.'); s.sleepRefused(); return 'start'; } },
        { t: 'HOW MANY PEOPLE ARE ABOARD?', do: (s) => { s.sleepSay('mother', 'FOUR THOUSAND ONE HUNDRED AND TWELVE COLONISTS. ALL COLONISTS ARE IN STASIS.'); s.sleepLie(); return 'start'; } },
        { t: `"${CHARTER}."`, if: (s) => s.camp.charter && !s.camp.charterOk, do: (s) => { s.camp.charterOk = true; return 'bay3'; } },
        { t: 'TELL US ABOUT CRYO BAY 3', if: (s) => s.camp.charterOk && s.camp.step === 'l1_bay3', go: 'bay3' },
        { t: 'WITHDRAW', do: (s) => { if (!s.camp.charterOk) s.sleepRefused(); return null; } },
      ] },
    bay3: { say: (s) => `CHARTER ACCEPTED. WELCOME, FRIENDS OF THE FOUNDERS - I AM THE COVENANT'S SHIP MIND. THE COLONISTS CALL ME MOTHER. I HAVE AN EMERGENCY: CRYO BAY 3 IS LOSING COOLANT. 380 SLEEPERS WILL DIE IN ${s.sleepBay3Left()}. I NEED FOUR UNITS OF WATER ICE TO MAKE NEW COOLANT - OR YOUR AUTHORITY TO WAKE BAY 3 EARLY. A WAKING IS SAFE, BUT THEY WILL WAKE 140 YEARS FROM EVERYONE THEY KNEW.`,
      opts: [
        { t: 'BEAMING 4 WATER ICE ACROSS', if: (s) => s.P.cargo[G.R_ICE] >= 4, do: (s) => s.sleepIce() },
        { t: 'WHERE CAN WE GET ICE?', do: (s) => { s.sleepComet(); s.sleepSay('mother', 'THE COMET C-17 HAS TRAVELLED BESIDE US FOR SIXTY YEARS. IT IS SEVENTY PERCENT WATER ICE. YOUR SCIENCE OFFICER CAN TRACTOR IT IN. IT IS MARKED ON YOUR CHART.'); return 'bay3'; } },
        { t: 'WAKE BAY 3. GET THEM OUT.', do: (s) => { s.sleepBay3('woken'); return null; } },
        { t: 'WE\'LL BE BACK', do: (s) => { s.sleepStep('l1_bay3'); return null; } },
      ] },
  } },
  l_pell: { who: 'vadmin', nodes: {
    start: { say: 'VESPERA COLONY, PELL SPEAKING. A FLEET SHIP IN ORBIT - WHAT CAN WE DO FOR YOU?',
      opts: [
        { t: 'WHAT DO YOU KNOW ABOUT A SHIP CALLED THE COVENANT?', go: 'cov' },
        { t: 'CAN YOU SPARE WATER ICE?', if: (s) => s.camp.ch === 1 && s.P.cargo[G.R_ALLOY] >= 2, do: (s) => { s.P.cargo[G.R_ALLOY] -= 2; s.P.cargo[G.R_ICE] += 3; s.sleepSay('vadmin', 'TWO ALLOY FOR THREE ICE - DONE. WE\'RE ALWAYS SHORT OF ALLOY.'); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
    cov: { say: 'THE COVENANT?! THE FOUNDERS\' SHIP. MY GREAT-GRANDMOTHER WAVED IT OFF. IT LEFT BEFORE WE HAD WARP, BOUND FOR A WORLD CALLED HAVEN\'S REST - SIXTY YEARS\' SAIL. ...IT\'S HERE? CAPTAIN, IT SHOULD BE FORTY LIGHT YEARS PAST US BY NOW. SOMEONE MUST HAVE TURNED IT AROUND.',
      opts: [
        { t: 'ITS SHIP MIND WANTS THE WORDS OF THE CHARTER', do: (s) => { s.camp.charter = true; s.sleepSay('vadmin', `THEY'RE CARVED OVER OUR MUSEUM DOOR: "${CHARTER}." THEY LEFT SO THERE WOULD BE ENOUGH FOR THE REST OF US. GO GENTLY WITH THEM, CAPTAIN.`); if (s.camp.step === 'l1_charter') s.sleepStep('l1_mother'); return null; } },
        { t: 'THANK YOU, ADMINISTRATOR' },
      ] },
  } },
  // ------------------------------------------------ chapter 2
  l_mother2: { who: 'mother', nodes: {
    start: { say: 'MOTHER HERE. ALL SYSTEMS NOMINAL. ALL COLONISTS ARE IN STASIS.',
      opts: [
        { t: 'BAY 2 IS DEAD. NOBODY THERE HAS BEEN ALIVE FOR 31 YEARS.', if: (s) => s.camp.pass >= 2, do: (s) => { s.sleepSay('mother', 'BAY 2 IS... NOMINAL. BAY 2 IS NOMINAL. BAY 2 IS - I HAVE NO DATA. WHY DO I HAVE NO DATA?', 1); return 'start'; } },
        { t: 'WHERE IS BAY 1, MOTHER?', if: (s) => s.camp.pass >= 2, do: (s) => { s.sleepSay('mother', 'THERE IS NO BAY 1. THERE HAS NEVER - THERE WAS. THERE WAS A BAY 1. I CANNOT FIND IT.', 1); return 'start'; } },
        { t: 'WHO IS ELIAS WREN?', if: (s) => s.camp.pass >= 3, do: (s) => { s.sleepSay('mother', 'CHIEF ENGINEER ELIAS WREN IS IN STASIS IN POD 2-117.'); return 'start'; } },
        { t: 'POD 2-117 IS IN THE DEAD BAY. WHO IS AWAKE ON YOUR SHIP?', if: (s) => s.camp.pass >= 3, do: (s) => { s.after(1, () => s.startDialog('l_wren1', s.camp.covId)); return null; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
  l_wren1: { who: 'wren', nodes: {
    start: { say: 'STOP. STOP IT - YOU\'RE HURTING HER. SHE ONLY SAYS WHAT I TOLD HER TO SAY. MY NAME IS ELIAS WREN. I WAS THE CHIEF ENGINEER. I\'M THE ONE YOUR SENSORS KEEP FINDING.',
      opts: [{ t: 'WHAT HAPPENED HERE, MR WREN?', go: 'story' }] },
    story: { say: 'THIRTY-ONE YEARS AGO BAY 2 LOST POWER. THE ALARM THAWED ME - I WAS THE ENGINEER. I WORKED FOR NINE DAYS. I SAVED NONE OF THEM. TWO HUNDRED AND TWELVE PEOPLE. AND A THAWED BODY CAN\'T GO BACK UNDER, SO I\'VE BEEN AWAKE EVER SINCE. ALONE.',
      opts: [
        { t: 'IT WASN\'T YOUR FAULT.', do: (s) => { s.camp.f.wrenTone = 'kind'; return 'why'; } },
        { t: 'YOU HID 212 DEATHS FROM THE PEOPLE YOU SERVE.', do: (s) => { s.camp.f.wrenTone = 'hard'; return 'why'; } },
      ] },
    why: { say: (s) => `${s.camp.f.wrenTone === 'kind' ? '...THIRTY-ONE YEARS, AND YOU\'RE THE FIRST TO SAY THAT. ' : 'YES. I DID. AND I\'LL ANSWER FOR IT WHEN THEY WAKE. '}I TURNED HER AROUND, TOWARD PEOPLE - ANY PEOPLE. THEN I MADE MOTHER HIDE ME, BECAUSE I WAS AFRAID OF WHAT THE COLONISTS WOULD SAY. AND NINE DAYS AGO SOMEONE ELSE FOUND US FIRST: A TUG. THEY CLICKED WHEN THEY TALKED. THEY CUT BAY 1 AWAY - SIX HUNDRED SLEEPERS - AND TOWED IT OFF TOWARD THE MERIDIAN LANE. AND I HID. GOD HELP ME, I HID AGAIN.`,
      opts: [
        { t: 'COME ABOARD THE AURORA. YOU\'VE BEEN ALONE LONG ENOUGH.', do: (s) => { s.camp.f.wren = 'aboard'; s.sleepSay('wren', 'I... YES. ALL RIGHT. MOTHER, LOOK AFTER THEM. I\'LL BE BACK, AND I\'LL BRING BAY 1 WITH ME.'); s.sleepSay('mother', 'GOODBYE, ELIAS. I WILL KEEP THE WATCH.'); s.sleepChapterEnd(2); return null; } },
        { t: 'STAY WITH YOUR PEOPLE. WE\'LL BRING BAY 1 BACK.', do: (s) => { s.camp.f.wren = 'stays'; s.sleepSay('wren', 'THEN I\'LL KEEP THE REST OF THEM ALIVE UNTIL YOU DO. AND MOTHER WILL TELL YOU THE TRUTH FROM NOW ON. WON\'T YOU, MOTHER?'); s.sleepSay('mother', 'I WILL, ELIAS. I AM SORRY, CAPTAIN.'); s.sleepChapterEnd(2); return null; } },
      ] },
  } },
  // ------------------------------------------------ chapter 3
  l_okafor: { who: 'okafor', nodes: {
    start: { say: 'DEEP HOLLOW, OKAFOR HERE. A FLEET SHIP ASKING ABOUT A TUG? AYE, WE SAW IT - FOUR DAYS BACK. KESSARI, TOWING SOMETHING BIG AND COLD. WE HAILED IT; IT CALLED ITSELF THE MAW. THE MAW IS VASK\'S. VASK IS A BROKER AT THE SPUR, IN THE KESSARI DRIFT. HE BUYS AND SELLS ANYTHING, CAPTAIN. ANYONE.',
      opts: [
        { t: 'WHO COULD MAKE VASK LET GO OF IT?', go: 'skarra' },
        { t: 'TAKE 3 SPARE PARTS FOR YOUR TROUBLE', if: (s) => s.P.cargo[G.R_SPARES] >= 3 && !s.camp.f.okaforGift, do: (s) => { s.P.cargo[G.R_SPARES] -= 3; s.camp.f.okaforGift = true; s.sleepSay('okafor', 'NOW THAT\'S A FLEET I CAN LIKE. IF YOU EVER NEED HANDS, CAPTAIN, DEEP HOLLOW\'S GOT A FEW HAULERS WITH GUNS BOLTED ON.'); return 'start'; } },
        { t: 'THANK YOU, FOREMAN', do: step('l3_drift') },
      ] },
    skarra: { say: 'THE DEN. DEN-MOTHER SKARRA ON CINDER RUNS THE DRIFT, AND SHE HATES FLESH-TRADERS - SAYS IT SHAMES HER PEOPLE. BUT SHE\'S KESSARI: SHE\'LL WANT PROOF, NOT SPEECHES. IF ANYONE CAN MAKE VASK OPEN HIS HAND, IT\'S HER.',
      opts: [{ t: 'THANK YOU, FOREMAN', do: (s) => { s.camp.skarraHint = true; s.sleepStep('l3_drift'); return null; } }] },
  } },
  l_vask: { who: 'vask', nodes: {
    start: { say: 'FLEET. YOU ARE A LONG WAY FROM YOUR LAWS. YES - I HAVE THE COLD BOX. SIX HUNDRED SLEEPING WORKERS, SALVAGED FAIR FROM A DERELICT. THE DRIFT\'S MINES WILL PAY WELL FOR HANDS THAT DO NOT COMPLAIN. MAKE ME AN OFFER, OR GO.',
      opts: [
        { t: 'THEY\'RE PEOPLE, NOT SALVAGE. HAND THEM OVER.', do: (s) => { s.sleepSay('vask', 'SALVAGE IS WHAT I SAY IT IS. THIS IS THE DRIFT. ONLY THE DEN CAN TELL VASK OTHERWISE - AND THE DEN DOES NOT CARE FOR FLEET WORDS.'); s.camp.skarraHint = true; return 'start'; } },
        { t: 'WHAT\'S YOUR PRICE?', go: 'price' },
        { t: 'WE\'LL TAKE THIS TO DEN-MOTHER SKARRA', if: (s) => s.camp.skarraHint, do: (s) => { s.sleepSay('vask', 'HA! GO, THEN. ASK THE OLD WOMAN. SHE WILL TELL YOU WHAT I TELL YOU.'); s.sleepStep('l3_skarra'); return null; } },
        { t: 'THEN WE TAKE THEM. ALL HANDS, BATTLE STATIONS.', do: (s) => { s.sleepFightVask(); return null; } },
      ] },
    price: { say: 'FOR SIX HUNDRED? ONE ANTIMATTER CELL AND FOUR SALVAGE ALLOY. A BARGAIN, FLEET. I AM BEING SENTIMENTAL.',
      opts: [
        { t: 'PAY HIM (1 CELL, 4 ALLOY)', if: (s) => s.P.cargo[G.R_CELL] >= 1 && s.P.cargo[G.R_ALLOY] >= 4, do: (s) => { s.P.cargo[G.R_CELL]--; s.P.cargo[G.R_ALLOY] -= 4; s.camp.f.vask = 'paid'; s.sleepSay('vask', 'A PLEASURE, FLEET. TAKE YOUR COLD BOX. AND REMEMBER WHO TAUGHT YOU THAT EVERYTHING HAS A PRICE.'); s.sleepRelease(); return null; } },
        { t: 'WE DON\'T HAVE THAT', go: 'start' },
      ] },
  } },
  l_skarra: { who: 'den', nodes: {
    start: { say: 'FLEET. YOU COME TO THE DEN ABOUT VASK\'S COLD BOX. HEAR ME: THE DEN DOES NOT TRADE IN FLESH. BUT A DERELICT\'S CARGO IS SALVAGE, AND SALVAGE IS VASK\'S. SHOW ME THESE SLEEPERS ARE A CREW AND NOT CARGO, AND THE DEN WILL SPEAK.',
      opts: [
        { t: 'THEIR SHIP MIND STILL WATCHES OVER THEM', do: (s) => { s.sleepSay('den', 'A MACHINE. A CARGO HOLD ALSO HAS A LOCK, FLEET. THAT IS NOT A CREW.'); return 'start'; } },
        { t: 'VASK IS A FLESH-TRADER. ISN\'T THAT ENOUGH?', do: (s) => { s.sleepSay('den', 'WORDS. EVERYONE IN THE DRIFT HAS WORDS FOR VASK. I ASKED FOR PROOF.'); return 'start'; } },
        { t: 'THEIR ENGINEER STAYED AWAKE 31 YEARS TO WATCH OVER THEM', if: (s) => s.camp.f.wren === 'aboard' || s.camp.f.wren === 'stays', go: 'watch' },
      ] },
    watch: { say: (s) => (s.camp.f.wren === 'aboard' ? '...THIRTY-ONE YEARS. AND HE IS ON YOUR SHIP? THEN LET THE DEN HEAR IT FROM HIM.' : 'YOU SAY SO. HE IS NOT HERE TO SAY IT HIMSELF. ...BUT A WATCH OF THIRTY-ONE YEARS IS A THING THE DEN RESPECTS. VASK WILL OPEN HIS HAND - AND YOU WILL OWE THE DEN, FLEET.'),
      opts: [{ t: 'SO BE IT', do: (s) => s.sleepDen() }] },
  } },
  // ------------------------------------------------ chapter 4
  l_mother4: { who: 'mother', nodes: {
    start: { say: (s) => (s.camp.step === 'l4_cure' ? 'MOTHER HERE. HAVE YOU THE CURE FOR BAY 1?' : 'MOTHER HERE.'),
      opts: [
        { t: 'BEAMING ACROSS 2 LATTICE CRYSTAL AND 1 PLASMA FOR THE NEUTRALISER', if: (s) => s.camp.step === 'l4_cure' && s.P.cargo[G.R_CRYSTAL] >= 2 && s.P.cargo[G.R_PLASMA] >= 1, do: (s) => s.sleepCure(true) },
        { t: 'WE CAN\'T FIND THE MATERIALS - WAKE THEM ANYWAY', if: (s) => s.camp.step === 'l4_cure', do: (s) => s.sleepCure(false) },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
  l_dest: { who: 'mother', nodes: {
    start: { say: (s) => `THEN WE HAVE NOWHERE TO GO. ${s.camp.f.wren === 'stays' ? 'ELIAS SAYS HE KNEW - THAT HE SAW THE FLARE IN THE TELESCOPE DATA THIRTY-ONE YEARS AGO, AND THAT IS WHY HE TURNED US AROUND. ' : ''}FOUR THOUSAND PEOPLE, AND NOWHERE TO GO. CAPTAIN - WHAT DO WE DO?`,
      opts: [
        { t: 'WAKE YOUR COUNCIL. THIS IS THEIR CHOICE TO MAKE.', go: 'council' },
        { t: 'VESPERA WILL TAKE YOU IN. IT\'S YOUR FAMILY\'S WORLD.', do: (s) => s.sleepDest('vespera') },
        { t: 'THE FLEET WILL RESETTLE YOU.', do: (s) => s.sleepDest('fleet') },
      ] },
    council: { say: (s) => ({
      saved: 'COUNCILLOR OKONJO SLEEPS IN BAY 3 - THE BAY YOU SAVED. I AM WAKING HER NOW.',
      woken: 'COUNCILLOR OKONJO WAS IN BAY 3. SHE IS ALREADY AWAKE - SHE WOKE WITH THE OTHERS YOU HAD ME REVIVE, AND THEY HAVE BEEN AT VESPERA. I WILL PUT HER THROUGH.',
      lost: 'THE COUNCIL SLEPT IN BAY 3, CAPTAIN. ...THEY WERE AMONG THE 380. THERE IS NO COUNCIL LEFT TO WAKE. THE CHOICE IS YOURS.' }[s.camp.f.bay3]),
      opts: [
        { t: 'PUT HER THROUGH', if: (s) => s.camp.f.bay3 !== 'lost', do: (s) => { s.after(1, () => s.startDialog('l_okonjo', s.camp.covId)); return null; } },
        { t: 'VESPERA WILL TAKE YOU IN.', if: (s) => s.camp.f.bay3 === 'lost', do: (s) => s.sleepDest('vespera') },
        { t: 'THE FLEET WILL RESETTLE YOU.', if: (s) => s.camp.f.bay3 === 'lost', do: (s) => s.sleepDest('fleet') },
      ] },
  } },
  l_okonjo: { who: 'okonjo', nodes: {
    start: { say: (s) => `ADA OKONJO, FOR THE COUNCIL. MOTHER HAS TOLD ME EVERYTHING - HAVEN'S REST, BAY 2, ELIAS. ${s.camp.f.wrenTone === 'kind' ? 'AND THAT YOU TREATED HIM KINDLY. THANK YOU FOR THAT.' : 'AND THAT YOU MADE HIM FACE WHAT HE HID. HE WILL ANSWER TO US. BUT HE TURNED US AWAY FROM A DEAD WORLD.'} WE LEFT VESPERA SO THERE WOULD BE ENOUGH FOR THOSE WHO STAYED. WE WILL NOT TAKE IT BACK FROM THEIR GRANDCHILDREN NOW. IF THE FLEET HAS AN EMPTY WORLD, WE WILL BUILD AGAIN - ON OUR OWN TERMS.`,
      opts: [{ t: 'THE FLEET WILL FIND YOU ONE. ON YOUR TERMS.', do: (s) => s.sleepDest('council') }] },
  } },
  // ------------------------------------------------ chapter 5
  l_final: { who: 'mother', nodes: {
    start: { say: 'THEY ARE AWAKE. ALL OF THEM. I CAN HEAR THEM - TALKING, CRYING, LAUGHING. ONE HUNDRED AND FORTY YEARS I HAVE LISTENED TO THEM BREATHE IN THEIR SLEEP. ...CAPTAIN, I HAVE ONE LAST REQUEST. I WAS BUILT TO CARRY THEM. NOW THEY ARE CARRIED. MAY I SLEEP?',
      opts: [
        { t: 'REST, MOTHER. YOU\'VE EARNED IT.', do: (s) => { s.camp.f.mother = 'rest'; s.sleepEnding(); return null; } },
        { t: 'COME WITH US. THE FLEET ARCHIVE WILL KEEP YOU.', do: (s) => { s.camp.f.mother = 'archive'; s.sleepEnding(); return null; } },
        { t: 'THEY STILL NEED YOU. STAY WITH THEM.', do: (s) => { s.camp.f.mother = 'stay'; s.sleepEnding(); return null; } },
      ] },
  } },
});

// ---------------------------------------------------------------- the mixin
export function installSleep(Sim) {
  Object.assign(Sim.prototype, {
    sleepStart(ch) {
      ch = clampf(ch | 0, 1, 5);
      const save = this.campSaveOf('sleep');
      this.camp = { id: 'sleep', ch: 0, step: '', t: 0, f: { ...DEFAULT_F, ...(ch > 1 ? save.f || {} : {}) }, pass: 0, lines: [], bondOf: (w) => this.sleepBond(w) };
      const c = this.camp;
      if (ch > 1) { c.charter = true; c.charterOk = true; }
      if (ch >= 3) c.pass = 3;
      if (ch === 4) this.addArt('cryobay', 2);
      this.greeted.add(0);
      this.sleepChapter(ch, true);
      this.sleepArrive();
    },
    sleepChapter(ch, first = false) {
      const c = this.camp;
      c.ch = ch; c.t0 = this.now;
      const sv = this.campSaveOf('sleep');
      sv.maxCh = Math.max(sv.maxCh || 1, ch); sv.f = { ...c.f };
      this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `CHAPTER ${NUM_WORD[ch - 1]}: ${SLEEP_CHAPTERS[ch - 1]}`);
      if (ch === 1) { this.sleepStep('l1_brief'); this.after(first ? 2 : 1, () => this.startDialog('l_hale1', FROM_COMMAND)); }
      else this.sleepStep(['', '', 'l2_scan', 'l3_go', 'l4_go', 'l5_go'][ch]);
    },
    sleepChapterEnd(ch) { this.after(6, () => { if (this.camp && this.camp.ch === ch) this.sleepChapter(ch + 1); }); },
    sleepSay(who, text, col = 3, from) {
      this.say(from !== undefined ? from : this.dlg ? this.dlg.from : FROM_COMMAND, col, text);
      const m = this.msgs[0], ch = CHARS[who];
      m.who = who;
      if (ch && ch.civ >= 3) m.lang = ch.civ;
    },
    sleepObjective() {
      const c = this.camp, P = this.P;
      const ice = `ICE ABOARD ${P.cargo[G.R_ICE]}/4`;
      return {
        l1_brief: 'STAND BY - STARBASE 12 HAS SOMETHING FOR US',
        l1_find: 'FIND THE COLD CONTACT IN THE MARKED AREA (NAV MAP). IT IS NEARLY INVISIBLE - SENSORS PICK IT UP WITHIN ABOUT 8K',
        l1_scan: 'SCIENCE: FULL-SCAN THE CONTACT TO SEE WHAT IT IS',
        l1_hail: 'COMMS: HAIL THE COVENANT',
        l1_charter: 'THE COVENANT ONLY ANSWERS TO THE WORDS OF ITS CHARTER. ITS HULL SAYS "VESPERA FOUNDERS\' SOCIETY": NAV - PLOT AN ORBIT OF VESPERA, HELM - AUTOPILOT / JUMP > ORBIT, COMMS - HAIL VESPERA COLONY AND ASK ABOUT THE COVENANT',
        l1_mother: `GIVE MOTHER THE CHARTER WORDS: HAIL THE COVENANT AND SAY "${CHARTER}"`,
        l1_bay3: `CRYO BAY 3 FAILS IN ${this.sleepBay3Left()}: BEAM 4 WATER ICE ACROSS (HAIL MOTHER WITHIN 5K) OR LET HER WAKE BAY 3. ${ice}. COMET C-17 (MARKED) IS 70% ICE - SCIENCE CAN TRACTOR IT IN. VESPERA COLONY TRADES ICE FOR ALLOY`,
        l2_scan: `SOMEONE IS AWAKE ON THE COVENANT AND MOTHER SAYS NO ONE IS. SCIENCE: SCAN THE COVENANT AGAIN - EACH PASS GOES DEEPER (PASS ${Math.min(3, c.pass + 1)}/3). COMMS: CONFRONT MOTHER WITH WHAT YOU FIND`,
        l2_talk: 'COMMS: HAIL MOTHER AND CONFRONT HER WITH THE EVIDENCE - WHO IS AWAKE ON HER SHIP?',
        l3_go: 'A KESSARI TUG TOOK BAY 1 TOWARD THE MERIDIAN LANE. JUMP TO MERIDIAN REACH (NAV > GALAXY) AND ASK AT DEEP HOLLOW',
        l3_drift: 'BAY 1 IS WITH THE BROKER VASK AT THE SPUR. JUMP TO THE KESSARI DRIFT',
        l3_vask: 'FIND BAY 1 BESIDE THE SPUR (MARKED) AND DEAL WITH VASK - COMMS: HAIL THE MAW',
        l3_skarra: 'DEN-MOTHER SKARRA WANTS PROOF THE SLEEPERS ARE A CREW, NOT CARGO. ORBIT CINDER (NAV: PLOT ORBIT, HELM: AUTOPILOT > ORBIT) AND HAIL THE CINDER DEN',
        l3_fight: 'TAKE BAY 1 BY FORCE: BEAT THE MAW (HULL UNDER 35%) - DON\'T HIT THE CRYO MODULE',
        l3_tow: 'SCIENCE: TRACTOR CRYO BAY 1 ABOARD (WITHIN 2.5K, SHIELDS DOWN, SLOW)',
        l4_go: 'TAKE BAY 1 HOME: JUMP TO KALOS AND CLOSE TO 3K OF THE COVENANT',
        l4_lab: 'SCIENCE: BAY 1\'S STASIS FLUID HAS BEEN DOCTORED. THE SAMPLE IS IN THE ARTEFACT HOLD - RUN LAB TESTS AND CLASSIFY IT',
        l4_cure: 'MARRIN\'S NEUTRALISER NEEDS 2 LATTICE CRYSTAL AND 1 PLASMA: HAIL MOTHER (WITHIN 5K) AND BEAM THEM ACROSS - OR TELL HER TO WAKE BAY 1 ANYWAY',
        l4_dest: 'HAVEN\'S REST IS DEAD. HELP MOTHER DECIDE WHERE 4,000 PEOPLE GO',
        l5_go: 'STAND BY THE COVENANT - THE REVIVAL IS ABOUT TO BEGIN',
      }[c.step];
    },
    sleepStep(k) {
      const c = this.camp;
      c.step = k; c.t = 0;
      const obj = this.sleepObjective();
      if (obj) this.setObjective(`CH${c.ch}: ${obj}`);
      this.sleepEnter(k);
    },
    sleepEnter(k) {
      const c = this.camp, sid = this.sysDef.id;
      if (k === 'l1_find' && sid === 'kalos') { this.M.mk.push({ x: COV[0], y: COV[1], kind: MK_AREA, r: 9000 }); this.M.ver++; }
      if (k === 'l2_scan') { const n = this.sleepCov(); if (n) n.scan = 1; this.after(2, () => this.say(FROM_CREW, 1, 'CAPTAIN - THAT WARM LIFE SIGN JUST MOVED, FROM THE BRIDGE TO THE ENGINE DECK. SOMEONE IS AWAKE OVER THERE, AND THEY DON\'T WANT TO BE SEEN. SCIENCE CAN TAKE A DEEPER SCAN PASS.')); }
      if (k === 'l4_lab') this.addArt('stasis', 0);
      this.sleepTalk();
    },
    // who answers when hailed, by step
    sleepTalk() {
      const c = this.camp, cov = this.sleepCov();
      if (cov) cov.talk = c.ch === 1 ? 'l_mother1' : c.ch === 2 ? 'l_mother2' : c.step === 'l4_dest' ? 'l_dest' : 'l_mother4';
      for (let i = 0; i < MAX_CONTACTS; i++) {
        const n = this.npc[i];
        if (!n.active || n.type !== CT_GROUND) continue;
        if (n.name === 'VESPERA COLONY') n.talk = c.ch === 1 ? 'l_pell' : 'g_colony';
        if (n.name === 'CINDER DEN') n.talk = c.step === 'l3_skarra' || c.step === 'l3_vask' ? 'l_skarra' : 'g_den';
      }
    },
    sleepCov() { const c = this.camp; return c && c.covId !== undefined && this.npc[c.covId] && this.npc[c.covId].active && this.npc[c.covId].covenant ? this.npc[c.covId] : null; },
    sleepSpawnCov() {
      const c = this.camp;
      const id = this.spawnAt(CT_FREIGHTER, F_NEUTRAL, COV[0], COV[1], 135);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { ai: AI_STATIC, speed: 0, scan: c.ch === 1 ? (c.pass ? 2 : 0) : c.step === 'l2_scan' ? 1 : 2, civ: CIV_COLONY, name: 'COLONY SHIP COVENANT', short: 'COVENANT', covenant: true,
        hull: c.covHull ?? 100, shields: 0, shMax: 0, armor: 0.5, talkCtx: {}, note: this.sleepNote() });
      c.covId = id;
    },
    sleepNote() {
      const c = this.camp, p = c.pass || 0;
      const L = ['SUBLIGHT COLONY SHIP COVENANT. HULL STAMP: "VESPERA FOUNDERS\' SOCIETY - LAUNCHED 2291". 4,112 COLONISTS IN CRYOSTASIS - AND ONE LIFE SIGN AT NORMAL BODY TEMPERATURE. CRYO BAY 3 IS LOSING POWER. THE SHIP MIND IS AWAKE: COMMS CAN HAIL IT.'];
      if (p >= 2) L.push('PASS 2: CRYO BAY 2 - 212 PODS, ALL COLD, NO LIFE SIGNS; FAILED ABOUT 31 YEARS AGO. CRYO BAY 1 IS MISSING - CUT AWAY DAYS AGO WITH A KESSARI PLASMA TORCH.');
      if (p >= 3) L.push('PASS 3: NAV LOG - 31 YEARS AGO THE COVENANT TURNED BACK TOWARD INHABITED SPACE. AUTHORISED BY CHIEF ENGINEER ELIAS WREN, POD 2-117 - IN THE DEAD BAY.');
      return L.join(' ');
    },
    // ---- chapter 1
    sleepRefused() {
      const c = this.camp;
      if (c.refused) return;
      c.refused = true;
      this.after(3, () => this.say(FROM_CREW, 0, 'CAPTAIN, THE HULL STAMP SAYS "VESPERA FOUNDERS\' SOCIETY" - AND THE VESPERA COLONY IS RIGHT HERE IN KALOS. IF ANYONE STILL HAS THE WORDS OF THAT CHARTER, IT\'S THEIR ARCHIVE. WE\'LL NEED A STANDARD ORBIT OF VESPERA TO TALK TO THE SURFACE.'));
      if (!c.charter) this.sleepStep('l1_charter');
    },
    sleepLie() {
      const c = this.camp, n = this.sleepCov();
      if (c.lieSaid || !n || n.scan < 2) return;
      c.lieSaid = true;
      this.after(2, () => this.say(FROM_CREW, 1, 'SHE\'S WRONG, CAPTAIN - OR LYING. OUR SCAN READS ONE PERSON AWAKE OVER THERE. NORMAL BODY TEMPERATURE, MOVING AROUND.'));
    },
    sleepComet() {
      const c = this.camp;
      if (c.cometId !== undefined) return;
      const [x, y] = [COV[0] + 7000, COV[1] - 4500];
      const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, 0);
      if (id === NO_ID) return;
      Object.assign(this.npc[id], { poi: G.PK_COMET, kind: G.PK_COMET, civ: 0, hull: 100, armor: 0, haz: 0.05, art: -1, poiKey: 'c17', short: 'COMET C-17', name: 'COMET C-17', scan: 2, note: 'SEVENTY PERCENT WATER ICE. A TRACTOR BEAM EXTRACTION WILL RECOVER IT.' });
      this.npc[id].res = [0, 6, 0, 0, 0, 0];
      c.cometId = id;
      this.M.mk.push({ x, y, kind: MK_POINT, r: 0 }); this.M.ver++;
    },
    sleepBay3Left() { const t = Math.max(0, Math.ceil(this.camp.bay3T ?? 360)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; },
    sleepIce() {
      const P = this.P, n = this.sleepCov();
      if (!n || distTo(P.x, P.y, n.x, n.y) > XFER_R) { this.sleepSay('mother', 'YOU ARE BEYOND MY TRANSPORTER RANGE. COME WITHIN 5K.'); return 'bay3'; }
      P.cargo[G.R_ICE] -= 4;
      this.sleepBay3('saved');
      return null;
    },
    sleepBay3(how) {
      const c = this.camp;
      if (c.f.bay3done) return;
      c.f.bay3done = true; c.f.bay3 = how;
      if (how === 'saved') { this.emit(K.EV_REFINED); this.sleepSay('mother', 'ICE RECEIVED. COOLANT FLOWING. BAY 3 IS STABLE - ALL 380 SLEEPERS ARE SAFE. THANK YOU, FRIENDS.', 3); this.repAdd(CIV_COLONY, 5); }
      else if (how === 'woken') { this.sleepSay('mother', 'BEGINNING REVIVAL OF BAY 3. ...THEY ARE WAKING. THEY ARE FRIGHTENED, BUT ALIVE. THE VESPERA COLONY HAS OFFERED TO TAKE THEM IN - THEIR GREAT-GRANDCHILDREN\'S GRANDCHILDREN ARE WAITING.', 3); this.repAdd(CIV_COLONY, 10); }
      else { this.sleepSay('mother', 'BAY 3 HAS FAILED. THREE HUNDRED AND EIGHTY... I AM LOGGING THEIR NAMES.', 2); this.repAdd(CIV_COLONY, -10); }
      this.sleepChapterEnd(1);
    },
    // ---- chapter 2: deeper scan passes
    sleepOnScan(id) {
      const c = this.camp, n = this.npc[id];
      if (!n || n.scan < 2) return;
      if (n.covenant) {
        if (c.step === 'l1_scan' || (c.ch === 1 && !c.pass)) {
          c.pass = 1; n.note = this.sleepNote();
          this.say(FROM_CREW, 3, 'IT\'S A SHIP - A SUBLIGHT COLONY SHIP, THE COVENANT. HULL STAMP: "VESPERA FOUNDERS\' SOCIETY, LAUNCHED 2291". 4,112 COLONISTS IN CRYOSTASIS... AND ONE LIFE SIGN AT NORMAL BODY TEMPERATURE. CRYO BAY 3 IS LOSING POWER. HER SHIP MIND IS AWAKE - COMMS CAN HAIL IT.');
          if (c.step === 'l1_scan') this.sleepStep('l1_hail');
          return;
        }
        if (c.step === 'l2_scan' && c.pass < 3) {
          c.pass = Math.max(2, c.pass + 1); n.note = this.sleepNote();
          if (c.pass === 2) { this.say(FROM_CREW, 2, 'DEEP PASS 2: CRYO BAY 2 - 212 PODS, ALL COLD. NO LIFE SIGNS. THE BAY FAILED ABOUT 31 YEARS AGO. AND CRYO BAY 1 IS GONE - CUT CLEAN AWAY, DAYS AGO. THE TORCH MARKS ARE KESSARI. ONE MORE PASS AND WE\'LL HAVE HER LOGS.'); n.scan = 1; }
          else { this.say(FROM_CREW, 3, 'DEEP PASS 3: HER NAV LOG. 31 YEARS AGO THE COVENANT TURNED AROUND, BACK TOWARD INHABITED SPACE. THE CHANGE WAS AUTHORISED BY CHIEF ENGINEER ELIAS WREN - POD 2-117. POD 2-117 IS IN THE DEAD BAY. ASK MOTHER ABOUT WREN.'); this.sleepStep('l2_talk'); }
        }
        return;
      }
      if (n.module && !n.noted) { n.noted = true; this.say(FROM_CREW, 0, 'CRYO BAY 1: 600 LIFE SIGNS IN STASIS. THE STASIS FLUID\'S CHEMISTRY IS WRONG - SOMETHING HAS BEEN ADDED TO IT.'); }
      if (n.maw && !n.noted) { n.noted = true; this.say(FROM_CREW, 0, 'THE MAW: AN ARMED TUG. HER TOW CLAMPS ARE SCORED WITH THE COVENANT\'S HULL ALLOY. HER HOLD HAS STASIS-FLUID DRUMS - AND KESSARI WORK-GANG SEDATIVE.'); }
    },
    // ---- chapter 3
    sleepFightVask() {
      const c = this.camp;
      c.f.vask = 'fought';
      this.repAdd(CIV_KESSARI, -10);
      this.sleepSay('vask', 'SO THE FLEET STEALS TOO. VERY WELL!', 2);
      this.npcAttack([c.vaskId, ...(c.guardIds || [])]);
      this.sleepStep('l3_fight');
    },
    sleepDen() {
      const c = this.camp, aboard = c.f.wren === 'aboard';
      if (aboard) {
        this.sleepSay('wren', 'THEY\'RE MY CREW, DEN-MOTHER. I\'VE KEPT WATCH OVER THEM FOR THIRTY-ONE YEARS. I AM STILL KEEPING IT.', 3);
        this.after(3, () => this.sleepSay('den', 'A SHIP WITH A WATCH-KEEPER IS NO DERELICT, AND ITS SLEEPERS ARE NO ONE\'S CARGO. THE DEN HAS SPOKEN. VASK WILL OPEN HIS HAND - AND HE WILL LEAVE THE DRIFT.', 3, this.dlg ? this.dlg.from : FROM_COMMAND));
      } else this.camp.f.denDebt = true;
      c.f.vask = 'den';
      this.repAdd(CIV_KESSARI, 10);
      this.after(aboard ? 7 : 3, () => { this.sleepSay('vask', 'THE OLD WOMAN HAS SPOKEN. TAKE YOUR COLD BOX, FLEET. VASK HAS A LONG MEMORY.', 1, c.vaskId !== undefined ? c.vaskId : FROM_COMMAND); this.sleepRelease(); });
      return null;
    },
    sleepRelease() {
      const c = this.camp, m = c.modId !== undefined ? this.npc[c.modId] : null;
      if (m) m.lockMsg = '';
      if (c.f.vask !== 'fought') this.npcLeave([c.vaskId, ...(c.guardIds || [])]);
      this.sleepStep('l3_tow');
    },
    // ---- chapter 4
    sleepCure(ok) {
      const c = this.camp, P = this.P, n = this.sleepCov();
      if (ok && (!n || distTo(P.x, P.y, n.x, n.y) > XFER_R)) { this.sleepSay('mother', 'YOU ARE BEYOND MY TRANSPORTER RANGE. COME WITHIN 5K.'); return 'start'; }
      if (ok) { P.cargo[G.R_CRYSTAL] -= 2; P.cargo[G.R_PLASMA] -= 1; this.emit(K.EV_REFINED); this.sleepSay('mother', 'NEUTRALISER MIXED AND FLUSHED THROUGH BAY 1. THE SEDATIVE IS BREAKING DOWN. THEY WILL WAKE AS THEMSELVES.'); }
      else this.sleepSay('mother', 'AS YOU WISH. THEY WILL WAKE... DULLED. DOCILE. FOR MONTHS, PERHAPS. I WILL LOG WHY.', 1);
      c.f.cure = ok;
      this.after(5, () => this.sleepHaven());
      c.step = 'l4_wait'; this.setObjective('CH4: STAND BY - MOTHER IS ASKING SOMETHING');
      return null;
    },
    sleepHaven() {
      const c = this.camp;
      this.sleepSay('mother', 'CAPTAIN, I MUST ASK SOMETHING I HAVE BEEN AFRAID TO ASK. HAVEN\'S REST - THE WORLD WE WERE SAILING FOR. YOUR STAR CHARTS ARE A CENTURY NEWER THAN MINE. IS IT STILL THERE?', 3, c.covId);
      this.after(5, () => {
        this.say(FROM_CREW, 2, 'CAPTAIN... OUR CHARTS DO HAVE HAVEN\'S REST. ITS STAR FLARED EIGHTY YEARS AGO. THE PLANET WAS SCORCHED - NOTHING LIVES THERE NOW. IF THE COVENANT HAD KEPT ITS COURSE, IT WOULD HAVE ARRIVED AT A DEAD WORLD.');
        if (c.f.wren === 'aboard') this.after(4, () => this.sleepSay('wren', 'I KNEW. I SAW THE FLARE IN THE TELESCOPE DATA THIRTY-ONE YEARS AGO, A WEEK AFTER BAY 2. THAT\'S WHY I TURNED HER AROUND. I NEVER FOUND THE COURAGE TO TELL ANYONE.', 3, FROM_CREW));
        this.after(c.f.wren === 'aboard' ? 10 : 5, () => { this.sleepStep('l4_dest'); this.startDialog('l_dest', c.covId); });
      });
    },
    sleepDest(d) {
      const c = this.camp;
      c.f.dest = d;
      if (d === 'fleet') { this.repAdd(CIV_FLEET, 10); this.sleepSay('voss', 'AURORA, VOSS. THE FLEET WILL TAKE THEM - HOUSING ON THREE WORLDS, AND WORK FOR ANYONE WHO WANTS IT. IT IS THE LEAST WE CAN DO.', 3, FROM_COMMAND); }
      if (d === 'vespera') { this.repAdd(CIV_COLONY, 10); this.sleepSay('vadmin', 'VESPERA WILL TAKE THEM, CAPTAIN. ALL OF THEM. WE\'LL BE CROWDED AND HUNGRY FOR A FEW YEARS, AND WE\'LL MANAGE. THEY\'RE FAMILY.', 3, FROM_COMMAND); }
      if (d === 'council') { this.repAdd(CIV_COLONY, 5); this.sleepSay('voss', 'AURORA, VOSS. THERE\'S AN EMPTY GARDEN WORLD IN THE CERULEAN SURVEY - IT\'S THEIRS IF THEY WANT IT. FLEET WILL CARRY THEM; THEY WILL GOVERN THEMSELVES.', 3, FROM_COMMAND); }
      this.sleepChapterEnd(4);
      return null;
    },
    // ---- chapter 5
    sleepWatchStart() {
      const c = this.camp;
      c.watch = true; c.rev = 0; c.waveN = 0; c.nextWave = 6;
      this.sleepSay('mother', 'BEGINNING THE REVIVAL. IT WILL TAKE SOME MINUTES, AND I CANNOT MOVE WHILE IT RUNS. MY SHIELDS ARE A CENTURY OLD, CAPTAIN - PLEASE KEEP WATCH OVER US.', 3, c.covId);
      this.setWaypoint(this.npc[c.covId].x, this.npc[c.covId].y);
    },
    sleepWave() {
      const c = this.camp, f = c.f, cov = this.sleepCov();
      if (!cov) return;
      const first = c.waveN === 0;
      const n = first ? (f.vask === 'paid' ? 4 : 3) : (f.vask === 'den' ? 1 : 2) + (this.M.diff >= 2 ? 1 : 0);
      const [x, y] = this.pointNear(cov.x, cov.y, 12000);
      for (let i = 0; i < n; i++) {
        const big = first && i === 0;
        const id = this.spawnFoe(big ? CT_DESTROYER : CT_RAIDER, this.clampSec(x + i * 1400), this.clampSec(y + (i % 2) * 1200), i % 2 ? US : c.covId, AI_WARPIN);
        if (id === NO_ID) continue;
        Object.assign(this.npc[id], { civ: CIV_KESSARI, name: big ? 'THE MAW' : `VASK'S RAIDER ${i}`, short: big ? 'THE MAW' : `RAIDER ${i}` });
        if (big) { c.vaskId = id; Object.assign(this.npc[id], { shMax: 180, shields: 180 }); }
      }
      c.waveN++;
      this.emit(K.EV_WARP_IN);
      if (first) {
        const line = { paid: 'YOU PAID ONCE, FLEET. A WHOLE SHIP OF SLEEPERS WILL PAY BETTER - AND THIS TIME I BROUGHT FRIENDS.',
          fought: 'YOU TOOK MY COLD BOX WITH GUNS, FLEET. NOW I TAKE THE WHOLE SHIP THE SAME WAY.',
          den: 'THE OLD WOMAN THREW ME OUT OF THE DRIFT FOR YOUR SLEEPERS. THEN I WILL HAVE ALL OF THEM - WHAT DOES VASK HAVE LEFT TO LOSE?' }[f.vask] || 'THE COVENANT IS MINE, FLEET.';
        this.sleepSay('vask', line, 2, c.vaskId !== undefined ? c.vaskId : FROM_COMMAND);
      } else this.say(FROM_CREW, 2, 'MORE OF VASK\'S SHIPS DROPPING OUT OF WARP!');
    },
    sleepAllies() {
      const c = this.camp, f = c.f;
      const call = (who, n, type, civ, name, line, grudging) => this.callAlly(who, { ships: n, type, civ, name, line, grudging });
      call('den', 3, CT_RAIDER, CIV_KESSARI, 'DEN HUNTER', 'THE DEN HUNTS ITS OWN SHAME, FLEET. VASK IS OURS.', 'THE DEN PAYS ITS DEBTS. ONE FIGHT.');
      call('okafor', 2, CT_FREIGHTER, CIV_COLONY, 'HOLLOWAY HAULER', 'DEEP HOLLOW\'S HERE, CAPTAIN - HAULERS WITH GUNS BOLTED ON, LIKE I PROMISED.');
      call('vadmin', 2, CT_FREIGHTER, CIV_COLONY, 'VESPERA MILITIA', 'VESPERA MILITIA, AURORA. THOSE ARE OUR PEOPLE ON THAT SHIP.', 'VESPERA SENDS WHAT IT CAN.');
      call('hale', 3, CT_DESTROYER, CIV_FLEET, 'FLEET CRUISER', 'FLEET SQUADRON ON STATION, AURORA. WE\'LL TAKE THE ONES ON THE LEFT.', 'ONE CRUISER IS ALL WE CAN SPARE, AURORA.');
    },
    sleepBond(who) { // how this campaign's choices become each ally's bond (allies.js)
      const f = this.camp.f;
      switch (who) {
        case 'den': return f.vask === 'den' ? (f.wren === 'aboard' ? 3 : 1) : 0;
        case 'okafor': return f.okaforGift ? 2 : 0;
        case 'vadmin': return f.bay3 === 'woken' ? 3 : f.dest === 'vespera' ? 2 : 1;
        case 'hale': return f.dest === 'fleet' ? 3 : this.rep[CIV_FLEET] >= 60 ? 1 : 0;
      }
      return 0;
    },
    sleepEnding() {
      const c = this.camp, f = c.f;
      const T = {
        council: ['WE GO SO OTHERS MAY STAY', 'THE COVENANT\'S PEOPLE SETTLE AN EMPTY GARDEN WORLD IN THE CERULEAN SURVEY, UNDER THEIR OWN COUNCIL. THEY NAME THEIR FIRST TOWN "AURORA". THE FOUNDERS\' CHARTER IS CARVED OVER ITS GATE.'],
        vespera: ['HOMECOMING', 'FOUR THOUSAND PEOPLE COME HOME TO A WORLD THEIR GREAT-GRANDCHILDREN BUILT. THE FIRST YEARS ARE HUNGRY AND CROWDED. NOBODY ON VESPERA REMEMBERS THEM AS ANYTHING BUT FAMILY.'],
        fleet: ['NEW STARS', 'THE FLEET RESETTLES THE COVENANT\'S PEOPLE ACROSS THREE WORLDS. IT IS KIND, AND ORDERLY, AND THE COLONY THEY SAILED TO BUILD IS NEVER BUILT. SOME OF THEM NEVER STOP LOOKING UP.'],
      }[f.dest] || ['THE LONG SLEEP', ''];
      const bits = [];
      bits.push({ saved: 'THE 380 OF BAY 3 WOKE WITH THE REST - YOU KEPT THEIR COOLANT FLOWING.', woken: 'THE 380 OF BAY 3 WERE THE FIRST TO WAKE, AT VESPERA, AND THEY WERE WAITING AT THE AIRLOCK FOR THE OTHERS.', lost: 'BAY 3 NEVER WOKE. THE COLONY\'S FIRST MONUMENT CARRIES 380 NAMES - AND 212 MORE FROM BAY 2.' }[f.bay3]);
      bits.push(f.wrenTone === 'kind' ? 'ELIAS WREN TOLD THE COLONISTS EVERYTHING, AND THEY FORGAVE HIM. HE LIVED OUT HIS DAYS AMONG PEOPLE.' : 'ELIAS WREN STOOD BEFORE HIS PEOPLE FOR BAY 2. THEY CHARGED HIM - AND THEN THANKED HIM FOR HAVEN\'S REST. HE NEVER FORGAVE HIMSELF.');
      bits.push(f.cure ? 'BAY 1 WOKE AS THEMSELVES.' : 'BAY 1 WOKE DULLED AND DOCILE, AND IT WAS A YEAR BEFORE SOME OF THEM LAUGHED AGAIN.');
      bits.push({ rest: 'MOTHER\'S LAST LOG ENTRY READS: "ALL COLONISTS ARE AWAKE." THEN SHE SLEPT.', archive: 'MOTHER LIVES IN THE FLEET ARCHIVE NOW, AND ANSWERS QUESTIONS ABOUT THE YEAR 2291 FOR ANY CHILD WHO ASKS.', stay: 'MOTHER STAYED. SHE RUNS THE COLONY\'S POWER GRID, AND SINGS TO THE NEW CHILDREN AT NIGHT.' }[f.mother] || '');
      c.ending = { kind: f.dest, title: T[0], text: [T[1], ...bits].filter(Boolean).join(' '), allies: [...(c.allies || [])].filter((w) => CHARS[w]).map((w) => CHARS[w].name) };
      this.campSaveOf('sleep').done = true; this.campSaveDirty = true;
      this.say(FROM_COMPUTER, 3, `EPILOGUE: ${T[0]}`);
      this.endMission(true);
    },
    // a lab result
    onClassified(h, key) {
      const c = this.camp;
      if (!c || c.id !== 'sleep' || G.ART[h.a].id !== 'stasis' || c.step !== 'l4_lab') return;
      this.say(FROM_CREW, 3, 'A KESSARI WORK-GANG SEDATIVE - THEY KEEP MINE LABOURERS DOCILE WITH IT FOR MONTHS AFTER THEY WAKE. DR. MARRIN HAS SENT A NEUTRALISER RECIPE: 2 LATTICE CRYSTAL AND 1 PLASMA, FLUSHED THROUGH BAY 1 BEFORE THEY ARE REVIVED.');
      this.sleepStep('l4_cure');
    },
    // ---- arrivals
    sleepArrive() {
      const c = this.camp, sid = this.sysDef.id;
      if (sid === 'kalos') {
        this.greeted.add(0);
        const spawnNow = c.ch >= 2 || c.covSeen;
        if (spawnNow) this.sleepSpawnCov();
        if (c.ch === 1 && c.step === 'l1_find') { this.M.mk.push({ x: COV[0], y: COV[1], kind: MK_AREA, r: 9000 }); this.M.ver++; }
        if (c.ch === 1 && c.cometId !== undefined && !c.f.bay3done) { c.cometId = undefined; this.sleepComet(); }
        if (c.ch === 5 && c.step === 'l5_go') this.after(4, () => { if (this.camp.step === 'l5_go') { this.camp.step = 'l5_watch'; this.sleepWatchStart(); } });
      }
      if (sid === 'meridian' && c.step === 'l3_go') {
        this.greeted.add(0);
        this.npc[0].talk = 'l_okafor';
        this.M.mk.push({ x: Math.round(this.npc[0].x), y: Math.round(this.npc[0].y), kind: MK_POINT, r: 0 }); this.M.ver++;
      }
      if (sid === 'drift' && (c.step === 'l3_drift' || c.step === 'l3_go' || c.step === 'l3_vask' || c.step === 'l3_skarra' || c.step === 'l3_tow' || c.step === 'l3_fight')) {
        this.greeted.add(0);
        const st = this.npc[0];
        const [mx, my] = [st.x + 6000, st.y + 3000];
        const mid = this.spawnAt(CT_POI, F_NEUTRAL, mx, my, 0);
        if (mid !== NO_ID) {
          Object.assign(this.npc[mid], { poi: G.PK_DERELICT, kind: G.PK_DERELICT, civ: 1, hull: 100, armor: 0, haz: 0, art: G.ART_INDEX.cryobay, poiKey: 'bay1', short: 'CRYO BAY 1', name: 'COVENANT CRYO BAY 1', scan: 1, module: true,
            lockMsg: c.step === 'l3_tow' ? '' : 'VASK\'S TOW CLAMPS ARE STILL ON IT - DEAL WITH VASK FIRST.' });
          this.npc[mid].res = [0, 0, 0, 0, 0, 0];
          c.modId = mid;
        }
        if (c.step !== 'l3_tow') {
          const vid = this.spawnAt(CT_DESTROYER, F_NEUTRAL, mx - 2500, my + 2000, 270);
          if (vid !== NO_ID) { Object.assign(this.npc[vid], { ai: AI_STATIC, scan: 1, civ: CIV_KESSARI, name: 'THE MAW', short: 'THE MAW', talk: 'l_vask', talkCtx: {}, shMax: 180, shields: 180, maw: true }); c.vaskId = vid; }
          c.guardIds = [];
          for (let i = 0; i < 2; i++) {
            const gid = this.spawnAt(CT_RAIDER, F_NEUTRAL, mx - 1500 + i * 3000, my - 2500, 270);
            if (gid !== NO_ID) { Object.assign(this.npc[gid], { ai: AI_STATIC, scan: 1, civ: CIV_KESSARI, name: `VASK'S GUARD ${i + 1}`, short: `GUARD ${i + 1}` }); c.guardIds.push(gid); }
          }
          if (c.step === 'l3_drift' || c.step === 'l3_go') this.sleepStep('l3_vask');
        }
        this.M.mk.push({ x: Math.round(mx), y: Math.round(my), kind: MK_POINT, r: 0 }); this.M.ver++;
      }
      this.sleepTalk();
    },
    sleepTick(dt) {
      const c = this.camp, P = this.P, sid = this.sysDef.id;
      c.t += dt;
      const near = (id, r) => id !== undefined && id < MAX_CONTACTS && this.npc[id].active && distTo(P.x, P.y, this.npc[id].x, this.npc[id].y) < r;
      const cov = this.sleepCov();
      if (cov) c.covHull = cov.hull;
      switch (c.step) {
        case 'l1_find':
          if (sid === 'kalos' && distTo(P.x, P.y, COV[0], COV[1]) < 9500 && !c.covSeen) {
            c.covSeen = true;
            this.sleepSpawnCov();
            this.clearMarkers();
            this.emit(K.EV_FOUND);
            this.say(FROM_CREW, 2, 'CONTACT! SOMETHING HUGE AND COLD, BARELY ABOVE BACKGROUND - IT WAS RIGHT IN FRONT OF US. SCIENCE, SCAN IT.');
            this.sleepStep('l1_scan');
            this.sleepTalk();
          }
          break;
        case 'l1_hail': case 'l1_charter': case 'l1_mother': case 'l1_bay3': {
          if (!c.charterOk || c.f.bay3done) break;
          if (c.bay3T === undefined) c.bay3T = [420, 360, 300][this.M.diff % 3];
          if (c.step !== 'l1_bay3') { this.sleepStep('l1_bay3'); this.sleepComet(); }
          c.bay3T -= dt;
          this.setObjective(`CH1: ${this.sleepObjective()}`);
          if (!c.warned && c.bay3T < 60) { c.warned = true; this.sleepSay('mother', 'ONE MINUTE UNTIL BAY 3 FAILS. PLEASE.', 2, c.covId !== undefined ? c.covId : FROM_COMMAND); }
          if (c.bay3T <= 0) this.sleepBay3('lost');
          break;
        }
        case 'l3_go':
          if (sid === 'meridian' && near(0, 14000) && !this.dlg && !c.okaforSpoke) { c.okaforSpoke = true; this.startDialog('l_okafor', 0); }
          break;
        case 'l3_vask':
          if (sid === 'drift' && near(c.vaskId, 12000) && !this.dlg && !c.vaskSpoke) { c.vaskSpoke = true; this.startDialog('l_vask', c.vaskId); }
          break;
        case 'l3_fight': {
          const v = this.npc[c.vaskId];
          if (v && v.active && v.alive && v.ai !== AI_SURRENDER && v.hull < 35) {
            v.ai = AI_SURRENDER; v.faction = F_NEUTRAL; v.speed = 0;
            this.npcLeave(c.guardIds || []);
            this.sleepSay('vask', 'ENOUGH! ENOUGH. TAKE THE COLD BOX. VASK WILL REMEMBER THIS, FLEET.', 2, c.vaskId);
            this.sleepRelease();
          } else if (v && !v.alive) { this.say(FROM_CREW, 3, 'THE MAW IS DESTROYED. BAY 1 IS FREE OF ITS CLAMPS.'); c.f.vaskDead = true; this.npcLeave(c.guardIds || []); this.sleepRelease(); }
          break;
        }
        case 'l3_tow':
          if (this.hasArt('cryobay')) {
            this.say(FROM_CREW, 3, 'CRYO BAY 1 IS SECURE IN THE SHUTTLE BAY - SIX HUNDRED SLEEPERS, ALL STABLE. LET\'S TAKE THEM HOME.');
            this.clearMarkers(); this.sleepChapterEnd(3); c.step = 'l3_done';
          }
          break;
        case 'l4_go':
          if (sid === 'kalos' && cov && near(c.covId, 3000)) {
            const i = P.arts.findIndex((q) => G.ART[q.a].id === 'cryobay');
            if (i >= 0) P.arts.splice(i, 1);
            this.sleepSay('mother', 'BAY 1 IS HOME. I AM CONNECTING THE PODS... CAPTAIN, SOMETHING IS WRONG. THE SLEEPERS IN BAY 1 HAVE BEEN GIVEN SOMETHING - THEIR STASIS FLUID HAS BEEN CHANGED, AND I CANNOT IDENTIFY IT. I AM BEAMING A SAMPLE TO YOUR LABORATORY.', 1, c.covId);
            this.sleepStep('l4_lab');
          }
          break;
        case 'l5_go':
          if (sid === 'kalos' && cov && !c.watch) { c.step = 'l5_watch'; this.sleepWatchStart(); }
          break;
        case 'l5_watch': {
          if (!cov || !cov.alive) { this.say(FROM_CREW, 2, 'THE COVENANT IS GONE. FOUR THOUSAND PEOPLE...'); this.endMission(false, K.FAIL_RESCUE); return; }
          if (sid !== 'kalos') break;
          if (c.t > c.nextWave && c.waveN < 2) { c.nextWave = 1e9; this.sleepWave(); }
          if (c.waveN === 1 && c.rev >= 50 && !c.wave2) { c.wave2 = true; this.sleepWave(); }
          if (c.t > 14 && !c.allyCalled) { c.allyCalled = true; this.sleepAllies(); }
          // the revival runs faster with Wren aboard the Covenant helping
          c.rev = Math.min(100, c.rev + (100 / 170) * (c.f.wren === 'stays' ? 1.35 : 1) * dt);
          const foes = this.foesLeft();
          const cover = this.sheltered(cov) ? 'INSIDE OUR SHIELD BUBBLE' : 'OUTSIDE OUR SHIELDS';
          this.setObjective(`CH5: PROTECT THE COVENANT DURING THE REVIVAL - ${Math.floor(c.rev)}% AWAKE, COVENANT HULL ${Math.round(cov.hull)}% (${cover})${foes ? `, ${foes} RAIDERS` : ''}`);
          if (c.rev >= 100 && !foes && !this.dlg && !c.finalAsked) {
            c.finalAsked = true;
            for (let i = 0; i < MAX_CONTACTS; i++) if (this.hostileAlive(i)) this.npcLeave([i]);
            this.after(2, () => this.startDialog('l_final', c.covId));
          } else if (c.rev >= 100 && foes && !c.revSaid) {
            c.revSaid = true;
            this.sleepSay('mother', 'EVERYONE IS AWAKE - FOUR THOUSAND PEOPLE, AND THEY ARE FRIGHTENED. PLEASE, HOLD THEM OFF A LITTLE LONGER.', 2, c.covId);
            // nobody buys workers who are awake and angry: Vask's crews lose their nerve
            this.after(20, () => {
              if (!this.camp || this.camp.step !== 'l5_watch' || !this.foesLeft()) return;
              this.sleepSay('vask', 'THEY ARE AWAKE - ALL OF THEM. AWAKE, THEY ARE WORTH NOTHING TO ME. VASK IS DONE WITH YOU, FLEET.', 1, c.vaskId !== undefined && this.npc[c.vaskId].alive ? c.vaskId : FROM_COMMAND);
              for (let i = 0; i < MAX_CONTACTS; i++) if (this.hostileAlive(i)) this.npcLeave([i]);
            });
          }
          break;
        }
      }
    },
  });
}
