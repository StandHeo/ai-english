## Purpose

定义机器人实验室内容包：独立地图上的约八关线性冒险，覆盖机器人相关口语词，卡通资源全套手写投放。

## ADDED Requirements

### Requirement: 提供已批准的 robot-lab 内容包
系统 MUST 提供 id 为 `robot-lab` 的内容包，内含约八个已批准关卡的线性列表、主题地图图、首页入口图，以及向导角色引用。运行时加载该包无需即时 AI 生成脚本。

#### Scenario: 离线可列出机器人关卡
- **WHEN** 设备已安装或缓存 `robot-lab` 内容包
- **THEN** 机器人地图可列出包内已批准关卡并开始游玩

### Requirement: 第一季关卡与目标词
`robot-lab` 第一季 MUST 至少覆盖以下目标词（每关主词可一对一）：`robot`、`arm`、`wheel`、`button`、`beep`、`gear`、`friend`，以及一关复习（至少复习 `robot`、`arm`、`beep` 中的短词）。

#### Scenario: 机器人关可说 robot
- **WHEN** 儿童在机器人见面关提问拍说出 `robot` 或 `a robot`
- **THEN** 系统判定为匹配成功并推进该拍

### Requirement: 线性顺序与解锁
机器人地图关卡 MUST 按 pack 列表线性解锁；第一关默认解锁；通关第 N 关解锁第 N+1 关（若存在）。

#### Scenario: 通关后解锁下一机器人关
- **WHEN** 儿童完成机器人包第 N 关且第 N+1 关存在
- **THEN** 地图上第 N+1 关变为已解锁

### Requirement: 卡通资源
机器人包场景与道具/贴纸 MUST 使用卡通风格资源；MUST NOT 依赖家庭视频作为唯一背景。

#### Scenario: 轮子关使用卡通静图
- **WHEN** 儿童进入轮子关
- **THEN** 场景背景与焦点图为卡通静图资源

### Requirement: 每关对话拍与兜底
机器人各关 MUST 含 3 至 6 个对话拍，提问拍含非空 expect 与点图兜底；点图干扰项 MUST 优先使用本主题内其他道具图。

#### Scenario: 按钮关点图兜底
- **WHEN** 儿童在按钮关口语失败达上限
- **THEN** 系统展示含正确按钮图与至少一项干扰图的点图选择
