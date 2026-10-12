# 医院医保专栏 · 容器镜像
# 纯 Node.js、零外部依赖；基础镜像小、启动快。
# 如需 Debian 系（兼容性更好），把下方 FROM 改为 node:20-slim 即可。

FROM node:20-alpine

# 安全：使用非 root 用户运行（避免容器以 root 跑 Web 服务）
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# 仅拷贝运行必需的文件；数据通过卷挂载，不进镜像
COPY package.json server.js ./
COPY public ./public

# 预创建 data 目录并授权，便于命名卷首次挂载时继承正确属主
RUN mkdir -p /app/data && chown -R app:app /app

USER app

# 容器暴露端口（与 docker-compose 映射、server PORT 一致）
EXPOSE 51888

# 健康检查：探测首页是否可用
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:51888/ >/dev/null 2>&1 || exit 1

ENV PORT=51888 \
    SITE_NAME=医保专栏 \
    DATA_DIR=/app/data

CMD ["node", "server.js"]
