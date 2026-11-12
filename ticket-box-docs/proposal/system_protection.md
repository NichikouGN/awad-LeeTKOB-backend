# Các cơ chế bảo vệ hệ thống

## 1. Kiểm soát tải đột biến khi mở bán vé

### 1.1 Bảo vệ backend bằng token bucket

Khi concert mở bán, khoảng 80.000 người có thể truy cập cùng lúc trong vài phút đầu. Nếu tất cả request được gửi trực tiếp xuống backend và database, hệ thống rất dễ:

- Quá tải CPU/RAM
- Nghẽn kết nối database
- Sập API hoặc timeout hàng loạt
- Bot spam request gây mất công bằng

**Giải pháp lựa chọn: Token Bucket Rate Limiting kết hợp Waiting Room**

- Mỗi IP/User được cấp một "bucket" chứa số lượng token nhất định.
- Mỗi request tiêu tốn 1 token, có thể được refill. Nếu bucket hết token, trả về `429 Too Many Requests`

#### So sánh Token Bucket với các thuật toán khác

| Thuật toán     | Nhược điểm                          |
| -------------- | ----------------------------------- |
| Fixed Window   | Có thể bị burst ở đầu/cuối window   |
| Sliding Window | Chính xác hơn nhưng tốn tài nguyên  |
| Leaky Bucket   | Chính xác hơn nhưng tốn tài nguyên  |
| Token Bucket   | Quá đều, không phù hợp peak traffic |

### 1.2 Bảo vệ backend bằng Waiting Room

Khi traffic vượt ngưỡng:

- User được đưa vào hàng đợi
- Chỉ một số lượng nhất định được vào bước chọn vé

**Ví dụ:** Chỉ cho 5.000 user active checkout cùng lúc

Điều này giúp:

- Database không bị nghẽn
- Hệ thống ổn định hơn
- Công bằng hơn giữa người dùng

### 1.3 Redis dùng cho Rate Limiting

Sử dụng Redis vì:

- In-memory → cực nhanh
- Atomic operation (`INCR`)
- Hỗ trợ distributed system

**Ví dụ key:**

```
rate_limit:user_123
rate_limit:ip_1.2.3.4
```

**TTL:** 5 giây hoặc 1 phút

---

## 2. Xử lý cổng thanh toán không ổn định

**Giải pháp lựa chọn: Circuit Breaker + Graceful Degradation**

- Circuit Breaker pattern
- Retry có giới hạn
- Timeout
- Graceful fallback

Circuit Breaker có 3 trạng thái:

| Trạng thái | Ý nghĩa                           |
| ---------- | --------------------------------- |
| Closed     | Hoạt động bình thường             |
| Open       | Chặn request đến payment gateway  |
| Half-Open  | Test thử gateway đã phục hồi chưa |

---

## 3. Chống trừ tiền hai lần

**Giải pháp lựa chọn: Idempotency Key**

Mỗi request thanh toán sẽ có một `Idempotency-Key`

**Ví dụ:**

```
550e8400-e29b-41d4-a716-446655440000
```

**Frontend:**

- Sinh UUID
- Gửi kèm header: `Idempotency-Key: xxx`

**Backend:**

- **Bước 1** — Kiểm tra Redis/Database: Đã tồn tại key chưa?
- **Bước 2:**
  - Nếu **chưa tồn tại**: Lock request → Xử lý thanh toán → Lưu kết quả theo key
  - Nếu **đã tồn tại**: Trả lại kết quả cũ, không thực hiện thanh toán lần nữa

**Dữ liệu lưu — Ví dụ Redis:**

```json
{
  "key": "payment:550e...",
  "status": "SUCCESS",
  "orderId": "ORD123"
}
```

---

## 4. Caching để giảm tải database

**Giải pháp lựa chọn: Cache-Aside Pattern với Redis**

### 4.1 Cache-Aside hoạt động

**Luồng xử lý:**

```
Client → API → Redis
                 ├─ Cache hit → trả dữ liệu
                 └─ Cache miss → query DB → cache lại
```

### 4.2 Cache cho từng loại dữ liệu

**Thông tin concert** (Tên concert, Banner, Mô tả, Nghệ sĩ)

Ít thay đổi nên:

- TTL: 30 phút - 2 giờ

**Danh sách concert hot**

- TTL: 5 - 10 phút

**Số vé còn lại**

Dữ liệu thay đổi liên tục nên:

- TTL ngắn, hoặc
- Chủ động invalidate khi có giao dịch

Ví dụ TTL: 5 - 10 giây

### 4.3 Invalidate chủ động

Khi thanh toán thành công:

1. Update database
2. Xóa cache liên quan

**Ví dụ:**

```
DEL concert:123:remaining_seats
```

Request tiếp theo:

- Load lại từ DB
- Cache lại dữ liệu mới

### 4.4 Vì sao dùng Redis?

Redis phù hợp vì:

- In-memory cực nhanh
- Latency thấp
- Hỗ trợ TTL
- Scale tốt
- Phổ biến trong hệ thống lớn

---

## 5. Tổng kết kiến trúc bảo vệ hệ thống

| Vấn đề              | Giải pháp                              |
| ------------------- | -------------------------------------- |
| Traffic đột biến    | Token Bucket + Waiting Room            |
| Payment Gateway lỗi | Circuit Breaker + Graceful Degradation |
| Thanh toán lặp      | Idempotency Key                        |
| Database quá tải    | Redis Cache-Aside                      |

Các cơ chế trên phối hợp với nhau giúp hệ thống:

- Chịu tải cao khi mở bán
- Ổn định khi dependency lỗi
- Đảm bảo tính đúng đắn giao dịch
- Giảm tải cho database
- Tăng trải nghiệm người dùng và tính công bằng khi mua vé
