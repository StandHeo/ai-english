## 背景

`apps/api` 已有 SQLite 会员库（`001_init.sql`：`users` / `entitlements` / `orders` / `sms_codes` / `sessions`）和 `adminAuthorized`（Bearer 或 `x-admin-token`）。Nginx 只反代 `/api/` 与 `/health`。见 `proposal.md` 动机。

## 目标 / 非目标

**目标：** 零改 Nginx 即可打开后台；只读查询与现有 plus 开通共用鉴权；「在线」语义写清。

**非目标：** RuoYi / 多管理员、任意表编辑、改 schema / 短信 / 微信、分布式在线统计。

## 决策

### D1 — UI 挂在 `/api/admin/ui/`

Express `express.static` 服务 `apps/api/public/admin`。现有 Nginx `location /api/` 即可到达。文档可注明日后可加 `/admin/` 反代。不另起构建栈。

### D2 — 复用现有 `adminAuthorized`

所有 `GET /api/admin/*` JSON 走同一校验，未配置 503、错令牌 401。静态 UI 不鉴权。登录后 token 只放 `sessionStorage`。

### D3 — 「在线」= 未过期会话

`activeSessions` = `COUNT(*) FROM sessions WHERE expires_at > now`。UI/文档写明不是 WebSocket 在线。列表带 `expired` 标记；不返回明文 token（仅 `token_hash` 前缀可选）。

### D4 — 表浏览白名单

允许：`users`、`entitlements`、`orders`、`sessions`、`sms_codes`。表名校验后再 `SELECT`，禁止拼接任意 SQL。`sms_codes.code_hash` 只回前 8 位 + `…`。`limit` 默认 50、上限 100。

### D5 — 用户手机号

API 同时返回 `phone` 与 `phoneMasked`。UI 默认掩码，可切换全号。`sms_codes.phone` 同样掩码展示。

### D6 — 可选开通 Plus

概览或用户页可调已有 `POST /api/admin/plus`（手机号 + `month`/`year`）。不新增写接口。

## 风险

- **[ADMIN_TOKEN 进浏览器]** → 仅 `sessionStorage`、关页即清；文档强调勿分享 URL。
- **[静态 UI 无鉴权]** → JSON 仍全保护；页面不含数据。
- **[过期会话仍占表]** → 列表用 `expired` 区分；概览只计未过期。
- **[误当实时在线]** → 文案写清会话 TTL。
