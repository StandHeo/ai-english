## 背景

`issueSmsCode` 已按手机号 60s / 5min TTL / 最多 5 次校验。v1 单机 pm2 单实例，进程内限流足够。Nginx 会设置 `X-Real-IP` / `X-Forwarded-For`。

## 目标 / 非目标

**目标：** IP 限流始终开启；图形验证码环境开关，默认关；mock 短信与现有测试保持可用。

**非目标：** Redis/多实例分布式限流、第三方验证码 SaaS、改微信/计费、改按号间隔。

## 决策

### D1 — 进程内滑动窗口

`Map<ip, timestamps[]>`，默认 `SMS_IP_LIMIT_WINDOW_MS=60000`、`SMS_IP_LIMIT_MAX=10`。可选 `SMS_IP_DAILY_MAX`（滚动 24h，未设则关闭）。校验接口默认 30 次/窗口（`SMS_VERIFY_IP_LIMIT_MAX`）。

### D2 — IP 识别与 trust proxy

默认 `app.set('trust proxy', 1)`，可用 `TRUST_PROXY` 覆盖（`0`/`false`/`off` 关闭）。客户端 IP：`X-Forwarded-For` 最左 → `X-Real-IP` → `req.ip` → `socket.remoteAddress`。Nginx 必须覆盖这些头，避免伪造。

### D3 — 内置 SVG 数字验证码

4 位数字，答案 sha256 后内存存放，TTL 5 分钟，一次核销。`SMS_CAPTCHA` 为 `on`/`true`/`1` 时，`POST /api/auth/sms/send` 必须带 `captchaId` + `captchaAnswer`。`GET /api/auth/sms/config` 返回 `{ captcha: boolean }`。

### D4 — 检查顺序

发送：IP 限流 → 校验手机号 →（若开启）验证码 → 现有 provider / 按号逻辑。限流失败不消耗验证码。

## 风险

- **[单实例计数]** → v1 可接受；多实例需后续 Redis。
- **[伪造 X-Forwarded-For]** → 仅本机 Nginx 覆盖头；直连公网时应 `TRUST_PROXY=0`。
- **[测试共用 127.0.0.1 配额]** → 限流用例用独立转发 IP，并提供 reset 供测试。
