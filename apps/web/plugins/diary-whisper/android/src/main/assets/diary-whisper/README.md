# diary-whisper Android assets

默认只打包 **Tiny** 模型（`ggml-tiny-q5_1.bin`），用于减小 APK。

- Base / Small：App 内首次选择时从 Hugging Face / hf-mirror **按需下载**到应用私有目录。
- 准备 Tiny：`cd apps/web && npm run fetch-diary-whisper -- --tiny-only --android-only`
- 打 Android 包：`npm run build:android`（会自动 `--tiny-only` + `patch-android-slim` 仅保留 arm64）

详见 `docs/family-diary-whisper.md`。
