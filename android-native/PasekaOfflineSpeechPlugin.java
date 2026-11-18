package ru.paseka.journal.plugins;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Fully local Russian speech recognition for the Android Capacitor shell.
 * Audio is processed on-device by Vosk and is never sent to a network service.
 * Network access is used only for an explicit, Wi-Fi-only model download.
 */
@CapacitorPlugin(
    name = "PasekaOfflineSpeech",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class PasekaOfflineSpeechPlugin extends Plugin {
    private static final String MODEL_VERSION = "vosk-model-small-ru-0.22";
    private static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip";
    private static final long MAX_ARCHIVE_BYTES = 100L * 1024L * 1024L;
    private static final long MAX_EXTRACTED_BYTES = 250L * 1024L * 1024L;
    private static final long MIN_AVAILABLE_MEMORY_BYTES = 400L * 1024L * 1024L;
    private static final int SAMPLE_RATE = 16000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile Model model;
    private volatile Recognizer recognizer;
    private volatile SpeechService speechService;
    private volatile CountDownLatch finalResultLatch;

    private File modelDirectory() {
        return new File(getContext().getFilesDir(), MODEL_VERSION);
    }

    private boolean isValidModel(File directory) {
        return directory != null
            && new File(directory, "am/final.mdl").isFile()
            && new File(directory, "conf/mfcc.conf").isFile()
            && new File(directory, "graph/HCLG.fst").isFile();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        File directory = modelDirectory();
        JSObject result = new JSObject();
        result.put("modelInstalled", isValidModel(directory));
        result.put("modelVersion", MODEL_VERSION);
        result.put("downloadBytesEstimate", 45L * 1024L * 1024L);
        result.put("runtimeMemoryEstimateBytes", 300L * 1024L * 1024L);
        result.put("provider", "vosk-android");
        call.resolve(result);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (speechService != null) {
            call.reject("Сначала останови голосовой сеанс.", "VOICE_SESSION_ACTIVE");
            return;
        }
        Network wifiNetwork = getWifiNetwork();
        if (wifiNetwork == null) {
            call.reject("Для загрузки офлайн-модели подключись к Wi-Fi. Мобильный трафик не используется.", "WIFI_REQUIRED");
            return;
        }
        executor.execute(() -> downloadAndInstallModel(call, wifiNetwork));
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!isValidModel(modelDirectory())) {
            call.reject("Офлайн-модель русского языка ещё не установлена.", "MODEL_NOT_INSTALLED");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        startRecognition(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Нет разрешения на микрофон.", "MICROPHONE_PERMISSION_DENIED");
            return;
        }
        startRecognition(call);
    }

    private void startRecognition(PluginCall call) {
        executor.execute(() -> {
            if (speechService != null) {
                JSObject already = new JSObject();
                already.put("started", true);
                already.put("alreadyRunning", true);
                already.put("provider", "vosk-android");
                call.resolve(already);
                return;
            }
            ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
            if (manager != null) manager.getMemoryInfo(memory);
            if (memory.availMem > 0 && memory.availMem < MIN_AVAILABLE_MEMORY_BYTES) {
                call.reject("Недостаточно свободной памяти для локального распознавания. Закрой другие приложения и повтори попытку.", "INSUFFICIENT_MEMORY");
                return;
            }

            Model loadedModel = null;
            Recognizer loadedRecognizer = null;
            SpeechService loadedService = null;
            try {
                loadedModel = new Model(modelDirectory().getAbsolutePath());
                loadedRecognizer = new Recognizer(loadedModel, (float) SAMPLE_RATE);
                loadedService = new SpeechService(loadedRecognizer, (float) SAMPLE_RATE);
                finalResultLatch = new CountDownLatch(1);
                model = loadedModel;
                recognizer = loadedRecognizer;
                speechService = loadedService;

                boolean started = loadedService.startListening(new RecognitionListener() {
                    @Override
                    public void onPartialResult(String hypothesis) {
                        publishHypothesis(hypothesis, "partial", "partialResult");
                    }

                    @Override
                    public void onResult(String hypothesis) {
                        publishHypothesis(hypothesis, "text", "result");
                    }

                    @Override
                    public void onFinalResult(String hypothesis) {
                        try {
                            publishHypothesis(hypothesis, "text", "result");
                        } finally {
                            CountDownLatch latch = finalResultLatch;
                            if (latch != null) latch.countDown();
                        }
                    }

                    @Override
                    public void onError(Exception error) {
                        JSObject payload = new JSObject();
                        payload.put("message", error == null ? "Ошибка распознавания" : String.valueOf(error.getMessage()));
                        notifyListeners("error", payload);
                        CountDownLatch latch = finalResultLatch;
                        if (latch != null) latch.countDown();
                        executor.execute(PasekaOfflineSpeechPlugin.this::stopInternal);
                    }

                    @Override
                    public void onTimeout() {
                        JSObject payload = new JSObject();
                        payload.put("message", "Истекло время ожидания речи");
                        notifyListeners("timeout", payload);
                    }
                });

                if (!started) throw new IOException("Не удалось запустить локальный аудиопоток");
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("provider", "vosk-android");
                call.resolve(result);
            } catch (Exception error) {
                if (loadedService != null) {
                    try { loadedService.stop(); } catch (Exception ignored) {}
                    try { loadedService.shutdown(); } catch (Exception ignored) {}
                }
                if (loadedRecognizer != null) {
                    try { loadedRecognizer.close(); } catch (Exception ignored) {}
                }
                if (loadedModel != null) {
                    try { loadedModel.close(); } catch (Exception ignored) {}
                }
                model = null;
                recognizer = null;
                speechService = null;
                finalResultLatch = null;
                call.reject("Не удалось запустить офлайн-распознавание: " + error.getMessage(), "VOICE_START_FAILED", error);
            }
        });
    }

    private void publishHypothesis(String raw, String key, String eventName) {
        if (raw == null || raw.trim().isEmpty()) return;
        try {
            String text = new JSONObject(raw).optString(key, "").trim();
            if (text.isEmpty()) return;
            JSObject payload = new JSObject();
            payload.put("text", text);
            payload.put("isFinal", !"partial".equals(key));
            notifyListeners(eventName, payload);
        } catch (Exception ignored) {
            // Malformed model output is ignored; no raw hypothesis is exposed to the UI.
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        executor.execute(() -> {
            stopInternal();
            call.resolve();
        });
    }

    private void stopInternal() {
        SpeechService service = speechService;
        speechService = null;
        if (service != null) {
            try { service.stop(); } catch (Exception ignored) {}
            CountDownLatch latch = finalResultLatch;
            if (latch != null) {
                try { latch.await(750, TimeUnit.MILLISECONDS); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            }
            try { service.shutdown(); } catch (Exception ignored) {}
        }
        finalResultLatch = null;
        Recognizer currentRecognizer = recognizer;
        recognizer = null;
        if (currentRecognizer != null) {
            try { currentRecognizer.close(); } catch (Exception ignored) {}
        }
        Model currentModel = model;
        model = null;
        if (currentModel != null) {
            try { currentModel.close(); } catch (Exception ignored) {}
        }
    }

    private Network getWifiNetwork() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return null;
        Network active = manager.getActiveNetwork();
        if (active == null) return null;
        NetworkCapabilities activeCapabilities = manager.getNetworkCapabilities(active);
        if (activeCapabilities == null || !activeCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return null;
        if (activeCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return active;

        // Keep a VPN route when it is layered over an available Wi-Fi network.
        if (activeCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            for (Network candidate : manager.getAllNetworks()) {
                if (candidate.equals(active)) continue;
                NetworkCapabilities candidateCapabilities = manager.getNetworkCapabilities(candidate);
                if (candidateCapabilities != null
                    && candidateCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && candidateCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    return active;
                }
            }
        }
        return null;
    }

    private void downloadAndInstallModel(PluginCall call, Network wifiNetwork) {
        if (speechService != null) {
            call.reject("Сначала останови голосовой сеанс.", "VOICE_SESSION_ACTIVE");
            return;
        }
        File files = getContext().getFilesDir();
        File archive = new File(files, MODEL_VERSION + ".zip.part");
        File staging = new File(files, MODEL_VERSION + ".staging");
        HttpURLConnection connection = null;
        try {
            if (isValidModel(modelDirectory())) {
                JSObject result = new JSObject();
                result.put("modelInstalled", true);
                result.put("alreadyInstalled", true);
                call.resolve(result);
                return;
            }
            deleteRecursively(staging);
            if (archive.exists() && !archive.delete()) throw new IOException("Не удалось удалить временный архив");

            connection = (HttpURLConnection) wifiNetwork.openConnection(new URL(MODEL_URL));
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Paseka-Offline-Speech/1.0");
            int response = connection.getResponseCode();
            if (response < 200 || response >= 300) throw new IOException("Сервер модели вернул HTTP " + response);
            long declaredLength = connection.getContentLengthLong();
            if (declaredLength > MAX_ARCHIVE_BYTES) throw new IOException("Размер архива превышает безопасный предел");

            long received = 0;
            long lastProgress = 0;
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(archive)) {
                byte[] buffer = new byte[16 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    received += count;
                    if (received > MAX_ARCHIVE_BYTES) throw new IOException("Архив превышает безопасный предел");
                    output.write(buffer, 0, count);
                    long currentTime = System.currentTimeMillis();
                    if (currentTime - lastProgress > 250) {
                        JSObject progress = new JSObject();
                        progress.put("receivedBytes", received);
                        progress.put("totalBytes", declaredLength);
                        progress.put("percent", declaredLength > 0 ? Math.min(100, (int) (received * 100 / declaredLength)) : -1);
                        notifyListeners("modelDownloadProgress", progress);
                        lastProgress = currentTime;
                    }
                }
                output.flush();
            }
            if (received == 0) throw new IOException("Сервер вернул пустой архив");

            extractArchive(archive, staging);
            File extractedModel = findModelRoot(staging);
            if (!isValidModel(extractedModel)) throw new IOException("В архиве не найдена корректная русская модель Vosk");

            File destination = modelDirectory();
            if (destination.exists()) deleteRecursively(destination);
            if (!extractedModel.renameTo(destination)) throw new IOException("Не удалось установить модель во внутреннее хранилище");
            deleteRecursively(staging);
            if (!isValidModel(destination)) throw new IOException("Проверка установленной модели не пройдена");

            JSObject progress = new JSObject();
            progress.put("receivedBytes", received);
            progress.put("totalBytes", declaredLength);
            progress.put("percent", 100);
            notifyListeners("modelDownloadProgress", progress);

            JSObject result = new JSObject();
            result.put("modelInstalled", true);
            result.put("modelVersion", MODEL_VERSION);
            result.put("downloadedBytes", received);
            call.resolve(result);
        } catch (Exception error) {
            deleteRecursively(staging);
            if (archive.exists()) archive.delete();
            call.reject("Не удалось установить офлайн-модель: " + error.getMessage(), "MODEL_DOWNLOAD_FAILED", error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void extractArchive(File archive, File staging) throws IOException {
        if (!staging.mkdirs() && !staging.isDirectory()) throw new IOException("Не удалось создать временную папку модели");
        String root = staging.getCanonicalPath() + File.separator;
        long extracted = 0;
        int entries = 0;
        try (ZipInputStream input = new ZipInputStream(new BufferedInputStream(new FileInputStream(archive)))) {
            ZipEntry entry;
            byte[] buffer = new byte[16 * 1024];
            while ((entry = input.getNextEntry()) != null) {
                if (++entries > 20000) throw new IOException("Слишком много файлов в архиве модели");
                File target = new File(staging, entry.getName());
                String canonical = target.getCanonicalPath();
                if (!canonical.startsWith(root)) throw new IOException("Недопустимый путь в архиве модели");
                if (entry.isDirectory()) {
                    if (!target.mkdirs() && !target.isDirectory()) throw new IOException("Не удалось создать папку модели");
                } else {
                    File parent = target.getParentFile();
                    if (parent != null && !parent.mkdirs() && !parent.isDirectory()) throw new IOException("Не удалось создать папку файла модели");
                    try (BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            extracted += count;
                            if (extracted > MAX_EXTRACTED_BYTES) throw new IOException("Распакованная модель превышает безопасный предел");
                            output.write(buffer, 0, count);
                        }
                    }
                }
                input.closeEntry();
            }
        }
    }

    private File findModelRoot(File staging) {
        if (isValidModel(staging)) return staging;
        File[] children = staging.listFiles();
        if (children == null) return null;
        for (File child : children) {
            if (child.isDirectory() && isValidModel(child)) return child;
        }
        return null;
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
