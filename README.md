# AI English · 水果森林口语冒险（MVP）

面向 4–6 岁儿童的全英沉浸故事冒险口语练习。Android 优先（Web + Capacitor），先验证「孩子愿不愿意反复说」。

## 仓库结构

```
apps/web          # React + Vite 儿童/家长端
apps/api          # Express：ASR/TTS 代理与期望词匹配
content/levels    # 关卡 JSON 脚本 + pack（水果森林含家庭骑车关）
content/assets    # 角色/水果/场景图片与家庭视频
openspec/         # 产品规格与变更
```

## 水果森林剧情

见 OpenSpec 文档：`openspec/changes/kids-story-oral-english-mvp/content/fruit-forest-story.md`

1. 苹果园 apple → 2. 香蕉林 banana → 3. 橘子坡 orange → 4. 葡萄架 grapes → 5. 草莓田 strawberry → 6. 西瓜田 watermelon → 7. 梨树园 pear → 8. 骑车小路 bike → 9. 野餐复习

> 若本地进度是在加入骑车关之前通关的，地图解锁顺序可能错位；可在浏览器清除本站 `localStorage` 后重玩。

## 本地运行

```bash
# 终端 1：API
cd apps/api
cp .env.example .env
npm install
npm run dev

# 终端 2：Web
cd apps/web
npm install
# 同步内容资源（改关卡/图片后执行）
npm run sync-content
npm run dev
```

浏览器打开 Vite 提示的地址（默认 `http://localhost:5173`）。

- 儿童地图无中文；点关卡进入故事。
- 按住红色麦克风说话；松开后由 API 匹配（`ASR_PROVIDER=mock` 时：上传音频会按期望词视为成功，便于无密钥联调）。
- 麦克风不可用时，关卡页右下角小点可打开开发输入框，手动输入 `apple` 等词测试。
- 家长入口：地图右上角家庭图标 → 算术门禁 → 中文进度与每日时长。

## 内容校验

```bash
node content/validate.mjs
```

## Capacitor / Android APK

详见 [`docs/android-capacitor.md`](docs/android-capacitor.md)。

当前默认继续走 **Capacitor + Web**（未因尖刺切换到 Expo）。真机 ASR 需配置真实 `ASR_PROVIDER` 与密钥。

## 本变更明确不做

- iOS 上架、账号体系、付费
- 开放自由聊天、AI 脚本自动上线（无人工审核）
- 完整课程中台

## OpenSpec

变更名：`kids-story-oral-english-mvp`。规划产物在 `openspec/changes/kids-story-oral-english-mvp/`。
