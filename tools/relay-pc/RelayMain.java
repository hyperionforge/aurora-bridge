package com.aurora.bridge;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

/** Runs the app's relay server on a PC: java RelayMain [port] [webDir]. Used by tests/e2e.mjs java. */
public class RelayMain {
    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8737;
        File root = new File(args.length > 1 ? args[1] : "web").getCanonicalFile();
        RelayServer s = new RelayServer(path -> {
            File f = new File(root, path).getCanonicalFile();
            if (!f.getPath().startsWith(root.getPath()) || !f.isFile()) throw new IOException("not found");
            return Files.readAllBytes(f.toPath());
        }, port);
        s.start();
        System.out.println("java relay on port " + s.getPort() + " serving " + root);
        Thread.currentThread().join();
    }
}
