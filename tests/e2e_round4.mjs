// Screenshots of the round-4 changes: TV join info, helm autopilot options (course / intercept / escort /
// dock / orbit), tactical's intercept plot and wing orders (IRON TIDE), the shield generator's colours,
// cracked screens as the hull fails, and the cause of death.   SHOTS=dir node tests/e2e_round4.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startRelay } from '../server/dev-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8700 + Math.floor(Math.random() * 90);
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
const tab = (p, t) => p.evaluate((t) => { const a = window.auroraApp; a.viewerPage = false; a.menu = false; a.picking = false; a.tab = Math.max(0, a.myTabs().indexOf(t)); }, t);
const shot = async (p, name, wait = 500) => { await sleep(wait); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await sim(() => { window.auroraHost.sim.autoAnswer = true; });
await host.evaluate(() => window.auroraApp.link.send({ t: 'auto' }));
await sleep(600);
await shot(tv, 'r4_01_tv_lobby_join');
const ci = await host.evaluate(async () => (await import('./js/campaign.js')).CAMPAIGNS.findIndex((c) => c.id === 'tide'));
await host.evaluate((ci) => window.auroraApp.send(32, 0, 1, 2, ci), ci);
await shot(host, 'r4_02_lobby_iron_tide', 600);
await host.evaluate(() => window.auroraApp.send(1));
await sleep(5000);
// ---- the picket: a wave in, tactical has a target, the wing is attacking it
await sim(() => {
  const s = window.auroraHost.sim; if (s.dlg) s.endDialog(true);
  s.tdStep('i1_wait'); s.camp.t = 99;
});
await sleep(4000);
await sim(() => { const s = window.auroraHost.sim; const d = s.npc.findIndex((n) => n.active && n.tide && n.alive); s.P.target = d; s.wingOrder(1); for (const id of s.wingIds()) s.npc[id].hull = id % 2 ? 62 : 88; });
await tab(crew, 4); await shot(crew, 'r4_10_tactical_wing', 1200);
await shot(tv, 'r4_11_tv_battle', 100);
// ---- helm: a friendly ship plotted - intercept and escort; then a dockable station - intercept and dock
await sim(() => { const s = window.auroraHost.sim; for (let i = 0; i < 32; i++) if (s.npc[i].tide) s.npc[i].active = false; s.handleCmd({ cmd: 43, a: 1, b: s.wingIds()[0] }); });
await tab(host, 0); await shot(host, 'r4_20_helm_intercept_escort', 900);
await sim(() => { const s = window.auroraHost.sim; s.arrive(0); s.P.x = 30000 + 9000; s.P.y = 128000; s.handleCmd({ cmd: 43, a: 1, b: 0 }); });
await shot(host, 'r4_21_helm_intercept_dock', 1200);
await sim(() => { const s = window.auroraHost.sim; s.handleCmd({ cmd: 7, a: 4, b: 0 }); });
await shot(host, 'r4_22_helm_docking', 1500);
await tab(crew, 4); await sim(() => { const s = window.auroraHost.sim; s.handleCmd({ cmd: 43, a: 1, b: 255 }); s.P.target = s.wingIds()[0]; });
await shot(crew, 'r4_23_tactical_target_unplotted', 800);
// ---- shields: generator damage colours, cracks
await sim(() => { const s = window.auroraHost.sim; s.handleCmd({ cmd: 7, a: 0 }); s.P.health[4] = 33; s.P.hull = 45; s.handleCmd({ cmd: 26, a: 4, b: 70 }); });
await tab(crew, 5); await shot(crew, 'r4_30_shields_generator_red', 900);
await sim(() => { const s = window.auroraHost.sim; s.P.health[4] = 75; s.P.hull = 12; });
await tab(host, 0); await shot(host, 'r4_31_helm_cracked', 900);
await shot(tv, 'r4_32_tv_cracked', 100);
// ---- and the end
await sim(() => { const s = window.auroraHost.sim; s.P.hull = 3; s.damagePlayer(s.P.x + 3000, s.P.y, 40, 'A TORPEDO FROM TIDE REAPER 2'); });
await shot(tv, 'r4_40_tv_destroyed_cause', 2500);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close(); server.close();
