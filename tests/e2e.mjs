// End-to-end: relay server + host phone + crew phones + TV page in headless
// Chromium. Joins, picks roles, starts a mission, flies it with crew
// commands, and saves screenshots of every station tab and the TV.
//   node tests/e2e.mjs [relay: node|java] [players 1-5] [manual 0|1  (1 = pick roles by hand)]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startRelay } from '../server/dev-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const relay = process.argv[2] || 'node';
const crew = +(process.argv[3] || 2);
const manual = process.argv[4] === '1';
const captain = false;
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
const n = crew;
const phones = [host];
for (let i = 1; i < n; i++) phones.push(await phone(names[i]));
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const tv = await tvCtx.newPage();
tv.on('pageerror', (e) => errors.push('tv: ' + e.message));
await tv.goto(`${base}/screen.html`);
await sleep(1500);

const lobby = await host.evaluate(() => window.auroraApp.w.lobby);
console.log('players:', lobby.players.length, 'screens:', lobby.screens);
await host.screenshot({ path: `${OUT}/p01_lobby_empty.png` });
if (manual) {
  // each player taps role cards: player i takes roles i, i+n, ... ; the last role is left open at first
  for (let t = 0; t < 7; t++) await phones[t % n].evaluate((t) => window.auroraApp.link.send({ t: 'role', tab: t }), t);
  await sleep(600);
  const part = await host.evaluate(() => window.auroraApp.w.lobby);
  console.log('7 of 8 roles taken -> canStart', part.canStart, '|', part.why);
  await host.screenshot({ path: `${OUT}/p02a_lobby_partial.png` });
  // someone tries to take a role another player holds: refused
  if (n > 1) {
    await phones[1].evaluate(() => window.auroraApp.link.send({ t: 'role', tab: 0 }));
    await sleep(400);
    const own = await host.evaluate(() => window.auroraApp.w.lobby.roles[0] === window.auroraApp.pid);
    console.log('role 0 still held by its first owner:', own);
  }
  await phones[n - 1].evaluate(() => window.auroraApp.link.send({ t: 'role', tab: 7 }));
} else {
  await host.evaluate(() => window.auroraApp.link.send({ t: 'auto' }));
}
await sleep(800);
await host.screenshot({ path: `${OUT}/p02_lobby_ready.png` });
await tv.screenshot({ path: `${OUT}/tv01_title.png` });
const ready = await host.evaluate(() => window.auroraApp.w.lobby);
console.log('roles:', ready.players.map((p) => `${p.name}=${p.roles.join('/')}`).join(' '), 'canStart', ready.canStart, ready.why);
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
  const tabs = await phones[i].evaluate(() => { const s = window.auroraApp.myStation(); return s ? s.tabs.length : 0; });
  stations.push(tabs);
  for (let t = 0; t < tabs; t++) {
    await phones[i].evaluate((t) => { const a = window.auroraApp; a.viewerPage = false; a.tab = t; }, t);
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
for (const [mode, nm] of [[0, 'fwd'], [1, 'tac'], [2, 'map'], [3, 'tgt'], [4, 'comms'], [5, 'status']]) {
  await phones[n - 1].evaluate((m) => { const a = window.auroraApp; a.send(10, m, a.w.P.target); }, mode);
  await sleep(900);
  await tv.screenshot({ path: `${OUT}/tv1${mode}_${nm}.png` });
}
await phones[n - 1].evaluate(() => { window.auroraApp.viewerPage = true; window.auroraApp.send(10, 1, 255); });
await sleep(800);
await phones[n - 1].screenshot({ path: `${OUT}/p40_viewer_page.png` });
// ---- jump drive: switch to a free voyage, look at the galaxy chart, jump to Meridian
await host.evaluate(() => {
  const s = window.auroraHost.sim;
  for (let i = 6; i < 32; i++) if (s.npc[i].active && s.npc[i].type !== 0) s.npc[i].active = false;
  s.P.health = s.P.health.map(() => 100); s.P.power[1] = 150;
  s.mode = 1; s.P.x = 120000; s.P.y = 120000; s.P.dock = 0; s.P.energy = 900;
});
await host.evaluate(async () => { const m = await import('./js/stations/helm.js'); m.nav.zoom = 0; });
const navOwner = await (async () => { for (let i = 0; i < n; i++) if (await phones[i].evaluate(() => window.auroraApp.myStation().tabs.includes(1))) return i; return 0; })();
await phones[navOwner].evaluate(() => { const a = window.auroraApp; a.viewerPage = false; a.tab = a.myStation().tabs.indexOf(1); });
await sleep(600);
await phones[navOwner].screenshot({ path: `${OUT}/p60_nav_system.png` });
await phones[navOwner].evaluate(async () => { const m = await import('./js/stations/helm.js'); m.nav.zoom = 2; m.nav.gsel = 1; });
await sleep(1200);
await phones[navOwner].screenshot({ path: `${OUT}/p61_nav_galaxy.png` });
await phones[navOwner].evaluate(() => window.auroraApp.send(35, 1));
await sleep(300);
console.log('jump state:', await host.evaluate(() => { const s = window.auroraHost.sim; return JSON.stringify({ to: s.P.jumpTo, mode: s.mode, game: s.game, why: s.jumpBlock(1), ch: s.P.jumpCharge }); }));
await phones[n - 1].evaluate(() => window.auroraApp.send(10, 0, 255));
await sleep(5000);
console.log('jump msgs:', await host.evaluate(() => window.auroraHost.sim.msgs.slice(0, 2).map((m) => m.text).join(' | ')));
await tv.screenshot({ path: `${OUT}/tv30_jump_charge.png` });
await phones[navOwner].screenshot({ path: `${OUT}/p62_nav_charging.png` });
await sleep(7000);
await tv.screenshot({ path: `${OUT}/tv31_jump_tunnel.png` });
await sleep(6000);
console.log('after jump:', await host.evaluate(() => window.auroraHost.sim.sysDef.name));
await tv.screenshot({ path: `${OUT}/tv32_arrived_fwd.png` });
await phones[n - 1].evaluate(() => window.auroraApp.send(10, 2, 255));
await sleep(900);
await tv.screenshot({ path: `${OUT}/tv33_meridian_map.png` });
await phones[navOwner].evaluate(async () => { const m = await import('./js/stations/helm.js'); m.nav.zoom = 0; });
await sleep(600);
await phones[navOwner].screenshot({ path: `${OUT}/p63_nav_meridian.png` });
// ---- salvage: sample + extract a point of interest, analyse the artefact, look at the cargo bay
const ownerOf = async (tab) => { for (let i = 0; i < n; i++) if (await phones[i].evaluate((t) => window.auroraApp.myStation().tabs.includes(t), tab)) return i; return 0; };
const sciO = await ownerOf(2), dmgO = await ownerOf(7);
const poiId = await host.evaluate(() => {
  const s = window.auroraHost.sim;
  const i = s.npc.findIndex((n) => n.active && n.type === 6);
  const n = s.npc[i];
  n.art = 3; n.scan = 2; n.res = [5, 0, 2, 0, 1, 0];
  s.P.x = n.x + 1800; s.P.y = n.y + 300; s.P.speed = 0; s.P.throttle = 0; s.P.shieldsOn = false; s.P.shieldRaise = 0; s.P.energy = 1000;
  s.P.arts.push({ a: 6, uid: s.P.artSeq++, ident: 2 }, { a: 7, uid: s.P.artSeq++, ident: 1 });
  return i;
});
await phones[sciO].evaluate(async (id) => { const a = window.auroraApp; a.viewerPage = false; a.tab = a.myStation().tabs.indexOf(2); const m = await import('./js/stations/helm.js'); m.science.sel = id; m.science.hold = false; m.science.rangeI = 0; }, poiId);
await sleep(700);
await phones[sciO].evaluate(async (id) => { const m = await import('./js/stations/helm.js'); m.science.sel = id; }, poiId);
await sleep(400);
await phones[sciO].screenshot({ path: `${OUT}/p70_sci_poi.png` });
await phones[n - 1].evaluate((id) => window.auroraApp.send(10, 3, id), poiId);
await sleep(700);
await tv.screenshot({ path: `${OUT}/tv40_target_poi.png` });
await phones[n - 1].evaluate(() => window.auroraApp.send(10, 0, 255));
await phones[sciO].evaluate((id) => window.auroraApp.send(37, id), poiId);
await sleep(5000);
await phones[sciO].screenshot({ path: `${OUT}/p71_sci_extracting.png` });
await tv.screenshot({ path: `${OUT}/tv41_fwd_poi.png` });
await host.evaluate(() => { window.auroraHost.sim.P.xProg = 0.99; });
await sleep(1200);
console.log('after extract:', await host.evaluate(() => { const s = window.auroraHost.sim; return s.msgs.slice(0, 2).map((m) => m.text).join(' | ') + ' | cargo ' + s.P.cargo.join(',') + ' arts ' + s.P.arts.length; }));
await phones[sciO].evaluate(async () => { const m = await import('./js/stations/helm.js'); m.science.hold = true; m.science.artSel = 0; });
await sleep(600);
await phones[sciO].screenshot({ path: `${OUT}/p72_sci_hold.png` });
await phones[dmgO].evaluate(async () => { const a = window.auroraApp; a.viewerPage = false; a.tab = a.myStation().tabs.indexOf(7); const m = await import('./js/stations/tactical.js'); m.damage.view = 1; });
await phones[dmgO].evaluate(() => { window.auroraApp.send(38, 0); window.auroraApp.send(38, 2); });
await sleep(2500);
await phones[dmgO].screenshot({ path: `${OUT}/p73_dmg_cargo.png` });
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
