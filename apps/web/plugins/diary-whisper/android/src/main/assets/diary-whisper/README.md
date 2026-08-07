# diary-whisper 资源

- 模型（本目录，随 APK assets 打包）：
  - `ggml-tiny-q5_1.bin`（默认，更快）
  - `ggml-base-q5_1.bin`（更准，稍慢；设置里可切换）
  - `ggml-small-q5_1.bin`（更准，较慢；设置里可切换）
- CLI：`../../jniLibs/arm64-v8a/libwhisper_cli.so`（必须放 jniLibs；Android 10+ 不能从 files/ 执行二进制）

若缺失可运行：`npm run fetch-diary-whisper`
