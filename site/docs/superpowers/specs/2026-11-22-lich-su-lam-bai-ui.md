# Lịch sử làm bài và ôn câu sai — Thiết kế giao diện

Ngày: 2026-11-22 · Bổ sung cho `2026-11-22-lich-su-lam-bai-design.md` (mục 5 và 7)

Bản mẫu chạy được: `design/prototype-lich-su.html` (mở trực tiếp bằng trình duyệt, 5 câu, có sẵn 3 lần làm mẫu).
Bản mẫu là nguồn chuẩn cho markup và CSS. Các mục dưới đây tóm tắt những gì cần giữ khi chuyển sang `quiz.js`, `home.js` và `app.css`.

## 1. Nguyên tắc chung

- Giữ phong cách Đông Sơn hiện có và các token màu trong `app.css`. Không thêm màu mới.
- Màn có lưới câu (Ôn tập, Thi thử, **Ôn câu sai**) dùng helper `layout({label, html}, body)`: sidebar trái, cột phải là câu hỏi. Thêm `'review'` vào `isSplit()`.
- Màn một cột (Lịch sử, Kết quả, Bắt đầu thi) dùng `.wrap` 760px như hiện nay.
- Chip chế độ: `Thi thử` dùng màu accent (patina), `Ôn tập` dùng màu bronze. Dùng nhất quán ở mọi nơi.
- Ngày hiển thị `dd/mm/yyyy` bằng font mono.
- Icon mới thêm vào `icons.js`: `history` (đồng hồ có mũi tên quay lại) và `target` (ba vòng tròn đồng tâm, dùng cho "Ôn N câu sai"). Path SVG lấy trong bản mẫu.

## 2. Trang chủ (`home.js`)

```
FA24 · B5-FE
60 câu · ⚠ 2 câu tranh cãi · Thi thử 3 lần · Cao nhất 8.50 · Ôn tập 2 lần
[⟲ Lịch sử]  [Ôn tập]  [Thi thử]
```
- Dòng phụ: khi chưa thi thử lần nào vẫn ghi "Chưa thi thử". "Ôn tập N lần" chỉ hiện khi N > 0.
- Nút `Lịch sử` (`.btn.hist-btn`, icon `history`, `aria-label="Lịch sử làm bài"`) chỉ hiện khi đề đã có ít nhất một lần làm. Đặt nó trước hai nút còn lại.
- Ở bề rộng ≤ 480px, nút Lịch sử chỉ còn icon trong ô 44×44 (`.lbl` bị ẩn). Hai nút còn lại vẫn chia đều chiều ngang. Ba nút có chữ sẽ không vừa ở 360px.

## 3. Trang Lịch sử (`mode=history`)

Topbar: tên đề, dòng phụ "Lịch sử làm bài". Nút back về trang chủ.

1. **Ba ô tổng kết** (`.hist-sum` > `.tile` ×3): Thi thử `N lần` · Cao nhất `8.50 /10 điểm` (chưa thi thì ghi `—` và "chưa thi thử") · Ôn tập `N lần`.
2. **Tiêu đề** "Các lần làm · mới nhất ở trên".
3. **Danh sách** `<ol class="list hist">`, mỗi lần là `li.row.hrow`:
   - trái: `#k` (mono, màu muted)
   - giữa: chip chế độ + ngày; dòng kết quả (thi thử: `7.00 điểm · đúng 42/60 · hết giờ, tự nộp`; ôn tập: `đúng 51/60`); thanh `.mini` cao 4px, xanh là phần đúng và đỏ là phần sai
   - phải: nút `Ôn N câu sai` (icon `target`) với N tính lại theo đáp án hiện tại. Nếu không có câu sai thì hiện chữ xanh "✓ Không sai câu nào" thay cho nút.
   - ≤ 480px: nút xuống dòng và chiếm hết chiều ngang.
4. Ghi chú nhỏ "Lịch sử chỉ lưu trên trình duyệt này." Không nhắc tới việc tự xoá sau 7 ngày, theo spec.
5. Hàng nút cuối trang: `Ôn tập` · `Thi thử` (primary).
- **Trống:** dùng `.notice` với tiêu đề "Chưa có lần làm nào", câu "Làm đủ 60 câu ở Ôn tập hoặc Thi thử thì lần làm được lưu ở đây, trên trình duyệt này.", và hai nút Ôn tập / Thi thử.

## 4. Ôn tập: thẻ hoàn thành

Không chuyển sang màn mới. Khi trả lời câu cuối còn trống thì ghi lần làm, rồi đặt **thẻ hoàn thành** (`section.done-card#doneCard`) ở **đầu cột phải**. Câu hỏi vẫn nằm bên dưới, nên người học xem lại được mọi câu qua lưới.
```
HOÀN THÀNH LƯỢT ÔN · LẦN #4
51/60  câu đúng · đã lưu vào lịch sử
[==========xanh==========|==đỏ==]
[◎ Ôn 9 câu sai] [⟲ Lượt mới] [Xem lịch sử]
```
- Nút primary là `Ôn N câu sai`. Nếu không sai câu nào thì nút đó biến mất và `Lượt mới` trở thành primary.
- Sau lần render ghi nhận: focus `#doneCard` (`tabindex="-1"`) và cuộn lên đầu trang.
- Khi đã hoàn thành: panel-head trong sidebar ghi "Hoàn thành · đúng X/60", ẩn nút "Làm lại" (đã có "Lượt mới"). Dòng hint của câu đổi thành "Xem lại đáp án".
- Tải lại trang sau khi đã hoàn thành: vẫn hiện thẻ này (tiến độ `study` vẫn đủ câu). Nhớ không ghi lần làm thêm lần nữa: cần lưu cờ đã ghi hoặc số lần `k` cùng với tiến độ.

## 5. Ôn câu sai (`mode=review&attempt=k`)

Dùng `layout()` như Ôn tập. Khác biệt:
- Topbar: dòng phụ "Ôn câu sai · lần #k", bên phải là `done/Y`. **Nút back dẫn về Lịch sử** (`aria-label="Về lịch sử"`), không về trang chủ.
- Sidebar:
  - panel-head "Câu sai của lần #k" và `Y câu`
  - dòng `.side-meta`: chip chế độ + ngày của lần đó
  - lưới chỉ gồm câu sai, **ô ghi số câu đề gốc** (`aria-label="Câu 12 đề gốc, vẫn sai"`)
  - chú thích: Đúng / **Vẫn sai** / Chưa làm
  - ghi chú `.side-note`: "Số trên ô là số câu trong đề gốc. Lượt ôn này không lưu tiến độ và không tính vào lịch sử."
- Nhãn nút thu gọn trên mobile: `Câu sai i/Y · đúng x/done`.
- Đầu câu: `Câu 12` cùng hint "đề gốc · câu sai 3/18 · phím A–D".
- Sau khi chọn chỉ hiện như Ôn tập: verdict, badge và Báo lỗi. **Không** hiện lại đáp án đã chọn ở lần trước (chủ dự án yêu cầu).
- Làm hết thì hiện thẻ hoàn thành ở đầu cột phải: "XONG ÔN CÂU SAI · LẦN #k", `X/Y câu đúng · lượt này không lưu vào lịch sử`, hai nút [⟲ Ôn lại] (primary) và [Về lịch sử].
- `attempt` không hợp lệ: dùng `.notice` "Không tìm thấy lần làm này" kèm nút về Lịch sử.

## 6. Thi thử: khoá nộp bài

- Nút `Nộp bài` trên topbar có `disabled` và `aria-describedby="submitHint"` khi còn câu trống. Cần `.bar .btn{white-space:nowrap}` (đã có) để không xuống dòng ở 360px.
- Ngay dưới hàng nút Câu trước / Câu sau ở cột phải có thanh `.submit-hint`. Đặt ở cột phải chứ không phải sidebar, vì sidebar bị thu gọn trên mobile.
  - còn trống: `⚠ Còn 3 câu chưa làm · làm đủ mới nộp được` + nút `Đến câu chưa làm ›`. Nút này nhảy tới câu trống kế tiếp theo vòng tròn, bắt đầu sau câu hiện tại.
  - đủ câu: nền xanh nhạt, "✓ Đã làm đủ 60 câu, có thể nộp bài."
- Hộp xác nhận chỉ còn: "Nộp bài? Bạn đã làm hết 60 câu. N câu đang đánh dấu xem lại."
- Màn bắt đầu: đổi dòng luật thành "Phải làm đủ các câu mới nộp được. Hết giờ bài tự nộp, câu bỏ trống tính là sai."

## 7. Kết quả thi thử

- Dòng thống kê thêm dòng thứ hai: "Lần #k · đã lưu vào lịch sử".
- Hàng nút đặt **ngay dưới thanh meter** và lặp lại ở cuối danh sách câu sai: [◎ Ôn N câu sai] (primary), [Thi lại], [⟲ Xem lịch sử], [Ôn tập đề này] (ghost). Nếu không sai câu nào thì `Thi lại` là primary.

## 8. CSS cần thêm

Lấy nguyên khối `/* history, completion card, review */` ở cuối `<style>` trong `design/prototype-lich-su.html`. Khối này gồm các class `.chip`, `.c-exam`, `.c-study`, `.hist-sum`, `.tile`, `.hrow`, `.hnum`, `.mini`, `.allok`, `.done-card`, `.side-meta`, `.side-note`, `.submit-hint`, `.hist-btn` và media query ≤ 480px. Các giá trị đều dùng token có sẵn.

## 9. Kiểm tra trước khi xong

- Ở 360px và 1366px: không có thanh cuộn ngang, chữ trên nút topbar không xuống dòng, nút cao tối thiểu 44px.
- Bàn phím: focus thấy rõ trên thẻ hoàn thành. Trong lưới Ôn câu sai, chỉ ô hiện tại nằm trong thứ tự Tab, ←/→ chuyển câu, A–D chọn đáp án.
- Mọi chuỗi lấy từ dữ liệu (`text`, `options`) đều đi qua `esc`.
