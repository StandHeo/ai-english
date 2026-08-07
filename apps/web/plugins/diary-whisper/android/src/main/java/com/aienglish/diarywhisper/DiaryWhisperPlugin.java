package com.aienglish.diarywhisper;

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
 * Expects assets under {@code assets/diary-whisper/}:
 * <ul>
 *   <li>{@code ggml-tiny.bin} (or {@code ggml-tiny-q5_1.bin}) — Whisper tiny model</li>
 *   <li>{@code whisper-cli} — prebuilt arm64 whisper.cpp CLI (optional but required to run)</li>
 * </ul>
 * First {@code prepareModel} copies them into the app files directory.
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
    private static final String CLI_NAME = "whisper-cli";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject ret = new JSObject();
        File model = findModelFile();
        File cli = cliFile();
        boolean ready = model != null && model.exists() && cli.exists() && cli.canExecute();
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
                boolean copiedCli = copyAssetIfPresent(CLI_NAME, new File(destDir, CLI_NAME));
                File cli = cliFile();
                if (cli.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    cli.setExecutable(true);
                }
                File model = findModelFile();
                boolean ready = model != null && model.exists() && cli.exists() && cli.canExecute();
                JSObject ret = new JSObject();
                ret.put("ready", ready);
                if (!ready) {
                    ret.put(
                        "detail",
                        "请将 Whisper tiny 模型与 arm64 whisper-cli 放入 APK assets/"
                            + ASSET_DIR
                            + "/ 后重新打包。copiedModel="
                            + copiedModel
                            + " copiedCli="
                            + copiedCli
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
            File cli = cliFile();
            if (model == null || !model.exists() || !cli.exists() || !cli.canExecute()) {
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

    private File cliFile() {
        return new File(modelDir(), CLI_NAME);
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
        if (model == null || !model.exists()) sb.append("缺少 Whisper tiny 模型; ");
        if (cli == null || !cli.exists()) sb.append("缺少 whisper-cli; ");
        else if (!cli.canExecute()) sb.append("whisper-cli 不可执行; ");
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
            // Drop timestamp brackets like [00:00:00.000 --> 00:00:01.000]
            t = t.replaceAll("^\\[[^\\]]+\\]\\s*", "");
            if (t.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(t);
        }
        return sb.toString().trim();
    }
}
