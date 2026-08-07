package com.aienglish.diarywhisper;

import android.content.pm.ApplicationInfo;
import android.system.Os;
import android.util.Base64;
import android.util.Log;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * On-device Whisper bridge for family diary ASR.
 *
 * <p>Model: {@code assets/diary-whisper/ggml-tiny*.bin} → copied to app files.
 * CLI: {@code jniLibs/arm64-v8a/libwhisper_cli.so} (Android 10+ cannot exec from files/).
 */
@CapacitorPlugin(name = "DiaryWhisper")
public class DiaryWhisperPlugin extends Plugin {
    private static final String TAG = "DiaryWhisper";
    private static final String ASSET_DIR = "diary-whisper";
    private static final String[] MODEL_NAMES = {
        "ggml-tiny-q5_1.bin",
        "ggml-tiny.bin",
        "ggml-tiny-int8.bin"
    };
    /** Packaged as .so so PackageManager extracts it into nativeLibraryDir (executable). */
    private static final String NATIVE_CLI = "libwhisper_cli.so";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject ret = new JSObject();
        File model = findModelFile();
        File cli = cliFile();
        boolean ready = model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
        ret.put("ready", ready);
        if (!ready) {
            ret.put("detail", describeMissing(model, cli));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void prepareModel(PluginCall call) {
        executor.execute(() -> {
            try {
                File destDir = modelDir();
                if (!destDir.exists() && !destDir.mkdirs()) {
                    reject(call, "model_not_ready", "无法创建模型目录");
                    return;
                }
                boolean copiedModel = copyFirstExistingAsset(MODEL_NAMES, destDir);
                File cli = ensureCliExecutable();
                File model = findModelFile();
                boolean ready =
                    model != null && model.exists() && cli != null && cli.exists() && cli.canExecute();
                JSObject ret = new JSObject();
                ret.put("ready", ready);
                if (!ready) {
                    ret.put(
                        "detail",
                        "Whisper 未就绪。copiedModel="
                            + copiedModel
                            + " cli="
                            + (cli == null ? "null" : cli.getAbsolutePath())
                            + " — "
                            + describeMissing(model, cli)
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
        if (wavBase64 == null || wavBase64.isEmpty()) {
            reject(call, "invalid_audio", "缺少音频");
            return;
        }

        executor.execute(() -> {
            File model = findModelFile();
            File cli = ensureCliExecutable();
            if (model == null || !model.exists() || cli == null || !cli.exists()) {
                reject(call, "model_not_ready", describeMissing(model, cli));
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
                    "-nt",
                    "-np"
                );
                pb.redirectErrorStream(true);
                pb.directory(modelDir());
                // Clear LD_LIBRARY_PATH quirks; native dir is enough for static-ish cli
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
                String text = extractTranscript(output);
                JSObject ret = new JSObject();
                ret.put("text", text == null ? "" : text.trim());
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

    private File findModelFile() {
        File dir = modelDir();
        for (String name : MODEL_NAMES) {
            File f = new File(dir, name);
            if (f.exists() && f.length() > 1024) return f;
        }
        return null;
    }

    private String describeMissing(File model, File cli) {
        StringBuilder sb = new StringBuilder();
        if (model == null || !model.exists()) {
            sb.append("缺少 Whisper tiny 模型（assets/diary-whisper/*.bin）; ");
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

    /** Best-effort: whisper.cpp -nt prints plain transcript lines. */
    private static String extractTranscript(String output) {
        if (output == null) return "";
        String[] lines = output.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            if (t.startsWith("whisper_") || t.startsWith("system_") || t.startsWith("main:")) continue;
            if (t.startsWith("ggml_") || t.startsWith("error:")) continue;
            t = t.replaceAll("^\\[[^\\]]+\\]\\s*", "");
            if (t.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(t);
        }
        return sb.toString().trim();
    }
}
