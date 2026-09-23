package com.tudoudou.apkinstall;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads an APK into the app cache and opens the system package installer.
 * If install permission is missing, opens the unknown-sources settings screen.
 * If the download is not a valid APK, falls back to an ACTION_VIEW of the URL.
 */
@CapacitorPlugin(name = "ApkInstall")
public class ApkInstallPlugin extends Plugin {
    private static final long MAX_BYTES = 400L * 1024L * 1024L;
    private static final String CACHE_DIR = "apk-update";
    private static final String FILE_NAME = "tudoudou-aienglish.apk";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        if (!isHttpUrl(url)) {
            call.reject("invalid url", "invalid_url");
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.reject("no context", "no_context");
            return;
        }
        if (needsUnknownSourcesPermission(context)) {
            openUnknownSourcesSettings(context);
            resolveMode(call, "permission");
            return;
        }
        executor.execute(
            () -> {
                try {
                    File apk = downloadApk(context, url);
                    mainHandler.post(
                        () -> {
                            try {
                                startInstall(context, apk);
                                resolveMode(call, "installer");
                            } catch (Exception ignored) {
                                openExternal(context, url, call);
                            }
                        });
                } catch (Exception ignored) {
                    mainHandler.post(() -> openExternal(context, url, call));
                }
            });
    }

    private static boolean isHttpUrl(String url) {
        if (url == null) return false;
        return url.startsWith("http://") || url.startsWith("https://");
    }

    private static boolean needsUnknownSourcesPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        return !context.getPackageManager().canRequestPackageInstalls();
    }

    private static void openUnknownSourcesSettings(Context context) {
        Intent intent =
            new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private static File downloadApk(Context context, String urlString) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlString).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(180_000);
        conn.setUseCaches(false);
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive, */*");
        try {
            conn.connect();
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new Exception("http " + code);
            }
            long advertised = conn.getContentLengthLong();
            if (advertised > MAX_BYTES) throw new Exception("apk too large");
            File dir = new File(context.getCacheDir(), CACHE_DIR);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("mkdir");
            File out = new File(dir, FILE_NAME);
            if (out.exists() && !out.delete()) {
                throw new Exception("replace apk");
            }
            boolean keep = false;
            try {
                long total = 0;
                try (InputStream in = conn.getInputStream();
                    OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        total += n;
                        if (total > MAX_BYTES) throw new Exception("apk too large");
                        os.write(buf, 0, n);
                    }
                }
                if (!looksLikeZip(out)) throw new Exception("not an apk");
                keep = true;
                return out;
            } finally {
                if (!keep && out.exists()) out.delete();
            }
        } finally {
            conn.disconnect();
        }
    }

    private static boolean looksLikeZip(File file) {
        if (!file.isFile() || file.length() < 1024) return false;
        try (InputStream in = new java.io.FileInputStream(file)) {
            byte[] mag = new byte[2];
            return in.read(mag) == 2 && mag[0] == 'P' && mag[1] == 'K';
        } catch (Exception e) {
            return false;
        }
    }

    private static void startInstall(Context context, File apk) {
        String authority = context.getPackageName() + ".apkinstall.fileprovider";
        Uri uri = FileProvider.getUriForFile(context, authority, apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("apk", uri));
        context.startActivity(intent);
    }

    private static void openExternal(Context context, String url, PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            resolveMode(call, "browser");
        } catch (Exception e) {
            call.reject("install failed", "install_failed");
        }
    }

    private static void resolveMode(PluginCall call, String mode) {
        JSObject ret = new JSObject();
        ret.put("mode", mode);
        call.resolve(ret);
    }
}
