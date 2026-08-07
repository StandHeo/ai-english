# 离线 Vosk 英文模型目录

打安卓 APK 前请生成模型文件（约 40MB，不进 git）：

```bash
cd apps/web
npm run fetch-vosk-model
# 或一键：npm run build:android
```

成功后应出现：`en-us-small.tar`

然后再：

```bash
npm run build
npx cap sync android
```

说明：网页端浏览器**不会**用这个模型；只有 Capacitor 安卓 App 会走离线 Vosk。
