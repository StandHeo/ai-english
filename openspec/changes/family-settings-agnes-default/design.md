## Context

见 `proposal.md` 动机。当前 `DEFAULT_FAMILY_LLM = 'deepseek'`、`DEFAULT_IMAGE_CLOUD = 'tongyi'`；`FamilyStudioSettingsPage` 并排两块 Key，指引写死 `http://118.24.164.40/agnes-api-key.html`。`docs/agnes-api-key.html` 已有 `id="agnes"` / `id="deepseek"`。存储已分三把 Key，Agnes 关卡与配图共用 `agnesApiKey`。

## Goals / Non-Goals

**Goals:**

- 默认常量与设置页初始态改为 Agnes（关卡 + 配图）
- 关卡区单一动态 Key 输入 + 每模型旁指引（跟 `apiBase` + 锚点）
- 配图区按规则隐藏/露出 Agnes Key，避免重复录入

**Non-Goals:**

- 不改生成/配图调用链路与 Key 存储字段名
- 不强迁已存 DeepSeek / 通义选择
- 不拆分或重写 `agnes-api-key.html` 正文（仅依赖现有锚点）

## Decisions

### 1. 默认只改常量与空状态回落

- 改 `DEFAULT_FAMILY_LLM` / `DEFAULT_IMAGE_CLOUD` 为 `'agnes'`；`store` 加载时无合法已存值则回落新默认。
- **备选**：启动时把旧默认强制写成 Agnes → 否决，尊重老用户。

### 2. 关卡区单一 Key 输入用本地 state 按模型切换

- 保留 `agnesKey` / `apiKey`（DeepSeek）两份 state；UI 只渲染当前模型对应的那一个 input。
- 保存时仍分别 `setAgnesKey` / `setDeepseekKey`。
- **备选**：合并成一个受控字符串再按模型写入 → 切换时易丢未保存编辑；两份 state 更安全。

### 3. 指引 URL 拼装

```
const base = (getApiBase() || PRODUCTION_API_BASE).replace(/\/$/, '')
`${base}/agnes-api-key.html#agnes` | `#deepseek`
```

- 跟随用户在设置里保存的服务器地址；留空官方时用 `PRODUCTION_API_BASE`。
- **备选**：继续写死 IP → 否决，与临时官方基址/自建调试不一致。

### 4. 配图区 Key 可见性规则

| 关卡 LLM | 配图 | Agnes Key 框 |
|----------|------|--------------|
| Agnes    | Agnes | 隐藏（文案提示用上方） |
| DeepSeek | Agnes | 配图区临时露出 |
| *        | 通义  | 仅通义 Key |

- 临时露出的输入仍绑定 `agnesKey` state / `agnesApiKey`。

### 5. 设置页初始 `useState` 默认值

- `llm` / `imageCloud` 的 React 初始值改为 `'agnes'`，与常量一致；`useEffect` 仍从 store 覆盖，已存用户不受影响。

## Risks / Trade-offs

- [本机开发 `getApiBase()` 为空或指向 localhost] → 用 `PRODUCTION_API_BASE` 回落，指引仍打开官方文档页
- [用户改了服务器但未部署 `agnes-api-key.html`] → 指引 404；属自建环境责任，官方包有该静态页
- [双 state 未保存切换模型] → 切换不丢另一家未保存草稿，符合预期

## Migration Plan

- 纯前端常量 + UI；无服务端迁移
- 回滚：恢复两默认常量与旧双 Key UI 即可

## Open Questions

- （无；探索阶段已拍板）
