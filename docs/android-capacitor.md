# Android（Capacitor）构建说明

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

确保 `AndroidManifest.xml` 含 `RECORD_AUDIO`。Capacitor 新项目通常需在权限插件或清单中声明。

## 技术选型结论（任务 3.5）

MVP 继续使用 **Capacitor + Web**，以匹配后端/HTML 技术栈、缩短验证周期。若真机录音链路无法稳定打通，再评估 Expo。

## 未在本环境完成的项

- 本机若未安装 Android SDK，无法在此直接产出 APK；请按上文在本地 Android Studio 构建。
- 真机儿童试玩与 ASR 词表微调需在有孩子的环境完成。
