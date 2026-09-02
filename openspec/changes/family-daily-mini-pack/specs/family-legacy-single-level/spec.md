## Purpose

保证升级为迷你 pack 后，历史「一天一关」家庭日记录仍可打开游玩，避免已有家长内容失效。

## ADDED Requirements

### Requirement: 旧单关日记录可玩
若某日记录仅含单个 `level`、无迷你 pack，系统 MUST 仍允许从日历进入并游玩该关，行为与升级前兼容。

#### Scenario: 打开旧日记录
- **WHEN** 孩子点击仅有旧单关数据的日期
- **THEN** 直接或经简单入口进入该关游玩，不因缺少 pack 而报错

### Requirement: 新生成不破坏旧读路径
新写入的迷你 pack 日记录 MUST 可被识别为「有关可玩」；列表/日历的「有关卡」检测 MUST 同时覆盖 pack 与旧单关。

#### Scenario: 日历高亮两类日期
- **WHEN** 某月同时存在旧单关日与新 pack 日
- **THEN** 两类日期均显示为有关卡可进入
