## Purpose

用服务端一份 Plus 资格解锁家庭日记 / 每日关卡工作室，官方主题包保持全免费，并把会员资格与家长本机 LLM Key 分开。

## ADDED Requirements

### Requirement: 官方与系统主题包全部免费
系统 MUST 让首页全部官方 / 系统主题包与关卡在无 Plus、未登录时仍可进入。Plus MUST NOT 作为官方包解锁条件。

#### Scenario: 未登录也能玩官方包
- **WHEN** 儿童未登录且账号无 Plus，从首页点开任一官方主题包
- **THEN** 可以进入该包关卡游玩，MUST NOT 被要求开通 Plus

### Requirement: Plus 只解锁工作室
Plus 有效时，系统 MUST 允许家长使用家庭日记 / 每日关卡工作室。Plus 无效时，该工作室入口 MUST 锁定（可引导开通），MUST NOT 因此锁定官方主题包。Plus MUST NOT 包含托管 AI 算力或代付第三方模型费用。

#### Scenario: 无 Plus 锁定工作室
- **WHEN** 家长已过门禁且 `GET /api/me` 显示 `plus` 为 false（含未登录视为无 Plus）
- **THEN** 家庭日记 / 每日关卡工作室不可用于生成新关，并在家长路径提示开通；儿童首页官方包仍可进

#### Scenario: 有 Plus 解锁工作室
- **WHEN** `GET /api/me` 的 `plus` 为 true 且 `expiresAt` 仍在有效期内
- **THEN** 家长可以使用家庭日记 / 每日关卡工作室（生成仍走本机 BYOK，见下列要求）

#### Scenario: 过期后重新锁定
- **WHEN** 先前 Plus 的 `expiresAt` 已过
- **THEN** `plus` MUST 为 false，工作室再次锁定，官方包仍免费

### Requirement: 权益以 /api/me 为准
客户端判断工作室是否解锁 MUST 使用 `GET /api/me` 返回的 `plus` 与 `expiresAt`，MUST NOT 仅凭本机开关或解锁码作为 v1 上架路径的权威来源。儿童路径 MUST NOT 展示价格或订阅档位。

#### Scenario: 工作室按 me 门禁
- **WHEN** 家长打开家庭日记工作室
- **THEN** 系统按最近一次成功的 `GET /api/me`（或等价鉴权查询）决定解锁或锁定

#### Scenario: 儿童路径无价格
- **WHEN** 儿童在主题包地图或关卡内游玩
- **THEN** 界面 MUST NOT 出现 ¥ 价格、包月/包年或支付按钮

### Requirement: 日记生成保持 BYOK
生产 App 的日记 / 工作室生成 MUST 使用家长提供、保存在本机的 LLM Key。v1 服务端 MUST NOT 存储 Agnes、DeepSeek 或通义 Key 作为共享托管密钥。会员资格服务 MUST NOT 把供应商 Key 当作 Plus 的一部分下发。

#### Scenario: Plus 不含云 Key
- **WHEN** 家长开通 Plus 但本机未填写 Agnes / DeepSeek / 通义 Key
- **THEN** 工作室可按 Plus 解锁，生成仍要求家长自备 Key；服务端 MUST NOT 用一份公司共享 Key 代发日记生成

### Requirement: 既有 API 职责不变
`POST /api/asr`、`POST /api/match`、`POST /api/tts` 以及现有 `/api/family/*` 生成与配图代理 MUST 保持当前职责，本能力 MUST NOT 用会员资格服务替换它们。

#### Scenario: 关卡口语不走会员账本
- **WHEN** 儿童在官方关卡中进行 ASR / 匹配 / TTS
- **THEN** 请求仍走既有 `/api/asr`、`/api/match`、`/api/tts`（或客户端既有降级），MUST NOT 要求 Plus 令牌才能开口

### Requirement: 本机已有家庭关可继续玩
家庭关卡内容 v1 MUST 仍只存在本机。Plus 过期 MUST NOT 删除本机已生成关卡。儿童从家庭日历打开本机已有日期的关卡 MUST 仍可游玩；新建 / 再生成 MUST 受工作室 Plus 门禁约束。

#### Scenario: 过期不删本机关
- **WHEN** 某日家庭关卡已在本机且 Plus 随后过期
- **THEN** 该日关卡文件仍在本机；家长再生成 MUST 被工作室锁定拦截
