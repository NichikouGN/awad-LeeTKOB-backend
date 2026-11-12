# Đặc tả thông tin concert (Concert Service)

## 1. Mô tả

### Phạm vi

| Vai trò       | Quyền hạn                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organizer** | Cho phép organizer thêm, xóa concert. Cập nhật các thông tin về concert như ảnh bìa, thời gian, vị trí, các khách mời                                                |
| **User**      | Cho phép User xem thông tin về concert gồm ảnh, thời gian, vị trí, khách mời. Cho phép xem các loại vé (GA, SVIP, VIP, CAT1, CAT2) và số lượng còn lại của từng loại |

### Yêu cầu hiệu năng

Thiết kế cho các tác vụ Read-Heavy. Phải chịu tối thiểu 5,000 RPS thông qua các Cache Layer.

### Ràng buộc

- Tuyệt đối không thực hiện ghi đơn hàng, mua vé hay trừ tiền tại service này
- Dữ liệu concert phải được cache để giảm tải database.
- Thời gian phản hồi trung bình dưới 2 giây trong điều kiện bình thường.
- Hệ thống phải hỗ trợ tối thiểu hàng nghìn request đọc mỗi giây trong giờ cao điểm.
- Đối với dữ liệu "Số lượng vé còn lại", service sẽ đọc bản sao lưu từ Redis được đồng bộ từ Order Service
- Phần quyền rõ ràng giữa organizer và user. User không được phép sử dụng các route chỉ dành cho organizer

---

## 2. API Contracts

### API 1 [USER]: Lấy danh sách các concert sắp diễn ra

**Endpoint:** `GET /api/v1/concerts`

**Headers:**

- `Origin`: Cần thiết cho CORS
- `User-Agent`: Cho backend tối ưu payload cho web và mobile

**Query Parameters:**

- `page`: số nguyên (mặc định 1)
- `limit`: số nguyên (mặc định 10)

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "c3b07384-d113-4e31-92f7-e43598d9e2d3",
      "title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
      "artists": ["HIEUTHUHAI", "Rhyder", "Captain"],
      "venue": "Sân vận động Quân khu 7, TP.HCM",
      "start_time": "2026-07-15T19:00:00Z",
      "status": "UPCOMING",
      "thumbnail_url": "https://cdn.ticketbox.vn/images/concert1.jpg"
    }
  ],
  "Pagination": {
    "current_page": 1,
    "total_page": 5,
    "total_items": 42
  }
}
```

---

### API 2 [USER]: Lấy chi tiết một concert

**Endpoint:** `GET /api/v1/concerts/:id`

**Headers:**

- `Origin`: Cần thiết cho CORS
- `User-Agent`: Cho backend tối ưu payload cho web và mobile

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "c3b07384-d113-4e31-92f7-e43598d9e2d3",
    "title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
    "description": "Bản tóm tắt nghệ sĩ tạo bởi AI...",
    "artists": ["HIEUTHUHAI", "Rhyder"],
    "venue": "Sân vận động Quân khu 7, TP.HCM",
    "start_time": "2026-07-15T19:00:00Z"
  }
}
```

---

### API 3 [USER]: Lấy sơ đồ loại vé và số lượng

**Endpoint:** `GET /api/v1/concerts/:id/tickets`

**Headers:**

- `Origin`: Cần thiết cho CORS
- `User-Agent`: Cho backend tối ưu payload cho web và mobile

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "data": {
    "seat_map_svg_url": "https://cdn.ticketbox.vn/maps/qk7-layout.svg",
    "ticket_types": [
      {
        "id": "t1a2b3c4-d5e6-7f8g-9h0i-j1k2l3m4n5o6",
        "name": "SVIP",
        "price": 3500000,
        "max_per_user": 2,
        "available_seats": 145
      },
      {
        "id": "t9z8y7x6-w5v4-u3t2-s1r0-q9p8o7n6m5l4",
        "name": "GA",
        "price": 800000,
        "max_per_user": 4,
        "available_seats": 2301
      }
    ]
  }
}
```

---

### API [USER]: Lấy Stock của một concert nhất định

**Endpoint:** `GET /api/v1/concerts/:id/stock`

**Headers:**

- `Origin`: Cần thiết cho CORS

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "data": {
    "ticket_types": [
      {
        "id": "t1a2b3c4-d5e6-7f8g-9h0i-j1k2l3m4n5o6",
        "name": "SVIP",
        "price": 3500000,
        "total_quantity": 200,
        "sold_quantity": 5
      },
      {
        "id": "t9z8y7x6-w5v4-u3t2-s1r0-q9p8o7n6m5l4",
        "name": "GA",
        "price": 800000,
        "total_quantity": 2000,
        "sold_quantity": 678
      }
    ]
  }
}
```

---

### API 4 [ORGANIZER]: Thêm một concert mới

**Endpoint:** `POST /api/v1/organizer/concerts`

**Headers:**

- `Authentication: Bearer <JWT_Token>`
- `Content-Type: application/json`

**Request Body:**

```json
{
  "title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
  "description": "Bản tóm tắt nghệ sĩ...",
  "artists": ["HIEUTHUHAI", "Rhyder", "Captain"],
  "venue": "Sân vận động Quân khu 7, TP.HCM",
  "start_time": "2026-07-15T19:00:00Z",
  "thumbnail_url": "https://cdn.ticketbox.vn/images/concert1.jpg",
  "seat_map_svg_url": "https://cdn.ticketbox.vn/maps/qk7-layout.svg",
  "ticket_types": [
    { "name": "SVIP", "price": 3500000, "max_per_user": 2, "total_capacity": 200 },
    { "name": "GA", "price": 800000, "max_per_user": 4, "total_capacity": 5000 }
  ]
}
```

**Phản hồi thành công (201 Created):**

```json
{
  "success": true,
  "message": "Concert created successfully",
  "data": { "concert_id": "c3b07384-d113-4e31-92f7-e43598d9e2d3" }
}
```

---

### API 5 [ORGANIZER]: Thay đổi thông tin một concert

**Endpoint:** `PATCH /api/v1/organizer/concerts/:{concert_id}`

**Headers:**

- `Authentication: Bearer <JWT_Token>`
- `Content-Type: application/json`

**Request Body:**

```json
{
  "title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
  "description": "Bản tóm tắt nghệ sĩ..."
}
```

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "message": "Concert updated successfully"
}
```

---

### API 6 [ORGANIZER]: Hủy concert

**Endpoint:** `PATCH /api/v1/organizer/concerts/:concert_id/cancel`

**Request Body:**

```json
{ "reason": "Nghệ sĩ không thể tham dự" }
```

**Phản hồi (200 OK):**

```json
{ "success": true, "message": "Concert đã bị hủy. Thông báo đang được gửi đến người dùng." }
```

> **Lưu ý:** Tạo concert và sửa thông tin concert đã được đặc tả trong Concert Service. API này chỉ xử lý riêng hành động hủy vì có side effect phức tạp (refund, notification).

---

## 3. Luồng chính

### a. Xử lý Request lấy danh sách concert

1. Concert Service kiểm tra cache Redis bằng lệnh `MGET`
2. **(Cache Hit):** Đưa thông tin vào JSON payload, trả về mã `200 OK`
3. Nếu cache không tồn tại:
   - Thực hiện gọi DB. Ví dụ: `SELECT * FROM concerts ORDER BY event_date LIMIT 10 OFFSET 0`
   - Đưa dữ liệu vào Redis bằng lệnh `SET EX` với TTL = 30m, trả về mã `200 OK`

### b. Xử lý request lấy thông tin concert chi tiết

1. Kiểm tra `:{concert_id}` có đúng định dạng UUIDv4 không, nếu không trả về `400 Bad Request`
2. Gọi lệnh `MGET` lấy thông tin của concert từ các key trong Redis
3. **(Cache Hit):** Đưa thông tin concert vào JSON payload, trả về mã `200 OK`
4. **(Cache Miss):**
   - Thực hiện `SELECT * FROM concerts WHERE id = :{concert_id}` trong PostgreSQL
   - Nếu không thấy, trả về `404 Not Found`
   - Nếu tìm thấy, đưa dữ liệu mới này vào Redis bằng lệnh `SET EX` với TTL = 30m, trả về mã `200 OK`

### c. Hiển thị loại vé và số lượng còn lại

1. Kiểm tra `{concert_id}` có đúng định dạng UUIDv4 không, nếu không trả về `400 Bad Request`
2. Gọi lệnh `MGET` lấy thông tin của concert từ các key trong Redis
3. **(Cache Hit):** Đưa thông tin concert vào JSON payload, trả về mã `200 OK`
4. **(Cache Miss):**
   - Thực hiện `SELECT FROM concerts JOIN ticket_types WHERE id = :{concert_id}` trong PostgreSQL
   - Nếu không thấy, trả về `404 Not Found`
   - Nếu tìm thấy, đưa dữ liệu mới này vào Redis bằng lệnh `SET EX` với TTL = 30s, trả về mã `200 OK`

### d. Xử lý request thêm concert mới

1. Đi qua middleware kiểm tra mã JWT_Token. Nếu không hợp lệ, trả về `401 Unauthorized`. Nếu role không phải là `ORGANIZER`, trả về `403 Forbidden`
2. Thực hiện 1 DB transaction ghi thông tin vào bảng `concert` và các vé vào bảng `ticket_types`
3. Với hạng vé vừa tạo, gọi lệnh Redis `SET` để thiết lập số lượng còn lại ban đầu: `catalog:concert:{concert_id}:ticket_type:{type_id}:stock` bằng giá trị `total_capacity`
4. Trả về mã `201 Created`

### e. Xử lý request chỉnh sửa thông tin concert

1. Đi qua middleware kiểm tra mã JWT_Token. Nếu không hợp lệ, trả về `401 Unauthorized`. Nếu role không phải là `ORGANIZER`, trả về `403 Forbidden`
2. Thực hiện 1 DB transaction cập nhật các thông tin vào bảng `concert` và bảng `ticket_types` nếu có thay đổi
3. Xóa các cache Redis có liên quan:
   ```
   DEL catalog:concert:{concert_id}
   DEL catalog:concert:
   ```
4. Trả về mã `200 OK`

### f. Hủy concert

1. Organizer gửi `PATCH /api/v1/organizer/concerts/:concert_id/cancel`
2. Middleware xác thực JWT, kiểm tra role = `ORGANIZER`
3. Organizer Service kiểm tra concert có tồn tại và `status = 'published'`
   - Không tồn tại → `404 Not Found`
   - Status không phải `'published'` → `400 Bad Request`
4. Cập nhật `concerts.status = 'cancelled'` trong PostgreSQL
5. Ghi audit log: `{ organizer_id, action: 'CANCEL_CONCERT', target_id, reason, timestamp }`
6. Đẩy job vào BullMQ queue: Job notification: gửi `CONCERT_CANCELLED` đến tất cả user có vé
7. Trả về `200 OK` — không chờ refund và notification hoàn thành

---

## 4. Kịch bản lỗi

### Redis cache bị lỗi

Sử dụng một `try-catch` block bao bọc các lệnh gọi Redis. Nếu hệ thống bắt được lỗi Redis, hệ thống mở Circuit Breaker:

- Thông báo lỗi gửi tới client:
  ```json
  {
    "status": 503,
    "error": "Service Unavailable",
    "message": "Hệ thống đang quá tải hoặc bảo trì. Vui lòng thử lại sau."
  }
  ```
- **Log:** Khi lỗi `WARN` kèm thông điệp `"Redis connection lost. Falling back to DB"`
- Cập nhật endpoint `GET /health` của hệ thống sang `{redis: "down"}`
- API Gateway giảm số lượng connections
- **Phản hồi:** Vẫn trả về mã `200 OK` với thời gian phản hồi chậm hơn

### Quá tải truy cập đột biến

- Cấu hình giới hạn số lượng connection từ API Gateway
- Giới hạn tối đa 10 request/s trên cùng một User ID với các API đọc, nếu vượt quá, trả về mã `429 Too Many Requests` kèm payload:
  ```json
  { "success": false, "message": "Thao tác quá nhanh. Vui lòng đợi vài giây." }
  ```

---

## 5. Tiêu chí chấp nhận

- Khán giả có thể xem danh sách concert.
- Khán giả có thể xem đầy đủ thông tin chi tiết concert.
- Hệ thống hiển thị đúng số lượng vé còn lại.
- Trang concert vẫn hoạt động khi Redis cache bị lỗi.
- Hệ thống không bị sập khi có lượng lớn người truy cập đồng thời.
- Dữ liệu trả về đúng với dữ liệu lưu trong database.
- Organizer có thể thêm, chỉnh sửa dữ liệu các concert.
