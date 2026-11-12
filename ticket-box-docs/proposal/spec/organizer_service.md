# Đặc tả hệ thống quản lý (Organizer service)

## 1. Mô tả

Organizer Service cung cấp giao diện và API quản trị dành riêng cho Organizer, cho phép quản lý toàn bộ vận hành của hệ thống TicketBox. Service này bao gồm 4 nhóm chức năng chính: quản lý người dùng, quản lý concert, quản lý đơn hàng và refund, và xem dashboard thống kê doanh thu. Một số API thực hiện chức năng quản lý sẽ để trong service khác nên không được liệt kê trong đây.

### Phạm vi

- Toàn bộ API trong service này yêu cầu role ORGANIZER — mọi request thiếu JWT hợp lệ hoặc không đủ quyền đều bị từ chối.
- Organizer Service không tự xử lý logic nghiệp vụ của các service khác. Khi hủy concert, Organizer Service gọi Concert Service; khi xử lý refund, gọi Payment Service — không duplicate logic.
- Mọi thao tác thay đổi dữ liệu (khóa user, hủy concert, refund) đều được ghi audit log với thông tin: ai thực hiện, lúc nào, thay đổi gì.

---

## 2. API Contracts

### 2.1 Nhóm 4: Dashboard thống kê

#### API 7: Thống kê doanh thu

**GET** `/api/v1/organizer/dashboard`

##### Query Parameters

- concert_id (optional)
- from_date
- to_date

##### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": {
    "total_revenue": 850000000,
    "total_orders": 1200,
    "total_tickets_sold": 2400,
    "revenue_by_ticket_type": [
      {
        "name": "VIP",
        "sold": 400,
        "revenue": 400000000
      },
      {
        "name": "GA",
        "sold": 2000,
        "revenue": 450000000
      }
    ],
    "orders_by_status": {
      "COMPLETED": 1150,
      "FAILED": 35,
      "EXPIRED": 15
    }
  }
}
```

---

## 3. Luồng chính

### 3.1 Luồng 4: Xem dashboard doanh thu

1. Organizer gửi `GET /api/v1/organizer/dashboard` với query params.
2. Middleware xác thực JWT, kiểm tra role = ORGANIZER.
3. Organizer Service thực hiện aggregation query trên PostgreSQL:
   - `SUM(total_amount) WHERE status = 'COMPLETED'`
   - `GROUP BY ticket_type, status`
   - Lọc theo concert_id và khoảng thời gian nếu có.

4. Trả về JSON payload thống kê.

---

## 4. Kịch bản lỗi

### 4.1 Hủy concert đã có người mua vé

- Đây là luồng bình thường, không phải lỗi — hủy concert vẫn được phép dù đã bán vé.
- Hệ thống tự động trigger refund cho toàn bộ order COMPLETED qua Background Worker.
- Organizer nhận cảnh báo trong response: số lượng order sẽ được refund.

### 4.2 Organizer cố tình thao tác trùng (hủy concert đã hủy, ban user đã bị ban)

- Hệ thống kiểm tra trạng thái hiện tại trước khi xử lý.
- Trả về `400 Bad Request` với thông báo rõ trạng thái hiện tại của đối tượng.
- Không ghi audit log cho các thao tác không hợp lệ.

### 4.3 Dashboard query chậm khi dữ liệu lớn

- Aggregation query có thể chậm khi số lượng order lớn.
- Hướng xử lý: giới hạn bắt buộc phải có `from_date` và `to_date` trong query params, không cho phép query toàn bộ lịch sử không giới hạn.
- Trả về `400 Bad Request` nếu thiếu tham số ngày.

---

## 5. Ràng buộc

### Xác thực bắt buộc

Toàn bộ API trong Organizer Service yêu cầu JWT hợp lệ với role ORGANIZER. Không có endpoint public.

### Audit log không thể xóa

Mọi thao tác thay đổi dữ liệu phải được ghi audit log trước khi thực hiện thay đổi. Audit log là append-only, Organizer không thể chỉnh sửa hay xóa.

### Side effect bất đồng bộ

Các hành động có side effect lớn (hủy concert, refund hàng loạt) phải được xử lý qua BullMQ queue — không xử lý đồng bộ trong request để tránh timeout.

### Không duplicate logic

Organizer Service không tự implement logic refund hay gửi notification — chỉ đẩy job vào queue và để các service chuyên trách xử lý.

### Giới hạn query dashboard

Bắt buộc có `from_date` và `to_date` khi truy vấn thống kê. Khoảng thời gian tối đa cho một query là 90 ngày.

---

## 6. Tiêu chí chấp nhận

- Organizer có thể xem danh sách người dùng, lọc theo role và trạng thái.
- Tài khoản bị khóa không thể đăng nhập hoặc thực hiện giao dịch mới.
- Organizer có thể hủy concert và toàn bộ người dùng có vé nhận được thông báo.
- Dashboard hiển thị đúng doanh thu và số vé đã bán theo từng loại vé.
- Mọi thao tác quản trị đều có audit log với đầy đủ thông tin.
- Các thao tác không hợp lệ (hủy concert đã hủy, ban user đã ban) bị từ chối với thông báo rõ ràng.
- Luồng mua vé và soát vé không bị ảnh hưởng trong khi Organizer đang thực hiện các thao tác quản trị.
