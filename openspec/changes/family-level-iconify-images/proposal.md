## Why

通义万相配图需 Key、联网且按张计费；家长相册也不总是有合适图。家庭关卡大量是「苹果 / 滑梯 / 球」等具体词，主流矢量图标库即可出能玩的道具图。需要一条**离线、免费、零配置**的配图路径，与通义 / 相册并存。

## What Changes

- 在 Web/App 内置精简的 Iconify 图标子集（如 Material Design Icons + Twemoji），支持按关键词本地搜索
- 家庭日记提供「图标配图」：根据当日关卡 `target_words` / 选项 id 匹配图标，转为 data URL 写入 `images[]`
- 与现有相册、通义「重新配图」并存；图标优先填空位，不静默覆盖已有相册图（覆盖需确认或显式替换）
- 设置中可选：自动配图优先用图标（默认关或单独开关，避免改变通义现有默认行为）
- 文档说明许可证、子集范围与局限（图标≠完整场景插画）

## Capabilities

### New Capabilities

- `iconify-family-images`: 本地 Iconify 子集搜索与家庭关卡图标配图写入

### Modified Capabilities

- （无）通义配图能力保持不变，本变更新增并行路径

## Impact

- `apps/web`：图标数据包（或构建时裁剪）、本地搜索模块、日记页 / 设置 UI、`applyGeneratedImages` 复用
- 依赖：`@iconify/json` 子集或构建脚本导出 JSON；不强制新增 API 路由（纯端侧即可）
- 体积：控制在数 MB 内；不把全量 Iconify 打进 App
- 与 `family-level-tongyi-images` 并存；失败互不影响
