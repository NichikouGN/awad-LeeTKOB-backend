# Đặc tả hạ tầng hệ thống (System infrastructure)

## API Gateway

### Mô tả

API Gateway là điểm vào duy nhất (single entry point) của toàn bộ hệ thống TicketBox. Mọi request từ Web App và Mobile App đều phải đi qua API Gateway trước khi được chuyển tiếp đến các service phía sau. Gateway chịu trách nhiệm xác thực, giới hạn tốc độ và routing — giúp các service bên trong không cần tự xử lý các mối quan tâm chung này.

### Trách nhiệm

#### Xác thực JWT (Authentication):

- Kiểm tra `Authorization: Bearer <token>` trên mọi request đến protected endpoint.
- Giải mã và xác thực JWT signature trước khi forward request vào service.
- Trả về `401 Unauthorized` ngay tại Gateway nếu token thiếu hoặc không hợp lệ — service bên trong không nhận được request.
- Kiểm tra blacklist (Redis) cho các token đã bị thu hồi (ví dụ: user bị Organizer khóa tài khoản).

#### Rate Limiting (Token Bucket):

Gateway áp dụng Token Bucket algorithm để giới hạn tốc độ request theo từng nhóm endpoint:

| Nhóm endpoint           | Giới hạn | Cửa sổ  | Khóa theo |
| ----------------------- | -------- | ------- | --------- |
| POST /checkin/verify    | 200 req  | 1 phút  | IP        |
| POST /orders (mua vé)   | 5 req    | 1 phút  | User ID   |
| POST /auth/login        | 10 req   | 15 phút | IP        |
| Các GET endpoint public | 100 req  | 1 phút  | IP        |
| Các endpoint Organizer  | 30 req   | 1 phút  | User ID   |

Khi vượt ngưỡng: trả về `429 Too Many Requests` với header `Retry-After` cho biết thời gian chờ.

#### Routing:

Gateway định tuyến request đến đúng service dựa trên path prefix:

| Path prefix           | Service đích         |
| --------------------- | -------------------- |
| /api/v1/concerts      | Concert Service      |
| /api/v1/orders        | Order Service        |
| /api/v1/payments      | Payment Service      |
| /api/v1/checkin       | Check-in Service     |
| /api/v1/organizer     | Organizer Service    |
| /api/v1/auth          | User Service         |
| /api/v1/notifications | Notification Service |

#### CORS:

- Chỉ cho phép request từ các origin được whitelist (Web App domain)
- Mobile app không chịu ràng buộc CORS
- Trả về `403 Forbidden` cho request từ origin không được phép.

### Kịch bản lỗi

- **Service đích không phản hồi:** Gateway trả về `503 Service Unavailable` sau timeout 15 giây — không để client chờ vô hạn.
- **Rate limit bị vượt:** Trả về `429` kèm `Retry-After` — client tự retry sau thời gian chỉ định.
- **JWT hết hạn:** Trả về `401` kèm `{ "code": "TOKEN_EXPIRED" }` — client tự động refresh hoặc redirect đăng nhập.

---

## Load Balancer

### Mô tả

Load Balancer phân phối traffic từ API Gateway đến nhiều instance của Backend API đang chạy song song. Mục tiêu là đảm bảo không có instance nào bị quá tải trong khi instance khác rảnh, đặc biệt trong thời điểm mở bán vé với lượng truy cập đột biến.

### Cấu hình

#### Thuật toán: Round-Robin

Mỗi request được chuyển đến instance tiếp theo theo vòng tròn. Phù hợp với hệ thống mà sức mạnh xử lý của các server đồng đều nhau và stateless (JWT auth, không có session server-side) vì mọi instance đều xử lý được bất kỳ request nào.

#### Health Check:

Load Balancer định kỳ gọi `GET /health` của từng API instance mỗi 10 giây.

- Instance trả về `200 OK` → healthy, tiếp tục nhận traffic.
- Instance không phản hồi trong 3 lần liên tiếp → đánh dấu unhealthy, tạm thời loại khỏi pool.
- Instance tự động được đưa trở lại pool khi health check pass trở lại.

#### Health Check Response:

```json
{
  "status": "ok",
  "services": {
    "database": "up",
    "redis_cache": "up",
    "redis_queue": "up",
    "payment_gateway": "up"
  },
  "timestamp": "2026-07-15T19:00:00Z"
}
```

#### Sticky Session

Không sử dụng — hệ thống stateless, không cần giữ người dùng trên cùng một instance.

### Kịch bản lỗi

- **Tất cả instance đều unhealthy:** Load Balancer trả về `503 Service Unavailable` cho mọi request — thay vì forward vào instance đang lỗi.
- **Một instance bị crash giữa chừng:** Request đang xử lý trên instance đó bị mất — client nhận timeout và tự retry. Load Balancer loại instance lỗi khỏi pool ngay sau health check tiếp theo.

---

## Message Queue (BullMQ + Redis)

### Mô tả

Message Queue là cơ chế trung gian cho phép các service giao tiếp bất đồng bộ. Thay vì gọi trực tiếp service khác và chờ kết quả, service đẩy job vào queue và trả về response ngay lập tức. Background Worker consume và xử lý job độc lập — tách biệt hoàn toàn với luồng chính.

Hệ thống dùng BullMQ chạy trên Redis instance riêng (tách biệt với Redis Cache) để đảm bảo queue không bị ảnh hưởng khi cache bị xóa hay restart.

### Các queue và job type

| Queue              | Job type               | Producer           | Consumer             | Mô tả                                                                                 |
| ------------------ | ---------------------- | ------------------ | -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | --- |
| notification-queue | SEND_ORDER_CONFIRMED   | Payment Service    | Notification Worker  | Gửi email + in-app khi mua vé thành công                                              |
| notification-queue | SEND_ORDER_FAILED      | Payment Service    | Notification Worker  | Gửi thông báo khi thanh toán thất bại                                                 |
| notification-queue | SEND_REMINDER_24H      | Cron Job           | Notification Worker  | Nhắc nhở trước ngày diễn 24h                                                          |
| notification-queue | SEND_CONCERT_CANCELLED | Organizer Service  | Notification Worker  | Thông báo hủy concert                                                                 |
| <!--               | payment-queue          | PENDING_PAYMENT    | Order Service        | Payment Worker                                                                        | Các order đang đợi được thanh toán | --> |
| order-queue        | CLEANUP_EXPIRED_ORDERS | Order Service      | Order Cleanup Worker | Kiểm tra status của order sau 10p delay. Nếu vẫn pending => expired và hoàn trả stock |
| ticket-queue       | GENERATE_TICKETS       | Payment Service    | Ticket Worker        | Sinh vé + QR sau thanh toán thành công                                                |
| import-queue       | PROCESS_CSV            | VIP Import Service | Import Worker        | Xử lý file CSV khách mời VIP                                                          |
| ai-bio-queue       | GENERATE_ARTIST_BIO    | AI Bio Service     | AI Worker            | Sinh tiểu sử nghệ sĩ từ PDF                                                           |

### Cơ chế retry

Mỗi job được cấu hình retry riêng tùy mức độ quan trọng:

| Job type               | Max retry | Delay            | Hành vi sau khi hết retry                   |
| ---------------------- | --------- | ---------------- | ------------------------------------------- |
| SEND_ORDER_CONFIRMED   | 3         | 1m → 5m → 15m    | Ghi failed log, Organizer xử lý thủ công    |
| PENDING_PAYMENT        | 3         | 30s → 60s → 120s | Cập nhật order → FAILED, hoàn trả stock     |
| GENERATE_TICKETS       | 3         | 10s → 30s → 60s  | Dead Letter Queue, Organizer xử lý thủ công |
| PROCESS_CSV            | 1         | 0                | Ghi failed log, thông báo Organizer         |
| GENERATE_ARTIST_BIO    | 2         | 60s → 600s       | Thông báo Organizer, không auto-publish     |
| CLEANUP_EXPIRED_ORDERS | 0         | 0                | Log lỗi, chờ lần chạy tiếp theo             |

### Đảm bảo xử lý đúng một lần

BullMQ đảm bảo mỗi job được xử lý at-least-once — job có thể được retry nếu worker crash giữa chừng. Để tránh side effect trùng lặp (gửi email hai lần, trừ tiền hai lần), mỗi worker phải tự implement idempotency check trước khi xử lý:

```text
Worker nhận job
→ kiểm tra job đã được xử lý thành công chưa (via DB)
→ Đã xử lý: bỏ qua, đánh dấu job complete
→ Chưa xử lý: thực hiện, ghi kết quả vào DB, đánh dấu job complete
```

### Monitoring

BullMQ cung cấp dashboard (Bull Board) để Organizer theo dõi trạng thái các queue thông qua hệ thống nội bộ: số job đang chờ, đang xử lý, thành công, thất bại.

Job failed sau khi hết retry được chuyển vào Dead Letter Queue để Organizer review và retry thủ công nếu cần.

Log mỗi job với:

- `job_id`
- `type`
- `attempt`
- `duration`
- `result`

### Kịch bản lỗi

#### Redis Queue bị gián đoạn:

- Các luồng như xem concert, đăng nhập,... vẫn hoạt động bình thường
- Các luồng phụ thuộc vào message queue tạm thời bị gián đoạn.
- Job đã được đẩy vào queue trước khi gián đoạn được bảo toàn nhờ Redis persistence (AOF).
- Khi Redis phục hồi, Worker tự động tiếp tục consume các job tồn đọng.
- Log:

```text
WARN | Redis Queue connection lost. Jobs delayed.
```

#### Worker bị crash giữa chừng:

- BullMQ tự động đưa job đang xử lý trở lại queue sau timeout (mặc định 30 giây).
- Job được retry theo cấu hình đã định.
- Worker tự khởi động lại nhờ process manager (PM2 / Docker restart policy).

---

## Ràng buộc

### API Gateway là điểm vào duy nhất

Mọi request từ client phải đi qua Gateway. Các service bên trong không được expose port ra ngoài trực tiếp.

### Stateless API instances

Tất cả API instance không lưu trạng thái cục bộ — session, cache hay bất kỳ dữ liệu nào cần chia sẻ đều phải lưu trên Redis hoặc PostgreSQL. Đây là điều kiện bắt buộc để Load Balancer Round-Robin hoạt động đúng.

### Redis Queue tách biệt Redis Cache

Hai Redis instance phải độc lập — tránh việc flush cache vô tình xóa mất job đang chờ xử lý trong queue.

### Job payload tự đủ

Mỗi job được đẩy vào queue phải chứa đủ thông tin để Worker xử lý mà không cần gọi thêm service khác. Tránh tạo dependency dây chuyền giữa Worker và các service đang chạy.

### Không bỏ qua job failed

Job thất bại sau khi hết retry phải được chuyển vào Dead Letter Queue — không được xóa thầm lặng. Organizer phải có khả năng xem và retry thủ công.

### Rate limiting áp dụng trước khi vào service

Logic rate limiting phải nằm ở API Gateway, không được implement lại trong từng service riêng lẻ để tránh duplicate và không nhất quán.

---

# Tiêu chí chấp nhận

## API Gateway

- Request không có JWT hợp lệ bị từ chối tại Gateway, không đến được service bên trong.
- Request vượt rate limit nhận `429 Too Many Requests` kèm `Retry-After`.
- Request được định tuyến đến đúng service dựa trên path prefix.
- Gateway trả về `503` khi service đích không phản hồi sau 15 giây, không để client chờ vô hạn.

## Load Balancer

- Traffic được phân phối đều đến tất cả API instance đang healthy.
- Instance unhealthy bị loại khỏi pool tự động sau tối đa 30 giây (3 lần health check × 10 giây).
- Instance phục hồi được đưa trở lại pool tự động khi health check pass.
- Khi một instance bị crash, các instance còn lại tiếp tục nhận traffic bình thường.

## Message Queue

- Job được xử lý đúng một lần dù Worker retry nhiều lần.
- Job failed sau khi hết retry xuất hiện trong Dead Letter Queue, không bị mất.
- Khi Redis Queue gián đoạn rồi phục hồi, các job tồn đọng được xử lý tự động.
- Worker bị crash tự khởi động lại và tiếp tục consume job.
- Organizer có thể xem trạng thái các queue và retry job thủ công qua Bull Board dashboard.
