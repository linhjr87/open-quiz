// Core quiz logic. Pure ES module: no imports, runs unchanged in browsers and Node.

export function resolveExamId(search, manifest) {
  const id = new URLSearchParams(search || '').get('exam');
  if (!id) return null;
  const exams = (manifest && manifest.exams) || [];
  return exams.some((e) => e.id === id) ? id : null;
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

export function storageKey(examId, mode) {
  return `mln131:${examId}:${mode}`;
}

// ---- Lịch sử làm bài ----

export const IDLE_RESET_MS = 604800000; // 7 ngày

const LAST_SEEN_KEY = 'mln131:lastSeen';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Xoá toàn bộ khoá `mln131:*` nếu đã quá 7 ngày không mở trang, rồi ghi lại lastSeen.
// Trả true nếu đã xoá. Mọi lỗi storage bị nuốt (trả false).
export function expireIfIdle(now, storage) {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    let last = null;
    const raw = st.getItem(LAST_SEEN_KEY);
    if (raw !== null && raw !== undefined) last = JSON.parse(raw);
    let wiped = false;
    if (typeof last === 'number' && Number.isFinite(last) && now - last > IDLE_RESET_MS) {
      const keys = [];
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (typeof k === 'string' && k.startsWith('mln131:')) keys.push(k);
      }
      for (const k of keys) st.removeItem(k);
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

export function formatDate(ms) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
