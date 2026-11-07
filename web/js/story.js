// ============================================================================
// story.js - the storytelling framework (used by THRESHOLD and every campaign after it).
//   FLEET COMMAND IS ALWAYS ON THE LINE: comms can hail it at any time (HAIL with
//     a = FROM_COMMAND). The campaign supplies the conversation for the moment (its
//     `fleet` hook: orders, what we know so far, questions worth asking); otherwise the
//     admiral reads out the current orders.
//   REPORT-INS ARE THE CUT-SCENES: when the crew finishes an objective the campaign calls
//     storyReport(key). The FLEET COMMAND button flashes, the objective says to report in,
//     and after a while Fleet calls them anyway. The call explains what it all means and
//     where to go next, with questions the crew can ask before they acknowledge.
//   CHAPTERS START ON ARRIVAL: storyNext(ch, sysId, objective) - after the debrief the crew
//     plots its own way there; the next chapter's title comes up as they arrive.
//   SLOW LANES: a campaign can stretch jumps (`lane` hook); story artefacts can drag on the
//     jump field (ART `drag`). A long jump is the time for an in-transit briefing
//     (`jump` hook) or for the crew to crack a puzzle together on the main viewer.
//   HOOKS: puzzle(h, kind), archive(h, hook), jump(to), arrive(to), chapter(ch).
// A campaign registers its hooks in STORY[campaignId].
// ============================================================================
import * as K from './config.js';
import { DIALOGS } from './dialogue.js';
const { FROM_COMMAND, FROM_CREW, GS_RUN } = K;

export const STORY = {};
const NUM_WORD = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
export const chapterLabel = (cp, ch) => (cp && cp.labels ? cp.labels[ch - 1] : `CHAPTER ${NUM_WORD[ch - 1] || ch}`);

// Fleet Command's everyday answer, when no campaign has anything more to say
Object.assign(DIALOGS, {
  fleet: { who: 'voss', nodes: {
    start: { who: (s) => (s.mode === K.MODE_MISSION ? 'hale' : 'voss'),
      say: (s) => (s.mode === K.MODE_MISSION ? 'STARBASE 12 OPERATIONS. GO AHEAD, AURORA.' : 'FLEET COMMAND - VOSS HERE. GO AHEAD, AURORA.'),
      opts: [
        { t: 'REQUEST OUR CURRENT ORDERS', do: (s) => { s.sayAs(s.dlg.who, s.M.objective ? `YOUR ORDERS: ${s.M.objective.replace(/^CH\d+: /, '')}` : 'NO STANDING ORDERS, AURORA. THE FRONTIER IS YOURS.'); return 'start'; } },
        { t: 'ANY NEWS FROM THE FRONTIER?', if: (s) => s.mode !== K.MODE_MISSION, do: (s) => { s.sayAs(s.dlg.who, s.rumour()); return 'start'; } },
        { t: 'REQUEST A SITREP ON THE SHIP', do: (s) => { s.sayAs(s.dlg.who, s.fleetSitrep()); return 'start'; } },
        { t: 'CLOSE CHANNEL' },
      ] },
  } },
});

export function installStory(Sim) {
  Object.assign(Sim.prototype, {
    story() { return (this.camp && STORY[this.camp.id]) || null; },
    // the chapter's label for objectives ("ACT TWO: ", "CHAPTER THREE: "), from the campaign's STORY labels
    campTag() { const c = this.camp, st = this.story(); return c && st && c.ch ? `${chapterLabel(st.labels ? { labels: st.labels } : null, c.ch)}: ` : ''; },
    // ---- comms: HAIL FLEET COMMAND
    fleetHail() {
      if (this.game !== GS_RUN) return;
      const st = this.story();
      let key = this.fleetCall || (st && st.fleet ? st.fleet(this) : null);
      if (!key || !DIALOGS[key]) key = 'fleet';
      this.startDialog(key, FROM_COMMAND);
    },
    fleetSitrep() {
      const P = this.P, low = K.SYS_NAME.filter((_, i) => P.health[i] < 60);
      return `HULL ${Math.round(P.hull)}%, ENERGY ${Math.round(P.energy)}. ${low.length ? 'DAMAGED: ' + low.join(', ') + '.' : 'ALL SYSTEMS NOMINAL.'} PHOTON ${P.torps[0]}, QUANTUM ${P.torps[1]}.${P.dock ? '' : ' A STARBASE CAN PATCH YOU UP IF YOU NEED IT.'}`;
    },
    // ---- an objective is done: Fleet wants to hear about it (the call is the cut-scene)
    storyReport(key, obj) {
      this.fleetCall = key; this.fleetCallAt = this.now;
      const c = this.camp;
      this.setObjective(`${this.campTag ? this.campTag() : ''}${obj || 'REPORT TO FLEET COMMAND - COMMS: HAIL FLEET COMMAND'}`);
      this.after(2, () => { if (this.fleetCall === key) this.say(FROM_CREW, 0, 'CAPTAIN, FLEET COMMAND WILL WANT TO HEAR ABOUT THIS. COMMS CAN OPEN A CHANNEL WHENEVER YOU\'RE READY.'); });
      if (c) c.reported = false;
    },
    // ---- after the debrief: where the next chapter happens
    storyNext(ch, sysId, obj) {
      const c = this.camp;
      this.fleetCall = null;
      c.next = { ch, sys: sysId };
      if (obj) this.setObjective(`${this.campTag ? this.campTag() : ''}${obj}`);
      if (this.sysDef.id === sysId) this.after(4, () => this.storyArrive());
    },
    storyArrive() { // called on every arrival (and once the debrief is done if we're already there)
      const c = this.camp, st = this.story();
      if (!c || !st) return;
      if (c.next && this.sysDef.id === c.next.sys) { const ch = c.next.ch; c.next = null; if (st.chapter) st.chapter(this, ch); }
      if (st.arrive) st.arrive(this, this.sysIdx);
    },
    storyTick() { // Fleet calls if the crew sits on a report for too long
      if (this.fleetCall && !this.dlg && this.P.jumpTo === K.NO_ID && this.now - (this.fleetCallAt || 0) > 45000 && !this.foesLeft()) {
        this.fleetCallAt = this.now;
        this.say(FROM_CREW, 0, 'INCOMING TRANSMISSION - FLEET COMMAND IS CALLING US.');
        this.after(2, () => { if (this.fleetCall && !this.dlg) this.fleetHail(); });
      }
    },
    // ---- hooks the rest of the sim calls
    laneSlow(to) { const st = this.story(); return st && st.lane ? st.lane(this, to) : 1; },
    onJumpStart(to) { const st = this.story(); if (st && st.jump) st.jump(this, to); },
    onPuzzle(h, kind) { const st = this.story(); if (st && st.puzzle) st.puzzle(this, h, kind); },
    onArchive(h, hook) { const st = this.story(); if (st && st.archive) st.archive(this, h, hook); },
  });
}
