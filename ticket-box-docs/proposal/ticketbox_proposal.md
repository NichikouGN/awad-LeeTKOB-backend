# Proposal: TicketBox

## Vấn đề

Trong những năm gần đây, thị trường concert tại Việt Nam tăng trưởng mạnh với các sự kiện quy mô lớn như Anh Trai Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng, hay các đêm nhạc của nghệ sĩ quốc tế. Nhu cầu mua vé lên tới hàng chục nghìn người trong cùng một thời điểm, trong khi hạ tầng và quy trình bán vé hiện tại chưa đáp ứng được.

### Các kênh bán vé phổ biến hiện nay vẫn còn nhiều hạn chế:

- **Zalo OA / Google Form:** Không có cơ chế kiểm soát số lượng vé theo thời gian thực. Ban tổ chức phải xử lý thủ công, dễ xảy ra tình trạng bán quá số lượng hoặc nhầm lẫn đơn hàng.
- **Chuyển khoản ngân hàng thủ công:** Thiếu xác nhận tức thì, người mua không biết mình có vé hay không sau khi chuyển tiền. Không có cơ chế hoàn tiền tự động khi hết vé.
- **Các nền tảng bán vé hiện có:** Thường không được thiết kế để chịu tải đột biến. Khi mở bán, hàng chục nghìn người truy cập đồng thời khiến website bị chậm hoặc sập hoàn toàn — người dùng không thể hoàn tất giao dịch dù đã chờ hàng giờ.

### Hậu quả cụ thể đã xảy ra:

- Hệ thống bị sập trong vài phút đầu mở bán, giao dịch thất bại hàng loạt.
- Tiền bị trừ khỏi tài khoản ngân hàng nhưng vé không được phát hành — người dùng phải chờ hoàn tiền nhiều ngày.
- Bot scalper (chương trình tự động) mua hàng loạt vé ngay khi mở bán rồi bán lại với giá cao gấp nhiều lần, gây thiệt hại cho người hâm mộ thực sự.
- Không có quy trình soát vé thống nhất tại cổng — ban tổ chức phải dùng danh sách thủ công, dễ xảy ra gian lận hoặc nhầm lẫn.

> **Kết luận:** Những vấn đề trên không chỉ làm xấu trải nghiệm người dùng mà còn gây thiệt hại uy tín cho ban tổ chức và làm giảm niềm tin vào thị trường sự kiện trực tiếp tại Việt Nam.

---

## Mục tiêu

Xây dựng hệ thống TicketBox — nền tảng bán vé concert trực tuyến — giải quyết các vấn đề nêu trên, hướng đến các mục tiêu cụ thể sau:

| Mục tiêu                           | Chi tiết                                                                                    | Cơ chế kỹ thuật                                                                 |
| :--------------------------------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------ |
| **Chịu tải đột biến**              | Hệ thống vẫn hoạt động ổn định khi có khoảng 80.000 người truy cập trong 5 phút đầu mở bán. | Thông qua cơ chế rate limiting và kiến trúc phù hợp.                            |
| **Đảm bảo tính nhất quán dữ liệu** | Mỗi chiếc vé chỉ được bán đúng một lần — không có tình trạng oversell.                      | Ngay cả khi nhiều người cùng mua cùng lúc.                                      |
| **Thanh toán đáng tin cậy**        | Mỗi giao dịch được xử lý đúng một lần (không trừ tiền hai lần).                             | Khi cổng thanh toán gặp sự cố, hệ thống xử lý graceful thay vì crash hoàn toàn. |
| **Trải nghiệm người dùng rõ ràng** | Người mua biết ngay kết quả sau khi thanh toán.                                             | Nhận e-ticket với mã QR qua email, và được nhắc nhở trước ngày diễn.            |
| **Soát vé nhanh và chính xác**     | Nhân sự tại cổng có thể quét QR trên điện thoại, xác thực vé trong vài giây.                | Tránh gian lận vé photo hoặc vé dùng nhiều lần.                                 |
| **Quản lý sự kiện tập trung**      | Ban tổ chức có giao diện quản lý trực quan.                                                 | Tạo concert, cấu hình các loại vé, theo dõi doanh thu theo thời gian thực.      |

---

## Phạm vi

### Trong phạm vi (In-scope)

- Hệ thống xác thực người dùng với phân quyền 3 vai trò: `Audience`, `Organizer`, `Staff`.
- Luồng mua vé end-to-end: chọn vé, thanh toán (mock), nhận QR.
- Cơ chế kiểm soát số lượng vé, giới hạn vé per-account.
- Trang quản lý concert và vé dành cho `Organizer`.
- Hệ thống gửi email xác nhận và nhắc nhở trước ngày diễn.
- Tính năng soát vé bằng QR qua mobile app — xác thực online real-time, bảo mật bằng `AES-256` và `SHA-256`.
- Tính năng AI Artist Bio và import CSV danh sách VIP.
- Cơ chế bảo vệ hệ thống: rate limiting cơ bản, xử lý lỗi thanh toán graceful, idempotency cho order.
- Tài liệu thiết kế đầy đủ: proposal, design, và các file spec tính năng.

### Ngoài phạm vi (Out-of-scope)

- Tích hợp cổng thanh toán thật (VNPAY, MoMo): hệ thống dùng mock payment service để mô phỏng luồng.
- Hạ tầng production thực tế: không triển khai lên môi trường chịu tải thật; chỉ demo trên môi trường local/staging.
- Hệ thống refund/hoàn tiền: không xử lý luồng hoàn tiền tự động.
- Đa ngôn ngữ, đa tiền tệ: hệ thống chỉ hỗ trợ tiếng Việt và VNĐ.
- Webhook từ cổng thanh toán: luồng xử lý webhook trễ không nằm trong phạm vi xử lý.

---

## Rủi ro và ràng buộc

### 1. Tranh chấp vé (Race Condition)

- **Vấn đề:** Khi hàng nghìn người cùng nhấn "Mua vé" trong một khoảnh khắc, nhiều request có thể đọc cùng một giá trị `available_tickets = 1` và đều tiến hành đặt chỗ — dẫn đến oversell.
- **Hướng xử lý:** Áp dụng hai lớp kiểm soát:
  1. _Lớp đầu tiên:_ Dùng Redis atomic `DECRBY` để giảm bộ đếm số vé còn lại ngay khi nhận request — do Redis xử lý lệnh đơn lẻ theo kiểu single-threaded và atomic, các request đến sau sẽ thấy count đã giảm và bị từ chối ngay, tránh dồn tải vào database.
  2. _Lớp thứ hai:_ Với các request vượt qua Redis, tiếp tục dùng `SELECT ... FOR UPDATE` trong PostgreSQL transaction để đảm bảo tính nhất quán tuyệt đối trước khi commit.
- **Ràng buộc:**
  - Cần thiết kế transaction cẩn thận để tránh deadlock khi tải cao.
  - Cần đảm bảo đồng bộ giữa bộ đếm Redis và `sold_quantity` trong PostgreSQL — đặc biệt khi có order expired hoặc payment failed, bộ đếm Redis phải được hoàn trả lại tương ứng.

### 2. Tải đột biến khi mở bán

- **Vấn đề:** Sự kiện lớn có thể thu hút 50.000–80.000 người truy cập trong 5 phút đầu — cao hơn nhiều lần so với lưu lượng bình thường. Nếu không có cơ chế kiểm soát, server sẽ bị quá tải và sập.
- **Hướng xử lý:** Áp dụng rate limiting (giới hạn số request mỗi IP hoặc tài khoản trong khoảng thời gian nhất định) tại tầng API Gateway. Kết hợp caching trang thông tin concert để giảm tải truy vấn database cho các request đọc.
- **Ràng buộc:** Rate limiting quá chặt sẽ ảnh hưởng trải nghiệm người dùng hợp lệ; cần cân bằng giữa bảo vệ hệ thống và khả năng tiếp cận.

### 3. Cổng thanh toán không ổn định

- **Vấn đề:** Các cổng thanh toán (VNPAY, MoMo) là dịch vụ bên ngoài — có thể chậm hoặc không phản hồi trong thời gian cao điểm. Nếu hệ thống chờ vô hạn, toàn bộ luồng mua vé sẽ bị block.
- **Hướng xử lý:** Đặt timeout cứng cho mỗi request đến cổng thanh toán. Khi phát hiện nhiều lần thất bại liên tiếp, tạm thời không gửi thêm request (circuit breaker pattern) và hiển thị thông báo rõ ràng cho người dùng thay vì treo màn hình.
- **Ràng buộc:** Cần định nghĩa rõ các trạng thái đơn hàng (`pending` / `success` / `failed` / `expired`) để tránh mơ hồ khi payment timeout.

### 4. Trừ tiền hai lần (Duplicate Transaction)

- **Vấn đề:** Người dùng nhấn "Thanh toán" nhiều lần do mạng chậm hoặc trang không phản hồi kịp. Nếu không có cơ chế kiểm tra, hệ thống có thể tạo hai đơn hàng cho cùng một giao dịch.
- **Hướng xử lý:** Gắn một `idempotency_key` duy nhất cho mỗi order. Khi nhận request trùng key, hệ thống trả về kết quả của request đầu tiên thay vì tạo đơn mới.
- **Ràng buộc:** Key cần được sinh và lưu đúng cách ở phía client lẫn server để hoạt động chính xác.

### 5. Vé giả và vé dùng lại

- **Vấn đề:** Mã QR dễ bị chụp lại và chia sẻ. Nếu không có cơ chế kiểm tra trạng thái, nhiều người có thể vào cổng bằng cùng một QR.
- **Hướng xử lý:** Mỗi mã QR chứa token duy nhất liên kết với một đơn hàng cụ thể trong database. Khi quét, hệ thống kiểm tra trạng thái (`unused` / `used`) và cập nhật ngay lập tức. Quét lần hai sẽ nhận kết quả "Đã sử dụng".
- **Ràng buộc:** Hệ thống soát vé cần kết nối mạng ổn định để xác thực real-time.

### 6. Ràng buộc về thời gian và nhân lực

- **Vấn đề:** Nhóm 3 người với kinh nghiệm web ở mức intermediate, thời gian thực hiện 3 tuần — bao gồm cả thiết kế tài liệu và cài đặt.
- **Hướng xử lý:** Ưu tiên các tính năng cốt lõi (auth, mua vé, soát vé, organizer) trước. Các tính năng phụ sẽ được đơn giản hóa hoặc thay đổi bằng những phương án phù hợp hơn nếu thời gian không cho phép.
- **Ràng buộc:** Một số quyết định thiết kế sẽ không tối ưu cho production thực tế, nhưng phù hợp với mục tiêu học thuật của đồ án.
