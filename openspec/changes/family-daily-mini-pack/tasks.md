## 1. 数据模型与兼容

- [x] 1.1 扩展 `FamilyDayRecord`：`pack`、`miniLevels`（含 `scenePrompt`、背景/道具图、`completed`）
- [x] 1.2 `normalizeDay` / 「有关可玩」同时识别 pack 与旧 `level`
- [x] 1.3 `saveGeneratedPack`、按关 `setMiniLevelImages` / `setMiniLevelScenePrompt` / `markMiniLevelCompleted`；日完成态由全关推导
- [x] 1.4 单测：legacy 读取、pack 写入、完成态汇总

## 2. LLM 生成迷你 pack

- [x] 2.1 重写 Web `FAMILY_LEVEL_SYSTEM_PROMPT` + 解析校验：输出 3–5 关，每关一词一景短 setting
- [x] 2.2 关数 = `clamp(getMinLevelKeywords(), 3, 5)`；去掉「单关凑满多关键词」作为默认硬门槛
- [x] 2.3 同步 `apps/api` `familyGenerate`；直连与代理路径一致
- [x] 2.4 单测：合法 pack、关数边界、单关校验失败处理

## 3. 游玩路由与 UI

- [x] 3.1 新增当日关列表页；日历有 pack 时进入列表
- [x] 3.2 路由 `/family/:date/play/:levelId`；复用 `FamilyLevelPage` materialize 单关
- [x] 3.3 旧 `/family/:date/play`：legacy 直玩，仅 pack 则重定向列表
- [x] 3.4 关通关写回 `miniLevels[].completed` 并更新日 `completed`

## 4. 配图与可编辑主题

- [x] 4.1 按关构建 scene prompt（`scenePrompt` 优先）；每关至少背景图；失败不丢包
- [x] 4.2 日记页：按关编辑中英文场景主题、重置、配图本关/全部
- [x] 4.3 同步文生图风格锚点（贴近官方绘本）；更新 API `tongyiImage` 对齐

## 5. 文档与验收

- [x] 5.1 更新 `docs/family-day-studio.md`、配图文档：迷你 pack、关数 3–5、旧数据兼容、费用说明
- [x] 5.2 冒烟：生成 pack → 改一关中文场景 → 配图 → 列表进关 → 通关进度；再验一条旧单关日记录
