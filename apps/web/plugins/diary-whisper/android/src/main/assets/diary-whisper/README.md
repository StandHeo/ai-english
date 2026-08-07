# diary-whisper 资源

本目录随仓库提供：

1. `ggml-tiny-q5_1.bin`（Whisper tiny 量化模型）
2. `whisper-cli`（whisper.cpp **arm64-v8a** Android 可执行文件）

首次调用 `prepareModel` 时会解包到应用私有目录。若本地缺失，可运行 `npm run fetch-diary-whisper`。
