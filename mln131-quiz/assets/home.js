import { expireIfIdle, loadHistory, historyStats, bestOf } from './core.js';
import { ic, drumSvg, esc } from './icons.js';

const app = document.getElementById('app');
const ISSUES_URL = 'https://github.com/linhjr87/open-quiz/issues';

function header() {
  return `<header class="bar"><div class="wrap"><div class="brand">${drumSvg(26, 'star', true)}<span class="mark">MLN131</span>Phòng thi thử</div></div></header>`;
}

function hero(total) {
  const lede = total
    ? `${total} mã đề chép lại từ đề gốc. Ôn tập để biết đúng sai ngay, hoặc thi thử có giờ như phòng thi.`
    : 'Ôn tập để biết đúng sai ngay, hoặc thi thử có giờ như phòng thi.';
  return `<section class="hero-band">${drumSvg(380, 'drum')}<div class="wrap"><div class="hero">
      <div class="eyebrow">Chủ nghĩa xã hội khoa học · Đề FE cũ</div>
      <h1>Ôn theo đúng đề đã thi</h1>
      <p class="lede">${esc(lede)}</p>
      <div class="legend">
        <span class="badge b-ok">${ic('shield')}Đã đối chiếu</span>
        <span class="badge b-warn">${ic('warn')}Có tranh cãi</span>
        <span class="badge b-ai">${ic('cpu')}Đáp án AI, chưa đối chiếu</span>
      </div>
      <p class="disclaimer">Không chính thức. Đề được chép lại từ ảnh và đáp án có thể sai. <a href="${ISSUES_URL}" target="_blank" rel="noopener">Báo lỗi</a></p>
    </div></div></section>`;
}

function row(e) {
  const href = (mode) => `quiz.html?exam=${encodeURIComponent(e.id)}&amp;mode=${mode}`;
  const disputed = Number(e.stats && e.stats.disputed) || 0;
  const history = loadHistory(e.id);
  const st = historyStats(history);
  const best = bestOf(e.id, history);
  const code = e.term && e.code ? `${e.term} · ${e.code}` : e.title || e.id;
  const subs = [`<span>${Number(e.count) || 0} câu</span>`];
  if (disputed) subs.push(`<span>${ic('warn', 'style="width:14px;height:14px;vertical-align:-2px;color:var(--warn)"')} ${disputed} câu tranh cãi</span>`);
  const bestHtml = best === null ? '' : `<span>Cao nhất <b class="mono">${best.toFixed(2)}</b></span>`;
  if (st.exams > 0) subs.push(`<span>Thi thử ${st.exams} lần</span>`);
  if (best !== null) subs.push(bestHtml);
  else if (st.exams === 0) subs.push('<span>Chưa thi thử</span>');
  if (st.studies > 0) subs.push(`<span>Ôn tập ${st.studies} lần</span>`);
  const hist = history.attempts.length > 0
    ? `<a class="btn hist-btn" href="${href('history')}" aria-label="Lịch sử làm bài">${ic('history')}<span class="lbl">Lịch sử</span></a>`
    : '';
  return `<div class="row"><div class="meta"><div class="code">${esc(code)}</div><div class="sub">${subs.join('')}</div></div>
    <div class="acts">${hist}
      <a class="btn" href="${href('study')}">${ic('book')}Ôn tập</a>
      <a class="btn primary" href="${href('exam')}">${ic('clock')}Thi thử</a>
    </div></div>`;
}

function render(manifest) {
  const exams = Array.isArray(manifest && manifest.exams) ? manifest.exams : [];
  const groups = [];
  for (const e of exams) {
    const term = e.term || '';
    let g = groups.find((x) => x.term === term);
    if (!g) groups.push((g = { term, items: [] }));
    g.items.push(e);
  }
  let html = header() + hero(exams.length) + '<main class="wrap">';
  if (!groups.length) html += '<div class="notice"><h1>Chưa có đề nào</h1><p>Danh sách đề đang trống. Quay lại sau nhé.</p></div>';
  for (const g of groups) {
    html += `<section class="term"><h2>${esc(g.term)}</h2><div class="list">${g.items.map(row).join('')}</div></section>`;
  }
  html += `<p class="foot">Không chính thức. Đề được chép lại từ ảnh và đáp án có thể sai. Thấy lỗi thì bấm “Báo lỗi câu này” trong từng câu hoặc <a href="${ISSUES_URL}" target="_blank" rel="noopener">báo lỗi tại đây</a>.</p></main>`;
  app.innerHTML = html;
}

async function main() {
  expireIfIdle(Date.now());
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (err) {
    app.innerHTML = header() + `<main class="wrap"><div class="notice"><h1>Không tải được danh sách đề</h1><p>Kiểm tra kết nối rồi tải lại trang.</p><a class="btn primary" href="">Tải lại</a></div></main>`;
    console.error(err);
  }
}
main();
