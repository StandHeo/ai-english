## 为什么

家长要在设置里切换 **DeepSeek / Agnes 2.5-flash** 出关、**通义万相 / Agnes 图** 配图，以便对比效果。同时 App 仍强制填写电脑局域网 `apps/api`，离家无法生成。需要把「试用 Agnes」和「手机直连云模型」一次做完。

## 变更内容

- 日记设置增加关卡模型与云端配图提供方切换；新增一把 **Agnes API Key**（文本与图共用）。默认仍为 DeepSeek + 现有图标/通义，不打断已有家庭。
- 关卡模型：`deepseek-chat` 或 `agnes-2.5-flash`；云端配图：`wan2.6-t2i` 或 `agnes-image-2.1-flash`。校验、词数、图失败不丢关不变。
- **Capacitor App** 在已填对应 Key 时用原生 HTTP **直连** HTTPS 云接口，不再要求电脑 API 地址。浏览器预览仍走 Vite → `apps/api`（规避 CORS），请求体带上当前提供方。
- 手机直连配图用 Canvas 压缩为 JPEG data URL（替代 Node `sharp`）。
- 非目标：百炼 Agent 工作流、儿童端自由聊、改官方 pack、关卡口语 `/api/asr` 直连、删除 DeepSeek/通义。

## 能力

### 新增能力

- `family-model-providers`：家长可切换关卡 LLM 与云端配图提供方，并保存 Agnes Key。
- `native-direct-family-ai`：原生 App 在有 Key 时直连云端生成关卡与配图，不依赖局域网 `apps/api`。

### 修改的能力

- （无独立主规格文件；家庭日记生成/配图行为以本变更新增能力描述。）

## 影响

- `apps/web`：设置页、store、日记生成/配图路径、原生 HTTPS 客户端、Canvas 压图。
- `apps/api`：`generate-level` / `generate-images` 接受提供方参数，供浏览器联调；可配 `AGNES_API_KEY`。
- 文档：设置切换、App 直连、Key 与费用说明。
