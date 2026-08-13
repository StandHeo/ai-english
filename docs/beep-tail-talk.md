# 关卡尾声：Beep 约束对话

部分官方关卡在主线结束后提供独立机器人 **Beep** 的短英语对话（约束对话图，不是自由聊天）。

## 当前实现（`level-clear-ceremony`）

1. Bunny 主线 `beats` 照常玩完  
2. 进入**通关贴纸仪式**（此时结算通关并发贴纸）  
3. 若关卡含 `beep_talk` → 仪式上出现小 Beep 入口（可选）；点大圆 ▶ 可**跳过** Beep  
4. Beep 聊完 → **回到仪式**；再点 ▶ 离开  
5. Beep 中途退出不扣已发贴纸  
6. 无 `beep_talk` → 仪式上无 Beep 入口  

产品决策见 [`docs/parent-child-ux-notes.md`](parent-child-ux-notes.md)；OpenSpec：`openspec/changes/level-clear-ceremony/`。

儿童路径 **不会** 调用 LLM；家庭 DeepSeek 生成关卡时也 **不** 产出 `beep_talk`。

## 覆盖范围

全部官方 pack 关卡 JSON 均已配置 `beep_talk`（含 robot / fruit / bike / hero / pup / fishing / swim）。对话围绕该关 `target_words`，带点图兜底。一期节点数保持现有（多为 3）。

字段约定见 `content/levels/schema.json` 与 OpenSpec `beep-level-tail-talk` / `level-clear-ceremony`。
