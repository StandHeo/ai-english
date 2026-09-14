## 背景

见 `proposal.md`。当前 `apps/api` 是无状态 Express（`:8787`），无账号表；`apps/web` 家长中心只有算术门禁，家庭日记 Key 在本机。商业规则以 `docs/monetization.md` 为准。本设计只覆盖会员资格工程切片：手机号、Plus、账本、注销与单机部署。

## 目标 / 非目标

**目标：**

- 在 `apps/api` 用一份 SQLite 文件保存 `users` / `entitlements` / `orders`（可选 `sms_codes`）。
- 家长门禁后短信登录；`GET /api/me` 给出 `plus` + `expiresAt`；工作室按此门禁。
- 无商户走 `BILLING_PROVIDER=manual`；微信验签后写 +30d / +365d。
- 生产日记生成继续 App 直连 BYOK；不改 `/api/asr`、`/api/match`、`/api/tts`、`/api/family/*`。

**非目标：** 托管 LLM Key、MySQL、本切片 iOS IAP 与支付宝、云端进度 / 日记同步、改官方 pack、服务端存日记内容、商店展示名 / 包名工程改名（P2）。

## 决策

### D1 — SQLite + WAL，单机轻量

- **选择：** v1 数据在一台腾讯云轻量（成都、Ubuntu）上的 SQLite 文件，开启 WAL。路径由 `DATABASE_PATH`（或 `DATA_DIR`）指定。用顺序 migration SQL，不用 MySQL。
- **原因：** 会员行量小、单进程 Express 足够；运维面小于再开数据库实例。
- **备选：** MySQL / 云数据库（否决，非 v1）。

表（实现可加列，语义不变）：

| 表 | 关键列 |
|----|--------|
| `users` | `id`, `phone`（唯一）, `created_at` |
| `entitlements` | `user_id`, `plus`（或等价：以 `expiresAt > now` 推导）, `expires_at`, `source`（`manual` \| `wechat`）, `updated_at` |
| `orders` | `id`, `user_id`, `provider`, `plan`（`month` \| `year`）, `amount` 或分, `status`, `out_trade_no`（唯一）, `created_at`, `paid_at` |
| `sms_codes`（可选） | `phone`, `code_hash`, `expires_at`, `attempts` |
| 会话（若 D2 选不透明令牌） | `token_hash`, `user_id`, `expires_at` |

`plus` 对客户端以 `GET /api/me` 为准：`expiresAt` 未过期则为 true。

### D2 — 会话令牌：不透明令牌（可改为 JWT）

- **选择：** 服务端颁发不透明 token，SQLite 存 hash；客户端 `Authorization: Bearer`。`POST /api/auth/logout` 与 `POST /api/me/delete` 立刻删会话。
- **原因：** 必须能登出失效；单机 SQLite 做会话表成本低。
- **备选：** HMAC JWT（无状态，登出需 denylist，工作量相近）。二选一即可，API 对客户端仍是 Bearer token。TTL 精确值待决。

### D3 — 短信走腾讯云，开发 mock

- **选择：** `SMS_PROVIDER=mock|tencent`。mock 不调云，验证码写日志或固定开发码。生产用腾讯云短信。`POST /api/auth/sms/send` 按 `phone` 限流。
- **原因：** 本机与 CI 不能依赖真短信；上架前再接签名与模板。
- **备选：** 其他短信通道（非 v1）。

### D4 — entitlements 表

- **选择：** 一用户一行权益（或等价唯一约束），不把 Plus 散落在订单里当唯一真相。订单是账本；权益是「现在能不能进工作室」。
- **原因：** iPhone / Android 问的是同一份资格，不是哪条轨收的钱。日后支付宝 / IAP 只写同一行。
- **备选：** 只扫订单推算（对账可以，运行时门禁更脆）。

### D5 — 微信 notify 先验签再写到期

- **选择：** `POST /api/billing/wechat/notify` 验签失败不改库。成功且首次支付：订单 `paid`，`expires_at = max(now, 当前 expires_at) + 30d`（`plan=month`）或 `+ 365d`（`plan=year`）。重复通知幂等（按 `out_trade_no`）。
- **原因：** 防伪造回调；续费不截断剩余天数。
- **备选：** 每次从支付时刻重算（会吃掉剩余会员，否决）。

`POST /api/billing/orders` 需登录，body 含 `plan`。`BILLING_PROVIDER=wechat` 时返回拉起参数；`manual` 时不下真实单，运维按手机号开通（管理令牌或一次性脚本，密钥走 env，如 `ADMIN_TOKEN`）。

### D6 — 家庭生成保持 BYOK

- **选择：** 生产 App 日记生成继续家长本机 Key + 直连（既有 `agnes-family-direct`）。v1 **禁止**把 Agnes / DeepSeek / 通义 Key 存进 SQLite 或服务端 env 当共享托管密钥。浏览器联调用的 `/api/family/*` 代理保持原样，不改成会员算力池。
- **原因：** `docs/monetization.md` 已锁纯 A；Plus 卖工作室解锁，不卖 token。
- **备选：** 方案 B 托管 Key（后期，不在本 change）。

### D7 — Nginx + HTTPS，域名后补

- **选择：** 部署草图：主机 Nginx 监听 `:443`（有证书后）反代 `127.0.0.1:8787`；Express + SQLite 文件 + WAL；进程用 pm2（或等价）。域名与证书可后补；未上 TLS 前不要把生产短信/支付密钥打到公网明文。
- **原因：** 单机足够；支付/短信回调需要日后公网 HTTPS。
- **备选：** 直接暴露 `:8787`（仅内测）。

### API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/sms/send` | body: `phone` |
| POST | `/api/auth/sms/verify` | body: `phone`, `code` → token |
| POST | `/api/auth/logout` | 需登录，令牌失效 |
| GET | `/api/me` | 需登录 → `plus`, `expiresAt` |
| POST | `/api/billing/orders` | 需登录，body: `plan` |
| POST | `/api/billing/wechat/notify` | 微信回调，验签 |
| POST | `/api/me/delete` | 需登录，删账号与服务端关联数据 |

既有 `/api/asr`、`/api/match`、`/api/tts`、`/api/family/*`、`GET /health` 不变。

### 客户端落点

- 登录 / 价格 / 开通：只在 `ParentPage`（门禁后），最小 UI。
- 工作室：`FamilyStudioPage`（及家长中心入口）读 `/api/me` 的 `plus`。
- 儿童 `Home` / `LevelPage` / 官方包地图：不改登录与价格。

## 风险

- **[短信签名主体未定]** → 先 mock；生产模板等资质（见待决）。
- **[微信支付商户未就绪]** → 默认 `BILLING_PROVIDER=manual`，微信任务可后置。
- **[SQLite 单点]** → v1 接受；备份 `*.db` 与 `-wal`；不做多实例写。
- **[手机号属个人信息]** → 验证码存 hash、限流、注销删库；不把日记同步上去。
- **[门禁被儿童绕过]** → 价格与登录仍只放家长页；儿童路径零价格。
- **[误把 Key 写入服务端]** → 实现与 code review 对照 D6；表结构不含 llm key 列。

## 待决

- 腾讯云短信签名主体：公司实体 vs 个体户（挡生产 `SMS_PROVIDER=tencent`，不挡 mock 与 schema）。
- 会话令牌 TTL 精确值（实现时写入 env 默认，如数天到数周；不改 API 形态）。
