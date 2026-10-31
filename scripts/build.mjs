// data/discount.json 과 data/site.json 을 읽어 정적 HTML을 전부 생성합니다.
// 사람이 고치는 파일은 data/ 폴더의 두 JSON뿐입니다. 나머지는 전부 생성물입니다.
//
//   index.html               오늘 할인율 (메인)
//   code.html                마이프로틴 할인코드 (키워드: 마이프로틴 할인코드)
//   daeran.html              전체 대란 기록 + 월별 목록
//   daeran-YYYY-MM.html      월별 대란 페이지 (키워드: 마이프로틴 N월 대란)
//   404.html                 없는 주소에 보여주는 안내 (검색엔진 제외)
//   sitemap.xml, rss.xml, robots.txt, CNAME, manifest.webmanifest
//
// 대란 판정은 할인코드 할인율(base)로 합니다. 숨은 할인을 합친 실질 할인율은
// "실제로 받는 할인"으로 보여주기만 합니다. 숨은 할인은 평소에도 붙는 경우가 많아
// 합친 값으로 판정하면 거의 매일이 대란이 되기 때문입니다.
//
// 실행: node scripts/build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

const cfg = readJson('data/site.json');
const db = readJson('data/discount.json');

// 도메인이 있으면 그 도메인, 없으면 깃허브 페이지 주소
const domain = String(cfg.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
const SITE = { ...cfg, origin: domain ? `https://${domain}` : cfg.githubPagesUrl.replace(/\/+$/, '') };

// ── 공통 도우미 ──
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = n => (Number.isInteger(n) ? n : n.toFixed(1)) + '%';
const pctOr = n => (n == null ? '영상 참고' : pct(n));
const r1 = n => Math.round(n * 10) / 10;
const kdate = s => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;
const dot = s => s.replace(/-/g, '.');
const ymOf = s => s.slice(0, 7);
const Y = ym => +ym.slice(0, 4);
const M = ym => +ym.slice(5, 7);
const shiftYm = (ym, n) => new Date(Date.UTC(Y(ym), M(ym) - 1 + n, 1)).toISOString().slice(0, 7);
const daysIn = ym => new Date(Date.UTC(Y(ym), M(ym), 0)).getUTCDate();
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const monthFile = ym => `daeran-${ym}.html`;
const range = e => `${kdate(e.start)}${e.start === e.end ? '' : ` – ${kdate(e.end)}`}`;
const ytWatch = id => `https://www.youtube.com/watch?v=${id}`;

// ── 매일 기록 ──
const TH = db.threshold;
const DEALS = (db.deals || []).filter(d => !d.disabled);
const rows = [...(db.entries || [])].sort((a, b) => a.date.localeCompare(b.date));
if (!rows.length) throw new Error('data/discount.json 의 entries 가 비어 있습니다. 오늘 할인율을 한 줄 이상 넣으십시오.');
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
const curYm = ymOf(last.date);

// ── 대란: 매일 기록에서 계산 + 기록 시작 전 대란(history) ──
const HISTORY = (db.history || []).map(h => ({ start: h.start, end: h.end || h.start, max: h.max ?? null, note: h.note || '', videos: h.videos || [], daeran: h.daeran !== false }));
const allVideos = HISTORY.flatMap(h => h.videos).sort((a, b) => a.date.localeCompare(b.date));

const liveEvents = [];
for (const d of day) {
  const cur = liveEvents.at(-1);
  const contiguous = cur && cur.open && daysBetween(cur.end, d.date) === 1;
  if (d.base >= TH && contiguous) { cur.end = d.date; cur.max = Math.max(cur.max, d.base); cur.days++; }
  else if (d.base >= TH) liveEvents.push({ start: d.date, end: d.date, max: d.base, days: 1, open: true, note: '', videos: [] });
  else if (cur) cur.open = false;
}
for (const e of liveEvents) for (const h of HISTORY) if (h.start <= e.end && h.end >= e.start) e.videos.push(...h.videos);
const histEvents = HISTORY.filter(h => h.daeran && h.end < rows[0].date).map(h => ({ ...h, days: daysBetween(h.start, h.end) + 1 }));
const events = [...histEvents, ...liveEvents].sort((a, b) => a.start.localeCompare(b.start));
const recent = [...events].reverse();
const cycle = events.length > 1
  ? Math.round(events.slice(1).reduce((s, e, i) => s + daysBetween(events[i].start, e.start), 0) / (events.length - 1))
  : null;

const isDaeran = last.base >= TH;
const gap = r1(TH - last.base);
const lastEvent = recent[0];
const daysSince = lastEvent ? daysBetween(lastEvent.end, last.date) : null;
const bonus = r1(last.eff - last.base);
const knownMax = events.map(e => e.max).filter(v => v != null);
const peak = knownMax.length ? Math.max(...knownMax) : null;

// 마이프로틴이 예고한 다가오는 행사 (data/discount.json 의 announced)
const announced = (db.announced || []).filter(a => a.date && a.date >= last.date).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
let nextGuess = null;
if (lastEvent && cycle && !isDaeran) { nextGuess = addDays(lastEvent.start, cycle); while (nextGuess <= last.date) nextGuess = addDays(nextGuess, cycle); }

const monthStats = ym => {
  const ds = day.filter(d => ymOf(d.date) === ym);
  const evs = events.filter(e => ymOf(e.start) === ym || ymOf(e.end) === ym);
  const evMax = evs.map(e => e.max).filter(v => v != null);
  return {
    ym, days: ds, events: evs,
    videos: allVideos.filter(v => ymOf(v.date) === ym),
    evMax: evMax.length ? Math.max(...evMax) : null,
    dayMax: ds.length ? Math.max(...ds.map(d => d.base)) : null,
    lastDate: ds.at(-1)?.date ?? null,
  };
};
const months = [...new Set([...day.map(d => ymOf(d.date)), ...events.flatMap(e => [ymOf(e.start), ymOf(e.end)]), ...allVideos.map(v => ymOf(v.date))])].sort();

// 해마다 행사가 걸리는 날 (월별 페이지의 "체크할 날짜"). 11월은 코드에 넣어 두고, 그 밖의 날은 discount.json 의 calendar 에 { "date": "2026-12-26", "label": "...", "note": "..." } 로 넣으면 됩니다.
const wd = s => '일월화수목금토'[new Date(s + 'T00:00:00Z').getUTCDay()] + '요일';
const blackFriday = y => { const firstThu = 1 + ((4 - new Date(Date.UTC(y, 10, 1)).getUTCDay() + 7) % 7); return `${y}-11-${String(firstThu + 22).padStart(2, '0')}`; };
const seasonal = ym => {
  const y = Y(ym), m = M(ym), list = [];
  if (m === 11) {
    const bf = blackFriday(y);
    list.push({ date: `${y}-11-11`, label: '싱글즈데이(빼빼로데이)', note: '해마다 큰 행사가 걸리는 날입니다. 전날 저녁부터 할인율을 확인하세요.' });
    list.push({ date: bf, label: '블랙프라이데이', note: '1년 중 할인이 가장 센 주간입니다. 전주부터 예열 행사가 붙는 경우가 많습니다.', link: 'blackfriday.html' });
    list.push({ date: addDays(bf, 3), label: '사이버먼데이', note: '블랙프라이데이 행사가 보통 이날까지 이어집니다.', minor: true });
  }
  for (const c of db.calendar || []) if (c.date && ymOf(c.date) === ym) list.push(c);
  // 마이프로틴이 예고한 행사는 같은 날 항목을 덮어쓰고, 없으면 추가합니다
  for (const a of db.announced || []) {
    if (!a.date || ymOf(a.date) !== ym) continue;
    const hit = list.find(x => x.date === a.date), it = { ...a, label: `${a.label} (마이프로틴 예고)` };
    if (hit) Object.assign(hit, it); else list.push(it);
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
};
// 월말 10일 동안은 다음 달 페이지를 미리 만들어 둡니다 ("마이프로틴 N월 대란" 검색은 그 달이 오기 전부터 생깁니다)
const upcomingYm = (+last.date.slice(8, 10) > daysIn(curYm) - 10) ? shiftYm(curYm, 1) : null;
const monthPages = upcomingYm && !months.includes(upcomingYm) ? [...months, upcomingYm] : months;

// ── 할인코드 ──
// until 은 그날 한국시간 저녁 7시(collect.mjs 의 rolloverHour)에 끝난 것으로 봅니다. untilTime("23:59" 등)이 있으면 그 시각까지 둡니다.
// 수집이 멈춰도 마감된 코드는 내려갑니다 (페이지를 다시 만들 때 기준).
const ROLLOVER_HOUR = 19;
const kstNow = new Date(Date.now() + 9 * 3600e3).toISOString();
const nowStamp = kstNow.slice(0, 10) + ' ' + kstNow.slice(11, 16);
const nowDay = (() => { const n = new Date(Date.now() + 9 * 3600e3); const d = n.toISOString().slice(0, 10), hm = n.toISOString().slice(11, 16); const ext = (db.codes || []).some(c => c.until === d && c.untilTime && hm < c.untilTime); if (n.getUTCHours() >= ROLLOVER_HOUR && !ext) n.setUTCDate(n.getUTCDate() + 1); return n.toISOString().slice(0, 10); })();
const codeDay = nowDay > last.date ? nowDay : last.date;
const endStamp = c => `${c.until} ${c.untilTime || String(ROLLOVER_HOUR).padStart(2, '0') + ':00'}`;
const CODES = (db.codes || []).filter(c => !c.until || (c.until >= codeDay && nowStamp < endStamp(c))).map(c => ({ ...c }));
// 자동 수집이 배너에서 공식 코드 이름까지 읽었으면 공식 코드를 그 이름과 할인율로 채웁니다 (목록의 공식 코드와 이름이 다르면 배너 쪽을 씀)
const lastRow = rows.at(-1);
if (lastRow.source === 'auto' && lastRow.officialCode && lastRow.official != null) {
  const at = CODES.findIndex(c => c.official);
  const listed = at >= 0 && CODES[at].code === lastRow.officialCode ? CODES[at] : {};
  const banner = { label: '공식 행사 코드', note: '마이프로틴 메인 배너 코드', ...listed, code: lastRow.officialCode, rate: lastRow.official, official: true };
  if (at >= 0) CODES[at] = banner; else CODES.push(banner);
}
const official = CODES.find(c => c.official);
const primary = CODES.find(c => c.primary) || CODES.find(c => !c.official) || CODES[0];
// 메인 코드 할인율은 그날 기록(base)과 같게 맞춥니다. 다른 코드도 메인 코드와의 차이를 유지한 채 같이 움직입니다 ("fixed": true 인 코드는 그대로)
if (primary && !primary.official && primary.rate != null && primary.rate !== last.base) {
  const shift = last.base - primary.rate;
  for (const c of CODES) if (c.rate != null && !c.official && !c.fixed) c.rate = r1(c.rate + shift);
}
const extraOf = c => (official && c !== official && c.rate != null && official.rate != null && c.rate > official.rate) ? r1(c.rate - official.rate) : null;
const nameOf = c => c.secret ? '히든코드' : c.code;
// 복사용 코드는 페이지 소스에 평문으로 안 남게 base64 로 넣고, 누를 때 풀어서 복사합니다 (히든코드가 검색 캐시나 소스 보기에 글자로 안 잡히게)
const b64 = s => Buffer.from(String(s)).toString('base64');
const goAttrs = (code, label) => `href="${esc(SITE.affiliate)}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(code)}"${label ? ` data-label="${esc(label)}"` : ''}`;

// ── 할인 계산기 ──
// 계산 순서: 할인코드(%) → 정액 할인(쇼핑지원금 등, 할인코드 적용 후 금액이 min 이상일 때) → 나머지 % 할인(이달의 트렌드 등)
const SHOP = { freeShipping: 80000, customsUsd: 150, usdKrw: 1400, ...(db.shop || {}) };
const CALC_CODES = CODES.filter(c => c.rate != null);
const daeranRate = knownMax.length ? Math.round(knownMax.reduce((s, v) => s + v, 0) / knownMax.length) : null;
const calcData = {
  codes: CALC_CODES.map(c => ({ code: b64(c.code), name: nameOf(c), rate: c.rate })),
  deals: last.deals.map(d => ({ label: d.label, type: d.type === 'amount' ? 'amount' : 'percent', rate: d.rate, amount: d.amount || 0, min: d.min || 0 })),
  shop: SHOP,
  daeranRate,
};
const calcWidget = CALC_CODES.length ? `<div class="calc">
<div class="calcIn">
<label class="f" for="cartAmt">장바구니 금액 (할인코드 넣기 전)</label>
<div class="amt"><input id="cartAmt" inputmode="numeric" autocomplete="off" value="120,000" aria-label="장바구니 금액"><span>원</span></div>
<div class="chips">${[50000, 80000, 120000, 150000, 200000].map(v => `<button type="button" data-amt="${v}">${v / 10000}만원</button>`).join('')}</div>
<fieldset><legend class="f">할인코드</legend><div class="opts">${CALC_CODES.map((c, i) => `
  <label class="opt"><input type="radio" name="calcCode" value="${i}"${c === primary ? ' checked' : ''}><span class="ol">${esc(nameOf(c))} <small>${esc(c.label)}</small></span><span class="or">${c.rate}%</span></label>`).join('')}</div></fieldset>
${last.deals.length ? `<fieldset><legend class="f">숨은 할인 조건</legend><div class="opts">${last.deals.map((d, i) => `
  <label class="opt"><input type="checkbox" data-deal="${i}" checked><span class="ol">${(m => m ? `${esc(m[1])}<small>${esc(m[2])}</small>` : esc(d.calcLabel || d.label))((d.calcLabel || '').match(/^(.*?)\s*\((.+)\)$/))}</span><span class="or">${d.type === 'amount' ? `-${(d.amount / 1000).toLocaleString('ko-KR')}천원` : `-${d.rate}%`}</span></label>`).join('')}</div></fieldset>` : ''}
</div>
<div class="calcOut">
<div class="res" aria-live="polite">
  <div class="lbl">예상 최종 결제금액</div>
  <div class="final" id="cFinal">-</div>
  <div class="save" id="cSave"></div>
  <table><tbody id="cLines"></tbody></table>
  <ul class="tips" id="cTips"></ul>
</div>
<a class="cta hot" id="cGo" ${goAttrs((CALC_CODES.includes(primary) ? primary : CALC_CODES[0]).code, nameOf(CALC_CODES.includes(primary) ? primary : CALC_CODES[0]))}>${esc(nameOf(CALC_CODES.includes(primary) ? primary : CALC_CODES[0]))} 복사하고 이 금액으로 사기</a>
<p class="hint">${kdate(last.date)} 조건 기준 예상값입니다. 세일 상품은 코드가 빠질 수 있으니 장바구니에서 최종 확인하세요.</p>
</div>
</div>
<script type="application/json" id="calcData">${JSON.stringify(calcData).replace(/</g, '\\u003c')}</script>` : '';
const calcScript = `<script>
(function(){
  var D=JSON.parse(document.getElementById('calcData').textContent);
  function $(id){return document.getElementById(id)}
  var inp=$('cartAmt');
  var qa=(location.search.match(/[?&]amt=(\\d+)/)||[])[1];if(qa)inp.value=(+qa).toLocaleString('ko-KR');
  function num(s){return parseInt(String(s).replace(/[^0-9]/g,''),10)||0}
  function won(n){return Math.round(n).toLocaleString('ko-KR')+'원'}
  function run(cart,rate,on){
    var a=cart*(1-rate/100),lines=[['할인코드 '+rate+'%',cart-a]],need=[];
    D.deals.forEach(function(d,i){if(!on[i]||d.type!=='amount')return;
      if(a>=d.min){lines.push([d.label,d.amount]);a-=d.amount}
      else{var c=Math.ceil(d.min/(1-rate/100)/1000)*1000;need.push([d.label,c])}});
    D.deals.forEach(function(d,i){if(!on[i]||d.type==='amount')return;var b=a*(1-d.rate/100);lines.push([d.label,a-b]);a=b});
    return {final:Math.max(0,a),lines:lines,need:need};
  }
  function row(t,v,cls){var tr=document.createElement('tr');if(cls)tr.className=cls;var a=document.createElement('td');a.textContent=t;var b=document.createElement('td');b.className='n';b.textContent=v;tr.appendChild(a);tr.appendChild(b);return tr}
  function tip(t,cls){var li=document.createElement('li');if(cls)li.className=cls;li.textContent=t;return li}
  function calc(){
    var cart=num(inp.value),pick=document.querySelector('input[name=calcCode]:checked'),c=D.codes[pick?+pick.value:0];
    var on=D.deals.map(function(d,i){var el=document.querySelector('[data-deal="'+i+'"]');return !!(el&&el.checked)});
    var go=$('cGo');go.setAttribute('data-copy',c.code);go.setAttribute('data-label',c.name);go.textContent=c.name+' 복사하고 이 금액으로 사기';
    var L=$('cLines'),T=$('cTips');L.textContent='';T.textContent='';
    if(!cart){$('cFinal').textContent='-';$('cSave').textContent='장바구니 금액을 넣어 주세요';return}
    var r=run(cart,c.rate,on),saved=cart-r.final;
    $('cFinal').textContent=won(r.final);
    $('cSave').textContent=won(saved)+' 할인 · 실제 할인율 '+(saved/cart*100).toFixed(1)+'%';
    L.appendChild(row('장바구니 금액',won(cart)));
    r.lines.forEach(function(l){L.appendChild(row(l[0],'-'+won(l[1])))});
    L.appendChild(row('최종 결제금액',won(r.final),'sum'));
    r.need.forEach(function(n){T.appendChild(tip(won(n[1]-cart)+' 더 담으면(장바구니 '+won(n[1])+') '+n[0]+'도 받습니다','good'))});
    if(r.final<D.shop.freeShipping)T.appendChild(tip('무료배송('+won(D.shop.freeShipping)+')까지 '+won(D.shop.freeShipping-r.final)+' 남았습니다','bad'));
    var lim=D.shop.customsUsd*D.shop.usdKrw;
    if(r.final>lim)T.appendChild(tip('약 '+won(lim)+'('+D.shop.customsUsd+'달러)을 넘어 관세·부가세가 붙을 수 있습니다. 나눠서 주문하는 편이 낫습니다','bad'));
    if(D.daeranRate&&c.rate<D.daeranRate){var d=run(cart,D.daeranRate,on);T.appendChild(tip('지난 대란 평균(할인코드 '+D.daeranRate+'%)이라면 약 '+won(d.final)+'이고, 지금보다 '+won(r.final-d.final)+' 쌉니다'))}
  }
  inp.addEventListener('input',function(){var n=num(inp.value);inp.value=n?n.toLocaleString('ko-KR'):'';calc()});
  document.querySelectorAll('[data-amt]').forEach(function(b){b.addEventListener('click',function(){inp.value=(+b.getAttribute('data-amt')).toLocaleString('ko-KR');calc()})});
  document.querySelectorAll('input[name=calcCode],[data-deal]').forEach(function(el){el.addEventListener('change',calc)});
  calc();
})();
</script>`;

// ── 대란 가격 비교 (키워드: 마이프로틴 대란 가격 차이) ──
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const PRODUCTS = (db.products || []).filter(p => p.price > 0);
const dRate = daeranRate ?? TH;
const affTo = u => SITE.affiliate.replace(/ued=.*$/, 'ued=' + encodeURIComponent(u));
// 대안 비교 페이지 데이터. altMp = 마이프로틴 쪽 기준 제품(첫 번째)의 대란가 1kg당 가격
const ALT = fs.existsSync(path.join(ROOT, 'data/alternatives.json')) ? readJson('data/alternatives.json') : null;
const altMp = (() => { const m = ALT?.myprotein?.[0]; const p = m && PRODUCTS.find(p => p.name === m.match[0] && p.size === m.match[1]); if (!p) return null; const rate = Math.max(last.base, dRate); return { p, m, rate, kg: p.price * (1 - rate / 100) / m.grams * 1000 }; })();
const priceRows = list => `<table class="pt">
<thead><tr><th>제품</th><th class="n">표시가</th><th class="n">평소<br><small>코드 ${last.base}%</small></th><th class="n">대란<br><small>코드 ${dRate}%</small></th><th class="n">차이</th></tr></thead>
<tbody>${list.map(p => {
  const a = p.price * (1 - last.base / 100), b = p.price * (1 - dRate / 100);
  return `<tr><td><a href="${esc(affTo(p.url))}" target="_blank" rel="sponsored nofollow noopener"${primary ? ` data-copy="${b64(primary.code)}" data-label="${esc(nameOf(primary))}"` : ''}>${esc(p.name)} <b>${esc(p.size)}</b></a>${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td class="n muted">${won(p.price)}</td><td class="n">${won(a)}</td><td class="n hot">${won(b)}</td><td class="n">-${won(a - b)}</td></tr>`;
}).join('')}</tbody>
</table>`;

// ── 그래프 ──
function gauge() {
  const lo = 33, hi = Math.max(48, Math.ceil(last.eff) + 2), W = 640, H = 100, pad = 16;
  const x = v => pad + ((v - lo) / (hi - lo)) * (W - pad * 2);
  const ticks = [34, 38, 42, 46].filter(t => t <= hi);
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="할인코드 ${last.base}퍼센트, 숨은 할인 포함 ${last.eff}퍼센트, 대란 기준 ${TH}퍼센트">
  <rect x="${x(lo)}" y="42" width="${x(TH) - x(lo)}" height="14" rx="7" fill="var(--track)"/>
  <rect x="${x(TH)}" y="42" width="${x(hi) - x(TH)}" height="14" rx="7" fill="var(--track-hot)"/>
  <line x1="${x(TH)}" y1="26" x2="${x(TH)}" y2="70" stroke="var(--flame)" stroke-width="2" stroke-dasharray="3 3"/>
  <text x="${x(TH) + 6}" y="22" class="g-note" fill="var(--flame)">대란 ${TH}%</text>
  ${bonus > 0 ? `<line x1="${x(last.base)}" y1="49" x2="${x(last.eff)}" y2="49" stroke="var(--blue)" stroke-width="14" stroke-linecap="round" opacity=".25"/>` : ''}
  <circle cx="${x(last.base)}" cy="49" r="7" fill="${isDaeran ? 'var(--flame)' : 'var(--ink)'}"/>
  <text x="${x(last.base)}" y="34" class="g-tick" text-anchor="middle">코드 ${last.base}%</text>
  ${ticks.map(t => `<text x="${x(t)}" y="90" class="g-tick" text-anchor="middle">${t}</text>`).join('')}
  ${bonus > 0 ? `<circle cx="${x(last.eff)}" cy="49" r="11" fill="var(--blue)"/><circle cx="${x(last.eff)}" cy="49" r="4" fill="#fff"/>
  <text x="${x(last.eff)}" y="78" class="g-note" fill="var(--blue)" text-anchor="middle">실제 ${pct(last.eff)}</text>` : ''}
</svg>`;
}

function trend(series, endLabel = '오늘') {
  if (series.length < 2) return '';
  const W = 640, H = 210, L = 34, R = 12, T = 16, B = 26;
  const vs = [...series.flatMap(d => [d.eff, d.base]), TH];
  const lo = Math.min(...vs) - 1, hi = Math.max(...vs) + 1;
  const x = i => L + (i / (series.length - 1)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pathOf = key => series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  const first = series[0].date, end = series.at(-1).date;
  const bands = events.filter(e => e.end >= first && e.start <= end).map(e => {
    const s = series.findIndex(d => d.date >= e.start);
    let en = series.findIndex(d => d.date > e.end); en = (en < 0 ? series.length : en) - 1;
    const x0 = Math.max(x(s) - 2, L), x1 = Math.min(x(en) + 2, W - R);
    return `<rect x="${x0.toFixed(1)}" y="${T}" width="${Math.max(x1 - x0, 5).toFixed(1)}" height="${H - T - B}" fill="var(--flame)" opacity=".12"/>`;
  }).join('');
  const labels = [Math.ceil(lo) + 1, Math.round((lo + hi) / 2), Math.floor(hi) - 1].map(v => `<text x="4" y="${(y(v) + 4).toFixed(1)}" class="g-tick">${v}</text>`).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${kdate(first)}부터 ${kdate(end)}까지 할인율 추이">
  ${bands}${labels}
  <line x1="${L}" y1="${y(TH).toFixed(1)}" x2="${W - R}" y2="${y(TH).toFixed(1)}" stroke="var(--flame)" stroke-width="1" stroke-dasharray="4 4"/>
  <path d="${pathOf('eff')}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-dasharray="3 3"/>
  <path d="${pathOf('base')}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${x(series.length - 1).toFixed(1)}" cy="${y(series.at(-1).base).toFixed(1)}" r="5" fill="${series.at(-1).base >= TH ? 'var(--flame)' : 'var(--ink)'}"/>
  <text x="${L}" y="${H - 6}" class="g-tick">${kdate(first)}</text>
  <text x="${W - R}" y="${H - 6}" class="g-tick" text-anchor="end">${endLabel}</text>
</svg>`;
}
const trendNote = `<p class="lede">진한 선이 할인코드 할인율, 파란 점선이 숨은 할인까지 합친 실제 할인율입니다. 빨간 구간이 대란이고 가로 점선이 대란 기준선 ${TH}%입니다.</p>`;

// ── 스타일: 마이프로틴 브랜드색(딥틸·오렌지·민트) + 애플식 레이아웃 ──
const css = `
:root{
  /* 마이프로틴 브랜드색: 딥틸 #003942, 오렌지 #DD592B, 민트 #94E5B5, 웜 오프화이트 */
  --brand:#003942;--brand-700:#00262C;--brand-soft:#E4EEEF;--brand-100:#F0F5F6;
  --accent:#DD592B;--accent-soft:#FCEBE4;--mint:#94E5B5;--mint-soft:#E9F8EF;
  --bg:#FFFFFF;--surface:#F6F5F2;--surface-2:#EEEDE9;--ink:#1D1D1F;--ink-2:#424245;--muted:#6E6E73;--faint:#A1A1A6;--line:rgba(0,0,0,.08);
  --r:18px;--r-sm:12px;--shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,57,66,.08);
  /* 옛 이름 호환 (그래프 SVG가 씁니다) */
  --blue:var(--brand);--flame:var(--accent);--flame-soft:var(--accent-soft);--blue-soft:var(--brand-soft);
  --track:#E6E5E1;--track-hot:#F8DCCF
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,-apple-system,BlinkMacSystemFont,"SF Pro KR","Apple SD Gothic Neo",system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;font-size:15px;word-break:keep-all;overflow-wrap:break-word}
p,li,dd,.hint{text-wrap:pretty}
h1,h2,.hint,summary{text-wrap:balance}
table,.stats,.big,.res,.codes .crate,.opt .or,.amt input,.hidden-deals .r,.dealLine{font-variant-numeric:tabular-nums}
a{color:inherit}
.headerInner,.utilInner,.wrap{max-width:600px;margin:0 auto;padding-left:20px;padding-right:20px}
.wrap{padding-bottom:80px}
header.top{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.78);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line)}
.headerInner{height:52px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.brand{text-decoration:none;font-weight:800;letter-spacing:-.02em;font-size:15px;white-space:nowrap;color:var(--brand);display:flex;align-items:baseline;gap:7px}
.brand small{font-size:12px;font-weight:600;color:var(--muted)}
.topNav{display:flex;gap:4px}
.topNav a{font-size:13px;font-weight:600;color:var(--muted);text-decoration:none;white-space:nowrap;padding:6px 10px;border-radius:999px;transition:background .2s,color .2s}
.topNav a:hover{background:var(--surface);color:var(--ink)}
.topNav a[aria-current]{background:var(--brand-soft);color:var(--brand)}
.topNav .ns{display:none}
@media(max-width:879px){.topNav .nl{display:none}.topNav .ns{display:inline}}
@media(max-width:719px){
.headerInner{height:auto;flex-wrap:wrap;gap:0;padding-top:10px}
.brand{width:100%}
.topNav{width:calc(100% + 40px);margin:0 -20px;padding:6px 14px 8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.topNav::-webkit-scrollbar{display:none}
}
.utilBar{background:var(--surface)}
.utilInner{padding-top:8px;padding-bottom:8px;display:flex;gap:4px 16px;flex-wrap:wrap;justify-content:center;font-size:13px;color:var(--muted)}
.heroInner{padding:40px 0 12px}
h1{font-size:30px;font-weight:800;letter-spacing:-.035em;line-height:1.2;margin:0 0 12px;color:var(--ink)}
h2{font-size:20px;font-weight:800;letter-spacing:-.025em;margin:48px 0 14px}
p{margin:0 0 12px}
.lede{color:var(--ink-2);font-size:16px;line-height:1.7}
.lede b{color:var(--ink)}
.updated{font-size:13px;color:var(--muted);margin:0 0 14px}
.crumbs{font-size:13px;color:var(--muted);margin:0 0 18px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.crumbs a{color:inherit;text-decoration:none}.crumbs a:hover{color:var(--ink)}.crumbs i{font-style:normal;opacity:.6}
.state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:5px 11px;border-radius:999px;margin-bottom:12px}
.state:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.state.on{background:var(--accent-soft);color:var(--accent)}
.state.off{background:var(--surface);color:var(--muted)}
.bigLabel{font-size:13px;font-weight:600;color:var(--muted);margin:0}
.numWrap{display:block;margin:0 0 6px}
.big{font-size:72px;font-weight:800;letter-spacing:-.05em;line-height:1.05;color:var(--brand)}
.subline{font-size:14px;color:var(--muted);margin-bottom:18px}
.formula{font-size:14px;color:var(--muted);margin:0 0 6px}
.formula b{color:var(--brand);font-weight:700}
.hint{font-size:13px;color:var(--muted);text-align:center;margin:0 0 8px;line-height:1.55}
svg.gauge,svg.trend{width:100%;height:auto;display:block;margin:6px 0 20px}
.g-tick{font-size:11px;fill:var(--muted)}
.g-note{font-size:11px;font-weight:700}
.cta{display:block;text-align:center;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 20px;border-radius:999px;margin:8px 0;transition:transform .15s,background .2s,opacity .2s}
.cta.hot{background:var(--accent)}
.cta.ghost{background:var(--surface);color:var(--ink)}
.cta:hover{background:var(--brand-700)}
.cta.hot:hover{background:#C44C22}
.cta.ghost:hover{background:var(--surface-2)}
.cta:active{transform:scale(.985)}
.stats{margin:20px 0;background:var(--surface);border-radius:var(--r);padding:2px 18px}
.stats div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.stats div:last-child{border-bottom:0}
.stats dt{font-size:14px;color:var(--muted)}
.stats dd{margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em;text-align:right}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:12px 4px;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:0}
th{font-size:13px;color:var(--muted);font-weight:600}
th.n,td.n{text-align:right}
td.n{font-weight:700;white-space:nowrap}
tr.hot td{color:var(--accent)}
.vlink{font-size:12px;font-weight:700;color:var(--brand);text-decoration:none;white-space:nowrap;margin-left:6px}
.codes{list-style:none;padding:0;margin:0}
.codes li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.codes li:last-child{border-bottom:0}
.codes .name{flex:1;font-size:15px;font-weight:800;letter-spacing:.01em}
.codes em{display:block;font-style:normal;font-size:13px;color:var(--muted);font-weight:500;margin-top:1px}
.codes .crate{font-size:14px;font-weight:800;color:var(--brand);white-space:nowrap}
.codes button{border:0;background:var(--surface-2);border-radius:999px;padding:8px 13px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--ink);white-space:nowrap;transition:transform .15s,background .2s}
.codes button:active{transform:scale(.96)}
details.more{border:0;background:var(--surface);border-radius:var(--r);padding:4px 16px;margin:18px 0 0}
details.more summary{font-size:14px;color:var(--muted);padding:12px 0}
details.more[open] summary{color:var(--ink);border-bottom:1px solid var(--line)}
.dealLine{font-size:15px;color:var(--ink-2);line-height:1.5;margin:14px 0 0;padding:14px 16px;background:var(--brand-100);border-radius:var(--r-sm)}
.dealLine .dh{font-size:13px;font-weight:700;color:var(--muted);margin:0 0 8px}
.dealLine ul{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.dealLine li{display:grid;grid-template-columns:4.2em 1fr;gap:8px;align-items:baseline}
.dealLine .dt{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.dealLine b{color:var(--brand)}
.dealLine a{color:var(--brand);font-weight:700;text-decoration:none;white-space:nowrap}
.answer{font-size:16px;color:var(--ink);line-height:1.7}
.answer b{color:var(--brand)}
.aiTag{display:block;margin-top:2px;font-size:12px;font-weight:500;letter-spacing:0;color:var(--muted)}
h1 .hl{color:var(--brand);white-space:nowrap}
.sticky.hide{transform:translateY(140%);opacity:0;pointer-events:none}
button:focus-visible,.cta:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.hidden-deals{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.hidden-deals li{background:var(--brand-100);border-radius:var(--r);padding:16px}
.hidden-deals .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.hidden-deals .t{font-size:15px;font-weight:700;letter-spacing:-.01em}
.hidden-deals .r{font-size:18px;font-weight:800;color:var(--brand);white-space:nowrap}
.hidden-deals .d{font-size:14px;color:var(--ink-2);margin-top:6px;line-height:1.6}
.hidden-deals .when{font-size:13px;color:var(--muted);margin-top:6px}
.steps{padding-left:20px;margin:0 0 12px;font-size:15px;line-height:1.7}
.steps li{margin-bottom:8px}
.linkList{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.linkList a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:var(--surface);border-radius:var(--r-sm);text-decoration:none;font-size:14px;transition:background .2s}
.linkList a:hover{background:var(--surface-2)}
.linkList .m{font-weight:700}
.linkList .s{color:var(--muted);text-align:right;font-size:13px}
.vids{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.vids a{display:grid;grid-template-columns:136px 1fr;gap:4px 12px;text-decoration:none;align-items:start;padding:8px;border-radius:var(--r-sm);transition:background .2s}
.vids a:hover{background:var(--surface)}
.vids img{grid-row:span 2;width:136px;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#000;display:block}
.vids .vt{font-size:14px;font-weight:600;line-height:1.45}
.vids .vd{font-size:13px;color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:24px;font-size:14px}
.pager a{text-decoration:none;color:var(--brand);font-weight:700}
details{border-bottom:1px solid var(--line)}
details:last-of-type{border-bottom:0}
summary{cursor:pointer;padding:15px 0;font-size:16px;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--faint);font-weight:400;font-size:18px;line-height:1}
details[open] summary:after{content:"–"}
details p{font-size:15px;color:var(--ink-2);padding-bottom:16px;line-height:1.7;max-width:42em}
footer{margin-top:64px;padding-top:24px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);line-height:1.7}
footer nav{margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px 16px;font-size:14px}
footer nav a{text-decoration:none;color:var(--muted);font-weight:600}
.warn{background:#FFF6D6;border-radius:var(--r-sm);padding:12px 14px;font-size:14px;line-height:1.6;margin:12px 0 20px}
.ytPromo{background:var(--surface);border-radius:var(--r);overflow:hidden}
.ytPromo .ytThumb{display:block;position:relative;aspect-ratio:16/9;background:#000}
.ytPromo .ytThumb img{width:100%;height:100%;object-fit:cover;display:block}
.ytPromo .ytPlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;background:rgba(0,0,0,.12)}
.ytPromo .ytPlay span{width:56px;height:56px;border-radius:50%;background:rgba(0,57,66,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding-left:3px}
.ytPromo .ytBody{padding:14px 16px 16px}
.ytPromo .ytTitle{font-size:14px;font-weight:600;margin:0 0 10px}
.ytPromo .ytBtns{display:flex;gap:8px}
.ytPromo .cta{flex:1;margin:0;padding:11px 12px;font-size:13px}
.ytPromo .cta.ghost{background:#fff}
.cols{display:block}
.pt th small{display:block;font-weight:500;color:var(--muted);font-size:12px}
.pt td small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.pt td a{text-decoration:none}
.pt td.muted{color:var(--muted);font-weight:500}
.pt td.hot{color:var(--accent)}
@media(max-width:480px){.pt th:nth-child(2),.pt td:nth-child(2){display:none}.pt td,.pt th{padding-left:2px;padding-right:2px;font-size:13px}.pt td.n{padding-left:8px}}
.tier{background:var(--surface);border-radius:var(--r);padding:16px;margin-bottom:10px}
.tier .th{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.tier .th b{font-size:15px}
.tier .th small{display:block;font-size:13px;color:var(--muted)}
.tier .tg{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:#fff;flex:none}
.tier-s .tg{background:var(--accent)}.tier-a .tg{background:var(--brand)}.tier-b .tg{background:var(--faint)}.tier-f .tg{background:var(--ink)}
.tier .fl{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.tier .fl li{background:#fff;border-radius:999px;padding:7px 13px;font-size:14px;display:flex;gap:6px;align-items:baseline}
.tier .fl .fn{font-weight:700}
.tier .fl .fp,.tier .fl .fnote{font-size:12px;color:var(--muted)}
.cmts{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.cmts li{display:flex;gap:10px;align-items:baseline;padding:12px 14px;border-radius:var(--r-sm);background:var(--surface);font-size:15px;line-height:1.6}
.cmts li:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--faint);flex:none;position:relative;top:-1px}
.cmts li.good:before{background:var(--mint)}.cmts li.bad:before{background:var(--accent)}
.cmts .fn{font-weight:700;white-space:nowrap}.cmts .fnote{color:var(--muted);font-size:13px}
.catalog{list-style:none;padding:0;margin:0;font-size:14px}
.catalog li{padding:12px 0;border-bottom:1px solid var(--line);line-height:1.8}
.catalog li:last-child{border-bottom:0}
.catalog li b{display:block;font-size:12px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em}
.catalog mark{background:var(--brand-soft);color:var(--brand);font-weight:700;border-radius:6px;padding:1px 6px}
.calc{background:var(--surface);border-radius:var(--r);padding:18px}
.calc .f{display:block;font-size:13px;font-weight:700;margin:0 0 8px;padding:0}
.calc fieldset{border:0;padding:0;margin:0 0 16px;min-width:0}
.amt{display:flex;align-items:center;border-radius:14px;padding:0 16px;background:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.amt:focus-within{box-shadow:inset 0 0 0 2px var(--brand)}
.amt input{flex:1;border:0;outline:0;font:inherit;font-size:26px;font-weight:800;padding:12px 0;min-width:0;background:transparent;color:var(--ink);letter-spacing:-.02em}
.amt span{font-size:16px;font-weight:700;color:var(--muted)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 18px}
.chips button{border:0;background:#fff;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--ink);transition:background .2s}
.chips button:hover{background:var(--brand-soft)}
.opts{display:grid;gap:6px}
.opt{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;font-size:14px;cursor:pointer;background:#fff;box-shadow:inset 0 0 0 1px transparent;transition:box-shadow .2s,background .2s}
.opt input{accent-color:var(--brand);width:18px;height:18px;margin:0;flex:none}
.opt .ol{flex:1;font-weight:600}
.opt small{display:block;font-weight:500;color:var(--muted);font-size:13px;margin-top:1px}
.opt .or{font-weight:800;color:var(--brand);white-space:nowrap}
.opt:has(input:checked){box-shadow:inset 0 0 0 2px var(--brand);background:var(--brand-100)}
.res{background:#fff;border-radius:14px;padding:16px;margin:4px 0 6px}
.res .lbl{font-size:13px;color:var(--muted);font-weight:600}
.res .final{font-size:38px;font-weight:800;letter-spacing:-.04em;line-height:1.2;color:var(--brand);white-space:nowrap}
.res td.n{white-space:nowrap;padding-left:12px}
.res .save{font-size:14px;color:var(--accent);font-weight:700;margin:2px 0 10px}
.res td{padding:7px 0;font-size:13px}
.res tr.sum td{font-weight:800;font-size:14px;border-bottom:0}
.tips{list-style:none;padding:0;margin:12px 0 0;font-size:14px;line-height:1.55;display:grid;gap:8px}
.tips:empty{display:none}
.tips li{padding-left:14px;position:relative}
.tips li:before{content:"";position:absolute;left:2px;top:.6em;width:5px;height:5px;border-radius:50%;background:var(--faint)}
.tips li.good{color:var(--brand);font-weight:600}.tips li.good:before{background:var(--brand)}
.tips li.bad{color:var(--accent)}.tips li.bad:before{background:var(--accent)}
.sticky{position:fixed;left:16px;right:16px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:20;display:flex;justify-content:center;align-items:center;gap:6px;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:15px;border-radius:999px;box-shadow:0 10px 30px rgba(0,57,66,.28);transition:transform .25s,opacity .25s}
.sticky:active{transform:scale(.985)}
.sticky b{color:var(--mint)}
.toast{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translate(-50%,12px);opacity:0;z-index:30;background:rgba(29,29,31,.92);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#fff;font-size:13px;font-weight:600;padding:10px 16px;border-radius:999px;transition:opacity .2s,transform .2s;pointer-events:none;max-width:calc(100% - 32px);text-align:center}
.toast.on{opacity:1;transform:translate(-50%,0)}
body.hasSticky{padding-bottom:86px}body.hasSticky{padding-bottom:86px}
.pick{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.pick li{border-radius:var(--r);padding:16px 18px;background:var(--surface);display:grid;grid-template-columns:auto 1fr;gap:2px 12px;align-items:center}
.pick .pt{grid-row:span 3;align-self:start;font-size:13px;font-weight:800;color:#fff;border-radius:10px;padding:8px 0;width:48px;text-align:center}
.pick b{font-size:18px;letter-spacing:-.02em}
.pick .pw{font-size:15px;font-weight:600;color:var(--ink)}
.pick .pf{font-size:14px;color:var(--muted)}
.pick-impact .pt,.f-impact .fs:before,.b-impact i{background:var(--brand)}
.pick-iso .pt,.f-iso .fs:before,.b-iso i{background:var(--accent)}
.pick-clear .pt,.f-clear .fs:before,.b-clear i{background:#2E9C6A}
.wheyPic{margin:4px auto 0;max-width:560px}
.wheyPic svg{width:100%;height:auto;display:block}
.wheyPic figcaption{font-size:13px;color:var(--muted);text-align:center;margin-top:6px}
.cmpWrap{margin:0}
table.cmp{font-size:13px;table-layout:fixed}
table.cmp th,table.cmp td{vertical-align:top;padding:11px 3px;line-height:1.45}
table.cmp thead th{font-size:13px;padding:10px 2px;font-weight:800;color:#fff;text-align:center;border-radius:10px 10px 0 0;border-bottom:0}
table.cmp thead th:first-child{background:none;width:58px}
table.cmp th.c-impact{background:var(--brand)}table.cmp th.c-iso{background:var(--accent)}table.cmp th.c-clear{background:#2E9C6A}
table.cmp tbody th{font-size:12px;color:var(--muted);font-weight:700;padding-left:0}
table.cmp td{text-align:center;color:var(--ink)}
table.cmp td small{display:block;font-size:12px;color:var(--muted)}
table.cmp td.n{text-align:center}
.meter{display:flex;justify-content:center;gap:3px;margin-bottom:4px}
.meter i{width:14px;height:6px;border-radius:3px;background:var(--surface-2)}
.meter i.on{background:var(--ink)}
.altWrap{margin:0 -20px;padding:0 20px;overflow-x:auto}
table.alt{font-size:13px;min-width:335px}
table.alt th,table.alt td{padding:11px 4px;vertical-align:top}
table.alt thead th{font-size:12px;line-height:1.3}
table.alt td.p a{text-decoration:none;color:var(--ink);font-weight:700;font-size:14px;display:block;line-height:1.35}
table.alt td.p .br{display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:1px;letter-spacing:.01em}
table.alt td.p .sh{display:block;font-size:12px;color:var(--muted);font-weight:500;margin-top:3px;line-height:1.4}
table.alt td.n{font-size:13px}
table.alt td.n.hot{color:var(--accent);font-size:14px}
table.alt tr.mp td.p a{color:var(--brand)}
table.alt tr.best td.p a{color:var(--accent)}
table.alt .tag{display:inline-block;font-style:normal;font-size:11px;font-weight:800;color:#fff;background:var(--accent);border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:1px;line-height:1.5}
table.alt .muted{color:var(--faint);font-weight:500}
table.alt tr.np td.n{color:var(--faint);font-weight:500}
table.alt tr.np td.p a{color:var(--ink-2)}
.shops{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.shops li{background:var(--surface);border-radius:var(--r);padding:14px 16px}
.shops b{display:block;font-size:15px;margin-bottom:4px}
.shops span{display:block;font-size:14px;color:var(--ink-2);line-height:1.6}
.labTag{display:inline-block;font-size:12px;font-weight:800;color:#fff;background:#1D1D1F;border-radius:999px;padding:4px 11px;margin-bottom:12px}
.nutWrap{margin:0 -20px;padding:0 20px;overflow-x:auto;-webkit-overflow-scrolling:touch}
table.nut{font-size:13px;min-width:620px}
table.nut.ing{min-width:900px}
table.nut th,table.nut td{padding:10px 8px;vertical-align:top;line-height:1.45}
table.nut thead th{white-space:nowrap}
table.nut thead th small{display:block;font-weight:600;font-size:11px}
table.nut tbody th{text-align:left;font-weight:700;color:var(--ink);font-size:14px;position:sticky;left:0;background:var(--bg,#fff);min-width:140px;max-width:180px;box-shadow:1px 0 0 var(--line)}
table.nut tbody th small{display:block;font-size:11px;color:var(--muted);font-weight:700;margin-bottom:1px}
table.nut td.n{white-space:nowrap}
table.nut td.n small{display:block;font-size:11px;color:var(--muted);font-weight:600}
table.nut td.hot{color:var(--accent)}
table.nut td.ing{min-width:280px;max-width:380px;font-size:12px;color:var(--ink-2);white-space:normal}
table.nut td.src{min-width:150px}
table.nut td.src small{display:block;font-size:11px;color:var(--muted);margin-top:2px}
table.nut td.src a{font-weight:700;color:var(--brand);text-decoration:none}
table.nut tr.np td{color:var(--faint)}
table.nut tr.np th{color:var(--muted)}
.rev{list-style:none;padding:0;margin:0}
.rev li{padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;line-height:1.55}
.rev li:last-child{border-bottom:0}
.rev b{display:inline-block;font-size:12px;border-radius:999px;padding:2px 8px;background:var(--surface-2);margin-right:6px}
.rev b.pos{background:#DDF3E7;color:#1E7A4F}
.rev b.neg{background:#FBE3E3;color:#B13232}
.rev i{font-style:normal;color:var(--muted);font-size:13px}
.rev small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.rev small a{color:var(--brand);font-weight:700;text-decoration:none}
@media(max-width:400px){.topNav{gap:0}.topNav a{padding:6px 9px}}
@media(min-width:880px){
.pick{grid-template-columns:repeat(3,1fr)}
.pick li{grid-template-columns:1fr;align-content:start}
.pick .pt{grid-row:auto;margin-bottom:8px}
table.cmp{font-size:15px}table.cmp thead th{font-size:15px;padding:12px 6px}table.cmp th,table.cmp td{padding:14px 8px}table.cmp thead th:first-child{width:110px}table.cmp tbody th{font-size:14px}
.headerInner,.utilInner,.wrap{max-width:1040px;padding-left:32px;padding-right:32px}
.wrap{padding-bottom:110px}
.heroInner{padding:56px 0 16px}
/* 첫 화면: 왼쪽 답+버튼, 오른쪽 요약 카드 */
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:16px 56px;align-items:start}
.hero > *{grid-column:1}
.hero .state{justify-self:start}
.hero .sideStack{grid-column:2;grid-row:1 / span 6;align-self:start;margin-top:6px}
.hero .sideStack .stats{margin:0 0 12px;padding:4px 22px}
.hero .sideStack .stats div{padding:16px 0}
.hero .sideStack .stats dd{font-size:20px}
.hero .sideStack details.more{margin:0}
.hero details.more{grid-column:2;margin:0;align-self:start}
.hero .calc{grid-column:1 / -1;margin-top:12px}
.hero .calc ~ details.more{grid-column:1 / -1}
.hero .heroMain{grid-column:1}
.hero .heroSide{grid-column:2;grid-row:1;margin:0}
.hero .heroSide .stats{margin:0}
.hero .cta{margin-top:12px}
.hero .dealLine{margin-top:10px}
/* 아래 섹션: 2열, 긴 것은 전체 폭 */
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 56px;align-items:start}
.cols .full,.cols section:has(> details),.cols section:has(.calc),.cols section:has(.pt),.cols section:has(.vids){grid-column:1 / -1}
.vids{grid-template-columns:1fr 1fr}
/* 계산기: 왼쪽 입력, 오른쪽 결과. 두 덩어리라 서로 높이를 늘리지 않습니다 */
.calc{display:grid;grid-template-columns:1.1fr .9fr;gap:0 32px;align-items:start;padding:28px}
.calc .calcIn fieldset:last-child{margin-bottom:0}
.calc .calcOut{position:sticky;top:84px}
.calc .res{margin:0}
.calc .cta{margin-top:12px}
h1{font-size:42px}
h2{font-size:24px}
.big{font-size:96px}
.lede{font-size:17px}
.wrap > section > .lede,.cols .full > .lede,.cols section:has(> details) > .lede,.cols section:has(.pt) > .lede,.cols section:has(.calc) > .lede,.cols section:has(.vids) > .lede{max-width:42em}
.sticky{display:none}
body.hasSticky{padding-bottom:0}
.toast{bottom:28px}
}
`;

// ── 공통 조각 ──
// 메인 버튼은 페이지당 하나. 나머지 코드는 접힌 목록 안에 작은 복사 버튼만 둡니다.
const codeRow = c => `<li><span class="name">${esc(nameOf(c))}<em>${esc(c.label)}${c.note ? ` · ${esc(c.note)}` : ''}</em></span><span class="crate">${c.rate != null ? `${c.rate}%` : ''}</span><button type="button" data-copy="${b64(c.code)}" data-label="${esc(nameOf(c))}">복사</button></li>`;
const otherCodes = CODES.filter(c => c !== primary);
const codeList = `<ul class="codes">${otherCodes.map(codeRow).join('')}${db.referral ? `<li><span class="name">${esc(db.referral)}<em>신규 가입 추천인 코드 · 첫 구매 적립금, 할인코드와 같이 씁니다</em></span><span class="crate"></span><button type="button" data-copy="${b64(db.referral)}">복사</button></li>` : ''}</ul>`;
const otherCount = otherCodes.length + (db.referral ? 1 : 0);
const otherCodesBox = otherCount ? `<details class="more"><summary>다른 코드 보기 (${otherCount}개)</summary>${codeList}</details>` : '';

const heroCta = primary ? `<a class="cta hot heroBtn" ${goAttrs(primary.code, nameOf(primary))}>${esc(nameOf(primary))} 복사하고 사러 가기</a>
<p class="hint">${primary.until ? `<b>${kdate(primary.until)} ${(primary.untilTime || '18:59').replace(':', '시 ')}분 마감.</b> ` : ''}누르면 코드가 복사되고 마이프로틴이 열립니다. 장바구니 할인코드 칸에 붙여넣으세요.</p>`
  : `<a class="cta heroBtn" href="${esc(SITE.affiliate)}" target="_blank" rel="sponsored nofollow noopener">마이프로틴에서 할인받기</a>`;
const sticky = primary ? `<a class="sticky" ${goAttrs(primary.code, nameOf(primary))}><b>${esc(nameOf(primary))}</b> 복사하고 사러 가기 →</a>` : '';

// 숨은 할인 한 줄 요약
// 금액 할인은 라벨 끝의 같은 금액('… 5천원')을 빼서 두 번 나오지 않게 합니다
const AI_TAG = '<small class="aiTag">AI로 생성됨</small>';
const dealShort = d => d.type === 'amount'
  ? `<b>+${(d.amount / 1000).toLocaleString('ko-KR')}천원</b><span>${esc(d.label.replace(new RegExp(`\\s*${d.amount / 1000}천\\s*원$`), ''))}</span>`
  : `<b>+${d.rate}%</b><span>${esc(d.label)}</span>`;
const dealLine = last.deals.length
  ? `<div class="dealLine"><p class="dh">같이 챙기면 더 싸집니다</p><ul>${last.deals.map(d => `<li>${dealShort(d)}</li>`).join('')}</ul><div class="dt"><span>다 챙기면 <b>${pct(last.eff)}</b></span>${calcWidget ? `<a href="./calc.html">내 금액으로 계산 →</a>` : ''}</div></div>`
  : '';

const dealItems = ds => `<ul class="hidden-deals">${ds.map(d => `
  <li><div class="row"><span class="t">${esc(d.label)}</span><span class="r">+${d.rate}%</span></div>
  ${d.howto ? `<div class="d">${esc(d.howto)}</div>` : ''}
  <div class="when">${kdate(d.start)}부터 ${kdate(d.end)}까지</div></li>`).join('')}</ul>`;
const dealList = last.deals.length ? dealItems(last.deals)
  : '<p class="lede">지금 확인된 추가 할인은 없습니다. 새로 발견되면 이 자리에 올립니다.</p>';

const eventTable = list => `<table>
<thead><tr><th>기간</th><th>일수</th><th class="n">최고 할인코드</th></tr></thead>
<tbody>${list.map(e => `<tr><td>${range(e)}${e.videos.length ? `<a class="vlink" href="${ytWatch(e.videos.at(-1).id)}" target="_blank" rel="noopener">▶ 영상</a>` : ''}</td><td>${e.days}일</td><td class="n">${pctOr(e.max)}</td></tr>`).join('')}</tbody>
</table>`;

// 구글 동영상 검색용. 페이지에 썸네일이 보이는 영상만 넣습니다
const videoLd = v => ({ '@type': 'VideoObject', name: v.title, description: `${v.title} · 마프대란알리미 유튜브 ${dot(v.date)}`, thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, uploadDate: v.date, embedUrl: `https://www.youtube.com/embed/${v.id}`, contentUrl: ytWatch(v.id) });
const videoList = vs => `<ul class="vids">${vs.map(v => `
  <li><a href="${ytWatch(v.id)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180"><span class="vt">${esc(v.title)}</span><span class="vd">${dot(v.date)}</span></a></li>`).join('')}</ul>`;

const monthSummary = st => st.events.length ? `${st.events.length}회 · ${st.evMax != null ? `최고 ${pct(st.evMax)}` : '할인율은 영상 참고'}` : (st.days.length || st.videos.length ? '대란 없음' : '시작 전');
const monthLinks = list => `<ul class="linkList">${list.map(ym => `<li><a href="./${monthFile(ym)}"><span class="m">${Y(ym)}년 ${M(ym)}월 대란</span><span class="s">${monthSummary(monthStats(ym))}</span></a></li>`).join('')}</ul>`;

const latestVideo = allVideos.at(-1) || (() => { const id = (SITE.youtubeVideo || '').match(/[?&]v=([^&]+)/)?.[1]; return id ? { id, title: '' } : null; })();
const ytPromo = latestVideo ? `<section class="full">
<h2>대란 소식은 유튜브에서 먼저 올립니다</h2>
<p class="lede">마프대란알리미 채널에서 히든코드와 숨은 할인을 영상으로 정리합니다. 구독해 두면 대란이 시작될 때 바로 볼 수 있습니다.</p>
<div class="ytPromo">
  <a class="ytThumb" href="${ytWatch(latestVideo.id)}" target="_blank" rel="noopener">
    <img src="https://i.ytimg.com/vi/${esc(latestVideo.id)}/hqdefault.jpg" alt="${esc(latestVideo.title || '마프대란알리미 최신 영상')}" loading="lazy" width="480" height="360">
    <span class="ytPlay"><span>▶</span></span>
  </a>
  <div class="ytBody">
    ${latestVideo.title ? `<p class="ytTitle">${esc(latestVideo.title)}</p>` : ''}
    <div class="ytBtns"><a class="cta" href="${ytWatch(latestVideo.id)}" target="_blank" rel="noopener">최신 영상 보기</a>${SITE.youtubeChannel ? `<a class="cta ghost" href="${esc(SITE.youtubeChannel)}" target="_blank" rel="noopener">채널 구독하기</a>` : ''}</div>
  </div>
</div>
</section>` : '';

const kakaoBox = `<section class="full">
<h2>숨은 할인이 뜨면 단톡방에 올립니다</h2>
<p class="lede">새 조건을 찾아내는 즉시 단톡방에 올립니다. 대란이 시작될 때도 바로 알려드립니다.</p>
<a class="cta" href="${esc(SITE.kakao)}">알림 단톡방 들어가기</a>
</section>`;

const faqHtml = list => list.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
const faqLd = list => ({ '@type': 'FAQPage', mainEntity: list.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const urlOf = file => file === 'index.html' ? `${SITE.origin}/` : `${SITE.origin}/${file}`;
const crumbs = list => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, file], i) => ({ '@type': 'ListItem', position: i + 1, name, item: urlOf(file) })) });

// ── 페이지 틀 ──
const hasOg = fs.existsSync(path.join(ROOT, 'og.png'));
const hasIcon = fs.existsSync(path.join(ROOT, 'favicon.ico'));
const REF_BENEFIT = db.referralBenefit || '첫 구매 적립금';
// 블랙프라이데이 페이지: 12월이 되면 다음 해 날짜로 넘어갑니다. 10월 15일부터 11월 말까지는 푸터에도 보여줍니다
const bfYear = M(curYm) === 12 ? Y(curYm) + 1 : Y(curYm);
const bfDate = blackFriday(bfYear), cmDate = addDays(bfDate, 3), bfWeekStart = addDays(bfDate, -7);
const bfSeason = M(curYm) === 11 || (M(curYm) === 10 && +last.date.slice(8, 10) >= 15);
const built = []; // 사이트맵·RSS용

const BASE_KW = ['마이프로틴', '마프대란', '마이프로틴 할인코드', '마이프로틴 대란', '마이프로틴 히든코드'];
function page({ file, title, desc, heroHtml, restHtml, ld = [], lastmod = last.date, priority = 0.8, changefreq = 'weekly', current, extraScript = '', keywords = [], noindex = false, pageType = 'WebPage' }) {
  const url = urlOf(file);
  const kw = [...new Set([...keywords, ...BASE_KW])].join(',');
  // 모든 페이지에 사이트·운영자·페이지 정보를 깔고, 페이지별 FAQ·빵부스러기는 그 뒤에 붙입니다
  const graph = [
    { '@type': 'WebSite', '@id': `${SITE.origin}/#website`, name: SITE.brand, alternateName: ['Proteify', '마프대란', '마프대란알리미', '마이프로틴 대란 알리미'], url: `${SITE.origin}/`, inLanguage: 'ko-KR', publisher: { '@id': `${SITE.origin}/#org` } },
    { '@type': 'Organization', '@id': `${SITE.origin}/#org`, name: SITE.brand, alternateName: SITE.tagline || undefined, url: `${SITE.origin}/`, logo: hasIcon ? `${SITE.origin}/icon-512.png` : hasOg ? `${SITE.origin}/og.png` : undefined, sameAs: [SITE.youtubeChannel].filter(Boolean).map(u => u.replace(/\?.*$/, '')) },
    { '@type': pageType, '@id': url, url, name: title, description: desc, inLanguage: 'ko-KR', dateModified: lastmod, isPartOf: { '@id': `${SITE.origin}/#website` } },
    ...ld,
  ];
  // 빵부스러기(현재 위치)를 화면에도 작게 보여줍니다. 구조화 데이터와 같은 경로여야 검색엔진이 믿습니다
  const bc = ld.find(n => n && n['@type'] === 'BreadcrumbList');
  const crumbsHtml = bc ? `<nav class="crumbs" aria-label="현재 위치">${bc.itemListElement.map((it, i, a) => i < a.length - 1 ? `<a href="${it.item}">${esc(it.name)}</a>` : `<span>${esc(it.name)}</span>`).join('<i>›</i>')}</nav>\n` : '';
  const navLink = (href, label) => `<a href="./${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`;
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
${noindex ? `<base href="${SITE.origin}/">\n` : ''}<meta name="keywords" content="${esc(kw)}">
<meta name="author" content="${esc(SITE.tagline || SITE.brand)}">
${SITE.naverVerify ? `<meta name="naver-site-verification" content="${esc(SITE.naverVerify)}">\n` : ''}${SITE.googleVerify ? `<meta name="google-site-verification" content="${esc(SITE.googleVerify)}">\n` : ''}<link rel="alternate" type="application/rss+xml" title="${esc(SITE.brand)}" href="${SITE.origin}/rss.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ko_KR">
${hasOg ? `<meta property="og:image" content="${SITE.origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
` : ''}${hasIcon ? `<link rel="icon" href="${SITE.origin}/favicon.ico" sizes="32x32">
<link rel="icon" href="${SITE.origin}/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${SITE.origin}/apple-touch-icon.png">
<link rel="manifest" href="${SITE.origin}/manifest.webmanifest">
` : ''}<meta name="theme-color" content="#003942">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css">
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>
</head>
<body${sticky ? ' class="hasSticky"' : ''} data-asof="${last.date}">
<header class="top"><div class="headerInner">
  <a class="brand" href="./">${esc(SITE.brand)}${SITE.tagline ? `<small>${esc(SITE.tagline)}</small>` : ''}</a>
  <nav class="topNav">${navLink('code.html', '할인코드')}${calcWidget ? navLink('calc.html', '계산기') : ''}${navLink(monthFile(curYm), `${M(curYm)}월 대란`)}${fs.existsSync(path.join(ROOT, 'data/taste.json')) ? navLink('taste.html', '맛 추천') : ''}${PRODUCTS.length ? navLink('wpc-wpi.html', '<span class="nl">임팩트웨이 vs 아이솔레이트</span><span class="ns">임팩트 vs 아이솔</span>') : ''}</nav>
</div></header>
<div class="utilBar"><div class="utilInner">
  <span>8만원 이상 무료배송</span>
  <span>150달러 이상 관세 발생</span>
  ${db.referral ? `<span>추천코드 ${esc(db.referral)} 첫 구매 적립금</span>` : ''}
</div></div>
<main class="wrap">
${hasSample ? '<p class="warn">이 페이지는 예시 데이터로 생성되었습니다. data/discount.json 을 실제 값으로 교체한 뒤 배포하십시오.</p>' : ''}
<div class="heroInner">
${crumbsHtml}${heroHtml}
</div>
<div class="cols">
${restHtml}
</div>
<footer>
  <nav><a href="./">오늘 할인율</a><a href="./code.html">마이프로틴 할인코드</a>${calcWidget ? '<a href="./calc.html">할인 계산기</a>' : ''}${PRODUCTS.length ? '<a href="./price.html">대란 가격 비교</a>' : ''}${altMp ? '<a href="./alternatives.html">마이프로틴 대안</a>' : ''}${db.referral ? '<a href="./referral.html">추천인 코드</a>' : ''}<a href="./daeran.html">대란 기록</a>${[...monthPages].reverse().slice(0, 3).map(ym => `<a href="./${monthFile(ym)}">${M(ym)}월 대란</a>`).join('')}${bfSeason ? '<a href="./blackfriday.html">블랙프라이데이</a>' : ''}<a href="./about.html">소개</a><a href="${esc(SITE.kakao)}">알림 단톡방</a>${SITE.youtubeChannel ? `<a href="${esc(SITE.youtubeChannel)}">유튜브</a>` : ''}</nav>
  <p>이 사이트는 제휴 링크를 통해 수수료를 받을 수 있습니다. 구매 금액에는 차이가 없습니다.</p>
  <p>표시된 할인율은 확인 시점의 값이며 실제 결제 금액과 다를 수 있습니다. 숨은 할인은 조건과 기간에 따라 적용되지 않을 수 있습니다. 구매 전 마이프로틴에서 최종 금액을 확인하십시오.</p>
  <p>마이프로틴(Myprotein)은 THG plc의 상표이며 본 사이트와 무관합니다.</p>
</footer>
</main>
${sticky}
<div class="toast" role="status" aria-live="polite"></div>
<script>
(function(){
  var toast=document.querySelector('.toast'),tm;
  function show(m){toast.textContent=m;toast.classList.add('on');clearTimeout(tm);tm=setTimeout(function(){toast.classList.remove('on')},2600)}
  function old(v){var a=document.createElement('textarea');a.value=v;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
  function copy(v){try{if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).catch(function(){old(v)})}else{old(v)}}catch(e){old(v)}}
  function dec(s){try{return atob(s)}catch(e){return s}}
  var asof=document.body.getAttribute('data-asof');
  if(asof){var dd=Math.floor((Date.now()-new Date(asof+'T00:00:00+09:00').getTime())/864e5);
    if(dd>=3){var w=document.createElement('p');w.className='warn';w.textContent='마지막 확인이 '+asof.replace(/-/g,'.')+'이라 '+dd+'일 지났습니다. 최신 할인율은 단톡방이나 유튜브에서 확인하세요.';var mn=document.querySelector('main');mn.insertBefore(w,mn.firstChild)}}
  var st=document.querySelector('.sticky'),hb=document.querySelector('.heroBtn');
  if(st&&hb&&'IntersectionObserver' in window){new IntersectionObserver(function(es){st.classList.toggle('hide',es[0].isIntersecting)},{threshold:.4}).observe(hb)}
  document.querySelectorAll('[data-copy]').forEach(function(el){
    el.addEventListener('click',function(){
      var v=dec(el.getAttribute('data-copy')),lb=el.getAttribute('data-label')||v;copy(v);
      show(lb+' 복사됨 · 장바구니 할인코드 칸에 붙여넣으세요');
      if(el.tagName==='BUTTON'){var t=el.textContent;el.textContent='복사됨';setTimeout(function(){el.textContent=t},1200)}
    });
  });
})();
</script>
${extraScript}
${SITE.naverAnalytics ? `<script src="https://wcs.naver.net/wcslog.js"></script>
<script>window.wcs_add=window.wcs_add||{};window.wcs_add.wa="${esc(SITE.naverAnalytics)}";if(window.wcs){wcs_do();}</script>
` : ''}${SITE.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(SITE.ga4)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(SITE.ga4)}');</script>
` : ''}</body>
</html>`;
  write(file, html);
  if (!noindex) built.push({ file, url, title, desc, lastmod, priority, changefreq });
}

// ── 문구 ──
const pName = primary ? (primary.secret ? '히든코드' : `할인코드 ${primary.code}`) : null;
const codeWord = pName ? `${pName} ${last.base}%` : `할인코드 ${last.base}%`;
const officialLine = primary && official && extraOf(primary)
  ? `오늘 가장 높은 코드는 ${nameOf(primary)} ${primary.rate}%로, 마이프로틴 공식 코드 ${official.code}(${official.rate}%)보다 ${extraOf(primary)}%p 높습니다.`
  : '';
const knownRange = knownMax.length ? `${Math.min(...knownMax)}~${Math.max(...knownMax)}%` : null;

const HOME_FAQ = [
  ['마프대란이 뭔가요?',
   `마이프로틴 할인코드 할인율이 평소보다 확실히 올라가는 날을 구매자들이 부르는 말입니다. 공식 행사 이름은 아닙니다.${knownRange ? ` 마프대란알리미 채널에서 3월부터 따라가 보니 대란 때 히든코드는 ${knownRange}였습니다.` : ''} 이 사이트는 할인코드 할인율이 ${TH}% 이상인 날을 대란으로 기록합니다.`],
  ['마프대란 일정은 어떻게 확인하나요?',
   `마이프로틴은 대란 날짜를 미리 공지하지 않습니다. 이 사이트는 마이프로틴 할인율을 하루 네 번 확인해 대란이 시작되면 바로 표시하고, 단톡방과 유튜브로도 알립니다.${cycle ? ` 지금까지 대란은 평균 ${cycle}일 간격으로 왔습니다.` : ''} 지난 대란 날짜는 대란 기록 페이지에 모아 두었습니다.`],
  ['마이프로틴 대란과 평소 할인은 뭐가 다른가요?',
   `평소에도 메인 배너에 공식 할인코드가 걸려 있습니다${official ? `(오늘 ${official.code} ${official.rate}%)` : ''}. 대란은 이 코드 할인율이 ${TH}% 이상으로 올라간 날입니다.${events.length ? ` 기록된 대란은 ${Math.min(...events.map(e => e.days))}~${Math.max(...events.map(e => e.days))}일 이어졌습니다.` : ''}`],
  ['히든코드가 뭔가요?',
   '마이프로틴 메인 배너에 걸린 공식 코드 말고 유튜버나 팬카페에 따로 주어지는 코드입니다. 대부분 공식 코드보다 1~2%p 높게 나옵니다. 4월 4일 대란 때 공식 코드 0404는 40%였고 히든코드는 42%였습니다. 코드는 복사 버튼을 누르면 자동으로 들어갑니다.'],
  ['숨은 할인이 뭔가요?',
   '할인코드와 별개로 장바구니 조건을 맞추면 더 빠지는 할인입니다. 이달의 트렌드 제품을 같이 사면 최종 금액에서 7%가 더 빠지거나, 앱에서 12만원 이상 결제하면 쇼핑지원금이 붙는 식입니다. 이 사이트는 이런 조건을 할인코드 위에 쌓아 실제로 받는 할인율을 따로 계산합니다.'],
  ['실제 할인율이 39%를 넘는데 왜 대란이 아닌가요?',
   `대란 판정은 할인코드 할인율로만 합니다. 숨은 할인은 평소에도 붙는 경우가 많아서, 합친 숫자로 판정하면 거의 매일이 대란이 되기 때문입니다.`],
  ...(altMp ? [['마이프로틴 말고 대안은 없나요?',
   `있습니다. 옵티멈뉴트리션, 룰원, 다이마타이즈처럼 한국에서 직구로 많이 사는 브랜드를 단백질 1g당 가격으로 비교한 페이지를 따로 뒀습니다. 다만 대란 때는 ${altMp.p.name} ${altMp.p.size}이 1kg당 ${won(altMp.kg)}이라 여전히 싼 편이라, 대란이면 기다릴 이유가 없습니다.`]] : []),
  ['대란이면 무조건 사는 게 이득인가요?',
   '아닙니다. 평소와 차이는 몇 %p 수준입니다. 지금 당장 필요한 제품이라면 대란을 기다리며 미루는 것보다 히든코드와 숨은 할인을 챙겨 지금 사는 편이 나을 수 있습니다.'],
];

// ── 메인 ──
page({
  file: 'index.html', priority: 1.0, changefreq: 'daily', current: '',
  title: `마이프로틴 대란 알리미 (마프대란 일정) | 오늘 할인코드 ${last.base}% · 숨은 할인 포함 ${pct(last.eff)}`,
  keywords: ['마이프로틴 대란 일정', '마이프로틴 대란 날짜', '마이프로틴 할인 기간', '마프대란알리미', `마이프로틴 대란 ${M(curYm)}월`, `마이프로틴 할인 ${M(curYm)}월`],
  desc: `${kdate(last.date)} 기준 마이프로틴 ${codeWord}에 숨은 할인을 더하면 ${pct(last.eff)}입니다. ${isDaeran ? '지금 대란입니다.' : `대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`} 3월부터 기록한 대란 날짜와 영상도 확인하세요.`,
  ld: [faqLd(HOME_FAQ), ...(latestVideo && latestVideo.title && latestVideo.date ? [videoLd(latestVideo)] : [])],
  heroHtml: `
<div class="hero">
<span class="state ${isDaeran ? 'on' : 'off'}">${isDaeran ? '지금 대란입니다' : '지금은 대란이 아닙니다'}</span>
<h1>오늘 마이프로틴 ${pName || '할인코드'} <span class="hl">${last.base}%</span></h1>
<p class="lede answer">${kdate(last.date)} 기준 ${isDaeran
    ? `할인코드 ${last.base}%로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}. 지금 사면 됩니다.`
    : `대란이 아닙니다. 대란 기준 ${TH}%까지 ${gap}%p 남았습니다.${announced ? ` 마이프로틴 공식 사이트에 ${announced.label} 예고(${kdate(announced.date)})가 올라와 있습니다.` : ""}`}${official && extraOf(primary) ? ` 공식 코드 ${official.code}(${official.rate}%)보다 ${nameOf(primary)}가 ${extraOf(primary)}%p 높습니다.` : ''}</p>
${heroCta}
${dealLine}
<div class="sideStack">
<dl class="stats">
  <div><dt>마지막 대란</dt><dd>${lastEvent ? kdate(lastEvent.end) : '기록 없음'}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
  <div><dt>다음 예상 대란</dt><dd>${isDaeran ? '진행 중' : nextGuess ? `${kdate(nextGuess)}${AI_TAG}` : '-'}</dd></div>${announced ? `
  <div><dt>예고된 행사</dt><dd>${kdate(announced.date)}<small class="aiTag">${esc(announced.label)} · 마이프로틴 예고</small></dd></div>` : ''}
</dl>
${otherCodesBox}
</div>
</div>`,
  extraScript: calcWidget ? calcScript : '',
  restHtml: `
${calcWidget ? `<section>
<h2>내 장바구니는 얼마에 살까</h2>
<p class="lede">금액만 넣으면 히든코드와 숨은 할인까지 적용한 결제금액이 나옵니다.</p>
${calcWidget}
</section>` : ''}

<section>
<h2>대란 기록</h2>
${recent.length ? eventTable(recent.slice(0, 6)) : '<p class="lede">아직 기록된 대란이 없습니다.</p>'}
<a class="cta ghost" href="./daeran.html">전체 대란 기록 보기</a>
${bfSeason ? `<a class="cta ghost" href="./blackfriday.html">블랙프라이데이 ${kdate(bfDate)} 준비하기</a>` : ''}
</section>

${PRODUCTS.length ? `<section class="full">
<h2>대란 때 얼마나 싸질까</h2>
<p class="lede">표시가에 오늘 코드 ${last.base}%와 지난 대란 평균 코드 ${dRate}%를 각각 적용한 금액입니다. ${dot(db.priceDate || last.date)} 표시가 기준입니다.</p>
${priceRows(PRODUCTS.slice(0, 4))}
<a class="cta ghost" href="./price.html">제품별 대란 가격 비교 전체 보기</a>
${altMp ? '<a class="cta ghost" href="./alternatives.html">마이프로틴 말고 대안은? 다른 브랜드와 가성비 비교</a>' : ''}
</section>` : ''}

<section>
<h2>월별 마이프로틴 대란</h2>
${monthLinks([...monthPages].reverse().slice(0, 6))}
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(HOME_FAQ)}
</section>

${ytPromo}
${kakaoBox}
`,
});

// ── 할인코드 페이지 (키워드: 마이프로틴 할인코드) ──
const CODE_FAQ = [
  ['마이프로틴 할인코드는 어디에 입력하나요?',
   '마이프로틴 장바구니 화면의 할인코드 입력란에 코드를 넣고 적용을 누르면 됩니다. 적용되면 장바구니 금액에 할인이 바로 반영되니, 결제하기 전에 금액이 바뀌었는지 확인하십시오.'],
  ['공식 코드와 히든코드 중 뭘 써야 하나요?',
   `할인율이 높은 쪽을 쓰면 됩니다. 히든코드는 대부분 공식 코드보다 1~2%p 높습니다.${primary && official ? ` 오늘은 ${nameOf(primary)} ${primary.rate}%, 공식 코드 ${official.code} ${official.rate}%입니다.` : ''}`],
  ['마이프로틴 할인코드 중복 적용 되나요?',
   '할인코드끼리는 중복이 안 됩니다. 한 주문에 코드 하나만 들어가고, 두 번째 코드를 넣으면 앞의 코드가 빠집니다. 대신 이달의 트렌드 7%나 쇼핑지원금처럼 장바구니 조건으로 붙는 숨은 할인은 코드와 중복됩니다. 이 사이트는 둘을 합친 실제 할인율을 따로 계산합니다.'],
  ['마이프로틴 쇼핑지원금은 어떻게 받나요?',
   '앱에서 신청하는 선착순 이벤트 형식으로 대란 전후에 열립니다. 신청해 두면 일정 금액 이상 결제할 때 정액으로 빠집니다. 열리는 즉시 단톡방과 유튜브로 알려드리고, 이 페이지의 숨은 할인 목록에도 올립니다.'],
  ['추천인 코드는 뭔가요?',
   `처음 가입할 때 추천인 코드${db.referral ? `(${db.referral})` : ''}를 넣으면 첫 구매 적립금을 받는 방식입니다. 할인코드와는 별개라 같이 쓸 수 있습니다. 이미 가입한 계정에는 적용되지 않습니다.`],
  ['할인코드 쓰기 전에 확인할 조건이 있나요?',
   `세 가지를 보십시오. 이미 세일 중인 상품은 코드가 빠질 수 있고, ${(SHOP.freeShipping / 10000).toLocaleString('ko-KR')}만원 이상이어야 무료배송이며, ${SHOP.customsUsd}달러를 넘으면 관세와 부가세가 붙을 수 있습니다.${last.deals.length ? ` 지금은 ${last.deals.map(d => d.label).join(', ')} 조건도 있으니 장바구니를 담을 때 같이 챙기십시오.` : ''}`],
  ['마이프로틴 배송비는 얼마인가요?',
   `할인이 끝난 결제 금액이 ${SHOP.freeShipping.toLocaleString('ko-KR')}원 이상이면 무료배송이고, 그보다 적으면 배송비가 붙습니다. 할인 계산기에 금액을 넣으면 무료배송까지 얼마 남았는지 알려드립니다.`],
  ['할인코드가 적용이 안 돼요.',
   '코드 기간이 끝났거나, 이미 세일 중인 상품과 일부 번들 상품이 제외되는 경우가 많습니다. 최소 결제 금액 조건이 있는 코드도 있습니다. 다른 코드로 바꿔 넣어 보고, 그래도 안 되면 단톡방에 물어보십시오.'],
];

page({
  file: 'code.html', priority: 0.9, changefreq: 'daily', current: 'code.html',
  title: `마이프로틴 할인코드 ${Y(curYm)}년 ${M(curYm)}월 최신 | ${pName ? `${pName} ${primary.rate}%` : '숨은 할인 정리'} · 중복 적용 · 추천코드`,
  keywords: ['마이프로틴 할인코드 중복', '마이프로틴 할인코드 모음', '마이프로틴 추천인 코드', '마이프로틴 추천인 입력', '마이프로틴 추천코드', '마이프로틴 쇼핑지원금', `마이프로틴 할인 ${M(curYm)}월`, `마이프로틴 ${M(curYm)}월 할인코드`],
  desc: `${M(curYm)}월 마이프로틴 할인코드 정리. ${pName ? `${pName} ${primary.rate}%` : ''}${official ? `, 공식 코드 ${official.code} ${official.rate}%` : ''}${db.referral ? `, 추천인 코드 ${db.referral}` : ''}. 숨은 할인까지 합치면 ${pct(last.eff)}. ${dot(last.date)} 업데이트.`,
  ld: [crumbs([['홈', 'index.html'], ['마이프로틴 할인코드', 'code.html']]), faqLd(CODE_FAQ)],
  heroHtml: `
<div class="hero">
<p class="updated">${dot(last.date)} 업데이트 · 매일 확인</p>
<h1>마이프로틴 할인코드 ${M(curYm)}월</h1>
<p class="lede answer">오늘 쓸 코드는 ${pName || '할인코드'} <b>${last.base}%</b>입니다.${official && extraOf(primary) ? ` 공식 코드 ${official.code}(${official.rate}%)보다 ${extraOf(primary)}%p 높습니다.` : ''} 한 주문에 코드는 하나만 들어갑니다.</p>
${heroCta}
${dealLine}
${otherCodesBox}
</div>`,
  restHtml: `
<section>
<h2>마이프로틴 할인코드 적용 방법</h2>
<ol class="steps">
  <li>위 버튼을 누릅니다. 코드가 복사되고 마이프로틴이 열립니다.</li>
  <li>살 제품을 장바구니에 담습니다. 이달의 트렌드 제품을 하나 넣으면 7%가 더 빠집니다.</li>
  <li>장바구니의 할인코드 칸에 붙여넣고 적용을 누른 뒤, 금액이 바뀌었는지 확인하고 결제합니다.</li>
</ol>
<p class="lede">8만원 이상이면 무료배송이고, 150달러를 넘으면 관세가 붙을 수 있으니 장바구니 금액을 그 아래로 맞추는 편이 좋습니다.</p>
${calcWidget ? '<a class="cta ghost" href="./calc.html">내 장바구니 최종 결제금액 계산하기</a>' : ''}
</section>

${db.referral ? `<section>
<h2>마이프로틴 추천인 코드</h2>
<p class="lede">처음 가입하는 분만 해당합니다. 추천인 코드 <b>${esc(db.referral)}</b>를 넣으면 ${esc(REF_BENEFIT)}을 받고, 할인코드와는 별개라 같이 쓸 수 있습니다. 이미 가입한 계정에는 적용되지 않습니다.</p>
<a class="cta" href="${esc(SITE.affiliate)}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(db.referral)}">${esc(db.referral)} 복사하고 가입하기</a>
<a class="cta ghost" href="./referral.html">추천인 코드 입력 방법과 혜택 자세히</a>
</section>` : ''}

<section>
<h2>마이프로틴 쇼핑지원금 신청 방법</h2>
<p class="lede">쇼핑지원금은 앱에서 신청하는 선착순 이벤트로, 대란 전후에 열립니다. 신청해 두면 기준 금액 이상 결제할 때 정액으로 빠지고, 할인코드·이달의 트렌드와 중복됩니다.</p>
<ol class="steps">
  <li>마이프로틴 앱을 열고 이벤트(또는 혜택) 메뉴에서 쇼핑지원금 신청을 누릅니다. 선착순이라 열리면 바로 신청해야 합니다.</li>
  <li>신청 후 기준 금액(최근 12만원) 이상 담고 결제하면 지원금이 자동으로 빠집니다. 앱 전용이라고 안내되지만 PC에서도 적용된 적이 있습니다.</li>
  <li>열리는 시점은 미리 공지되지 않습니다. 단톡방과 유튜브에서 바로 알려드립니다.</li>
</ol>
${(() => { const v = allVideos.find(x => /쇼핑지원금 신청/.test(x.title)); return v ? `<a class="cta ghost" href="${ytWatch(v.id)}" target="_blank" rel="noopener">▶ 신청 방법 영상 보기</a>` : ''; })()}
</section>

<section>
<h2>지금이 살 때일까</h2>
<p class="lede">${isDaeran ? `지금은 대란입니다. 할인코드 ${last.base}%로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}.` : `지금은 대란이 아닙니다. 할인코드 기준 대란(${TH}%)까지 ${gap}%p 남았습니다.`}${nextGuess ? ` 평균 주기로 단순 계산한 다음 예상 대란일은 ${kdate(nextGuess)}입니다.` : ''}</p>
<a class="cta ghost" href="./">오늘 할인율 자세히 보기</a>
<a class="cta ghost" href="./${monthFile(curYm)}">${M(curYm)}월 대란 정리 보기</a>
</section>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(CODE_FAQ)}
</section>

${ytPromo}
${kakaoBox}
`,
});

// ── 할인 계산기 페이지 (키워드: 마이프로틴 할인 계산기, 마이프로틴 최종 결제금액) ──
const amountDeal = last.deals.find(d => d.type === 'amount');
const CALC_FAQ = [
  ['계산은 어떤 순서로 하나요?',
   '장바구니 금액에 할인코드를 먼저 적용하고, 쇼핑지원금 같은 정액 할인을 뺀 다음, 이달의 트렌드처럼 최종 결제 금액에 붙는 % 할인을 마지막에 적용합니다.'],
  ...(amountDeal ? [[`쇼핑지원금 ${(amountDeal.min / 10000)}만원 기준은 할인 전 금액인가요?`,
   `이 계산기는 할인코드를 적용한 뒤 금액이 ${amountDeal.min.toLocaleString('ko-KR')}원 이상일 때 지원금을 붙입니다. 마이프로틴 안내가 결제 금액 기준이라 그렇게 잡았습니다. 기준이 모자라면 장바구니를 얼마나 더 담아야 하는지도 알려드립니다.`]] : []),
  ['계산 결과와 실제 결제금액이 다를 수 있나요?',
   '이미 세일 중인 상품이나 일부 번들은 할인코드가 빠질 수 있고, 마이프로틴이 조건을 바꾸면 결과가 달라집니다. 이 계산기는 예상값이니 결제 전에 장바구니에서 최종 금액을 확인하십시오.'],
  ['관세는 얼마부터 붙나요?',
   `건강기능식품은 보통 ${SHOP.customsUsd}달러를 넘으면 관세와 부가세가 붙습니다. 계산기는 1달러 ${SHOP.usdKrw.toLocaleString('ko-KR')}원으로 어림잡아 넘을 것 같으면 알려드립니다. 넘는다면 나눠서 주문하는 편이 낫습니다.`],
];
if (calcWidget) page({
  file: 'calc.html', priority: 0.9, changefreq: 'daily', current: 'calc.html',
  keywords: ['마이프로틴 할인 계산기', '마이프로틴 최종 결제금액', '마이프로틴 관세', '마이프로틴 무료배송', '마이프로틴 쇼핑지원금 계산'],
  title: `마이프로틴 할인 계산기 | 할인코드·쇼핑지원금·트렌드 할인 적용 최종 결제금액`,
  desc: `장바구니 금액만 넣으면 마이프로틴 ${pName ? `${pName} ${primary.rate}%` : '할인코드'}와 쇼핑지원금, 이달의 트렌드 할인까지 적용한 최종 결제금액을 계산합니다. 무료배송·관세 기준과 대란 때 가격도 함께 알려드립니다.`,
  ld: [crumbs([['홈', 'index.html'], ['마이프로틴 할인 계산기', 'calc.html']]), faqLd(CALC_FAQ),
    { '@type': 'WebApplication', name: '마이프로틴 할인 계산기', url: urlOf('calc.html'), applicationCategory: 'ShoppingApplication', operatingSystem: 'All', inLanguage: 'ko-KR', offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' } }],
  extraScript: calcScript,
  heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 할인 계산기</h1>
<p class="updated">${dot(last.date)} 조건 기준 · 매일 갱신</p>
<p class="lede answer">장바구니 금액만 넣으면 ${pName || '할인코드'} ${last.base}%와 쇼핑지원금, 이달의 트렌드 할인까지 적용한 최종 결제금액이 나옵니다. 지원금 기준에 모자라면 얼마나 더 담아야 하는지도 알려드립니다.</p>
</div>
${calcWidget}
${otherCodesBox}
</div>`,
  restHtml: `
<section>
<h2>계산 방법</h2>
<ol class="steps">
  <li>장바구니 금액에 할인코드(${primary ? `${nameOf(primary)} ${primary.rate}%` : '%'})를 적용합니다.</li>
  ${amountDeal ? `<li>할인코드 적용 후 금액이 ${amountDeal.min.toLocaleString('ko-KR')}원 이상이면 ${esc(amountDeal.label.replace(/.*?(쇼핑지원금.*)/, '$1'))}을 뺍니다.</li>` : ''}
  ${last.deals.filter(d => d.type !== 'amount').map(d => `<li>${esc(d.label)} 조건이면 남은 금액에서 ${d.rate}%를 더 뺍니다.</li>`).join('')}
  <li>무료배송(${SHOP.freeShipping.toLocaleString('ko-KR')}원)과 관세(${SHOP.customsUsd}달러) 기준을 확인합니다.</li>
</ol>
</section>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(CALC_FAQ)}
</section>

${ytPromo}
${kakaoBox}
`,
});

// ── 대란 가격 비교 페이지 (키워드: 마이프로틴 대란 가격 차이, 가격 비교) ──
if (PRODUCTS.length) {
  const ex = PRODUCTS[0];
  const exA = ex.price * (1 - last.base / 100), exB = ex.price * (1 - dRate / 100);
  const PRICE_FAQ = [
    ['마이프로틴 대란 가격 차이는 얼마나 나나요?',
     `할인코드 할인율 차이만큼 납니다. 평소 코드가 ${last.base}%, 지난 대란 평균이 ${dRate}%라서 ${ex.name} ${ex.size} 기준 ${won(exA - exB)} 차이입니다. 쇼핑지원금 같은 정액 할인이 같이 열리면 차이가 더 벌어집니다.`],
    ['표시가와 정가는 뭐가 다른가요?',
     '정가는 줄이 그어진 가격이고, 표시가는 지금 화면에 보이는 가격입니다. 할인코드는 표시가에 적용되므로 이 표도 표시가 기준으로 계산했습니다.'],
    ['대란까지 기다리는 게 나을까요?',
     isDaeran ? '지금이 대란이라 기다릴 필요가 없습니다.' : `차이가 몇천 원에서 1~2만 원 수준입니다. 지금 당장 필요하면 히든코드로 사고, 2.5kg 이상 대량 구매면 다음 대란(예상일 ${nextGuess ? kdate(nextGuess) : '미정'})을 기다리는 편이 낫습니다.`],
    ['가격 비교 사이트와 금액이 왜 다른가요?',
     '이 표는 맛별로 다른 표시가 중 가장 흔한 값을 골라 코드만 적용한 금액입니다. 세일 중인 맛이나 한정판은 표시가가 달라서 실제 결제 금액이 다를 수 있습니다. 정확한 금액은 계산기에 장바구니 금액을 넣어 확인하십시오.'],
  ];
  page({
    file: 'price.html', priority: 0.8, current: 'price.html',
    title: `마이프로틴 대란 가격 비교 | 임팩트웨이 평소 vs 대란 얼마나 싸질까 (${M(curYm)}월 표시가 기준)`,
    desc: `임팩트웨이 1kg·2.5kg·5kg, 아이솔레이트, 크레아틴의 평소 가격(코드 ${last.base}%)과 대란 가격(코드 ${dRate}%) 비교표. ${ex.name} ${ex.size}는 대란 때 ${won(exA - exB)} 더 쌉니다. ${dot(db.priceDate || last.date)} 표시가 기준.`,
    keywords: ['마이프로틴 대란 가격', '마이프로틴 대란 가격 차이', '마이프로틴 대란 가격 비교', '마이프로틴 임팩트웨이 가격', '마이프로틴 5kg', '마이프로틴 2.5kg', '마이프로틴 아이솔레이트 가격', '마이프로틴 크레아틴 가격'],
    ld: [crumbs([['홈', 'index.html'], ['대란 가격 비교', 'price.html']]), faqLd(PRICE_FAQ)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 대란 가격 비교<br>평소 vs 대란</h1>
<p class="updated">${dot(db.priceDate || last.date)} 표시가 기준 · 코드 할인율은 매일 갱신</p>
<p class="lede">표시가에 오늘 할인코드 ${last.base}%를 적용한 평소 가격과, 지난 대란 평균 코드 ${dRate}%를 적용한 대란 가격입니다. 제품을 누르면 ${primary ? `${esc(nameOf(primary))}가 복사되고 ` : ''}마이프로틴이 열립니다.</p>
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>오늘 코드</dt><dd>${last.base}%</dd></div>
  <div><dt>대란 평균 코드</dt><dd>${dRate}%</dd></div>
  <div><dt>${esc(ex.size)} 차이</dt><dd>${won(exA - exB)}</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>제품별 평소 가격과 대란 가격</h2>
${priceRows(PRODUCTS)}
<p class="lede">할인코드만 적용한 금액입니다. 이달의 트렌드 7%나 쇼핑지원금까지 넣은 최종 금액은 <a href="./calc.html?amt=${ex.price}">계산기</a>에서 확인하십시오.</p>
</section>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(PRICE_FAQ)}
</section>

<section>
<h2>관련 페이지</h2>
<a class="cta ghost" href="./wpc-wpi.html">임팩트웨이 vs 아이솔레이트 뭘 살까</a>
${altMp ? '<a class="cta ghost" href="./alternatives.html">다른 브랜드와 가성비 비교</a>' : ''}
<a class="cta ghost" href="./calc.html">내 장바구니 최종 결제금액 계산</a>
<a class="cta ghost" href="./daeran.html">역대 대란 날짜 보기</a>
<a class="cta ghost" href="./code.html">오늘 쓸 수 있는 할인코드</a>
</section>

${ytPromo}
${kakaoBox}
`,
  });
}

// ── 맛 추천 페이지 (키워드: 마이프로틴 맛 추천, 맛 순위, 맛 종류) ──
const TASTE = fs.existsSync(path.join(ROOT, 'data/taste.json')) ? readJson('data/taste.json') : null;
if (TASTE) {
  const tiers = (TASTE.tiers || []).filter(t => t.flavors && t.flavors.length);
  const tieredNames = new Set(tiers.flatMap(t => t.flavors.map(f => f.name)));
  const top = tiers[0];
  const tierCls = { S: 's', A: 'a', B: 'b', C: 'b', F: 'f' };
  const tierHtml = tiers.map(t => `<div class="tier tier-${tierCls[t.tier] || 'b'}">
  <div class="th"><span class="tg">${esc(t.tier)}</span><div><b>${esc(t.label || '')}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ''}</div></div>
  <ul class="fl">${t.flavors.map(f => `<li><span class="fn">${esc(f.name)}</span>${f.product ? `<span class="fp">${esc(f.product)}</span>` : ''}${f.note ? `<span class="fnote">${esc(f.note)}</span>` : ''}</li>`).join('')}</ul>
</div>`).join('');
  const catalogHtml = (TASTE.catalog || []).map(c => `<li><b>${esc(c.product)}</b> <span>${c.flavors.map(f => tieredNames.has(f) ? `<mark>${esc(f)}</mark>` : esc(f)).join(' · ')}</span></li>`).join('');
  const TASTE_FAQ = [
    ['마이프로틴 맛 추천, 처음이면 뭘 사야 하나요?',
     top && top.flavors.length ? `${top.tier} 등급 중에서 고르면 실패가 없습니다. ${top.flavors.slice(0, 3).map(f => f.name).join(', ')} 순으로 많이 권합니다. 처음이면 250g 맛보기로 두세 가지를 사 보는 편이 안전합니다.` : '처음이면 250g 맛보기로 두세 가지를 사 보는 편이 안전합니다. 등급표는 영상에서 공개한 순서대로 채우고 있습니다.'],
    ['임팩트웨이와 아이솔레이트는 같은 맛이면 맛이 같나요?',
     '다릅니다. 아이솔레이트는 유당과 지방이 적어 더 묽고 담백하게 느껴집니다. 같은 초콜릿 맛이라도 임팩트웨이가 더 진합니다. 텁텁한 게 싫으면 클리어웨이를 보십시오. 주스처럼 마십니다.'],
    ['임팩트웨이와 아이솔레이트(WPI)는 뭐가 다른가요?',
   '임팩트웨이는 유청을 농축한 WPC 제품이고, 아이솔레이트는 한 번 더 걸러 단백질 비율을 높이고 유당과 지방을 줄인 WPI 제품입니다. 우유를 먹으면 배가 불편하거나 더 가볍게 마시고 싶으면 아이솔레이트가 낫고, 맛과 가격을 보면 임팩트웨이가 무난합니다. 그림과 표로 정리한 비교는 임팩트웨이 vs 아이솔레이트 페이지에 있습니다.'],
  ['맛 등급은 어떻게 정했나요?',
     '마프대란알리미 채널에서 6천만 원 넘게 사 먹으며 정리한 등급표입니다. 개인 취향이 들어가 있으니 참고용입니다. 영상 댓글의 다른 분들 경험도 같이 보십시오.'],
    ['맛 때문에 실패하지 않으려면?',
     '대용량(2.5kg 이상)은 먹어본 맛만 사십시오. 새 맛은 250g으로 먼저 확인하고, 대란 때 대용량으로 넘어가면 됩니다. 이 사이트 대란 가격 비교 페이지에서 250g과 2.5kg 가격 차이를 볼 수 있습니다.'],
  ];
  page({
    file: 'taste.html', priority: 0.8, current: 'taste.html', lastmod: TASTE.updated || last.date,
    title: `마이프로틴 맛 추천 ${Y(curYm)} | 6천만원 먹고 만든 맛 순위·등급표 (임팩트웨이·클리어웨이)`,
    desc: `마이프로틴 맛 추천과 맛 순위를 등급표로 정리했습니다. 실패 없는 S등급부터 피해야 할 맛까지, 임팩트웨이·아이솔레이트·클리어웨이 맛 종류와 후기. 6천만 원 넘게 사 먹은 마프대란알리미 기준.`,
    keywords: ['마이프로틴 맛 추천', '마이프로틴 맛 순위', '마이프로틴 맛 종류', '마이프로틴 맛 후기', '마이프로틴 맛 비교', '마이프로틴 추천 맛', '임팩트웨이 맛 추천', '클리어웨이 맛 추천', '마이프로틴 wpi 맛 추천', '마이프로틴 맛 추천 디시'],
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 맛 추천', 'taste.html']]), faqLd(TASTE_FAQ),
      ...(TASTE.video ? [{ '@type': 'VideoObject', name: '마이프로틴 맛 추천 : 6천만원 쓰고 만들어본 마프 맛 등급표', thumbnailUrl: `https://i.ytimg.com/vi/${TASTE.video}/hqdefault.jpg`, uploadDate: '2026-03-22', embedUrl: `https://www.youtube.com/embed/${TASTE.video}`, contentUrl: ytWatch(TASTE.video) }] : [])],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 맛 추천<br>6천만원 먹고 만든 등급표</h1>
<p class="updated">${dot(TASTE.updated || last.date)} 기준 · 새 맛이 나오면 추가</p>
<p class="lede">마이프로틴 맛 순위를 등급으로 나눴습니다. 처음이면 S등급에서 고르고, 새 맛은 250g으로 먼저 확인하십시오. 등급은 마프대란알리미가 직접 먹어본 기준이라 취향이 들어가 있습니다.</p>
${heroCta}
</div>
<div class="heroSide">
${TASTE.video ? `<div class="ytPromo">
  <a class="ytThumb" href="${ytWatch(TASTE.video)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(TASTE.video)}/hqdefault.jpg" alt="마이프로틴 맛 등급표 영상" loading="lazy" width="480" height="360"><span class="ytPlay"><span>▶</span></span></a>
  <div class="ytBody"><p class="ytTitle">맛 등급표 영상으로 보기</p><div class="ytBtns"><a class="cta" href="${ytWatch(TASTE.video)}" target="_blank" rel="noopener">영상 보기</a></div></div>
</div>` : ''}
</div>
</div>`,
    restHtml: `
${tiers.length ? `<section class="full">
<h2>마이프로틴 맛 등급표</h2>
${tierHtml}
</section>` : `<section class="full">
<h2>마이프로틴 맛 등급표</h2>
<p class="lede">영상에서 공개한 S·A·B·F 등급을 표로 옮기는 중입니다. 지금은 영상에서 확인하십시오.</p>
</section>`}

${(TASTE.comments || []).length ? `<section class="full">
<h2>영상 댓글에 올라온 한 줄 평</h2>
<p class="lede">맛 등급표 영상에 시청자들이 남긴 후기입니다.</p>
<ul class="fl cmts">${TASTE.comments.map(c => `<li class="${c.good ? 'good' : 'bad'}"><span class="fn">${esc(c.flavor)}</span><span class="fnote">${esc(c.text)}</span></li>`).join('')}</ul>
</section>` : ''}

<section class="full">
<h2>지금 파는 마이프로틴 맛 종류</h2>
<p class="lede">${dot(db.priceDate || last.date)} 기준 마이프로틴 한국 사이트에서 파는 맛입니다.${tiers.length ? ' 등급표에 있는 맛은 표시해 뒀습니다.' : ''}</p>
<ul class="catalog">${catalogHtml}</ul>
</section>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(TASTE_FAQ)}
</section>

<section>
<h2>맛 고른 다음에</h2>
<a class="cta ghost" href="./wpc-wpi.html">임팩트웨이 vs 아이솔레이트 비교표</a>
<a class="cta ghost" href="./price.html">250g과 2.5kg 대란 가격 차이 보기</a>
<a class="cta ghost" href="./calc.html">장바구니 최종 결제금액 계산</a>
<a class="cta ghost" href="./code.html">오늘 쓸 수 있는 할인코드</a>
</section>

${kakaoBox}
`,
  });
}

// ── 임팩트웨이 vs 아이솔레이트 비교 페이지 (키워드: 마이프로틴 아이솔레이트, WPC WPI 차이) ──
{
  const flavorsOf = key => (TASTE?.catalog || []).find(c => c.product.includes(key))?.flavors.length;
  const W = [
    { key: 'impact', short: '임팩트웨이', name: '임팩트웨이 프로틴', type: 'WPC', typeKo: '농축 유청', protein: '보통', lactose: '조금 있음', feel: '우유처럼 진하고 부드러움', mix: '물이나 우유', who: '처음 사는 사람, 가성비', flavor: flavorsOf('임팩트'), dot: 2 },
    { key: 'iso', short: '아이솔레이트', name: '임팩트웨이 아이솔레이트', type: 'WPI', typeKo: '분리 유청', protein: '높음', lactose: '아주 적음', feel: '더 묽고 담백함', mix: '물이나 우유', who: '우유 먹으면 배가 불편한 사람', flavor: flavorsOf('아이솔레이트'), dot: 3 },
    { key: 'clear', short: '클리어웨이', name: '클리어웨이 프로틴', type: 'WPI', typeKo: '맑은 음료형', protein: '높음', lactose: '아주 적음', feel: '주스처럼 맑고 가벼움', mix: '찬물 (우유 X)', who: '텁텁한 게 싫은 사람, 여름', flavor: flavorsOf('클리어'), dot: 3 },
  ];
  const meter = n => '<span class="meter" aria-label="' + n + '단계 중 3">' + [1, 2, 3].map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span>';
  // 컵 세 개에 단백질·유당·지방 알갱이를 그려, 거를수록 단백질만 남는 걸 보여 줍니다 (알갱이 수는 이해용)
  const DOT = { p: '#003942', l: '#E8B931', f: '#E8858A' };
  const cup = (cx, liquid, n, name, sub, subColor, clear) => {
    const top = 46, bot = 176, hwT = 40, hwB = 30, ly = 62;
    const hw = y => hwT - (hwT - hwB) * (y - top) / (bot - top);
    const pts = [];
    [80, 96, 112, 128, 144, 160].forEach((y, r) => [-2, -1, 0, 1, 2].forEach((c, k) => {
      const i = r * 5 + k, f = (hw(y) - 10) / 24;
      pts.push([cx + c * 12 * f + ((i * 37) % 7 - 3) * 0.8, y + ((i * 53) % 5 - 2)]);
    }));
    const order = pts.map((_, i) => (i * 11) % 30);
    const kinds = [...Array(n.p).fill('p'), ...Array(n.l).fill('l'), ...Array(n.f).fill('f')];
    const dots = kinds.map((k, i) => { const [x, y] = pts[order[i]]; return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.6" fill="' + DOT[k] + '"/>'; }).join('');
    const body = (y0, h0) => 'M' + (cx - h0) + ',' + y0 + ' L' + (cx + h0) + ',' + y0 + ' L' + (cx + hwB) + ',' + (bot - 8) + ' Q' + (cx + hwB) + ',' + bot + ' ' + (cx + hwB - 8) + ',' + bot + ' L' + (cx - hwB + 8) + ',' + bot + ' Q' + (cx - hwB) + ',' + bot + ' ' + (cx - hwB) + ',' + (bot - 8) + ' Z';
    return '<path d="' + body(ly, hw(ly)) + '" fill="' + liquid + '"/>' +
      (clear ? '<path d="M' + (cx - 20) + ',72 L' + (cx - 26) + ',164" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>' : '') +
      dots +
      '<path d="' + body(top, hwT) + '" fill="none" stroke="#1D1D1F" stroke-opacity=".55" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<text x="' + cx + '" y="204" text-anchor="middle" font-size="15" font-weight="800" fill="#1D1D1F">' + name + '</text>' +
      '<text x="' + cx + '" y="223" text-anchor="middle" font-size="12.5" font-weight="700" fill="' + subColor + '">' + sub + '</text>';
  };
  const step = (x, label) => '<g><text x="' + x + '" y="100" text-anchor="middle" font-size="11" font-weight="700" fill="#6E6E73">' + label + '</text><path d="M' + (x - 11) + ',112 L' + (x + 9) + ',112 M' + (x + 3) + ',106 L' + (x + 10) + ',112 L' + (x + 3) + ',118" stroke="#6E6E73" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
  const legend = [['p', '단백질'], ['l', '유당(우유 당)'], ['f', '지방']].map(([k, t], i) => { const x = [62, 150, 262][i]; return '<circle cx="' + x + '" cy="252" r="5" fill="' + DOT[k] + '"/><text x="' + (x + 10) + '" y="256.5" font-size="12.5" fill="#424245">' + t + '</text>'; }).join('');
  const wheySvg = '<figure class="wheyPic"><svg viewBox="0 0 360 268" role="img" aria-label="컵 세 개 그림. 임팩트웨이는 단백질 사이에 유당과 지방 알갱이가 섞여 있고, 한 번 더 거른 아이솔레이트는 거의 단백질만 남았고, 클리어웨이는 같은 단백질을 맑은 음료로 만든 것입니다.">' +
    cup(60, '#F1E6D3', { p: 15, l: 6, f: 4 }, '임팩트웨이', 'WPC · 농축', '#003942') +
    step(120, '더 거름') +
    cup(180, '#F7F2EA', { p: 21, l: 1, f: 1 }, '아이솔레이트', 'WPI · 분리', '#DD592B') +
    step(240, '맑게') +
    cup(300, '#DDF3E7', { p: 21, l: 1, f: 0 }, '클리어웨이', 'WPI · 음료형', '#2E9C6A', true) +
    legend + '</svg><figcaption>알갱이 수는 이해를 돕기 위한 그림입니다. 실제 함량은 맛마다 다릅니다.</figcaption></figure>';
  const WPI_FAQ = [
    ['임팩트웨이와 아이솔레이트(WPI)는 뭐가 다른가요?',
     '둘 다 우유에서 나온 유청 단백질입니다. 임팩트웨이는 유청을 농축한 WPC이고, 아이솔레이트는 한 번 더 걸러 유당과 지방을 빼고 단백질 비율을 높인 WPI입니다. 그래서 아이솔레이트가 더 묽고 담백하고, 값은 더 비쌉니다.'],
    ['아이솔레이트가 단백질이 더 많나요?',
     'WPI는 단백질 비율이 90% 이상인 유청을 말합니다. 같은 한 스쿱이면 아이솔레이트 쪽 단백질이 조금 더 많고 탄수화물과 지방은 더 적습니다. 다만 차이가 크지 않아서, 배가 불편하지 않다면 임팩트웨이로도 충분합니다. 정확한 함량은 맛마다 달라 제품 영양 정보를 확인하십시오.'],
    ['우유 먹으면 배가 아픈데 뭘 먹어야 하나요?',
     '유당이 적은 아이솔레이트나 클리어웨이가 편한 경우가 많습니다. 완전한 무유당 제품은 아니니 증상이 심하면 250g 맛보기로 먼저 확인하십시오. 아이솔레이트도 우유에 타면 우유의 유당이 들어가니 물에 타는 편이 낫습니다.'],
    ['클리어웨이는 뭐가 다른가요?',
     '아이솔레이트를 주스처럼 맑게 만든 제품입니다. 찬물에 타 먹고 과일 맛이 많습니다. 우유 맛 단백질이 질렸거나 운동 중에 가볍게 마시고 싶을 때 좋습니다.'],
  ];
  page({
    file: 'wpc-wpi.html', priority: 0.8, current: 'wpc-wpi.html', lastmod: db.priceDate || last.date,
    title: '임팩트웨이 vs 아이솔레이트 차이 | 마이프로틴 WPC·WPI·클리어웨이 비교표',
    desc: '마이프로틴 임팩트웨이(WPC)와 아이솔레이트(WPI), 클리어웨이를 그림과 표로 비교했습니다. 단백질·유당·맛·타는 법을 한눈에 보고 나에게 맞는 제품을 고르세요.',
    keywords: ['마이프로틴 아이솔레이트', '임팩트웨이 아이솔레이트', '임팩트웨이 아이솔레이트 차이', '마이프로틴 wpi wpc 차이', 'wpc wpi 차이', '마이프로틴 임팩트웨이', '클리어웨이 프로틴', '마이프로틴 단백질 종류'],
    ld: [crumbs([['홈', 'index.html'], ['임팩트웨이 vs 아이솔레이트', 'wpc-wpi.html']]), faqLd(WPI_FAQ)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>임팩트웨이 vs 아이솔레이트<br>한눈에 비교</h1>
<p class="updated">${dot(db.priceDate || last.date)} 기준 · 마이프로틴 한국 사이트 제품</p>
<p class="lede">처음이면 <b>임팩트웨이</b>, 우유 먹고 배가 불편하면 <b>아이솔레이트</b>, 텁텁한 게 싫으면 <b>클리어웨이</b>입니다. 셋 다 마이프로틴 유청 단백질이고, 얼마나 걸렀느냐가 다릅니다.</p>
${heroCta}
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>나에게 맞는 제품 고르기</h2>
<ul class="pick">${W.map(w => '<li class="pick-' + w.key + '"><span class="pt">' + w.type + '</span><b>' + esc(w.short) + '</b><span class="pw">' + esc(w.who) + '</span><span class="pf">' + esc(w.feel) + '</span></li>').join('')}</ul>
</section>

<section class="full">
<h2>그림으로 보면: 거를수록 단백질만 남습니다</h2>
<p class="lede">우유에서 치즈를 만들고 남은 물이 유청입니다. 이걸 농축하면 <b>임팩트웨이(WPC)</b>, 한 번 더 걸러 유당과 지방을 빼면 <b>아이솔레이트(WPI)</b>, 그걸 주스처럼 맑게 만들면 <b>클리어웨이</b>입니다.</p>
${wheySvg}
</section>

<section class="full">
<h2>비교표</h2>
<div class="cmpWrap"><table class="cmp">
<thead><tr><th></th>${W.map(w => '<th class="c-' + w.key + '">' + esc(w.short) + '</th>').join('')}</tr></thead>
<tbody>
<tr><th>종류</th>${W.map(w => '<td><b>' + w.type + '</b><small>' + esc(w.typeKo) + '</small></td>').join('')}</tr>
<tr><th>단백질 비율</th>${W.map(w => '<td>' + meter(w.dot) + esc(w.protein) + '</td>').join('')}</tr>
<tr><th>유당·지방</th>${W.map(w => '<td>' + esc(w.lactose) + '</td>').join('')}</tr>
<tr><th>맛·질감</th>${W.map(w => '<td>' + esc(w.feel) + '</td>').join('')}</tr>
<tr><th>타는 법</th>${W.map(w => '<td>' + esc(w.mix) + '</td>').join('')}</tr>
${W.some(w => w.flavor) ? '<tr><th>맛 종류</th>' + W.map(w => '<td>' + (w.flavor ? w.flavor + '가지' : '-') + '</td>').join('') + '</tr>' : ''}
<tr><th>이런 분께</th>${W.map(w => '<td>' + esc(w.who) + '</td>').join('')}</tr>
</tbody></table></div>
<p class="hint">단백질 비율은 일반적인 WPC·WPI 기준입니다. 정확한 함량은 맛마다 달라 제품 영양 정보를 확인하십시오.</p>
</section>

<a class="cta ghost" href="./price.html">용량별 평소·대란 가격 보기</a>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(WPI_FAQ)}
</section>

<section>
<h2>고른 다음에</h2>
<a class="cta ghost" href="./taste.html">마이프로틴 맛 추천 등급표</a>
${altMp ? '<a class="cta ghost" href="./alternatives.html">다른 브랜드와 가성비 비교</a>' : ''}
<a class="cta ghost" href="./calc.html">장바구니 최종 결제금액 계산</a>
<a class="cta ghost" href="./code.html">오늘 쓸 수 있는 할인코드</a>
</section>

${kakaoBox}
`,
  });
}

// ── 마이프로틴 대안·가성비 비교 페이지 (키워드: 마이프로틴 대안, 단백질 보충제 가성비, 단백질 1g당 가격) ──
if (ALT && altMp) {
  const L = ALT.links || {};
  const shopUrl = it => {
    if (it.aff) return it.aff;
    if (L.iherb && /iherb\.com/.test(it.url)) return it.url + (it.url.includes('?') ? '&' : '?') + 'rcode=' + encodeURIComponent(L.iherb);
    return it.url;
  };
  // 마이프로틴 쪽은 discount.json 의 표시가에 오늘 코드와 대란 코드를 적용해 줄을 만듭니다 (오늘이 대란이면 한 줄)
  const mpRows = (ALT.myprotein || []).flatMap(m => {
    const p = PRODUCTS.find(p => p.name === m.match[0] && p.size === m.match[1]);
    if (!p) return [];
    const dPrice = p.price * (1 - dRate / 100);
    return [{ brand: '마이프로틴', product: `${p.name} ${p.size}`, type: m.type, grams: m.grams, protein: m.protein, serving: m.serving, price: p.price * (1 - last.base / 100), shop: '공식몰', tag: `${isDaeran ? '오늘 대란 코드' : '오늘 코드'} ${last.base}%`, extra: dRate !== last.base ? `대란 평균 ${dRate}%면 ${won(dPrice)} (1kg당 ${won(dPrice / m.grams * 1000)})` : '', url: p.url, mp: true, checked: db.priceDate || last.date }];
  });
  const others = (ALT.items || []).map(it => ({ ...it, price: it.price > 0 ? it.price : null }));
  const all = [...mpRows, ...others].map(r => ({ ...r, kg: r.price ? r.price / r.grams * 1000 : null, pg: r.price ? r.price / (r.grams * r.protein / r.serving) : null }));
  const priced = all.filter(r => r.pg).sort((a, b) => a.pg - b.pg);
  const unpriced = all.filter(r => !r.pg);
  const best = priced[0];
  const bestAlt = priced.find(r => !r.mp) || null;
  const mpRef = all.find(r => r.mp && r.product === `${altMp.p.name} ${altMp.p.size}`) || all[0];
  const mpDaeranPg = altMp.p.price * (1 - dRate / 100) / (altMp.m.grams * altMp.m.protein / altMp.m.serving);
  const daeranNote = !isDaeran && dRate !== last.base ? ` 대란 평균 ${dRate}%면 마이프로틴은 ${won(mpDaeranPg)}까지 내려갑니다.` : '';
  const p1 = PRODUCTS.find(p => p.name === altMp.p.name && p.size === '1kg');
  const altCount = others.length;

  const row = r => `<tr class="${r.mp ? 'mp' : ''}${r === best ? ' best' : ''}${r.pg ? '' : ' np'}">
<td class="p"><a href="${esc(r.mp ? affTo(r.url) : shopUrl(r))}" target="_blank" rel="sponsored nofollow noopener"${r.mp && primary ? ` data-copy="${b64(primary.code)}" data-label="${esc(nameOf(primary))}"` : ''}><small class="br">${esc(r.brand)}${r.type ? ` · ${esc(r.type)}` : ''}${r === best ? '<i class="tag">가장 쌈</i>' : ''}</small>${esc(r.product)}</a><small class="sh">${esc(r.shop)}${r.tag ? ` · ${esc(r.tag)}` : ''}${r.checked ? ` · ${dot(r.checked)} 확인` : ''}${r.extra ? `<br>${esc(r.extra)}` : ''}</small></td>
<td class="n">${r.price ? won(r.price) : '<span class="muted">확인 중</span>'}</td>
<td class="n">${r.kg ? won(r.kg) : '-'}</td>
<td class="n hot">${r.pg ? won(r.pg) : '-'}</td></tr>`;

  const altTable = `<div class="altWrap"><table class="alt">
<thead><tr><th>제품</th><th class="n">가격</th><th class="n">1kg당</th><th class="n">단백질<br>1g당</th></tr></thead>
<tbody>${priced.map(row).join('')}${unpriced.map(row).join('')}</tbody>
</table></div>`;

  const verdict = bestAlt
    ? (mpRef.pg <= bestAlt.pg
      ? `지금 표에서는 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}(오늘 코드 ${last.base}%)가 단백질 1g당 ${won(mpRef.pg)}으로 가장 쌉니다. 그다음이 ${esc(bestAlt.brand)} ${esc(bestAlt.product)}(${won(bestAlt.pg)})입니다.${daeranNote}`
      : `지금 표에서는 ${esc(bestAlt.brand)} ${esc(bestAlt.product)}가 단백질 1g당 ${won(bestAlt.pg)}으로 가장 싸고, 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}(오늘 코드 ${last.base}%)는 ${won(mpRef.pg)}입니다.${daeranNote}`)
    : `다른 브랜드 가격은 확인하는 대로 채웁니다. 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}는 오늘 코드 ${last.base}% 기준 1kg당 ${won(mpRef.kg)}, 단백질 1g당 ${won(mpRef.pg)}입니다.${daeranNote}`;

  const ALT_FAQ = [
    ['마이프로틴 대안 있나요?',
     `있습니다. 한국에서 직구로 많이 사는 건 옵티멈뉴트리션 골드 스탠다드, 룰원 R1, 다이마타이즈 ISO100 정도이고, 아이허브나 쿠팡 로켓직구에서 삽니다. 다만 마이프로틴도 대란 때 코드를 쓰면 ${altMp.p.name} ${altMp.p.size}이 1kg당 ${won(altMp.kg)}이라 여전히 싼 편입니다. 대란이 아닐 때 급하게 사야 하면 표에서 단백질 1g당 가격이 낮은 쪽을 고르면 됩니다.`],
    ['마이프로틴이 왜 이렇게 비싸졌나요?',
     p1 ? `정가가 올랐습니다. ${p1.name} 1kg 정가가 ${won(p1.rrp)}이라 코드 없이 보면 비싸 보입니다. 마이프로틴은 늘 코드를 전제로 한 가격이라 코드 ${last.base}%를 넣으면 ${won(p1.price * (1 - last.base / 100))}, 대란 ${dRate}%면 ${won(p1.price * (1 - dRate / 100))}입니다. 그리고 1kg보다 2.5kg이 1kg당 가격이 훨씬 내려가니, 비교할 때는 큰 용량끼리 보는 게 맞습니다.`
        : `정가가 올랐습니다. 마이프로틴은 늘 코드를 전제로 한 가격이라 코드 없이 정가만 보면 비싸 보입니다. 2.5kg 이상 큰 용량일수록 1kg당 가격이 많이 내려갑니다.`],
    ['단백질 1g당 가격은 어떻게 계산하나요?',
     '가격 ÷ (총 용량 × 한 스쿱 단백질 ÷ 한 스쿱 무게)입니다. 같은 1kg이라도 WPI는 단백질 비율이 높아서 1kg당 가격은 비싸도 단백질 1g당으로 보면 차이가 줄어듭니다. 맛마다 함량이 조금 달라 대표값으로 계산했습니다.'],
    ['직구하면 관세는 언제 붙나요?',
     `한 번에 ${SHOP.customsUsd}달러(약 ${won(SHOP.customsUsd * SHOP.usdKrw)})를 넘으면 관세와 부가세가 붙습니다. 아이허브와 쿠팡 로켓직구도 같은 기준이고, 마이프로틴은 ${won(SHOP.freeShipping)} 이상이면 무료배송입니다. 넘을 것 같으면 나눠서 주문하십시오.`],
    ['어느 사이트가 제일 싼가요?',
     '제품마다 다릅니다. 같은 제품도 아이허브, 쿠팡 로켓직구, 공식몰 가격이 다르고 환율에 따라 바뀝니다. 그래서 이 표는 확인한 날의 가격을 적고 확인일을 같이 표시합니다. 사기 전에 링크로 들어가 현재 가격을 한 번 더 확인하십시오.'],
  ];

  page({
    file: 'alternatives.html', priority: 0.8, current: 'alternatives.html', lastmod: db.priceDate || last.date,
    title: '마이프로틴 대안 | 단백질 보충제 가성비 비교 (1kg당·단백질 1g당 가격)',
    desc: `마이프로틴 너무 비싸졌다면? 옵티멈뉴트리션 골드 스탠다드, 룰원, 다이마타이즈, 아이허브 자체 브랜드까지 한국에서 직구로 많이 사는 프로틴을 1kg당·단백질 1g당 가격으로 비교했습니다. 마이프로틴 대란가(코드 ${altMp.rate}%)는 1kg당 ${won(altMp.kg)}.`,
    keywords: ['마이프로틴 대안', '마이프로틴 대체', '마이프로틴 비싸', '단백질 보충제 가성비', '단백질 보충제 추천', '프로틴 1kg당 가격', '단백질 1g당 가격', '옵티멈뉴트리션 마이프로틴 비교', '골드스탠다드 가격', '룰원 프로틴 가격', '아이허브 프로틴 추천', '프로틴 직구 추천'],
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 대안', 'alternatives.html']]), faqLd(ALT_FAQ)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 대안<br>단백질 보충제 가성비 비교</h1>
<p class="updated">${dot(db.priceDate || last.date)} 기준 · 마이프로틴 가격은 코드 할인율에 맞춰 매일 갱신</p>
<p class="lede">"마이프로틴 너무 비싸졌는데 대안 없나요?"에 대한 답입니다. 대란 때는 <b>${esc(altMp.p.name)} ${esc(altMp.p.size)}이 1kg당 ${won(altMp.kg)}</b>이라 여전히 싼 편이고, 평소 가격이라면 아래 제품들과 <b>단백질 1g당 가격</b>으로 비교해 보고 고르면 됩니다.</p>
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>마이프로틴 대란가</dt><dd>1kg당 ${won(altMp.kg)}</dd></div>
  <div><dt>가장 싼 다른 브랜드</dt><dd>${bestAlt ? `1kg당 ${won(bestAlt.kg)}` : '확인 중'}</dd></div>
  <div><dt>비교 제품</dt><dd>${altCount + mpRows.length}개</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>단백질 1g당 가격으로 줄 세우기</h2>
<p class="lede">${verdict}</p>
${altTable}
<p class="hint">단백질 1g당 가격이 낮을수록 가성비가 좋습니다. 가격은 적힌 확인일 기준이라 지금과 다를 수 있고, 마이프로틴 줄은 표시가에 코드만 적용한 값입니다. 마이프로틴 링크는 제휴 링크이고 다른 쇼핑몰 링크도 제휴 링크일 수 있습니다.</p>
</section>

<section class="full">
<h2>어디서 사는 게 좋을까</h2>
<ul class="shops">
  <li><b>마이프로틴</b><span>할인코드를 넣어야 제값입니다. 대란(코드 ${TH}% 이상)이면 고민할 것 없이 마이프로틴이 가장 쌉니다. ${won(SHOP.freeShipping)} 이상 무료배송, 영국에서 옵니다.</span></li>
  <li><b>쿠팡 로켓직구</b><span>옵티멈뉴트리션, 룰원, 다이마타이즈가 빠르면 다음 날 옵니다. 급할 때 가장 편하고, 가격은 아이허브보다 조금 비쌀 때가 많습니다.</span></li>
  <li><b>아이허브</b><span>한국어와 원화로 결제하는 직구 사이트입니다. 자체 브랜드(캘리포니아 골드 뉴트리션)가 보통 가장 싸고, 세일이 자주 바뀝니다.</span></li>
</ul>
<p class="hint">어디서 사든 한 번에 ${SHOP.customsUsd}달러를 넘으면 관세가 붙으니 나눠서 주문하십시오.</p>
</section>

<section class="full">
<h2>WPC와 WPI 중 뭘 골라야 하나요</h2>
<p class="lede">표의 WPC는 농축 유청, WPI는 분리 유청입니다. 우유 먹고 배가 편하면 WPC가 싸고, 불편하면 WPI가 맞습니다. 둘의 차이는 그림으로 정리해 뒀습니다.</p>
<a class="cta ghost" href="./wpc-wpi.html">임팩트웨이 vs 아이솔레이트 그림으로 보기</a>
</section>

<section>
<h2>자주 묻는 질문</h2>
${faqHtml(ALT_FAQ)}
</section>

<section>
<h2>마이프로틴으로 산다면</h2>
<a class="cta ghost" href="./price.html">용량별 평소·대란 가격 보기</a>
<a class="cta ghost" href="./code.html">오늘 쓸 수 있는 할인코드</a>
<a class="cta ghost" href="./calc.html">장바구니 최종 결제금액 계산</a>
</section>

${ytPromo}
${kakaoBox}
`,
  });
}

// ── 보충제 성분 비교 (public:false 면 비밀 주소 + noindex. 메뉴·사이트맵·robots 어디에도 안 적습니다) ──
const NUT = fs.existsSync(path.join(ROOT, 'data/nutrition.json')) ? readJson('data/nutrition.json') : null;
if (NUT && (NUT.items || []).length) {
  const isPublic = NUT.public === true;
  const nutFile = isPublic ? 'nutrition.html' : `${NUT.slug || 'lab'}.html`;
  const items = NUT.items;
  const has = v => v != null && v !== '';
  const num = (v, d = 1) => has(v) ? (Number.isInteger(v) ? String(v) : Number(v).toFixed(d)) : '-';
  const ratio = it => has(it.protein) && has(it.serving) ? Math.round(it.protein / it.serving * 100) : null;
  const filled = items.filter(it => has(it.protein));
  const missing = items.filter(it => !has(it.protein));
  const ranked = [...filled].sort((a, b) => ratio(b) - ratio(a));
  const nutRow = it => `<tr class="${has(it.protein) ? '' : 'np'}"><th scope="row"><small>${esc(it.brand)}${it.type ? ' · ' + esc(it.type) : ''}</small>${esc(it.product)}</th><td class="n">${has(it.serving) ? num(it.serving, 0) + 'g' : '-'}</td><td class="n hot">${has(it.protein) ? num(it.protein) + 'g' : '-'}${ratio(it) != null ? `<small>${ratio(it)}%</small>` : ''}</td><td class="n">${num(it.carb)}</td><td class="n">${num(it.sugar)}</td><td class="n">${num(it.fat)}</td><td class="n">${has(it.sodium) ? Math.round(it.sodium) + 'mg' : '-'}</td><td class="n">${num(it.kcal, 0)}</td></tr>`;
  const ingRow = it => `<tr class="${has(it.ingredients) ? '' : 'np'}"><th scope="row"><small>${esc(it.brand)}</small>${esc(it.product)}</th><td>${esc(it.proteinSource || '-')}</td><td>${(it.sweeteners || []).length ? it.sweeteners.map(esc).join(', ') : (has(it.ingredients) ? '없음' : '-')}</td><td class="ing">${esc(it.ingredients || '-')}</td><td>${esc(it.flavor || '-')}</td><td class="src">${it.source ? `<a href="${esc(it.source)}" target="_blank" rel="noopener nofollow">출처</a>` : ''}${it.checked ? `<small>${dot(it.checked)} 확인</small>` : ''}${it.note ? `<small>${esc(it.note)}</small>` : ''}</td></tr>`;
  const reviews = NUT.reviews || [];
  const byBrand = {};
  for (const r of reviews) (byBrand[r.brand || '기타'] ||= []).push(r);
  const cnt = (rs, s) => rs.filter(r => r.sentiment === s).length;
  const revHtml = reviews.length
    ? Object.entries(byBrand).map(([b, rs]) => `<details open><summary>${esc(b)} <small>${rs.length}건 · 긍정 ${cnt(rs, '긍정')} · 부정 ${cnt(rs, '부정')}</small></summary><ul class="rev">${rs.map(r => `<li><b class="${r.sentiment === '긍정' ? 'pos' : r.sentiment === '부정' ? 'neg' : ''}">${esc(r.sentiment || '중립')}</b>${r.topic ? `<i>${esc(r.topic)}</i> ` : ''}${esc(r.quote || '')}<small>${esc(r.source || '')}${r.product ? ` · ${esc(r.product)}` : ''}${r.date ? ` · ${dot(r.date)}` : ''}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener nofollow">원문</a>` : ''}</small></li>`).join('')}</ul></details>`).join('')
    : '<p class="lede">아직 없습니다. 디시·네이버 등에서 모은 반응을 data/nutrition.json 의 reviews 에 넣으면 브랜드별로 묶여 나옵니다.</p>';
  const top = ranked[0];
  page({
    file: nutFile, noindex: !isPublic, current: '', priority: 0.5,
    title: isPublic ? '단백질 보충제 성분 비교 | 1회분 단백질·당·감미료·원재료' : '보충제 성분 비교 (비공개 테스트)',
    desc: '단백질 보충제의 1회분 영양성분과 원재료, 감미료를 브랜드별로 비교한 표입니다.',
    keywords: isPublic ? ['단백질 보충제 성분 비교', '프로틴 성분 비교', '프로틴 감미료', '수크랄로스 프로틴'] : [],
    ld: isPublic ? [crumbs([['홈', 'index.html'], ['성분 비교', nutFile]])] : [],
    heroHtml: `
<div class="hero">
<div class="heroMain">
${isPublic ? '' : '<span class="labTag">비공개 테스트 · 주소를 아는 사람만 봅니다</span>'}
<h1>보충제 성분 비교<br>1회분 단백질·당·감미료</h1>
<p class="updated">${filled.length}개 수집 · ${missing.length}개 미수집 · 공식 사이트 영양정보 기준</p>
<p class="lede">같은 "유청 단백질"이라도 1회분에 단백질이 얼마나 들었는지(비율), 당과 나트륨은 얼마인지, 어떤 감미료를 쓰는지가 다릅니다.${top ? ` 지금 수집된 것 중 단백질 비율이 가장 높은 건 <b>${esc(top.brand)} ${esc(top.product)}</b>(${ratio(top)}%)입니다.` : ''}</p>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>1회분 영양성분</h2>
<div class="nutWrap"><table class="nut">
<thead><tr><th>제품</th><th class="n">1회분</th><th class="n">단백질<br><small>비율</small></th><th class="n">탄수</th><th class="n">당</th><th class="n">지방</th><th class="n">나트륨</th><th class="n">열량</th></tr></thead>
<tbody>${ranked.map(nutRow).join('')}${missing.map(nutRow).join('')}</tbody>
</table></div>
<p class="hint">단위는 g, 나트륨은 mg, 열량은 kcal. 비율은 1회분 무게 대비 단백질 무게입니다. 맛마다 수치가 달라서 기준 맛은 아래 표에 적었습니다.</p>
</section>

<section class="full">
<h2>원재료와 감미료</h2>
<div class="nutWrap"><table class="nut ing">
<thead><tr><th>제품</th><th>단백질 원료</th><th>감미료</th><th>원재료 전문</th><th>기준 맛</th><th>출처</th></tr></thead>
<tbody>${filled.map(ingRow).join('')}${missing.map(ingRow).join('')}</tbody>
</table></div>
</section>

<section class="full">
<h2>커뮤니티 반응</h2>
${revHtml}
</section>

${missing.length ? `<section class="full">
<h2>아직 못 모은 것</h2>
<ul class="steps">${missing.map(it => `<li><b>${esc(it.brand)} ${esc(it.product)}</b>${it.note ? ` · ${esc(it.note)}` : ''}</li>`).join('')}</ul>
<p class="hint">data/nutrition.json 의 해당 항목에 값을 채우면 표에 들어갑니다.</p>
</section>` : ''}

<section>
<h2>관련 페이지</h2>
<a class="cta ghost" href="./alternatives.html">가격으로 비교하기 (마이프로틴 대안)</a>
<a class="cta ghost" href="./wpc-wpi.html">WPC와 WPI 차이</a>
</section>
`,
  });
}

// ── 월별 대란 페이지 (키워드: 마이프로틴 N월 대란) ──
for (const ym of monthPages) {
  const st = monthStats(ym);
  const y = Y(ym), m = M(ym);
  const isCur = ym === curYm;
  const isUpcoming = !st.days.length && !st.events.length && !st.videos.length;
  const fromVideos = !st.days.length;
  const prev = monthPages.includes(shiftYm(ym, -1)) ? shiftYm(ym, -1) : null;
  const next = monthPages.includes(shiftYm(ym, 1)) ? shiftYm(ym, 1) : null;
  const lastYear = monthStats(shiftYm(ym, -12));
  const monthDeals = DEALS.filter(d => d.start <= `${ym}-31` && d.end >= `${ym}-01`);
  const evText = st.events.map(e => `${range(e)}${e.max != null ? `(할인코드 ${e.max}%)` : ''}`).join(', ');
  const season = seasonal(ym);
  const seasonShort = season.filter(s => !s.minor).map(s => `${kdate(s.date)} ${s.label.replace(/\(.*?\)/, '')}`).join(', ');
  // 다음 대란 참고일이 이달 안이거나 이달 시작 일주일 전이면 이 달 페이지에도 보여줍니다
  const guessHere = nextGuess && nextGuess <= `${ym}-31` && nextGuess >= addDays(`${ym}-01`, -7);
  const yearEvents = events.filter(e => Y(ymOf(e.start)) === y && e.start < `${ym}-01`);
  const upFaq = isUpcoming ? [
    [`마이프로틴 ${m}월 대란은 언제인가요?`,
     `아직 시작 전입니다.${cycle ? ` 올해 대란은 평균 ${cycle}일 간격으로 돌아왔고` : ''}${guessHere ? ` 단순 계산한 다음 예상 대란일은 ${kdate(nextGuess)}입니다.` : cycle ? ' 아직 다음 예상 대란일은 안 잡혔습니다.' : ''}${season.length ? ` ${m}월에는 ${seasonShort} 행사가 있어 그 전후로 할인율이 오르는 경우가 많습니다.` : ''} 시작되면 이 페이지와 단톡방에 바로 올립니다.`],
    [`${m}월 대란 전에 지금 사도 되나요?`,
     `지금 히든코드는 ${last.base}%입니다. 대란 때와 차이는 몇 %p라 당장 필요하면 지금 사도 손해가 크지 않습니다. 2.5kg 이상 대량 구매라면 ${season.length ? `${kdate(season[0].date)} 전후` : '다음 대란'}까지 기다리는 편이 낫습니다.`],
    [`${m}월 대란 할인율은 얼마나 되나요?`,
     `${knownRange ? `지금까지 대란 때 히든코드는 ${knownRange}였습니다.` : '아직 기록이 없습니다.'}${m === 11 ? ' 블랙프라이데이는 1년 중 할인이 가장 센 때라 이보다 높게 나올 수 있습니다.' : ''} 확정되면 이 페이지에 날짜별로 기록합니다.`],
  ] : [];

  let summary;
  if (isUpcoming) {
    summary = `${y}년 ${m}월은 아직 시작 전입니다.${season.length ? ` ${m}월에는 ${seasonShort} 행사가 있어 대란 가능성이 큰 달입니다.` : ''}${guessHere ? ` 평균 주기(약 ${cycle}일)로 단순 계산한 예상 대란일은 ${kdate(nextGuess)}입니다.` : ''} 대란이 시작되면 이 페이지에 날짜와 할인율을 바로 기록합니다.`;
  } else if (st.events.length) {
    summary = `${y}년 ${m}월 마이프로틴 대란은 ${st.events.length}번 있었습니다. ${evText}입니다.${fromVideos ? ' 마프대란알리미 채널 영상 기준입니다.' : ''}${isCur ? ' 이달은 아직 진행 중이라 매일 갱신됩니다.' : ''}`;
  } else {
    summary = `${y}년 ${m}월에는 ${isCur ? '아직 ' : ''}할인코드 ${TH}% 이상 대란이 ${isCur ? '없습니다. 대란이 시작되면 바로 기록합니다.' : '없었습니다.'}`;
  }
  // 할인율을 모르는 대란이 있는 달은, 매일 기록 값이 대란 기준보다 낮으면 최고값으로 쓰지 않습니다 (대란 1회인데 최고 36%처럼 보이는 것 방지)
  const bestKnown = [st.evMax, st.dayMax].filter(v => v != null);
  let best = bestKnown.length ? Math.max(...bestKnown) : null;
  if (st.events.some(e => e.max == null) && (best == null || best < TH)) best = null;

  page({
    file: monthFile(ym), priority: isCur || isUpcoming ? 0.9 : 0.6, current: monthFile(ym),
    keywords: [`마이프로틴 ${m}월 대란`, `마이프로틴 대란 ${m}월`, `마이프로틴 할인 ${m}월`, `마이프로틴 ${m}월 할인코드`, '마이프로틴 대란 일정', '마이프로틴 대란 날짜'],
    lastmod: st.lastDate ?? (st.videos.at(-1)?.date ?? st.events.at(-1)?.end ?? last.date),
    title: `마이프로틴 ${m}월 대란 일정·할인코드 총정리 (${y}) | ${SITE.brand}`,
    desc: isUpcoming
      ? `${y}년 마이프로틴 ${m}월 대란 날짜와 할인코드.${season.length ? ` ${seasonShort} 전후를 노리세요.` : ''} 시작되면 바로 기록합니다. 지금 쓸 수 있는 히든코드 ${last.base}%와 ${M(curYm)}월 대란 기록도 확인하세요.`
      : `${y}년 마이프로틴 ${m}월 대란 날짜와 할인코드 정리. ${st.events.length ? `대란 ${st.events.length}회(${evText}).` : '대란 없음.'}${st.videos.length ? ` 히든코드와 숨은 할인 영상 ${st.videos.length}편 포함.` : ''}`,
    changefreq: isCur || isUpcoming ? 'daily' : 'monthly',
    ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html'], [`${y}년 ${m}월 대란`, monthFile(ym)]]), ...(upFaq.length ? [faqLd(upFaq)] : []), ...st.videos.map(videoLd)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 ${m}월 대란<br>일정·할인코드 총정리</h1>
<p class="updated">${y}년 ${m}월 · ${isUpcoming ? '시작 전' : fromVideos ? '유튜브 영상 기준' : `${dot(st.lastDate)} 기준${isCur ? ' · 매일 갱신' : ''}`}</p>
<p class="lede">${summary}</p>
${isUpcoming ? `<a class="cta" href="${esc(SITE.kakao)}">${m}월 대란 시작 알림 받기</a>` : ''}
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">${isUpcoming ? `
  <div><dt>지금 히든코드</dt><dd>${last.base}%</dd></div>
  <div><dt>다음 예상 대란</dt><dd>${guessHere ? `${kdate(nextGuess)}${AI_TAG}` : '-'}</dd></div>
  <div><dt>첫 체크일</dt><dd>${season[0] ? kdate(season[0].date) : '-'}</dd></div>` : `
  <div><dt>대란</dt><dd>${st.events.length}회</dd></div>
  <div><dt>최고 할인코드</dt><dd>${best != null ? pct(best) : st.events.length ? '영상 참고' : '-'}</dd></div>
  <div><dt>영상</dt><dd>${st.videos.length ? `${st.videos.length}편` : '-'}</dd></div>`}
</dl>
</div>
</div>`,
    restHtml: `
${st.events.length ? `<section class="full">
<h2>${m}월 대란 날짜</h2>
${eventTable([...st.events].reverse())}
${st.events.some(e => e.note) ? `<ul class="steps">${st.events.filter(e => e.note).map(e => `<li><b>${range(e)}</b> ${esc(e.note)}</li>`).join('')}</ul>` : ''}
</section>` : ''}

${st.videos.length ? `<section class="full">
<h2>${m}월 대란 영상</h2>
<p class="lede">그때그때 히든코드와 숨은 할인을 정리한 영상입니다.</p>
${videoList([...st.videos].reverse())}
</section>` : ''}

${st.days.length > 1 ? `<section class="full">
<h2>${m}월 할인율 그래프</h2>
${trendNote}
${trend(st.days, isCur ? '오늘' : kdate(st.lastDate))}
</section>` : ''}

${monthDeals.length ? `<section class="full">
<h2>${m}월에 붙은 숨은 할인</h2>
${dealItems(monthDeals)}
</section>` : ''}

${st.days.length ? `<section class="full">
<h2>${m}월 날짜별 할인율</h2>
<table>
<thead><tr><th>날짜</th><th class="n">할인코드</th><th class="n">숨은 할인</th><th class="n">실제</th></tr></thead>
<tbody>${[...st.days].reverse().map(d => `<tr${d.base >= TH ? ' class="hot"' : ''}><td>${kdate(d.date)}${d.base >= TH ? ' · 대란' : ''}</td><td class="n">${d.base}%</td><td class="n">${d.deals.length ? `${d.deals.length}건` : '-'}</td><td class="n">${pct(d.eff)}</td></tr>`).join('')}</tbody>
</table>
</section>` : ''}

${season.length ? `<section class="full">
<h2>${m}월에 체크할 날짜</h2>
<p class="lede">해마다 행사가 걸리는 날입니다. 대란을 보장하지는 않지만 할인율이 오를 가능성이 큰 날이라 전날 저녁부터 확인하는 편이 좋습니다.</p>
<ul class="steps">${season.map(s => `<li><b>${kdate(s.date)} ${wd(s.date)}</b> ${s.link ? `<a href="./${s.link}">${esc(s.label)}</a>` : esc(s.label)}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('')}</ul>
</section>` : ''}

${isUpcoming ? `<section class="full">
<h2>지금까지의 대란 흐름</h2>
<p class="lede">${yearEvents.length ? `${y}년 들어 ${m - 1}월까지 대란은 ${yearEvents.length}회 있었고${cycle ? ` 평균 ${cycle}일마다 돌아왔습니다` : '습니다'}. 최근 대란은 ${lastEvent ? `${range(lastEvent)}${lastEvent.max != null ? `(할인코드 ${lastEvent.max}%)` : ''}` : '없음'}입니다.` : '아직 올해 대란 기록이 없습니다.'} ${m}월 대란이 시작되면 같은 기준으로 이 페이지에 기록합니다.</p>
<nav class="pager">${prev ? `<a href="./${monthFile(prev)}">${M(prev)}월 대란 기록</a>` : '<span></span>'}<a href="./daeran.html">전체 대란 기록</a></nav>
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(upFaq)}
</section>` : ''}

${lastYear.events.length || lastYear.days.length ? `<section class="full">
<h2>작년 ${m}월은 어땠나</h2>
<p class="lede">${y - 1}년 ${m}월에는 대란이 ${lastYear.events.length}번 있었습니다.</p>
<a class="cta ghost" href="./${monthFile(lastYear.ym)}">${y - 1}년 ${m}월 대란 보기</a>
</section>` : ''}

<section class="full">
<nav class="pager">${prev ? `<a href="./${monthFile(prev)}">← ${M(prev)}월 대란</a>` : '<span></span>'}<a href="./daeran.html">전체 기록</a>${next ? `<a href="./${monthFile(next)}">${M(next)}월 대란 →</a>` : '<span></span>'}</nav>
</section>

${st.videos.length ? '' : ytPromo}
${kakaoBox}
`,
  });
}

// ── 전체 대란 기록 ──
page({
  file: 'daeran.html', priority: 0.8, current: 'daeran.html',
  keywords: ['마이프로틴 대란 날짜', '마이프로틴 대란 일정', '마이프로틴 대란 주기', '마이프로틴 대란 방법', '역대 마프대란'],
  title: `마이프로틴 대란 일정·날짜 기록 | 평균 주기 ${cycle ?? '-'}일 · 히든코드 최고 ${peak != null ? pct(peak) : '-'} | ${SITE.brand}`,
  desc: `${Y(ymOf(events[0]?.start || last.date))}년 ${M(ymOf(events[0]?.start || last.date))}월부터 기록한 마이프로틴 대란 날짜와 히든코드 할인율입니다. 대란 ${events.length}회, 평균 주기 ${cycle ?? '-'}일. 월별 대란 정리와 영상 포함.`,
  ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html']])],
  heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴<br>대란 일정·기록</h1>
<p class="lede">할인코드 할인율이 ${TH}% 이상이었던 날입니다. ${dot(rows[0].date)} 이전은 마프대란알리미 채널 영상 기준이고, 그 뒤로는 매일 확인한 값입니다.${daysSince !== null && !isDaeran ? ` 마지막 대란은 ${daysSince}일 전입니다.` : ''}</p>
${heroCta}
<a class="cta ghost" href="${esc(SITE.kakao)}">대란 알림 단톡방 들어가기</a>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>총 대란</dt><dd>${events.length}회</dd></div>
  <div><dt>최고 할인코드</dt><dd>${peak != null ? pct(peak) : '-'}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
</dl>
</div>
</div>`,
  restHtml: `
${day.length > 1 ? `<section class="full">
<h2>할인율 추이</h2>
${trendNote}
${trend(day.slice(-90))}
</section>` : ''}
<section>
<h2>월별 대란 정리</h2>
${monthLinks([...monthPages].reverse())}
</section>
<section>
<h2>전체 기록</h2>
${recent.length ? eventTable(recent) : '<p class="lede">아직 기록된 대란이 없습니다.</p>'}
<p class="lede">할인율은 보통 전날 저녁에 바뀝니다. 저녁 이후 확인한 값은 다음 날짜로 기록합니다.</p>
</section>
${ytPromo}
`,
});

// ── 소개 (운영자·확인 방법·수익 공시. 검색엔진이 사이트를 믿게 하는 페이지) ──
const firstYm = ymOf(events[0]?.start || rows[0].date);
const ytUrl = SITE.youtubeChannel ? SITE.youtubeChannel.replace(/\?.*$/, '') : '';
page({
  file: 'about.html', priority: 0.5, changefreq: 'monthly', current: 'about.html', pageType: 'AboutPage',
  title: `마프대란알리미 소개 | ${SITE.brand}는 마이프로틴 할인율을 이렇게 확인합니다`,
  keywords: ['마프대란알리미', '프로티파이', '마프대란알리미 유튜브', '마이프로틴 대란 알리미 사이트', '마이프로틴 할인 정보 사이트'],
  desc: `${SITE.brand}는 유튜브 마프대란알리미가 만드는 마이프로틴 할인 기록 사이트입니다. ${Y(firstYm)}년 ${M(firstYm)}월부터 대란 ${events.length}회를 기록했고 할인코드·히든코드·숨은 할인을 매일 확인합니다. 판정 기준과 수익 구조를 공개합니다.`,
  ld: [crumbs([['홈', 'index.html'], ['소개', 'about.html']]),
    { '@type': 'Person', '@id': `${SITE.origin}/about.html#person`, name: '마프대란알리미', url: ytUrl || `${SITE.origin}/`, sameAs: ytUrl ? [ytUrl] : [], knowsAbout: ['마이프로틴 할인코드', '마이프로틴 대란', '마이프로틴 맛 추천'], worksFor: { '@id': `${SITE.origin}/#org` } }],
  heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>${esc(SITE.brand)}는 누가,<br>어떻게 만드나요</h1>
<p class="lede answer">유튜브 <b>마프대란알리미</b> 채널이 만드는 마이프로틴 할인 기록 사이트입니다. ${Y(firstYm)}년 ${M(firstYm)}월부터 대란을 ${events.length}회 기록했고, 지금은 할인코드와 숨은 할인을 매일 확인해 올립니다. 마이프로틴과는 관계없는 개인 사이트입니다.</p>
${ytUrl ? `<a class="cta" href="${esc(SITE.youtubeChannel)}" target="_blank" rel="noopener">유튜브 채널 보기</a>` : ''}
<a class="cta ghost" href="${esc(SITE.kakao)}">알림 단톡방 들어가기</a>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>기록 시작</dt><dd>${Y(firstYm)}.${M(firstYm)}</dd></div>
  <div><dt>기록한 대란</dt><dd>${events.length}회</dd></div>
  <div><dt>영상</dt><dd>${allVideos.length}편</dd></div>
</dl>
</div>
</div>`,
  restHtml: `
<section>
<h2>할인율은 이렇게 확인합니다</h2>
<ol class="steps">
  <li><b>공식 코드</b> 마이프로틴 메인 배너에 걸린 코드와 할인율을 매일 확인합니다.</li>
  <li><b>히든코드</b> 유튜버나 팬카페에 따로 주어지는 코드입니다. 공식보다 보통 1~2%p 높고, 이 사이트의 복사 버튼에 들어가는 코드입니다.</li>
  <li><b>숨은 할인</b> 이달의 트렌드, 앱 쇼핑지원금처럼 장바구니 조건으로 더 빠지는 할인은 직접 장바구니에 담아 확인한 뒤 올립니다.</li>
</ol>
<p class="lede">대란은 할인코드 할인율이 <b>${TH}% 이상</b>인 날로 정합니다. 숨은 할인을 합친 실제 할인율은 따로 보여주지만 대란 판정에는 쓰지 않습니다. 평소에도 붙는 조건이 많아 합친 값으로 재면 거의 매일이 대란이 되기 때문입니다.</p>
</section>

<section>
<h2>수익과 중립성</h2>
<p class="lede">이 사이트의 마이프로틴 링크는 제휴 링크라 구매가 생기면 수수료를 받습니다. 구매 금액에는 차이가 없습니다.${altMp ? ' 대안 비교 페이지의 아이허브·쿠팡 등 다른 쇼핑몰 링크도 제휴 링크일 수 있습니다.' : ''} 할인코드는 수수료와 관계없이 그날 가장 높은 코드를 올리고, 대란이 아니면 아니라고 씁니다.</p>
<p class="lede">마이프로틴(Myprotein)은 THG plc의 상표이며 이 사이트는 마이프로틴과 아무 관계가 없습니다. 표시된 할인율은 확인 시점의 값이고 실제 결제 금액과 다를 수 있으니 결제 전에 장바구니에서 확인하십시오.</p>
</section>

<section class="full">
<h2>틀린 정보를 보셨다면</h2>
<p class="lede">코드가 안 먹히거나 할인율이 다르면 단톡방이나 최신 영상 댓글로 알려주십시오. 확인되는 대로 고칩니다.</p>
<a class="cta ghost" href="${esc(SITE.kakao)}">단톡방에 알리기</a>
</section>

<section class="full">
<h2>이 사이트의 페이지</h2>
<ul class="linkList">
  <li><a href="./"><span class="m">오늘 할인율</span><span class="s">대란 여부와 히든코드</span></a></li>
  <li><a href="./code.html"><span class="m">마이프로틴 할인코드</span><span class="s">코드 모음과 적용 방법</span></a></li>
  ${calcWidget ? '<li><a href="./calc.html"><span class="m">할인 계산기</span><span class="s">최종 결제금액</span></a></li>' : ''}
  ${PRODUCTS.length ? '<li><a href="./price.html"><span class="m">대란 가격 비교</span><span class="s">평소 vs 대란</span></a></li>' : ''}
  ${TASTE ? '<li><a href="./taste.html"><span class="m">맛 추천</span><span class="s">맛 등급표</span></a></li>' : ''}
  ${PRODUCTS.length ? '<li><a href="./wpc-wpi.html"><span class="m">임팩트웨이 vs 아이솔레이트</span><span class="s">WPC·WPI 비교표</span></a></li>' : ''}
  ${altMp ? '<li><a href="./alternatives.html"><span class="m">마이프로틴 대안</span><span class="s">다른 브랜드 가성비 비교</span></a></li>' : ''}
  ${db.referral ? '<li><a href="./referral.html"><span class="m">추천인 코드</span><span class="s">가입 혜택</span></a></li>' : ''}
  <li><a href="./daeran.html"><span class="m">대란 기록</span><span class="s">${events.length}회 · 월별 정리</span></a></li>
  <li><a href="./blackfriday.html"><span class="m">블랙프라이데이</span><span class="s">${bfYear}년 ${kdate(bfDate)}</span></a></li>
</ul>
</section>
`,
});

// ── 추천인 코드 (키워드: 마이프로틴 추천인 코드) ──
if (db.referral) {
  const REF_FAQ = [
    ['마이프로틴 추천인 코드는 어디에 입력하나요?',
     `회원가입 화면의 추천인 코드(친구 초대 코드) 칸입니다. 이 페이지 버튼으로 열면 ${db.referral}가 들어간 가입 페이지가 열리고, 안 들어가 있으면 직접 붙여넣으면 됩니다.`],
    ['이미 가입한 계정에도 추천인 코드를 넣을 수 있나요?',
     '아닙니다. 추천인 코드는 처음 가입할 때만 넣을 수 있고, 가입이 끝난 계정에는 나중에 적용되지 않습니다.'],
    ['추천인 코드와 할인코드를 같이 쓸 수 있나요?',
     `됩니다. 추천인 코드는 가입할 때 한 번 넣고, 할인코드는 장바구니에서 따로 넣습니다. 오늘 쓸 할인코드는 ${pName || '할인코드'} ${last.base}%입니다.`],
    ['추천인 코드를 넣으면 뭘 받나요?',
     `${REF_BENEFIT}을 받습니다. 추천한 쪽도 혜택을 받는 구조라 이 사이트의 코드를 쓰면 마프대란알리미에게 돌아갑니다. 구매 금액에는 차이가 없습니다.`],
    ['추천인 코드가 적용이 안 돼요.',
     '같은 이메일이나 전화번호로 이미 가입한 적이 있으면 신규로 잡히지 않습니다. 가입 화면에서 코드 칸을 못 찾으면 앱과 웹 중 다른 쪽에서 시도해 보고, 그래도 안 되면 단톡방에 물어보십시오.'],
  ];
  page({
    file: 'referral.html', priority: 0.8, changefreq: 'weekly', current: 'referral.html',
    title: `마이프로틴 추천인 코드 ${db.referral} | 추천코드 입력 방법 · ${REF_BENEFIT} · 할인코드와 중복`,
    keywords: ['마이프로틴 추천인 코드', '마이프로틴 추천코드', '마이프로틴 추천인 코드 입력', '마이프로틴 추천인 입력 방법', '마이프로틴 친구 추천', '마이프로틴 가입 혜택', '마이프로틴 신규가입 할인', '마이프로틴 첫 구매 할인'],
    desc: `마이프로틴 추천인 코드 ${db.referral}. 처음 가입할 때 넣으면 ${REF_BENEFIT}을 받고, 할인코드(${pName || '할인코드'} ${last.base}%)와 같이 적용됩니다. 입력 위치, 가입부터 결제까지 순서, 안 될 때 확인할 것. ${dot(last.date)} 기준.`,
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 할인코드', 'code.html'], ['추천인 코드', 'referral.html']]), faqLd(REF_FAQ)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(last.date)} 기준 · 신규 가입 전용</p>
<h1>마이프로틴 추천인 코드 <span class="hl">${esc(db.referral)}</span></h1>
<p class="lede answer">처음 가입할 때 추천인 코드 <b>${esc(db.referral)}</b>를 넣으면 ${esc(REF_BENEFIT)}을 받습니다. 할인코드와는 별개라 가입 뒤 장바구니에서 ${pName || '할인코드'} ${last.base}%를 따로 넣으면 둘 다 적용됩니다. 이미 가입한 계정에는 넣을 수 없습니다.</p>
<a class="cta hot" href="${esc(SITE.affiliate)}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(db.referral)}">${esc(db.referral)} 복사하고 가입하기</a>
<p class="hint">누르면 코드가 복사되고 추천인 코드가 적용된 가입 페이지가 열립니다.</p>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>대상</dt><dd>신규 가입</dd></div>
  <div><dt>할인코드와</dt><dd>중복 가능</dd></div>
  <div><dt>오늘 할인코드</dt><dd>${last.base}%</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section>
<h2>마이프로틴 추천인 코드 입력 방법</h2>
<ol class="steps">
  <li>위 버튼을 누릅니다. 코드가 복사되고 추천인 코드가 적용된 가입 페이지가 열립니다. 코드가 들어가 있는지 확인하십시오.</li>
  <li>자동으로 안 들어갔다면 가입 화면의 추천인 코드(또는 친구 초대 코드) 칸에 <code>${esc(db.referral)}</code>를 붙여넣습니다.</li>
  <li>가입을 마친 뒤 제품을 담고, 장바구니 할인코드 칸에 ${pName || '할인코드'}를 넣고 결제합니다. 추천인 혜택과 할인코드가 둘 다 적용됩니다.</li>
</ol>
${heroCta}
</section>

<section>
<h2>가입부터 결제까지 순서</h2>
<ul class="steps">
  <li><b>가입</b> 추천인 코드 ${esc(db.referral)}를 넣습니다. 앱에서 가입하면 쇼핑지원금 같은 앱 전용 이벤트도 같이 챙길 수 있습니다.</li>
  <li><b>장바구니</b> 8만원 이상이면 무료배송, 150달러를 넘으면 관세가 붙을 수 있습니다.${calcWidget ? ' <a href="./calc.html">계산기</a>로 최종 금액을 먼저 보십시오.' : ''}</li>
  <li><b>할인코드</b> ${pName || '할인코드'} ${last.base}%를 넣고 금액이 바뀌는지 확인합니다. 코드는 한 주문에 하나만 들어갑니다.</li>
  <li><b>결제</b> 대란(할인코드 ${TH}% 이상)을 기다릴지는 <a href="./">오늘 할인율</a>에서 확인하십시오.</li>
</ul>
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(REF_FAQ)}
</section>

${kakaoBox}
`,
  });
}

// ── 블랙프라이데이 (키워드: 마이프로틴 블랙프라이데이, 마이프로틴 블프). 11월 페이지와 푸터에서 연결됩니다 ──
{
  const bfDays = daysBetween(last.date, bfDate);
  const bfRows = day.filter(d => d.date >= bfWeekStart && d.date <= cmDate);
  const bfEvents = events.filter(e => e.start <= cmDate && e.end >= bfWeekStart);
  const bfMax = bfEvents.map(e => e.max).filter(v => v != null);
  const bfPeak = bfMax.length ? Math.max(...bfMax) : bfRows.length ? Math.max(...bfRows.map(d => d.base)) : null;
  const phase = bfDays > 7 ? 'before' : bfDays >= -3 ? 'during' : 'after';
  const novFile = monthPages.includes(`${bfYear}-11`) ? monthFile(`${bfYear}-11`) : 'daeran.html';
  const summary = phase === 'before'
    ? `${bfYear}년 마이프로틴 블랙프라이데이는 ${kdate(bfDate)} ${wd(bfDate)}, 오늘 기준 ${bfDays}일 남았습니다. 보통 전주(${kdate(bfWeekStart)} 전후)부터 예열 행사가 걸리고 사이버먼데이 ${kdate(cmDate)}까지 이어집니다. 지금 쓸 수 있는 히든코드는 ${last.base}%이고, 블프 할인율이 확정되면 이 페이지에 날짜별로 기록합니다.`
    : phase === 'during'
      ? `지금 블랙프라이데이 주간입니다. 본행사는 ${kdate(bfDate)}, 사이버먼데이 ${kdate(cmDate)}까지 이어집니다. 오늘 ${pName || "할인코드"} ${last.base}%${isDaeran ? `로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}. 지금 사면 됩니다.` : `입니다. 대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`}`
      : `${bfYear}년 블랙프라이데이(${kdate(bfDate)})는 끝났습니다.${bfPeak != null ? ` 그 주간 최고 할인코드는 ${bfPeak}%였습니다.` : ''} 다음 큰 행사까지는 평소 대란 주기(약 ${cycle ?? '-'}일)를 참고하십시오.`;
  const BF_FAQ = [
    [`마이프로틴 블랙프라이데이 ${bfYear}은 언제인가요?`,
     `${kdate(bfDate)} ${wd(bfDate)}입니다. 블랙프라이데이는 11월 넷째 목요일 다음 날이라 해마다 날짜가 바뀝니다. 마이프로틴은 보통 전주부터 예열 행사를 걸고 사이버먼데이(${kdate(cmDate)})까지 이어갑니다.`],
    ['마이프로틴 블랙프라이데이 할인율은 얼마나 되나요?',
     `${knownRange ? `올해 평소 대란 때 히든코드는 ${knownRange}였습니다. ` : ''}블랙프라이데이는 1년 중 할인이 가장 센 때라 이보다 높게 나오는 경우가 많지만, 이 사이트는 확인된 숫자만 기록합니다. 확정되면 이 페이지와 11월 대란 페이지에 올립니다.`],
    ['블랙프라이데이 전에 사도 되나요?',
     `지금 히든코드는 ${last.base}%입니다. 평소 대란과 블프의 차이는 몇 %p라 당장 먹을 게 없으면 지금 사도 손해가 크지 않습니다. 2.5kg 이상 대량 구매라면 ${kdate(bfWeekStart)} 전후까지 기다리는 편이 낫습니다.`],
    ['블랙프라이데이와 마프대란은 뭐가 다른가요?',
     `마프대란은 할인코드가 ${TH}% 이상으로 올라가는 날을 구매자들이 부르는 말이고, 블랙프라이데이는 마이프로틴의 공식 행사입니다. 블프 주간은 대부분 대란 기준을 넘기 때문에 이 사이트에서는 그 기간도 대란으로 같이 기록합니다.`],
  ];
  page({
    file: 'blackfriday.html', priority: bfSeason ? 0.9 : 0.7, changefreq: bfSeason ? 'daily' : 'monthly', current: 'blackfriday.html',
    title: `마이프로틴 블랙프라이데이(블프) ${bfYear} | ${kdate(bfDate)} · 예열 일정 · 준비 체크리스트`,
    keywords: ['마이프로틴 블랙프라이데이', '마이프로틴 블프', `마이프로틴 블랙프라이데이 ${bfYear}`, '마이프로틴 블랙프라이데이 할인코드', '마이프로틴 블프 할인율', '마이프로틴 블프 세일', '마이프로틴 사이버먼데이', '마이프로틴 11월 세일'],
    desc: `${bfYear}년 마이프로틴 블랙프라이데이는 ${kdate(bfDate)}. 예열은 ${kdate(bfWeekStart)} 전후부터, 사이버먼데이 ${kdate(cmDate)}까지.${knownRange ? ` 올해 대란 히든코드 ${knownRange}.` : ''} 블프 전 준비 체크리스트와 날짜별 할인율 기록.`,
    ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html'], [`블랙프라이데이 ${bfYear}`, 'blackfriday.html']]), faqLd(BF_FAQ)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(last.date)} 기준${bfSeason ? ' · 매일 갱신' : ''}</p>
<h1>마이프로틴 블랙프라이데이 ${bfYear}<br>${kdate(bfDate)} ${wd(bfDate)}</h1>
<p class="lede answer">${summary}</p>
<a class="cta" href="${esc(SITE.kakao)}">블프 시작 알림 받기</a>
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>${phase === 'after' ? '끝난 날' : '디데이'}</dt><dd>${phase === 'before' ? `D-${bfDays}` : phase === 'during' ? '진행 중' : kdate(cmDate)}</dd></div>
  <div><dt>지금 히든코드</dt><dd>${last.base}%</dd></div>
  <div><dt>${bfPeak != null ? '블프 최고' : '평소 대란'}</dt><dd>${bfPeak != null ? pct(bfPeak) : knownRange || '-'}</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>블랙프라이데이 주간은 이렇게 흘러갑니다</h2>
<ul class="steps">
  <li><b>${kdate(bfWeekStart)} 전후 · 예열</b> 블프 전주부터 할인율이 조금씩 올라가거나 쇼핑지원금 같은 앱 이벤트가 먼저 열립니다. 이때부터 매일 확인합니다.</li>
  <li><b>${kdate(bfDate)} ${wd(bfDate)} · 블랙프라이데이</b> 본행사입니다. 할인코드가 바뀌면 이 사이트의 복사 버튼에 바로 반영됩니다.</li>
  <li><b>${kdate(cmDate)} ${wd(cmDate)} · 사이버먼데이</b> 행사가 보통 이날까지 이어집니다.</li>
</ul>
<p class="lede">일정은 해마다 조금씩 다릅니다. 확정되는 대로 여기와 <a href="./${novFile}">11월 대란</a> 페이지에 날짜별로 기록합니다.</p>
</section>

<section>
<h2>블프 전에 해 둘 것</h2>
<ol class="steps">
  <li><b>앱 설치와 가입</b> 쇼핑지원금 같은 앱 전용 이벤트가 블프 전후에 열립니다.${db.referral ? ` 처음이면 <a href="./referral.html">추천인 코드 ${esc(db.referral)}</a>를 넣고 가입하면 ${esc(REF_BENEFIT)}도 받습니다.` : ''}</li>
  <li><b>장바구니 미리 담기</b> 블프 당일엔 품절이 빠릅니다. ${TASTE ? '<a href="./taste.html">맛 등급표</a>에서 ' : ''}먹어본 맛 위주로 담아 두십시오.</li>
  <li><b>금액 나누기</b> 150달러(약 ${won(SHOP.customsUsd * SHOP.usdKrw)})를 넘으면 관세가 붙을 수 있습니다.${calcWidget ? ' <a href="./calc.html">계산기</a>로 최종 금액을 보고 필요하면 주문을 나누십시오.' : ''}</li>
  <li><b>알림 받기</b> 할인율이 바뀌는 즉시 단톡방과 유튜브에 올립니다. 당일 아침보다 전날 저녁에 바뀌는 경우가 많습니다.</li>
</ol>
</section>

<section>
<h2>올해 대란은 어땠나</h2>
<p class="lede">${events.length ? `${Y(firstYm)}년 ${M(firstYm)}월부터 대란 ${events.length}회, 히든코드 ${knownRange || '영상 참고'}, 평균 ${cycle ?? '-'}일 간격이었습니다. 블프는 이 범위보다 높게 나올 수 있지만 확인된 값만 올립니다.` : '아직 기록된 대란이 없습니다.'}</p>
${recent.length ? eventTable(recent.slice(0, 4)) : ''}
<a class="cta ghost" href="./daeran.html">전체 대란 기록 보기</a>
</section>

<section class="full">
<h2>블프 주간 날짜별 할인율</h2>
${bfRows.length ? `<table>
<thead><tr><th>날짜</th><th class="n">할인코드</th><th class="n">숨은 할인</th><th class="n">실제</th></tr></thead>
<tbody>${[...bfRows].reverse().map(d => `<tr${d.base >= TH ? ' class="hot"' : ''}><td>${kdate(d.date)}${d.base >= TH ? ' · 대란' : ''}</td><td class="n">${d.base}%</td><td class="n">${d.deals.length ? `${d.deals.length}건` : '-'}</td><td class="n">${pct(d.eff)}</td></tr>`).join('')}</tbody>
</table>` : `<p class="lede">${kdate(bfWeekStart)}부터 ${kdate(cmDate)}까지 날짜별 할인코드와 실제 할인율을 이 자리에 기록합니다.</p>`}
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(BF_FAQ)}
</section>

${ytPromo}
${kakaoBox}
`,
  });
}

// ── 404 (깃허브 페이지가 없는 주소에 자동으로 보여줍니다. 검색엔진에는 안 올립니다) ──
page({
  file: '404.html', noindex: true, current: '',
  title: `페이지를 찾을 수 없습니다 | ${SITE.brand}`,
  desc: '주소가 바뀌었거나 없는 페이지입니다. 오늘 할인코드와 대란 기록은 아래에서 바로 볼 수 있습니다.',
  heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>페이지를 찾을 수 없습니다</h1>
<p class="lede">주소가 바뀌었거나 지워진 페이지입니다. 찾던 내용은 다음 페이지 중 하나에 있을 겁니다.</p>
${heroCta}
</div>
<div class="heroSide">
<ul class="linkList">
  <li><a href="./"><span class="m">오늘 할인율</span><span class="s">히든코드 ${last.base}%</span></a></li>
  <li><a href="./code.html"><span class="m">마이프로틴 할인코드</span><span class="s">${M(curYm)}월 코드 모음</span></a></li>
  ${calcWidget ? '<li><a href="./calc.html"><span class="m">할인 계산기</span><span class="s">최종 결제금액</span></a></li>' : ''}
  <li><a href="./${monthFile(curYm)}"><span class="m">${M(curYm)}월 대란</span><span class="s">${monthSummary(monthStats(curYm))}</span></a></li>
  <li><a href="./daeran.html"><span class="m">대란 기록</span><span class="s">${events.length}회 · 평균 ${cycle ?? '-'}일</span></a></li>
</ul>
</div>
</div>`,
  restHtml: kakaoBox,
});

// 홈 화면에 추가할 때 쓰는 앱 정보
if (hasIcon) write('manifest.webmanifest', JSON.stringify({
  name: SITE.tagline ? `${SITE.brand} · ${SITE.tagline}` : SITE.brand, short_name: SITE.brand, start_url: `${SITE.origin}/`, display: 'standalone',
  background_color: '#F6F5F2', theme_color: '#003942',
  icons: [{ src: `${SITE.origin}/icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${SITE.origin}/icon-512.png`, sizes: '512x512', type: 'image/png' }],
}, null, 2) + '\n');

// ── 사이트맵 · RSS · robots · CNAME ──
// 데이터에서 사라진 달의 옛 월별 페이지는 지웁니다
for (const f of fs.readdirSync(ROOT)) {
  if (/^daeran-\d{4}-\d{2}\.html$/.test(f) && !built.some(b => b.file === f)) fs.unlinkSync(path.join(ROOT, f));
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${built.map(b => `<url><loc>${b.url}</loc><lastmod>${b.lastmod}</lastmod><changefreq>${b.changefreq}</changefreq><priority>${b.priority.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);

const rfc822 = s => new Date(s + 'T09:00:00+09:00').toUTCString();
write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE.brand)}</title>
<link>${SITE.origin}/</link>
<description>마이프로틴 할인코드와 대란 날짜, 숨은 할인을 매일 기록합니다.</description>
<language>ko</language>
<lastBuildDate>${rfc822(last.date)}</lastBuildDate>
<atom:link href="${SITE.origin}/rss.xml" rel="self" type="application/rss+xml"/>
${[...built].sort((a, b) => b.lastmod.localeCompare(a.lastmod)).map(b => `<item>
<title>${esc(b.title)}</title>
<link>${b.url}</link>
<guid isPermaLink="false">${b.url}#${b.lastmod}</guid>
<pubDate>${rfc822(b.lastmod)}</pubDate>
<description>${esc(b.desc)}</description>
</item>`).join('\n')}
</channel>
</rss>
`);

// 데이터·스크립트·README 는 사람이 볼 페이지가 아니고, 실제 히든코드가 들어 있어 검색엔진이 못 읽게 막습니다
const ROBOTS_BLOCK = ['/admin.html', '/data/', '/scripts/', '/README.md'].map(p => `Disallow: ${p}`).join('\n');
write('robots.txt', `User-agent: *
Allow: /
${ROBOTS_BLOCK}

User-agent: Yeti
Allow: /
${ROBOTS_BLOCK}

Sitemap: ${SITE.origin}/sitemap.xml
`);

if (domain) write('CNAME', domain + '\n');
else if (fs.existsSync(path.join(ROOT, 'CNAME'))) fs.unlinkSync(path.join(ROOT, 'CNAME'));
write('.nojekyll', '');

console.log(`생성 완료 · ${SITE.origin} · 할인코드 ${last.base}% → 실제 ${last.eff}% · ${isDaeran ? '대란' : '평시'} · 숨은할인 ${last.deals.length}건 · 대란 ${events.length}회 · 영상 ${allVideos.length}편 · 페이지 ${built.length}개${hasSample ? ' · 예시 데이터 포함' : ''}`);
