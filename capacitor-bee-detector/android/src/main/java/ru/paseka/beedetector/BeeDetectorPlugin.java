package ru.paseka.beedetector;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        JSObject result = new JSObject();
        result.put("status", "unavailable");
        result.put("reason", "model_not_installed");
        call.resolve(result);
    }
}
