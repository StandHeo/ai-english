## 为什么

会员账本已在 `apps/api` 的 SQLite 里（用户、会话、权益、订单），但运营只能 SSH 进主机用 `sqlite3` 查看。需要一个最小 Web 后台：用现有 `ADMIN_TOKEN` 登录后看到人数、有效会话与各表内容，不必引入 RuoYi / Java。

## 变更内容

- 在 Express 增加只读管理查询：`GET /api/admin/stats`、`users`、`sessions`、`entitlements`、`orders`，以及白名单表浏览（`users` / `entitlements` / `orders` / `sessions` / `sms_codes`）。
- 全部管理 JSON 接口用现有 Bearer / `x-admin-token` 的 `ADMIN_TOKEN` 鉴权；未配置或错误令牌返回 401（未配置时与现有 plus 开通一致可为 503）。
- 在 `/api/admin/ui/` 提供静态 HTML+JS 控制台（零改 Nginx：现有只反代 `/api/` 与 `/health`）。登录页把 token 存 `sessionStorage`。
- 概览「在线」= `sessions.expires_at > now`，文档标明这不是 WebSocket 在线。
- UI 默认掩码手机号，运营可展开看全号。v1 只读，保留已有 `POST /api/admin/plus`，控制台可选用它开通 Plus。
- 更新 `docs/lite-host.md` 与 README：后台 URL（如 `https://tudoudou-ai.site/api/admin/ui/`）及 `ADMIN_TOKEN` 要求。
- 不引入多管理员 / RBAC、不改任意行、不迁 RuoYi、不改微信。

## Capabilities

### New Capabilities

- `admin-console`：运营用 `ADMIN_TOKEN` 打开 Web 后台，查看会员统计与白名单表数据。

### Modified Capabilities

- （无。`POST /api/admin/plus` 行为不变；本变更加只读查询与静态 UI。）

## Impact

- `apps/api`：管理查询路由、静态文件 `public/admin`、API 测试
- `docs/lite-host.md`、`README.md`：后台入口与令牌说明
- 不改儿童/家长 Web 路径、不改 schema / 短信 / 微信支付
