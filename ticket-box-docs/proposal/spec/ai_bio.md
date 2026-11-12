# Đặc tả hệ thống AI Bio (AI Bio Service)

## 1. Mô tả

AI Artist Bio Service cho phép Organizer tự động sinh tiểu sử nghệ sĩ từ file PDF press kit thay vì phải viết thủ công. Service này trích xuất văn bản từ PDF, gửi đến Gemini 2.5 API, nhận về tiểu sử được sinh tự động và lưu vào database để hiển thị trên trang chi tiết concert.

### Phạm vi

- Nhận PDF press kit của nghệ sĩ từ Organizer (upload trực tiếp hoặc qua URL — xem mục luồng chính).
- Trích xuất văn bản từ PDF và gửi prompt đến Gemini 2.5 API.
- Lưu kết quả vào bảng artists.bio trong PostgreSQL.
- Cho phép Organizer xem trước và chỉnh sửa tiểu sử trước khi publish.
- Tuyệt đối không tự động publish tiểu sử mà không qua bước Organizer review.

### Giới hạn đã biết

- Chỉ hỗ trợ PDF văn bản (text-based PDF). PDF dạng scan hình ảnh (scanned PDF) không được hỗ trợ vì cần OCR riêng — nằm ngoài phạm vi.
- Kết quả sinh ra phụ thuộc vào chất lượng nội dung PDF đầu vào — hệ thống không đảm bảo độ chính xác tuyệt đối.

---

## 2. API Contracts

### 2.1 API 1: Sinh tiểu sử từ PDF

#### Phương án A — Upload file trực tiếp

**POST** `/api/v1/organizer/artists/:artist_id/bio/generate`

##### Headers

```http
Authorization: Bearer <JWT_Token>
Content-Type: multipart/form-data
```

##### Request Body

- file (PDF, tối đa 10MB)

##### Phản hồi (202 Accepted — xử lý bất đồng bộ)

```json
{
  "success": true,
  "message": "Đang xử lý. Tiểu sử sẽ sẵn sàng trong vài giây.",
  "data": {
    "job_id": "job-uuid-1234"
  }
}
```

---

### 2.2 API 2: Kiểm tra trạng thái sinh tiểu sử

**GET** `/api/v1/organizer/artists/:artist_id/bio/status`

##### Headers

```http
Authorization: Bearer <JWT_Token>
```

##### Phản hồi (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "bio": "HIEUTHUHAI, tên thật Nguyễn Thanh Tùng, là một trong những...",
    "generated_at": "2026-07-01T10:05:00Z"
  }
}
```

##### Các giá trị status

- pending
- processing
- completed
- failed

---

### 2.3 API 3: Chỉnh sửa và publish tiểu sử

**PATCH** `/api/v1/organizer/artists/:artist_id/bio`

##### Headers

```http
Authorization: Bearer <JWT_Token>
Content-Type: application/json
```

##### Request Body

```json
{
  "bio": "Nội dung tiểu sử đã được Organizer chỉnh sửa...",
  "publish": true
}
```

##### Phản hồi (200 OK)

```json
{
  "success": true,
  "message": "Tiểu sử đã được cập nhật và publish."
}
```

---

## 3. Luồng chính

### 3.1 Luồng sinh tiểu sử

1. Organizer gửi POST với PDF (file hoặc URL) kèm artist_id.
2. Middleware xác thực JWT, kiểm tra role = ORGANIZER.
3. AI Bio Service validate đầu vào:
   - Kiểm tra artist_id tồn tại trong database.
   - Kiểm tra file là PDF hợp lệ, dung lượng ≤ 10MB.
   - Kiểm tra PDF là text-based (không phải scanned image).
   - Nếu không hợp lệ → 400 Bad Request.

4. Trả về 202 Accepted ngay, đẩy job vào BullMQ queue.
5. Background Worker consume job:
   - Trích xuất văn bản từ PDF bằng thư viện pdf-parse.
   - Xây dựng prompt (ví dụ) gửi đến Gemini 2.5 API:

```text
"Dựa trên thông tin sau đây về nghệ sĩ, hãy viết một tiểu sử
ngắn gọn (150-200 từ) bằng tiếng Việt, phù hợp để hiển thị
trên trang concert. Thông tin: {extracted_text}"
```

- Gọi Gemini 2.5 API với timeout = 30 giây.
- Nhận kết quả, lưu vào artists.bio_draft với status = 'pending_review'.

6. Organizer polling `GET /api/v1/organizer/artists/:artist_id/bio/status` để biết khi nào xử lý xong.
7. Organizer xem trước tiểu sử, chỉnh sửa nếu cần.
8. Organizer gửi PATCH với publish = true để confirm.
9. Hệ thống cập nhật artists.bio = bio_draft, xóa bio_draft.
10. Concert Service tự động hiển thị tiểu sử mới trong lần load trang tiếp theo (sau khi cache invalidate).

---

## 4. Kịch bản lỗi

### 4.1 Gemini API không phản hồi / timeout (>30 giây)

- Worker dừng lại sau 30 giây, không chờ vô hạn.
- Cập nhật job status = failed với message: "AI service timeout".
- Retry tối đa 2 lần với delay 60 giây.
- Sau 2 lần thất bại: thông báo cho Organizer qua in-app notification.

```text
ERROR | Gemini API timeout | artist_id={id} | attempt={n}
```

### 4.2 Gemini API trả về kết quả không đạt yêu cầu

- Hệ thống không tự phán xét chất lượng kết quả — lưu nguyên kết quả vào bio_draft.
- Organizer chịu trách nhiệm review và chỉnh sửa trước khi publish.
- Đây là lý do bước Organizer review là bắt buộc, không tự động publish.

### 4.3 PDF không trích xuất được văn bản (scanned PDF / PDF lỗi)

- pdf-parse trả về chuỗi rỗng hoặc throw exception.
- AI Bio Service trả về 400 Bad Request:

```json
{
  "success": false,
  "error": {
    "code": "PDF_EXTRACTION_FAILED",
    "message": "Không thể trích xuất văn bản từ file PDF. Vui lòng đảm bảo PDF không phải dạng scan hình ảnh."
  }
}
```

### 4.4 PDF vượt quá dung lượng cho phép (>10MB)

- Validation ngay tại bước 3, trước khi đẩy job vào queue.
- Trả về 400 Bad Request với thông báo rõ giới hạn dung lượng.

### 4.5 Gemini API key hết quota

- Worker bắt lỗi 429 Too Many Requests từ Gemini.
- Không retry ngay — đưa job vào delayed queue, thử lại sau 10 phút.
- Cập nhật health endpoint:

```json
{
  "ai_service": "quota_exceeded"
}
```

```http
GET /health
```

```text
WARN | Gemini API quota exceeded. Retrying in 10 minutes
```

---

## 5. Ràng buộc

- Organizer review bắt buộc: Tiểu sử do AI sinh ra không bao giờ được tự động publish. Phải có bước Organizer xem trước và xác nhận qua PATCH với publish = true.
- Bất đồng bộ: Quá trình sinh tiểu sử có thể mất 10–30 giây tùy độ dài PDF và tốc độ Gemini API. Hệ thống không block request — trả về 202 ngay và để Organizer polling.
- Giới hạn PDF: Chỉ hỗ trợ text-based PDF, tối đa 10MB. PDF dạng scan hình ảnh không được hỗ trợ trong phạm vi đồ án.
- Không lưu file PDF: Sau khi trích xuất văn bản xong, file PDF không được lưu lại trên server — chỉ lưu văn bản đã trích xuất và kết quả tiểu sử. Tránh tốn storage và rủi ro bảo mật.
- Prompt cố định: Prompt gửi đến Gemini được cố định trong code, không cho phép Organizer tùy chỉnh prompt — đảm bảo output nhất quán về format và ngôn ngữ.
- Cache invalidation: Sau khi Organizer publish tiểu sử mới, AI Bio Service phải xóa cache Redis của concert liên quan để Concert Service load dữ liệu mới trong lần tiếp theo.

---

## 6. Tiêu chí chấp nhận

- Organizer có thể upload PDF press kit và nhận về tiểu sử nghệ sĩ được sinh tự động.
- Tiểu sử sinh ra bằng tiếng Việt, độ dài khoảng 150–200 từ.
- Hệ thống trả về phản hồi ngay lập tức (202) mà không chờ AI xử lý xong.
- Organizer có thể xem trước, chỉnh sửa và publish tiểu sử.
- Tiểu sử không được tự động publish khi chưa có Organizer confirm.
- Khi Gemini API timeout hoặc lỗi, hệ thống thông báo cho Organizer và không làm ảnh hưởng đến các chức năng khác.
- PDF dạng scan hoặc quá dung lượng bị từ chối với thông báo rõ ràng.
- Sau khi publish, tiểu sử hiển thị đúng trên trang chi tiết concert.
