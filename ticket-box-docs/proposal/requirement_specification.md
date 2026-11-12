# Tài liệu Xác định Yêu cầu Hệ thống (Requirements Specification)

## 1. Các Actor trong Hệ thống

| Actor                       | Mô tả                                                            | Chức năng                                                                                                                                           |
| :-------------------------- | :--------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Khán giả (audience)**     | Là người sử dụng hệ thống để mua vé, xem vé                      | - Xem concert, vé<br>- Mua vé<br>- Nhận vé dạng QR và dùng cho soát vé                                                                              |
| **Ban tổ chức (organizer)** | Là người điều hành hệ thống, concert                             | - Tạo, quản lý concert<br>- Cấu hình loại vé<br>- Theo dõi doanh thu, lượng bán                                                                     |
| **Nhân sự soát vé (staff)** | Là người có nhiệm vụ check-in tại cổng vào                       | - Soát vé tại cổng                                                                                                                                  |
| **Bên thứ ba**              | Các bên thứ ba như ZaloPay, Zalo, ChatGPT, các nhãn hàng tài trợ | - Thực hiện các giao dịch mua vé<br>- Thực hiện thông báo concert<br>- Hệ thống AI cho artist summary<br>- File CSV cho khách mời nhãn hàng tài trợ |

---

## 2. Nhu cầu của các Actor

### Khán giả (Audience)

- **Nhu cầu cốt lõi:** Mua được vé nhanh, biết ngay kết quả, và vào cổng dễ dàng.
- Duyệt danh sách concert và xem thông tin chi tiết (nghệ sĩ, địa điểm, ngày giờ, sơ đồ chỗ ngồi).
- Chọn loại vé (GA, VIP, SVIP...) và tiến hành thanh toán.
- Giới hạn số vé mua tối đa mỗi tài khoản để hạn chế scalper.
- Nhận e-ticket với mã QR qua email sau khi thanh toán thành công.
- Nhận thông báo nhắc nhở trước ngày diễn 24 giờ.
- Xem lại lịch sử vé đã mua.
- > **Điều quan trọng nhất:** Không mất tiền mà không có vé. Quy trình mua phải nhanh và rõ ràng.

### Ban tổ chức (Organizer)

- **Nhu cầu cốt lõi:** Tạo và quản lý sự kiện dễ dàng, theo dõi doanh thu chính xác.
- Tạo concert mới với đầy đủ thông tin: tên, nghệ sĩ, địa điểm, ngày giờ, ảnh bìa.
- Cấu hình các loại vé: tên, giá, số lượng, thời gian mở bán.
- Xem số vé đã bán, số vé còn lại, doanh thu theo từng loại vé.
- Quản lý danh sách khách mời VIP riêng biệt.
- > **Điều quan trọng nhất:** Dữ liệu doanh thu và số lượng vé phải chính xác tuyệt đối.

### Nhân sự soát vé (Staff)

- **Nhu cầu cốt lõi:** Xác thực vé nhanh tại cổng, tránh vé giả hoặc vé dùng lại.
- Đăng nhập bằng tài khoản staff được cấp quyền riêng.
- Quét mã QR trên điện thoại bằng camera trình duyệt.
- Nhận phản hồi tức thì: vé hợp lệ / đã sử dụng / không tồn tại.
- Xem số lượt đã soát tại cổng được phân công.
- > **Điều quan trọng nhất:** Tốc độ xác thực nhanh (dưới 2 giây mỗi lượt), không để queue dài tại cổng.

---

## 3. Yêu cầu Chức năng (Functional Requirements - FR)

### Xem thông tin concert

- **FR-01:** Hệ thống hiển thị danh sách các buổi concert tới cho user.
- **FR-02:** Hệ thống hiển thị thông tin concert gồm thông tin nghệ sĩ, địa điểm tổ chức.
- **FR-03:** Hệ thống hiển thị sơ đồ chỗ ngồi (SVG tương tác GA, SVIP, VIP, CAT1, CAT2).
- **FR-04:** Hệ thống hiển thị số vé real-time.

### Xem và chọn mua vé

- **FR-05:** Hệ thống phải cho phép người dùng chọn loại vé và số lượng vé cho một buổi concert.
- **FR-06:** Hệ thống phải áp dụng giới hạn số lượng vé tối đa được mua trên mỗi người dùng, theo từng loại vé cho mỗi concert.
- **FR-07:** Hệ thống phải tạm thời giữ (giữ chỗ) các vé đã chọn trong suốt quá trình thanh toán.
- **FR-08:** Hệ thống phải xử lý thanh toán thông qua các cổng thanh toán bên ngoài.
- **FR-09:** Hệ thống tạo đơn hàng sẽ khởi tạo đơn hàng ở trạng thái PENDING ngay khi giữ chỗ thành công. Chỉ phát hành thẻ khi xác nhận thanh toán thành công.
- **FR-10:** Hệ thống phải cấp vé điện tử (e-ticket) kèm mã QR sau khi thanh toán thành công.

### Thanh toán

- **FR-11:** Hệ thống phải đảm bảo tính hợp idempotency trong xử lý thanh toán để ngăn chặn việc trùng lặp giao dịch.
- **FR-12:** Hệ thống phải xử lý các trường hợp thanh toán thất bại mà không tạo ra các đơn hàng vé không hợp lệ.

### Hệ thống thông báo

- **FR-13:** Hệ thống phải gửi thông báo xác nhận mua hàng thành công cho người dùng qua email và tin nhắn trong ứng dụng (in-app).
- **FR-14:** Hệ thống phải gửi thông báo nhắc nhở tự động 24 giờ trước khi concert diễn ra.
- **FR-15:** Hệ thống phải hỗ trợ tích hợp với nhiều kênh thông báo khác nhau.

### Hệ thống quản lý

- **FR-16:** Hệ thống phải cho phép ban tổ chức tạo các buổi concert mới.
- **FR-17:** Hệ thống phải cho phép ban tổ chức cập nhật thông tin chi tiết của concert.
- **FR-18:** Hệ thống phải cho phép ban tổ chức hủy các buổi concert.
- **FR-19:** Hệ thống phải cho phép ban tổ chức cấu hình các loại vé, giá vé, số lượng vé và giới hạn trên mỗi người dùng.
- **FR-20:** Hệ thống phải cung cấp số liệu phân tích doanh thu và doanh số bán vé cho ban tổ chức.

### Hệ thống AI

- **FR-21:** Hệ thống phải cho phép ban tổ chức tải lên các tệp tài liệu truyền thông (press kit) định dạng PDF.
- **FR-22:** Hệ thống phải trích xuất và làm sạch dữ liệu văn bản từ các tệp PDF được tải lên.
- **FR-23:** Hệ thống phải tự động tạo bản tóm tắt tiểu sử nghệ sĩ dựa trên công nghệ AI.

### Xử lý CSV từ đối tác

- **FR-24:** Hệ thống phải nhập (import) danh sách khách mời VIP từ các tệp CSV.
- **FR-25:** Hệ thống phải xác thực và xử lý các bản ghi trùng lặp hoặc không hợp lệ trong tệp CSV.
- **FR-26:** Hệ thống phải cập nhật dữ liệu quyền truy cập của VIP mà không làm gián đoạn các hoạt động đang diễn ra của hệ thống.

### Hệ thống soát vé

- **FR-27:** Hệ thống phải cho phép nhân viên quét mã QR để xác thực vé.
- **FR-28:** Hệ thống phải ngăn chặn việc check-in nhiều lần (trùng lặp) bằng cùng một vé.

---

## 4. Yêu cầu Phi Chức Năng (Non-Functional Requirements - NFR)

### Performance & Scalability

- **NFR-01:** Hệ thống phải xử lý lên đến 80.000 người dùng đồng thời trong các khoảng thời gian cao điểm mở bán vé.
- **NFR-02:** Hệ thống phải duy trì thời gian phản hồi thấp (low response time) dưới tải lượng truy cập cao.
- **NFR-03:** Hệ thống phải hỗ trợ mở rộng theo chiều ngang để xử lý các đợt lưu lượng truy cập tăng đột biến.
- **NFR-04:** Hệ thống phải đảm bảo việc cập nhật trạng thái còn/hết của vé được xử lý theo thời gian thực hoặc gần như thời gian thực (near real-time).

### Security & Access Control

- **NFR-05:** Hệ thống phải áp dụng kiểm soát truy cập dựa trên vai trò (RBAC) cho tất cả người dùng.
- **NFR-06:** Hệ thống phải giới hạn quyền gọi API dựa trên vai trò và quyền hạn của người dùng.
- **NFR-07:** Hệ thống phải ngăn chặn việc truy cập trái phép vào các chức năng của quản trị viên (organizer) và nhân viên (staff).
- **NFR-08:** Hệ thống phải có biện pháp ngăn chặn hành vi mua vé tự động bằng bot.

### Reliability & Consistency

- **NFR-09:** Hệ thống phải đảm bảo không cấp trùng lặp vé cho cùng một vị trí ghế ngồi.
- **NFR-10:** Hệ thống phải đảm bảo không xảy ra tình trạng thanh toán trùng lặp hoặc trừ tiền hai lần.
- **NFR-11:** Hệ thống phải duy trì tính nhất quán của dữ liệu trong các kịch bản mua vé đồng thời.
- **NFR-12:** Hệ thống phải đảm bảo giới hạn số lượng vé trên mỗi người dùng được thực thi nghiêm ngặt ngay cả dưới tải lượng hệ thống cao.

### Availability & Fault Tolerance

- **NFR-13:** Hệ thống phải duy trì hoạt động ngay cả khi cổng thanh toán bên ngoài không khả dụng.
- **NFR-14:** Hệ thống phải có khả năng hạ cấp mượt mà (graceful degradation) khi các dịch vụ bên ngoài gặp sự cố.

### Scalability & Caching

- **NFR-15:** Hệ thống phải sử dụng cơ chế lưu bộ nhớ đệm để giảm tải cho cơ sở dữ liệu đối với các dữ liệu concert được truy cập thường xuyên.
- **NFR-16:** Hệ thống phải làm mới hoặc cập nhật dữ liệu vé còn lại trong bộ nhớ đệm theo thời gian thực hoặc gần như thời gian thực.
- **NFR-17:** Hệ thống phải hỗ trợ bộ nhớ đệm phân tán cho các trang có lưu lượng đọc dữ liệu cao.

### Integration & Extensibility

- **NFR-18:** Hệ thống phải hỗ trợ việc thêm các kênh thông báo mới mà không cần thay đổi lớn cấu trúc hệ thống.
- **NFR-19:** Hệ thống phải hỗ trợ tích hợp với các nhà cung cấp dịch vụ thanh toán bên ngoài.
- **NFR-20:** Hệ thống phải hỗ trợ tích hợp dựa trên tệp (CSV) đối với các nguồn dữ liệu khách mời VIP từ bên ngoài.
- **NFR-21:** Hệ thống phải hỗ trợ khả năng tích hợp các mô hình AI trong tương lai để phục vụ việc tóm tắt thông tin nghệ sĩ.

### Data Integrity

- **NFR-22:** Hệ thống phải đảm bảo đồng bộ hóa chính xác giữa số lượng vé tồn kho và các đơn hàng.
- **NFR-23:** Hệ thống phải ngăn chặn tình trạng sai lệch/ghi đè dữ liệu trong quá trình cập nhật đồng thời.
- **NFR-24:** Hệ thống phải đảm bảo tính hợp nhất cho các hoạt động trọng yếu như xử lý thanh toán.

### Maintainability & Observability

- **NFR-25:** Hệ thống phải được thiết kế dưới dạng các thành phần mô-đun để cho phép cập nhật độc lập.
- **NFR-26:** Hệ thống phải ghi nhật ký (log) các hoạt động trọng yếu phục vụ cho mục đích giám sát và khắc phục sự cố (debugging).
- **NFR-27:** Hệ thống phải cung cấp các chỉ số giám sát (monitoring metrics) về sức khỏe (health) và hiệu năng của hệ thống.
