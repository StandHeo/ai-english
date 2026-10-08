## 1. 提示词默认风格

- [x] 1.1 更新 `apps/web/src/family/imagePromptDefaults.ts` 与 `apps/api/src/imagePromptDefaults.ts`：道具/干扰去闪卡措辞，场景方图友好，安全前缀保留禁文字/暴力，负向弱化「写实照片」一刀切；bump `IMAGE_PROMPT_CONFIG_VERSION`（若适用）
- [x] 1.2 更新/补充 `imagePromptDefaults` 同步单测：断言 web/api 文案一致，且默认模板不含「单词闪卡」「占画面约七成」等旧措辞
- [x] 1.3 确认客户端拉取配置逻辑在 version 变化时可拿到新默认（未自定义 DB 时）；文档注明已自定义时需 admin 恢复默认

## 2. 槽位规范化与去重

- [x] 2.1 在 `imageSlots.ts`（及 api 侧重复实现若有）实现 `normalizeSlotSubjectKey`：小写、剥 `a/an/the`、取首英文词；无拉丁词回退整串
- [x] 2.2 `slotsFromLevel` / `slotsForMiniLevel` 用规范化键去重；`itemPromptOverrides` 应用后再跑一遍去重
- [x] 2.3 单测：`a paper`+`paper` 合并；覆盖后双 `cake` 合并；场景与道具同键不重复道具槽

## 3. 同日跨关道具图复用

- [x] 3.1 在批量配图路径（`FamilyStudioPage.requestMiniLevelImages` 或抽出的 helper）维护规范化键 → 已生成图的缓存；道具/干扰命中则跳过 API，场景默认不跨关复用
- [x] 3.2 单测或可测纯函数：第二关同词复用、不同场景仍各自出背景

## 4. 抽象干扰词治理

- [x] 4.1 在 pack 解析/校验路径增加抽象词黑名单（paper/square/shape/color 等，经规范化匹配）
- [x] 4.2 命中时用固定童词池替换为当日未用具体名词；无法补足则走校验失败/重试
- [x] 4.3 更新 `packSchema` / `familyPackGenerate` 系统提示中的干扰项规则与单测用例

## 5. 文档与验收

- [x] 5.1 更新 `docs/family-tongyi-images.md`：新风格要点、去重/跨关复用、抽象词、自定义配置如何恢复默认
- [x] 5.2 手工冒烟：生成含零食日记的迷你 pack → 批量配图，确认无重复 paper 槽、同词不双请求、画面不再明显闪卡（主观）
