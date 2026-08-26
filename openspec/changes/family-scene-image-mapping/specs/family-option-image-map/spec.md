## Purpose

让家庭关游玩时每个图片选项显示与其 id（英文词）对应的配图，背景图只用于场景底图，不再兼任「正确答案图」。

## ADDED Requirements

### Requirement: 选项图按 id 映射
将家长挂载的 `images[]` 物化为可玩关卡时，系统 MUST 把背景固定为 `images[0]`（scene 槽）。find / ask 的每个 option 的 `image` MUST 优先匹配与其 `id`（大小写不敏感）对应的道具槽图片；MUST NOT 再因 `correct === true` 而强制使用 `images[0]`。

#### Scenario: 正确选项用自己的词图
- **WHEN** `images[0]` 为场景背景，`images[1]` 对应 `slide`，某 find 选项 `id=slide` 且 `correct=true`
- **THEN** 该选项的 `image` 使用 `slide` 对应图，而不是背景图

#### Scenario: 找不到词图时降级
- **WHEN** 某 option id 在 `images[]` 中没有对应道具槽
- **THEN** 系统 MAY 使用占位图或其他已有道具图，但 MUST NOT 仅为了「正确」而改用背景图（除非该 id 本身就是背景回退词且无独立道具槽）

### Requirement: 背景与贴纸
物化后的 `scene.image` MUST 使用 `images[0]`（有图时）。奖励贴纸图 MAY 继续使用 `images[0]` 或首张可用图。

#### Scenario: 游玩背景是第一张
- **WHEN** 当日已有配图且孩子打开家庭关
- **THEN** 全屏背景来自 `images[0]`
