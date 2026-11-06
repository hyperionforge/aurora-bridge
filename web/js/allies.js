// ============================================================================
// allies.js - the friends you make in a campaign, and how much they'll do for you.
// Each ally has a BOND (0-4) set by how you treated them: turned away = 0,
// a fair deal = 1, real help = 2, generous = 3, a debt they can never repay = 4.
//   1 GRUDGING: one ship, ONE battle only, and it leaves after ~45s ("we're even").
//   2 LOYAL:    one ship, every battle, stays to the end - but pulls out if badly hurt.
//   3 DEVOTED:  two ships, every battle, stays to the end.
//   4 SWORN:    three ships, every battle, fights to the last.
// The bond lives in camp.f.bond (saved with the campaign); a campaign can also map
// its old choice flags to a bond via camp.bondOf(who).
// ============================================================================
import * as K from './config.js';
import { CHARS } from './dialogue.js';
import { bearingTo } from './util.js';
const { NO_ID, F_FRIEND } = K;
const AI_ALLY = 8;

export const BOND_NAME = ['', 'GRUDGING', 'LOYAL', 'DEVOTED', 'SWORN'];
export function allyTerms(bond) {
  if (bond <= 0) return null;
  return { ships: bond >= 4 ? 3 : bond >= 3 ? 2 : 1, stay: bond >= 2 ? 1e9 : 45, battles: bond >= 2 ? 99 : 1, retreatAt: bond >= 4 ? -1 : bond >= 3 ? 15 : 35 };
}

export function installAllies(Sim) {
  Object.assign(Sim.prototype, {
    bondOf(who) {
      const c = this.camp; if (!c) return 0;
      const f = c.f || {};
      if (f.bond && f.bond[who] !== undefined) return f.bond[who];
      return c.bondOf ? c.bondOf(who) : 0;
    },
    bondSet(who, v) { const f = this.camp.f; (f.bond || (f.bond = {}))[who] = Math.max(0, Math.min(4, v)); },
    bondAdd(who, d) { this.bondSet(who, this.bondOf(who) + d); },
    // bring an ally into a battle on the terms their bond allows; returns the first ship's id (or NO_ID)
    callAlly(who, spec) {
      const c = this.camp, f = c.f, P = this.P, bond = this.bondOf(who), T = allyTerms(bond);
      if (!T) return NO_ID;
      const used = (c.allyUsed || (c.allyUsed = {})); // per playthrough, not saved
      if ((used[who] || 0) >= T.battles) return NO_ID; // they came once; that was the deal
      used[who] = (used[who] || 0) + 1;
      const n = spec.ships ? Math.min(spec.ships, T.ships) : T.ships;
      const [x, y] = this.pointNear(P.x, P.y, 5000);
      let first = NO_ID;
      for (let i = 0; i < n; i++) {
        const id = this.spawnAt(spec.type, spec.as ?? F_FRIEND, this.clampSec(x + i * 1300), this.clampSec(y + i * 900), bearingTo(x, y, P.x, P.y));
        if (id === NO_ID) continue;
        const nm = spec.name;
        Object.assign(this.npc[id], { ai: spec.ai ?? AI_ALLY, aiTarget: NO_ID, scan: 2, civ: spec.civ, name: n > 1 ? `${nm} ${i + 1}` : nm, short: n > 1 ? `${nm.split(' ')[0]} ${i + 1}` : nm.split(' ')[0],
          allyWho: who, allyBond: bond, allyLeaveAt: this.missionT + T.stay, allyRetreat: T.retreatAt });
        this.boomAt(this.npc[id].x, this.npc[id].y, 2);
        if (first === NO_ID) first = id;
      }
      if (first !== NO_ID) {
        const line = bond <= 1 && spec.grudging ? spec.grudging : spec.line;
        this.say(first, 3, line + (bond <= 1 ? ' (ONE FIGHT, THEN WE ARE EVEN.)' : ''));
        this.msgs[0].who = who; if (CHARS[who] && CHARS[who].civ >= 3) this.msgs[0].lang = CHARS[who].civ;
        (c.allies || (c.allies = new Set())).add(who);
      }
      return first;
    },
    // allies on short terms leave; hurt allies who aren't sworn pull out
    allyTick() {
      if (!this.camp) return;
      for (let i = 0; i < K.MAX_CONTACTS; i++) {
        const n = this.npc[i];
        if (!n.active || !n.alive || !n.allyWho || n.ai !== AI_ALLY) continue;
        const ch = CHARS[n.allyWho], nm = ch ? ch.name : n.short;
        if (this.missionT >= n.allyLeaveAt) {
          this.npcLeave([i]); this.say(i, 3, `${nm}: THAT SQUARES US, AURORA. GOOD HUNTING.`); this.msgs[0].who = n.allyWho;
        } else if (n.allyRetreat >= 0 && n.hull < n.allyRetreat) {
          this.npcLeave([i]); this.say(i, 1, `${nm}: WE'RE HIT TOO HARD - PULLING OUT! SORRY, AURORA.`); this.msgs[0].who = n.allyWho;
        }
      }
    },
  });
}
