## 1. Capacitor Piper 插件与模型

- [ ] 1.1 新增本地插件骨架（`isReady` / `prepareModel` / `speak` / `stop`），Web stub 标记不可用
- [ ] 1.2 Android 集成 Sherpa-ONNX TTS，assets 放入选定 Piper 英文模型并支持首次解包
- [ ] 1.3 核对所选音色许可与体积，写入插件 README / 项目文档

## 2. 朗读路由与偏好

- [ ] 2.1 `requestTts`：原生优先 Piper，失败/未就绪降级系统 TTS；浏览器路径不变
- [ ] 2.2 `cancelSpeak` 同时停止 Piper 与系统 TTS
- [ ] 2.3 persona / rate（及可选 pitch）映射到 Piper；保留 `ai-english-voice-prefs-v1`

## 3. 验证与文档

- [ ] 3.1 家长试听与关卡短句在 APK 上冒烟（有声、可取消、断网可用）
- [ ] 3.2 更新 `docs/tech-architecture.md`（及必要时 README）说明 Piper 主路径与降级
- [ ] 3.3 浏览器联调确认无 Piper 时不报错中断
