# Android 侧载升级

App 内不接应用商店。服务器放一份静态清单和最新 APK，家长中心手动点「立即升级」。不做 iOS。不强制更新，失败时不弹错误。

清单地址（与会员 API 同一台机器，**不是** `/api`）：

`http://118.24.164.40/app/version.json`

APK 示例：

`http://118.24.164.40/app/tudoudou-aienglish.apk`

## version.json

```json
{
  "versionCode": 1,
  "versionName": "1.0",
  "apkUrl": "http://118.24.164.40/app/tudoudou-aienglish.apk",
  "notes": ""
}
```

| 字段 | 要求 |
| --- | --- |
| `versionCode` | 正整数。必须与打进 APK 的 `versionCode` 一致，且大于手机里已装的版本才会出现「有新版本」 |
| `versionName` | 给人看的版本名，如 `1.1` |
| `apkUrl` | `http` 或 `https` 的 APK 直链 |
| `notes` | 可选，家长中心里跟在版本名后面 |

当前仓库默认包是 `versionCode=1` / `versionName=1.0`。清单也先写 `1`，已装这个包的手机不会被打扰。下次发新包再一起改成 `2`。

`version.json` 不要长期缓存。APK 可以用普通静态文件缓存。

## 服务器目录

与现有 `wechat-apk-install.html` 放在**同一站点根**下的 `app/`。该说明页是 `http://118.24.164.40/wechat-apk-install.html`，所以清单必须能用 `http://118.24.164.40/app/version.json` 打开。

常见 nginx `root`：

- `/var/www/html/app/`（站点根是 `/var/www/html`）
- `/var/www/tudoudou/app/`（站点根是 `/var/www/tudoudou`）

先在服务器上看静态文件实际落在哪：

```bash
# 找到 wechat-apk-install.html 所在目录，app/ 与它同级
sudo find /var/www /usr/share/nginx -name 'wechat-apk-install.html' 2>/dev/null
```

若站点根已经能直接吐 html，只要建 `app/` 子目录，不必改 nginx。若 `/app/` 被别的 `location` 抢走，再加一段（把 `alias` 换成上面找到的真实目录）：

```nginx
location /app/ {
  alias /var/www/html/app/;
  types {
    application/json json;
    application/vnd.android.package-archive apk;
  }
  default_type application/octet-stream;
  add_header Cache-Control "no-cache";
}
```

不要把这两个文件放到只反代 `/api/` 的目录里。清单不依赖 `apps/api` 代码。

上传后自测：

```bash
curl -fsS http://118.24.164.40/app/version.json
curl -fsSI http://118.24.164.40/app/tudoudou-aienglish.apk
```

## 本机打 APK 再传到服务器

`android/` 不入库。版本号写在本机工程里，Capacitor `App.getInfo().build` 读的就是这个 `versionCode`。

```bash
cd apps/web
npm install
npm run build:android
```

用 Android Studio 打开 `apps/web/android`，先改 `android/app/build.gradle` 的 `defaultConfig`：

```gradle
versionCode 2
versionName "1.1"
```

再 Build > Build APK(s)。产物一般是：

`apps/web/android/app/build/outputs/apk/debug/app-debug.apk`

然后在本机执行（路径按上一节 `find` 的结果替换；用户按服务器实际账号）：

```bash
ssh user@118.24.164.40 'mkdir -p /var/www/html/app'

scp apps/web/android/app/build/outputs/apk/debug/app-debug.apk \
  user@118.24.164.40:/var/www/html/app/tudoudou-aienglish.apk
```

同一目录写 `version.json`（`versionCode` / `versionName` 与 gradle 里相同）：

```bash
cat > /tmp/version.json <<'EOF'
{
  "versionCode": 2,
  "versionName": "1.1",
  "apkUrl": "http://118.24.164.40/app/tudoudou-aienglish.apk",
  "notes": "本次更新说明"
}
EOF

scp /tmp/version.json user@118.24.164.40:/var/www/html/app/version.json
```

## App 行为

- 只在 **Android** 上检查。进家长中心（通过算术门禁）时拉清单，约 8 秒超时；失败、JSON 坏、版本不更高，都不显示。
- 有更新：家长中心顶部出现「有新版本」、版本名、可选 `notes`、「下载后点安装」、「立即升级」和「稍后」。不挡儿童首页，也不能跳过门禁。
- 「稍后」只藏起这一次停留。不强制。
- 「立即升级」：插件把 APK 下到应用缓存，用 FileProvider 打开系统安装界面。Android 8+ 若还没允许本应用安装未知应用，会先打开系统设置，返回后再点一次。下载失败则用浏览器打开 `apkUrl`，仍提示「下载后点安装」。
- 未知来源的系统开关说明见 [`wechat-apk-install.md`](./wechat-apk-install.md)。

插件源码在 `apps/web/plugins/apk-install`，`npm run build:android` 里的 `cap sync` 会带上。清单权限 `REQUEST_INSTALL_PACKAGES` 由插件合并进 APK，不用手改 `AndroidManifest.xml`。
