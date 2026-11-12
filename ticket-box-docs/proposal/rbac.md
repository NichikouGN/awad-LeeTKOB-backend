# Tài liệu Thiết kế Phân quyền (Role-Based Access Control - RBAC)

Hệ thống **TicketBox** áp dụng mô hình phân quyền nghiêm ngặt dựa trên vai trò của từng thành viên nhằm bảo mật tối đa tài nguyên và các chức năng hệ thống. Dưới đây là chi tiết quyền hạn và giới hạn cho từng vai trò (role):

---

## 1. Khách hàng (Customer / Audience)

Là vai trò người dùng phổ thông, tập trung vào luồng tìm kiếm thông tin và mua sắm vé sự kiện.

### Quyền hạn được phép:

- **Quản lý tài khoản:** Đăng ký / đăng nhập hệ thống.
- **Tra cứu thông tin:** Xem danh sách concert và xem chi tiết sơ đồ ghế ngồi.
- **Giao dịch:** Tiến hành đặt vé, thực hiện thanh toán và xem lại lịch sử đơn hàng.
- **Sử dụng vé:** Nhận mã QR Code của vé đã mua thành công.
- **Quản lý đơn:** Hủy đơn hàng (nếu còn trong khoảng thời gian hệ thống cho phép).

### 🚫 Không được phép:

- Truy cập vào trang quản trị của nhà tổ chức (Organizer dashboard).
- Thao tác chỉnh sửa thông tin concert hoặc cấu hình vé.
- Quản lý người dùng khác hoặc tham gia vào quy trình soát vé tại cổng.

---

## 2. Ban tổ chức (Organizer)

Là vai trò quản trị viên cấp cao, chịu trách nhiệm điều phối toàn bộ nội dung, cấu hình sự kiện và giám sát tài chính.

### Quyền hạn được phép:

- **Quản lý sự kiện:** Tạo mới, chỉnh sửa thông tin hoặc xóa các buổi concert.
- **Cấu hình bán vé:** Quản lý giá vé và thiết lập sơ đồ ghế ngồi cho từng khu vực.
- **Quản trị người dùng:** Quản lý danh sách người dùng trong hệ thống và có quyền khóa các tài khoản vi phạm quy chế.
- **Giám sát & Vận hành:** Xem báo cáo thống kê doanh thu thời gian thực, quản lý các đơn hàng và trực tiếp xử lý các yêu cầu refund (hoàn tiền).

### 🚫 Không được phép:

- Thực hiện soát vé trực tiếp tại cổng check-in (trừ khi tài khoản được cấp thêm hoặc chuyển đổi sang role `Staff`).

---

## 3. Nhân sự soát vé (Staff / Gate Staff)

Là vai trò nhân viên hiện trường, được cấp quyền giới hạn trên ứng dụng di động để tối ưu hóa tốc độ kiểm tra vé tại khu vực lối vào.

### Quyền hạn được phép:

- **Vận hành check-in:** Đăng nhập vào ứng dụng dành riêng cho nhân sự (Staff app).
- **Quét và Kiểm tra:** Sử dụng camera để quét mã QR Code và kiểm tra trạng thái vé real-time từ hệ thống.
- **Xác thực:** Thực hiện lệnh check-in đối với các vé hợp lệ.
- **Giám sát cá nhân:** Xem tổng số lượt vé mình đã soát tại cổng được phân công.

### 🚫 Không được phép:

- Thay đổi thông tin, trạng thái của các buổi concert.
- Quản lý thông tin người dùng trong hệ thống.
- Truy cập vào dashboard quản lý doanh thu hoặc cấu hình của Organizer.
