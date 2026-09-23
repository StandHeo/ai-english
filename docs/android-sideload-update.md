# Android 侧载升级

服务器放静态清单和最新 APK，家长在 App 里手动升级。iOS 暂不做。不强制，拉清单失败时不弹错误。

清单：`http://118.24.164.40/app/version.json`  
安装包：`http://118.24.164.40/app/tudoudou-aienglish.apk`

`version.json` 不要长期缓存。两个文件放在静态目录，不要放进只反代 `/api/` 的位置。

## 用户侧

1. 打开「土豆豆AI英语」，从首页进入家长入口，答对算术题后进入家长中心。儿童首页不会出现升级。
2. App 用本机 `versionCode`（Capacitor `App.getInfo().build`）对比上面的 `version.json`。只有清单里的 `versionCode` 更大时，家长中心顶部才出现「有新版本」、版本名、可选说明、「下载后点安装」、「立即升级」和「稍后」。
3. 点「稍后」只藏起这一次停留，下次再进家长中心仍会看到。
4. 点「立即升级」后，App 下载 APK 并打开系统安装界面。
5. Android 8 及以上若还没允许本应用安装未知应用，会先跳到系统设置。给「土豆豆AI英语」打开「允许安装未知应用」，返回家长中心，再点一次「立即升级」。
6. 系统弹出安装确认后点安装。若没有自动弹出，按界面上的「下载后点安装」，在下载完成的文件上点安装。
7. 装完再进家长中心：清单 `versionCode` 与已装包一致时，升级条消失。

未知来源若从文件管理器安装被拦，另见 [`wechat-apk-install.md`](./wechat-apk-install.md)。

## 开发者发布

`apps/web/android/` 不入库。版本号写在本机工程的 `defaultConfig` 里，打进 APK 后家长中心读的就是它。

### 1. 把版本号加一

编辑 `apps/web/android/app/build.gradle`：

```gradle
versionCode 2
versionName "1.1"
```

`versionCode` 必须在上一版基础上 **+1**（当前默认包是 `1` / `1.0`，第一次发布新包写成 `2`）。只改 `versionName` 不会出现升级按钮。

还没有 `apps/web/android/` 时，先按 [`android-capacitor.md`](./android-capacitor.md) 生成工程，再改版本号。

### 2. 打包

```bash
cd apps/web
npm run build:android
cd android
./gradlew assembleRelease
```

只要调试包时，把最后一行换成 `./gradlew assembleDebug`。

产物：

| 命令 | 路径 |
| --- | --- |
| `assembleRelease`（已配置与旧包相同的签名） | `apps/web/android/app/build/outputs/apk/release/app-release.apk` |
| `assembleRelease`（未签名） | `apps/web/android/app/build/outputs/apk/release/app-release-unsigned.apk` |
| `assembleDebug` | `apps/web/android/app/build/outputs/apk/debug/app-debug.apk` |

未签名的 release 包不能拿去覆盖安装。手机上已是 debug 包时，继续发 debug，或两边都用同一把 release 签名。

### 3. 上传

与 `http://118.24.164.40/wechat-apk-install.html` 放在同一站点根下的 `app/`。常见目录是 `/var/www/html/app/` 或 `/var/www/tudoudou/app/`。不确定时：

```bash
sudo find /var/www /usr/share/nginx -name 'wechat-apk-install.html' 2>/dev/null
```

下面按 `/var/www/html/app/` 举例。文件名必须是 `tudoudou-aienglish.apk` 和 `version.json`。`versionCode` / `versionName` 与 gradle 里相同。

```bash
ssh user@118.24.164.40 'mkdir -p /var/www/html/app'

scp apps/web/android/app/build/outputs/apk/release/app-release.apk \
  user@118.24.164.40:/var/www/html/app/tudoudou-aienglish.apk
```

`version.json` 全文示例（发 `versionCode 2` 时）：

```json
{
  "versionCode": 2,
  "versionName": "1.1",
  "apkUrl": "http://118.24.164.40/app/tudoudou-aienglish.apk",
  "notes": "本次更新说明"
}
```

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

curl -fsS http://118.24.164.40/app/version.json
curl -fsSI http://118.24.164.40/app/tudoudou-aienglish.apk
```

`notes` 可省略。`apkUrl` 保持这条直链。

若 `/app/` 被别的 nginx `location` 抢走，再加（`alias` 换成真实目录）：

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

### 4. 校验

1. 手机上留着旧包（`versionCode` 更小，例如 `1`）。
2. 打开旧版，进入家长中心，应看到「有新版本」和「立即升级」。
3. 装完新包再进家长中心，升级条消失。已装 `versionCode` 与 `version.json` 的 `versionCode` 一致。
4. 清单仍写旧数字、或新包装出来的 `versionCode` 没加一，家长中心不会出现按钮。

## 注意

- 每次发布都必须涨 `versionCode`，并和 `version.json` 写成同一个整数。
- 签名必须与手机里已装的包一致，否则系统拒绝覆盖安装。换签名要先卸载，本机日记等数据会丢。
- iOS 暂不做，iPhone 上不检查这份清单。
- 插件 `apps/web/plugins/apk-install` 会在 `npm run build:android` 时随 `cap sync` 进包，并带上 `REQUEST_INSTALL_PACKAGES`。不用手改 `AndroidManifest.xml`。
