## 1. API 限流与验证码

- [x] 1.1 实现进程内滑动窗口 IP 限流（send 必开、verify 轻量、可选日限额）与客户端 IP 解析；`createApp` 按 `TRUST_PROXY` 设置 Express trust proxy
- [x] 1.2 实现可选 SVG 数字验证码：`GET /api/auth/captcha`、`GET /api/auth/sms/config`，`SMS_CAPTCHA=on` 时发送接口校验
- [x] 1.3 在 `POST /api/auth/sms/send` 与 `/verify` 接上限流/验证码；保持 mock 短信与按号限流

## 2. 家长 UI

- [x] 2.1 membership 客户端增加 config/captcha/send 字段；`ParentPage` 按配置或探测展示验证码，并提示 IP 限流

## 3. 测试与文档

- [ ] 3.1 补充 mock 短信、IP 超限、验证码开关测试；更新 `.env.example` 与 `docs/lite-host.md`
- [ ] 3.2 跑相关测试
