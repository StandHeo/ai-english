## Context

见 `proposal.md`。家庭数据：`localStorage` 键 `ai-english-family-v1`（`FamilyStore`）+ IndexedDB `ai-english-family-audio-v1` / `ai-english-family-images-v1`。录音以 `audioId` 关联；配图以 image id 关联。无现成导出能力。Android（Capacitor）优先；浏览器调试需可用的下载/选文件回退。

## Goals / Non-Goals

**Goals:**

- 完整备份包：store 元数据 + 全部可找到的录音/配图
- 设置页导出（进度 + 分享）与导入（确认 + 覆盖 + 进度）
- 稳定的 `formatVersion`，便于日后兼容

**Non-Goals:**

- 云同步、百度网盘 OAuth、按天合并导入
- 备份官方主题包进度以外的全局 store（若与 family 分离则不动）
- 服务端代存日记

## Decisions

### 1. 包格式：带版本的 zip

```
tudoudou-family-backup-YYYY-MM-DD.zip
├── manifest.json     # formatVersion, exportedAt, includeKeys, counts, missing[]
├── store.json        # FamilyStore（默认真空 deepseek/tongyi/agnes Key）
├── audio/<id>        # 原始 Blob 字节（扩展名可从 MIME 推断或省略）
└── images/<id>       # 配图 Blob
```

- `formatVersion: 1` 起步。
- **备选**：单文件巨大 JSON（data URL）→ 否决，易爆内存、难分享。

### 2. 打包库

- 使用成熟 JS zip（如 `fflate` 或 `jszip`）：浏览器/WebView 内组装 `Blob`，再分享。
- 优先体积小、可流式/分块的库，降低完整包峰值内存。

### 3. 分享与选文件

- **原生 App**：Capacitor 分享插件（或已有等价能力）分享 zip；导入用 `input[type=file]` / `@capacitor/filesystem`+picker，以现有依赖为准选阻力最小者。
- **浏览器**：`URL.createObjectURL` 下载；`<input type="file" accept=".zip">` 导入。

### 4. 恢复 = 整库覆盖

- 确认后：清空或替换 family localStorage 条目；按包写入 audio/image IDB（可先按备份 id 写入，再 `saveFamilyStore`）。
- **不**做按天合并（减少录音 id 冲突与半残状态）。
- 导入前可用摘要（天数、录音数、导出时间）展示在确认框。

### 5. 密钥策略

- 默认 `store.json` 中三把 Key 置空；`manifest.includeKeys=false`。
- 勾选「含密钥」才原样写入；UI 强警示。

### 6. 缺失媒体

- 导出：读不到 Blob 则记入 `manifest.missing`，继续。
- 导入：缺文件则跳过 put，消息仍保留 `audioId`（播放层已有空态）。

### 7. 设置页入口

- `FamilyStudioSettingsPage` 增加「数据备份」区块：导出、含密钥勾选、恢复；busy 时禁用重复点击。

## Risks / Trade-offs

- [大包内存/耗时] → 进度回调；尽量按文件追加 zip；必要时提示「请插电/勿切后台」
- [微信等分享有大小限制] → 文案建议用文件管理器/网盘 App；失败时提示换渠道
- [覆盖误操作] → 二次确认 + 展示备份摘要；不做静默恢复
- [格式演进] → `formatVersion`；未知主版本拒绝导入
- [仅 Android 打磨优先] → iOS 用同一 Web 路径，分享插件差异列入实现时验证

## Migration Plan

- 纯客户端新功能；无服务端迁移
- 回滚：隐藏设置入口即可；已导出的 zip 仍可由旧逻辑说明保留

## Open Questions

- （无阻塞项；分享插件具体选型在实现时按 `apps/web` 现有 Capacitor 依赖敲定）
