# 家庭关卡云端配图（通义万相 / Agnes）

生成关卡后可选云端文生图，写入当日 `images[]`，与相册、本地图标共用玩法路径。设置里可切换 **通义万相** 或 **Agnes 图**。

**App：** 填了对应 Key 后手机直连云接口，不经过电脑局域网 API。  
**电脑浏览器：** 仍走 `POST /api/family/generate-images`，body 带 `imageProvider`。

## 开通

### 通义万相

1. 打开 [阿里云百炼控制台](https://bailian.console.aliyun.com/)，开通模型服务并创建 API Key。
2. 默认模型 `wan2.6-t2i`。
3. 浏览器联调可在 `apps/api/.env` 写 `DASHSCOPE_API_KEY`；App 请在日记设置里填通义 Key。

### Agnes 图

1. 在 [Agnes 控制台](https://platform.agnes-ai.com/) 创建 API Key。
2. 默认 `agnes-image-2.1-flash`（公开文档曾标 $0/张，以对方为准）。
3. 与关卡 Agnes 共用日记设置里的 **Agnes API Key**。

```bash
# 仅电脑浏览器代理需要
# DASHSCOPE_API_KEY=sk-...
# AGNES_API_KEY=...
# FAMILY_IMAGE_PROVIDER=mock   # 不扣费占位
```

## 费用与安全（约）

- 通义万相按张计费（`wan2.6-t2i` 公开价约 **0.20 元/张**）；一关张数=设置里的关键词上限（常见 9 张则约 ¥1.8）。
- Agnes 图以官方活动价为准，可能有 RPM 限制。
- **自动云端配图默认关闭**；图标配图默认开、离线免费。
- Prompt 固定儿童安全前缀；失败单张 SVG 占位，**不丢关卡**。

## 接口（浏览器代理）

- `POST /api/family/generate-images`
- Body：`{ date, level | slots, imageProvider?: 'tongyi'|'agnes', apiKey? }`
- 成功：`{ images: string[], warnings?: string[], provider }`

## 手工验收

1. **无通义 Key**：能生成关卡；开自动配图时提示缺 Key，关卡仍在，可用相册。
2. **有 Key + 开自动配图**：生成后出现「正在配图…」，缩略图 ≤4 张，家庭日历可玩。
3. **通义失败 / 断网**：状态提示配图失败，关卡保留；可「重新配图」或相册。
4. **重新配图**：有已有图时需确认；确认后替换。
5. `FAMILY_IMAGE_PROVIDER=mock`：不扣费，返回 SVG 占位，便于冒烟。
