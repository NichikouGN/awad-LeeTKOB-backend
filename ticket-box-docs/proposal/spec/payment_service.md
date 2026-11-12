# Đặc tả thanh toán (Payment Service)

## Mô tả

Payment Service là service trung gian chịu trách nhiệm xử lý toàn bộ luồng thanh toán của hệ thống TicketBox. Service này đứng giữa Order Service và Mock Payment Gateway, đảm bảo mỗi giao dịch được xử lý đúng một lần, có khả năng phục hồi khi gateway gặp sự cố, và không bao giờ để người dùng bị trừ tiền mà không nhận được vé.

### Phạm vi

- Nhận yêu cầu thanh toán từ Order Service, gọi Mock Payment Gateway và trả về kết quả.
- Áp dụng Idempotency Key để chống tạo giao dịch trùng lặp.
- Áp dụng Circuit Breaker để bảo vệ hệ thống khi gateway không ổn định.
- Retry tự động (có giới hạn) thông qua Background Worker khi giao dịch thất bại tạm thời.
- Tuyệt đối không xử lý logic đặt vé, tạo order, hay cấp QR — đó là trách nhiệm của Order Service và Ticket Service.

Mock Payment Gateway hỗ trợ 3 kịch bản trong quá trình handshake đầu tiên (có thể cấu hình):

| Kịch bản  | Mô tả                                      |
| --------- | ------------------------------------------ |
| `success` | Gateway phản hồi thành công sau ~500ms     |
| `fail`    | Gateway trả về lỗi từ chối giao dịch (4xx) |
| `timeout` | Gateway không phản hồi trong vòng 10 giây  |

---

## API Contracts

### Tạo payment intent

**Endpoint:** `POST /api/v1/payments`

**Headers:**

- `Idempotency-Key: <UUIDv4>` — Bắt buộc

**Request Body:**

```json
{
  "orderId": "8b2c6e3c-fa52-474c-83b0-0b6c62bb1e89",
  "userId": "f2a1a9c0-7e0f-4c44-83e6-7a6a9f16a0f1",
  "amount": 7000000,
  "paymentMethod": "momo"
}
```

**Phản hồi thành công (201 Created):**

```json
{
  "success": true,
  "message": "Payment initialized successfully.",
  "data": {
    "payment_id": "pay-uuid-9999",
    "order_id": "8b2c6e3c-fa52-474c-83b0-0b6c62bb1e89",
    "status": "success",
    "amount": 7000000,
    "payment_url": "https://mock-payment.local/checkout/pay-uuid-xxx-9999",
    "payment_ref": "MOCK-TXN-20260715-ABC123",
    "payment_deadline": "2026-07-15T19:15:00Z"
  }
}
```

### Truy vấn trạng thái giao dịch

**Endpoint:** `GET /api/v1/payments/:payment_id`

**Headers:**

- `Authorization: Bearer <JWT_Token>`

**Phản hồi thành công (200 OK):**

```json
{
  "success": true,
  "data": {
    "payment_id": "pay-uuid-9999",
    "order_id": "ord-uuid-1234",
    "status": "SUCCESS",
    "amount": 3500000,
    "payment_ref": "MOCK-TXN-20260715-ABC123",
    "processed_at": "2026-07-15T19:05:00Z"
  }
}
```

---

## Luồng chính

s

### Luồng 1: Thanh toán thành công

<!-- 1. Order Service gửi một job vào BullMQ -->

1. Order Service gọi Payment Service
2. Payment Service nhận job, kiểm tra Idempotency Key trong Redis:
   - Nếu key đã tồn tại → trả về kết quả của lần trước (không gọi gateway)
   - Nếu key chưa tồn tại → tiếp tục bước 3
3. Lưu Idempotency Key vào Redis với `status = PENDING`
4. Kiểm tra trạng thái Circuit Breaker:
   - Nếu `OPEN` → không gọi gateway, trả về `503` ngay lập tức
   - Nếu `CLOSED` hoặc `HALF-OPEN` → tiếp tục bước 5
5. Gọi Mock Payment Gateway với timeout = 10 giây
6. Gateway trả về `SUCCESS`:
   - Cập nhật `status = SUCCESS`, lưu `payment_ref`
   - Ghi nhận thành công vào Circuit Breaker (failure count reset)
7. Đẩy các job vào BullMQ:
   - `UPDATE_ORDER_COMPLETED` vào `order-queue` → Order Worker cập nhật `order status = COMPLETED`
   - `GENERATE_TICKETS` vào `ticket-queue` → Ticket Worker sinh vé + QR
   - `SEND_ORDER_CONFIRMED` vào `notification-queue` → Notification Worker gửi email + in-app cho user

### Luồng 2: Retry qua Background Worker

1. Gateway trả về lỗi tạm thời (5xx) hoặc timeout:
   - Cập nhật `status = PENDING_RETRY`
   - Payment Service đẩy job retry vào BullMQ queue với delay = 30 giây
   - Trả về `202 Accepted` cho Order Service kèm `payment_id` để polling
2. Background Worker (Payment Service) consume job sau 30 giây:
   - Gọi lại gateway thêm 1 lần nữa
   - Nếu thành công: cập nhật `status = SUCCESS`, đưa job vào BullMQ cho các worker xử lý
   - Nếu hết retry: cập nhật `status = FAILED`, đưa job vào BullMQ cho các worker xử lý

---

## Kịch bản lỗi

## Gateway timeout (>10 giây không phản hồi)

- Payment Service ngắt kết nối sau đúng 10 giây.
- Ghi nhận 1 failure vào Circuit Breaker counter.
- Đẩy job retry vào BullMQ queue với delay 30 giây.
- Trả về `202 Accepted` cho Order Service, không để request treo vô hạn.
- **Log:** `WARN | Gateway timeout | order_id={id} | attempt={n}`

### Gateway trả về lỗi cứng (4xx — từ chối giao dịch)

- Không retry — lỗi 4xx là lỗi xác định (sai thông tin, tài khoản không đủ tiền...).
- Cập nhật `status = FAILED` ngay lập tức.
- Đẩy 2 job vào BullMQ:
  - `UPDATE_ORDER_FAILED` vào `order-queue` → Order Worker hủy order và hoàn trả stock về Redis
  - `SEND_ORDER_FAILED` vào `notification-queue` → Notification Worker gửi email thông báo
- **Log:** `WARN | Payment declined | order_id={id} | reason={gateway_message}`

### Circuit Breaker kích hoạt (trạng thái OPEN)

Circuit Breaker chuyển sang `OPEN` khi có 5 lần thất bại liên tiếp trong vòng 60 giây.

| Trạng thái  | Hành vi                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `CLOSED`    | Hoạt động bình thường, gọi gateway trực tiếp                                    |
| `OPEN`      | Từ chối toàn bộ request, trả về `503` ngay, không gọi gateway                   |
| `HALF-OPEN` | Cho phép 1 request thử nghiệm; nếu thành công → `CLOSED`, nếu thất bại → `OPEN` |

Khi `OPEN`, Payment Service trả về:

```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_SERVICE_UNAVAILABLE",
    "message": "Hệ thống thanh toán tạm thời gián đoạn. Vui lòng thử lại sau."
  }
}
```

- Cập nhật health endpoint: `GET /health` → `{ "payment_gateway": "down" }`
- Các service khác (xem concert, soát vé) vẫn hoạt động bình thường — Graceful Degradation.

### Idempotency Key trùng lặp

- Payment Service phát hiện key đã tồn tại trong database.
- Không gọi gateway, không tạo giao dịch mới.
- Trả về ngay kết quả của lần xử lý trước với HTTP `200`.
- **Log:** `INFO | Duplicate payment request detected | idempotency_key={key}`

### Hết lượt retry (sau 3 lần thất bại)

- Background Worker cập nhật `status = FAILED`.
- Đẩy 2 job vào BullMQ:
  - `UPDATE_ORDER_FAILED` vào `order-queue` → Order Worker hủy order và hoàn trả stock về Redis
  - `SEND_ORDER_FAILED` vào `notification-queue` → Notification Worker gửi email thông báo thất bại cho user
- **Log:** `ERROR | Payment permanently failed after 3 retries | order_id={id}`

### Webhook tới trễ hơn timeout

Vấn đề này thuộc nhóm out-of-scope.

---

## Ràng buộc

- **Idempotency:** Mỗi request thanh toán phải kèm `Idempotency-Key` duy nhất (UUID v4) do Order Service sinh ra. Payment Service từ chối request không có key này với `400 Bad Request`.
- **Không gọi gateway khi Circuit Breaker OPEN:** Tuyệt đối không forward request đến gateway khi circuit đang mở, tránh làm trầm trọng thêm tình trạng quá tải.
- **Giới hạn retry:** Tối đa 3 lần retry cho mỗi giao dịch, với delay tăng dần (30s → 60s → 120s). Sau 3 lần thất bại, giao dịch được đánh dấu `FAILED` vĩnh viễn.
- **Mỗi lần retry đều dùng lại cùng Idempotency Key gốc:** Gateway không tạo giao dịch mới cho cùng một key, đảm bảo không trừ tiền 2 lần dù retry nhiều lần.
- **Timeout cứng:** Mọi lệnh gọi đến Mock Payment Gateway phải có timeout = 10 giây. Không được để request block vô thời hạn.
- **Không xử lý logic vé:** Payment Service chỉ quan tâm đến kết quả giao dịch tài chính. Việc cấp vé, tạo QR, cập nhật `sold_quantity` là trách nhiệm của Order Service và Ticket Service.
- **Đồng bộ trạng thái:** Mọi thay đổi trạng thái giao dịch (`PENDING` → `SUCCESS` / `FAILED`) phải được ghi vào PostgreSQL trước khi trả về response, để đảm bảo không mất dữ liệu khi service restart.

---

## Tiêu chí chấp nhận

- Người dùng thanh toán thành công nhận được phản hồi trong vòng 15 giây.
- Cùng một `Idempotency-Key` gửi nhiều lần chỉ tạo đúng một giao dịch.
- Khi gateway timeout, hệ thống không trả về màn hình trắng — người dùng nhận được thông báo rõ ràng.
- Khi Circuit Breaker `OPEN`, các tính năng không liên quan đến thanh toán (xem concert, soát vé) vẫn hoạt động bình thường.
- Sau tối đa 3 lần retry thất bại, Payment Service emit job `UPDATE_ORDER_FAILED` — Order Worker hủy order và hoàn trả số vé về Redis stock.
- Không có trường hợp người dùng bị trừ tiền hai lần cho cùng một đơn hàng.
- Trạng thái giao dịch luôn phản ánh đúng thực tế khi truy vấn qua `GET /api/v1/payments/:payment_id`.
