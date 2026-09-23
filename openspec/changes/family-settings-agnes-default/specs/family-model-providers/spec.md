## MODIFIED Requirements

### Requirement: 关卡 LLM 可切换
系统 MUST 允许家长在 DeepSeek 与 Agnes（`agnes-2.5-flash`）之间选择关卡生成模型。本地从未保存过关卡模型选择时，MUST 默认 Agnes。已保存的选择 MUST 被尊重，不得强制覆盖。生成 MUST 仍输出可经现有关卡校验的 JSON；词数不足 MUST NOT 保存为可玩关卡。

#### Scenario: 切换到 Agnes 后生成
- **WHEN** 家长选择 Agnes、已保存 Agnes API Key，并生成今日关卡
- **THEN** 系统使用 `agnes-2.5-flash` 生成，校验通过后保存关卡

#### Scenario: 从未选择时默认 Agnes
- **WHEN** 家长从未保存过关卡模型选择
- **THEN** 关卡生成默认走 Agnes 路径

#### Scenario: 已存 DeepSeek 不被覆盖
- **WHEN** 家长本地已保存关卡模型为 DeepSeek
- **THEN** 打开设置与生成仍使用 DeepSeek，不因默认常量变更而改写

### Requirement: 云端配图提供方可切换
系统 MUST 允许家长在通义万相与 Agnes 图（`agnes-image-2.1-flash`）之间选择自动云端配图提供方。本地从未保存过配图提供方时，MUST 默认 Agnes 图。已保存的选择 MUST 被尊重。Agnes 文本与配图 MUST 共用同一把 Agnes API Key。

#### Scenario: 用 Agnes 图自动配图
- **WHEN** 家长开启自动云端配图、选择 Agnes 图、已保存 Agnes Key，且关卡生成成功
- **THEN** 系统按槽位调用 Agnes 文生图并写入当日 `images[]`

#### Scenario: 从未选择时默认 Agnes 图
- **WHEN** 家长从未保存过云端配图提供方
- **THEN** 自动云端配图默认使用 Agnes 图

#### Scenario: 图失败不丢关
- **WHEN** 某一槽位云端配图失败
- **THEN** 该槽可用占位，已保存的关卡 MUST 仍然可玩

## ADDED Requirements

### Requirement: 关卡模型区单一 Key 输入
日记设置页的关卡模型区 MUST 只展示一个 API Key 输入框，并随当前选中的关卡模型读写对应 Key（Agnes → `agnesApiKey`，DeepSeek → `deepseekApiKey`）。系统 MUST NOT 在关卡模型区同时并排展示两家 Key 输入框。

#### Scenario: 切换模型切换 Key 框内容
- **WHEN** 家长已分别保存过 Agnes Key 与 DeepSeek Key，并将关卡模型从 Agnes 切到 DeepSeek
- **THEN** 输入框展示 DeepSeek Key（或空），不再展示 Agnes Key 文本

#### Scenario: 清除当前模型 Key
- **WHEN** 家长在关卡模型区点击清除，且当前选中 Agnes
- **THEN** 仅清除 Agnes Key；DeepSeek Key 保持不变

### Requirement: 模型旁 API Key 获取指引
每个关卡模型选项旁 MUST 提供获取 API Key 的指引入口。链接 MUST 基于当前生效的 API 服务器地址（空则用官方生产基址），路径为 `/agnes-api-key.html`，Agnes 带锚点 `#agnes`，DeepSeek 带锚点 `#deepseek`。

#### Scenario: Agnes 指引带锚点
- **WHEN** 家长点击 Agnes 旁的获取指引
- **THEN** 打开 `{apiBase}/agnes-api-key.html#agnes`（`apiBase` 为当前生效服务器地址）

#### Scenario: DeepSeek 指引带锚点
- **WHEN** 家长点击 DeepSeek 旁的获取指引
- **THEN** 打开 `{apiBase}/agnes-api-key.html#deepseek`

### Requirement: 配图区不重复 Agnes Key（含边角）
当配图提供方为 Agnes 且关卡模型也为 Agnes 时，配图区 MUST NOT 再展示 Agnes Key 输入；界面 MUST 说明使用关卡模型区的 Agnes Key。当配图为 Agnes 且关卡模型不是 Agnes 时，配图区 MUST 临时展示 Agnes Key 输入，仍写入同一把 `agnesApiKey`。当配图为通义时，配图区 MUST 只展示通义 Key 输入。

#### Scenario: 双 Agnes 无重复框
- **WHEN** 关卡模型与配图提供方均为 Agnes
- **THEN** 配图区不出现 Agnes Key 输入框

#### Scenario: DeepSeek 关卡 + Agnes 配图露出 Key
- **WHEN** 关卡模型为 DeepSeek 且配图为 Agnes
- **THEN** 配图区出现 Agnes Key 输入，保存后写入与关卡共用的 Agnes Key

#### Scenario: 通义配图只填通义 Key
- **WHEN** 配图提供方为通义万相
- **THEN** 配图区展示通义 Key 输入，不要求再次填写 Agnes Key
