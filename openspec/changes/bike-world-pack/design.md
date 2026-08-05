## 背景

动机见 `proposal.md`。当前应用 `/` 直达单一 `fruit-forest` 地图；进度为扁平 `unlocked`/`completed`/`stickers`；已有 `scene.video` 短播定格与一关 `fruit-09-bike`。本变更引入多 pack + 首页，并建设完整 `bike-world` 第一季。

## 目标 / 非目标

**目标：**

- 路由：首页选主题 → 主题地图 → 关卡；地图可回首页。
- 进度按 `packId` 分桶；每日时长仍全局。
- 落地 `bike-world` 八关脚本 + 卡通资产；出发关挂家庭视频。
- 水果 pack 去掉 `fruit-09-bike`，梨后接野餐。

**非目标：**

- 主题商店、云同步账号、家长页上传。
- 替换 Bunny；自行车第二季词（pedal/stop 等）可后置。
- 重做 ASR/TTS 协议。

## 决策

### D1 — 内容包索引方式

- **选择：** `content/levels/packs/fruit-forest.json` 与 `packs/bike-world.json`（或根目录 `pack-fruit-forest.json` / `pack-bike-world.json`）；保留加载器按 id 读 pack。迁移期可将原 `pack.json` 改为水果包并增加自行车包文件。
- **原因：** 两包并存清晰。
- **备选：** 单 pack.json 内嵌 themes 数组（一次改动大）。

### D2 — 进度存储 v2

- **选择：** 升级 localStorage 键或结构为：
  ```
  packs: {
    "fruit-forest": { unlocked, completed, stickers },
    "bike-world": { unlocked, completed, stickers }
  }
  stars, dailyLimitMinutes, playSecondsByDate 仍全局
  ```
  启动时若检测到旧扁平结构，迁移到 `fruit-forest` 桶。
- **原因：** 满足隔离；迁移简单。
- **备选：** 两套完全独立 key（易丢星星汇总）。

### D3 — 路由

- **选择：** `/` 首页；`/map/:packId` 地图；`/level/:levelId` 不变（关卡 JSON 自带 theme/pack 归属，通关时写入对应桶）。
- **原因：** 关卡页改动小。
- **备选：** `/bike/level/:id` 前缀（重复逻辑）。

### D4 — 自行车第一季关卡表

| 顺序 | id | 主词 | 场景要点 |
|------|-----|------|----------|
| 1 | `bike-01-bike` | bike | 车库见面 |
| 2 | `bike-02-tricycle` | tricycle (+trike) | 三轮棚 |
| 3 | `bike-03-mountain` | mountain bike (+mountain) | 山地坡 |
| 4 | `bike-04-road` | road bike | 公路道 |
| 5 | `bike-05-helmet` | helmet | 头盔屋 |
| 6 | `bike-06-bell` | bell | 铃铛桥 |
| 7 | `bike-07-go` | go / ride | 出发道 + **家庭视频** |
| 8 | `bike-08-review` | 复习 bike, helmet, bell | 车棚庆祝（长车型名不强制复习，降 ASR 压力） |

- **原因：** 车型兴趣 + 装备安全词 + 出发个性化；复习关用短词更稳。
- **备选：** 复习含 mountain/tricycle（更难开口）。

### D5 — 资产

- **选择：** 实现时批量 AI 生成卡通 `scenes/*`、`items/*`；地图 `assets/scenes/bike-map.png`；出发关 `video: assets/videos/tudouqiche.mp4`。
- **原因：** 与已定「全套卡通 + 视频仅出发关」一致。

### D6 — 首页视觉

- **选择：** 两张大入口卡（水果篮图 / 自行车图），无中文；可保留极简英文主题名作装饰（非必需）。
- **原因：** 符合儿童少文字规格。

### D7 — 贴纸墙与家长页

- **选择：** 贴纸墙合并展示所有桶的贴纸；家长页按主题分组列表通关 id 或标题。
- **原因：** 规格允许同墙；家长需可区分。

## 风险 / 权衡

- **[风险] 长词 ASR 失败率高** → 缓解：expect 短变体；点图兜底；Bunny 示范全称。
- **[风险] 旧进度迁移出错** → 缓解：版本字段 + 水果桶迁移；README 说明可清存储。
- **[风险] 资产量大** → 缓解：先保证道具清晰，场景可简化；校验路径存在即可。
- **[权衡] 复习不含车型全称** → 保成功率；车型已在专关练过。

## 迁移计划

1. 进度 v2 + 加载多 pack + 首页/地图路由。
2. 生成自行车资产与八关 JSON；注册 `bike-world` pack。
3. 水果 pack 移除 `fruit-09-bike`（文件可留作未引用或删除）。
4. 家长页与贴纸墙适配；冒烟双主题。
5. 回滚：恢复单 pack 入口与旧进度键（保留迁移函数兼容）。

## 待决问题

- 首页是否加轻量动效（入口轻微浮动）——实现时按观感决定，不影响规格。
- `bike-07-go` 主 expect 以 `go` 还是 `ride` 为主——默认两者都写入 expect。
