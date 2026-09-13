## Context

见 `proposal.md` 的 Why。当前 `FamilyStudioPage` 用 `busy` / `imaging` / `transcribing` 交叉禁用控件，且 `persistVoiceCapture` 在 ASR 完成前不 `appendVoiceMessage`；`status` 字符串被录音、转写、生成、配图、翻译、瞬时操作共用。顶部 `imaging-sticky-banner` 已存在，但仅绑定 `imaging`。

约束：Web + Capacitor，无独立原生工作线程；长任务仍以 Promise 后台跑，重点是状态机与 UI 锁定粒度。

## Goals / Non-Goals

**Goals:**

- 引入明确的 Job 状态（转写可多条并行计数；配图/生成/翻译按冲突表锁定）
- 语音先落库再 ASR 回填
- 顶部 sticky 作为长任务唯一进度源（含配图完成 2s）
- 底部轻 toast 承接瞬时反馈；拆掉万能 `status` 桶的误用
- 修正转写误开 `busy` 导致「生成中…」错文案

**Non-Goals:**

- 不改 Whisper / 配图云 API 协议与并发算法（`mapPool` 可保留）
- 不引入 Web Worker / 原生后台服务（除非后续证明主线程卡顿不可接受）
- 不重做整个工作室视觉，仅按钮与提示通道在既有 style 上收敛
- 不在本 change 处理离页后 Job 持久化恢复（离开页可取消或随组件卸载中止，见风险）

## Decisions

### 1. 页面内 Job 模型，而非全局中间件

- **选择**：在 `FamilyStudioPage`（或同目录小 hook，如 `useFamilyStudioJobs`）维护：
  - `transcribePending: number`（或 Set of messageIds）
  - `activeJob: null | { kind: 'image' | 'generate' | 'translate'; label: string, phase: 'running' | 'done' | 'error' }`
  - 配图与生成互斥；转写与配图可并行（配图不依赖即时转写结果，但生成依赖全部转写完成）
- **备选**：全局 event bus / Zustand —— 对本页过度，暂不采用

### 2. 语音：先 append 再转写回填

- **流程**：`appendVoiceMessage`（text 可为空或「转写中…」占位）→ UI 更新 → 异步 `blobToWav` + `transcribeDiaryAudio` → `updateMessageText`
- **转写中再录**：允许；每条独立 pending；顶部文案固定「语音转文字中…」
- **生成拦截**：`transcribePending > 0` 时 `generate()` 早退并 toast/对话框友好提示（优先 toast 或轻量 inline，文案明确「还有语音正在转成文字」）

### 3. 锁定表

| 进行中 | 允许 | 禁止 |
|--------|------|------|
| 转写 | 再录、打字、滑动、看关卡 | 生成关卡 |
| 配图 | 滑动、看日记（只读场景） | 改场景主题/主体词、全部/缺图/本关配图、重画、生成关卡（建议一并禁，避免 pack 与图竞态） |
| 生成关卡 | 滑动查看 | 再生成、配图、改会触发再生的输入（日记仍可读；发送新日记可允许但需产品接受——默认生成中禁发送以免故事与生成用 story 不一致） |
| 翻译场景 | 滑动 | 配图、再翻译、改场景 |

配图中禁改场景：场景 textarea / 恢复默认 / 翻译按钮 `disabled`。

### 4. Sticky 与完成停留

- 扩展现有 `imaging-sticky-banner` 为通用 `studio-job-banner`：由 `activeJob` + `transcribePending` 驱动
- 优先级建议：`generate` > `image` > `translate` > 仅转写（若同时配图+转写，主条显示配图进度；转写不另开第二条，避免双条——转写可视为次要，或配图文案为主、转写只禁生成）
- **同时配图与转写**：主条显示配图进度；转写仍在后台；生成仍拦截直到转写清零
- 配图成功：`phase=done`，文案「配图完成」，`setTimeout` ~2000ms 后清空 job
- 组件卸载时 `clearTimeout`

### 5. Toast 替换瞬时 status

- 轻量：页面内 state `toast: string | null` + CSS `position: fixed; bottom: …`，约 1.5–2s 消失
- 映射：已发送、已删除、已更新文字、已保存场景词、已取消覆盖、已挂上照片等
- 错误类若需持久可读：可用 sticky 结束态或保留短时 toast；关键错误（Key 未填）可用 toast + 不自动被下一条瞬时覆盖过快（实现时用替换策略即可）

### 6. 去掉转写时的 `setBusy(true)`

- 转写只增 `transcribePending`；`busy` 仅表示生成关卡（或改名为 `generating`）
- 翻译用 `activeJob.kind='translate'`，不再借用生成的 `busy` 文案

## Risks / Trade-offs

- **[离页中止]** 用户离开工作室页时进行中的转写/配图可能中断 → 卸载时尽量 `finally` 清状态；配图已写入的关保留；未完成转写的气泡保留空/占位字，下次可手改或后续再做「重试转写」
- **[主线程卡顿]** `blobToWav16kBase64` 仍可能短时卡 UI → 本 change 先保证逻辑不锁死；若实测卡顿再考虑 Worker
- **[双任务文案]** 配图+转写同时进行时只显示配图条 → 可接受；生成仍被转写拦截
- **[占位文字进 story]** 若占位「转写中…」被 merge 进生成 story → 生成前必须 `transcribePending===0`，且 merge 时忽略明确占位（若使用占位文案）

## Migration Plan

- 纯前端行为变更，无数据迁移
- 既有日记消息格式不变；最多短时出现空 text 语音气泡（与转写失败手改路径一致）

## Open Questions

- 生成关卡进行中是否允许继续打字发日记：默认禁止发送以免 story 与请求不一致；若实现时发现过严可改为允许但不纳入本次生成
