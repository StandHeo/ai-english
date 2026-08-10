package com.aienglish.pipertts;

import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * On-device Piper TTS via Sherpa-ONNX.
 *
 * <p>Expects assets under {@code assets/piper-tts/vits-piper-en_US-amy-low-int8/}
 * (fetched by {@code scripts/fetch-piper-tts.mjs}). First {@code prepareModel}
 * copies them into the app files directory.
 */
@CapacitorPlugin(name = "PiperTts")
public class PiperTtsPlugin extends Plugin {
    private static final String TAG = "PiperTts";
    private static final String ASSET_ROOT = "piper-tts";
    private static final String MODEL_DIR_NAME = "vits-piper-en_US-amy-low-int8";
    private static final String ONNX_NAME = "en_US-amy-low.onnx";
    private static final String TOKENS_NAME = "tokens.txt";
    private static final String DATA_DIR_NAME = "espeak-ng-data";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean stopRequested = new AtomicBoolean(false);

    private OfflineTts tts;
    private AudioTrack track;
    private final Object playLock = new Object();

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject ret = new JSObject();
        boolean ready = modelReadyOnDisk() && tts != null;
        ret.put("ready", ready);
        ret.put("voiceId", "amy-low-int8");
        if (!ready) {
            ret.put(
                "detail",
                modelReadyOnDisk()
                    ? "引擎未初始化，请先 prepareModel"
                    : "缺少 Piper 模型，请运行 npm run fetch-piper-tts 后重新打包"
            );
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void prepareModel(PluginCall call) {
        executor.execute(() -> {
            try {
                File destRoot = modelRoot();
                if (!destRoot.exists() && !destRoot.mkdirs()) {
                    reject(call, "model_not_ready", "无法创建模型目录");
                    return;
                }
                if (!assetExists(ASSET_ROOT + "/" + MODEL_DIR_NAME + "/" + ONNX_NAME)) {
                    reject(
                        call,
                        "model_not_ready",
                        "APK 未打包 Piper 模型。请执行 npm run fetch-piper-tts 后 cap sync"
                    );
                    return;
                }
                copyAssetDir(ASSET_ROOT + "/" + MODEL_DIR_NAME, destRoot);
                initEngineLocked();
                JSObject ret = new JSObject();
                ret.put("ready", tts != null);
                ret.put("voiceId", "amy-low-int8");
                if (tts == null) {
                    ret.put("detail", "Sherpa OfflineTts 初始化失败");
                }
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "prepareModel failed", e);
                reject(call, "model_not_ready", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            reject(call, "invalid_text", "文本为空");
            return;
        }
        Double rateObj = call.getDouble("rate");
        float rate = rateObj == null ? 1.0f : rateObj.floatValue();
        // Map app persona rate (~0.55–1.35) into a sensible Piper speed band
        float speed = Math.max(0.6f, Math.min(1.4f, rate));

        executor.execute(() -> {
            try {
                stopPlaybackLocked();
                stopRequested.set(false);
                if (tts == null) {
                    if (!modelReadyOnDisk()) {
                        copyAssetDir(ASSET_ROOT + "/" + MODEL_DIR_NAME, modelRoot());
                    }
                    initEngineLocked();
                }
                if (tts == null) {
                    reject(call, "model_not_ready", "Piper 引擎未就绪");
                    return;
                }
                GeneratedAudio audio = tts.generate(text.trim(), 0, speed);
                if (audio == null || audio.getSamples() == null || audio.getSamples().length == 0) {
                    reject(call, "speak_failed", "合成结果为空");
                    return;
                }
                if (stopRequested.get()) {
                    call.resolve(okResult("stopped"));
                    return;
                }
                playSamples(audio.getSamples(), audio.getSampleRate());
                call.resolve(okResult(stopRequested.get() ? "stopped" : "ok"));
            } catch (Exception e) {
                Log.e(TAG, "speak failed", e);
                reject(call, "speak_failed", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopRequested.set(true);
        stopPlaybackLocked();
        call.resolve(okResult("stopped"));
    }

    private JSObject okResult(String status) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("voiceId", "amy-low-int8");
        return ret;
    }

    private void reject(PluginCall call, String code, String message) {
        call.reject(message == null ? code : message, code);
    }

    private File modelRoot() {
        return new File(getContext().getFilesDir(), ASSET_ROOT + "/" + MODEL_DIR_NAME);
    }

    private boolean modelReadyOnDisk() {
        File root = modelRoot();
        File onnx = new File(root, ONNX_NAME);
        File tokens = new File(root, TOKENS_NAME);
        File data = new File(root, DATA_DIR_NAME);
        return onnx.exists() && onnx.length() > 1024 && tokens.exists() && data.isDirectory();
    }

    private synchronized void initEngineLocked() {
        if (tts != null) return;
        File root = modelRoot();
        File onnx = new File(root, ONNX_NAME);
        File tokens = new File(root, TOKENS_NAME);
        File dataDir = new File(root, DATA_DIR_NAME);
        if (!onnx.exists() || !tokens.exists() || !dataDir.isDirectory()) {
            Log.w(TAG, "model files missing under " + root.getAbsolutePath());
            return;
        }

        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(onnx.getAbsolutePath());
        vits.setLexicon("");
        vits.setTokens(tokens.getAbsolutePath());
        vits.setDataDir(dataDir.getAbsolutePath());
        vits.setDictDir("");

        OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
        modelConfig.setVits(vits);
        modelConfig.setNumThreads(2);
        modelConfig.setDebug(false);
        modelConfig.setProvider("cpu");

        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(modelConfig);
        config.setMaxNumSentences(2);

        // AssetManager null: load from absolute filesystem paths (filesDir copy)
        tts = new OfflineTts(null, config);
        Log.i(TAG, "OfflineTts ready sampleRate=" + tts.sampleRate());
    }

    private void playSamples(float[] samples, int sampleRate) {
        synchronized (playLock) {
            int minBuf = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            int bufSize = Math.max(minBuf, samples.length * 2);
            track =
                new AudioTrack.Builder()
                    .setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAudioFormat(
                        new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(bufSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
            track.play();

            byte[] chunk = new byte[4096];
            int i = 0;
            while (i < samples.length && !stopRequested.get()) {
                int n = Math.min(samples.length - i, chunk.length / 2);
                int bi = 0;
                for (int s = 0; s < n; s++, i++) {
                    float v = Math.max(-1f, Math.min(1f, samples[i]));
                    short pcm = (short) (v * 32767f);
                    chunk[bi++] = (byte) (pcm & 0xff);
                    chunk[bi++] = (byte) ((pcm >> 8) & 0xff);
                }
                track.write(chunk, 0, bi);
            }
            try {
                if (!stopRequested.get()) {
                    // brief drain
                    Thread.sleep(40);
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            stopPlaybackLocked();
        }
    }

    private void stopPlaybackLocked() {
        synchronized (playLock) {
            if (track != null) {
                try {
                    track.pause();
                } catch (Exception ignored) {
                }
                try {
                    track.flush();
                } catch (Exception ignored) {
                }
                try {
                    track.release();
                } catch (Exception ignored) {
                }
                track = null;
            }
        }
    }

    private boolean assetExists(String path) {
        try (InputStream in = getContext().getAssets().open(path)) {
            return in != null;
        } catch (Exception e) {
            return false;
        }
    }

    private void copyAssetDir(String assetDir, File destDir) throws Exception {
        AssetManager am = getContext().getAssets();
        String[] children = am.list(assetDir);
        if (children == null) return;
        if (!destDir.exists() && !destDir.mkdirs()) {
            throw new IllegalStateException("mkdir failed: " + destDir);
        }
        for (String name : children) {
            String assetPath = assetDir + "/" + name;
            String[] sub = am.list(assetPath);
            File out = new File(destDir, name);
            if (sub != null && sub.length > 0) {
                copyAssetDir(assetPath, out);
            } else {
                if (out.exists() && out.length() > 0) continue;
                try (InputStream in = am.open(assetPath); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        os.write(buf, 0, n);
                    }
                }
            }
        }
    }
}
