# AI English · 整体技术方案

> 基于当前 `main` 代码与文档整理，描述「现在整体程序在用什么技术、怎么串起来」。  
> 配套操作说明见：`README.md`、`docs/android-phone-guide.md`、`docs/family-day-studio.md`、`docs/family-diary-whisper.md`。

---

## 1. 产品定位

| 项 | 说明 |
|----|------|
| 名称 | AI English · 故事冒险口语练习 |
| 用户 | 4–6 岁儿童（全英沉浸游玩）+ 家长（门禁后的设置与家庭日记） |
| 平台优先级 | **Android 优先**；开发期以 Web 为主，经 Capacitor 打 APK |
| 核心玩法 | 选主题包 → 地图关卡 → 听 / 找 / 说目标词 → 贴纸与星星 |
| 扩展玩法 | 家庭日记：家长聊今日故事 → LLM 生成一关 → 日历囤关游玩 |

官方主题包与家庭用户内容**隔离**：官方关卡在仓库 `content/`；家庭关卡只存在本机。

---

## 2. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│  儿童 / 家长客户端（apps/web）                               │
│  React 19 + Vite 8 + React Router 7                          │
│  ├─ 关卡状态机（LevelPage）                                  │
│  ├─ 进度 / TTS 偏好 / 家庭日记（localStorage）               │
│  ├─ 关卡口语：浏览器 SpeechRecognition + MediaRecorder       │
│  ├─ 日记语音：MediaRecorder → Capacitor DiaryWhisper         │
│  └─ TTS：App Piper / 降级系统 TTS；Web speechSynthesis       │
└───────────────┬─────────────────────────────┬───────────────┘
                │ /api/*（开发期 Vite 代理）   │ Capacitor 原生
                ▼                             ▼
┌───────────────────────────┐    ┌────────────────────────────┐
│  apps/api（Express :8787） │    │  Android（Capacitor 8）     │
│  · ASR 匹配 / mock|openai  │    │  · piper-tts（Sherpa+Piper）│
│  · TTS 提示（browser 模式）│    │  · 降级 community/tts      │
│  · DeepSeek 家庭关卡生成   │    │  · diary-whisper（Whisper） │
└───────────────────────────┘    └────────────────────────────┘
                ▲
                │ 构建时拷贝
┌───────────────┴───────────────┐
│  content/levels + assets      │
│  静态 JSON 主题包与媒体资源   │
└───────────────────────────────┘
```

**一句话**：静态 JSON 驱动关卡；轻量 Express 做语音匹配与家庭 LLM 代理；进度与日记全本地；日记 ASR 与关卡 ASR **分轨**。

---

## 3. 仓库结构

| 路径 | 职责 |
|------|------|
| `apps/web` | 儿童/家长 UI、Capacitor 配置、本地插件 `plugins/diary-whisper` |
| `apps/api` | Express：`/api/asr`、`/api/match`、`/api/tts`、`/api/family/generate-level` |
| `content/levels` | `packs.json`、各 pack JSON、单关脚本、`schema.json` |
| `content/assets` | 角色 / 道具 / 场景图、家庭视频等 |
| `content/validate.mjs` | 关卡结构校验 |
| `docs/` | 手机运行、Capacitor、家庭工作室与 Whisper |
| `openspec/` | 变更提案与增量规格（主规格目录尚未统一归档） |

根目录脚本（`package.json`）：`dev:web`、`dev:api`、`build:web`、`validate:content`、`test:api`。

---

## 4. 前端技术方案

### 4.1 技术选型

| 类别 | 选型 | 版本倾向 |
|------|------|----------|
| UI | React + TypeScript | React ^19 |
| 路由 | react-router-dom | ^7 |
| 构建 | Vite + `@vitejs/plugin-react` | Vite ^8 |
| Lint | oxlint | — |
| 原生壳 | Capacitor（core / cli / android） | ^8.5 |
| 原生 TTS（主） | 本地包 `piper-tts`（Sherpa-ONNX + Piper） | 0.1 |
| 原生 TTS（降级） | `@capacitor-community/text-to-speech` | ^8 |
| 日记 ASR | 本地包 `diary-whisper`（`file:plugins/diary-whisper`） | 0.1 |

### 4.2 主要路由

| 路径 | 页面 | 用途 |
|------|------|------|
| `/` | HomePage | 主题大图 + Family 入口 |
| `/map/:packId` | MapPage | 主题地图与关卡入口 |
| `/level/:levelId` | LevelPage | 官方关卡口语练习 |
| `/stickers` | StickersPage | 贴纸墙 |
| `/parent` | ParentPage | 家长中心（算术门禁） |
| `/family` | FamilyCalendarPage | 家庭日历 |
| `/family/studio` | FamilyStudioPage | 家长日记聊天制作台 |
| `/family/:date/play` | FamilyLevelPage | 当日家庭关游玩 |

### 4.3 内容加载

- 构建/开发前执行 `npm run sync-content`：将 `content/levels`、`content/assets` 复制到 `apps/web/public/content/`。
- 运行时通过 `/content/...` 拉取；仅 `approved === true` 的关卡进入地图。

### 4.4 开发代理与手机调试

- Vite 将 `/api`、`/health` 代理到 `http://localhost:8787`。
- `npm run dev:phone`：`VITE_PHONE=1` → HTTPS（`@vitejs/plugin-basic-ssl`）+ `0.0.0.0`，供真机麦克风。
- App 包内不走 Vite 代理，需配置 `VITE_API_BASE` 指向可访问的 API。

---

## 5. 后端技术方案

| 项 | 说明 |
|----|------|
| 运行时 | Node.js + Express 5 + `tsx` |
| 默认端口 | `8787`（`PORT`） |
| 上传 | multer（ASR 音频） |
| 配置 | `apps/api/.env`（见 `.env.example`） |

### 5.1 接口一览

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/health` | 健康检查与当前 provider |
| POST | `/api/asr` | 音频（可选）+ 期望词 → 转写与匹配 |
| POST | `/api/match` | 纯文本与期望词匹配 |
| POST | `/api/tts` | MVP：`browser` 模式返回文本，由客户端系统朗读 |
| POST | `/api/family/generate-level` | 故事 → `LevelScript` + `photoHints` |

### 5.2 Provider 策略

| 能力 | 环境变量 | 当前行为 |
|------|----------|----------|
| ASR | `ASR_PROVIDER=mock\|openai\|whisper` | mock 便于无密钥联调；openai 走云端 Whisper |
| TTS | `TTS_PROVIDER=browser` | 不返回云端音频，客户端朗读 |
| 家庭 LLM | `FAMILY_LLM_PROVIDER=deepseek\|mock` | DeepSeek Chat；Key 可来自 env 或请求头/体；失败可重试 |

家庭生成 **不**把官方 pack 写入仓库；结果由前端存入本机家庭存储。

---

## 6. 内容与关卡模型

### 6.1 主题包

首页五包（另加 Family 入口）：

1. 水果森林 `fruit-forest`
2. 自行车世界 `bike-world`
3. 机器人实验室 `robot-lab`
4. 英雄世界 `hero-world`
5. 小狗救援队 `pup-patrol`

索引：`content/levels/packs.json`；每包约 8 关，进度**按 pack 分桶**。

### 6.2 LevelScript

类型定义：`apps/web/src/types.ts`；校验：`content/levels/schema.json` + `validate.mjs`。

要点：

- 字段含 `id`、`approved`、`theme`、`title`、`target_words`、`scene`、`beats`、`reward` 等。
- Beat 类型：`introduce` | `ask` | `find`；数量约 3–6。
- `ask`：期望词 + 点图 fallback；`find`：选项（含正确项）。

### 6.3 游玩状态机（关卡页）

典型流程：介绍 → 找图/提问听说 → 有限次重试 → 点图兜底 → 庆祝 → 解锁下一关。  
家庭关复用同一套引擎，配图来自家长相册或占位图（`materializeLevelForPlay`）。

---

## 7. 语音技术方案（双轨）

刻意拆成两条链路，避免互相抢引擎：

| 场景 | 录音 | 识别 | 说明 |
|------|------|------|------|
| **官方/家庭关卡口语** | `usePressToTalk`（约 3.5s） | 浏览器 SpeechRecognition（en-US）为主，录音可交 `/api/asr` | 文档规划关卡侧可接 **Vosk**；**当前仓库 apps 内尚无 Vosk 实现** |
| **家庭日记气泡** | `useDiaryRecorder`（最长约 45s） | Capacitor **端侧 Whisper**（`diaryAsr` → `DiaryWhisper`） | **不**把日记默认送到云端 OpenAI；浏览器仅可录音 + 手改字 |

### 7.1 TTS

- 偏好键：`ai-english-voice-prefs-v1`（persona、语速/音调、`ttsEngine`: `piper`|`system`）。
- **App 原生**：默认 **Sherpa-ONNX + Piper**（`plugins/piper-tts`）；家长可选强制系统 TTS；Piper 失败仍降级 `@capacitor-community/text-to-speech`。
- Web：`speechSynthesis`；API `/api/tts` 在 browser 模式下只起协调作用。
- 说明见 [`piper-tts.md`](./piper-tts.md)。

### 7.2 端侧 Whisper（日记）

- 插件路径：`apps/web/plugins/diary-whisper`。
- 资源（需本地放入，不进 git 大文件）：`ggml-tiny*.bin` + arm64 `whisper-cli` → assets 首次解包。
- 详见 `docs/family-diary-whisper.md`。

---

## 8. 家庭日记工作室

| 能力 | 实现要点 |
|------|----------|
| 聊天制作台 | `/family/studio`：按日气泡（文字/语音可回放）、改字；DeepSeek/生成/选图折叠在「生成与设置」 |
| 存储 | `ai-english-family-v1`：`messages[]`、`story`（合并缓存）、`level`、`photoHints`、`images`、`completed`、本机 API Key |
| 生成 | `POST /api/family/generate-level`；mock 可无 Key 冒烟 |
| 日历 | 有关卡日着色；有语音日小圆点 |
| 游玩 | `/family/:date/play`，与官方 pack 进度隔离 |

旧数据仅有整段 `story` 时，打开制作台会迁移为一条文字消息。

---

## 9. 进度与家长控制

| 项 | 说明 |
|----|------|
| 进度键 | `ai-english-progress-v2`（可自 v1 迁移） |
| 内容 | 每 pack 的完成/解锁/贴纸；全局星星；每日时长上限与按日游玩秒数 |
| 家长门禁 | 算术验证后进入家长中心 |
| 家长能力 | 查看进度、设置每日时长、TTS 音色、进入家庭日记/日历 |

无账号体系、无云同步：清浏览器/App 站点数据即丢失本地进度与日记。

---

## 10. 本地持久化一览

| localStorage 键 | 内容 |
|-----------------|------|
| `ai-english-progress-v2` | 主题进度、星星、每日时长 |
| `ai-english-progress-v1` | 遗留，加载时迁移 |
| `ai-english-family-v1` | 家庭日记消息/音频 data URL、生成关、DeepSeek Key |
| `ai-english-voice-prefs-v1` | TTS 人设、微调与引擎（piper/system） |

关卡与美术为静态资源；API 无状态（不落用户库）。

---

## 11. Android / Capacitor 打包

| 项 | 现状 |
|----|------|
| 配置 | `apps/web/capacitor.config.ts`：`com.aienglish.fruitforest` / `Fruit Forest` / `webDir: dist` |
| 工程 | 仓库通常**不含**完整 `android/`，需本机 `npx cap add android` + `cap sync` |
| 产物 | Android Studio 打 debug/release APK |
| 权限 | 麦克风等见 `docs/android-capacitor.md` |
| 日记模型 | 打进插件 assets 后再 sync（见 Whisper 文档） |

零基础真机体验可先走浏览器 HTTPS 联调：`docs/android-phone-guide.md`。

---

## 12. 本地开发与环境变量

```bash
# API
cd apps/api && cp -n .env.example .env && npm i && npm run dev

# Web（电脑）
cd apps/web && npm i && npm run sync-content && npm run dev

# Web（手机麦克风）
cd apps/web && npm run dev:phone
```

常用环境变量：

| 位置 | 变量 | 含义 |
|------|------|------|
| API | `ASR_PROVIDER` / `TTS_PROVIDER` | 语音能力 |
| API | `FAMILY_LLM_PROVIDER` / `DEEPSEEK_*` | 家庭关卡生成 |
| Web | `VITE_API_BASE` | API 根地址（空则同源 `/api`） |
| Web | `VITE_PHONE=1` | 启用 HTTPS 手机调试 |

内容校验：`npm run validate:content` 或 `node content/validate.mjs`。

---

## 13. 规格与文档体系

- 过程规格：`openspec/changes/<change-name>/`（proposal / design / specs / tasks）。
- 已落地能力多在各 change 中描述；`openspec/specs/` 主规格尚未统一归档时，**以本文件 + `docs/` + 代码为准**。
- 近期相关变更：`kids-story-oral-english-mvp`、各主题 pack、`family-day-studio`、`family-diary-chat-whisper` 等。

---

## 14. 当前边界与后续方向

1. **关卡 Vosk**：方案上与日记 Whisper 隔离，但客户端 Vosk 尚未合入 `apps/`；现网关卡依赖浏览器识别 + API mock/openai。
2. **日记 Whisper**：桥接与插件已具备；tiny 模型与 `whisper-cli` 需自行放入 assets 才能在 APK 转写。
3. **TTS**：App 优先 Piper（需 `fetch-piper-tts`）；浏览器仍为系统朗读；无云端精品音色管线。
4. **存储**：日记音频以 data URL 进 localStorage，存在配额风险；无多设备同步。
5. **Android 工程**：需本机生成；云端环境通常不直接产出 APK。
6. **PaddleSpeech 备选调研**：开源 ASR/TTS 官方支持矩阵（仅官方仓库依据）见 [`paddlespeech-support-matrix.md`](./paddlespeech-support-matrix.md)。

---

## 15. 关键模块索引（便于对照代码）

| 主题 | 主要路径 |
|------|----------|
| 路由入口 | `apps/web/src/App.tsx` |
| 关卡页 | `apps/web/src/pages/LevelPage.tsx` |
| 进度 | `apps/web/src/progress/store.ts` |
| 家庭存储 | `apps/web/src/family/store.ts` |
| 关卡口语 | `apps/web/src/voice/usePressToTalk.ts`、`client.ts` |
| 日记 ASR | `apps/web/src/voice/diaryAsr.ts`、`useDiaryRecorder.ts` |
| Whisper 插件 | `apps/web/plugins/diary-whisper/` |
| API 入口 | `apps/api/src/index.ts` |
| 家庭生成 | `apps/api/src/familyGenerate.ts` |
| 内容包 | `content/levels/packs/` |
