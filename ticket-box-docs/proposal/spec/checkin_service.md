# Đặc tả hệ thống soát vé (Checking Service)

## 1. Mô tả

Check-in Service xử lý toàn bộ luồng xác thực vé tại cổng vào concert. Nhân sự soát vé dùng mobile app (React Native) để quét mã QR trên vé của khán giả. Hệ thống xác thực real-time qua server — yêu cầu kết nối mạng ổn định trong suốt ca soát vé.

### Phạm vi

- Xác thực mã QR token: kiểm tra vé có tồn tại, hợp lệ và chưa được sử dụng.
- Đánh dấu vé đã sử dụng ngay sau khi quét thành công — chống dùng lại cùng một QR.
- Ghi audit log đầy đủ cho mọi lần quét (thành công hay thất bại).
- Cho phép Staff xem thống kê số lượt soát tại cổng được phân công.

### Nguyên tắc thiết kế

- Xác thực là một atomic operation trong database transaction — không thể xảy ra tình huống hai thiết bị cùng đánh dấu một vé là used.
- Thời gian phản hồi mỗi lần quét phải dưới 2 giây.

---

## 2. API Contracts

### 2.1 API 1: Xác thực mã QR

**POST** `/api/v1/checkin/verify`

#### Headers

```http
Authorization: Bearer <JWT_Token>
Content-Type: application/json
```

#### Request Body

```json
{
  "qr_sha256": "cc29ba9cc390cf2da5526261541eb618ee3d6c4ef1d780e9351904b25509bf16",
  "concert_id": "c3b07384-d113-4e31-92f7-e43598d9e2d3"
}
```

#### Phản hồi: Vé hợp lệ (200 OK)

```json
{
  "success": true,
  "data": {
    "result": "SUCCESS",
    "ticket_id": "tkt-uuid",
    "holder_name": "Nguyễn Văn A",
    "ticket_type": "VIP",
    "checked_in_at": "2026-07-15T18:45:00Z"
  }
}
```

#### Phản hồi: Vé đã sử dụng (200 OK)

```json
{
  "success": false,
  "data": {
    "result": "ALREADY_USED",
    "used_at": "2026-07-15T18:30:00Z",
    "used_by_staff": "Trần Văn B"
  }
}
```

#### Phản hồi: Vé không hợp lệ (200 OK)

```json
{
  "success": false,
  "data": {
    "result": "INVALID",
    "message": "Mã QR không tồn tại trong hệ thống."
  }
}
```

#### Phản hồi: Vé không thuộc concert này (200 OK)

```json
{
  "success": false,
  "data": {
    "result": "WRONG_CONCERT",
    "message": "Vé này không thuộc concert đang diễn ra."
  }
}
```

**Lưu ý:** Tất cả kịch bản nghiệp vụ đều trả về HTTP 200. Chỉ trả về 4xx/5xx cho lỗi hệ thống (auth fail, server error).

---

### 2.2 API 2: Xem thống kê soát vé

**GET** `/api/v1/checkin/stats/:concert_id`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": {
    "total_tickets": 5000,
    "checked_in": 3240,
    "remaining": 1760,
    "by_ticket_type": [
      {
        "name": "VIP",
        "total": 500,
        "checked_in": 480
      },
      {
        "name": "GA",
        "total": 4500,
        "checked_in": 2760
      }
    ]
  }
}
```

---

## 3. Luồng chính

### 3.1 Luồng xác thực vé

1. Staff quét QR, mã QR được hash thông qua SHA-256 → mobile app gọi `POST /checkin/verify`.
2. Middleware xác thực JWT, kiểm tra role = STAFF.
3. Check-in Service mở database transaction:

```sql
SELECT * WHERE qr_sha256 = $1 FOR UPDATE
```

4. Không tìm thấy → INVALID, ghi log, rollback.
5. Kiểm tra concert_id khớp:
   - Không khớp → WRONG_CONCERT, ghi log, rollback.

6. Kiểm tra used:
   - true → ALREADY_USED kèm thông tin lần quét trước, ghi log, rollback.
   - false → tiếp tục.

7. Cập nhật vé:

```sql
UPDATE tickets
SET used = true,
    used_at = now(),
    used_by_staff = $staff_id
```

8. Ghi log:

```sql
INSERT INTO checkin_logs (...)
VALUES (...)
```

9. COMMIT.
10. Trả về kết quả, mobile app hiển thị màu sắc tương ứng:
    - Xanh lá: SUCCESS
    - Đỏ: ALREADY_USED / INVALID
    - Vàng: WRONG_CONCERT

---

## 4. Kịch bản lỗi

### 4.1 Hai Staff quét cùng một vé đồng thời

- `SELECT ... FOR UPDATE` đảm bảo chỉ một transaction thành công.
- Transaction thứ hai đọc được `used = true` → trả về ALREADY_USED.
- Không có trường hợp cả hai cùng SUCCESS.

### 4.2 JWT hết hạn giữa ca soát vé

- Gateway trả về:

```json
{
  "code": "TOKEN_EXPIRED"
}
```

kèm HTTP 401.

- Mobile app tự động gọi refresh token.
- Nếu refresh thành công, app retry request verify ngay lập tức — staff không nhận thấy gián đoạn.
- Nếu refresh token cũng hết hạn, app hiển thị màn hình đăng nhập lại.

---

## 5. Ràng buộc

- Atomic operation: Toàn bộ luồng xác thực phải nằm trong một database transaction với `SELECT ... FOR UPDATE`. Không tách thành nhiều query riêng lẻ.
- Không sửa checkin_log: Bảng `checkin_logs` là append-only. Mọi lần quét đều được ghi lại vĩnh viễn kể cả khi là INVALID hay WRONG_CONCERT.
- Rate limiting: Endpoint `/checkin/verify` có rate limit 200 req/min — cao hơn các endpoint thông thường vì cần tốc độ cao trong giờ soát vé.

---

## 6. Tiêu chí chấp nhận

- Staff quét QR: trả về kết quả trong vòng 2 giây.
- Quét lại cùng một QR lần thứ hai trả về ALREADY_USED kèm thông tin lần quét trước.
- Hai Staff quét cùng một vé đồng thời: chỉ đúng một người nhận SUCCESS.
- Mọi lần quét đều được ghi vào `checkin_logs` bất kể kết quả.
- Staff xem được thống kê số vé đã soát theo từng loại vé.
