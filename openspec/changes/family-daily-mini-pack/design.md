## 背景

见 `proposal.md`。官方 pack 模型见 `content/levels/packs/*.json` + 多份 `levels/*.json`。家庭侧现为 `FamilyDayRecord.level` 单关 + `images[]` 扁平数组，`/family/:date/play` 直接开玩。旧提案 `family-scene-style-editable-slots` 已标记取代。

## 目标 / 非目标

**目标：**

- 生成：日记 → 3–5 关迷你 pack（每关约一词 + 短地点 setting）
- 游玩：日历 → 当日关列表 → `/family/:date/play/:levelId`
- 配图：每关专属背景；可按关中英文编辑主题
- 兼容：旧 `level` 单关仍可玩

**非目标：**

- 不改写官方 fruit 等 pack 文件
- 不做云端账号同步
- 第一期不做复杂手绘风地图（关列表 UI 即可；可后续美化）
- 不强制一关内仍凑满 9 个跨选项关键词（改由「关数」承担词汇量）

## 决策

### D1 — 数据模型

```ts
type FamilyMiniLevel = {
  id: string // family-YYYYMMDD-park
  level: LevelScript // target_words 通常长度 1
  scenePrompt?: string // 可编辑；默认 level.scene.setting
  itemPrompts?: string[] // 可选
  imageBg?: string // data URL / 占位
  itemImages?: string[]
  completed?: boolean
}

type FamilyDayRecord = {
  // 保留
  level?: LevelScript // 旧单关；新生成可留空或冗余首关便于兼容检测
  images?: string[]   // 旧扁平配图
  // 新增
  pack?: {
    title: string
    theme: 'family'
    levelIds: string[]
  }
  miniLevels?: FamilyMiniLevel[]
  // …
}
```

「有关可玩」：`miniLevels?.length > 0 || Boolean(level)`。

关数：`clamp(getMinLevelKeywords(), 3, 5)`（设置项语义改为「今日关数/主词数」，文档同步改名或旁注）。

### D2 — LLM 输出

一次调用返回 JSON：

```json
{
  "pack": { "title": "…" },
  "levels": [ { "level": {…}, "photoHints": [] }, … ]
}
```

每关 schema 对齐官方单关（3–6 beats，ask/find），`target_words` 以 1 个主词为主；干扰选项可用其它关主词或常见词。System prompt 明确「像 fruit 包里的一关」，`setting` 短地点句。

校验：关数 3–5、每关 `validateFamilyLevel`（可放宽「全 pack 关键词并集」旧规则，改为按关校验）。

### D3 — 路由与 UI

- `/family/:date` → 关列表（新页或日历下钻）
- `/family/:date/play/:levelId` → 复用 `FamilyLevelPage`，从 `miniLevels` materialize
- 旧链接 `/family/:date/play`：若有 `level` 走旧逻辑；若仅有 pack 则重定向到列表

日记页：生成后展示关列表摘要 + 每关场景词编辑 +「配图本关 / 配图全部」。

### D4 — 配图

默认每关 1 张背景（`buildKidsPrompt` scene）；道具图按需（find/ask 选项），第一期可「背景必出、道具可共用占位或少量子集」以控费——**默认：每关至少背景；选项图优先用其它关主词背景缩略或简单道具 prompt（实现时优先：每关背景 + 该关主词道具各 1）**。

编辑：`scenePrompt` 优先于 `setting`。

### D5 — 完成态

- 关：`miniLevels[i].completed`
- 日：`completed = miniLevels.every(l => l.completed)`（旧单关仍用原 `completed`）

## 风险 / 权衡

- **[配图费用与耗时随关数上升]** → 关数封顶 5；Agnes 限速已有；可只出背景。
- **[LLM 一次输出多关更易超时/不合格]** → 超时重试 1 次；校验失败提示缩短日记或降关数。
- **[旧进度字段混淆]** → 读写路径显式分支 pack vs legacy。
- **[localStorage 体积]** → 多关 JPEG 需继续压缩；超限提示删图。

## 迁移

- 读：无 `miniLevels` 则 legacy。
- 写：新生成只写 pack；可选把首关同步到 `level` 仅作调试，默认不写以免日历误判形态——日历以 `miniLevels` 优先。
- 重新生成：覆盖 `miniLevels` / `pack`，清进度与图（已通关确认逻辑保留）。

## 待决

- 无（按默认：关数 3–5、旧数据兼容、可编辑、新开本变更）。
