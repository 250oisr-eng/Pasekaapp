package ru.paseka.journal.qa.archive;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "PasekaSafExport")
public class PasekaSafExportPlugin extends Plugin {
    private static final long MAX_BYTES = 256L * 1024L * 1024L;
    private static final int MAX_CHUNK = 48 * 1024;
    private File staging;
    private FileOutputStream stagingStream;
    private MessageDigest stagedDigest;
    private String expectedDigest;
    private String pendingName;
    private long expectedBytes, receivedBytes;

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return builder.toString();
    }

    private synchronized void reset() {
        try { if (stagingStream != null) stagingStream.close(); } catch (Exception ignored) {}
        stagingStream = null;
        if (staging != null && staging.exists()) staging.delete(); // Only own disposable QA cache.
        staging = null;
        stagedDigest = null;
        expectedDigest = null;
        pendingName = null;
        expectedBytes = receivedBytes = 0;
    }

    @PluginMethod
    public synchronized void begin(PluginCall call) {
        if (staging != null) { call.reject("QA_SAF_BLOCKED: export already pending"); return; }
        final String name = call.getString("name");
        final Long length = call.getLong("byteLength");
        final String checksum = call.getString("sha256");
        if (name == null || !name.matches("paseka-full-idb-\\d{4}-\\d{2}-\\d{2}\\.json")
            || length == null || length < 1 || length > MAX_BYTES
            || checksum == null || !checksum.matches("[0-9a-f]{64}")) {
            call.reject("QA_SAF_BLOCKED: invalid archive metadata"); return;
        }
        try {
            stagedDigest = MessageDigest.getInstance("SHA-256");
            staging = new File(getContext().getCacheDir(), "qa-saf-" + UUID.randomUUID() + ".part");
            stagingStream = new FileOutputStream(staging, false);
            pendingName = name;
            expectedBytes = length;
            expectedDigest = checksum;
            receivedBytes = 0;
            call.resolve();
        } catch (Exception error) {
            reset();
            call.reject("QA_SAF_BLOCKED: cannot create private staging file", error);
        }
    }

    @PluginMethod
    public synchronized void append(PluginCall call) {
        if (stagingStream == null || stagedDigest == null) {
            call.reject("QA_SAF_BLOCKED: begin required"); return;
        }
        try {
            String encoded = call.getString("chunk");
            if (encoded == null || encoded.isEmpty() || encoded.length() > 70_000)
                throw new IllegalArgumentException("Invalid archive chunk");
            byte[] chunk = Base64.decode(encoded, Base64.NO_WRAP);
            if (chunk.length < 1 || chunk.length > MAX_CHUNK || receivedBytes + chunk.length > expectedBytes)
                throw new IllegalArgumentException("Archive chunk out of bounds");
            stagingStream.write(chunk);
            stagedDigest.update(chunk);
            receivedBytes += chunk.length;
            call.resolve();
        } catch (Exception error) {
            reset();
            call.reject("QA_SAF_BLOCKED: archive staging failed", error);
        }
    }

    @PluginMethod
    public synchronized void finish(PluginCall call) {
        if (stagingStream == null || staging == null) {
            call.reject("QA_SAF_BLOCKED: export not started"); return;
        }
        try {
            stagingStream.flush();
            stagingStream.getFD().sync();
            stagingStream.close();
            stagingStream = null;
            if (receivedBytes != expectedBytes || !hex(stagedDigest.digest()).equals(expectedDigest))
                throw new IllegalArgumentException("Staged archive length/SHA-256 mismatch");
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, pendingName);
            startActivityForResult(call, intent, "saved");
        } catch (Exception error) {
            reset();
            call.reject("QA_SAF_BLOCKED: archive preflight failed", error);
        }
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) { reset(); return; }
        final Uri target = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || target == null) {
            reset();
            call.reject("QA_SAF_CANCELLED: no file was confirmed in Android picker");
            return;
        }
        final File source;
        final String digest, name;
        final long length;
        synchronized (this) {
            source = staging; digest = expectedDigest; name = pendingName; length = expectedBytes;
        }
        new Thread(() -> {
            try {
                if (source == null || digest == null) throw new IllegalStateException("Missing staged archive");
                try (InputStream input = new FileInputStream(source);
                     OutputStream output = getContext().getContentResolver().openOutputStream(target, "wt")) {
                    if (output == null) throw new IllegalStateException("Android provider refused output");
                    byte[] buffer = new byte[64 * 1024];
                    int n; while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
                    output.flush();
                }
                MessageDigest readback = MessageDigest.getInstance("SHA-256");
                long copied = 0;
                try (InputStream input = getContext().getContentResolver().openInputStream(target)) {
                    if (input == null) throw new IllegalStateException("Android provider refused readback");
                    byte[] buffer = new byte[64 * 1024];
                    int n; while ((n = input.read(buffer)) != -1) {
                        readback.update(buffer, 0, n); copied += n;
                    }
                }
                if (copied != length || !hex(readback.digest()).equals(digest))
                    throw new IllegalStateException("Target file size/SHA-256 mismatch");
                JSObject info = new JSObject();
                info.put("fileName", name);
                info.put("byteLength", length);
                info.put("sha256", digest);
                getActivity().runOnUiThread(() -> { reset(); call.resolve(info); });
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> {
                    reset();
                    call.reject("QA_SAF_BLOCKED: destination unverified; check and preserve any partial file", error);
                });
            }
        }, "qa-saf-copy-verify").start();
    }

    @PluginMethod
    public synchronized void abort(PluginCall call) {
        reset();
        call.resolve();
    }
}
