# 关卡朗读：Sherpa-ONNX + Piper

App（Capacitor **Android / iOS**）英文 NPC / 提示朗读优先使用 **Sherpa-ONNX + Piper**：

- **Amy**（`en_US-amy-low-int8`）：小女孩 / 女声 / 老奶奶
- **Danny**（`en_US-danny-low`）：小男孩 / 男声 / 老爷爷

失败或未打包模型时降级系统 TTS。浏览器联调仍用 `speechSynthesis`。

家长中心「英语朗读声音」可选 **Piper** 或 **系统 TTS**（存于 `ai-english-voice-prefs-v1` 的 `ttsEngine`；默认 Piper）。选系统时不加载 Piper。

## iOS

插件 `piper-tts` 含 iOS 实现（`PiperTts` + sherpa / onnxruntime XCFramework）。在 Mac 上：

```bash
cd apps/web
npm run fetch-piper-tts -- --ios-only
# 或 npm run build:ios
```

未拉模型时 `isReady` 为 false，朗读自动降级系统 TTS。

## 打包

```bash
cd apps/web
# 若 GitHub 慢，可设代理：
# export HTTPS_PROXY=http://127.0.0.1:7890
npm run fetch-piper-tts              # Android AAR + 模型
npm run fetch-piper-tts -- --ios-only
npm run build:android                # 已包含 fetch-piper-tts
npm run build:ios                    # 已包含 iOS fetch
```

详见 `apps/web/plugins/piper-tts/README.md`。

## 许可

- Sherpa-ONNX：Apache-2.0  
- Piper 音色：请核对各模型 `MODEL_CARD`（Amy 等常见为 **CC-BY-SA-4.0**），分发请保留署名

## 与 ASR 的关系

朗读（本插件）与关卡 Vosk / 日记 Whisper **相互独立**，互不替换。

## 冒烟建议

1. App 内选 Piper → 进关听 NPC：应接近神经合成音  
2. 切换「系统 TTS」试听：应明显变为手机系统音；再切回 Piper  
3. iOS：未 fetch 模型时应能降级系统音；fetch 后再 sync 应走 Piper
