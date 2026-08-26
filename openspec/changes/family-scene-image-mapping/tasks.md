## 1. 槽位与 prompt

- [x] 1.1 更新 `imageSlots.slotsFromLevel`：首位 scene（setting 优先），其余 item；同词不重复；尊重 maxSlots
- [x] 1.2 更新 `buildKidsPrompt`：scene 强调全景环境，item 保持单物体居中
- [x] 1.3 同步 `apps/api/tongyiImage.ts` 槽位与 prompt；图标侧复用或对齐同一规则，scene 失败时风景兜底

## 2. 玩法映射

- [x] 2.1 `materializeLevelForPlay`：背景=`images[0]`；选项按 id 映射道具槽；去掉 correct→0
- [x] 2.2 `show` 焦点图尽量按词映射，合理降级

## 3. 测试与文档

- [x] 3.1 单测：槽位顺序、prompt 差异、物化映射
- [x] 3.2 短更 `docs/family-tongyi-images.md`（或图标文档）说明背景与选项规则
