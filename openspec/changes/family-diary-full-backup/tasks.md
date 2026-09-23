## 1. 依赖与模块骨架

- [x] 1.1 选定并添加 zip 库（如 `fflate`/`jszip`）到 `apps/web`
- [x] 1.2 新增 `family/backup` 模块：定义 `formatVersion`、`manifest` 类型与收集 audio/image id 的工具函数

## 2. 导出

- [x] 2.1 实现导出：读 `FamilyStore`、按 id 拉 IndexedDB 媒体、写入 zip（`manifest.json` + `store.json` + `audio/` + `images/`）
- [x] 2.2 支持进度回调；缺媒体记入 `manifest.missing` 且不中断
- [x] 2.3 默认清空三把 API Key；`includeKeys` 为真时保留
- [x] 2.4 导出完成后浏览器下载 / App 系统分享

## 3. 导入

- [x] 3.1 实现解包与校验（`formatVersion`、必填文件）；失败时返回可读错误
- [x] 3.2 确认后整库覆盖：写回 localStorage store + 写入 audio/image IndexedDB；支持进度
- [x] 3.3 包内缺媒体时跳过该文件，元数据仍恢复

## 4. 设置页与校验

- [x] 4.1 `FamilyStudioSettingsPage` 增加「数据备份」：导出、含密钥勾选、恢复、进度与覆盖确认文案
- [x] 4.2 为 backup 打包/解包逻辑补充单测（至少：默认无 Key、缺媒体不失败、错误 format 拒绝）
- [x] 4.3 真机或浏览器手测：导出含录音 → 清空本机数据 → 导入后可播放
