# API 使用入口

本文件原先包含端口、路由和返回结构均已过期的手工示例。当前唯一 API 定义请查看 [API_CONTRACT.md](./API_CONTRACT.md)。

本地服务默认地址：`http://localhost:8080`，API 前缀为 `/api`。例如：

```bash
curl "http://localhost:8080/api/assets?page=1&pageSize=20"
curl "http://localhost:8080/api/prices/today?page=1&pageSize=20"
curl "http://localhost:8080/api/logs/tasks?date=2026-08-24&level=all"
```

所有成功响应使用 `{ success, data, pagination? }`，所有错误响应使用 `{ success: false, message, traceId }`。
