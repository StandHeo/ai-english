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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * On-device Whisper bridge for family diary ASR.
 *
 * <p>Models: {@code assets/diary-whisper/ggml-*.bin} → copied to app files.
 * CLI: {@code jniLibs/arm64-v8a/libwhisper_cli.so} (Android 10+ cannot exec from files/).
 */
@CapacitorPlugin(name = "DiaryWhisper")
public class DiaryWhisperPlugin extends Plugin {
    private static final String TAG = "DiaryWhisper";
    private static final String ASSET_DIR = "diary-whisper";
    private static final String DEFAULT_MODEL_ID = "tiny";
    /** Packaged as .so so PackageManager extracts it into nativeLibraryDir (executable). */
    private static final String NATIVE_CLI = "libwhisper_cli.so";

    private static final Map<String, String[]> MODEL_FILES = new LinkedHashMap<>();

    static {
        MODEL_FILES.put("tiny", new String[] {"ggml-tiny-q5_1.bin", "ggml-tiny.bin", "ggml-tiny-int8.bin"});
        MODEL_FILES.put("base", new String[] {"ggml-base-q5_1.bin", "ggml-base.bin"});
        MODEL_FILES.put("small", new String[] {"ggml-small-q5_1.bin", "ggml-small.bin"});
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void listModels(PluginCall call) {
        JSArray models = new JSArray();
        for (Map.Entry<String, String[]> entry : MODEL_FILES.entrySet()) {
            String id = entry.getKey();
            File file = findModelFile(id);
            boolean inAssets = hasAnyAsset(entry.getValue());
            boolean ready = file != null && file.exists() && file.length() > 1024;
            JSObject item = new JSObject();
            item.put("id", id);
            item.put("label", modelLabel(id));
            item.put("fileName", preferredFileName(entry.getValue()));
            item.put("ready", ready);
            item.put("packaged", inAssets || ready);
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
        JSObject ret = new JSObject();
        File model = findModelFile(modelId);
        File cli = cliFile();
        boolean ready = model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
        ret.put("ready", ready);
        ret.put("modelId", modelId);
        if (!ready) {
            ret.put("detail", describeMissing(modelId, model, cli));
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
                String[] names = MODEL_FILES.get(modelId);
                boolean copiedModel = names != null && copyFirstExistingAsset(names, destDir);
                // Also unpack sibling models so switching later is instant
                for (Map.Entry<String, String[]> entry : MODEL_FILES.entrySet()) {
                    if (!entry.getKey().equals(modelId)) {
                        copyFirstExistingAsset(entry.getValue(), destDir);
                    }
                }
                File cli = ensureCliExecutable();
                File model = findModelFile(modelId);
                boolean ready =
                    model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
                JSObject ret = new JSObject();
                ret.put("ready", ready);
                ret.put("modelId", modelId);
                if (!ready) {
                    ret.put(
                        "detail",
                        "Whisper 未就绪。copiedModel="
                            + copiedModel
                            + " cli="
                            + (cli == null ? "null" : cli.getAbsolutePath())
                            + " — "
                            + describeMissing(modelId, model, cli)
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
                String[] names = MODEL_FILES.get(modelId);
                if (names != null) {
                    try {
                        copyFirstExistingAsset(names, modelDir());
                        model = findModelFile(modelId);
                    } catch (Exception e) {
                        Log.w(TAG, "lazy copy model failed: " + e.getMessage());
                    }
                }
            }
            File cli = ensureCliExecutable();
            if (model == null || !model.exists() || cli == null || !cli.exists()) {
                reject(call, "model_not_ready", describeMissing(modelId, model, cli));
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

                // whisper-cli 仅认 --prompt（单横杠 -prompt 会被当成 -p，打印 usage 且 exit 0）
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
        if (raw != null && MODEL_FILES.containsKey(raw)) return raw;
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

    /** Prefer nativeLibraryDir (executable on Android 10+); fall back to legacy files copy. */
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
        String[] names = MODEL_FILES.get(modelId);
        if (names == null) return null;
        File dir = modelDir();
        for (String name : names) {
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

    private String describeMissing(String modelId, File model, File cli) {
        StringBuilder sb = new StringBuilder();
        if (model == null || !model.exists()) {
            sb.append("缺少 Whisper ")
                .append(modelId)
                .append(" 模型（assets/diary-whisper/*.bin）; ");
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

    /** Help text is printed on bad args with exit 0 — must not become diary text. */
    private static boolean looksLikeCliHelp(String output) {
        if (output == null) return false;
        String t = output.trim();
        if (t.isEmpty()) return false;
        String head = t.length() > 80 ? t.substring(0, 80) : t;
        return head.startsWith("usage:")
            || t.contains("show this help message")
            || (t.contains("supported audio formats") && t.contains("--model"));
    }

    /** Best-effort: whisper.cpp -nt prints plain transcript lines. */
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
