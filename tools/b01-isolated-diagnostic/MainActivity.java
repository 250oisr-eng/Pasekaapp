package ru.paseka.journal.diagnostic.restore;

import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// DO NOT allow this diagnostic build to open a WebView on a real phone.
// It is a completely separate applicationId intended for an isolated emulator.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!isStrictEmulator()) {
            // Throw *before* BridgeActivity.onCreate to avoid a WebView/session.
            throw new IllegalStateException("B01_EMULATOR_ONLY_NO_PHYSICAL_DEVICE");
        }
        super.onCreate(savedInstanceState);
    }

    private static boolean isStrictEmulator() {
        final String hw = Build.HARDWARE == null ? "" : Build.HARDWARE.toLowerCase(java.util.Locale.ROOT);
        final String fp = Build.FINGERPRINT == null ? "" : Build.FINGERPRINT.toLowerCase(java.util.Locale.ROOT);
        final boolean emulatedHardware = hw.equals("ranchu") || hw.equals("goldfish");
        final boolean emulatedFingerprint = fp.startsWith("generic") ||
            fp.contains("sdk_gphone") || fp.contains("emulator");
        return emulatedHardware && emulatedFingerprint;
    }
}
