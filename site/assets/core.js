// Core quiz logic. Pure ES module: no imports, runs unchanged in browsers and Node.

export function resolveExamId(search, manifest) {
  const id = new URLSearchParams(search || '').get('exam');
  if (!id) return null;
  const exams = (manifest && manifest.exams) || [];
  return exams.some((e) => e.id === id) ? id : null;
}

// Mã môn từ `?subject=`, chỉ nhận môn có trong subjects.json. Link cũ (trước khi có nhiều môn)
// không có `subject` nên mặc định là MLN131.
export const LEGACY_SUBJECT = 'MLN131';
export function resolveSubject(search, subjects) {
  const code = new URLSearchParams(search || '').get('subject') || LEGACY_SUBJECT;
  const list = (subjects && subjects.subjects) || [];
  return list.find((s) => s && s.code === code) || null;
}

export function isCorrect(q, picked) {
  if (!Array.isArray(picked)) return false;
  if (!Array.isArray(q.answer) || q.answer.length === 0) return false;
  const want = new Set(q.answer);
  const got = new Set(picked);
  if (want.size !== got.size) return false;
  for (const l of want) if (!got.has(l)) return false;
  return true;
}

export function scoreExam(questions, responses) {
  const total = questions.length;
  const wrong = [];
  let correct = 0;
  for (const q of questions) {
    if (isCorrect(q, (responses || {})[q.n] || [])) correct++;
    else wrong.push(q.n);
  }
  const score10 = total === 0 ? 0 : Math.round((correct / total) * 10 * 100) / 100;
  return { correct, total, score10, wrong };
}

export function sanitizeResponses(questions, raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const q of questions) {
    const v = raw[q.n];
    if (!Array.isArray(v)) continue;
    const options = q.options || {};
    const letters = v.filter((l) => typeof l === 'string' && Object.hasOwn(options, l));
    if (letters.length) out[q.n] = [...new Set(letters)];
  }
  return out;
}

export function loadState(key, fallback) {
  try {
    const s = globalThis.localStorage.getItem(key);
    if (s === null || s === undefined) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: ignore
  }
}

export function formatTime(sec) {
  const n = Number(sec);
  const s = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// "D 1 · A 1": the whole comment-vote distribution, highest count first,
// the AI's key first among equal counts, then alphabetical. '' when there are no votes.
export function formatVotes(votes, aiKey) {
  if (!votes || typeof votes !== 'object' || Array.isArray(votes)) return '';
  const entries = Object.entries(votes).filter(([, n]) => typeof n === 'number' && Number.isFinite(n));
  entries.sort(([ka, na], [kb, nb]) =>
    nb - na || (kb === aiKey) - (ka === aiKey) || (ka < kb ? -1 : ka > kb ? 1 : 0));
  return entries.map(([k, n]) => `${k} ${n}`).join(' · ');
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(arr, seed) {
  const out = [...arr];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Mọi khoá localStorage của site bắt đầu bằng PREFIX. `examKey` là `<MÔN>/<id đề>`
// (ví dụ `MLN131/FA24-FE`) vì cùng một id đề có thể có ở nhiều môn.
export const PREFIX = 'foq:';
export const LEGACY_PREFIX = 'mln131:';

export const examKey = (subject, examId) => `${subject}/${examId}`;

export function storageKey(key, mode) {
  return `${PREFIX}${key}:${mode}`;
}

const storageKeys = (st) => {
  const keys = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (typeof k === 'string') keys.push(k);
  }
  return keys;
};

// Chuyển dữ liệu của bản cũ (chỉ có MLN131, khoá `mln131:<id>:<mode>` và `mln131:lastSeen`)
// sang khoá mới `foq:MLN131/<id>:<mode>` và `foq:lastSeen`. Chỉ chép khi khoá mới chưa có,
// chép xong mới xoá khoá cũ. Trả số khoá đã chuyển; mọi lỗi storage bị nuốt.
export function migrateLegacy(storage) {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    let moved = 0;
    for (const k of storageKeys(st)) {
      if (!k.startsWith(LEGACY_PREFIX)) continue;
      const rest = k.slice(LEGACY_PREFIX.length);
      const target = rest === 'lastSeen' ? LAST_SEEN_KEY : `${PREFIX}${LEGACY_SUBJECT}/${rest}`;
      const value = st.getItem(k);
      if (st.getItem(target) === null && value !== null) {
        st.setItem(target, value);
        moved++;
      }
      st.removeItem(k);
    }
    return moved;
  } catch {
    return 0;
  }
}

// ---- Lịch sử làm bài ----

export const IDLE_RESET_MS = 604800000; // 7 ngày

const LAST_SEEN_KEY = `${PREFIX}lastSeen`;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Xoá toàn bộ khoá `foq:*` nếu đã quá 7 ngày không mở trang, rồi ghi lại lastSeen.
// Trả true nếu đã xoá. Mọi lỗi storage bị nuốt (trả false).
export function expireIfIdle(now, storage) {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    let last = null;
    const raw = st.getItem(LAST_SEEN_KEY);
    if (raw !== null && raw !== undefined) {
      try { last = JSON.parse(raw); } catch { last = null; } // hỏng: coi như chưa có, ghi lại bên dưới
    }
    let wiped = false;
    if (typeof last === 'number' && Number.isFinite(last) && now - last > IDLE_RESET_MS) {
      for (const k of storageKeys(st)) if (k.startsWith(PREFIX)) st.removeItem(k);
      wiped = true;
    }
    st.setItem(LAST_SEEN_KEY, JSON.stringify(now));
    return wiped;
  } catch {
    return false;
  }
}

function validAttempt(a) {
  if (!isPlainObject(a)) return false;
  if (a.mode !== 'study' && a.mode !== 'exam') return false;
  if (typeof a.at !== 'number' || !Number.isFinite(a.at)) return false;
  if (!Number.isInteger(a.total) || a.total <= 0) return false;
  if (!Number.isInteger(a.correct) || a.correct < 0 || a.correct > a.total) return false;
  if (!isPlainObject(a.responses)) return false;
  if (a.mode === 'exam' && !(typeof a.score10 === 'number' && Number.isFinite(a.score10))) return false;
  return true;
}

export function sanitizeHistory(raw) {
  const attempts = isPlainObject(raw) && Array.isArray(raw.attempts) ? raw.attempts.filter(validAttempt) : [];
  return { v: 1, attempts };
}

export function loadHistory(examId) {
  return sanitizeHistory(loadState(storageKey(examId, 'history'), null));
}

// Trả k (1-based) của lần làm mới = độ dài mới của attempts.
export function appendAttempt(examId, attempt) {
  const h = loadHistory(examId);
  h.attempts.push(attempt);
  saveState(storageKey(examId, 'history'), h);
  return h.attempts.length;
}

export function makeAttempt(mode, questions, responses, now, auto = false) {
  const { correct, total, score10 } = scoreExam(questions, responses);
  const copy = {};
  for (const [n, v] of Object.entries(responses || {})) if (Array.isArray(v)) copy[n] = [...v];
  const attempt = { mode, at: now, correct, total };
  if (mode === 'exam') attempt.score10 = score10;
  if (auto) attempt.auto = true;
  attempt.responses = copy;
  return attempt;
}

// Số câu sai (theo đáp án hiện tại), theo thứ tự `questions`; câu bỏ trống tính là sai.
export function wrongOf(attempt, questions) {
  const responses = (attempt && attempt.responses) || {};
  return questions.filter((q) => !isCorrect(q, responses[q.n] || [])).map((q) => q.n);
}

export function historyStats(history) {
  let exams = 0;
  let studies = 0;
  let best = null;
  for (const a of (history && history.attempts) || []) {
    if (a.mode === 'exam') {
      exams++;
      if (typeof a.score10 === 'number' && (best === null || a.score10 > best)) best = a.score10;
    } else if (a.mode === 'study') studies++;
  }
  return { exams, studies, best };
}

// Điểm cao nhất của một đề: khoá cũ `best` (trước khi có lịch sử) gộp với điểm thi thử cao nhất
// trong lịch sử. null khi chưa có điểm nào.
export function bestOf(examId, history) {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const legacy = loadState(storageKey(examId, 'best'), null);
  const hist = historyStats(history).best;
  const vals = [legacy, hist].filter(isNum);
  return vals.length ? Math.max(...vals) : null;
}

// Các đề có lịch sử, mới làm gần nhất trước: [{ subject, examId, k, attempt }] với attempt là
// lần làm cuối của đề đó và k là số thứ tự (1-based) của nó. Dùng cho "Tiếp tục ôn" ở trang chủ.
export function recentAttempts(limit = 3, storage) {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    const out = [];
    for (const k of storageKeys(st)) {
      const m = /^foq:([^/:]+)\/([^:]+):history$/.exec(k);
      if (!m) continue;
      let raw = null;
      try { raw = JSON.parse(st.getItem(k)); } catch { raw = null; }
      const { attempts } = sanitizeHistory(raw);
      if (!attempts.length) continue;
      out.push({ subject: m[1], examId: m[2], k: attempts.length, attempt: attempts[attempts.length - 1] });
    }
    out.sort((a, b) => b.attempt.at - a.attempt.at);
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

export function formatDate(ms) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Keyboard answer: a letter key (any case) or a digit 1..n picks the n-th option.
// Returns the option letter, or null when the key does not map to an option.
export function keyToLetter(key, letters) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  const up = key.toUpperCase();
  if (letters.includes(up)) return up;
  if (up >= '1' && up <= '9') return letters[Number(up) - 1] ?? null;
  return null;
}
