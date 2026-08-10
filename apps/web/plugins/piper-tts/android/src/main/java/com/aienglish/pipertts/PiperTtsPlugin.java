package com.aienglish.pipertts;

import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.PlaybackParams;
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
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * On-device Piper TTS via Sherpa-ONNX.
 *
 * <p>Supports Amy (female) and Danny (younger male). Assets under
 * {@code assets/piper-tts/} from {@code scripts/fetch-piper-tts.mjs}.
 */
@CapacitorPlugin(name = "PiperTts")
public class PiperTtsPlugin extends Plugin {
    private static final String TAG = "PiperTts";
    private static final String ASSET_ROOT = "piper-tts";
    private static final String TOKENS_NAME = "tokens.txt";
    private static final String DATA_DIR_NAME = "espeak-ng-data";
    private static final String DEFAULT_VOICE = "amy";

    private static final class VoicePack {
        final String id;
        final String dirName;
        final String onnxName;

        VoicePack(String id, String dirName, String onnxName) {
            this.id = id;
            this.dirName = dirName;
            this.onnxName = onnxName;
        }
    }

    private static final VoicePack[] VOICES =
        new VoicePack[] {
            new VoicePack("amy", "vits-piper-en_US-amy-low-int8", "en_US-amy-low.onnx"),
            new VoicePack("danny", "vits-piper-en_US-danny-low", "en_US-danny-low.onnx"),
        };

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean stopRequested = new AtomicBoolean(false);
    private final Map<String, VoicePack> packsById = new HashMap<>();

    /** Currently loaded engine (one at a time to limit RAM). */
    private OfflineTts tts;
    private String loadedVoiceId;
    private AudioTrack track;
    private final Object playLock = new Object();

    public PiperTtsPlugin() {
        for (VoicePack p : VOICES) {
            packsById.put(p.id, p);
        }
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject ret = new JSObject();
        boolean anyOnDisk = false;
        for (VoicePack p : VOICES) {
            if (modelReadyOnDisk(p)) {
                anyOnDisk = true;
                break;
            }
        }
        boolean ready = anyOnDisk && tts != null;
        ret.put("ready", ready || anyOnDisk);
        ret.put("voiceId", loadedVoiceId != null ? loadedVoiceId : DEFAULT_VOICE);
        if (!anyOnDisk) {
            ret.put("detail", "缺少 Piper 模型，请运行 npm run fetch-piper-tts 后重新打包");
            ret.put("ready", false);
        } else if (tts == null) {
            ret.put("detail", "模型已在磁盘，首次朗读时初始化引擎");
            // treat disk-ready as ready for JS ensurePiperReady；speak 会再 init
            ret.put("ready", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void prepareModel(PluginCall call) {
        executor.execute(() -> {
            try {
                int copied = 0;
                for (VoicePack pack : VOICES) {
                    if (!assetExists(ASSET_ROOT + "/" + pack.dirName + "/" + pack.onnxName)) {
                        Log.w(TAG, "APK missing voice asset: " + pack.id);
                        continue;
                    }
                    File destRoot = modelRoot(pack);
                    if (!destRoot.exists() && !destRoot.mkdirs()) {
                        continue;
                    }
                    copyAssetDir(ASSET_ROOT + "/" + pack.dirName, destRoot);
                    if (modelReadyOnDisk(pack)) copied++;
                }
                if (copied == 0) {
                    reject(
                        call,
                        "model_not_ready",
                        "APK 未打包 Piper 模型。请执行 npm run fetch-piper-tts 后 cap sync"
                    );
                    return;
                }
                // 预热默认女声
                ensureEngineLocked(DEFAULT_VOICE);
                JSObject ret = new JSObject();
                ret.put("ready", tts != null || modelReadyOnDisk(packsById.get(DEFAULT_VOICE)));
                ret.put("voiceId", loadedVoiceId != null ? loadedVoiceId : DEFAULT_VOICE);
                if (tts == null) {
                    ret.put("detail", "Sherpa OfflineTts 初始化失败（将在 speak 时重试）");
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
        String voiceId = normalizeVoiceId(call.getString("voiceId", DEFAULT_VOICE));
        Double rateObj = call.getDouble("rate");
        float rate = rateObj == null ? 1.0f : rateObj.floatValue();
        Double pitchObj = call.getDouble("pitch");
        float pitch = pitchObj == null ? 1.0f : pitchObj.floatValue();
        float speed = Math.max(0.55f, Math.min(1.45f, rate));
        float playPitch = Math.max(0.7f, Math.min(1.85f, pitch));

        executor.execute(() -> {
            try {
                stopPlaybackLocked();
                stopRequested.set(false);

                String useVoice = voiceId;
                if (!ensureEngineLocked(useVoice)) {
                    if (!DEFAULT_VOICE.equals(useVoice) && ensureEngineLocked(DEFAULT_VOICE)) {
                        useVoice = DEFAULT_VOICE;
                        Log.w(TAG, "fallback to amy, requested=" + voiceId);
                    } else {
                        reject(call, "model_not_ready", "Piper 引擎未就绪: " + voiceId);
                        return;
                    }
                }

                GeneratedAudio audio = tts.generate(text.trim(), 0, speed);
                if (audio == null || audio.getSamples() == null || audio.getSamples().length == 0) {
                    reject(call, "speak_failed", "合成结果为空");
                    return;
                }
                if (stopRequested.get()) {
                    call.resolve(okResult("stopped", useVoice));
                    return;
                }
                playSamples(audio.getSamples(), audio.getSampleRate(), playPitch);
                call.resolve(okResult(stopRequested.get() ? "stopped" : "ok", useVoice));
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
        call.resolve(okResult("stopped", loadedVoiceId != null ? loadedVoiceId : DEFAULT_VOICE));
    }

    private String normalizeVoiceId(String raw) {
        if (raw == null) return DEFAULT_VOICE;
        String id = raw.trim().toLowerCase();
        if (packsById.containsKey(id)) return id;
        if (id.contains("danny") || id.contains("boy") || id.contains("male") || id.equals("man")) {
            return "danny";
        }
        return DEFAULT_VOICE;
    }

    private JSObject okResult(String status, String voiceId) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("voiceId", voiceId);
        return ret;
    }

    private void reject(PluginCall call, String code, String message) {
        call.reject(message == null ? code : message, code);
    }

    private File modelRoot(VoicePack pack) {
        return new File(getContext().getFilesDir(), ASSET_ROOT + "/" + pack.dirName);
    }

    private boolean modelReadyOnDisk(VoicePack pack) {
        if (pack == null) return false;
        File root = modelRoot(pack);
        File onnx = new File(root, pack.onnxName);
        File tokens = new File(root, TOKENS_NAME);
        File data = new File(root, DATA_DIR_NAME);
        return onnx.exists() && onnx.length() > 1024 && tokens.exists() && data.isDirectory();
    }

    /** Copy from assets if needed, then load OfflineTts for voiceId. */
    private synchronized boolean ensureEngineLocked(String voiceId) {
        VoicePack pack = packsById.get(voiceId);
        if (pack == null) return false;

        if (tts != null && voiceId.equals(loadedVoiceId)) {
            return true;
        }

        releaseEngineLocked();

        try {
            if (!modelReadyOnDisk(pack)) {
                if (!assetExists(ASSET_ROOT + "/" + pack.dirName + "/" + pack.onnxName)) {
                    return false;
                }
                File dest = modelRoot(pack);
                if (!dest.exists() && !dest.mkdirs()) return false;
                copyAssetDir(ASSET_ROOT + "/" + pack.dirName, dest);
            }
            if (!modelReadyOnDisk(pack)) return false;

            File root = modelRoot(pack);
            File onnx = new File(root, pack.onnxName);
            File tokens = new File(root, TOKENS_NAME);
            File dataDir = new File(root, DATA_DIR_NAME);

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

            tts = new OfflineTts(null, config);
            loadedVoiceId = voiceId;
            Log.i(TAG, "OfflineTts ready voice=" + voiceId + " sampleRate=" + tts.sampleRate());
            return true;
        } catch (Exception e) {
            Log.e(TAG, "ensureEngine failed voice=" + voiceId, e);
            releaseEngineLocked();
            return false;
        }
    }

    private void releaseEngineLocked() {
        if (tts != null) {
            try {
                tts.release();
            } catch (Exception e) {
                Log.w(TAG, "tts.release", e);
            }
            tts = null;
        }
        loadedVoiceId = null;
    }

    private void playSamples(float[] samples, int sampleRate, float pitch) {
        synchronized (playLock) {
            if (sampleRate <= 0 || samples.length == 0) return;

            int minBuf = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            int bufSize = Math.max(minBuf, 32 * 1024);
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

            if (track.getState() != AudioTrack.STATE_INITIALIZED) {
                Log.e(TAG, "AudioTrack not initialized");
                stopPlaybackLocked();
                return;
            }

            try {
                PlaybackParams params = new PlaybackParams();
                params.setPitch(pitch);
                params.setSpeed(1.0f);
                track.setPlaybackParams(params);
            } catch (Exception e) {
                Log.w(TAG, "setPlaybackParams pitch=" + pitch, e);
            }

            track.play();
            final long playStartedAt = System.currentTimeMillis();
            final float pitchSafe = Math.max(0.7f, Math.min(1.85f, pitch));

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
                int written = 0;
                while (written < bi && !stopRequested.get()) {
                    int w = track.write(chunk, written, bi - written);
                    if (w < 0) {
                        Log.e(TAG, "AudioTrack.write failed: " + w);
                        stopPlaybackLocked();
                        return;
                    }
                    written += w;
                }
            }

            if (!stopRequested.get()) {
                long durationMs = (long) (samples.length * 1000L / sampleRate / pitchSafe) + 80;
                long deadline = playStartedAt + durationMs;
                try {
                    while (!stopRequested.get() && System.currentTimeMillis() < deadline) {
                        int head = track.getPlaybackHeadPosition();
                        if (head >= samples.length - 1) break;
                        Thread.sleep(20);
                    }
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
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
