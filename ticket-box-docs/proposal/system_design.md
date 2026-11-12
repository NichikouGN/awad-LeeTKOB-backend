# Tài liệu Thiết kế Hệ thống (System Design)

## 1. Mô tả Tổng quan

Ứng dụng **TicketBox** sử dụng kiến trúc **Microservices hướng sự kiện (Event-Driven Microservices)** nhằm đáp ứng các yêu cầu nghiêm ngặt về:

- Lượng truy cập cực lớn trong thời gian ngắn (flash sale).
- Cập nhật dữ liệu theo thời gian thực (real-time).
- Tích hợp linh hoạt với hệ thống bên ngoài (cổng thanh toán, AI, file CSV).

Hệ thống được chia thành nhiều dịch vụ độc lập. Mỗi dịch vụ xử lý một phần chức năng riêng biệt nhằm giữ cho hệ thống tổng thể hoạt động ổn định ngay cả khi một microservice cụ thể bị gián đoạn. Đồng thời, hệ thống áp dụng triệt để cơ chế caching và load balancing để đảm bảo tối ưu hóa hiệu năng.

---

## 2. Các Thành phần Chính trong Hệ thống

### 2.1 Client

- **Web (React):** Dành cho người dùng (Audience) và ban tổ chức (Organizer).
- **Mobile App (React Native):** Dành cho người dùng (Audience) và nhân sự soát vé (Staff).

### 2.2 Edge Server

- **Load Balancer:** Phân phối tải lượng truy cập.
- **API Gateway:** Điểm đầu mối tiếp nhận và điều hướng toàn bộ request từ Client.

### 2.3 Backend Microservices

- **User Service:** \* Xác thực người dùng.
  - Phân quyền người dùng dựa trên vai trò (RBAC).
- **Concert Service:** \* Quản lý thông tin concert.
  - Sơ đồ ghế ngồi.
  - Cấu hình các loại vé.
- **Ticket Service:** \* Quản lý trạng thái và thông tin vé.
  - Kiểm tra số lượng vé.
  - Giới hạn số lượng vé cho mỗi user.
  - Xem danh sách vé đã mua.
  - Tạo mã QR cho vé.
- **Order Service:** \* Quản lý vòng đời đơn hàng.
  - Theo dõi trạng thái thanh toán.
- **Payment Service:** \* Tích hợp và tương tác với các cổng thanh toán.
- **Notification Service:** \* Gửi email và thông báo trong ứng dụng (in-app).
  - Hỗ trợ khả năng mở rộng sang các kênh khác như SMS, Zalo OA.
- **Check-in Service:** \* Quét mã QR.
  - Xác thực vé vào cổng theo thời gian thực.
- **AI Service:** \* Xử lý tệp PDF (press kit).
  - Tự động tạo mô tả/tiểu sử nghệ sĩ bằng AI.
- **VIP Import Service:** \* Nhập danh sách khách mời từ file CSV.
  - Đồng bộ dữ liệu khách mời vào hệ thống.

### 2.4 Message Broker

- **BullMQ:** Xử lý bất đồng bộ và điều phối các sự kiện (events) như:
  - Thanh toán thành công / thất bại.
  - Phát hành vé (issuing tickets).
  - Gửi thông báo (notifications).
  - Nhập dữ liệu CSV.

### 2.5 Data Layer

- **PostgreSQL:** Cơ sở dữ liệu chính (Primary DB) đảm bảo tính toàn vẹn dữ liệu cho người dùng, đơn hàng, vé, concert, nghệ sĩ,...
- **Redis:** Hệ thống lưu trữ trong bộ nhớ đệm (Cache) cho danh sách concert, thông tin chi tiết cấu hình và bộ đếm số lượng vé tồn kho.

---

## 3. Cách các Thành phần Giao tiếp

Hệ thống kết hợp linh hoạt hai phương thức giao tiếp tùy thuộc vào ngữ cảnh nghiệp vụ:

- **REST API (Đồng bộ):** Áp dụng cho các tương tác trực tiếp từ frontend tới backend yêu cầu phản hồi tức thì, ví dụ như: xem thông tin concert, thực hiện lệnh mua vé, hoặc khi organizer thao tác quản lý hệ thống,...
- **Event (Bất đồng bộ):** Áp dụng thông qua Message Broker cho các quy trình xử lý sau đó (background jobs) hoặc cần tách rời (decoupling) để tăng hiệu năng như: xử lý trạng thái thanh toán, gửi thông báo, phát hành mã QR vé, và đồng bộ dữ liệu hệ thống.

---

## 4. Lý do lựa chọn Kiến trúc Microservices

- **Khả năng mở rộng cao (Scalability):** Mỗi dịch vụ (service) có thể được mở rộng độc lập theo chiều ngang. Điều này đặc biệt quan trọng đối với `Order Service` khi xảy ra các đợt flash sale mở bán vé.
- **Tính chịu lỗi tốt (Fault Tolerance):** Sự cố xảy ra tại một service cụ thể sẽ được cô lập, không làm ảnh hưởng hay kéo sập toàn bộ hệ thống (ngăn ngừa cascading failure).
- **Hiệu năng cao (High Performance):** Sự kết hợp của Redis cache giúp giảm tải tối đa các truy vấn trực tiếp xuống cơ sở dữ liệu chính PostgreSQL trong giờ cao điểm.
- **Dễ dàng mở rộng tính năng (Extensibility):** Đội ngũ phát triển có thể dễ dàng bổ sung thêm các dịch vụ mới như SMS, AI chuyên sâu, hay hệ thống phân tích dữ liệu (analytics) mà không làm can thiệp vào các logic cốt lõi sẵn có.

---

## 5. Công nghệ Sử dụng (Technology Stack)

| Tầng hệ thống                   | Công nghệ lựa chọn                                                                     | Lý do và Lợi ích                                                                                                                                                                                                      |
| :------------------------------ | :------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tầng giao diện**              | React, TypeScript, Tailwind CSS (Web)<br>React Native, TypeScript, NativeWind (Mobile) | - Sử dụng chung tư duy thiết kế ReactJS, giúp tiết kiệm thời gian phát triển.<br>- Ứng dụng mobile đa nền tảng (iOS/Android) giúp mở rộng tối đa tệp khách hàng tiếp cận.                                             |
| **Load Balancer & API Gateway** | Nginx                                                                                  | - Phân phối traffic một cách hợp lý tới các server backend riêng biệt, tránh gây quá tải cục bộ.<br>- Hỗ trợ tích hợp sẵn cơ chế rate limiting ở tầng biên.                                                           |
| **Tầng Backend**                | ExpressJS (Kiến trúc Microservices hướng sự kiện)                                      | - Đồng nhất ngôn ngữ lập trình (JavaScript/TypeScript) với tầng giao diện, giảm thiểu thời gian chuyển đổi ngữ cảnh cho nhà phát triển.<br>- Dễ dàng triển khai, đóng gói và mở rộng độc lập cho từng dịch vụ.        |
| **Cơ sở dữ liệu**               | PostgreSQL                                                                             | - Đảm bảo tuân thủ tiêu chuẩn ACID với tính nhất quán dữ liệu mạnh mẽ, đặc biệt cần thiết cho các giao dịch tài chính và đơn hàng.                                                                                    |
| **Hệ thống Cache**              | Redis                                                                                  | - Tốc độ đọc/ghi trên bộ nhớ cực cao (In-memory).<br>- Giảm tải trực tiếp cho CSDL chính PostgreSQL trong các khung giờ cao điểm mở bán.                                                                              |
| **Message Broker**              | BullMQ                                                                                 | - Xử lý tác vụ bất đồng bộ (async jobs) giúp tối ưu hóa tốc độ phản hồi của hệ thống về phía client.<br>- Tăng cường khả năng chịu lỗi và đảm bảo tính kiên định của dữ liệu khi một service tạm thời không khả dụng. |
| **Xác thực & Bảo mật**          | JWT (JSON Web Token) & RBAC                                                            | - Bảo mật thông tin danh tính người dùng.<br>- Phân quyền chặt chẽ các hành vi và tài nguyên dựa trên vai trò cụ thể (`Audience`, `Organizer`, `Staff`).                                                              |
