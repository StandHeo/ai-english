## 为什么

通关时贴纸几乎只进数据、不进画面（约 1.2s 自动跳下一关）；Beep 又挡在贴纸前面，4 岁共玩时关尾易累、奖赏感弱。家长视角笔记已拍板仪式与 Beep 顺序，需要落到产品行为。

## 变更内容

- 新增**中等强度通关仪式**：大贴纸为首视觉、通关 TTS `{Cheer}! {Word}!`、居中大圆 ▶ 点按后才进下一关；左上退出带回地图的轻确认；久等仅 pulse ▶，永不自动跳。
- **BREAKING（相对当前 Beep 实现）**：有 `beep_talk` 时，主线结束后先进入仪式并**结算通关/发贴纸**；Beep 改为仪式上的**可选**小头像入口；点 ▶ 静默跳过 Beep；Beep 聊完回到仪式；中途退出 Beep **不扣**已发贴纸。
- 一期不做：自动连玩开关、「重」飞入贴纸墙仪式、「总是先 Beep」家长开关；`beep_talk` 节点数保持现状（多为 3）。
- 贴纸图兜底：`stickerImage` → 主词物品图 → 通用占位。

决策依据：`docs/parent-child-ux-notes.md`（T1–T8、T7a–T7c、T22）。

## 能力

### 新增能力

- `level-clear-ceremony`：通关贴纸仪式（展示、TTS、主/次按钮、退出确认、图兜底、与进度结算时机）
- `beep-tail-talk`：更新 Beep 与奖励的时序——贴纸后可选、可跳过（相对既有 change `beep-level-tail-talk` 的「Beep 后发贴纸 / 不可跳过整段」）

### 修改的能力

- （主规格目录 `openspec/specs/` 尚无已同步条目；以本 change 新增能力描述目标行为）

## 影响

- 客户端：`LevelPage` / `finishLevel` 流程、通关 UI（新组件或同页 phase）、`BeepTalkPanel` 完成回调改为回仪式、退出确认
- 进度：`completeLevel` / 发贴纸时机前移至进入仪式时
- 文档：`docs/beep-tail-talk.md`、`docs/parent-child-ux-notes.md`（实现后把「未改代码」改为已实现）
- 内容：本期不强制改关卡 JSON 节点数；家庭关无 `beep_talk` 时不显示 Beep 入口
