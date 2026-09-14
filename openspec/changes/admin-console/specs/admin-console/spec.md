## Purpose

运营用现有 `ADMIN_TOKEN` 打开 Web 后台，查看会员统计、用户、会话、权益、订单及白名单表数据，无需 SSH 或 sqlite3。

## ADDED Requirements

### Requirement: 管理 JSON 接口必须用 ADMIN_TOKEN
系统 MUST 对所有 `/api/admin/*` JSON 接口使用与 `POST /api/admin/plus` 相同的 `ADMIN_TOKEN` 校验（`Authorization: Bearer` 或 `x-admin-token`）。缺少、错误或未配置的令牌 MUST NOT 返回会员数据。未配置 `ADMIN_TOKEN` 时 MUST 返回 HTTP 503 `{ error: 'admin_not_configured' }`；令牌错误 MUST 返回 HTTP 401 `{ error: 'unauthorized' }`。静态后台页面（`/api/admin/ui/`）MAY 无需令牌即可加载，以便展示登录框。

#### Scenario: 无令牌查询统计
- **WHEN** 未带有效 `ADMIN_TOKEN` 请求 `GET /api/admin/stats`
- **THEN** 系统返回 HTTP 401 或 503，且响应 MUST NOT 包含用户数或会话明细

#### Scenario: 有效令牌可查询
- **WHEN** 请求带有与环境变量一致的 `ADMIN_TOKEN`
- **THEN** 系统返回 HTTP 200 及对应 JSON

### Requirement: 概览统计
`GET /api/admin/stats` MUST 返回至少：`users`（`users` 表行数）、`activeSessions`（`sessions.expires_at` 仍大于当前时间的行数）、`plusActive`（`entitlements.expires_at` 仍大于当前时间的行数）。MAY 包含 `ordersPaid`（`orders.status = 'paid'` 的行数）。`activeSessions` MUST 按会话过期时间计算，MUST NOT 声称是 WebSocket 或实时在线。

#### Scenario: 有注册用户与未过期会话
- **WHEN** 库中已有通过短信登录创建的用户及其未过期会话，运营用有效令牌请求 `GET /api/admin/stats`
- **THEN** 响应含数字字段 `users`、`activeSessions`、`plusActive`，且 `users` 至少为 1、`activeSessions` 至少为 1

### Requirement: 分页列出会员表
系统 MUST 提供分页只读列表（`limit` / `offset`，默认 `limit` 不超过 100）：
- `GET /api/admin/users`：用户 id、手机号、`created_at`；MUST 同时给出掩码手机号字段，全号仅给已鉴权运营
- `GET /api/admin/sessions`：会话的 `user_id`、`created_at`、`expires_at`，以及是否已过期的标记；MUST NOT 返回明文会话令牌
- `GET /api/admin/entitlements`：`user_id`、`expires_at`、`source`、`updated_at`
- `GET /api/admin/orders`：订单 id、`user_id`、`provider`、`plan`、`amount_fen`、`status`、`created_at`、`paid_at`

#### Scenario: 列出刚登录的用户
- **WHEN** 已用 mock 短信创建用户，运营请求 `GET /api/admin/users`
- **THEN** 响应含 `items` 数组与 `total`，且至少一条记录的手机号可识别为该用户（全号或掩码）

#### Scenario: 会话标明过期
- **WHEN** 运营请求 `GET /api/admin/sessions`
- **THEN** 每条记录含 `expired`（或等价布尔字段），未过期会话为 false、已过期为 true

### Requirement: 白名单表浏览
系统 MUST 提供白名单内 SQLite 表浏览：`GET /api/admin/tables` 列出允许的表名；`GET /api/admin/table/:name` 分页返回该表行。允许的表 MUST 仅为 `users`、`entitlements`、`orders`、`sessions`、`sms_codes`。不在白名单的表名 MUST 返回 HTTP 400 且 MUST NOT 执行任意 SQL。`sms_codes` 的 `code_hash` MUST 掩码或截断，MUST NOT 原样倾倒。系统 MUST NOT 通过这些接口返回环境密钥或 `ADMIN_TOKEN`。

#### Scenario: 拒绝非白名单表
- **WHEN** 运营请求 `GET /api/admin/table/schema_migrations` 或任意非白名单名称
- **THEN** 系统返回 HTTP 400，且 MUST NOT 返回该表行

#### Scenario: 可浏览 users
- **WHEN** 运营请求 `GET /api/admin/table/users`
- **THEN** 响应含列名与行数据（可分页）

### Requirement: 后台页面入口
系统 MUST 在 `/api/admin/ui/` 提供可用的运营控制台（中文标签）。未登录时 MUST 要求输入 `ADMIN_TOKEN` 并保存到 `sessionStorage`。登录后 MUST 能查看：概览、用户、会话（在线）、会员、订单、表数据；MUST 显示最近刷新时间并支持简单翻页。用户列表默认掩码手机号，运营 MAY 展开看全号。文档 MUST 写明该 URL（例如 `https://tudoudou-ai.site/api/admin/ui/`）以及必须使用 `ADMIN_TOKEN`。`POST /api/admin/plus` 行为 MUST 保持不变。

#### Scenario: 打开后台需令牌
- **WHEN** 运营打开 `/api/admin/ui/` 且 `sessionStorage` 中无令牌
- **THEN** 页面展示登录输入，MUST NOT 在无令牌时调用并展示会员明细

#### Scenario: 部署文档写明路径
- **WHEN** 运营阅读 `docs/lite-host.md`
- **THEN** 文档给出 `/api/admin/ui/` 入口及 `ADMIN_TOKEN` 要求
