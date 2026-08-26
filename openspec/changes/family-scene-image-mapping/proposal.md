## Why

家庭日记配图名义上有「背景 + 道具」，但背景槽用的是 `target_words[0]` 英文名词，忽略 `scene.setting`；玩法里正确答案也绑死 `images[0]`。孩子看到的背景常像物体特写，选项图也对不上词。

## What Changes

- 配图槽位：单独增加一张 **scene 背景**，subject 优先 `scene.setting`（缺省再回退到首词 / 通用场景词）；其余 `target_words` 与选项 id 仍为 item。
- 云端 prompt：scene 强调全景环境、无巨大居中道具；item 仍为单物体居中。
- 玩法物化：背景固定 `images[0]`；选项图按 **option id / 词** 映射到对应 item 槽，不再「correct → images[0]」。
- 本地图标路径：scene 槽尽量用风景类兜底或弱匹配，避免把首词图标硬当全屏背景（能改则改，不强行完美全景）。

## Capabilities

### New Capabilities

- `family-scene-bg-slots`：家庭关配图区分真正场景背景槽与道具槽，背景 subject 来自场景设定。
- `family-option-image-map`：玩法中选项图按词/id 映射到 `images[]`，与背景解绑。

### Modified Capabilities

- （无 `openspec/specs/` 主规格条目；行为以本变更新增能力描述。）

## Impact

- `apps/web/src/family/imageSlots.ts`、图标配图、`store.materializeLevelForPlay`
- `apps/api/src/tongyiImage.ts`（浏览器代理配图与 web 槽位一致）
- 相关单测与 `docs/family-tongyi-images.md` / 图标文档短说明
