# MVP 五关剧情：水果森林大冒险（Fruit Forest）

**主题：** 水果（fruits）  
**向导角色：** Bunny（小兔向导）  
**地图：** 一条通往野餐草地的林间小路，五处果园节点线性解锁  

## 总故事线

小兔 Bunny 要准备一场森林野餐，但篮子是空的。孩子跟着 Bunny 走过五处果园，用英语说出水果名字，帮 Bunny 把水果装进篮子。最后大家在草地上开野餐派对。

```
起点小屋 ──▶ 苹果园 ──▶ 香蕉林 ──▶ 橘子坡 ──▶ 葡萄架 ──▶ 野餐草地
              Lv1        Lv2        Lv3        Lv4        Lv5
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

## 第五关：野餐草地（Picnic Party）

- **id:** `fruit-05-picnic`
- **目标词：** 复习 apple / banana / orange（短句 hello 可选）
- **场景：** 格子野餐布，篮子满了；Bunny 邀请孩子一起吃
- **剧情拍：**
  1. introduce：“Hello! Let's picnic!”
  2. ask：指苹果 “What's this?” → apple
  3. ask：指香蕉 “What's this?” → banana
  4. ask：指橘子 “What's this?” → orange
  5. introduce：“Yay! Great job!” 撒花庆祝
- **贴纸：** `sticker-picnic`
- **资源：** `assets/scenes/picnic.png`、各水果图

## 共用资源

| 资源 id | 路径 | 说明 |
|---------|------|------|
| bunny | `assets/characters/bunny.png` | 向导角色 |
| map | `assets/scenes/map.png` | 冒险地图背景 |
| apple / banana / orange / grape | `assets/items/*.png` | 水果道具与贴纸原图 |

## 实现落点

- 关卡脚本 JSON：`content/levels/*.json`
- 内容包索引：`content/levels/pack.json`
- 图片：`content/assets/**`（同步到 `apps/web/public/content/`）
