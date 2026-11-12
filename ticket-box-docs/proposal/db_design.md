# Tài liệu Thiết kế Cơ sở Dữ liệu (Database Design)

## 1. Xác định Các Loại Dữ Liệu Chính

| Nhóm dữ liệu                  | Thuộc service          | Đặc điểm                                                                            |
| :---------------------------- | :--------------------- | :---------------------------------------------------------------------------------- |
| **Người dùng, phân quyền**    | User Service           | Có quan hệ chặt chẽ, cần tuân thủ tính chất ACID mạnh.                              |
| **Concert, nghệ sĩ, loại vé** | Concert Service        | Cấu trúc cố định, tần suất đọc nhiều hơn rất nhiều so với ghi.                      |
| **Đơn hàng, vé, QR**          | Order / Ticket Service | Đòi hỏi xử lý transaction mạnh mẽ, tuyệt đối không được làm mất mát dữ liệu.        |
| **Lịch sử soát vé**           | Check-in Service       | Dạng dữ liệu chỉ ghi thêm (Append-only), cần phục vụ cho cơ chế audit trail.        |
| **Khách mời VIP**             | VIP Import Service     | Nhập dữ liệu theo lô (Batch import) từ các tệp tin CSV từ đối tác.                  |
| **Cache concert, số vé**      | — _(Infrastructure)_   | Thay đổi liên tục với tần suất cực cao, yêu cầu tốc độ phản hồi tối đa.             |
| **Job queue (email, retry)**  | Notification / Payment | Dữ liệu tạm thời, yêu cầu các cơ chế kiểm soát retry (thử lại) và delay (trì hoãn). |

---

## 2. Lựa chọn Giải pháp Cơ sở Dữ liệu

### 2.1 PostgreSQL (Thông qua Supabase) — Cơ sở dữ liệu nghiệp vụ chính

Toàn bộ dữ liệu nghiệp vụ cốt lõi của hệ thống TicketBox được lưu trữ tập trung trong PostgreSQL hosted trên nền tảng Supabase.

- **Tính nhất quán mạnh (Strong Consistency):** Nghiệp vụ bán vé concert — chống oversell (bán quá số lượng) và chống trừ tiền hai lần — đòi hỏi hỗ trợ thuộc tính ACID transaction một cách tuyệt đối. Khi hàng nghìn người cùng mua vé, PostgreSQL đảm bảo chỉ đúng số lượng vé cấu hình được bán ra thông qua cơ chế `SELECT ... FOR UPDATE` và cô lập transaction (transaction isolation). Đây là điều các DB NoSQL không thể đảm bảo một cách tương đương.
- **Quan hệ dữ liệu rõ ràng:** Dữ liệu có cấu trúc quan hệ chặt chẽ và nhiều tầng liên kết: một concert có nhiều loại vé (`ticket_types`), một đơn hàng (`orders`) thuộc về một người dùng (`users`) và chứa nhiều vé (`tickets`), mỗi chiếc vé lại liên kết với lịch sử quét (`checkin_logs`). Ràng buộc khóa ngoại (Foreign key constraint) ở tầng database giúp ngăn ngừa tình trạng không nhất quán dữ liệu (data inconsistency) ngay từ gốc.
- **Row-level Locking:** PostgreSQL hỗ trợ cơ chế khóa tại cấp độ từng dòng cụ thể (`FOR UPDATE`). Tính năng này cho phép nhiều transaction chạy song song mà không ảnh hưởng lẫn nhau — hệ thống chỉ lock đúng dòng loại vé (`ticket_types`) đang được thực hiện giao dịch mua, hoàn toàn không làm khóa toàn bộ bảng dữ liệu.
- **Giảm overhead vận hành với Supabase:** Supabase cung cấp PostgreSQL hosted đi kèm cơ chế quản lý connection pooling ổn định, giao diện quản lý schema trực quan và khả năng sinh REST API tự động, giúp tiết kiệm đáng kể thời gian setup và vận hành so với tự quản lý server DB.

### 2.2 Redis — Cache và Message Queue

Redis được cấu hình sử dụng cho hai mục đích tách biệt hoàn toàn thông qua hai instance độc lập:

- **Redis Cache:** Lưu trữ kết quả của các truy vấn đọc thường xuyên (danh sách concert, thông tin chi tiết, số lượng vé còn lại). Dữ liệu này có thể chấp nhận mất khi restart hệ thống vì có thể load lại từ PostgreSQL.
- **Redis Queue (BullMQ):** Lưu trữ và điều phối các công việc bất đồng bộ (async jobs) như gửi email xác nhận, thực hiện retry thanh toán, dọn dẹp các đơn hàng hết hạn (`order expired`). Instance này bắt buộc phải cấu hình tính kiên định (persistence) để đảm bảo không làm mất job khi worker khởi động lại.

---

## 3. Schema Hệ thống (DDL Script)

### 3.1 Người dùng (users)

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('audience', 'organizer', 'staff')),
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Concert (concerts)

```sql
CREATE TABLE concerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES users(id),
    title        TEXT NOT NULL,
    description  TEXT,
    artist       TEXT NOT NULL,
    venue        TEXT NOT NULL,
    event_date   TIMESTAMPTZ NOT NULL,
    cover_image  TEXT,                         -- URL ảnh bìa sự kiện
    status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'upcoming', 'published', 'cancelled')),
    created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 Loại vé (ticket_types)

```sql
CREATE TABLE ticket_types (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id     UUID NOT NULL REFERENCES concerts(id),
    name           TEXT NOT NULL,              -- Ví dụ: "GA", "VIP", "SVIP"
    price          INTEGER NOT NULL,           -- Số tiền VNĐ, lưu dạng integer
    total_quantity INTEGER NOT NULL,
    max_per_user   INTEGER DEFAULT 4 NOT NULL,
    sold_quantity  INTEGER NOT NULL DEFAULT 0,
    sale_start     TIMESTAMPTZ,
    sale_end       TIMESTAMPTZ
);
```

### 3.4 Đơn hàng (orders)

```sql
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    idempotency_key TEXT UNIQUE NOT NULL,      -- Cơ chế chống tạo trùng đơn hàng
    total_amount    INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.5 Giao dịch (payments)

```sql
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    amount          INTEGER NOT NULL,
    payment_method  TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,      -- Cơ chế chống trùng lặp giao dịch
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'failed', 'expired')),
    payment_ref     TEXT,                      -- Mã tham chiếu giao dịch trả về từ payment gateway
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 Vé cụ thể (tickets)

```sql
CREATE TABLE tickets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    order_id      UUID NOT NULL REFERENCES orders(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    qr_aes256     TEXT UNIQUE NOT NULL,        -- Mã hóa AES-256 tăng tính bảo mật thông tin
    qr_sha256     TEXT UNIQUE NOT NULL,        -- Mã băm dùng cho thiết bị soát vé đối chiếu nhanh
    used          BOOLEAN NOT NULL DEFAULT false,
    used_at       TIMESTAMPTZ,
    used_by_staff UUID REFERENCES users(id)
);
```

### 3.7 Thông báo (notifications)

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(50) NOT NULL CHECK (type IN ('ORDER_CONFIRM', 'REMINDER_24H')),
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
    user_status     TEXT NOT NULL DEFAULT 'unread'
                    CHECK (user_status IN ('read', 'unread')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    sent_at         TIMESTAMPTZ
);
```

### 3.8 Log soát vé (checkin_logs)

```sql
CREATE TABLE checkin_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID NOT NULL REFERENCES tickets(id),
    staff_id   UUID NOT NULL REFERENCES users(id),
    scanned_at TIMESTAMPTZ DEFAULT now(),
    result     TEXT NOT NULL CHECK (result IN ('success', 'already_used', 'invalid'))
);
```

### 3.9 Quản lý phân quyền (RBAC)

```sql
CREATE TABLE roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL           -- Ví dụ: 'ORGANIZER', 'STAFF', 'AUDIENCE'
);

CREATE TABLE permissions (
    id   SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL          -- Ví dụ: 'CREATE_CONCERT', 'SCAN_QR'
);

CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
```

### 3.10 Nghệ sĩ (artists)

```sql
CREATE TABLE artists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id UUID NOT NULL REFERENCES concerts(id),
    name       TEXT NOT NULL,
    bio        TEXT,                           -- Nội dung tiểu sử chính thức đã duyệt phát hành
    bio_draft  TEXT,                           -- Nội dung nháp do AI khởi tạo, chờ ban tổ chức review
    bio_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
               CHECK (bio_status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.11 Khách mời (vip_guests)

```sql
CREATE TABLE vip_guests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id  UUID NOT NULL REFERENCES concerts(id),
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    sponsor     TEXT NOT NULL,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('GA', 'VIP', 'SVIP', 'CAT1', 'CAT2')),
    ticket_id   UUID REFERENCES tickets(id),   -- Sẽ ở trạng thái NULL cho đến khi được phân phối vé
    imported_at TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (concert_id, email)                 -- Ràng buộc chống trùng lặp, hỗ trợ cú pháp UPSERT hiệu quả
);
```

### 3.11 Log hoạt động (audit_logs)

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES users(id),   -- Người thực thi hành động
    action      TEXT NOT NULL,                        -- Ví dụ: 'BAN_USER', 'CANCEL_CONCERT'
    target_type TEXT NOT NULL,                        -- Đối tượng chịu tác động: 'user', 'concert', 'order'
    target_id   UUID NOT NULL,                        -- ID của đối tượng cụ thể bị tác động
    old_value   JSONB,                                -- Trạng thái cấu trúc dữ liệu trước khi thay đổi
    new_value   JSONB,                                -- Trạng thái cấu trúc dữ liệu sau khi thay đổi
    reason      TEXT,                                 -- Lý do thực hiện hành động
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

## 4. Tối ưu hóa truy vấn (Database Indexes)

```sql
--Tối ưu hóa tra cứu người dùng
CREATE INDEX idx_users_role ON users(role)

-- Tối ưu hóa tra cứu thông tin sự kiện
CREATE INDEX idx_concerts_title ON concerts(title)
CREATE INDEX idx_concerts_event_date ON concerts(event_date)
CREATE INDEX idx_concerts_status ON concerts(status)
CREATE INDEX idx_concerts_organizer_id ON concerts(organizer_id)

-- Tối ưu hóa tra cứu thông tin nghệ sĩ
CREATE INDEX idx_artists_bio_status ON artists(bio_status)
CREATE INDEX idx_artists_concert_id ON artists(concert_id)

-- TỐi ứu hóa tra cứu thông tin loại vé
CREATE INDEX idx_ticket_types_concert_id ON ticket_types(concert_id)

-- Tối ưu hóa tra cứu và quản lý vé của người dùng
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_order_id ON tickets(order_id);

-- Tối ưu hóa tra cứu đơn hàng và thực thi tính lũy đẳng (Idempotency)
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Tối ưu hóa truy vấn thông tin loại vé theo từng sự kiện cụ thể
CREATE INDEX idx_ticket_types_concert_id ON ticket_types(concert_id);

-- Tối ưu hóa chống trùng lặp thông báo và giao dịch thanh toán
CREATE INDEX idx_notifications_user_id ON notifications(user_id)
CREATE INDEX idx_notifications_created_at ON notifications(created_at)
CREATE INDEX idx_notifications_status ON notifications(status)
CREATE INDEX idx_notifications_user_status ON notifications(user_status)

-- Tối ưu hóa tra cứu thông tin thanh toán
CREATE INDEX idx_payments_payment_ref ON payments(payment_ref);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Tối ưu hóa tra cứu checkin_logs
CREATE INDEX idx_checkin_logs_ticket_id ON checkin_logs(ticket_id);
CREATE INDEX idx_checkin_logs_staff_id ON checkin_logs(staff_id);
CREATE INDEX idx_checkin_logs_scanned_at ON checkin_logs(scanned_at);

CREATE INDEX idx_role_permission_role_id ON role_permissions(role_id)
CREATE INDEX idx_role_permission_permission_id ON role_permissions(permission_id)

-- Tối ưu hóa các tính năng bổ trợ (AI, VIP Guest, Audit Logs)
CREATE INDEX idx_vip_guests_concert_id ON vip_guests(concert_id);
CREATE INDEX idx_vip_guests_ticket_id ON vip_guests(ticket_id);
CREATE INDEX idx_vip_guests_email ON vip_guests(email);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_target_type_target_id ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## 5. Ghi Chú Thiết Kế Quan Trọng

- **Về `sold_quantity` trong `ticket_types`:** \* Trường này đóng vai trò là nguồn sự thật dài hạn (Single Source of Truth) trong cơ sở dữ liệu PostgreSQL.
  - Tuy nhiên, để tối ưu hiệu năng, lớp kiểm tra số lượng vé còn lại sẽ không đọc trực tiếp từ bảng này một cách liên tục. Thay vào đó, hệ thống sử dụng lệnh toán tử nguyên tử của Redis (`DECR`) làm lớp lá chắn đầu tiên để giảm tải tối đa cho database.
  - Giá trị `sold_quantity` trong PostgreSQL chỉ được cập nhật sau khi người dùng thanh toán thành công, hoặc khi đơn hàng bị quá hạn (`order expired`) và vé được hoàn trả lại cho pool.
  - Trong trường hợp hệ thống Redis gặp sự cố ngoài ý muốn, cơ chế kiểm tra sẽ tự động fallback (quay lui) về việc sử dụng câu lệnh `SELECT ... FOR UPDATE` trực tiếp trên PostgreSQL để đảm bảo an toàn dữ liệu.

- **Về `idempotency_key` trong `orders`:** \* Ràng buộc duy nhất (`UNIQUE constraint`) ở tầng database đóng vai trò là lớp bảo vệ cuối cùng cho hệ thống.
  - Ngay cả trong kịch bản có hai hoặc nhiều request (yêu cầu) đến đồng thời với cùng một mã key, PostgreSQL đảm bảo chỉ có duy nhất một câu lệnh ghi (`INSERT`) thành công, giúp triệt tiêu hoàn toàn rủi ro trùng lặp dữ liệu đơn hàng.

- **Về `qr_token` trong `tickets`:** \* Đây là chuỗi định danh ngẫu nhiên dạng UUID v4 được sinh ra hoàn toàn ở phía server (server-side) ngay sau khi đơn hàng được xác nhận thanh toán thành công.
  - Hệ thống tuyệt đối không bao giờ phơi bày (expose) các thông tin nhạy cảm của người dùng hay đơn hàng bên trong chuỗi mã QR. Mã QR hiển thị ra ngoài thực chất chỉ hoạt động như một token ngẫu nhiên dùng để tra cứu ngược dữ liệu trên server.

- **Về `notifications.payload` dạng `JSONB`:** \* Do cấu trúc và nội dung thông báo sẽ khác nhau tùy thuộc vào từng loại kênh gửi (ví dụ: email cần các trường `subject`/`body`, trong khi thông báo trong ứng dụng - in-app cần các trường `title`/`message`), hệ thống lựa chọn kiểu dữ liệu `JSONB`.
  - Lựa chọn này giúp mang lại sự linh hoạt cao trong việc mở rộng cấu trúc dữ liệu mà không cần phải thiết kế quá nhiều bảng riêng biệt.
