## 1. 反馈基础设施

- [x] 1.1 在 `family-studio.css` 增加底部轻 toast 与通用顶部 `studio-job-banner` 样式（可基于现有 `imaging-sticky-banner` 扩展）
- [x] 1.2 在 `FamilyStudioPage.tsx` 增加 toast state（展示文案、定时自动清除、连续触发替换最新）
- [x] 1.3 将「已发送 / 已删除 / 已更新文字 / 已保存场景词 / 已取消覆盖 / 已挂上照片」等瞬时反馈改为 toast，不再写入万能 `status`

## 2. Job 状态与顶部进度条

- [x] 2.1 引入 `transcribePending` 与 `activeJob`（image / generate / translate + phase），去掉转写路径上的 `setBusy(true)`
- [x] 2.2 用 Job 状态驱动顶部固定条：转写显示「语音转文字中…」；配图显示进度；配图成功显示「配图完成」并停留约 2 秒再清除
- [x] 2.3 按 design 锁定表禁用控件；确保转写中「生成关卡」不显示「生成中…」
- [x] 2.4 组件卸载时清理完成态 timer，避免 setState on unmounted

## 3. 语音先落库再转写

- [x] 3.1 调整 `persistVoiceCapture`：有效录音先 `appendVoiceMessage` 再后台 ASR，转写成功/失败后 `updateMessageText` 回填
- [x] 3.2 转写进行中允许再次录音与打字；`transcribePending` 正确增减（含并行多条）
- [x] 3.3 `generate()` 在 `transcribePending > 0` 时友好拦截（不启动生成），提示需等语音转成文字

## 4. 配图 / 翻译 / 生成接入 Job

- [x] 4.1 `requestMiniLevelImages` / 单关配图接入 `activeJob.kind='image'`，配图中禁用场景主题与主体词编辑及冲突配图/重画
- [x] 4.2 场景词翻译（单关/全部）接入 `activeJob.kind='translate'`，不再误用生成中文案
- [x] 4.3 关卡生成接入 `activeJob.kind='generate'`（或保留专用 `generating`）；生成中禁止再生成与配图，默认禁止发送新日记以免 story 不一致
- [x] 4.4 收敛聊天区内转写条与顶部条：避免重复互相矛盾的进度文案（顶部条为权威进度源）

## 5. 自检

- [x] 5.1 手动核对：连录两条 → 顶部「语音转文字中…」→ 可再录 → 转写未完点生成有友好提示 → 转完可生成
- [x] 5.2 手动核对：全部配图中可滑动、不可改场景 → 完成后「配图完成」约 2s → 恢复编辑；瞬时操作为底部 toast
