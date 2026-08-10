# 关卡朗读：Sherpa-ONNX + Piper

App（Capacitor Android）英文 NPC / 提示朗读优先使用 **Sherpa-ONNX + Piper**（默认 `en_US-amy-low-int8`），失败或未打包模型时降级系统 TTS。浏览器联调仍用 `speechSynthesis`。

## 打包

```bash
cd apps/web
npm run fetch-piper-tts   # 拉 AAR + 模型（大文件不入库）
npm run build:android     # 已包含 fetch-piper-tts
```

详见 `apps/web/plugins/piper-tts/README.md`。

## 许可

- Sherpa-ONNX：Apache-2.0  
- Piper amy（low）：源自 Mycroft mimic3-voices，**CC-BY-SA-4.0**（分发请保留署名）

## 与 ASR 的关系

朗读（本插件）与关卡 Vosk / 日记 Whisper **相互独立**，互不替换。

## APK 冒烟清单（本机）

打出含模型的 APK 后，断网验证：

1. 家长中心试听：有声、听感为 Piper（非系统生硬音亦可接受为「有声」）
2. 关卡 NPC 短句：有声
3. 试听/朗读中切换页面或再次点试听：可取消/打断，无卡住
4. 故意去掉模型重打包：应降级系统 TTS，不静音崩溃

云端环境通常无 `android/` 工程，冒烟在本地 Android Studio / `cap sync` 后完成。
