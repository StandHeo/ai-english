## 1. 默认常量

- [x] 1.1 将 `DEFAULT_FAMILY_LLM`、`DEFAULT_IMAGE_CLOUD` 改为 `'agnes'`（`apps/web/src/family/providers.ts`）
- [x] 1.2 更新 `providers.test.ts` 中对应断言

## 2. 设置页：关卡模型与 Key

- [x] 2.1 `FamilyStudioSettingsPage` 初始 `llm` / `imageCloud` state 改为 `'agnes'`
- [x] 2.2 关卡模型区改为单一 Key 输入：随 `llm` 读写 `agnesKey` / `apiKey`；清除按钮只清当前模型 Key
- [x] 2.3 每个模型旁增加获取指引：`{getApiBase()||PRODUCTION_API_BASE}/agnes-api-key.html#agnes|#deepseek`
- [x] 2.4 移除关卡区并排的双 Key 标题与共用指引按钮

## 3. 设置页：配图区 Key 可见性

- [x] 3.1 配图为 Agnes 且关卡为 Agnes：隐藏 Agnes Key，文案提示使用上方 Key
- [x] 3.2 配图为 Agnes 且关卡非 Agnes：露出 Agnes Key 输入（同一 `agnesKey`）
- [x] 3.3 配图为通义：仅通义 Key；保存逻辑保持分字段写入

## 4. 校验

- [x] 4.1 跑相关单测（至少 `providers.test.ts`）
- [x] 4.2 手动确认：清空本地存储后默认 Agnes；已存 DeepSeek 不被覆盖；指引锚点与边角 Key 框行为符合 spec
