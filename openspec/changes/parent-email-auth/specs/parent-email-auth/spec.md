## Purpose

让家长在门禁之后用邮箱验证码登录，以规范化邮箱作为账号主键认 Plus，并在开发环境用 mock、生产用 SMTP 发信。

## ADDED Requirements

### Requirement: 家长中心默认邮箱验证码登录
系统 MUST 仅在通过既有家长门禁后提供邮箱验证码登录。家长中心登录表单 MUST 以邮箱为主路径，MUST NOT 默认展示手机号短信表单。儿童游玩路径 MUST NOT 展示登录、验证码或价格。

#### Scenario: 门禁后可见邮箱登录
- **WHEN** 用户通过家长算术门禁进入家长中心且尚未登录
- **THEN** 系统展示邮箱与验证码输入，文案为中文，且不要求儿童路径先登录

#### Scenario: 儿童路径无登录 UI
- **WHEN** 儿童在首页选择官方主题包或进入关卡
- **THEN** 界面 MUST NOT 出现价格、登录、验证码或「开通会员」文案

### Requirement: 邮箱验证码发送与校验
系统 MUST 提供 `POST /api/auth/email/send`（body 含 `email`，验证码开启时另含 `captchaId` 与 `captchaAnswer`）与 `POST /api/auth/email/verify`（body 含 `email` 与 `code`）。邮箱 MUST 规范化（trim、小写）后再作为账号键。校验通过后 MUST 创建或复用该邮箱对应 `users` 行并返回会话令牌。同一规范化邮箱 MUST 对应同一用户，以便跨设备恢复 Plus。无效邮箱 MUST 返回 HTTP 400 `{ error: 'invalid_email' }`。错误或过期码 MUST 拒绝登录且 MUST NOT 颁发令牌。

#### Scenario: 校验成功建立会话
- **WHEN** 家长提交有效邮箱与未过期验证码
- **THEN** 系统返回会话令牌，后续请求可用该令牌调用需登录接口

#### Scenario: 错误或过期验证码
- **WHEN** 验证码错误或已过期
- **THEN** 系统拒绝登录且 MUST NOT 颁发令牌

#### Scenario: 无效邮箱被拒绝
- **WHEN** 发送或校验请求中的邮箱格式无效
- **THEN** 系统返回 HTTP 400 `invalid_email` 且 MUST NOT 发信或颁发令牌

### Requirement: 邮件 mock 与 SMTP
当 `EMAIL_PROVIDER` 未设置或为 `mock` 时，系统 MUST NOT 连接 SMTP，MUST 将验证码写入服务端日志，并 MAY 使用 `MOCK_EMAIL_CODE`（缺省为约定开发码）。当 `EMAIL_PROVIDER=smtp` 时，系统 MUST 使用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`（可选 `SMTP_SECURE`）发送验证码邮件；配置不全 MUST 明确失败且 MUST NOT 颁发令牌。

#### Scenario: 开发 mock 不真发邮件
- **WHEN** 邮件提供方为 mock
- **THEN** 系统不连接 SMTP，仍可用日志或约定码完成校验

#### Scenario: SMTP 未配置明确失败
- **WHEN** `EMAIL_PROVIDER=smtp` 且主机或发件人等必要配置缺失
- **THEN** 发送接口失败且错误可区分，MUST NOT 静默当成功

### Requirement: 配置接口暴露通道与验证码开关
系统 MUST 提供 `GET /api/auth/config`（既有 `GET /api/auth/sms/config` MAY 作为兼容别名），成功响应 MUST 包含 `{ captcha: boolean, authChannel: 'email' | 'sms' }`。默认产品通道 MUST 为 `email`。`captcha` 为 true 时，邮箱发送 MUST 与短信发送一样校验图形验证码。

#### Scenario: 默认通道为邮箱
- **WHEN** 未设置覆盖通道的环境变量
- **THEN** `authChannel` 为 `email`，家长中心按邮箱登录

#### Scenario: 验证码关闭时可不带 captcha
- **WHEN** 图形验证码未开启
- **THEN** 仅凭有效邮箱即可调用发送接口（仍受 IP 与按邮箱间隔限流）

### Requirement: /api/me 暴露邮箱
已认证的 `GET /api/me` 成功响应 MUST 包含 `email`（可掩码）以及 `plus`、`expiresAt`。若该用户仍绑定手机号，响应 MUST 同时包含 `phone`（可掩码）；无手机号时 `phone` MAY 为 `null` 或省略。

#### Scenario: 邮箱登录后读 me
- **WHEN** 家长用邮箱验证码登录后请求 `GET /api/me`
- **THEN** 响应含该账号邮箱（或掩码）以及 `plus` 与 `expiresAt`
