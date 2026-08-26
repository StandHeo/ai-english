## 1. 产品面

- [x] 1.1 设置：去掉自动图标；配图区只保留自动云端 + 提供方/Key
- [x] 1.2 日记页：去掉「图标配图」按钮与相关文案；自动填充只走云端

## 2. 代码清理

- [x] 2.1 `missingSlotsForImages` 迁入 `imageSlots`；store 去掉 `autoIconImages` 使用
- [x] 2.2 删除 `familyIconSearch`（及测试）、icon pack 构建脚本/产物，并从 `build` 移除

## 3. 文档与测试

- [x] 3.1 更新家庭日记/通义文档；iconify 文档标明已移除
- [x] 3.2 跑测试并提交
