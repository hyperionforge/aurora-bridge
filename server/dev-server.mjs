// ============================================================================
// dev-server.mjs - the relay server for a PC/laptop (same protocol as the
// relay built into the Android app). Serves web/ and relays WebSocket
// messages between the host page and every station.
//
//   node server/dev-server.mjs [port]
//   then open http://localhost:8737/?host=1 on this computer (the host),
//   and http://<this-computer-ip>:8737/ on each phone.
//
// Protocol (text frames):
//   station -> relay -> host   "M <cid> <json>"   (+ "J <cid>" / "L <cid>")
//   host -> relay              "B <json>" broadcast, "T <cid> <json>" one, "I <json>" info
// The host must connect to /ws?role=host from this computer (loopback only).
// ============================================================================
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const PORT = +process.argv[2] || 8737;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };

export function startRelay(port = PORT, root = ROOT, log = console.log) {
  let host = null, nextId = 1, info = '{}';
  const clients = new Map();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/info') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      return res.end(info);
    }
    if (url.pathname === '/lan') {
      const urls = [];
      for (const list of Object.values(os.networkInterfaces()))
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}/`);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ urls }));
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const loop = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
    if (url.searchParams.get('role') === 'host') {
      if (!loop) { ws.close(4003, 'host must be local'); return; }
      if (host) host.close(4001, 'replaced');
      host = ws;
      log('host connected');
      for (const cid of clients.keys()) ws.send('J ' + cid);
      ws.on('message', (d) => {
        const s = d.toString();
        const op = s[0];
        if (op === 'B') { const m = s.slice(2); for (const c of clients.values()) if (c.readyState === 1) c.send(m); }
        else if (op === 'T') { const sp = s.indexOf(' ', 2); const c = clients.get(s.slice(2, sp)); if (c && c.readyState === 1) c.send(s.slice(sp + 1)); }
        else if (op === 'I') info = s.slice(2);
      });
      ws.on('close', () => {
        if (host !== ws) return;
        host = null;
        log('host gone');
        for (const c of clients.values()) if (c.readyState === 1) c.send('{"t":"nohost"}');
      });
      return;
    }
    const cid = 'c' + nextId++;
    clients.set(cid, ws);
    if (host) host.send('J ' + cid);
    else ws.send('{"t":"nohost"}');
    ws.on('message', (d) => { if (host && host.readyState === 1) host.send('M ' + cid + ' ' + d.toString()); });
    ws.on('close', () => { clients.delete(cid); if (host && host.readyState === 1) host.send('L ' + cid); });
  });
  server.listen(port, '0.0.0.0', () => log(`Aurora bridge relay on http://0.0.0.0:${port}/  (host: http://localhost:${port}/?host=1)`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startRelay();
