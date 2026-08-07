# 家庭日记关卡工作室（当晚可玩）

和官方主题包独立。家长用手机聊「今天做了什么」→ DeepSeek 生成一关 → 可选相册图 → 孩子在「家庭日历」里玩，并按日期攒下来。

> 聊天气泡 + 端侧 Whisper 说明见 [`family-diary-whisper.md`](./family-diary-whisper.md)。

## 前提

1. API 与 Web 已启动；手机要用麦克风时请用 HTTPS：

```bash
# 终端 1
cd apps/api
cp -n .env.example .env
# 可选：写入 DEEPSEEK_API_KEY=sk-...
# 可选：写入 DASHSCOPE_API_KEY=sk-...（通义配图，见 family-tongyi-images.md）
# 无 Key 联调可设 FAMILY_LLM_PROVIDER=mock
# 配图联调可设 FAMILY_IMAGE_PROVIDER=mock
npm run dev

# 终端 2
cd apps/web
npm run dev:phone
```

2. 手机 Chrome 打开 `https://电脑IP:5173`（证书警告选继续访问）。

## 家长：做今日关卡

1. 首页右上角家庭图标 → 算术验证 → **家庭日记**
2. 用聊天气泡打字或语音记录今日故事（Key / 自动配图在 **设置**）
3. 点 **生成关卡**；若设置开启自动配图，会再请求通义万相（也可稍后「重新配图」或相册选图）
4. 打开 **家庭日历** 或回首页点 **Family / 今日冒险**

通义开通、费用与验收见 [`family-tongyi-images.md`](./family-tongyi-images.md)。

## 孩子：玩

首页 **Family** → 日历里有颜色的日子 → 点进去玩（流程与官方关相同：说话 / 点图）。

## 说明

- 数据存在本机浏览器（`localStorage`），清站点数据会丢。
- 同一天未通关可再次生成覆盖；已通关会先确认。
- 不会改写官方水果/机器人等 pack。
- `FAMILY_LLM_PROVIDER=mock` 时不调用 DeepSeek，用固定演示关，方便冒烟。
