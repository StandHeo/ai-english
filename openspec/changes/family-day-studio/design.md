## 背景

动机见 `proposal.md`。现有应用已有多官方 pack、家长门禁、LevelScript schema、口语拍引擎与（手机）HTTPS 麦克风路径。本变更新增「家庭日记 → DeepSeek → 日历关」制作/游玩闭环，用户内容与官方 `content/levels` 发布包分离。

## 目标 / 非目标

**目标：**

- 手机家长路径：故事采集 → 配 DeepSeek Key → 生成 1 关 → 可选相册图 → 当晚可玩。
- 日历囤关与独立进度；缺图用占位。
- API 经后端代理调用 DeepSeek，降低 CORS 与 Key 暴露面。

**非目标：**

- 自动全文搜刮整机相册、文生图主路径、Cursor Key、多设备云账号、一天自动生成多关复杂剧情、儿童自由聊。

## 决策

### D1 — 用户内容存储位置

- **选择：** 浏览器/App 本地持久化（如 IndexedDB）：`familyDays[YYYY-MM-DD] = { story, level, images[], progress }`。不把家庭关写进仓库内官方 pack JSON。
- **原因：** 当晚可用、一家一机、与发布内容隔离。
- **备选：** 写入 `content/levels`（污染仓库、需同步设备文件系统，否决）。

### D2 — 每天关卡数量

- **选择：** MVP **每日 1 关**（3–6 拍，短词）。
- **原因：** 当晚速度优先。
- **备选：** 按故事长度拆 2–3 关（可后置）。

### D3 — DeepSeek 调用方式

- **选择：** `apps/api` 增加代理路由（如 `POST /api/family/generate-level`），请求体带故事；Key 优先来自服务端环境变量，也允许家长设置里提供的 Key 经代理转发（不落日志明文）。模型默认 deepseek-chat / 文档注明的 flash 级型号（以实现时官方可用模型名为准）。
- **原因：** 避开纯前端 CORS；统一 prompt 与 JSON 解析/重试。
- **备选：** 前端直连 DeepSeek（CORS/Key 风险高）。

### D4 — Prompt 与校验

- **选择：** 系统 prompt 强制输出**仅 JSON**，字段对齐现有 LevelScript；服务端/客户端共用校验（beats 数量、ask.expect、fallback 等）；失败则自动短重试一次或返回错误。
- **原因：** 儿童引擎已按该 schema 运行，无需新拍类型。
- **备选：** LLM 输出自由文再二次转换（更慢更脆）。

### D5 — 配图

- **选择：** 生成结果含 `photoHints[]`；UI 用 `<input type="file" accept="image/*" multiple>`（Capacitor 下可再换相册插件）；图转 blob/dataURL 存当日记录；路径映射进 level 的 scene/show。跳过则占位。
- **原因：** Web 可行的「从相册选」；真·全文搜相册不做。
- **备选：** 文生图（成本/时延，非 MVP）。

### D6 — 入口与路由

- **选择：** 家长页增加「做今日关卡」；儿童首页增加「家庭日历」入口（大图/图标），路由如 `/family` 日历、`/family/:date` 或复用 `/level/:id?pack=family-calendar&date=`。
- **原因：** 与官方 theme-grid 心理隔离，又保持可发现。
- **备选：** 只做家长预览、儿童无入口（违背当晚给孩子玩）。

### D7 — 进度

- **选择：** 进度 v2 增加 `familyDays` 或独立 key `ai-english-family-v1`，按日期 `completed`；每日时长限制仍可全局共用。
- **原因：** 不与官方 pack 解锁串线。

### D8 — 同日覆盖

- **选择：** 未通关直接覆盖；已通关弹确认。
- **原因：** 对齐规格，避免丢星星记录。

## 风险 / 权衡

- **[LLM 词过难/不合格 JSON]** → 校验 + 一次重试 + 家长改故事再生成。
- **[手机 HTTP 无法语音]** → 制作台同样依赖 HTTPS/`dev:phone`；纯打字始终可用。
- **[Key 泄露]** → 代理、不打日志、设置页可清除 Key。
- **[本地存储被清]** → 文档说明风险；后期可导出备份（非 MVP）。
- **[占位图丑]** → 接受「求快」；提示补相册图。

## 迁移计划

- 无官方内容迁移。新装即用；旧用户多一个入口。
- 回滚：隐藏家庭入口与 API 路由即可，不影响官方 pack。

## 待决（可后置，不挡 MVP 任务拆分）

- DeepSeek 具体 model id 以账号开通的型号为准，实现时写入 `.env.example`。
- Capacitor 正式包中相册是否换官方插件，可在打 APK 时再定；Web 选择器先打通。
