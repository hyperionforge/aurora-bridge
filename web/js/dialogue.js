// ============================================================================
// dialogue.js - who talks, and what they say.
// A dialogue is a set of nodes. Each node has `say` (text, or fn(sim, ctx))
// and `opts` [{ t: label, if?: fn, do?: fn -> node key | null, go?: key }].
// The host runs them (sim.startDialog / sim.dialogReply); the screens only
// see the current line, the speaker and the option labels.
// Text in {braces} is too alien to translate: shown as glyphs, subtitled [...].
// ============================================================================
import { CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_CHORUS, CIV_NONE } from './galaxy.js';
import * as G from './cargo.js';

// ---------------------------------------------------------------- the cast
// look: portrait parameters for the screens (skin, hair, eyes, extra)
export const CHARS = {
  computer: { name: 'SHIP\'S COMPUTER', civ: CIV_NONE, look: 'computer' },
  hale: { name: 'CDR. ANDREA HALE', role: 'STARBASE 12 OPERATIONS', civ: CIV_FLEET, look: { skin: '#c8966e', hair: '#3c2814', uniform: '#c83c28' } },
  voss: { name: 'ADMIRAL TESSA VOSS', role: 'FLEET COMMAND', civ: CIV_FLEET, look: { skin: '#e6c3a0', hair: '#dcdcdc', uniform: '#c83c28', pips: 4 } },
  marrin: { name: 'DR. ILYA MARRIN', role: 'EPSILON ARRAY', civ: CIV_FLEET, look: { skin: '#8c6446', hair: '#141414', uniform: '#2878c8', glasses: true } },
  okafor: { name: 'FOREMAN BREN OKAFOR', role: 'DEEP HOLLOW MINING COLLECTIVE', civ: CIV_COLONY, look: { skin: '#5a3c28', hair: '#646464', uniform: '#8c6e3c', beard: true } },
  lin: { name: 'CAPTAIN JUN LIN', role: 'FREIGHTER MERIDIAN STAR', civ: CIV_COLONY, look: { skin: '#e6c8a0', hair: '#1e1e1e', uniform: '#3c6450' } },
  ysolde: { name: 'FACTOR YSOLDE ITHANI', role: 'VELORI MERCHANT GUILD', civ: CIV_VELORI, look: 'velori' },
  silk: { name: '"SILK"', role: 'INDEPENDENT TRADER', civ: CIV_NONE, look: { skin: '#b4825a', hair: '#781e3c', uniform: '#28282e', scar: true } },
  draal: { name: 'MAREK DRAAL', role: 'WARLORD OF THE KESSARI', civ: CIV_KESSARI, look: 'kessari', chief: true },
  kessari: { name: 'KESSARI RAIDER CAPTAIN', role: 'KESSARI RAIDING PARTY', civ: CIV_KESSARI, look: 'kessari' },
  spur: { name: 'GATEKEEPER VASH', role: 'THE SPUR', civ: CIV_KESSARI, look: 'kessari' },
  korvath: { name: 'WARDEN KORVATH OF ORR', role: 'BASTION OF ORR', civ: CIV_ORRAN, look: 'orran', chief: true },
  orran: { name: 'ORRAN PATROL COMMANDER', role: 'ORRAN DOMINION', civ: CIV_ORRAN, look: 'orran' },
  relay: { name: 'AUTOMATED RECORDING', role: 'OUTPOST NULL', civ: CIV_NONE, look: 'computer' },
  chorus: { name: 'THE CHORUS', role: '', civ: CIV_CHORUS, look: 'chorus' },
};
// languages the computer has to translate (anything else is spoken plainly)
export const ALIEN = new Set([CIV_VELORI, CIV_KESSARI, CIV_ORRAN, CIV_CHORUS]);

// ---------------------------------------------------------------- helpers used by the trees
const has = (s, r, n) => s.P.cargo[r] >= n;
const trade = (s, give, get, line) => { // give/get: [[res, n]...] - 'photon'/'quantum' allowed in get
  for (const [r, n] of give) s.P.cargo[r] -= n;
  for (const [r, n] of get) { if (r === 'photon') s.P.torps[0] += n; else if (r === 'quantum') s.P.torps[1] += n; else s.P.cargo[r] += n; }
  s.say(s.FROM_CREW, 3, line);
};
const canGive = (s, give) => give.every(([r, n]) => has(s, r, n));
const tradeOpt = (label, give, get, line, after = 'start') => ({
  t: label, if: (s) => canGive(s, give), do: (s) => { trade(s, give, get, line); return after; },
});
const rumour = (s) => s.rumour();

// ---------------------------------------------------------------- station conversations
export const DIALOGS = {
  // Fleet starbase
  starbase: {
    who: 'hale',
    nodes: {
      start: { say: (s) => (s.P.dock === 2 ? 'WELCOME ABOARD, AURORA. REPAIR CREWS ARE ALREADY ON YOUR HULL. WHAT ELSE DO YOU NEED?'
        : `STARBASE 12 OPERATIONS, AURORA. GOOD TO HEAR YOUR VOICE.${s.M.type ? '' : ' WHAT CAN WE DO FOR YOU?'}`),
        opts: [
          { t: 'REQUEST DOCKING', do: (s) => { s.sayAs('hale', 'CLEARANCE GRANTED. UNDER 25 KM/S, SHIELDS DOWN, WITHIN 1.8K - THEN DOCK.'); return null; } },
          { t: 'ANY WORK FOR US?', if: (s) => s.mode !== 0, do: (s) => s.contractOffer() },
          { t: 'ANY NEWS?', go: 'news' },
          { t: 'CURRENT ORDERS', if: (s) => s.mode === 0, do: (s) => { s.sayAs('hale', 'ORDERS: ' + s.M.objective); return null; } },
          { t: 'CLOSE CHANNEL' },
        ] },
      news: { say: rumour, opts: [{ t: 'THANKS, COMMANDER.', go: 'start' }, { t: 'CLOSE CHANNEL' }] },
    },
  },
  // colonist mining outpost
  outpost: {
    who: 'okafor',
    nodes: {
      start: { say: (s) => (s.rep[CIV_COLONY] > 30 ? 'AURORA! THE COLLECTIVE REMEMBERS WHAT YOU DID FOR US. COME, TRADE, REST.'
        : 'DEEP HOLLOW HERE. WE DIG ROCK AND MIND OUR OWN BUSINESS. YOU BUYING OR SELLING?'),
        opts: [
          { t: 'TRADE', go: 'trade' },
          { t: 'ANY WORK FOR US?', if: (s) => s.mode !== 0, do: (s) => s.contractOffer() },
          { t: 'HEARD ANYTHING ODD?', go: 'news' },
          { t: 'CLOSE CHANNEL' },
        ] },
      trade: { say: 'WATER IS WHAT WE NEED. ICE BUYS YOU PARTS, AND PLENTY OF ORE.',
        opts: [
          tradeOpt('4 ICE FOR 3 SPARE PARTS', [[G.R_ICE, 4]], [[G.R_SPARES, 3]], 'TRADE DONE: 4 ICE FOR 3 SPARE PARTS.', 'trade'),
          tradeOpt('2 ICE FOR 6 ORE', [[G.R_ICE, 2]], [[G.R_ORE, 6]], 'TRADE DONE: 2 ICE FOR 6 ORE.', 'trade'),
          tradeOpt('3 PLASMA FOR 2 PLATING', [[G.R_PLASMA, 3]], [[G.R_PLATING, 2]], 'TRADE DONE: 3 PLASMA FOR 2 HULL PLATING.', 'trade'),
          { t: 'THAT\'S ALL', go: 'start' },
        ] },
      news: { say: rumour, opts: [{ t: 'THANKS, FOREMAN.', go: 'start' }, { t: 'CLOSE CHANNEL' }] },
    },
  },
  // Velori trade hub
  hub: {
    who: 'ysolde',
    nodes: {
      start: { say: (s) => (s.rep[CIV_VELORI] > 30 ? 'FRIEND AURORA. THE LANTERN BURNS BRIGHTER FOR YOUR COMING. THE GUILD HAS SET ASIDE ITS BEST FOR YOU.'
        : 'THE LANTERN WELCOMES ALL WHO TRADE FAIRLY. THE GUILD WATCHES THOSE WHO DO NOT. WHAT DO YOU OFFER, OUTWORLDER?'),
        opts: [
          { t: 'SHOW US YOUR GOODS', go: 'trade' },
          { t: 'ANY WORK FOR US?', if: (s) => s.mode !== 0, do: (s) => s.contractOffer() },
          { t: 'TELL US ABOUT THE SONG', go: 'song' },
          { t: 'CLOSE CHANNEL' },
        ] },
      trade: { say: 'CRYSTAL AND EXOTIC MATTER, THAT IS WHAT THE GUILD PRIZES. IN RETURN: ORDNANCE, CELLS, PARTS.',
        opts: [
          tradeOpt('3 CRYSTAL FOR 2 QUANTUM TORPEDOES', [[G.R_CRYSTAL, 3]], [['quantum', 2]], 'TRADE DONE: 2 QUANTUM TORPEDOES ARE IN THE MAGAZINE.', 'trade'),
          tradeOpt('2 EXOTIC FOR 4 ANTIMATTER CELLS', [[G.R_EXOTIC, 2]], [[G.R_CELL, 4]], 'TRADE DONE: 4 ANTIMATTER CELLS.', 'trade'),
          tradeOpt('5 ORE FOR 3 PHOTON TORPEDOES', [[G.R_ORE, 5]], [['photon', 3]], 'TRADE DONE: 3 PHOTON TORPEDOES.', 'trade'),
          { t: 'BUY THE RESONANCE COIL (6 ALLOY + 2 EXOTIC)', if: (s) => canGive(s, [[G.R_ALLOY, 6], [G.R_EXOTIC, 2]]) && !s.foundArts.has('coil'),
            do: (s) => { trade(s, [[G.R_ALLOY, 6], [G.R_EXOTIC, 2]], [], 'THE GUILD HANDS OVER A HUMMING METAL COIL.'); s.addArt('coil', 1); s.repAdd(CIV_VELORI, 5); return 'trade'; } },
          { t: 'NOTHING MORE', go: 'start' },
        ] },
      song: { say: (s) => (s.revealed.has(8) ? 'YOU HAVE FOUND THE CHOIR\'S ROAD. THEN YOU KNOW MORE THAN THE GUILD. BE CAREFUL WHAT YOU ANSWER.'
        : 'SOME NIGHTS THE CRYSTAL IN OUR LAMPS {HUMS A NAME}. THE OLD ONES CALL THEM THE CHORUS. THREE SINGING SHARDS ARE SAID TO SHOW THE ROAD: ONE IN THE SHROUD, ONE IN THE COLD DEEP, ONE UNDER ORRAN GUNS.'),
        opts: [{ t: 'THANK YOU, FACTOR.', do: (s) => { s.repAdd(CIV_VELORI, 2); return 'start'; } }, { t: 'CLOSE CHANNEL' }] },
    },
  },
  // Kessari pirate haven
  haven: {
    who: 'spur',
    nodes: {
      start: { say: (s) => (s.rep[CIV_KESSARI] >= 20 ? 'THE FLEET DOG WHO PAYS ITS DUES. SPEAK, AND MAKE IT WORTH MY TIME.'
        : 'THIS IS THE SPUR. FLEET SHIPS DIE HERE. GIVE ME ONE REASON NOT TO OPEN FIRE.'),
        opts: [
          { t: 'WE WANT TO TRADE', go: 'trade' },
          { t: 'WE BRING DRAAL\'S IDOL BACK', if: (s) => s.hasArt('idol'), do: (s) => { s.removeArt('idol'); s.repAdd(CIV_KESSARI, 40); s.sayAs('spur', 'THE WARLORD\'S IDOL! THE SPUR OWES YOU, FLEET. WE WILL NOT SHOOT TODAY.'); return null; } },
          { t: 'STAND DOWN OR WE OPEN FIRE', do: (s) => { s.repAdd(CIV_KESSARI, -10); s.sayAs('spur', 'BRAVE WORDS FROM A SMALL SHIP. COME AND TRY.'); return null; } },
          { t: 'CLOSE CHANNEL' },
        ] },
      trade: { say: (s) => (s.rep[CIV_KESSARI] >= 0 ? 'BLACK MARKET RATES. NO QUESTIONS.' : 'TRADE? WITH YOU? PAY THE TOLL FIRST: 4 ALLOY, AND WE TALK.'),
        opts: [
          { t: 'PAY THE TOLL (4 ALLOY)', if: (s) => s.rep[CIV_KESSARI] < 0 && has(s, G.R_ALLOY, 4),
            do: (s) => { s.P.cargo[G.R_ALLOY] -= 4; s.repAdd(CIV_KESSARI, 25); return 'trade'; } },
          { ...tradeOpt('4 PLASMA FOR 3 PHOTON TORPEDOES', [[G.R_PLASMA, 4]], [['photon', 3]], 'THE KESSARI DROP OFF 3 PHOTON TORPEDOES.', 'trade'), if: (s) => s.rep[CIV_KESSARI] >= 0 && has(s, G.R_PLASMA, 4) },
          { ...tradeOpt('3 CRYSTAL FOR 5 SPARE PARTS', [[G.R_CRYSTAL, 3]], [[G.R_SPARES, 5]], 'A CRATE OF STOLEN FLEET SPARES. THE SERIAL NUMBERS ARE FILED OFF.', 'trade'), if: (s) => s.rep[CIV_KESSARI] >= 0 && has(s, G.R_CRYSTAL, 3) },
          { t: 'FORGET IT', go: 'start' },
        ] },
    },
  },
  // Orran citadel
  citadel: {
    who: 'korvath',
    nodes: {
      start: { say: (s) => (s.rep[CIV_ORRAN] >= 30 ? 'THE AURORA. YOUR NAME IS SPOKEN IN THE HALL OF ORR. YOU MAY APPROACH.'
        : s.rep[CIV_ORRAN] < -30 ? 'YOU HAVE NO HONOUR LEFT TO SPEND HERE, OUTSIDER. LEAVE ORRAN SPACE.'
          : 'YOU STAND BEFORE THE BASTION OF ORR. STATE YOUR PURPOSE, OUTSIDER, AND STATE IT PLAINLY.'),
        opts: [
          { t: 'WE COME IN PEACE', if: (s) => !s.flags.orranGreeted, do: (s) => { s.flags.orranGreeted = true; s.repAdd(CIV_ORRAN, 8); s.sayAs('korvath', 'PEACE IS A WORD. WE WILL WATCH WHAT YOU DO.'); return 'start'; } },
          { t: 'ANY WORK FOR US?', if: (s) => s.mode !== 0 && s.rep[CIV_ORRAN] > -30, do: (s) => s.contractOffer() },
          { t: 'WHAT DO YOU KNOW OF THE SONG?', go: 'song' },
          { t: 'WE CHALLENGE YOUR CHAMPION', if: (s) => !s.flags.orranDuel && s.rep[CIV_ORRAN] > -30, go: 'duel' },
          { t: 'CLOSE CHANNEL' },
        ] },
      song: { say: 'THE SONG IS OLDER THAN ORR. OUR GRANDFATHERS SEALED ITS DOOR AND TOLD NO ONE. SOME DOORS SHOULD STAY SHUT, OUTSIDER.',
        opts: [{ t: 'WE UNDERSTAND', do: (s) => { s.repAdd(CIV_ORRAN, 3); return 'start'; } }, { t: 'CLOSE CHANNEL' }] },
      duel: { say: 'HA! THE OUTSIDER HAS TEETH. VERY WELL. MY CHAMPION WILL MEET YOU BEYOND THE BASTION. FIGHT WELL - OR DIE WELL.',
        opts: [
          { t: 'WE ACCEPT', do: (s) => { s.orranDuel(); return null; } },
          { t: 'ON SECOND THOUGHT...', do: (s) => { s.repAdd(CIV_ORRAN, -5); s.sayAs('korvath', 'AS I THOUGHT. ALL TEETH AND NO BITE.'); return null; } },
        ] },
    },
  },
  // Fleet research array
  array: {
    who: 'marrin',
    nodes: {
      start: { say: (s) => `EPSILON ARRAY, MARRIN HERE. ${s.P.arts.length ? 'YOU\'VE BEEN COLLECTING, I SEE. CARE TO SHARE?' : 'BRING ME SOMETHING INTERESTING, AURORA. ANYTHING.'}`,
        opts: [
          { t: 'ANALYSE OUR ARTEFACTS', if: (s) => s.P.arts.some((h) => h.ident < 2), do: (s) => {
            let n = 0; for (const h of s.P.arts) if (h.ident < 2) { h.ident = 2; n++; }
            s.sayAs('marrin', `FASCINATING. ${n} ITEM${n > 1 ? 'S' : ''} CATALOGUED - THE FULL REPORTS ARE IN YOUR SCIENCE HOLD.`);
            s.checkShards(); s.repAdd(CIV_FLEET, 3); return 'start';
          } },
          tradeOpt('DONATE 2 EXOTIC MATTER', [[G.R_EXOTIC, 2]], [[G.R_SPARES, 4], [G.R_CELL, 2]], 'DR. MARRIN SENDS OVER 4 SPARE PARTS AND 2 ANTIMATTER CELLS AS THANKS.', 'start'),
          { t: 'ANY WORK FOR US?', if: (s) => s.mode !== 0, do: (s) => s.contractOffer() },
          { t: 'CLOSE CHANNEL' },
        ] },
    },
  },
  // the listening post
  relay: {
    who: 'relay',
    nodes: {
      start: { say: '...THIS POST IS UNMANNED. LAST LOG, STATION KEEPER IVANA ROSS: "THE SIGNAL CAME BACK TONIGHT. SEVEN NOTES. THE ORRANS JAMMED IT WITHIN THE HOUR. I\'M GOING TO RECORD IT BEFORE THEY..." [END OF RECORDING]',
        opts: [{ t: 'DOWNLOAD THE RECORDING', do: (s) => { s.flags.relayLog = true; s.say(s.FROM_CREW, 0, 'RECORDING SAVED. SEVEN NOTES - THE SAME SEVEN-FOLD PATTERN AS THE NANITES AND THE SHARDS, IF YOU\'VE SEEN THEM.'); return null; } }, { t: 'CLOSE CHANNEL' }] },
    },
  },
  // the Chorus
  monolith: {
    who: 'chorus',
    nodes: {
      start: { say: 'WE {HEAR} YOU, SMALL {VOICE}. YOU {CARRY} OUR {PIECES}. WHY DO YOU {SING} HERE?',
        opts: [
          { t: 'WE CAME TO LISTEN', do: (s) => { s.sayAs('chorus', 'THEN {LISTEN}. WE WERE {MANY}. WE ARE {FEW}. THE ORRANS {CLOSED} OUR DOOR. SOON IT {OPENS}.'); return null; } },
          { t: 'RETURN THE SHARDS', if: (s) => s.hasArt('shard1') && s.hasArt('shard2') && s.hasArt('shard3'),
            do: (s) => { ['shard1', 'shard2', 'shard3'].forEach((id) => s.removeArt(id)); s.addArt('nanite', 2); s.sayAs('chorus', 'THE {PIECES} COME {HOME}. TAKE THIS {SEED}. IT {MENDS}.'); return null; } },
          { t: 'CLOSE CHANNEL' },
        ] },
    },
  },
  // a Kessari raiding party demands surrender (ctx: { ids: [ship ids] })
  demand: {
    who: 'kessari',
    timeout: 25,
    onTimeout: (s, ctx) => { s.sayAs('kessari', 'SILENCE IS AN ANSWER. KILL THEM!'); s.kessariAttack(ctx); },
    nodes: {
      start: { say: (s, ctx) => (ctx.draal ? 'MAREK DRAAL SPEAKS. YOU HAVE SOMETHING OF MINE, FLEET. DROP YOUR SHIELDS, OPEN YOUR HOLD, AND I MAY LET YOU CRAWL HOME.'
        : 'FLEET SHIP! YOU ARE IN KESSARI SPACE NOW. DROP YOUR SHIELDS AND OPEN YOUR CARGO HOLD - OR WE CUT IT OPEN.'),
        opts: [
          { t: 'NEVER. RED ALERT!', do: (s, ctx) => { s.sayAs('kessari', 'THEN BURN!'); s.repAdd(CIV_KESSARI, -5); s.kessariAttack(ctx); return null; } },
          { t: 'PAY TRIBUTE: HALF OUR MATERIALS', do: (s, ctx) => { s.tribute(0.5); s.repAdd(CIV_KESSARI, 10); s.sayAs('kessari', 'WISE. THE KESSARI REMEMBER THOSE WHO PAY.'); s.kessariLeave(ctx); return null; } },
          { t: 'RETURN THE IDOL', if: (s) => s.hasArt('idol'), do: (s, ctx) => { s.removeArt('idol'); s.repAdd(CIV_KESSARI, 30); s.sayAs('kessari', 'THE WARLORD\'S IDOL... TAKE YOUR LIFE AND GO, FLEET.'); s.kessariLeave(ctx); return null; } },
          { t: 'BLUFF: A FLEET SQUADRON IS TWO MINUTES OUT', do: (s, ctx) => {
            if (s.frand() < s.bluffChance(ctx)) { s.sayAs('kessari', '...WE WILL MEET AGAIN, FLEET. WHEN YOUR FRIENDS ARE NOT WATCHING.'); s.kessariLeave(ctx); }
            else { s.sayAs('kessari', 'MY SENSORS SAY YOU ARE ALONE, LIAR. ATTACK!'); s.kessariAttack(ctx, true); }
            return null;
          } },
          { t: 'WE SURRENDER', do: (s, ctx) => { s.tribute(1); s.sayAs('kessari', 'HA! A FLEET SHIP THAT KNEELS. WE TAKE EVERYTHING. CRAWL AWAY.'); s.kessariLeave(ctx); return null; } },
        ] },
    },
  },
};
// which conversation a station starts with, by station kind
export const STATION_DIALOG = ['starbase', 'outpost', 'hub', 'haven', 'citadel', 'array', 'relay', 'monolith'];

// split "A {B} C" into plain/alien pieces for drawing
export function alienParts(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const a = text.indexOf('{', i);
    if (a < 0) { out.push([text.slice(i), false]); break; }
    if (a > i) out.push([text.slice(i, a), false]);
    const b = text.indexOf('}', a);
    out.push([text.slice(a + 1, b < 0 ? text.length : b), true]);
    i = b < 0 ? text.length : b + 1;
  }
  return out;
}
export const subtitle = (text) => text.replace(/\{[^}]*\}/g, '[...]');
