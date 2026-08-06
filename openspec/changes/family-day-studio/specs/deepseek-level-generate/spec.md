## Purpose

使用家长配置的 DeepSeek API Key，将「今日故事」生成为符合现有关卡脚本约束的一关内容，并给出相册选图提示，以便当晚尽快可玩。

## ADDED Requirements

### Requirement: 可配置 DeepSeek API Key
系统 MUST 允许家长在设置中保存 DeepSeek API Key（仅供本机/家长路径使用）。未配置 Key 时，系统 MUST NOT 静默调用外部大模型，并 MUST 提示需要配置。

#### Scenario: 未配置 Key 时阻止生成
- **WHEN** 家长点击生成关卡但尚未配置有效 API Key
- **THEN** 系统提示需配置 Key，且不发起生成请求

#### Scenario: 配置后可发起生成
- **WHEN** 家长已保存 API Key 且今日故事非空并点击生成
- **THEN** 系统可发起一次生成请求

### Requirement: 生成合法的单日关卡脚本
生成结果 MUST 符合现有关卡结构约定：含目标词、3 至 6 个对话拍（introduce/ask/find）、ask 含 expect 与点图兜底信息、奖励字段。目标词 MUST 偏向 4–6 岁可开口的短英文词。生成失败或校验失败时 MUST 向家长展示可理解错误，且 MUST NOT 把无效脚本标为可玩。

#### Scenario: 成功生成可校验脚本
- **WHEN** DeepSeek 返回可通过结构校验的关卡脚本
- **THEN** 系统将该脚本关联到当日并可供后续挂图与游玩

#### Scenario: 校验失败不进入可玩态
- **WHEN** 返回内容缺少必要字段或未通过校验
- **THEN** 系统拒绝将其作为可玩关卡，并提示家长重试或改故事

### Requirement: 附带相册选图提示词
生成结果 MUST 包含若干中文或英文的相册搜索/选图提示词，帮助家长在系统相册中快速找到相关照片。

#### Scenario: 生成含选图提示
- **WHEN** 关卡生成成功
- **THEN** 家长界面展示至少一条选图提示词

### Requirement: 儿童路径无自由聊天
DeepSeek 调用 MUST 仅服务于「故事 → 关卡脚本」的家长制作流程。儿童游玩路径 MUST NOT 提供与大模型的开放式自由对话入口。

#### Scenario: 儿童关卡页无自由聊
- **WHEN** 儿童在家庭日历关卡内游玩
- **THEN** 不存在可启动无约束多轮自由聊天的控件
