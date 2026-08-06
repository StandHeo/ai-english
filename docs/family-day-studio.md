# 家庭日记关卡工作室（当晚可玩）

和官方主题包独立。家长用手机聊「今天做了什么」→ DeepSeek 生成一关 → 可选相册图 → 孩子在「家庭日历」里玩，并按日期攒下来。

## 前提

1. API 与 Web 已启动；手机要用麦克风时请用 HTTPS：

```bash
# 终端 1
cd apps/api
cp -n .env.example .env
# 可选：写入 DEEPSEEK_API_KEY=sk-...
# 无 Key 联调可设 FAMILY_LLM_PROVIDER=mock
npm run dev

# 终端 2
cd apps/web
npm run dev:phone
```

2. 手机 Chrome 打开 `https://电脑IP:5173`（证书警告选继续访问）。

## 家长：做今日关卡

1. 首页右上角家庭图标 → 算术验证 → **做今日关卡**
2. 填写并保存 **DeepSeek API Key**（或已在 API `.env` 配置 `DEEPSEEK_API_KEY`）
3. 用打字或「语音追加」记录孩子今天的故事（可多段）
4. 点 **生成关卡**
5. 按「相册搜图提示」在系统相册搜索，点 **从相册选图**（可跳过，会用占位图）
6. 打开 **家庭日历** 或回首页点 **Family / 今日冒险**

## 孩子：玩

首页 **Family** → 日历里有颜色的日子 → 点进去玩（流程与官方关相同：说话 / 点图）。

## 说明

- 数据存在本机浏览器（`localStorage`），清站点数据会丢。
- 同一天未通关可再次生成覆盖；已通关会先确认。
- 不会改写官方水果/机器人等 pack。
- `FAMILY_LLM_PROVIDER=mock` 时不调用 DeepSeek，用固定演示关，方便冒烟。
