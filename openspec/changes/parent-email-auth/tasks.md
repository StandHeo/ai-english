## 1. Schema 与用户查找

- [ ] 1.1 增加 `002_email_auth.sql`：`users` 加可空唯一 `email`、`phone` 改为可空；新建 `auth_codes` 并迁出 `sms_codes`；`db.ts` 注册该 migration，测试能读到新列/新表且无 llm key 列
- [ ] 1.2 扩展 `UserRow` 与 `getOrCreateUserByEmail` / `findUserByEmail`；短信路径的 `getOrCreateUser` 允许 `email` 为空；注销删除该用户 `auth_codes`；既有按号查找测试仍通过

## 2. 邮箱发信与验证码表

- [ ] 2.1 短信读写改为 `auth_codes`（`channel=sms`）；`/api/auth/sms/*` 行为与错误码不变，mock 短信测试仍绿
- [ ] 2.2 实现 `EMAIL_PROVIDER=mock|smtp`：mock 打日志 + `MOCK_EMAIL_CODE`；smtp 用 nodemailer；缺配置明确失败。实现 `POST /api/auth/email/send|verify`（规范化邮箱、按邮箱 60s 间隔）
- [ ] 2.3 邮箱 send/verify 接上现有 IP 限流与统一 captcha（`AUTH_CAPTCHA` 或 `SMS_CAPTCHA`）；`GET /api/auth/config` 返回 `{ captcha, authChannel }`，默认 `authChannel=email`；`GET /api/auth/sms/config` 返回同一 JSON

## 3. me、开通、后台

- [ ] 3.1 `GET /api/me` 返回掩码 `email` 与可选 `phone`；`POST /api/admin/plus` 接受 `email` 和/或 `phone`；API 测试覆盖邮箱登录、me、按邮箱开通、按号开通旧行
- [ ] 3.2 admin 列表带 `email`/`emailMasked`；白名单含 `auth_codes`；控制台用户表与开通表单支持邮箱；相关 admin 测试更新并通过

## 4. 家长 UI 与客户端

- [ ] 4.1 `membership.ts` 增加邮箱 send/verify 与 config；`ParentPage` 改为邮箱字段与中文文案，儿童路径测试仍禁止登录/价格
- [ ] 4.2 更新 `apps/api/.env.example`、`docs/lite-host.md`、`docs/monetization.md` 中手机号主路径表述，补 QQ/域名 SMTP 说明

## 5. 测试

- [ ] 5.1 补充邮箱 mock 登录、SMTP 未配置、限流、captcha、schema、phone-only 行仍可短信登录的 API 测试
- [ ] 5.2 跑 `npm run test:api` 与 `npm run test:web` 全绿
