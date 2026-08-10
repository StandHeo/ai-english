# 关卡朗读：Sherpa-ONNX + Piper

App（Capacitor Android）英文 NPC / 提示朗读优先使用 **Sherpa-ONNX + Piper**：

- **Amy**（`en_US-amy-low-int8`）：小女孩 / 女声 / 老奶奶
- **Danny**（`en_US-danny-low`）：小男孩 / 男声 / 老爷爷

失败或未打包模型时降级系统 TTS。浏览器联调仍用 `speechSynthesis`。

## 打包

```bash
cd apps/web
# 若 GitHub 慢，可设代理：
# export HTTPS_PROXY=http://127.0.0.1:7890
npm run fetch-piper-tts   # 拉 AAR + Amy + Danny（大文件不入库）
npm run build:android     # 已包含 fetch-piper-tts
```

详见 `apps/web/plugins/piper-tts/README.md`。

## 许可

- Sherpa-ONNX：Apache-2.0  
- Piper 音色：请核对各模型 `MODEL_CARD`（Amy 等常见为 **CC-BY-SA-4.0**），分发请保留署名

## 与 ASR 的关系

朗读（本插件）与关卡 Vosk / 日记 Whisper **相互独立**，互不替换。

## APK 冒烟清单（本机）

打出含模型的 APK 后，断网验证：

1. 家长中心试听 Amy 人设（小女孩）与 Danny 人设（小男孩）：音色明显不同
2. 关卡 NPC 短句：有声
3. 试听/朗读中切换页面或再次点试听：可取消/打断，无卡住
4. 故意去掉模型重打包：应降级系统 TTS，不静音崩溃

云端环境通常无 `android/` 工程，冒烟在本地 Android Studio / `cap sync` 后完成。
