package app.orubu.gene;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Gene — fullscreen on-device shell.
 * Renders the Gene PWA in a WebView (present on every Android, no Chrome
 * dependency, no TWA quirks). The site's service worker caches everything,
 * so after the first "Download Gene" the app works fully offline.
 */
public class MainActivity extends Activity {

    private static final String URL = "https://orubus-dev.github.io/gene-app/";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installCrashLogger();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadsImagesAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setBackgroundColor(Color.parseColor("#0B0D14"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.endsWith("github.io") || host.endsWith("orubu.gene")
                        || host.equals("localhost") || host.equals("127.0.0.1")) {
                    return false; // keep Gene inside the app
                }
                try { // everything else (links out) goes to the browser
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Throwable ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    // base URL set so location.reload() retries the real page
                    v.loadDataWithBaseURL(URL, offlinePage(), "text/html", "utf-8", null);
                }
            }
        });

        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(URL);
        }
    }

    private String offlinePage() {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{background:#0b0d14;color:#8a91a8;font-family:sans-serif;"
            + "display:flex;align-items:center;justify-content:center;height:100vh;"
            + "margin:0;text-align:center}div{padding:24px}h1{color:#e8eaf2;font-size:20px}"
            + "p{font-size:14px;line-height:1.5}button{margin-top:18px;background:#6d28d9;"
            + "color:#fff;border:0;border-radius:12px;padding:12px 28px;font-size:15px}</style></head>"
            + "<body><div><h1>Gene can't reach her files</h1>"
            + "<p>The first launch needs internet once.<br>After that she lives on this device,<br>"
            + "and this screen never appears again.</p>"
            + "<button onclick='location.reload()'>Try again</button></div></body></html>";
    }

    /** Any future crash: saved to a file AND shown on screen — never a silent "keeps stopping". */
    private void installCrashLogger() {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            String trace = "Gene crash "
                    + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date())
                    + "  (thread " + t.getName() + ")\n" + sw;
            try {
                File dir = getExternalFilesDir(null);
                if (dir != null) {
                    FileWriter w = new FileWriter(new File(dir, "gene-crash.txt"), true);
                    w.write(trace + "\n\n");
                    w.close();
                }
            } catch (Throwable ignored) { }
            try {
                final String shown = trace.length() > 3500
                        ? trace.substring(0, 3500) + "…\n\n(full log saved to gene-crash.txt)"
                        : trace;
                runOnUiThread(() -> {
                    try {
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Gene hit a snag")
                                .setMessage(shown)
                                .setPositiveButton("Copy & restart", (d, which) -> {
                                    try {
                                        ClipboardManager cm = (ClipboardManager)
                                                getSystemService(CLIPBOARD_SERVICE);
                                        cm.setPrimaryClip(ClipData.newPlainText("gene-crash", trace));
                                    } catch (Throwable ignored) { }
                                    recreate();
                                })
                                .setNegativeButton("Close app", (d, which) -> finish())
                                .show();
                    } catch (Throwable ignored) { }
                });
                Thread.sleep(700); // let the dialog paint before the old handler runs
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
