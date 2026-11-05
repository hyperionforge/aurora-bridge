# Starship Aurora – Bridge Simulator for Android phones

The three-screen ESP32 bridge simulator rebuilt as an Android app. It plays on 2–5 phones over the local Wi-Fi, and the main viewer can be cast to a Chromecast while everyone keeps their station.

- **One phone hosts.** It runs the simulation (the same missions, AI and balance numbers as the ESP32 build) and a small server on the Wi-Fi.
- **Other players join from the app.** The host's game shows up in a list automatically. Anyone without the app can join from a phone browser, iPhones included.
- **The crew is grouped into stations automatically.** The 8 sub-stations are shared out by crew size, and each player taps the station they want. The **Captain** is optional.
- **The TV main viewer is separate from every phone's controls.** Cast it to a Chromecast from any phone in the app, or open it in any browser (smart TV, laptop on HDMI). Every player can change what it shows (FWD / TAC / MAP / TGT / COMMS), and the captain can too.
- **Landscape on the phones**, in the same LCARS panel style.

| Crew | Stations (sub-stations) |
|---|---|
| 1 | Bridge Officer (all 8) |
| 2 | Helm & Science (HELM, NAV, SCIENCE, COMMS) · Tactical & Engineering (TACTICAL, SHIELDS, ENGINEER, DAMAGE) |
| 3 | Conn (HELM, NAV, COMMS) · Tactical & Science (TACTICAL, SHIELDS, SCIENCE) · Engineering (ENGINEER, DAMAGE) |
| 4 | Helm (HELM, NAV) · Science & Comms (SCIENCE, COMMS) · Tactical (TACTICAL, SHIELDS) · Engineering (ENGINEER, DAMAGE) |
| + Captain | STATUS (first officer advice) · ORDERS · COMMS |

Crew = players − captain. For example, 4 players with the captain switched on gives 3 crew + captain. A captain's order goes to whoever holds the sub-station that carries it out. It flashes on their phone's top bar, and the captain's log shows SENT → ACKNOWLEDGED → DONE with the response time.

---

## 1. Get the app onto your phones

The project is a standard Android Studio project in `android/`. The game itself (HTML/JavaScript) lives in `web/` and is copied into the APK when it builds.

### Option A – let GitHub build it (no software to install)
1. Create a new GitHub repository and upload everything in this folder. The `.github` folder must be included.
2. Open the repo's **Actions** tab. The **Build** workflow runs on every push (or press *Run workflow*). After about 5 minutes, open the finished run and download **aurora-bridge-apk**. It is a zip containing `app-debug.apk`.
3. Copy the APK to each phone and open it. Android asks you to allow installs from that app (Files / Chrome / Drive) once.

### Option B – Android Studio
Open the `android/` folder in Android Studio (2024.2 or newer), let it sync, then press **Run** with a phone plugged in. Or use *Build ▸ Build APK(s)*.

Requirements: Android 7.0 or newer. Casting needs Google Play services, which almost every phone has.

## 2. Play
1. Everyone joins the **same Wi-Fi**. The host's phone hotspot works too.
2. The host taps **HOST A NEW BRIDGE**. The others open the app and tap the bridge in the list. If the list stays empty, they can type the address the host's lobby shows, or scan its QR code with the phone camera to join in the browser.
3. In **CREW ASSEMBLY**, decide whether to switch **CAPTAIN STATION** on. Each player then taps a station card. Pick a mission and difficulty, then **START MISSION**. It starts once everyone has a station.
4. On your phone, the tabs are down the left. **VIEWER** (top right) shows the main viewer and changes it for the whole bridge. **☰** has sound, vibration, *leave my station* (to swap seats) and *leave game*.
5. **Host:** keep the app open and the screen on during a mission. The game runs on your phone. The app keeps the screen awake for you.

If someone's phone drops out, they rejoin with the same name from the same phone and get their seat back. Their station stays reserved during the mission.

## 3. The main viewer on the TV

### Without a Chromecast (works straight away)
On any device with a web browser on the same Wi-Fi, open `http://<host address>/screen.html`, for example `http://192.168.1.20:8737/screen.html`. The address is shown in the lobby. This works on a smart-TV browser, a laptop plugged into the TV, or a tablet. Click once to turn on sound, and press F for full screen.

### With a Chromecast (one-time setup, about 15 minutes, US$5)
Chromecasts only run receiver apps registered with Google, so you register yours once:

1. **Host the receiver page.** In your GitHub repo go to *Settings ▸ Pages ▸ Source: GitHub Actions*, then run the Build workflow again. The receiver is now at
   `https://<your-github-name>.github.io/<repo-name>/receiver.html`
   (open it in a browser to check that it shows "STARSHIP AURORA").
2. **Register as a Cast developer** at <https://cast.google.com/publish> (one-off US$5 fee).
3. **Add New Application ▸ Custom Receiver**. Name: *Aurora Bridge*. Receiver Application URL: the receiver.html address from step 1. Save, and copy the **App ID** (8 characters).
4. **Add New Device**: enter your Chromecast's serial number (on the device or its box, or in the Google Home app under device settings). Unpublished receivers only run on registered devices. Wait about 15 minutes, then **reboot the Chromecast** (unplug it for 10 seconds).
5. In the app, on the start screen, tap **SETTINGS / TV**, enter the App ID, tap **SAVE**, then close and reopen the app.
6. During a game a **CAST TV** button appears at the top of every station. Tap it and pick your TV. That phone keeps playing its station while it feeds the TV, and any player can be the one casting.

The Chromecast needs internet access to load the receiver page from GitHub Pages.

## 4. Play on a PC or laptop (optional)
Install Node.js 18+, then run:
```
npm install
node server/dev-server.mjs
```
Open `http://localhost:8737/?host=1` on the computer (it becomes the host). Phones then join with their browser at the address the lobby shows, and `…/screen.html` is the viewscreen.

---

## How it fits together
```
 host phone (app)                                   other phones (app or browser)
 ┌──────────────────────────────┐                   ┌─────────────────────┐
 │ WebView: host.js + sim.js    │◄─ "M cid json" ── │ WebView: app.js     │
 │  (simulation, lobby)  ──"B"──┼─► relay server ──►│  station UI         │
 │ WebView: app.js (my station) │   (RelayServer)   └─────────────────────┘
 │ NSD advertise, Cast sender   │──── Cast channel ───► Chromecast receiver.html
 └──────────────────────────────┘                   any browser: screen.html
```
- `web/js/sim.js` is a line-by-line port of `sim.h` + `missions.h` + `orders.h`. `config.js` has every balance number from `config.h`.
- `web/js/host.js` runs the lobby, the station layout and the snapshots: ship, contacts and projectiles 10×/s, mission/messages/orders 2×/s, plus instant events for sounds.
- `web/js/app.js` is the phone shell (lobby, frame, order banner, viewer page). The sub-stations are in `web/js/stations/`, and `viewscreen.js` + `tv.js` draw the main viewer.
- `android/` is the Java app: `MainActivity` (WebView + bridge), `RelayServer` (HTTP + WebSocket, plain Java), `Discovery` (Android network service discovery, `_aurorabridge._tcp`) and `CastHelper` (Google Cast sender).
- `server/dev-server.mjs` is the same relay for a PC.

## Tests
```
node tests/bots.mjs 1,2,3,4,5,6,7,8        # scripted crew plays all 18 missions per seed
node tests/e2e.mjs node 3 1                # relay + host + 4 phones + TV in headless Chromium, screenshots in shots/
javac -d build/relay android/app/src/main/java/com/aurora/bridge/RelayServer.java tools/relay-pc/RelayMain.java
node tests/e2e.mjs java 4 1                # the same, through the app's Java relay server
```
The bot crew wins 113/144 missions on the JS port against 112/144 on the original C++ harness (seeds 1–8), so the balance carried over.

## Credits
Font: Antonio (SIL Open Font License, `web/fonts/OFL-Antonio.txt`). QR codes: qrcode-generator by Kazuhiko Arase (MIT). Ship designs and everything else are original.
