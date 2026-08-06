## 1. 进度与首页适配

- [x] 1.1 默认进度桶纳入 `robot-lab` / `hero-world`；`getPackProgress` 按 packId 推断首关
- [x] 1.2 家长页中文主题名映射扩展；首页网格适配四入口（可滚动）

## 2. 机器人实验室内容包

- [x] 2.1 生成并放入卡通资源（地图、首页、各关场景、道具）
- [x] 2.2 手写八关 JSON（`robot-01`…`robot-08`），含 introduce/ask/find 与点图兜底
- [x] 2.3 新增 `robot-lab` pack 索引并写入 `packs.json`

## 3. 英雄世界内容包

- [x] 3.1 生成并放入原创光之英雄卡通资源（非官方 IP）
- [x] 3.2 手写八关 JSON（`hero-01`…`hero-08`）
- [x] 3.3 新增 `hero-world` pack 索引并写入 `packs.json`

## 4. 文档与校验

- [x] 4.1 更新 README 与两包剧情说明
- [x] 4.2 运行 `node content/validate.mjs` 全绿
