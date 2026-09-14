## Why

迷你 pack 每关已有云端配图槽（背景 `scene` + 道具 `item`），但家长只能整槽走 AI，不能把当天真实照片混进某一槽。家庭日记的核心正是「今天发生过的事」，需要按槽选择云端配图或相册选图，并允许混用（例如真实场景背景 + AI 道具）。

## What Changes

- 家庭日记工作室迷你关的**每个配图槽**提供两个动作：**云端配图**与**相册选图**，可按槽混用。
- 相册图经本机压缩（最长边 768、JPEG，不存相机原片）后写入既有 IndexedDB 家庭图库。
- 背景槽（`role=scene`）：压缩后按游戏画面比例做 `cover` 居中裁切；v1 不做抠图。
- 道具槽（`role=item`）：裁成正方形、主体大致居中放大；优先系统/原生裁切 UI（Capacitor），否则 canvas；v1 **不做**透明背景抠图。
- 选择云端配图时，既有 AI 路径不变；Plus 工作室门禁不绕过。
- 浏览器 / mock 无 Capacitor Photos 时回退 `<input type="file" accept="image/*">`。

**非目标：** 服务端托管图片、AI rembg / 人像抠图、改短信或计费。

## Capabilities

### New Capabilities

- `family-album-slot-picker`：迷你 pack 按槽从相册选图、按角色裁切压缩、与云端配图混用；浏览器可回退文件选择。

### Modified Capabilities

- （无。主库 `openspec/specs/` 尚无对应能力。旧日「一天一关」的 `album-image-attach` 仍服务遗留单关，本变更不改其需求。）

## Impact

- `apps/web`：`FamilyStudioPage` 槽位操作；新增裁切/选图小助手；复用 `family/compressImage.ts` 与 `setMiniLevelSlotImage`
- 可选依赖 `@capacitor/camera`（相册 + `allowEditing`）；无插件时文件选择器仍可用
- iOS 相册用途说明（`patch-ios-info-plist.mjs`）；Android 权限随 cap sync
- 文档：`docs/family-day-studio.md`
- 不改 `apps/api` 短信/计费、不改官方 pack、不把原片上传服务端
