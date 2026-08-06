## Purpose

定义英雄世界内容包：独立地图上的约八关线性冒险，覆盖光之英雄相关口语词；视觉为原创卡通英雄（奥特曼风格），不使用官方商标角色名。

## ADDED Requirements

### Requirement: 提供已批准的 hero-world 内容包
系统 MUST 提供 id 为 `hero-world` 的内容包，内含约八个已批准关卡的线性列表、主题地图图、首页入口图，以及向导角色引用。运行时加载该包无需即时 AI 生成脚本。

#### Scenario: 离线可列出英雄关卡
- **WHEN** 设备已安装或缓存 `hero-world` 内容包
- **THEN** 英雄地图可列出包内已批准关卡并开始游玩

### Requirement: 第一季关卡与目标词
`hero-world` 第一季 MUST 至少覆盖以下目标词：`hero`、`monster`、`light`、`fly`、`kick`、`shield`、`go`，以及一关复习（至少复习 `hero`、`light`、`kick`）。关卡 id、标题与 expect MUST NOT 使用受保护的官方奥特曼角色商标名作为目标词。

#### Scenario: 英雄关可说 hero
- **WHEN** 儿童在英雄见面关提问拍说出 `hero` 或 `a hero`
- **THEN** 系统判定为匹配成功并推进该拍

#### Scenario: 不要求官方角色名
- **WHEN** 儿童在任意英雄包关卡开口
- **THEN** 期望词表不要求说出官方奥特曼角色商标名

### Requirement: 线性顺序与解锁
英雄地图关卡 MUST 按 pack 列表线性解锁；第一关默认解锁；通关第 N 关解锁第 N+1 关（若存在）。

#### Scenario: 通关后解锁下一英雄关
- **WHEN** 儿童完成英雄包第 N 关且第 N+1 关存在
- **THEN** 地图上第 N+1 关变为已解锁

### Requirement: 原创卡通视觉与友好怪兽
英雄包场景与道具 MUST 使用原创卡通资源（银红等配色的光之英雄即可）。怪兽相关关 MUST 使用友好、非恐怖的卡通形象，适合 4–6 岁。

#### Scenario: 怪兽关形象友好
- **WHEN** 儿童进入怪兽关
- **THEN** 展示的是友好卡通小怪兽图，而非写实恐怖形象

### Requirement: 每关对话拍与兜底
英雄各关 MUST 含 3 至 6 个对话拍，提问拍含非空 expect 与点图兜底；点图干扰项 MUST 优先使用本主题内其他道具图。

#### Scenario: 护盾关点图兜底
- **WHEN** 儿童在护盾关口语失败达上限
- **THEN** 系统展示含正确护盾图与至少一项干扰图的点图选择
