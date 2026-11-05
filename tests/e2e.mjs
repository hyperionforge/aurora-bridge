// End-to-end: relay server + host phone + crew phones + TV page in headless
// Chromium. Joins, claims stations, starts a mission, flies it with crew
// commands, and saves screenshots of every station tab and the TV.
//   node tests/e2e.mjs [relay: node|java] [crew 1-4] [captain 0|1]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startRelay } from '../server/dev-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const relay = process.argv[2] || 'node';
const crew = +(process.argv[3] || 2);
const captain = process.argv[4] === '1';
const PORT = 8800 + Math.floor(Math.random() * 100);
const OUT = process.env.SHOTS || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let javaProc = null, server = null;
if (relay === 'java') {
  javaProc = spawn('java', ['-cp', 'build/relay', 'com.aurora.bridge.RelayMain', String(PORT), 'web'], { stdio: 'inherit' });
  await sleep(1200);
} else server = startRelay(PORT, undefined, () => {});

const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const errors = [];
async function phone(name, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 915), height: +(process.env.VH || 412) }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.goto(`${base}/?name=${name}&pid=pid-${name}${extra}`);
  return p;
}
const host = await phone('KIRA', '&host=1');
await sleep(800);
const names = ['KIRA', 'JONAS', 'MAI', 'OMAR', 'LEE'];
const n = crew + (captain ? 1 : 0);
const phones = [host];
for (let i = 1; i < n; i++) phones.push(await phone(names[i]));
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const tv = await tvCtx.newPage();
tv.on('pageerror', (e) => errors.push('tv: ' + e.message));
await tv.goto(`${base}/screen.html`);
await sleep(1500);

const lobby = await host.evaluate(() => window.auroraApp.w.lobby);
console.log('lobby stations:', lobby.stations.map((s) => s.key).join(','), 'players:', lobby.players.length, 'screens:', lobby.screens);
if (captain) await host.evaluate(() => window.auroraApp.link.send({ t: 'captain', on: true }));
await sleep(600);
await host.screenshot({ path: `${OUT}/p01_lobby_empty.png` });
const lb2 = await host.evaluate(() => window.auroraApp.w.lobby);
const keys = lb2.stations.map((s) => s.key);
for (let i = 0; i < n; i++) await phones[i].evaluate((k) => window.auroraApp.link.send({ t: 'claim', key: k }), keys[(i + (captain ? 1 : 0)) % keys.length]);
await sleep(800);
await host.screenshot({ path: `${OUT}/p02_lobby_ready.png` });
await tv.screenshot({ path: `${OUT}/tv01_title.png` });
const ready = await host.evaluate(() => window.auroraApp.w.lobby);
console.log('claims:', ready.players.map((p) => `${p.name}=${p.station}`).join(' '), 'canStart', ready.canStart, ready.why);
await host.evaluate(() => { const K = window.auroraApp; K.send(32, 1, 1); });
await sleep(300);
await phones[n - 1].evaluate(() => window.auroraApp.send(1));
await sleep(1500);
const g = await host.evaluate(() => window.auroraHost.sim.game);
console.log('game state after START:', g);

// drive a little ourselves: set warp towards the beacon via a crew phone
const drive = async (p, cmd, a = 0, b = 0, c = 0, d = 0) => p.evaluate(([cmd, a, b, c, d]) => window.auroraApp.send(cmd, a, b, c, d), [cmd, a, b, c, d]);
const P0 = phones[0];
await drive(P0, 7, 1);           // autopilot -> waypoint
await drive(P0, 3, 0, 0, 100);   // full impulse
await sleep(2500);
const st = await host.evaluate(() => ({ sp: window.auroraHost.sim.P.speed, ap: window.auroraHost.sim.P.autopilot, obj: window.auroraHost.sim.M.objective }));
console.log('after commands:', JSON.stringify(st));

// ---- combat scenario: raiders warp in next to us
await host.evaluate(() => {
  const s = window.auroraHost.sim, K = { US: 254 };
  s.P.x = 52000; s.P.y = 52000; s.P.hdg = s.P.desHdg = 30;
  s.warpInGroup(2, 1, s.P.x, s.P.y, 7000, K.US, K.US);
});
await sleep(4000);
await host.evaluate(() => {
  const s = window.auroraHost.sim;
  const foes = s.M.foes;
  s.npc[foes[0]].scan = 2;
  s.handleCmd({ cmd: 15, a: foes[0] });          // target
  s.handleCmd({ cmd: 25, a: 2 });                // red alert
  s.handleCmd({ cmd: 18, a: 1 });                // auto-fire
  s.handleCmd({ cmd: 20, a: 0, b: 1 });          // load quantum
  s.handleCmd({ cmd: 24, a: 1 });                // reinforce fore
  s.handleCmd({ cmd: 29, a: 1 });                // combat preset
  s.P.health[5] = 0; s.P.health[2] = 48; s.P.heat[2] = 85; s.P.shield[2] = 30;
  s.handleCmd({ cmd: 28, a: 0, b: 5 });          // repair team on sensors
  s.handleCmd({ cmd: 11, a: foes[1] });          // scan a raider
  s.say(foes[0], 2, 'THIS SPACE IS OURS NOW. LEAVE, OR BURN.', 5, 6, 7);
});
await sleep(2500);
const stations = [];
for (let i = 0; i < n; i++) {
  const tabs = await phones[i].evaluate(() => { const a = window.auroraApp; const s = a.myStation(); return s ? (s.captain ? 3 : s.tabs.length) : 0; });
  stations.push(tabs);
  for (let t = 0; t < tabs; t++) {
    await phones[i].evaluate((t) => { const a = window.auroraApp; a.viewerPage = false; if (a.myStation().captain) a.capTab = t; else a.tab = t; }, t);
    await sleep(400);
    await phones[i].screenshot({ path: `${OUT}/p1${i}_${names[i]}_tab${t}.png` });
  }
}
// captain order -> banner on the crew phone that owns the tab
if (captain) {
  let ci = 0;
  for (let i = 0; i < n; i++) if (await phones[i].evaluate(() => !!window.auroraApp.myStation().captain)) ci = i;
  await phones[ci].evaluate(() => window.auroraApp.send(34, 3, 0));   // ORDER: evasive manoeuvres
  await phones[ci].evaluate(() => window.auroraApp.send(34, 21, 0));  // ORDER: power to shields
  await sleep(700);
  for (let i = 0; i < n; i++) if (i !== ci) await phones[i].screenshot({ path: `${OUT}/p3${i}_order_banner.png` });
  // the helm officer acknowledges and carries it out
  for (let i = 0; i < n; i++) {
    const o = await phones[i].evaluate(() => { const a = window.auroraApp; const o = a.myOrder(); return o && o.code === 3 ? o.id : 0; });
    if (o) { await phones[i].evaluate((id) => { const a = window.auroraApp; a.send(33, id); a.send(6, 1); }, o); }
  }
  await sleep(1200);
  await phones[ci].evaluate(() => { window.auroraApp.capTab = 1; });
  await sleep(300);
  await phones[ci].screenshot({ path: `${OUT}/p35_captain_log.png` });
  const ol = await host.evaluate(() => window.auroraHost.sim.orders.map((o) => `${o.code}:${o.status}`).join(' '));
  console.log('orders after crew response:', ol);
}
// every main viewer mode on the TV + one phone viewer page
for (const [mode, nm] of [[0, 'fwd'], [1, 'tac'], [2, 'map'], [3, 'tgt'], [4, 'comms']]) {
  await phones[n - 1].evaluate((m) => { const a = window.auroraApp; a.send(10, m, a.w.P.target); }, mode);
  await sleep(900);
  await tv.screenshot({ path: `${OUT}/tv1${mode}_${nm}.png` });
}
await phones[n - 1].evaluate(() => { window.auroraApp.viewerPage = true; window.auroraApp.send(10, 1, 255); });
await sleep(800);
await phones[n - 1].screenshot({ path: `${OUT}/p40_viewer_page.png` });
// end of mission
await host.evaluate(() => window.auroraHost.sim.endMission(true));
await sleep(1500);
await phones[0].screenshot({ path: `${OUT}/p50_end.png` });
await tv.screenshot({ path: `${OUT}/tv20_end.png` });
await phones[0].evaluate(() => window.auroraApp.send(31));
await sleep(800);
const back = await host.evaluate(() => window.auroraHost.sim.game);
console.log('back to lobby state:', back, '| tabs per phone:', stations.join(','));
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
if (server) server.close();
if (javaProc) javaProc.kill();
process.exit(errors.length ? 1 : 0);
