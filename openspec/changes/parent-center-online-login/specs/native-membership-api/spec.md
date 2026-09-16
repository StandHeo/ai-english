## Purpose

让 Capacitor 原生 App 的家长会员与认证请求默认打到已部署的线上产品 API，不被家庭工作室里填过的死掉局域网地址拖死；浏览器本地开发仍走 Vite 同源代理。

## ADDED Requirements

### Requirement: 原生 App 会员请求默认线上产品 origin
未登录与已登录的家长会员请求（认证配置、图形验证码、邮箱发送/校验、会话、注销、账号删除、账单套餐与下单）MUST 使用产品 origin `https://tudoudou-ai.site`（无尾斜杠），除非调用方提供了**非私网**的覆盖地址。浏览器本地开发（非原生）在未配置公网覆盖时 MUST 继续使用空 base，以便 Vite 将 `/api` 代理到本机 API。系统 MUST NOT 把供应商 LLM/配图 Key 发到会员 origin；BYOK 直连厂商 HTTPS MUST 保持不变。

#### Scenario: 原生 App 无局域网覆盖
- **WHEN** 原生 App 未保存 API 覆盖地址，且构建环境未写入公网 `VITE_API_BASE`
- **THEN** 会员请求 URL 为 `https://tudoudou-ai.site/api/...`（例如 `/api/auth/email/send`、`/api/auth/config`、`/api/auth/captcha`）

#### Scenario: 私网存储地址不覆盖会员
- **WHEN** 家庭工作室设置里保存了 `http://192.168.x.x:8787`（或其它回环/私网 IPv4 地址）作为电脑 API
- **THEN** 家长登录与其它会员请求 MUST 仍打产品 origin，MUST NOT 使用该私网地址

#### Scenario: 浏览器开发走同源代理
- **WHEN** 开发者在浏览器运行 `npm run dev` 且未设置公网 API 覆盖
- **THEN** 会员请求 MUST 使用相对路径 `/api/...`，由 Vite 代理到本机 `localhost:8787`

#### Scenario: 公网 HTTPS 覆盖仍可用
- **WHEN** 存储或环境中的 API 地址是公网 HTTPS origin（非 localhost/私网）
- **THEN** 会员请求 MAY 使用该覆盖，以便预发或临时切换

#### Scenario: BYOK 不改走会员 origin
- **WHEN** 家长在本机填写了云厂商 Key 并生成家庭日记关卡或云端配图
- **THEN** 这些请求 MUST 仍直连对应厂商 HTTPS，MUST NOT 被改成发往会员 origin 代发
