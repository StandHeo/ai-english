## Purpose

防止家长短信登录被同一 IP 轰炸或爆破验证码，并在生产可按需打开图形验证码。

## ADDED Requirements

### Requirement: 发送接口按 IP 限流
系统 MUST 对 `POST /api/auth/sms/send` 按客户端 IP 做滑动窗口限流。默认窗口 60 秒、最多 10 次，MUST 可通过 `SMS_IP_LIMIT_WINDOW_MS` 与 `SMS_IP_LIMIT_MAX` 覆盖。若设置了 `SMS_IP_DAILY_MAX`（正整数），同一 IP 在滚动 24 小时内 MUST NOT 超过该次数。超限时 MUST 返回 HTTP 429 且 `{ error: 'sms_ip_rate_limited' }`，MUST NOT 与按手机号的 `sms_rate_limited` 混用。按号 60 秒间隔、5 分钟 TTL、最多 5 次校验 MUST 保持不变。

#### Scenario: 同一 IP 超过窗口上限
- **WHEN** 同一客户端 IP 在窗口内对 `POST /api/auth/sms/send` 的请求次数超过 `SMS_IP_LIMIT_MAX`（使用不同手机号以免触发按号限流）
- **THEN** 系统返回 HTTP 429 且 `error` 为 `sms_ip_rate_limited`，且 MUST NOT 再发出短信

#### Scenario: 按号限流错误码不变
- **WHEN** 同一手机号在 60 秒内再次请求发送且尚未触达 IP 上限
- **THEN** 系统返回 HTTP 429 且 `error` 为 `sms_rate_limited`

### Requirement: 校验接口轻量 IP 限流
系统 MUST 对 `POST /api/auth/sms/verify` 按客户端 IP 做较宽松的滑动窗口限流（默认可通过 `SMS_VERIFY_IP_LIMIT_MAX` 配置）。超限 MUST 返回 HTTP 429 `{ error: 'sms_ip_rate_limited' }`。

#### Scenario: 校验爆破被挡住
- **WHEN** 同一 IP 在窗口内校验次数超过上限
- **THEN** 系统返回 HTTP 429 `sms_ip_rate_limited` 且 MUST NOT 颁发令牌

### Requirement: 代理后识别客户端 IP
系统 MUST 在启用 trust proxy 时从 `X-Forwarded-For`（最左）或 `X-Real-IP` 读取客户端 IP，否则使用套接字地址。Express `trust proxy` MUST 可配置（默认一跳），以便 Nginx 后的真实 IP 生效。

#### Scenario: Nginx 转发头
- **WHEN** 请求带有 `X-Forwarded-For` 或 `X-Real-IP` 且 trust proxy 已启用
- **THEN** 限流键使用该头中的客户端 IP，而不是仅使用直连套接字地址

### Requirement: 可选图形验证码
当 `SMS_CAPTCHA` 未设置或为 `off`/`false`/`0` 时，发送接口 MUST NOT 要求验证码，现有 mock 登录 MUST 继续可用。当 `SMS_CAPTCHA` 为 `on`/`true`/`1` 时：
- `GET /api/auth/captcha` MUST 返回一次性挑战（`id` 与可用于展示的图片 data URL）
- `POST /api/auth/sms/send` MUST 校验 `captchaId` 与 `captchaAnswer`
- 缺失 MUST 返回 HTTP 400 `{ error: 'captcha_required' }`
- 错误、过期或重复使用 MUST 返回 HTTP 400 `{ error: 'captcha_invalid' }`
系统 MUST 提供 `GET /api/auth/sms/config`，响应包含 `{ captcha: boolean }`。

#### Scenario: 默认不要求验证码
- **WHEN** `SMS_CAPTCHA` 未开启
- **THEN** 仅凭有效手机号即可调用发送接口（仍受 IP 与按号限流）

#### Scenario: 开启后缺少验证码
- **WHEN** `SMS_CAPTCHA` 已开启且发送请求未带验证码
- **THEN** 系统返回 HTTP 400 `captcha_required` 且 MUST NOT 发出短信

#### Scenario: 验证码一次性
- **WHEN** 同一 `captchaId` 已被成功或失败核销后再用于发送
- **THEN** 系统返回 HTTP 400 `captcha_invalid`
