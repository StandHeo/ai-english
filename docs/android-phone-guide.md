# 在安卓手机上运行本项目（零安卓开发基础版）

你**不需要会写安卓代码**。推荐先用最简单的方式：手机浏览器打开电脑上跑的网页。想装成 App 图标再看后半部分。

---

## 先弄清两件事

本项目有两块：

| 名称 | 是什么 | 默认地址 |
|------|--------|----------|
| Web 前端 | 孩子玩的界面（地图、说话） | 电脑 `http://localhost:5173` |
| API 后端 | 语音识别 / 朗读相关服务 | 电脑 `http://localhost:8787` |

手机要能玩，这两块都要在**你的电脑上先跑起来**，并且手机和电脑最好连**同一个 Wi‑Fi**。

---

## 方式一：手机浏览器玩（推荐，最简单）

适合：先看效果、试玩关卡，不装 Android Studio。

### 1. 电脑上准备环境

1. 安装 [Node.js 20 或更高](https://nodejs.org/)（装 LTS 即可）。
2. 用 Git 把项目拉到电脑（或从 GitHub 下载 ZIP 解压）：

```bash
git clone https://github.com/StandHeo/ai-english.git
cd ai-english
git checkout main
git pull
```

### 2. 启动后端 API

打开一个终端：

```bash
cd apps/api
cp -n .env.example .env
npm install
npm run dev
```

看到类似 `listening on http://localhost:8787` 就对了。**这个窗口先别关。**

`.env` 里默认一般是：

- `ASR_PROVIDER=mock`：没有真实语音密钥时，方便联调（上传声音会按期望词判成功）。
- 真正儿童试玩再换成真实 ASR（需自行配置密钥，见 API 目录说明）。

### 3. 启动前端 Web

再开一个终端：

```bash
cd apps/web
npm install
npm run sync-content
npm run dev -- --host 0.0.0.0 --port 5173
```

注意：必须加 `--host 0.0.0.0`，手机才能访问你电脑；只写 `localhost` 时手机打不开。

终端里会出现：

- `Local: http://localhost:5173/`
- `Network: http://192.168.x.x:5173/` ← **记这个 Network 地址**

### 4. 查电脑的局域网 IP（若终端没显示 Network）

**Windows（PowerShell / CMD）：**

```bash
ipconfig
```

找「无线局域网适配器 WLAN」里的 `IPv4 地址`，例如 `192.168.1.23`。

**macOS：**

```bash
ipconfig getifaddr en0
```

**Linux：**

```bash
hostname -I
```

手机要打开的地址是：

```text
http://你的IP:5173
```

例如：`http://192.168.1.23:5173`

### 5. 手机操作

1. 手机连和电脑**同一 Wi‑Fi**（不要用访客网络隔离、不要电脑有线/手机 4G 混用却不通局域网）。
2. 用 **Chrome** 打开上面的 `http://IP:5173`。
3. 首页可选「水果森林」或「自行车世界」。
4. 说话：按住红色麦克风；若权限弹窗，选允许。
5. 麦克风不好用：关卡页**右下角小点** → 输入框里打单词（如 `apple` / `bike`）点 OK，一样能推进。

### 6. 若手机打不开页面

| 现象 | 可试办法 |
|------|----------|
| 一直转圈 / 无法访问 | 确认 `--host 0.0.0.0`；关电脑防火墙试一下；确认同一 Wi‑Fi |
| 能开界面但说话失败 | 确认 API 终端还在跑；手机访问的是电脑 IP，不是别人的 |
| Windows 防火墙拦截 | 允许 Node.js 专用网络访问，或临时关闭防火墙验证 |
| 公司/校园网隔离 | 换家里路由器热点，让电脑和手机都连这个热点 |

### 7. 语音接口说明（手机浏览器）

前端默认请求同源的 `/api`（开发时由 Vite 代理到电脑上的 `8787`）。  
用 `http://电脑IP:5173` 打开时，代理仍在电脑上，一般**不用改代码**。

若你改用 `npm run preview` 或其它静态托管，需要保证手机仍能访问到 API（进阶，见文末）。

---

## 方式二：装成安卓 App（可选，稍麻烦）

适合：想在手机桌面有个图标、或验证麦克风在 WebView 里的表现。  
需要安装 **Android Studio**（体积较大），但仍几乎不用手写安卓代码。

### 需要准备

- 电脑：Node.js 20+、[Android Studio](https://developer.android.com/studio)（安装时勾选 Android SDK）
- 建议 JDK 17（Android Studio 通常自带）
- 安卓手机：开启「开发者选项」→「USB 调试」，用数据线连电脑  
  （或用 Android Studio 自带模拟器，但麦克风体验不如真机）

### 步骤概要

在电脑上先保证 `apps/web` 能正常 `npm run build`：

```bash
cd apps/web
npm install
npm run sync-content
npm run build
```

首次把网页工程包进 Capacitor 安卓壳：

```bash
cd apps/web
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Fruit Forest" com.aienglish.fruitforest --web-dir dist
npx cap add android
npx cap copy
npx cap open android
```

之后每次改了前端内容，再执行：

```bash
cd apps/web
npm run build
npx cap copy
```

然后在 Android Studio 里：

1. 等待 Gradle 同步结束。
2. 顶部设备列表选你的手机。
3. 点绿色 Run ▶。
4. 手机上会安装并打开 Debug 版 App。

生成的安装包大致在：

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

可拷到手机里安装（需允许「安装未知应用」）。

### 麦克风权限

App 需要录音权限。若说话没反应，在手机系统设置 → 应用 → 本 App → 权限 → 打开麦克风。  
若清单里缺少权限，需在 `AndroidManifest.xml` 增加 `RECORD_AUDIO`（Capacitor 文档或 Android Studio 提示里会写）。

### App 连 API 的注意点

打成 App 后，请求不再走电脑 Vite 代理。需要任选其一：

- 开发期：把前端的 API 地址改成 `http://电脑局域网IP:8787`（且手机与电脑同网）；或  
- 把 API 部署到可公网访问的服务器，再改前端配置。

**不会改代码时，建议先用「方式一：浏览器」试玩。**

更偏工程细节的旧笔记见：[`android-capacitor.md`](./android-capacitor.md)。

---

## 日常怎么更新到最新代码

```bash
cd ai-english
git checkout main
git pull
```

然后重新：

```bash
# 终端 1
cd apps/api && npm install && npm run dev

# 终端 2
cd apps/web && npm install && npm run sync-content && npm run dev -- --host 0.0.0.0 --port 5173
```

手机浏览器**下拉刷新**或清缓存后再打开。

---

## 试玩时小提示

- 首页两个大图：水果 / 自行车主题。
- 地图左上角可回首页。
- 家长入口：右上角家庭图标 → 算术题 → 可看进度、调每日时长。
- 若进度乱了：手机浏览器里清除该站点数据，或换无痕窗口重开。
- 儿童路径是全英文界面；中文主要在家长页。

---

## 还是搞不定？

把下面信息记下来再排查（或发给协助你的人）：

1. 电脑系统（Windows / macOS）  
2. 手机能否打开 `http://电脑IP:5173`（能 / 不能）  
3. API 终端是否在跑  
4. 启动前端时用的完整命令（是否含 `--host 0.0.0.0`）  
5. 报错原文或截图  
