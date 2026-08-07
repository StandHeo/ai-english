## 1. API：通义客户端与路由

- [x] 1.1 在 `apps/api` 增加通义/百炼配置：`DASHSCOPE_API_KEY`（或 `TONGYI_API_KEY`）、可选 `TONGYI_IMAGE_MODEL`（默认 `wan2.6-t2i`）、`TONGYI_IMAGE_MAX`（默认 4）
- [x] 1.2 实现通义文生图客户端：儿童安全中文 prompt 模板、按张调用、失败/超时处理、返回图片字节或可下载 URL
- [x] 1.3 将成功图片转为合适大小的 data URL（限制最长边约 1024）
- [x] 1.4 新增 `POST /api/family/generate-images`：接收 level 快照与槽位需求，返回 `{ images: string[], warnings?: string[] }`；无 Key 时返回明确错误码
- [x] 1.5 为客户端增加单元/集成冒烟（mock 通义），并更新 `.env.example`

## 2. Web：设置与生成流程

- [x] 2.1 家庭日记设置页增加「自动配图（通义万相）」开关（默认关）与可选通义 Key 输入（可仅用服务端 env）
- [x] 2.2 生成关卡成功后：若开关开启则调用 `generate-images`，展示「正在配图…」loading
- [x] 2.3 配图成功写入当日 `images[]`（不覆盖家长已选手动相册图的策略按 design：仅填充空位或提供「重新配图」确认）
- [x] 2.4 提供「重新配图」入口与失败提示；相册缩略图继续可用

## 3. 文档与验收

- [x] 3.1 补充文档：开通阿里云百炼、环境变量、约价、儿童安全与商用注意
- [x] 3.2 手工验收：无 Key 可生成关卡；有 Key 可自动出 ≤4 张图并可玩；通义失败不丢关卡
