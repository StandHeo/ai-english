## 为什么

家庭迷你关主词/干扰配图目前只用短英文 `id`（如 `cake`）填进提示词，缺少颜色与极简环境线索，画面容易单调或跑偏。关卡生成阶段最适合同时产出「说什么词」与「怎么画」，比事后模板拼凑更可控。

## 变更内容

- 在 picture option（及主词兜底）上增加可选字段 `draw`：英文短画法描述（颜色/材质 + 至多一处极简承托）
- **`draw` 可选**：缺失或空白时配图回退为 `id`；旧关卡与官方包不受影响
- **`id` 仍为权威短词**：口语 expect、选项匹配、槽位去重/跨关复用、游玩绑图一律按 `id`，不得把长描述写入 `id`
- 迷你 pack / 关卡生成提示与校验：引导模型为每个配图相关 option 填写 `draw`；缺失不导致整包失败
- 槽位构建：`promptSubject = draw || id`，去重与复用键仍用规范化后的 `id`
- 制作台：道具槽默认展示并可编辑 `draw`（无 `draw` 时显示 `id` 作为初值）；保存写回关卡或当日覆盖层
- **不在范围**：改官方主题包 JSON、换画图模型、强制 `draw` 必填、语义向量去重

## 能力

### 新能力

- `family-option-draw`: 选项/主词可选画法描述 `draw` 的生成、槽位取用、制作台编辑与回退行为

### 修改的能力

- （无主规格目录条目；以本变更新增能力为准。）

## 影响

- 生成：`packSchema.ts` / `familyPackGenerate.ts`（及 web `generateLevelClient` 所用系统提示）、必要时 `levelSchema` 选项规范化
- 配图槽位：`imageSlots.ts`（及 api `tongyiImage` 若重复构建槽位）
- 存储/制作台：`store` 的 `itemPrompts` 或等价覆盖、`FamilyStudioPage` 槽位编辑 UI
- 游玩绑图路径保持按 `id` 匹配，不因 `draw` 改变
- 文档：`docs/family-tongyi-images.md` 简述 `draw` 字段
