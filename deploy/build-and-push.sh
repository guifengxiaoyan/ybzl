#!/usr/bin/env bash
#
# 构建镜像并推送到私有镜像仓库
# 在「构建机」（能访问私有 registry、已装 docker）上运行，且位于项目根目录。
#
# 用法：
#   REGISTRY=registry.example.com/medical/ TAG=1.0.0 ./deploy/build-and-push.sh
#
# 可选（让脚本自动登录，否则请提前手动 `docker login`）：
#   REGISTRY_USER=xxx REGISTRY_PASS=xxx ./deploy/build-and-push.sh
#
# 说明：
#   - REGISTRY 必须含末尾斜杠，例如 registry.example.com/medical/
#     最终镜像 = registry.example.com/medical/medical-portal:1.0.0
#   - 不传 TAG 时默认 latest
#
set -euo pipefail

REGISTRY="${REGISTRY:-}"
TAG="${TAG:-latest}"

if [ -z "$REGISTRY" ]; then
  echo "❌ 请设置 REGISTRY（含末尾斜杠），例如：" >&2
  echo "   REGISTRY=registry.example.com/medical/ TAG=1.0.0 $0" >&2
  exit 1
fi

IMAGE="${REGISTRY}medical-portal:${TAG}"
echo "==> 目标镜像: $IMAGE"

# 可选：自动登录（取 REGISTRY 的 host 部分）
if [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_PASS:-}" ]; then
  REG_HOST="${REGISTRY%%/*}"
  echo "==> 登录仓库: $REG_HOST"
  echo "$REGISTRY_PASS" | docker login "$REG_HOST" -u "$REGISTRY_USER" --password-stdin
fi

echo "==> 构建镜像 ..."
docker compose build

echo "==> 推送镜像 ..."
docker compose push

echo ""
echo "✅ 推送完成: $IMAGE"
echo ""
echo "在目标服务器上拉取并运行："
echo "  # 把 .env 里的 REGISTRY / TAG 设成相同值，再："
echo "  docker compose pull"
echo "  docker compose up -d"
echo ""
echo "或直接用镜像名拉起（无需源码）："
echo "  docker run -d --name medical-portal -p 51888:51888 \\"
echo "    -e ADMIN_PASSWORD=你的强密码 -v medical_data:/app/data \\"
echo "    $IMAGE"
