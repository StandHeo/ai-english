## ADDED Requirements

### Requirement: 手工开通支持邮箱
当运维调用受保护的 `POST /api/admin/plus` 时，系统 MUST 接受 `email`（规范化后查找或创建用户）并按档位授予 Plus。若请求同时或仅提供有效 `phone`，系统 MUST 仍可按手机号开通（用于既有仅手机号行）。`email` 与 `phone` 都缺失或都无效时 MUST 拒绝。成功响应 MUST 回显所用标识（掩码邮箱和/或掩码手机号）以及 `plus` 与 `expiresAt`。

#### Scenario: 按邮箱授予包月
- **WHEN** 运维对某邮箱授予包月 Plus
- **THEN** 该邮箱登录后 `GET /api/me` 的 `plus` 为 true，`expiresAt` 约为开通时刻起 30 天（若原未过期则从 `max(现在, 原 expiresAt)` 起算）

#### Scenario: 仍可按手机号开通旧行
- **WHEN** 运维对某已存在的仅手机号用户按 `phone` 授予档位
- **THEN** 该手机号登录后 Plus 生效，MUST NOT 要求该行先有邮箱
