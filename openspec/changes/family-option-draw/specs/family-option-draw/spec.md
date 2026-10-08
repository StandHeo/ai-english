## Purpose

为家庭迷你关 picture 选项与主词提供可选画法描述 `draw`，使云端配图有颜色与极简环境线索，同时保持短词 `id` 负责口语、匹配与复用。

## ADDED Requirements

### Requirement: 选项可携带可选 draw 画法描述
家庭迷你关 picture_choice / find 选项 MUST 允许可选字符串字段 `draw`。`draw` 为空或缺失时，系统 MUST 仍接受该选项。`id` MUST 继续为短英文名词（孩子可说、可用于匹配）；系统 MUST NOT 要求把画法长句写入 `id`。

#### Scenario: 带 draw 的选项合法
- **WHEN** 某 find 选项为 `{ "id": "cake", "image": "placeholder", "correct": true, "draw": "a pink frosted cake on a wooden plate, soft warm light" }`
- **THEN** 关卡校验通过，且该选项的 `id` 仍为 `cake`

#### Scenario: 无 draw 的旧选项仍合法
- **WHEN** 选项仅有 `id` / `image` / `correct`、无 `draw` 字段
- **THEN** 关卡校验通过，行为与变更前兼容

### Requirement: 配图提示词优先使用 draw
构建迷你关道具/干扰配图槽时，用于文生图提示词的主体 MUST 为该槽对应词的 `draw`（去空白后非空）；否则 MUST 回退为 `id`（或 `target_words` 短词）。槽位去重、同日跨关复用、以及游玩时按选项绑图 MUST 仍以规范化后的短词 `id` 为准，MUST NOT 以整句 `draw` 作为复用键或绑图键。

#### Scenario: 有 draw 时提示词含画法句
- **WHEN** 选项 `id` 为 `bus` 且 `draw` 为含 yellow 的短句，系统为该干扰槽生成配图提示词
- **THEN** 提示词主体部分包含该 `draw` 文案（或以其为 `{subject}`），而非仅单词 `bus`

#### Scenario: 无 draw 时回退 id
- **WHEN** 选项仅有 `id: "duck"`、无有效 `draw`
- **THEN** 配图提示词主体回退为 `duck`（或等价短词）

#### Scenario: 跨关复用仍按 id
- **WHEN** 两关均有 `id: "cake"` 但 `draw` 文案不同，且同日批量配图已为第一关 `cake` 生成道具图
- **THEN** 第二关可按 `cake` 复用已有图（不因 `draw` 不同而强制视为另一主体键）

### Requirement: 主词槽也可有画法描述
主词道具槽（`target_words[0]`）MUST 能取得画法描述：优先使用任一 picture 选项中 `id` 与主词匹配且带有效 `draw` 的文案；若关卡提供可选的主词级 `main_draw`（或等价字段）则可采用。均缺失时 MUST 回退主词短词。

#### Scenario: 正确选项的 draw 用于主词槽
- **WHEN** `target_words[0]` 为 `cake`，且 find 正确选项为 `id: "cake"` 并带非空 `draw`
- **THEN** 主词配图槽的提示词主体使用该 `draw`

### Requirement: 制作台展示并可编辑 draw
在家庭日记制作台配图槽 UI 中，道具/干扰槽 MUST 默认向家长展示当前用于出图的画法文本（有效 `draw`，否则显示短词 `id`），并允许编辑保存。保存后再次配图 MUST 使用更新后的画法文本。编辑 MUST NOT 改变选项的短词 `id`（除非产品另有改词流程；本能力默认只改画法）。

#### Scenario: 家长修改 draw 后重画
- **WHEN** 家长将某槽展示的画法从默认 `draw` 改为另一段合法短描述并保存，再触发该槽云端配图
- **THEN** 该次配图提示词使用家长保存的新画法文本

#### Scenario: 无 draw 时编辑框初值为 id
- **WHEN** 某道具槽对应选项无 `draw`
- **THEN** 制作台该槽编辑初值显示短词 `id`，家长可改为更长画法描述并保存

### Requirement: 生成侧引导填写 draw 但不强制
迷你 pack（及若适用的单关）生成提示 MUST 要求模型为配图相关选项尽量填写英文短 `draw`（含颜色或材质，以及至多一处极简承托；禁止文字与复杂多物）。解析/校验 MUST NOT 仅因缺少 `draw` 而拒绝整包。

#### Scenario: 模型漏 draw 仍可出包
- **WHEN** 模型返回的 levels 结构合法但部分干扰选项缺少 `draw`
- **THEN** pack 仍可被接受；缺 `draw` 的槽配图时回退 `id`
