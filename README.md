# AI English · 故事冒险口语练习

面向 4–6 岁儿童的全英沉浸故事冒险口语练习。Android 优先（Web + Capacitor）。首页可选 **水果森林**、**自行车世界**、**机器人实验室**、**英雄世界**、**小狗救援队**、**钓鱼日**、**游泳日**。

## 仓库结构

```
apps/web          # React + Vite 儿童/家长端
apps/api          # Express：ASR/TTS 代理与期望词匹配
content/levels    # 关卡 JSON + packs/（fruit / bike / robot / hero / pup / fishing / swim）
content/assets    # 角色/道具/场景图片与家庭视频
openspec/         # 产品规格与变更
docs/             # 使用说明与技术方案
```

**整体技术方案（架构 / 双轨语音 / 家庭日记 / 本地存储）：**  
→ **[`docs/tech-architecture.md`](docs/tech-architecture.md)**  
→ 家长视角体验与待定：[`docs/parent-child-ux-notes.md`](docs/parent-child-ux-notes.md)  
→ 竞品分析：[`docs/competitive-analysis.md`](docs/competitive-analysis.md)

## 主题包

### 水果森林

见 `openspec/changes/kids-story-oral-english-mvp/content/fruit-forest-story.md`

苹果 → 香蕉 → 橘子 → 葡萄 → 草莓 → 西瓜 → 梨 → 野餐

### 自行车世界

见 `openspec/changes/bike-world-pack/content/bike-world-story.md`

bike → tricycle → mountain bike → road bike → helmet → bell → go/ride（家庭视频）→ 复习

### 机器人实验室

见 `openspec/changes/robot-ultraman-packs/content/robot-lab-story.md`

robot → arm → wheel → button → beep → gear → friend → 复习

### 英雄世界（奥特曼风格 · 原创形象）

见 `openspec/changes/robot-ultraman-packs/content/hero-world-story.md`

hero → monster → light → fly → kick → shield → go → 复习

### 小狗救援队（汪汪队风格 · 原创形象）

见 `openspec/changes/pup-patrol-pack/content/pup-patrol-story.md`

pup → dog → truck → badge → hat → bone → help → 复习

### 钓鱼日

鱼（fish）→ 鱼竿（rod）→ 河（river）→ 遮阳伞（umbrella）→ 遮阳帽（hat）→ 鱼汤（soup）→ 蓝天白云（sky/cloud）→ 青草野餐复习

首关使用家庭实拍 `assets/scenes/diaoyu1.jpeg` 与短视频 `assets/videos/diaoyu.mp4`（约 6 秒）。

### 游泳日

游泳池（pool）→ 泳镜（goggles）→ 泳帽（cap）→ 游泳圈（ring）→ 踢腿（kick）→ 水（water）→ 鱼（fish）→ 泳池派对复习

> 难词泳姿（蛙泳 / 仰泳 / 蝶泳）已换成 4 岁可说的短词。  
> 英雄与小狗均为原创卡通风格，不使用官方商标角色名。进度按主题包分桶；若解锁异常可清除本站 `localStorage` 后重玩。

## 本地运行

```bash
# 终端 1：API
cd apps/api
cp -n .env.example .env
npm install
npm run dev

# 终端 2：Web（仅电脑）
cd apps/web
npm install
npm run sync-content
npm run dev

# 手机要测麦克风时，改用：
# npm run dev:phone
# 然后手机 Chrome 打开 https://电脑局域网IP:5173 （证书警告点继续访问）
```

浏览器打开 Vite 地址（默认 `http://localhost:5173`；手机请用 `https://…`，见 [`docs/android-phone-guide.md`](docs/android-phone-guide.md)）。

- 首页点主题大图进入对应地图；地图左上角返回首页。
- 按住红色麦克风说话；`ASR_PROVIDER=mock` 时便于联调。
- 麦克风不可用：关卡页右下角小点 → 开发输入框。
- 家长入口：首页/地图右上角家庭图标。

## 内容校验

```bash
node content/validate.mjs
```

## 在安卓手机上玩

**不会安卓开发也没关系**，推荐用手机浏览器打开电脑上的页面：

→ 详见 **[`docs/android-phone-guide.md`](docs/android-phone-guide.md)**

## 在 iPhone 上玩

**不会 iOS 开发也没关系**（需一台 Mac）。可先用 Safari 打开电脑网页，再按需用 Xcode 装到自己手机（不上架）：

→ 详见 **[`docs/ios-phone-guide.md`](docs/ios-phone-guide.md)**  
→ Capacitor 工程笔记：[`docs/ios-capacitor.md`](docs/ios-capacitor.md)

## 家庭日记关卡（当晚生成）

家长聊「今天做了什么」→ DeepSeek 生成关卡 → 家庭日历游玩：

→ 详见 **[`docs/family-day-studio.md`](docs/family-day-studio.md)**  
→ 聊天气泡 + 端侧 Whisper：**[`docs/family-diary-whisper.md`](docs/family-diary-whisper.md)**

## 英语朗读声音

App 默认 **Sherpa-ONNX + Piper** 离线朗读；家长中心可改选系统 TTS。浏览器联调仍为系统朗读。家长中心可切换 persona 并微调语速与音调。

→ [`docs/piper-tts.md`](docs/piper-tts.md)

（可选）打成 APK 的 Capacitor 笔记：[`docs/android-capacitor.md`](docs/android-capacitor.md)。  
（可选）iPhone 侧载：[`docs/ios-phone-guide.md`](docs/ios-phone-guide.md)。

## Capacitor / Android APK

偏工程向的简要步骤见 [`docs/android-capacitor.md`](docs/android-capacitor.md)。零基础请先看手机运行指南。

## Capacitor / iOS（本机侧载）

零基础请看 [`docs/ios-phone-guide.md`](docs/ios-phone-guide.md)；工程细节见 [`docs/ios-capacitor.md`](docs/ios-capacitor.md)。

## OpenSpec

活跃变更包括 `family-diary-chat-whisper`、`family-day-studio`、`pup-patrol-pack` 等。
