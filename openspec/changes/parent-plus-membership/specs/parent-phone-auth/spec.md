## Purpose

让家长在门禁之后用手机号短信登录，拿到可查询 Plus 状态的会话，并按商店要求注销账号；儿童游玩路径不出现登录。

## ADDED Requirements

### Requirement: 登录只出现在家长门禁之后
系统 MUST 仅在通过既有家长门禁后提供手机号登录、登出与账号注销入口。儿童游玩路径（首页主题包、关卡、家庭日历游玩）MUST NOT 展示登录表单、验证码输入或账号入口。

#### Scenario: 门禁后可见登录
- **WHEN** 用户通过家长算术门禁进入家长中心且尚未登录
- **THEN** 系统展示手机号短信登录，且不要求儿童路径先登录

#### Scenario: 儿童路径无登录 UI
- **WHEN** 儿童在首页选择官方主题包或进入关卡
- **THEN** 界面 MUST NOT 出现价格、登录、验证码或「开通会员」文案

### Requirement: 短信验证码登录
系统 MUST 提供 `POST /api/auth/sms/send` 与 `POST /api/auth/sms/verify`。发送接口接受 `phone`；校验通过后 MUST 创建或复用该手机号对应账号，并返回会话令牌。同一手机号 MUST 对应同一 `users` 记录，以便跨设备恢复 Plus。开发环境 MUST 支持短信 mock，生产环境 MUST 经腾讯云短信发送（配置齐全时）。

#### Scenario: 校验成功建立会话
- **WHEN** 家长提交有效手机号与未过期验证码
- **THEN** 系统返回会话令牌，后续请求可用该令牌调用需登录接口

#### Scenario: 错误或过期验证码
- **WHEN** 验证码错误或已过期
- **THEN** 系统拒绝登录且 MUST NOT 颁发令牌

#### Scenario: 开发 mock 不真发短信
- **WHEN** 短信提供方配置为 mock
- **THEN** 系统不调用腾讯云短信，仍可用文档/日志中的约定码完成校验

### Requirement: 登出使会话失效
系统 MUST 提供 `POST /api/auth/logout`。已认证请求登出后，该令牌 MUST 立即不可再用于需登录接口。

#### Scenario: 登出后 me 失败
- **WHEN** 家长携带有效令牌调用 `POST /api/auth/logout`，再请求 `GET /api/me`
- **THEN** `GET /api/me` MUST 以未认证失败（如 HTTP 401）

### Requirement: 已登录可读取自己
系统 MUST 提供 `GET /api/me`。未携带有效令牌时 MUST 拒绝。成功响应 MUST 包含 `plus`（是否在有效期内）与 `expiresAt`（无资格时可为 `null`）。

#### Scenario: 未登录读 me
- **WHEN** 请求 `GET /api/me` 且无有效令牌
- **THEN** 系统 MUST NOT 返回该家长的会员字段，并以未认证失败

#### Scenario: 已登录读 me
- **WHEN** 家长携带有效令牌请求 `GET /api/me`
- **THEN** 响应包含 `plus` 与 `expiresAt`

### Requirement: 账号注销
系统 MUST 提供已认证的 `POST /api/me/delete`。成功后 MUST 删除该手机号账号及服务端关联的权益、订单可识别信息与会话，使同一令牌与该手机号无法再视为已登录。服务端 MUST NOT 把本机日记或供应商 Key 当作云端备份删除（v1 这些数据本就不在服务端）。

#### Scenario: 注销后无法再用旧令牌
- **WHEN** 家长调用 `POST /api/me/delete` 成功
- **THEN** 随后 `GET /api/me` 以未认证失败；该手机号再次校验验证码视为新账号，MUST NOT 自动继承已删权益
