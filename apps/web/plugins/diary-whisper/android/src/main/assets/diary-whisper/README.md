# diary-whisper 资源（勿提交大模型到 git）

将下列文件放入本目录后重新 `npx cap sync` / 打 APK：

1. `ggml-tiny.bin` 或 `ggml-tiny-q5_1.bin`（Whisper tiny）
2. `whisper-cli`（whisper.cpp 预编译 **arm64-v8a** 可执行文件）

首次调用 `prepareModel` 时会解包到应用私有目录。
