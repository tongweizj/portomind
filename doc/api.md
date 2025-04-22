
# API 使用说明

## 投资组合

### 🟢 创建组合

```
POST http://localhost:8080/api/portfolios
Content-Type: application/json

{
  "name": "退休组合",
  "description": "这是为60岁退休准备的组合",
  "type": "长期",
  "currency": "加币"
}
```

---

### 📋 获取所有组合列表

```
GET http://localhost:8080/api/portfolios
```

---

### 🔍 获取单个组合（替换 :id）

```
GET http://localhost:8080/api/portfolios/6806f3e0a274de4827871e33
```

---

### ✏️ 更新组合（替换 :id）

```
PUT http://localhost:8080/api/portfolios/6806f3e0a274de4827871e33
Content-Type: application/json

{
  "name": "退休组合V2",
  "description": "更新后的备注",
  "type": "稳健",
  "currency": "美金"
}
```

---

### ❌ 删除组合（同时删除其交易）

```
DELETE http://localhost:8080/api/portfolios/6806f3e0a274de4827871e33
```

---

### 📊 获取组合统计（如净持仓、成本等）

```
GET http://localhost:8080/api/portfolios/6806f3e0a274de4827871e33/stats
```

---

### 📄 获取该组合下所有交易（复用交易模块）

```
GET http://localhost:8080/api/portfolios/6806f3e0a274de4827871e33/transactions
```

---

这些请求都可以直接在 Postman 中新建请求、粘贴测试。  
如果你需要我帮你生成一套 Postman 集合 `.json` 导入文件，也可以告诉我。

是否接下来开始做前端的 Portfolio 表单页面？或者展示 Portfolio 列表？

### 交易记录相关
方法	路径	功能
GET	/api/transactions	获取所有交易记录（✅ 新增）
POST	/api/transactions	添加交易
GET	/api/transactions/:portfolioId	获取指定组合的交易
GET	/api/transactions/:id	获取单个交易记录
PUT	/api/transactions/:id	更新交易记录
DELETE	/api/transactions/:id	删除交易记录