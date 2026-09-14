## 1. 裁切与压缩助手

- [x] 1.1 新增纯函数：背景 cover 裁切矩形（默认 `9:16`）与道具居中正方形矩形；用 `apps/web` 单测覆盖宽图/高图/已是目标比例三种输入
- [x] 1.2 新增处理函数：对相册 blob 按 `role=scene|item` 裁切后写出最长边 ≤ 768 的 JPEG data URL，复用 `compressImage.ts` 的边长与质量约定，且不把原 blob 交给 store；单测至少覆盖几何与「输出为 jpeg data URL / 边长上限」中可在 Node 跑通的部分

## 2. 选图（原生相册 + 文件回退）

- [x] 2.1 在 `apps/web` 增加 `@capacitor/camera` 依赖；封装 `pickAlbumImage`：原生 `Camera.getPhoto(source: Photos)`，道具槽 `allowEditing: true`，取消返回 `null`
- [x] 2.2 插件不可用或失败时回退隐藏 `<input type="file" accept="image/*">`；取消不 toast、不写槽。`scripts/patch-ios-info-plist.mjs` 写入 `NSPhotoLibraryUsageDescription`

## 3. 工作室按槽接线

- [x] 3.1 `FamilyStudioPage` 每个迷你关槽增加「云端配图」与「相册选图」；云端仍走现有 `redrawOneSlot`。相册成功后只调用 `setMiniLevelSlotImage`，其它槽不变
- [x] 3.2 Plus 未解锁或配图任务进行中时两按钮与现有配图操作同样锁定；相册选图 MUST NOT 因缺少云 Key 被拒绝。缩略图展示新图

## 4. 文档与回归

- [x] 4.1 在 `docs/family-day-studio.md` 补一句：按槽可云端或相册混用、本机压缩裁切、浏览器走文件选择
- [x] 4.2 跑 `npm run test:web`（含新裁切测试）通过；确认既有 `setMiniLevelSlotImage` 与 Plus 相关测试未破
