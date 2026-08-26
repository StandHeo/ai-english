## 背景

场景槽位与选项映射已在 `family-scene-image-mapping` 落地。本变更去掉图标配图产品面与实现依赖。

## 目标 / 非目标

**目标：** UI/自动路径/构建不再含家庭图标配图。  
**非目标：** 删除历史 OpenSpec 归档、改官方 pack 资源、强制默认打开自动云端。

## 决策

### D1 — 删除而非隐藏

去掉设置、按钮、`autoIconImages` 读写与 `familyIconSearch` 引用；`missingSlotsForImages` 迁到 `imageSlots.ts`。

### D2 — 构建去掉 icon pack

`apps/web` 的 `build` 不再跑 `build-icon-pack`；移除 `@iconify-json/mdi` 与生成的 JSON（若体积大）。

### D3 — 相册保留

家长仍可用相册覆盖/补图。

## 风险

- **[旧用户 localStorage 仍有 autoIconImages]** → 忽略字段即可。  
- **[无网无法配图]** → 可用相册；文案说明需 Key/网络。
