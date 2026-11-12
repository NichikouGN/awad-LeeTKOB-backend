# Đặc tả đặt vé (Order Service)

## Mô tả

### Phạm vi

Tiếp nhận yêu cầu giữ vé, kiểm tra giới hạn vé, khởi tạo đơn hàng, phối hợp với Payment Service để thanh toán.

### Yêu cầu hiệu năng

Thiết kế cho các tác vụ Write-Heavy. Sử dụng kiến trúc hướng sự kiện qua message queue bằng Redis và BullMQ.

### Ràng buộc

- Không được xảy ra overselling (bán vượt số lượng vé).
- Mỗi vé chỉ được bán cho duy nhất một người.
- Giới hạn vé theo user phải được enforce trên toàn hệ thống.
- Hệ thống phải xử lý được lượng lớn request đồng thời trong thời gian mở bán.
- Thời gian phản hồi thao tác mua vé không vượt quá vài giây trong điều kiện bình thường (không flash sale).
- Thanh toán phải đảm bảo tính idempotent để tránh trừ tiền hai lần.
- Dữ liệu đơn hàng và vé phải đảm bảo strong consistency.

---

## API Contracts

### API 1: Khởi tạo đặt vé

**Endpoint:** `POST /api/v1/orders`

**Headers:**

- `Authorization: Bearer <JWT_Token>` — Bắt buộc
- `Idempotency-Key: <UUIDv4 Frontend>` — Bắt buộc

**Request Body:**

```json
{
  "data": [
    {
      "concert_id": "c3b07384-d113-4e31-92f7-e43598d9e2d3",
      "ticket_type_id": "t1a2b3c4-d5e6-7f8g-9h0i-j1k2l3m4n5o6",
      "quantity": 2
    }
  ]
}
```

**Phản hồi thành công (201 Created):**

```json
{
  "success": true,
  "message": "Ticket reserved successfully. Please proceed to payment.",
  "data": {
    "order_id": "8b2c6e3c-fa52-474c-83b0-0b6c62bb1e89",
    "total_price": 7000000,
    "payment_deadline": "2026-06-01T10:10:00Z",
    "payment_url": "https://mock-payment.local/checkout/pay-uuid-xxx-9999"
  }
}
```

> `payment_deadline`: 10 phút để thanh toán

---

### API 2: Lấy danh sách đơn hàng

**Endpoint:** `GET /api/v1/orders`

**Query Parameters:** `page`, `limit`, `status`, `concert_id`, `user_id`

**Phản hồi (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "ord-uuid",
      "user_email": "user@example.com",
      "concert_title": "Anh Trai Say Hi",
      "total_amount": 7000000,
      "status": "COMPLETED",
      "created_at": "2026-07-01T10:00:00Z"
    }
  ],
  "pagination": { "current_page": 1, "total_pages": 5, "total_items": 48 }
}
```

---

## Luồng chính

### Luồng 1: Khởi tạo đặt vé

1. Kiểm tra idempotency `order:idempotency:{idempotency_key}` trong Redis
   - Nếu tồn tại → trở về
   - Nếu chưa → lưu key với giá trị `Processing`
2. Chạy thuật toán kiểm tra vé qua Redis với script Lua:
   - Đọc số lượng vé còn lại qua key `catalog:concert:{concert_id}:ticket_type:{type_id}:stock`
   - Nếu phát hiện chưa có key này, gọi `GET /api/v1/concert/:{concert_id}/stock` để set key
   - Đọc số vé đã mua, giữ của user từ key: `order:user:{user_id}:concert:{concert_id}:ticket_type:{ticket_type_id}:purchased`
   - Nếu `(vé còn lại >= quantity)` và `(vé đã mua + quantity <= max_per_user)`: giảm số lượng vé còn lại (`DECRBY`) và tăng số lượng vé giữ (`INCRBY`)
   - Trả về `SUCCESS` hoặc `FAILED`
3. Xử lý kết quả nhận được:
   - Nếu `FAILED`: Xóa Idempotency Key, trả lỗi `400 Bad Request` (`"Vé đã hết hoặc vượt quá giới hạn mua"`)
   - Nếu `SUCCESS`: Tạo bản ghi với trạng thái `PENDING` trong DB ở table `order`
4. Đẩy 1 job vào BullMQ:
   - `order-queue: CLEANUP_EXPIRED_ORDER` — delay 10 phút. Một worker sẽ check job và kiểm tra `order_id` và trạng thái trong PostgreSQL. Nếu vẫn là `'PENDING'`, đưa trạng thái về `'EXPIRED'` và đồng thời hoàn lại vé
   <!-- - `payment-queue: PENDING_PAYMENT` — dùng cho Payment Service consume và thực hiện các bước kế tiếp của quá trình giao dịch -->
5. Gọi payment Service với các thông tin vé đã nhận, payment service trả về `payment_url` để frontend redirect
6. Phản hồi `201 Created` về Frontend

### Luồng 2: Xử lý job CLEANUP_EXPIRED_ORDER

1. Sau delay 10 phút, job cleanup của order xuất hiện trong `order-queue`
2. Order Cleanup Worker consume job này và check thông tin trong PostgreSQL
3. Nếu status là `'COMPLETED'` hay `'FAILED'` → ignore job này
4. Nếu là `'PENDING'` → set status thành `'EXPIRED'`, thực hiện quá trình hoàn lại vé bằng Redis

---

## Kịch bản lỗi

### Người dùng spam mua vé

Sử dụng `Idempotency-Key` để kiểm tra. Nếu các request sau gửi khi request đầu đang trong trạng thái `PROCESSING` thì trả về mã `409 Conflict`.

### DB không lưu được đơn hàng Pending

Nếu `INSERT INTO orders` vào PostgreSQL timeout hoặc lỗi, hệ thống thực hiện rollback trên Redis: xóa key của user, đồng thời trả lại stock (`INCRBY`) và trả về `500 Internal Server Error`.

### Không cập nhật được trạng thái đơn sau 10 phút

Worker sẽ kiểm tra trạng thái đơn hàng trên DB. Nếu vẫn là `PENDING`, tiến hành quy trình rollback hoàn lại vé:

- Hoàn lại số lượng vé vào key Redis `catalog:concert:{concert_id}:ticket_type:{type_id}:stock`
  - Nếu phát hiện chưa có key này, gọi lại API để set key
- Hoàn lại số vé đã mua/giữ của user thông qua key Redis: `order:user:{user_id}:concert:{concert_id}:ticket_type:{ticket_type_id}:purchased`

---

## Tiêu chí chấp nhận

- Người dùng xem được đầy đủ thông tin vé.
- Người dùng có thể thanh toán thành công và nhận QR e-ticket.
- Không có hai người cùng mua được một vé cuối cùng.
- Người dùng không thể vượt quá giới hạn vé cho phép.
- Không xảy ra tình trạng tạo nhiều đơn hàng do spam request.
- Vé được trả lại hệ thống khi thanh toán thất bại hoặc timeout.
- Hệ thống vẫn hoạt động khi Payment Gateway gặp sự cố.
- Người dùng nhận được email/thông báo sau khi mua vé thành công.
