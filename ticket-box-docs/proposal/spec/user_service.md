# Đặc tả người dùng (User Service)

## Mô tả

User Service chịu trách nhiệm quản lý thông tin người dùng và quyền truy cập trong hệ thống TicketBox. Service này lưu trữ hồ sơ người dùng, trạng thái tài khoản và vai trò (role) của từng người dùng, đồng thời cung cấp các API phục vụ cho việc quản trị người dùng bởi quản trị viên.

Ngoài chức năng quản lý dữ liệu người dùng, User Service còn phối hợp với hệ thống xác thực để đảm bảo các thay đổi về trạng thái tài khoản hoặc quyền hạn được áp dụng ngay lập tức trên toàn hệ thống. Khi một tài khoản bị khóa hoặc thay đổi role, các phiên đăng nhập hiện tại sẽ bị vô hiệu hóa nhằm đảm bảo tính bảo mật và nhất quán.

### Phạm vi

- Quản lý hồ sơ người dùng.
- Quản lý trạng thái tài khoản (`active`, `banned`).
- Quản lý vai trò người dùng (`audience`, `staff`, `organizer`).
- Cung cấp API cho Organizer quản lý người dùng.
- Thu hồi phiên đăng nhập khi tài khoản bị khóa hoặc thay đổi quyền.
- Ghi nhận audit log cho các thao tác quản trị.

### Yêu cầu hiệu năng

- Hỗ trợ truy vấn danh sách người dùng có phân trang.
- Hỗ trợ lọc theo role và trạng thái tài khoản.
- Thời gian phản hồi các thao tác quản trị thông thường dưới 500ms trong điều kiện tải bình thường.
- Có khả năng mở rộng theo chiều ngang (horizontal scaling).
- Các thao tác cập nhật trạng thái hoặc role phải được phản ánh ngay lập tức trên toàn hệ thống.

### Ràng buộc

- Chỉ người dùng có role `ORGANIZER` mới được phép thực hiện các API quản trị.
- Mọi thay đổi trạng thái tài khoản phải được ghi audit log.
- Mọi thay đổi role phải được ghi audit log.
- Khi tài khoản bị khóa, người dùng không được phép tiếp tục sử dụng các JWT hoặc session hiện có.
- Khi role thay đổi, các JWT cũ phải bị thu hồi để tránh sử dụng quyền hạn cũ.
- Dữ liệu người dùng phải đảm bảo strong consistency.
- Không được phép cập nhật sang role không hợp lệ.
- Không được phép thao tác trên người dùng không tồn tại.

---

## API Contracts

### Nhóm 1 [ORGANIZER]: Quản lý người dùng

#### API 1 [ORGANIZER]: Lấy danh sách người dùng

**Endpoint:** `GET /api/v1/organizer/users`

**Query Parameters:** `page`, `limit`, `role`, `status` (`active` / `banned`)

**Phản hồi (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "usr-uuid",
      "email": "user@example.com",
      "full_name": "Nguyễn Văn A",
      "role": "audience",
      "status": "active",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": { "current_page": 1, "total_pages": 10, "total_items": 95 }
}
```

---

#### API 2 [ORGANIZER]: Khóa / mở khóa tài khoản

**Endpoint:** `PATCH /api/v1/organizer/users/:user_id/status`

**Headers:**

- `Authorization: Bearer <JWT_Token>`

**Request Body:**

```json
{ "status": "banned", "reason": "Vi phạm chính sách mua vé" }
```

**Phản hồi (200 OK):**

```json
{ "success": true, "message": "Tài khoản đã được cập nhật trạng thái." }
```

---

#### API 3 [ORGANIZER]: Cập nhật role người dùng

**Endpoint:** `PATCH /api/v1/organizer/users/:user_id/role`

**Headers:**

- `Authorization: Bearer <JWT_Token>`

**Request Body:**

```json
{ "role": "staff" }
```

**Phản hồi (200 OK):**

```json
{ "success": true, "message": "Role đã được cập nhật." }
```

---

### Nhóm 2 [USER]: Người dùng

#### API 1 [USER]: Tạo tài khoản

**Endpoint:** `POST /api/v1/users/sign-up`

**Request Body:**

```json
{
  "username": "abcd",
  "password": "12345678"
}
```

**Phản hồi (201 Created):**

```json
{
  "success": true,
  "message": "Tài khoản đã được tạo, vui lòng đăng nhập"
}
```

---

#### API 2 [USER]: Đăng nhập

**Endpoint:** `POST /api/v1/users/sign-in`

**Request Body:**

```json
{
  "username": "abcd",
  "password": "12345678"
}
```

**Phản hồi (200 OK):**

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "access_token": "9QkzlXYDJXMREjJvJ1zD5IjHULCFlb4MyMY4ILdWtAe0mTgj5trOZOxYIqX0kwXQ",
  "refresh_token": "i2IQM5uhL1iQz2YlbVHpMh9bKaMjZflJywaeqAhJlfyWex96uTQY3yvsVpKhUWbD"
}
```

---

## Luồng chính

### Luồng 1: Khóa tài khoản người dùng

1. Organizer gửi `PATCH /api/v1/organizer/users/:user_id/status`
2. Middleware xác thực JWT, kiểm tra role = `ORGANIZER`
3. Organizer Service kiểm tra `user_id` có tồn tại không
   - Không tồn tại → `404 Not Found`
4. Cập nhật `users.status = 'banned'` trong PostgreSQL
5. Ghi audit log: `{ organizer_id, action: 'BAN_USER', target_id, reason, timestamp }`
6. Nếu user đang có session/JWT active:
   - Ghi `user_id` vào blacklist (Redis `SET` với TTL = thời gian hết hạn JWT)
   - JWT hiện tại sẽ bị từ chối ở middleware authenticate
7. Trả về `200 OK`

### Luồng 2: Cập nhật role người dùng

1. Organizer gửi `PATCH /api/v1/organizer/users/:user_id/role`
2. Middleware xác thực JWT và kiểm tra quyền `ORGANIZER`
   - Không có quyền → `403 Forbidden`
3. Organizer Service kiểm tra `user_id` có tồn tại không
   - Không tồn tại → `404 Not Found`
4. Kiểm tra role mới có hợp lệ không
   - Role không nằm trong danh sách cho phép (`customer`, `staff`, `organizer`) → `400 Bad Request`
5. Kiểm tra role hiện tại của người dùng
   - Nếu role hiện tại giống role mới → `409 Conflict` hoặc `200 OK` (không có thay đổi)
6. Cập nhật `users.role` trong PostgreSQL
7. Ghi audit log:
   ```json
   {
     "organizer_id": "organizer_001",
     "action": "UPDATE_USER_ROLE",
     "target_id": "user_123",
     "old_role": "customer",
     "new_role": "staff",
     "timestamp": "2026-06-02T10:30:00Z"
   }
   ```
8. Thu hồi các JWT/session hiện tại của người dùng
   - Ghi `user_id` hoặc `token_version` vào Redis
   - Hoặc tăng `token_version` trong database
   - Các JWT cũ sẽ bị từ chối ở middleware xác thực
   - Người dùng phải đăng nhập lại để nhận JWT mới chứa role mới
9. Trả về `200 OK`:
   ```json
   {
     "success": true,
     "message": "Role đã được cập nhật."
   }
   ```
