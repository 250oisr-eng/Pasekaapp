import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function patchMainActivitySource(source) {
  if (typeof source !== 'string' || !source.includes('extends BridgeActivity')) {
    throw new Error('Unexpected Capacitor MainActivity; refusing to patch an unknown Android entry point.');
  }
  if (source.includes('PasekaArchiveDownloadBridge')) return source;
  const imports = [
    'import android.os.Bundle;',
    'import com.getcapacitor.BridgeActivity;'
  ];
  let patched = source;
  if (!/import\s+android\.os\.Bundle;/.test(patched)) patched = patched.replace(/import\s+com\.getcapacitor\.BridgeActivity;/, imports.join('\n'));
  const classPattern = /(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/;
  if (!classPattern.test(patched)) throw new Error('Could not locate Capacitor MainActivity class declaration.');
  patched = patched.replace(classPattern, `$1
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) {
            throw new IllegalStateException("Capacitor WebView is unavailable");
        }
        getBridge().getWebView().addJavascriptInterface(
            new PasekaArchiveDownloadBridge(this),
            "PasekaArchiveDownload"
        );
    }
`);
  return patched;
}

export function createArchiveDownloadBridgeSource(packageName) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*([.][A-Za-z_$][A-Za-z0-9_$]*)*$/.test(packageName)) {
    throw new Error('Invalid Android package name.');
  }
  return `package ${packageName};

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class PasekaArchiveDownloadBridge {
    private static final String MIME = "application/vnd.paseka.archive";
    private final Context context;
    private final Map<String, Session> sessions = new HashMap<>();
    private volatile String lastError = "";

    private static final class Session {
        final Uri uri;
        final OutputStream output;
        Session(Uri uri, OutputStream output) { this.uri = uri; this.output = output; }
    }

    public PasekaArchiveDownloadBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public synchronized String beginFile(String displayName, String mimeType) {
        Uri pendingUri = null;
        OutputStream pendingOutput = null;
        try {
            String safeName = displayName == null ? "" : displayName.replaceAll("[^a-zA-Z0-9._-]", "_");
            if (!safeName.matches("paseka-full-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]paseka")) {
                throw new IllegalArgumentException("Недопустимое имя файла архива");
            }
            if (!MIME.equals(mimeType)) throw new IllegalArgumentException("Недопустимый тип архива");
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, MIME);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Пасека");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            pendingUri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (pendingUri == null) throw new IllegalStateException("Android не создал файл в папке загрузок");
            pendingOutput = context.getContentResolver().openOutputStream(pendingUri, "w");
            if (pendingOutput == null) throw new IllegalStateException("Не удалось открыть файл для записи");
            String id = UUID.randomUUID().toString();
            sessions.put(id, new Session(pendingUri, pendingOutput));
            lastError = "";
            return id;
        } catch (Exception error) {
            // Inserting a pending MediaStore row may succeed even when opening
            // its output stream throws. Do not leave an orphaned Downloads item.
            if (pendingOutput != null) {
                try { pendingOutput.close(); } catch (Exception ignored) {}
            }
            if (pendingUri != null) {
                try { context.getContentResolver().delete(pendingUri, null, null); } catch (Exception ignored) {}
            }
            lastError = error.getMessage() == null ? error.toString() : error.getMessage();
            return "";
        }
    }

    @JavascriptInterface
    public synchronized boolean appendChunk(String id, String base64) {
        try {
            Session session = sessions.get(id);
            if (session == null) throw new IllegalStateException("Сеанс записи файла не найден");
            if (base64 == null || base64.length() > 400000) throw new IllegalArgumentException("Недопустимый размер блока архива");
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            session.output.write(bytes);
            lastError = "";
            return true;
        } catch (Exception error) {
            lastError = error.getMessage() == null ? error.toString() : error.getMessage();
            return false;
        }
    }

    @JavascriptInterface
    public synchronized String finishFile(String id) {
        Session session = sessions.remove(id);
        if (session == null) {
            lastError = "Сеанс записи файла не найден";
            return "";
        }
        try {
            session.output.flush();
            session.output.close();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            int updated = context.getContentResolver().update(session.uri, values, null, null);
            if (updated != 1) throw new IllegalStateException("Android не завершил сохранение файла");
            lastError = "";
            return session.uri.toString();
        } catch (Exception error) {
            try { context.getContentResolver().delete(session.uri, null, null); } catch (Exception ignored) {}
            lastError = error.getMessage() == null ? error.toString() : error.getMessage();
            return "";
        }
    }

    @JavascriptInterface
    public synchronized void cancelFile(String id) {
        Session session = sessions.remove(id);
        if (session == null) return;
        try { session.output.close(); } catch (Exception ignored) {}
        try { context.getContentResolver().delete(session.uri, null, null); } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public String getLastError() { return lastError; }
}
`;
}

async function main() {
  const root = process.cwd();
  const configPath = resolve(root, process.argv[2] || 'capacitor.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const packageName = config.appId;
  if (!packageName || !/^[A-Za-z_$][A-Za-z0-9_$]*([.][A-Za-z_$][A-Za-z0-9_$]*)*$/.test(packageName)) {
    throw new Error('Invalid capacitor appId; refusing to patch Android source.');
  }
  const javaPath = resolve(root, 'android/app/src/main/java', ...packageName.split('.'), 'MainActivity.java');
  const source = await readFile(javaPath, 'utf8');
  const patched = patchMainActivitySource(source);
  await writeFile(javaPath, patched, 'utf8');
  const bridgePath = resolve(dirname(javaPath), 'PasekaArchiveDownloadBridge.java');
  await mkdir(dirname(bridgePath), { recursive: true });
  await writeFile(bridgePath, createArchiveDownloadBridgeSource(packageName), 'utf8');
  console.log('Installed Android Downloads bridge in generated project:', packageName);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
