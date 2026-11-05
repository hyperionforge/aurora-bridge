# Starship Aurora – Bridge Simulator for Android phones

The three-screen ESP32 bridge simulator rebuilt as an Android app. It plays on 2–5 phones over the local Wi-Fi, and the main viewer can be cast to a Chromecast while everyone keeps their station.

- **One phone hosts.** It runs the simulation (the same missions, AI and balance numbers as the ESP32 build) and a small server on the Wi-Fi.
- **Other players join from the app.** The host's game shows up in a list automatically. Anyone without the app can join from a phone browser, iPhones included.
- **Players pick their own roles.** The ship has 8 roles: HELM, NAV, SCIENCE, COMMS, TACTICAL, SHIELDS, ENGINEER and DAMAGE. In the lobby each player taps the role cards they want; each role has one holder. **AUTO-ASSIGN** shares them out evenly. The mission can't start until all 8 roles are taken and every player has at least one.
- **The TV main viewer is separate from every phone's controls.** Cast it to a Chromecast from any phone in the app, or open it in any browser (smart TV, laptop on HDMI). Any player can change what it shows: FORWARD, TACTICAL, MAP, TARGET, COMMS (message log, who's calling, contacts in range) or **STATUS**, the full ship readout with the first officer's advice.
- **Landscape on the phones**, in the same LCARS panel style.

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
3. In **CREW ASSEMBLY**, each player taps the role cards they want (tap one of yours again to give it back), or someone taps **AUTO-ASSIGN**. Pick a mission and difficulty, then **START MISSION**. It starts once all 8 roles are taken and everyone has at least one.
4. On your phone, the tabs are down the left. **VIEWER** (top right) shows the main viewer and changes it for the whole bridge. **☰** has sound, vibration, the screen-edge margin for rounded corners, *give back my roles* (to swap) and *leave game*.
5. **Host:** keep the app open and the screen on during a mission. The game runs on your phone. The app keeps the screen awake for you.

**Game modes** (lobby, GAME): **MISSION** is one of the classic missions in the Kalos system. **SANDBOX** is a free voyage across nine star systems: NAV's **GALAXY** chart shows the jump lanes; pick a neighbouring system and **ENGAGE JUMP DRIVE** (you must be undocked, at least 22k from the star, with no hostiles close and 150 energy; more warp power charges it faster). Inside a system you still fly at impulse and warp 1-4. A story campaign is on the way.

If someone's phone drops out, they rejoin from the same phone and get their roles back. During a mission their roles stay reserved, but another player can take them over if they don't come back.

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

## 4. Host on a laptop instead of a phone
A laptop can be the host. The game then runs on the laptop, phones join it exactly as they would join a phone host, and the laptop's own browser can be a player or the main viewer (handy if the laptop is plugged into the TV).

1. Install **Node.js** (the LTS version) from <https://nodejs.org>. You only need to do this once.
2. Get the project onto the laptop: on the GitHub repo page, **Code → Download ZIP**, then unzip it.
3. **Windows:** double-click **`Start Aurora (Windows).bat`**. **Mac / Linux:** run `./start-mac-linux.sh`. The first run installs a small library, then a window prints the addresses and your browser opens the game.
   - If Windows Firewall asks, allow access on **private networks**, or the phones won't be able to connect.
4. On the laptop:
   - `http://localhost:8737/` to play a station
   - `http://localhost:8737/screen.html` for the main viewer (put that window full screen on the TV with F11)
5. On the phones: open the Aurora app and use **JOIN BY ADDRESS** with the laptop's address from that window (for example `192.168.1.20`), or open `http://<laptop address>:8737/` in the phone's browser.

Keep the black window open while you play; closing it ends the game. Chromecast casting still works, but only from a phone running the app.

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
node tests/e2e.mjs node 3 1                # relay + host + 3 phones (picking roles by hand) + TV in headless Chromium, screenshots in shots/
javac -d build/relay android/app/src/main/java/com/aurora/bridge/RelayServer.java tools/relay-pc/RelayMain.java
node tests/e2e.mjs java 5 0                # 5 phones with AUTO-ASSIGN, through the app's Java relay server
```
The bot crew wins 113/144 missions on the JS port against 112/144 on the original C++ harness (seeds 1–8), so the balance carried over.

## Credits
Font: Antonio (SIL Open Font License, `web/fonts/OFL-Antonio.txt`). QR codes: qrcode-generator by Kazuhiko Arase (MIT). Ship designs and everything else are original.
