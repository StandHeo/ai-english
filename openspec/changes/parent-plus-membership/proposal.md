## 为什么

要在国内商店上架，必须能认同一份家长账号上的 **Plus**、提供恢复购买与**账号注销**；仓库现在没有账号、没有会员资格、也没有收款。商业边界已写在 `docs/monetization.md`（纯 A / BYOK、官方主题包全免费、Plus 只解锁家庭日记 / 每日关卡工作室），本变更把它落成**会员切片的工程规格**，不再重开产品决策。

## 变更内容

- 家长门禁之后：手机号短信登录 / 登出；`GET /api/me` 返回 `plus` 与 `expiresAt`。儿童路径不出现价格、不出现登录 UI。
- Plus **只**解锁家庭日记 / 每日关卡工作室；官方 / 系统主题包全部保持免费。工作室入口按 `/api/me` 的 Plus 状态门禁。
- 生产 App 日记生成继续 **BYOK**（家长本机 Key 直连供应商）。v1 服务端 MUST NOT 存储 Agnes / DeepSeek / 通义 Key。既有 `/api/asr`、`/api/match`、`/api/tts`、`/api/family/*` 职责不变。
- 账本与部署：单机腾讯云轻量（成都、Ubuntu）上 **SQLite + WAL**；Nginx `:443` → Express `apps/api` `:8787`。收款 **微信优先**，支付宝后置；商户未就绪时 `BILLING_PROVIDER=manual`（按手机号开通 Plus）。商店要求的账号删除一并纳入。
- **非目标：** 托管 LLM Key、MySQL、本切片首期 iOS IAP / 支付宝、云端进度同步、改官方 pack、把日记内容存到服务端。包名 / 商店展示名改名属 P2，不在本变更。

## 能力

### 新增能力

- `parent-phone-auth`：家长门禁后的手机号短信登录、会话、`GET /api/me` 鉴权与账号注销；儿童路径无登录。
- `plus-entitlement`：服务端一份 Plus 资格；只挡工作室，不挡官方主题包；权益与 BYOK Key 分离。
- `plus-billing`：订单账本；无商户时手工开通；微信下单与回调写入到期时间（包月 +30d / 包年 +365d）。

### 修改的能力

- （无独立主规格文件。工作室锁定 / 家长登录落在本变更新增能力；不改官方 pack 与关卡口语 API 的需求。）

## 影响

- `apps/api`：SQLite schema / migrations；`/api/auth/*`、`GET /api/me`、`POST /api/me/delete`、`/api/billing/*`。不替换现有 ASR / match / TTS / family 路由。
- `apps/web`：家长中心最小登录与 Plus 状态；工作室入口按 Plus 锁定。不改儿童首页 / 关卡游玩路径。
- 部署：轻量主机 Nginx + HTTPS（域名后补）+ pm2 草图，需要时可写短文档片段。
- 商业规则仍以 `docs/monetization.md` 为准；本变更只覆盖会员资格工程切片。
