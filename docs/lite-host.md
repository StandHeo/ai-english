# 轻量主机部署草图（会员切片）

单机腾讯云轻量（成都、Ubuntu）即可跑 `apps/api` + SQLite。域名与证书可后补；未上 TLS 前不要把短信 / 支付密钥打到公网明文。

## 进程

- Express 监听 `127.0.0.1:8787`（`PORT=8787`）
- SQLite 文件：`DATABASE_PATH`（或 `DATA_DIR/membership.db`），启动时 `PRAGMA journal_mode=WAL`
- 进程管理：pm2（或 systemd）跑 `npm --prefix apps/api start`
- 默认 `SMS_PROVIDER=mock`、`BILLING_PROVIDER=manual`；腾讯云短信与微信支付只在环境变量配齐后开启

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

Express 默认 `trust proxy` 为一跳（可用 `TRUST_PROXY` 覆盖；直连公网设 `0`）。短信发送始终按客户端 IP 滑动窗口限流（默认 60 秒 10 次，可选 `SMS_IP_DAILY_MAX` 日限额），超限返回 `sms_ip_rate_limited`，与按号 `sms_rate_limited` 不同。生产可设 `SMS_CAPTCHA=on` 打开内置图形验证码；未设置时 mock 开发流程不变。Nginx 必须覆盖 `X-Real-IP` / `X-Forwarded-For`，不要把客户端自带的转发头原样传给 API。

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

## 手工开通 Plus

后台「概览」可按手机号开通，或：

```bash
curl -s -X POST https://tudoudou-ai.site/api/admin/plus \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","plan":"month"}'
```

包年把 `plan` 改为 `year`。续期从 `max(现在, 当前到期)` 起算 +30 / +365 天。
