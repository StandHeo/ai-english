## 背景

动机见 `proposal.md`。已有家庭日工作室（`ai-english-family-v1`）、制作台 `FamilyStudioPage`（整段 `story` + 浏览器/`/api/asr` 语音追加）、DeepSeek 生成与日历游玩。关卡口语侧用户计划/已有 Vosk；日记需要独立的端侧 Whisper 与聊天 UI。

## 目标 / 非目标

**目标：**

- 制作台改为按日消息气泡；每条可含音频 + 转写；可回放。
- Capacitor Android 上用端侧 Whisper（优先 tiny / int8）转写日记。
- 存储扩展支持 `messages[]`；合并文本仍可喂给现有生成关卡 API。
- DeepSeek Key UI 折叠；不改关卡拍引擎 / Vosk。

**非目标：**

- 浏览器 WASM Whisper 作为正式主路径；云端 OpenAI Whisper 日记默认；多设备同步；儿童聊天；重做日历视觉（可加「有语音」轻标记即可）。

## 决策

### D1 — ASR 双轨：日记 Whisper / 关卡 Vosk

- **选择：** 日记录音只走端侧 Whisper 适配层；关卡 `usePressToTalk` / Vosk 路径本变更不改。
- **原因：** 引擎职责清晰，避免一个模型扛两种场景。
- **备选：** 统一全部 Whisper（否决：与用户 Vosk 关卡方案冲突）。

### D2 — Whisper 部署形态

- **选择：** Capacitor 原生插件（或薄 Native 桥）加载 whisper.cpp / sherpa-onnx 等端侧运行时；模型资源随 APK 或首次本地解包（优先 tiny / int8）。
- **原因：** 真机离线、免费、符合「不做云端主路径」。
- **备选：** 纯 Web WASM（体积/性能/维护成本高，仅可作实验，非 MVP 验收主路径）；本机 PC HTTP 代理 Whisper（适合开发机，不作手机日记默认）。

### D3 — Web 层适配接口

- **选择：** `apps/web` 增加 `diaryAsr`（或等价）抽象：`isAvailable()` / `transcribe(blob)`；Capacitor 实现调原生；Web 实现返回不可用并驱动 UI 降级文案。
- **原因：** 页面不直接绑死插件 API；浏览器仍可打字验收聊天与存储。
- **备选：** 页面内直接 `Capacitor.Plugins.*`（耦合重）。

### D4 — 数据模型

- **选择：** 在 `FamilyDayRecord` 增加 `messages: FamilyDiaryMessage[]`，例如 `{ id, createdAt, text, audioDataUrl? | audioId? }`；保留 `story` 为合并缓存（生成前由 messages 重算写入），避免立刻打破现有 `saveGeneratedLevel`。
- **原因：** 增量迁移；生成链路少改。
- **备选：** 去掉 `story` 只留 messages（需同步改生成与旧数据迁移，可二期）。

### D5 — 音频持久化

- **选择：** MVP 用 data URL / base64 写入同一 localStorage 家族存储；单条限短录音（如 ≤30–60s）并提示，控制配额。
- **原因：** 实现快，与现有 images data URL 一致。
- **备选：** Capacitor Filesystem + id 引用（更稳，可在存储爆了再迁）。

### D6 — 聊天 UI

- **选择：** 重做 `FamilyStudioPage` 主区为消息列表 + 底部输入/按住说话；生成关卡、选图、Key 放折叠「生成与设置」区块。
- **原因：** 对齐「工作室聊天感」优先。
- **备选：** 保留大文本框仅在侧栏加气泡（体验弱）。

### D7 — 旧草稿迁移

- **选择：** 若某日仅有非空 `story` 而无 `messages`，打开时迁移为一条文字消息。
- **原因：** 不丢已有家庭故事。

## 风险 / 权衡

- **[APK 体积变大]** → 选 tiny/int8；文档说明；可选按需下载（若实现成本可控）。
- **[localStorage 配额]** → 限制录音时长与条数提示；爆了再迁 Filesystem。
- **[浏览器无法验 Whisper]** → 聊天/存储用 Web 冒烟；转写在 `cap run`/APK 验。
- **[转写不准]** → 允许手改文本；保留音频回放。
- **[与未合并的本机 Vosk 冲突]** → 日记适配层独立命名空间，不改关卡 ASR 入口。

## 迁移计划

- 读旧 store 时补 `messages` 默认 `[]` 并做 D7 迁移；`version` 可保持 1 或 bump 到 2（实现时二选一，读写兼容即可）。
- 回滚：隐藏聊天 UI / 恢复单 story 输入不影响官方 pack；原生插件可留在工程但日记改回文字。

## 待决（不挡任务拆分）

- 具体原生库（whisper.cpp vs sherpa-onnx）与 Capacitor 插件选型，以实现时许可与打包可行性为准。
- 模型是内置 APK 还是首次解包，以实现体积与首启体验权衡后写入文档。
