# piper-tts（Capacitor 本地插件）

关卡英文朗读：`Sherpa-ONNX` + Piper **Amy** / **Danny**，离线合成。

## 准备资源（打 APK 前必跑）

```bash
cd apps/web
# 可选代理：export HTTPS_PROXY=http://127.0.0.1:7890
npm run fetch-piper-tts
npm run build:android   # 已串入 fetch（见 package.json）
```

会下载：

| 资源 | 来源 | 大约体积 |
|------|------|----------|
| `sherpa-onnx-1.13.4.aar` | [sherpa-onnx v1.13.4](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.4) | ~49 MB（多 ABI） |
| `vits-piper-en_US-amy-low-int8` | [tts-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models) | ~21 MB 压缩包 |
| `vits-piper-en_US-danny-low` | 同上 | ~60 MB 量级 |

大文件默认 **不入库**（见仓库 `.gitignore`），由脚本拉到：

- `android/libs/*.aar`
- `android/src/main/assets/piper-tts/vits-piper-en_US-amy-low-int8/`
- `android/src/main/assets/piper-tts/vits-piper-en_US-danny-low/`

## 人设映射

| 家长中心人设 | Piper 音色 |
|--------------|------------|
| 小女孩 / 女声 / 老奶奶 | Amy |
| 小男孩 / 男声 / 老爷爷 | Danny |

仍可用语速/音调微调；Danny 不是专用童声，但比女声更接近男孩/男声。

## 许可与署名

- **Sherpa-ONNX** 运行时：Apache-2.0  
- **Piper** 各音色：见模型目录 `MODEL_CARD`（Amy 等常见 **CC-BY-SA-4.0**）。分发 APK 时请保留署名。

## API（Capacitor）

插件名：`PiperTts`

- `isReady()` → `{ ready, voiceId, detail? }`
- `prepareModel()` → 解包 assets → files，预热默认 Amy
- `speak({ text, rate?, pitch?, voiceId?: 'amy'|'danny' })` → 合成并播放
- `stop()` → 停止播放

Web 端 stub 不可用；浏览器继续系统 `speechSynthesis`。
