# Android（Capacitor）工程笔记

> **不会安卓开发、只想在手机上玩：** 请先看  
> **[`android-phone-guide.md`](./android-phone-guide.md)**（浏览器直连电脑，最简单）。  
> 下文给「要打 APK / 用 Android Studio」时用。

## 前提

- Node.js 20+
- Android Studio + SDK
- JDK 17

## 步骤

```bash
cd apps/web
npm install
npm run sync-content
npm run build

# 首次
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Fruit Forest" com.aienglish.fruitforest --web-dir dist
npx cap add android
npx cap copy
npx cap open android
```

在 Android Studio 中连接真机或模拟器，Run 即可得到可侧载的 Debug APK：

`apps/web/android/app/build/outputs/apk/debug/app-debug.apk`

## 麦克风权限

确保 `AndroidManifest.xml` 含：

- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`（离线 Vosk 采集建议声明）

## 离线语音（Vosk，仅 App）

安卓 App 内使用 **Vosk（monosklet WASM）** 做英语短词识别；手机浏览器仍走 Web Speech / 手动输入。

```bash
cd apps/web
npm run fetch-vosk-model   # 生成 public/models/en-us-small.tar（约 40–70MB）
npm run build
npx cap sync android
# 或一键：npm run build:android
```

首次进关卡会加载模型；识别结果界面会标注「来源：App 离线 Vosk」。

## 技术选型结论（任务 3.5）

MVP 继续使用 **Capacitor + Web**，以匹配后端/HTML 技术栈、缩短验证周期。若真机录音链路无法稳定打通，再评估 Expo。

## 未在本环境完成的项

- 云端构建环境若未装 Android SDK，无法在此直接产出 APK；请在本地 Android Studio 构建。
- 真机儿童试玩与 ASR 词表微调需在有孩子的环境完成。
