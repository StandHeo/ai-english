## Why

家庭日记工作室页上，语音转写与配图等长任务虽然已是异步请求，却用全局 `busy`/`imaging`/`transcribing` 锁死大半界面；提示又分散在底部 `status`、聊天区内条、按钮文案和顶部 sticky 等多条通道，文案常错位（例如转写时生成按钮显示「生成中…」）。家长记日记时需要边录边等转写，配图时需要明确进度且不被误导。

## What Changes

- 长任务改为「后台 Job」心智：转写可并行多条；配图/翻译/生成按冲突规则锁定相关操作，不再误伤无关 UI
- 语音：结束录音后立刻落气泡，转写在后台完成；转写未全部完成前禁止「生成关卡」，点击时友好提示
- 配图进行中：禁止改场景主题及相关配图操作；顶部 sticky 显示进度，完成后展示「配图完成」约 2 秒再关闭
- 转写进行中：顶部 sticky 统一显示「语音转文字中…」（多条不报数量）；仍可继续录音与打字
- 瞬时反馈（已发送、已删除等）改为页面底部轻 toast，不再占用万能 `status` 桶
- 整理并收敛提示通道：长任务进度只走顶部 sticky；环境类 ASR 提示保留独立通道

## Capabilities

### New Capabilities

- `family-studio-jobs`: 家庭日记工作室页的长任务（转写、配图、翻译、生成）后台执行、冲突锁定与顶部进度条行为
- `family-studio-feedback`: 工作室页提示分层（sticky 进度、底部轻 toast、环境提示）与瞬时/结果反馈规则

### Modified Capabilities

- （无；主库 `openspec/specs/` 尚无对应能力，本次以新能力规格引入）

## Impact

- 主要改动：`apps/web/src/pages/FamilyStudioPage.tsx`、`apps/web/src/pages/family-studio.css`
- 可能抽离轻量 toast / sticky job 条组件（仍属 web 前端）
- 语音落库顺序：先 `appendVoiceMessage` 再后台 ASR 回填文字（`family/store` 消息更新路径）
- 不改 ASR/配图云端 API 协议；不引入原生新线程
