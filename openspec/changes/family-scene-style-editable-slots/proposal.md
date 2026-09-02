## 为什么

家庭每日关的场景文案与配图风格和官方主题包差很远：关卡 LLM 对 `scene.setting` 约束弱，出图又是通用中文绘本 prompt，家长无法在出图前改「画什么」。需要让场景更接近官方「短地点句 + 统一绘本风」，并允许家长用中英文编辑配图关键词后再出图。

## 变更内容

- 收紧关卡生成 prompt：`scene.setting` 必须是短地点句（可中英，风格接近官方如 `A sunny outdoor swimming pool`），并约束口语 beat / 词汇更像官方关。
- 收紧文生图 prompt：统一儿童绘本画风锚点（温暖明亮、简单卡通、可含 bunny 角色一致性提示），场景图与道具图区分保留。
- 家庭日记页新增「配图关键词」可编辑列表：来自当日关卡槽位（第 1 条场景 + 其余道具），支持中英文编辑、增删（在上限内）、保存后用于「云端配图」/自动配图。
- 编辑后的槽位优先于从关卡自动推导；清空自定义后可回退到关卡推导。

## 能力

### 新增能力

- `family-scene-prompts`: 家庭关卡 LLM 与文生图的场景/道具提示词约束，使观感更接近官方主题包
- `family-editable-image-slots`: 家长可编辑当日配图关键词（中英文），并据此请求云端配图

### 修改的能力

- （无主规格目录变更；本次为新能力）

## 影响

- `apps/web/src/family/levelSchema.ts`（及 API 侧同源 system prompt）
- `apps/web/src/family/imageSlots.ts`、`generateImagesClient.ts`、`apps/api/src/tongyiImage.ts`
- `apps/web/src/family/store.ts`（持久化自定义槽位）
- `apps/web/src/pages/FamilyStudioPage.tsx`（编辑 UI）
- 相关单测与 `docs/family-day-studio.md` / `docs/family-tongyi-images.md` 说明
