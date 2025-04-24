太好了 ✅  
以下是适用于你当前部署架构（**Ubuntu 容器 + MongoDB 容器 + PM2 启动 + Cron 抓取任务**）的完整部署文档模板，你可以将其保存为：

```
📁 docs
 └── DEPLOY.md
```

---

## ✅ `docs/DEPLOY.md` 内容如下：

```md
# 🚀 PortoMind 部署指南（适用于 Ubuntu + NAS）

本指南适用于在自建服务器、NAS、或本地 Ubuntu 容器中部署 **PortoMind** 项目（使用 MongoDB + Node.js + React + PM2）。

---

## 📦 1. 克隆项目代码

```bash
git clone https://github.com/your-username/portomind-app.git
cd portomind-app
```

---

## ⚙️ 2. 配置 .env 环境变量

在 `server/` 目录下创建 `.env` 文件：

```ini
# .env
PORT=8080
MONGO_URI=mongodb://<用户名>:<密码>@mongo:27017/etf-data?authSource=admin
LOG=./logs
```

⚠️ 如果你使用的是 Docker bridge 网络，`mongo` 应为另一个容器的别名。

---

## 🧱 3. 安装依赖

### 3.1 安装后端依赖

```bash
cd server
npm install
```

### 3.2 安装前端依赖

```bash
cd ../client
npm install
```

---

## 🧪 4. 本地测试运行（开发环境）

### 启动后端服务

```bash
cd server
npm run dev
```

### 启动前端服务

```bash
cd client
npm run dev
```

访问前端地址：[http://localhost:5173](http://localhost:5173)

---

## 🧰 5. 后端服务后台守护（使用 PM2）

```bash
cd server
npm install -g pm2
pm2 start server.js --name portomind-api
```

查看日志：

```bash
pm2 logs portomind-api
```

开机自启（可选）：

```bash
pm2 startup
pm2 save
```

---

## 🕒 6. 设置自动抓取价格任务（cron）

确保 `server/tasks/syncPrices.js` 可独立执行。

```bash
crontab -e
```

添加：

```cron
*/5 * * * * cd /path/to/portomind-app/server && /usr/bin/node tasks/syncPrices.js >> ./logs/sync.log 2>&1
```

说明：每 5 分钟抓取一次资产价格，日志输出到 `logs/sync.log`

---

## 🌐 7. 外网访问（Nginx 反向代理建议）

示例配置（监听 80，将前端转发到本地 vite 编译端口）：

```nginx
server {
  listen 80;
  server_name your.domain.com;

  location / {
    proxy_pass http://localhost:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}
```

也可将前端打包部署为纯静态：

```bash
cd client
npm run build
```

然后将 `dist/` 目录交由 nginx 或 NAS 静态服务托管。

---

## ✅ Done！

你现在可以通过浏览器访问：`http://your-ip:5173` 或绑定域名访问。
