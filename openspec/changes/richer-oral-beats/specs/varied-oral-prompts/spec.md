## Purpose

定义儿童口语关卡中 NPC 提问与庆祝句的多样性要求，避免「Look / What's this / Say X」机械循环，同时保持目标词短、可匹配、适合 4–6 岁。

## ADDED Requirements

### Requirement: 单关提问话术不得完全同构
每一关若包含两个及以上提问/回应拍，其 `npc_say` MUST 使用至少两种不同问法模板（例如：辨认、跟读、角色想要、找一找引导、情境提示）。MUST NOT 连续两拍仅使用「What's this?」与「Say {word}!」这一固定组合作为唯一模式（允许其中一拍仍用经典句式）。

#### Scenario: 苹果关两拍问法不同
- **WHEN** 加载已更新的苹果关脚本
- **THEN** 两个 ask 拍的 `npc_say` 文本不相同，且不全是「What's this?」+「Say apple!」机械配对

### Requirement: 目标词期望保持可达成
无论问法如何变化，提问拍的 `expect` MUST 仍以该关目标词及其短变体为主；问法 MUST NOT 迫使儿童说成长难句才能过关。

#### Scenario: 趣味问法仍接受短词
- **WHEN** Bunny 用「I want a red one! What is it?」提问苹果
- **THEN** 儿童说出 `apple` 或 `an apple` 即可匹配成功

### Requirement: 成功庆祝句可配置
提问拍 MAY 声明 `success_say`；若声明，匹配成功时系统 MUST 播放该句（而非固定仅用 Yay）。未声明时 MAY 使用内置短庆祝句轮换。

#### Scenario: 使用脚本庆祝句
- **WHEN** 儿童在带 `success_say` 的拍上匹配成功
- **THEN** 系统以 TTS 播放该 `success_say`
