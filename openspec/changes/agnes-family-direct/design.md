## 背景

家庭日记关卡走 DeepSeek，配图走通义万相，App 还要把请求打到电脑 `apps/api`。家长希望用 Agnes `agnes-2.5-flash` 与免费档 Agnes 图做 A/B，并在手机上不依赖局域网。

## 目标 / 非目标

**目标：**

- 设置里可切换关卡 LLM、云端配图提供方；一把 Agnes Key。
- 原生 App 有 Key 即 HTTPS 直连；浏览器仍代理 `apps/api`。
- 同一套关卡 JSON 校验与「图失败不丢关」。

**非目标：** 百炼 Agent、删除旧供应商、关卡 ASR 直连、儿童自由聊。

## 决策

### D1 — 两个独立开关，不绑死一套 Agnes

关卡与配图分开选，便于判断 JSON 差还是图画风差。

### D2 — 原生直连，浏览器代理

`CapacitorHttp` 打 HTTPS，无 CORS。浏览器直连 DeepSeek/Agnes 易被 CORS 拦，继续 Vite 代理，body 带 `llm` / `imageProvider`。

### D3 — 压图用 Canvas

Node `sharp` 不能上手机；直连后用 Canvas 缩到最长边 512 的 JPEG data URL。

### D4 — 默认不变

默认 DeepSeek + 自动图标开、自动云端配图关。

### D5 — 型号写死试用默认

`agnes-2.5-flash`、`agnes-image-2.1-flash`；可用 env 覆盖仅服务端路径。

## 风险 / 权衡

- **[Agnes 免费配额/429]** → 单槽失败占位，关卡保留。
- **[手机链路慢]** → 超时文案谈网络与 Key，不谈电脑 IP。
- **[Key 在本机]** → 与现有 DeepSeek/通义相同，不进 APK。
- **[JSON 不稳]** → 沿用校验与一次重试。

## 待决

- Agnes 图返回 URL 还是 b64：实现时两种都认。
