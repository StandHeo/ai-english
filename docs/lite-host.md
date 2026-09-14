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
}
location /health {
  proxy_pass http://127.0.0.1:8787;
}
```

Web 静态资源另配站点根；开发期 Vite 仍把 `/api` 代理到 `:8787`。

## 备份

备份 `*.db` 以及同目录 `-wal` / `-shm`。v1 单进程写，不要多实例同时写同一文件。

## 手工开通 Plus

```bash
curl -s -X POST https://example.com/api/admin/plus \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","plan":"month"}'
```

包年把 `plan` 改为 `year`。续期从 `max(现在, 当前到期)` 起算 +30 / +365 天。
