// Screenshots of the story / helm / puzzle features in headless Chromium:
// relay + host phone + one crew phone + TV. Plays THRESHOLD and poses the host's sim.
//   node tests/e2e_story.mjs        (SHOTS=dir for the output folder)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startRelay } from '../server/dev-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8900 + Math.floor(Math.random() * 90);
const OUT = process.env.SHOTS || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startRelay(PORT, undefined, () => {});
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const errors = [];
async function phone(name, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${base}/?name=${name}&pid=pid-${name}${extra}`);
  return p;
}
const host = await phone('KIRA', '&host=1');
await sleep(800);
const crew = await phone('JONAS');
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const tv = await tvCtx.newPage();
tv.on('pageerror', (e) => errors.push('tv: ' + e.message));
await tv.goto(`${base}/screen.html`);
await sleep(1500);
const sim = (fn, arg) => host.evaluate(fn, arg);
await sim(() => { window.auroraHost.sim.autoAnswer = true; });
const tab = (p, t) => p.evaluate((t) => { const a = window.auroraApp; a.viewerPage = false; a.menu = false; a.picking = false; a.tab = Math.max(0, a.myTabs().indexOf(t)); }, t);
const shot = async (p, name, wait = 500) => { await sleep(wait); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// ---- lobby: THRESHOLD selected
await host.evaluate(() => window.auroraApp.link.send({ t: 'auto' }));
await sim(() => { const s = window.auroraHost.sim; s.campSaveOf('threshold').maxCh = 6; });
const ci = await host.evaluate(async () => (await import('./js/campaign.js')).CAMPAIGNS.findIndex((c) => c.id === 'threshold'));
await host.evaluate((ci) => window.auroraApp.send(32, 1, 1, 2, ci), ci);
await shot(host, 'st01_lobby_threshold', 800);
await host.evaluate(() => window.auroraApp.send(1));
await sleep(4500);
await shot(tv, 'st02_tv_act_title', 200);

// ---- helm: autopilot steering round a planet, with a three-leg course
await sim(() => {
  const s = window.auroraHost.sim, P = s.P, K = { AP_WAYPOINT: 1 };
  if (s.dlg) s.endDialog(true);
  s.arrive(2); // Vel'anar
  const t = s.now / 1000, pl = s.sysDef.planets[1];
  const a = pl.phase + (t / (pl.period * 6)) * Math.PI * 2, px = 80000 + Math.cos(a) * pl.orbit, py = 80000 + Math.sin(a) * pl.orbit;
  Object.assign(P, { dock: 0, x: px - 15000, y: py + 1500, vx: 0, vy: 0, hdg: 90, desHdg: 90 });
  s.handleCmd({ cmd: 8, a: 1, c: px + 14000, d: py });
  s.handleCmd({ cmd: 8, a: 2, c: px + 14000, d: py + 20000 });
  s.handleCmd({ cmd: 8, a: 2, c: px - 6000, d: py + 26000 });
  s.handleCmd({ cmd: 3, a: 1, c: 75 });
  s.handleCmd({ cmd: 7, a: K.AP_WAYPOINT });
  P.shieldsOn = true; P.shieldRaise = 1; P.shRange = 0.4;
});
await sleep(6000);
await tab(host, 0); await shot(host, 'st10_helm_avoid');
await tab(host, 1); await shot(host, 'st11_nav_course');
await tab(crew, 6); await shot(crew, 'st12_engineering');
await tab(crew, 4); await shot(crew, 'st13_tactical_shields');
await sim(() => { window.auroraHost.sim.handleCmd({ cmd: 26, a: 4, b: 60 }); });
await tab(crew, 5); await shot(crew, 'st13b_shields_low_power', 800);
await sim(() => { window.auroraHost.sim.handleCmd({ cmd: 26, a: 4, b: 100 }); });
await tab(host, 2); await shot(host, 'st14_science_range');

// ---- comms: Fleet Command waiting for a report, a long log with repeats
await sim(() => {
  const s = window.auroraHost.sim;
  for (let i = 0; i < 30; i++) s.say(252, i % 4, `LOG LINE ${i + 1}: SENSOR SWEEP NOMINAL, NOTHING TO REPORT IN SECTOR ${i}.`);
  for (let i = 0; i < 3; i++) s.say(252, 1, 'PROXIMITY ALERT - WE\'RE SKIMMING THE ATMOSPHERE! PULL UP!');
  s.fleetCall = 't_rep1'; s.fleetCallAt = s.now;
});
await tab(host, 3); await shot(host, 'st20_comms_fleet', 1200);
await sim(() => { const s = window.auroraHost.sim; s.fleetCall = null; s.handleCmd({ cmd: 13, a: 250 }); });
await shot(host, 'st21_comms_fleet_call', 1200);
await shot(tv, 'st22_tv_fleet_call', 100);

// ---- the puzzles: put each on the science hold and the main viewer
await sim(() => { const s = window.auroraHost.sim; if (s.dlg) s.endDialog(true); s.P.arts = []; s.addArt('anchorshard', 1); s.addArt('datacrystal', 0); s.addArt('recorder2', 0); });
await sim(() => { const s = window.auroraHost.sim; const h = s.P.arts[0]; s.handleCmd({ cmd: 49, a: 0, b: h.uid }); s.handleCmd({ cmd: 49, a: 1, b: h.uid, c: 1 }); s.handleCmd({ cmd: 49, a: 2, b: h.uid, c: 1 }); });
await tab(host, 2);
await host.evaluate(async () => { const m = await import('./js/stations/helm.js'); m.science.hold = true; m.science.artSel = 0; });
await shot(host, 'st30_science_rings', 900);
await shot(tv, 'st31_tv_rings', 100);
await sim(() => { const s = window.auroraHost.sim; const h = s.P.arts[1]; s.handleCmd({ cmd: 49, a: 0, b: h.uid }); const key = s.pzSecret[h.uid];
  const tries = [[0, 1, 2, 3], [key[0], key[2], 4, 5].filter((v, i, a) => a.indexOf(v) === i).concat([0, 1, 2, 3, 4, 5]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4)];
  for (const t of tries) { for (const g of t) s.handleCmd({ cmd: 49, a: 1, b: h.uid, c: g }); s.handleCmd({ cmd: 49, a: 3, b: h.uid }); }
  s.handleCmd({ cmd: 49, a: 1, b: h.uid, c: key[0] }); });
await host.evaluate(async () => { const m = await import('./js/stations/helm.js'); m.science.artSel = 1; });
await shot(host, 'st32_science_cipher', 900);
await shot(tv, 'st33_tv_cipher', 100);
await sim(() => { const s = window.auroraHost.sim; const h = s.P.arts[1]; const key = s.pzSecret[h.uid]; h.pz.cur = []; for (const g of key) s.handleCmd({ cmd: 49, a: 1, b: h.uid, c: g }); s.handleCmd({ cmd: 49, a: 3, b: h.uid }); s.handleCmd({ cmd: 49, a: 1, b: h.uid, c: 2 }); s.handleCmd({ cmd: 49, a: 9, b: h.uid }); });
await shot(host, 'st34_science_archive', 900);
await shot(tv, 'st35_tv_archive', 100);
await sim(() => { const s = window.auroraHost.sim; const h = s.P.arts[2]; s.handleCmd({ cmd: 49, a: 0, b: h.uid }); s.handleCmd({ cmd: 49, a: 2, b: h.uid, c: 1 }); s.handleCmd({ cmd: 49, a: 2, b: h.uid, c: 1 }); });
await host.evaluate(async () => { const m = await import('./js/stations/helm.js'); m.science.artSel = 2; });
await shot(host, 'st36_science_tune', 900);
await shot(tv, 'st37_tv_tune', 100);

// ---- a crewmate asks for HELM: the holder gets the prompt
await crew.evaluate(() => { const a = window.auroraApp; a.picking = true; });
await shot(crew, 'st40_crew_change_roles', 600);
await crew.evaluate(() => window.auroraApp.link.send({ t: 'reqrole', tab: 0 }));
await shot(host, 'st41_host_role_prompt', 900);
await shot(crew, 'st42_crew_asked', 100);
await host.evaluate(() => { const r = window.auroraApp.w.lobby.reqs.find((q) => q.state === 'ask'); window.auroraApp.link.send({ t: 'reqans', id: r.id, ok: 1 }); });
await sleep(800);
const roles = await host.evaluate(() => window.auroraApp.w.lobby.players.map((p) => `${p.name}=${p.roles.join('/')}`).join(' '));
console.log('roles after giving helm:', roles);
await shot(crew, 'st43_crew_granted', 100);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
server.close && server.close();
process.exit(errors.length ? 1 : 0);
