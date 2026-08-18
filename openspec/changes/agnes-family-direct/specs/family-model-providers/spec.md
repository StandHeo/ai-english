## Purpose

让家长在家庭日记设置中选择关卡 LLM 与云端配图提供方，并用 Agnes 试用出关与出图，同时保留 DeepSeek 与通义。

## ADDED Requirements

### Requirement: 关卡 LLM 可切换
系统 MUST 允许家长在 DeepSeek 与 Agnes（`agnes-2.5-flash`）之间选择关卡生成模型。未选择时 MUST 默认 DeepSeek。生成 MUST 仍输出可经现有关卡校验的 JSON；词数不足 MUST NOT 保存为可玩关卡。

#### Scenario: 切换到 Agnes 后生成
- **WHEN** 家长选择 Agnes、已保存 Agnes API Key，并生成今日关卡
- **THEN** 系统使用 `agnes-2.5-flash` 生成，校验通过后保存关卡

#### Scenario: 默认仍为 DeepSeek
- **WHEN** 家长从未切换过关卡模型
- **THEN** 生成走 DeepSeek 路径（与本变更前一致）

### Requirement: 云端配图提供方可切换
系统 MUST 允许家长在通义万相与 Agnes 图（`agnes-image-2.1-flash`）之间选择自动云端配图提供方。本地图标配图 MUST 仍可独立开关。Agnes 文本与配图 MUST 共用同一把 Agnes API Key。

#### Scenario: 用 Agnes 图自动配图
- **WHEN** 家长开启自动云端配图、选择 Agnes 图、已保存 Agnes Key，且关卡生成成功
- **THEN** 系统按槽位调用 Agnes 文生图并写入当日 `images[]`

#### Scenario: 图失败不丢关
- **WHEN** 某一槽位云端配图失败
- **THEN** 该槽可用占位，已保存的关卡 MUST 仍然可玩

### Requirement: Key 按提供方校验
选择 DeepSeek 时生成 MUST 需要 DeepSeek Key（或浏览器联调时服务端 env）。选择 Agnes 时 MUST 需要 Agnes Key。系统 MUST NOT 把云 Key 写入安装包。

#### Scenario: 缺 Agnes Key
- **WHEN** 家长选择 Agnes 为关卡模型但未填写 Agnes Key，且（原生）无法使用服务端 env
- **THEN** 系统提示去设置填写 Key，且不发起生成
