## 为什么

家庭日记迷你关云端配图目前偏「单词闪卡」：厚描边、扁平、纯色底、主体占七成，画面呆板像贴纸。同时干扰选项常出现 `a paper` / `paper` / 抽象形状等重复或劣质词，去重只做整串小写匹配，且生成阶段不跨关复用，导致同一主体反复扣费出图、米色空白方块增多。需要同时改提示词气质与槽位去重/复用逻辑。

## 变更内容

- 更新内置配图默认模板（安全前缀、场景、主词、干扰、负向）：从「闪卡贴纸」改为「柔和绘本道具 / 方图友好场景」，仍禁止画面文字与暴力内容
- 强化槽位主体规范化与去重（剥冠词、首词键、覆盖 `itemPrompts` 后再去重）
- 同一日迷你 pack 配图时，跨关按规范化主体复用已生成图，避免重复请求画图 API
- 关卡生成侧收紧干扰项：拒绝抽象/劣质 option id（如 paper、square、color），校验失败或生成后清洗并尽量补具体童词
- 管理端可改的 `image_prompt_config` 与内置默认保持同步策略；本变更更新 baked defaults，已写入 DB 的运营自定义配置不被静默覆盖（除非显式重置）
- **不在范围**：换画图模型供应商、改分辨率计费套餐、相册选图流程、云端图库托管

## 能力

### 新能力

- `family-image-prompt-style`: 家庭关卡配图提示词默认风格（非闪卡、方图友好、安全约束）
- `family-image-slot-dedupe`: 配图槽位规范化去重与同日跨关主体图复用；抽象干扰词治理

### 修改的能力

- （无主规格目录条目；行为以本变更新增能力描述。）

## 影响

- `apps/web/src/family/imagePromptDefaults.ts` 与 `apps/api/src/imagePromptDefaults.ts`（须保持同步）
- `apps/web/src/family/imageSlots.ts`、配图编排（`FamilyStudioPage` / `generateImagesClient`）与必要时 `apps/api/src/tongyiImage.ts`
- 迷你 pack 生成提示与校验：`packSchema.ts` / `familyPackGenerate.ts`（及对应单测）
- 管理端 `image_prompt_config`：仅当运营未自定义、或提供「恢复默认」时采用新 baked 文案
- 文档：`docs/family-tongyi-images.md` 简述新风格与去重行为
