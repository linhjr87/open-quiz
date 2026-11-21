# Lịch sử làm bài và Ôn câu sai — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu lịch sử các lần Ôn tập và Thi thử của mỗi đề trên trình duyệt, và cho ôn lại những câu sai của một lần làm cụ thể.

**Architecture:** Logic thuần (tạo lần làm, đọc/ghi lịch sử, tính câu sai, thống kê, xoá sau 7 ngày) nằm trong `assets/core.js` và có unit test. `quiz.js` thêm hai view `history` và `review`, ghi lần làm khi nộp bài thi thử hoặc khi ôn đủ câu, và khoá nút nộp khi còn câu trống. `home.js` hiện số lần làm và nút Lịch sử. Mọi dữ liệu nằm trong `localStorage` dưới tiền tố `mln131:`.

**Tech Stack:** HTML + ES modules thuần (Node 22+ cho `node --test`), không có dependency, không có bước build.

**Spec:**
- Chức năng: `mln131-quiz/docs/superpowers/specs/2026-11-22-lich-su-lam-bai-design.md`
- Giao diện, là nguồn chuẩn khi hai tài liệu lệch nhau: `mln131-quiz/docs/superpowers/specs/2026-11-22-lich-su-lam-bai-ui.md`
- Bản mẫu chạy được, là nguồn chuẩn cho markup và CSS: `mln131-quiz/design/prototype-lich-su.html`

Mọi đường dẫn bên dưới tính từ `mln131-quiz/`. Mọi lệnh chạy trong thư mục đó.

## Global Constraints

- Một lần làm là một lượt Ôn tập hoặc Thi thử đã trả lời **đủ toàn bộ câu của đề**. Ngoại lệ duy nhất: thi thử hết giờ thì bài tự nộp và vẫn tính là một lần làm, câu bỏ trống tính là sai.
- Ôn câu sai **không** phải là một lần làm. Lượt này không ghi lịch sử, không đổi số lần làm hay điểm cao nhất, và không lưu tiến độ.
- Không lưu thời gian làm bài. Không có Xuất/Nhập. Không giới hạn số lần lưu. Không có logic cắt bớt khi bộ nhớ đầy. Không hiện thông báo về việc tự xoá sau 7 ngày.
- Xoá sau 7 ngày: nếu `mln131:lastSeen` có giá trị và `now - lastSeen > 7 × 24 giờ` thì xoá mọi khoá bắt đầu bằng `mln131:`, sau đó ghi `lastSeen = now`. Việc này chạy trên cả trang chủ và trang quiz, **trước khi đọc bất kỳ dữ liệu nào khác**.
- Lịch sử: `mln131:<examId>:history` → `{ v: 1, attempts: [Attempt, ...] }`, cũ trước mới sau. Số thứ tự `#k` là vị trí (bắt đầu từ 1) trong `attempts`.
- `Attempt = { mode: "study" | "exam", at: <ms>, correct, total, score10?, auto?, responses: { "<n>": ["A"] } }`. `score10` chỉ có ở thi thử. `auto: true` chỉ có khi bài tự nộp do hết giờ.
- Câu sai được tính lại khi hiển thị, từ `responses` của lần làm và `answer` hiện tại của đề. `correct` và `score10` đã lưu thì giữ nguyên.
- Khoá `mln131:<id>:study` thêm trường tuỳ chọn `recorded: <k>`. Khoá `exam` và `best` vẫn được ghi như hiện nay.
- Chữ trên giao diện là tiếng Việt. Mọi chuỗi lấy từ dữ liệu (`text`, `options`) phải đi qua `esc`. Không thêm màu mới, chỉ dùng token có sẵn trong `app.css`.
- Xây trên bố cục sidebar đã commit (`0c90d20`, `3740ecc`), không ghi đè hay revert. Giữ nguyên: sidebar rộng 320px, lưới 6 cột, `.side-body .panel-head b` luôn một dòng. Các ô lưới khác câu hiện tại giữ `tabindex="-1"`, và giữ cơ chế `navOpen`.
- Kiểm tra: `node --test` phải xanh. Không push: push lên `main` sẽ deploy, nên phải hỏi chủ dự án trước.

## Review Focus

1. **Tải lại trang sau khi ôn xong đủ câu không được ghi thêm lần làm.** Tiến độ `study.recorded` phải chặn việc ghi lặp. *(Task 4, bước kiểm tra thủ công 4.)*
2. **Thi thử hết giờ khi trang đang đóng, rồi mở lại.** Đường boot `remaining() <= 0 → submit(true)` phải ghi đúng **một** lần làm có `auto: true`. Đồng hồ không được gọi `submit` lặp lại. *(Task 3, bước 3.)*
3. **URL `mode=review&attempt=` hỏng** (không phải số, bằng 0, vượt quá số lần làm, hoặc lần đó không có câu sai): trang hiện thông báo kèm nút về Lịch sử, không được crash. *(Task 2, bước 4.)*
4. **`localStorage` bị hỏng** (JSON lỗi, `attempts` không phải mảng, phần tử rác): trang vẫn chạy, các phần tử rác bị bỏ qua. *(Task 1, test `sanitizeHistory`.)*
5. **Mốc 7 ngày:** đúng 7 ngày thì không xoá. Không có `lastSeen` thì không xoá. Khoá không có tiền tố `mln131:` thì không bị đụng tới. *(Task 1, test `expireIfIdle`.)*

---

### Task 1: Logic lịch sử trong `core.js`

**Files:**
- Modify: `assets/core.js` (thêm các export ở cuối file)
- Test: `tests/core.test.mjs`

**Interfaces:**
- Consumes: `isCorrect`, `scoreExam`, `loadState`, `saveState`, `storageKey` (đã có).
- Produces, dùng ở Task 2–5:
  - `IDLE_RESET_MS = 604800000`
  - `expireIfIdle(now: number, storage = globalThis.localStorage) -> boolean`: trả `true` nếu đã xoá dữ liệu. Nuốt mọi lỗi và khi đó trả `false`.
  - `sanitizeHistory(raw: any) -> { v: 1, attempts: Attempt[] }`
  - `loadHistory(examId: string) -> { v: 1, attempts: Attempt[] }`
  - `appendAttempt(examId: string, attempt: Attempt) -> number`: trả `k` của lần mới (độ dài mới của `attempts`).
  - `makeAttempt(mode: 'study'|'exam', questions, responses, now: number, auto = false) -> Attempt`
  - `wrongOf(attempt: Attempt, questions) -> number[]`: danh sách `n`, theo thứ tự `questions`.
  - `historyStats(history) -> { exams: number, studies: number, best: number|null }`
  - `formatDate(ms: number) -> string`: dạng `dd/mm/yyyy` theo giờ máy.

- [ ] **Step 1: Write the failing tests** trong `tests/core.test.mjs`

Thêm các hàm mới vào câu import. `fakeStorage` hiện thiếu `length`, `key` và `removeItem`; mở rộng nó (nhưng vẫn tương thích với các test cũ) bằng getter `length`, `key(i) => Object.keys(data)[i] ?? null` và `removeItem(k) => delete data[k]`.

```js
const qs3 = [
  { n: 1, options: { A: '', B: '' }, answer: ['A'] },
  { n: 2, options: { A: '', B: '' }, answer: ['B'] },
  { n: 3, options: { A: '', B: '', C: '' }, answer: ['A', 'C'] },
];
const DAY = 86400000;

test('expireIfIdle wipes only mln131: keys after more than 7 days idle', () => {
  const st = fakeStorage({ 'mln131:lastSeen': String(0), 'mln131:X:history': '{}', 'other:key': '1' });
  assert.equal(expireIfIdle(7 * DAY + 1, st), true);
  assert.deepEqual(Object.keys(st.data).sort(), ['mln131:lastSeen', 'other:key']);
  assert.equal(JSON.parse(st.data['mln131:lastSeen']), 7 * DAY + 1);
});
test('expireIfIdle keeps data at exactly 7 days and when lastSeen is missing', () => {
  const a = fakeStorage({ 'mln131:lastSeen': '0', 'mln131:X:study': '{}' });
  assert.equal(expireIfIdle(7 * DAY, a), false);
  assert.ok('mln131:X:study' in a.data);
  const b = fakeStorage({ 'mln131:X:study': '{}' });
  assert.equal(expireIfIdle(123, b), false);
  assert.ok('mln131:X:study' in b.data);
  assert.equal(JSON.parse(b.data['mln131:lastSeen']), 123);
});
test('expireIfIdle returns false when storage throws', () => {
  const bad = { get length() { throw new Error('x'); }, getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(expireIfIdle(1, bad), false);
});
test('makeAttempt: exam carries score10 and auto only when auto', () => {
  const r = { 1: ['A'], 2: ['A'] }; // 1 right, 2 wrong, 3 blank
  assert.deepEqual(makeAttempt('exam', qs3, r, 5, true),
    { mode: 'exam', at: 5, correct: 1, total: 3, score10: 3.33, auto: true, responses: { 1: ['A'], 2: ['A'] } });
  assert.equal('auto' in makeAttempt('exam', qs3, r, 5), false);
  const s = makeAttempt('study', qs3, { 1: ['A'], 2: ['B'], 3: ['A', 'C'] }, 9);
  assert.deepEqual(s, { mode: 'study', at: 9, correct: 3, total: 3, responses: { 1: ['A'], 2: ['B'], 3: ['A', 'C'] } });
});
test('makeAttempt copies responses (later mutation does not leak)', () => {
  const r = { 1: ['A'] };
  const a = makeAttempt('study', qs3, r, 1);
  r[1].push('B');
  assert.deepEqual(a.responses[1], ['A']);
});
test('wrongOf uses the current answer key; blanks are wrong; order follows questions', () => {
  const a = { mode: 'exam', responses: { 3: ['A', 'C'], 1: ['B'] } };
  assert.deepEqual(wrongOf(a, qs3), [1, 2]);
  const fixed = qs3.map((q) => (q.n === 1 ? { ...q, answer: ['B'] } : q));
  assert.deepEqual(wrongOf(a, fixed), [2]);
});
test('sanitizeHistory drops junk and keeps valid attempts in order', () => {
  const ok1 = { mode: 'study', at: 1, correct: 2, total: 3, responses: {} };
  const ok2 = { mode: 'exam', at: 2, correct: 1, total: 3, score10: 3.33, responses: { 1: ['A'] } };
  const raw = { v: 1, attempts: [ok1, null, 'x', { mode: 'quiz', at: 1, correct: 0, total: 1, responses: {} },
    { mode: 'exam', at: 3, correct: 1, total: 3, responses: {} } /* exam without score10 */,
    { mode: 'study', at: 4, correct: 5, total: 3, responses: {} } /* correct > total */, ok2] };
  assert.deepEqual(sanitizeHistory(raw), { v: 1, attempts: [ok1, ok2] });
  for (const junk of [null, 'x', [], { attempts: 'no' }]) assert.deepEqual(sanitizeHistory(junk), { v: 1, attempts: [] });
});
test('appendAttempt returns the new 1-based k and loadHistory reads it back', () => {
  withLocalStorage({ value: fakeStorage() }, () => {
    const a = makeAttempt('study', qs3, {}, 1);
    assert.equal(appendAttempt('E', a), 1);
    assert.equal(appendAttempt('E', a), 2);
    assert.equal(loadHistory('E').attempts.length, 2);
    assert.deepEqual(loadHistory('missing'), { v: 1, attempts: [] });
  });
});
test('historyStats counts modes and takes the best exam score', () => {
  const h = { v: 1, attempts: [
    { mode: 'exam', score10: 7 }, { mode: 'study' }, { mode: 'exam', score10: 8.5 }, { mode: 'study' }, { mode: 'study' }] };
  assert.deepEqual(historyStats(h), { exams: 2, studies: 3, best: 8.5 });
  assert.deepEqual(historyStats({ v: 1, attempts: [] }), { exams: 0, studies: 0, best: null });
});
test('formatDate is dd/mm/yyyy', () => {
  assert.equal(formatDate(new Date(2026, 10, 2).getTime()), '02/11/2026');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL, because the new exports are missing from `core.js`.

- [ ] **Step 3: Implement the exports in `assets/core.js`**

- `expireIfIdle`: đọc `mln131:lastSeen` qua `storage.getItem` rồi `JSON.parse`. Nếu là số hữu hạn và `now - last > IDLE_RESET_MS`, gom các khoá `mln131:*` (duyệt `storage.length` / `storage.key(i)`) rồi mới `removeItem`, vì xoá ngay trong lúc duyệt sẽ làm lệch chỉ số. Cuối cùng `setItem('mln131:lastSeen', JSON.stringify(now))`. Toàn bộ bọc trong try/catch.
- `sanitizeHistory`: giữ một phần tử khi nó là object thường và thoả đủ các điều kiện:
  - `mode` thuộc `study` hoặc `exam`
  - `at` là số hữu hạn
  - `total` là số nguyên dương
  - `correct` là số nguyên trong khoảng `0..total`
  - `responses` là object thường, không phải mảng
  - với `exam`, `score10` là số hữu hạn
- `makeAttempt`: `correct` và `score10` lấy từ `scoreExam`. Copy sâu từng mảng trong `responses`. Thứ tự khoá đúng như trong test.
- `wrongOf`: `questions.filter((q) => !isCorrect(q, responses[q.n] || [])).map((q) => q.n)`.
- `loadHistory` / `appendAttempt` dùng `storageKey(id, 'history')` cùng với `loadState` / `saveState`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS. Toàn bộ test, gồm 19 test cũ, phải xanh.

- [ ] **Step 5: Commit**

```bash
git add assets/core.js tests/core.test.mjs
git commit -m "core: attempt history, wrong-question recompute, 7-day idle reset"
```

---

### Task 2: CSS, icon, view Lịch sử và Ôn câu sai

**Files:**
- Modify: `assets/app.css` (thêm vào cuối file)
- Modify: `assets/icons.js`
- Modify: `assets/quiz.js`

**Interfaces:**
- Consumes từ Task 1: `loadHistory`, `wrongOf`, `historyStats`, `formatDate`.
- Produces:
  - URL `quiz.html?exam=<id>&mode=history` và `quiz.html?exam=<id>&mode=review&attempt=<k>`
  - `topbar(title, sub, right = '', back = 'home')` (`back` nhận `'home'` hoặc `'history'`)
  - helper `modeChip(mode)` và `doneCard({eyebrow, ok, total, note, acts})`, dùng lại ở Task 3 và Task 4
  - icon `history`, `target`

- [ ] **Step 1: Add the CSS and icons**

- Chép nguyên khối `/* history, completion card, review */` (từ dòng đó tới trước `</style>`) trong `design/prototype-lich-su.html` vào cuối `assets/app.css`.
  - Bỏ hai rule đã có sẵn trong `app.css` là `.bar .btn{white-space:nowrap;padding:0 12px}` và `.iconbtn{flex:none}`, nếu chúng trùng hoàn toàn.
  - Không sửa các rule `.layout` hay `.side-body`.
- Thêm `history` và `target` vào `assets/icons.js`, lấy đúng path trong bản mẫu (các dòng `history:` và `target:`).

- [ ] **Step 2: Implement routing and the History view in `assets/quiz.js`**

- `MODE` nhận một trong `exam`, `history`, `review`. Mọi giá trị khác thành `study`.
- `view` thêm hai giá trị `history` và `review`, và `isSplit()` thêm `'review'`.
- `topbar` thêm tham số `back`:
  - `'history'` → `href="quiz.html?exam=<id>&mode=history"`, `aria-label="Về lịch sử"`
  - mặc định giữ như cũ (về trang chủ)
- `renderHistory()` dựng đúng theo UI spec §3 và hàm `renderHistory` trong bản mẫu:
  - ba ô tổng kết lấy từ `historyStats`
  - danh sách `#k`, mới nhất ở trên, mỗi dòng có chip chế độ, `formatDate(at)`, dòng kết quả và thanh `.mini`
  - nút "Ôn N câu sai" (N = `wrongOf(...).length`) dẫn tới `mode=review&attempt=k`. N = 0 thì hiện "Không sai câu nào".
  - ghi chú "Lịch sử chỉ lưu trên trình duyệt này."
  - hàng nút Ôn tập / Thi thử
  - trạng thái trống theo UI spec §3
- Dòng kết quả:
  - thi thử: `<score10 .toFixed(2)> điểm · đúng <correct>/<total>`, thêm ` · hết giờ, tự nộp` khi có `auto`
  - ôn tập: `đúng <correct>/<total>`

- [ ] **Step 3: Implement the Review view**

- State, không lưu xuống storage: `review = { k, attempt, ns: number[], i, responses: {}, draft: [] }`, với `ns = wrongOf(attempt, QS)`.
- Dựng `renderReview()` bằng `layout()`, theo UI spec §5 và `renderReview` trong bản mẫu. Gồm:
  - topbar có back về Lịch sử
  - ô lưới ghi số câu đề gốc, `aria-label="Câu <n> đề gốc, vẫn sai"` khi trả lời sai
  - `.side-meta` và `.side-note`
  - không hiện lại đáp án đã chọn ở lần trước (không có `.prev-pick`); sau khi chọn chỉ hiện như Ôn tập
  - nhãn nút thu gọn trên mobile `Câu sai i/Y · đúng x/done`
  - khi làm hết: `doneCard` "XONG ÔN CÂU SAI · LẦN #k" với hai nút [Ôn lại] (primary) và [Về lịch sử]
- Cách chọn đáp án giống Ôn tập: một đáp án thì khoá ngay, nhiều đáp án thì có nút Kiểm tra. Bàn phím: A–D, Enter, ←/→.
  - Viết helper dùng chung giữa `renderStudy` và `renderReview` cho phần nút phương án và khối `after`, thay vì chép lại code.
  - Đổi tên data-act cho view review (ví dụ `rpick`, `rcheck`, `rgo`, `rprev`, `rnext`, `rAgain`) để không lẫn với study.
- "Ôn lại" đặt `review.responses = {}`, `i = 0`.

- [ ] **Step 4: Handle an invalid `attempt`**

Lần làm không hợp lệ khi:
- `attempt` không phải số nguyên
- `attempt` < 1 hoặc > `attempts.length`
- `wrongOf(...)` rỗng

Khi đó hiện `.notice` "Không tìm thấy lần làm này" kèm nút về Lịch sử (bọc trong topbar và footer như các view khác). Kiểm tra thủ công các URL: `attempt=abc`, `attempt=0`, `attempt=99`, và một lần làm đúng hết.

- [ ] **Step 5: Verify in a browser**

Chạy `python -m http.server 8000` rồi mở `http://localhost:8000/`. Nạp dữ liệu mẫu từ console:

```js
localStorage.setItem('mln131:FA24-FE:history', JSON.stringify({v:1,attempts:[
  {mode:'exam',at:Date.now()-2*864e5,correct:42,total:60,score10:7,auto:true,responses:{1:['A'],2:['B']}},
  {mode:'study',at:Date.now(),correct:60,total:60,responses:{}}]}))
```

Với dữ liệu này, lần #2 có `responses:{}` nên `wrongOf` sẽ trả cả 60 câu. Đó là dữ liệu dùng để thử, không phải lỗi.

Kiểm tra:
- `?exam=FA24-FE&mode=history` hiện đúng bố cục.
- `?exam=FA24-FE&mode=review&attempt=1` ôn được, lưới ghi số câu đề gốc, nút back về Lịch sử.
- Ở 360px và 1366px không có thanh cuộn ngang.
- `node --test` vẫn xanh.

Headless Chrome qua CDP cũng được.

- [ ] **Step 6: Commit**

```bash
git add assets/app.css assets/icons.js assets/quiz.js
git commit -m "quiz: history view and wrong-question review mode"
```

---

### Task 3: Thi thử — khoá nộp bài, ghi lần làm, màn kết quả

**Files:**
- Modify: `assets/quiz.js` (`renderExamStart`, `renderExam`, `submit`, `renderResult`, phần controller)

**Interfaces:**
- Consumes: `makeAttempt`, `appendAttempt` (Task 1); `modeChip`, icon `target` / `history` (Task 2).
- Produces: `exam.k` (số thứ tự lần làm vừa ghi).

- [ ] **Step 1: Lock submit until every question is answered**

- Khi `answered < N`, nút `Nộp bài` trên topbar có `disabled` và `aria-describedby="submitHint"`.
- Ngay dưới `.nav` ở cột phải thêm `.submit-hint#submitHint` theo UI spec §6:
  - còn câu trống: "Còn N câu chưa làm · làm đủ mới nộp được" + nút `Đến câu chưa làm ›` (`data-act="nextBlank"`). Nút này tìm câu chưa trả lời kế tiếp theo vòng tròn, bắt đầu **sau** `exam.i`, trong `exam.order`.
  - đã đủ: lớp `ok`, "✓ Đã làm đủ N câu, có thể nộp bài."
- Hộp xác nhận: "Nộp bài? Bạn đã làm hết N câu." và thêm " K câu đang đánh dấu xem lại." khi có câu được đánh dấu.
- `askSubmit` và `submit(false)` không làm gì khi chưa đủ câu. Đây là lớp chặn thứ hai, phòng khi phím hoặc DOM bị can thiệp.
- Dòng luật trên màn bắt đầu: "Phải làm đủ các câu mới nộp được. Hết giờ bài tự nộp, câu bỏ trống tính là sai."

- [ ] **Step 2: Record the attempt in `submit(auto)`**

Ngay sau khi tính `exam.result`, và trước khi xoá khoá `exam`:

```js
exam.k = appendAttempt(DATA.id, makeAttempt('exam', QS, exam.responses, Date.now(), auto))
```

Khoá `best` vẫn cập nhật như cũ. Cờ `exam.submitted` có sẵn đã chặn việc gọi lặp. Không thêm đường ghi nào khác.

- [ ] **Step 3: Verify the timeout path records exactly once**

1. Bắt đầu thi 1 phút, làm 2 câu, đóng tab.
2. Đợi quá 1 phút rồi mở lại `?exam=FA24-FE&mode=exam`.
3. Màn kết quả phải có "hết giờ, tự nộp", và `loadHistory` chỉ có thêm **đúng 1** lần làm, với `auto: true`.
4. Để trang kết quả mở thêm vài giây: số lần làm không được tăng.

- [ ] **Step 4: Result screen per UI spec §7**

- Dòng thống kê thêm dòng thứ hai "Lần #k · đã lưu vào lịch sử".
- Hàng nút đặt ngay dưới meter và lặp lại ở cuối danh sách câu sai:
  - [Ôn N câu sai] (primary, icon `target`, dẫn tới `mode=review&attempt=k`; chỉ hiện khi N > 0)
  - [Thi lại] (thành primary khi N = 0)
  - [Xem lịch sử] (icon `history`)
  - [Ôn tập đề này] (ghost)

- [ ] **Step 5: Verify**

- `node --test` xanh.
- Trong trình duyệt:
  - Nộp bài bị khoá khi còn câu trống.
  - "Đến câu chưa làm" nhảy đúng theo vòng tròn.
  - Nộp đủ câu thì có lần #k mới trong Lịch sử.
  - Nút Ôn câu sai mở đúng các câu sai.
  - Ở 360px, chữ trên nút topbar không xuống dòng.

- [ ] **Step 6: Commit**

```bash
git add assets/quiz.js
git commit -m "quiz: exam requires all answers, records attempts, result links to review/history"
```

---

### Task 4: Ôn tập — ghi lần làm khi đủ câu, thẻ hoàn thành

**Files:**
- Modify: `assets/quiz.js` (`loadStudy`, `saveStudy`, `renderStudy`, `studyPick`, `studyCheck`, phần controller)

**Interfaces:**
- Consumes: `makeAttempt`, `appendAttempt` (Task 1); `doneCard` (Task 2).
- Produces: `study.recorded: number | undefined`.

- [ ] **Step 1: Persist `recorded`**

- `loadStudy` đọc `recorded` khi đó là số nguyên ≥ 1.
- `saveStudy` chỉ ghi `recorded` khi có giá trị.
- Cả "Làm lại" (`doResetStudy`) và "Lượt mới" (`data-act="newRound"`, không cần hộp xác nhận) đều đặt lại state về `{ i: 0, responses: {}, draft: [], confirmReset: false }` và không còn `recorded`.

- [ ] **Step 2: Record once when the last blank question is answered**

- Viết helper `maybeRecordStudy()` và gọi nó sau `studyPick` và `studyCheck`.
  - Điều kiện: `!study.recorded` và `Object.keys(study.responses).length === N`.
  - Khi thoả: `study.recorded = appendAttempt(DATA.id, makeAttempt('study', QS, study.responses, Date.now()))`, sau đó `saveStudy()`, đặt `focusNext = '#doneCard'` và cuộn lên đầu trang.
- Phải gọi helper này sau `focusAfterAnswer`, để `focusNext` cuối cùng là `#doneCard`.

- [ ] **Step 3: Completion card and sidebar per UI spec §4**

- Khi có `study.recorded`, chèn `doneCard` ở đầu cột phải, phía trên câu hỏi:
  - eyebrow "HOÀN THÀNH LƯỢT ÔN · LẦN #k"
  - số đúng X/N
  - ghi chú "câu đúng · đã lưu vào lịch sử"
  - các nút: [Ôn N câu sai] (primary, chỉ khi có câu sai), [Lượt mới] (thành primary khi không có câu sai), [Xem lịch sử]
- Panel-head trong sidebar ghi "Hoàn thành · đúng X/N" và ẩn nút "Làm lại".
- Dòng hint của câu đổi thành "Xem lại đáp án".

- [ ] **Step 4: Verify**

1. Nạp sẵn 59 câu bằng console, để dành câu 60:

   ```js
   localStorage.setItem('mln131:FA24-FE:study', JSON.stringify({i:59,responses:Object.fromEntries([...Array(59)].map((_,i)=>[i+1,['A']]))}))
   ```

2. Mở `?exam=FA24-FE&mode=study` rồi trả lời câu 60. Thẻ hoàn thành phải hiện, nhận focus, và Lịch sử có thêm 1 lần.
3. Tải lại trang: thẻ vẫn hiện, nhưng số lần làm **không** tăng.
4. Bấm Lượt mới: tiến độ về 0, thẻ biến mất.
5. Chạy `node --test`: phải xanh.

- [ ] **Step 5: Commit**

```bash
git add assets/quiz.js
git commit -m "quiz: record completed study rounds once; completion card"
```

---

### Task 5: Trang chủ và mốc 7 ngày

**Files:**
- Modify: `assets/home.js`
- Modify: `assets/quiz.js` (`main()`)
- Modify: `../CLAUDE.md` (đoạn mô tả `quiz.js`)

**Interfaces:**
- Consumes: `expireIfIdle`, `loadHistory`, `historyStats` (Task 1).

- [ ] **Step 1: Call the 7-day reset first**

Gọi `expireIfIdle(Date.now())` ở dòng đầu của `main()` trong cả `home.js` và `quiz.js`, trước mọi lệnh đọc storage, kể cả trước khi `fetch`.

- [ ] **Step 2: Exam row per UI spec §2**

- Dòng phụ, theo thứ tự:
  1. `N câu`
  2. số câu tranh cãi (nếu có)
  3. phần thi thử:
     - `Thi thử N lần · Cao nhất X.XX` khi `exams > 0`
     - `Cao nhất X.XX` khi chỉ có khoá `best` cũ
     - ngược lại `Chưa thi thử`
  4. `Ôn tập N lần` (chỉ khi N > 0)

  Điểm cao nhất bằng `max(best cũ, historyStats.best)`, bỏ qua các giá trị null.
- Nút `<a class="btn hist-btn" aria-label="Lịch sử làm bài">` gồm icon `history` và `<span class="lbl">Lịch sử</span>`, dẫn tới `mode=history`. Nút này đặt trước Ôn tập / Thi thử và chỉ hiện khi `attempts.length > 0`.

- [ ] **Step 3: Update `CLAUDE.md`**

Trong đoạn `quiz.js` của `../CLAUDE.md`, thêm hai chế độ `mode=history` và `mode=review&attempt=<k>`, khoá `mln131:<id>:history`, và cơ chế xoá sau 7 ngày (`mln131:lastSeen`).

- [ ] **Step 4: Verify**

- Chạy `node --test`: phải xanh.
- Trong trình duyệt:
  - Đề có lịch sử hiện số lần làm và nút Lịch sử. Ở 360px nút chỉ còn icon, ba nút vừa một hàng.
  - Đặt `mln131:lastSeen` về `Date.now() - 8*864e5` rồi tải lại: mọi khoá `mln131:*` bị xoá.
  - Đặt `Date.now() - 6*864e5`: dữ liệu vẫn còn.

- [ ] **Step 5: Commit**

```bash
git add assets/home.js assets/quiz.js ../CLAUDE.md
git commit -m "home: attempt counts and history link; 7-day idle reset on both pages"
```
