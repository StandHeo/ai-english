## 1. 类型与校验

- [x] 1.1 在 `apps/web/src/types.ts` 增加 `TalkNode` / `BeepTalk` 类型，并让 `LevelScript` 支持可选 `beep_talk`
- [x] 1.2 更新 `content/levels/schema.json`（及若有的 `validate.mjs`）校验 `beep_talk`：3～5 节点、`start` 存在、`next`/`on_fail_next` 可解析、至少一处兜底

## 2. 播放器衔接

- [x] 2.1 在 `LevelPage`（或抽出的 `BeepTalkPanel`）增加 `beepTalk` phase：有 `beep_talk` 时末拍成功进入，无则保持原结算
- [x] 2.2 实现节点循环：播 `robot_say` → 按键说话 → `matchExpect` → 成功 `next` / 失败提示与重试 → 兜底后 `on_fail_next`
- [x] 2.3 Beep 轮可选延长 `usePressToTalk` 自动停录窗口；TTS 走现有 `requestTts`（可为 Beep 固定 voice/pitch）
- [x] 2.4 对话结束再触发庆祝与 `completeLevel`/发贴纸；中途返回地图不写本关 completed

## 3. 人设与样板内容

- [x] 3.1 增加 Beep 展示（可先复用 robot 立绘 + Beep 文案区分；有正式图再替换）
- [x] 3.2 为 `robot-lab` 至少 1 关（建议再加第 2 关）编写贴合 `target_words` 的 `beep_talk` 样板
- [x] 3.3 确认家庭 DeepSeek 生成路径首版不输出 `beep_talk`（保持可选空）

## 4. 文档与验收

- [x] 4.1 更新简短说明（如 `docs/` 或关卡 README）：尾声 Beep、非自由聊天、样板关 id
- [x] 4.2 真机/浏览器冒烟：样板关末拍 → Beep 全流程 → 贴纸；无 `beep_talk` 关行为不变；失败兜底可走完
