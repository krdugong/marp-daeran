// data/products.json 을 읽어 완성된 정적 HTML을 생성합니다.
// 상품마다 핵심 지표는 "1회분(서빙)당 가격"입니다. 결제금액을 그날 받은 서빙 수로
// 나눠서 용량이나 프로모션이 달라도 같은 기준으로 비교합니다.
//
// featured:true 인 상품 하나가 index.html(홈)이 되고, 나머지는
// products/슬러그.html 로 각자 페이지를 갖습니다. 모든 페이지에 "전체 할인 보기"
// 토글이 붙어 다른 상품으로 오갈 수 있습니다.
//
// 검색로봇이 자바스크립트 없이도 숫자를 읽도록 그래프는 SVG로 빌드 시점에 그려서
// HTML에 직접 넣습니다.
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
  naverVerify: '',
};
const AVG_WINDOW_DAYS = 90;
// ───────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));

const esc = s => String(s).replace(/&/g, '&amp;');
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const kdate = s => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;
const daysBetween = (a, b) => (new Date(a) - new Date(b)) / 86400000;

const TIER_LABEL = { record: '역대 최저가', deal: '대란가', good: '평균 이하', normal: '평시가' };
const TIER_DESC = m => ({
  record: '지금까지 관측된 것 중 가장 쌉니다.',
  deal: `최근 ${AVG_WINDOW_DAYS}일 평균보다 ${m}% 이상 쌉니다.`,
  good: `최근 ${AVG_WINDOW_DAYS}일 평균보다 쌉니다.`,
  normal: `최근 ${AVG_WINDOW_DAYS}일 평균과 비슷하거나 더 비쌉니다.`,
});
const TIER_COLOR = { record: '#C0392B', deal: '#C57B22', good: '#1D4ED8', normal: '#5B6470' };

// ── 상품 하나에 대한 모든 통계 계산 ──────────────
function analyze(product) {
  const margin = product.dealMarginPct;
  const rows = [...product.entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, perServing: e.price / e.servings }));
  const hasSample = rows.some(r => r.source === 'sample');

  function statsAt(i) {
    const row = rows[i];
    const windowRows = rows.filter(r => r.date <= row.date && daysBetween(row.date, r.date) <= AVG_WINDOW_DAYS);
    const avg = windowRows.reduce((s, r) => s + r.perServing, 0) / windowRows.length;
    const priorRows = rows.filter(r => r.date < row.date);
    const minPrior = priorRows.length ? Math.min(...priorRows.map(r => r.perServing)) : row.perServing;
    const dealLine = avg * (1 - margin / 100);
    let tier;
    if (row.perServing <= minPrior) tier = 'record';
    else if (row.perServing <= dealLine) tier = 'deal';
    else if (row.perServing <= avg) tier = 'good';
    else tier = 'normal';
    return { avg, minPrior, dealLine, tier };
  }

  const rowsC = rows.map((r, i) => ({ ...r, ...statsAt(i) }));
  const last = rowsC.at(-1);
  const series = rowsC.slice(-90);
  const allMin = rowsC.reduce((m, r) => (r.perServing < m.perServing ? r : m), rowsC[0]);
  const allMax = rowsC.reduce((m, r) => (r.perServing > m.perServing ? r : m), rowsC[0]);

  const avgOf = list => list.reduce((s, r) => s + r.perServing, 0) / list.length;
  const ymOf = r => r.date.slice(0, 7);
  const ym = ymOf(last);
  const prevYm = (() => { const d = new Date(last.date + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const prevMonthList = rowsC.filter(r => ymOf(r) === prevYm);
  const prevMonthAvg = prevMonthList.length ? avgOf(prevMonthList) : null;
  const delta = prevMonthAvg === null ? null : Math.round(last.perServing - prevMonthAvg);

  const events = [];
  for (const r of rowsC) {
    const isDealDay = r.tier === 'deal' || r.tier === 'record';
    const cur = events.at(-1);
    const contiguous = cur && cur.open && daysBetween(r.date, cur.end) === 1;
    if (isDealDay && contiguous) { cur.end = r.date; cur.min = Math.min(cur.min, r.perServing); cur.days++; }
    else if (isDealDay) events.push({ start: r.date, end: r.date, min: r.perServing, days: 1, open: true });
    else if (cur) cur.open = false;
  }
  const recent = [...events].reverse();
  const cycle = events.length > 1
    ? Math.round(events.slice(1).reduce((s, e, i) => s + daysBetween(e.start, events[i].start), 0) / (events.length - 1))
    : null;
  const lastEvent = recent[0];
  const daysSinceEvent = lastEvent ? Math.round(daysBetween(last.date, lastEvent.end)) : null;

  return { product, margin, rowsC, last, series, allMin, allMax, events, recent, cycle, daysSinceEvent, prevMonthAvg, delta, hasSample };
}

const products = db.products;
const featured = products.find(p => p.featured) || products[0];
const analyses = new Map(products.map(p => [p.slug, analyze(p)]));
const linkOf = (p, prefix) => `${prefix}${p.slug === featured.slug ? 'index.html' : `products/${p.slug}.html`}`;

// ── SVG 게이지/추이 그래프 ──
function gauge(a) {
  const { last, allMin, allMax } = a;
  const vals = [allMin.perServing, allMax.perServing, last.perServing, last.dealLine];
  const lo = Math.min(...vals) * 0.96, hi = Math.max(...vals) * 1.05;
  const W = 640, H = 104, pad = 16;
  const x = v => pad + ((v - lo) / (hi - lo)) * (W - pad * 2);
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="1회분당 ${Math.round(last.perServing)}원, 대란 기준 ${Math.round(last.dealLine)}원 이하">
  <rect x="${x(lo)}" y="46" width="${Math.max(x(last.dealLine) - x(lo), 0)}" height="14" rx="7" fill="#F6D9D3"/>
  <rect x="${x(last.dealLine)}" y="46" width="${Math.max(x(hi) - x(last.dealLine), 0)}" height="14" rx="7" fill="#DDE3EA"/>
  <line x1="${x(last.dealLine)}" y1="30" x2="${x(last.dealLine)}" y2="74" stroke="#C0392B" stroke-width="2" stroke-dasharray="3 3"/>
  <text x="${x(last.dealLine)}" y="24" class="g-note" fill="#C0392B" text-anchor="middle">대란 ${won(last.dealLine)} 이하</text>
  <text x="${x(lo)}" y="98" class="g-tick">최저 ${won(allMin.perServing)}</text>
  <text x="${x(hi)}" y="98" class="g-tick" text-anchor="end">최고 ${won(allMax.perServing)}</text>
  <circle cx="${x(last.perServing)}" cy="53" r="11" fill="${TIER_COLOR[last.tier]}"/>
  <circle cx="${x(last.perServing)}" cy="53" r="4" fill="#fff"/>
</svg>`;
}

function trend(a) {
  const { series, last, events } = a;
  const W = 640, H = 210, L = 52, R = 12, T = 16, B = 26;
  const vals = series.flatMap(r => [r.perServing, r.avg]);
  const lo = Math.min(...vals) * 0.98, hi = Math.max(...vals) * 1.02;
  const x = i => L + (i / Math.max(series.length - 1, 1)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const lineOf = key => series.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(' ');
  const bands = events.filter(e => e.end >= series[0].date).map(e => {
    const s = series.findIndex(r => r.date === e.start), en = series.findIndex(r => r.date === e.end);
    if (s < 0) return '';
    return `<rect x="${x(s) - 2}" y="${T}" width="${Math.max(x(en) - x(s) + 4, 5)}" height="${H - T - B}" fill="#C0392B" opacity=".1"/>`;
  }).join('');
  const labels = [lo, (lo + hi) / 2, hi].map(v => `<text x="4" y="${y(v) + 4}" class="g-tick">${Math.round(v).toLocaleString('ko-KR')}</text>`).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${series.length}건 1회분당 가격 추이">
  ${bands}${labels}
  <path d="${lineOf('avg')}" fill="none" stroke="#B4BDC7" stroke-width="1.5" stroke-dasharray="3 3"/>
  <path d="${lineOf('perServing')}" fill="none" stroke="#1D4ED8" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${x(series.length - 1)}" cy="${y(last.perServing)}" r="5" fill="${TIER_COLOR[last.tier]}"/>
  <text x="${L}" y="${H - 6}" class="g-tick">${kdate(series[0].date)}</text>
  <text x="${W - R}" y="${H - 6}" class="g-tick" text-anchor="end">오늘</text>
</svg>`;
}

// ── "전체 할인 보기" 토글: 검색창 + 모든 상품 카드. 자바스크립트 없이도 열립니다. ──
function allProductsBlock(currentSlug, prefix) {
  const cards = products.map(p => {
    const a = analyses.get(p.slug);
    const self = p.slug === currentSlug;
    return `<a class="prodCard${self ? ' self' : ''}" href="${self ? '#' : linkOf(p, prefix)}" data-name="${esc(p.name.toLowerCase())}">
  <span class="pc-top"><span class="pc-name">${p.name}${self ? ' <em>(지금 보는 중)</em>' : ''}</span>
  <span class="pc-tier ${a.last.tier}">${TIER_LABEL[a.last.tier]}</span></span>
  <span class="pc-price">${won(a.last.perServing)} <span class="pc-unit">/ 1회분</span></span>
</a>`;
  }).join('');
  return `<details class="allProducts">
<summary>전체 할인 보기 <span class="count">(${products.length}개 상품)</span></summary>
<div class="apInner">
<input type="text" id="prodSearch" placeholder="상품 이름으로 검색" autocomplete="off">
<div id="prodList" class="prodGrid">${cards}</div>
<p id="prodEmpty" class="lede" style="display:none;margin:8px 0 0">검색 결과가 없습니다.</p>
</div>
</details>`;
}

const searchScript = `
(function(){
  var input=document.getElementById('prodSearch');
  if(!input) return;
  var cards=[].slice.call(document.querySelectorAll('#prodList .prodCard'));
  var empty=document.getElementById('prodEmpty');
  input.addEventListener('input',function(){
    var q=input.value.trim().toLowerCase();
    var shown=0;
    cards.forEach(function(c){
      var hit=!q || c.dataset.name.indexOf(q)>-1;
      c.style.display=hit?'':'none';
      if(hit) shown++;
    });
    empty.style.display = shown===0 ? 'block' : 'none';
  });
})();`;

const css = `
:root{--ink:#12161C;--muted:#5B6470;--line:#E3E7EB;--surface:#F4F6F8;--blue:#1D4ED8;--flame:#C0392B;--amber:#C57B22}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font-family:Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum"}
.wrap{max-width:560px;margin:0 auto;padding:0 20px 72px}
a{color:inherit}
header.top{display:flex;justify-content:space-between;align-items:center;height:56px;border-bottom:1px solid var(--line);margin-bottom:20px}
.logo{font-weight:800;letter-spacing:-.02em;text-decoration:none;font-size:15px}
.top a.sub{font-size:13px;color:var(--muted);text-decoration:none}
h1{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1.35;margin:0 0 10px}
h2{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:44px 0 12px}
p{margin:0 0 12px}
.lede{color:var(--muted);font-size:14px}
.state{display:inline-block;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;margin-bottom:14px}
.state.record{background:#FBEAE7;color:var(--flame)}
.state.deal{background:#FDEEDC;color:var(--amber)}
.state.good{background:#E7F0FF;color:var(--blue)}
.state.normal{background:var(--surface);color:var(--muted)}
.big{font-size:64px;font-weight:800;letter-spacing:-.045em;line-height:1;margin:6px 0 2px}
.big.record,.big.deal{color:var(--flame)}
.sub{font-size:14px;color:var(--muted);margin-bottom:6px}
.formula{font-size:13px;color:var(--muted);margin:0 0 16px}
svg.gauge,svg.trend{width:100%;height:auto;display:block;margin:6px 0 20px}
.g-tick{font-size:11px;fill:#8A939E}
.g-note{font-size:11px;font-weight:700}
.cta{display:block;text-align:center;background:var(--ink);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:15px;border-radius:12px;margin:8px 0}
.cta.ghost{background:var(--surface);color:var(--ink)}
.cta:hover{opacity:.88}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:20px 0}
.stats div{background:#fff;padding:14px 12px}
.stats dt{font-size:12px;color:var(--muted);margin-bottom:4px}
.stats dd{margin:0;font-size:16px;font-weight:700;letter-spacing:-.02em}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:11px 4px;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--muted);font-weight:600}
td.n{text-align:right;font-weight:700}
.codes{list-style:none;padding:0;margin:0}
.codes li{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}
.codes .name{flex:1;font-size:14px}
.codes .name em{display:block;font-style:normal;font-size:12px;color:var(--muted)}
.codes code{font-weight:700;font-size:15px;letter-spacing:.02em}
.codes button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.codes button:focus-visible,.cta:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
details{border-bottom:1px solid var(--line)}
summary{cursor:pointer;padding:14px 0;font-size:14px;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
details p{font-size:14px;color:var(--muted);padding-bottom:14px}
details.allProducts{border:1px solid var(--line);border-radius:12px;padding:0 16px;margin-bottom:24px;background:var(--surface)}
details.allProducts summary{padding:14px 0}
details.allProducts .count{color:var(--muted);font-weight:500}
.apInner{padding-bottom:16px}
#prodSearch{width:100%;font-family:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;margin-bottom:10px;background:#fff}
.prodGrid{display:grid;gap:8px}
.prodCard{display:block;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;text-decoration:none;color:inherit}
.prodCard.self{background:var(--ink);border-color:var(--ink);color:#fff}
.prodCard.self .pc-name em{color:#B4BDC7}
.pc-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.pc-name{font-size:14px;font-weight:600}
.pc-name em{font-style:normal;font-size:12px;color:var(--muted)}
.pc-tier{font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;flex-shrink:0}
.pc-tier.record{background:#FBEAE7;color:var(--flame)}
.pc-tier.deal{background:#FDEEDC;color:var(--amber)}
.pc-tier.good{background:#E7F0FF;color:var(--blue)}
.pc-tier.normal{background:rgba(0,0,0,.05);color:var(--muted)}
.prodCard.self .pc-tier.normal{background:rgba(255,255,255,.12);color:#fff}
.pc-price{display:block;margin-top:4px;font-size:16px;font-weight:700}
.pc-unit{font-size:12px;font-weight:500;color:var(--muted)}
.prodCard.self .pc-unit{color:#B4BDC7}
footer{margin-top:52px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
footer nav{margin-bottom:10px}
footer nav a{margin-right:14px;text-decoration:none}
.warn{background:#FFF6D6;border:1px solid #E8D48A;border-radius:10px;padding:12px;font-size:13px;margin-bottom:20px}
.heroMain,.heroSide{max-width:100%}
.cols{display:block}
.cols>section h2:first-child{margin-top:44px}
@media(min-width:880px){
.wrap{max-width:1040px;padding:0 40px 96px}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:start;padding-top:8px}
.heroSide{padding-top:56px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 56px}
.cols .full{grid-column:1 / -1}
.prodGrid{grid-template-columns:1fr 1fr}
h1{font-size:34px}
.big{font-size:78px}
}
`;

function page({ title, desc, canonical, prefix, currentSlug, body, jsonld }) {
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
<div class="wrap">
<header class="top">
  <a class="logo" href="${prefix}index.html">${SITE.brand}</a>
  <a class="sub" href="${SITE.kakao}">알림 단톡방</a>
</header>
${allProductsBlock(currentSlug, prefix)}
${body}
<footer>
  <nav><a href="${prefix}index.html">홈</a><a href="${prefix}daeran.html">대란 기록</a><a href="${SITE.kakao}">알림 단톡방</a></nav>
  <p>이 사이트는 제휴 링크를 통해 수수료를 받을 수 있습니다. 구매 금액에는 차이가 없습니다.</p>
  <p>표시된 가격은 수집 시점의 관측값이며 실제 결제 금액과 다를 수 있습니다. 구매 전 마이프로틴에서 최종 금액을 확인하십시오.</p>
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
${searchScript}
</script>
</body>
</html>`;
}

const codeList = `<ul class="codes">${(db.codes || []).map(c => `
  <li><span class="name">${c.label}<em>${c.note}</em></span><code>${c.code}</code>
  <button type="button" data-copy="${c.code}">복사</button></li>`).join('')}
  ${db.referral ? `<li><span class="name">신규 가입 추천인 코드<em>첫 구매 시 적립금</em></span><code>${db.referral}</code>
  <button type="button" data-copy="${db.referral}">복사</button></li>` : ''}
</ul>`;

function faqFor(a) {
  return [
    ['1회분당 가격이 뭔가요?',
     '실제 결제한 총액을 서빙(1회 제공량) 수로 나눈 값입니다. 프로모션마다 용량과 서빙 수가 달라서 총액만 비교하면 어떤 게 진짜 싼 건지 헷갈립니다. 1회분당 가격으로 맞추면 어떤 용량이든 같은 기준으로 비교할 수 있습니다.'],
    ['대란가 기준이 뭔가요?',
     `최근 ${AVG_WINDOW_DAYS}일 관측 평균보다 ${a.margin}% 이상 싸면 대란가로 표시합니다. 마이프로틴이 정한 기준이 아니라 이 사이트가 실제 관측값으로 정한 기준입니다.`],
    ['정가 대비 몇 % 할인인지는 안 나오나요?',
     '공식 정가는 시즌마다 바뀌고 그대로 믿기 어려워서 쓰지 않습니다. 대신 실제로 관측된 가격들의 평균과 최저가를 기준으로 지금이 싼지 비싼지를 판단합니다.'],
    ['다음 대란은 언제 오나요?',
     a.cycle ? `지금까지 관측된 대란은 ${a.events.length}회이고 시작일 기준 평균 간격은 약 ${a.cycle}일입니다. 마이프로틴이 일정을 공개하지 않아 다음 날짜를 보장할 수는 없습니다.` : '기록이 더 쌓이면 평균 주기를 계산합니다.'],
    ['다른 상품도 확인할 수 있나요?',
     '됩니다. 위쪽 전체 할인 보기를 누르면 등록된 모든 상품의 오늘 가격과 판정을 볼 수 있고, 이름으로 검색도 됩니다.'],
  ];
}

function productPage(p, prefix) {
  const a = analyses.get(p.slug);
  const { last, allMin, events, recent, cycle, prevMonthAvg, delta, hasSample } = a;
  const FAQ = faqFor(a);
  const canonical = `${SITE.origin}/${p.slug === featured.slug ? '' : `products/${p.slug}.html`}`;
  return page({
    title: `${p.name} 1회분당 ${won(last.perServing)} | 지금 대란가인가 | ${SITE.brand}`,
    desc: `${kdate(last.date)} 기준 ${p.name} 1회분당 가격은 ${won(last.perServing)}입니다. ${TIER_DESC(a.margin)[last.tier]}`,
    canonical, prefix, currentSlug: p.slug,
    jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })) },
    body: `
${hasSample ? '<p class="warn">이 상품은 예시 데이터로 생성되었습니다. data/products.json 을 실제 관측값으로 교체한 뒤 배포하십시오.</p>' : ''}
<div class="hero">
<div class="heroMain">
<span class="state ${last.tier}">${TIER_LABEL[last.tier]}</span>
<h1>${p.name},<br>지금 사도 되는 가격입니까</h1>
<p class="lede">1회분(서빙)당 가격을 기준으로 판단합니다. 용량이나 프로모션이 달라도 같은 기준으로 비교됩니다. ${kdate(last.date)} 기준입니다.</p>
<div class="big ${last.tier}">${won(last.perServing)}</div>
<p class="sub">1회분 기준 · ${TIER_DESC(a.margin)[last.tier]}</p>
<p class="formula">오늘 결제가 ${won(last.price)} · ${last.servings}회분 환산${prevMonthAvg !== null ? ` · 전월 평균 대비 ${delta > 0 ? '+' : ''}${delta.toLocaleString('ko-KR')}원` : ''}${last.note ? ` · ${last.note}` : ''}</p>
<a class="cta" href="${esc(SITE.affiliate)}" rel="sponsored nofollow">가격 확인하고 구매하기</a>
</div>
<div class="heroSide">
${gauge(a)}
<dl class="stats">
  <div><dt>최근 ${AVG_WINDOW_DAYS}일 평균</dt><dd>${won(last.avg)}</dd></div>
  <div><dt>역대 최저</dt><dd>${won(allMin.perServing)}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
</dl>
</div>
</div>

<div class="cols">
<section class="full">
<h2>최근 ${a.series.length}건 가격 추이</h2>
<p class="lede">진한 선이 1회분당 가격, 점선이 ${AVG_WINDOW_DAYS}일 이동평균입니다. 붉은 구간이 대란입니다.</p>
${trend(a)}
</section>

<section>
<h2>대란 기록</h2>
<table>
<thead><tr><th>기간</th><th>일수</th><th class="n">최저 1회분가</th></tr></thead>
<tbody>${recent.slice(0, 5).map(e => `<tr><td>${kdate(e.start)}${e.start === e.end ? '' : ` – ${kdate(e.end)}`}</td><td>${e.days}일</td><td class="n">${won(e.min)}</td></tr>`).join('')}</tbody>
</table>
${p.slug === featured.slug ? `<a class="cta ghost" href="${prefix}daeran.html">전체 대란 기록 보기</a>` : ''}
</section>

<section>
<h2>구매할 때 쓸 코드</h2>
${codeList}
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${FAQ.map(([q, ans]) => `<details><summary>${q}</summary><p>${ans}</p></details>`).join('')}
</section>

<section class="full">
<h2>대란가가 뜨면 단톡방에 올립니다</h2>
<p class="lede">역대 최저가나 대란가를 관측하는 즉시 단톡방에 올립니다.</p>
<a class="cta" href="${SITE.kakao}">알림 단톡방 들어가기</a>
</section>
</div>
`,
  });
}

function daeranPage() {
  const a = analyses.get(featured.slug);
  const { last, allMin, events, recent, cycle, daysSinceEvent, rowsC } = a;
  return page({
    title: `${featured.name} 대란 기록 | 평균 주기 ${cycle ?? '집계 중'}일 | ${SITE.brand}`,
    desc: `역대 ${featured.name} 대란이 언제였는지 실측 데이터로 확인하십시오. 관측 ${events.length}회, 역대 최저 1회분당 ${won(allMin.perServing)}입니다.`,
    canonical: `${SITE.origin}/daeran.html`, prefix: '', currentSlug: null,
    jsonld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE.origin}/` },
      { '@type': 'ListItem', position: 2, name: '대란 기록', item: `${SITE.origin}/daeran.html` }] },
    body: `
<div class="hero">
<div class="heroMain">
<h1>${featured.name}<br>대란 기록</h1>
<p class="lede">1회분당 가격이 최근 ${AVG_WINDOW_DAYS}일 평균보다 ${a.margin}% 이상 싸거나 역대 최저를 경신한 구간입니다. 예측이 아니라 실제 기록입니다.</p>
<p class="lede">${rowsC[0].date.replace(/-/g, '.')}부터 ${rowsC.length}건을 수집했습니다.${daysSinceEvent !== null ? ` 마지막 대란은 ${daysSinceEvent}일 전입니다.` : ''}</p>
<a class="cta" href="${SITE.kakao}">알림 단톡방 들어가기</a>
<a class="cta ghost" href="./index.html">오늘 가격 보기</a>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>총 대란</dt><dd>${events.length}회</dd></div>
  <div><dt>역대 최저</dt><dd>${won(allMin.perServing)}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
</dl>
</div>
</div>

<div class="cols">
<section class="full" style="margin-top:44px">
${trend(a)}
</section>
<section class="full">
<h2>전체 기록</h2>
<table>
<thead><tr><th>기간</th><th>일수</th><th class="n">최저 1회분가</th></tr></thead>
<tbody>${recent.map(e => `<tr><td>${kdate(e.start)}${e.start === e.end ? '' : ` – ${kdate(e.end)}`}</td><td>${e.days}일</td><td class="n">${won(e.min)}</td></tr>`).join('')}</tbody>
</table>
<p class="lede">가격은 발견하는 대로 기록합니다. 매일 자동으로 갱신되지 않습니다.</p>
</section>
</div>
`,
  });
}

// ── 파일 출력 ──
fs.writeFileSync(path.join(ROOT, 'index.html'), productPage(featured, ''));
fs.writeFileSync(path.join(ROOT, 'daeran.html'), daeranPage());

const others = products.filter(p => p.slug !== featured.slug);
if (others.length) fs.mkdirSync(path.join(ROOT, 'products'), { recursive: true });
for (const p of others) {
  fs.writeFileSync(path.join(ROOT, 'products', `${p.slug}.html`), productPage(p, '../'));
}

const urls = [
  { loc: `${SITE.origin}/`, date: analyses.get(featured.slug).last.date, pri: '1.0' },
  { loc: `${SITE.origin}/daeran.html`, date: analyses.get(featured.slug).last.date, pri: '0.8' },
  ...others.map(p => ({ loc: `${SITE.origin}/products/${p.slug}.html`, date: analyses.get(p.slug).last.date, pri: '0.7' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u.loc}</loc><lastmod>${u.date}</lastmod><changefreq>daily</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

const fLast = analyses.get(featured.slug).last;
console.log(`생성 완료 · 상품 ${products.length}개 · 대표(${featured.name}) 1회분당 ${Math.round(fLast.perServing)}원(${TIER_LABEL[fLast.tier]}) · products/ 파일 ${others.length}개`);
