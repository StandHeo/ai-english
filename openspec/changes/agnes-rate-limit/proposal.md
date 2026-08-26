## Why

Agnes 免费档公开限制约 **20 次 API / 分钟**。家庭关一次配图可连续调用近 10 次文生图，再加出关与重试，很容易 429，家长会感觉「Agnes 不好用」。

## What Changes

- 对所有 Agnes HTTPS 调用（关卡 chat + 配图）做**滑动窗口限速**（默认 ≤18/分钟，留余量）。
- 撞到限速时在调用前等待，而不是打爆接口；若仍返回 429，短暂退避后再试一次。
- 日记页状态文案提示 Agnes 配图可能因限速变慢。
- 不限制 DeepSeek / 通义。

## Capabilities

### New Capabilities

- `agnes-api-rate-limit`：Agnes 云调用遵守免费档 RPM，避免短时打满。

### Modified Capabilities

- （无主规格目录条目。）

## Impact

- `apps/web`：直连客户端限速
- `apps/api`：浏览器代理路径限速
- 设置/文档短说明
