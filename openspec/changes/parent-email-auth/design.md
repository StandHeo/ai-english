## 背景

见 `proposal.md`。当前 `users.phone` 为 NOT NULL UNIQUE，验证码表为 `sms_codes`，家长中心与 `GET /api/me` 以手机号为账号键。短信防刷（IP 限流、可选 `SMS_CAPTCHA`）与运营后台（PR #51）已在 main。资质未就绪，产品默认改为邮箱验证码。

## 目标 / 非目标

**目标：**

- 顺序 migration：`users.email` 唯一可空；`phone` 改为可空唯一；至少一端非空。
- 验证码表收成 `auth_codes(channel, destination)`；短信模块改写该表，路由保持 `/api/auth/sms/*`。
- 邮箱发送 mock / SMTP / 腾讯云 SES API（个人实名默认 API 模板发信）；家长 UI 走邮箱；限流与 captcha 复用。
- admin / `/api/me` / 手工开通识别邮箱。

**非目标：** 密码登录、邮箱与手机号自动绑户、生产腾讯云短信、改微信、分布式限流、Resend/SendGrid 等第三方邮件 SaaS。

## 决策

### D1 — email 为主键，phone 可空

- **选择：** `002_email_auth.sql` 重建 `users`：`email TEXT UNIQUE`、`phone TEXT UNIQUE`，二者均可空，`CHECK (email IS NOT NULL OR phone IS NOT NULL)`。既有行：`email=NULL`，`phone` 原值。新邮箱登录：`email` 规范化小写，`phone=NULL`。
- **原因：** 国内启动以邮箱为准，又保留短信旧行与日后绑号，不必双主键。
- **备选：** 只加 `email` 且 `phone` 仍 NOT NULL（新用户需假手机号，否决）；用 `login` 单列（丢失通道语义，否决）。
- **旧行：** 仅手机号用户继续走短信校验；不能用邮箱登录该行。邮箱登录永远按 email 查找/创建，**不**与手机号行合并。

### D2 — `sms_codes` 收成 `auth_codes`

- **选择：** `auth_codes(channel TEXT, destination TEXT, code_hash, expires_at, attempts, sent_at)`，主键 `(channel, destination)`。`channel` 为 `email` | `sms`。迁移拷贝 `sms_codes` 为 `channel='sms'` 后删除旧表。短信与邮箱共用同一套 60s 间隔 / 5min TTL / 最多 5 次校验。
- **原因：** 一张表、一套哈希与限流，比并列 `email_codes` 更干净。
- **备选：** 新增 `email_codes` 保留 `sms_codes`（双份逻辑）。

### D3 — 发信 mock | SMTP | 腾讯云 SES API

- **选择：** `EMAIL_PROVIDER=mock|smtp|tencent_ses`，开发默认 mock。生产文档默认 `tencent_ses`。
  - mock：日志 `[email/mock] email=… code=…`，码为 `MOCK_EMAIL_CODE`（默认 `123456`）。
  - smtp：nodemailer，`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`，可选 `SMTP_SECURE`。保留给企业 SMTP / QQ 授权码。
  - tencent_ses：TC3 签 `ses.tencentcloudapi.com`，Action=`SendEmail`，Version=`2020-10-02`，地域默认 `ap-guangzhou`。**个人/普通账号必须用已审核模板**（官方：默认仅模板；`Simple` 已废弃；`FailedOperation.WithOutPermission` = 仅模板）。`TENCENT_SES_TEMPLATE_ID` 必填，`TemplateData` 为 `{"code":"<6位码>"}`。密钥优先 `TENCENT_SES_SECRET_ID/KEY`，可回落 `TENCENT_CLOUD_SECRET_ID/KEY`；**不**复用 `TENCENT_SMS_*`。发件人 `TENCENT_SES_FROM`，可回落 `EMAIL_FROM` / `SMTP_FROM`。
- **原因：** 2026-03-02 起新开通的个人实名 SES **不能 SMTP**，只能 API/控制台。CI 用注入 `fetch` 测 HTTP，不连外网。
- **备选：** 只 SMTP（个人账号不可用，否决）；Resend/SendGrid（否决）；裸 `Simple` 正文（个人账号会 `WithOutPermission`，否决）。

### D4 — 默认通道与配置

- **选择：** `AUTH_CHANNEL=email|sms`，默认 `email`。`GET /api/auth/config` → `{ captcha, authChannel }`。`GET /api/auth/sms/config` 返回同一 JSON（兼容旧客户端）。ParentPage **固定走邮箱 API**，不按 `authChannel` 切回短信（通道字段留给日后开关）。
- **原因：** 产品已锁定邮箱主路径；短信只留 API。

### D5 — 限流与验证码一套开关

- **选择：** 邮箱 send/verify 调用现有 `consumeSmsIpLimit`。IP 超限邮箱路由返回 `auth_ip_rate_limited`（短信仍 `sms_ip_rate_limited`）。按目标间隔：邮箱 `email_rate_limited`，短信 `sms_rate_limited`。`authCaptchaEnabled()`：`AUTH_CAPTCHA` 为 on/true/1，**或** `SMS_CAPTCHA` 为 on/true/1。检查顺序与短信相同：IP → 校验标识 → captcha → provider/间隔。
- **原因：** 一个 captcha 开关覆盖两通道；短信测试与错误码不变。

### D6 — 开通与 me

- **选择：** `getOrCreateUserByEmail` / `findUserByEmail`。`grantPlus` 改为按 `{ email?: string, phone?: string }`：优先 email，否则 phone。`GET /api/me`：`email` 掩码（`a***@domain`），`phone` 有则掩码否则 `null`。注销时删该用户 `auth_codes` 两通道行。
- **原因：** 管理接口向前兼容手机号 body。

### D7 — 运营后台

- **选择：** 列表 SELECT 加 `u.email`；`emailMasked`；开通表单邮箱（可空）+ 手机号（可空）。`ADMIN_TABLES` 含 `auth_codes`，去掉已删的 `sms_codes`。表浏览对 `destination`/`code_hash` 截断。
- **原因：** #51 已在 main，本变更直接改。

### API 一览（本切片）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/config` | `{ captcha, authChannel }` |
| GET | `/api/auth/sms/config` | 同上（兼容） |
| POST | `/api/auth/email/send` | `{ email }` + 可选 captcha |
| POST | `/api/auth/email/verify` | `{ email, code }` → token |
| POST | `/api/auth/sms/*` | 保留 |
| GET | `/api/me` | `email`、`phone?`、`plus`、`expiresAt` |
| POST | `/api/admin/plus` | `{ email? , phone?, plan }` |

## 风险

- **[邮箱与手机号分裂账号]** → 文档写明不自动合并；运营按正确键开通。
- **[个人 SES 不能 SMTP]** → 生产走 `tencent_ses` 模板 API；SMTP 仅作企业/QQ 备选。
- **[SES 模板未审核]** → 文档写明控制台创建验证码模板（变量名 `code`）并填 `TENCENT_SES_TEMPLATE_ID`；缺配置返回 `email_ses_not_configured`。
- **[SQLite 重建 users]** → migration 拷贝后再改名；外键 ON，事务内完成。
- **[验证码枚举邮箱是否存在]** → 发送对未知邮箱也返回成功（仍写入 auth_codes），与短信「先发后建用户」一致。

## 迁移

1. 部署带 `002_email_auth.sql` 的 API；启动时自动 apply。
2. 设 `EMAIL_PROVIDER=mock` 验证家长页；生产改 `tencent_ses`（模板 ID + 密钥 + 发件域名）。企业 SMTP 仍可用 `smtp`。
3. 回滚：恢复上一版二进制不能理解 `auth_codes` / 可空 phone，需备库；v1 单机接受备份回退。

## 待决

- （无。SES 模板 ID 与密钥由运维在控制台创建后填 env。）
