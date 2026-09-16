## ADDED Requirements

### Requirement: 后台展示邮箱并支持按邮箱开通
`GET /api/admin/users`、会话/权益/订单列表在用户有邮箱时 MUST 包含邮箱（及掩码字段）。用户列表 MUST 同时保留手机号字段（可为空）。白名单表浏览 MUST 允许 `auth_codes`（验证码 hash 仍须截断）；若仍存在 `sms_codes` MAY 继续列入。运营控制台开通表单 MUST 能提交邮箱；有手机号时仍可按号开通。

#### Scenario: 邮箱用户出现在用户列表
- **WHEN** 已用 mock 邮箱登录创建用户，运营请求 `GET /api/admin/users`
- **THEN** 响应 `items` 中至少一条含可识别的该邮箱（全址或掩码）

#### Scenario: 后台可按邮箱开通
- **WHEN** 运营在控制台或 `POST /api/admin/plus` 提交有效邮箱与档位
- **THEN** 系统开通成功，用户列表/权益列表能对应该邮箱
