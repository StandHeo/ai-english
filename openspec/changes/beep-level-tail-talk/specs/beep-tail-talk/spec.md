## Purpose

定义关卡尾声与独立机器人 Beep 的**约束英语对话**：在最后一拍成功后进入短对话图，用期望词/意图匹配推进，失败有提示与点图兜底，对话结束后再庆祝并发放贴纸；不提供儿童自由聊天。

## ADDED Requirements

### Requirement: 可选 beep_talk 对话图
含 Beep 尾声的关卡脚本 MUST 提供可选字段 `beep_talk`，描述 3 至 5 个对话节点。每个节点 MUST 含机器人英语台词、非空期望表达（词或短短语，可含同义）、失败提示，以及成功后的下一节点标识；至少有一个节点 MUST 提供点图或跟读类兜底，保证孩子无法开口时仍可推进。无 `beep_talk` 的关卡 MUST 保持既有「拍完即结算」行为。

#### Scenario: 有尾声对话的关卡
- **WHEN** 关卡 JSON 含合法 `beep_talk` 且儿童完成最后一拍
- **THEN** 系统进入 Beep 对话流程，且 MUST NOT 在对话结束前发放本关贴纸

#### Scenario: 无尾声对话的关卡
- **WHEN** 关卡 JSON 不含 `beep_talk`
- **THEN** 最后一拍成功后的庆祝与贴纸行为与变更前一致

### Requirement: Beep 人设与全英短对话
尾声对话的说话人 MUST 为独立机器人角色 Beep（非关卡主向导 Bunny）。Beep 台词 MUST 为英语短句，并与本关主题或 `target_words` 相关。儿童界面 MUST NOT 在此流程中展示中文旁白作为主路径。

#### Scenario: 进入尾声
- **WHEN** 儿童从本关最后一拍进入对话
- **THEN** UI 呈现 Beep 角色，并朗读当前节点的英语 `robot_say`（或等价字段）

### Requirement: 约束匹配与永不卡死
每轮口语 MUST 使用规范化期望匹配（小写、去标点；整词/短语命中即可），MUST NOT 使用开放语义或儿童路径 LLM 判定。口语失败达到重试上限后 MUST 提供提示语音，并 MUST 提供点图或跟读兜底，使会话 MUST 能前进到结束节点。首版 MUST NOT 提供跳过整个 Beep 对话的控件。

#### Scenario: 说对期望词
- **WHEN** 儿童语音转写命中当前节点 expect（含同义）
- **THEN** Beep 播放成功反馈（若有）并进入配置的成功下一节点

#### Scenario: 多次失败后兜底
- **WHEN** 儿童在同一节点口语失败达到上限且存在点图兜底
- **THEN** 系统展示兜底选项；正确点选后进入失败路径配置的下一节点（可与成功路径相同），且 MUST NOT 硬卡在本节点

### Requirement: 对话结束后奖励
仅当本关配置了 `beep_talk` 时，本关贴纸与通关庆祝 MUST 在 Beep 对话完整结束后触发。中途退出（返回地图）MUST NOT 将本关标为已完成并发放贴纸，除非产品另有显式「已通关」状态（首版默认未完成）。

#### Scenario: 走完对话
- **WHEN** 儿童到达对话结束节点
- **THEN** 播放庆祝表现并发放本关贴纸，随后可返回地图

### Requirement: 非自由聊天
儿童游玩路径 MUST NOT 提供与大模型的开放式多轮自由对话入口。Beep 尾声 MUST 仅消费预写对话图节点。

#### Scenario: 无开放聊入口
- **WHEN** 儿童在关卡或 Beep 尾声界面
- **THEN** 不存在可启动无约束自由聊天的控件

### Requirement: 样板内容
本变更 MUST 至少为 1 个主题包中的 1 至关卡提供贴合该关目标词的 `beep_talk` 样板，以便真机验证闭环。

#### Scenario: 样板可玩
- **WHEN** 儿童游玩带样板 `beep_talk` 的关卡并完成最后一拍
- **THEN** 可完整走通 Beep 对话并获得贴纸
