# Aurora Bridge (Android) - context for a new Claude conversation

Attach this zip to a new chat and say: "This is my Aurora Bridge Android app - read CONTEXT.md and README.md, then here is what I want next: ..."

Origin: port of the 3-screen ESP32 "BRIDGE_SIMULATOR" (Waveshare 7" boards, ESP-NOW) to phones.
- web/ = the whole game (plain ES modules, no build step). Shared by the app, phone browsers, the TV page and the Chromecast receiver.
  - js/config.js (all constants/balance, station LAYOUTS, ORDERS), js/sim.js (Sim class = sim.h+missions.h+orders.h),
    js/host.js (lobby, station grouping, snapshots, relay protocol), js/world.js (client state + interpolation + Link),
    js/gfx.js (canvas immediate-mode LCARS UI, virtual 440px-high coordinates), js/app.js (phone shell),
    js/stations/{helm,tactical,captain,common}.js (sub-stations), js/viewscreen.js + js/tv.js (main viewer), js/sound.js (WebAudio buzzer).
  - index.html (phone), screen.html (TV in a browser), receiver.html (Chromecast CAF receiver), start.html (app home screen).
- android/ = Java app: MainActivity (WebView + window.AuroraNative bridge), RelayServer (pure Java HTTP+WebSocket relay),
  Discovery (NSD _aurorabridge._tcp), CastHelper + CastOptionsProvider (Cast sender; App ID entered in app Settings).
  Gradle copies ../web into assets at build time. AGP 8.7.3, Gradle 8.10.2, compileSdk/targetSdk 34, minSdk 24.
- server/dev-server.mjs = same relay in Node (PC hosting / tests). tools/relay-pc = runs the Java relay on a PC.
- tests/bots.mjs (crew bots, all missions), tests/e2e.mjs (headless Chromium multi-phone + TV, screenshots).
- Relay protocol: client->host "M cid json" (+J/L), host->relay "B json" / "T cid json" / "I json". Host must be loopback.
- Messages: hello/claim/unclaim/captain/cmd (client->host); welcome/lobby/f (fast 10Hz)/s (slow 2Hz)/ev/who/nohost/full (host->client).
- APK is built by .github/workflows/build.yml (also deploys web/ to GitHub Pages for the Cast receiver) or Android Studio.
