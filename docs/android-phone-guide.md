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

### 3. 启动前端 Web（手机要用 HTTPS）

再开一个终端。**若要在手机上真正用麦克风说话**，请用：

```bash
cd apps/web
npm install
npm run dev:phone
```

这会启用 HTTPS，并监听局域网（`--host 0.0.0.0`）。

终端里会出现类似：

- `Local: https://localhost:5173/`
- `Network: https://192.168.x.x:5173/` ← **记这个 Network 地址（注意是 https）**

> 只用电脑浏览器玩、暂不测麦克风时，仍可用 `npm run dev`（`http://localhost:5173`）。  
> 手机若打开 `http://192.168…`（没有 s），Chrome **通常禁止麦克风**，会表现为「点了说话却收不到语音」。

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

手机要打开的地址是（推荐 HTTPS）：

```text
https://你的IP:5173
```

例如：`https://192.168.1.23:5173`

### 5. 手机操作

1. 手机连和电脑**同一 Wi‑Fi**（不要用访客网络隔离、不要电脑有线/手机 4G 混用却不通局域网）。
2. 用 **Chrome** 打开上面的 `https://IP:5173`。
3. 第一次会提示「证书不受信任 / 连接不是私密连接」——点「高级」→「继续访问」（开发自签证书，家里局域网可接受）。
4. 进入关卡后，**点一下**红色麦克风（不要只轻点就离开页面）→ 提示「正在听」后大声说英语 → 约 3 秒自动结束（或再点一次结束）。若弹出权限，选**允许**。
5. 仍不好用：看页面上的黄色提示条；或点**右下角小点**输入单词（如 `apple` / `bike`）点 OK。

> 地址栏必须是 **`https://`**。若仍是 `http://`，麦克风一定不可用。

### 6. 若手机打不开页面 / 不能说话

| 现象 | 可试办法 |
|------|----------|
| 一直转圈 / 无法访问 | 确认用了 `npm run dev:phone`；关电脑防火墙试一下；确认同一 Wi‑Fi |
| 证书警告不敢进 | 开发环境可点「继续访问」；或改用下方「Chrome 信任不安全来源」临时方案 |
| 能开界面但说话没反应 | 是否用了 **https**（不是 http）？是否允许麦克风？API 终端是否在跑？ |
| 提示「不是安全连接」 | 换 `https://IP:5173`，或见下一小节 |
| Windows 防火墙拦截 | 允许 Node.js 专用网络访问，或临时关闭防火墙验证 |
| 公司/校园网隔离 | 换家里路由器热点，让电脑和手机都连这个热点 |

### 7. 为什么手机 http 不能说话？

浏览器规定：只有 **安全上下文**（`https://…` 或电脑上的 `http://localhost`）才能开麦克风。  
手机访问 `http://192.168.x.x` **不算**安全上下文，所以收不到你的语音——这不是你操作错了。

**推荐**：电脑跑 `npm run dev:phone`，手机开 `https://电脑IP:5173`。

**备选（临时）**：安卓 Chrome 打开 `chrome://flags`，搜索 *Insecure origins treated as secure*，把 `http://你的IP:5173` 加进去，Relaunch 后再用 http 打开（仅自家调试）。

### 8. 语音识别说明

- 手机在 HTTPS 下，会优先用 **浏览器自带英语语音识别**（按住说话，松开后匹配关卡单词）。
- 后端默认 `ASR_PROVIDER=mock`：若只有录音、没有识别文本，会用期望词做联调；**真正听你说了什么**，靠浏览器识别文本或配置 `ASR_PROVIDER=openai` + `ASR_API_KEY`。
- 前端默认请求同源 `/api`（Vite 代理到电脑 `8787`），一般不用改代码。

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
cd apps/web && npm install && npm run sync-content && npm run dev:phone
```

手机浏览器打开 **`https://电脑IP:5173`**（证书警告选继续访问），再下拉刷新。

---

## 试玩时小提示

- 首页多个大图主题：水果 / 自行车 / 机器人 / 英雄 / 小狗救援。
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
