## 背景

见 `proposal.md`。现状：`slotsFromLevel` 把 `target_words[0]` 标成 scene；`materializeLevelForPlay` 让正确选项吃 `images[0]`。web / api / 图标三处槽位逻辑需对齐。

## 目标 / 非目标

**目标：**

- 统一槽位：`[scene, ...items]`，scene subject 优先 `scene.setting`。
- 强化 scene 云端 prompt；item 不变质。
- 物化时按 id→槽位索引映射选项图。
- 图标路径保证 scene 槽仍产出一张图（风景兜底），避免索引错位。

**非目标：** 改 LLM 出关 schema、相册上传 UI、官方 pack 资源结构、配图张数商业策略。

## 决策

### D1 — scene 占满额中的 1 个名额

`maxSlots` 仍是总张数上限：1 scene + 最多 `maxSlots-1` 个 item。不把 scene 算在关键词配额之外，避免突然多扣一张云图费用预期失控。

### D2 — setting 与首词相同时不重复 item

若 scene subject 与某 `target_words` 规范化后相同，该词不再单独占 item 槽；选项映射时该 id 可回退到 `images[0]`。有中文 setting 时英文词各自占 item。

### D3 — 共享 web 槽位实现；api 同步复制逻辑

`apps/web` 的 `imageSlots.ts` 为权威；`familyIconSearch` 改为复用或调用同一规则；`apps/api/tongyiImage.ts` 保持同语义实现（暂不抽 monorepo 包）。

### D4 — 物化建 subject→index 表

用与配图相同的 `slotsFromLevel` 结果建映射；option.id 命中则用该索引；未命中则用第一个 item 图或 placeholder，**禁止** `correct ? 0`。

## 风险 / 权衡

- **[旧关卡已按旧顺序配图]** → 旧 `images[0]` 可能是首词物体；重新「云端配图」后才会变好。可接受。
- **[中文 setting 图标弱]** → scene 强制风景兜底图标，保证索引。
- **[总张数少时道具变少]** → 1 张给背景是有意取舍。

## 迁移

无需数据迁移。家长对旧日点「云端配图」即可换新布局。
