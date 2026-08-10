## 为什么

关卡 NPC 朗读目前依赖系统 TTS（Capacitor Text-to-Speech / 浏览器 `speechSynthesis`），听感偏死板，和儿童故事氛围不匹配。需要在 **Android App 上免费、离线** 换成更自然的神经合成；已选定 **Sherpa-ONNX + Piper（英文音色）** 作为主路径，系统 TTS 仅作降级。

## 变更内容

- 新增 Capacitor 原生 TTS 桥接：用 **Sherpa-ONNX** 加载 **Piper** 英文模型，合成关卡/家庭关的英文短句。
- `requestTts` / 播放链路在原生且模型就绪时 **优先 Piper**；未就绪或失败时回退现有系统 TTS，浏览器预览仍走系统/Web 朗读。
- 家长音色偏好（persona / 语速音调）在 Piper 可用时映射到可选说话人或 rate 参数；无对应音色时保留合理默认。
- 模型资源随 APK 内置或首次解包（体积可控的 medium/low 英文声）；文档说明许可与体积。
- **非目标**：CosyVoice/ChatTTS 端侧、关卡全量预录音主路径、改 ASR（Vosk/Whisper）、云端付费 TTS、iOS 首版必达（可预留接口）。

## 能力

### 新增能力

- `sherpa-piper-tts`：在 Capacitor 原生环境用 Sherpa-ONNX + Piper 离线合成英文语音，并报告就绪/失败状态。
- `tts-engine-routing`：统一朗读入口优先神经 TTS、失败降级系统 TTS；浏览器保持现有行为。

### 修改的能力

- （无——主规格目录未归档语音相关主规格；本变更以新增能力描述行为。实现上会增强 `voice/client` 与家长试听，不单独开未归档主规格的 delta。）

## 影响

- `apps/web`：`voice/client.ts`、可选 `prefs` 与 Piper 音色映射；家长中心试听应能体现新引擎（原生环境）。
- Capacitor / Android：Sherpa-ONNX 原生库 + Piper `.onnx` 模型资源；本地插件（类似 `diary-whisper` 模式）。
- APK 体积与首次解包体验；文档与 `docs/tech-architecture.md` 语音章节更新。
- 不改动关卡 JSON schema、ASR、家庭日记 Whisper。
