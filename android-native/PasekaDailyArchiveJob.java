package __PASEKA_PACKAGE__;

import android.app.job.*;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.*;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Offline same-sandbox periodic backup; no primary writes. */
public final class PasekaDailyArchiveJob extends JobService {
    private static final String TAG = "PasekaArchiveQA";
    private static final int JOB_ID = 0x50415345;
    private static final long PERIOD_MS = 6L * 60L * 60L * 1000L;
    private static final long FLEX_MS = 60L * 60L * 1000L;
    private final Handler main = new Handler(Looper.getMainLooper());
    private JobParameters active;
    private String lastPhase = "idle";
    private WebView worker;
    private Runnable timeout;
    public static void schedule(Context context) {
        try {
            JobScheduler scheduler = context.getSystemService(JobScheduler.class);
            if (scheduler == null) return;
            ComponentName component = new ComponentName(context, PasekaDailyArchiveJob.class);
            JobInfo previous = scheduler.getPendingJob(JOB_ID);
            if (previous != null && component.equals(previous.getService())) return;
            scheduler.schedule(new JobInfo.Builder(JOB_ID, component)
                .setPeriodic(PERIOD_MS, FLEX_MS).setPersisted(true)
                .setRequiresStorageNotLow(true).build());
        } catch (RuntimeException ignored) { /* foreground catch-up */ }
    }
    @Override public boolean onStartJob(JobParameters parameters) {
        if (active != null) return false;
        active = parameters;
        lastPhase = "START";
        Log.i(TAG, "START");
        timeout = () -> {
            Log.w(TAG, "WATCHDOG_TIMEOUT phase=" + lastPhase);
            complete(parameters, true);
        };
        main.postDelayed(timeout, 180000L);
        main.post(() -> launch(parameters));
        return true;
    }
    private void launch(JobParameters parameters) {
        if (active != parameters) return;
        try (InputStream input = getAssets().open("public/daily-archive-worker.html")) {
            String html = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            Log.i(TAG, "ASSET_READY");
            worker = new WebView(getApplicationContext());
            WebSettings settings = worker.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setBlockNetworkLoads(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            worker.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (active == parameters) Log.i(TAG, "PAGE_FINISHED phase=" + lastPhase);
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (active == parameters && request.isForMainFrame()) {
                        Log.w(TAG, "MAIN_FRAME_ERROR code=" + error.getErrorCode());
                        complete(parameters, true);
                    }
                }
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Log.w(TAG, "RENDERER_GONE phase=" + lastPhase);
                    complete(parameters, true);
                    return true;
                }
            });
            worker.addJavascriptInterface(new WorkerBridge(parameters), "PasekaArchiveJob");
            Log.i(TAG, "LOAD_REQUESTED");
            worker.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        } catch (Exception failure) {
            Log.e(TAG, "LAUNCH_EXCEPTION class=" + failure.getClass().getSimpleName());
            complete(parameters, true);
        }
    }
    public final class WorkerBridge {
        private final JobParameters parameters;
        WorkerBridge(JobParameters parameters) { this.parameters = parameters; }
        @JavascriptInterface public boolean isArchiveWorker() { return true; }
        // Only fixed stage identifiers are accepted; never log content, URLs, media or exceptions.
        @JavascriptInterface public void trace(String stage) {
            if (stage == null) return;
            switch (stage) {
                case "BOOTSTRAP": case "ORIGIN": case "MARKER":
                case "SOURCE_OPEN": case "SOURCE_READ": case "STATE_VALID":
                case "STORE_OPEN": case "ROTATED": case "FAILED": case "FINISH":
                    main.post(() -> {
                        if (active == parameters) {
                            lastPhase = stage;
                            Log.i(TAG, "JS_PHASE " + stage);
                        }
                    });
                    break;
                default: break;
            }
        }
        @JavascriptInterface public void finish(String outcome) {
            final String result = "OK".equals(outcome) ? "OK" : "SKIP".equals(outcome) ? "SKIP" : "RETRY";
            main.post(() -> {
                if (active != parameters) return;
                Log.i(TAG, "BRIDGE_FINISH " + result + " phase=" + lastPhase);
                complete(parameters, "RETRY".equals(result));
            });
        }
    }
    private void dispose() {
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
        if (worker != null) {
            WebView old = worker;
            worker = null;
            try { old.removeJavascriptInterface("PasekaArchiveJob"); } catch (RuntimeException ignored) {}
            try { old.stopLoading(); } catch (RuntimeException ignored) {}
            try { old.destroy(); } catch (RuntimeException ignored) {}
        }
    }
    private void complete(JobParameters parameters, boolean retry) {
        if (active != parameters) return;
        active = null;
        Log.i(TAG, "JOB_FINISHED retry=" + retry + " phase=" + lastPhase);
        dispose();
        jobFinished(parameters, retry);
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        Log.w(TAG, "SYSTEM_STOP phase=" + lastPhase);
        active = null;
        dispose();
        return true;
    }
    @Override public void onDestroy() {
        active = null;
        dispose();
        super.onDestroy();
    }
}
