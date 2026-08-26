## Purpose

在使用 Agnes 文本与配图接口时遵守免费档调用频率，减少 429，让家庭日记生成更稳。

## ADDED Requirements

### Requirement: Agnes 调用限速
系统对 Agnes 云接口（关卡 chat completions 与文生图）MUST 使用同一客户端侧速率预算，默认 MUST NOT 在任意滚动 60 秒内发出超过 18 次请求（低于公开免费档 20 次/分钟，留余量）。DeepSeek 与通义 MUST NOT 受此限制。

#### Scenario: 连续配图不会瞬间打满
- **WHEN** 家长选择 Agnes 图并为约 9 个槽位连续配图
- **THEN** 各次 Agnes 请求之间按速率预算排队，整段过程可超过一分钟，但不得在第一秒内发完全部请求

#### Scenario: 出关与配图共用预算
- **WHEN** 同一分钟内先用 Agnes 生成关卡再立刻 Agnes 配图
- **THEN** 两类调用共享同一速率计数

### Requirement: 429 可恢复
若 Agnes 仍返回 HTTP 429，该次调用 MUST 在短暂等待后最多再试一次；仍失败则按现有失败路径处理（配图槽位可占位，不丢关卡）。

#### Scenario: 偶发 429
- **WHEN** 某次 Agnes 配图返回 429
- **THEN** 系统等待后重试该次；若成功则写入该槽图片

### Requirement: 家长可感知变慢原因
使用 Agnes 配图时，界面 MUST 提示可能因免费频次限制而变慢（简短文案即可）。

#### Scenario: 状态栏提示
- **WHEN** 家长正在用 Agnes 图配图
- **THEN** 状态文案提到限速或可能较慢
