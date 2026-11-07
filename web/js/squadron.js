// ============================================================================
// squadron.js - Fleet wingmen who fly with the Aurora for a whole campaign.
//   A campaign keeps a ROSTER in camp.wing: [{ key, who, name, short, type, hull, dead }].
//   wingSpawn() puts the living ones beside us whenever we arrive somewhere (they jump with us),
//   and their damage carries over between systems; a ship that dies stays dead.
//   ORDERS (CMD.SQUAD, from TACTICAL's wing buttons or by hailing a wingman on COMMS):
//     1 ATTACK MY TARGET - everyone engages tactical's target
//     2 FORM UP          - break off, fly with the Aurora (and cover her)
//     3 DEFEND           - guard whatever the campaign marks as worth guarding (camp.wingGuard)
//     0 ENGAGE AT WILL   - each picks the nearest hostile (the default)
// ============================================================================
import * as K from './config.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { distTo, bearingTo } from './util.js';
const { NO_ID, US, MAX_CONTACTS, F_FRIEND, CT_STARBASE, FROM_CREW } = K;
const AI_ALLY = 8;
export const SQ_ORDER = ['ENGAGE AT WILL', 'ATTACK MY TARGET', 'FORM UP ON US', 'DEFEND'];

// hailing a wingman: their status, and the squadron's orders
Object.assign(DIALOGS, {
  sq_orders: { who: 'computer', nodes: {
    start: { say: (s, ctx) => s.wingLine(ctx.id),
      opts: [
        { t: 'ATTACK MY TARGET', if: (s) => s.P.target !== NO_ID && s.hostileAlive(s.P.target), do: (s) => { s.wingOrder(1); return null; } },
        { t: 'FORM UP ON US', do: (s) => { s.wingOrder(2); return null; } },
        { t: 'DEFEND THE OBJECTIVE', if: (s) => s.wingGuardId() !== NO_ID, do: (s) => { s.wingOrder(3); return null; } },
        { t: 'ENGAGE AT WILL', do: (s) => { s.wingOrder(0); return null; } },
        { t: 'STATUS REPORT', do: (s) => { s.sayAs(s.dlg.who, s.wingStatus()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
});

export function installSquadron(Sim) {
  Object.assign(Sim.prototype, {
    wingIds() { const out = []; for (let i = 0; i < MAX_CONTACTS; i++) { const n = this.npc[i]; if (n.active && n.alive && n.wing) out.push(i); } return out; },
    wingRoster() { return (this.camp && this.camp.wing) || []; },
    wingAdd(key, spec) { // join the squadron (spawns now if we're in a system)
      const c = this.camp; c.wing = c.wing || [];
      let r = c.wing.find((q) => q.key === key);
      if (!r) { r = { key, hull: 100, dead: false, ...spec }; c.wing.push(r); }
      else if (r.dead) return NO_ID;
      return this.wingSpawnOne(r);
    },
    wingSpawnOne(r, ox = 0, oy = 0) {
      if (r.dead || r.away) return NO_ID;
      const P = this.P;
      const [x, y] = [this.clampSec(P.x + ox - Math.sin(P.hdg * Math.PI / 180) * 1600), this.clampSec(P.y + oy + Math.cos(P.hdg * Math.PI / 180) * 1600)];
      const id = this.spawnAt(r.type, F_FRIEND, x, y, P.hdg);
      if (id === NO_ID) return id;
      const ch = CHARS[r.who];
      Object.assign(this.npc[id], { ai: AI_ALLY, aiTarget: NO_ID, scan: 2, civ: K.CIV_FLEET ?? 1, name: r.name, short: r.short, wing: r.key, allyWho: r.who, allyBond: 4,
        allyLeaveAt: 1e12, allyRetreat: -1, hull: r.hull, talk: 'sq_orders', talkCtx: {}, shMax: r.shMax || 120, shields: r.shMax || 120,
        note: `${r.name} - ${ch ? ch.name + ', ' : ''}TASK FORCE 9. ${r.note || ''}` });
      this.npc[id].talkCtx = { id, who: r.who };
      r.id = id;
      return id;
    },
    wingSpawn() { // on arrival: the squadron drops out of the lane beside us
      let k = 0;
      for (const r of this.wingRoster()) { if (r.dead || r.away) continue; this.wingSpawnOne(r, (k % 2 ? 1 : -1) * 1300 * (1 + (k >> 1)), 900 * (k >> 1)); k++; }
    },
    wingOf(key) { const r = this.wingRoster().find((q) => q.key === key); return r && !r.dead && r.id !== undefined && this.npc[r.id].active && this.npc[r.id].wing === key ? r.id : NO_ID; },
    wingGuardId() { const g = this.camp && this.camp.wingGuard; return g !== undefined && g !== NO_ID && g < MAX_CONTACTS && this.npc[g].active && this.npc[g].alive ? g : NO_ID; },
    wingOrder(o) {
      const c = this.camp; if (!c) return;
      if (o === 1 && !(this.P.target !== NO_ID && this.hostileAlive(this.P.target))) { this.denied('TACTICAL NEEDS A HOSTILE TARGET FIRST.'); return; }
      if (o === 3 && this.wingGuardId() === NO_ID) { this.denied('THERE IS NOTHING HERE FOR THE WING TO DEFEND.'); return; }
      c.sqOrder = o; c.sqTarget = o === 1 ? this.P.target : NO_ID;
      const ids = this.wingIds();
      if (!ids.length) { this.denied('THE SQUADRON ISN\'T WITH US.'); return; }
      for (const id of ids) { this.npc[id].allyT = 0; this.wingRetarget(this.npc[id]); }
      const n = this.npc[ids[0]];
      const line = ['ENGAGING AT WILL.', `ALL SHIPS, TARGET ${this.shortName(c.sqTarget)}. ON THE AURORA'S MARK.`, 'FORMING UP ON YOU, AURORA. WE\'VE GOT YOUR FLANKS.', `MOVING TO COVER ${this.shortName(this.wingGuardId())}.`][o];
      this.say(ids[0], 3, `${n.short}: ${line}`); this.msgs[0].who = n.allyWho;
    },
    wingRetarget(n) { // the squadron's orders decide what each wingman shoots at
      const c = this.camp, o = (c && c.sqOrder) || 0;
      if (o === 1 && c.sqTarget !== undefined && this.hostileAlive(c.sqTarget)) { n.aiTarget = c.sqTarget; return; }
      if (o === 1) { c.sqOrder = 0; const ids = this.wingIds(); if (ids.length) { this.say(ids[0], 3, `${this.npc[ids[0]].short}: TARGET DESTROYED. ENGAGING AT WILL.`); this.msgs[0].who = this.npc[ids[0]].allyWho; } }
      const guard = o === 3 ? this.wingGuardId() : NO_ID;
      const from = o === 2 ? this.P : guard !== NO_ID ? this.npc[guard] : n, reach = o === 2 ? 7000 : guard !== NO_ID ? 9000 : 26000;
      let best = NO_ID, bd = reach;
      for (let i = 0; i < MAX_CONTACTS; i++) {
        if (!this.hostileAlive(i) || this.npc[i].type === CT_STARBASE || this.npc[i].ai === 3) continue;
        const d = distTo(from.x, from.y, this.npc[i].x, this.npc[i].y);
        if (d < bd) { bd = d; best = i; }
      }
      n.aiTarget = best;
      if (best !== NO_ID && this.npc[best].aiTarget === US && this.frand() < 0.3) this.npc[best].aiTarget = this.npc.indexOf(n);
      if (best === NO_ID && guard !== NO_ID) n.guardAt = guard; else n.guardAt = NO_ID;
    },
    wingLine(id) {
      const n = this.npc[id], c = this.camp, r = this.wingRoster().find((q) => q.key === n.wing);
      const hurt = n.hull < 35 ? ' WE\'RE HURT BAD, AURORA.' : n.hull < 70 ? ' TAKING SOME DAMAGE, BUT WE\'RE IN THE FIGHT.' : '';
      return `${n.short} HERE. HULL ${Math.round(n.hull)}%.${hurt} ORDERS: ${SQ_ORDER[(c && c.sqOrder) || 0]}.${r && r.line ? ' ' + r.line(this) : ''}`;
    },
    wingStatus() {
      return this.wingRoster().map((r) => (r.dead ? `${r.short}: ${r.fate || 'LOST'}` : r.away ? `${r.short}: DETACHED` : `${r.short}: HULL ${Math.round(r.id !== undefined && this.npc[r.id].wing === r.key ? this.npc[r.id].hull : r.hull)}%`)).join('. ') + '.';
    },
    // every tick: keep the roster's hulls current, notice losses, keep guards on station
    wingTick() {
      const c = this.camp; if (!c || !c.wing) return;
      for (const r of c.wing) {
        if (r.dead || r.away || r.id === undefined) continue;
        const n = this.npc[r.id];
        if (n.wing !== r.key) { r.id = undefined; continue; } // the slot was reused (we left the system)
        if (n.active && n.alive) { r.hull = n.hull; continue; }
        if (!n.alive && !r.dead) {
          r.dead = true; r.hull = 0; r.id = undefined;
          this.say(FROM_CREW, 2, `${r.name} IS GONE, CAPTAIN. ${r.lostLine || 'NO ESCAPE PODS.'}`);
          if (c.onWingLost) c.onWingLost(r);
          const st = this.story && this.story(); if (st && st.wingLost) st.wingLost(this, r);
        }
      }
    },
    wingSnap() {
      const R = this.wingRoster(); if (!R.length) return null;
      return { o: (this.camp && this.camp.sqOrder) || 0, s: R.map((r) => [r.short, r.dead ? -1 : r.away ? -2 : Math.round(r.id !== undefined && this.npc[r.id].wing === r.key ? this.npc[r.id].hull : r.hull)]) };
    },
  });
}
