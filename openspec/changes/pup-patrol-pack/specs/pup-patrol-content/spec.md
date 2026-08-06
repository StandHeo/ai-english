## Purpose

定义小狗救援队内容包：约八关线性冒险，汪汪队风格的原创卡通救援小狗主题。

## ADDED Requirements

### Requirement: 提供已批准的 pup-patrol 内容包
系统 MUST 提供 id 为 `pup-patrol` 的内容包，内含约八个已批准关卡、主题地图图与首页入口图。

#### Scenario: 可列出小狗救援关卡
- **WHEN** 设备已缓存 `pup-patrol` 内容包
- **THEN** 地图可列出包内已批准关卡并开始游玩

### Requirement: 第一季关卡与目标词
`pup-patrol` 第一季 MUST 至少覆盖：`pup`、`dog`、`truck`、`badge`、`hat`、`bone`、`help`，以及一关复习（至少复习 `pup`、`truck`、`help`）。关卡 id 与 expect MUST NOT 使用官方汪汪队角色商标名。

#### Scenario: 小狗关可说 pup
- **WHEN** 儿童在小狗见面关说出 `pup` 或 `a pup`
- **THEN** 系统判定匹配成功

#### Scenario: 不要求官方角色名
- **WHEN** 儿童在任意本包关卡开口
- **THEN** 期望词表不要求官方汪汪队角色商标名

### Requirement: 线性解锁与卡通资源
关卡 MUST 按 pack 列表线性解锁；场景与道具 MUST 为原创卡通资源。

#### Scenario: 通关解锁下一关
- **WHEN** 儿童完成第 N 关且存在第 N+1 关
- **THEN** 第 N+1 关变为已解锁
