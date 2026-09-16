## ADDED Requirements

### Requirement: 短信登录路由保留但不是产品默认
系统 MUST 继续提供 `POST /api/auth/sms/send` 与 `POST /api/auth/sms/verify`，在 `SMS_PROVIDER=mock|tencent` 时按既有语义工作。家长中心默认 UI MUST NOT 依赖短信作为主路径。仅有手机号、邮箱为空的既有 `users` 行 MUST 仍可通过短信校验登录到同一记录。短信登录创建的新用户 MUST 写入 `phone`，`email` MAY 为空。系统 MUST NOT 把不同邮箱与手机号自动合并为同一账号。

#### Scenario: 既有手机号行仍可短信登录
- **WHEN** 库中存在仅有手机号、邮箱为空的用户，并提交该号有效短信验证码
- **THEN** 系统复用该 `users` 行并颁发令牌，MUST NOT 另建账号

#### Scenario: 邮箱账号与手机号账号不自动合并
- **WHEN** 家长用某邮箱登录（该邮箱尚无用户），库中另有仅手机号用户
- **THEN** 系统为该邮箱创建新用户，MUST NOT 把 Plus 从手机号行转到邮箱行
