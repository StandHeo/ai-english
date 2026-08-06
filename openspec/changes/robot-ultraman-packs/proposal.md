## 为什么

孩子对机器人、奥特曼类英雄兴趣很高，现有水果与自行车主题不足以覆盖这类「酷酷的」玩法。需要新增两个独立主题包，让家庭能按兴趣进入，用简单英文词（robot / hero / light 等）继续开口练习。

## 变更内容

- 新增内容包 **`robot-lab`（机器人实验室）**：约 8 关线性冒险，目标词覆盖 robot、arm、wheel、button、beep、gear、friend 与复习关。
- 新增内容包 **`hero-world`（英雄世界）**：约 8 关线性冒险，视觉为**原创**卡通光之英雄（奥特曼风格，不使用官方商标名/角色名），目标词覆盖 hero、monster、light、fly、kick、shield、go 与复习关。
- 首页主题入口从 2 个扩展为 4 个（数据驱动，随 `packs.json` 自动展示）。
- 进度仍按 `packId` 分桶；新包默认解锁各自第一关。
- 全套卡通场景/道具图；不强制家庭视频。
- 非目标：付费主题、官方 IP 授权素材、App 内上传、替换 Bunny 向导。

## 能力

### 新增能力

- `robot-lab-content`：机器人实验室 pack 结构、关卡词表、地图顺序与卡通资源约定。
- `hero-world-content`：英雄世界 pack 结构、关卡词表、地图顺序与原创光之英雄视觉约定。

### 修改的能力

- （无——沿用既有 `theme-home` / `multi-pack-progress` 行为；首页已按 pack 列表渲染，本变更主要扩展内容与默认进度桶。）

## 影响

- `content/levels/`：新增 `robot-*.json`、`hero-*.json` 与两 pack 索引；更新 `packs.json`。
- `content/assets/`：机器人与英雄主题场景/道具/首页图。
- `apps/web`：默认进度桶纳入两新 pack；家长页中文主题名；首页网格适配 4 入口。
- README / 剧情说明文档。
