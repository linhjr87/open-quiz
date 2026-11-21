# Lịch sử làm bài và ôn câu sai — Thiết kế

Ngày: 2026-11-22 · Bổ sung cho `2026-11-22-mln131-quiz-design.md`

## 1. Mục đích

Người học muốn thấy mình đã ôn tập và thi thử mỗi đề bao nhiêu lần, kết quả từng lần ra sao,
và ôn lại đúng những câu đã làm sai trong một lần làm cụ thể. Mọi dữ liệu chỉ lưu trên trình duyệt
của người học. Không có database, không có tài khoản.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Mỗi đề có lịch sử các lần làm. Mỗi lần ghi: chế độ, ngày, kết quả, đáp án đã chọn.
- Trang chủ hiện số lần thi thử, số lần ôn tập và điểm thi thử cao nhất của từng đề.
- Từ một lần làm có câu sai, mở được chế độ **Ôn câu sai** chỉ gồm những câu sai của lần đó.
- Dữ liệu tự xoá khi trình duyệt không mở trang quá 7 ngày.

**Không làm**
- Không lưu thời gian làm bài.
- Không xuất/nhập dữ liệu, không đồng bộ giữa các máy.
- Không giới hạn số lần lưu, không có logic cắt bớt khi bộ nhớ đầy.
- Không hiện thông báo về việc tự xoá sau 7 ngày.

**Thất bại nếu**
- Một lượt làm chưa đủ 60 câu (trừ trường hợp hết giờ thi thử) lại được tính là một lần làm.
- Lượt Ôn câu sai làm thay đổi lịch sử, số lần làm hoặc điểm cao nhất.
- Mất dữ liệu của người vẫn dùng trang đều đặn.

## 3. Quy tắc

### 3.1 Một lần làm
Một lần làm là một lượt **Ôn tập** hoặc **Thi thử** đã trả lời **đủ toàn bộ câu của đề**.

- **Ôn tập:** khi trả lời câu cuối cùng còn trống, lượt ôn được tự ghi vào lịch sử, **đúng một lần**.
  Tải lại trang không được ghi thêm, nên tiến độ `study` lưu kèm số lần đã ghi (`recorded: k`).
  Trang hiện **thẻ hoàn thành** ở đầu cột phải, gồm `Đúng X/60`, nút "Ôn N câu sai" nếu có câu sai, "Lượt mới" và "Xem lịch sử"
  (chi tiết ở UI spec §4). Bấm "Lượt mới" sẽ xoá tiến độ để làm lại từ đầu.
  Nút "Làm lại" vẫn dùng để xoá tiến độ dở dang, và bị ẩn khi lượt đã hoàn thành. Lượt dở dang không được tính.
- **Thi thử:** nút "Nộp bài" chỉ bấm được khi đã trả lời đủ mọi câu. Khi chưa đủ, nút bị khoá và có dòng
  "Còn N câu chưa làm". **Ngoại lệ (chủ dự án chọn):** hết giờ thì bài tự nộp và vẫn tính là một lần làm,
  câu bỏ trống tính là sai. Dòng luật trên màn bắt đầu thi đổi cho khớp:
  "Phải làm đủ các câu mới nộp được. Hết giờ bài tự nộp, câu bỏ trống tính là sai."
- Điểm cao nhất chỉ tính từ các lần thi thử.

### 3.2 Câu sai và Ôn câu sai
- Câu sai của một lần làm là những câu trả lời không đúng `answer`. Với thi thử hết giờ, câu bỏ trống cũng là câu sai.
- Câu sai được **tính lại khi hiển thị** từ đáp án đã chọn và `answer` hiện tại của đề. Nếu sau này đáp án
  được sửa, danh sách câu sai đi theo đáp án mới. Riêng điểm/số câu đúng đã ghi giữ nguyên như lúc làm. *(Quyết định của Claude.)*
- **Ôn câu sai** hoạt động như Ôn tập (chọn xong hiện đúng/sai ngay, có lưới điều hướng), nhưng chỉ gồm
  những câu sai của lần làm đã chọn, theo thứ tự đề gốc. Lượt này **không phải là một lần làm**:
  - không ghi vào lịch sử
  - không đổi số lần làm hay điểm cao nhất
  - không lưu tiến độ, đóng trang là mất *(quyết định của Claude)*
  
  Làm hết thì hiện `Đúng X/Y`, kèm nút "Ôn lại" và "Về lịch sử".

### 3.3 Tự xoá sau 7 ngày
- Khoá `mln131:lastSeen` giữ thời điểm (ms) lần cuối mở trang.
- Mỗi lần trang chủ hoặc trang quiz tải, **trước khi đọc dữ liệu nào khác**:
  nếu `lastSeen` có và `now - lastSeen > 7 × 24 giờ` thì xoá mọi khoá bắt đầu bằng `mln131:`.
  Sau đó ghi `lastSeen = now`.
- Mốc tính chung cho cả trang. Mở bất kỳ trang nào cũng gia hạn thêm 7 ngày.

## 4. Lưu trữ

Vẫn dùng `localStorage` với tiền tố `mln131:`. Khoá mới:

```
mln131:<examId>:history  →  { v: 1, attempts: [Attempt, ...] }   // cũ trước, mới sau
Attempt = { mode: "study" | "exam", at: <ms>, correct, total, score10?, auto?, responses: { "<n>": ["A"], ... } }
mln131:lastSeen          →  <ms>
```

- `score10` chỉ có ở thi thử. `auto: true` đánh dấu bài tự nộp do hết giờ.
- Số thứ tự hiển thị (#1, #2…) là vị trí trong `attempts`. Số này ổn định vì không bao giờ xoá từng lần riêng lẻ.
- `mln131:<examId>:study` thêm trường tuỳ chọn `recorded: <k>` (số lần làm đã ghi cho lượt ôn này).
- Các khoá `exam`, `best` vẫn giữ nguyên. Khi nộp thi thử vẫn cập nhật `best`
  như hiện nay, nên người đã có điểm cao nhất từ trước không bị mất.
- Một lần làm khoảng 1 KB, nên 19 đề × vài chục lần chỉ khoảng 1 MB, dưới giới hạn khoảng 5 MB.

## 5. Giao diện

> **Nguồn chuẩn cho giao diện:** `2026-11-22-lich-su-lam-bai-ui.md` và bản mẫu `design/prototype-lich-su.html`,
> do session `fu-overflow-90` thiết kế. Nếu phần dưới đây lệch với hai tài liệu đó thì theo UI spec.
> Phần dưới chỉ là phác thảo ban đầu.

**Trang chủ.** Dòng phụ của mỗi đề hiện thêm số lần làm. Có thêm nút **Lịch sử** khi đề đã có ít nhất một lần làm.
```
MLN131 · FA24 · B5-FE
60 câu · ⚠ 2 câu tranh cãi · Thi thử 3 lần · Cao nhất 8.50 · Ôn tập 2 lần
[Lịch sử]  [Ôn tập]  [Thi thử]
```

**Lịch sử** (`quiz.html?exam=<id>&mode=history`): lần mới nhất ở trên cùng.
```
#4  Thi thử   21/11/2026   7.00 · đúng 42/60 · hết giờ   [Ôn 18 câu sai]
#3  Ôn tập    20/11/2026   đúng 51/60                    [Ôn 9 câu sai]
#2  Thi thử   19/11/2026   10.00 · đúng 60/60
```
Lần làm không có câu sai thì không có nút ôn. Khi chưa có lần làm nào, trang ghi "Chưa có lần làm nào" kèm nút Ôn tập và Thi thử.

**Ôn câu sai** (`quiz.html?exam=<id>&mode=review&attempt=<#>`): giao diện Ôn tập.
Tiêu đề phụ là "Ôn câu sai · lần #k". Lưới điều hướng chỉ gồm các câu sai, và mỗi ô ghi số câu đề gốc.
Nếu `attempt` không hợp lệ (dữ liệu đã bị xoá hoặc lần đó không có câu sai), trang báo rồi dẫn về Lịch sử.

**Màn kết quả thi thử** và **màn hoàn thành ôn tập** có thêm nút "Ôn N câu sai" và "Xem lịch sử".

## 6. Mã nguồn

- Logic thuần đặt trong `assets/core.js` và có test trong `tests/core.test.mjs`:
  - đọc/ghi và làm sạch lịch sử (bỏ các phần tử hỏng)
  - tạo một Attempt
  - tính câu sai của một Attempt theo đề hiện tại
  - đếm số lần làm và điểm cao nhất
  - kiểm tra mốc 7 ngày

  Các hàm này nhận `now` và storage làm tham số, để test không phụ thuộc vào đồng hồ thật.
- `quiz.js` thêm hai view `history` và `review`, ghi lượt ôn tập khi đủ câu, và khoá nút nộp khi chưa đủ.
- `home.js` hiện số lần làm và nút Lịch sử.
- Cả hai trang gọi kiểm tra 7 ngày trước khi đọc dữ liệu.
- Xây trên bố cục sidebar trái đã commit ở `0c90d20`, không ghi đè hay revert.
  Thay đổi đang làm dở thì giữ nguyên: sidebar rộng 320px, lưới 6 cột, và tiêu đề `.side-body .panel-head b` luôn một dòng (nowrap).
  Tiêu đề "Hoàn thành · đúng X/60" và "Câu sai của lần #k" phải vừa một dòng. View `review` dùng lại helper `layout({label, html}, body)` và được thêm vào `isSplit()`.
  Ô lưới khác câu hiện tại giữ `tabindex="-1"`, và giữ nguyên cơ chế `navOpen` trên mobile.
- Giữ phong cách giao diện hiện có (Đông Sơn, `app.css`). Toàn bộ chữ hiển thị là tiếng Việt và mọi nội dung câu hỏi đi qua `esc`.

## 7. Để người xây dựng tự quyết
- Bố cục chi tiết của trang Lịch sử và màn hoàn thành, miễn là theo phong cách sẵn có và dùng tốt ở bề rộng 360px.
- Định dạng ngày (đề xuất `dd/mm/yyyy`).
