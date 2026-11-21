import {
  resolveExamId, isCorrect, scoreExam, sanitizeResponses,
  loadState, saveState, formatTime, shuffled, storageKey, formatVotes,
  loadHistory, wrongOf, historyStats, formatDate, makeAttempt, appendAttempt,
} from './core.js';
import { ic, drumSvg, esc } from './icons.js';

const REPO = 'linhjr87/open-quiz';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const MODE = ['exam', 'history', 'review'].includes(params.get('mode')) ? params.get('mode') : 'study';

let DATA = null;       // exam JSON
let QS = [];           // questions
let N = 0;
let view = 'study';    // study | examStart | exam | result | history | review
let study = { i: 0, responses: {}, draft: [], confirmReset: false };
let HIST = { v: 1, attempts: [] }; // attempt history of this exam
let review = null;     // {k, attempt, ns, i, responses, draft}; not persisted
let exam = null;       // {i, responses, flags:Set, order, endAt, minutes, submitted, confirm, auto, result}
let tick = null;
let focusNext = null; // selector to focus after the next render
let navOpen = false;  // question list expanded (narrow screens only)
let scrollTop = false; // scroll the window to the top after the next render

const qByN = (n) => QS.find((q) => q.n === n);
const letters = (q) => Object.keys(q.options || {});
const pickOf = (q) => (Number.isInteger(q.pick) && q.pick > 0 ? q.pick : (q.answer || []).length || 1);
const examTitle = () => (DATA.term && DATA.code ? `${DATA.term} · ${DATA.code}` : DATA.title || DATA.id);

/* ---------- small helpers ---------- */
const isSplit = () => view === 'study' || view === 'exam' || (view === 'review' && !!review);
function badge(q) {
  const aiKey = [...(q.aiAnswer || q.answer || [])].sort().join('');
  const dist = esc(formatVotes(q.commentVotes, aiKey));
  if (q.status === 'verified') {
    return `<span class="badge b-ok">${ic('shield')}Đã đối chiếu${dist ? ` · ${dist}` : ''}</span>`;
  }
  if (q.status === 'disputed') {
    const ca = Array.isArray(q.commentAnswer) ? q.commentAnswer.join('') : '';
    return `<span class="badge b-warn">${ic('warn')}Có tranh cãi · comment chọn ${esc(ca || '?')}${dist ? ` · ${dist}` : ''}</span>`;
  }
  return `<span class="badge b-ai">${ic('cpu')}Đáp án AI, chưa đối chiếu</span>`;
}
function reportLink(q) {
  const title = encodeURIComponent(`[${DATA.id}] Câu ${q.n}: `);
  return `<a class="report" href="https://github.com/${REPO}/issues/new?title=${title}" target="_blank" rel="noopener">${ic('msg')}Báo lỗi câu này</a>`;
}
function quizFoot() {
  return `<footer class="wrap${isSplit() ? ' wide' : ''} foot">Không chính thức — đáp án có thể sai · <a href="https://github.com/${REPO}/issues" target="_blank" rel="noopener">Báo lỗi</a></footer>`;
}
const modeUrl = (mode, extra = '') => `quiz.html?exam=${encodeURIComponent(DATA.id)}&amp;mode=${mode}${extra}`;
function topbar(title, sub, right = '', back = 'home') {
  const href = back === 'history' ? modeUrl('history') : 'index.html';
  return `<header class="bar"><div class="wrap${isSplit() ? ' wide' : ''}">
    <a class="iconbtn" href="${href}" aria-label="${back === 'history' ? 'Về lịch sử' : 'Về trang chủ'}">${ic('back')}</a>
    <div class="bar-title"><b>${esc(title)}</b><span>${esc(sub)}</span></div>
    <div class="spacer"></div>${right}</div></header>`;
}
function answerLines(q, ls) {
  return ls.map((l) => `<span class="v"><b>${esc(l)}.</b> ${esc((q.options || {})[l])}</span>`).join('');
}
function hintStudy(q) {
  const p = pickOf(q), ls = letters(q);
  return `Chọn ${p} đáp án · phím ${esc(ls[0] || 'A')}–${esc(ls[ls.length - 1] || 'D')}${p > 1 ? ' để chọn/bỏ chọn' : ''}`;
}
function toggleIn(arr, k) {
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
}
// Question list in a left sidebar (collapsible on narrow screens). Only the
// current cell is in the tab order; arrow keys move between questions.
function layout(side, body) {
  return `<div class="wrap wide layout">
    <aside class="side${navOpen ? ' open' : ''}" aria-label="Danh sách câu">
      <button class="btn side-toggle" data-act="toggleNav" aria-expanded="${navOpen}" aria-controls="qnav">${ic('grid')}<span>${side.label}</span><span class="spacer"></span>${ic(navOpen ? 'up' : 'down')}</button>
      <section class="panel side-body" id="qnav">${side.html}</section>
    </aside>
    <main class="main">${body}</main>
  </div>`;
}
const modeChip = (mode) => (mode === 'exam'
  ? `<span class="chip c-exam">${ic('clock')}Thi thử</span>`
  : `<span class="chip c-study">${ic('book')}Ôn tập</span>`);
function meter(ok, bad, total) {
  const t = total || 1;
  return `<div class="meter" aria-hidden="true"><i style="width:${(ok / t) * 100}%;background:var(--ok)"></i><i style="width:${(bad / t) * 100}%;background:var(--bad)"></i></div>`;
}
// Completion card shown at the top of the right column once every question
// in the round is answered. Answers stay reviewable underneath.
function doneCard({ eyebrow, ok, total, note, acts }) {
  return `<section class="done-card" id="doneCard" tabindex="-1" aria-labelledby="doneTitle">
    <div class="eyebrow" id="doneTitle">${eyebrow}</div>
    <div class="score"><div class="big">${ok}<small>/${total}</small></div><div class="stat">${note}</div></div>
    ${meter(ok, total - ok, total)}
    <div class="acts">${acts}</div></section>`;
}
// Option buttons + the block under them, shared by Ôn tập and Ôn câu sai.
// `locked` is the committed answer (or undefined), `draft` the multi-pick selection.
function optButtons(q, locked, draft, act) {
  const multi = pickOf(q) > 1;
  const sel = locked || draft;
  let opts = '';
  for (const k of letters(q)) {
    let cls = 'opt', s = '', pressed = '';
    if (locked) {
      if ((q.answer || []).includes(k)) { cls += ' right'; s = ic('check'); }
      else if (locked.includes(k)) { cls += ' wrong'; s = ic('x'); }
      else cls += ' dim';
    } else if (multi) {
      pressed = ` aria-pressed="${sel.includes(k)}"`;
      if (sel.includes(k)) cls += ' sel';
    }
    opts += `<button class="${cls}" data-act="${act}" data-k="${esc(k)}"${pressed} ${locked ? 'disabled' : ''}><span class="k">${esc(k)}</span><span class="t">${esc(q.options[k])}</span><span class="s">${s}</span></button>`;
  }
  return opts;
}
function afterBlock(q, locked, draft, checkAct) {
  const p = pickOf(q);
  if (locked) {
    const ok = isCorrect(q, locked);
    return `<div class="after" aria-live="polite">
      <span class="verdict ${ok ? 'ok' : 'bad'}" tabindex="-1">${ok ? `${ic('check')}Chính xác` : `${ic('x')}Chưa đúng · đáp án ${esc((q.answer || []).join(', '))}`}</span>
      ${badge(q)}${reportLink(q)}</div>`;
  }
  if (p > 1) {
    return `<div class="after"><button class="btn primary" data-act="${checkAct}" ${draft.length === p ? '' : 'disabled'}>${ic('check')}Kiểm tra</button><span class="q-hint">Đã chọn ${draft.length}/${p}</span>${reportLink(q)}</div>`;
  }
  return `<div class="after">${reportLink(q)}</div>`;
}
// Pick / check on a {responses, draft} round. Returns true when an answer got locked.
function roundPick(st, q, k) {
  if (st.responses[q.n] || !letters(q).includes(k)) return false;
  if (pickOf(q) > 1) { st.draft = toggleIn(st.draft, k); return false; }
  st.responses[q.n] = [k];
  return true;
}
function roundCheck(st, q) {
  if (st.responses[q.n] || st.draft.length !== pickOf(q)) return false;
  st.responses[q.n] = [...st.draft];
  st.draft = [];
  return true;
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/* ---------- persistence ---------- */
function loadStudy() {
  const raw = loadState(storageKey(DATA.id, 'study'), null);
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const i = Number.isInteger(obj.i) && obj.i >= 0 && obj.i < N ? obj.i : 0;
  const responses = sanitizeResponses(QS, obj.responses);
  const st = { i, responses, draft: [], confirmReset: false };
  // `recorded` = history number of this round; only meaningful while the round is complete.
  if (Number.isInteger(obj.recorded) && obj.recorded >= 1 && Object.keys(responses).length === N) st.recorded = obj.recorded;
  return st;
}
function saveStudy() {
  const out = { i: study.i, responses: study.responses };
  if (study.recorded) out.recorded = study.recorded;
  saveState(storageKey(DATA.id, 'study'), out);
}
const freshStudy = () => ({ i: 0, responses: {}, draft: [], confirmReset: false });
function loadExam() {
  const raw = loadState(storageKey(DATA.id, 'exam'), null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { endAt, order, flags, minutes } = raw;
  if (typeof endAt !== 'number' || !Number.isFinite(endAt)) return null;
  if (!Array.isArray(order) || order.length !== N) return null;
  const seen = new Set(order);
  if (seen.size !== N || !order.every((x) => Number.isInteger(x) && x >= 0 && x < N)) return null;
  if (flags !== undefined && !Array.isArray(flags)) return null;
  const validN = new Set(QS.map((q) => q.n));
  const i = Number.isInteger(raw.i) && raw.i >= 0 && raw.i < N ? raw.i : 0;
  return {
    i, order, endAt,
    minutes: typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : 60,
    responses: sanitizeResponses(QS, raw.responses),
    flags: new Set((flags || []).filter((n) => validN.has(n))),
    submitted: false, confirm: false, auto: false, result: null,
  };
}
function saveExam() {
  if (!exam || exam.submitted) return;
  saveState(storageKey(DATA.id, 'exam'), {
    endAt: exam.endAt, responses: exam.responses, flags: [...exam.flags],
    order: exam.order, minutes: exam.minutes, i: exam.i,
  });
}

/* ---------- study ---------- */
function renderStudy() {
  const q = QS[study.i];
  const locked = study.responses[q.n];
  const opts = optButtons(q, locked, study.draft, 'pick');
  const after = afterBlock(q, locked, study.draft, 'check');
  const done = Object.keys(study.responses).length;
  const resetConfirm = study.confirmReset ? `<div class="confirm" role="alert"><p><b>Làm lại từ đầu?</b> ${done ? `Toàn bộ ${done} câu đã làm sẽ bị xoá.` : 'Tiến độ sẽ được đặt lại.'}</p>
     <div class="acts"><button class="btn primary" data-act="doResetStudy">Làm lại</button><button class="btn" data-act="cancelReset">Huỷ</button></div></div>` : '';
  const correct = QS.filter((x) => study.responses[x.n] && isCorrect(x, study.responses[x.n])).length;
  const complete = !!study.recorded && done === N;
  const wrongN = N - correct;
  const card = complete ? doneCard({
    eyebrow: `Hoàn thành lượt ôn · lần #${study.recorded}`, ok: correct, total: N, note: 'câu đúng · đã lưu vào lịch sử',
    acts: (wrongN ? `<a class="btn primary" href="${modeUrl('review', `&amp;attempt=${study.recorded}`)}">${ic('target')}Ôn ${wrongN} câu sai</a>` : '') +
      `<button class="btn${wrongN ? '' : ' primary'}" data-act="newRound">${ic('reset')}Lượt mới</button><a class="btn ghost" href="${modeUrl('history')}">${ic('history')}Xem lịch sử</a>`,
  }) : '';
  const cells = QS.map((x, i) => {
    const r = study.responses[x.n];
    let c = 'cell';
    if (r) c += isCorrect(x, r) ? ' right' : ' wrong';
    if (i === study.i) c += ' cur';
    return `<button class="${c}" data-act="go" data-i="${i}" aria-label="Câu ${esc(x.n)}${r ? (isCorrect(x, r) ? ', đúng' : ', sai') : ''}"${i === study.i ? ' aria-current="true"' : ' tabindex="-1"'}>${esc(x.n)}</button>`;
  }).join('');
  return topbar(examTitle(), 'Ôn tập', `<span class="mono" style="font-size:14px;color:var(--muted)">${done}/${N}</span>`) +
  `<div class="progress"><i style="width:${(done / N) * 100}%"></i></div>` +
  layout({
    label: `Câu ${esc(q.n)}/${N} · đúng ${correct}/${done}`,
    html: `<div class="panel-head"><b>${complete ? `Hoàn thành · đúng ${correct}/${N}` : `Đúng ${correct}/${done} câu đã làm`}</b>${complete ? '' : `<button class="btn ghost" data-act="resetStudy">${ic('reset')}Làm lại</button>`}</div>
      ${complete ? '' : resetConfirm}
      <div class="grid">${cells}</div>
      <div class="keys"><span><i class="sw" style="background:var(--ok-weak);border-color:var(--ok)"></i>Đúng</span><span><i class="sw" style="background:var(--bad-weak);border-color:var(--bad);border-style:dashed"></i>Sai</span><span><i class="sw"></i>Chưa làm</span></div>`,
  }, `${card}
    <article class="q">
      <div class="q-head"><span class="q-num">Câu ${esc(q.n)}/${N}</span><span class="q-hint">${complete ? 'Xem lại đáp án' : hintStudy(q)}</span></div>
      <p class="q-text">${esc(q.text)}</p>
      <div class="opts">${opts}</div>${after}
    </article>
    <div class="nav">
      <button class="btn" data-act="prev" ${study.i === 0 ? 'disabled' : ''}>${ic('left')}Câu trước</button>
      <button class="btn primary" data-act="next" ${study.i === N - 1 ? 'disabled' : ''}>Câu sau${ic('right')}</button>
    </div>`);
}
function studyGo(i) {
  study.i = Math.max(0, Math.min(N - 1, i));
  study.draft = [];
  study.confirmReset = false;
  saveStudy();
}
function studyPick(k) {
  if (roundPick(study, QS[study.i], k)) saveStudy();
}
// Option buttons become disabled once answered, so focus would drop to <body>:
// move it on to "Câu sau", or to the verdict on the last question.
function focusAfterAnswer(q) {
  if (study.responses[q.n]) focusNext = study.i === N - 1 ? '.verdict' : '[data-act="next"]';
}
function studyCheck() {
  if (roundCheck(study, QS[study.i])) saveStudy();
}
// Once every question has an answer, write one history entry for the round
// and show the completion card. Call after focusAfterAnswer so the card wins focus.
function maybeRecordStudy() {
  if (study.recorded || Object.keys(study.responses).length !== N) return;
  study.recorded = appendAttempt(DATA.id, makeAttempt('study', QS, study.responses, Date.now()));
  HIST = loadHistory(DATA.id);
  saveStudy();
  focusNext = '#doneCard';
  scrollTop = true;
}

/* ---------- history ---------- */
function renderHistory() {
  const title = examTitle();
  const modeActs = `<a class="btn" href="${modeUrl('study')}">${ic('book')}Ôn tập</a><a class="btn primary" href="${modeUrl('exam')}">${ic('clock')}Thi thử</a>`;
  if (!HIST.attempts.length) {
    return topbar(title, 'Lịch sử làm bài') + `<main class="wrap"><div class="notice"><h1>Chưa có lần làm nào</h1>
    <p>Làm đủ ${N} câu ở Ôn tập hoặc Thi thử thì lần làm được lưu ở đây, trên trình duyệt này.</p>
    <div class="acts-inline">${modeActs}</div></div></main>`;
  }
  const st = historyStats(HIST);
  const rows = HIST.attempts.map((a, idx) => ({ a, k: idx + 1 })).reverse().map(({ a, k }) => {
    const wrong = wrongOf(a, QS).length;
    const res = a.mode === 'exam'
      ? `<b class="mono">${a.score10.toFixed(2)}</b> điểm · đúng ${a.correct}/${a.total}${a.auto ? ' · hết giờ, tự nộp' : ''}`
      : `đúng <b class="mono">${a.correct}/${a.total}</b>`;
    return `<li class="row hrow"><span class="hnum mono" aria-label="Lần ${k}">#${k}</span>
      <div class="meta"><div class="hl">${modeChip(a.mode)}<span class="date mono">${formatDate(a.at)}</span></div>
        <div class="hres">${res}</div>
        <div class="mini" aria-hidden="true"><i style="width:${(a.correct / a.total) * 100}%;background:var(--ok)"></i><i style="width:${((a.total - a.correct) / a.total) * 100}%;background:var(--bad)"></i></div></div>
      <div class="acts">${wrong ? `<a class="btn" href="${modeUrl('review', `&amp;attempt=${k}`)}">${ic('target')}Ôn ${wrong} câu sai</a>` : `<span class="allok">${ic('check')}Không sai câu nào</span>`}</div></li>`;
  }).join('');
  return topbar(title, 'Lịch sử làm bài') + `<main class="wrap">
    <div class="hist-sum">
      <div class="tile"><span>Thi thử</span><b>${st.exams}</b><small>lần</small></div>
      <div class="tile"><span>Cao nhất</span><b>${st.best == null ? '—' : st.best.toFixed(2)}</b><small>${st.best == null ? 'chưa thi thử' : '/10 điểm'}</small></div>
      <div class="tile"><span>Ôn tập</span><b>${st.studies}</b><small>lần</small></div>
    </div>
    <h2 class="sec">Các lần làm <span class="q-hint">· mới nhất ở trên</span></h2>
    <ol class="list hist">${rows}</ol>
    <p class="hist-note">Lịch sử chỉ lưu trên trình duyệt này.</p>
    <div class="row-acts">${modeActs}</div>
  </main>`;
}

/* ---------- review wrong answers ---------- */
// Returns null when `attempt` is not a valid 1-based index or has no wrong answers.
function startReview(raw) {
  const k = /^\d+$/.test(raw || '') ? Number(raw) : NaN;
  if (!Number.isInteger(k) || k < 1 || k > HIST.attempts.length) return null;
  const attempt = HIST.attempts[k - 1];
  const ns = wrongOf(attempt, QS);
  if (!ns.length) return null;
  return { k, attempt, ns, i: 0, responses: {}, draft: [] };
}
const reviewQ = () => qByN(review.ns[review.i]);
const reviewDone = () => review.ns.filter((n) => review.responses[n]).length;
function renderReviewMissing() {
  return topbar(examTitle(), 'Ôn câu sai', '', 'history') + `<main class="wrap"><div class="notice"><h1>Không tìm thấy lần làm này</h1>
    <p>Lần làm này không có trong lịch sử trên trình duyệt này, hoặc không còn câu sai nào để ôn.</p>
    <a class="btn primary" href="${modeUrl('history')}">${ic('history')}Về lịch sử</a></div></main>`;
}
function renderReview() {
  if (!review) return renderReviewMissing();
  const { k, attempt, ns } = review;
  const Y = ns.length;
  const q = reviewQ();
  const locked = review.responses[q.n];
  const done = reviewDone();
  const correct = ns.filter((n) => review.responses[n] && isCorrect(qByN(n), review.responses[n])).length;
  const ls = letters(q);
  const cells = ns.map((n, i) => {
    const x = qByN(n), r = review.responses[n];
    let c = 'cell';
    if (r) c += isCorrect(x, r) ? ' right' : ' wrong';
    if (i === review.i) c += ' cur';
    return `<button class="${c}" data-act="rgo" data-i="${i}" aria-label="Câu ${esc(n)} đề gốc${r ? (isCorrect(x, r) ? ', đúng' : ', vẫn sai') : ''}"${i === review.i ? ' aria-current="true"' : ' tabindex="-1"'}>${esc(n)}</button>`;
  }).join('');
  const card = done === Y ? doneCard({
    eyebrow: `Xong ôn câu sai · lần #${k}`, ok: correct, total: Y, note: 'câu đúng · lượt này không lưu vào lịch sử',
    acts: `<button class="btn primary" data-act="rAgain">${ic('reset')}Ôn lại</button><a class="btn" href="${modeUrl('history')}">${ic('history')}Về lịch sử</a>`,
  }) : '';
  return topbar(examTitle(), `Ôn câu sai · lần #${k}`, `<span class="mono" style="font-size:14px;color:var(--muted)">${done}/${Y}</span>`, 'history') +
  `<div class="progress"><i style="width:${(done / Y) * 100}%"></i></div>` +
  layout({
    label: `Câu sai ${review.i + 1}/${Y} · đúng ${correct}/${done}`,
    html: `<div class="panel-head"><b>Câu sai của lần #${k}</b><span class="q-hint">${Y} câu</span></div>
      <p class="side-meta">${modeChip(attempt.mode)}<span class="date mono">${formatDate(attempt.at)}</span></p>
      <div class="grid">${cells}</div>
      <div class="keys"><span><i class="sw" style="background:var(--ok-weak);border-color:var(--ok)"></i>Đúng</span><span><i class="sw" style="background:var(--bad-weak);border-color:var(--bad);border-style:dashed"></i>Vẫn sai</span><span><i class="sw"></i>Chưa làm</span></div>
      <p class="side-note">Số trên ô là số câu trong đề gốc. Lượt ôn này không lưu tiến độ và không tính vào lịch sử.</p>`,
  }, `${card}
    <article class="q">
      <div class="q-head"><span class="q-num">Câu ${esc(q.n)}</span><span class="q-hint">đề gốc · câu sai ${review.i + 1}/${Y} · phím ${esc(ls[0] || 'A')}–${esc(ls[ls.length - 1] || 'D')}</span></div>
      <p class="q-text">${esc(q.text)}</p>
      <div class="opts">${optButtons(q, locked, review.draft, 'rpick')}</div>${afterBlock(q, locked, review.draft, 'rcheck')}
    </article>
    <div class="nav">
      <button class="btn" data-act="rprev" ${review.i === 0 ? 'disabled' : ''}>${ic('left')}Câu trước</button>
      <button class="btn primary" data-act="rnext" ${review.i === Y - 1 ? 'disabled' : ''}>Câu sau${ic('right')}</button>
    </div>`);
}
function reviewGo(i) {
  review.i = Math.max(0, Math.min(review.ns.length - 1, i));
  review.draft = [];
}
// After locking an answer: jump to the done card when the round is complete,
// otherwise move focus on like Ôn tập does.
function reviewAfterAnswer(locked) {
  if (!locked) return;
  if (reviewDone() === review.ns.length) { focusNext = '#doneCard'; scrollTop = true; }
  else focusNext = review.i === review.ns.length - 1 ? '.verdict' : '[data-act="rnext"]';
}

/* ---------- exam ---------- */
function renderExamStart() {
  return topbar(examTitle(), 'Thi thử') + `<main class="wrap" style="padding-block:28px 48px">
    <div class="eyebrow">Thi thử</div><h1 style="font-size:28px">Sẵn sàng vào phòng thi</h1>
    <form class="card" id="startForm">
      <div class="field"><label for="mins">Thời gian<small>Đề FE thật: 60 phút</small></label><span><input class="num" id="mins" type="number" min="1" max="180" value="60"> <span style="color:var(--muted)">phút</span></span></div>
      <div class="field"><label for="shuf">Xáo trộn thứ tự câu<small>Tắt để làm đúng thứ tự đề gốc</small></label><span class="switch"><input id="shuf" type="checkbox"><span></span></span></div>
      <button class="btn primary" style="width:100%;margin-top:12px" type="submit">${ic('clock')}Bắt đầu · ${N} câu</button>
      <ul class="rules"><li>Không hiện đáp án cho tới khi nộp bài.</li><li>Phải làm đủ các câu mới nộp được. Hết giờ bài tự nộp, câu bỏ trống tính là sai.</li><li>Tải lại trang không mất bài đang làm.</li></ul>
    </form></main>`;
}
const answeredCount = () => Object.keys(exam.responses).length;
// Next unanswered question after the current one, wrapping around in exam.order; -1 when none.
function nextBlank() {
  for (let s = 1; s <= N; s++) {
    const j = (exam.i + s) % N;
    if (!exam.responses[QS[exam.order[j]].n]) return j;
  }
  return -1;
}
const remaining = () => Math.max(0, Math.round((exam.endAt - Date.now()) / 1000));
function renderExam() {
  const q = QS[exam.order[exam.i]];
  const sel = exam.responses[q.n] || [];
  const p = pickOf(q);
  const answered = Object.keys(exam.responses).length;
  const r = remaining();
  let opts = '';
  for (const k of letters(q)) {
    opts += `<button class="opt${sel.includes(k) ? ' sel' : ''}" data-act="epick" data-k="${esc(k)}" aria-pressed="${sel.includes(k)}"><span class="k">${esc(k)}</span><span class="t">${esc(q.options[k])}</span></button>`;
  }
  const cells = exam.order.map((qi, i) => {
    const x = QS[qi];
    let c = 'cell';
    if (exam.responses[x.n]) c += ' done';
    if (exam.flags.has(x.n)) c += ' flag';
    if (i === exam.i) c += ' cur';
    return `<button class="${c}" data-act="ego" data-i="${i}" aria-label="Câu ${i + 1}${exam.responses[x.n] ? ', đã làm' : ''}${exam.flags.has(x.n) ? ', cần xem lại' : ''}"${i === exam.i ? ' aria-current="true"' : ' tabindex="-1"'}>${i + 1}</button>`;
  }).join('');
  const left = N - answered, flagged = exam.flags.size;
  // Submit unlocks only when every question is answered; time-out is the one exception (submit(true)).
  const hint = left
    ? `<div class="submit-hint" id="submitHint">${ic('warn')}<span>Còn <b>${left}</b> câu chưa làm · làm đủ mới nộp được</span><button class="btn" data-act="nextBlank">Đến câu chưa làm${ic('right')}</button></div>`
    : `<div class="submit-hint ok">${ic('check')}<span>Đã làm đủ ${N} câu, có thể nộp bài.</span></div>`;
  const confirm = exam.confirm && !left ? `<div class="confirm" role="alert"><p><b>Nộp bài?</b> Bạn đã làm hết ${N} câu.${flagged ? ` ${flagged} câu đang đánh dấu xem lại.` : ''}</p>
     <div class="acts"><button class="btn primary" data-act="submit">Nộp bài</button><button class="btn" data-act="cancelSubmit">Làm tiếp</button></div></div>` : '';
  return topbar(examTitle(), `Thi thử · đã làm ${answered}/${N}`,
    `<span class="timer${r < 300 ? ' low' : ''}" id="timer" aria-live="off">${ic('clock')}${formatTime(r)}</span><button class="btn primary" data-act="askSubmit"${left ? ' disabled aria-describedby="submitHint"' : ''}>Nộp bài</button>`) +
  `<div class="progress"><i style="width:${(answered / N) * 100}%"></i></div>` +
  layout({
    label: `Câu ${exam.i + 1}/${N} · đã làm ${answered}${flagged ? ` · ${flagged} xem lại` : ''}`,
    html: `<div class="panel-head"><b>Danh sách câu</b><span class="q-hint">${answered}/${N} đã làm</span></div>
      <div class="grid">${cells}</div>
      <div class="keys"><span><i class="sw" style="background:var(--accent-weak);border-color:var(--accent)"></i>Đã làm</span><span><i class="sw" style="background:var(--warn);border-color:var(--warn)"></i>Xem lại</span><span><i class="sw"></i>Chưa làm</span></div>`,
  }, `
    <article class="q">
      <div class="q-head"><span class="q-num">Câu ${exam.i + 1}/${N}</span><span class="q-hint">(Choose ${p} answer${p > 1 ? 's' : ''}) · Chọn ${p} đáp án · phím ${esc(letters(q)[0] || 'A')}–${esc(letters(q)[letters(q).length - 1] || 'D')}</span><span class="spacer"></span>
        <button class="btn flagbtn${exam.flags.has(q.n) ? ' on' : ''}" data-act="flag" aria-pressed="${exam.flags.has(q.n)}">${ic('flag')}Xem lại</button></div>
      <p class="q-text">${esc(q.text)}</p>
      <div class="opts">${opts}</div>
    </article>
    <div class="nav">
      <button class="btn" data-act="eprev" ${exam.i === 0 ? 'disabled' : ''}>${ic('left')}Câu trước</button>
      <button class="btn primary" data-act="enext" ${exam.i === N - 1 ? 'disabled' : ''}>Câu sau${ic('right')}</button>
    </div>
    ${hint}
    ${confirm}`);
}
function startExam(minutes, shuffle) {
  const idx = [...Array(N).keys()];
  const order = shuffle ? shuffled(idx, Date.now() >>> 0) : idx;
  exam = {
    i: 0, order, minutes, endAt: Date.now() + minutes * 60000,
    responses: {}, flags: new Set(), submitted: false, confirm: false, auto: false, result: null,
  };
  saveExam();
  view = 'exam';
}
function examPick(k) {
  const q = QS[exam.order[exam.i]];
  if (!letters(q).includes(k)) return;
  const p = pickOf(q);
  const cur = exam.responses[q.n] || [];
  let next;
  if (p === 1) next = cur.length === 1 && cur[0] === k ? [] : [k];
  else if (cur.includes(k)) next = cur.filter((x) => x !== k);
  else if (cur.length >= p) return; // capped at pick
  else next = [...cur, k];
  if (next.length) exam.responses[q.n] = next; else delete exam.responses[q.n];
  saveExam();
}
function examGo(i) {
  exam.i = Math.max(0, Math.min(N - 1, i));
  saveExam();
}
function submit(auto = false) {
  if (!exam || exam.submitted) return;
  if (!auto && answeredCount() < N) return; // second lock: only the timer may submit with blanks
  exam.submitted = true;
  exam.auto = auto;
  exam.confirm = false;
  exam.result = scoreExam(QS, exam.responses);
  exam.k = appendAttempt(DATA.id, makeAttempt('exam', QS, exam.responses, Date.now(), auto));
  HIST = loadHistory(DATA.id);
  const key = storageKey(DATA.id, 'best');
  const prev = loadState(key, null);
  const best = typeof prev === 'number' && Number.isFinite(prev) ? Math.max(prev, exam.result.score10) : exam.result.score10;
  saveState(key, best);
  saveState(storageKey(DATA.id, 'exam'), null); // clear the in-progress exam
  view = 'result';
  render();
  window.scrollTo(0, 0);
}
function renderResult() {
  const res = exam.result;
  const wrongSet = new Set(res.wrong);
  const wrong = QS.filter((q) => wrongSet.has(q.n));
  const blank = QS.filter((q) => !exam.responses[q.n]).length;
  const wrongFilled = wrong.length - blank;
  const shuffledOrder = exam.order.some((qi, i) => qi !== i);
  const posOf = (q) => exam.order.indexOf(QS.indexOf(q)) + 1;
  const items = wrong.map((q) => {
    const p = exam.responses[q.n];
    const label = shuffledOrder ? `Câu ${posOf(q)} (đề gốc ${q.n})` : `Câu ${q.n}`;
    return `<div class="wl"><span class="q-num">${esc(label)}</span><p class="qt">${esc(q.text)}</p>
      <div class="ans">
        <div><span class="tag">Bạn chọn</span><span class="yours">${p ? answerLines(q, p) : 'Bỏ trống'}</span></div>
        <div><span class="tag">Đáp án</span><span class="key">${answerLines(q, q.answer || [])}</span></div>
      </div><div class="after" style="margin-top:10px">${badge(q)}${reportLink(q)}</div></div>`;
  }).join('');
  const acts = (wrong.length ? `<a class="btn primary" href="${modeUrl('review', `&amp;attempt=${exam.k}`)}">${ic('target')}Ôn ${wrong.length} câu sai</a>` : '') +
    `<button class="btn${wrong.length ? '' : ' primary'}" data-act="examStart">${ic('reset')}Thi lại</button><a class="btn" href="${modeUrl('history')}">${ic('history')}Xem lịch sử</a><a class="btn ghost" href="${modeUrl('study')}">${ic('book')}Ôn tập đề này</a>`;
  return topbar(examTitle(), 'Kết quả thi thử') + `<main class="wrap">
    <div class="score"><div class="big">${res.score10.toFixed(2)}<small> /10</small></div>
      <div class="stat">${res.correct}/${res.total} câu đúng · ${wrongFilled} sai · ${blank} bỏ trống${exam.auto ? ' · hết giờ, tự nộp' : ''}<br>Lần #${exam.k} · đã lưu vào lịch sử</div></div>
    <div class="meter" aria-hidden="true"><i style="width:${(res.correct / (N || 1)) * 100}%;background:var(--ok)"></i><i style="width:${(wrongFilled / (N || 1)) * 100}%;background:var(--bad)"></i></div>
    <div class="row-acts" style="padding-block:0 20px">${acts}</div>
    <h2 style="font-size:18px;margin:0 0 12px">${wrong.length ? `Câu sai / bỏ trống (${wrong.length})` : 'Không sai câu nào'}</h2>
    <div class="wrong-list">${items}</div>
    <div class="row-acts">${acts}</div>
  </main>`;
}

/* ---------- controller ---------- */
function focusKey() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.act) return null;
  return `[data-act="${a.dataset.act}"]` + (a.dataset.k ? `[data-k="${a.dataset.k}"]` : '') + (a.dataset.i ? `[data-i="${a.dataset.i}"]` : '');
}
function render() {
  clearInterval(tick); tick = null;
  let fk = focusKey();
  // Arrow keys on a focused cell: keep focus on the (new) current cell.
  if (fk && /^\[data-act="[er]?go"\]/.test(fk)) fk = '.cell.cur';
  const sideTop = app.querySelector('.side-body')?.scrollTop || 0;
  app.innerHTML = (view === 'study' ? renderStudy()
    : view === 'history' ? renderHistory()
    : view === 'review' ? renderReview()
    : view === 'examStart' ? renderExamStart()
    : view === 'exam' ? renderExam() : renderResult()) + quizFoot();
  document.title = `${examTitle()} · MLN131`;
  const want = focusNext || fk;
  focusNext = null;
  if (want) { const el = app.querySelector(want); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  keepCurInView(sideTop);
  if (scrollTop) { scrollTop = false; window.scrollTo(0, 0); }
  if (view === 'exam') {
    tick = setInterval(() => {
      const r = remaining(), el = document.getElementById('timer');
      if (el) { el.innerHTML = ic('clock') + formatTime(r); el.classList.toggle('low', r < 300); }
      if (r <= 0) submit(true);
    }, 1000);
  }
  const f = document.getElementById('startForm');
  if (f) f.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = parseInt(document.getElementById('mins').value, 10);
    const mins = Math.min(180, Math.max(1, Number.isFinite(raw) ? raw : 60));
    startExam(mins, document.getElementById('shuf').checked);
    render(); window.scrollTo(0, 0);
  });
}
// innerHTML resets the sidebar's own scroll; restore it, then nudge so the
// current cell stays visible without scrolling the window.
function keepCurInView(top) {
  const box = app.querySelector('.side-body'), cur = box && box.querySelector('.cell.cur');
  if (!box || box.scrollHeight <= box.clientHeight) return;
  box.scrollTop = top;
  const pad = 8, y = cur.offsetTop - box.offsetTop;
  if (y < box.scrollTop + pad) box.scrollTop = y - pad;
  else if (y + cur.offsetHeight > box.scrollTop + box.clientHeight - pad) box.scrollTop = y + cur.offsetHeight - box.clientHeight + pad;
}
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  let scroll = false;
  if (a === 'examStart') { view = 'examStart'; scroll = true; }
  else if (a === 'pick') { studyPick(b.dataset.k); focusAfterAnswer(QS[study.i]); maybeRecordStudy(); }
  else if (a === 'check') { studyCheck(); focusAfterAnswer(QS[study.i]); maybeRecordStudy(); }
  else if (a === 'prev') { studyGo(study.i - 1); scroll = true; }
  else if (a === 'next') { studyGo(study.i + 1); scroll = true; }
  else if (a === 'go') { studyGo(+b.dataset.i); navOpen = false; scroll = true; }
  else if (a === 'toggleNav') navOpen = !navOpen;
  else if (a === 'resetStudy') { study.confirmReset = true; focusNext = '[data-act="cancelReset"]'; }
  else if (a === 'cancelReset') { study.confirmReset = false; focusNext = '[data-act="resetStudy"]'; }
  else if (a === 'doResetStudy') { study = freshStudy(); saveStudy(); focusNext = '[data-act="resetStudy"]'; scroll = true; }
  else if (a === 'newRound') { study = freshStudy(); saveStudy(); navOpen = false; focusNext = '.opt'; scroll = true; }
  else if (a === 'rpick') reviewAfterAnswer(roundPick(review, reviewQ(), b.dataset.k));
  else if (a === 'rcheck') reviewAfterAnswer(roundCheck(review, reviewQ()));
  else if (a === 'rprev') { reviewGo(review.i - 1); scroll = true; }
  else if (a === 'rnext') { reviewGo(review.i + 1); scroll = true; }
  else if (a === 'rgo') { reviewGo(+b.dataset.i); navOpen = false; scroll = true; }
  else if (a === 'rAgain') { review.responses = {}; review.draft = []; review.i = 0; navOpen = false; scroll = true; focusNext = '.opt'; }
  else if (a === 'epick') examPick(b.dataset.k);
  else if (a === 'eprev') { examGo(exam.i - 1); scroll = true; }
  else if (a === 'enext') { examGo(exam.i + 1); scroll = true; }
  else if (a === 'ego') { examGo(+b.dataset.i); navOpen = false; scroll = true; }
  else if (a === 'flag') {
    const n = QS[exam.order[exam.i]].n;
    if (!exam.flags.delete(n)) exam.flags.add(n);
    saveExam();
  }
  else if (a === 'nextBlank') { const j = nextBlank(); if (j >= 0) { examGo(j); navOpen = false; scroll = true; } }
  else if (a === 'askSubmit') {
    if (answeredCount() < N) return; // locked until every question is answered
    exam.confirm = true; focusNext = '[data-act="submit"]';
  }
  else if (a === 'cancelSubmit') { exam.confirm = false; focusNext = '[data-act="askSubmit"]'; }
  else if (a === 'submit') {
    if (answeredCount() < N) exam.confirm = false; // answers were cleared while the box was open
    else { submit(false); return; }
  }
  render();
  if (scroll) window.scrollTo(0, 0);
  if (a === 'askSubmit') document.querySelector('.confirm')?.scrollIntoView({ block: 'center' });
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!DATA || !QS.length) return; // data not loaded, or exam not found
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (view === 'study') {
    const q = QS[study.i];
    if (k.length === 1 && letters(q).includes(k)) { studyPick(k); focusAfterAnswer(q); maybeRecordStudy(); render(); }
    else if (e.key === 'Enter' && pickOf(q) > 1 && !study.responses[q.n] && study.draft.length === pickOf(q) && e.target === document.body) { studyCheck(); focusAfterAnswer(q); maybeRecordStudy(); render(); }
    else if (e.key === 'ArrowRight' && study.i < N - 1) { studyGo(study.i + 1); render(); }
    else if (e.key === 'ArrowLeft' && study.i > 0) { studyGo(study.i - 1); render(); }
  } else if (view === 'review' && review) {
    const q = reviewQ(), last = review.ns.length - 1;
    if (k.length === 1 && letters(q).includes(k)) { reviewAfterAnswer(roundPick(review, q, k)); render(); }
    else if (e.key === 'Enter' && pickOf(q) > 1 && !review.responses[q.n] && review.draft.length === pickOf(q) && e.target === document.body) { reviewAfterAnswer(roundCheck(review, q)); render(); }
    else if (e.key === 'ArrowRight' && review.i < last) { reviewGo(review.i + 1); render(); }
    else if (e.key === 'ArrowLeft' && review.i > 0) { reviewGo(review.i - 1); render(); }
  } else if (view === 'exam') {
    const q = QS[exam.order[exam.i]];
    if (k.length === 1 && letters(q).includes(k)) { if (!exam.confirm) { examPick(k); render(); } }
    else if (e.key === 'ArrowRight' && exam.i < N - 1) { examGo(exam.i + 1); render(); }
    else if (e.key === 'ArrowLeft' && exam.i > 0) { examGo(exam.i - 1); render(); }
  }
});

/* ---------- boot ---------- */
function notFound(msg) {
  view = 'none';
  document.title = 'Không tìm thấy đề · MLN131';
  app.innerHTML = `<header class="bar"><div class="wrap"><div class="brand">${drumSvg(26, 'star', true)}<span class="mark">MLN131</span>Phòng thi thử</div></div></header>
    <main class="wrap"><div class="notice"><h1>${esc(msg)}</h1><p>Đề này không có trong danh sách hoặc không tải được.</p><a class="btn primary" href="index.html">${ic('back')}Về trang chủ</a></div></main>${quizFoot()}`;
}
async function main() {
  let manifest;
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) { console.error(err); notFound('Không tải được danh sách đề'); return; }
  const id = resolveExamId(location.search, manifest);
  if (!id) { notFound('Không tìm thấy đề'); return; }
  try {
    const res = await fetch(`data/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) { console.error(err); notFound('Không tìm thấy đề'); return; }
  QS = Array.isArray(DATA.questions) ? DATA.questions : [];
  N = QS.length;
  if (!N) { notFound('Đề này chưa có câu hỏi'); return; }
  DATA.id = id; // manifest id is authoritative for storage keys and links
  study = loadStudy();
  HIST = loadHistory(DATA.id);
  if (MODE === 'history') view = 'history';
  else if (MODE === 'review') { review = startReview(params.get('attempt')); view = 'review'; }
  else if (MODE === 'exam') {
    exam = loadExam();
    if (exam) {
      view = 'exam';
      if (remaining() <= 0) { submit(true); return; }
    } else view = 'examStart';
  } else view = 'study';
  render();
}
main();
