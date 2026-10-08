## Context

动机见 `proposal.md`。现状：`slotsFromLevel` 把 `options[].id` / `target_words` 直接当作配图 `subject`；`itemPrompts` 可覆盖道具槽主体；游玩 `materializeMiniLevelForPlay` 用 `imageUrlBySubject(..., option.id)` 绑图；同日复用按规范化短词键。

已决产品点：`draw` **可选**；制作台**默认展示并可改**画法文本。

## Goals / Non-Goals

**Goals:**

- Schema 增加可选 `draw`，生成尽量写出、校验不强制。
- 配图用 `draw || id`，匹配/复用/口语仍只用 `id`。
- 制作台编辑画法，保存后重画生效。

**Non-Goals:**

- 不强制重生成历史日记。
- 不改官方包资源。
- 不按 `draw` 全文做跨关复用键。
- 不做中英自动翻译 `draw`（生成侧要求英文）。

## Decisions

### D1：字段落点

- **选择：**
  - 每个 picture option：`draw?: string`
  - 可选关卡级 `main_draw?: string`，仅当主词在 options 里尚无匹配 `draw` 时使用
- **理由：** 与 find/ask 选项对齐；主词 introduce 也可能无 option，需要兜底。
- **备选：** 单独 `drawById` map —— 多一层同步，否决。

### D2：ImageSlot 拆词键与提示主体

- **选择：** 扩展槽位为 `{ word: string, subject: string, role, ... }`，其中 `word` = 短词 id（去重/复用/绑图），`subject` = `draw || word`（进提示词）。无 `word` 时兼容旧逻辑：`word = normalize 用的短词来源`。
- **理由：** 避免再把长句塞进唯一 `subject` 导致复用键污染。
- **备选：** 只改 subject、另表存 word —— 易漏传。

绑图：`imageUrlBySubject` 改为按 `slot.word`（或规范化 word）匹配 `option.id`。

### D3：制作台保存位置

- **选择：** 继续用当日 `miniLevel.itemPrompts[i]` 存**画法覆盖**（语义从「改 id」变为「改 draw / 出图主体」）；展示值为 `itemPrompts[i] || option.draw || id`。不直接改写 level JSON 内 options（避免与重新生成/校验打架），除非后续单独做「写回关卡」；v1 覆盖层足够。
- **理由：** 现有 API `setMiniLevelItemPrompt` 已通；家长改画法不必污染生成快照。
- **备选：** 写回 `options[].draw` —— 更「纯」，但要深拷贝 level 并处理多 beat 同 id。

同 id 多处 option：槽位仍按首次出现的 id 建一槽；覆盖按槽位下标。

### D4：生成提示与软校验

- **选择：** 在 `FAMILY_PACK_SYSTEM_PROMPT` / API pack prompt 中要求每个选项尽量带 `draw`（8–20 英文词量级，颜色/材质 + 可选一处承托，禁文字多物）；`normalizePictureOptions` 保留未知字段中的 `draw`（trim，过长可截断到合理上限如 160 字符）。
- **不**因缺 `draw` 失败；抽象词清洗换 `id` 时丢弃旧 `draw`（新 id 无画法则回退短词，或可选清空让家长改）。

### D5：与跨关复用

- **选择：** 复用键 = `normalizeSlotSubjectKey(word)`，忽略 `draw` 差异（与已定规格一致，省钱）。
- **备选：** draw 变了强制重画 —— 可后续加「画法指纹」；v1 不做。

## Risks / Trade-offs

- **[LLM 把长句写入 id]** → 提示强调分离；校验可拒绝 id 含空格过多/过长并尝试修复或失败重试。
- **[干扰 draw 同质化]** → 提示要求干扰与主词不同色/不同承托。
- **[itemPrompts 旧数据曾是短词]** → 仍合法：短词覆盖 = 有效 subject，行为兼容。
- **[家长改 draw 后仍显示复用旧图]** → 批量 onlyMissing 可能跳过；单槽「云端配图」应强制重画该槽（保持现有单槽重画语义）。

## Migration Plan

1. 发版客户端（槽位 + UI + pack 提示）；API 同步 pack 提示与选项 normalize。
2. 旧日记无 `draw`：自动回退 `id`。
3. 新生成 pack 逐步带 `draw`。
4. 回滚：忽略 `draw` 字段即可，覆盖层仍是字符串。

## Open Questions

- （无）产品两点已决：可选；制作台展示并可改 draw。
