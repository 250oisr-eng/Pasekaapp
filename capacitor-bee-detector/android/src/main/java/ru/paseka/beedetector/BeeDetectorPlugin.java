package ru.paseka.beedetector;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BeeDetector")
public class BeeDetectorPlugin extends Plugin {
    private static final String BRIDGE_VERSION = "0.2.0";
    private final ExecutorService runtimeExecutor =
        Executors.newSingleThreadExecutor();
    private volatile boolean destroyed = false;

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context appContext = getContext().getApplicationContext();
        if (destroyed || runtimeExecutor.isShutdown()) {
            resolveUnavailable(call, "plugin_destroyed");
            return;
        }
        runtimeExecutor.execute(() -> {
            if (destroyed) return;
            LiteRtRuntimeProbe.Result probe = LiteRtRuntimeProbe.initializeAndClose(appContext);
            JSObject result = new JSObject();
            result.put("bridgeAvailable", true);
            result.put("bridgeVersion", BRIDGE_VERSION);
            result.put("runtimeAvailable", probe.available);
            result.put("modelAvailable", false);
            result.put("inferenceAvailable", false);
            result.put("status", "unavailable");
            result.put("reason", probe.available ? "model_not_installed" : "runtime_initialization_failed");
            if (!destroyed) {
                call.resolve(result);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        runtimeExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void detectFrame(PluginCall call) {
        String framePath = call.getString("framePath");
        if (framePath == null || framePath.trim().isEmpty()) {
            resolveUnavailable(call, "frame_path_missing");
            return;
        }

        try {
            File cacheRoot = getContext().getCacheDir().getCanonicalFile();
            File frame = new File(framePath).getCanonicalFile();
            String allowedPrefix = cacheRoot.getPath() + File.separator;
            if (!frame.getPath().startsWith(allowedPrefix)) {
                resolveUnavailable(call, "frame_path_outside_app_cache");
                return;
            }
            if (!frame.isFile() || !frame.canRead()) {
                resolveUnavailable(call, "frame_file_unavailable");
                return;
            }
        } catch (IOException | SecurityException error) {
            resolveUnavailable(call, "frame_path_invalid");
            return;
        }

        // Runtime availability is not inference availability. No detections are
        // produced until a licensed model and its preprocessing contract are installed.
        resolveUnavailable(call, "model_not_installed");
    }

    private void resolveUnavailable(PluginCall call, String reason) {
        JSObject result = new JSObject();
        result.put("status", "unavailable");
        result.put("reason", reason);
        call.resolve(result);
    }
}
