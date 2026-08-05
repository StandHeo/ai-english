## 1. 脚本与校验

- [x] 1.1 扩展 Beat 类型：`find`；可选 `success_say`；更新 `types.ts` 与 `schema.json`
- [x] 1.2 更新 `validate.mjs`：`find` 拍必须有 options；ask 仍要求 expect

## 2. 播放器趣味互动

- [x] 2.1 LevelPage 支持 `find` 拍主路径点图（点对推进、点错提示）
- [x] 2.2 支持 `success_say` 与默认庆祝句轮换
- [x] 2.3 焦点图轻跳动效；成功庆祝可见反馈保持/加强

## 3. 内容改写

- [x] 3.1 重写水果森林各关台词，保证双 ask 问法多样；至少三关含 `find`
- [x] 3.2 重写自行车世界各关台词；至少三关含 `find`；出发/动作关问法贴合 go/ride
- [x] 3.3 `node content/validate.mjs` 通过

## 4. 文档与冒烟

- [x] 4.1 补充本变更内容说明（问法模板与 find 约定）
- [x] 4.2 冒烟：水果一关 + 自行车一关，确认新问法 TTS、find 点选、口语成功庆祝
