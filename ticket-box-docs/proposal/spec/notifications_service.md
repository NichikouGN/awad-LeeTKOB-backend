# Đặc tả hệ thống thông báo (Notification service)

## 1. Mô tả

Notification Service chịu trách nhiệm gửi thông báo đến người dùng qua hai kênh: email (Nodemailer + SMTP) và in-app notification. Service này hoạt động hoàn toàn bất đồng bộ — nhận job từ BullMQ queue do các service khác đẩy vào, xử lý và gửi thông báo mà không ảnh hưởng đến luồng chính.

### 1.1 Các loại thông báo được hỗ trợ

| Loại                 | Trigger                                                | Kênh           |
| -------------------- | ------------------------------------------------------ | -------------- |
| SEND_ORDER_CONFIRMED | Payment Service xác nhận thanh toán thành công         | Email + In-app |
| SEND_ORDER_FAILED    | Payment Service xác nhận thanh toán thất bại sau retry | Email + In-app |
| REMINDER_24H         | Cron job chạy mỗi ngày, concert diễn ra sau 24 giờ     | Email + In-app |
| CONCERT_CANCELLED    | Organizer hủy concert                                  | Email + In-app |

### 1.2 Nguyên tắc thiết kế

Notification Service không bao giờ gọi trực tiếp vào Order Service, Payment Service hay Concert Service để lấy dữ liệu. Toàn bộ thông tin cần thiết để gửi thông báo phải được đính kèm trong job payload khi đẩy vào queue.

Gửi thông báo thất bại không được làm ảnh hưởng đến trạng thái đơn hàng hay vé — đây là side effect, không phải luồng nghiệp vụ chính.

Mỗi thông báo chỉ được gửi đúng một lần cho mỗi sự kiện, tránh spam người dùng khi worker retry.

---

## 2. API Contracts

### 2.1 API 1: Lấy danh sách thông báo

**GET** `/api/v1/notifications`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Query Parameters

- limit
- page

#### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "c3124gk4-df13-1h21-95h7-e4d62jsd9e2d3",
      "title": "Hoàn thành giao dịch",
      "sent_time": "2026-07-15T19:00:00Z",
      "user_status": "READ"
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

### 2.2 API 2: Lấy thông tin thông báo cụ thể

**GET** `/api/v1/notifications/:{id}`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "c3124gk4-df13-1h21-95h7-e4d62jsd9e2d3",
    "title": "Hoàn thành giao dịch",
    "message": "Giao dịch của bạn đã được hoàn tất, vui lòng kiểm tra dách sách vé của bạn",
    "sent_at": "2026-07-15T19:00:00Z",
    "user_status": "READ"
  }
}
```

---

## 3. Luồng chính

### 3.1 Luồng 1: Lấy danh sách thông báo

1. Service nhận HTTP Call từ frontend, lấy user_id từ JWT middleware
2. Lấy các thông báo qua:

```sql
SELECT * FROM notifications WHERE user_id = :{user_id}
```

3. Gửi danh sách về cho frontend

---

### 3.2 Luồng 1: Gửi thông báo theo sự kiện (SEND_ORDER_CONFIRMED, SEND_ORDER_FAILED, CONCERT_CANCELLED)

1. Service liên quan (Payment Service, Concert Service) đẩy job vào BullMQ queue với payload đầy đủ:

```json
{
  "type": "SEND_ORDER_CONFIRMED",
  "Idempotency_key": "order:ord-uuid-12345:SEND_ORDER_CONFIRMED",
  "user_id": "usr-uuid",
  "user_email": "user@example.com",
  "user_name": "Nguyễn Văn A",
  "payload": {
    "order_id": "ord-uuid",
    "concert_title": "Anh Trai Say Hi - Đêm Đỉnh Cao",
    "ticket_type": "VIP",
    "quantity": 2,
    "total_amount": 7000000,
    "event_date": "2026-07-15T19:00:00Z",
    "venue": "Sân vận động Quân khu 7, TP.HCM"
  }
}
```

**(Quy tắc sinh idempotency*key: Định dạng theo cú pháp `[tên_thực_thể]:[mã*định_danh]:[loại_sự_kiện]`)**

2. Background Worker consume job từ queue
3. Worker kiểm tra bảng notifications trong Postgre:
   - Nếu đã có 1 Idempotency Key với status="sent" thì bỏ qua
   - Nếu chưa có, ghi một bản với idempotency_key vừa nhận được từ payload với status = "pending" rồi qua bước 4
4. Worker gửi song song hai kênh:
   - Email: gọi Nodemailer với template tương ứng
   - In-app: ghi bản ghi vào bảng notifications với delivered_at
5. Cập nhật status = 'sent', ghi sent_at vào database

---

### 3.3 Luồng 2: Gửi nhắc nhở trước ngày diễn (REMINDER_24H)

1. Cron job chạy mỗi ngày lúc 10:00 AM
2. Query database lấy danh sách concert có event_date trong khoảng:

```text
[now + 23h, now + 25h]
```

(buffer 1 giờ để tránh bỏ sót do drift)

3. Với mỗi concert, query danh sách users có order status = 'COMPLETED' liên kết với concert đó
4. Với mỗi user, kiểm tra đã gửi REMINDER_24H cho concert này chưa:
   - Nếu rồi → bỏ qua
   - Nếu chưa → đẩy job vào BullMQ queue
5. Worker xử lý tương tự Luồng 1 từ bước 3 trở đi

---

## 4. Kịch bản lỗi

### 4.1 SMTP server không phản hồi / từ chối kết nối

- Worker bắt lỗi tại bước gửi email, cập nhật status = failed cho kênh email.
- BullMQ tự động retry tối đa 3 lần với delay tăng dần (1 phút → 5 phút → 15 phút).
- Sau 3 lần thất bại: đánh dấu job là failed, log lỗi chi tiết.
- Kênh in-app vẫn được gửi độc lập — thất bại email không chặn in-app.

```text
ERROR | Email delivery failed | type={type} | user_id={id} | attempt={n}
```

---

### 4.2 BullMQ queue bị gián đoạn

- Các job đã được đẩy vào queue trước khi gián đoạn vẫn được bảo toàn nhờ Redis persistence.
- Khi queue phục hồi, Worker tiếp tục consume các job còn tồn đọng.
- Trong thời gian queue down, các service khác (Payment, Concert) vẫn hoạt động bình thường — chỉ thông báo bị delay, không ảnh hưởng luồng mua vé.

```text
WARN | Queue connection lost. Notifications delayed.
```

---

### 4.3 Gửi trùng thông báo do Worker retry

- Worker kiểm tra bảng notifications trước khi gửi (bước 3 Luồng 1).
- Nếu đã có bản ghi (type, order_id, status = 'sent') → bỏ qua hoàn toàn.
- Cơ chế này đảm bảo idempotency: dù job được consume bao nhiêu lần, người dùng chỉ nhận đúng một thông báo cho mỗi sự kiện.

---

### 4.4 Reminder 24h bị bỏ sót do cron job fail

- Nếu cron job không chạy được (server restart, lỗi scheduling), các concert trong khung giờ đó sẽ không có reminder.
- Hướng xử lý: cron job có cửa sổ thời gian rộng `[now + 23h, now + 25h]` để chịu được drift nhỏ.
- Log lỗi cron job để Organizer theo dõi.

```text
ERROR | Reminder cron job failed | scheduled_at={time}
```

---

## 5. Ràng buộc

### Bất đồng bộ hoàn toàn

Notification Service không được nằm trên critical path của luồng mua vé. Payment Service đẩy job vào queue và trả về kết quả cho người dùng ngay — không chờ thông báo được gửi xong.

### Payload tự đủ (Self-contained)

Job payload phải chứa đủ thông tin để gửi thông báo mà không cần gọi thêm bất kỳ service nào khác. Tránh phụ thuộc vào availability của service khác tại thời điểm worker xử lý.

### Idempotency

Mỗi job được đẩy vào phải kèm theo 1 idempotency_key do producer tự tạo.

### Không chặn luồng chính

Thất bại khi gửi thông báo không được throw exception làm ảnh hưởng đến trạng thái order hay ticket. Lỗi phải được catch và log riêng.

### Giới hạn retry

Tối đa 3 lần retry mỗi kênh, với delay tăng dần. Sau 3 lần thất bại, job được đánh dấu failed và cần Organizer xử lý thủ công nếu cần.

### Template nhất quán

Mỗi loại thông báo có template email và nội dung in-app cố định, không sinh động theo runtime để tránh lỗi template.

---

## 6. Tiêu chí chấp nhận

- Người dùng nhận được email và in-app notification sau khi mua vé thành công, trong vòng 30 giây kể từ khi Payment Service xác nhận.
- Người dùng nhận được thông báo khi thanh toán thất bại sau tất cả các lần retry.
- Người dùng có vé hợp lệ nhận được nhắc nhở trước ngày diễn 24 giờ.
- Tất cả người dùng có vé của concert bị hủy đều nhận được thông báo.
- Cùng một sự kiện không gửi thông báo trùng lặp dù worker retry nhiều lần.
- Khi SMTP server gặp sự cố, luồng mua vé và soát vé không bị ảnh hưởng.
- Thông báo in-app vẫn được gửi khi email thất bại (hai kênh độc lập nhau).
- Organizer có thể tra cứu lịch sử thông báo và trạng thái gửi qua bảng notifications.
