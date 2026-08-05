## 背景

动机见 `proposal.md`。现状：几乎所有关都是 introduce→ask(What's this?)→ask(Say X!)→introduce(Yay)。`Beat.type` 仅 `introduce` | `ask`；失败才进点图兜底。播放器成功句固定偏 `Yay!`。

## 目标 / 非目标

**目标：**

- 扩展 `find` 拍；类型与校验同步。
- 重写两包关卡台词与部分拍序（插入 find / 换问法）。
- LevelPage：渲染 find、焦点动效、success_say / 庆祝句轮换。

**非目标：**

- 新主题包、改进度模型、自由对话、音效库大制作。

## 决策

### D1 — 拍类型：`introduce` | `ask` | `find`

- **选择：** `find` 与失败兜底共用 options 结构，但是主路径拍。
- **原因：** 复用点图 UI；语义上「先玩再/或代替第二次干巴 Say」。
- **备选：** 仅改文案不加新类型（趣味不足）。

### D2 — 问法模板库（内容层）

每关两个 ask 从下列选不同模板：

| 模板 | 示例 |
|------|------|
| 辨认 | What's this? |
| 跟读 | Can you say apple? |
| 想要 | I want one! What is it? |
| 颜色/特征 | It's red! What is it? |
| 角色求助 | Help Bunny! What is it? |
| 出发/动作 | Ready? Say go! |

`expect` 仍短词为主。

### D3 — 成功句

- **选择：** `success_say` 可选；缺省时播放器在 `Yum!` / `Wow!` / `Great!` / `Yay!` 中按拍索引轮换。
- **原因：** 小改动打破单调。

### D4 — 动效

- **选择：** CSS `focus-bounce` 挂在 `.focus-item`；find 选项正确瞬间 `pop`。
- **原因：** 无新依赖。

### D5 — 关卡改造范围

- **选择：** 水果 8 关 + 自行车 8 关全部改台词；其中各至少 3 关插入 `find`（替换原第二 ask 或插在 introduce 后）。
- **原因：** 规格要求两包可感知。

## 风险 / 权衡

- **[风险] 问法变长孩子听不懂** → 缓解：仍短句；画面支架强；失败有 hint + 点图。
- **[风险] find 拍减少开口次数** → 缓解：每关仍保留至少 1 个 ask 口语拍。
- **[权衡] 不引入真实迷你游戏引擎** → 先用 find + 文案 + 动效验证趣味。

## 迁移计划

1. 扩 schema/类型/校验。  
2. 改 LevelPage。  
3. 批量改 JSON。  
4. 校验 + 冒烟一水果关一自行车关。

## 待决问题

- 无阻塞项；具体哪几关插 find 实现时按词表挑选（水果：apple/grape/picnic；自行车：helmet/bell/tricycle）。
