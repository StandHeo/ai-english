# apk-install

Android 侧载升级插件。家长中心发现更高 `versionCode` 后，把 APK 下载到缓存，再用 FileProvider 打开系统安装界面。

需要清单里的 `REQUEST_INSTALL_PACKAGES`。Android 8 及以上若尚未允许「安装未知应用」，会先跳到系统设置，返回后再点一次「立即升级」。

仅 Android。iOS 不注册此插件。
