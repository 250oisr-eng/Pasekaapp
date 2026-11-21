// TEST-ONLY scoped-storage bridge source. This module DOES NOT patch the production APK.
// A future isolated proof build may inject this bridge only into a NEW package.
export const TEST_PACKAGE = 'ru.paseka.journal.archive.fileproof329';
export const TEST_FOLDER = 'Download/PasekaProof329';
export const TEST_PREFIX = 'paseka-proof329-';
export function isolatedMediaStoreBridgeJava(packageName = TEST_PACKAGE) {
  if (packageName !== TEST_PACKAGE) throw new Error('ISOLATED_PACKAGE_ONLY');
  return `package ${packageName};

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;
import android.util.Base64;

public final class IsolatedMediaStoreProofBridge {
    private static final String MIME = "application/vnd.paseka.archive";
    private static final String FOLDER = Environment.DIRECTORY_DOWNLOADS + "/PasekaProof329/";
    private static final String PREFIX = "paseka-proof329-";
    private static final int MAX_FILE = 1048576;
    private final Context app;
    private String lastError = "";
    private String lastUri = "";

    public IsolatedMediaStoreProofBridge(Context context) {
        this.app = context.getApplicationContext();
    }

    private static String sha(byte[] data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(data);
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return out.toString();
    }

    private boolean exists(String name) throws Exception {
        String[] fields = {MediaStore.MediaColumns._ID};
        String predicate = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
          + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
        try (Cursor rows = app.getContentResolver().query(
          MediaStore.Downloads.EXTERNAL_CONTENT_URI, fields, predicate,
          new String[]{name, FOLDER}, null)) {
            if (rows == null) throw new IllegalStateException("MEDIASTORE_COLLISION_QUERY_FAILED");
            return rows.moveToFirst();
        }
    }

    @JavascriptInterface
    public synchronized String saveAndReadBack(String base64, String sha256) {
        // Only tiny synthetic test files; no arbitrary filename, folder or URI from JS.
        try {
            if (lastUri.length() != 0) throw new IllegalStateException("ONE_SHOT_ALREADY_USED");
            if (base64 == null || base64.length() > 1500000 ||
                sha256 == null || !sha256.matches("[a-f0-9]{64}"))
                throw new IllegalArgumentException("INVALID_TEST_INPUT");
            byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
            if (bytes.length < 12 || bytes.length > MAX_FILE)
                throw new IllegalArgumentException("TEST_FILE_SIZE_LIMIT");
            if (!Arrays.equals(Arrays.copyOfRange(bytes, 0, 8),
                  new byte[]{'P','A','S','E','K','A','0','1'}))
                throw new IllegalArgumentException("NOT_PASEKA01");
            if (!sha(bytes).equals(sha256))
                throw new IllegalArgumentException("SOURCE_SHA256_MISMATCH");
            String name = PREFIX + UUID.randomUUID().toString() + ".paseka";
            if (exists(name)) throw new IllegalStateException("ISOLATED_NAME_COLLISION");
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, MIME);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = app.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("MEDIASTORE_INSERT_FAILED");
            // Never delete an existing file, URI or any user content. Failure leaves
            // the newly-created proof item untouched (possibly pending).
            try (OutputStream out = app.getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) throw new IllegalStateException("MEDIASTORE_WRITE_UNAVAILABLE");
                out.write(bytes);
                out.flush();
            }
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (app.getContentResolver().update(uri, publish, null, null) != 1)
                throw new IllegalStateException("MEDIASTORE_PUBLISH_FAILED");
            java.io.ByteArrayOutputStream copy = new java.io.ByteArrayOutputStream();
            try (InputStream in = app.getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IllegalStateException("MEDIASTORE_READ_UNAVAILABLE");
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (copy.size() + n > MAX_FILE) throw new IllegalStateException("READBACK_SIZE_LIMIT");
                    copy.write(buf, 0, n);
                }
            }
            byte[] readBack = copy.toByteArray();
            if (!Arrays.equals(bytes, readBack)) throw new IllegalStateException("MEDIASTORE_READBACK_DIFFERS");
            if (!sha(readBack).equals(sha256)) throw new IllegalStateException("MEDIASTORE_READBACK_SHA_MISMATCH");
            lastUri = uri.toString();
            lastError = "";
            return "PASS:" + readBack.length + ":" + sha256;
        } catch (Exception error) {
            lastError = error.getClass().getSimpleName() + ":" +
                (error.getMessage() == null ? "UNKNOWN" : error.getMessage());
            return "BLOCKED";
        }
    }

    @JavascriptInterface public synchronized String getLastError() { return lastError; }
    @JavascriptInterface public synchronized String getSavedUri() { return lastUri; }
}
`;
}
