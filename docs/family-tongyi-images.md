# 家庭关卡通义万相自动配图

生成关卡后可选调用阿里云百炼「通义万相」文生图，把最多 4 张图写入当日 `images[]`，与相册图共用玩法路径。

## 开通

1. 打开 [阿里云百炼控制台](https://bailian.console.aliyun.com/)，开通模型服务并创建 API Key。
2. 确认文生图模型可用（默认代码用 `wan2.6-t2i`，可在 `.env` 覆盖）。
3. 在 `apps/api/.env` 写入：

```bash
DASHSCOPE_API_KEY=sk-...
# 或 TONGYI_API_KEY=sk-...
# TONGYI_IMAGE_MODEL=wan2.6-t2i
# TONGYI_IMAGE_MAX=4
# 联调可不调真 API：
# FAMILY_IMAGE_PROVIDER=mock
```

也可在 App「家庭日记 → 设置」里填写通义 Key（请求头 `x-tongyi-key`），不写日志。

## 费用与安全（约）

- 按张计费，单价随模型与活动变化；粗算一关最多 4 张，约 **¥0.5–1** 量级（以控制台为准）。
- **自动配图默认关闭**，避免误扣费；家长在设置中显式打开。
- Prompt 固定儿童安全前缀（绘本风、无暴力等）；仍须遵守阿里云内容审核与商用条款。
- 图片以 data URL 存本机 `localStorage`，体积有限；失败单张用 SVG 占位，**不丢关卡**。

## 接口

- `POST /api/family/generate-images`
- Body：`{ date, level }` 或 `{ date, slots: [{ subject, role? }] }`，可选 `apiKey`
- 成功：`{ images: string[], warnings?: string[], provider }`
- 无 Key 且非 mock：`400` + `image_provider_unavailable`

## 手工验收

1. **无通义 Key**：能生成关卡；开自动配图时提示缺 Key，关卡仍在，可用相册。
2. **有 Key + 开自动配图**：生成后出现「正在配图…」，缩略图 ≤4 张，家庭日历可玩。
3. **通义失败 / 断网**：状态提示配图失败，关卡保留；可「重新配图」或相册。
4. **重新配图**：有已有图时需确认；确认后替换。
5. `FAMILY_IMAGE_PROVIDER=mock`：不扣费，返回 SVG 占位，便于冒烟。
