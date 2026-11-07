# Writing an Aurora campaign (from THRESHOLD on)

These are the house rules for every new campaign. THRESHOLD (web/js/threshold.js) is the reference implementation; the framework is web/js/story.js and the science puzzles are web/js/puzzles.js.

## Structure
- Use a proven story framework and say which in the file header. THRESHOLD uses the **five-act television structure with a cold open**: a short, self-contained hook (COLD OPEN), then five acts that each end on a turn ("act out") that sends the story somewhere new. Set `labels` on the CAMPAIGNS entry so the lobby and the viewer's title card say COLD OPEN / ACT ONE ... instead of CHAPTER n.
- Frameworks used so far, so the next campaign can pick a different one: THRESHOLD - five-act TV with a cold open; IRON TIDE - the seven-point structure (hook, plot turn 1, pinch 1, midpoint, pinch 2, plot turn 2, resolution) over five chapters, for a war story; RECURRENCE - kishotenketsu with a teaser (introduction, development, a twist that reframes everything, reconciliation), for a mystery about time. Put the labels in `STORY[id].labels` too, so objectives read "PART TWO: ...".
- Give it a mystery with clues the crew can actually find, a red herring, a sympathetic antagonist and a human one, and a twist that reframes the earlier acts.
- Several endings, decided by choices across the whole campaign (allies by bond, `camp.f` flags).

## Fleet Command
- FLEET COMMAND is always on the line (COMMS > FLEET COMMAND). Provide a campaign `fleet` dialog: confirm orders, "what do we know so far" (built from flags), a status question or two that changes as the story moves, and a ship sitrep.
- When an objective is done, call `storyReport(key)`: the button flashes, the objective says to report in, and Fleet calls after 45s if nobody does. The report is the cut-scene: it explains what happened and what it means, offers questions with real information behind them, and ends with an ACKNOWLEDGED option that calls `storyNext(ch, systemId, objective)`.
- Chapters start on arrival: the crew plots the jump themselves; the act title appears when they arrive.

## Slow lanes and in-transit scenes
- A campaign can stretch jumps with the `lane` hook (THRESHOLD: x10 once the lanes fray). Use long jumps for:
  - an in-transit briefing (the `jump` hook starts a Q&A dialogue a few seconds into the lane), and
  - science puzzles on the main viewer. Story artefacts with `drag` slow the jump until they're solved, which explains the time.
- Tell the crew when to use the time ("the shard is drinking our jump field - put it on the viewer").

## Science puzzles (puzzles.js)
- RINGS (align glyph rings), CIPHER (four-glyph key with right-place / wrong-place feedback and a trace limit), ARCHIVE (records read together on the viewer; `hook` fires when read, `lock` hides a record behind a flag, `key` records complete it), TUNE (match a carrier wave). Chain them: `puz: ['cipher', 'archive']`.
- Puzzles should matter: an archive record holds a code a later dialogue asks for, a location that adds a marker, or a name that unlocks a question. Solving a puzzle can improve translation, change what an NPC says, or open an option.
- Prefer a unique puzzle per campaign where possible; add new kinds to puzzles.js (state on `h.pz`, secrets in `sim.pzSecret`, controls in drawPuzzle with `app`, viewer drawing without it).

## Characters and dialogue
- Every NPC remembers: `say` can be a function of `camp.f`, and options can have `if` conditions. Greet the crew differently after they helped or wronged someone; let a rescued character comment at the right moments.
- Use node-level `who` to change speaker mid-conversation (interruptions, a second voice), `ev` for a sound, `auto: [seconds, next]` for lines that move on by themselves.
- Keep each line short enough to read aloud on the viewer.

## Fleet ships and wingmen (squadron.js)
- A campaign can give the Aurora a squadron for the whole story: `wingAdd(key, spec)` or a `camp.wing` roster (`{ key, who, name, short, type, shMax, lostLine }`). Call `wingSpawn()` in the `arrive` hook - they jump with the Aurora and keep their damage. A wingman who dies stays dead (`STORY[id].wingLost` hook); set `r.away` to detach one for a chapter, `r.fate` to say why it's gone.
- TACTICAL orders the wing (CMD.SQUAD: 1 attack my target, 2 form up, 0 at will) and COMMS can hail a wingman for the full list; `camp.wingGuard` is what DEFEND guards.
- Use them for choices that cost something: save the wingman or the convoy, cover the crippled ship or let her captain ram the shield generator.

## Practical
- Steps are a state machine (`camp.step`), each with an objective that tells the crew which station does what.
- Save the choices per chapter (`campSave[id].fAt[ch]`) and give sensible defaults for chapters started cold.
- Write a walkthrough test (tests/campaign4.mjs is the template): every route, every ending, puzzles solved through CMD.PUZ.
