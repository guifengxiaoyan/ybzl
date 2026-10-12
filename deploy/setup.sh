#!/usr/bin/env bash
#
# 医院医保专栏 - Ubuntu 一键部署脚本
# 用法（在服务器上，且已把整个项目文件夹传上去后）：
#   sudo bash deploy/setup.sh
# 可选环境变量：
#   MEDICAL_ADMIN_PASSWORD=xxxx   指定后台管理员密码（不指定则随机生成并打印）
#   MEDICAL_PORT=51888            服务端口
#   MEDICAL_INSTALL_DIR=/opt/medical-portal   安装目录
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请使用 root 运行： sudo bash deploy/setup.sh" >&2
  exit 1
fi

PORT="${MEDICAL_PORT:-51888}"
INSTALL_DIR="${MEDICAL_INSTALL_DIR:-/opt/medical-portal}"
RUN_USER="medical"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 项目源目录: $SRC_DIR"
echo "==> 安装目录:   $INSTALL_DIR"

# ---------- 1. 安装 Node.js（若已存在则跳过）----------
if command -v node >/dev/null 2>&1; then
  echo "==> 已检测到 Node: $(node -v)"
else
  echo "==> 安装 Node.js 20 LTS ..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg
  # NodeSource 仓库
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "==> 已安装 Node: $(node -v)"
fi

# ---------- 2. 创建专用运行用户（无登录、无家目录）----------
if id "$RUN_USER" >/dev/null 2>&1; then
  echo "==> 用户 $RUN_USER 已存在"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER"
  echo "==> 已创建系统用户 $RUN_USER"
fi

# ---------- 3. 拷贝项目到安装目录 ----------
echo "==> 拷贝项目到 $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
# 复制项目文件（排除本地数据，避免覆盖生产数据；首次部署 data 会被一起拷入作为初始模板）
rsync -a --exclude='.workbuddy' --exclude='node_modules' "$SRC_DIR/" "$INSTALL_DIR/"

# ---------- 4. 生成管理员密码 ----------
if [ -n "${MEDICAL_ADMIN_PASSWORD:-}" ]; then
  ADMIN_PW="$MEDICAL_ADMIN_PASSWORD"
else
  ADMIN_PW="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12)"
fi

# ---------- 5. 写入 systemd 服务 ----------
echo "==> 写入 systemd 服务 ..."
cat > /etc/systemd/system/medical-portal.service <<EOF
[Unit]
Description=Hospital Medical Insurance Portal (医保专栏)
After=network.target

[Service]
User=$RUN_USER
Group=$RUN_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Environment=PORT=$PORT
Environment=SITE_NAME=医保专栏
Environment=ADMIN_PASSWORD=$ADMIN_PW
Environment=DATA_DIR=$INSTALL_DIR/data
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ---------- 6. 授权 ----------
chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"
chmod -R og-w "$INSTALL_DIR"        # 去除组/其他写权限（数据目录仍需可写，下面单独放开）
chmod -R ug+rwX "$INSTALL_DIR/data"  # 数据目录允许运行用户读写

# ---------- 7. 启动服务 ----------
echo "==> 重新加载并启动服务 ..."
systemctl daemon-reload
systemctl enable --now medical-portal

# ---------- 8. 防火墙放行 ----------
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 && echo "==> 防火墙已放行端口 $PORT" || echo "⚠️ ufw 放行失败，请手动确认"
fi

# ---------- 9. 健康检查 ----------
sleep 2
if systemctl is-active --quiet medical-portal; then
  echo ""
  echo "✅ 部署成功！"
  echo "   前台访问:  http://<服务器IP>:$PORT/"
  echo "   后台管理:  http://<服务器IP>:$PORT/admin.html"
  echo "   管理员密码: $ADMIN_PW"
  echo "   ⚠️ 请妥善保存此密码，或登录后台自行修改。"
  echo ""
  echo "常用命令："
  echo "   查看状态:  sudo systemctl status medical-portal"
  echo "   查看日志:  sudo journalctl -u medical-portal -f"
  echo "   重启服务:  sudo systemctl restart medical-portal"
  echo "   停止服务:  sudo systemctl stop medical-portal"
  echo "数据备份：  备份 $INSTALL_DIR/data 整个目录即可（含 db.json 与上传文件）"
else
  echo "❌ 服务未正常启动，请查看日志： sudo journalctl -u medical-portal -n 50"
  exit 1
fi
