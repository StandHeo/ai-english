## 为什么

家庭日记生成关卡后，场景/选项图仍多为 `placeholder` 或依赖家长相册。家长常没空选图，关卡视觉偏空。国内可用、按张计费的通义万相 API 适合在「生成关卡」后自动补一批儿童友好插画，降低配图成本与等待。

## 变更内容

- 在 API 侧增加通义万相文生图能力：根据关卡 `target_words` / 场景描述生成场景图与选项图。
- 「生成关卡」流程可选：LLM 出脚本后自动生图；无 Key / 失败时仍回退占位图或相册，**不阻塞开玩**。
- 图片以 data URL 或本地可持久化 URL 写回当日关卡（与现有 `images[]` / `materializeLevelForPlay` 衔接）。
- 家长设置中可配置：启用自动配图、通义 API Key（或复用服务端环境变量）、每日/每次张数上限。
- **非目标**：Cursor 生图 API、海外 Leonardo 生产接入、视频生成、替换官方 pack 静态资源流水线。

## 能力

### 新增能力

- `tongyi-family-images`：为家庭日记关卡调用通义万相生成儿童友好插画，并挂到当日关卡资源；失败可降级。

### 修改的能力

- （无——主规格目录尚无独立 `album-image-attach` / `deepseek-level-generate` 归档文件；相册优先与生成后触发等行为一并写入新能力 `tongyi-family-images`。）

## 影响

- `apps/api`：通义万相客户端、环境变量、`generate-level` 可选扩展或新路由 `POST /api/family/generate-images`。
- `apps/web`：家庭日记设置与生成成功后的配图状态；存储与缩略图展示。
- 成本：按张计费（约 0.2 元/张量级）；需文档说明免费试用额与安全提示词。
- 文档：`docs/family-diary-whisper.md` 或新建通义配图说明。
