#!/usr/bin/env bash
# Cloud Agent 安装脚本：刷新 api / web 依赖并准备本地配置。
# 需保持幂等：可重复运行，且不依赖上一次运行的进程状态。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "==> 安装 apps/api 依赖"
npm --prefix apps/api ci

echo "==> 准备 apps/api/.env（若缺失则从示例复制）"
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
fi

echo "==> 安装 apps/web 依赖"
npm --prefix apps/web ci

echo "==> 同步关卡内容到 web 公共目录"
npm --prefix apps/web run sync-content

echo "==> 校验内容包"
node content/validate.mjs

echo "==> 安装完成"
