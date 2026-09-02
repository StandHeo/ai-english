# 家庭日记关卡工作室（当晚可玩）

和官方主题包独立。家长用手机聊「今天做了什么」→ 所选模型生成**当日迷你 pack（3–5 关）** → 每关一词一景、可云端配图 → 孩子在「家庭日历」里先看关列表再玩。

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

## 家长：做今日迷你 pack

1. 首页右上角家庭图标 → 算术验证 → **家庭日记**
2. **设置**：关卡模型 DeepSeek / Agnes；云端配图通义 / Agnes 图；填对应 Key；**今日关数 3–5**（设置可填到 12，生成时夹紧到 5）；可选开启自动云端配图
3. 聊天气泡打字或语音记录今日故事
4. 点 **生成关卡** → 得到多关（如 park / bus / slide），结构对齐官方水果「一词一关」
5. 可按关用中英文编辑场景主题，再「配图本关」或「云端配全部关」
6. 打开 **家庭日历** → 点当天 → **关列表** → 逐关玩

通义费用见 [`family-tongyi-images.md`](./family-tongyi-images.md)。迷你 pack 默认每关约 1 张背景 + 1 张主词道具（最多约 3–5 关）。Agnes 免费档约 **20 次 API/分钟**，多关会排队变慢。

## 孩子：玩

首页 **Family** → 日历有颜色的日子 → **关列表** → 点一关玩（流程与官方关相同：说话 / 点图）。全部关卡通关后算今日完成。

## 说明

- 数据存在本机浏览器（`localStorage`），清站点数据会丢。
- **旧「一天一关」记录仍可玩**；重新生成会写成迷你 pack。
- 同一天未通关可再次生成覆盖；已通关会先确认。
- 不会改写官方水果/机器人等 pack。
- `FAMILY_LLM_PROVIDER=mock` 时不调用云模型，用固定演示迷你 pack，方便冒烟。
- 浏览器联调请求体带 `llm`（`deepseek` | `agnes`）与 `mode: pack`（默认）。
