## Purpose

定义关卡尾声机器人 Beep 的约束英语对话：在通关贴纸仪式之后可选进入，可跳过，不阻挡奖励结算；仍非儿童自由聊天。

## ADDED Requirements

### Requirement: 可选 beep_talk 对话图
含 Beep 内容的关卡脚本 MUST 可提供可选字段 `beep_talk`（节点数与字段约定与既有校验一致，一期保持现有 3 节点内容）。无 `beep_talk` 的关卡 MUST NOT 展示 Beep 入口。

#### Scenario: 无 beep_talk
- **WHEN** 关卡 JSON 不含 `beep_talk`
- **THEN** 通关仪式上不出现 Beep 入口，点主按钮即可离开仪式

### Requirement: 贴纸仪式后方可进入 Beep
当关卡含 `beep_talk` 时，系统 MUST 在主线最后一拍成功后先进入通关仪式并结算奖励，MUST NOT 要求先完成 Beep 才发贴纸。

#### Scenario: 主线结束
- **WHEN** 含 `beep_talk` 的关卡完成最后一拍
- **THEN** 系统进入通关仪式并发放/确认本关奖励，此时尚未强制进入 Beep

### Requirement: 仪式上可选小入口
通关仪式 MUST 在存在 `beep_talk` 时展示小于主继续按钮的 Beep 入口（如小头像）。该入口 MUST 与主继续按钮同时可点，且 MUST NOT 与主按钮同等视觉权重并排竞争。

#### Scenario: 点 Beep 入口
- **WHEN** 儿童在通关仪式上点按 Beep 小入口
- **THEN** 系统进入 Beep 约束对话流程

### Requirement: 主按钮跳过 Beep
若儿童尚未完成或未开始 Beep，点按通关仪式主继续按钮 MUST 静默跳过 Beep，按既有规则进入下一关或地图。

#### Scenario: 跳过 Beep
- **WHEN** 儿童在未进入或未完成 Beep 时点按主继续按钮
- **THEN** 系统不进入 Beep，直接离开仪式前往下一关或地图

### Requirement: Beep 结束后回到仪式
Beep 对话正常走完后，系统 MUST 回到通关仪式（贴纸与主继续按钮可见），MUST NOT 在无再次点按主按钮的情况下自动跳入下一关。

#### Scenario: 走完 Beep
- **WHEN** 儿童完成 Beep 全部节点
- **THEN** UI 回到通关仪式，可再次选择点主按钮继续或（若适用）再次进入 Beep

### Requirement: Beep 中途退出不扣奖励
从 Beep 中途返回仪式或经确认返回地图时，系统 MUST NOT 撤销已在进入仪式时发放的贴纸或通关完成状态。

#### Scenario: Beep 中途回地图
- **WHEN** 儿童已进入过通关仪式（奖励已结算）后在 Beep 中确认返回地图
- **THEN** 地图反映本关已完成且贴纸仍在

### Requirement: Beep 人设与约束匹配
Beep 流程 MUST 保持独立机器人人设与全英短句；口语 MUST 使用规范化期望匹配，失败达上限后 MUST 提供点图或跟读兜底以推进。儿童路径 MUST NOT 在此流程调用 LLM 做开放对话。

#### Scenario: 失败兜底可前进
- **WHEN** 同一节点口语失败达上限且存在点图兜底
- **THEN** 正确点选后会话前进，MUST NOT 硬卡在本节点

### Requirement: 一期不做强制先 Beep
一期 MUST NOT 提供将 Beep 强制插回「发贴纸之前」的家长总开关；默认体验保持贴纸仪式优先、Beep 可选。

#### Scenario: 无强制开关
- **WHEN** 家长打开设置
- **THEN** 不存在「总是先跟 Beep 聊再发贴纸」的一期开关（或等价强制项）
