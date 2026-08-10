## 背景

动机见 `proposal.md`。当前 `voice/client.ts`：原生走 `@capacitor-community/text-to-speech`，浏览器走 `speechSynthesis`，并由 `prefs.ts` 的 persona 调 rate/pitch。用户反馈听感死板；调研后选定 **Sherpa-ONNX + Piper**（免费、离线、Android 成熟），非 CosyVoice 端侧、非预录音主路径。

## 目标 / 非目标

**目标：**

- Android App：Piper 英文短句离线合成，接入现有 `requestTts` / `cancelSpeak`。
- 模型随包或首次解包；失败降级系统 TTS。
- 文档说明模型选型、体积与许可。

**非目标：**

- iOS 首版必达；云端 TTS；替换 ASR；全关卡人工预录音；端侧 CosyVoice/Kokoro（Kokoro 可作为后续升级选项，本变更不强制）。

## 决策

### D1 — 运行时：Sherpa-ONNX + Piper

- **选择：** 原生用 Sherpa-ONNX 推理 Piper ONNX 英文模型（优先体积较小的 `en_US-*-medium` 或 `low` 级公开音色，以实现时 sherpa 已转换模型为准）。
- **原因：** 端侧成熟、延迟低、Apache-2.0 运行时；比系统 TTS 自然，比 CosyVoice 轻。
- **备选：** 仅系统 TTS（否决）；CosyVoice PC 服务（非本变更）；Kokoro（质量更高但更大，可二期）。

### D2 — 集成形态：Capacitor 本地插件

- **选择：** 新增本地插件（如 `apps/web/plugins/piper-tts`），`registerPlugin('PiperTts')`，API 拟：`isReady` / `prepareModel` / `speak({ text, rate? })` / `stop`；Web stub 返回不可用。
- **原因：** 与 `diary-whisper` 一致，页面不绑死 JNI。
- **备选：** 只依赖用户安装系统级 Sherpa TTS 引擎（不可控，否决为产品默认）。

### D3 — 路由

- **选择：** `requestTts`：原生 → 若 Piper ready 则 `PiperTts.speak`，否则 `speakNative`；浏览器不变。`cancelSpeak` 两路都 stop。
- **原因：** 儿童路径不能静音。
- **备选：** 强制仅 Piper（失败体验差）。

### D4 — 模型打包

- **选择：** 默认英文 Piper 模型打进插件 assets，首次 `prepareModel` 解包到 filesDir；文档写清体积与许可来源（Piper voice 许可与 sherpa 运行时分开核对）。
- **原因：** 离线首启可听。
- **备选：** 首次联网下载（增加失败面，非 MVP 默认）。

### D5 — Persona 映射（MVP）

- **选择：** MVP 可只打 1 个偏清晰、偏年轻的英文女声/童向可用声；persona 主要调 **rate**（及引擎支持的 pitch 若有）；多说话人包留扩展点。
- **原因：** 先解决「不那么死板」；多音色会胀包。
- **备选：** 一次打 6 个 persona 对应声（体积大，二期）。

### D6 — 与家长试听

- **选择：** 家长中心现有试听按钮走同一 `requestTts`，原生自动用 Piper。
- **原因：** 无需第二套 UI。

## 风险 / 权衡

- **[APK 体积]** → 选 low/medium 单音色；文档标明 MB 级增量。
- **[英文童声有限]** → Piper 公开库未必有完美童声；用偏活泼女声 + rate 近似；后续可换 Kokoro 或多声。
- **[模型许可]** → 实现前核对所选 Piper voice 许可证，写入文档。
- **[无 android/ 工程时]** → 插件源码进仓，本机 `cap sync` 验证；云端可先完成 TS 路由 + stub。
- **[与系统 TTS 听感切换]** → 可接受；状态仅家长/日志可观测即可。

## 迁移计划

- 无数据迁移；`ai-english-voice-prefs-v1` 保持兼容。
- 回滚：路由关掉 Piper 即回系统 TTS；插件可留在工程。

## 待决（不挡任务拆分）

- 具体 Piper 音色 id（如 lessac / amy 等）以实现时试听与许可为准，写入 `.env`/文档常量。
- 是否暴露「强制系统 TTS」家长开关（可后置）。
