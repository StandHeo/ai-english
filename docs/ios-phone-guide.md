# 在 iPhone 上运行本项目（零 iOS 开发基础版）

你**不需要会写 Swift / 上架 App Store**。目标只要：自己的 Mac + 自己的 iPhone 能玩。

推荐顺序：

1. **先用 Safari 打开电脑网页**（最快验证）
2. 再按需用 **Xcode 装成手机上的 App**（可离线打开已打包内容；不上架）

更偏工程的 Capacitor 说明见 [`ios-capacitor.md`](./ios-capacitor.md)。

---

## 先弄清两件事

| 名称 | 是什么 | 默认地址 |
|------|--------|----------|
| Web 前端 | 孩子玩的界面 | 电脑 `http://localhost:5173` |
| API 后端 | 语音匹配等（可选） | 电脑 `http://localhost:8787` |

手机浏览器试玩时：电脑要跑前端；若走 mock/云端 ASR，后端也要跑。  
打成 **iOS App 离线玩关卡** 时：关卡内容打进包里；朗读优先 **Piper**（未拉模型或失败则系统 TTS）；日记可用端侧 **Whisper**（需在 Mac 上跑 `build:ios` 拉模型）。

---

## 方式一：iPhone Safari 玩（推荐先做）

适合：先看效果、试钓鱼日实拍视频，不装 Xcode 工程。

### 1. Mac 上准备

1. 安装 [Node.js 20+ LTS](https://nodejs.org/)。
2. 拉取代码：

```bash
git clone https://github.com/StandHeo/ai-english.git
cd ai-english
git checkout main
git pull
```

### 2. 启动 API（可选，但建议开着）

```bash
cd apps/api
cp -n .env.example .env
npm install
npm run dev
```

保持这个终端窗口开着。

### 3. 启动前端（手机麦克风要用 HTTPS）

新开一个终端：

```bash
cd apps/web
npm install
npm run dev:phone
```

终端里找 **Network** 地址，形如：

`https://192.168.x.x:5173/`

### 4. iPhone 打开

1. iPhone 和 Mac 连 **同一个 Wi‑Fi**。
2. Safari 地址栏输入上面的 `https://192.168.…:5173`。
3. 首次可能提示「证书不受信任」：点高级 → 继续访问（仅局域网开发用）。
4. 需要说话时，Safari 会问麦克风权限 → 允许。

> 用 `http://`（没有 s）时，iOS Safari 往往不给麦克风。请用 `npm run dev:phone`。

关卡、钓鱼日照片/视频、家长中心都可以在这种方式下试。

---

## 方式二：装成 iPhone 上的 App（不上架）

适合：想在桌面有图标、少依赖电脑浏览器；**仅自己设备使用**。

### 你需要准备

| 物品 | 说明 |
|------|------|
| Mac | 你已有 |
| [Xcode](https://apps.apple.com/app/xcode/id497799835) | Mac App Store 免费安装（体积很大，需等下载） |
| iPhone + 数据线 | 用于真机运行 |
| Apple ID | 登录 Xcode；免费账号可装自己手机，证书大约 **7 天**要重签一次 |

不上架 App Store，**不需要**付费开发者账号也能先玩；若要长期装在手机上不每周重签，再考虑加入 [Apple Developer Program](https://developer.apple.com/programs/)（年费）。

### 步骤总览（第一次）

在 Mac 终端执行：

```bash
cd /path/to/ai-english
git checkout main
git pull

cd apps/web
npm install
npm run build

# 若还没有 ios 工程目录（仓库默认不提交 ios/）：
npx cap add ios

# 把最新网页资源同步进 iOS 工程
npm run build:ios
# 等价于：npm run build && npx cap sync ios

# 用 Xcode 打开
npx cap open ios
```

### 在 Xcode 里点几下（截图式说明）

1. 左侧点最上方的工程 **App**（蓝色图标）。
2. 中间选 **Signing & Capabilities**：
   - 勾选 **Automatically manage signing**
   - **Team**：选你的 Apple ID（没有就点 Add Account 登录）
3. 顶部设备列表选你的 **真机 iPhone**（手机解锁、信任此电脑）。
4. 第一次真机：iPhone 上 **设置 → 通用 → VPN 与设备管理**，信任你的开发者 App。
5. 点左上角 **▶ Run**。

装成功后，主屏幕会出现 **Fruit Forest**（或你改过的 App 名）。

### 以后改了网页代码再装

```bash
cd apps/web
npm run build:ios
npx cap open ios
# Xcode 再点 ▶ Run
```

### 麦克风权限（必做一次）

`npx cap add ios` / `cap sync ios` 之后，**必须**有麦克风说明，否则 iPhone 上 `mediaDevices` 为空，会误报「非安全页面」。

在 `apps/web` 执行：

```bash
npm run patch:ios-plist
# 或完整：npm run build:ios   # 已自动包含 patch
```

也可在 Xcode 打开 `apps/web/ios/App/App/Info.plist` 手动增加：

| Key | Type | Value（示例） |
|-----|------|----------------|
| `Privacy - Microphone Usage Description` | String | `用于关卡英语口语练习` |

对应原始键名：`NSMicrophoneUsageDescription`。改完后 **重新 Run**（最好先卸载旧 App 再装，让系统重新弹权限）。

---

## iOS App 和安卓 App 的差别（心里有数）

| 能力 | iOS（当前） | Android |
|------|-------------|---------|
| 关卡 / 地图 / 钓鱼日实拍 | ✅ | ✅ |
| 系统英文朗读 | ✅（Piper 失败时降级） | ✅（可降级） |
| Piper 神经音 | ✅（`build:ios` 拉模型后） | ✅ |
| 日记端侧 Whisper | ✅（iOS 16.4+；需拉 ggml） | ✅ |
| 关卡 Vosk 离线识别 | 视 WebView 表现；不行可用点选/手输 | ✅ 已接 |

家长中心里可读引擎选 **Piper** 或 **系统 TTS**；首次侧载请用 `npm run build:ios` 再 Xcode Run。

---

## 常见问题

### 1. Xcode 太大下不动？

先用 **方式一 Safari**。Xcode 可晚上挂机从 App Store 下。

### 2. Run 报 Signing / Team 错误？

确认 Signing 里已登录 Apple ID，Bundle Identifier 与仓库一致：`com.aienglish.fruitforest`。若提示被占用，可在 Xcode 改成 `com.你的名字.fruitforest`（仅本机调试即可）。

### 3. 手机提示「未受信任的开发者」？

**设置 → 通用 → VPN 与设备管理** → 点你的 Apple ID → 信任。

### 4. 免费账号装上几天打不开了？

免费描述文件约 7 天过期。用数据线连回 Mac，Xcode 再 ▶ Run 一次即可。

### 5. 想连家里电脑的 API？

开发期可在 `capacitor.config.ts` 里临时配置 `server.url` 指向 Mac 的局域网地址（见 [`ios-capacitor.md`](./ios-capacitor.md)）。正式离线玩关卡一般**不需要**开 API。

### 6. 模拟器可以吗？

可以，但麦克风/部分语音能力真机更准。儿童试玩请用真机。

### 7. 打开工程提示「future Xcode project file format」？

含义：`ios` 工程是用**更新的 Xcode** 生成的，你现在打开用的 Xcode **偏旧**，读不了新格式。

**推荐做法（最省事）：**

1. 打开 Mac **App Store** → 更新 **Xcode** 到最新，装完重启一次。
2. 终端确认版本（建议 **15+**，能更新到 16 更好）：

```bash
xcodebuild -version
```

3. 再执行：

```bash
cd ~/repo/ai-english/apps/web   # 按你本机路径改
npx cap open ios
```

**若暂时不能升级 Xcode**（磁盘不够 / 系统太旧）：

1. 删掉旧工程重来（会丢掉本机 ios 目录，可再生成）：

```bash
cd ~/repo/ai-english/apps/web
rm -rf ios
npm run build
npx cap add ios
npm run build:ios
```

2. 若仍报同样错误，说明当前 Capacitor 生成的格式仍新于你的 Xcode → **只能升级 Xcode**，或换一台已装新 Xcode 的 Mac。
3. 也可在本机用「较新 Xcode」打开一次该工程，在 Xcode 菜单 **File → Project Settings…**（或工程 Inspector）把 **Project Format** 改成与你旧版兼容的版本后再用旧 Xcode 打开——但新手更建议直接升级 Xcode。

> 你当前报错路径形如：`.../apps/web/ios/App/App.xcodeproj`，正是本机 `cap add ios` 生成的工程，不是仓库里提交的文件。

---

## 相关文档

- Capacitor iOS 工程细节：[`ios-capacitor.md`](./ios-capacitor.md)
- 安卓对照：[`android-phone-guide.md`](./android-phone-guide.md)
- 朗读：[`piper-tts.md`](./piper-tts.md)
- 日记 Whisper：[`family-diary-whisper.md`](./family-diary-whisper.md)
