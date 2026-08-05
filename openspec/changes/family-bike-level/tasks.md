## 1. 类型与校验

- [ ] 1.1 扩展 `LevelScript` / `schema.json`：`scene.video`（可选字符串）、`scene.video_max_seconds`（可选数字）
- [ ] 1.2 更新 `content/validate.mjs`：若存在 `scene.video` 则检查文件存在；静态关回归仍通过

## 2. 关卡播放器视频背景

- [ ] 2.1 在 `LevelPage` 支持 `scene.video`：全屏 `<video playsInline muted>`，默认短播约 5 秒后 `pause` 定格
- [ ] 2.2 增加可跳过短播的大热区控件（无中文文案）
- [ ] 2.3 确认仅有 `scene.image` 的既有水果关行为不变

## 3. 家庭骑车关内容

- [ ] 3.1 准备卡通资源：`assets/items/bike.png`、卡通小骑手贴纸图，放入 `content/assets/`
- [ ] 3.2 手写 `content/levels/fruit-09-bike.json`（目标词 bike，3–6 拍，点图兜底，引用 `tudouqiche.mp4` 与卡通图，`approved: true`）
- [ ] 3.3 更新 `content/levels/pack.json`：在 `fruit-07-pear` 与 `fruit-08-picnic` 之间插入 `fruit-09-bike`
- [ ] 3.4 运行 `node content/validate.mjs` 通过；`npm run sync-content` 后 Web 可加载

## 4. 文档与收口

- [ ] 4.1 更新剧情说明（水果森林故事或本变更内容说明）与 README 关卡列表
- [ ] 4.2 本地冒烟：地图出现骑车节点 → 短播/跳过 → 说 bike 或点图 → 通关得贴纸 → 解锁野餐
