# 医院医保专栏（内网）

医院内部医疗保险管理专栏网站，包含前台内容展示与后台发布管理。纯 Node.js 实现，**无需安装任何依赖**，下载即可运行。

## 功能一览

前台（`/`）
- 📢 首页概览：各栏目数量统计 + 最新通知 / 政策速览
- 📋 通知公告：支持置顶、搜索
- 📑 医保政策文件：列表 + 一键下载
- 📚 三大目录：药品目录 / 诊疗项目目录 / 耗材目录（分类下载）
- 📊 院内数据分享：各类数据文件发布与下载
- 🔍 各栏目均支持关键字搜索

后台（`/admin.html`）
- 🔐 管理员密码登录（token 鉴权）
- 📈 数据概览统计
- ➕ 发布通知（标题/正文/发布人/日期/置顶/发布）
- ⬆️ 上传并发布文件（选择栏目 + 目录类型 + 说明 + 上传人）
- ✏️ 编辑 / 🗑 删除 / 🔁 发布·转草稿 一键切换

## 运行

```bash
node server.js
```

可选环境变量：

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 监听端口 | `3000` |
| `SITE_NAME` | 站点名称 | `医保专栏` |
| `ADMIN_PASSWORD` | 后台管理员密码（首次启动写入） | `admin123` |
| `DATA_DIR` | 数据与上传文件目录 | `./data` |

启动后访问：
- 前台：http://localhost:3000
- 后台：http://localhost:3000/admin.html （默认密码 `admin123`）

> 修改默认密码：首次启动前设置 `ADMIN_PASSWORD`，或在 `data/db.json` 的 `settings.adminPasswordHash` 改为 `sha256(密码)` 的十六进制值。

## 部署建议（内网）

- 该站点包含医保敏感数据，**请勿公网开放**；建议部署在医院内网服务器或通过 VPN 访问。
- 生产环境建议在前面加一层 Nginx 反代并启用 HTTPS。
- 上传文件默认存于 `data/uploads/`，数据库元数据存于 `data/db.json`，请定期备份。
- 当前为单管理员口令模式；如需多账号 / 操作审计，可在此基础上扩展。

## 目录结构

```
server.js            # 后端服务（HTTP + API + 文件上传/下载）
public/
  index.html         # 前台专栏首页
  admin.html         # 后台管理页
  css/style.css      # 前台样式
  css/admin.css      # 后台样式
  js/app.js          # 前台逻辑
  js/admin.js        # 后台逻辑
data/
  db.json            # 元数据（通知 + 资源）
  uploads/           # 上传的文件
```

## API 速览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/public` | 站点名称 |
| GET | `/api/notices` | 已发布通知 |
| GET | `/api/resources?section=&catalogType=` | 已发布资源 |
| GET | `/api/download/:id` | 下载文件 |
| POST | `/api/login` | 后台登录 |
| GET/POST | `/api/admin/notices` | 通知列表 / 发布 |
| PUT/DELETE | `/api/admin/notices/:id` | 通知编辑 / 删除 |
| GET/POST | `/api/admin/resources` | 资源列表 / 上传 |
| PUT/DELETE | `/api/admin/resources/:id` | 资源编辑 / 删除 |
| GET | `/api/admin/stats` | 统计信息 |
