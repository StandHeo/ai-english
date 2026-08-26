# 家庭日记关卡工作室（当晚可玩）

和官方主题包独立。家长用手机聊「今天做了什么」→ 所选模型（默认 DeepSeek，可切换 Agnes 2.5-flash）生成一关 → 可选云端配图或相册 → 孩子在「家庭日历」里玩。

> 聊天气泡 + 端侧 Whisper 说明见 [`family-diary-whisper.md`](./family-diary-whisper.md)。

## 前提

**打好的 App：** 在「家庭日记 → 设置」填写当前模型的云 Key 后，手机会直连 HTTPS，**不必**开电脑 `apps/api`、也不必填局域网地址。若 Logcat 出现 `SocketTimeoutException`，多为云端读超时；确认外网后重试即可（App 已加长超时并会自动重试一次）。

**电脑浏览器联调**仍要 API + Web：

```bash
# 终端 1
cd apps/api
cp -n .env.example .env
# 可选：DEEPSEEK_API_KEY / AGNES_API_KEY / DASHSCOPE_API_KEY
# 无 Key 联调可设 FAMILY_LLM_PROVIDER=mock
# 配图联调可设 FAMILY_IMAGE_PROVIDER=mock
npm run dev

# 终端 2
cd apps/web
npm run dev:phone
```

手机 Chrome 打开 `https://电脑IP:5173`（证书警告选继续访问）。

## 家长：做今日关卡

1. 首页右上角家庭图标 → 算术验证 → **家庭日记**
2. **设置**：关卡模型 DeepSeek / Agnes；云端配图通义 / Agnes 图；填对应 Key；可选开启自动云端配图
3. 聊天气泡打字或语音记录今日故事
4. 点 **生成关卡**；若开启自动云端配图，会出 **1 张场景背景 + 各关键词道具图**（也可手动「云端配图」或相册）
5. 打开 **家庭日历** 或回首页点 **Family / 今日冒险**

通义费用见 [`family-tongyi-images.md`](./family-tongyi-images.md)。Agnes 图以对方公开免费档为准，随时可能改价；**免费档约 20 次 API/分钟**，App 已限速排队，多图配图会变慢。  
本地图标配图已移除（见 [`family-iconify-images.md`](./family-iconify-images.md)）。

## 孩子：玩

首页 **Family** → 日历里有颜色的日子 → 点进去玩（流程与官方关相同：说话 / 点图）。

## 说明

- 数据存在本机浏览器（`localStorage`），清站点数据会丢。
- 同一天未通关可再次生成覆盖；已通关会先确认。
- 生成关卡会检查英文关键词数量（目标词 + 选项 id 去重）；默认至少 9 个，可在日记设置里改（3–20）。不足时不保存关卡，提示追加日记后再生成。
- 不会改写官方水果/机器人等 pack。
- `FAMILY_LLM_PROVIDER=mock` 时不调用云模型，用固定演示关，方便冒烟。
- 浏览器联调请求体带 `llm`（`deepseek` | `agnes`）；服务端也可用 `AGNES_API_KEY`。
