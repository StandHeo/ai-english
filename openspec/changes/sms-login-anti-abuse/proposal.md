## 为什么

家长短信登录的 `POST /api/auth/sms/send` 目前只有按手机号 60 秒间隔。同一 IP 换号连打即可短信轰炸，产生费用与骚扰。生产在 Nginx 后，需要按真实客户端 IP 限流，并可选图形验证码（默认关闭，以免 mock/开发流程被打断）。

## 变更内容

- 对 `POST /api/auth/sms/send` 始终做进程内滑动窗口 IP 限流（可配窗口与上限；可选日限额）；超限返回 HTTP 429 `{ error: 'sms_ip_rate_limited' }`，与按号 `sms_rate_limited` 区分。
- 对 `POST /api/auth/sms/verify` 做较宽松的 IP 限流，抑制验证码爆破。
- 从 `X-Forwarded-For` / `X-Real-IP` 识别客户端 IP，并启用/文档化 Express `trust proxy`。
- `SMS_CAPTCHA=on` 时启用内置图形验证码（GET 挑战、发送时校验）；未设置或 `off` 时行为不变。
- 家长中心登录 UI 按配置或 `captcha_required` 探测展示验证码。
- 不改计费/微信，不删除 mock 短信路径。

## Capabilities

### New Capabilities

- `sms-login-anti-abuse`：短信发送/校验的 IP 限流与可选图形验证码。

### Modified Capabilities

- `parent-phone-auth`：发送接口增加 IP 限流与可选 captcha 字段；家长登录 UI 可展示验证码。

## Impact

- `apps/api`：限流、验证码、trust proxy、`/api/auth/sms/config`、`/api/auth/captcha`
- `apps/web`：`ParentPage` 与 membership 客户端
- `apps/api/.env.example`、`docs/lite-host.md`
