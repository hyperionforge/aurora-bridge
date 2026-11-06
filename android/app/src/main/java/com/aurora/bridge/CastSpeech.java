package com.aurora.bridge;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Speech for the TV when the Chromecast has no voice of its own: the phone's
 * text-to-speech renders each line to a WAV file, which is shrunk to 16 kHz
 * 8-bit mu-law and sent over the Cast channel in chunks; the receiver page
 * rebuilds and plays it (web/js/ttsplayer.js).
 */
final class CastSpeech {
    interface Sender { void send(String json); }

    private final TextToSpeech tts;
    private final File dir;
    private final Sender sender;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile int gen = 1;      // bumped by stop(): lines from before are dropped
    private int seq;

    CastSpeech(TextToSpeech tts, File cacheDir, Sender sender) {
        this.tts = tts;
        this.dir = cacheDir;
        this.sender = sender;
    }

    /** The progress listener to install on the shared TextToSpeech (handles "cast..." utterances only). */
    UtteranceProgressListener listener() {
        return new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onError(String id) { deleteFor(id); }
            @Override public void onDone(String id) {
                if (id == null || !id.startsWith("cast")) return;
                worker.execute(() -> deliver(id));
            }
        };
    }

    /** Main thread. */
    void speak(String text, String lang, float pitch, float rate) {
        try {
            Locale loc = Locale.forLanguageTag(lang == null ? "en-US" : lang);
            if (tts.isLanguageAvailable(loc) < TextToSpeech.LANG_AVAILABLE) loc = Locale.US;
            tts.setLanguage(loc);
            tts.setPitch(Math.max(0.1f, Math.min(2f, pitch)));
            tts.setSpeechRate(Math.max(0.4f, Math.min(2f, rate)));
            String id = "cast_" + gen + "_" + (seq++);
            tts.synthesizeToFile(text, new Bundle(), new File(dir, id + ".wav"), id);
        } catch (Exception ignored) { }
    }

    /** Main thread. */
    void stop() {
        gen++;
        try { tts.stop(); } catch (Exception ignored) { }
        sender.send("{\"t\":\"ttsstop\",\"g\":" + gen + "}");
    }

    private void deleteFor(String id) { if (id != null) new File(dir, id + ".wav").delete(); }

    private void deliver(String id) {
        File f = new File(dir, id + ".wav");
        try {
            String[] p = id.split("_");
            int g = Integer.parseInt(p[1]), n = Integer.parseInt(p[2]);
            if (g != gen) return;
            byte[] wav = readAll(f);
            byte[] mu = toMulaw(wav, 16000);
            if (mu == null || mu.length == 0) return;
            String b64 = Base64.encodeToString(mu, Base64.NO_WRAP);
            final int CH = 45000;
            int parts = (b64.length() + CH - 1) / CH;
            for (int i = 0; i < parts; i++) {
                if (g != gen) return;
                String d = b64.substring(i * CH, Math.min(b64.length(), (i + 1) * CH));
                sender.send("{\"t\":\"tts\",\"id\":" + n + ",\"g\":" + g + ",\"i\":" + i + ",\"n\":" + parts + ",\"sr\":16000,\"d\":\"" + d + "\"}");
            }
        } catch (Exception ignored) {
        } finally {
            f.delete();
        }
    }

    private static byte[] readAll(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0, r;
            while (off < b.length && (r = in.read(b, off, b.length - off)) > 0) off += r;
            return b;
        }
    }

    private static int le16(byte[] b, int o) { return (b[o] & 0xff) | ((b[o + 1] & 0xff) << 8); }
    private static int le32(byte[] b, int o) { return le16(b, o) | (le16(b, o + 2) << 16); }

    /** 16-bit PCM WAV (any rate, mono or stereo) -> mono mu-law at outRate. */
    static byte[] toMulaw(byte[] w, int outRate) {
        if (w.length < 44 || w[0] != 'R' || w[8] != 'W') return null;
        int pos = 12, ch = 1, rate = 22050, bits = 16, dataOff = -1, dataLen = 0;
        while (pos + 8 <= w.length) {
            String idn = new String(w, pos, 4);
            int len = le32(w, pos + 4);
            if (idn.equals("fmt ")) { ch = le16(w, pos + 10); rate = le32(w, pos + 12); bits = le16(w, pos + 22); }
            else if (idn.equals("data")) { dataOff = pos + 8; dataLen = Math.min(len, w.length - dataOff); break; }
            pos += 8 + len + (len & 1);
        }
        if (dataOff < 0 || bits != 16 || ch < 1) return null;
        int frames = dataLen / (2 * ch);
        double step = (double) rate / outRate;
        if (step < 1) { step = 1; outRate = rate; }
        int outN = (int) (frames / step);
        byte[] out = new byte[outN];
        for (int i = 0; i < outN; i++) {
            int a = (int) (i * step), b = Math.max(a + 1, (int) ((i + 1) * step));
            long sum = 0; int cnt = 0;
            for (int k = a; k < b && k < frames; k++) { sum += (short) le16(w, dataOff + k * 2 * ch); cnt++; }
            out[i] = mulaw(cnt > 0 ? (int) (sum / cnt) : 0);
        }
        return out;
    }

    static byte mulaw(int pcm) {
        final int BIAS = 0x84, CLIP = 32635;
        int sign = (pcm >> 8) & 0x80;
        if (sign != 0) pcm = -pcm;
        if (pcm > CLIP) pcm = CLIP;
        pcm += BIAS;
        int exp = 7;
        for (int mask = 0x4000; (pcm & mask) == 0 && exp > 0; exp--, mask >>= 1) { }
        int man = (pcm >> (exp + 3)) & 0x0F;
        return (byte) ~(sign | (exp << 4) | man);
    }
}
