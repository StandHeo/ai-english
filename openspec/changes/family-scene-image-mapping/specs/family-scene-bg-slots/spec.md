## Purpose

让家庭日记关卡配图产出真正可用的场景背景，并在游玩时把选项图按英文词/id 对上，而不是全部绑在第一张图上。

## ADDED Requirements

### Requirement: 背景槽使用场景设定
家庭关云端/本地配图 MUST 在槽位列表首位放置一张 `role=scene` 的背景槽。该槽的 subject MUST 优先使用关卡 `scene.setting`（去空白后非空）；仅当 setting 缺失时 MAY 回退到首个 `target_words` 或通用场景词。背景槽 MUST NOT 再仅因「它是 target_words 的第一个词」而被标成 scene。

#### Scenario: 有 setting 时背景主题来自设定
- **WHEN** 关卡含 `scene.setting` 为「小区游乐场」，且 `target_words` 以 `park` 开头
- **THEN** 槽位列表第一项为 `role=scene` 且 subject 含该设定（或与其等价的设定文本），而不是把 `park` 当作唯一背景主题来源

#### Scenario: 无 setting 时仍有背景槽
- **WHEN** 关卡缺少可用的 `scene.setting` 但有 `target_words`
- **THEN** 仍有一张首位 scene 槽，subject 可回退到首词或通用场景词

### Requirement: 场景 prompt 强调环境全景
云端为 `role=scene` 生成图片时，prompt MUST 明确要求儿童绘本风格的**环境/全景背景**（开阔场景、非巨大居中单物体）。`role=item` 的 prompt MUST 继续要求单个道具或对象居中。

#### Scenario: scene 与 item 提示不同
- **WHEN** 同一关分别生成背景槽与道具槽
- **THEN** 背景提示含全景/环境导向用语，道具提示含居中单物体导向用语
