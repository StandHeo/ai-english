## 1. 生成与选项规范化

- [x] 1.1 更新 web `packSchema` / api `familyPackGenerate` 系统提示：选项尽量带英文短 `draw`；强调 `id` 短词与 `draw` 分离；可选 `main_draw`
- [x] 1.2 `normalizePictureOptions`（或等价路径）保留并 trim `draw`，过长截断；缺省不失败
- [x] 1.3 抽象词清洗更换 `id` 时清除对应旧 `draw`；单测：有/无 `draw` 均可解析

## 2. 槽位 word + subject

- [x] 2.1 扩展 `ImageSlot`：`word`（短词键）与 `subject`（`draw || word`）；`slotsFromLevel` / `slotsForMiniLevel` 从 options/`main_draw`/`target_words` 填充
- [x] 2.2 去重与跨关复用、`imageUrlBySubject` / materialize 绑图改按 `word`（规范化键）
- [x] 2.3 api `tongyiImage.slotsFromLevel` 与 web 行为对齐；单测：有 draw 时 prompt 含画法、复用键仍为 id

## 3. 制作台编辑 draw

- [x] 3.1 `FamilyStudioPage` 道具槽编辑默认展示 `itemPrompts || draw || id`，文案标明画法可改
- [x] 3.2 保存仍走 `setMiniLevelItemPrompt`（覆盖画法主体）；单槽重画使用覆盖后的 subject
- [x] 3.3 无 draw 时初值为 id；编辑不改 option.id

## 4. 文档与验收

- [x] 4.1 更新 `docs/family-tongyi-images.md`：说明 `draw` / `main_draw`、回退与制作台编辑
- [x] 4.2 冒烟：新生成 pack 选项含 draw → 制作台可见可改 → 配图提示含颜色/环境线索；旧无 draw 关卡仍可配图
