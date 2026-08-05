## 背景

动机见 `proposal.md`。当前关卡页用 CSS `backgroundImage` 铺静态 PNG（`level.scene.image`）；内容经 `npm run sync-content` 同步到 `apps/web/public/content/`。仓库已有 `content/assets/videos/tudouqiche.mp4`（约 16s、竖屏）。进度解锁按 `pack.levels` 顺序取下一关 id，地图与贴纸页按已批准关卡列表渲染，加关主要是内容 + 播放器小扩展。

## 目标 / 非目标

**目标：**

- 关卡场景支持可选视频：短播 → 定格 → 再走既有对话拍/口语流程。
- 交付 `fruit-09-bike`，插入 pack：`… pear → bike → picnic`。
- 卡通自行车道具图 + 卡通小骑手贴纸人工放入 assets 并被脚本引用。
- schema / `validate.mjs` 覆盖视频与新资源路径。

**非目标：**

- App 内上传、云端素材库、自动从视频生成剧本。
- 用孩子替换 Bunny 主向导。
- 改 ASR/TTS API；启动闪屏（本变更只做关内场景视频）。
- 为所有旧关补视频。

## 决策

### D1 — 场景字段：`image` 保留，`video` 可选

- **选择：** `scene` 增加可选 `video`；可同时带 `image` 作海报/定格回退。有 `video` 时优先播视频。
- **原因：** 旧关零改动；无视频解码时可用静图兜底。
- **备选：** 互斥 `media.type`（迁移成本高）；仅改 `image` 扩展名（类型不清晰）。

### D2 — 短播 + 定格，默认约 5 秒，可跳过

- **选择：** 进入关卡先播视频，`maxPlaySeconds` 默认 5（脚本可覆盖）；到时 `pause()` 定格；大热区跳过立即定格。口语拍期间不循环。
- **原因：** 规格要求避免练习时晃动；16 秒全长易分心。
- **备选：** 全程循环弱化（更炫、更吵）；只播首帧海报（失去「这是我」冲击）。

### D3 — 实现用 `<video>` 叠在关卡层，不用 CSS background

- **选择：** LevelPage 在有 `scene.video` 时渲染全屏 `<video playsInline muted>`，结束/跳过后保持最后一帧；静图关仍用背景图。
- **原因：** background-image 不支持视频；muted 利于移动端自动播。
- **备选：** 抽帧成多张 PNG（体积大）；原生 Capacitor 播放器（过重）。

### D4 — 骑车关挂在同一 `fruit-forest` pack

- **选择：** id `fruit-09-bike`，插在 `fruit-07-pear` 与 `fruit-08-picnic` 之间。
- **原因：** 解锁链已按 pack 顺序，无需新进度模型。
- **备选：** 独立 `family` pack（要地图切换，超出本变更）。

### D5 — 卡通资产手工投放

- **选择：** 实现时生成/准备 `assets/items/bike.png`、`assets/items/rider-kid.png`（或 stickers 路径），写实人脸不进焦点图；视频沿用 `tudouqiche.mp4`。
- **原因：** 与「先手动丢」一致，并为日后 AI 卡通化流水线预留同路径约定。
- **备选：** 直接用视频截帧当贴纸（画风冲突）。

### D6 — 校验与类型同步扩展

- **选择：** `schema.json` / TS `LevelScript` / `validate.mjs` 支持可选 `scene.video`、可选 `scene.video_max_seconds`；校验文件存在。
- **原因：** 与现有内容门禁一致。

## 风险 / 权衡

- **[风险] 移动端自动播放策略** → 缓解：`muted` + `playsInline`；失败则直接定格到 `scene.image` 或视频首帧。
- **[风险] 4.6MB 视频拉长首进** → 缓解：短播即停；后续可压码；先同步进 public。
- **[风险] 旧进度已解锁 picnic、插入 bike 后顺序错位** → 缓解：文档说明试玩可清 localStorage；`completeLevel` 仍按当前 pack 下一关解锁，已通关用户可从梨重打或手动清进度。
- **[权衡] 视频默认静音** → 保自动播；家庭片原声可后加「点按开声」，非本变更必须。

## 迁移计划

1. 扩展类型与 LevelPage 视频层；静态关回归。
2. 放入卡通图；写 `fruit-09-bike.json`；改 `pack.json` 顺序。
3. 更新校验与 README/剧情说明。
4. 回滚：从 pack 移除该 id 并还原播放器分支即可。

## 待决问题

- 短播默认 5 秒是否在真机上偏短/偏长——实现后按体感改 `video_max_seconds`。
- 卡通小骑手最终画风与 Bunny 的统一度——实现任务里用生成图迭代一版即可。
