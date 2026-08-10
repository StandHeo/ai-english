# iOS（Capacitor）工程笔记

> **零基础、只想在自己 iPhone 上玩：** 请先看  
> **[`ios-phone-guide.md`](./ios-phone-guide.md)**。  
> 下文给「已装 Xcode、要维护 ios 工程」时用。

## 目标与非目标

- **目标：** Mac + Xcode 真机侧载；不上架 App Store。
- **非目标（首版）：** Piper iOS 插件、日记 Whisper iOS、TestFlight/上架审核。

## 前提

- macOS + Xcode（含 Command Line Tools）
- Node.js 20+
- 本机 CocoaPods（`cap sync ios` 时常需要；Xcode 新版多会提示安装）

```bash
# 若 pod 命令不存在，可按 Xcode / CocoaPods 官方说明安装
pod --version
```

## 首次生成 ios 工程

仓库 **不提交** `apps/web/ios/`（见根目录 `.gitignore`，与 `android/` 一样本机生成）。

```bash
cd apps/web
npm install
npm run build
npx cap add ios          # 仅第一次
npx cap sync ios
npx cap open ios
```

一键同步脚本：

```bash
npm run build:ios        # build + cap sync ios
```

`appId` / 名称见 `capacitor.config.ts`：

- `appId`: `com.aienglish.fruitforest`
- `appName`: `Fruit Forest`
- `webDir`: `dist`

## 麦克风 Info.plist

在 `ios/App/App/Info.plist` 增加：

```xml
<key>NSMicrophoneUsageDescription</key>
<string>用于关卡英语口语练习</string>
```

Xcode 图形界面：Target → Info → 自定义 iOS 目标属性 → `+` → Privacy - Microphone Usage Description。

## 本地开发连 Mac 上的 Vite（可选）

调试时不想每次 `build`，可在 **本机临时** 改 `capacitor.config.ts`：

```ts
server: {
  url: 'https://192.168.x.x:5173', // Mac 的 npm run dev:phone 地址
  cleartext: true,
  iosScheme: 'https',
},
```

然后 `npx cap sync ios` 再 Run。  
**注意：** 不要把带局域网 IP 的配置提交进仓库；用完删掉 `server.url`。

## 与 Android 能力对照

| 模块 | iOS |
|------|-----|
| Web 关卡 / 资源 / 实拍视频 | 同步进 WebView |
| `@capacitor-community/text-to-speech` | 可用（系统音） |
| `piper-tts` 本地插件 | 无 iOS 实现 → 自动不可用 |
| `diary-whisper` | 无 iOS 实现 → 日记 ASR 降级 |
| Vosk（monosklet） | 依赖 WebView/WASM；不稳时用手输/点选 |

朗读路由见 `apps/web/src/voice/client.ts`：原生优先 Piper，失败或未就绪走系统 TTS。

## 常见构建问题

1. **Signing**：Automatic + 个人 Team；Bundle Id 冲突则改后缀。
2. **pod install 失败**：翻墙/换 Ruby 源后，在 `apps/web/ios/App` 再执行 `pod install`。
3. **白屏**：先确认 `npm run build` 成功且 `dist/` 有内容，再 `cap sync ios`。
4. **ATS / 局域网 HTTP**：开发连家用 API 时，可能需在 Info.plist 放宽本地网络或继续用 `CapacitorHttp`；离线关卡可不管。

## 云端说明

Linux 云端环境通常 **不能** 产出可安装的 `.ipa` / 真机签名包；请在你的 Mac 上执行本文步骤。
