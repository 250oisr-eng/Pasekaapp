package ru.paseka.beedetector;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;

@CapacitorPlugin(name = "BeeDetector")
public class BeeDetectorPlugin extends Plugin {
    private static final String BRIDGE_VERSION = "0.1.0";

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("bridgeAvailable", true);
        result.put("bridgeVersion", BRIDGE_VERSION);
        result.put("runtimeAvailable", false);
        result.put("modelAvailable", false);
        result.put("inferenceAvailable", false);
        result.put("status", "unavailable");
        result.put("reason", "model_not_installed");
        call.resolve(result);
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

        // The bridge validates app-owned input, but inference remains disabled until
        // a licensed model and a verified LiteRT runtime are bundled.
        resolveUnavailable(call, "model_not_installed");
    }

    private void resolveUnavailable(PluginCall call, String reason) {
        JSObject result = new JSObject();
        result.put("status", "unavailable");
        result.put("reason", reason);
        call.resolve(result);
    }
}
