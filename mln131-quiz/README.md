# MLN131 Quiz

Trang web tĩnh để luyện các đề thi FE cũ môn **MLN131** (Chủ nghĩa xã hội khoa học). Mỗi đề gốc là một quiz riêng, gắn đúng mã đề (ví dụ `MLN131 · FA24 · B5-FE`), có hai chế độ:

- **Thi thử**: đếm ngược như phòng thi, không hiện đáp án cho tới khi nộp bài, chấm điểm trên thang 10.
- **Ôn tập**: làm từng câu, biết đúng/sai ngay, tiến độ lưu trong trình duyệt.

Trang chạy hoàn toàn ở phía trình duyệt (HTML + JS thuần, không backend, không bước build). Địa chỉ: https://linhjr87.github.io/open-quiz/

## Miễn trừ trách nhiệm

Đây là dự án **không chính thức**, không liên quan đến Trường Đại học FPT. Câu hỏi được chép từ ảnh đề và **đáp án có thể sai**. Hãy dùng làm tài liệu tham khảo, đối chiếu lại với giáo trình, đừng coi đáp án là chắc chắn đúng.

## Nhãn trạng thái của đáp án

Mỗi câu có một trong ba nhãn, cho biết đáp án được đối chiếu tới đâu:

| Nhãn | Ý nghĩa |
|---|---|
| `verified` (đã đối chiếu) | Đáp án do AI giải **trùng** với đáp án được nhiều người chọn nhất trong comment trên fuexam. Giao diện luôn hiện số phiếu để bạn tự đánh giá. |
| `disputed` (có tranh cãi) | AI và comment **lệch nhau**. Đáp án hiển thị là đáp án của AI, kèm cờ cảnh báo và đáp án theo comment. |
| `ai-only` (chỉ có AI) | Chưa có comment nào cho câu này, đáp án chỉ do AI giải và **chưa được đối chiếu**. |

## Đáp án đến từ đâu

1. **Chép đề (OCR):** Claude đọc trực tiếp từng ảnh câu hỏi, chép nguyên văn chữ và phương án. Việc đọc được làm **hai lượt độc lập**: lượt 1 chép chữ, lượt 2 do một lần chạy khác xem lại ảnh, so với bản chép và sửa chỗ lệch (chỗ nào sửa đều ghi vào `ocrNote`).
2. **Đáp án AI:** ở lượt 2, Claude đồng thời giải từng câu theo giáo trình, kết quả lưu ở `aiAnswer`.
3. **Đối chiếu với comment:** phiếu của người dùng trong comment trên [fuexam.me](https://fuexam.me) được tổng hợp rồi so với đáp án AI để ra nhãn trạng thái ở trên.

## Báo lỗi

Thấy câu hỏi chép sai hoặc đáp án sai, hãy mở một issue tại https://github.com/linhjr87/open-quiz/issues. Trên trang quiz, nút **Báo lỗi câu này** mở sẵn issue với mã đề và số câu.

## Thêm hoặc cập nhật một đề

Dữ liệu nằm trong `data/<id>.json` (id có dạng `<KỲ>-<MÃ>`, ví dụ `FA24-B5-FE`). Thêm đề chỉ cần thêm JSON và cập nhật manifest, không phải sửa code giao diện. Các lệnh dưới đây chạy từ thư mục `mln131-quiz/`.

1. **Lượt 1 (chép chữ):** đọc ảnh của đề (`MLN131/<KỲ>/<ĐỀ>/NNN.webp`, thứ tự theo tên file) và chép nguyên văn từng câu vào `data/<id>.json` theo schema: `n`, `text`, `options`, `pick`. Câu đọc không chắc thì ghi `ocrNote`.
2. **Lượt 2 (kiểm tra và giải):** một lượt độc lập xem lại ảnh, so với bản chép, sửa chỗ lệch (ghi vào `ocrNote`) và giải câu đó, điền `answer` và `aiAnswer`.
3. **Gộp comment:** tổng hợp phiếu từ fuexam (script `fuexam_answers.py` ở thư mục cha cho ra `answers_all.csv`), rồi gộp vào dữ liệu. Bước này cập nhật `commentVotes`, `commentAnswer`, `status`, `source` và dựng lại manifest:

   ```bash
   python -I tools/merge_comments.py --csv ../MLN131/answers_all.csv --mln ../MLN131
   # chỉ một đề: thêm --only FA24-B5-FE
   ```

4. **Dựng lại manifest** (`data/index.json`, trang chủ đọc file này):

   ```bash
   python -I tools/build_manifest.py
   ```

5. **Kiểm tra dữ liệu:**

   ```bash
   python -I tools/validate.py --check-manifest data/
   # đối chiếu số câu với số ảnh gốc trên máy:
   python -I tools/validate.py --images ../MLN131 data/
   # đề còn đang làm dở (chưa có đáp án): thêm --draft
   ```

   Validator kiểm tra số câu, phương án không rỗng, `answer` nằm trong `options`, `len(answer) == pick`, `status` hợp lệ và manifest khớp dữ liệu. Nó thoát với mã 1 nếu có lỗi. CI chạy bản không `--draft`, nên chỉ đề đã có đủ đáp án mới được đưa vào `data/`. CI cũng chạy `--check-manifest`: **luôn chạy `python -I tools/build_manifest.py` trước khi commit** (mỗi lần thêm hoặc sửa đề), nếu không `data/index.json` lệch dữ liệu và CI sẽ báo đỏ.

## Chạy kiểm thử

Từ thư mục `mln131-quiz/`:

```bash
node --test                                   # kiểm thử JS (cần Node 22 trở lên)
python -I -m unittest discover -s tools       # kiểm thử Python (stdlib)
```

Xem thử trang ở máy: `python -m http.server` trong `mln131-quiz/`, rồi mở `http://localhost:8000/`. Không mở thẳng bằng `file://` vì trang dùng `fetch` để đọc JSON.

## Triển khai lên GitHub Pages

Workflow `.github/workflows/pages.yml` (ở gốc repo) chạy khi push lên `main` hoặc bấm chạy tay (`workflow_dispatch`): chạy kiểm thử JS và Python, chạy validator, rồi đăng thư mục `mln131-quiz/` lên Pages.

Bật một lần: **Settings → Pages → Source = GitHub Actions**.

## Không bao giờ commit

- **Ảnh gốc** (`*.webp`, cùng thư mục `MLN131/`): chỉ nằm trên máy, repo không chứa ảnh.
- **`cookie.txt`**: chứa phiên đăng nhập fuexam, tuyệt đối không đưa lên repo.
- `comments.json`, `answers.md`: dữ liệu thô tải về, chỉ dùng cục bộ.

Các mục trên đã nằm trong `.gitignore`.
