package com.aienglish.diarywhisper;

import android.content.pm.ApplicationInfo;
import android.system.Os;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * On-device Whisper bridge for family diary ASR.
 *
 * <p>Tiny is packaged in {@code assets/diary-whisper/}. Base/Small are downloaded on demand
 * into the app files dir. CLI: {@code jniLibs/arm64-v8a/libwhisper_cli.so}.
 */
@CapacitorPlugin(name = "DiaryWhisper")
public class DiaryWhisperPlugin extends Plugin {
    private static final String TAG = "DiaryWhisper";
    private static final String ASSET_DIR = "diary-whisper";
    private static final String DEFAULT_MODEL_ID = "tiny";
    private static final String NATIVE_CLI = "libwhisper_cli.so";
    private static final String DOWNLOAD_EVENT = "diaryWhisperDownload";

    private static final class ModelSpec {
        final String[] fileNames;
        final long minBytes;
        final long approxBytes;
        final String[] urls;

        ModelSpec(String[] fileNames, long minBytes, long approxBytes, String[] urls) {
            this.fileNames = fileNames;
            this.minBytes = minBytes;
            this.approxBytes = approxBytes;
            this.urls = urls;
        }
    }

    private static final Map<String, ModelSpec> MODELS = new LinkedHashMap<>();

    static {
        MODELS.put(
            "tiny",
            new ModelSpec(
                new String[] {"ggml-tiny-q5_1.bin", "ggml-tiny.bin", "ggml-tiny-int8.bin"},
                1_000_000L,
                31_000_000L,
                new String[] {
                    "http://118.24.164.40/models/ggml-tiny-q5_1.bin",
                    "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
                }
            )
        );
        MODELS.put(
            "base",
            new ModelSpec(
                new String[] {"ggml-base-q5_1.bin", "ggml-base.bin"},
                10_000_000L,
                57_000_000L,
                new String[] {
                    "http://118.24.164.40/models/ggml-base-q5_1.bin",
                    "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
                }
            )
        );
        MODELS.put(
            "small",
            new ModelSpec(
                new String[] {"ggml-small-q5_1.bin", "ggml-small.bin"},
                50_000_000L,
                181_000_000L,
                new String[] {
                    "http://118.24.164.40/models/ggml-small-q5_1.bin",
                    "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
                }
            )
        );
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);

    @PluginMethod
    public void listModels(PluginCall call) {
        JSArray models = new JSArray();
        for (Map.Entry<String, ModelSpec> entry : MODELS.entrySet()) {
            String id = entry.getKey();
            ModelSpec spec = entry.getValue();
            File file = findModelFile(id);
            boolean inAssets = hasAnyAsset(spec.fileNames);
            boolean ready = file != null && file.exists() && file.length() > 1024;
            JSObject item = new JSObject();
            item.put("id", id);
            item.put("label", modelLabel(id));
            item.put("fileName", preferredFileName(spec.fileNames));
            item.put("ready", ready);
            item.put("packaged", inAssets);
            item.put("needsDownload", !ready && !inAssets);
            item.put("downloadBytes", spec.approxBytes);
            models.put(item);
        }
        JSObject ret = new JSObject();
        ret.put("models", models);
        ret.put("defaultId", DEFAULT_MODEL_ID);
        call.resolve(ret);
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        String modelId = resolveModelId(call.getString("modelId"));
        ModelSpec spec = MODELS.get(modelId);
        JSObject ret = new JSObject();
        File model = findModelFile(modelId);
        File cli = cliFile();
        boolean inAssets = spec != null && hasAnyAsset(spec.fileNames);
        boolean ready = model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
        ret.put("ready", ready);
        ret.put("modelId", modelId);
        ret.put("packaged", inAssets);
        ret.put("needsDownload", !ready && !inAssets);
        if (spec != null) ret.put("downloadBytes", spec.approxBytes);
        if (!ready) {
            ret.put("detail", describeMissing(modelId, model, cli, inAssets));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void prepareModel(PluginCall call) {
        String modelId = resolveModelId(call.getString("modelId"));
        executor.execute(() -> {
            try {
                File destDir = modelDir();
                if (!destDir.exists() && !destDir.mkdirs()) {
                    reject(call, "model_not_ready", "无法创建模型目录");
                    return;
                }
                ModelSpec spec = MODELS.get(modelId);
                boolean copiedModel = spec != null && copyFirstExistingAsset(spec.fileNames, destDir);
                File cli = ensureCliExecutable();
                File model = findModelFile(modelId);
                boolean ready =
                    model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
                boolean inAssets = spec != null && hasAnyAsset(spec.fileNames);
                JSObject ret = new JSObject();
                ret.put("ready", ready);
                ret.put("modelId", modelId);
                ret.put("packaged", inAssets);
                ret.put("needsDownload", !ready && !inAssets);
                if (spec != null) ret.put("downloadBytes", spec.approxBytes);
                if (!ready) {
                    ret.put(
                        "detail",
                        "Whisper 未就绪。copiedModel="
                            + copiedModel
                            + " cli="
                            + (cli == null ? "null" : cli.getAbsolutePath())
                            + " — "
                            + describeMissing(modelId, model, cli, inAssets)
                    );
                }
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "prepareModel failed", e);
                reject(call, "model_not_ready", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String modelId = resolveModelId(call.getString("modelId"));
        ModelSpec spec = MODELS.get(modelId);
        if (spec == null) {
            reject(call, "model_not_ready", "未知模型：" + modelId);
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            reject(call, "download_busy", "已有模型正在下载，请稍候");
            return;
        }
        executor.execute(() -> {
            try {
                File destDir = modelDir();
                if (!destDir.exists() && !destDir.mkdirs()) {
                    reject(call, "download_failed", "无法创建模型目录");
                    return;
                }
                // Prefer packaged asset if present
                if (copyFirstExistingAsset(spec.fileNames, destDir)) {
                    File model = findModelFile(modelId);
                    JSObject ret = statusPayload(modelId, model != null && model.exists(), true, false);
                    emitProgress(modelId, spec.approxBytes, spec.approxBytes, 1.0, "done");
                    call.resolve(ret);
                    return;
                }
                File existing = findModelFile(modelId);
                if (existing != null && existing.length() >= spec.minBytes) {
                    JSObject ret = statusPayload(modelId, true, false, false);
                    emitProgress(modelId, existing.length(), existing.length(), 1.0, "done");
                    call.resolve(ret);
                    return;
                }

                String fileName = preferredFileName(spec.fileNames);
                File dest = new File(destDir, fileName);
                File partial = new File(destDir, fileName + ".partial");
                Exception lastError = null;
                boolean ok = false;
                for (String url : spec.urls) {
                    try {
                        emitProgress(modelId, 0, spec.approxBytes, 0, "start");
                        downloadToFile(url, partial, modelId, spec.approxBytes);
                        if (!partial.exists() || partial.length() < spec.minBytes) {
                            throw new IllegalStateException("下载文件过小：" + partial.length());
                        }
                        if (dest.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            dest.delete();
                        }
                        if (!partial.renameTo(dest)) {
                            copyFile(partial, dest);
                            //noinspection ResultOfMethodCallIgnored
                            partial.delete();
                        }
                        ok = true;
                        break;
                    } catch (Exception e) {
                        lastError = e;
                        Log.w(TAG, "download failed from " + url + ": " + e.getMessage());
                        //noinspection ResultOfMethodCallIgnored
                        partial.delete();
                    }
                }
                if (!ok) {
                    emitProgress(modelId, 0, spec.approxBytes, 0, "error");
                    reject(
                        call,
                        "download_failed",
                        lastError != null ? lastError.getMessage() : "模型下载失败"
                    );
                    return;
                }
                File model = findModelFile(modelId);
                boolean ready = model != null && model.exists();
                emitProgress(modelId, ready ? model.length() : 0, spec.approxBytes, 1.0, "done");
                call.resolve(statusPayload(modelId, ready, false, false));
            } catch (Exception e) {
                Log.e(TAG, "downloadModel failed", e);
                emitProgress(modelId, 0, spec.approxBytes, 0, "error");
                reject(call, "download_failed", e.getMessage());
            } finally {
                downloading.set(false);
            }
        });
    }

    @PluginMethod
    public void transcribe(PluginCall call) {
        String wavBase64 = call.getString("wavBase64");
        String language = call.getString("language", "zh");
        String modelId = resolveModelId(call.getString("modelId"));
        if (wavBase64 == null || wavBase64.isEmpty()) {
            reject(call, "invalid_audio", "缺少音频");
            return;
        }

        executor.execute(() -> {
            File model = findModelFile(modelId);
            if (model == null || !model.exists()) {
                ModelSpec spec = MODELS.get(modelId);
                if (spec != null) {
                    try {
                        copyFirstExistingAsset(spec.fileNames, modelDir());
                        model = findModelFile(modelId);
                    } catch (Exception e) {
                        Log.w(TAG, "lazy copy model failed: " + e.getMessage());
                    }
                }
            }
            File cli = ensureCliExecutable();
            if (model == null || !model.exists() || cli == null || !cli.exists()) {
                ModelSpec spec = MODELS.get(modelId);
                boolean inAssets = spec != null && hasAnyAsset(spec.fileNames);
                reject(call, "model_not_ready", describeMissing(modelId, model, cli, inAssets));
                return;
            }

            File wavFile = null;
            try {
                byte[] wavBytes = Base64.decode(wavBase64, Base64.DEFAULT);
                if (wavBytes.length < 44) {
                    reject(call, "invalid_audio", "WAV 太短");
                    return;
                }
                wavFile = File.createTempFile("diary_", ".wav", getContext().getCacheDir());
                try (FileOutputStream out = new FileOutputStream(wavFile)) {
                    out.write(wavBytes);
                }

                ProcessBuilder pb = new ProcessBuilder(
                    cli.getAbsolutePath(),
                    "-m", model.getAbsolutePath(),
                    "-f", wavFile.getAbsolutePath(),
                    "-l", language == null ? "zh" : language,
                    "--prompt", "以下是简体中文普通话的家庭日记。",
                    "-nt",
                    "-np"
                );
                pb.redirectErrorStream(true);
                pb.directory(modelDir());
                pb.environment().put("LD_LIBRARY_PATH", cli.getParent());
                Process process = pb.start();
                String output;
                try (InputStream in = process.getInputStream()) {
                    output = readAll(in);
                }
                int code = process.waitFor();
                if (code != 0) {
                    reject(call, "transcribe_failed", "whisper-cli exit " + code + ": " + trimOut(output));
                    return;
                }
                if (looksLikeCliHelp(output)) {
                    reject(
                        call,
                        "transcribe_failed",
                        "whisper-cli 参数无效（收到 usage）。" + trimOut(output)
                    );
                    return;
                }
                String text = extractTranscript(output);
                JSObject ret = new JSObject();
                ret.put("text", text == null ? "" : text.trim());
                ret.put("modelId", modelId);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "transcribe failed", e);
                reject(call, "transcribe_failed", e.getMessage());
            } finally {
                if (wavFile != null && wavFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    wavFile.delete();
                }
            }
        });
    }

    private JSObject statusPayload(String modelId, boolean ready, boolean packaged, boolean needsDownload) {
        ModelSpec spec = MODELS.get(modelId);
        JSObject ret = new JSObject();
        ret.put("ready", ready);
        ret.put("modelId", modelId);
        ret.put("packaged", packaged);
        ret.put("needsDownload", needsDownload);
        if (spec != null) ret.put("downloadBytes", spec.approxBytes);
        return ret;
    }

    private void emitProgress(String modelId, long received, long total, double fraction, String phase) {
        JSObject ev = new JSObject();
        ev.put("modelId", modelId);
        ev.put("received", received);
        ev.put("total", total);
        ev.put("fraction", fraction);
        ev.put("phase", phase);
        notifyListeners(DOWNLOAD_EVENT, ev);
    }

    private void downloadToFile(String urlStr, File dest, String modelId, long approxTotal) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(120_000);
            conn.setInstanceFollowRedirects(true);
            conn.connect();
            int code = conn.getResponseCode();
            if (code >= 400) {
                throw new IllegalStateException("HTTP " + code + " from " + urlStr);
            }
            long total = conn.getContentLengthLong();
            if (total <= 0) total = approxTotal;
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                long received = 0;
                long lastEmit = 0;
                int n;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                    received += n;
                    if (received - lastEmit >= 512 * 1024 || received >= total) {
                        double frac = total > 0 ? Math.min(1.0, (double) received / (double) total) : 0;
                        emitProgress(modelId, received, total, frac, "progress");
                        lastEmit = received;
                    }
                }
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void copyFile(File from, File to) throws Exception {
        try (InputStream in = new java.io.FileInputStream(from);
             OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
        }
    }

    private static String readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = in.read(chunk)) >= 0) {
            buf.write(chunk, 0, n);
        }
        return buf.toString(StandardCharsets.UTF_8.name());
    }

    private void reject(PluginCall call, String code, String message) {
        call.reject(message == null ? code : message, code);
    }

    private File modelDir() {
        return new File(getContext().getFilesDir(), ASSET_DIR);
    }

    private String resolveModelId(String raw) {
        if (raw != null && MODELS.containsKey(raw)) return raw;
        return DEFAULT_MODEL_ID;
    }

    private static String modelLabel(String id) {
        if ("small".equals(id)) return "Small（更准，较慢）";
        if ("base".equals(id)) return "Base（更准，稍慢）";
        return "Tiny（更快）";
    }

    private static String preferredFileName(String[] names) {
        return names != null && names.length > 0 ? names[0] : "";
    }

    private File cliFile() {
        ApplicationInfo info = getContext().getApplicationInfo();
        if (info.nativeLibraryDir != null) {
            File nativeCli = new File(info.nativeLibraryDir, NATIVE_CLI);
            if (nativeCli.exists()) return nativeCli;
        }
        File legacy = new File(modelDir(), "whisper-cli");
        if (legacy.exists()) return legacy;
        return null;
    }

    private File ensureCliExecutable() {
        File cli = cliFile();
        if (cli == null) return null;
        try {
            //noinspection ResultOfMethodCallIgnored
            cli.setExecutable(true, false);
            Os.chmod(cli.getAbsolutePath(), 0755);
        } catch (Exception e) {
            Log.w(TAG, "chmod cli failed (may still run from nativeLibraryDir): " + e.getMessage());
        }
        return cli;
    }

    private File findModelFile(String modelId) {
        ModelSpec spec = MODELS.get(modelId);
        if (spec == null) return null;
        File dir = modelDir();
        for (String name : spec.fileNames) {
            File f = new File(dir, name);
            if (f.exists() && f.length() > 1024) return f;
        }
        return null;
    }

    private boolean hasAnyAsset(String[] names) {
        if (names == null) return false;
        for (String name : names) {
            if (assetExists(ASSET_DIR + "/" + name)) return true;
        }
        return false;
    }

    private String describeMissing(String modelId, File model, File cli, boolean inAssets) {
        StringBuilder sb = new StringBuilder();
        if (model == null || !model.exists()) {
            if (inAssets) {
                sb.append("缺少 Whisper ").append(modelId).append(" 模型（需先 prepare 解包）; ");
            } else {
                sb.append("缺少 Whisper ")
                    .append(modelId)
                    .append(" 模型，请先下载（设置 → 语音转写模型）; ");
            }
        }
        if (cli == null || !cli.exists()) {
            sb.append("缺少 ").append(NATIVE_CLI).append("（jniLibs/arm64-v8a）; ");
        } else if (!cli.canExecute()) {
            sb.append(NATIVE_CLI).append(" 不可执行; ");
        }
        sb.append("详见 docs/family-diary-whisper.md");
        return sb.toString().trim();
    }

    private boolean copyFirstExistingAsset(String[] names, File destDir) throws Exception {
        for (String name : names) {
            if (assetExists(ASSET_DIR + "/" + name)) {
                copyAssetIfPresent(name, new File(destDir, name));
                return true;
            }
        }
        return false;
    }

    private boolean assetExists(String path) {
        try (InputStream in = getContext().getAssets().open(path)) {
            return in != null;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean copyAssetIfPresent(String assetFileName, File dest) throws Exception {
        String path = ASSET_DIR + "/" + assetFileName;
        if (!assetExists(path)) return false;
        if (dest.exists() && dest.length() > 0) return true;
        try (InputStream in = getContext().getAssets().open(path);
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
        }
        return true;
    }

    private static String trimOut(String output) {
        if (output == null) return "";
        String t = output.trim();
        return t.length() > 400 ? t.substring(0, 400) : t;
    }

    private static boolean looksLikeCliHelp(String output) {
        if (output == null) return false;
        String t = output.trim();
        if (t.isEmpty()) return false;
        String head = t.length() > 80 ? t.substring(0, 80) : t;
        return head.startsWith("usage:")
            || t.contains("show this help message")
            || (t.contains("supported audio formats") && t.contains("--model"));
    }

    private static String extractTranscript(String output) {
        if (output == null) return "";
        if (looksLikeCliHelp(output)) return "";
        String[] lines = output.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            if (t.startsWith("whisper_") || t.startsWith("system_") || t.startsWith("main:")) continue;
            if (t.startsWith("ggml_") || t.startsWith("error:")) continue;
            if (t.startsWith("usage:") || t.startsWith("options:") || t.startsWith("-")) continue;
            t = t.replaceAll("^\\[[^\\]]+\\]\\s*", "");
            if (t.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(t);
        }
        return sb.toString().trim();
    }
}
