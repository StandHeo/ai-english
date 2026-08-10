# piper-tts（Capacitor 本地插件）

关卡英文朗读：`Sherpa-ONNX` + **Piper `en_US-amy-low-int8`**，离线合成。

## 准备资源（打 APK 前必跑）

```bash
cd apps/web
npm run fetch-piper-tts
npm run build:android   # 已串入 fetch（见 package.json）
```

会下载：

| 资源 | 来源 | 大约体积 |
|------|------|----------|
| `sherpa-onnx-1.13.4.aar` | [sherpa-onnx v1.13.4](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.4) | ~49 MB（多 ABI） |
| `vits-piper-en_US-amy-low-int8` | [tts-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models) | ~21 MB 压缩包 |

大文件默认 **不入库**（见仓库 `.gitignore`），由脚本拉到：

- `android/libs/*.aar`
- `android/src/main/assets/piper-tts/vits-piper-en_US-amy-low-int8/`

## 许可与署名

- **Sherpa-ONNX** 运行时：Apache-2.0  
- **Piper amy (low)**：模型卡指向 Mycroft mimic3-voices，仓库为 **CC-BY-SA-4.0**。分发 APK 时请保留署名（见 `MODEL_CARD` / 本 README）。

音色说明：偏清晰的美式女声（low/int8），配合 App 内 persona 的 rate 调节；非专用童声库。

## API（Capacitor）

插件名：`PiperTts`

- `isReady()` → `{ ready, voiceId, detail? }`
- `prepareModel()` → 解包 assets → files，初始化 `OfflineTts`
- `speak({ text, rate? })` → 合成并播放
- `stop()` → 停止播放

Web 端 stub 不可用；浏览器继续系统 `speechSynthesis`。
