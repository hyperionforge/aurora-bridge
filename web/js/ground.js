// ============================================================================
// ground.js - places on planets' surfaces you can call from orbit. Each planet
// in galaxy.js may list ground sites; they become CT_GROUND contacts that ride
// along with their planet, can be scanned, hailed (only from a standard orbit),
// and targeted. Also the small conversations the generic sites have.
// Installed onto Sim.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS, tradeOpt } from './dialogue.js';
import { GROUND_SEEN_K } from './orbit.js';
import { planetPos, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN } from './galaxy.js';
const { NO_ID, F_FRIEND, F_NEUTRAL, CT_GROUND, FROM_CREW } = K;

// which planets have someone to talk to (by system id -> planet name -> sites)
export const GROUND = {
  kalos: { VESPERA: [{ name: 'VESPERA COLONY', civ: CIV_COLONY, talk: 'g_colony', ga: 0.7 }, { name: 'VESPERA WEATHER STATION', civ: CIV_COLONY, talk: 'g_weather', ga: 3.4 }] },
  meridian: { HOLLOWAY: [{ name: 'HOLLOWAY DEEP MINES', civ: CIV_COLONY, talk: 'g_mine', ga: 1.9 }] },
  velanar: { SERAL: [{ name: 'SERAL GARDENS', civ: CIV_VELORI, talk: 'g_gardens', ga: 4.4 }] },
  drift: { CINDER: [{ name: 'CINDER DEN', civ: CIV_KESSARI, talk: 'g_den', ga: 2.2 }] },
  orra: { ORRA: [{ name: 'THE HALL OF ORR', civ: CIV_ORRAN, talk: 'g_hall', ga: 5.2 }] },
  cerulean: { RIME: [{ name: 'RIME SETTLEMENT', civ: CIV_COLONY, talk: 'g_rime', ga: 0.3 }] },
  halcyon: { TARREN: [{ name: 'TARREN (PRE-WARP)', civ: 0, talk: null, ga: 2.8, prewarp: true }] },
};

Object.assign(CHARS, {
  vadmin: { name: 'ADMINISTRATOR PELL', role: 'VESPERA COLONY', civ: CIV_COLONY, look: { skin: '#c8a078', hair: '#5a3c28', uniform: '#3c6e8c' } },
  wx: { name: 'METEOROLOGIST AMA DOVE', role: 'VESPERA WEATHER STATION', civ: CIV_COLONY, look: { skin: '#6e4632', hair: '#141414', uniform: '#78a0b4', glasses: true } },
  miner: { name: 'SHIFT BOSS KOLL', role: 'HOLLOWAY DEEP MINES', civ: CIV_COLONY, look: { skin: '#e6c3a0', hair: '#b46e3c', uniform: '#7a643c', beard: true } },
  gardener: { name: 'TENDER IVELLE', role: 'SERAL GARDENS', civ: CIV_VELORI, look: 'velori' },
  den: { name: 'DEN-MOTHER SKARRA', role: 'CINDER DEN', civ: CIV_KESSARI, look: 'kessari' },
  hall: { name: 'CHAMBERLAIN OF THE HALL', role: 'THE HALL OF ORR', civ: CIV_ORRAN, look: 'orran' },
  rimer: { name: 'SPEAKER HALVARD', role: 'RIME SETTLEMENT', civ: CIV_COLONY, look: { skin: '#f0d2b4', hair: '#e6e6e6', uniform: '#8ca0b4', beard: true } },
});

const back = { t: 'CLOSE CHANNEL' };
Object.assign(DIALOGS, {
  g_colony: { who: 'vadmin', nodes: {
    start: { say: 'VESPERA COLONY. NICE TO SEE A FLEET SHIP IN ORBIT, AURORA - KEEPS THE KESSARI HONEST. WHAT CAN WE DO FOR YOU?',
      opts: [{ t: 'TRADE', go: 'trade' }, { t: 'HEARD ANYTHING ODD?', do: (s) => { s.say(s.dlg.from, 3, s.rumour()); return 'start'; } }, back] },
    trade: { say: 'WE GROW FOOD AND MAKE THINGS. WE ALWAYS NEED ALLOY.',
      opts: [tradeOpt('3 ALLOY FOR 2 HULL PLATING', [[G.R_ALLOY, 3]], [[G.R_PLATING, 2]], 'TRADE DONE: 3 ALLOY FOR 2 HULL PLATING.', 'trade'),
        tradeOpt('2 ALLOY FOR 3 SPARE PARTS', [[G.R_ALLOY, 2]], [[G.R_SPARES, 3]], 'TRADE DONE: 2 ALLOY FOR 3 SPARE PARTS.', 'trade'), { t: 'THAT\'S ALL', go: 'start' }] },
  } },
  g_weather: { who: 'wx', nodes: {
    start: { say: 'WEATHER STATION. IF YOU\'RE IN ORBIT, YOU\'RE IN MY WAY - YOUR SHADOW IS ON MY SENSORS. KIDDING. WHAT DO YOU NEED?',
      opts: [{ t: 'WHAT DO YOU SEE FROM DOWN THERE?', go: 'see' }, back] },
    see: { say: 'STORMS. AND SOMETIMES SHIPS RUNNING DARK PAST THE NEBULA. KESSARI, I THINK. THEY NEVER STAY LONG ENOUGH TO TAG.', opts: [back] },
  } },
  g_mine: { who: 'miner', nodes: {
    start: { say: 'HOLLOWAY DEEP. TWO KILOMETRES DOWN AND STILL DIGGING. WANT ORE? WE\'VE GOT ORE.',
      opts: [tradeOpt('3 ICE FOR 8 ORE', [[G.R_ICE, 3]], [[G.R_ORE, 8]], 'TRADE DONE: 3 ICE FOR 8 ORE.'), tradeOpt('2 PLASMA FOR 2 CRYSTAL', [[G.R_PLASMA, 2]], [[G.R_CRYSTAL, 2]], 'TRADE DONE: 2 PLASMA FOR 2 CRYSTAL.'), back] },
  } },
  g_gardens: { who: 'gardener', nodes: {
    start: { say: 'THE {GARDENS} WELCOME THE QUIET SHIP. YOU ARE QUIET, AREN\'T YOU? WE GROW LAMP-FLOWERS HERE. THEY DISLIKE SHOUTING.',
      opts: [tradeOpt('2 EXOTIC MATTER FOR 3 CRYSTAL', [[G.R_EXOTIC, 2]], [[G.R_CRYSTAL, 3]], 'TRADE DONE: 2 EXOTIC FOR 3 CRYSTAL.'), back] },
  } },
  g_den: { who: 'den', nodes: {
    start: { say: (s) => (s.rep[CIV_KESSARI] >= 0 ? 'A FLEET SHIP IN MY SKY, AND IT ASKS FIRST? THE DEN WILL TALK. BRIEFLY.' : 'FLEET. YOU HAVE KILLED MY CHILDREN\'S CHILDREN. SPEAK AND GO.'),
      opts: [tradeOpt('3 ALLOY FOR 2 PHOTON TORPEDOES', [[G.R_ALLOY, 3]], [['photon', 2]], 'TRADE DONE: 3 ALLOY FOR 2 PHOTON TORPEDOES.'), back] },
  } },
  g_hall: { who: 'hall', nodes: {
    start: { say: 'THE HALL OF ORR DOES NOT TAKE CALLS FROM ORBIT, OUTSIDER. ...BUT IT HEARS THEM. SPEAK.',
      opts: [{ t: 'WE COME IN PEACE', do: (s) => { s.repAdd(CIV_ORRAN, 2); s.say(s.dlg.from, 3, 'EVERYONE SAYS THAT. FEW MEAN IT. WE SHALL SEE.'); return null; } }, back] },
  } },
  g_rime: { who: 'rimer', nodes: {
    start: { say: 'RIME SETTLEMENT. WE CAME HERE TO BE LEFT ALONE, FLEET - AND WE ARE GLAD TO BE. IS THERE SOMETHING YOU NEED?',
      opts: [tradeOpt('2 SPARE PARTS FOR 5 ICE', [[G.R_SPARES, 2]], [[G.R_ICE, 5]], 'TRADE DONE: 2 SPARES FOR 5 ICE.'), back] },
  } },
});

export function installGround(Sim) {
  Object.assign(Sim.prototype, {
    // spawn the surface sites of the current system (called from loadSystem)
    spawnGround() {
      const sd = this.sysDef, spec = GROUND[sd.id] || {};
      sd.planets.forEach((pl, i) => {
        for (const site of spec[pl.name] || []) this.addGround(i, site);
      });
    },
    addGround(pl, site) {
      const id = this.freeSlot();
      if (id === NO_ID) return NO_ID;
      this.spawnNpc(id, CT_GROUND, site.hostile ? K.F_HOSTILE : site.civ ? F_FRIEND : F_NEUTRAL, 0, 0, 0);
      const n = this.npc[id];
      Object.assign(n, { name: site.name, short: site.short || site.name, civ: site.civ || 0, talk: site.talk || null, talkCtx: {}, pl, ga: site.ga || 0, scan: 2, ai: 0, shMax: 0, shields: 0, hull: 100, armor: 0.5, prewarp: !!site.prewarp });
      this.groundPlace(n);
      return id;
    },
    groundPlace(n) { // a ground site sits just inside its planet's limb, riding along with it
      const pl = this.sysDef.planets[n.pl]; if (!pl) return;
      const [px, py] = planetPos(this.sysDef, n.pl, this.now / 1000);
      n.x = px + Math.cos(n.ga) * pl.r * 0.85; n.y = py + Math.sin(n.ga) * pl.r * 0.85; n.speed = 0;
    },
    // a ground site can be seen while we're in its planet's gravity well
    groundVisible(n) { // seen when we're close to its planet
      const pl = this.sysDef.planets[n.pl]; if (!pl) return false;
      const [px, py] = planetPos(this.sysDef, n.pl, this.now / 1000);
      return this.P.orbitPl === n.pl || Math.hypot(this.P.x - px, this.P.y - py) < pl.r * GROUND_SEEN_K;
    },
    groundHail(n) { // true = handled (refused)
      const pl = this.sysDef.planets[n.pl];
      if (n.prewarp) { this.say(FROM_CREW, 1, `${pl.name} IS A PRE-WARP WORLD, CAPTAIN. WE DON'T CALL THEM. WE'RE NOT EVEN HERE.`); return true; }
      if (this.P.orbitPl !== n.pl) { this.denied(`WE NEED A STANDARD ORBIT OF ${pl.name} FOR A CHANNEL TO THE SURFACE - NAV: PLOT IT, HELM: AUTOPILOT > ORBIT.`); return true; }
      return false;
    },
  });
}
