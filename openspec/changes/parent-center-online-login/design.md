## 背景

见 `proposal.md`。核实结论（可推翻猜想中的细节，但主因成立）：

- `getApiBase()` = `localStorage['ai-english-api-base-v1']` || `VITE_API_BASE`。家庭工作室设置把电脑局域网写进同一把钥匙。
- `membership.ts` 用 `fetch(apiUrl(path))`。Capacitor 开启 `CapacitorHttp.enabled`，原生会拦截 fetch，Log 里就是 `CapacitorHttp fetch http://192.168.2.104:8787/api/auth/email/send`。
- 仅写入构建期 `VITE_API_BASE=https://tudoudou-ai.site` **不够**：只要用户填过局域网，stored 仍优先，家长登录继续打死掉的 8787。
- `ParentPage` 的 `captchaOn` 初始为 `false`，只在 `fetchAuthConfig()` 成功且 `captcha: true` 后渲染；API 连不上时图形验证码整块消失。
- 未登录区把 SES/SMTP 说明、价格卡、「支付尚未开放」和登录表单堆在一起。

家庭工作室局域网仍要留给 ASR / 无 Key 时代理；BYOK 走 `cloudHttp` 直连厂商，不得改道会员 origin。

## 目标 / 非目标

**目标：**

- 会员请求与家庭/关卡 `getApiBase()` 分轨。
- 未登录 UI 收窄；验证码发送前可见；发送后倒计时与人话错误。
- Plus 与登录分离；支付未开放时无假支付按钮。

**非目标：** 改 `apps/api` 计费或发信；把密钥写入仓库；把家庭 ASR 强制改打线上；改儿童路径。

## 决策

### D1 — 会员 origin 与家庭 API 分轨

- **选择：** 产品常量 `PRODUCT_MEMBERSHIP_ORIGIN = 'https://tudoudou-ai.site'`。抽出纯函数 `resolveMembershipApiBase({ stored, envBase, native })`：
  1. stored 若为非私网非回环 origin，用之（预发 HTTPS 覆盖）。
  2. 否则 `envBase` 若为非私网非回环，用之。
  3. 原生：回落产品 origin。
  4. 浏览器：回落 `envBase` 或 `''`（Vite 代理）。
- 私网判定：hostname 为 `localhost` / `127.0.0.1` / `::1` / `*.local`，或 IPv4 `10/8`、`172.16/12`、`192.168/16`、`169.254/16`。
- `membershipFetch` 改用 `membershipApiUrl`，不再走 `getApiBase()`。
- `getApiBase()` / 家庭工作室「电脑 API 地址」行为不变。
- **原因：** 只改 `VITE_API_BASE` 无法挡住 stored 局域网；把会员绑死在产品 origin 最清晰。家庭 ASR 仍可填 192.168。
- **备选否决：** 仅构建写入 `VITE_API_BASE`（stored 仍优先）；把私网 stored 当过期并改写 `getApiBase()`（会误伤家庭联调）。

### D2 — 图形验证码乐观展示

- **选择：** 未登录进入账号区即展示验证码区域并请求 `/api/auth/captcha`。`captchaOn` 默认 `true`；仅 `GET /api/auth/config` **成功**且 `captcha === false` 时隐藏。点图片刷新。加载失败用可点占位，不整块卸载。
- **原因：** 生产已开 captcha；config 失败时隐藏会让家长以为没有这功能。
- **备选否决：** 继续等 config 成功再渲染。

### D3 — 未登录只留登录；Plus 登录后折叠

- **选择：** 未登录表单：邮箱、图形验证码、发送、六位码、登录。发送成功：中文「验证码已发到邮箱」、焦点进验证码框、约 60s 倒计时重发。连接类错误映射为人话。Plus 状态 / 价格说明 / 管理员开通放登录后 `<details>`（支付未开放时无开通按钮）。删除家长可见 SES/SMTP 文案（运维说明留在 `docs/`）。
- **原因：** 真机截图已是信息墙；包月包年按钮会被当成能付。
- **备选否决：** 价格卡继续和登录同屏、仅改 CSS。

### D4 — 错误映射在客户端

- **选择：** 识别 `Failed to connect` / `ConnectException` / `ECONNREFUSED` / 含 `192.168.` 或 `:8787` 的连接失败，显示「连不上会员服务，请检查网络后重试」。`email_ses_*` 等对家长改为「验证码暂时发不出去，请稍后重试」。
- **原因：** 不改后端错误码也能修真机文案。

## 风险

- **[开发者想用真机打本机会员 API]** → 浏览器 `npm run dev` 仍走代理；真机测会员请打线上。家庭局域网字段明确写「不影响家长登录」。
- **[预发 HTTPS 被当成私网丢掉]** → 仅过滤回环/RFC1918/`*.local`；公网 HTTPS stored/env 仍覆盖。
- **[生产 captcha 关闭时仍闪一下]** → config 成功且 `captcha:false` 后隐藏；开发 mock 可关。

## 迁移

已装 App 若 localStorage 里有 192.168：升级后家长登录自动打线上，无需用户清设置。家庭日记局域网字段可保留。回滚：还原会员 URL 解析与 ParentPage。
