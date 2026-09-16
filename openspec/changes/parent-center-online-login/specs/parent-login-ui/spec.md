## Purpose

让家长在门禁之后用窄屏也能完成邮箱验证码登录：只看到必要字段和图形验证码，发送后有清晰成功与倒计时状态，Plus 价格不和登录表单挤在一起。

## ADDED Requirements

### Requirement: 未登录家长账号区只含登录要素
通过家长算术门禁且尚未登录时，家长账号区 MUST 只展示：邮箱、图形验证码（含答案输入）、发送验证码、六位验证码、登录。该区域 MUST NOT 展示 SES、SMTP、个人实名或其它运维技术说明。该区域 MUST NOT 展示包月/包年价格卡片，也 MUST NOT 把「请管理员开通」与登录表单并列。儿童游玩路径 MUST NOT 出现登录、验证码或价格。

#### Scenario: 未登录只见登录表单
- **WHEN** 家长通过门禁且尚未登录
- **THEN** 可见邮箱、图形验证码、发送验证码、六位验证码与登录；MUST NOT 出现 SES/SMTP 技术文案、包月/包年价格或「请管理员开通」

#### Scenario: 儿童路径仍无登录价格
- **WHEN** 儿童在首页、主题包地图或关卡内游玩
- **THEN** 界面 MUST NOT 出现价格、登录、验证码或「开通会员」文案

### Requirement: 图形验证码在发送前可见
未登录家长账号区 MUST 在用户点「发送验证码」之前展示图形验证码区域（图片或可点的占位）。系统 MUST 在进入该区时尝试加载 `GET /api/auth/captcha`，MUST NOT 仅在 `GET /api/auth/config` 成功且 `captcha: true` 之后才渲染该区域。点击图形验证码图片 MUST 刷新挑战。仅当配置明确返回 `captcha: false` 时，系统 MAY 隐藏图形验证码。

#### Scenario: 配置失败仍能看见验证码区
- **WHEN** 家长进入未登录账号区且 `GET /api/auth/config` 失败或超时
- **THEN** 图形验证码区域仍可见，用户可点图片或占位刷新

#### Scenario: 点击图片刷新
- **WHEN** 图形验证码图片已展示且用户点击该图片
- **THEN** 系统请求新的验证码挑战并更新图片

### Requirement: 发送验证码后的成功与倒计时
发送成功后，系统 MUST 以中文提示验证码已发到该邮箱，MUST 将焦点移到六位验证码输入框，MUST 在冷却期间禁用重发并展示倒计时。连接失败或原生 HTTP 异常 MUST 映射为家长能懂的中文（例如连不上会员服务），MUST NOT 把 `Failed to connect`、`ConnectException` 或 IP:端口原文展示给家长。

#### Scenario: 发送成功
- **WHEN** 邮箱与图形验证码有效且发送接口成功
- **THEN** 界面提示验证码已发到邮箱，六位验证码框获得焦点，发送按钮进入倒计时不可点

#### Scenario: 连不上会员服务
- **WHEN** 发送请求因无法连接会员 origin 而失败
- **THEN** 界面展示人话错误，MUST NOT 展示 `Failed to connect` 或目标 IP 原文

### Requirement: Plus 与登录分离且不可假支付
Plus 状态、价格说明与开通提示 MUST 在登录之后展示，或放在折叠的 Plus 小区，MUST NOT 与未登录登录表单同一屏堆叠。当账单提供方不是可拉起支付的微信（或等价已配置通道）时，系统 MUST NOT 把包月/包年渲染成可支付按钮。在线支付未开放时，系统 MAY 提示联系管理员开通，但仅出现在已登录或折叠 Plus 区。

#### Scenario: 登录后才见 Plus 小区
- **WHEN** 家长尚未登录
- **THEN** 不展示包月/包年价格卡片与管理员开通提示

#### Scenario: 支付未开放无假按钮
- **WHEN** 家长已登录且账单提供方为手工开通
- **THEN** 不出现可点的包月/包年支付按钮
