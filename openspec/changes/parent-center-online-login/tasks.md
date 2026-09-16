## 1. 会员 API 分轨

- [x] 1.1 在 `apps/web/src/api/base.ts` 增加 `PRODUCT_MEMBERSHIP_ORIGIN`、`isPrivateOrLocalApiBase`、`resolveMembershipApiBase`、`getMembershipApiBase`、`membershipApiUrl`；`getApiBase()` 保持原语义。用 `apps/web/src/api/base.test.ts` 覆盖：原生无覆盖 → `https://tudoudou-ai.site`；stored `http://192.168.2.104:8787` 不覆盖会员；浏览器空 env → `''`；公网 HTTPS stored 可用
- [x] 1.2 `membership.ts` 的 `membershipFetch` 改走 `membershipApiUrl`；连接失败映射为人话（不含 `Failed to connect` / IP）。测试断言源码或纯函数覆盖连接错误映射与 `/api/auth/email/send`

## 2. 未登录家长 UI

- [x] 2.1 重做 `ParentPage` 未登录区：只留邮箱、图形验证码（默认展示、点图刷新、config 失败不隐藏）、发送、六位码、登录；发送成功倒计时、提示「验证码已发到邮箱」、焦点进验证码框；删除 SES/SMTP 家长文案。Plus 价格与管理员开通移到登录后折叠区；`provider !== 'wechat'` 时无支付按钮
- [x] 2.2 收窄 `parent.css` 登录/验证码/倒计时样式，窄屏不要信息墙。家庭工作室设置文案写明局域网不影响家长登录
- [x] 2.3 更新 `membership.test.ts`：未登录区有图形验证码与发送；无 SES/SMTP 家长文案；无未登录价格卡；儿童路径仍禁登录/价格

## 3. 文档与回归

- [x] 3.1 更新 `docs/android-phone-guide.md`（必要时 `docs/tech-architecture.md`）：家长登录默认 `https://tudoudou-ai.site`；局域网只覆盖家庭联调
- [x] 3.2 跑 `npm --prefix apps/web run test` 全绿
