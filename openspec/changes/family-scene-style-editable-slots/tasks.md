## 1. 场景与出图 Prompt

- [ ] 1.1 更新 `apps/web/src/family/levelSchema.ts` 的 `FAMILY_LEVEL_SYSTEM_PROMPT`：强制 `scene.setting` 为短地点句（中/英），示例对齐官方风格
- [ ] 1.2 同步更新 `apps/api/src/familyGenerate.ts` 的 SYSTEM_PROMPT，与 Web 文案一致
- [ ] 1.3 更新 `apps/web/src/family/imageSlots.ts` 的 `buildKidsPrompt`（统一绘本风锚点 + 可选 bunny 氛围）；同步 `apps/api/src/tongyiImage.ts`
- [ ] 1.4 补充/调整 `imageSlots` / `levelSchema` 相关单测，断言关键约束短语存在

## 2. 自定义配图槽位存储

- [ ] 2.1 在 `FamilyDayRecord` 增加可选 `imageSlots`；`normalizeDay` 兼容旧数据
- [ ] 2.2 实现 `setDayImageSlots` / `resetDayImageSlots`（校验非空 subject、数量上限、首项 scene）
- [ ] 2.3 `saveGeneratedLevel` 用 `slotsFromLevel` 初始化 `imageSlots`，并清空旧自定义/图片
- [ ] 2.4 单测：持久化、上限、重置回关卡推导

## 3. 配图路径使用自定义槽位

- [ ] 3.1 `FamilyStudioPage` 的 `requestImages` / 自动配图优先读 `day.imageSlots`
- [ ] 3.2 `materializeLevelForPlay` 在存在自定义槽位时用其做 subject→图映射
- [ ] 3.3 确认直连与 `/api/family/generate-images` 的 `slots` body 都能吃到编辑后的列表

## 4. 日记页编辑 UI

- [ ] 4.1 在「关卡配图」区增加槽位列表：场景/道具标签、中英文输入、删除、添加、重置
- [ ] 4.2 编辑即时或点保存写入 store；超上限与空词给出提示
- [ ] 4.3 旁注：道具词尽量与选项英文 id 一致，避免点图对不上

## 5. 文档与验收

- [ ] 5.1 更新 `docs/family-day-studio.md`、`docs/family-tongyi-images.md`：可编辑关键词与场景风格说明
- [ ] 5.2 手工冒烟：生成关卡 → 改场景中文/道具英文 → 云端配图 → 游玩选项图仍合理（未改错 id 时）
