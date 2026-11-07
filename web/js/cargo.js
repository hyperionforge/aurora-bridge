// ============================================================================
// cargo.js - materials, refinery recipes, points of interest and artefacts.
// Shared by the host (rules) and the screens (names, colours, text).
// ============================================================================
import { C } from './config.js';

// ---------------------------------------------------------------- materials
// raw (0-5) come from points of interest; refined (6-8) come from the refinery
export const R_ORE = 0, R_ICE = 1, R_CRYSTAL = 2, R_PLASMA = 3, R_ALLOY = 4, R_EXOTIC = 5,
  R_SPARES = 6, R_PLATING = 7, R_CELL = 8, NRES = 9, NRAW = 6;
export const RES_NAME = ['FERRIC ORE', 'WATER ICE', 'LATTICE CRYSTAL', 'PLASMA', 'SALVAGE ALLOY', 'EXOTIC MATTER',
  'SPARE PARTS', 'HULL PLATING', 'ANTIMATTER CELL'];
export const RES_SHORT = ['ORE', 'ICE', 'CRYSTAL', 'PLASMA', 'ALLOY', 'EXOTIC', 'SPARES', 'PLATING', 'CELLS'];
export const RES_COL = ['#b48c64', '#a0dcff', '#c8a0ff', '#ff8a5a', '#a0a8b8', '#9ff0e6', C.YELLOW, C.SKY, C.GREEN];
export const HOLD_CAP = 80;                    // raw materials
export const CARGO_START = [4, 2, 1, 1, 2, 0, 6, 2, 1];
export const STATION_SPARES = 6;               // a friendly dock tops spares up to this

// ---------------------------------------------------------------- refinery
// in: [res, n]...   out: res index, or 'photon' / 'quantum' (torpedo stock)
export const RECIPES = [
  { name: 'SPARE PARTS', in: [[R_ORE, 2], [R_ALLOY, 1]], out: R_SPARES, energy: 40, time: 8, note: 'REPAIR TEAMS USE THESE' },
  { name: 'HULL PLATING', in: [[R_ALLOY, 2], [R_ORE, 1]], out: R_PLATING, energy: 50, time: 10, note: 'FIELD REPAIR: +12% HULL' },
  { name: 'ANTIMATTER CELL', in: [[R_ICE, 2], [R_PLASMA, 1]], out: R_CELL, energy: 30, time: 8, note: 'LOAD FOR +150 ENERGY' },
  { name: 'PHOTON TORPEDO', in: [[R_ALLOY, 1], [R_PLASMA, 1]], out: 'photon', energy: 60, time: 12, note: '+1 PHOTON' },
  { name: 'QUANTUM TORPEDO', in: [[R_EXOTIC, 1], [R_CRYSTAL, 1], [R_ALLOY, 1]], out: 'quantum', energy: 90, time: 16, note: '+1 QUANTUM' },
];
export const REF_QUEUE = 4;
export const PLATING_HULL = 12, CELL_ENERGY = 150;

// ---------------------------------------------------------------- points of interest
export const PK_ASTEROID = 0, PK_COMET = 1, PK_WRECK = 2, PK_DERELICT = 3, PK_RUINS = 4, PK_GAS = 5, PK_SPIRE = 6, PK_CAPSULE = 7;
export const POI_NAME = ['ASTEROID', 'COMET', 'SHIPWRECK', 'ALIEN DERELICT', 'ANCIENT RUINS', 'GAS POCKET', 'CRYSTAL SPIRE', 'DRIFTING CAPSULE'];
// yield ranges per raw material [min,max]; art = chance of an artefact; haz = chance extraction goes wrong
export const POI_DEF = [
  { res: [[3, 8], 0, [0, 2], 0, 0, 0], art: 0.06, haz: 0.10, hazText: 'THE ASTEROID FRACTURES - DEBRIS STRIKE!' },
  { res: [0, [4, 9], 0, [1, 3], 0, [0, 1]], art: 0.04, haz: 0.12, hazText: 'THE COMET OUTGASSES VIOLENTLY!' },
  { res: [[0, 2], 0, 0, [0, 2], [3, 7], 0], art: 0.35, haz: 0.22, hazText: 'REACTOR BREACH IN THE WRECK!' },
  { res: [0, 0, [1, 3], 0, [2, 4], [1, 3]], art: 0.6, haz: 0.35, hazText: 'AUTOMATED DEFENCES ARE WAKING UP!' },
  { res: [0, 0, [2, 4], 0, 0, [1, 2]], art: 0.8, haz: 0.25, hazText: 'A RESONANCE PULSE FLOODS THE SENSORS!' },
  { res: [0, [0, 2], 0, [4, 9], 0, 0], art: 0.0, haz: 0.35, hazText: 'THE GAS IGNITES!' },
  { res: [0, 0, [4, 8], 0, 0, [0, 2]], art: 0.15, haz: 0.2, hazText: 'THE SPIRE SHATTERS IN A RESONANCE PULSE!' },
  { res: [0, 0, 0, 0, [1, 2], 0], art: 0.7, haz: 0.05, hazText: 'THE CAPSULE\'S SELF-DESTRUCT TRIGGERS!' },
];
export const POI_TIP = [
  'NICKEL-IRON ROCK. GOOD FOR ORE.', 'A DIRTY SNOWBALL - ICE AND FROZEN PLASMA.', 'A DEAD SHIP. SALVAGE, AND WHATEVER HER CREW LEFT BEHIND.',
  'A HULL OF NO KNOWN DESIGN. VALUABLE - AND POSSIBLY STILL ARMED.', 'A FRAGMENT OF SOMETHING VERY OLD. ARTEFACTS LIKELY.',
  'A POCKET OF IONISED GAS. RICH IN PLASMA. VOLATILE.', 'A NATURAL CRYSTAL GROWTH, SINGING FAINTLY ON SUBSPACE BANDS.',
  'AN ESCAPE OR CARGO CAPSULE. SOMEONE MEANT IT TO BE FOUND.',
];
export const SAMPLE_R = 6000, SAMPLE_S = 6, SAMPLE_COST = 20;
export const EXTRACT_R = 2500, EXTRACT_S = 18, EXTRACT_COST = 60, EXTRACT_MAX_SPEED = 30;
export const ANALYSE_S = 8, ANALYSE_COST = 30, DEEP_S = 20, DEEP_COST = 80;

// ---------------------------------------------------------------- artefacts
// fx: what an identified artefact does while it is in the hold
//   ph  phaser damage x   shRegen shield regen x   cool  heat shed x   sensor range x
//   jump jump charge x   tube torpedo reload x   hullRegen %/s   raid (more Kessari)
// lore: deep analysis text. set: part of a group (the three Chorus shards)
export const ART = [
  { id: 'lens', name: 'TARGETING LENS', unk: 'FACETED GLASS PRISM', fx: { ph: 1.2 }, effect: 'PHASER DAMAGE +20%',
    lore: 'FLEET OPTICS, OLD PATTERN. THE SERIAL NUMBER BELONGS TO THE USS TALLIS, LOST NINE YEARS AGO NEAR THE SHROUD.' },
  { id: 'coil', name: 'RESONANCE COIL', unk: 'HUMMING METAL COIL', fx: { shRegen: 1.3 }, effect: 'SHIELD REGENERATION +30%',
    lore: 'VELORI WORK. THE GUILD SELLS THESE TO NOBODY - SOMEBODY STOLE THIS ONE.' },
  { id: 'cryo', name: 'CRYO-MATRIX', unk: 'FROSTED CYLINDER', fx: { cool: 1.35 }, effect: 'SYSTEMS SHED HEAT 35% FASTER',
    lore: 'A COMET-MINER\'S HEAT SINK. STILL COLD TO THE TOUCH AFTER CENTURIES.' },
  { id: 'core', name: 'SURVEY CORE', unk: 'DATA CORE', fx: { sensor: 1.25 }, effect: 'SENSOR RANGE +25%',
    lore: 'SURVEY DATA FROM A COLONY SHIP. ONE ENTRY IS FLAGGED: "SIGNAL - BEYOND ORRA - DO NOT ANSWER".' },
  { id: 'keel', name: 'GRAVITIC KEEL', unk: 'HEAVY CURVED SPAR', fx: { jump: 1.5 }, effect: 'JUMP DRIVE CHARGES 50% FASTER',
    lore: 'ORRAN ENGINEERING. EVERY ORRAN WARSHIP HAS ONE - NONE ARE EVER LEFT BEHIND. ASK WHY THIS ONE WAS.' },
  { id: 'primer', name: 'TORPEDO PRIMER', unk: 'SEALED CANISTER', fx: { tube: 1.3 }, effect: 'TORPEDO TUBES LOAD 30% FASTER',
    lore: 'KESSARI MILITARY ISSUE, STOLEN FROM AN ORRAN DEPOT IF THE MARKINGS ARE RIGHT.' },
  { id: 'nanite', name: 'NANITE CULTURE', unk: 'SILVER GEL VIAL', fx: { hullRegen: 0.12 }, effect: 'SELF-REPAIRING HULL (+0.12%/s)',
    lore: 'THE NANITES ARE REPLICATING THE SAME SHAPE OVER AND OVER: SEVEN CIRCLES AROUND A POINT.' },
  { id: 'idol', name: 'KESSARI WAR IDOL', unk: 'ORNATE IDOL', fx: { raid: 1 }, effect: 'CURSED: A HIDDEN BEACON DRAWS KESSARI RAIDERS. JETTISON IT!', cursed: true,
    lore: 'THE BEACON INSIDE IS KEYED TO MAREK DRAAL\'S PERSONAL FREQUENCY. HE WANTS IT BACK.' },
  { id: 'log', name: 'CAPTAIN\'S LOG', unk: 'DAMAGED LOG RECORDER', fx: {}, effect: 'NO EFFECT - A RECORD',
    lore: '"...THE SONG STARTED THREE DAYS AGO. THE CREW HEARS IT IN THEIR SLEEP. LIN SAYS IT IS COMING FROM ORRA, BUT THE ORRANS HEAR IT TOO..."' },
  { id: 'shard1', name: 'CHORUS SHARD (I)', unk: 'SINGING CRYSTAL', fx: {}, effect: 'ONE OF THREE. IT RESONATES WITH SOMETHING FAR AWAY.', set: 'chorus',
    lore: 'THE SHARD\'S HUM IS A CARRIER WAVE. ENCODED ON IT: THE FIRST THIRD OF A NAVIGATIONAL VECTOR.' },
  { id: 'shard2', name: 'CHORUS SHARD (II)', unk: 'SINGING CRYSTAL', fx: {}, effect: 'ONE OF THREE. IT RESONATES WITH SOMETHING FAR AWAY.', set: 'chorus',
    lore: 'THE SECOND THIRD OF THE VECTOR. IT POINTS PAST ORRA PRIME, INTO SPACE NO CHART SHOWS.' },
  { id: 'shard3', name: 'CHORUS SHARD (III)', unk: 'SINGING CRYSTAL', fx: {}, effect: 'ONE OF THREE. IT RESONATES WITH SOMETHING FAR AWAY.', set: 'chorus',
    lore: 'THE LAST THIRD. TOGETHER THE SHARDS DESCRIBE A JUMP LANE FROM ORRA PRIME TO A WHITE DWARF CALLED, IN THEIR SONG, THE SILENT CHOIR.' },
  // story items for THE ARGUS PARADOX (never found at random)
  { id: 'recorder', name: 'AURORA FLIGHT RECORDER', unk: 'SCORCHED FLIGHT RECORDER', fx: {}, effect: 'THE BLACK BOX OF A SHIP WITH OUR NAME - DESTROYED NINE DAYS FROM NOW. DEEP SCAN IT.', story: true,
    lore: 'LAST ENTRY, IN THE CAPTAIN\'S OWN VOICE: "...THE RIFT\'S CARRIER IS 7.31 TERAHERTZ. ANYTHING IT TOUCHES RINGS AT THAT FREQUENCY - OR AT A WHOLE MULTIPLE OF IT. ARGUS TRIED TO WARN US. THE LANCE CORE BLEEDS CHRONITON PARTICLES; TERUK HAS HIDDEN IT AMONG CIVILIANS. AND WHATEVER HAPPENS - DON\'T FLY INTO THE RIFT BLIND."' },
  { id: 'lancecore', name: 'TEMPORAL LANCE CORE', unk: 'HUMMING SEALED CYLINDER', fx: {}, effect: 'THE HEART OF THE ORRAN WEAPON THAT TORE THE RIFT. FIRED BACK INTO IT, IT CAN CLOSE IT.', story: true,
    lore: 'CHRONITON EMISSIONS OFF THE SCALE. THE ORRAN SCRIPT ON THE CASING READS: "TO UNMAKE A DEFEAT". IT WAS BUILT TO CHANGE THE PAST. IT CAN ALSO SEAL A WOUND IN IT.' },
];
// story items for THE LONG SLEEP
ART.push(
  { id: 'cryobay', name: 'COVENANT CRYO BAY 1', unk: 'CRYO MODULE', fx: {}, effect: 'SIX HUNDRED SLEEPERS FROM THE COVENANT, CUT AWAY AND STOLEN. TAKE THEM HOME.', story: true,
    lore: 'POD LABELS IN A FOUNDERS\' SCRIPT: FARMERS, TEACHERS, A GLASSBLOWER, TWO MIDWIVES. THE STASIS FLUID GAUGES READ WRONG.' },
  { id: 'stasis', name: 'BAY 1 STASIS FLUID', unk: 'CLOUDY STASIS FLUID SAMPLE', fx: {}, effect: 'WHAT WAS PUT INTO THE STOLEN SLEEPERS - IDENTIFY IT IN THE LAB.', story: true,
    lore: 'KESSARI WORK-GANG SEDATIVE IN A CLEAN GLYCOL BASE. IT KEEPS LABOURERS DOCILE FOR MONTHS AFTER THEY WAKE. IT CAN BE NEUTRALISED BEFORE REVIVAL.' },
);
export const ART_INDEX = Object.fromEntries(ART.map((a, i) => [a.id, i]));
export const MAX_ARTS = 12;
// which artefacts each kind of point of interest tends to hold (random pick)
export const POI_ARTS = [
  ['cryo', 'nanite'], ['cryo'], ['lens', 'primer', 'log', 'core', 'idol'], ['keel', 'nanite', 'coil', 'shard1', 'shard2', 'shard3'],
  ['shard1', 'shard2', 'shard3', 'nanite'], [], ['shard1', 'shard2', 'shard3', 'coil'], ['log', 'core', 'primer', 'idol', 'coil'],
];

// what each system's space holds (counts of points of interest by kind)
export const SYS_POIS = {
  kalos: [[PK_ASTEROID, 3], [PK_WRECK, 1], [PK_GAS, 1]],
  meridian: [[PK_ASTEROID, 6], [PK_CAPSULE, 1]],
  velanar: [[PK_ASTEROID, 2], [PK_CAPSULE, 1], [PK_WRECK, 1]],
  drift: [[PK_ASTEROID, 5], [PK_WRECK, 2], [PK_GAS, 1]],
  shroud: [[PK_WRECK, 4], [PK_DERELICT, 1], [PK_GAS, 2]],
  halcyon: [[PK_ASTEROID, 2], [PK_RUINS, 1], [PK_COMET, 1]],
  cerulean: [[PK_COMET, 4], [PK_RUINS, 2], [PK_SPIRE, 1]],
  orra: [[PK_WRECK, 2], [PK_ASTEROID, 2], [PK_DERELICT, 1]],
  chorus: [[PK_SPIRE, 4], [PK_RUINS, 2]],
};
// guaranteed finds: the three Chorus shards, one per system (by kind of point of interest)
export const SYS_FIXED_ART = { shroud: { [PK_DERELICT]: 'shard1' }, cerulean: { [PK_RUINS]: 'shard2' }, orra: { [PK_DERELICT]: 'shard3' } };
export const hazWord = (h) => (h > 0.25 ? 'HIGH' : h > 0.12 ? 'MODERATE' : 'LOW');
