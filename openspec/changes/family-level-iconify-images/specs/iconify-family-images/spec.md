## Purpose

为家庭关卡提供基于本地 Iconify 子集的离线图标配图，使无通义 Key、无相册时也能为道具词生成可玩的图片。

## ADDED Requirements

### Requirement: Local icon catalog for family levels
系统 SHALL 在客户端内置可离线使用的图标目录（至少一个面向通用物体的集合），支持按英文关键词搜索并返回图标数据，无需调用通义或外部 Iconify 网络 API。

#### Scenario: Offline keyword search
- **WHEN** 用户在无外网环境下对关键词（如 `apple`）发起图标搜索
- **THEN** 系统 MUST 仅使用本地目录返回匹配结果或明确的空结果，且 MUST NOT 因缺少外网而失败崩溃

### Requirement: Icon fill for family day images
系统 SHALL 允许家长根据当日已生成关卡的 `target_words` 与选项 id，为一天生成最多 4 张图标图，并以 data URL 写入该日 `images[]`。

#### Scenario: Fill empty slots from level words
- **WHEN** 当日已有关卡且 `images[]` 为空或部分为空，家长触发「图标配图」
- **THEN** 系统 MUST 按关卡词匹配图标并填充空位，且 MUST NOT 在未确认时覆盖已有非空相册图位

#### Scenario: Replace requires confirmation when images exist
- **WHEN** 当日已有图片且家长选择用图标整表替换
- **THEN** 系统 MUST 先取得确认（或等价显式动作）后再替换 `images[]`

### Requirement: Coexist with album and Tongyi paths
系统 SHALL 将图标配图与相册选图、通义配图作为并行能力；任一路失败 MUST NOT 删除已保存的关卡脚本。

#### Scenario: Icon path failure keeps level
- **WHEN** 图标目录中无任何匹配或生成 data URL 失败
- **THEN** 系统 MUST 保留关卡，并向家长展示可理解提示，家长仍可使用相册或通义

### Requirement: Optional auto icon fill
系统 SHALL 提供设置项，使「生成关卡」成功后可自动执行图标配图；该选项默认 MUST 为关闭，且 MUST NOT 在关闭时自动调用通义。

#### Scenario: Auto icon off by default
- **WHEN** 家长未开启自动图标配图并成功生成关卡
- **THEN** 系统 MUST NOT 自动写入图标到 `images[]`
