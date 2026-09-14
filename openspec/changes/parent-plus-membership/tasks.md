## 1. SQLite schema 与 migrations（`apps/api`）

- [ ] 1.1 增加 SQLite 连接（WAL）与 `DATABASE_PATH`（或 `DATA_DIR`），进程启动可打开同一文件
- [ ] 1.2 编写顺序 migrations：`users`、`entitlements`、`orders`，可选 `sms_codes` 与会话表；表结构可用查询或测试读到
- [ ] 1.3 `.env.example` 注明 `DATABASE_PATH`、`SMS_PROVIDER`、`BILLING_PROVIDER`；确认无 llm key 列、无 MySQL 依赖

## 2. 手机号登录与 `GET /api/me`（短信 mock）

- [ ] 2.1 实现 `POST /api/auth/sms/send`（`SMS_PROVIDER=mock` 不调腾讯云，验证码可从日志/约定码取得）并做按 `phone` 限流
- [ ] 2.2 实现 `POST /api/auth/sms/verify`：校验成功创建/复用 `users` 行并颁发 Bearer token；错误或过期码不发令牌
- [ ] 2.3 实现 `GET /api/me`（需登录，返回 `plus` 与 `expiresAt`）与 `POST /api/auth/logout`（令牌立即失效）
- [ ] 2.4 用 API 测试覆盖：mock 登录成功 / 错码失败 / 无令牌 401 / 登出后再请求 me

## 3. 家长页最小登录（儿童路径不动）

- [ ] 3.1 仅在 `ParentPage` 算术门禁之后增加手机号验证码登录 / 登出；会话存本机
- [ ] 3.2 确认儿童首页、关卡、官方包地图无登录表单、无验证码、无价格文案

## 4. 工作室按 `/api/me` 的 Plus 门禁

- [ ] 4.1 家长中心「家庭日记」入口与 `FamilyStudioPage`：`plus !== true` 时锁定生成并在家长路径提示开通
- [ ] 4.2 确认官方主题包未登录也可进；本机已有家庭日历关仍可玩；不把 Key 上传服务端
- [ ] 4.3 开通/价格文案仅家长路径，并写明 Plus 不含第三方模型费

## 5. 生产腾讯云短信

- [ ] 5.1 `SMS_PROVIDER=tencent` 时走腾讯云短信发送；缺签名/密钥时失败明确，不影响 mock
- [ ] 5.2 文档或 `.env.example` 列出腾讯云短信相关 env；本机默认仍 mock

## 6. 手工开通 Plus（`BILLING_PROVIDER=manual`）

- [ ] 6.1 受保护开通（`ADMIN_TOKEN` 接口或脚本）：按手机号授予 `month`/`year`，写 `entitlements` 与可对账的 `orders`（`provider=manual`）
- [ ] 6.2 该号登录后 `GET /api/me` 显示 `plus=true` 且 `expiresAt` 为 +30d / +365d（续期从 `max(now, 原到期)` 起算）
- [ ] 6.3 manual 模式下家长开通入口 MUST NOT 拉起微信收款

## 7. 微信下单与回调（可后置）

- [ ] 7.1 `BILLING_PROVIDER=wechat` 时实现已登录 `POST /api/billing/orders`（`plan=month|year`），写入待支付 `orders` 并返回拉起参数
- [ ] 7.2 实现 `POST /api/billing/wechat/notify`：先验签；成功则订单 paid 并按 D5 延长权益；重复通知幂等
- [ ] 7.3 测试：签名失败不改权益；包月 +30d / 包年 +365d；未登录下单拒绝。本切片不接支付宝与 iOS IAP

## 8. 账号注销

- [ ] 8.1 实现已认证 `POST /api/me/delete`：删除 `users`、权益、订单可识别信息与会话
- [ ] 8.2 家长页提供注销入口（门禁后）；注销后旧令牌 401，同一手机号再注册不继承旧 Plus
- [ ] 8.3 确认注销不把本机日记 / 供应商 Key 当作云端备份来删

## 9. 轻量主机部署草图

- [ ] 9.1 如需要，在 `docs/` 增加短片段：Ubuntu 轻量、Nginx `:443` → `127.0.0.1:8787`、pm2、SQLite 文件与 WAL 备份；域名/证书可后补

## 10. 测试与回归

- [ ] 10.1 API：schema、mock 短信、me、manual 开通、注销；微信回调用 fixture 验签（无商户也可跑失败/幂等用例）
- [ ] 10.2 确认 `/api/asr`、`/api/match`、`/api/tts`、`/api/family/*` 既有测试仍通过，职责未替换
- [ ] 10.3 跑 `npm run test:api`（及必要的 web 检查）后提交实现
