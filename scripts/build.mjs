// data/discount.json 을 읽어 완성된 정적 HTML을 생성합니다.
// 기본 할인율은 자동 수집을 시도하고(collect.mjs), 숨은 할인은 admin.html에서
// 직접 등록합니다. 둘을 합친 실질 할인율이 대란 판정 기준입니다.
// 검색로봇이 자바스크립트 없이도 숫자를 읽도록 그래프는 SVG로 빌드 시점에 그립니다.
//
// 실행: node scripts/build.mjs

import fs from 'node:fs';
import path from 'node:path';

// ── 배포 전 반드시 고치십시오 ──────────────────
const SITE = {
  origin: 'https://krdugong.github.io/marp-daeran',
  brand: '마프대란 알리미',
  kakao: 'https://open.kakao.com/o/gh0XALIi',
  affiliate: 'https://www.awin1.com/cread.php?awinmid=10751&awinaffid=325265&clickref=alimi-homepage&ued=https://www.myprotein.co.kr/referrals.list?applyCode=NED6-R3',
  youtube: 'https://www.youtube.com/@마프대란알리미',
  naverVerify: '',
};
// ───────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/discount.json'), 'utf8'));

const TH = db.threshold;
const DEALS = (db.deals || []).filter(d => !d.disabled);
const esc = s => String(s).replace(/&/g, '&amp;');
const pct = n => (Number.isInteger(n) ? n : n.toFixed(1)) + '%';
const r1 = n => Math.round(n * 10) / 10;
const kdate = s => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;

const rows = [...db.entries].sort((a, b) => a.date.localeCompare(b.date));
const hasSample = rows.some(r => r.source === 'sample');
const dealsOn = date => DEALS.filter(d => date >= d.start && date <= d.end);
function stackRate(base, ds) {
  let mult = 1 - base / 100, add = 0;
  for (const d of ds) (d.stack === 'add') ? (add += d.rate) : (mult *= 1 - d.rate / 100);
  return r1((1 - mult) * 100 + add);
}

const day = rows.map(r => {
  const base = r.base ?? r.rate;
  const ds = dealsOn(r.date);
  return { date: r.date, base, deals: ds, eff: stackRate(base, ds), source: r.source };
});

const last = day.at(-1);
const series = day.slice(-90);
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const ymOf = d => d.date.slice(0, 7);
const ym = ymOf(last);
const prevYm = (() => { const d = new Date(last.date + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
const thisAvg = r1(avg(day.filter(d => ymOf(d) === ym).map(d => d.eff)));
const prevList = day.filter(d => ymOf(d) === prevYm).map(d => d.eff);
const prevAvg = prevList.length ? r1(avg(prevList)) : null;
const delta = prevAvg === null ? null : r1(last.eff - prevAvg);

const events = [];
for (const d of day) {
  const cur = events.at(-1);
  const contiguous = cur && cur.open && (new Date(d.date) - new Date(cur.end)) === 86400000;
  if (d.eff >= TH && contiguous) { cur.end = d.date; cur.max = Math.max(cur.max, d.eff); cur.days++; }
  else if (d.eff >= TH) events.push({ start: d.date, end: d.date, max: d.eff, days: 1, open: true });
  else if (cur) cur.open = false;
}
const recent = [...events].reverse();
const cycle = events.length > 1
  ? Math.round(events.slice(1).reduce((s, e, i) => s + (new Date(e.start) - new Date(events[i].start)) / 86400000, 0) / (events.length - 1))
  : null;

const isDaeran = last.eff >= TH;
const gap = r1(TH - last.eff);
const lastEvent = recent[0];
const daysSince = lastEvent ? Math.round((new Date(last.date) - new Date(lastEvent.end)) / 86400000) : null;
const bonus = r1(last.eff - last.base);
const peak = Math.max(...day.map(d => d.eff));

// ── 게이지 ──
function gauge() {
  const lo = 33, hi = Math.max(48, Math.ceil(last.eff) + 2), W = 640, H = 100, pad = 16;
  const x = v => pad + ((v - lo) / (hi - lo)) * (W - pad * 2);
  const ticks = [34, 38, 42, 46].filter(t => t <= hi);
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="실질 할인율 ${last.eff}퍼센트, 대란 기준 ${TH}퍼센트">
  <rect x="${x(lo)}" y="42" width="${x(TH) - x(lo)}" height="14" rx="7" fill="var(--track)"/>
  <rect x="${x(TH)}" y="42" width="${x(hi) - x(TH)}" height="14" rx="7" fill="var(--track-hot)"/>
  <line x1="${x(TH)}" y1="26" x2="${x(TH)}" y2="70" stroke="var(--teal)" stroke-width="2" stroke-dasharray="3 3"/>
  <text x="${x(TH) + 6}" y="22" class="g-note" fill="var(--teal)">대란 ${TH}%</text>
  ${bonus > 0 ? `<line x1="${x(last.base)}" y1="49" x2="${x(last.eff)}" y2="49" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" opacity=".25"/>
  <circle cx="${x(last.base)}" cy="49" r="5" fill="#8A8272"/>
  <text x="${x(last.base)}" y="34" class="g-tick" text-anchor="middle">기본 ${last.base}%</text>` : ''}
  ${ticks.map(t => `<text x="${x(t)}" y="90" class="g-tick" text-anchor="middle">${t}</text>`).join('')}
  <circle cx="${x(last.eff)}" cy="49" r="11" fill="${isDaeran ? 'var(--teal)' : 'var(--accent)'}"/>
  <circle cx="${x(last.eff)}" cy="49" r="4" fill="#fff"/>
</svg>`;
}

function trend() {
  const W = 640, H = 210, L = 34, R = 12, T = 16, B = 26;
  const vs = series.flatMap(d => [d.eff, d.base]);
  const lo = Math.min(...vs) - 1, hi = Math.max(...vs) + 1;
  const x = i => L + (i / Math.max(series.length - 1, 1)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pathOf = key => series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  const bands = events.filter(e => e.end >= series[0].date).map(e => {
    const s = series.findIndex(d => d.date === e.start), en = series.findIndex(d => d.date === e.end);
    if (s < 0) return '';
    return `<rect x="${x(s) - 2}" y="${T}" width="${Math.max(x(en) - x(s) + 4, 5)}" height="${H - T - B}" fill="var(--teal)" opacity=".12"/>`;
  }).join('');
  const labels = [Math.ceil(lo) + 1, Math.round((lo + hi) / 2), Math.floor(hi) - 1].map(v => `<text x="4" y="${y(v) + 4}" class="g-tick">${v}</text>`).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${series.length}일 실질 할인율 추이">
  ${bands}${labels}
  <line x1="${L}" y1="${y(TH)}" x2="${W - R}" y2="${y(TH)}" stroke="var(--teal)" stroke-width="1" stroke-dasharray="4 4"/>
  <path d="${pathOf('base')}" fill="none" stroke="#C9BFA8" stroke-width="1.5" stroke-dasharray="3 3"/>
  <path d="${pathOf('eff')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${x(series.length - 1)}" cy="${y(last.eff)}" r="5" fill="${isDaeran ? 'var(--teal)' : 'var(--accent)'}"/>
  <text x="${L}" y="${H - 6}" class="g-tick">${kdate(series[0].date)}</text>
  <text x="${W - R}" y="${H - 6}" class="g-tick" text-anchor="end">오늘</text>
</svg>`;
}

const FAQ = [
  ['마프대란이 뭔가요?',
   `마이프로틴 할인율이 평소보다 뚜렷하게 올라가는 날을 구매자들이 부르는 말입니다. 공식 명칭이 아닙니다. 이 사이트는 기본 할인코드에 숨은 추가 할인까지 합친 실질 할인율이 ${TH}% 이상인 날을 대란으로 기록합니다.`],
  ['숨은 할인이 뭔가요?',
   '기본 할인코드 위에 조건을 맞추면 더 붙는 할인입니다. 특정 카테고리에서 몇 개를 담으면 추가 할인이 붙거나, 앱에서만 되는 코드가 따로 있는 식입니다. 배너에 크게 걸리지 않아 모르고 지나치기 쉽습니다. 이 사이트는 그런 조건을 찾아 기록하고 실질 할인율에 반영합니다.'],
  [`대란 기준이 왜 ${TH}%인가요?`,
   '수집한 데이터에서 평상시 할인율이 한 구간에 몰려 있고, 행사가 열리는 날만 그 위로 떨어져 나옵니다. 두 분포가 갈라지는 지점을 기준으로 삼았습니다. 마이프로틴이 정한 숫자가 아니라 이 사이트의 관측 기준입니다.'],
  ['기본 할인율은 어떻게 수집하나요?',
   '자동 수집을 시도합니다. 실패하면 직접 확인해서 넣습니다. 숨은 할인은 배너에 안 걸리는 조건이라 애초에 자동으로 잡을 수 없어 항상 직접 등록합니다.'],
  ['대란이면 무조건 사는 게 이득인가요?',
   '아닙니다. 평소와 차이는 몇 %p 수준입니다. 지금 당장 필요한 제품이라면 대란을 기다리며 미루는 것보다 지금 사는 편이 나을 수 있습니다.'],
];

// ── 새 색채: 마이프로틴 톤(흰 배경 + 딥 틸 + 오렌지)에 맞춤. 히어로만 틸 풀블리드. ──
const css = `
:root{
  --bg:#FFFFFF;--card:#FFFFFF;--ink:#17211E;--muted:#6B7572;--line:#E7E9E5;--faint:#F6F6F3;
  --teal:#0E3B36;--teal-soft:#DCEEEA;--orange:#F15A24;--orange-soft:#FDE3D8;
  --amber:#D98E04;--amber-soft:#FBEBC7;--track:rgba(255,255,255,.2);--track-hot:rgba(241,90,36,.35);
  --yt:#D8362E;--yt-soft:#FDECEA
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;line-height:1.62;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum"}
a{color:inherit}
.headerInner,.utilInner,.heroInner,.wrap{max-width:560px;margin:0 auto;padding-left:20px;padding-right:20px}
.wrap{padding-top:0;padding-bottom:72px}
header.top{background:#fff;border-bottom:2px solid var(--teal)}
.headerInner{height:60px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none}
.brand .mark{width:28px;height:28px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.brand .word{font-weight:800;letter-spacing:-.02em;font-size:15px;color:var(--teal)}
.headerInner a.sub{font-size:13px;color:var(--teal);text-decoration:none;font-weight:700;border:1.5px solid var(--teal);padding:6px 12px;border-radius:99px}
.utilBar{background:var(--faint);border-bottom:1px solid var(--line)}
.utilInner{padding:9px 0;display:flex;gap:8px 20px;flex-wrap:wrap;justify-content:center;font-size:12px;font-weight:600;color:var(--teal)}
.heroBand{background:var(--teal);color:#fff}
.heroInner{padding:36px 0 42px}
h1{font-size:27px;font-weight:800;letter-spacing:-.03em;line-height:1.35;margin:0 0 10px}
h2{font-size:17px;font-weight:800;letter-spacing:-.01em;margin:46px 0 14px;display:flex;align-items:center;gap:8px}
h2::before{content:'';width:9px;height:9px;border-radius:2px;background:var(--orange);flex-shrink:0}
p{margin:0 0 12px}
.lede{color:var(--muted);font-size:14px}
.state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px;margin-bottom:16px;border:1.5px solid transparent}
.heroBand .state.on{background:rgba(255,255,255,.16);color:#fff;border-color:#fff}
.heroBand .state.off{background:rgba(255,255,255,.1);color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.4)}
.numWrap{position:relative;display:inline-block;margin:4px 0 6px}
.big{font-size:66px;font-weight:800;letter-spacing:-.045em;line-height:1;position:relative;z-index:1;color:#fff}
.big.on{color:var(--orange)}
.underline{position:absolute;left:-4px;right:-4px;bottom:-2px;height:16px;z-index:0}
.heroBand h1{color:#fff}
.heroBand .lede{color:rgba(255,255,255,.75)}
.sub{font-size:14px;color:var(--muted);margin-bottom:18px}
.heroBand .sub{color:rgba(255,255,255,.8)}
.formula{font-size:14px;color:var(--muted);margin:0 0 16px}
.formula b{color:var(--orange);font-weight:800}
.heroBand .formula{color:rgba(255,255,255,.8)}
svg.gauge,svg.trend{width:100%;height:auto;display:block;margin:6px 0 20px}
.g-tick{font-size:11px;fill:#9B917C}
.heroBand .g-tick{fill:rgba(255,255,255,.65)}
.g-note{font-size:11px;font-weight:800}
.heroBand .g-note{fill:#FFD9C7}
.cta{display:block;text-align:center;background:var(--ink);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px;border-radius:14px;margin:8px 0;box-shadow:3px 3px 0 var(--orange)}
.cta.ghost{background:var(--card);color:var(--ink);box-shadow:none;border:1.5px solid var(--ink)}
.cta:hover{transform:translate(1px,1px);box-shadow:2px 2px 0 var(--orange)}
.cta.ghost:hover{transform:none;box-shadow:none}
.heroBand .cta{background:var(--orange);color:#fff;box-shadow:3px 3px 0 rgba(0,0,0,.22)}
.heroBand .cta.ghost{background:transparent;color:#fff;box-shadow:none;border:1.5px solid rgba(255,255,255,.6)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}
.stats div{background:var(--card);border:1.5px solid var(--ink);border-radius:12px;padding:13px 10px}
.stats dt{font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600}
.stats dd{margin:0;font-size:16px;font-weight:800;letter-spacing:-.02em}
.heroBand .stats div{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3)}
.heroBand .stats dt{color:rgba(255,255,255,.65)}
.heroBand .stats dd{color:#fff}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:11px 4px;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--muted);font-weight:700}
td.n{text-align:right;font-weight:800}
.codes{list-style:none;padding:0;margin:0}
.codes li{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}
.codes .name{flex:1;font-size:14px;font-weight:600}
.codes .name em{display:block;font-style:normal;font-size:12px;color:var(--muted);font-weight:400}
.codes code{font-weight:800;font-size:15px;letter-spacing:.02em;background:var(--amber-soft);padding:2px 8px;border-radius:6px}
.codes button{border:1.5px solid var(--ink);background:#fff;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.codes button:focus-visible,.cta:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.hidden-deals{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px}
.hidden-deals li{background:var(--amber-soft);border:1.5px dashed #B98A2E;border-radius:4px 14px 14px 4px;padding:14px 16px}
.hidden-deals li:nth-child(odd){transform:rotate(-.6deg)}
.hidden-deals li:nth-child(even){transform:rotate(.6deg)}
.hidden-deals .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.hidden-deals .t{font-size:15px;font-weight:800;letter-spacing:-.01em}
.hidden-deals .r{font-size:18px;font-weight:800;color:var(--orange);white-space:nowrap}
.hidden-deals .d{font-size:13px;color:#6B5E3F;margin-top:5px}
.hidden-deals .when{font-size:12px;color:#8A7A50;margin-top:6px;font-weight:600}
details{border-bottom:1px solid var(--line)}
summary{cursor:pointer;padding:15px 0;font-size:14px;font-weight:700;list-style:none;display:flex;justify-content:space-between;align-items:center}
summary::after{content:'+';font-size:20px;font-weight:400;color:var(--muted)}
details[open] summary::after{content:'–'}
summary::-webkit-details-marker{display:none}
details p{font-size:14px;color:var(--muted);padding-bottom:14px}
footer{margin-top:56px;padding-top:20px;border-top:2px solid var(--teal);font-size:12px;color:var(--muted)}
footer nav{margin-bottom:10px}
footer nav a{margin-right:14px;text-decoration:none;font-weight:700;color:var(--teal)}
.warn{background:var(--amber-soft);border:1.5px solid var(--amber);border-radius:10px;padding:12px;font-size:13px;margin-bottom:20px}
.ytPromo{display:flex;gap:14px;align-items:flex-start;background:var(--yt-soft);border:1.5px solid #F3B3AD;border-radius:16px;padding:18px}
.ytPromo .ytIcon{width:40px;height:40px;border-radius:10px;background:var(--yt);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ytPromo .ytKicker{font-size:11px;font-weight:800;color:var(--yt);text-transform:uppercase;letter-spacing:.03em;margin:0 0 3px}
.ytPromo .ytTitle{font-size:16px;font-weight:800;margin:0 0 6px;letter-spacing:-.01em}
.ytPromo .ytDesc{font-size:13px;color:#6B5A57;margin:0 0 12px}
.ytPromo .cta{margin:0;box-shadow:none;background:var(--yt);padding:11px 18px;font-size:13px;display:inline-block}
.heroMain,.heroSide{max-width:100%}
.cols{display:block}
.cols>section h2:first-child{margin-top:46px}
@media(min-width:880px){
.headerInner,.utilInner,.heroInner,.wrap{max-width:1040px;padding-left:40px;padding-right:40px}
.wrap{padding-bottom:96px}
.heroInner{padding:48px 0 56px}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:start}
.heroSide{padding-top:8px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 56px}
.cols .full{grid-column:1 / -1}
h1{font-size:36px}
.big{font-size:86px}
}
`;

function page({ title, desc, canonical, heroHtml, restHtml, jsonld }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
${SITE.naverVerify ? `<meta name="naver-site-verification" content="${SITE.naverVerify}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.brand}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="ko_KR">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css">
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header class="top"><div class="headerInner">
  <a class="brand" href="./index.html"><span class="mark">🔔</span><span class="word">${SITE.brand}</span></a>
  <a class="sub" href="${SITE.kakao}">알림 단톡방</a>
</div></header>
<div class="utilBar"><div class="utilInner">
  <span>🚚 8만원 이상 무료배송</span>
  <span>🧾 150달러 이상 관세 발생</span>
  <span>🎁 추천코드 ${esc(db.referral)} 첫 구매 적립금</span>
</div></div>
<div class="heroBand"><div class="heroInner">
${heroHtml}
</div></div>
<div class="wrap">
${hasSample ? '<p class="warn">이 페이지는 예시 데이터로 생성되었습니다. data/discount.json 을 실제 값으로 교체한 뒤 배포하십시오.</p>' : ''}
${restHtml}
<footer>
  <nav><a href="./index.html">홈</a><a href="./daeran.html">대란 기록</a><a href="${SITE.kakao}">알림 단톡방</a></nav>
  <p>이 사이트는 제휴 링크를 통해 수수료를 받을 수 있습니다. 구매 금액에는 차이가 없습니다.</p>
  <p>표시된 할인율은 수집 시점의 관측값이며 실제 결제 금액과 다를 수 있습니다. 숨은 할인은 조건과 기간에 따라 적용되지 않을 수 있습니다. 구매 전 마이프로틴에서 최종 금액을 확인하십시오.</p>
  <p>마이프로틴(Myprotein)은 THG plc의 상표이며 본 사이트와 무관합니다.</p>
</footer>
</div>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
    navigator.clipboard.writeText(b.dataset.copy);
    var t=b.textContent;b.textContent='복사됨';setTimeout(function(){b.textContent=t},1200);
  });
});
</script>
</body>
</html>`;
}

const codeList = `<ul class="codes">${db.codes.map(c => `
  <li><span class="name">${c.label}<em>${c.note}</em></span><code>${c.code}</code>
  <button type="button" data-copy="${c.code}">복사</button></li>`).join('')}
  ${db.referral ? `<li><span class="name">신규 가입 추천인 코드<em>첫 구매 시 적립금</em></span><code>${db.referral}</code>
  <button type="button" data-copy="${db.referral}">복사</button></li>` : ''}
</ul>`;

const dealList = last.deals.length ? `<ul class="hidden-deals">${last.deals.map(d => `
  <li><div class="row"><span class="t">${d.label}</span><span class="r">+${d.rate}%</span></div>
  ${d.howto ? `<div class="d">${d.howto}</div>` : ''}
  <div class="when">${kdate(d.start)}부터 ${kdate(d.end)}까지</div></li>`).join('')}</ul>`
  : '<p class="lede">지금 확인된 추가 할인은 없습니다. 새로 발견되면 이 자리에 올립니다.</p>';

// 대란일 때만 큰 숫자(오렌지) 아래 흰색 손그림 밑줄을 넣습니다.
const underlineSvg = isDaeran ? `<svg class="underline" viewBox="0 0 200 16" preserveAspectRatio="none"><path d="M2 9 Q 40 2, 80 8 T 160 7 T 198 10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/></svg>` : '';

const ytPromo = `<div class="ytPromo">
  <div class="ytIcon">▶</div>
  <div>
    <p class="ytKicker">유튜브에서도 확인하세요</p>
    <p class="ytTitle">마프대란알리미</p>
    <p class="ytDesc">이 사이트는 마프대란알리미 유튜브 채널에서 이어집니다. 대란 예고나 숨은 할인 발견 소식을 영상으로 가장 먼저 보고 싶다면 구독해 두십시오.</p>
    <a class="cta" href="${SITE.youtube}" target="_blank" rel="noopener">채널 구독하기</a>
  </div>
</div>`;

const home = page({
  title: `마이프로틴 실질 할인율 ${pct(last.eff)} | 오늘 대란인가 | ${SITE.brand}`,
  desc: `${kdate(last.date)} 기준 기본 할인 ${last.base}%에 숨은 추가 할인을 더한 실질 할인율은 ${pct(last.eff)}입니다. ${isDaeran ? '지금 대란입니다.' : `대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`}`,
  canonical: `${SITE.origin}/`,
  jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  heroHtml: `
<div class="hero">
<div class="heroMain">
<span class="state ${isDaeran ? 'on' : 'off'}">${isDaeran ? '🔥 지금 대란입니다' : '지금은 대란이 아닙니다'}</span>
<h1>배너에 안 걸린 할인까지<br>합쳐서 계산했습니다</h1>
<p class="lede">기본 할인코드에 조건부 추가 할인까지 쌓은 실질 할인율입니다. ${kdate(last.date)} 기준입니다.</p>
<span class="numWrap"><span class="big ${isDaeran ? 'on' : ''}">${pct(last.eff)}</span>${underlineSvg}</span>
<p class="sub">${prevAvg !== null ? `전월 평균 ${pct(prevAvg)} 대비 ${delta > 0 ? '+' : ''}${delta}%p` : '이달 수집 시작'}${isDaeran ? '' : `, 대란 기준까지 ${gap}%p`}</p>
${bonus > 0 ? `<p class="formula">기본 ${last.base}% 에 숨은 할인 ${last.deals.length}건을 더해 <b>${pct(last.eff)}</b>가 됩니다.</p>` : ''}
<a class="cta" href="${esc(SITE.affiliate)}" rel="sponsored nofollow">할인코드 확인하고 구매하기</a>
</div>
<div class="heroSide">
${gauge()}
<dl class="stats">
  <div><dt>이달 평균</dt><dd>${pct(thisAvg)}</dd></div>
  <div><dt>마지막 대란</dt><dd>${lastEvent ? kdate(lastEvent.end) : '기록 없음'}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
</dl>
</div>
</div>`,
  restHtml: `
${ytPromo}
<div class="cols">
<section>
<h2>지금 쌓을 수 있는 숨은 할인</h2>
<p class="lede">배너에 크게 걸리지 않아 모르고 지나치기 쉬운 조건들입니다.</p>
${dealList}
</section>

<section>
<h2>지금 쓸 수 있는 할인코드</h2>
${codeList}
</section>

<section class="full">
<h2>최근 ${series.length}일 할인율</h2>
<p class="lede">진한 선이 실질 할인율, 점선이 기본 할인율입니다. 청록 구간이 대란이고 가로 점선이 대란 기준선 ${TH}%입니다.</p>
${trend()}
</section>

<section>
<h2>대란 기록</h2>
<table>
<thead><tr><th>기간</th><th>일수</th><th class="n">최고 할인율</th></tr></thead>
<tbody>${recent.slice(0, 5).map(e => `<tr><td>${kdate(e.start)}${e.start === e.end ? '' : ` – ${kdate(e.end)}`}</td><td>${e.days}일</td><td class="n">${pct(e.max)}</td></tr>`).join('')}</tbody>
</table>
<a class="cta ghost" href="./daeran.html">전체 대란 기록 보기</a>
</section>

<section>
<h2>자주 묻는 질문</h2>
${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
</section>

<section class="full">
<h2>숨은 할인이 뜨면 단톡방에 올립니다</h2>
<p class="lede">새 조건을 찾아내는 즉시 단톡방에 올립니다. 대란이 시작될 때도 바로 알려드립니다.</p>
<a class="cta" href="${SITE.kakao}">알림 단톡방 들어가기</a>
</section>
</div>
`,
});

const daeran = page({
  title: `마이프로틴 대란 날짜 기록 | 평균 주기 ${cycle ?? '집계 중'}일 | ${SITE.brand}`,
  desc: `역대 마이프로틴 대란이 언제였는지 실측 데이터로 확인하십시오. 관측 ${events.length}회, 최고 실질 할인율 ${pct(peak)}입니다.`,
  canonical: `${SITE.origin}/daeran.html`,
  jsonld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE.origin}/` },
    { '@type': 'ListItem', position: 2, name: '대란 기록', item: `${SITE.origin}/daeran.html` }] },
  heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴<br>대란 기록</h1>
<p class="lede">숨은 할인까지 합친 실질 할인율이 ${TH}% 이상으로 관측된 구간입니다. 예측이 아니라 실제 기록입니다.</p>
<p class="lede">${rows[0].date.replace(/-/g, '.')}부터 ${rows.length}일치를 수집했습니다.${daysSince !== null ? ` 마지막 대란은 ${daysSince}일 전입니다.` : ''}</p>
<a class="cta" href="${SITE.kakao}">알림 단톡방 들어가기</a>
<a class="cta ghost" href="./index.html">오늘 할인율 보기</a>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>총 대란</dt><dd>${events.length}회</dd></div>
  <div><dt>최고 할인율</dt><dd>${pct(peak)}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
</dl>
</div>
</div>`,
  restHtml: `
${ytPromo}
<div class="cols">
<section class="full" style="margin-top:46px">
${trend()}
</section>
<section class="full">
<h2>전체 기록</h2>
<table>
<thead><tr><th>기간</th><th>일수</th><th class="n">최고 할인율</th></tr></thead>
<tbody>${recent.map(e => `<tr><td>${kdate(e.start)}${e.start === e.end ? '' : ` – ${kdate(e.end)}`}</td><td>${e.days}일</td><td class="n">${pct(e.max)}</td></tr>`).join('')}</tbody>
</table>
<p class="lede">할인율은 보통 전날 저녁에 바뀝니다. 저녁 이후 관측값은 다음 날짜의 행사로 기록합니다.</p>
</section>
</div>
`,
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE.origin}/</loc><lastmod>${last.date}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
<url><loc>${SITE.origin}/daeran.html</loc><lastmod>${last.date}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
</urlset>`;

fs.writeFileSync(path.join(ROOT, 'index.html'), home);
fs.writeFileSync(path.join(ROOT, 'daeran.html'), daeran);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
console.log(`생성 완료 · 기본 ${last.base}% → 실질 ${last.eff}% · 숨은할인 ${last.deals.length}건 · 대란 ${events.length}회 · 평균 주기 ${cycle ?? '-'}일${hasSample ? ' · 예시 데이터 포함' : ''}`);
