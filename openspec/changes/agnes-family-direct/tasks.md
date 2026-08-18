## 1. 提供方与存储

- [x] 1.1 `family/store` 增加 `llmProvider`（deepseek|agnes）、`imageCloudProvider`（tongyi|agnes）、`agnesApiKey`，读写兼容旧数据，默认 deepseek / tongyi
- [x] 1.2 日记设置：关卡模型双选、云端配图双选、Agnes Key 保存/清除；自动云端配图文案不再写死「通义」
- [x] 1.3 电脑 API 地址改为可选说明：App 有云 Key 时可直连，不必填局域网

## 2. 关卡生成

- [x] 2.1 抽出/复用校验与 Prompt；按提供方调用 DeepSeek 或 Agnes chat completions（含一次重试）
- [x] 2.2 原生 App：有对应 Key 时 `CapacitorHttp` 直连，不检查 `missingNativeApiBase`
- [x] 2.3 浏览器：`POST /api/family/generate-level` 增加 `llm`；服务端支持 Agnes 与 `AGNES_API_KEY`
- [x] 2.4 日记页状态文案区分提供方；直连失败不提示开电脑 API

## 3. 配图

- [x] 3.1 Agnes 文生图客户端（`agnes-image-2.1-flash`）+ 通义直连；Canvas 压缩为 JPEG data URL
- [x] 3.2 原生有 Key 直连；浏览器走 `/api/family/generate-images` 的 `imageProvider`
- [x] 3.3 槽位失败占位，不丢关卡；自动配图使用当前云提供方

## 4. 文档与测试

- [x] 4.1 更新家庭日记 / 通义配图文档：切换、直连、Agnes Key
- [x] 4.2 API 测试：mock 仍过；缺 Key 的 Agnes 生成失败码正确
- [x] 4.3 设置页与生成前置：无局域网地址但有 Key 时原生不拦截
