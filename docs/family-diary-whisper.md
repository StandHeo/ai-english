# 家庭日记：聊天台 + 端侧 Whisper

家庭制作台改为**按日聊天气泡**（可回放录音）。日记语音转写使用 **Capacitor 端侧 Whisper**；关卡口语继续走 **Vosk**（或现有关卡 ASR），两者隔离。

## 家长用法（Web / 手机浏览器）

1. 家长中心 → **家庭日记**
2. 首屏是聊天流：打字发送，或点「语音」录音（需 HTTPS：`npm run dev:phone`）
3. **浏览器没有端侧 Whisper**：会提示降级；录音仍可保存，请点气泡「改字」补转写
4. DeepSeek Key / 生成关卡 / 选图在折叠的 **生成与设置** 里

数据仍在本机 `localStorage`（`ai-english-family-v1`），按日 `messages[]`（text + 可选 audio）。

## App（APK）端侧 Whisper

插件：`apps/web/plugins/diary-whisper`（Capacitor 名 `DiaryWhisper`）。

1. 准备模型与 CLI（可用脚本一键拉取/编译）：

```bash
cd apps/web
npm run fetch-diary-whisper
```

会写入：

`apps/web/plugins/diary-whisper/android/src/main/assets/diary-whisper/`

- `ggml-tiny-q5_1.bin`（Whisper tiny 量化版）
- `whisper-cli`（本机用 Android NDK 交叉编译的 **arm64-v8a**）

2. 安装依赖并同步：

```bash
cd apps/web
npm install
npm run build
npx cap sync android
# 或一键：npm run build:android
# Android Studio 运行或打 debug APK
```

3. 首次语音会调用 `prepareModel`：把 assets 解包到应用私有目录，再本地转写。  
   **不会**把日记录音默认上传到云端 OpenAI Whisper。

未放入模型时：`isReady` / `prepareModel` 返回未就绪；UI 保留录音并提示手改文字。

> 仓库已包含 `ggml-tiny-q5_1.bin` 与 arm64 `whisper-cli`。换机器一般无需再下载；若缺失可跑 `npm run fetch-diary-whisper`。

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

**APK（有模型后）**

1. 录音 → 自动转写 → 杀进程重开仍可回放  
2. 确认网络面板无 OpenAI ASR 请求
