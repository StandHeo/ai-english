## Purpose

让已安装的 Capacitor App 在家长填写云 Key 后，直接调用 HTTPS 模型接口生成家庭关卡与配图，而不要求电脑局域网 `apps/api`。

## ADDED Requirements

### Requirement: 原生有 Key 时直连云端
在 Capacitor 原生环境且当前提供方所需 API Key 已保存在本机时，家庭日记「生成关卡」与「云端配图」MUST 通过原生 HTTP 直连对应云厂商 HTTPS 接口。此路径 MUST NOT 要求已填写电脑 API 地址。

#### Scenario: 无电脑地址也能生成
- **WHEN** 家长在 App 中保存了当前关卡模型的 Key，设置里电脑 API 地址为空，并点生成关卡
- **THEN** 系统发起直连云请求并在成功后保存关卡，MUST NOT 因缺少局域网地址而拒绝

### Requirement: 浏览器预览仍可走代理
在非原生浏览器中，生成与配图 MAY 继续经同源 `/api` 代理（Vite → `apps/api`），以避免 CORS。代理请求 MUST 携带当前选择的提供方。

#### Scenario: 电脑浏览器联调
- **WHEN** 家长在电脑浏览器打开日记并已启动 `apps/api`
- **THEN** 生成可走 `/api/family/generate-level`，且服务端按请求中的提供方调用 DeepSeek 或 Agnes

### Requirement: 直连失败可理解
直连超时、鉴权失败或网络不可达时，系统 MUST 展示不依赖「请开电脑 API」的错误说明（可提示检查手机网络与 Key）。

#### Scenario: 直连超时
- **WHEN** 原生直连云模型超时
- **THEN** 提示网络或模型响应慢，且不要求填写局域网 IP
