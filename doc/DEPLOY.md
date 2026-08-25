# PortoMind 部署说明

当前版本适合部署在可信局域网。由于尚未实现认证和多用户授权，不要把 API 直接暴露到公网。

## 构建

```bash
git clone <repository-url> portomind
cd portomind

cp server/.env.example server/.env
cp client/.env.example client/.env

cd server
npm ci
npm test

cd ../client
npm ci
npm run lint
npm run build
```

将 `client/dist/` 交给 Nginx 或其他静态服务器。`VITE_API_URL` 是构建时变量；若前端和 API 同域，建议使用默认同源 `/api` 并由 Nginx 转发。

## 后端环境变量

至少配置：

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/portomind
PORT=8080
CORS_ORIGINS=https://portomind.example.internal
LOG_DIR=./logs
SCHEDULER_ENABLED=true
SCHEDULER_TIMEZONE=America/Toronto
PRICE_SYNC_CRON=0 3 * * *
```

MongoDB 账号应只拥有 PortoMind 数据库所需权限；`.env` 和日志文件不能进入静态目录或版本控制。

## PM2

```bash
cd server
npm ci --omit=dev
pm2 start server.js --name portomind-api --instances 1
pm2 save
```

价格和再平衡调度由 Node API 常驻进程统一管理。不要设置系统 cron，也不要单独启动 `priceScheduler.js`。若未来使用多个 API worker，只允许一个 worker 设置 `SCHEDULER_ENABLED=true`，其他 worker 必须禁用调度。

## Nginx 示例

```nginx
server {
  listen 443 ssl;
  server_name portomind.example.internal;

  root /srv/portomind/client/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

TLS 证书配置因环境而异，示例未包含证书路径。

## 上线检查

- `npm test`、`npm run verify`、前端 lint/build 全部通过。
- `npm audit --omit=dev` 前后端均无已知漏洞。
- 只有一个调度器所有者。
- MongoDB 和日志目录有备份、容量与保留策略。
- `/api/logs` 仅在可信网络可访问。
- 外部行情失败能在任务日志中追踪，但不会中断其他资产。

Docker 尚未作为当前交付方式；容器化前应先设计健康检查、非 root 用户、持久卷、备份恢复和调度器单例策略。
