
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



## Asset 接口说明

### 1. GET `/api/assets`

**功能**

获取所有资产

**请求参数**

无

**响应示例**

{ success: true, data: [Asset, ...] }

**状态码**

200


### 2. GET `/api/assets/{id}`

**功能**

获取单个资产

**请求参数**

id (URL 参数)

**响应示例**

{ success: true, data: Asset }

**状态码**

200, 404

### 3. POST /api/assets

**功能**

创建新资产

**请求参数**

JSON body: 
{
  "symbol": "AAPL",
  "market": "US",
  "active": true
}

**响应示例**

{ success: true, data: Asset }

**状态码**

201, 400

### 4. PUT /api/assets/{id}

**功能**

更新指定资产

**请求参数**

id (URL 参数), JSON body: AssetInput

**响应示例**

{ success: true, data: Asset }

**状态码**

200, 400, 404

### 5. DELETE /api/assets/{id}


**功能**

删除指定资产

**请求参数**

id (URL 参数)

**响应示例**

{ success: true, data: DeletedAsset }

**状态码**

200, 404


## Price 主要接口说明

下面是用 Postman 测试所有 Price 相关 API 接口的配置示例，你可以逐一新建请求或保存为 Collection 回归测试。

---

## 公共设置

- **Base URL**：`http://localhost:3000/api/prices`  
- **Headers**：  
  ```
  Content-Type: application/json
  ```

---

### 1. 获取所有价格记录

- **Method**：GET  
- **URL**：`{{Base URL}}/`  
- **Body**：无  
- **预期响应**（200 OK）：  
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "643a3f2e1c4d5b0f8e6a1234",
        "symbol": "VTI",
        "name": "Vanguard Total Stock Market ETF",
        "price": 210.34,
        "currency": "USD",
        "market": "US",
        "timestamp": "2025-05-01T08:00:00.000Z",
        "__v": 0
      },
      ...
    ]
  }
  ```

---

### 2. 根据 ID 获取单条价格

- **Method**：GET  
- **URL**：`{{Base URL}}/:id`  
  - 示例：`http://localhost:3000/api/prices/643a3f2e1c4d5b0f8e6a1234`  
- **Body**：无  
- **预期响应**：  
  - **200 OK**（找到记录）  
    ```json
    {
      "success": true,
      "data": { /* 同上单条 Price 对象 */ }
    }
    ```
  - **404 Not Found**（ID 不存在）  
    ```json
    {
      "success": false,
      "message": "Price not found"
    }
    ```

---

### 3. 根据 Symbol 获取该标的所有记录

- **Method**：GET  
- **URL**：`{{Base URL}}/symbol/:symbol`  
  - 示例：`http://localhost:3000/api/prices/symbol/VTI`  
- **Body**：无  
- **预期响应**（200 OK）：  
  ```json
  {
    "success": true,
    "data": [
      { /* 时间倒序的 VTI 价格记录 */ }
    ]
  }
  ```

---

### 4. 创建新价格记录

- **Method**：POST  
- **URL**：`{{Base URL}}/`  
- **Body** → **raw** JSON：
  ```json
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 172.09,
    "currency": "USD",
    "market": "US",
    "timestamp": "2025-05-01T08:30:00.000Z"
  }
  ```
- **预期响应**（201 Created）：
  ```json
  {
    "success": true,
    "data": {
      "_id": "643a4a9b1c4d5b0f8e6a5678",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "price": 172.09,
      "currency": "USD",
      "market": "US",
      "timestamp": "2025-05-01T08:30:00.000Z",
      "createdAt": "2025-05-01T08:30:15.123Z",
      "updatedAt": "2025-05-01T08:30:15.123Z",
      "__v": 0
    }
  }
  ```

---

### 5. 更新指定 ID 的价格记录

- **Method**：PUT  
- **URL**：`{{Base URL}}/:id`  
  - 示例：`http://localhost:3000/api/prices/643a4a9b1c4d5b0f8e6a5678`  
- **Body** → **raw** JSON（仅需包含要更新的字段）：
  ```json
  {
    "price": 173.50,
    "timestamp": "2025-05-01T09:00:00.000Z"
  }
  ```
- **预期响应**：  
  - **200 OK**（更新成功）  
    ```json
    {
      "success": true,
      "data": {
        "_id": "643a4a9b1c4d5b0f8e6a5678",
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "price": 173.50,
        "currency": "USD",
        "market": "US",
        "timestamp": "2025-05-01T09:00:00.000Z",
        "createdAt": "2025-05-01T08:30:15.123Z",
        "updatedAt": "2025-05-01T09:00:02.456Z",
        "__v": 0
      }
    }
    ```
  - **404 Not Found**（ID 不存在）  
    ```json
    {
      "success": false,
      "message": "Price not found"
    }
    ```

---

### 6. 删除指定 ID 的价格记录

- **Method**：DELETE  
- **URL**：`{{Base URL}}/:id`  
  - 示例：`http://localhost:3000/api/prices/643a4a9b1c4d5b0f8e6a5678`  
- **Body**：无  
- **预期响应**：  
  - **200 OK**（删除成功）  
    ```json
    {
      "success": true,
      "data": { /* 被删除的 Price 对象 */ }
    }
    ```
  - **404 Not Found**  
    ```json
    {
      "success": false,
      "message": "Price not found"
    }
    ```

---

> **Tip**：  
> - 可以在 Postman 中用环境变量 `{{baseUrl}}` 统一管理主机名和端口。  
> - 保存为 Collection 后，利用 Postman 的测试脚本和变量快速验证返回结构与状态码。


---

根据你的需求，以下是推荐的 **RESTful API URL 设计**：

---

### 1. **创建 ETF (元数据)**
- **HTTP 方法**: `POST`
- **URL**: `/etfs`
- **请求体示例**:
  ```json
  {
    "code": "SPY",
    "name": "SPDR S&P 500 ETF",
    "description": "追踪标普500指数"
  }
  ```
- **用途**: 创建 ETF 的基本信息（非每日数据）。

---

### 2. **获取所有 ETF 的每日数据**
- **HTTP 方法**: `GET`
- **URL**: `/etfs/daily`
- **查询参数**:
  - `date` (可选): 指定日期（格式 `YYYY-MM-DD`），如 `date=2023-10-01`
  - `start_date` + `end_date` (可选): 日期范围，如 `start_date=2023-01-01&end_date=2023-12-31`
  - `page` (可选): 分页页码，如 `page=1`
  - `limit` (可选): 每页数量，如 `limit=10`
- **示例**:
  ```
  GET /etfs/daily?date=2023-10-01&page=1&limit=20
  ```
- **响应示例**:
  ```json
  {
    "data": [
      {
        "code": "SPY",
        "date": "2023-10-01",
        "price": 430.50,
        "volume": 1000000
      },
      {
        "code": "QQQ",
        "date": "2023-10-01",
        "price": 350.20,
        "volume": 500000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
  ```

---

### 3. **获取单个 ETF 的每日数据**
- **HTTP 方法**: `GET`
- **URL**: `/etfs/{code}/daily`
- **路径参数**:
  - `code`: ETF 代码（如 `SPY`）
- **查询参数**:
  - `date` (可选): 指定日期（格式 `YYYY-MM-DD`）
  - `start_date` + `end_date` (可选): 日期范围
  - `page` + `limit` (可选): 分页
- **示例**:
  ```
  GET /etfs/SPY/daily?start_date=2023-01-01&end_date=2023-10-01
  ```
- **响应示例**:
  ```json
  {
    "code": "SPY",
    "data": [
      {
        "date": "2023-01-01",
        "price": 400.00,
        "volume": 800000
      },
      {
        "date": "2023-10-01",
        "price": 430.50,
        "volume": 1000000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 2
    }
  }
  ```

---

### 4. **附加说明**
1. **版本控制**（可选）:
   可以在 URL 中添加版本号，如 `/api/v1/etfs`，方便未来迭代。

2. **日期格式**:
   统一使用 `YYYY-MM-DD` 格式，符合 ISO 8601 标准。

3. **错误处理**:
   返回标准 HTTP 状态码（如 `404` 表示 ETF 不存在，`400` 表示参数错误）。

4. **分页**:
   所有列表接口建议支持分页，避免一次性返回过多数据。

---

### 完整 URL 示例
| 功能                   | 方法   | URL                                      |
|------------------------|--------|------------------------------------------|
| 创建 ETF               | POST   | `/etfs`                                  |
| 获取所有 ETF 每日数据  | GET    | `/etfs/daily?date=2023-10-01`            |
| 获取单个 ETF 每日数据  | GET    | `/etfs/SPY/daily?start_date=2023-01-01`  |

此设计符合 RESTful 规范，且易于扩展。