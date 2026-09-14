## Context

见 `proposal.md`。迷你 pack 配图已按槽存在：`role=scene` 写入 `imageBg` / `imageBgId`，`role=item` 写入 `itemImages` / `itemImageIds`，落库走 IndexedDB（`setMiniLevelSlotImage`）。工作室 `FamilyStudioPage` 已有单槽「重画这张」云端路径，以及**旧单关日**的整日「从相册选图」（`setDayImages`）。缺的是迷你关**按槽**相册入口与按角色裁切。`compressImage.ts` 已约定最长边 768、JPEG、不存原片。游玩侧 `.level-screen` 使用 `background-size: cover` 铺满视口。Plus 门禁已锁生成与配图，相册写入须走同一把锁。

## Goals / Non-Goals

**Goals:**

- 抽出可单测的裁切几何 + 复用压缩约定的处理函数，工作室页只接线，不整页重写。
- 原生优先 Capacitor Photos（道具可 `allowEditing`），否则隐藏 file input；取消选图静默返回。
- 单槽写入 `setMiniLevelSlotImage`；「只补缺图」已按空槽补图，相册填槽后自然被跳过。

**Non-Goals:** 服务端图床、rembg、改 `setMiniLevelImages` 的「配图本关/全部配图」覆盖语义、改短信/计费、给旧单关日做 cover/正方形裁切。

## Decisions

### D1 — 裁切几何与压缩一次出 JPEG

- **选择：** 纯函数计算裁切矩形（背景：cover 到 `9:16` 竖屏；道具：居中最大正方形）。解码后在同一 canvas 上裁切并缩放到最长边 ≤ 768，再按现有质量回退写出 JPEG。不把原 blob 写入 IndexedDB。
- **原因：** 与 `compressImage.ts` 上限一致；一次绘制避免先压后裁损失主体像素。`9:16` 对齐手机关卡竖屏；CSS `cover` 在更长屏上仍能铺满。
- **备选：** 先 `compressImageBlob` 再裁（多一次缩放）；按当前 `window` 宽高比裁背景（换机不一致）。均否决为 v1。

### D2 — 选图：Camera Photos + file 回退

- **选择：** 增加 `@capacitor/camera`。原生 `Camera.getPhoto({ source: Photos, resultType: Uri/DataUrl })`；道具槽 `allowEditing: true`。插件不可用、Web 实现失败或用户环境无 Photos 时，用 `<input type="file" accept="image/*">`。取消（含插件 cancel 文案）返回 `null`，不 toast 失败。
- **原因：** 项目尚无 Camera/Photos 插件；官方 Camera 的 Web 实现本身是 file input，浏览器不必两套 UI。`allowEditing` 即系统裁切，满足「有则用原生」。
- **备选：** 只做 file input（无系统裁切）；引入独立 Crop 插件（过重）。

### D3 — 槽 UI 两个动作，AI 路径不动

- **选择：** 每个 `slot-card` 可见「云端配图」「相册选图」。云端仍走现有 `redrawOneSlot` / `fetchSlotImages`。相册成功后只调 `setMiniLevelSlotImage`。`imageOpsLocked`（含 `!plusActive`）同时禁用两按钮。不要求云 Key 才能相册选图。
- **原因：** 混用是产品点；整关「全部配图」仍覆盖全槽（用户主动选 AI 整关），与「AI 路径不变」一致。「只补缺图」已跳过有图槽。
- **备选：** 相册仅放在 `<details>` 里（易被忽略）；相册绕过 Plus（否决）。

### D4 — 不抠图

- **选择：** v1 道具图保持不透明 JPEG 矩形。不接 rembg、不生成 alpha PNG。
- **原因：** 提案明确排除；点图玩法不依赖透明底。
- **备选：** 云端抠图（非本期）。

### D5 — 权限只为读相册

- **选择：** iOS `NSPhotoLibraryUsageDescription` 写入现有 `patch-ios-info-plist.mjs`。不请求相机。Android 权限随 Camera 插件 `cap sync` 合并（Photo Picker 优先）。
- **原因：** 只要相册，不要扩大权限面。
- **备选：** 自定义原生裁切 Activity（否决）。

## Risks / Trade-offs

- **[部分 Android 上 `allowEditing` 无效]** → canvas 正方形裁切兜底，仍满足「主体居中偏大」。
- **[HEIC / 超大相册图]** → `createImageBitmap` + JPEG 上限；失败 toast「这张图无法使用」，不写槽。
- **[动态插入的 file input 被手势策略拦]** → 点击处理函数内同步 `click()`；必要时页内 hidden input。
- **[IndexedDB 配额]** → 沿用现有压缩与错误文案，不存原片。
- **[9:16 与全面屏 20:9 不完全一致]** → 关卡 CSS 仍 cover；v1 接受，后期可加简单平移。

## Migration Plan

无数据迁移。新图按现有槽字段覆盖；旧云端图与旧单关 `images[]` 不动。回滚：去掉槽按钮与助手即可，已写入的相册 JPEG 仍可玩。

## Open Questions

无。系统裁切不可用时的 canvas 正方形裁切已定为 v1 行为。
