// ============================================================================
// config.js - shared constants (port of config.h + proto.h from the ESP32
// bridge simulator). Every balance number lives here.
// ============================================================================

// ---------------------------------------------------------------- colours
export const C = {
  BLACK: '#000000', WHITE: '#ffffff', ORANGE: '#ff9900', PEACH: '#ffcc99', TAN: '#ffaa64',
  LILAC: '#cc99cc', VIOLET: '#9999ff', SKY: '#99ccff', BLUE: '#5578e6', RED: '#e63737',
  RED_DIM: '#691c1c', YELLOW: '#ffcc00', GREEN: '#5acd6e', GREEN_DIM: '#1c5528', GREY: '#46464e',
  GREY_TXT: '#8c8c96', SEG_OFF: '#1c203e', GRID: '#1c2850', PANEL: '#0e101e',
};

// ---------------------------------------------------------------- states
export const GS_TITLE = 0, GS_RUN = 1, GS_WIN = 2, GS_LOST = 3;
export const AL_GREEN = 0, AL_YELLOW = 1, AL_RED = 2;

export const VM_FORWARD = 0, VM_TACTICAL = 1, VM_MAP = 2, VM_TARGET = 3, VM_COMMS = 4, VM_STATUS = 5, VM_LAB = 6, NUM_VM = 7;
export const VM_NAME = ['FORWARD', 'TACTICAL', 'SECTOR MAP', 'TARGET', 'COMMS', 'SHIP STATUS', 'SCIENCE LAB'];
export const VM_SHORT = ['FWD', 'TAC', 'MAP', 'TGT', 'COMMS', 'STATUS'];

export const S_IMPULSE = 0, S_WARP = 1, S_PHASERS = 2, S_TORPS = 3, S_SHIELDS = 4, S_SENSORS = 5, NSYS = 6;
export const SYS_NAME = ['IMPULSE', 'WARP', 'PHASERS', 'TORPEDOES', 'SHIELDS', 'SENSORS'];
export const SYS_SHORT = ['IMP', 'WRP', 'PHS', 'TRP', 'SHD', 'SEN'];

export const Q_FORE = 0, Q_AFT = 1, Q_PORT = 2, Q_STBD = 3;
export const QUAD_NAME = ['FORE', 'AFT', 'PORT', 'STBD'];
export const QUAD_SYS = [[S_SENSORS, S_PHASERS], [S_IMPULSE, S_WARP], [S_TORPS, S_TORPS], [S_SHIELDS, S_SHIELDS]];

export const F_FRIEND = 0, F_NEUTRAL = 1, F_HOSTILE = 2, F_UNKNOWN = 3;
export const FACTION_NAME = ['FRIENDLY', 'NEUTRAL', 'HOSTILE', 'UNKNOWN'];

export const CT_STARBASE = 0, CT_FREIGHTER = 1, CT_RAIDER = 2, CT_DESTROYER = 3, CT_ANOMALY = 4, CT_BUOY = 5, CT_POI = 6, CT_GROUND = 7;
export const CT_NAME = ['STARBASE', 'FREIGHTER', 'RAIDER', 'DESTROYER', 'ANOMALY', 'NAV BUOY', 'POINT OF INTEREST', 'SURFACE SITE'];

export const T_PHOTON = 0, T_QUANTUM = 1;
export const TORP_NAME = ['PHOTON', 'QUANTUM'];
export const TUBE_EMPTY = 0, TUBE_LOADING = 1, TUBE_LOADED = 2, TUBE_UNLOADING = 3;

export const RF_BAL = 0, RF_FORE = 1, RF_AFT = 2, RF_PORT = 3, RF_STBD = 4;
export const RF_NAME = ['BALANCED', 'FORE', 'AFT', 'PORT', 'STBD'];
export const SUB_HULL = 0, SUB_ENGINES = 1, SUB_WEAPONS = 2, SUB_SHIELDS = 3;
export const SUB_NAME = ['HULL', 'ENGINES', 'WEAPONS', 'SHIELDS'];
export const AP_OFF = 0, AP_WAYPOINT = 1, AP_TARGET = 2;
export const FREQ_CHAR = ['A', 'B', 'C', 'D', 'E'];
export const NO_ID = 255;
export const US = 254; // "our ship" as an owner / target id
export const HAZARD = 253; // owner of debris, missiles from the ground, asteroids: nobody's ship

// ---------------------------------------------------------------- world
export const SECTOR = 160000;     // size of one star system (see galaxy.js SYS_SIZE)
export const MAX_CONTACTS = 32;

// ---------------------------------------------------------------- flight
export const IMPULSE_MAX = 160, IMPULSE_TOP = 256, WARP_TOP = 6, WARP_SPEED = 900, WARP_MAX = 4, WARP_CHARGE_S = 3, TURN_RATE = 32, IMPULSE_ACCEL = 45;
export const DOCK_RANGE = 1800, DOCK_MAX_SPEED = 25, DOCK_TIME_S = 5;

// ---------------------------------------------------------------- energy / engineering
export const ENERGY_MAX = 1000, ENERGY_GEN = 9, POWER_MAX = 200, COOLANT_TOTAL = 8, COOLANT_MAX = 4;
export const HEAT_RATE = 10, COOL_PER_UNIT = 2.6, HEAT_DAMAGE = 3, REPAIR_RATE = 3, REPAIR_TEAMS = 2;

// ---------------------------------------------------------------- sensors
export const SENSOR_RANGE = 20000, SCAN_TIME_S = 5, LRS_TIME_S = 10, LRS_COST = 60;

// ---------------------------------------------------------------- weapons
export const PH_RANGE = 6000, PH_ARC = 135, PH_RECHARGE_S = 3, PH_DAMAGE = 10, PH_HIT = 0.9, FREQ_BONUS = 1.5;
export const TORP_LOAD_S = 9, TORP_UNLOAD_S = 3, TORP_SPEED = 900, TORP_LIFE_S = 18, TORP_TURN = 70;
export const TORP_DMG = [35, 60], TORP_START = [12, 4];
export const SHIELD_REGEN = 1.2, SHIELD_RAISE_S = 2;

// ---------------------------------------------------------------- events (sounds / flashes)
export const EV_NONE = 0, EV_PHASER_HIT = 1, EV_PHASER_MISS = 2, EV_TORP_LAUNCH = 3, EV_WE_HIT_SHIELD = 4, EV_WE_HIT_HULL = 5,
  EV_SYS_DAMAGED = 6, EV_ENEMY_DESTROYED = 7, EV_SCAN_DONE = 8, EV_MESSAGE = 9, EV_DOCKED = 10, EV_WARP_IN = 11,
  EV_OVERHEAT = 12, EV_TORP_HIT = 13, EV_ENEMY_MISSED = 14, EV_DENIED = 15, EV_WARP_ENGAGED = 16,
  EV_ALERT = 17, EV_VICTORY = 18, EV_DEFEAT = 19, EV_ORDER = 20, EV_JUMP = 21, EV_ARRIVE = 22, EV_FOUND = 23, EV_HAZARD = 24, EV_REFINED = 25;

// ---------------------------------------------------------------- messages
export const FROM_COMMAND = 250, FROM_COMPUTER = 251, FROM_CREW = 252;
export const OPT_DOCK = 1, OPT_STATUS = 2, OPT_HELP = 3, OPT_ASK = 4, OPT_SURRENDER = 5, OPT_WARN = 6, OPT_CLOSE = 7;
export const OPT_NAME = ['', 'REQUEST DOCKING', 'REQUEST STATUS', "WE'RE COMING TO HELP", 'HOW MANY ATTACKERS?',
  'DEMAND SURRENDER', 'WARN THEM OFF', 'CLOSE CHANNEL'];
export const MSG_COL = [C.WHITE, C.YELLOW, C.RED, C.GREEN];

// ---------------------------------------------------------------- commands (client -> host)
export const CMD = {
  START: 1, HEADING: 2, THROTTLE: 3, WARP: 4, STOP: 5, EVASIVE: 6, AUTOPILOT: 7, WAYPOINT: 8, DOCK: 9, VIEW: 10,
  SCAN: 11, LRS: 12, HAIL: 13, REPLY: 14, TARGET: 15, SUB: 16, FIRE_PH: 17, AUTOFIRE: 18, PH_FREQ: 19,
  TUBE_LOAD: 20, TUBE_UNLOAD: 21, TUBE_FIRE: 22, SHIELDS: 23, REINFORCE: 24, ALERT: 25, POWER: 26, COOLANT: 27,
  TEAM: 28, PRESET: 29, UNDOCK: 30, RESTART: 31, SELECT: 32, ORDER_ACK: 33, ORDER: 34, JUMP: 35, SAMPLE: 36, EXTRACT: 37, REFINE: 38, USE: 39, ANALYSE: 40, JETTISON: 41, DREPLY: 42, PLOT: 43, CAMP: 44, PD: 45, LAB: 46,
};

// ---------------------------------------------------------------- static world
export const PLANETS = [
  { name: 'VESPERA', x: 26000, y: 72000, r: 2600, c1: '#4678c8', c2: '#28a05a' },
  { name: 'OKARA', x: 82000, y: 34000, r: 4200, c1: '#c88c46', c2: '#965a32' },
  { name: 'THESS', x: 52000, y: 14000, r: 1600, c1: '#a0a0aa', c2: '#6e6e78' },
];
export const NEB_X = 66000, NEB_Y = 62000, NEB_R = 9000;
export const BASE_X = 18000, BASE_Y = 82000;
export const ANOM_X = 60000, ANOM_Y = 70000;
// contact slots: 0 = the system's main station, 1 = Kalos bonus anomaly, 2-5 more stations, 6+ ships and points of interest
export const ID_BASE = 0, ID_BONUS = 1, ID_STATION2 = 2, ID_FIRST_DYN = 6;

export const FREIGHTER_NAMES = ['MERIDIAN', 'HALCYON', 'ORINOCO', 'TALISMAN', 'WAYFARER', 'CALLISTO', 'BRIGHTWATER', 'SOLACE'];

// ---------------------------------------------------------------- missions
// game modes
export const MODE_MISSION = 0, MODE_SANDBOX = 1, MODE_CAMPAIGN = 2;
export const MODE_NAME = ['MISSION', 'SANDBOX', 'CAMPAIGN'];
export const MODES_READY = 3;   // modes offered in the lobby (campaign switched on when it's written)
export const MODE_DESC = [
  'ONE OF THE CLASSIC MISSIONS IN THE KALOS SYSTEM.',
  'AN OPEN-ENDED VOYAGE. ROAM THE STARS, ANSWER HAILS, TAKE CONTRACTS FROM STATIONS, SALVAGE WHAT YOU FIND. IT ENDS ONLY IF THE AURORA IS LOST.',
  'STORY CAMPAIGNS: PICK ONE BELOW. FIVE CHAPTERS EACH, AND YOUR CHOICES COME BACK TO YOU.',
];
// jump drive (between star systems)
export const JUMP_CHARGE_S = 10, JUMP_TRANSIT_S = 6, JUMP_COST = 150, JUMP_SAFE_R = 12000;
export const MT_RANDOM = 0, MT_DISTRESS = 1, MT_PATROL = 2, MT_HUNT = 3, MT_ESCORT = 4, MT_SURVEY = 5, MT_DEFEND = 6, MT_FIELD = 7, NUM_MT = 8;
export const MT_NAME = ['RANDOM', 'DISTRESS CALL', 'PATROL', 'HUNT', 'ESCORT', 'SURVEY', 'DEFEND STARBASE', 'ASTEROID FIELD'];
export const MT_DESC = [
  'A MISSION IS PICKED AT RANDOM. EVERY MISSION HAS RANDOM LOCATIONS, ENEMIES AND EVENTS.',
  'A DISTRESS BEACON HAS GONE OFF. FIND THE SHIP, IDENTIFY IT, AND DEAL WITH WHOEVER ATTACKED IT. EXPECT TROUBLE ON THE WAY HOME.',
  'VISIT AND SCAN THE NAV BUOYS ON THE PATROL ROUTE. KESSARI SHIPS HAVE BEEN SEEN NEAR ONE OF THEM.',
  'A KESSARI RAIDING GROUP IS HIDING IN THE SECTOR. SEARCH THE AREA (LONG RANGE SCANS HELP) AND DESTROY THEM.',
  'MEET A FREIGHTER AND ESCORT IT SAFELY TO STARBASE 12. RAIDERS WILL TRY TO STOP YOU. IF THE FREIGHTER IS LOST, THE MISSION FAILS.',
  'FULLY SCAN THE SUBSPACE ANOMALIES REPORTED IN THE SECTOR. THE KESSARI WANT THAT DATA TOO.',
  'KESSARI ATTACK WAVES ARE HEADING FOR STARBASE 12. HOLD THEM OFF. IF THE STARBASE FALLS, THE MISSION FAILS.',
  'FLY THE CHANNEL THROUGH A DENSE ASTEROID FIELD. HELM STEERS, TACTICAL SHOOTS LOOSE BOULDERS, SHIELDS TAKE THE HITS, SCIENCE SCANS THE BEACONS ON THE WAY.',
];
export const DIFF_NAME = ['CADET', 'OFFICER', 'CAPTAIN'];
export const MK_BEACON = 1, MK_AREA = 2, MK_POINT = 3, MK_RENDEZVOUS = 4;
export const MAX_MARKERS = 4;
export const FAIL_NONE = 0, FAIL_SHIP = 1, FAIL_FREIGHTER = 2, FAIL_STARBASE = 3;
export const FAIL_TEXT = ['', 'SHIP DESTROYED', 'FREIGHTER LOST', 'STARBASE DESTROYED'];
export const BONUS_TEXT = 'BONUS: SCAN THE SUBSPACE ANOMALY IN THE KALOS NEBULA (FULL SCAN)';
export const ST_RETURN = 90, ST_AMBUSH = 91, ST_DOCK = 92;

// ---------------------------------------------------------------- station tabs (phone consoles)
// Every console "tab" of the hardware build is one sub-station here. The
// game groups them into stations according to how many crew there are.
export const T_HELM = 0, T_NAV = 1, T_SCI = 2, T_COMMS = 3, T_TAC = 4, T_SHIELDS = 5, T_ENG = 6, T_DMG = 7, T_CAPTAIN = 8;
export const NUM_CORE = 9;           // every role must be filled, captain included
export const T_CAP_ORDERS = 9, T_CAP_HAILS = 10; // the captain's extra tabs (not roles of their own)
export const TAB_NAME = ['HELM', 'NAV', 'SCIENCE', 'COMMS', 'TACTICAL', 'SHIELDS', 'ENGINEER', 'DAMAGE', 'CAPTAIN'];
export const TAB_LABEL = [...TAB_NAME];
export const TAB_COL = [C.ORANGE, C.VIOLET, C.SKY, C.LILAC, C.RED, C.SKY, C.ORANGE, C.TAN, C.PEACH, C.ORANGE, C.LILAC];
export const TAB_DESC = [
  'STEER, WARP, DOCKING, AUTOPILOT, JUMP DRIVE',
  'SECTOR MAP, WAYPOINTS, GALAXY CHART, PLOTS JUMPS AND INTERCEPTS',
  'SENSORS, SCANS, LONG RANGE SCAN',
  'MESSAGES, HAILING, REPLIES',
  'TARGETING, PHASERS, TORPEDOES',
  'SHIELD QUARTERS, REINFORCE, ALERT',
  'POWER, HEAT, COOLANT',
  'DAMAGE CONTROL, REPAIR TEAMS',
  'SHIP STATUS, CONTACTS, FIRST OFFICER ADVICE',
];
// station layouts for 1-4 crew (the captain is extra and optional)
export const LAYOUTS = {
  1: [{ key: 'all', name: 'BRIDGE OFFICER', col: C.ORANGE, tabs: [0, 1, 2, 3, 4, 5, 6, 7] }],
  2: [
    { key: 'helmsci', name: 'HELM & SCIENCE', col: C.ORANGE, tabs: [0, 1, 2, 3] },
    { key: 'taceng', name: 'TACTICAL & ENGINEERING', col: C.RED, tabs: [4, 5, 6, 7] },
  ],
  3: [
    { key: 'conn', name: 'CONN', col: C.ORANGE, tabs: [0, 1, 3] },
    { key: 'tacsci', name: 'TACTICAL & SCIENCE', col: C.RED, tabs: [4, 5, 2] },
    { key: 'eng', name: 'ENGINEERING', col: C.TAN, tabs: [6, 7] },
  ],
  4: [
    { key: 'helm', name: 'HELM', col: C.ORANGE, tabs: [0, 1] },
    { key: 'sci', name: 'SCIENCE & COMMS', col: C.SKY, tabs: [2, 3] },
    { key: 'tac', name: 'TACTICAL', col: C.RED, tabs: [4, 5] },
    { key: 'eng', name: 'ENGINEERING', col: C.TAN, tabs: [6, 7] },
  ],
};
export const CAPTAIN_STATION = { key: 'captain', name: 'CAPTAIN', col: C.LILAC, tabs: [], captain: true,
  desc: 'STATUS AND FIRST OFFICER ADVICE, ORDERS TO EACH STATION, COMMS. OPTIONAL.' };
export const MAX_PLAYERS = 5;
// AUTO-ASSIGN: how the 8 roles are split between 1-5 players
export const AUTO_SPLIT = {
  1: [[8, 0, 1, 2, 3, 4, 5, 6, 7]],
  2: [[8, 0, 1, 2, 3], [4, 5, 6, 7]],
  3: [[8, 0, 1, 3], [4, 5, 2], [6, 7]],
  4: [[8, 0, 1], [2, 3], [4, 5], [6, 7]],
  5: [[8, 3], [0, 1], [2], [4, 5], [6, 7]],
};
export const PLAYER_COL = [C.ORANGE, C.SKY, C.LILAC, C.GREEN, C.TAN];

// ---------------------------------------------------------------- captain's orders
export const OS_HELM = 0, OS_SCI = 1, OS_TAC = 2, OS_ENG = 3;
export const OS_NAME = ['HELM', 'SCIENCE', 'TACTICAL', 'ENGINEERING'];
export const SUBJ_NONE = 0, SUBJ_CONTACT = 1, SUBJ_SYSTEM = 2, SUBJ_QUAD = 3;
// tab = the sub-station whose controls carry the order out (it goes to whoever holds that tab)
export const ORDERS = [
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'SET COURSE FOR WAYPOINT' },
  { st: OS_HELM, subj: SUBJ_CONTACT, tab: T_HELM, label: 'INTERCEPT %s' },
  { st: OS_HELM, subj: SUBJ_CONTACT, tab: T_HELM, label: 'BRING US ABOUT TO %s' },
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'EVASIVE MANOEUVRES' },
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'AHEAD FULL' },
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'ALL STOP' },
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'ENGAGE WARP' },
  { st: OS_HELM, subj: SUBJ_NONE, tab: T_HELM, label: 'DOCK AT THE STATION' },
  { st: OS_SCI, subj: SUBJ_CONTACT, tab: T_SCI, label: 'SCAN %s' },
  { st: OS_SCI, subj: SUBJ_CONTACT, tab: T_SCI, label: 'FULL SCAN OF %s' },
  { st: OS_SCI, subj: SUBJ_NONE, tab: T_SCI, label: 'LONG RANGE SCAN' },
  { st: OS_SCI, subj: SUBJ_CONTACT, tab: T_COMMS, label: 'HAIL %s' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_SHIELDS, label: 'RAISE SHIELDS' },
  { st: OS_TAC, subj: SUBJ_CONTACT, tab: T_TAC, label: 'TARGET %s' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_TAC, label: 'FIRE AT WILL' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_TAC, label: 'HOLD FIRE' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_TAC, label: 'FIRE TORPEDOES' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_TAC, label: 'AIM FOR THEIR ENGINES' },
  { st: OS_TAC, subj: SUBJ_NONE, tab: T_TAC, label: 'AIM FOR THEIR WEAPONS' },
  { st: OS_TAC, subj: SUBJ_QUAD, tab: T_SHIELDS, label: 'REINFORCE %s SHIELDS' },
  { st: OS_ENG, subj: SUBJ_NONE, tab: T_ENG, label: 'POWER TO WEAPONS' },
  { st: OS_ENG, subj: SUBJ_NONE, tab: T_ENG, label: 'POWER TO SHIELDS' },
  { st: OS_ENG, subj: SUBJ_NONE, tab: T_ENG, label: 'POWER TO ENGINES' },
  { st: OS_ENG, subj: SUBJ_NONE, tab: T_ENG, label: 'BALANCE POWER' },
  { st: OS_ENG, subj: SUBJ_NONE, tab: T_ENG, label: 'CONSERVE ENERGY' },
  { st: OS_ENG, subj: SUBJ_SYSTEM, tab: T_DMG, label: 'REPAIR %s FIRST' },
  { st: OS_ENG, subj: SUBJ_SYSTEM, tab: T_ENG, label: 'COOL DOWN %s' },
];
export const O_COURSE = 0, O_INTERCEPT = 1, O_FACE = 2, O_EVASIVE = 3, O_AHEAD = 4, O_STOP = 5, O_WARP = 6, O_DOCK = 7,
  O_SCAN = 8, O_FULLSCAN = 9, O_LRS = 10, O_HAIL = 11, O_SHIELDS = 12, O_TARGET = 13, O_FIRE = 14, O_HOLD = 15,
  O_TORPS = 16, O_AIM_ENG = 17, O_AIM_WPN = 18, O_REINF = 19, O_PWR_WPN = 20, O_PWR_SHD = 21, O_PWR_ENG = 22,
  O_PWR_BAL = 23, O_PWR_SAVE = 24, O_REPAIR = 25, O_COOL = 26, NUM_ORDERS = 27;
export const ORD_SENT = 1, ORD_ACK = 2, ORD_DONE = 3, ORD_STALE = 4, ORD_REPLACED = 5;
export const ORD_STATUS = ['', 'SENT', 'ACKNOWLEDGED', 'DONE', 'NOT DONE', 'REPLACED'];
export const ORDER_TIMEOUT_S = 60;
