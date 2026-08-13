# 关卡尾声：Beep 约束对话

部分官方关卡在主线结束后提供独立机器人 **Beep** 的短英语对话（约束对话图，不是自由聊天）。

## 产品决策 vs 当前实现

| | 说明 |
|--|------|
| **已拍板（实现中）** | 见 change **`level-clear-ceremony`**：T7=D + T7a=α 等。落地前代码仍为下表「当前」 |
| **当前代码** | 仍为：有 `beep_talk` 时 **Beep 走完才**庆祝/发贴纸；中途退出 Beep → 不记通关、不发贴纸 |

下文「行为」描述的是**当前实现**，便于对照代码；落地 T7=D 时需改播放器顺序与进度语义，并更新本节。

## 行为（当前实现）

1. Bunny 主线 `beats` 照常玩完  
2. 若关卡含 `beep_talk` → 进入 Beep（3～5 轮，expect 匹配 + 点图兜底）  
3. 对话结束后再庆祝并发贴纸  
4. 中途点退出返回地图 → **不**记本关完成、不发贴纸  
5. 无 `beep_talk` 的关 → 行为与以前相同（家庭 DeepSeek 生成关默认无此字段）

儿童路径 **不会** 调用 LLM；家庭 DeepSeek 生成关卡时也 **不** 产出 `beep_talk`。

## 覆盖范围

全部官方 pack 关卡 JSON 均已配置 `beep_talk`（含 robot / fruit / bike / hero / pup / fishing / swim）。对话围绕该关 `target_words`，带点图兜底。

字段约定见 `content/levels/schema.json` 与 OpenSpec `beep-level-tail-talk`。
