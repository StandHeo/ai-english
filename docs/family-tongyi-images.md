# 家庭关卡云端配图（通义万相 / Agnes）

生成**迷你 pack** 后可为**每一关**云端文生图（专属背景 + 主词道具），与相册/占位共用玩法路径。设置里可切换 **通义万相** 或 **Agnes 图**。

**App：** 填了对应 Key 后手机直连云接口，不经过电脑局域网 API。  
**电脑浏览器：** 仍走 `POST /api/family/generate-images`，body 带 `imageProvider` 与 `slots`。

## 迷你 pack 槽位

- 每一关：`imageBg` = 场景背景（主题优先可编辑的 `scenePrompt`，否则 `scene.setting`）
- 同一关：`itemImages[0]` ≈ 主词道具图
- 游玩时选项图优先本关主词图，其它词可复用其它关背景
- **去重：** `a paper` / `paper` 等规范化为同一主体，同一关只出一张道具图
- **跨关复用：** 同一日记批量云端配图时，道具/干扰按规范化主体复用已生成图，不再重复请求；各关场景背景仍各自出图
- **抽象干扰词：** pack 解析会把 `paper` / `square` / `color` 等换成具体童词；关卡 LLM 提示也禁止这类 id

旧「一天一关 + 扁平 images[]」仍可读；重新生成后改为按关存图。

## 提示词风格

内置默认是柔和儿童绘本（单一清晰主体、可带极简环境），**不是**单词闪卡/纯色贴纸。场景模板按方形出图写，禁止画面文字与暴力。

运营可在管理端改 `image_prompt_config`。**已写入数据库的自定义文案不会在发版时被静默覆盖。** 若要吃上新的内置默认，请在管理端把配置恢复为默认（或清空该行后重启）。客户端会忽略低于当前 `IMAGE_PROMPT_CONFIG_VERSION` 的本地缓存，再向服务器拉配置。

## 开通

### 通义万相

1. 打开 [阿里云百炼控制台](https://bailian.console.aliyun.com/)，开通模型服务并创建 API Key。
2. 默认模型 `wan2.6-t2i`。
3. 浏览器联调可在 `apps/api/.env` 写 `DASHSCOPE_API_KEY`；App 请在日记设置里填通义 Key。

### Agnes 图

1. 在 [Agnes 控制台](https://platform.agnes-ai.com/) 创建 API Key。
2. 默认 `agnes-image-2.1-flash`（公开文档曾标 $0/张，以对方为准）。
3. 与关卡 Agnes 共用日记设置里的 **Agnes API Key**。
4. 请求体使用 `n: 1` + `size: 1024x1024`（勿用会挂起的 `1K` + `extra_body`）。

```bash
# 仅电脑浏览器代理需要
# DASHSCOPE_API_KEY=sk-...
# AGNES_API_KEY=...
# FAMILY_IMAGE_PROVIDER=mock   # 不扣费占位
```

## 费用与安全（约）

- 通义万相按张计费；迷你 pack 常见 **3–5 关 ×（背景+道具）≈ 6–10 张**。
- Agnes 图以官方活动价为准；客户端与 `apps/api` 已对 Agnes 调用做约 18/分钟排队。
- **自动云端配图默认关闭**；需 Key 与网络。
- Prompt 固定儿童绘本风格锚点；单关失败不丢整包。

## 接口（浏览器代理）

- `POST /api/family/generate-images`
- Body：`{ date, slots | level, imageProvider?: 'tongyi'|'agnes', apiKey? }`
- 成功：`{ images: string[], warnings?: string[], provider }`

## 手工验收

1. 生成迷你 pack 后按关改中文场景词，再「配图本关」。
2. 日历 → 关列表 → 进关，背景应为该关图。
3. 旧单关日记录仍可直接玩。
