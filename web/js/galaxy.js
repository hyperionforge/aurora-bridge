// ============================================================================
// galaxy.js - the star systems, their planets/belts/nebulae/stations, and
// the jump lanes between them. Shared by the host and every screen, so
// orbits are computed identically everywhere from the game clock.
// ============================================================================
import { C } from './config.js';

export const SYS_SIZE = 160000;           // every system is a square this big, star in the middle
export const SYS_C = SYS_SIZE / 2;
export const WELL_R = 22000;              // jump drive won't engage this close to the star

// who owns things (separate from friend/neutral/hostile attitude)
export const CIV_NONE = 0, CIV_FLEET = 1, CIV_COLONY = 2, CIV_VELORI = 3, CIV_KESSARI = 4, CIV_ORRAN = 5, CIV_CHORUS = 6;
export const CIV_NAME = ['', 'FLEET', 'COLONIST', 'VELORI', 'KESSARI', 'ORRAN', 'CHORUS'];
export const CIV_COL = [C.GREY_TXT, C.SKY, C.TAN, C.LILAC, C.RED, '#d2a03c', '#9ff0e6'];

// station kinds (drawn differently)
export const SK_STARBASE = 0, SK_OUTPOST = 1, SK_HUB = 2, SK_HAVEN = 3, SK_CITADEL = 4, SK_ARRAY = 5, SK_RELAY = 6, SK_MONOLITH = 7;
export const SK_NAME = ['STARBASE', 'MINING OUTPOST', 'TRADE HUB', 'PIRATE HAVEN', 'CITADEL', 'RESEARCH ARRAY', 'LISTENING POST', 'MONOLITH'];

// planet looks: c1 base, c2 bands; ring = gas giant rings
const P = (name, orbit, period, phase, r, c1, c2, extra = {}) => ({ name, orbit, period, phase, r, c1, c2, ...extra });

export const SYSTEMS = [
  {
    id: 'kalos', name: 'KALOS', gx: 150, gy: 300, star: { col: '#ffd76a', glow: '#ff9900', r: 5200, type: 'YELLOW STAR' },
    desc: 'HOME SYSTEM OF STARBASE 12. QUIET, WELL PATROLLED - MOSTLY.',
    planets: [
      P('THESS', 24000, 420, 0.6, 1700, '#a0a0aa', '#6e6e78'),
      P('VESPERA', 48000, 900, 2.4, 2700, '#4678c8', '#28a05a'),
      P('OKARA', 66000, 1500, 4.1, 4300, '#c88c46', '#965a32', { ring: true }),
    ],
    belts: [],
    nebulae: [{ name: 'KALOS NEBULA', x: 124000, y: 50000, r: 13000, col: '#5a2d82' }],
    stations: [{ name: 'STARBASE 12', kind: SK_STARBASE, civ: CIV_FLEET, x: 30000, y: 128000 }],
    lanes: ['meridian', 'velanar', 'halcyon'],
  },
  {
    id: 'meridian', name: 'MERIDIAN REACH', gx: 300, gy: 140, star: { col: '#ffb25e', glow: '#ff7a1e', r: 4300, type: 'ORANGE DWARF' },
    desc: 'A RICH ASTEROID BELT WORKED BY INDEPENDENT COLONISTS.',
    planets: [P('HOLLOWAY', 18000, 380, 1.0, 1400, '#9a7a62', '#6e5644'), P('MERIDIAN IV', 68000, 1700, 3.3, 2400, '#d8e8f0', '#9ab4c8')],
    belts: [{ orbit: 42000, width: 9000, n: 700, col: '#6e6458' }],
    nebulae: [],
    stations: [{ name: 'DEEP HOLLOW', kind: SK_OUTPOST, civ: CIV_COLONY, x: 52000, y: 52000 }],
    lanes: ['kalos', 'drift', 'shroud'],
  },
  {
    id: 'velanar', name: "VEL'ANAR", gx: 320, gy: 460, star: { col: '#fff4e0', glow: '#ffe0a0', r: 6000, type: 'WHITE STAR' },
    desc: 'THE VELORI MERCHANT GUILD TRADES HERE UNDER THE GLOW OF ISHVA.',
    planets: [P('SERAL', 26000, 520, 5.0, 1500, '#c8b48c', '#a08c6e'), P('ISHVA', 46000, 1300, 0.8, 6200, '#c8a0dc', '#8c64b4', { ring: true })],
    belts: [{ orbit: 64000, width: 6000, n: 400, col: '#5a5a6e' }],
    nebulae: [],
    stations: [{ name: 'THE LANTERN', kind: SK_HUB, civ: CIV_VELORI, x: 98000, y: 112000 }],
    lanes: ['kalos', 'cerulean', 'halcyon'],
  },
  {
    id: 'drift', name: 'KESSARI DRIFT', gx: 520, gy: 90, star: { col: '#ff6a4a', glow: '#c82814', r: 3600, type: 'RED DWARF' },
    desc: 'LAWLESS ROCKS AND CHOKING DUST. THE KESSARI CALL IT HOME.',
    planets: [P('CINDER', 50000, 1100, 2.0, 2000, '#7a3c2c', '#4a2218')],
    belts: [{ orbit: 30000, width: 12000, n: 1100, col: '#6e4a3c' }],
    nebulae: [{ name: 'RED DUST', x: 120000, y: 118000, r: 16000, col: '#6e2828' }],
    stations: [{ name: 'THE SPUR', kind: SK_HAVEN, civ: CIV_KESSARI, x: 112000, y: 46000 }],
    lanes: ['meridian', 'shroud'],
  },
  {
    id: 'shroud', name: 'THE SHROUD', gx: 560, gy: 240, star: { col: '#b4785a', glow: '#643c28', r: 3000, type: 'BROWN DWARF' },
    desc: 'A DARK NEBULA FULL OF WRECKS. SHIPS COME HERE TO HIDE - OR TO DIE.',
    planets: [P('ASHFALL', 40000, 1200, 4.4, 1800, '#504640', '#3a322c')],
    belts: [],
    nebulae: [
      { name: 'THE SHROUD', x: 64000, y: 92000, r: 34000, col: '#3c2850' },
      { name: 'THE SHROUD', x: 104000, y: 60000, r: 24000, col: '#3c2850' },
    ],
    stations: [{ name: 'OUTPOST NULL', kind: SK_RELAY, civ: CIV_NONE, x: 128000, y: 128000 }],
    lanes: ['meridian', 'drift', 'cerulean', 'orra'],
  },
  {
    id: 'halcyon', name: 'HALCYON', gx: 380, gy: 300, star: { col: '#bfe0ff', glow: '#6aa0ff', r: 4200, type: 'BINARY STARS', binary: true },
    desc: 'TWIN STARS AND THE FLEET\'S EPSILON RESEARCH ARRAY.',
    planets: [P('LUMEN', 44000, 800, 1.7, 2000, '#e0d0a0', '#b4a070'), P('TARREN', 68000, 1600, 5.6, 3000, '#5a8c6e', '#3c6450')],
    belts: [],
    nebulae: [],
    stations: [{ name: 'EPSILON ARRAY', kind: SK_ARRAY, civ: CIV_FLEET, x: 118000, y: 104000 }],
    lanes: ['kalos', 'velanar', 'orra'],
  },
  {
    id: 'cerulean', name: 'CERULEAN DEEP', gx: 560, gy: 450, star: { col: '#9ec8ff', glow: '#3c78ff', r: 6800, type: 'BLUE GIANT' },
    desc: 'ICE, COMETS AND THE BROKEN MOON OF A VANISHED CIVILISATION.',
    planets: [P('GLACIA', 56000, 1400, 2.9, 5200, '#a0dcff', '#64a0dc', { ring: true }), P('RIME', 70000, 2100, 0.4, 1600, '#e6f4ff', '#b4c8dc')],
    belts: [{ orbit: 30000, width: 6000, n: 500, col: '#8ca0b4' }],
    nebulae: [{ name: 'BLUE VEIL', x: 36000, y: 120000, r: 14000, col: '#283c78' }],
    stations: [],
    lanes: ['velanar', 'shroud', 'orra', 'atlas'],
  },
  {
    id: 'orra', name: 'ORRA PRIME', gx: 730, gy: 330, star: { col: '#ff8a5a', glow: '#c83c14', r: 8200, type: 'RED GIANT' },
    desc: 'THRONE WORLD OF THE ORRAN DOMINION. OUTSIDERS ARE TOLERATED, BARELY.',
    planets: [P('ORRA', 40000, 1000, 3.1, 3600, '#a0643c', '#6e3c1e'), P('KHEB', 68000, 1800, 0.9, 2200, '#8c8c64', '#646446')],
    belts: [],
    nebulae: [],
    stations: [{ name: 'BASTION OF ORR', kind: SK_CITADEL, civ: CIV_ORRAN, x: 46000, y: 118000 }],
    lanes: ['halcyon', 'shroud', 'cerulean', 'chorus'],
  },
  {
    id: 'chorus', name: 'THE SILENT CHOIR', gx: 900, gy: 220, star: { col: '#ffffff', glow: '#9ff0e6', r: 2400, type: 'WHITE DWARF' }, hidden: true,
    desc: 'NOT ON ANY FLEET CHART. SOMETHING HERE IS SINGING.',
    planets: [P('THE HOLLOW CROWN', 36000, 900, 1.2, 3000, '#9ff0e6', '#5ab4aa')],
    belts: [{ orbit: 60000, width: 5000, n: 600, col: '#5ab4aa' }],
    nebulae: [{ name: 'CRYSTAL VEIL', x: 110000, y: 110000, r: 18000, col: '#2c5a5a' }],
    stations: [{ name: 'THE MONOLITH', kind: SK_MONOLITH, civ: CIV_CHORUS, x: 80000, y: 116000 }],
    lanes: ['orra'],
  },
  {
    id: 'atlas', name: 'THE ATLAS', gx: 741, gy: 391, star: { col: '#e8f0ff', glow: '#7aa0ff', r: 3200, type: 'NEUTRON STAR' }, hidden: true,
    desc: 'ONE LANE BEYOND THE BLUE GIANT. THE CARTOGRAPHERS BUILT SOMETHING HERE.',
    planets: [P('THE SCAFFOLD', 30000, 700, 0.4, 2200, '#8c8c9a', '#5a5a6e')],
    belts: [{ orbit: 54000, width: 5000, n: 500, col: '#7a7a8c' }],
    nebulae: [{ name: 'THE INK', x: 122000, y: 40000, r: 15000, col: '#1e2c5a' }],
    stations: [{ name: 'THE ATLAS ENGINE', kind: SK_MONOLITH, civ: CIV_NONE, x: 110000, y: 106000 }],
    lanes: ['cerulean'],
  },
];
export const SYS_INDEX = Object.fromEntries(SYSTEMS.map((s, i) => [s.id, i]));
export const sysAt = (i) => SYSTEMS[i] || SYSTEMS[0];
export const lanesOf = (i) => sysAt(i).lanes.map((id) => SYS_INDEX[id]);

// planets crawl round their stars (slow enough that a ship can match them and orbit)
export const PERIOD_SCALE = 6;
// planet i of system s at game time t (seconds)
export function planetPos(s, i, t) {
  const p = s.planets[i];
  const a = p.phase + (t / (p.period * PERIOD_SCALE)) * Math.PI * 2;
  return [SYS_C + Math.cos(a) * p.orbit, SYS_C + Math.sin(a) * p.orbit];
}
// binary stars circle the centre
export function starPos(s, k, t) {
  if (!s.star.binary) return [SYS_C, SYS_C];
  const a = (t / 240) * Math.PI * 2 + k * Math.PI;
  return [SYS_C + Math.cos(a) * 7000, SYS_C + Math.sin(a) * 7000];
}
export function inNebulaOf(s, x, y) {
  for (const n of s.nebulae) if ((x - n.x) ** 2 + (y - n.y) ** 2 < n.r * n.r) return n;
  return null;
}
// deterministic belt dots for drawing
export function beltDots(s, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = Math.imul(i + 1, 2654435761) >>> 0, h2 = Math.imul(h ^ 0x5bd1e995, 1103515245) >>> 0;
    const a = (h % 62832) / 10000, r = b.orbit + ((h2 % 2000) / 1000 - 1) * b.width / 2;
    out.push(SYS_C + Math.cos(a) * r, SYS_C + Math.sin(a) * r);
  }
  return out;
}
