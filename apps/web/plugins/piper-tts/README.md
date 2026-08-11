# piper-tts（Capacitor 本地插件）

关卡英文朗读：`Sherpa-ONNX` + Piper **Amy** / **Danny**，离线合成。

支持 **Android** 与 **iOS**（同一 JS API：`PiperTts`）。

## 准备资源

```bash
cd apps/web
# Android（AAR + 模型）
npm run fetch-piper-tts
# iOS（XCFramework + 模型）
npm run fetch-piper-tts -- --ios-only
# 或一键
npm run build:android
npm run build:ios
```

会下载：

| 资源 | 平台 | 大约体积 |
|------|------|----------|
| `sherpa-onnx-1.13.4.aar` | Android | ~49 MB |
| `sherpa-onnx` + `onnxruntime` XCFramework | iOS | ~190 MB 解压后 |
| Amy / Danny 模型 | 两端 | 见各压缩包 |

大文件 **不入库**（见仓库 `.gitignore`），由脚本拉到：

- Android：`android/libs/*.aar`、`android/src/main/assets/piper-tts/…`
- iOS：`ios/Frameworks/*.xcframework`、`ios/Resources/piper-tts/…`

## 人设映射

| 家长中心人设 | Piper 音色 |
|--------------|------------|
| 小女孩 / 女声 / 老奶奶 | Amy |
| 小男孩 / 男声 / 老爷爷 | Danny |

## 许可与署名

- **Sherpa-ONNX** 运行时：Apache-2.0  
- **Piper** 各音色：见模型目录 `MODEL_CARD`（Amy 等常见 **CC-BY-SA-4.0**）。

## API（Capacitor）

插件名：`PiperTts`

- `isReady()` → `{ ready, voiceId, detail? }`
- `prepareModel()` → 校验资源并预热默认 Amy
- `speak({ text, rate?, pitch?, voiceId?: 'amy'|'danny' })` → 合成并播放
- `stop()` → 停止播放

Web 端 stub 不可用；浏览器继续系统 `speechSynthesis`。
