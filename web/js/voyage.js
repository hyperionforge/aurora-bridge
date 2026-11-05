// ============================================================================
// voyage.js - the open-ended voyage (SANDBOX): station contracts and the
// event director that keeps the galaxy busy (traffic, raids, inspections,
// distress calls, things drifting in the dark). Installed onto Sim.
// ============================================================================
import * as K from './config.js';
import * as G from './cargo.js';
import { DIALOGS, CHARS } from './dialogue.js';
import { sysAt, lanesOf, SYS_C, WELL_R, SYS_INDEX, CIV_FLEET, CIV_COLONY, CIV_VELORI, CIV_KESSARI, CIV_ORRAN, SK_RELAY, SK_MONOLITH } from './galaxy.js';
import { distTo, bearingTo, clampf } from './util.js';

const { NO_ID, US, MAX_CONTACTS, CT_STARBASE, CT_FREIGHTER, CT_RAIDER, CT_DESTROYER, CT_ANOMALY, CT_POI, F_FRIEND, F_NEUTRAL, F_HOSTILE, FROM_CREW, FROM_COMMAND, GS_RUN, MK_AREA, MK_POINT } = K;
const AI_STATIC = 0, AI_TRAVEL = 2, AI_ATTACK = 4, AI_FLEE = 5, AI_SURRENDER = 6, AI_PATROL = 7;

export const J_BOUNTY = 'bounty', J_SURVEY = 'survey', J_RESCUE = 'rescue', J_SALVAGE = 'salvage', J_DELIVER = 'deliver', J_COURIER = 'courier';
const JOBS_BY_CIV = {
  [CIV_FLEET]: [J_BOUNTY, J_SURVEY, J_RESCUE, J_COURIER],
  [CIV_COLONY]: [J_DELIVER, J_RESCUE, J_SALVAGE, J_BOUNTY],
  [CIV_VELORI]: [J_DELIVER, J_COURIER, J_SALVAGE],
  [CIV_ORRAN]: [J_BOUNTY, J_DELIVER, J_SURVEY],
  [CIV_KESSARI]: [J_SALVAGE, J_COURIER, J_DELIVER],
};
const WANTS = { [CIV_FLEET]: [G.R_CRYSTAL, G.R_EXOTIC], [CIV_COLONY]: [G.R_ICE, G.R_PLASMA], [CIV_VELORI]: [G.R_CRYSTAL, G.R_EXOTIC], [CIV_ORRAN]: [G.R_ALLOY, G.R_ORE], [CIV_KESSARI]: [G.R_PLASMA, G.R_ALLOY] };

// ---------------------------------------------------------------- conversations for ships and contracts
CHARS.hauler = { name: 'FREIGHTER CAPTAIN', role: 'INDEPENDENT HAULER', civ: CIV_COLONY, look: { skin: '#c8a078', hair: '#784628', uniform: '#5a6e8c' } };
CHARS.vtrader = { name: 'VELORI TRADE-CAPTAIN', role: 'VELORI MERCHANT GUILD', civ: CIV_VELORI, look: 'velori' };
Object.assign(DIALOGS, {
  contract: {
    who: 'hale',
    nodes: {
      start: { say: (s, ctx) => ctx.job.brief + `  REWARD: ${s.rewardText(ctx.job.reward)}.`,
        opts: [
          { t: 'ACCEPT THE CONTRACT', do: (s, ctx) => { s.jobAccept(ctx.job); return null; } },
          { t: 'NOT RIGHT NOW', do: (s) => { s.sayAs(s.dlg.who, 'UNDERSTOOD. THE OFFER STANDS A WHILE.'); return null; } },
        ] },
    },
  },
  freighter: {
    who: 'hauler',
    nodes: {
      start: { say: (s, ctx) => `AURORA, THIS IS THE ${ctx.name}. ${ctx.lin ? 'GOOD TO SEE A FRIENDLY HULL OUT HERE.' : 'JUST PASSING THROUGH. ANY TROUBLE AHEAD?'}`,
        opts: [
          { t: 'ANY NEWS?', do: (s) => { s.sayAs(s.dlg.who, s.rumour()); return 'start2'; } },
          { t: 'WANT TO TRADE?', go: 'trade' },
          { t: 'SAFE TRAVELS' },
        ] },
      start2: { say: 'ANYTHING ELSE?', opts: [{ t: 'WANT TO TRADE?', go: 'trade' }, { t: 'SAFE TRAVELS' }] },
      trade: { say: 'WE CARRY A LITTLE OF EVERYTHING. NOTHING FANCY.',
        opts: [
          { t: '3 ORE FOR 2 ICE', if: (s) => s.P.cargo[G.R_ORE] >= 3, do: (s) => { s.P.cargo[G.R_ORE] -= 3; s.P.cargo[G.R_ICE] += 2; s.say(FROM_CREW, 3, 'TRADE DONE: 3 ORE FOR 2 ICE.'); return 'trade'; } },
          { t: '2 ICE FOR 2 ALLOY', if: (s) => s.P.cargo[G.R_ICE] >= 2, do: (s) => { s.P.cargo[G.R_ICE] -= 2; s.P.cargo[G.R_ALLOY] += 2; s.say(FROM_CREW, 3, 'TRADE DONE: 2 ICE FOR 2 ALLOY.'); return 'trade'; } },
          { t: '2 PLASMA FOR 2 SPARE PARTS', if: (s) => s.P.cargo[G.R_PLASMA] >= 2, do: (s) => { s.P.cargo[G.R_PLASMA] -= 2; s.P.cargo[G.R_SPARES] += 2; s.say(FROM_CREW, 3, 'TRADE DONE: 2 PLASMA FOR 2 SPARE PARTS.'); return 'trade'; } },
          { t: 'THAT\'S ALL', do: (s) => { s.sayAs(s.dlg.who, 'FAIR WINDS, AURORA.'); return null; } },
        ] },
    },
  },
  vtrader: {
    who: 'vtrader',
    nodes: {
      start: { say: 'THE GUILD TRAVELS, AND THE GUILD TRADES. YOU HAVE CRYSTAL, OUTWORLDER? THE GUILD ALWAYS WANTS CRYSTAL.',
        opts: [
          { t: '2 CRYSTAL FOR A QUANTUM TORPEDO', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 2, do: (s) => { s.P.cargo[G.R_CRYSTAL] -= 2; s.P.torps[1]++; s.say(FROM_CREW, 3, 'TRADE DONE: A QUANTUM TORPEDO.'); s.repAdd(CIV_VELORI, 2); return 'start'; } },
          { t: '1 EXOTIC FOR 3 PLATING', if: (s) => s.P.cargo[G.R_EXOTIC] >= 1, do: (s) => { s.P.cargo[G.R_EXOTIC]--; s.P.cargo[G.R_PLATING] += 3; s.say(FROM_CREW, 3, 'TRADE DONE: 3 HULL PLATING.'); s.repAdd(CIV_VELORI, 2); return 'start'; } },
          { t: 'NOTHING TODAY', do: (s) => { s.sayAs('vtrader', 'THE LANTERN\'S LIGHT ON YOUR PATH, THEN.'); return null; } },
        ] },
    },
  },
  inspection: {
    who: 'orran',
    timeout: 20,
    onTimeout: (s, ctx) => { s.sayAs('orran', 'NO ANSWER IS A REFUSAL. IT WILL BE REMEMBERED.'); s.repAdd(CIV_ORRAN, -10); s.npcLeave(ctx.ids); },
    nodes: {
      start: { say: 'OUTSIDER VESSEL. YOU ARE IN THE DOMINION\'S SPACE. LOWER YOUR SHIELDS AND SUBMIT TO INSPECTION.',
        opts: [
          { t: 'WE COMPLY', do: (s, ctx) => {
            if (s.hasArt('idol')) { s.removeArt('idol'); s.repAdd(CIV_ORRAN, 4); s.sayAs('orran', 'A KESSARI WAR IDOL. CONTRABAND - CONFISCATED. YOU MAY GO.'); }
            else { s.repAdd(CIV_ORRAN, 6); s.sayAs('orran', 'YOUR VESSEL IS CLEAN. YOU HAVE BEHAVED WITH HONOUR. PROCEED.'); }
            s.npcLeave(ctx.ids); return null;
          } },
          { t: 'OFFER A GIFT (2 CRYSTAL)', if: (s) => s.P.cargo[G.R_CRYSTAL] >= 2, do: (s, ctx) => { s.P.cargo[G.R_CRYSTAL] -= 2; s.repAdd(CIV_ORRAN, 3); s.sayAs('orran', 'A GIFT. ACCEPTED. THE INSPECTION IS... COMPLETE.'); s.npcLeave(ctx.ids); return null; } },
          { t: 'WE REFUSE', do: (s, ctx) => {
            s.repAdd(CIV_ORRAN, -12);
            if (s.rep[CIV_ORRAN] < -30) { s.sayAs('orran', 'THEN YOU ARE AN ENEMY OF ORR. WEAPONS!'); s.npcAttack(ctx.ids); }
            else { s.sayAs('orran', 'YOUR DEFIANCE IS NOTED, OUTSIDER.'); s.npcLeave(ctx.ids); }
            return null;
          } },
        ] },
    },
  },
  mayday: {
    who: 'lin',
    timeout: 40,
    onTimeout: (s) => { s.say(FROM_CREW, 1, 'THE DISTRESS CALL HAS GONE SILENT.'); },
    nodes: {
      start: { say: (s, ctx) => `MAYDAY, MAYDAY - THIS IS ${ctx.who === 'lin' ? 'CAPTAIN JUN LIN OF THE MERIDIAN STAR' : 'THE FREIGHTER ' + ctx.name}. OUR ENGINES ARE DEAD, SECTOR ${ctx.sec}. IF ANYONE HEARS THIS - PLEASE!`,
        opts: [
          { t: 'HOLD ON - WE\'RE COMING', do: (s, ctx) => { s.jobAccept(ctx.job); s.sayAs(s.dlg.who, 'BLESS YOU, AURORA. WE\'LL KEEP THE LIGHTS ON.'); return null; } },
          { t: 'WE CAN\'T HELP RIGHT NOW', do: (s, ctx) => { s.flags.linIgnored = s.flags.linIgnored || ctx.who === 'lin'; s.sayAs(s.dlg.who, '...UNDERSTOOD. GOOD LUCK, AURORA.'); return null; } },
        ] },
    },
  },
  stranded: {
    who: 'lin',
    nodes: {
      start: { say: 'AURORA! YOU CAME. OUR DRIVE COUPLING IS SLAG - WE CAN FIX IT IN A MINUTE OR SO IF NOBODY SHOOTS US. OR YOU COULD SPARE US SOME PARTS?',
        opts: [
          { t: 'SEND OVER 2 SPARE PARTS', if: (s) => s.P.cargo[G.R_SPARES] >= 2, do: (s) => { s.P.cargo[G.R_SPARES] -= 2; s.job.repairT = 15; s.job.gave = true; s.sayAs(s.dlg.who, 'THAT\'S PERFECT. FIFTEEN SECONDS AND WE\'RE MOVING.'); return null; } },
          { t: 'WE\'LL STAND GUARD', do: (s) => { s.sayAs(s.dlg.who, 'THANK YOU. WATCH THE SCOPES - WHOEVER DID THIS MAY COME BACK.'); return null; } },
        ] },
    },
  },
});

// ---------------------------------------------------------------- the mixin
export function installVoyage(Sim) {
  Object.assign(Sim.prototype, {
    // ---- contracts
    contractOffer() {
      const d = this.dlg, n = d && d.from < MAX_CONTACTS ? this.npc[d.from] : null;
      const who = d ? d.who : 'voss';
      if (this.job) { this.sayAs(who, `YOU ALREADY HAVE A CONTRACT: ${this.job.objective}. FINISH THAT FIRST.`); return 'start'; }
      const civ = n ? n.civ : CIV_FLEET;
      const job = this.makeJob(civ, n ? d.from : NO_ID, who);
      if (!job) { this.sayAs(who, 'NOTHING ON THE BOARD RIGHT NOW. CHECK BACK LATER.'); return 'start'; }
      this.startDialog('contract', d ? d.from : FROM_COMMAND, { who, job });
      return undefined;
    },
    makeJob(civ, giverId, who) {
      const types = (JOBS_BY_CIV[civ] || JOBS_BY_CIV[CIV_FLEET]).slice();
      const diff = this.M.diff % 3;
      for (let tries = 0; tries < 6; tries++) {
        const type = types[this.irand(types.length)];
        const giver = giverId < MAX_CONTACTS ? this.npc[giverId] : null;
        const job = { type, civ, who, giverSys: this.sysIdx, giverId, giverName: giver ? giver.short : 'FLEET COMMAND', state: 0, ids: [] };
        const rew = (k) => this.makeReward(civ, k + diff);
        if (type === J_BOUNTY) {
          const [x, y] = this.farPoint(22000, 45000);
          const n = 2 + diff;
          Object.assign(job, { x, y, n, reward: rew(2),
            brief: `A KESSARI RAIDING PARTY IS HIDING IN SECTOR ${this.sec(x, y)}. ${n} SHIPS. DRIVE THEM OFF OR DESTROY THEM.` });
          job.objective = `BOUNTY: DEAL WITH THE KESSARI IN SECTOR ${this.sec(x, y)}`;
        } else if (type === J_SURVEY) {
          const [x, y] = this.farPoint(18000, 50000);
          Object.assign(job, { x, y, reward: rew(1), brief: `SENSORS LOGGED A SUBSPACE DISTORTION IN SECTOR ${this.sec(x, y)}. GET A FULL SCAN OF IT FOR US.` });
          job.objective = `SURVEY: FULLY SCAN THE ANOMALY IN SECTOR ${this.sec(x, y)}`;
        } else if (type === J_RESCUE) {
          const [x, y] = this.farPoint(20000, 45000);
          Object.assign(job, { x, y, reward: rew(2), brief: `A FREIGHTER WENT SILENT IN SECTOR ${this.sec(x, y)}. FIND IT AND KEEP ITS CREW ALIVE.` });
          job.objective = `RESCUE: FIND THE FREIGHTER IN SECTOR ${this.sec(x, y)}`;
        } else if (type === J_SALVAGE) {
          const [x, y] = this.farPoint(18000, 48000);
          Object.assign(job, { x, y, reward: rew(1), brief: `A SHIP WENT DOWN IN SECTOR ${this.sec(x, y)} WITH CARGO WE WANT BACK. EXTRACT THE WRECK.` });
          job.objective = `SALVAGE: EXTRACT THE WRECK IN SECTOR ${this.sec(x, y)}`;
        } else if (type === J_DELIVER) {
          if (giverId >= MAX_CONTACTS) continue;
          const wants = WANTS[civ] || [G.R_ORE];
          const r = wants[this.irand(wants.length)], n = 3 + this.irand(3) + diff;
          Object.assign(job, { need: [r, n], reward: rew(1), brief: `WE NEED ${n} ${G.RES_NAME[r]}. BRING IT TO US AND DOCK OR CALL IN.` });
          job.objective = `DELIVER ${n} ${G.RES_SHORT[r]} TO ${job.giverName}`;
        } else if (type === J_COURIER) {
          const opts = [];
          for (const i of lanesOf(this.sysIdx)) {
            const S = sysAt(i);
            if (S.hidden) continue;
            S.stations.forEach((st, k) => { if (st.kind !== SK_RELAY && st.kind !== SK_MONOLITH && this.attitudeOf(st.civ) !== F_HOSTILE) opts.push({ sys: i, name: st.name }); });
          }
          if (!opts.length) continue;
          const t = opts[this.irand(opts.length)];
          Object.assign(job, { targetSys: t.sys, targetName: t.name, reward: rew(2),
            brief: `A SEALED PACKAGE FOR ${t.name} IN ${sysAt(t.sys).name}. DON'T OPEN IT, DON'T LOSE IT.` });
          job.objective = `COURIER: TAKE THE PACKAGE TO ${t.name} (${sysAt(t.sys).name})`;
        }
        return job;
      }
      return null;
    },
    makeReward(civ, k) {
      const r = { res: [], torps: [0, 0], rep: 6 + k * 3, civ };
      const pick = [[G.R_SPARES, 2 + k], [G.R_PLATING, 1 + (k >> 1)], [G.R_CELL, 1 + (k >> 1)], [G.R_ALLOY, 2 + k], [G.R_EXOTIC, 1 + (k >> 1)], [G.R_CRYSTAL, 2 + (k >> 1)]];
      const a = this.irand(pick.length);
      r.res.push(pick[a], pick[(a + 1 + this.irand(pick.length - 1)) % pick.length]);
      if (this.frand() < 0.5) r.torps[this.frand() < 0.3 ? 1 : 0] = 1 + (k >> 1);
      if (k >= 3 && this.frand() < 0.35) r.art = true;
      return r;
    },
    rewardText(r) {
      const parts = r.res.map(([res, n]) => `${n} ${G.RES_SHORT[res]}`);
      if (r.torps[0]) parts.push(`${r.torps[0]} PHOTON`);
      if (r.torps[1]) parts.push(`${r.torps[1]} QUANTUM`);
      if (r.art) parts.push('AND SOMETHING SPECIAL');
      return parts.join(', ');
    },
    grant(r, who) {
      const P = this.P;
      for (const [res, n] of r.res) P.cargo[res] += n;
      P.torps[0] += r.torps[0]; P.torps[1] += r.torps[1];
      if (r.civ) this.repAdd(r.civ, r.rep);
      let extra = '';
      if (r.art) {
        const pool = G.ART.filter((a) => !a.set && !a.cursed && !this.foundArts.has(a.id));
        if (pool.length) { const a = pool[this.irand(pool.length)]; this.addArt(a.id, 1); extra = ` - AND A ${a.name}`; }
      }
      this.say(FROM_CREW, 3, `CONTRACT COMPLETE. RECEIVED ${this.rewardText({ ...r, art: false })}${extra}.`);
      this.stats = this.stats || {};
      this.stats.jobs = (this.stats.jobs || 0) + 1;
    },
    farPoint(dmin, dmax) {
      const P = this.P;
      for (let i = 0; i < 40; i++) {
        const [x, y] = this.pointNear(P.x, P.y, dmin + this.frand() * (dmax - dmin));
        if (distTo(x, y, SYS_C, SYS_C) > WELL_R + 4000 && this.clearOfPlanets(x, y)) return [x, y];
      }
      return this.pointNear(P.x, P.y, dmin);
    },
    jobAccept(job) {
      this.job = job;
      const M = this.M;
      this.clearMarkers();
      if (job.type === J_BOUNTY) {
        M.mk.push({ x: job.x, y: job.y, kind: MK_AREA, r: 6000 });
        for (let i = 0; i < job.n; i++) {
          const [x, y] = this.pointNear(job.x, job.y, 1500 + i * 900);
          const id = this.spawnFoe(i === 0 && job.n > 2 ? CT_DESTROYER : CT_RAIDER, x, y, US, AI_PATROL);
          if (id === NO_ID) continue;
          const n = this.npc[id];
          n.homeX = job.x; n.homeY = job.y; n.civ = CIV_KESSARI;
          job.ids.push(id);
        }
      } else if (job.type === J_SURVEY) {
        M.mk.push({ x: job.x, y: job.y, kind: MK_AREA, r: 3000 });
        const id = this.spawnAt(CT_ANOMALY, F_NEUTRAL, job.x, job.y, 0);
        if (id !== NO_ID) job.ids.push(id);
      } else if (job.type === J_RESCUE) {
        M.mk.push({ x: job.x, y: job.y, kind: MK_POINT, r: 0 });
        const id = this.spawnAt(CT_FREIGHTER, F_FRIEND, job.x, job.y, this.irand(360));
        if (id !== NO_ID) {
          const n = this.npc[id];
          Object.assign(n, { ai: AI_STATIC, hull: 45, eng: 0, speed: 0, scan: 1, civ: CIV_COLONY, name: job.shipName || 'FREIGHTER ' + ['HALCYON ROSE', 'IRON LARK', 'PATIENCE', 'BLUE HERON'][this.irand(4)] });
          n.short = n.name.replace('FREIGHTER ', '');
          n.talk = 'stranded'; n.talkCtx = { who: job.charWho || 'hauler' };
          job.ids.push(id);
        }
      } else if (job.type === J_SALVAGE) {
        M.mk.push({ x: job.x, y: job.y, kind: MK_POINT, r: 0 });
        const id = this.spawnAt(CT_POI, F_NEUTRAL, job.x, job.y, this.irand(360));
        if (id !== NO_ID) {
          const n = this.npc[id];
          Object.assign(n, { poi: G.PK_WRECK, kind: G.PK_WRECK, civ: this.irand(9), hull: 100, armor: 0, scan: 1, haz: 0.2, art: -1, poiKey: 'job', short: 'CONTRACT WRECK', name: 'THE CONTRACT WRECK' });
          n.res = [1, 0, 0, 1, 4, 0];
          job.ids.push(id);
        }
      }
      M.ver++;
      this.setObjective(job.objective);
      this.say(FROM_CREW, 0, 'CONTRACT ACCEPTED: ' + job.objective + '.');
    },
    jobDone() {
      const job = this.job;
      if (!job) return;
      this.job = null;
      this.clearMarkers();
      const from = job.giverSys === this.sysIdx && job.giverId < MAX_CONTACTS ? job.giverId : FROM_COMMAND;
      this.say(from, 3, job.type === J_RESCUE && job.charWho === 'lin' ? 'AURORA... WE OWE YOU OUR LIVES. THE MERIDIAN STAR WON\'T FORGET THIS. NEITHER WILL I.' : 'GOOD WORK, AURORA. PAYMENT IS ON ITS WAY.');
      this.msgs[0].who = job.charWho || job.who;
      this.grant(job.reward, job.who);
      if (job.charWho === 'lin') this.flags.linSaved = true;
      this.setObjective(this.voyageObjective());
    },
    jobFail(why) {
      const job = this.job;
      if (!job) return;
      this.job = null;
      this.clearMarkers();
      if (job.civ) this.repAdd(job.civ, -4);
      this.say(FROM_CREW, 1, 'CONTRACT FAILED: ' + why);
      this.setObjective(this.voyageObjective());
    },
    voyageObjective() { return this.job ? this.job.objective : 'FREE VOYAGE - EXPLORE, SALVAGE, ANSWER HAILS, ASK STATIONS FOR WORK'; },
    jobHandIn(id) {
      const job = this.job;
      if (!job) return false;
      const n = this.npc[id];
      if (job.type === J_DELIVER && job.giverSys === this.sysIdx && job.giverId === id) {
        const [r, k] = job.need;
        if (this.P.cargo[r] >= k) { this.P.cargo[r] -= k; this.jobDone(); return true; }
        return false;
      }
      if (job.type === J_COURIER && job.targetSys === this.sysIdx && n.name === job.targetName) {
        this.say(id, 3, 'THE PACKAGE. YES. WE WERE TOLD TO EXPECT YOU. YOUR PAYMENT HAS BEEN TRANSFERRED.');
        job.giverId = id; job.giverSys = this.sysIdx;
        this.jobDone();
        return true;
      }
      return false;
    },
    jobOnDock(id) { if (this.job) this.jobHandIn(id); },
    jobOnScan(id) {
      const job = this.job;
      if (job && job.type === J_SURVEY && job.ids[0] === id && this.npc[id].scan >= 2) {
        if (this.frand() < 0.3) this.after(4, () => { if (this.game === GS_RUN && !this.dlg) this.kessariDemand(2); });
        this.jobDone();
      }
    },
    jobOnExtract(id) { const job = this.job; if (job && job.type === J_SALVAGE && job.ids[0] === id) this.jobDone(); },
    jobOnDestroyed(id) {
      const job = this.job;
      if (!job) return;
      if (job.type === J_RESCUE && job.ids[0] === id) this.jobFail('THE FREIGHTER WAS DESTROYED.');
    },
    jobOnLeave(to) {
      const job = this.job;
      if (!job) return;
      if (job.type === J_DELIVER || job.type === J_COURIER) return; // these travel with us
      this.jobFail('WE LEFT THE SYSTEM.');
    },
    jobTick(dt) {
      const job = this.job, P = this.P;
      if (!job) return;
      if (job.type === J_BOUNTY) {
        const left = job.ids.filter((id) => this.npc[id].active && this.npc[id].alive && this.npc[id].ai !== AI_SURRENDER && this.npc[id].faction === F_HOSTILE).length;
        this.setObjective(`BOUNTY: DEAL WITH THE KESSARI IN SECTOR ${this.sec(job.x, job.y)} (${left} LEFT)`);
        if (!left) this.jobDone();
      } else if (job.type === J_RESCUE) {
        const n = this.npc[job.ids[0]];
        if (!n || !n.active) return;
        const d = distTo(P.x, P.y, n.x, n.y);
        if (job.state === 0 && d < 7000) {
          job.state = 1; job.repairT = 45;
          this.clearMarkers();
          this.setObjective(`RESCUE: PROTECT THE ${n.short} WHILE THEY REPAIR`);
          if (!this.dlg) this.startDialog('stranded', job.ids[0], { who: job.charWho || 'hauler' });
          if (this.frand() < 0.6) this.after(8, () => { if (this.job === job) this.warpInGroup(1 + (this.M.diff % 3), 0, n.x, n.y, 6000, job.ids[0], US); });
        } else if (job.state === 1) {
          job.repairT -= dt;
          if (job.repairT <= 0) {
            job.state = 2;
            n.eng = 100; n.ai = AI_TRAVEL; n.leaveAtDest = true;
            [n.destX, n.destY] = this.pointNear(n.x, n.y, 40000);
            n.cruise = 120;
            n.talk = 'freighter'; n.talkCtx = { name: n.short, lin: job.charWho === 'lin', who: job.charWho || 'hauler' };
            this.jobDone();
          } else this.setObjective(`RESCUE: PROTECT THE ${n.short} - REPAIRS ${Math.ceil(job.repairT)}s`);
        }
      }
    },
    // ---- the director
    voyageTick(dt) {
      if (this.mode !== K.MODE_SANDBOX) return;
      this.jobTick(dt);
      const P = this.P;
      if (this.nextEventAt === undefined) this.nextEventAt = this.now + 45000;
      if (this.now < this.nextEventAt) return;
      const busy = this.dlg || P.jumpTo !== NO_ID || P.dock || this.npc.some((n, i) => this.hostileAlive(i) && n.type !== CT_STARBASE && distTo(P.x, P.y, n.x, n.y) < 15000);
      if (busy) { this.nextEventAt = this.now + 10000; return; }
      this.nextEventAt = this.now + (80 + this.frand() * 70) * 1000;
      this.randomEvent();
    },
    randomEvent() {
      const sid = this.sysDef.id, hostileK = this.attitudeOf(CIV_KESSARI) === F_HOSTILE;
      const raid = 1 + 2 * this.fx('raid');
      const ev = [
        ['traffic', this.sysDef.stations.length ? 3 : 0.8],
        ['kessari', hostileK ? (sid === 'drift' || sid === 'shroud' ? 1.6 : sid === 'kalos' ? 0.3 : 0.7) * raid : 0],
        ['inspect', (sid === 'orra' || sid === 'halcyon' || sid === 'shroud') && this.rep[CIV_ORRAN] > -40 ? 1.6 : 0],
        ['mayday', this.job ? 0 : 1.1],
        ['capsule', 1],
        ['trader', sid === 'velanar' || sid === 'kalos' || sid === 'halcyon' ? 1 : 0.3],
        ['fleet', this.job ? 0 : 0.7],
      ];
      let tot = ev.reduce((a, e) => a + e[1], 0), r = this.frand() * tot, pick = ev[0][0];
      for (const [k, w] of ev) { if ((r -= w) <= 0) { pick = k; break; } }
      this.runEvent(pick);
    },
    runEvent(kind) {
      const P = this.P;
      switch (kind) {
        case 'traffic': case 'trader': {
          const [x, y] = this.pointNear(P.x, P.y, 9000);
          const id = this.spawnAt(CT_FREIGHTER, kind === 'trader' ? F_NEUTRAL : F_FRIEND, x, y, 0);
          if (id === NO_ID) return;
          const n = this.npc[id];
          const lin = kind === 'traffic' && !this.flags.linMet && (this.sysDef.id === 'meridian' || this.sysDef.id === 'kalos');
          const name = lin ? 'MERIDIAN STAR' : kind === 'trader' ? 'GUILD SHIP ' + ['ASHA', 'VELIM', 'ORATHE'][this.irand(3)] : ['IRON LARK', 'PATIENCE', 'BLUE HERON', 'COPPER SAINT', 'LONG HAUL'][this.irand(5)];
          Object.assign(n, { ai: AI_TRAVEL, leaveAtDest: true, cruise: 90, scan: 1, name: (kind === 'trader' ? '' : 'FREIGHTER ') + name, short: name, civ: kind === 'trader' ? CIV_VELORI : CIV_COLONY });
          [n.destX, n.destY] = this.pointNear(P.x, P.y, 30000);
          n.hdg = n.desHdg = bearingTo(n.x, n.y, n.destX, n.destY);
          n.talk = kind === 'trader' ? 'vtrader' : 'freighter';
          n.talkCtx = { name, lin, who: lin ? 'lin' : kind === 'trader' ? 'vtrader' : 'hauler' };
          if (lin) this.flags.linMet = true;
          this.boomAt(n.x, n.y, 2);
          this.after(3, () => { if (n.active && !this.dlg) this.startDialog(n.talk, id, n.talkCtx); });
          return;
        }
        case 'kessari': this.kessariDemand(2 + (this.M.diff % 3 === 2 ? 1 : 0), this.hasArt('idol') && this.frand() < 0.4); return;
        case 'inspect': {
          const [x, y] = this.pointNear(P.x, P.y, 5000);
          const id = this.spawnAt(CT_DESTROYER, F_NEUTRAL, x, y, bearingTo(x, y, P.x, P.y));
          if (id === NO_ID) return;
          Object.assign(this.npc[id], { ai: AI_STATIC, scan: 1, civ: CIV_ORRAN, name: 'ORRAN PATROL', short: 'ORRAN PATROL', shMax: 140, shields: 140 });
          this.boomAt(x, y, 2);
          this.startDialog('inspection', id, { ids: [id] });
          return;
        }
        case 'mayday': {
          const lin = this.flags.linMet && !this.flags.linSaved && !this.flags.linMayday;
          const [x, y] = this.farPoint(20000, 40000);
          const name = lin ? 'MERIDIAN STAR' : ['HALCYON ROSE', 'GOOD FORTUNE', 'ARDENT'][this.irand(3)];
          const job = { type: J_RESCUE, civ: CIV_COLONY, who: lin ? 'lin' : 'hauler', charWho: lin ? 'lin' : 'hauler', giverSys: this.sysIdx, giverId: NO_ID, giverName: name, state: 0, ids: [], x, y,
            shipName: 'FREIGHTER ' + name, reward: this.makeReward(CIV_COLONY, 2 + (lin ? 1 : 0)), objective: `RESCUE: REACH THE ${name} IN SECTOR ${this.sec(x, y)}` };
          if (lin) this.flags.linMayday = true;
          this.startDialog('mayday', FROM_COMMAND, { who: job.who, job, name, sec: this.sec(x, y) });
          return;
        }
        case 'capsule': {
          const [x, y] = this.pointNear(P.x, P.y, 8000 + this.frand() * 5000);
          const id = this.spawnAt(CT_POI, F_NEUTRAL, x, y, this.irand(360));
          if (id === NO_ID) return;
          const n = this.npc[id], kind2 = this.frand() < 0.6 ? G.PK_CAPSULE : G.PK_WRECK, def = G.POI_DEF[kind2];
          Object.assign(n, { poi: kind2, kind: kind2, civ: this.irand(9), hull: 100, armor: 0, haz: def.haz, poiKey: 'ev' + this.now, short: G.POI_NAME[kind2] + ' ' + String.fromCharCode(80 + this.irand(10)) });
          n.name = n.short;
          n.res = def.res.map((r) => (r ? r[0] + this.irand(r[1] - r[0] + 1) : 0));
          n.art = -1;
          if (this.frand() < def.art) { const pool = G.POI_ARTS[kind2].filter((a) => !this.foundArts.has(a) && !G.ART[G.ART_INDEX[a]].set); if (pool.length) n.art = G.ART_INDEX[pool[this.irand(pool.length)]]; }
          this.say(FROM_CREW, 0, `SENSORS: SOMETHING DRIFTING, BEARING ${String(Math.round(bearingTo(P.x, P.y, x, y))).padStart(3, '0')}, ${Math.round(distTo(P.x, P.y, x, y) / 1000)}K. SCIENCE, TAKE A LOOK.`);
          return;
        }
        case 'fleet': {
          const job = this.makeJob(CIV_FLEET, NO_ID, 'voss');
          if (!job) return;
          this.startDialog('contract', FROM_COMMAND, { who: 'voss', job });
          return;
        }
      }
    },
    npcLeave(ids) { for (const id of ids || []) { const n = this.npc[id]; if (n.active && n.alive) { n.ai = AI_FLEE; n.aiT = 0; n.faction = F_NEUTRAL; } } },
    npcAttack(ids) { for (const id of ids || []) { const n = this.npc[id]; if (n.active && n.alive) { n.ai = AI_ATTACK; n.aiT = 0; n.aiTarget = US; n.faction = F_HOSTILE; } } },
  });
}
