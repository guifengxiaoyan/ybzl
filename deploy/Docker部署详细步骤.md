# Docker 部署 · 详细步骤（照抄即可）

本文档从零开始，把「医院医保专栏」用 Docker 部署到一台内网 Linux 服务器上的**每一步**都写清楚。
适用：Ubuntu / Debian / CentOS 等任何装了 Docker 的机器（含内网离线机，只需提前准备好镜像）。

> 全程默认在 **root 或有 sudo 权限** 的服务器上操作。命令里的 `$` 开头是提示符，不用输。

---

## 0. 一分钟速览（给有经验的人）

```bash
curl -fsSL https://get.docker.com | sudo sh
git clone https://github.com/guifengxiaoyan/ybzl.git && cd ybzl
cp .env.example .env && nano .env          # 至少改 ADMIN_PASSWORD
docker compose up -d --build
sudo ufw allow 51888/tcp
```
访问 `http://<服务器IP>:51888/`，后台 `.../admin.html`。
下面是每一步的详细解释。

---

## 1. 环境与前置准备

### 1.1 安装 Docker（Ubuntu / Debian）

```bash
# 方式 A：官方一键脚本（推荐，自动适配发行版）
curl -fsSL https://get.docker.com | sudo sh

# 若访问 get.docker.com 慢，可用阿里云镜像源：
# curl -fsSL https://get.docker.com | sudo sh -s -- --mirror Aliyun
```

> 内网离线机器：先在能上网的同型号机器上 `docker pull node:20-alpine` 打包成 tar，再 `docker load` 导入；或使用私有镜像仓库（见第 13 节）。

### 1.2 让普通用户免 sudo 用 docker（可选但推荐）

```bash
sudo usermod -aG docker $USER
# 注销后重新登录生效；不想重登可执行： newgrp docker
```

### 1.3 验证安装

```bash
docker --version
docker compose version
```

- `docker compose version` 必须能输出版本号（**v2**，命令是 `docker compose` 带空格）。
- 若提示 `docker compose` 不存在，说明只有旧版 `docker-compose`（带横线），请升级 Docker Engine。

### 1.4 设置 Docker 开机自启（重要，保证重启服务器后网站自动恢复）

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

> 容器的 `restart: unless-stopped` 保证 Docker 服务起来后容器自动拉起，两者配合才能实现「开机即恢复」。

---

## 2. 获取项目代码

### 2.1 从 GitHub 克隆（推荐）

```bash
git clone https://github.com/guifengxiaoyan/ybzl.git
cd ybzl
```

若仓库是私有或不便用 git，可用方式 2.2。

### 2.2 手动拷贝

把整个项目文件夹（含 `Dockerfile`、`docker-compose.yml`、`server.js`、`public/`、`.env.example`）拷到服务器某目录，例如 `/opt/medical-portal`，然后 `cd /opt/medical-portal`。

> ⚠️ 不需要拷贝本地的 `data/` 目录（运行时会自动生成）。

---

## 3. 认识这几个部署文件

| 文件 | 作用 |
|---|---|
| `Dockerfile` | 镜像构建脚本。基于 `node:20-alpine`，**以非 root 用户 `app` 运行**，内置健康检查 |
| `docker-compose.yml` | 编排文件：定义端口、数据卷、环境变量、健康检查、自动重启 |
| `.env.example` | 环境变量模板 **（把它复制为 `.env` 后使用）** |
| `.dockerignore` | 构建时排除 `data/`、`.workbuddy/` 等，避免把运行数据打进镜像 |
| `server.js` | 后端服务（监听容器内 `51888`，已显式绑定 `0.0.0.0` 保证端口映射可用） |

---

## 4. 配置环境变量（这一步最关键）

### 4.1 生成 `.env`

```bash
cp .env.example .env
nano .env        # 或用 vi / vim
```

### 4.2 变量说明

| 变量 | 说明 | 默认 | 建议 |
|---|---|---|---|
| `ADMIN_PASSWORD` | 后台管理员密码 | `admin123` | **必须改**成强密码 |
| `PORT` | **宿主机**对外端口（容器内固定 51888） | `51888` | 冲突时改成别的，如 `8080` |
| `SITE_NAME` | 站点名称 | `医保专栏` | 每次启动都生效，可随时改 |

> 端口关系：`"${PORT:-51888}:51888"` —— 冒号左是宿主机端口，右是容器内端口（固定）。改 `.env` 的 `PORT` 只改左侧。

### 4.3 生成一个强密码

```bash
# 任选一条，把输出结果填进 .env 的 ADMIN_PASSWORD
openssl rand -base64 12
tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16
```

### 4.4 ⚠️ 关于密码生效时机（最容易踩的坑）

**`ADMIN_PASSWORD` 只在第一次生成数据文件时生效！**

原因：`server.js` 的逻辑是——数据文件 `data/db.json` **不存在**时才用该环境变量的哈希初始化；一旦存在，密码只认数据库里已保存的值。

所以：

| 场景 | 正确做法 |
|---|---|
| **首次部署**（数据卷为空） | ✅ 在 `.env` 里设好强密码，再 `up -d --build`，即刻生效 |
| **已经运行过，想改密码** | ✅ 登录后台 → 左侧「修改密码」在线改（推荐）<br>❌ 改 `.env` 里的 `ADMIN_PASSWORD` **不会生效** |
| 忘记密码且无法登录 | 停止容器后手工改卷内 `db.json` 的 `settings.adminPasswordHash`（值为 `sha256(新密码)` 十六进制），再启动 |

生成 sha256 示例：
```bash
echo -n "你的新密码" | sha256sum
```

---

## 5. 构建镜像并启动

```bash
docker compose up -d --build
```

- `-d`：后台运行（不加则占用当前终端，Ctrl+C 会停服务）
- `--build`：先构建镜像（**首次必须加**；后续改了代码也要加）

首次会拉取基础镜像并构建，通常几十秒到几分钟，取决于网络。看到类似输出即成功：

```
[+] Building ... 
[+] Running 1/1
 ✔ Container medical-portal  Started
```

---

## 6. 验证是否部署成功

### 6.1 看容器状态（重点看 health）

```bash
docker compose ps
```

期望输出里 `STATUS` 为 **`Up (healthy)`**：

```
NAME              IMAGE                    STATUS              PORTS
medical-portal    medical-portal:latest    Up (healthy)        0.0.0.0:51888->51888/tcp
```

> 刚启动可能短暂显示 `(health: starting)`，约 30 秒内会变成 `healthy`。
> 若一直是 `unhealthy`，看第 11 节排查。

### 6.2 看日志

```bash
docker compose logs -f        # 实时跟踪，Ctrl+C 退出
docker compose logs --tail 50 # 看最近 50 行
```

正常日志会出现：
```
医保专栏已启动： http://0.0.0.0:51888
```

### 6.3 服务器上本地自检

```bash
curl -I http://127.0.0.1:51888/
curl -s http://127.0.0.1:51888/api/public
```

第二条应返回类似 `{"siteName":"医保专栏","intelligentAuditUrl":""}`。

### 6.4 浏览器访问

- 前台：http://\<服务器IP\>:51888/
- 后台：http://\<服务器IP\>:51888/admin.html （用 `.env` 里设的密码登录）

首次登录后即可发布通知、上传文件、配置智能审核链接、添加医保工具等。

---

## 7. 放行防火墙 / 改对外端口

### 7.1 防火墙放行 51888

```bash
sudo ufw allow 51888/tcp
sudo ufw reload
sudo ufw status     # 确认 51888 ALLOW
```

若走的是 CentOS/firewalld：
```bash
sudo firewall-cmd --permanent --add-port=51888/tcp && sudo firewall-cmd --reload
```

### 7.2 改对外端口

编辑 `.env` 的 `PORT=8080`（举例），然后重建容器：

```bash
docker compose up -d
sudo ufw allow 8080/tcp
```
之后访问 http://\<服务器IP\>:8080/

---

## 8. 数据持久化：备份 / 恢复 / 迁移

所有业务数据（通知、政策/目录/院内数据文件的元数据与上传文件）都存在**命名卷**里，容器内路径 `/app/data`。

### 8.1 找到真实卷名

Compose 会按「项目目录名」加前缀，实际名字不一定是 `medical_data`。用这条确认：

```bash
docker volume ls
docker volume inspect <卷名>     # 看宿主机上真实存储路径 Mountpoint
```

（若你克隆到 `ybzl` 目录，卷名通常是 `ybzl_medical_data`。）

### 8.2 备份

```bash
# 把卷内容打包到当前目录
docker run --rm -v <卷名>:/data -v $PWD:/backup alpine \
  tar czf /backup/medical-data-$(date +%F).tar.gz -C /data .
```

生成的 `medical-data-2026-10-12.tar.gz` 拷走妥善保存即可。**建议定期备份（如每日/每周）。**

### 8.3 恢复

```bash
docker compose down                      # 先停（不要用 -v，否则卷被删）
docker run --rm -v <卷名>:/data -v $PWD:/backup alpine \
  tar xzf /backup/medical-data-2026-10-12.tar.gz -C /data
docker compose up -d
```

### 8.4 迁移到另一台服务器

1. 新机器按第 1~5 节完成部署（先别急着用，先起一次让卷生成）
2. `docker compose down`
3. 用 8.3 的命令把备份解压进新机器的同名卷
4. `docker compose up -d`

### 8.5 ⚠️ 危险操作警告

```bash
docker compose down       # ✅ 只删容器，数据卷保留
docker compose down -v    # ❌ 连数据卷一起删除 = 全部业务数据丢失，不可恢复！
```

---

## 9. 日常运维命令速查

| 想做的事 | 命令 |
|---|---|
| 查看状态 | `docker compose ps` |
| 实时日志 | `docker compose logs -f` |
| 看最近日志 | `docker compose logs --tail 100` |
| 重启 | `docker compose restart` |
| 停止（保留数据） | `docker compose down` |
| 启动 | `docker compose up -d` |
| 进入容器排错 | `docker compose exec medical-portal sh` |
| 查看镜像构建情况 | `docker compose build` |
| 强制重建（改了代码） | `docker compose up -d --build` |
| 看资源占用 | `docker stats medical-portal` |

---

## 10. 更新版本

以后代码有更新（比如我又改进了页面）：

```bash
cd /项目目录
git pull                       # 拉取最新代码（若是手动拷贝则重新拷一遍）
docker compose up -d --build   # 重建并替换容器
docker compose ps              # 确认 Up (healthy)
```

> `--build` 必须加，否则还是跑旧镜像。数据卷不受影响，内容不会丢。

---

## 11. 常见问题排查

| 现象 | 原因与解决 |
|---|---|
| `docker compose` 命令不存在 | 装的是旧版，需安装 Docker Compose v2（见 1.1） |
| 端口被占用：`address already in use` | `sudo ss -ltnp \| grep 51888` 找出占用进程停掉，或改 `.env` 的 `PORT` |
| 容器状态 `Exited` | `docker compose logs` 看报错；常见是端口冲突或配置错误 |
| 一直 `unhealthy` | 容器内执行 `docker compose exec medical-portal wget -qO- http://127.0.0.1:51888/` 看是否能通；也可临时用 `docker inspect medical-portal --format '{{.State.Health.Log}}'` 看健康检查输出 |
| 服务器本地 curl 通，但别的电脑打不开 | 防火墙没放行（第 7 节），或不在同一网段/VLAN |
| 后台登不上 | 密码不对。**注意**：改 `.env` 的密码对已存在的数据库无效，请用后台「修改密码」；忘记密码见 4.4 |
| 上传文件失败 | 检查磁盘空间 `df -h`；确认数据卷可写（用命名卷，别用 root 拥有的宿主目录做绑定挂载） |
| 容器不断重启 | `docker compose logs --tail 200` 看具体异常；若为内存/权限问题会明确报出 |
| 构建镜像很慢 | 配置 Docker 国内镜像加速器（修改 `/etc/docker/daemon.json` 的 `registry-mirrors`），或走私有仓库（第 13 节） |

---

## 12. 安全加固清单（内网也建议做）

1. ✅ **改掉默认密码**：首次就在 `.env` 设强密码；后续改动走后台「修改密码」。
2. ✅ **非 root 运行**：镜像已用 `app` 系统用户运行服务。
3. ✅ **不要公网暴露**：把 51888 限制在医院内网/VLAN 或 VPN 内，防火墙别对公网开放。
4. ✅ **定期备份**数据卷（第 8.2 节），并验证备份可恢复。
5. ✅ **保护 `.env`**：它含真实密码，已在 `.gitignore` 中，**切勿提交到仓库**。
6. ✅ **HTTPS**：若通过统一门户访问，建议前面加 Nginx + 内网 CA 证书（见 13.1），防止后台密码明文传输。

---

## 13. 可选进阶

### 13.1 Nginx 反向代理 + HTTPS

适合想用 `http://med.xxx.com` 访问、隐藏 51888 端口、统一加 HTTPS 的场景：

```bash
sudo apt-get install -y nginx
# 参考 deploy/nginx-medical-portal.conf，放到 /etc/nginx/sites-available/medical-portal
# 改里面的 server_name 与证书路径，软链到 sites-enabled
sudo nginx -t && sudo systemctl reload nginx
```
配置要点已在 `nginx-medical-portal.conf` 里写好（含 `client_max_body_size 200m` 支持大文件上传）。
若只让本机 Nginx 转发，可把 compose 端口改为 `"127.0.0.1:51888:51888"`。

### 13.2 推送/拉取私有镜像仓库

想把镜像推到 Harbor / 阿里云 ACR / 腾讯云 TCR，供多台机器拉取：

```bash
# 构建机
REGISTRY=registry.example.com/medical/ TAG=1.0.0 ./deploy/build-and-push.sh

# 目标机（把 .env 的 REGISTRY、TAG 设成相同值）
docker compose pull && docker compose up -d
```
详见 `deploy/部署指南.md` 的「附：Docker 部署 → H. 推送到私有镜像仓库」。

### 13.3 不用 Docker 的备选方案

Ubuntu 原生 systemd 部署脚本：`sudo bash deploy/setup.sh`（见 `deploy/部署指南.md` 方式一）。

---

## 附：全流程一次复制版

```bash
# 1. 装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && sudo systemctl enable docker

# 2. 取代码
git clone https://github.com/guifengxiaoyan/ybzl.git && cd ybzl

# 3. 配密码
cp .env.example .env
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)|" .env
cat .env | grep ADMIN_PASSWORD        # 记下这个密码！

# 4. 启动
docker compose up -d --build

# 5. 放行防火墙
sudo ufw allow 51888/tcp

# 6. 验证
docker compose ps
curl -s http://127.0.0.1:51888/api/public
```
