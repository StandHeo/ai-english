## Purpose

定义自行车世界内容包：独立地图上的约八关线性冒险，覆盖车型与装备口语词，卡通资源全套手写投放，家庭骑车视频仅用于出发/骑行关。

## ADDED Requirements

### Requirement: 提供已批准的 bike-world 内容包
系统 MUST 提供 id 为 `bike-world` 的内容包，内含约八个已批准关卡的线性列表、主题地图图，以及向导角色引用。运行时加载该包无需即时 AI 生成脚本。

#### Scenario: 离线可列出自行车关卡
- **WHEN** 设备已安装或缓存 `bike-world` 内容包
- **THEN** 自行车地图可列出包内已批准关卡并开始游玩

### Requirement: 第一季关卡与目标词
`bike-world` 第一季 MUST 至少覆盖以下目标词（每关主词可一对一）：`bike`、`tricycle`、`mountain bike`、`road bike`、`helmet`、`bell`、`go` 或 `ride`，以及一关复习。长词关卡的 `expect` MUST 包含便于儿童命中与 ASR 匹配的短变体（如 `trike`、`mountain`）。

#### Scenario: 三轮车关可接受 trike
- **WHEN** 儿童在三轮车关提问拍说出 `trike` 或 `tricycle`
- **THEN** 系统判定为匹配成功并推进该拍

#### Scenario: 山地车关可接受短形式
- **WHEN** 儿童在山地车关说出 `mountain` 或 `mountain bike`
- **THEN** 系统判定为匹配成功

### Requirement: 线性顺序与解锁
自行车地图关卡 MUST 按 pack 列表线性解锁；第一关默认解锁；通关第 N 关解锁第 N+1 关（若存在）。

#### Scenario: 通关后解锁下一自行车关
- **WHEN** 儿童完成自行车包第 N 关且第 N+1 关存在
- **THEN** 地图上第 N+1 关变为已解锁

### Requirement: 卡通资源与家庭视频范围
自行车包场景与道具/贴纸 MUST 使用卡通风格资源。家庭骑车视频 MUST 仅作为出发/骑行关的场景视频短播；其他自行车关 MUST NOT 依赖该家庭视频作为唯一背景。

#### Scenario: 出发关使用家庭视频
- **WHEN** 儿童进入出发/骑行关且脚本声明了家庭视频
- **THEN** 系统按既有短播定格规则播放该视频后再进入对话拍

#### Scenario: 车型关使用卡通静图场景
- **WHEN** 儿童进入三轮/山地/公路等车型关
- **THEN** 场景背景为卡通图（或非家庭视频的约定媒体），焦点图为对应卡通车型

### Requirement: 水果包不再插入骑车插曲
`fruit-forest` 内容包 MUST NOT 再将 `fruit-09-bike` 插在梨与野餐之间；梨树园通关后 MUST 解锁野餐关（若野餐关存在）。

#### Scenario: 梨后直接解锁野餐
- **WHEN** 儿童完成梨树园关且水果包已按新顺序配置
- **THEN** 下一解锁关为野餐关而非骑车插曲

### Requirement: 每关对话拍与兜底
自行车各关 MUST 含 3 至 6 个对话拍，提问拍含非空 expect 与点图兜底；点图干扰项 MUST 使用自行车主题内其他道具或车型图（不得仅用无关水果图凑数，除非该关显式复习跨主题词）。

#### Scenario: 头盔关点图兜底
- **WHEN** 儿童在头盔关口语失败达上限
- **THEN** 系统展示含正确头盔图与至少一项干扰图的点图选择
