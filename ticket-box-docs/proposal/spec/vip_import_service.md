# Đặc tả xử lý CSV từ đối tác (VIP Import Service)

## 1. Mô tả

VIP Import Service cho phép Organizer import danh sách khách mời VIP từ file CSV do nhãn hàng tài trợ cung cấp. Service này validate, chuẩn hóa và đồng bộ dữ liệu vào hệ thống một cách bất đồng bộ, không làm gián đoạn hoạt động đang diễn ra.

### Phạm vi

- Nhận file CSV từ Organizer upload lên hệ thống.
- Validate format và dữ liệu từng dòng trước khi import.
- Xử lý bất đồng bộ qua BullMQ queue — không block request.
- Upsert dữ liệu vào bảng vip_guests: thêm mới nếu chưa có, cập nhật nếu đã tồn tại.
- Báo cáo kết quả import chi tiết cho Organizer: số dòng thành công, số dòng lỗi, lý do lỗi.
- Tuyệt đối không tự động cấp vé hay gửi thông báo cho khách VIP — đó là bước Organizer xác nhận riêng.

### Format CSV chuẩn nhóm quy định

Organizer cần cung cấp template CSV này cho nhãn hàng tài trợ trước khi nhận file.

```csv
Full_name,email,sponsor,ticket_type
Nguyễn Văn A,a@example.com,Nhãn hàng X,VIP
Trần Thị B,b@example.com,Nhãn hàng Y,SVIP
```

---

## 2. API Contracts

### 2.1 API 1: Upload file CSV

**POST** `/api/v1/organizer/concerts/:concert_id/vip-guests/import`

#### Headers

```http
Authorization: Bearer <JWT_Token>
Content-Type: multipart/form-data
```

#### Request Body

- file (CSV, tối đa 5MB)

#### Phản hồi (202 Accepted)

```json
{
  "success": true,
  "message": "File đang được xử lý.",
  "data": {
    "job_id": "job-uuid-5678"
  }
}
```

---

### 2.2 API 2: Kiểm tra trạng thái import

**GET** `/api/v1/organizer/concerts/:concert_id/vip-guests/import/:job_id`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Phản hồi khi đang xử lý (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "processing",
    "total_rows": 150,
    "processed_rows": 80
  }
}
```

#### Phản hồi khi hoàn thành (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "total_rows": 150,
    "success_rows": 145,
    "failed_rows": 5,
    "errors": [
      {
        "row": 12,
        "email": "invalid-email",
        "reason": "Email không hợp lệ"
      }
    ]
  }
}
```

---

### 2.3 API 3: Xem danh sách khách VIP

**GET** `/api/v1/organizer/concerts/:concert_id/vip-guests`

#### Headers

```http
Authorization: Bearer <JWT_Token>
```

#### Query Parameters

- page
- limit
- sponsor

#### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "vip-uuid",
      "full_name": "Nguyễn Văn A",
      "email": "a@example.com",
      "sponsor": "Nhãn hàng X",
      "ticket_type": "VIP",
      "ticket_id": null,
      "imported_at": "2026-07-01T08:00:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 3,
    "total_items": 25
  }
}
```

---

## 3. Luồng chính

### 3.1 Luồng import CSV

1. Organizer upload file CSV kèm concert_id.
2. Middleware xác thực JWT, kiểm tra role = ORGANIZER.
3. Service validate đầu vào sơ bộ:
   - File có đúng định dạng CSV không.
   - Dung lượng ≤ 5MB.
   - concert_id có tồn tại không.
   - Nếu không hợp lệ → 400 Bad Request ngay.

4. Trích xuất thông tin ra rồi đưa vào payload, tạo 1 job cho BullMQ, trả về 202.
5. Background Worker consume job:
   - Parse CSV từng dòng bằng csv-parser.
   - Với mỗi dòng, validate chi tiết:
     - full_name: không rỗng.
     - email: đúng format email.
     - ticket_type: phải là một trong [GA, VIP, SVIP, CAT1, CAT2].
     - sponsor: không rỗng.

   - Dòng hợp lệ → UPSERT vào bảng vip_guests:
     - Nếu (concert_id, email) chưa có → INSERT.
     - Nếu đã có → UPDATE full_name, sponsor, ticket_type.

   - Dòng không hợp lệ → ghi vào danh sách errors, tiếp tục xử lý dòng tiếp theo (không dừng toàn bộ job vì một dòng lỗi).

6. Sau khi xử lý xong toàn bộ:
   - Cập nhật job status = 'completed'.
   - Lưu báo cáo kết quả (success_rows, failed_rows, errors).
   - Gửi in-app notification cho Organizer: "Import hoàn tất: X thành công, Y lỗi".

---

## 4. Kịch bản lỗi

### 4.1 File CSV sai format hoàn toàn (không có header đúng)

- Phát hiện tại bước validate sơ bộ (bước 3) trước khi đẩy vào queue.
- Trả về 400 Bad Request:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CSV_FORMAT",
    "message": "File CSV thiếu các cột bắt buộc: full_name, email, sponsor, ticket_type."
  }
}
```

### 4.2 Một số dòng có dữ liệu lỗi

- Worker không dừng job — tiếp tục xử lý các dòng còn lại.
- Dòng lỗi được ghi vào danh sách errors kèm số dòng và lý do cụ thể.
- Organizer xem báo cáo lỗi sau khi job hoàn thành và quyết định xử lý thủ công.

### 4.3 File CSV quá lớn (>5MB)

- Từ chối ngay tại bước 3 với 400 Bad Request.
- Gợi ý Organizer chia nhỏ file thành nhiều batch.

### 4.4 Import trùng (cùng email + concert_id)

- Không báo lỗi — thực hiện UPDATE thông tin mới nhất (upsert).
- Hành vi này cho phép nhãn hàng gửi lại file đã cập nhật mà không lo tạo duplicate.

### 4.5 BullMQ queue gián đoạn giữa chừng

- Job được bảo toàn trong Redis — khi queue phục hồi, worker tiếp tục từ đầu job.
- Do dùng upsert, việc xử lý lại các dòng đã import trước đó là idempotent — không tạo duplicate.

---

## 5. Ràng buộc

- Bất đồng bộ bắt buộc: File CSV có thể chứa hàng trăm dòng — xử lý đồng bộ sẽ timeout. Toàn bộ logic parse và import phải qua BullMQ queue.
- Không dừng job vì lỗi từng dòng: Một dòng dữ liệu sai không được làm hỏng toàn bộ batch. Worker phải xử lý hết file và báo cáo lỗi chi tiết.
- Upsert thay vì insert thuần: Đảm bảo idempotency — Organizer có thể upload lại cùng file nhiều lần mà không tạo bản ghi trùng.
- Không tự động cấp vé: Import CSV chỉ tạo bản ghi trong bảng vip_guests. Việc gán vé thực tế (ticket_id) là bước riêng do Organizer thực hiện thủ công hoặc qua một luồng khác.
- Không lưu file CSV: Sau khi đẩy job vào queue, file CSV không được lưu lại trên server. Chỉ lưu nội dung đã parse trong job payload.
- Template cố định: Hệ thống chỉ chấp nhận CSV đúng format template đã quy định. Nhãn hàng tài trợ phải tuân theo template — không hỗ trợ auto-detect column mapping.

---

## 6. Tiêu chí chấp nhận

- Organizer có thể upload file CSV và nhận phản hồi ngay lập tức (202) mà không chờ xử lý xong.
- Toàn bộ dòng hợp lệ được import đúng vào bảng vip_guests.
- Dòng có dữ liệu lỗi bị bỏ qua, không làm dừng toàn bộ job.
- Organizer nhận báo cáo chi tiết: số dòng thành công, số dòng lỗi, lý do từng dòng lỗi.
- Upload lại cùng file không tạo bản ghi trùng lặp.
- File CSV sai format hoặc quá dung lượng bị từ chối ngay với thông báo rõ ràng.
- Luồng mua vé và các service khác không bị ảnh hưởng trong quá trình import.
- Organizer nhận in-app notification khi job hoàn thành.
