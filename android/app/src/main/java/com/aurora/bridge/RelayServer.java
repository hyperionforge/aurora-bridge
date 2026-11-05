package com.aurora.bridge;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The relay server built into the app (plain Java, no Android classes, so it
 * can be tested on a PC). It serves the game's web files and relays
 * WebSocket messages between the hosting page and every station:
 *
 *   station -> relay -> host   "M <cid> <json>", plus "J <cid>" / "L <cid>"
 *   host -> relay              "B <json>" to everyone, "T <cid> <json>" to one,
 *                              "I <json>" public info for the /info endpoint
 *
 * Only a page on this device (loopback) may connect as the host.
 * Same protocol as server/dev-server.mjs.
 */
public class RelayServer {
    /** Where the web files come from (Android assets, or a folder on a PC). */
    public interface Assets {
        byte[] read(String path) throws IOException;
    }

    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int MAX_FRAME = 1 << 20;
    private static final int QUEUE_LIMIT = 400;

    private final Assets assets;
    private final int port;
    private ServerSocket server;
    private volatile boolean running;
    private final Map<String, Conn> clients = new ConcurrentHashMap<>();
    private volatile Conn host;
    private final AtomicInteger nextId = new AtomicInteger(1);
    private volatile String info = "{}";

    public RelayServer(Assets assets, int port) {
        this.assets = assets;
        this.port = port;
    }

    public int getPort() {
        return server != null ? server.getLocalPort() : port;
    }

    public void start() throws IOException {
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(port), 50);
        running = true;
        Thread t = new Thread(this::acceptLoop, "relay-accept");
        t.setDaemon(true);
        t.start();
        Thread p = new Thread(this::pingLoop, "relay-ping");
        p.setDaemon(true);
        p.start();
    }

    public void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        for (Conn c : clients.values()) c.close();
        if (host != null) host.close();
    }

    public boolean hasHost() { return host != null; }

    public String getInfo() { return info; }

    // ------------------------------------------------------------------ accept / ping
    private void acceptLoop() {
        while (running) {
            try {
                Socket s = server.accept();
                s.setTcpNoDelay(true);
                Thread t = new Thread(() -> handle(s), "relay-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void pingLoop() {
        while (running) {
            try { Thread.sleep(10000); } catch (InterruptedException e) { return; }
            for (Conn c : clients.values()) c.queue(Frame.ping());
            Conn h = host;
            if (h != null) h.queue(Frame.ping());
        }
    }

    // ------------------------------------------------------------------ HTTP
    private void handle(Socket s) {
        try {
            s.setSoTimeout(15000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) { s.close(); return; }
            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int c = line.indexOf(':');
                if (c > 0) headers.put(line.substring(0, c).trim().toLowerCase(Locale.ROOT), line.substring(c + 1).trim());
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) { s.close(); return; }
            String target = parts[1];
            String path = target, query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }

            if ("/ws".equals(path) && "websocket".equalsIgnoreCase(headers.get("upgrade"))) {
                websocket(s, in, out, headers.get("sec-websocket-key"), query);
                return;
            }
            if ("/info".equals(path)) {
                respond(out, 200, "application/json", info.getBytes(StandardCharsets.UTF_8));
            } else if ("/lan".equals(path)) {
                StringBuilder sb = new StringBuilder("{\"urls\":[");
                List<String> ips = lanAddresses();
                for (int i = 0; i < ips.size(); i++) {
                    if (i > 0) sb.append(',');
                    sb.append("\"http://").append(ips.get(i)).append(':').append(getPort()).append("/\"");
                }
                sb.append("]}");
                respond(out, 200, "application/json", sb.toString().getBytes(StandardCharsets.UTF_8));
            } else {
                serveFile(out, path);
            }
            out.flush();
            s.close();
        } catch (IOException e) {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private void serveFile(OutputStream out, String path) throws IOException {
        String p = urlDecode(path);
        if (p.endsWith("/")) p += "index.html";
        if (p.startsWith("/")) p = p.substring(1);
        if (p.contains("..") || p.contains("\\")) { respond(out, 403, "text/plain", "forbidden".getBytes(StandardCharsets.UTF_8)); return; }
        byte[] data;
        try {
            data = assets.read(p);
        } catch (IOException e) {
            data = null;
        }
        if (data == null) { respond(out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8)); return; }
        respond(out, 200, contentType(p), data);
    }

    private static void respond(OutputStream out, int code, String type, byte[] body) throws IOException {
        String status = code == 200 ? "OK" : code == 404 ? "Not Found" : code == 403 ? "Forbidden" : "Error";
        String head = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
    }

    static String contentType(String p) {
        String l = p.toLowerCase(Locale.ROOT);
        if (l.endsWith(".html")) return "text/html; charset=utf-8";
        if (l.endsWith(".js") || l.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (l.endsWith(".css")) return "text/css; charset=utf-8";
        if (l.endsWith(".json")) return "application/json";
        if (l.endsWith(".woff2")) return "font/woff2";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private static String urlDecode(String s) {
        try {
            return java.net.URLDecoder.decode(s.replace("+", "%2B"), "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
            if (sb.length() > 8192) throw new IOException("header too long");
        }
        if (c == -1 && sb.length() == 0) return null;
        return sb.toString();
    }

    /** IPv4 addresses other phones can reach us on (Wi-Fi, hotspot, ethernet). */
    public static List<String> lanAddresses() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces();
            if (e == null) return out;
            for (NetworkInterface ni : Collections.list(e)) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase(Locale.ROOT);
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("dummy") || name.startsWith("tun")) continue; // mobile data / vpn
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        String ip = a.getHostAddress();
                        if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) out.add(0, ip); else out.add(ip);
                    }
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    // ------------------------------------------------------------------ WebSocket
    private void websocket(Socket s, InputStream in, OutputStream out, String key, String query) throws IOException {
        if (key == null) { s.close(); return; }
        String accept;
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            accept = base64(sha1.digest((key + WS_GUID).getBytes(StandardCharsets.ISO_8859_1)));
        } catch (Exception e) {
            s.close();
            return;
        }
        boolean wantsHost = query.contains("role=host");
        if (wantsHost && !s.getInetAddress().isLoopbackAddress()) {
            respond(out, 403, "text/plain", "host must be on this device".getBytes(StandardCharsets.UTF_8));
            s.close();
            return;
        }
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
                + accept + "\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.flush();
        s.setSoTimeout(45000); // we ping every 10 s, so silence for 45 s means the phone is gone
        Conn c = new Conn(s, out, wantsHost ? "host" : "c" + nextId.getAndIncrement());
        c.startWriter();
        if (wantsHost) {
            Conn old = host;
            host = c;
            if (old != null) old.close();
            for (String cid : clients.keySet()) c.queueText("J " + cid);
        } else {
            clients.put(c.id, c);
            Conn h = host;
            if (h != null) h.queueText("J " + c.id);
            else c.queueText("{\"t\":\"nohost\"}");
        }
        try {
            readLoop(c, in);
        } finally {
            c.close();
            if (wantsHost) {
                if (host == c) {
                    host = null;
                    for (Conn cl : clients.values()) cl.queueText("{\"t\":\"nohost\"}");
                }
            } else {
                clients.remove(c.id);
                Conn h = host;
                if (h != null) h.queueText("L " + c.id);
            }
        }
    }

    private void readLoop(Conn c, InputStream in) {
        ByteArrayOutputStream msg = new ByteArrayOutputStream();
        int msgOp = 0;
        try {
            while (running && !c.closed) {
                int b0 = in.read();
                if (b0 < 0) return;
                int b1 = readByte(in);
                boolean fin = (b0 & 0x80) != 0;
                int op = b0 & 0x0F;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;
                if (len == 126) len = (readByte(in) << 8) | readByte(in);
                else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
                }
                if (len > MAX_FRAME) return;
                byte[] mask = new byte[4];
                if (masked) readFully(in, mask);
                byte[] data = new byte[(int) len];
                readFully(in, data);
                if (masked) for (int i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
                if (op == 0x8) { c.queue(Frame.close()); return; }
                if (op == 0x9) { c.queue(new Frame(0xA, data)); continue; }
                if (op == 0xA) continue;
                if (op == 0x1 || op == 0x2) { msg.reset(); msgOp = op; }
                if (op == 0x0 || op == 0x1 || op == 0x2) {
                    msg.write(data, 0, data.length);
                    if (msg.size() > MAX_FRAME) return;
                    if (fin && msgOp == 0x1) onText(c, new String(msg.toByteArray(), StandardCharsets.UTF_8));
                }
            }
        } catch (SocketTimeoutException e) {
            // silent phone - drop it
        } catch (IOException e) {
            // connection lost
        }
    }

    private void onText(Conn from, String text) {
        if (from == host) {
            if (text.length() < 2) return;
            char op = text.charAt(0);
            if (op == 'B') {
                Frame f = Frame.text(text.substring(2));
                for (Conn c : clients.values()) c.queue(f);
            } else if (op == 'T') {
                int sp = text.indexOf(' ', 2);
                if (sp < 0) return;
                Conn c = clients.get(text.substring(2, sp));
                if (c != null) c.queueText(text.substring(sp + 1));
            } else if (op == 'I') {
                info = text.substring(2);
            }
        } else {
            Conn h = host;
            if (h != null) h.queueText("M " + from.id + " " + text);
        }
    }

    private static int readByte(InputStream in) throws IOException {
        int b = in.read();
        if (b < 0) throw new EOFException();
        return b;
    }

    private static void readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n < 0) throw new EOFException();
            off += n;
        }
    }

    // ------------------------------------------------------------------ frames + connections
    static final class Frame {
        final byte[] bytes;

        Frame(int op, byte[] payload) {
            int n = payload.length;
            int head = n < 126 ? 2 : n < 65536 ? 4 : 10;
            bytes = new byte[head + n];
            bytes[0] = (byte) (0x80 | op);
            if (n < 126) {
                bytes[1] = (byte) n;
            } else if (n < 65536) {
                bytes[1] = 126;
                bytes[2] = (byte) (n >> 8);
                bytes[3] = (byte) n;
            } else {
                bytes[1] = 127;
                for (int i = 0; i < 8; i++) bytes[2 + i] = (byte) (((long) n) >> (56 - 8 * i));
            }
            System.arraycopy(payload, 0, bytes, head, n);
        }

        static Frame text(String s) { return new Frame(0x1, s.getBytes(StandardCharsets.UTF_8)); }
        static Frame ping() { return new Frame(0x9, new byte[0]); }
        static Frame close() { return new Frame(0x8, new byte[0]); }
    }

    final class Conn {
        final Socket socket;
        final OutputStream out;
        final String id;
        final LinkedBlockingQueue<Frame> q = new LinkedBlockingQueue<>();
        volatile boolean closed;

        Conn(Socket socket, OutputStream out, String id) {
            this.socket = socket;
            this.out = out;
            this.id = id;
        }

        void startWriter() {
            Thread t = new Thread(() -> {
                try {
                    while (!closed) {
                        Frame f = q.poll(1, TimeUnit.SECONDS);
                        if (f == null) continue;
                        out.write(f.bytes);
                        if (q.isEmpty()) out.flush();
                    }
                } catch (Exception e) {
                    close();
                }
            }, "relay-writer-" + id);
            t.setDaemon(true);
            t.start();
        }

        void queueText(String s) { queue(Frame.text(s)); }

        void queue(Frame f) {
            if (closed) return;
            // a phone that stops reading (asleep, out of range) must not use up memory:
            // drop its backlog - the next snapshots bring it up to date anyway
            if (q.size() > QUEUE_LIMIT) q.clear();
            q.offer(f);
        }

        void close() {
            if (closed) return;
            closed = true;
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    // ------------------------------------------------------------------ base64 (java.util.Base64 needs Android 8)
    private static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    static String base64(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int b = (d[i] & 0xFF) << 16;
            if (i + 1 < d.length) b |= (d[i + 1] & 0xFF) << 8;
            if (i + 2 < d.length) b |= d[i + 2] & 0xFF;
            sb.append(B64[(b >> 18) & 63]).append(B64[(b >> 12) & 63]);
            sb.append(i + 1 < d.length ? B64[(b >> 6) & 63] : '=');
            sb.append(i + 2 < d.length ? B64[b & 63] : '=');
        }
        return sb.toString();
    }
}
