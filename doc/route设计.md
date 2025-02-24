

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