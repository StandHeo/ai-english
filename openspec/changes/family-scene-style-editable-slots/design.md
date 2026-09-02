## 背景

见 `proposal.md`。当前关卡 LLM 与出图 prompt 分散在 `levelSchema.ts` / `familyGenerate.ts` 与 `imageSlots.ts` / `tongyiImage.ts`；配图 UI 只展示已生成缩略图，不能改「画什么」。自定义槽位需落在本机 `FamilyDayRecord`（localStorage）。

## 目标 / 非目标

**目标：**

- 同步收紧 Web 直连与 API 代理两侧的关卡/出图文案，观感更接近官方短地点句 + 绘本风。
- 当日记录持久化 `imageSlots`（可编辑），配图路径优先读它。
- 日记页可编辑、增删、重置槽位；中英文均可。

**非目标：**

- 不改官方 pack 资产，不强制文生图复刻官方 PNG。
- 不改玩法引擎、不改关键词校验下限逻辑本身（只改 prompt 与配图输入）。
- 不做服务端账号同步；仍为本机存储。

## 决策

### D1 — Prompt 改在单一文案源，API 对齐

Web：`FAMILY_LEVEL_SYSTEM_PROMPT` / `buildKidsPrompt`。  
API：`familyGenerate.ts` 的 SYSTEM_PROMPT 与 `tongyiImage.buildKidsPrompt` 保持同文案（复制或共享注释「须与 web 同步」），避免直连与代理风格分叉。

场景约束要点：`setting` = 短地点句（中或英，约 ≤12 词 / 一句），示例对齐官方；禁止日记复述。  
出图前缀：在现有安全前缀上加「统一绘本风 / 可含友好卡通兔角色氛围」，场景/道具句式保留。

### D2 — `FamilyDayRecord.imageSlots` 可选字段

```ts
imageSlots?: { subject: string; role: 'scene' | 'item' }[]
```

- 生成关卡成功后：用 `slotsFromLevel` 初始化并写入（便于立刻编辑）。
- `setDayImageSlots(date, slots)` 校验：非空 subject、首项可为 scene（若无 scene 则第一项标 scene）、数量 ≤ `getImageSlotMax()`。
- `requestImages` / `autoFillImagesAfterGenerate`：`day.imageSlots?.length ? day.imageSlots : slotsFromLevel(...)`。
- 重新生成关卡：用新关卡槽位覆盖自定义（与清空 `images` 一致）；提供「重置为关卡推导」按钮不重跑 LLM。

### D3 — UI 放在「关卡配图」区块

每槽一行：标签（场景/道具）+ 文本输入（中英）+ 删除；底部「添加道具词」「重置为关卡词」「保存」。保存可即时写入 store（失焦或点保存均可，实现选即时写入以减少丢改）。

空 subject 不允许保存进列表；增删受上限约束。

### D4 — 玩法映射仍按 subject 匹配

`materializeLevelForPlay` 继续用 `imageUrlBySubject(slots, images, optionId)`。若家长把道具词改成与 `option id` 无关的中文，选项图可能对不上——UI 旁注：「道具词尽量保留英文 id，或与选项一致，否则点图可能对不上」。场景词可自由中英。

备选曾考虑：改词时同步改 `level` 选项 id——范围过大，本期不做。

## 风险 / 权衡

- **[中文道具词与选项 id 错位]** → 文案提示；场景词鼓励中英地点句无妨。
- **[Web/API prompt 漂移]** → 任务要求双侧同改 + 单测断言关键短语。
- **[重新生成关卡丢掉家长改词]** → 与清图一致；状态提示「已按新关卡重置配图词」。

## 迁移

- 旧日记录无 `imageSlots`：首次打开/配图时按关卡推导，行为与现在一致。
- 无需服务端迁移。

## 待决

- 无（道具词与 option id 不同步已按 D4 接受）。
