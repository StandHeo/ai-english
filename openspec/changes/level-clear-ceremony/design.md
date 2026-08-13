## Context

见 `proposal.md` 动机；产品决策见 `docs/parent-child-ux-notes.md`。

当前实现：`LevelPage.finishLevel` 在（可选）Beep 结束后 `requestTts('Yay!')`，约 1.2s 后自动 `navigate`；有 `beep_talk` 时末拍进入 `BeepTalkPanel`，其 `onComplete` 才调用 `finishLevel`。通关无大贴纸层。

## Goals / Non-Goals

**Goals:**

- 主线结束 → 通关仪式（结算+大贴纸+TTS+大圆 ▶）→ 可选 Beep → 回仪式 → 点 ▶ 离开
- 退出轻确认；久等 pulse；贴纸图兜底；TTS `{Cheer}! {Word}!`

**Non-Goals:**

- 自动连玩开关；重仪式飞入贴纸墙；家长「总是先 Beep」；批量改 `beep_talk` 节点数
- 听窗/难词/开屏引导（其它待定项）

## Decisions

### D1 — 用 phase/组件承载仪式，而不是只改 timeout

- **选择：** 增加通关仪式 UI（同页 phase 或小组件），`completeLevel` 在进入仪式时调用；去掉自动跳转定时器，改为主按钮 `navigate`。
- **备选：** 仅把 1.2s 改成 3s 仍自动跳（否决：违背 T1=α）。

### D2 — Beep 与仪式的状态机

- **选择：** 主线末拍 → `clearCeremony`；小 🤖 → `beepTalk`；Beep `onComplete` → 回到 `clearCeremony`；▶ → 下一关/地图。
- **备选：** Beep 结束后直接下一关（否决：T7a=α 要求回仪式）。

### D3 — 奖励只结算一次

- **选择：** 进入仪式时结算；从 Beep 回仪式不重复 `completeLevel`（用 ref/标志防重入）。
- **备选：** Beep 结束再结算（否决：与 T7=D 冲突）。

### D4 — TTS 运行时拼接

- **选择：** Cheer 池轮换 + `target_words[0]` 首字母大写；失败退 `Yay!`。
- **备选：** 每关手写 `celebrate_say`（一期不做）。

### D5 — 退出确认复用轻量模态

- **选择：** 仪式内拦截 exit，✓/✕ 纯图标；与中途退出语义对齐为「回地图」但**不撤销**已结算进度。
- **备选：** 仪式内禁止退出（否决：缺少停玩路径）。

## Risks / Trade-offs

- **[Beep 发现性]** 小头像可能被忽略 → 可接受；主路径是贴纸+▶  
- **[横屏热区]** 大圆在矮屏可能挤 → CSS 可退化为底栏全宽，语义仍单一主行动  
- **[旧进度语义文档]** `docs/beep-tail-talk.md` 须在实现后改「当前实现」段落，避免双真相  

## Migration Plan

- 纯客户端行为变更；无存档迁移。已安装用户下次进关即见新流程。
- 回滚：恢复「Beep 后 finishLevel + 短延时跳转」（不推荐，仅紧急）。

## Open Questions

- 无（一期默认已在 `parent-child-ux-notes` 收口；实现中细节由 tasks 覆盖）
