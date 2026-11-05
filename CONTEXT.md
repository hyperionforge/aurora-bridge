# Aurora Bridge (Android) - context for a new Claude conversation

Attach this zip to a new chat and say: "This is my Aurora Bridge Android app - read CONTEXT.md and README.md, then here is what I want next: ..."

Origin: port of the 3-screen ESP32 "BRIDGE_SIMULATOR" (Waveshare 7" boards, ESP-NOW) to phones.
- web/ = the whole game (plain ES modules, no build step). Shared by the app, phone browsers, the TV page and the Chromecast receiver.
  - js/config.js (all constants/balance, station LAYOUTS, ORDERS), js/sim.js (Sim class = sim.h+missions.h+orders.h),
    js/host.js (lobby, station grouping, snapshots, relay protocol), js/world.js (client state + interpolation + Link),
    js/gfx.js (canvas immediate-mode LCARS UI, virtual 440px-high coordinates), js/app.js (phone shell),
    js/stations/{helm,tactical,common}.js (the 8 roles), js/viewscreen.js + js/tv.js (main viewer), js/sound.js (WebAudio buzzer).
  - index.html (phone), screen.html (TV in a browser), receiver.html (Chromecast CAF receiver), start.html (app home screen).
- android/ = Java app: MainActivity (WebView + window.AuroraNative bridge), RelayServer (pure Java HTTP+WebSocket relay),
  Discovery (NSD _aurorabridge._tcp), CastHelper + CastOptionsProvider (Cast sender; App ID entered in app Settings).
  Gradle copies ../web into assets at build time. AGP 8.7.3, Gradle 8.10.2, compileSdk/targetSdk 34, minSdk 24.
- server/dev-server.mjs = same relay in Node (PC hosting / tests). tools/relay-pc = runs the Java relay on a PC.
- tests/bots.mjs (crew bots, all missions), tests/e2e.mjs (headless Chromium multi-phone + TV, screenshots).
- Relay protocol: client->host "M cid json" (+J/L), host->relay "B json" / "T cid json" / "I json". Host must be loopback.
- Roles: each player toggles roles ('role' {tab}); one holder per role; start needs all 8 held by online players and nobody idle; 'auto' = AUTO_SPLIT in config.js. No captain station (sim's order code is dormant); the captain readout is viewscreen mode STATUS (VM_STATUS=5).
- Messages: hello/role/auto/unclaim/cmd (client->host); welcome/lobby/f (fast 10Hz)/s (slow 2Hz)/ev/who/nohost/full (host->client).
- APK is built by .github/workflows/build.yml (also deploys web/ to GitHub Pages for the Cast receiver) or Android Studio.
- Galaxy (js/galaxy.js): 9 star systems (160k square each, star at centre, planets orbit from the game clock via planetPos/starPos, belts, nebulae, stations with civ owner + kind) joined by jump lanes. THE SILENT CHOIR is hidden until revealed. sim.loadSystem(i) spawns stations (slots 0 and 2+); CMD.JUMP (35) charges 10s, needs: not MISSION mode, a lane, undocked, warp online, >22k from the star, no hostiles within 12k, 150 energy; 6s transit; arrive() places the ship 66k out facing the origin.
- Modes: MODE_MISSION (classic 18 missions, Kalos only), MODE_SANDBOX (free voyage), MODE_CAMPAIGN (planned). SELECT sends c=mode. MODES_READY limits the lobby selector.
- Drawing: js/sysdraw.js (bodies, drawSystemLayer, drawGalaxy, drawStation per station kind, drawJumpTunnel). NAV tab has SYSTEM / LOCAL 20K / GALAXY (jump panel). Snapshots carry sys, mode, visited, revealed, jumpWhy and npc name/short/kind/civ.
- Salvage (js/cargo.js = materials, RECIPES, POI_DEF, ART, SYS_POIS, SYS_FIXED_ART): CT_POI contacts (n.poi = n.kind = PK_*), CMD SAMPLE 36 / EXTRACT 37 / REFINE 38 / USE 39 / ANALYSE 40 / JETTISON 41. P.cargo[9], P.arts [{a,uid,ident 0-2}], sim.fx(key) applies artefact effects. Repair teams use spares (25% per spare, 45% speed without). Chorus shards (Shroud/Cerulean/Orra derelicts+ruins) deep-analysed together reveal the hidden system. UI: SCIENCE HOLD + POI panel, DAMAGE CARGO & REFINERY.
- Dialogue (js/dialogue.js = CHARS cast, DIALOGS trees, STATION_DIALOG; js/portraits.js = faces, glyph runes, translator timing): sim.startDialog(key, fromId, ctx), presentNode, dialogReply (CMD.DREPLY 42 a=seq b=index), endDialog; msgs carry who/lang/dseq/dopt; slow snapshot has dlg {seq,key,who,from,left} and rep[civ]. sim.rep drives attitudeOf (stations change faction). Stations greet within 14k outside MISSION mode. kessariDemand(n, draal) -> 'demand' tree with 25s timeout; orranDuel/duelTick; rumour(); sim.after(sec, fn) timers in worldTick.
- Sandbox (js/voyage.js, installed onto Sim.prototype): contracts (sim.job; makeJob by giver civ: bounty/survey/rescue/salvage/deliver/courier; jobAccept/jobTick/jobDone/jobFail + hooks jobOnScan/OnDock/OnDestroyed/OnExtract/OnLeave/jobHandIn), director voyageTick -> randomEvent every 80-150s (traffic, kessari, inspect, mayday, capsule, trader, fleet). Extra dialogs: contract, freighter, vtrader, inspection, mayday, stranded. NPC ships can carry n.talk/n.talkCtx and n.destX/destY + leaveAtDest (AI_TRAVEL).
- Campaign (js/campaign.js, installed onto Sim.prototype): sim.camp {ch, step, t, f (choices), ...}; startCampaign(ch) (selType = chapter-1, capped by campSave.maxCh), campChapter, campStep(k) sets objective + campEnter, campTick per step, onArrive(to) builds each chapter's scene, dialogs c_* in DIALOGS, allies via AI_ALLY (8) + allyRetarget, campEnding(kind: free/seal/fleet/silence). Host saves sim.campSave to localStorage 'aurora.campaign'. Vault lock answer 3-2-7 (planets of Kalos, Halcyon's two suns, seven notes). tests/campaign.mjs walks it end to end.
