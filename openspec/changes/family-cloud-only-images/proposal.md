## Why

家长选定「1 张场景背景 + 每词道具图」后，本地自动图标配图仍偏丑且占默认路径，干扰云端出图体验。需要去掉图标配图能力，家庭关只走云端（及相册）。

## What Changes

- 保留/依赖已落地的场景槽位与选项按词映射（`family-scene-image-mapping`）。
- **移除**家庭日记中的本地图标配图：设置项、日记页按钮、生成后自动图标路径。
- 自动配图仅剩「自动云端配图」可选开关；相册手动选图保留。
- 删除 web 侧图标包构建与搜索代码依赖（构建不再跑 icon pack）。

## Capabilities

### New Capabilities

- `family-cloud-only-images`：家庭关配图仅云端（+ 相册），不再提供本地图标配图。

### Modified Capabilities

- （行为以本变更与 `family-scene-image-mapping` 为准。）

## Impact

- `FamilyStudioPage` / `FamilyStudioSettingsPage` / `family/store`
- 移除 `familyIconSearch`、icon pack 构建脚本与相关依赖
- 文档：家庭日记 / 通义 / iconify 说明
