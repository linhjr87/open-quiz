// Shared inline-SVG icons, drum-face generator and HTML escaper (no emoji anywhere).
export const I = {
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  warn:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  cpu:'<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v3M9 2v3M15 19v3M9 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  up:'<path d="m18 15-6-6-6 6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  back:'<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  reset:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
  book:'<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
};
export const ic = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${I[n]}</svg>`;

/* Đông Sơn drum face, drawn from geometry: 14-point star, ring bands of ladder ticks,
   tangent circles with dots, and saw-teeth. `mini` draws only the star for the logo. */
export function drumSvg(size, cls, mini=false){
  const c = 100, P = (r,a)=>[(c+r*Math.cos(a)).toFixed(2),(c+r*Math.sin(a)).toFixed(2)];
  let s = '';
  const star = [];
  for(let i=0;i<28;i++){ const a=Math.PI*i/14-Math.PI/2; star.push(P(i%2?(mini?34:9):(mini?96:24),a).join(',')); }
  s += `<polygon points="${star.join(' ')}" fill="currentColor"/>`;
  if(mini) return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true">${s}</svg>`;
  const ring = r => `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
  [27,31,42,44,58,60,76,78,97].forEach(r=>s+=ring(r));
  for(let i=0;i<90;i++){ const a=i*Math.PI/45; const [x1,y1]=P(31,a),[x2,y2]=P(42,a); s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1"/>`; }
  for(let i=0;i<20;i++){ const a=i*Math.PI/10; const [x,y]=P(51,a); s+=`<circle cx="${x}" cy="${y}" r="6.2" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="${x}" cy="${y}" r="1.8" fill="currentColor"/>`; }
  for(let i=0;i<48;i++){ const a=i*Math.PI/24, b=(i+.5)*Math.PI/24, d=(i+1)*Math.PI/24; const p=[P(60,a),P(74,b),P(60,d)].map(q=>q.join(',')).join(' '); s+=`<polyline points="${p}" fill="none" stroke="currentColor" stroke-width="1"/>`; }
  for(let i=0;i<120;i++){ const a=i*Math.PI/60; const [x1,y1]=P(78,a),[x2,y2]=P(97,a); s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width=".8"/>`; }
  return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true">${s}</svg>`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
