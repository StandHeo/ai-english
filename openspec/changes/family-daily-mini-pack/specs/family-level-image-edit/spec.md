## Purpose

允许家长在生成迷你 pack 后，按关用中文或英文编辑配图主题（尤其是场景背景主题），并据此请求云端配图，而不必重写整段日记。

## ADDED Requirements

### Requirement: 按关编辑配图主题
在当日已有迷你 pack 时，系统 MUST 提供按关展示的配图主题编辑（至少场景主题；道具主题可选）。输入 MUST 接受中文与英文。

#### Scenario: 改某关场景主题后再出图
- **WHEN** 家长将某关场景主题改为「阳光下的游泳池」或 `A sunny outdoor swimming pool` 并保存，再为该关或整包请求云端配图
- **THEN** 该关背景图 prompt 使用编辑后的主题

### Requirement: 编辑优先于自动推导
若某关存在有效自定义配图主题，配图路径 MUST 使用自定义值；重置后 MUST 回退到该关 `scene.setting` / 主词推导。

#### Scenario: 重置单关主题
- **WHEN** 家长重置某一关的配图主题
- **THEN** 该关恢复为关卡脚本推导的默认主题
