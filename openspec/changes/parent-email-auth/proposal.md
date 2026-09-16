## 为什么

国内上架需要家长账号认 Plus，但腾讯云短信签名受个体户/资质卡住，不能作为当前默认登录。已确认（2026-09-16）：**邮箱验证码登录为产品主路径**；短信代码保留备后用，不再作为家长中心默认流程。账号主键改为规范化邮箱。

## 变更内容

- 家长中心登录改为邮箱 + 验证码（交互对齐现有短信：发送 / 图形验证码 / 校验）。
- 账号身份以 **email** 为主键；`phone` 改为可空，供日后绑定短信。既有仅手机号行仍可用 `/api/auth/sms/*` 登录，不与新邮箱账号自动合并。
- 新增 `POST /api/auth/email/send` 与 `POST /api/auth/email/verify`；保留短信路由。配置接口暴露 `{ captcha, authChannel }`，默认 `authChannel=email`。
- 邮件发送 `EMAIL_PROVIDER=mock|smtp`（默认 mock）；SMTP 用 nodemailer + 环境变量，不接付费邮件 SaaS。
- 复用现有 IP 限流；图形验证码用一个开关同时覆盖短信与邮箱发送（`AUTH_CAPTCHA`，兼容 `SMS_CAPTCHA`）。
- `GET /api/me` 返回 `email`（及若有则 `phone`）。`POST /api/admin/plus` 支持按邮箱开通，并保留按手机号开通旧行。
- 运营后台在有邮箱列时展示邮箱；手工开通表单支持邮箱。
- **非目标：** 密码登录、生产开通腾讯云短信、改微信支付。

## 能力

### 新增能力

- `parent-email-auth`：家长邮箱验证码登录、会话、`GET /api/me` 暴露邮箱；SMTP/mock 发信。

### 修改的能力

- `parent-phone-auth`：短信路由保留，但产品默认与家长 UI 改为邮箱；`users.phone` 可空。
- `sms-login-anti-abuse`：IP 限流与图形验证码同时作用于邮箱发送/校验；单一 captcha 开关覆盖两通道。
- `plus-billing`：手工开通可按邮箱授予 Plus，仍可按手机号开通既有行。
- `admin-console`：列表与开通 UI 展示/接受邮箱；表浏览覆盖 `auth_codes`。

## 影响

- `apps/api`：migration、auth 路由、发信、会员查找、admin JSON/UI、`.env.example`
- `apps/web`：`ParentPage`、`membership.ts` 客户端与测试
- `docs/lite-host.md`、`docs/monetization.md`：登录标识从手机号改为邮箱为主
- 依赖：`nodemailer`（仅 API）
