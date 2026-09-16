# 轻量主机部署草图（会员切片）

单机腾讯云轻量（成都、Ubuntu）即可跑 `apps/api` + SQLite。域名与证书可后补；未上 TLS 前不要把短信 / 支付密钥打到公网明文。

## 进程

- Express 监听 `127.0.0.1:8787`（`PORT=8787`）
- SQLite 文件：`DATABASE_PATH`（或 `DATA_DIR/membership.db`），启动时 `PRAGMA journal_mode=WAL`
- 进程管理：pm2（或 systemd）跑 `npm --prefix apps/api start`
- 默认 `EMAIL_PROVIDER=mock`、`SMS_PROVIDER=mock`、`BILLING_PROVIDER=manual`；家长产品路径为邮箱验证码。生产发信用腾讯云 SES **API**（个人实名不能 SMTP）。腾讯云短信与微信支付只在环境变量配齐后开启

## Nginx

监听 `:443`（有证书后）反代 API：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
}
location /health {
  proxy_pass http://127.0.0.1:8787;
}
```

Web 静态资源另配站点根；开发期 Vite 仍把 `/api` 代理到 `:8787`。

Express 默认 `trust proxy` 为一跳（可用 `TRUST_PROXY` 覆盖；直连公网设 `0`）。邮箱与短信发送共用客户端 IP 滑动窗口限流（默认 60 秒 10 次，可选 `SMS_IP_DAILY_MAX` 日限额）。邮箱超限返回 `auth_ip_rate_limited`，短信超限仍为 `sms_ip_rate_limited`；按目标间隔分别是 `email_rate_limited` / `sms_rate_limited`。生产可设 `AUTH_CAPTCHA=on`（或兼容 `SMS_CAPTCHA=on`）打开内置图形验证码，两通道发送都要校验；未设置时 mock 开发流程不变。Nginx 必须覆盖 `X-Real-IP` / `X-Forwarded-For`，不要把客户端自带的转发头原样传给 API。

## 备份

备份 `*.db` 以及同目录 `-wal` / `-shm`。v1 单进程写，不要多实例同时写同一文件。

## 运营后台

Express 在 `/api/admin/ui/` 提供只读 Web 控制台（现有 Nginx `location /api/` 即可到达，无需改反代）。生产示例：

`https://tudoudou-ai.site/api/admin/ui/`

用环境变量 `ADMIN_TOKEN` 登录（`Authorization: Bearer` 或登录框）。令牌只存在浏览器 `sessionStorage`。概览「在线」= `sessions.expires_at` 仍大于当前时间的行数，**不是** WebSocket 实时在线。全部 `/api/admin/*` JSON 都要该令牌；未配置返回 503，错令牌 401。

日后若想用更短路径，可另加（可选，非必须）：

```nginx
location /admin/ {
  proxy_pass http://127.0.0.1:8787/api/admin/ui/;
}
```

## 家长邮箱登录（默认）

家长中心走 `POST /api/auth/email/send` 与 `/verify`。开发默认 `EMAIL_PROVIDER=mock`，验证码写 API 日志（`MOCK_EMAIL_CODE` 默认 `123456`）。

生产默认走腾讯云邮件推送 **API**（`SendEmail`），**不要**对个人实名账号配 SES SMTP：2026-03-02 起新开通的个人实名用户不能 SMTP，只能 API 或控制台。普通账号也 **必须用已审核模板**（`Simple` 正文已废弃；缺模板会 `FailedOperation.WithOutPermission`）。

1. 控制台开通 SES，验证发信域名（如 `mail.tudoudou-ai.site`），添加发件地址（如 `noreply@mail.tudoudou-ai.site`）。
2. 创建并审核「验证码」模板，变量名必须是 `code`（正文示例：`您的验证码是{{code}}，5 分钟内有效。`）。记下模板 ID。
3. 填环境变量：

```bash
EMAIL_PROVIDER=tencent_ses
TENCENT_SES_SECRET_ID=
TENCENT_SES_SECRET_KEY=
TENCENT_SES_REGION=ap-guangzhou
TENCENT_SES_FROM=noreply@mail.tudoudou-ai.site
TENCENT_SES_TEMPLATE_ID=
```

密钥也可改用 `TENCENT_CLOUD_SECRET_ID` / `TENCENT_CLOUD_SECRET_KEY`（SES 专用变量未设时回落）。**不要**把 `TENCENT_SMS_*` 当 SES 密钥。发件人未设 `TENCENT_SES_FROM` 时回落 `EMAIL_FROM` / `SMTP_FROM`。

企业认证或 QQ 邮箱仍可用 SMTP 备选：

```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=on
SMTP_USER=your-qq@qq.com
SMTP_PASS=授权码
SMTP_FROM="土豆豆AI英语 <your-qq@qq.com>"
```

QQ 邮箱需在网页版开启 SMTP 并使用**授权码**（不是登录密码）。短信路由 `/api/auth/sms/*` 仍保留，待资质后再开 `SMS_PROVIDER=tencent`。

既有仅手机号用户（`users.email` 为空）仍可用短信校验登录；**不会**与新邮箱账号自动合并。运营开通请按家长实际登录键（邮箱或旧手机号）。

## 手工开通 Plus

后台「概览」可按**邮箱**开通（旧账号仍可填手机号），或：

```bash
curl -s -X POST https://tudoudou-ai.site/api/admin/plus \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"parent@example.com","plan":"month"}'
```

包年把 `plan` 改为 `year`。续期从 `max(现在, 当前到期)` 起算 +30 / +365 天。旧手机号行：

```bash
curl -s -X POST https://tudoudou-ai.site/api/admin/plus \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","plan":"month"}'
```
