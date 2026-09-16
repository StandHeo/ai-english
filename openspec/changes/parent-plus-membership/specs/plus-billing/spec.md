## Purpose

为 Plus 提供服务端订单账本：商户未就绪时按手机号手工开通，微信支付到位后验签并写入包月或包年到期时间。

## ADDED Requirements

### Requirement: 无商户时手工开通
当 `BILLING_PROVIDER=manual` 时，系统 MUST 允许受保护的开通方式把 Plus 授予指定手机号（账号不存在则创建 `users` 行），并按档位写入 `expiresAt`（包月 +30 天、包年 +365 天）。此时面向家长的下单流程 MUST NOT 发起真实微信收款。手工开通 MUST 写入 `entitlements`，并 MUST 留下可对账的开通记录（例如 `orders.provider=manual` 且已支付）。

#### Scenario: 按手机号授予包月
- **WHEN** 计费提供方为 manual，运维对某手机号授予包月 Plus
- **THEN** 该号登录后 `GET /api/me` 的 `plus` 为 true，`expiresAt` 约为开通时刻起 30 天（若原未过期则从 `max(现在, 原 expiresAt)` 起算）

#### Scenario: manual 模式不拉起微信支付
- **WHEN** `BILLING_PROVIDER=manual` 且家长在家长路径点击开通
- **THEN** 系统 MUST NOT 调用微信下单；可提示联系开通或显示尚未开放在线支付

### Requirement: 创建订单
系统 MUST 提供已认证的 `POST /api/billing/orders`，请求包含档位（如 `plan` 为 `month` 或 `year`）。微信模式 MUST 写入 `orders` 为待支付并返回拉起支付所需参数。未登录 MUST 拒绝下单。儿童路径 MUST NOT 暴露该下单入口。

#### Scenario: 已登录创建包年订单
- **WHEN** 家长已登录且计费提供方为微信，提交 `plan=year`
- **THEN** 系统创建 `orders` 记录并返回微信支付参数，订单处于待支付直到回调确认

#### Scenario: 未登录不能下单
- **WHEN** 无有效会话请求 `POST /api/billing/orders`
- **THEN** 系统拒绝创建订单

### Requirement: 微信回调验签后写入到期
系统 MUST 提供 `POST /api/billing/wechat/notify`。收到通知后 MUST 先校验签名，签名无效 MUST NOT 改权益。签名有效且支付成功时 MUST 将对应订单标为已支付，并按档位延长 Plus：包月 +30 天、包年 +365 天，起算点为 `max(现在, 当前 expiresAt)`。同一支付通知重复到达 MUST 不重复加时长（幂等）。

#### Scenario: 验签成功开通包月
- **WHEN** 微信通知签名有效、对应包月订单首次支付成功
- **THEN** 该用户 `entitlements` 更新，`GET /api/me` 显示 `plus` 为 true，到期时间增加 30 天

#### Scenario: 签名无效不改权益
- **WHEN** 回调签名校验失败
- **THEN** 系统 MUST NOT 把订单标为已支付，MUST NOT 延长 `expiresAt`

#### Scenario: 重复通知幂等
- **WHEN** 同一笔已处理成功的微信订单再次收到成功通知
- **THEN** 权益到期时间 MUST NOT 被再加一个周期

### Requirement: 本切片不做支付宝与 iOS IAP
本变更首期实现 MUST NOT 接入支付宝收款，MUST NOT 接入 Apple IAP / StoreKit。档位语义（包月 / 包年）MUST 保持一份会员资格，以便日后其他支付轨写入同一 `entitlements`。

#### Scenario: 无支付宝回调
- **WHEN** 本切片按 tasks 实现计费
- **THEN** 不存在可用的支付宝 notify 作为开通 Plus 的路径

### Requirement: 价格只在家长路径
包月 / 包年价格与开通文案 MUST 仅出现在家长门禁之后。金额数字以 `docs/monetization.md` 建议起步价为准（¥18 / 月、¥148 / 年），上架前可改数字，MUST NOT 在儿童路径展示。Plus 文案 MUST 说明不含第三方模型调用费。

#### Scenario: 家长页可见档位
- **WHEN** 家长通过门禁并进入开通流程
- **THEN** 登录前可以看到价格的简短说明；登录后可以看到包月与包年档位（微信模式或 manual 说明），且文案表明 Plus 不含模型 token 费。登录区 MUST NOT 把包月/包年做成发送验证码之前的主操作按钮

#### Scenario: 儿童页不可见档位
- **WHEN** 儿童在首页或关卡内
- **THEN** MUST NOT 看到 ¥18、¥148 或支付按钮
