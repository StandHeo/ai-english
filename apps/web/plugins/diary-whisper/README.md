# diary-whisper（Capacitor 本地插件）

家庭日记专用的端侧 Whisper 桥接。关卡口语请继续使用 Vosk（或其他关卡 ASR），不要混用本插件。

支持 **Android**（whisper-cli）与 **iOS**（whisper.xcframework + ggml 模型）。

## 接入

```bash
cd apps/web
npm install
npm run fetch-diary-whisper            # Android 模型 + CLI
npm run fetch-diary-whisper -- --ios-only   # iOS 模型 + XCFramework
npx cap sync android   # 或 ios
# 一键：npm run build:android / npm run build:ios
```

## 模型资源

**Android：** `plugins/diary-whisper/android/src/main/assets/diary-whisper/`  
**iOS：** `plugins/diary-whisper/ios/Resources/diary-whisper/`

- `ggml-tiny-q5_1.bin`（默认）
- `ggml-base-q5_1.bin`
- `ggml-small-q5_1.bin`

iOS 另需：`ios/Frameworks/whisper.xcframework`（脚本自动下载；**iOS 16.4+**）。

详见目录内 README 与仓库 `docs/family-diary-whisper.md`。
