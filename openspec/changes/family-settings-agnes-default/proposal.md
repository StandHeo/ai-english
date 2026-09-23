## 为什么

日记设置页把关卡模型与两家 API Key 拆成多块，默认又是 DeepSeek / 通义，新用户要填多次 Key、找指引也不清晰。Agnes 已是推荐免费档，应成为默认，并把「一家模型一把 Key」收成清晰的信息架构。

## 变更内容

- 关卡生成模型默认改为 Agnes；云端配图默认改为 Agnes 图（仅影响从未写过本地选择的新状态；已存用户选择不变）
- 关卡模型区：模型选项与单一 API Key 输入合并；输入框随当前选中模型读写对应 Key（`agnesApiKey` / `deepseekApiKey`）
- 每个关卡模型旁增加「获取指引」链接，指向当前服务器上的 `agnes-api-key.html`，并带锚点 `#agnes` / `#deepseek`
- 配图区：选 Agnes 图时不再重复出现 Agnes Key 输入（与关卡共用）；选通义时仍只填通义 Key
- 边角：关卡为 DeepSeek 且配图为 Agnes 时，配图区临时露出 Agnes Key 一行（仍写同一把 `agnesApiKey`）

## 能力

### 新能力

- （无）

### 修改的能力

- `family-model-providers`: 默认改为 Agnes；设置页 Key/指引 UX；配图区不再重复 Agnes Key（边角除外）

## 影响

- `apps/web/src/family/providers.ts`：`DEFAULT_FAMILY_LLM`、`DEFAULT_IMAGE_CLOUD`
- `apps/web/src/pages/FamilyStudioSettingsPage.tsx`：设置页 UI 与保存逻辑
- `apps/web/src/family/providers.test.ts`：默认常量断言
- `docs/agnes-api-key.html`：锚点已存在；指引 URL 跟 `getApiBase()` / `PRODUCTION_API_BASE` 拼装
- 存储字段名不变（`llmProvider`、`imageCloudProvider`、三把 Key）
