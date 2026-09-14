## 1. 管理查询 API

- [x] 1.1 抽出 `requireAdmin`，实现 `GET /api/admin/stats`、`users`、`sessions`、`entitlements`、`orders`（分页 `limit`/`offset`）；无/错令牌 401 或未配置 503；用 `tsx --test` 覆盖 unauthorized 与 mock 短信用户后的 stats/users 形状
- [x] 1.2 实现 `GET /api/admin/tables` 与 `GET /api/admin/table/:name`（白名单五表，`sms_codes.code_hash` 截断）；非白名单 400；测试拒绝 `schema_migrations`

## 2. 静态后台 UI

- [x] 2.1 在 `apps/api/public/admin` 做中文 HTML+JS：登录写 `sessionStorage`，页签概览/用户/会话/会员/订单/表数据，默认掩码手机号，显示刷新时间与翻页；`createApp` 把目录挂到 `/api/admin/ui/`，`curl` 该路径返回 HTML

## 3. 文档与可选开通

- [x] 3.1 更新 `docs/lite-host.md` 与 README：写明 `https://tudoudou-ai.site/api/admin/ui/`（或等价路径）及 `ADMIN_TOKEN`；「在线」= 未过期会话。UI 可调用已有 `POST /api/admin/plus`
- [x] 3.2 跑 `npm run test:api`，相关用例通过
