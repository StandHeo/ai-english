## ADDED Requirements

### Requirement: 邮箱发送与校验复用 IP 限流
系统 MUST 对 `POST /api/auth/email/send` 使用与短信发送相同的客户端 IP 滑动窗口限流（同一套窗口与上限配置，含可选日限额）。超限 MUST 返回 HTTP 429，错误码 MUST 可与按邮箱间隔限流区分（按邮箱间隔为 `email_rate_limited`）。系统 MUST 对 `POST /api/auth/email/verify` 使用与短信校验相同的较宽松 IP 限流。短信路由的既有错误码 `sms_ip_rate_limited` 与 `sms_rate_limited` MUST 保持不变。

#### Scenario: 同一 IP 超过邮箱发送窗口上限
- **WHEN** 同一客户端 IP 在窗口内对 `POST /api/auth/email/send` 的请求次数超过上限（使用不同邮箱以免触发按邮箱间隔）
- **THEN** 系统返回 HTTP 429 且 MUST NOT 再发邮件

#### Scenario: 按邮箱间隔错误码
- **WHEN** 同一规范化邮箱在 60 秒内再次请求发送且尚未触达 IP 上限
- **THEN** 系统返回 HTTP 429 且 `error` 为 `email_rate_limited`

### Requirement: 单一图形验证码开关覆盖两通道
当 `AUTH_CAPTCHA` 或兼容项 `SMS_CAPTCHA` 为 `on`/`true`/`1` 时，`POST /api/auth/email/send` 与 `POST /api/auth/sms/send` MUST 都校验 `captchaId` 与 `captchaAnswer`。任一开关开启即视为开启。未设置或为 off 时两通道发送 MUST NOT 要求验证码。`GET /api/auth/config` 的 `captcha` 字段 MUST 反映该统一开关。

#### Scenario: 开启后邮箱发送缺少验证码
- **WHEN** 图形验证码已开启且邮箱发送请求未带验证码
- **THEN** 系统返回 HTTP 400 `captcha_required` 且 MUST NOT 发邮件

#### Scenario: 关闭时短信与邮箱都不要求验证码
- **WHEN** `AUTH_CAPTCHA` 与 `SMS_CAPTCHA` 均未开启
- **THEN** 有效邮箱或手机号即可调用对应发送接口（仍受限流）
