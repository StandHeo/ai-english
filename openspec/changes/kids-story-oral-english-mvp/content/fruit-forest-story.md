# 水果森林大冒险（Fruit Forest）剧情包

**主题：** 水果（fruits）+ 家庭骑车场景  
**向导角色：** Bunny（小兔向导）  
**地图：** 一条通往野餐草地的林间小路，九处节点线性解锁  

## 总故事线

小兔 Bunny 要准备一场森林野餐，但篮子是空的。孩子跟着 Bunny 走过果园采水果，途中在骑车小路上遇见自行车，用英语说出 bike。最后大家在草地上开野餐派对。

```
起点小屋 ──▶ 苹果园 ──▶ 香蕉林 ──▶ 橘子坡 ──▶ 葡萄架
              Lv1        Lv2        Lv3        Lv4
         ──▶ 草莓田 ──▶ 西瓜田 ──▶ 梨树园 ──▶ 骑车小路 ──▶ 野餐草地
              Lv5        Lv6        Lv7        Lv8(bike)     Lv9
```

## 第一关：苹果园（Apple Orchard）

- **id:** `fruit-01-apple`
- **目标词：** apple
- **场景：** 阳光果园，树上挂着红苹果；Bunny 指着一颗大苹果
- **剧情拍：**
  1. introduce：Bunny 说 “Look! An apple!”，展示苹果图
  2. ask：Bunny 问 “What's this?”，期望 apple / an apple
  3. ask：Bunny 说 “Say apple!”，再练一次
  4. introduce：苹果掉进篮子，“Yay! An apple!”
- **贴纸：** `sticker-apple`
- **资源：** `assets/scenes/orchard.png`、`assets/items/apple.png`、`assets/items/banana.png`（兜底干扰项）

## 第二关：香蕉林（Banana Grove）

- **id:** `fruit-02-banana`
- **目标词：** banana
- **场景：** 热带感香蕉林，成串黄香蕉；Bunny 踮脚够香蕉
- **剧情拍：**
  1. introduce：“Look! A banana!”
  2. ask：“What's this?” → banana / a banana
  3. ask：“Can you say banana?”
  4. introduce：香蕉放进篮子
- **贴纸：** `sticker-banana`
- **资源：** `assets/scenes/banana-grove.png`、`assets/items/banana.png`、`assets/items/apple.png`

## 第三关：橘子坡（Orange Hill）

- **id:** `fruit-03-orange`
- **目标词：** orange
- **场景：** 山坡橘树，橙色圆果；Bunny 滚着一个橘子玩
- **剧情拍：**
  1. introduce：“Look! An orange!”
  2. ask：“What's this?” → orange / an orange
  3. ask：“Say orange, please!”
  4. introduce：橘子进篮
- **贴纸：** `sticker-orange`
- **资源：** `assets/scenes/orange-hill.png`、`assets/items/orange.png`、`assets/items/grape.png`

## 第四关：葡萄架（Grape Vine）

- **id:** `fruit-04-grape`
- **目标词：** grape / grapes
- **场景：** 紫色葡萄藤架；Bunny 抬头看一串葡萄
- **剧情拍：**
  1. introduce：“Look! Grapes!”
  2. ask：“What are these?” → grape / grapes
  3. ask：“Say grapes!”
  4. introduce：葡萄进篮
- **贴纸：** `sticker-grape`
- **资源：** `assets/scenes/grape-vine.png`、`assets/items/grape.png`、`assets/items/orange.png`

## 第五关：草莓田（Strawberry Field）

- **id:** `fruit-05-strawberry`
- **目标词：** strawberry
- **场景：** 阳光草莓田，成排红草莓；Bunny 蹲下摘一颗
- **剧情拍：**
  1. introduce：“Look! A strawberry!”
  2. ask：“What's this?” → strawberry / a strawberry
  3. ask：“Say strawberry!”
  4. introduce：草莓进篮
- **贴纸：** `sticker-strawberry`
- **资源：** `assets/scenes/strawberry-field.png`、`assets/items/strawberry.png`、`assets/items/grape.png`

## 第六关：西瓜田（Watermelon Patch）

- **id:** `fruit-06-watermelon`
- **目标词：** watermelon
- **场景：** 绿叶西瓜田，大圆西瓜躺在地上；Bunny 轻轻拍拍西瓜
- **剧情拍：**
  1. introduce：“Look! A watermelon!”
  2. ask：“What's this?” → watermelon / a watermelon
  3. ask：“Say watermelon!”
  4. introduce：西瓜进篮（想象中的大篮子）
- **贴纸：** `sticker-watermelon`
- **资源：** `assets/scenes/watermelon-patch.png`、`assets/items/watermelon.png`、`assets/items/orange.png`

## 第七关：梨树园（Pear Orchard）

- **id:** `fruit-07-pear`
- **目标词：** pear
- **场景：** 柔和梨树园，树上挂着绿梨；Bunny 捧着一颗梨
- **剧情拍：**
  1. introduce：“Look! A pear!”
  2. ask：“What's this?” → pear / a pear
  3. ask：“Say pear!”
  4. introduce：梨进篮
- **贴纸：** `sticker-pear`
- **资源：** `assets/scenes/pear-orchard.png`、`assets/items/pear.png`、`assets/items/apple.png`

## 第八关：骑车小路（Bike Path）

- **id:** `fruit-09-bike`
- **目标词：** bike
- **场景：** 家庭骑车短视频短播后定格；Bunny 指着卡通自行车
- **剧情拍：**
  1. introduce：“Look! A bike!”
  2. ask：“What's this?” → bike / a bike
  3. ask：“Say bike!”
  4. introduce：展示卡通小骑手贴纸 “Yay! A bike!”
- **贴纸：** `sticker-rider-kid`
- **资源：** `assets/videos/tudouqiche.mp4`、`assets/scenes/bike-path.png`、`assets/items/bike.png`、`assets/items/rider-kid.png`

## 第九关：野餐草地（Picnic Party）

- **id:** `fruit-08-picnic`
- **目标词：** 复习 apple / strawberry / watermelon / pear（短句 hello 可选）
- **场景：** 格子野餐布，篮子满了；Bunny 邀请孩子一起吃
- **剧情拍：**
  1. introduce：“Hello! Let's picnic!”
  2. ask：指苹果 “What's this?” → apple
  3. ask：指草莓 “What's this?” → strawberry
  4. ask：指西瓜 “What's this?” → watermelon
  5. ask：指梨 “What's this?” → pear
  6. introduce：“Yay! Great job!” 撒花庆祝
- **贴纸：** `sticker-picnic`
- **资源：** `assets/scenes/picnic.png`、各水果图

## 共用资源

| 资源 id | 路径 | 说明 |
|---------|------|------|
| bunny | `assets/characters/bunny.png` | 向导角色 |
| map | `assets/scenes/map.png` | 冒险地图背景 |
| apple / banana / orange / grape / strawberry / watermelon / pear / bike / rider-kid | `assets/items/*.png` | 道具与贴纸原图 |
| tudouqiche | `assets/videos/tudouqiche.mp4` | 家庭骑车关场景视频 |

## 实现落点

- 关卡脚本 JSON：`content/levels/*.json`
- 内容包索引：`content/levels/pack.json`
- 图片/视频：`content/assets/**`（同步到 `apps/web/public/content/`）
