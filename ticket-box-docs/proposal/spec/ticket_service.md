# Đặc tả Ticket Service

## 1. Mô tả

Ticket Service chịu trách nhiệm sinh vé và mã QR sau khi thanh toán thành công. Service này lắng nghe job GENERATE_TICKETS từ Payment Service qua BullMQ, tạo từng vé vật lý tương ứng với order, và lưu trữ mã QR theo chuẩn bảo mật.

### Phạm vi

- Nhận job từ queue và sinh vé sau khi payment thành công.
- Tạo mã QR token ngẫu nhiên, mã hóa AES-256 để lưu DB, hash SHA-256 để staff so sánh khi soát vé.
- Cho phép user xem danh sách vé đã mua.
- Cung cấp internal API cho Check-in Service truy vấn danh sách hash SHA-256 theo concert.

### Nguyên tắc thiết kế

- Ticket Worker phải idempotent — nếu job bị retry, không được tạo vé trùng.
- Không bao giờ expose mã QR gốc qua API — chỉ trả về dạng đã mã hóa AES-256 để render QR trên app.
- SHA-256 là dạng một chiều — staff không thể reverse lại mã gốc.

---

## 2. Cơ chế bảo mật QR

Mỗi vé có 3 giá trị liên quan đến mã QR:

| Giá trị   | Mô tả                                | Lưu ở đâu                                      |
| --------- | ------------------------------------ | ---------------------------------------------- |
| qr_raw    | UUID v4 ngẫu nhiên, sinh server-side | Không lưu — chỉ tồn tại trong memory lúc sinh  |
| qr_aes256 | AES-256 encrypt của qr_raw           | PostgreSQL — dùng để render QR trên app        |
| qr_sha256 | SHA-256 hash của qr_raw              | PostgreSQL — dùng để staff so sánh khi soát vé |

### Luồng soát vé

1. Khán giả mở app → app hiển thị mã QR (qr_raw) được gửi về từ phía server
2. Staff quét QR → lấy được qr_raw → hash SHA-256 → gửi về server để verify.
3. Khớp → vé hợp lệ.
4. Không khớp → INVALID.

---

## 3. API Contracts

### 3.1 API 1: Xem danh sách vé của user

**GET** `/api/v1/tickets`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "ticket_id": "tkt-uuid",
      "concert_title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
      "event_date": "2026-07-15T18:00:00Z",
      "venue": "Sân vận động Mỹ Đình",
      "ticket_type": "VIP",
      "holder_name": "Nguyễn Văn A",
      "qr_raw": "<qr_string>",
      "used": false
    }
  ]
}
```

---

### 3.2 API 2: Xem chi tiết một vé

**GET** `/api/v1/tickets/:ticket_id`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Phản hồi (200 OK)

Phản hồi tương tự API 1 nhưng trả về một vé duy nhất.

---

## 4. Luồng chính

### 4.1 Luồng sinh vé

1. Payment Service đẩy job GENERATE_TICKETS vào ticket-queue với payload:

```json
{
  "order_id": "ord-uuid",
  "user_id": "usr-uuid",
  "items": [
    {
      "ticket_type_id": "tt-uuid",
      "quantity": 2
    }
  ]
}
```

2. Ticket Worker nhận job, kiểm tra idempotency: truy vấn DB xem order_id này đã có ticket chưa.
3. Nếu đã có và đủ vé:
   - Bỏ qua.
   - Đánh dấu job complete.

4. Nếu bị thiếu hoặc chưa có:
   - Tiếp tục xử lý.

5. Với mỗi vé cần tạo:
   - Sinh qr_raw = UUID v4 ngẫu nhiên.
   - Tính qr_sha256 = SHA-256(qr_raw).
   - Tính qr_aes256 = AES-256-encrypt(qr_raw, SECRET_KEY).
   - INSERT vào bảng tickets.

6. Đánh dấu job complete.

---

## 5. Kịch bản lỗi

### 5.1 Worker crash giữa chừng khi đang tạo vé

- BullMQ đưa job trở lại queue sau timeout.
- Worker retry, idempotency check phát hiện order chưa có đủ vé → tạo tiếp phần còn thiếu.

### 5.2 SECRET_KEY không hợp lệ khi decrypt AES-256 phía client

- App hiển thị thông báo:

```text
Không thể hiển thị mã QR. Vui lòng thử lại.
```

- Log:

```text
ERROR | AES decrypt failed | ticket_id={id}
```

---

## 6. Ràng buộc

- Idempotency: Ticket Worker kiểm tra DB trước khi tạo vé — không tạo trùng dù job bị retry nhiều lần.
- Không expose qr_raw: Giá trị qr_raw không được lưu vào db mà chỉ được exist trong bộ nhớ ứng dụng.
- SECRET_KEY quản lý qua biến môi trường: Không hardcode trong code.
- Append-only: Vé đã tạo không được xóa — chỉ được đánh dấu used = true.
- Vé user xem phải match với user hiện tại đang đăng nhập qua JWT_Token.

---

## 7. Tiêu chí chấp nhận

- Sau khi payment thành công, vé được tạo trong vòng 30 giây.
- Job retry không tạo vé trùng cho cùng một order.
- User xem được danh sách vé với mã QR hiển thị đúng.
- Job thất bại sau 5 lần retry xuất hiện trong Dead Letter Queue, không bị mất.
