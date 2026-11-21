# MLN131 Quiz — Thiết kế

Ngày: 2026-11-22

## 1. Mục đích

Biến các đề thi FE cũ môn **MLN131** (đã tải từ fuexam.me dưới dạng ảnh) thành một
trang quiz tĩnh trên **GitHub Pages** để chủ dự án chia sẻ cho bạn bè: vừa **thi thử**
như phòng thi, vừa **ôn tập** theo từng đề cũ.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Mỗi đề gốc là một quiz riêng, gắn đúng mã đề (ví dụ `MLN131 · FA24 · B5-FE`).
- Chữ câu hỏi và phương án được chép chính xác từ ảnh, kể cả dấu tiếng Việt.
- Mỗi câu có đáp án, kèm nguồn và mức độ tin cậy được hiển thị rõ cho người học.
- Có hai chế độ: Thi thử và Ôn tập.
- Thêm đề mới mà không phải sửa code giao diện.

**Không làm (v1)**
- Không gộp hay khử trùng câu giữa các đề. Câu giống nhau ở FE và FE-RE vẫn để nguyên trong từng đề.
- Không có backend, tài khoản hay bảng xếp hạng.
- Không hỗ trợ môn khác (nhưng cấu trúc dữ liệu không được chặn đường mở rộng sau này).

**Để sau (v2, không chặn v1):** chế độ "Tổng hợp" trộn câu của tất cả các đề.

**Thất bại nếu** (dù chạy được):
- Đáp án sai mà vẫn hiện như chắc chắn đúng. Mọi đáp án chưa được đối chiếu đều phải ghi rõ là chưa đối chiếu.
- OCR sai chữ làm đổi nghĩa câu hỏi hoặc phương án.
- Đẩy lên GitHub những thứ không được đẩy: ảnh gốc, `cookie.txt`.

## 3. Ràng buộc

- Hosting: GitHub Pages, chỉ có file tĩnh, không có bước build.
- Dữ liệu nguồn: `D:\WORK\DEV\Tools\FU-Overflow\MLN131\<KỲ>\<ĐỀ>\NNN.webp`, mỗi ảnh một câu
  ("Choose 1 answer", 4 phương án A–D). Ảnh không đánh dấu đáp án. Lúc viết tài liệu đã có 11 đề:
  FA24/{FE, FE-RE, B5-FE, B5-FE-RE}, FA25/FE-RE, FA26/{C1-FE, C1-FE-RE, C2-FE}, SP25/{B5-FE, FE}, SU24/B5-FE.
  Session `fu-overflow-9d` vẫn đang tải thêm.
- **Phạm vi v1 (quyết định của Claude):** làm **mọi đề đã tải đủ**. Đề FE của MLN131 đều có 60 câu,
  nên "đủ" nghĩa là có 60 ảnh hoặc session tải báo đã xong. Đề còn thiếu ảnh (ví dụ SU24/B5-FE lúc đó mới có 52)
  thì chờ tải xong mới xử lý, không đăng bản dở.
- Thứ tự câu lấy theo tên file (`001`…`060`). Số thứ tự in trên ảnh có thể khác hoặc không có, nên không dùng.
- Ảnh gốc **không** được đưa lên repo. Repo nằm trong thư mục riêng
  `D:\WORK\DEV\Tools\FU-Overflow\mln131-quiz\`, tách khỏi `cookie.txt` và `MLN131/`.
- Trên site có dòng ghi chú: không chính thức, đáp án có thể sai, kèm link báo lỗi (GitHub Issues).

## 4. Các hướng đã cân nhắc

| Hướng | Mô tả | Đánh đổi |
|---|---|---|
| **A. HTML + JS thuần (đã chọn)** | `index.html` liệt kê đề, `quiz.html?exam=<id>` đọc JSON | Không cần build, dễ đóng góp, deploy ngay. Giao diện tự viết nên đơn giản hơn |
| B. Vite + React/Svelte + GitHub Actions | SPA build qua CI | Dễ mở rộng tính năng lớn, nhưng phải có Node, CI, bước build. Quá mức cần cho v1 |

Chủ dự án chọn **A**. Dữ liệu JSON dùng chung được cho cả hai hướng, nên sau này chuyển sang B không phải làm lại phần dữ liệu.

## 5. Quy trình dữ liệu

### 5.1 OCR
- Claude đọc trực tiếp từng ảnh bằng khả năng nhìn ảnh, không dùng Tesseract.
- Mỗi đề do một subagent xử lý, xuất `data/<id>.json`, chép **đúng nguyên văn** (giữ dấu câu, không sửa lỗi chính tả của đề).
- Nếu ảnh ghi "Choose 2 answers" hoặc có nhiều hơn 4 phương án, schema vẫn hỗ trợ (xem 5.3).
- Câu đọc không chắc thì ghi `ocrNote`.
- **Đọc hai lượt (quyết định của Claude):** lượt 1 chép chữ. Lượt 2 do một subagent khác làm: xem lại ảnh,
  so với bản chép, sửa chỗ lệch, **đồng thời giải câu đó**. Lượt giải vốn phải làm, nên ghép kiểm tra vào đó
  thì được đọc độc lập lần thứ hai mà không cần thêm một vòng riêng. Mọi chỗ đã sửa được ghi vào `ocrNote`
  để có thể rà lại.

### 5.2 Đáp án
1. **Claude tự giải** từng câu theo giáo trình CNXHKH (MLN131). Kết quả ghi vào `aiAnswer`.
2. **Comment từ fuexam:** nhờ session `fu-overflow-9d` mở rộng `fuexam_dl.py` để lưu comment của mỗi thread thành
   `MLN131/<KỲ>/<ĐỀ>/comments.json` (nội dung thô + tác giả + thời gian, cùng URL thread).
   Sau đó trích đáp án theo câu từ comment (người dùng thường ghi dạng "1A 2B…" hoặc "câu 5: C"),
   ghi vào `commentAnswer`. Có nhiều comment mâu thuẫn thì lấy phương án được nhiều người chọn nhất và ghi lại số phiếu.
   - **Phối hợp:** session này nhắn `fu-overflow-9d` nhờ làm. Nếu session đó đã đóng thì người xây dựng tự mở rộng
     `fuexam_dl.py`, chạy trên máy với `cookie.txt` (không bao giờ commit file này).
   - **Thăm dò trước:** mở vài thread xem comment có thật sự ghi đáp án theo câu không. Nếu đa số không có
     thì bỏ bước này, mọi câu giữ trạng thái `ai-only`.
   - **Đánh số:** coi số câu trong comment là thứ tự ảnh (`001` = câu 1). Kiểm tra bằng cách so vài đáp án comment
     với những câu hiển nhiên. Nếu lệch có hệ thống thì coi comment của đề đó là không dùng được.
   - **v1 không chờ comment:** đề nào xong OCR và giải thì đăng với `ai-only`. Khi có comment thì cập nhật dần từng đề.
3. **Đối chiếu → `status`:**
   - `verified`: AI và ít nhất 1 comment trùng nhau, tức hai nguồn độc lập cùng chọn một đáp án.
     Giao diện luôn hiện số phiếu (`commentVotes`) để người học tự đánh giá.
   - `disputed`: lệch nhau. Đáp án hiển thị là đáp án AI, kèm cờ ⚠ và hiện cả đáp án theo comment.
   - `ai-only`: không có comment cho câu này.

### 5.3 Schema `data/<id>.json`
```json
{
  "id": "FA24-B5-FE",
  "subject": "MLN131",
  "term": "FA24",
  "code": "B5-FE",
  "title": "MLN131 · FA24 · B5-FE",
  "source": "https://fuexam.me/threads/...",
  "questions": [
    {
      "n": 1,
      "text": "Giải quyết hai vấn đề nào sau đây ...?",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "pick": 1,
      "answer": ["D"],
      "aiAnswer": ["D"],
      "commentAnswer": ["D"],
      "commentVotes": { "D": 3 },
      "status": "verified",
      "ocrNote": null
    }
  ]
}
```
`data/index.json` là manifest: danh sách `{id, title, term, code, count, stats:{verified,disputed,aiOnly}}`.
Trang chủ đọc file này, nên thêm đề chỉ cần thêm JSON và cập nhật manifest.

### 5.4 Kiểm tra dữ liệu
Một script Python (`tools/validate.py`, chạy bằng `python -I`) kiểm tra:
số câu khớp số ảnh, mỗi câu có đủ phương án và không phương án nào rỗng, `answer` nằm trong các key của `options`,
`len(answer) == pick`, `status` hợp lệ, manifest khớp dữ liệu. Ngoài ra Claude đối chiếu ngẫu nhiên khoảng 5 câu mỗi đề với ảnh gốc.

## 6. Trang web

**Trang chủ (`index.html`)**: danh sách đề nhóm theo kỳ. Mỗi thẻ đề hiện số câu, số câu ⚠, điểm cao nhất
(lưu ở localStorage), hai nút **Thi thử** / **Ôn tập**.

**Ôn tập**: từng câu một. Chọn xong hiện đúng/sai ngay, kèm nhãn trạng thái đáp án (không có phần giải thích).
Có lưới điều hướng 1–60, đánh dấu câu đã làm / đúng / sai. Tiến độ lưu localStorage.

**Thi thử**: đếm ngược (mặc định 60 phút, chỉnh được), chuyển câu tự do, đánh dấu "xem lại".
Không hiện đáp án cho tới khi nộp. Nộp xong hiện điểm /10 và danh sách câu sai kèm đáp án đúng.
Câu `disputed` vẫn được chấm theo `answer` nhưng có ghi chú.

**Chung**: responsive (bạn bè chủ yếu dùng điện thoại), dark mode, có ghi chú miễn trừ và link báo lỗi.
Nút "Báo lỗi câu này" mở GitHub Issue điền sẵn mã đề và số câu.

**Giao diện (bản mẫu: `design/prototype.html`):** Task 6 dùng file này làm nguồn chuẩn cho CSS và bố cục.
- Phong cách tối giản: một cột đọc, theo chủ đề **trống đồng Đông Sơn**.
  - Xanh gỉ đồng là màu tương tác. Đồng thau dùng cho họa tiết và nhãn. Nền giấy dó.
  - Xanh lúa / đỏ sơn mài / hổ phách dành cho đúng / sai / tranh cãi.
  - Họa tiết: chỉ có mặt trống (sao 14 cánh và các vành hoa văn) ở đầu trang chủ. Không có dải "vành thang" dưới thanh tiêu đề (chủ dự án đã bỏ).
    Mặt trống được vẽ bằng code từ hình học, không phải ảnh.
- Font **Be Vietnam Pro** cho chữ. **JetBrains Mono** cho mã đề, số câu, đồng hồ và điểm.
- Chi tiết riêng: khối câu hỏi có vạch đỏ bên trái, gợi lại giao diện phần mềm thi EOS của FPT.
- Icon dùng SVG (kiểu Lucide), không dùng emoji. Trạng thái không được thể hiện chỉ bằng màu: câu sai có viền nét đứt và aria-label.
- Có phím tắt A–D để chọn và ←/→ để chuyển câu. Xác nhận nộp bài hiện ngay trong trang, không dùng `confirm()`.

**Cấu trúc repo**
```
mln131-quiz/
  index.html  quiz.html
  assets/ app.css  home.js  quiz.js
  data/ index.json  FA24-FE.json ...
  tools/ validate.py  build_manifest.py
  docs/superpowers/specs/...
  README.md  .gitignore
```

## 7. Để người xây dựng tự quyết
- Phong cách giao diện cụ thể (màu, font), miễn là đọc rõ tiếng Việt trên điện thoại.
- Cách trích đáp án từ comment cụ thể (regex hoặc Claude đọc).
- Có xáo trộn thứ tự câu/phương án trong Thi thử hay không (mặc định: không xáo, có công tắc bật).
- Tên repo GitHub và việc tạo repo/push: chỉ làm khi chủ dự án yêu cầu.
