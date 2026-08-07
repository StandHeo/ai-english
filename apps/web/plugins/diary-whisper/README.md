# diary-whisper（Capacitor 本地插件）

家庭日记专用的端侧 Whisper 桥接。关卡口语请继续使用 Vosk（或其他关卡 ASR），不要混用本插件。

## 接入

```bash
cd apps/web
# package.json 已通过 file:plugins/diary-whisper 依赖
npm install
npx cap sync android
```

## 模型资源

将 Whisper 模型与 `whisper-cli` 放入：

`plugins/diary-whisper/android/src/main/assets/diary-whisper/`

- `ggml-tiny-q5_1.bin`（默认）
- `ggml-base-q5_1.bin`（设置可切换）
- `ggml-small-q5_1.bin`（设置可切换，更准更慢）

详见该目录 `README.md` 与仓库 `docs/family-diary-whisper.md`。
