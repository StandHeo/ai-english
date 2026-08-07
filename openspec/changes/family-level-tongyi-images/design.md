## Context

见 `proposal.md` 动机。当前家庭关卡由 DeepSeek（或 mock）生成 `LevelScript`，图字段多为 `placeholder`；`materializeLevelForPlay` 用当日 `images[]`（相册 data URL）或 SVG 占位。API 已有 `POST /api/family/generate-level`。通义万相经阿里云百炼按张计费，国内直连友好。

## Goals / Non-Goals

**Goals:**

- 服务端代理通义文生图，生成后写入家庭日记录（与相册共存）。
- 生成关卡后可选一键自动配图；失败不挡开玩。
- 控制单次张数与儿童安全 prompt。

**Non-Goals:**

- 不接 Cursor / Leonardo 作生产配图。
- 不改官方 pack 静态资源流水线。
- 首期不做视频、不做角色一致性 LoRA 训练。

## Decisions

### 1. 独立路由 vs 塞进 generate-level

- **选择：** 新增 `POST /api/family/generate-images`，入参含 `date`、关卡摘要（`target_words`、`setting`、可选 beat 选项 id）或由服务端读不到客户端存储故由客户端传 `level` 快照 + 需要的槽位列表。
- **理由：** 配图较慢（数秒～十几秒），与 LLM 解耦可单独重试、单独 loading；避免生成关卡整请求超时。
- **备选：** 同步挂在 `generate-level` 末尾——实现简单但手机易超时，否决为首选。

### 2. 图片落盘形态

- **选择：** 服务端拉取通义返回的图片 URL → 转成 **base64 data URL**（或短列表）返回前端，由现有 `setDayImages` / 扩展字段写入 `localStorage`（与相册一致）。
- **理由：** 家庭数据已在本机；App 离线可玩；无需先上 OSS。
- **备选：** 上传 OSS——后续量上来再加；首期增加运维复杂度。

### 3. 槽位策略（成本）

- **选择：** 默认最多 **4 张**：1 张主场景 + 最多 3 张选项/道具（按 `target_words` 与 find/ask 选项 id 去重）。
- **理由：** 约 0.8 元/关量级，够当晚玩；家长仍可用相册覆盖。
- **备选：** 每 beat 一张——成本与时延过高。

### 4. Prompt 模板

- **选择：** 中文模板固定前缀：「儿童绘本插画，温暖明亮，简单卡通，适合 4-6 岁，无文字水印，无暴力恐怖，正方形构图」+ 主体（英文词中文释义或场景）。
- **理由：** 通义中文理解好；固定前缀利于风格接近现有 pack。

### 5. 凭证

- **选择：** 优先 `TONGYI_API_KEY` / `DASHSCOPE_API_KEY` 环境变量；可选请求头或 body 带家长 Key（与 DeepSeek 相同模式），不写日志。
- **理由：** 开发机用 .env；家长自备 Key 也可。

### 6. 前端体验

- **选择：** 生成关卡成功 → 若设置「自动配图」开启，再调 `generate-images`，日记页显示「正在配图…」；完成后刷新缩略图。提供「重新配图」按钮。
- **理由：** 与现有「生成关卡」主按钮分离，状态清晰。

## Risks / Trade-offs

- [通义审核拒图] → 单张失败跳过该槽，其余继续；全失败则占位。
- [data URL 撑大 localStorage] → 限制张数与分辨率（如最长边 1024）；超额提示改用相册或压缩。
- [费用失控] → 默认关自动配图或严格张数上限；文档写明单价。
- [风格与官方 pack 不一致] → 可接受；后续用参考图/统一后缀迭代。

## Migration Plan

1. API 加客户端与路由，无 Key 时接口返回明确 `image_provider_unavailable`。
2. Web 设置项默认关闭，避免突然扣费。
3. 文档说明开通百炼、环境变量与成本。
4. 回滚：关闭设置或移除路由即可，不影响已有关卡。

## Open Questions

- （已决）自动配图**默认关闭**，家长在设置中显式打开。
- （已决）通义模型 id 以实现时百炼控制台可用的文生图模型为准，代码默认尝试 `wan2.6-t2i`（可环境变量覆盖）。
