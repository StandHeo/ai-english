## Context

动机见 `proposal.md`。现状要点：

- 提示词：`apps/web` 与 `apps/api` 的 `imagePromptDefaults.ts` 必须同步；运行时可被 `image_prompt_config` 覆盖。
- 槽位：`imageSlots.ts` 的 `slotSubjectKey` 仅 `trim().toLowerCase()`；`itemPromptOverrides` 覆盖后不再去重。
- 出图：`FamilyStudioPage.requestMiniLevelImages` 按关并行，每关槽位 `Promise.all`；同日跨关不共享已生成图。
- 关卡词：`packSchema` / `familyPackGenerate` 文案已写「禁抽象」，但无硬校验，模型仍吐 `paper`/`square`。

## Goals / Non-Goals

**Goals:**

- 新默认模板显著减弱闪卡感，方图友好，安全约束不放水。
- 规范化去重 + 同日道具跨关复用，可测、可单测。
- 抽象干扰词在生成/校验层被拦住或替换。

**Non-Goals:**

- 不换通义/Agnes 模型或改分辨率计费。
- 不做语义向量去重（中英同义自动合并）。
- 不强制运营 DB 配置迁移到新默认（除非显式恢复默认）。
- 不改儿童游玩 UI；仅影响配图质量与次数。

## Decisions

### D1：默认模板文案策略

- **选择：** 道具/干扰改为「单一清晰主体 + 柔和绘本 + 极简环境点缀」；去掉闪卡/七成/纯色底；场景去掉「竖版竖构图」硬性要求；负向保留文字/暴力，去掉或弱化「写实照片」一刀切。
- **理由：** 死板感主要来自模板，而非模型品牌；管理端可继续调。
- **备选：** 只改运营 DB、不改 baked → 新环境仍闪卡；否决。

### D2：规范化键算法

- **选择：** `normalizeSlotSubjectKey(s)` = lower → 去标点多余空白 → 剥前导 `a|an|the` → 取首个 `[a-z]+` 词；无拉丁词时回退整串 lower trim（兼容纯中文主体）。
- **理由：** 与 `collectLevelKeywords` 的「短英文词」精神对齐，修复 `a paper`/`paper`；中文场景不强行首词截断以免破坏语义。
- **备选：** 仅剥冠词不取首词 → `yellow paper`/`paper` 仍双槽；取首词对干扰项足够。

### D3：跨关复用范围

- **选择：** 批量配图时维护 `Map<normKey, imageDataUrl>`，仅对 **道具/干扰**（`role !== 'scene'`）命中则跳过 API；场景默认不跨关复用。
- **理由：** 场景主题几乎每关不同；道具干扰高度重复。单关重画仍走原路径，可选择性查缓存。
- **备选：** 场景也复用 → 易出现「背景与本关主题不符」。

### D4：抽象词黑名单与治理时机

- **选择：** 维护小集合黑名单（`paper|square|circle|triangle|rectangle|shape|color|colours?|number|letter` 等 + 冠词变体经规范化后命中）。在 `parseValidatedFamilyPack` / API `parsePack` 路径：选项 id 命中则替换为从固定童词池抽取且本日未用过的词；若无法补足则校验失败走既有重试。
- **理由：** 只靠 LLM 指令不够；后置清洗比纯失败体验更好。
- **备选：** 仅失败不清洗 → 日记稀薄时成功率下降。

### D5：配置同步与迁移

- **选择：** 更新 web/api baked defaults；单测继续断言两端字符串一致。DB 已有行则不动；文档说明可用 admin「恢复默认」吃上新文案。客户端 `localStorage` 缓存配置：拉到新 `version` 或启动时刷新（若现有已有 version 字段则 bump `IMAGE_PROMPT_CONFIG_VERSION`）。
- **理由：** 避免覆盖运营调好的自定义句。

### D6：实现落点

| 关注点 | 主要文件 |
|--------|----------|
| 模板 | `imagePromptDefaults.ts`（web+api） |
| 去重键 / 槽位 | `imageSlots.ts`（及 api `tongyiImage` 若重复实现则对齐） |
| 跨关复用 | `FamilyStudioPage` 批量配图；必要时抽小函数便于测 |
| 抽象词 | `packSchema.ts` / `familyPackGenerate.ts` + 测试 |
| 文档 | `docs/family-tongyi-images.md` |

## Risks / Trade-offs

- **[道具带环境导致 find 变难]** → 模板仍要求「单一主体清晰最大」；干扰模板继续「不要画成目标词」。
- **[首词规范化误合并]** → `school bus` 与 `bus` 会合并；可接受（少一张图），若日后要保留复合词可改为「整串去冠词」开关。
- **[跨关复用图风格不一致于新场景]** → 道具本就是闪卡/贴纸逻辑下的独立主体，与场景解耦；新模板下仍以主体为主。
- **[DB 旧配置仍闪卡]** → 文档与 admin 恢复默认；可选后续运维脚本，非本变更必须。
- **[清洗替换改变关卡剧本用词]** → 仅改 option `id`/占位图键，npc_say 若仍说 abstract 会略不一致；黑名单命中时应优先换 id 并尽量不碰主词 `target_words[0]`。

## Migration Plan

1. 合并代码，部署 api（baked + 校验）与 web。
2. 若需全站新默认：admin 恢复 `image_prompt_config` 或清客户端缓存后再拉配置。
3. 已生成的历史日记图不强制重画；家长可「云端配图」按需刷新。
4. 回滚：还原 defaults 与去重逻辑即可；DB 自定义不受影响。

## Open Questions

- 运营环境当前 DB 是否已写过自定义模板？若有，上线后是否由人点一次「恢复默认」——实现前可运维确认，不阻断开发。
