# 家庭日记：聊天台 + 端侧 Whisper

家庭制作台改为**按日聊天气泡**（可回放录音）。日记语音转写使用 **Capacitor 端侧 Whisper**；关卡口语继续走 **Vosk**（或现有关卡 ASR），两者隔离。

## 家长用法（Web / 手机浏览器）

1. 家长中心 → **家庭日记**
2. 首屏是聊天流：打字发送，或点「语音」录音（需 HTTPS：`npm run dev:phone`）
3. **浏览器没有端侧 Whisper**：会提示降级；录音仍可保存，请点气泡「改字」补转写
4. DeepSeek Key / 生成关卡 / 选图在折叠的 **生成与设置** 里

数据：元数据在本机 `localStorage`（`ai-english-family-v1`），按日 `messages[]`（text + 可选 `audioId`）；录音本体在 **IndexedDB**，避免稍长一点的语音撑爆配额。最长约 **180 秒**，到时限会自动截断并保存。

## App 端侧 Whisper（Android / iOS）

插件：`apps/web/plugins/diary-whisper`（Capacitor 名 `DiaryWhisper`）。

### Android

1. 准备资源：

   - 模型：`assets/diary-whisper/ggml-tiny-q5_1.bin`（默认）、`ggml-base-q5_1.bin`、`ggml-small-q5_1.bin`
   - CLI：`jniLibs/arm64-v8a/libwhisper_cli.so`（**不要**再拷到 `files/` 执行；Android 10+ 会 Permission denied）

```bash
cd apps/web
npm run fetch-diary-whisper
npm run build:android
```

2. 首次语音会调用 `prepareModel`：把 assets 解包到应用私有目录，再本地转写。

### iOS

1. 准备资源（**iOS 16.4+**）：

   - 模型：`ios/Resources/diary-whisper/ggml-*.bin`
   - 框架：`ios/Frameworks/whisper.xcframework`

```bash
cd apps/web
npm run fetch-diary-whisper -- --ios-only
# 或 npm run build:ios
```

2. iOS 使用 whisper.cpp XCFramework 的 C API（不再依赖 CLI）；API 与 Android 相同。

**两端都不会**把日记录音默认上传到云端 OpenAI Whisper。

**切换模型对比**：家庭日记 → 展开「生成与设置」→ **语音转写模型**，在 Tiny / Base / Small 之间切换后各录一段对比。

未放入模型时：`isReady` / `prepareModel` 返回未就绪；UI 保留录音并提示手改文字。

## 与关卡 Vosk 的隔离

| 场景 | 引擎 |
|------|------|
| 家庭日记语音气泡 | 端侧 Whisper（本插件） |
| 关卡拍练习口语 | Vosk / 现有 `usePressToTalk` 路径 |

日记适配层：`apps/web/src/voice/diaryAsr.ts`。不要把关卡识别改接到 `DiaryWhisper`。

## 冒烟建议

**Web**

1. 打开制作台 → 发两条文字气泡 → 展开「生成与设置」→ mock/真 Key 生成关卡  
2. 日历：有关卡的日子着色；有语音的日子带小圆点（浏览器可先跳过语音）

**APK / iOS App（有模型后）**

1. 录音 → 自动转写 → 杀进程重开仍可回放  
2. 确认网络面板无 OpenAI ASR 请求
