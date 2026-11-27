import { expireIfIdle, migrateLegacy, loadHistory, historyStats, bestOf, examKey, recentAttempts, formatDate } from './core.js';
import { ic, drumSvg, esc } from './icons.js';

// Trang chủ (không có `?subject=`): các môn theo kỳ học + "Tiếp tục ôn".
// Trang môn (`?subject=MLN131`): các đề của môn, nhóm theo đợt thi.
const app = document.getElementById('app');
const PLATFORM = 'FU-open-quiz';
const ISSUES_URL = 'https://github.com/linhjr87/open-quiz/issues';
const DATA_NOTE = 'Đề được chép lại từ ảnh và đáp án có thể sai.';

const subjectUrl = (code) => `index.html?subject=${encodeURIComponent(code)}`;
const quizUrl = (code, id, mode, extra = '') =>
  `quiz.html?subject=${encodeURIComponent(code)}&amp;exam=${encodeURIComponent(id)}&amp;mode=${mode}${extra}`;

function header() {
  return `<header class="bar"><div class="wrap"><a class="brand" href="index.html">${drumSvg(26, 'star', true)}${PLATFORM}</a></div></header>`;
}

const foot = `<p class="foot">Không chính thức. ${DATA_NOTE} Thấy lỗi thì bấm “Báo lỗi câu này” trong từng câu hoặc <a href="${ISSUES_URL}" target="_blank" rel="noopener">báo lỗi tại đây</a>.</p>`;

// Số liệu một môn từ manifest của nó và lịch sử trên trình duyệt này.
// Trạng thái đáp án (verified/disputed/ai-only) chỉ dùng nội bộ, không hiện cho người học.
function subjectStats(s) {
  const exams = s.exams;
  let questions = 0;
  let tried = 0;
  let best = null;
  for (const e of exams) {
    questions += Number(e.count) || 0;
    const key = examKey(s.code, e.id);
    const h = loadHistory(key);
    if (h.attempts.length) tried++;
    const b = bestOf(key, h);
    if (b !== null && (best === null || b > best)) best = b;
  }
  return { exams: exams.length, questions, tried, best };
}

/* ---------- trang chủ ---------- */
function subjectCard(s) {
  const st = subjectStats(s);
  let bottom;
  if (st.exams) {
    bottom = `<div class="meta2"><span><b>${st.exams}</b> đề</span><span><b>${st.questions.toLocaleString('vi-VN')}</b> câu</span><span>Đã làm <b>${st.tried}/${st.exams}</b></span></div>
      <div class="pbar" aria-hidden="true"><i style="width:${st.tried / st.exams * 100}%"></i></div>`;
  } else {
    bottom = `<div class="meta2"><span class="badge b-soon">${ic('hourglass')}Đang chép đề</span></div>`;
  }
  return `<a class="scard${st.exams ? '' : ' soon'}" href="${subjectUrl(s.code)}">
    <div class="top"><span class="mk">${esc(s.code)}</span><span class="sem">Kỳ ${Number(s.semester)}</span></div>
    <div class="name">${esc(s.name)}</div><div class="foot2">${bottom}</div></a>`;
}

function continueSection(subjects) {
  const byCode = new Map(subjects.map((s) => [s.code, s]));
  const rows = recentAttempts(3)
    .map((r) => ({ ...r, s: byCode.get(r.subject) }))
    .map((r) => ({ ...r, e: r.s && r.s.exams.find((e) => e.id === r.examId) }))
    .filter((r) => r.e);
  if (!rows.length) return '';
  const html = rows.map(({ s, e, k, attempt: a }) => {
    const last = a.mode === 'exam'
      ? `Thi thử <b class="mono">${Number(a.score10).toFixed(2)}</b>`
      : `Ôn tập đúng <b class="mono">${a.correct}/${a.total}</b>`;
    const wrong = a.correct < a.total
      ? `<a class="btn primary" href="${quizUrl(s.code, e.id, 'review', `&amp;attempt=${k}`)}">${ic('target')}Ôn câu sai</a>`
      : `<a class="btn primary" href="${quizUrl(s.code, e.id, 'study')}">${ic('book')}Ôn tập</a>`;
    return `<div class="cont"><div class="meta"><div class="code">${esc(s.code)} · ${esc(e.term)} · ${esc(e.code)}</div>
      <div class="sub"><span>Lần gần nhất: ${last} · ${formatDate(a.at)}</span></div></div>
      <div class="acts">${wrong}<a class="btn" href="${quizUrl(s.code, e.id, 'history')}">${ic('history')}Lịch sử</a></div></div>`;
  }).join('');
  return `<div class="sec-h"><h2>Tiếp tục ôn</h2></div><div class="cont-list">${html}</div>`;
}

function renderHome(subjects) {
  const sems = [...new Set(subjects.map((s) => Number(s.semester)))].sort((a, b) => a - b);
  const examCount = subjects.reduce((n, s) => n + s.exams.length, 0);
  const lede = `${subjects.length} môn, ${examCount} đề FE chép lại từ đề gốc. Ôn tập để biết đúng sai ngay, hoặc thi thử có giờ như phòng thi.`;
  let html = header() + `<section class="hero-band">${drumSvg(380, 'drum')}<div class="wrap"><div class="hero">
      <div class="eyebrow">Đề FE cũ · Đại học FPT</div>
      <h1>Ôn theo đúng đề đã thi</h1>
      <p class="lede">${esc(lede)}</p>
      <p class="disclaimer">Không chính thức. ${DATA_NOTE} <a href="${ISSUES_URL}" target="_blank" rel="noopener">Báo lỗi</a></p>
    </div></div></section><main class="wrap">`;
  html += continueSection(subjects);
  if (!subjects.length) html += '<div class="notice"><h1>Chưa có môn nào</h1><p>Danh sách môn đang trống. Quay lại sau nhé.</p></div>';
  for (const sem of sems) {
    const list = subjects.filter((s) => Number(s.semester) === sem);
    html += `<section class="sem-group" id="ky-${sem}"><div class="sec-h"><h2>Kỳ ${sem}</h2><span class="q-hint">${list.length} môn</span></div>
      <div class="subjects">${list.map(subjectCard).join('')}</div></section>`;
  }
  app.innerHTML = html + foot + '</main>';
  document.title = `${PLATFORM} · Ôn đề FE cũ`;
  // Nội dung dựng sau khi trang tải, nên trình duyệt chưa cuộn được tới #ky-<n> từ breadcrumb.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

/* ---------- trang môn ---------- */
function row(code, e) {
  const key = examKey(code, e.id);
  const history = loadHistory(key);
  const st = historyStats(history);
  const best = bestOf(key, history);
  const label = e.term && e.code ? `${e.term} · ${e.code}` : e.title || e.id;
  const subs = [`<span>${Number(e.count) || 0} câu</span>`];
  if (st.exams > 0) subs.push(`<span>Thi thử ${st.exams} lần</span>`);
  if (best !== null) subs.push(`<span>Cao nhất <b class="mono">${best.toFixed(2)}</b></span>`);
  else if (st.exams === 0) subs.push('<span>Chưa thi thử</span>');
  if (st.studies > 0) subs.push(`<span>Ôn tập ${st.studies} lần</span>`);
  const hist = history.attempts.length > 0
    ? `<a class="btn hist-btn" href="${quizUrl(code, e.id, 'history')}" aria-label="Lịch sử làm bài">${ic('history')}<span class="lbl">Lịch sử</span></a>`
    : '';
  return `<div class="row"><div class="meta"><div class="code">${esc(label)}</div><div class="sub">${subs.join('')}</div></div>
    <div class="acts">${hist}
      <a class="btn" href="${quizUrl(code, e.id, 'study')}">${ic('book')}Ôn tập</a>
      <a class="btn primary" href="${quizUrl(code, e.id, 'exam')}">${ic('clock')}Thi thử</a>
    </div></div>`;
}

function crumbs(s) {
  return `<nav aria-label="Vị trí"><ol class="crumbs">
      <li><a href="index.html">Trang chủ</a></li>
      <li><a href="index.html#ky-${Number(s.semester)}">Kỳ ${Number(s.semester)}</a></li>
      <li><span aria-current="page">${esc(s.code)}</span></li></ol></nav>`;
}

function renderSubject(s) {
  const st = subjectStats(s);
  let html = header() + `<section class="hero-band">${drumSvg(380, 'drum')}<div class="wrap">${crumbs(s)}<div class="hero sub-hero">
      <div class="eyebrow">${esc(s.code)} · Kỳ ${Number(s.semester)} · Đề FE cũ</div>
      <h1>${esc(s.name)}</h1>`;
  if (!st.exams) {
    html += `<p class="lede">Đề của môn này đang được chép và giải. Đề nào kiểm tra xong sẽ hiện ở đây.</p>
      </div></div></section><main class="wrap">
      <div class="empty"><p><b>Chưa có đề nào của ${esc(s.code)}.</b></p><p>Quay lại sau nhé, hoặc <a href="index.html">ôn môn khác</a>.</p></div>`;
  } else {
    html += `<p class="lede">${st.exams} mã đề chép lại từ đề gốc. Ôn tập để biết đúng sai ngay, hoặc thi thử có giờ như phòng thi.</p>
      <p class="disclaimer">Không chính thức. ${DATA_NOTE} <a href="${ISSUES_URL}" target="_blank" rel="noopener">Báo lỗi</a></p>
    </div></div></section><main class="wrap">
    <div class="sumstrip">
      <div class="tile"><span>Đề đã làm</span><b>${st.tried}<small class="of">/${st.exams}</small></b><small>đề có lịch sử</small></div>
      <div class="tile"><span>Cao nhất</span><b>${st.best === null ? '—' : st.best.toFixed(2)}</b><small>${st.best === null ? 'chưa thi thử' : 'thi thử, /10 điểm'}</small></div>
      <div class="tile"><span>Câu hỏi</span><b>${st.questions.toLocaleString('vi-VN')}</b><small>trong ${st.exams} đề</small></div>
    </div>`;
    const groups = [];
    for (const e of s.exams) {
      const term = e.term || '';
      let g = groups.find((x) => x.term === term);
      if (!g) groups.push((g = { term, items: [] }));
      g.items.push(e);
    }
    for (const g of groups) {
      html += `<section class="term"><h2>${esc(g.term)}</h2><div class="list">${g.items.map((e) => row(s.code, e)).join('')}</div></section>`;
    }
  }
  app.innerHTML = html + foot + '</main>';
  document.title = `${s.code} · ${s.name} · ${PLATFORM}`;
}

function renderMissing(code) {
  app.innerHTML = header() + `<main class="wrap"><div class="notice"><h1>Không tìm thấy môn ${esc(code)}</h1>
    <p>Môn này chưa có trên ${PLATFORM}.</p><a class="btn primary" href="index.html">${ic('back')}Về trang chủ</a></div></main>`;
  document.title = `Không tìm thấy môn · ${PLATFORM}`;
}

/* ---------- boot ---------- */
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// subjects.json + index.json của từng môn. Môn nào không tải được manifest thì coi như chưa có đề.
async function loadSubjects() {
  const raw = await getJson('data/subjects.json');
  const list = Array.isArray(raw && raw.subjects) ? raw.subjects : [];
  return Promise.all(list.map(async (s) => {
    let exams = [];
    try {
      const m = await getJson(`data/${encodeURIComponent(s.code)}/index.json`);
      exams = Array.isArray(m && m.exams) ? m.exams : [];
    } catch (err) { console.error(err); }
    return { ...s, exams };
  }));
}

async function main() {
  migrateLegacy();
  expireIfIdle(Date.now());
  let subjects;
  try {
    subjects = await loadSubjects();
  } catch (err) {
    app.innerHTML = header() + `<main class="wrap"><div class="notice"><h1>Không tải được danh sách môn</h1><p>Kiểm tra kết nối rồi tải lại trang.</p><a class="btn primary" href="">Tải lại</a></div></main>`;
    console.error(err);
    return;
  }
  const code = new URLSearchParams(location.search).get('subject');
  if (!code) { renderHome(subjects); return; }
  const s = subjects.find((x) => x.code === code);
  if (s) renderSubject(s);
  else renderMissing(code);
}
main();
