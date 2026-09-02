## Purpose

约束家庭每日关的场景文案与文生图提示词，使生成结果在地点表述与绘本画风上更接近官方主题包，同时不改变「日记驱动」与「图失败不丢关」的既有路径。

## ADDED Requirements

### Requirement: 场景设定须为短地点句
关卡生成的 system / user 提示词 MUST 要求 `scene.setting` 为短地点描述（中文或英文均可），风格接近官方示例（如 `A sunny outdoor swimming pool` / `阳光下的游泳池`），MUST NOT 鼓励把整段日记摘要写进 `setting`。

#### Scenario: 模型按约束输出地点句
- **WHEN** 家长用日记生成家庭关卡
- **THEN** 返回的 `scene.setting` 为简短地点/氛围描述，而非多句日记复述

### Requirement: 文生图使用统一绘本风格锚点
系统为场景背景与道具槽位构建文生图 prompt 时 MUST 使用统一的儿童绘本风格前缀（温暖明亮、简单卡通、适合 4–6 岁、无文字水印、无暴力恐怖），场景图强调开阔环境背景，道具图强调居中单物体；风格锚点 SHOULD 提示与官方关一致的友好卡通角色氛围（如 bunny），但不要求复刻官方 PNG 资产。

#### Scenario: 场景槽与道具槽 prompt 不同
- **WHEN** 系统为 `role=scene` 与 `role=item` 分别生成出图 prompt
- **THEN** 两者共享安全与画风前缀，但场景强调全景环境、道具强调居中单对象

#### Scenario: 通义仍可带负面词
- **WHEN** 配图提供方为通义万相
- **THEN** 请求仍可附带既有负面词列表；Agnes 路径不因此失败
