# 家庭关卡本地图标配图（Iconify / MDI）

在通义万相与相册之外，提供**离线、免费**的配图路径：用精简 Material Design Icons（经 Iconify JSON）按关卡英文词匹配，生成 SVG data URL 写入当日 `images[]`。

## 使用

1. 生成关卡后，在日记页点 **图标配图**（有已有图时可选择整表替换或只填空位）。
2. 设置里须至少开启一种自动配图。可都开：**先图标，未匹配的槽位再通义补全**（两者皆开时优先图标）。
3. 槽位首位是**场景背景**（优先 `scene.setting`）：图标会尽量用风景类兜底，主场景仍更推荐相册或云端补强；英文道具词继续走图标匹配。
4. 本地矢量图标优先使用模型生成关卡时给出的 `iconColors`（每词温馨 fg/bg）；缺失时回退到内置儿童向调色板。

## 技术

- 构建：`npm run build-icon-pack`（`build` 会自动跑）从 `@iconify-json/mdi` 导出约 450 个图标 + 别名表 → `src/icons/familyIconPack.json`（约 160KB）
- 搜索：`src/icons/familyIconSearch.ts`（别名 → 精确/包含匹配）
- 许可：MDI 为 Apache-2.0（见 [Pictogrammers](https://pictogrammers.com/library/mdi/)）；Iconify 为聚合格式

## 局限

- 冷门词可能匹配不到 → 提示后仍保留关卡，可改相册/通义
- 矢量图标 ≠ 绘本插画；风格与官方主题包可能不一致

## 验收

- 断网也可图标配图
- 无匹配不丢关卡
- 未确认时不覆盖已有相册图（填空位）
