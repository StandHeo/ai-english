## 为什么

真机 Capacitor App 在「家长账号与 Plus」发送邮箱验证码时打到家庭工作室里填过的局域网 `http://192.168.x.x:8787`，电脑 API 未开就失败；图形验证码又要等 `GET /api/auth/config` 成功才渲染，连不上时界面像没有验证码。同时未登录区把 SES/SMTP 技术说明、包月包年价格、支付未开放提示和登录表单堆在一起，窄屏无法用。线上会员 API 已部署在 `https://tudoudou-ai.site`。

## 变更内容

- 原生 App 的会员/登录/验证码请求默认走产品 origin `https://tudoudou-ai.site`（无尾斜杠）。浏览器 `npm run dev` 仍可空 base + Vite 代理 `localhost:8787`。
- 家庭工作室「局域网 API」继续只服务电脑联调（ASR 等）与无 Key 时代理；**私网/回环地址不得覆盖会员请求**。公网 HTTPS 覆盖仍可用于预发。不改 BYOK 直连厂商 HTTPS。
- 未登录家长账号区只留：邮箱、图形验证码（点图刷新）、发送验证码、六位验证码、登录。删除面向家长的 SES/SMTP/个人实名技术文案。
- Plus 价格与「请管理员开通」与登录表单分离：登录后或折叠「Plus」小区展示。在线支付未开放时，包月/包年不得表现为可付按钮。
- 图形验证码在发送前就要看见（config 失败也不得整块隐藏）。发送成功：倒计时重发、提示已发到邮箱、焦点进验证码框；连接失败用人话，不展示 OkHttp `Failed to connect`。
- **非目标：** 改后端计费/发信、把密钥写入仓库、改儿童路径、改 BYOK 直连。

## 能力

### 新增能力

- `native-membership-api`：原生 App 会员与认证请求默认打线上产品 API；私网存储/环境地址不拖死家长登录。
- `parent-login-ui`：未登录家长账号区精简表单、图形验证码可见、发送后成功/倒计时状态；Plus 与登录分离。

### 修改的能力

- （无独立主规格。既有 `parent-email-auth` / `plus-billing` 的产品语义不变：仍是邮箱验证码认 Plus、手工开通、支付未开放。）

## 影响

- `apps/web`：`api/base.ts` 会员 base 解析；`api/membership.ts` 走会员 origin；`ParentPage` + `parent.css`；家庭工作室设置文案；相关测试
- `docs/android-phone-guide.md`（及必要时 `docs/tech-architecture.md`）：写明家长登录默认线上、局域网只覆盖家庭联调
- 不改 `apps/api` 计费与发信
