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
// 제품 가격 기록(data/prices.json, 자동 수집). 직접 적은 products 가격보다 새 기록이 있으면 그 값을 씁니다.
// 직접 적은 가격은 그래프에서 기록 시작 전 가격으로 씁니다.
const PRICE_LOG = fs.existsSync(path.join(ROOT, 'data/prices.json')) ? (readJson('data/prices.json').entries || []).sort((a, b) => a.date.localeCompare(b.date)) : [];
// 한글 끝 글자 받침에 맞춰 조사를 붙입니다 (josa('90회분', '이', '가') → '90회분이')
const josa = (w, withB, noB) => { const c = String(w).trim().slice(-1).charCodeAt(0); return w + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? withB : noB); };
const PRICE_BASE = Object.fromEntries((db.products || []).map(p => [`${p.name} ${p.size}`, p.price]));
{
  const lastLog = PRICE_LOG.at(-1);
  if (lastLog && lastLog.date > (db.priceDate || '')) {
    for (const p of db.products || []) { const v = lastLog.prices[`${p.name} ${p.size}`]; if (v) { p.price = v.price; p.rrp = v.rrp; } }
    db.priceDate = lastLog.date;
  }
}

// 도메인이 있으면 그 도메인, 없으면 깃허브 페이지 주소
const domain = String(cfg.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
const SITE = { ...cfg, origin: domain ? `https://${domain}` : cfg.githubPagesUrl.replace(/\/+$/, '') };
// 데이터에 적힌 쇼핑지원금 신청 링크가 아윈 링크면 clickref 를 'pt-<페이지>-signup' 으로 바꿔서 어느 페이지에서 눌렀는지 보이게 합니다
const sgUrl = u => /awin1\.com/.test(String(u)) ? String(u).replace(/clickref=[^&]*/, 'clickref=pt-PAGE-signup') : u;

// ── 공통 도우미 ──
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ── 화면 캡처 (shots/*.webp, 크기는 shots/sizes.json). tall 은 세로로 긴 캡처라 폭을 줄여 보여 줍니다 ──
const SHOT_SIZES = fs.existsSync(path.join(ROOT, 'shots/sizes.json')) ? readJson('shots/sizes.json') : {};
const shot = (f, alt, cap, cls = '') => SHOT_SIZES[f] ? `<figure class="shot${cls ? ' ' + cls : ''}"><a href="./shots/${f}" target="_blank" rel="noopener"><img src="./shots/${f}" alt="${esc(alt)}" width="${SHOT_SIZES[f][0]}" height="${SHOT_SIZES[f][1]}" loading="lazy" decoding="async"></a><figcaption>${cap} <span class="zoom">눌러서 크게 보기</span></figcaption></figure>` : '';
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
// 이달의 트렌드 추가 할인율 (지금 걸린 트렌드 조건, 없으면 가장 최근 것)
const trendDeal = last.deals.find(d => /트렌드/.test(d.label)) || DEALS.filter(d => /트렌드/.test(d.label)).at(-1);
const TREND = trendDeal ? `${trendDeal.rate}%` : '추가 %';
const curYm = ymOf(last.date);

// ── 대란: 매일 기록에서 계산 + 기록 시작 전 대란(history) ──
const HISTORY = (db.history || []).map(h => ({ start: h.start, end: h.end || h.start, max: h.max ?? null, note: h.note || '', videos: h.videos || [], daeran: h.daeran !== false }));
// 영상 = history 에 적은 영상 + data/youtube.json(자동 수집한 채널 최신 영상). 같은 영상은 history 쪽 정보를 씁니다
// 자동 수집 날짜는 "1개월 전" 같은 표기로 계산한 대략값이라, history 에 적힌 가장 최근 영상보다 새 영상만 씁니다 (옛 영상이 엉뚱한 달에 붙지 않게)
const HIST_LAST = HISTORY.flatMap(h => h.videos).reduce((m, v) => v.date > m ? v.date : m, '');
const YT_AUTO = fs.existsSync(path.join(ROOT, 'data/youtube.json')) ? (readJson('data/youtube.json').videos || []).filter(v => v.date > HIST_LAST) : [];
const allVideos = (() => { const seen = new Set(), out = []; for (const v of [...HISTORY.flatMap(h => h.videos), ...YT_AUTO]) if (v.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); } return out.sort((a, b) => a.date.localeCompare(b.date)); })();

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
// announced 에 sure:true 면 그 날을 확정된 다음 대란으로 씁니다 (평균 주기 계산 대신 "확정"으로 표시)
const sureNext = !isDaeran && announced && announced.sure ? announced : null;
if (sureNext) nextGuess = sureNext.date;
// "18:00" → "오후 6시". announced 의 time 이 있으면 공개 시각으로 보여 줍니다
const hmK = t => { const h = +t.slice(0, 2), mi = +t.slice(3, 5); return `${h < 12 ? '오전' : '오후'} ${h === 0 ? 0 : h % 12 || 12}시${mi ? ` ${mi}분` : ''}`; };
const sureOpen = sureNext && sureNext.time ? `${kdate(sureNext.openDate || sureNext.date)} ${hmK(sureNext.time)}` : null;
// announced 에 page 가 있으면 그 행사만의 안내 페이지를 만들고(아래 EVENT_PAGES 루프), 행사가 끝나기 전까지 홈 띠·메뉴·일정표에서 연결합니다
// 확정 대란이 사흘 안이면 홈 상단 배지·설명을 '내일 대란' 기준으로 바꿉니다
const soonDd = (() => { if (!sureNext) return null; const d = daysBetween(last.date, sureNext.date); return d >= 0 && d <= 3 ? d : null; })();
const EVENT_PAGES = (db.announced || []).filter(a => a.date && a.page && a.sure);
const EV_HOME = EVENT_PAGES.find(ev => last.date <= (ev.signup && ev.signup.useTo ? ev.signup.useTo : addDays(ev.date, 1))) || null;
const evBanner = EV_HOME && !isDaeran ? (() => {
  const ev = EV_HOME, sg = ev.signup, dd = daysBetween(last.date, ev.date), applyOpen = sg && (!sg.applyUntil || last.date <= sg.applyUntil);
  return `<section class="full evBand">
<p class="eyebrow">대란 확정${dd > 0 ? ` · D-${dd}` : ''}</p>
<h2 class="bandTitle">${kdate(ev.date)} ${esc(ev.label)} 대란</h2>
<p class="lede">${[
  applyOpen ? `<b>${esc(sg.label)}</b>을 ${sg.applyUntil ? `${kdate(sg.applyUntil)}까지 ` : ''}미리 신청해 두면 할인코드와 별개로 더 빠집니다.` : '',
  sureOpen ? `할인코드는 <b>${sureOpen}</b>에 공개됩니다.` : '',
  `히든코드와 최대할인조합은 공개되는 대로 ${SITE.brand}가 가장 먼저 올립니다.`,
  ev.alert ? `${esc(ev.alert)} 알림도 보냅니다.` : '',
  '장바구니는 미리 채워 두세요.',
].filter(Boolean).join(' ')}</p>
<div class="evBtns">${applyOpen ? `<a class="cta hot" href="${esc(sgUrl(sg.url))}" target="_blank" rel="sponsored nofollow noopener">${esc(sg.label)} 미리 신청하기</a>` : ''}<a class="cta ${applyOpen ? 'ghost' : ''}" href="./${ev.page}">${kdate(ev.date)} 대란 일정·방법 보기</a></div>
</section>`;
})() : '';

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
  if (m === 12) {
    list.push({ date: `${y}-12-12`, label: '12.12 연말 행사', note: '11.11처럼 숫자가 겹치는 날이라 행사가 걸리기 쉬운 날입니다. 전날 저녁부터 할인율을 확인하세요.' });
    list.push({ date: `${y}-12-25`, label: '크리스마스', note: '연말 세일이 이어지는 때입니다. 12.12를 놓쳤다면 이때를 보세요.', minor: true });
  }
  if (m === 1) {
    list.push({ date: `${y}-01-01`, label: '신년 행사', note: '새해 첫날 행사가 걸리는 경우가 있어 12월 31일 저녁부터 확인하세요.' });
  }
  for (const c of db.calendar || []) if (c.date && ymOf(c.date) === ym) list.push(c);
  // 마이프로틴이 예고한 행사는 같은 날 항목을 덮어쓰고, 없으면 추가합니다
  for (const a of db.announced || []) {
    if (!a.date || ymOf(a.date) !== ym) continue;
    const hit = list.find(x => x.date === a.date), it = { ...a, label: `${a.label} (${a.sure ? '대란 확정' : '마이프로틴 예고'})`, link: a.page || hit?.link };
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
// announced 에 waitNote 가 있으면 코드 공개 시각(openDate + time) 전까지는 대란이어도 "지금 사도 되지만 그때까지 기다려 보세요"로 안내합니다
const waitEv = (db.announced || []).find(a => a.waitNote && a.time && nowStamp < `${a.openDate || a.date} ${a.time}`);
const waitWhen = waitEv ? `${(waitEv.openDate || waitEv.date) === nowStamp.slice(0, 10) ? '오늘' : kdate(waitEv.openDate || waitEv.date)} ${hmK(waitEv.time)}` : '';
const waitTxt = waitEv ? `지금 사도 되지만 ${waitWhen}까지 기다려 보세요. ${esc(waitEv.waitNote)}` : '';
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
// 아윈 clickref 는 'pt-<페이지>-<위치>' 로 씁니다 (아이허브 pubref 와 같은 틀). 페이지 자리는 PAGE 로 두면 page() 가 파일명으로 바꿔 줍니다.
// ref2 는 clickref2 (상품 행처럼 종류가 많은 구분). 아윈 보고서에서 별도 열로 보입니다.
const mpLink = (ref, dest, ref2) => {
  let u = SITE.affiliate.replace(/clickref=[^&]*/, 'clickref=' + ref);
  if (ref2) u = u.replace('&ued=', `&clickref2=${encodeURIComponent(ref2)}&ued=`);
  if (dest) u = u.replace(/ued=.*$/, 'ued=' + encodeURIComponent(dest));
  return u;
};
const goAttrs = (code, label, ref = 'pt-PAGE-hero') => `href="${esc(mpLink(ref))}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(code)}"${label ? ` data-label="${esc(label)}"` : ''}`;

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
<a class="cta hot" id="cGo" ${goAttrs((CALC_CODES.includes(primary) ? primary : CALC_CODES[0]).code, nameOf(CALC_CODES.includes(primary) ? primary : CALC_CODES[0]), 'pt-PAGE-go')}>${esc(nameOf(CALC_CODES.includes(primary) ? primary : CALC_CODES[0]))} 복사하고 이 금액으로 사기</a>
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
// 상품 행 링크: clickref=pt-<페이지>-row, clickref2=상품 슬러그(impact-whey-90 식). 이름 사전에 없는 제품은 URL 의 상품 번호를 씁니다.
const PROD_SLUG = { '임팩트웨이 프로틴': 'impact-whey', '임팩트웨이 아이솔레이트': 'impact-isolate', '클리어웨이 프로틴': 'clear-whey', '임팩트 크레아틴': 'creatine' };
const prodSlug = p => {
  const base = PROD_SLUG[p.name] || (String(p.url || '').match(/\/(\d{6,})\/?$/) || [])[1] || 'item';
  const size = String(p.size || '').replace(/\(.*\)/, '').replace(/(\d)\.(\d)/g, '$1-$2').replace(/[^0-9a-zA-Z-]+/g, '').replace(/^-+|-+$/g, '').toLowerCase();
  return size ? `${base}-${size}` : base;
};
const affTo = (u, p) => mpLink('pt-PAGE-row', u, p ? prodSlug(p) : undefined);
// 대안 비교 페이지 데이터. altMp = 마이프로틴 쪽 기준 제품(첫 번째)의 대란가 1kg당 가격
const ALT = fs.existsSync(path.join(ROOT, 'data/alternatives.json')) ? readJson('data/alternatives.json') : null;

// ── 아이허브 (data/iherb.json 이 있으면 iherb.html 과 메뉴가 생깁니다) ──
const IH = fs.existsSync(path.join(ROOT, 'data/iherb.json')) ? readJson('data/iherb.json') : null;
const IH_HOME = 'https://kr.iherb.com/';
// 파트너라이즈 딥링크: camref 뒤에 pubref(어느 자리에서 눌렀는지, 보고서에 표시)와 도착 주소를 붙입니다. 제휴 주소가 비어 있으면 아이허브로 바로 갑니다
const ihLink = (ref, dest = IH_HOME) => IH?.affiliate ? `${IH.affiliate.replace(/\/+$/, '')}/pubref:${ref}/destination:${encodeURIComponent(dest)}` : dest;
const ihSearch = (ref, kw) => ihLink(ref, `${IH_HOME}search?kw=${encodeURIComponent(kw)}`);
const ihToday = kstNow.slice(0, 10);
// 25일부터는 다음 달 이름을 씁니다 (월말에는 다음 달 코드를 찾는 검색이 많습니다)
const ihYm = +ihToday.slice(8, 10) >= 25 ? shiftYm(ihToday.slice(0, 7), 1) : ihToday.slice(0, 7);
const IH_MONTH_CUR = IH?.months ? Object.keys(IH.months).sort().filter(k => k <= ihToday.slice(0, 7)).pop() || null : null;
const IH_CODES = IH ? (IH.codes || []).filter(c => c.code && (!c.until || c.until >= ihToday)) : [];
const IH_SHIP = { customsUsd: 150, customsUsdFromUs: 200, maxBottles: 6, // customsUsdFromUs 는 화장품·생활용품 같은 일반 물품만 해당 (영양제·식품은 목록통관 배제라 미국 발송도 150)
  deliveryDays: '일주일 안팎', ...(IH?.ship || {}) };
const altMp = (() => { const m = ALT?.myprotein?.[0]; const p = m && PRODUCTS.find(p => p.name === m.match[0] && p.size === m.match[1]); if (!p) return null; const rate = Math.max(last.base, dRate); return { p, m, rate, kg: p.price * (1 - rate / 100) / m.grams * 1000 }; })();
const priceRows = list => `<table class="pt">
<thead><tr><th>제품</th><th class="n">표시가</th><th class="n">평소<br><small>코드 ${last.base}%</small></th><th class="n">대란<br><small>코드 ${dRate}%</small></th><th class="n">차이</th></tr></thead>
<tbody>${list.map(p => {
  const a = p.price * (1 - last.base / 100), b = p.price * (1 - dRate / 100);
  return `<tr><td><a href="${esc(affTo(p.url, p))}" target="_blank" rel="sponsored nofollow noopener"${primary ? ` data-copy="${b64(primary.code)}" data-label="${esc(nameOf(primary))}"` : ''}>${esc(p.name)} <b>${esc(p.size)}</b></a>${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td class="n muted">${won(p.price)}</td><td class="n">${won(a)}</td><td class="n hot">${won(b)}</td><td class="n">-${won(a - b)}</td></tr>`;
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
// ── 가격 그래프: 정상가(코드 넣기 전 판매가) vs 할인코드 적용가 ──
// 매일 기록이 있는 날은 선으로, 기록 시작 전 대란은 그때 할인율로 계산한 점으로 그립니다.
const CHART_KEY = '임팩트웨이 프로틴 30회분';
const priceOn = (key, date) => {
  let v = null;
  for (const e of PRICE_LOG) { if (e.date > date) break; if (e.prices[key]) v = e.prices[key].price; }
  return v ?? PRICE_BASE[key] ?? null;
};
const manwon = n => (n / 10000).toFixed(n % 10000 ? 1 : 0).replace(/\.0$/, '') + '만';
function priceChart(key = CHART_KEY, days = 240) {
  if (priceOn(key, last.date) == null) return '';
  const end = last.date;
  const firstHist = events.find(e => e.max != null)?.start || rows[0].date;
  const start = [addDays(end, -days + 1), firstHist].sort().at(-1);
  const span = Math.max(daysBetween(start, end), 1);
  const W = 640, H = 270, L = 50, R = 136, T = 20, B = 34;
  const x = d => L + (daysBetween(start, d) / span) * (W - L - R);
  const reg = [], dots = [], live = [];
  for (let d = start; d <= end; d = addDays(d, 1)) reg.push([d, priceOn(key, d)]);
  for (const e of events) if (e.max != null && e.start >= start && e.start < rows[0].date) dots.push([e.start, priceOn(key, e.start) * (1 - e.max / 100), e.max]);
  for (const d of day) if (d.date >= start) live.push([d.date, priceOn(key, d.date) * (1 - d.base / 100), d.base]);
  const vals = [...reg.map(r => r[1]), ...dots.map(r => r[1]), ...live.map(r => r[1])];
  const lo = Math.floor((Math.min(...vals) - 6000) / 10000) * 10000, hi = Math.ceil((Math.max(...vals) + 4000) / 10000) * 10000;
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const P = (a, b) => `${a.toFixed(1)} ${b.toFixed(1)}`;
  const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${P(x(p[0]), y(p[1]))}`).join(' ');
  const step = (hi - lo) / 10000 > 6 ? 20000 : 10000;
  const yt = []; for (let v = lo; v <= hi; v += step) yt.push(v);
  const months = []; for (let d = start.slice(0, 8) + '01'; d <= end; d = shiftYm(d.slice(0, 7), 1) + '-01') if (d >= start) months.push(d);
  // 붙어 있는 대란 점은 글자가 겹치니 앞 글자와 28px 이상 떨어진 것만 % 를 씁니다
  let lastLabX = -99;
  for (const d of dots) { d[3] = x(d[0]) - lastLabX >= 46; if (d[3]) lastLabX = x(d[0]); }
  const todayReg = reg.at(-1)[1], todayLive = live.at(-1);
  const labY = (v, o) => Math.min(Math.max(y(v) + o, T + 8), H - B - 2);
  let yA = labY(todayReg, 4), yB = todayLive ? labY(todayLive[1], 4) : 0;
  if (todayLive && yB - yA < 56) yB = Math.min(yA + 56, H - B - 26);
  return `<figure class="pchart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(key)} 가격 흐름. 오늘 정상가 ${won(todayReg)}, 할인코드 적용가 ${todayLive ? won(todayLive[1]) : '-'}${dots.length ? `, 기록 시작 전 대란가 ${dots.map(d => `${kdate(d[0])} ${won(d[1])}`).join(', ')}` : ''}">
  ${yt.map(v => `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="var(--line)"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="g-tick" text-anchor="end">${manwon(v)}</text>`).join('')}
  ${months.map(d => `<text x="${x(d).toFixed(1)}" y="${H - 8}" class="g-tick" text-anchor="middle">${+d.slice(5, 7)}월</text>`).join('')}
  <path d="${line(reg)}" fill="none" stroke="var(--faint)" stroke-width="2.5" stroke-linejoin="round"/>
  ${dots.map(d => `<circle cx="${x(d[0]).toFixed(1)}" cy="${y(d[1]).toFixed(1)}" r="5" fill="var(--accent)"/>${d[3] ? `<text x="${x(d[0]).toFixed(1)}" y="${(y(d[1]) + 24).toFixed(1)}" class="g-tick" text-anchor="middle" fill="var(--accent)">${d[2]}%</text>` : ''}`).join('')}
  ${live.length ? `<path d="${line(live)}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
  ${live.filter(p => p[2] >= TH).map(p => `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="4" fill="var(--accent)"/>`).join('')}
  ${todayLive ? `<circle cx="${x(todayLive[0]).toFixed(1)}" cy="${y(todayLive[1]).toFixed(1)}" r="5.5" fill="${todayLive[2] >= TH ? 'var(--accent)' : 'var(--brand)'}" stroke="#fff" stroke-width="2"/>` : ''}
  <text x="${W - R + 8}" y="${yA.toFixed(1)}" class="g-lab" fill="var(--muted)">정상가</text>
  <text x="${W - R + 8}" y="${(yA + 25).toFixed(1)}" class="g-val" fill="var(--muted)">${won(todayReg)}</text>
  ${todayLive ? `<text x="${W - R + 8}" y="${yB.toFixed(1)}" class="g-lab" fill="var(--brand)">코드 ${todayLive[2]}%</text>
  <text x="${W - R + 8}" y="${(yB + 25).toFixed(1)}" class="g-val" fill="var(--brand)">${won(todayLive[1])}</text>` : ''}
</svg>
<figcaption><span class="k k-reg"></span>정상가 (코드 넣기 전) <span class="k k-live"></span>할인코드 적용가 <span class="k k-dot"></span>대란가</figcaption>
</figure>`;
}
const priceChartNote = key => {
  const logFrom = PRICE_LOG.find(e => e.prices[key])?.date;
  return `<p class="hint">${esc(key)} 기준입니다. ${logFrom ? `가격은 ${kdate(logFrom)}부터 매일 자동으로 기록하고, 그 전은 ${kdate('2026-10-28')} 확인한 가격으로 계산했습니다.` : '가격 기록을 막 시작해서 지금은 최근 확인한 가격으로 계산했습니다.'} 할인코드 적용가는 그날 히든코드 할인율 기준이고, 숨은 할인(트렌드 할인·쇼핑지원금)은 빼고 계산했습니다.</p>`;
};

// ── 지금 사도 될까: 오늘 코드 적용가가 역대 대란가와 정상가 사이 어디쯤인지 ──
function priceGauge(key = CHART_KEY) {
  const reg = priceOn(key, last.date);
  if (reg == null || peak == null) return '';
  const best = reg * (1 - peak / 100), th = reg * (1 - TH / 100), now = reg * (1 - last.base / 100);
  const near = !isDaeran && last.base >= TH - 2;
  const badge = isDaeran ? ['on', '대란가'] : near ? ['near', '대란 근처'] : ['off', '평소 가격'];
  const W = 640, H = 122, L = 14, R = 14;
  const lo = best - 3000, hi = reg;
  const x = v => L + ((v - lo) / (hi - lo)) * (W - L - R);
  return `<div class="pgauge">
<p class="pgHead"><span class="badge ${badge[0]}">${badge[1]}</span> 오늘 ${esc(key)} <b>${won(now)}</b><small>코드 ${last.base}% 적용</small></p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="오늘 코드 적용가 ${won(now)}. 역대 최저 대란가 ${won(best)}, 대란 기준 가격 ${won(th)}, 코드 없이 ${won(reg)}">
  <text x="${Math.max(x(th) - 14, L).toFixed(1)}" y="20" class="g-lab" fill="var(--accent)">대란 기준 ${TH}% · ${won(th)}</text>
  <rect x="${x(lo)}" y="40" width="${(x(th) - x(lo)).toFixed(1)}" height="12" rx="6" fill="var(--track-hot)"/>
  <rect x="${x(th).toFixed(1)}" y="40" width="${(x(hi) - x(th)).toFixed(1)}" height="12" rx="6" fill="var(--track)"/>
  <line x1="${x(th).toFixed(1)}" y1="22" x2="${x(th).toFixed(1)}" y2="60" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 3"/>
  <circle cx="${x(now).toFixed(1)}" cy="46" r="9" fill="${isDaeran ? 'var(--accent)' : 'var(--brand)'}" stroke="#fff" stroke-width="3"/>
  <text x="${x(lo) + 2}" y="88" class="g-tick">역대 대란 ${peak}%</text><text x="${x(lo) + 2}" y="116" class="g-val" fill="var(--accent)">${won(best)}</text>
  <text x="${W - R}" y="88" class="g-tick" text-anchor="end">코드 없이</text><text x="${W - R}" y="116" class="g-val" text-anchor="end">${won(reg)}</text>
</svg>
<p class="lede">${isDaeran
    ? `지금이 대란가입니다. 역대 최저 대란가와 ${won(now - best)} 차이입니다.`
    : `대란 기준 가격보다 <b>${won(now - th)}</b>, 역대 최저 대란가보다 ${won(now - best)} 비쌉니다.${sureNext ? ` 급하지 않으면 ${kdate(sureNext.date)} ${esc(sureNext.label)}까지 기다리는 편이 낫습니다.` : ' 급하지 않으면 다음 대란을 기다리는 편이 낫습니다.'}`}</p>
</div>`;
}

// ── 저점 게이지 (홈): 오늘 할인율이 평소(대란 아닌 날) 대비 어디쯤인지 + 대란 때 가격 차이 ──
// 평소 = 최근 90일 중 대란 기준 미만인 날. 기록이 60일 미만이면 "최근 N일"로 씁니다
function lowGauge() {
  const from = addDays(last.date, -90);
  const calm = day.filter(d => d.date > from && d.base < TH);
  const avg = calm.length ? calm.reduce((s, d) => s + d.base, 0) / calm.length : last.base;
  const diff = last.base - avg;
  const key = PRODUCTS.find(p => /임팩트웨이 프로틴/.test(p.name) && p.size === '90회분') ? '임팩트웨이 프로틴 90회분' : CHART_KEY;
  const reg = priceOn(key, last.date);
  if (reg == null) return '';
  const name = key.replace('프로틴 ', '');
  const now = reg * (1 - last.base / 100), dPrice = reg * (1 - dRate / 100);
  const buy = isDaeran || last.base >= dRate;
  const tag = isDaeran ? '대란 중' : diff >= 1 ? '평소보다 좋음' : diff <= -1 ? '평소보다 낮음' : '평소 수준';
  const when = sureNext ? `${+sureNext.date.slice(8, 10)}일 대란` : '다음 대란';
  const left = sureNext ? daysBetween(last.date, sureNext.date) : null;
  const head = buy && waitEv ? `${waitWhen}까지 기다려 보세요` : buy ? '지금 사세요' : '기다리세요';
  const sub = isDaeran && waitEv ? `지금 사도 ${josa(name, '이', '가')} 정가보다 <b>${won(reg - now)}</b> 싸지만, ${esc(waitEv.waitNote)}`
    : isDaeran ? `지금이 대란입니다. ${josa(name, '이', '가')} 정가보다 <b>${won(reg - now)}</b> 쌉니다.`
    : buy ? `지난 대란 평균(${dRate}%)만큼 할인 중입니다.`
    : `${when}${left > 0 ? `(${left}일 뒤)` : ''}에 사면 ${josa(name, '이', '가')} <b>${won(now - dPrice)}</b> 더 쌉니다.`;
  const right = isDaeran ? ['코드 없이', null, reg] : buy ? null : [when, dRate, dPrice];
  const cell = (label, rate, price, hot) => `<div class="lgC${hot ? ' hot' : ''}"><span>${label}${rate != null ? ` <b>${rate}%</b>` : ''}</span><strong>${won(price)}</strong></div>`;
  return `<div class="lowG${buy ? ' buy' : ''}">
<p class="lgTag">${tag}</p>
<p class="lgHead">${head}</p>
<p class="lgSub">${sub}</p>
<div class="lgVs">${isDaeran ? cell(right[0], null, right[2]) + '<i>→</i>' + cell('오늘', last.base, now, true) : cell('오늘', last.base, now, buy) + (right ? '<i>→</i>' + cell(right[0], right[1], right[2], true) : '')}</div>
<p class="lgNote">${kdate(last.date)} 확인${isDaeran || buy ? '' : ' · 대란 할인율은 지난 대란 평균'}</p>
</div>`;
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
.headerInner{height:58px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.brand{text-decoration:none;white-space:nowrap;color:var(--brand);display:flex;flex-direction:column;justify-content:center;gap:3px;line-height:1.15;min-width:0}
.brand .bMark{display:flex;align-items:center;gap:10px}
.brand b{font-size:21px;font-weight:800;letter-spacing:-.04em}
.brand i{width:1px;height:15px;background:currentColor;opacity:.22}
.brand .bEn{font-size:12.5px;font-weight:700;letter-spacing:.24em}
.brand small{font-size:12px;font-weight:500;color:var(--faint);letter-spacing:-.01em}
/* 윗줄: 로고 + 마이프로틴/아이허브 두 갈래. 아랫줄: 고른 쪽의 세부 메뉴. 스크롤하면 윗줄(58px)만 위로 빠지고 세부 메뉴는 붙어 있습니다 */
header.top{top:-58px}
.secNav{display:flex;flex:none;background:var(--surface);border-radius:999px;padding:3px}
.secNav a{font-size:13.5px;font-weight:700;color:var(--muted);text-decoration:none;white-space:nowrap;padding:7px 14px;border-radius:999px;transition:background .2s,color .2s}
.secNav a:hover{color:var(--ink)}
.secNav a[aria-current]{background:var(--brand);color:#fff}
.subBar{border-top:1px solid var(--line)}
.headerInner.subInner{height:auto;display:block}
.topNav{display:flex;gap:6px;padding:8px 0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.topNav::-webkit-scrollbar{display:none}
.topNav a{font-size:13px;font-weight:600;color:var(--ink-2);text-decoration:none;white-space:nowrap;padding:6px 11px;border-radius:999px;transition:background .2s,color .2s}
.topNav a:hover{background:var(--surface);color:var(--ink)}
.topNav a[aria-current]{background:var(--brand-soft);color:var(--brand)}
.topNav .ns{display:none}
@media(max-width:879px){.topNav .nl{display:none}.topNav .ns{display:inline}}
@media(max-width:719px){
.brand b{font-size:20px}
.brand small{display:none}
.subBar .topNav{margin:0 -20px;padding:8px 20px}
}
@media(max-width:479px){.brand i,.brand .bEn{display:none}}
@media(max-width:400px){.secNav a{padding:6px 11px;font-size:13px}.topNav{gap:2px}.topNav a{padding:6px 9px}}
@media(max-width:359px){.brand b{font-size:19px}}
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
.state.soon{background:#fff;color:var(--accent);border:1px solid var(--accent)}
.hero .lede.next{margin-top:-6px}
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
.g-lab{font-size:11px;font-weight:700}.g-val{font-size:12px;font-weight:700;fill:var(--ink)}
@media(max-width:600px){.pchart .g-tick,.pgauge .g-tick,.pchart .g-lab,.pgauge .g-lab{font-size:23px}.pchart .g-val,.pgauge .g-val{font-size:24px}}
.pchart{margin:6px 0 8px}.pchart svg,.pgauge svg{width:100%;height:auto;display:block}
.pchart figcaption{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;font-size:12px;color:var(--muted);margin-top:6px}
.pchart .k{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:-8px}
.pchart .k-reg{background:var(--faint)}.pchart .k-live{background:var(--brand)}.pchart .k-dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.lowG{background:var(--surface);border-radius:var(--r);padding:22px 20px 16px;margin:4px 0 12px;text-align:center}
.lgTag{display:inline-block;margin:0;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--surface-2);color:var(--ink-2)}
.lowG.buy .lgTag{background:var(--accent);color:#fff}
.lgHead{margin:8px 0 2px;font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--brand)}.lowG.buy .lgHead{color:var(--accent)}
.lgSub{margin:0 0 16px;font-size:15px;color:var(--ink-2)}.lgSub b{color:var(--accent)}
.lgVs{display:flex;align-items:stretch;gap:8px;font-variant-numeric:tabular-nums}.lgVs>i{align-self:center;font-style:normal;color:var(--faint);font-size:18px}
.lgC{flex:1;background:var(--bg);border-radius:var(--r-sm);padding:12px 8px;display:flex;flex-direction:column;gap:2px}
.lgC span{font-size:13px;color:var(--muted)}.lgC span b{color:var(--ink)}.lgC strong{font-size:19px;letter-spacing:-.01em}
.lgC.hot{background:var(--accent-soft)}.lgC.hot span b,.lgC.hot strong{color:var(--accent)}
.lgNote{margin:10px 0 0;font-size:12px;color:var(--faint)}
.pgauge{background:var(--surface);border-radius:var(--r);padding:18px 18px 6px;margin:4px 0 8px}
.pgHead{margin:0 0 4px;font-size:15px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}.pgHead b{font-size:20px}.pgHead small{color:var(--muted);font-size:12px}
.badge{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;align-self:center}
.badge.on{background:var(--accent);color:#fff}.badge.near{background:var(--accent-soft);color:var(--accent)}.badge.off{background:var(--surface-2);color:var(--ink-2)}
.cta{display:block;text-align:center;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 20px;border-radius:999px;margin:8px 0;transition:transform .15s,background .2s,opacity .2s}
.cta.hot{background:var(--accent)}
.cta.ghost{background:var(--surface);color:var(--ink)}
.cta:hover{background:var(--brand-700)}
.cta.hot:hover{background:#C44C22}
.cta.ghost:hover{background:var(--surface-2)}
/* 화면 캡처: 사진이 있는 단계는 제목을 한 줄로 빼고, 단계 사이를 넉넉히 띄웁니다 */
.shot{margin:20px 0 4px}.shot img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.shot.tall img{max-width:400px}.shot.mid img{max-width:560px}
.shot figcaption{font-size:13px;color:var(--muted);margin-top:10px;line-height:1.6}.shot .zoom{color:var(--faint);white-space:nowrap}@media(min-width:720px){.shot .zoom{display:none}}
ol.steps:has(.shot){list-style:none;padding-left:0;counter-reset:st;margin-top:8px}
ol.steps:has(.shot)>li{counter-increment:st;margin:0 0 44px;padding:0 0 40px;border-bottom:1px solid var(--line);font-size:16px;line-height:1.85;color:var(--ink-2)}
ol.steps:has(.shot)>li:last-child{border-bottom:0;padding-bottom:0;margin-bottom:12px}
ol.steps:has(.shot)>li>b:first-child{display:flex;align-items:center;gap:12px;font-size:21px;line-height:1.35;letter-spacing:-.01em;color:var(--ink);margin:0 0 12px}
ol.steps:has(.shot)>li>b:first-child::before{content:counter(st);flex:none;width:32px;height:32px;border-radius:50%;background:var(--brand);color:#fff;font-size:16px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
ol.steps:has(.shot) .shot{margin-top:24px}
ol.steps:has(.shot) .shot figcaption{font-size:14px;margin-top:12px}
.steps .shot+.shot{margin-top:36px}
section>.shot{margin-top:24px}
table.alt .tag.g{background:var(--mint-soft);color:#0B5A3A}
table.alt td.n .sh{display:block;font-size:11px;color:var(--faint);font-weight:500;margin-top:2px}
.ihRv{list-style:none;margin:0;padding:0}.ihRv li{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.ihRv .s{flex:none;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;height:fit-content;margin-top:2px}.ihRv .s.pos{background:var(--mint-soft);color:#0B5A3A}.ihRv .s.neg{background:var(--accent-soft);color:var(--accent)}.ihRv .s.neu{background:var(--surface-2);color:var(--ink-2)}
.ihRv b{font-size:14px}.ihRv .tp{font-size:12px;color:var(--muted)}.ihRv p{margin:2px 0;font-size:15px}.ihRv small{font-size:12px;color:var(--faint)}.ihRv small a{color:inherit}
/* 링크만 있는 섹션(관련 페이지 등): 전체 폭, 링크는 카드 격자로 */
.wrap section:not(:has(> :not(h2,p,a.cta))):has(> a.cta + a.cta){display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;grid-column:1 / -1}
.wrap section:not(:has(> :not(h2,p,a.cta))):has(> a.cta + a.cta) > :not(a.cta){grid-column:1 / -1;margin-bottom:4px}
.wrap section:not(:has(> :not(h2,p,a.cta))):has(> a.cta + a.cta) > a.cta{margin:0;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;border-radius:var(--r-sm);padding:14px 18px;font-size:15px}
.wrap section:not(:has(> :not(h2,p,a.cta))):has(> a.cta + a.cta) > a.cta::after{content:"→";color:var(--faint);font-weight:400}
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
.codes li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.codes li.off{opacity:.55}
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
.fBrand{display:flex;align-items:center;gap:9px;color:var(--brand);margin:4px 0 6px}
.fBrand b{font-size:18px;font-weight:800;letter-spacing:-.03em}
.fBrand i{width:1px;height:13px;background:currentColor;opacity:.22}
.fBrand span{font-size:11.5px;font-weight:700;letter-spacing:.24em}
.fSlogan{font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.025em;line-height:1.5;margin:0 0 4px}
.fLine{font-size:13px;color:var(--muted);margin:0 0 20px}
.evBand{background:var(--accent-soft);border-radius:var(--r);padding:22px 22px 14px;margin-top:8px}
.evBand .eyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;color:var(--accent);margin:0 0 8px}
.evBand h2.bandTitle{font-size:26px;line-height:1.25;letter-spacing:-.04em;margin:0 0 10px}
.evBand .lede{margin-bottom:14px}
.evBtns{display:grid;gap:8px}
.evBtns .cta{margin:0}
@media(min-width:640px){.evBtns{grid-template-columns:1fr 1fr}}
.rvList{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.rv{background:var(--surface);border-radius:var(--r);padding:16px 18px}
.rv.bg{box-shadow:inset 0 0 0 2px var(--mint)}
.rvHead{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px}
.rvHead .fn{font-weight:800;font-size:17px;letter-spacing:-.02em}
.rvHead .fp{font-size:12px;color:var(--muted)}
.rvScore{margin-left:auto;font-size:13px;color:var(--accent);letter-spacing:.05em}
.rvScore b{color:var(--ink);margin-left:2px}
.rvSum{margin:8px 0 4px;font-size:15px;line-height:1.6}
.rvMeta{margin:0 0 8px;font-size:13px;color:var(--muted)}
.rvPc{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.rvPc span{font-size:12px;padding:4px 9px;border-radius:999px;background:var(--mint-soft)}
.rvPc .con{background:var(--accent-soft)}
.rvQ{margin:8px 0 0;padding-left:18px;font-size:14px;line-height:1.6}
.rvQ small{color:var(--muted);margin-left:4px}
.dv{margin:0;padding:16px 18px;background:var(--surface);border-radius:var(--r)}
.dv figcaption{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:13px;color:var(--ink-2);margin-bottom:12px}
.dv .lg{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.dv .lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
.dv .lg .g{background:#2E9E6B}.dv .lg .b{background:var(--accent)}
.dv .lgNote{color:var(--muted);margin-left:auto}
.dvRow{display:grid;grid-template-columns:minmax(96px,32%) 1fr 1fr;align-items:center;gap:0 2px;min-height:26px;padding:3px 0;border-top:1px solid var(--line)}
.dvRow.bg .dvName{color:#1F7A50}
.dvName{font-size:13px;font-weight:600;line-height:1.3;padding-right:8px;display:flex;align-items:center;gap:6px}
.dvName b{color:var(--muted);font-weight:700;font-size:12px;min-width:16px}
.dvName small{display:block;font-size:11px;color:var(--muted);font-weight:500}
.dvL,.dvR{position:relative;display:flex;align-items:center;height:16px;font-size:12px;color:var(--ink-2)}
.dvL{justify-content:flex-end;border-right:1px solid var(--faint)}
.dvL i{height:14px;border-radius:4px 0 0 4px;background:var(--accent);display:block}
.dvL em{font-style:normal;margin-right:4px;order:-1}
.dvR i{height:14px;border-radius:0 4px 4px 0;background:#2E9E6B;display:block}
.dvR em{font-style:normal;margin-left:4px}
.mixMap{display:grid;gap:10px}
.mixCol{background:var(--surface);border-radius:var(--r);padding:14px 16px}
.mixCol h3{margin:0 0 8px;font-size:14px;color:var(--brand)}
.mixCol ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}
.mixCol li{font-size:13px;font-weight:600;padding:6px 11px;border-radius:999px;background:var(--bg);border:1px solid var(--line)}
.mixCol li.bg{border-color:#2E9E6B;color:#1F7A50}
.mixCol li small{font-weight:500;color:var(--muted);margin-left:4px}
.rankTbl td small{color:var(--muted);font-size:12px}
.rankTbl tr.bg td{background:var(--mint-soft)}
.rankTbl tr.low td{background:var(--accent-soft)}
@media(min-width:720px){.mixMap{grid-template-columns:repeat(3,1fr)}}
@media(max-width:479px){.dvRow{grid-template-columns:minmax(84px,38%) 1fr 1fr}.dvName{font-size:12px}}
@media(max-width:719px){.rankTbl th:last-child,.rankTbl td:last-child{display:none}.rankTbl td,.rankTbl th{padding:10px 8px;font-size:13px}}
.rvRare{margin-top:14px}
.rvRare summary{cursor:pointer;font-weight:700;font-size:14px;padding:10px 0}
.rvNote{font-size:13px;color:var(--muted);margin-top:14px}
@media(min-width:880px){.rvList{grid-template-columns:1fr 1fr}}
.brandBand .eyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;color:var(--brand);margin:56px 0 10px}
.brandBand h2.bandTitle{font-size:31px;line-height:1.25;letter-spacing:-.045em;margin:0 0 14px}
.tiles{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:10px}
.tiles a{display:block;height:100%;box-sizing:border-box;background:var(--surface);border-radius:var(--r);padding:22px 20px;text-decoration:none;color:var(--ink);transition:background .2s,transform .15s}
.tiles a:hover{background:var(--surface-2)}
.tiles a:active{transform:scale(.99)}
.tiles b{display:block;font-size:13px;font-weight:700;color:var(--brand);margin-bottom:6px}
.tiles span{display:block;font-size:20px;font-weight:800;letter-spacing:-.035em;line-height:1.35}
.tiles em{display:block;font-style:normal;font-size:14px;font-weight:600;color:var(--muted);margin-top:14px}
@media(min-width:880px){.brandBand h2.bandTitle{font-size:46px}.tiles{grid-template-columns:repeat(3,1fr)}.tiles span{font-size:21px}}
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
.cmts .fn{font-weight:700;white-space:nowrap}.cmts .fnote{color:var(--muted);font-size:13px}.cmts .fp{font-size:12px;color:var(--muted);white-space:nowrap}
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
.shops b small{font-weight:600;color:var(--muted);font-size:13px;margin-left:6px}
.picks .tips{margin-top:8px;font-size:14px}
.picks .tips li{padding:0 0 0 14px;background:none;border-radius:0}
.picks .go{display:inline-block;margin-top:12px;font-size:14px;font-weight:700;color:var(--brand);text-decoration:none}
.picks li.caution{background:#FFF6D6}
.picks .go+.go{margin-left:14px}
.ihMore{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
.ihMore a{font-size:14px;font-weight:700;color:var(--brand);text-decoration:none;background:var(--surface);border-radius:999px;padding:7px 13px}
.stats dd small{display:block;font-size:12px;font-weight:500;color:var(--muted);letter-spacing:0;margin-top:2px}
td.ok{color:var(--brand);font-weight:700;white-space:nowrap}td.no{color:var(--accent);font-weight:700;white-space:nowrap}td.nw{white-space:nowrap}
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
.sideStack .dealLine{margin:0 0 12px}
.hero .sideStack .stats div{padding:16px 0}
.hero .sideStack .stats dd{font-size:20px}
.hero .sideStack details.more{margin:0}
.hero .hint{text-align:left}
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
const codeList = `<ul class="codes">${otherCodes.map(codeRow).join('')}${db.referral ? `<li><span class="name">${esc(db.referral)}<em>신규 가입 추천인 코드 · 첫 구매 12만원 이상이면 ${esc(db.referralBenefit || '추가 혜택')}, 할인코드와 같이 씁니다</em></span><span class="crate"></span><button type="button" data-copy="${b64(db.referral)}">복사</button></li>` : ''}</ul>`;
const otherCount = otherCodes.length + (db.referral ? 1 : 0);
const otherCodesBox = otherCount ? `<details class="more"><summary>다른 코드 보기 (${otherCount}개)</summary>${codeList}</details>` : '';

const heroCta = primary ? `<a class="cta hot heroBtn" ${goAttrs(primary.code, nameOf(primary))}>${esc(nameOf(primary))} 복사하고 사러 가기</a>
<p class="hint">${primary.untilNote ? `<b>${esc(primary.untilNote)}</b> ` : primary.until ? `<b>${kdate(primary.until)} ${(primary.untilTime || '18:59').replace(':', '시 ')}분 마감.</b> ` : ''}누르면 코드가 복사되고 마이프로틴이 열립니다. 장바구니 할인코드 칸에 붙여넣으세요.</p>`
  : `<a class="cta heroBtn" href="${esc(mpLink('pt-PAGE-hero'))}" target="_blank" rel="sponsored nofollow noopener">마이프로틴에서 할인받기</a>`;
const sticky = primary ? `<a class="sticky" ${goAttrs(primary.code, nameOf(primary), 'pt-PAGE-sticky')}><b>${esc(nameOf(primary))}</b> 복사하고 사러 가기 →</a>` : '';

// 숨은 할인 한 줄 요약
// 금액 할인은 라벨 끝의 같은 금액('… 5천원')을 빼서 두 번 나오지 않게 합니다
const AI_TAG = '<small class="aiTag">AI로 생성됨</small>';
const GUESS_TAG = sureNext ? `<small class="aiTag">${sureNext.time ? `확정 · ${sureNext.openDate && sureNext.openDate !== sureNext.date ? `${+sureNext.openDate.slice(8, 10)}일 ` : ''}${hmK(sureNext.time)} 공개` : '확정'}</small>` : AI_TAG;
const dealTip = d => d.tip ? (d.url ? ` · <a href="${esc(mpLink(`pt-PAGE-deal-${d.id.replace(/-\d+$/, '')}`, d.url))}" target="_blank" rel="sponsored nofollow noopener">${esc(d.tip)} →</a>` : ` · <small>${esc(d.tip)}</small>`) : '';
const dealShort = d => d.type === 'amount'
  ? `<b>+${(d.amount / 1000).toLocaleString('ko-KR')}천원</b><span>${esc(d.label.replace(new RegExp(`\\s*${d.amount / 1000}천\\s*원$`), ''))}${dealTip(d)}</span>`
  : `<b>+${d.rate}%</b><span>${esc(d.label)}${dealTip(d)}</span>`;
const dealLine = last.deals.length
  ? `<div class="dealLine"><p class="dh">같이 챙기면 더 싸집니다</p><ul>${last.deals.map(d => `<li>${dealShort(d)}</li>`).join('')}</ul><div class="dt"><span>다 챙기면 <b>${pct(last.eff)}</b></span>${calcWidget ? `<a href="./calc.html">내 금액으로 계산 →</a>` : ''}</div></div>`
  : '';

const dealItems = ds => `<ul class="hidden-deals">${ds.map(d => `
  <li><div class="row"><span class="t">${esc(d.label)}</span><span class="r">${d.type === 'amount' ? `+${(d.amount / 1000).toLocaleString('ko-KR')}천원` : `+${d.rate}%`}</span></div>
  ${d.howto ? `<div class="d">${esc(d.howto)}${d.url ? ` <a href="${esc(mpLink(`pt-PAGE-deal-${d.id.replace(/-\d+$/, '')}`, d.url))}" target="_blank" rel="sponsored nofollow noopener">${esc(d.tip || '보러 가기')} →</a>` : ''}</div>` : ''}
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
// 아이허브 페이지에는 마이프로틴 공통 키워드 대신 아이허브 공통 키워드를 깝니다 (본문과 무관한 키워드가 메타에 섞이지 않게)
const IH_BASE_KW = ['아이허브', '아이허브 할인코드', '아이허브 직구', '아이허브 추천', '프로티파이'];
// 로고 아래 작은 줄 (site.json headerLine, 없으면 tagline)
const HEADER_LINE = SITE.headerLine || SITE.tagline || '';
// WPC·WPI 대표 제품 (월별·블프 가격표용)
const KEY_PRODUCTS = PRODUCTS.filter(p => /임팩트웨이/.test(p.name) && !/^250g/.test(p.size));
const ratePriceRows = (list, rate, label) => `<table class="pt">
<thead><tr><th>제품</th><th class="n">표시가</th><th class="n">${label}<br><small>코드 ${rate}%</small></th></tr></thead>
<tbody>${list.map(p => `<tr><td><a href="${esc(affTo(p.url, p))}" target="_blank" rel="sponsored nofollow noopener"${primary ? ` data-copy="${b64(primary.code)}" data-label="${esc(nameOf(primary))}"` : ''}>${esc(p.name)} <b>${esc(p.size)}</b></a></td><td class="n muted">${won(p.price)}</td><td class="n hot">${won(p.price * (1 - rate / 100))}</td></tr>`).join('')}</tbody>
</table>`;
function page({ file, title, desc, heroHtml, restHtml, ld = [], lastmod = last.date, priority = 0.8, changefreq = 'weekly', current, extraScript = '', keywords = [], noindex = false, pageType = 'WebPage', utilHtml = null, stickyHtml = sticky }) {
  const url = urlOf(file);
  const kw = [...new Set([...keywords, ...(/^iherb/.test(file) ? IH_BASE_KW : BASE_KW)])].join(',');
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
  const navLink = (href, label) => `<a href="./${href}"${(href ? current === href || file === href : file === 'index.html') ? ' aria-current="page"' : ''}>${label}</a>`;
  // 메뉴는 마이프로틴 / 아이허브 두 갈래. 아이허브 페이지(iherb*.html)면 아이허브 쪽 세부 메뉴를 보여줍니다
  const sec = IH && file.startsWith('iherb') ? 'ih' : 'mp';
  const hasGuides = IH && fs.existsSync(path.join(ROOT, 'data/iherb-guides.json'));
  const secNav = IH ? `<nav class="secNav" aria-label="사이트 구분"><a href="./"${sec === 'mp' ? ' aria-current="true"' : ''}>마이프로틴</a><a href="./iherb.html"${sec === 'ih' ? ' aria-current="true"' : ''}>아이허브</a></nav>` : '';
  const subLinks = sec === 'ih'
    ? navLink('iherb.html', '할인코드') + (IH_MONTH_CUR ? navLink(`iherb-${IH_MONTH_CUR}.html`, `${M(IH_MONTH_CUR)}월 코드`) : '') + (hasGuides ? navLink('iherb-jikgu.html', '직구 방법') + navLink('iherb-best.html', '추천템') + navLink('iherb-probiotics.html', '유산균') + navLink('iherb-omega3.html', '오메가3') + navLink('iherb-magnesium.html', '마그네슘') + navLink('iherb-blackfriday.html', '블프') : '')
    : navLink('', '오늘 할인율') + navLink('code.html', '할인코드') + (calcWidget ? navLink('calc.html', '계산기') : '') + navLink('jikgu.html', '직구 방법') + navLink(monthFile(curYm), `${M(curYm)}월 대란`) + (EV_HOME ? navLink(EV_HOME.page, `${+EV_HOME.date.slice(8, 10)}일 대란`) : '') + (fs.existsSync(path.join(ROOT, 'data/taste.json')) ? navLink('taste.html', '맛 추천') + (readJson('data/taste.json').reviews?.length ? navLink('taste-rank.html', '맛 순위') : '') : '') + (PRODUCTS.length ? navLink('wpc-wpi.html', '<span class="nl">임팩트웨이 vs 아이솔레이트</span><span class="ns">임팩트 vs 아이솔</span>') : '') + (altMp ? navLink('alternatives.html', '가성비 비교') : '');
  let html = `<!doctype html>
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
<body${stickyHtml ? ' class="hasSticky"' : ''} data-asof="${last.date}">
<header class="top"><div class="headerInner">
  <a class="brand" href="./" aria-label="${esc(SITE.brand)}${SITE.brandEn ? ` ${esc(SITE.brandEn)}` : ''} 홈"><span class="bMark"><b>${esc(SITE.brand)}</b>${SITE.brandEn ? `<i aria-hidden="true"></i><span class="bEn">${esc(SITE.brandEn)}</span>` : ''}</span>${HEADER_LINE ? `<small>${esc(HEADER_LINE)}</small>` : ''}</a>
  ${secNav}
</div><div class="subBar"><div class="headerInner subInner"><nav class="topNav" aria-label="${sec === 'ih' ? '아이허브' : '마이프로틴'} 메뉴">${subLinks}</nav></div></div></header>
<div class="utilBar"><div class="utilInner">
  ${utilHtml ?? `<span>8만원 이상 무료배송</span>
  <span>150달러 이상 관세 발생</span>
  ${db.referral ? `<span>추천코드 ${esc(db.referral)} 첫 구매 혜택</span>` : ''}`}
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
  <div class="fBrand"><b>${esc(SITE.brand)}</b>${SITE.brandEn ? `<i aria-hidden="true"></i><span>${esc(SITE.brandEn)}</span>` : ''}</div>
  ${SITE.slogan ? `<p class="fSlogan">${esc(SITE.slogan)}</p>` : ''}
  ${HEADER_LINE ? `<p class="fLine">${esc(HEADER_LINE)}</p>` : ''}
  <nav><a href="./">오늘 할인율</a><a href="./code.html">마이프로틴 할인코드</a>${calcWidget ? '<a href="./calc.html">할인 계산기</a>' : ''}<a href="./jikgu.html">직구 방법</a>${PRODUCTS.length ? '<a href="./price.html">대란 가격 비교</a>' : ''}${altMp ? '<a href="./alternatives.html">마이프로틴 대안</a>' : ''}${db.referral ? '<a href="./referral.html">추천인 코드</a>' : ''}<a href="./daeran.html">대란 기록</a>${EVENT_PAGES.map(ev => `<a href="./${ev.page}">${kdate(ev.date)} 대란</a>`).join('')}${[...monthPages].reverse().slice(0, 3).map(ym => `<a href="./${monthFile(ym)}">${M(ym)}월 대란</a>`).join('')}${bfSeason ? '<a href="./blackfriday.html">블랙프라이데이</a>' : ''}${IH ? '<a href="./iherb.html">아이허브 할인코드</a>' : ''}${IH && fs.existsSync(path.join(ROOT, 'data/iherb-guides.json')) ? '<a href="./iherb-jikgu.html">아이허브 직구 방법</a><a href="./iherb-best.html">아이허브 추천템</a><a href="./iherb-blackfriday.html">아이허브 블프</a>' : ''}<a href="./about.html">소개</a><a href="${esc(SITE.kakao)}">알림 단톡방</a>${SITE.youtubeChannel ? `<a href="${esc(SITE.youtubeChannel)}">유튜브</a>` : ''}</nav>
  <p>이 사이트는 제휴 링크를 통해 수수료를 받을 수 있습니다. 구매 금액에는 차이가 없습니다.</p>
  <p>표시된 할인율은 확인 시점의 값이며 실제 결제 금액과 다를 수 있습니다. 숨은 할인은 조건과 기간에 따라 적용되지 않을 수 있습니다. 구매 전 쇼핑몰에서 최종 금액을 확인하십시오.</p>
  <p>마이프로틴(Myprotein)은 THG plc의 상표${IH ? ', 아이허브(iHerb)는 iHerb, LLC의 상표' : ''}이며 본 사이트와 무관합니다.</p>
</footer>
</main>
${stickyHtml}
<div class="toast" role="status" aria-live="polite"></div>
<script>
(function(){
  var toast=document.querySelector('.toast'),tm;
  function show(m){toast.textContent=m;toast.classList.add('on');clearTimeout(tm);tm=setTimeout(function(){toast.classList.remove('on')},2600)}
  function old(v){var a=document.createElement('textarea');a.value=v;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
  function copy(v){try{if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).catch(function(){old(v)})}else{old(v)}}catch(e){old(v)}}
  function dec(s){try{return atob(s)}catch(e){return s}}
  var cur=document.querySelector('.topNav a[aria-current]');if(cur&&cur.scrollIntoView){try{cur.scrollIntoView({inline:'center',block:'nearest'})}catch(e){}}
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
${SITE.naverAnalytics ? `<script src="https://wcs.pstatic.net/wcslog.js"></script>
<script>window.wcs_add=window.wcs_add||{};window.wcs_add.wa="${esc(SITE.naverAnalytics)}";if(window.wcs){wcs_do();}</script>
` : ''}${SITE.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(SITE.ga4)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(SITE.ga4)}');</script>
` : ''}</body>
</html>`;
  // 아윈 clickref 의 PAGE 자리를 페이지 이름으로 (index→home, daeran-2026-11→daeran-2611, daeran-2026-11-11→daeran-261111)
  const slug = file === 'index.html' ? 'home' : file.replace(/\.html$/, '').replace(/^daeran-20(\d\d)-(\d\d)(?:-(\d\d))?$/, (_, y, m, d) => `daeran-${y}${m}${d || ''}`);
  html = html.replace(/clickref=pt-PAGE-/g, `clickref=pt-${slug}-`);
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
  ['마이프로틴 대란 때는 어떤 순서로 사면 되나요?',
   `장바구니를 미리 채워 두는 게 핵심입니다. 사고 싶은 제품을 미리 담아 두고, 할인율이 바뀌는 전날 저녁 7시 전후에 이 페이지에서 대란인지 확인합니다. 대란이면 히든코드를 복사해 장바구니 할인코드 칸에 넣고, 이달의 트렌드 제품이나 앱 쇼핑지원금 같은 숨은 할인 조건을 맞춥니다. 마지막으로 ${(SHOP.freeShipping / 10000).toLocaleString('ko-KR')}만원 이상 무료배송, ${SHOP.customsUsd}달러 이하인지 보고 결제하십시오. 인기 맛은 대란 초반에 품절되기도 합니다.`],
  ['마이프로틴 대란과 평소 할인은 뭐가 다른가요?',
   `평소에도 메인 배너에 공식 할인코드가 걸려 있습니다${official ? `(오늘 ${official.code} ${official.rate}%)` : ''}. 대란은 이 코드 할인율이 ${TH}% 이상으로 올라간 날입니다.${events.length ? ` 기록된 대란은 ${Math.min(...events.map(e => e.days))}~${Math.max(...events.map(e => e.days))}일 이어졌습니다.` : ''}`],
  ['히든코드가 뭔가요?',
   '마이프로틴 메인 배너에 걸린 공식 코드 말고 유튜버나 팬카페에 따로 주어지는 코드입니다. 대부분 공식 코드보다 1~2%p 높게 나옵니다. 4월 4일 대란 때 공식 코드 0404는 40%였고 히든코드는 42%였습니다. 코드는 복사 버튼을 누르면 자동으로 들어갑니다.'],
  ['숨은 할인이 뭔가요?',
   `할인코드와 별개로 장바구니 조건을 맞추면 더 빠지는 할인입니다. 이달의 트렌드 제품을 같이 사면 최종 금액에서 ${TREND}가 더 빠지거나, 쇼핑지원금이 붙는 식입니다. 이 사이트는 이런 조건을 할인코드 위에 쌓아 실제로 받는 할인율을 따로 계산합니다.`],
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
  title: `마이프로틴 대란 · ${M(curYm)}월 할인코드 · 히든코드 안내 | ${SITE.brand}`,
  keywords: ['프로티파이', '마이프로틴 대란 일정', '마프대란 일정', '마이프로틴 대란 날짜', '마이프로틴 할인 기간', '마프대란알리미', `마이프로틴 대란 ${M(curYm)}월`, `마이프로틴 할인 ${M(curYm)}월`],
  desc: `${SITE.brand}는 마이프로틴 대란을 실시간으로 판정해 주는 도우미입니다. ${kdate(last.date)} 기준 ${codeWord}, 숨은 할인 포함 ${pct(last.eff)}${isDaeran ? '로 지금 대란입니다.' : `이고, 대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`} 이번 달 할인코드와 마프대란 일정을 매일 정리합니다.`,
  ld: [faqLd(HOME_FAQ), ...(latestVideo && latestVideo.title && latestVideo.date ? [videoLd(latestVideo)] : [])],
  heroHtml: `
<div class="hero">
<span class="state ${isDaeran ? 'on' : soonDd != null ? 'soon' : 'off'}">${isDaeran ? (waitEv ? `대란 시작 · ${hmK(waitEv.time)} 공식 코드 공개` : '지금 대란입니다') : soonDd != null ? `${soonDd === 0 ? '오늘 대란 예정' : soonDd === 1 ? '내일 대란' : `D-${soonDd} 대란 확정`} · ${kdate(sureNext.date)} ${esc(sureNext.label)}` : '지금은 대란이 아닙니다'}</span>
<h1>오늘 마이프로틴 ${pName || '할인코드'} <span class="hl">${last.base}%</span></h1>
<p class="lede answer">${isDaeran && waitEv
    ? `${official && extraOf(primary) ? `공식 코드 ${official.code}(${official.rate}%)보다 ${extraOf(primary)}%p 높은 ${esc(primary.label || '할인코드')}입니다. ` : ''}지금 사도 되지만, 급하지 않으면 <b>${waitWhen}</b>까지 기다리세요. ${esc(waitEv.waitNote)}`
    : `${kdate(last.date)} 기준 ${isDaeran
    ? `할인코드 ${last.base}%로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}. 지금 사면 됩니다.`
    : `대란이 아닙니다. 대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`}${official && extraOf(primary) ? ` 공식 코드 ${official.code}(${official.rate}%)보다 ${extraOf(primary)}%p 높습니다.` : ''}`}</p>
${!isDaeran && sureNext ? `<p class="lede next">${soonDd != null
    ? `<b>${soonDd === 0 ? '오늘' : soonDd === 1 ? '내일' : `${soonDd}일 뒤`} ${kdate(sureNext.date)} ${esc(sureNext.label)} 대란</b>이 확정입니다. 급하지 않으면 ${soonDd <= 1 ? '하루' : '며칠'} 기다리는 쪽이 쌉니다.${sureOpen ? ` 코드는 ${sureOpen} 공개.` : ''}`
    : `다음 대란은 <b>${kdate(sureNext.date)} ${esc(sureNext.label)}</b>입니다. 전날 저녁부터 할인율이 바뀌니 장바구니를 미리 채워 두세요.`}${sureNext.page ? ` <a href="./${sureNext.page}">일정과 방법 보기 →</a>` : ''}</p>` : !isDaeran && announced ? `<p class="lede next">마이프로틴 공식 사이트에 ${esc(announced.label)} 예고(${kdate(announced.date)})가 올라와 있습니다.</p>` : ''}
${heroCta}
<div class="sideStack">
${dealLine}
<dl class="stats">
  <div><dt>${isDaeran ? '이번 대란' : '마지막 대란'}</dt><dd>${lastEvent ? (isDaeran ? `${kdate(lastEvent.start)} 시작` : kdate(lastEvent.end)) : '기록 없음'}</dd></div>
  <div><dt>평균 주기</dt><dd>${cycle ? `약 ${cycle}일` : '집계 중'}</dd></div>
  <div><dt>${isDaeran ? (waitEv ? '공식 코드 공개' : '지금') : sureNext ? '다음 대란' : '다음 예상 대란'}</dt><dd>${isDaeran ? (waitEv ? waitWhen : '대란 진행 중') : nextGuess ? `${kdate(nextGuess)}${GUESS_TAG}` : '-'}</dd></div>${announced && !sureNext ? `
  <div><dt>예고된 행사</dt><dd>${kdate(announced.date)}<small class="aiTag">${esc(announced.label)} · 마이프로틴 예고</small></dd></div>` : ''}
</dl>
${otherCodesBox}
</div>
</div>`,
  extraScript: calcWidget ? calcScript : '',
  restHtml: `
${evBanner}
${priceGauge() ? `<section class="full">
<h2>지금 사도 될까</h2>
${lowGauge()}
<a class="cta ghost" href="./price.html">가격 흐름 그래프와 제품별 대란 가격 보기</a>
</section>` : ''}
${calcWidget ? `<section>
<h2>내 장바구니는 얼마에 살까</h2>
<p class="lede">금액만 넣으면 히든코드와 숨은 할인까지 적용한 결제금액이 나옵니다.</p>
${calcWidget}
</section>` : ''}

<section>
<h2>대란 기록</h2>
${recent.length ? eventTable(recent.slice(0, 6)) : '<p class="lede">아직 기록된 대란이 없습니다.</p>'}
<a class="cta ghost" href="./daeran.html">대란 일정과 전체 기록 보기</a>
${bfSeason ? `<a class="cta ghost" href="./blackfriday.html">블랙프라이데이 ${kdate(bfDate)} 준비하기</a>` : ''}
</section>

<section>
<h2>월별 마이프로틴 대란</h2>
${monthLinks([...monthPages].reverse().slice(0, 6))}
</section>

${PRODUCTS.length ? `<section class="full">
<h2>대란 때 얼마나 싸질까</h2>
<p class="lede">표시가에 오늘 코드 ${last.base}%와 지난 대란 평균 코드 ${dRate}%를 각각 적용한 금액입니다. ${dot(db.priceDate || last.date)} 표시가 기준입니다.</p>
${priceRows(PRODUCTS.slice(0, 4))}
<a class="cta ghost" href="./price.html">제품별 대란 가격 비교 전체 보기</a>
${altMp ? '<a class="cta ghost" href="./alternatives.html">마이프로틴 말고 대안은? 다른 브랜드와 가성비 비교</a>' : ''}
</section>` : ''}

${SITE.slogan ? `<section class="full brandBand">
<p class="eyebrow">${esc(SITE.brand)}${SITE.brandEn ? ` | ${esc(SITE.brandEn)}` : ''}</p>
<h2 class="bandTitle">${esc(SITE.slogan).replace(/\.\s+/g, '.<br>')}</h2>
<p class="lede">마이프로틴 대란은 오르는 날 먼저 알리고, 아이허브는 세일과 코드가 겹치는 순서까지, 다른 브랜드는 단백질 1g당 가격으로 비교합니다. 사기 전에 필요한 숫자만 모았습니다.</p>
<ul class="tiles">
  <li><a href="./daeran.html"><b>마이프로틴 대란 알리미</b><span>오르는 순간,<br>가장 먼저.</span><em>대란 일정 보기 →</em></a></li>
  ${IH ? `<li><a href="./iherb.html"><b>아이허브 할인코드</b><span>세일 위에 코드 하나.<br>순서까지 정확하게.</span><em>${M(ihYm)}월 코드 보기 →</em></a></li>` : ''}
  ${altMp ? `<li><a href="./alternatives.html"><b>뉴트리션 비교</b><span>브랜드 말고,<br>단백질 1g당 가격으로.</span><em>가성비 비교 보기 →</em></a></li>` : ''}
</ul>
</section>` : ''}

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
   `할인코드끼리는 중복이 안 됩니다. 한 주문에 코드 하나만 들어가고, 두 번째 코드를 넣으면 앞의 코드가 빠집니다. 대신 이달의 트렌드 ${TREND}나 쇼핑지원금처럼 장바구니 조건으로 붙는 숨은 할인은 코드와 중복됩니다. 이 사이트는 둘을 합친 실제 할인율을 따로 계산합니다.`],
  ['마이프로틴 대란 코드는 평소 코드와 다른가요?',
   `대란용 코드가 따로 있는 게 아니라, 같은 공식 코드나 히든코드의 할인율이 ${TH}% 이상으로 오른 날을 대란이라고 부릅니다. 대란 때는 4월 4일 0404처럼 코드 이름이 바뀌기도 하니, 예전에 쓰던 코드를 넣지 말고 그날 코드를 복사해 쓰십시오.`],
  ['마이프로틴 쇼핑지원금은 어떻게 받나요?',
   '앱에서 신청하는 선착순 이벤트 형식으로 대란 전후에 열립니다. 신청해 두면 일정 금액 이상 결제할 때 정액으로 빠집니다. 열리는 즉시 단톡방과 유튜브로 알려드리고, 이 페이지의 숨은 할인 목록에도 올립니다.'],
  ['추천인 코드는 뭔가요?',
   `처음 가입할 때 추천인 코드${db.referral ? `(${db.referral})` : ''}를 넣으면 첫 구매가 12만원 이상일 때 추가 할인이나 사은품을 받습니다(마이프로틴 친구 추천 안내 기준). 할인코드와는 별개라 같이 쓸 수 있습니다. 이미 가입한 계정에는 적용되지 않습니다.`],
  ['할인코드 쓰기 전에 확인할 조건이 있나요?',
   `세 가지를 보십시오. 이미 세일 중인 상품은 코드가 빠질 수 있고, ${(SHOP.freeShipping / 10000).toLocaleString('ko-KR')}만원 이상이어야 무료배송이며, ${SHOP.customsUsd}달러를 넘으면 관세와 부가세가 붙을 수 있습니다.${last.deals.length ? ` 지금은 ${last.deals.map(d => d.label).join(', ')} 조건도 있으니 장바구니를 담을 때 같이 챙기십시오.` : ''}`],
  ['마이프로틴 배송비는 얼마인가요?',
   `할인이 끝난 결제 금액이 ${SHOP.freeShipping.toLocaleString('ko-KR')}원 이상이면 무료배송이고, 그보다 적으면 배송비가 붙습니다. 할인 계산기에 금액을 넣으면 무료배송까지 얼마 남았는지 알려드립니다.`],
  ['마이프로틴 배송 기간은 얼마나 걸리나요?',
   '마이프로틴 공식 안내로는 출고 후 평균 2~6영업일입니다. 통관이나 택배사 사정으로 늦어질 수 있고, 통관이 끝나기 전에는 배송 조회가 안 될 수 있습니다. 주문부터 관세까지는 직구 방법 페이지에 정리했습니다.'],
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
<section class="full">
<h2>마이프로틴 할인코드 적용 방법</h2>
<ol class="steps">
  <li>위 버튼을 누릅니다. 코드가 복사되고 마이프로틴이 열립니다.</li>
  <li>살 제품을 장바구니에 담습니다. 이달의 트렌드 제품을 하나 넣으면 ${TREND}가 더 빠집니다.</li>
  <li>장바구니의 할인코드 칸에 붙여넣고 적용을 누른 뒤, 금액이 바뀌었는지 확인하고 결제합니다.</li>
</ol>
<p class="lede">8만원 이상이면 무료배송이고, 150달러를 넘으면 관세가 붙을 수 있으니 장바구니 금액을 그 아래로 맞추는 편이 좋습니다.</p>
${calcWidget ? '<a class="cta ghost" href="./calc.html">내 장바구니 최종 결제금액 계산하기</a>' : ''}
</section>

${db.referral ? `<section>
<h2>마이프로틴 추천인 코드</h2>
<p class="lede">처음 가입하는 분만 해당합니다. 추천인 코드 <b>${esc(db.referral)}</b>를 넣으면 첫 구매 12만원 이상일 때 ${esc(REF_BENEFIT)}을 받고, 할인코드와는 별개라 같이 쓸 수 있습니다. 이미 가입한 계정에는 적용되지 않습니다.</p>
<a class="cta" href="${esc(mpLink('pt-PAGE-join'))}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(db.referral)}">${esc(db.referral)} 복사하고 가입하기</a>
<a class="cta ghost" href="./referral.html">추천인 코드 입력 방법과 혜택 자세히</a>
</section>` : ''}

<section class="full">
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
<p class="lede">${isDaeran ? `지금은 대란입니다. 할인코드 ${last.base}%로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}.${waitTxt ? ` ${waitTxt}` : ''}` : `지금은 대란이 아닙니다. 할인코드 기준 대란(${TH}%)까지 ${gap}%p 남았습니다.`}${nextGuess ? ` 평균 주기로 단순 계산한 다음 예상 대란일은 ${kdate(nextGuess)}입니다.` : ''}</p>
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
  ...(amountDeal && amountDeal.min ? [[`쇼핑지원금 ${(amountDeal.min / 10000)}만원 기준은 할인 전 금액인가요?`,
   `이 계산기는 할인코드를 적용한 뒤 금액이 ${amountDeal.min.toLocaleString('ko-KR')}원 이상일 때 지원금을 붙입니다. 마이프로틴 안내가 결제 금액 기준이라 그렇게 잡았습니다. 기준이 모자라면 장바구니를 얼마나 더 담아야 하는지도 알려드립니다.`]] : []),
  ['계산 결과와 실제 결제금액이 다를 수 있나요?',
   '이미 세일 중인 상품이나 일부 번들은 할인코드가 빠질 수 있고, 마이프로틴이 조건을 바꾸면 결과가 달라집니다. 이 계산기는 예상값이니 결제 전에 장바구니에서 최종 금액을 확인하십시오.'],
  ['관세는 얼마부터 붙나요?',
   `건강기능식품은 보통 ${SHOP.customsUsd}달러를 넘으면 관세와 부가세가 붙습니다. 계산기는 1달러 ${SHOP.usdKrw.toLocaleString('ko-KR')}원으로 어림잡아 넘을 것 같으면 알려드립니다. 넘는다면 날을 달리해 나눠 주문하는 편이 낫습니다. 같은 날 산 걸 나눠 받으면 합쳐서 과세됩니다.`],
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
<section class="full">
<h2>계산 방법</h2>
<ol class="steps">
  <li>장바구니 금액에 할인코드(${primary ? `${nameOf(primary)} ${primary.rate}%` : '%'})를 적용합니다.</li>
  ${amountDeal ? `<li>${amountDeal.min ? `할인코드 적용 후 금액이 ${amountDeal.min.toLocaleString('ko-KR')}원 이상이면 ` : '쇼핑지원금을 미리 신청했다면 '}${esc(amountDeal.label.replace(/.*?(쇼핑지원금.*)/, '$1'))}을 뺍니다.</li>` : ''}
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
     isDaeran ? '지금이 대란이라 기다릴 필요가 없습니다.' : `차이가 몇천 원에서 1~2만 원 수준입니다. 지금 당장 필요하면 히든코드로 사고, 2.5kg 이상 대량 구매면 다음 대란(${sureNext ? (sureOpen ? `${sureOpen} 공개` : `${kdate(nextGuess)}, 확정`) : `예상일 ${nextGuess ? kdate(nextGuess) : '미정'}`})을 기다리는 편이 낫습니다.`],
    ['가격 비교 사이트와 금액이 왜 다른가요?',
     '이 표는 맛별로 다른 표시가 중 가장 흔한 값을 골라 코드만 적용한 금액입니다. 세일 중인 맛이나 한정판은 표시가가 달라서 실제 결제 금액이 다를 수 있습니다. 정확한 금액은 계산기에 장바구니 금액을 넣어 확인하십시오.'],
  ];
  page({
    file: 'price.html', priority: 0.8, current: 'price.html',
    title: `마이프로틴 대란 가격 비교 | 임팩트웨이 평소 vs 대란 얼마나 싸질까 (${M(curYm)}월 표시가 기준)`,
    desc: `임팩트웨이 30회분·90회분·166회분, 아이솔레이트, 크레아틴의 평소 가격(코드 ${last.base}%)과 대란 가격(코드 ${dRate}%) 비교표. ${josa(`${ex.name} ${ex.size}`, '은', '는')} 대란 때 ${won(exA - exB)} 더 쌉니다. ${dot(db.priceDate || last.date)} 표시가 기준.`,
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
<p class="lede">할인코드만 적용한 금액입니다. 이달의 트렌드 ${TREND}나 쇼핑지원금까지 넣은 최종 금액은 <a href="./calc.html?amt=${ex.price}">계산기</a>에서 확인하십시오.</p>
</section>
${priceChart() ? `<section class="full">
<h2>임팩트웨이 30회분 가격 흐름</h2>
${priceGauge()}
${priceChart()}
${priceChartNote(CHART_KEY)}
</section>` : ''}

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
  // 어사이드로 모은 커뮤니티 평가(reviews)·검색어(keywords)·질문(faq). 없으면 그대로 비워 둡니다
  const allReviews = (TASTE.reviews || []).filter(r => r.flavor && !r.discontinued).sort((a, b) => ((b.good ?? 0) - (b.bad ?? 0)) - ((a.good ?? 0) - (a.bad ?? 0)) || (b.mentions ?? 0) - (a.mentions ?? 0) || (b.score ?? 0) - (a.score ?? 0));
  const reviews = allReviews.filter(r => (r.mentions ?? 0) >= 2);
  const rareReviews = allReviews.filter(r => (r.mentions ?? 0) < 2);
  const rvTotals = { posts: allReviews.reduce((n, r) => n + (r.mentions ?? 0), 0), comments: allReviews.reduce((n, r) => n + (r.fromComments ?? 0), 0) };
  const stars = n => n == null ? '' : '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const reviewHtml = reviews.map(r => `<li class="rv${r.beginner ? ' bg' : ''}">
  <div class="rvHead"><span class="fn">${esc(r.flavor)}</span>${r.product ? `<span class="fp">${esc(r.product)}</span>` : ''}${r.score != null ? `<span class="rvScore" title="${r.score}점">${stars(r.score)} <b>${r.score}</b></span>` : ''}</div>
  ${r.summary ? `<p class="rvSum">${esc(r.summary)}</p>` : ''}
  <p class="rvMeta">${r.mentions ? `의견 ${r.mentions}건${r.fromComments ? `(댓글 ${r.fromComments})` : ''} · ` : ''}${r.good != null ? `긍정 ${r.good}${r.bad != null ? ` / 부정 ${r.bad}` : ''} · ` : ''}${r.mix && r.mix !== '모름' ? `${esc(r.mix)}에 타기` : ''}${r.beginner ? ' · 입문 추천' : ''}</p>
  ${(r.pros || []).length || (r.cons || []).length ? `<div class="rvPc">${(r.pros || []).map(x => `<span class="pro">+ ${esc(x)}</span>`).join('')}${(r.cons || []).map(x => `<span class="con">− ${esc(x)}</span>`).join('')}</div>` : ''}
  ${(r.quotes || []).length ? `<details><summary>후기 ${r.quotes.length}개 보기</summary><ul class="rvQ">${r.quotes.map(q => `<li>${esc(q.text)}${q.source ? ` <small>${esc(q.source)}${q.date ? ` · ${dot(q.date)}` : ''}</small>` : ''}</li>`).join('')}</ul></details>` : ''}
</li>`).join('');
  const beginnerPick = reviews.filter(r => r.beginner).slice(0, 3);
  // ── 그래프: 추천 vs 비추(양방향 막대), 물/우유 다이어그램. 맛 추천 페이지와 맛 순위 페이지에 같이 씁니다 ──
  const ranked = allReviews.filter(r => (r.mentions ?? 0) >= 3);
  const net = r => (r.good ?? 0) - (r.bad ?? 0);
  const dvMax = Math.max(1, ...ranked.map(r => Math.max(r.good ?? 0, r.bad ?? 0)));
  const dvChart = ranked.length ? `<figure class="dv" role="img" aria-label="맛별 추천·비추 의견 수">
<figcaption><span class="lg"><i class="g"></i>추천</span><span class="lg"><i class="b"></i>비추</span><span class="lgNote">의견 3건 이상인 맛 · 추천이 비추보다 많은 순</span></figcaption>
${ranked.map((r, i) => `<div class="dvRow${r.beginner ? ' bg' : ''}" title="${esc(r.flavor)} · 추천 ${r.good ?? 0} / 비추 ${r.bad ?? 0} / 의견 ${r.mentions}">
  <span class="dvName"><b>${i + 1}</b>${esc(r.flavor)}${r.product && r.product !== '임팩트웨이' ? `<small>${esc(r.product)}</small>` : ''}</span>
  <span class="dvL">${r.bad ? `<i style="width:${Math.max(6, (r.bad / dvMax) * 100)}%"></i><em>${r.bad}</em>` : ''}</span>
  <span class="dvR">${r.good ? `<i style="width:${Math.max(6, (r.good / dvMax) * 100)}%"></i><em>${r.good}</em>` : ''}</span>
</div>`).join('')}
</figure>` : '';
  const mixGroups = [['물', '물에 타도 괜찮은 맛'], ['둘 다', '물·우유 다 되는 맛'], ['우유', '우유에 타야 사는 맛']].map(([k, label]) => [label, ranked.filter(r => r.mix === k && net(r) > 0)]).filter(([, l]) => l.length);
  const mixDiagram = mixGroups.length ? `<div class="mixMap">${mixGroups.map(([label, list]) => `<div class="mixCol"><h3>${label}</h3><ul>${list.map(r => `<li${r.beginner ? ' class="bg"' : ''}>${esc(r.flavor)}${r.product && r.product !== '임팩트웨이' ? `<small>${esc(r.product)}</small>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : '';
  const rankTop = ranked.filter(r => net(r) > 0), rankBottom = [...ranked].filter(r => net(r) <= 0).reverse();
  const rankTable = ranked.length ? `<table class="rankTbl">
<thead><tr><th>순위</th><th>맛</th><th class="n">추천</th><th class="n">비추</th><th class="n">의견</th><th class="n">점수</th><th>타기</th><th>한 줄</th></tr></thead>
<tbody>${ranked.map((r, i) => `<tr${net(r) <= 0 ? ' class="low"' : r.beginner ? ' class="bg"' : ''}><td class="n"><b>${i + 1}</b></td><td class="nw">${esc(r.flavor)}${r.product && r.product !== '임팩트웨이' ? `<small> ${esc(r.product)}</small>` : ''}</td><td class="n">${r.good ?? 0}</td><td class="n">${r.bad ?? 0}</td><td class="n">${r.mentions}</td><td class="n">${r.score ?? '-'}</td><td class="nw">${r.mix && r.mix !== '모름' ? esc(r.mix) : '-'}</td><td>${esc(r.summary || '')}</td></tr>`).join('')}</tbody>
</table>` : '';
  const chartSection = ranked.length ? `<section class="full">
<h2>한눈에 보는 추천 vs 비추</h2>
<p class="lede">글과 댓글에서 그 맛을 추천한 사람과 비추한 사람 수입니다. 오른쪽(추천)이 길수록 안전한 맛이고, 왼쪽(비추)이 긴 맛은 호불호가 갈리거나 피하는 편이 낫습니다.</p>
${dvChart}
</section>
${mixDiagram ? `<section class="full">
<h2>물에 탈까, 우유에 탈까</h2>
<p class="lede">추천이 더 많은 맛을 후기에서 주로 어디에 탔는지로 나눴습니다. 물에 타는 사람은 왼쪽에서 고르면 됩니다.</p>
${mixDiagram}
</section>` : ''}` : '';
  const EXTRA_FAQ = (TASTE.faq || []).filter(f => f.q && f.a).map(f => [f.q, f.a]);
  const KW_EXTRA = (TASTE.keywords || []).map(k => k.kw).filter(Boolean);
  const TASTE_FAQ = [
    ['마이프로틴 맛 추천, 처음이면 뭘 사야 하나요?',
     top && top.flavors.length ? `${top.tier} 등급 중에서 고르면 실패가 없습니다. ${top.flavors.slice(0, 3).map(f => f.name).join(', ')} 순으로 많이 권합니다. 처음이면 250g 맛보기로 두세 가지를 사 보는 편이 안전합니다.` : beginnerPick.length ? `커뮤니티 후기에서 입문용으로 가장 많이 권하는 맛은 ${beginnerPick.map(r => `${r.flavor}(${r.score}점)`).join(', ')}입니다. 처음이면 250g 맛보기로 두세 가지를 사 보는 편이 안전합니다.` : '처음이면 250g 맛보기로 두세 가지를 사 보는 편이 안전합니다. 등급표는 영상에서 공개한 순서대로 채우고 있습니다.'],
    ['임팩트웨이와 아이솔레이트는 같은 맛이면 맛이 같나요?',
     '다릅니다. 아이솔레이트는 유당과 지방이 적어 더 묽고 담백하게 느껴집니다. 같은 초콜릿 맛이라도 임팩트웨이가 더 진합니다. 텁텁한 게 싫으면 클리어웨이를 보십시오. 주스처럼 마십니다.'],
    ['임팩트웨이와 아이솔레이트(WPI)는 뭐가 다른가요?',
   '임팩트웨이는 유청을 농축한 WPC 제품이고, 아이솔레이트는 한 번 더 걸러 단백질 비율을 높이고 유당과 지방을 줄인 WPI 제품입니다. 우유를 먹으면 배가 불편하거나 더 가볍게 마시고 싶으면 아이솔레이트가 낫고, 맛과 가격을 보면 임팩트웨이가 무난합니다. 그림과 표로 정리한 비교는 임팩트웨이 vs 아이솔레이트 페이지에 있습니다.'],
  ['맛 등급은 어떻게 정했나요?',
     '마프대란알리미 채널에서 6천만 원 넘게 사 먹으며 정리한 등급표입니다. 개인 취향이 들어가 있으니 참고용입니다. 영상 댓글의 다른 분들 경험도 같이 보십시오.'],
    ['맛 때문에 실패하지 않으려면?',
     '대용량(2.5kg 이상)은 먹어본 맛만 사십시오. 새 맛은 250g으로 먼저 확인하고, 대란 때 대용량으로 넘어가면 됩니다. 이 사이트 대란 가격 비교 페이지에서 250g과 2.5kg 가격 차이를 볼 수 있습니다.'],
    ...EXTRA_FAQ,
  ];
  page({
    file: 'taste.html', priority: 0.8, current: 'taste.html', lastmod: TASTE.updated || last.date,
    title: `마이프로틴 맛 추천 ${Y(curYm)} | 6천만원 먹고 만든 등급표 + 후기 ${rvTotals.posts || ''}건 (임팩트웨이·클리어웨이)`,
    desc: `마이프로틴 맛 추천. 실패 없는 S등급부터 피해야 할 맛까지 등급표로 정리하고, 블로그·카페·디시·유튜브 댓글 후기를 맛별로 모았습니다. 임팩트웨이·아이솔레이트·클리어웨이 맛 종류와 물·우유 궁합. 6천만 원 넘게 사 먹은 마프대란알리미 기준.`,
    keywords: [...new Set(['마이프로틴 맛 추천', '마이프로틴 맛 종류', '마이프로틴 맛 후기', '마이프로틴 맛 비교', '마이프로틴 추천 맛', '임팩트웨이 맛 추천', '클리어웨이 맛 추천', '마이프로틴 wpi 맛 추천', '마이프로틴 맛 추천 디시', ...KW_EXTRA])].slice(0, 30),
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 맛 추천', 'taste.html']]), faqLd(TASTE_FAQ),
      ...(TASTE.video ? [{ '@type': 'VideoObject', name: '마이프로틴 맛 추천 : 6천만원 쓰고 만들어본 마프 맛 등급표', description: '마프대란알리미가 마이프로틴을 6천만 원 넘게 사 먹으며 정리한 맛 등급표(S·A·B·F) 영상입니다. 임팩트웨이 프로틴 맛별 추천과 피해야 할 맛을 정리했습니다.', thumbnailUrl: `https://i.ytimg.com/vi/${TASTE.video}/hqdefault.jpg`, uploadDate: '2026-03-22', embedUrl: `https://www.youtube.com/embed/${TASTE.video}`, contentUrl: ytWatch(TASTE.video) }] : [])],
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

${chartSection}
${ranked.length ? `<p class="lede" style="margin-top:-6px"><a href="./taste-rank.html">전체 순위표와 피해야 할 맛은 맛 순위 페이지에서 →</a></p>` : ''}

${reviews.length ? `<section class="full">
<h2>맛별 커뮤니티 평가</h2>
<p class="lede">네이버 블로그·카페, 디시 보충제갤, 유튜브에 올라온 글과 댓글에서 맛 이름이 나온 의견 ${rvTotals.posts}건(댓글 ${rvTotals.comments}건)을 맛별로 모았습니다.${TASTE.checked ? ` ${dot(TASTE.checked)} 기준.` : ''} 추천이 비추보다 많은 순이고, 점수는 추천 비율(5점 만점)입니다. 입문 추천은 "처음 사도 실패 없다"는 의견이 많은 맛입니다. 딸기맛·스베크처럼 다르게 부르는 이름은 하나로 합쳤습니다.</p>
<ul class="rvList">${reviewHtml}</ul>
${rareReviews.length ? `<details class="rvRare"><summary>한 번만 언급된 맛 ${rareReviews.length}개</summary><ul class="fl cmts">${rareReviews.map(r => `<li class="${(r.bad ?? 0) > (r.good ?? 0) ? 'bad' : (r.good ?? 0) ? 'good' : ''}"><span class="fn">${esc(r.flavor)}</span>${r.product ? `<span class="fp">${esc(r.product)}</span>` : ''}${r.summary ? `<span class="fnote">${esc(r.summary)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
${TASTE.researchNote ? `<p class="rvNote">${esc(TASTE.researchNote)}</p>` : ''}
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
  // 맛 추천 페이지 FAQ 중 순위 성격인 것만 순위 페이지에 넣습니다
  const RANK_FAQ = [
    ['마이프로틴 맛 순위는 어떻게 매겼나요?',
     `${dot(TASTE.checked || TASTE.updated || last.date)} 기준 네이버 블로그·카페, 디시 보충제갤, 유튜브의 글과 댓글에서 맛 이름이 나온 의견 ${rvTotals.posts}건(댓글 ${rvTotals.comments}건)을 모아, 추천 수에서 비추 수를 뺀 값이 큰 순으로 세웠습니다. 의견이 3건 미만인 맛은 순위에서 뺐습니다. 협찬·제휴 글은 뺐고, 마프대란알리미 채널의 글도 넣지 않았습니다.`],
    ...(rankTop.length ? [['마이프로틴 맛 순위 1위는 뭐예요?',
     `${rankTop[0].flavor}입니다. 의견 ${rankTop[0].mentions}건 중 추천 ${rankTop[0].good}, 비추 ${rankTop[0].bad ?? 0}으로 가장 안전한 맛이고${rankTop[0].beginner ? ' 입문용으로 가장 많이 권합니다' : ''}. ${rankTop.slice(1, 4).map(r => r.flavor).join(', ')}이 그 뒤를 잇습니다.`]] : []),
    ...(rankBottom.length ? [['피해야 할 마이프로틴 맛은 뭐예요?',
     `${rankBottom.slice(0, 4).map(r => `${r.flavor}(추천 ${r.good ?? 0}·비추 ${r.bad ?? 0})`).join(', ')}은 비추가 추천보다 많거나 같았습니다. 대용량으로 처음 사기에는 위험한 맛입니다.`]] : []),
    ...EXTRA_FAQ.filter(([q]) => /순위|1위|비추|피해야|무난|제일/.test(q) && !/순위 1위는/.test(q)),
    ['순위와 마프대란알리미 등급표가 다르면요?',
     '순위는 다른 사람들의 글과 댓글을 센 것이고, 등급표는 마프대란알리미가 직접 먹어 본 기준입니다. 둘 다 높은 맛은 실패 확률이 가장 낮고, 둘이 갈리는 맛은 250g으로 먼저 먹어 보십시오.'],
  ];
  page({
    file: 'taste-rank.html', priority: 0.8, current: 'taste-rank.html', lastmod: TASTE.checked || TASTE.updated || last.date, changefreq: 'weekly',
    title: `마이프로틴 맛 순위 ${Y(curYm)} | 후기 ${rvTotals.posts}건으로 매긴 ${ranked.length}개 맛 랭킹 (1위 ${rankTop[0]?.flavor || ''})`,
    desc: `마이프로틴 맛 순위 ${Y(curYm)}. 블로그·카페·디시·유튜브 댓글 ${rvTotals.posts}건을 세어 추천이 비추보다 많은 순으로 ${ranked.length}개 맛을 줄 세웠습니다. 1위 ${rankTop.slice(0, 3).map(r => r.flavor).join(', ')}. 피해야 할 맛과 물·우유 궁합까지.`,
    keywords: ['마이프로틴 맛 순위', `마이프로틴 맛 순위 ${Y(curYm)}`, '마이프로틴 맛 랭킹', '마이프로틴 인기 맛', '마이프로틴 맛 순위 디시', '임팩트웨이 맛 순위', '마이프로틴 맛 비교', '마이프로틴 맛 1위', '마이프로틴 비추 맛', '마이프로틴 맛 추천 순위', ...KW_EXTRA.filter(k => /순위|비교|랭킹|1위|인기/.test(k))],
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 맛 추천', 'taste.html'], ['마이프로틴 맛 순위', 'taste-rank.html']]), faqLd(RANK_FAQ),
      { '@type': 'ItemList', name: `마이프로틴 맛 순위 ${Y(curYm)}`, itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: ranked.length, itemListElement: ranked.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.flavor}${r.product ? ` (${r.product})` : ''}` })) }],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 맛 순위<br>후기 ${rvTotals.posts}건으로 세운 ${ranked.length}개</h1>
<p class="updated">${dot(TASTE.checked || TASTE.updated || last.date)} 기준 · 글 51개와 댓글 227개</p>
<p class="lede answer">${rankTop.length ? `1위는 <b>${esc(rankTop[0].flavor)}</b>(추천 ${rankTop[0].good}, 비추 ${rankTop[0].bad ?? 0})입니다. ${rankTop.slice(1, 4).map(r => esc(r.flavor)).join(', ')}이 뒤를 잇고, ` : ''}${rankBottom.length ? `${rankBottom.slice(0, 3).map(r => esc(r.flavor)).join(', ')}은 비추가 더 많았습니다. ` : ''}네이버 블로그·카페, 디시, 유튜브 댓글에서 맛 이름이 나온 의견을 세어 추천이 비추보다 많은 순으로 줄 세웠습니다.</p>
${heroCta}
<a class="cta ghost" href="./taste.html">맛별 후기 전부 보기 (맛 추천 페이지)</a>
</div>
<div class="heroSide">
<dl class="stats">
  ${rankTop.slice(0, 3).map((r, i) => `<div><dt>${i + 1}위</dt><dd>${esc(r.flavor)}<small>추천 ${r.good} · 비추 ${r.bad ?? 0}${r.beginner ? ' · 입문 추천' : ''}</small></dd></div>`).join('')}
  ${rankBottom.length ? `<div><dt>최다 비추</dt><dd>${esc([...ranked].sort((a, b) => (b.bad ?? 0) - (a.bad ?? 0))[0].flavor)}<small>비추 ${[...ranked].sort((a, b) => (b.bad ?? 0) - (a.bad ?? 0))[0].bad}건</small></dd></div>` : ''}
</dl>
</div>
</div>`,
    restHtml: `
${chartSection}

<section class="full">
<h2>마이프로틴 맛 순위표</h2>
<p class="lede">점수는 추천 비율(5점 만점)입니다. 의견이 적은 맛은 점수가 널뛰니 의견 수를 같이 보십시오. 연한 배경은 입문 추천, 붉은 줄은 비추가 추천보다 많은 맛입니다.</p>
${rankTable}
</section>

${rareReviews.length || allReviews.length > ranked.length ? `<section class="full">
<h2>순위에 못 든 맛</h2>
<p class="lede">의견이 3건 미만이라 순위에 넣지 않은 맛입니다. 언급이 적다고 나쁜 맛은 아닙니다.</p>
<ul class="fl cmts">${allReviews.filter(r => (r.mentions ?? 0) < 3).map(r => `<li class="${(r.bad ?? 0) > (r.good ?? 0) ? 'bad' : (r.good ?? 0) ? 'good' : ''}"><span class="fn">${esc(r.flavor)}</span>${r.product ? `<span class="fp">${esc(r.product)}</span>` : ''}<span class="fnote">추천 ${r.good ?? 0} · 비추 ${r.bad ?? 0}${r.summary ? ` · ${esc(r.summary)}` : ''}</span></li>`).join('')}</ul>
</section>` : ''}

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(RANK_FAQ)}
</section>

<section>
<h2>관련 페이지</h2>
<a class="cta ghost" href="./taste.html">마이프로틴 맛 추천 · 맛별 후기와 등급표</a>
<a class="cta ghost" href="./wpc-wpi.html">임팩트웨이 vs 아이솔레이트 뭘 살까</a>
<a class="cta ghost" href="./price.html">250g과 2.5kg 대란 가격 차이 보기</a>
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
  const shopUrl = it => {
    if (it.aff) return it.aff;
    // 아이허브는 iherb.json 의 파트너라이즈 링크로 보냅니다 (pubref = pt-alt-검색어, 보고서에서 어느 제품을 눌렀는지 보임)
    if (/iherb\.com/.test(it.url)) {
      const kw = new URL(it.url).searchParams.get('kw') || it.product || 'item';
      return ihLink('pt-alt-' + kw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), it.url);
    }
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
  // 대란가가 할인 중인 다른 브랜드보다 비싸면 '대란이면 마이프로틴이 가장 쌈' 같은 문장을 쓰지 않습니다
  const mpCheap = !bestAlt || mpDaeranPg <= bestAlt.pg;
  const p1 = PRODUCTS.find(p => p.name === altMp.p.name && p.size === '30회분');
  const altCount = others.length;

  const row = r => `<tr class="${r.mp ? 'mp' : ''}${r === best ? ' best' : ''}${r.pg ? '' : ' np'}">
<td class="p"><a href="${esc(r.mp ? affTo(r.url, altMp.p) : shopUrl(r))}" target="_blank" rel="sponsored nofollow noopener"${r.mp && primary ? ` data-copy="${b64(primary.code)}" data-label="${esc(nameOf(primary))}"` : ''}><small class="br">${esc(r.brand)}${r.type ? ` · ${esc(r.type)}` : ''}${r === best ? '<i class="tag">가장 쌈</i>' : ''}</small>${esc(r.product)}</a><small class="sh">${esc(r.shop)}${r.tag ? ` · ${esc(r.tag)}` : ''}${r.checked ? ` · ${dot(r.checked)} 확인` : ''}${r.extra ? `<br>${esc(r.extra)}` : ''}</small></td>
<td class="n">${r.price ? won(r.price) : '<span class="muted">확인 중</span>'}</td>
<td class="n">${r.kg ? won(r.kg) : '-'}</td>
<td class="n hot">${r.pg ? won(r.pg) : '-'}</td></tr>`;

  const altTable = `<div class="altWrap"><table class="alt">
<thead><tr><th>제품</th><th class="n">가격</th><th class="n">1kg당</th><th class="n">단백질<br>1g당</th></tr></thead>
<tbody>${priced.map(row).join('')}${unpriced.map(row).join('')}</tbody>
</table></div>`;

  const verdict = bestAlt
    ? (mpRef.pg <= bestAlt.pg
      ? `단백질 1g당 가장 싼 건 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}(오늘 코드 ${last.base}%, ${won(mpRef.pg)})입니다. 그다음은 ${esc(bestAlt.brand)} ${esc(bestAlt.product)}(${won(bestAlt.pg)})입니다.${daeranNote}`
      : `단백질 1g당 가장 싼 건 ${esc(bestAlt.brand)} ${esc(bestAlt.product)}(${won(bestAlt.pg)})입니다. 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}은 오늘 코드 ${last.base}%로 ${won(mpRef.pg)}입니다.${daeranNote}`)
    : `다른 브랜드 가격은 확인하는 대로 채웁니다. 마이프로틴 ${esc(altMp.p.name)} ${esc(altMp.p.size)}는 오늘 코드 ${last.base}% 기준 1kg당 ${won(mpRef.kg)}, 단백질 1g당 ${won(mpRef.pg)}입니다.${daeranNote}`;

  const ALT_FAQ = [
    ['마이프로틴 대안 있나요?',
     `있습니다. 한국에서 직구로 많이 사는 건 옵티멈뉴트리션 골드 스탠다드, 룰원 R1, 다이마타이즈 ISO100 정도이고, 아이허브나 쿠팡 로켓직구에서 삽니다. 다만 마이프로틴도 대란 때 코드를 쓰면 ${altMp.p.name} ${altMp.p.size}이 1kg당 ${won(altMp.kg)}${mpCheap ? '이라 여전히 싼 편입니다' : `이고 단백질 1g당 ${won(mpDaeranPg)}이라, 할인 중인 ${bestAlt.brand}(${won(bestAlt.pg)})와 비슷한 수준입니다`}. 대란이 아닐 때 급하게 사야 하면 표에서 단백질 1g당 가격이 낮은 쪽을 고르면 됩니다.`],
    ['마이프로틴이 왜 이렇게 비싸졌나요?',
     p1 ? `정가가 올랐습니다. ${p1.name} ${p1.size} 정가가 ${won(p1.rrp)}이라 코드 없이 보면 비싸 보입니다. 마이프로틴은 늘 코드를 전제로 한 가격이라 코드 ${last.base}%를 넣으면 ${won(p1.price * (1 - last.base / 100))}, 대란 ${dRate}%면 ${won(p1.price * (1 - dRate / 100))}입니다. 그리고 1kg보다 2.5kg이 1kg당 가격이 훨씬 내려가니, 비교할 때는 큰 용량끼리 보는 게 맞습니다.`
        : `정가가 올랐습니다. 마이프로틴은 늘 코드를 전제로 한 가격이라 코드 없이 정가만 보면 비싸 보입니다. 2.5kg 이상 큰 용량일수록 1kg당 가격이 많이 내려갑니다.`],
    ['단백질 1g당 가격은 어떻게 계산하나요?',
     '가격 ÷ (총 용량 × 한 스쿱 단백질 ÷ 한 스쿱 무게)입니다. 같은 1kg이라도 WPI는 단백질 비율이 높아서 1kg당 가격은 비싸도 단백질 1g당으로 보면 차이가 줄어듭니다. 맛마다 함량이 조금 달라 대표값으로 계산했습니다.'],
    ['직구하면 관세는 언제 붙나요?',
     `한 번에 ${SHOP.customsUsd}달러(약 ${won(SHOP.customsUsd * SHOP.usdKrw)})를 넘으면 관세와 부가세가 붙습니다. 아이허브와 쿠팡 로켓직구도 같은 기준이고, 마이프로틴은 ${won(SHOP.freeShipping)} 이상이면 무료배송입니다. 넘을 것 같으면 날을 달리해 나눠 주문하십시오. 같은 날 같은 곳에서 산 건 나눠 받아도 합쳐서 과세됩니다.`],
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
<p class="lede">"마이프로틴 너무 비싸졌는데 대안 없나요?"에 대한 답입니다. 대란 때는 <b>${esc(altMp.p.name)} ${esc(altMp.p.size)}이 1kg당 ${won(altMp.kg)}</b>${mpCheap ? '이라 여전히 싼 편이고' : `으로 할인 중인 다른 브랜드와 비슷하고`}, 평소 가격이라면 아래 제품들과 <b>단백질 1g당 가격</b>으로 비교해 보고 고르면 됩니다.</p>
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>마이프로틴 대란가</dt><dd>단백질 1g당 ${won(mpDaeranPg)}<small>${esc(altMp.p.name)} ${esc(altMp.p.size)} · 코드 ${dRate}%</small></dd></div>
  <div><dt>가장 싼 다른 브랜드</dt><dd>${bestAlt ? `단백질 1g당 ${won(bestAlt.pg)}<small>${esc(bestAlt.brand)} · ${esc(bestAlt.shop)}</small>` : '확인 중'}</dd></div>
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
  <li><b>마이프로틴</b><span>할인코드를 넣어야 제값입니다. ${mpCheap ? `대란(코드 ${TH}% 이상)이면 고민할 것 없이 마이프로틴이 가장 쌉니다.` : `대란 평균 ${dRate}%면 단백질 1g당 ${won(mpDaeranPg)}으로, 다른 브랜드가 크게 할인 중일 때와 비슷합니다.`} ${won(SHOP.freeShipping)} 이상 무료배송, 영국에서 옵니다.</span></li>
  <li><b>쿠팡 로켓직구</b><span>옵티멈뉴트리션, 다이마타이즈가 빠르면 다음 날 옵니다. 급할 때 가장 편하고, 제품에 따라 아이허브보다 훨씬 쌀 때도 있습니다. 와우 회원가는 이 표에 넣지 않았습니다.</span></li>
  <li><b>네이버 공식 브랜드스토어</b><span>옵티멈뉴트리션처럼 한국 공식 스토어가 있는 브랜드는 즉시할인이 크게 붙어 가장 쌀 때가 있습니다. 쿠폰 할인은 이 표에 넣지 않았습니다.</span></li>
  <li><b>아이허브</b><span>한국어와 원화로 결제하는 직구 사이트입니다. 4만원 이상 무료배송이고, 정기배송을 걸면 더 싸지지만 이 표는 1회 구매가로 비교했습니다. 세일이 자주 바뀝니다.</span></li>
</ul>
<p class="hint">어디서 사든 한 번에 ${SHOP.customsUsd}달러를 넘으면 관세가 붙으니 날을 달리해 나눠 주문하십시오.</p>
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

// ── 아이허브 할인코드 (키워드: 아이허브 할인코드, 아이허브 할인코드 11월, 아이허브 할인코드 입력·중복, 아이허브 추천템) ──
if (IH) {
  const m = M(ihYm), y = Y(ihYm);
  const asof = IH.updated && IH.updated <= ihToday ? IH.updated : ihToday;
  const reward = String(IH.rewardCode || '').trim();
  const rewardLabel = IH.rewardLabel || '신규 고객 첫 주문 할인';
  const top = IH_CODES.find(c => c.rate != null) || IH_CODES[0] || null;
  const codeCount = IH_CODES.length + (reward ? 1 : 0);
  const freeShip = IH_SHIP.freeShipKrw > 0 ? `${won(IH_SHIP.freeShipKrw)} 이상 무료배송` : null;
  const picks = (IH.picks || []).filter(p => p.cat);
  const aff = 'target="_blank" rel="sponsored nofollow noopener"';
  const untilOf = c => c.until ? `${kdate(c.until)}까지` : '기간 미정';
  const codeRows = IH_CODES.map(c => `<li><span class="name">${esc(c.code)}<em>${[c.who, c.label, untilOf(c), c.note].filter(Boolean).map(esc).join(' · ')}</em></span><span class="crate">${c.rate != null ? `${c.rate}%` : ''}</span><button type="button" data-copy="${b64(c.code)}" data-label="${esc(c.code)}">복사</button></li>`).join('');
  const rewardRow = reward ? `<li><span class="name">${esc(reward)}<em>리워드 코드 · ${esc(rewardLabel)} · 코드 칸에 입력</em></span><span class="crate"></span><button type="button" data-copy="${b64(reward)}" data-label="${esc(reward)}">복사</button></li>` : '';
  const codeBox = codeCount
    ? `<ul class="codes">${codeRows}${rewardRow}</ul>`
    : `<p class="lede">${m}월에 쓸 수 있는 코드는 확인되는 대로 여기 올립니다. 코드가 없어도 <b>이번 주 브랜드 세일</b>과 <b>특가 상품</b>은 코드 없이 이미 할인된 가격이니 먼저 보십시오.</p>`;
  const heroBtn = top
    ? `<a class="cta hot heroBtn" href="${esc(ihLink('pt-iherb-hero'))}" ${aff} data-copy="${b64(top.code)}" data-label="${esc(top.code)}">${esc(top.code)} 복사하고 아이허브 가기</a>`
    : `<a class="cta hot heroBtn" href="${esc(ihLink('pt-iherb-hero'))}" ${aff}>아이허브 이번 주 세일 보기</a>`;
  const ihSticky = top ? `<a class="sticky" href="${esc(ihLink('pt-iherb-sticky'))}" ${aff} data-copy="${b64(top.code)}" data-label="${esc(top.code)}"><b>${esc(top.code)}</b> 복사하고 아이허브 가기 →</a>` : '';
  const codeNames = IH_CODES.map(c => `${c.code}${c.rate != null ? ` ${c.rate}%` : ''}`).join(', ');

  const IH_FAQ = [
    [`아이허브 할인코드 ${m}월에 쓸 수 있는 건 뭔가요?`,
     codeCount ? `지금 올라온 코드는 ${codeNames}${reward ? `${codeNames ? ', 그리고' : ''} 리워드 코드 ${reward}` : ''}입니다. 기간이 끝난 코드는 자동으로 내려가고, 새 코드는 확인되는 대로 이 페이지에 올립니다.`
       : `${m}월 코드는 확인되는 대로 이 페이지에 올립니다. 코드가 없을 때도 이번 주 브랜드 세일과 특가는 코드 없이 할인된 가격이라 먼저 보면 됩니다.`],
    ['아이허브 할인코드는 어디에 입력하나요?',
     '장바구니 화면의 프로모 코드 또는 리워드 코드 칸에 넣고 적용을 누르면 됩니다. 적용되면 합계가 바로 줄어듭니다. 결제 화면까지 간 뒤에도 같은 칸이 있습니다.'],
    ['아이허브 할인코드 중복 적용 되나요?',
     '할인코드끼리는 안 됩니다. 한 주문에 코드 하나만 들어가고, 두 번째 코드를 넣으면 앞 코드가 빠집니다. 대신 세일가 위에 코드를 쓰는 것은 되고, 리워드 적립금도 같이 쓸 수 있습니다.'],
    ['아이허브 할인 방법 중 뭐가 제일 큰가요?',
     '보통 이번 주 브랜드 세일이 가장 큽니다. 사려는 브랜드가 세일 주간일 때 사고 그 위에 할인코드를 얹으면 됩니다. 코드만 보고 세일이 아닌 주에 사면 오히려 비쌀 수 있습니다.'],
    ['아이허브 무료배송 기준은 얼마인가요?',
     freeShip ? `${freeShip}입니다. 장바구니에 무료배송까지 남은 금액이 표시됩니다.` : '기준 금액이 자주 바뀌어서 여기에는 적지 않습니다. 장바구니에 무료배송까지 남은 금액이 바로 표시되니 거기서 확인하십시오.'],
    ['아이허브 관세는 언제 붙나요?',
     `영양제(건강기능식품)와 식품은 미국에서 발송돼도 물품값이 ${IH_SHIP.customsUsd}달러를 넘으면 관세와 부가세가 붙습니다. 국제 배송비는 빼고 계산하고, 넘으면 초과분이 아니라 전체 금액에 붙습니다. 건강기능식품은 한 번에 ${IH_SHIP.maxBottles}병까지만 개인 사용으로 통관되니, 넘을 것 같으면 날을 달리해 주문을 나누십시오.`],
    ['미국 발송이면 200달러까지 면세 아닌가요?',
     `200달러는 목록통관이 되는 일반 물품(화장품·생활용품 등)에만 해당합니다. 관세청 고시에서 건강기능식품과 식품류는 목록통관 배제 대상이라 정식 수입신고(일반통관)를 거치고, 이때 면세 한도는 미국 발송이어도 ${IH_SHIP.customsUsd}달러입니다. 아이허브에서 사는 영양제·단백질은 대부분 ${IH_SHIP.customsUsd}달러로 보면 됩니다.`],
    ['아이허브 배송은 얼마나 걸리나요?',
     `보통 ${IH_SHIP.deliveryDays}입니다. 통관이 몰리는 연말이나 블랙프라이데이 뒤에는 더 걸립니다. 개인통관고유부호가 틀리면 통관에서 멈추니 결제 전에 확인하십시오.`],
    ['아이허브 환불은 어떻게 하나요?',
     '주문 내역에서 해당 주문을 열고 고객센터 채팅으로 요청하면 됩니다. 배송 중 파손이나 누락은 사진을 보내면 대부분 환불이나 재발송으로 처리됩니다. 단순 변심은 해외로 다시 보내야 해서 반송비가 더 들 수 있습니다.'],
    ['아이허브에서 멜라토닌 살 수 있나요?',
     '한국 주소로는 살 수 없습니다. 한국에서 멜라토닌은 전문의약품이라 아이허브가 한국 배송을 막아 두었습니다. 잠 문제는 병원에서 처방받는 것이 맞습니다.'],
    ['아이허브 페이코 할인은 있나요?',
     '페이코로 결제하면 할인해 주는 쿠폰이 수시로 열립니다. 2026년 7월에는 5% 쿠폰이 있었습니다. 선착순 수량이라 일찍 끝나기도 하고, 앱 전용이거나 최소 결제 금액이 붙기도 합니다. 할인코드를 넣은 뒤 페이코로 결제하면 둘 다 받을 수 있으니, 결제 전에 페이코 앱 쿠폰함을 확인하십시오.'],
    ['아이허브 블랙프라이데이는 언제인가요?',
     `매년 11월 마지막 주, 블랙프라이데이부터 사이버먼데이까지입니다. ${bfYear}년은 ${kdate(bfDate)}이 블랙프라이데이입니다. 이 기간에는 전체 상품에 붙는 코드가 나오는 편이라, 코드가 뜨면 이 페이지에 바로 올립니다.`],
    ['프로틴은 아이허브와 마이프로틴 중 어디가 싼가요?',
     `프로틴은 대부분 마이프로틴이 쌉니다. 특히 대란(할인코드 ${TH}% 이상) 때는 비교가 안 됩니다. 아이허브는 유산균, 오메가3, 마그네슘 같은 영양제와 옵티멈뉴트리션, 다이마타이즈처럼 마이프로틴에 없는 브랜드를 살 때 좋습니다.`],
  ];

  page({
    file: 'iherb.html', priority: 0.9, changefreq: 'daily', current: 'iherb.html', lastmod: asof,
    title: `아이허브 할인코드 ${m}월 (${y}) | 입력 방법 · 중복 적용 · 추천템 고르는 법`,
    keywords: ['아이허브 할인코드', `아이허브 할인코드 ${m}월`, '아이허브 할인코드 입력', '아이허브 할인코드 중복', '아이허브 할인 방법', '아이허브 할인', '아이허브 추천템', '아이허브 추천', '아이허브 유산균', '아이허브 오메가3', '아이허브 마그네슘', '아이허브 엽산', '아이허브 멜라토닌', '아이허브 환불', '아이허브 관세', '아이허브 배송', '아이허브 블프', '아이허브 리워드 코드', '아이허브 페이코', '아이허브 페이코 할인'],
    desc: `아이허브 할인코드 ${y}년 ${m}월 정리. ${codeCount ? `지금 쓸 수 있는 코드 ${codeCount}개, ` : ''}할인코드 입력 위치와 중복 적용 규칙, 세일과 겹쳐 싸게 사는 순서, 유산균·오메가3·마그네슘·엽산 고르는 기준, 관세 ${IH_SHIP.customsUsd}달러 기준과 환불 방법까지. ${dot(asof)} 확인.`,
    ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html']]), faqLd(IH_FAQ)],
    utilHtml: `<span>영양제 ${IH_SHIP.customsUsd}달러까지 면세 · 미국 발송도 같음</span>
  <span>건강기능식품 ${IH_SHIP.maxBottles}병까지</span>
  <span>개인통관고유부호 필요</span>`,
    stickyHtml: ihSticky,
    heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(asof)} 확인 · 기간 지난 코드는 자동으로 내립니다</p>
<h1>아이허브 할인코드 ${m}월<br>싸게 사는 순서까지</h1>
<p class="lede answer">아이허브 할인은 <b>이번 주 세일 → 할인코드 1개 → 리워드</b> 순서로 겹칩니다. ${codeCount ? `지금 쓸 수 있는 코드는 ${codeCount}개입니다.` : `${m}월 코드는 확인되는 대로 올리고, 그동안은 세일 주간을 노리면 됩니다.`} 코드 입력 위치, 중복 규칙, 관세 기준, 영양제 고르는 법을 한 페이지에 정리했습니다.</p>
${heroBtn}
<p class="hint">아이허브 링크는 제휴 링크입니다. 구매 금액은 같고 프로티파이에 수수료가 들어옵니다.</p>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>이번 달 코드</dt><dd>${codeCount ? `${codeCount}개` : '확인 중'}</dd></div>
  <div><dt>면세 한도</dt><dd>${IH_SHIP.customsUsd}달러<small>영양제는 미국 발송도 같음</small></dd></div>
  <div><dt>건강기능식품</dt><dd>${IH_SHIP.maxBottles}병까지</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>아이허브 할인코드 ${m}월 (${y}년)</h2>
${codeBox}
<p class="hint">할인코드는 한 주문에 하나만 들어갑니다. 세일가, 리워드 적립금과는 겹칩니다.</p>
${heroBtn.replace(' heroBtn', '').replace('pubref:pt-iherb-hero', 'pubref:pt-iherb-codes')}
</section>

<section>
<h2>아이허브 할인 방법, 겹치는 순서</h2>
<p class="lede">아이허브 할인은 네 겹입니다. 위에서부터 차례로 챙기면 됩니다.</p>
<ol class="steps">
  <li><b>이번 주 세일</b> 매주 바뀌는 브랜드 세일과 특가입니다. 코드 없이 가격에 이미 들어가 있습니다. 사려는 제품의 브랜드가 세일 주간인지 먼저 보십시오.</li>
  <li><b>할인코드 1개</b> 장바구니에서 코드를 넣으면 세일가 위에서 또 빠집니다. 코드는 주문당 하나만 됩니다.</li>
  <li><b>리워드 코드</b> 아이허브를 처음 쓰면 리워드 코드로 첫 주문 할인을 받습니다. ${reward ? `이 페이지의 코드는 <b>${esc(reward)}</b>입니다.` : '코드가 올라오면 이 페이지에서 복사해 쓰십시오.'}</li>
  <li><b>리워드 적립·정기배송</b> 주문하면 쌓이는 리워드 적립금은 다음 주문에 쓸 수 있고, 정기배송(Autoship)이 되는 제품은 추가 할인이 붙습니다. 둘 다 결제 화면에서 확인됩니다.</li>
</ol>
</section>

<section>
<h2>아이허브 할인코드 입력 방법</h2>
<ol class="steps">
  <li>제품을 장바구니에 담고 <b>장바구니</b>로 갑니다.</li>
  <li>장바구니 오른쪽 위 <b>할인코드</b> 칸(리워드 코드도 같은 칸)에 코드를 붙여넣고 <b>적용</b>을 누릅니다. 이 페이지의 복사 버튼을 누르면 코드가 복사됩니다.</li>
  <li>합계가 줄었는지 확인하고 결제로 넘어갑니다. 안 줄었으면 코드 기간이 끝났거나 조건(신규 고객, 최소 금액, 제외 브랜드)에 안 맞는 것입니다.</li>
  <li>결제 전에 <b>개인통관고유부호</b>가 들어가 있는지 보십시오. 없으면 통관에서 멈춥니다.</li>
</ol>
${shot('ih-cart-code.webp', '아이허브 장바구니에 할인코드를 적용한 화면', '할인코드를 적용한 장바구니. 주문당 코드 1개이고, 4만원 미만이면 배송비 6,000원이 붙습니다. <a href="./iherb-jikgu.html">주문부터 통관까지 화면으로 보기</a>')}
</section>

<section class="full">
<h2>아이허브 할인코드 중복, 되는 것과 안 되는 것</h2>
<table>
<thead><tr><th>조합</th><th>되나요</th><th>메모</th></tr></thead>
<tbody>
<tr><td>세일가 + 할인코드</td><td class="ok">됩니다</td><td>일부 브랜드와 특가 상품은 코드에서 빠집니다</td></tr>
<tr><td>할인코드 + 할인코드</td><td class="no">안 됩니다</td><td>주문당 코드 1개. 두 번째를 넣으면 앞 코드가 빠집니다</td></tr>
<tr><td>할인코드 + 리워드 적립금</td><td class="ok">됩니다</td><td>적립금은 결제 화면에서 따로 차감됩니다</td></tr>
<tr><td>신규 고객 코드 + 기존 계정</td><td class="no">안 됩니다</td><td>첫 주문 계정에만 적용됩니다</td></tr>
<tr><td>정기배송 할인 + 할인코드</td><td>제품마다 다릅니다</td><td>장바구니에서 금액이 바뀌는지 보십시오</td></tr>
</tbody>
</table>
</section>

<section class="full">
<h2>아이허브 추천템, 고르는 기준</h2>
<p class="lede">아이허브에서 가장 많이 찾는 영양제 다섯 가지입니다. 제품 이름보다 <b>라벨에서 무엇을 봐야 하는지</b>를 적었습니다. 자체 브랜드 캘리포니아 골드 뉴트리션(CGN)은 리뷰가 가장 많은 편이지만 가장 싼 건 카테고리마다 다르니, 아래 고르는 법 페이지의 가격 비교표를 보십시오.</p>
<ul class="shops picks">
${picks.map((p, i) => `<li${p.warn ? ' class="caution"' : ''}><b>${esc(p.cat)}${p.sub ? ` <small>${esc(p.sub)}</small>` : ''}</b><ul class="tips">${(p.check || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>${p.kw && !p.warn ? `<a class="go" href="${esc(ihSearch(`pt-iherb-pick${i + 1}`, p.kw))}" ${aff}>아이허브에서 ${esc(p.cat)} 보기 →</a>` : ''}</li>`).join('\n')}
</ul>
<p class="hint">건강기능식품은 질병을 예방하거나 치료하는 약이 아닙니다. 먹는 약이 있으면 의사나 약사와 먼저 상의하십시오.</p>
${fs.existsSync(path.join(ROOT, 'data/iherb-guides.json')) ? `<p class="ihMore"><a href="./iherb-jikgu.html">직구 방법 (화면으로 보기)</a><a href="./iherb-best.html">추천템 베스트셀러 전체</a><a href="./iherb-probiotics.html">유산균 고르는 법</a><a href="./iherb-omega3.html">오메가3 고르는 법</a><a href="./iherb-magnesium.html">마그네슘 고르는 법</a><a href="./iherb-blackfriday.html">블프 ${bfYear}</a></p>` : ''}
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(IH_FAQ)}
</section>

<section>
<h2>프로틴은 마이프로틴, 영양제는 아이허브</h2>
<p class="lede">프로틴은 대란 때 마이프로틴이 가장 싸고, 영양제와 다른 브랜드 프로틴은 아이허브가 편합니다. 둘 다 이 사이트에서 챙기십시오.</p>
<a class="cta ghost" href="./">오늘 마이프로틴 할인율과 대란 여부</a>
<a class="cta ghost" href="./code.html">마이프로틴 할인코드</a>
${altMp ? '<a class="cta ghost" href="./alternatives.html">마이프로틴 vs 다른 브랜드 가성비 비교</a>' : ''}
</section>

${kakaoBox}
`,
  });
}

// ── 아이허브 키워드 페이지 (data/iherb-guides.json: 추천템·유산균·오메가3·마그네슘·블프. 네이버 자동완성 기준) ──
const IHG = IH && fs.existsSync(path.join(ROOT, 'data/iherb-guides.json')) ? readJson('data/iherb-guides.json') : null;
if (IHG) {
  const aff = 'target="_blank" rel="sponsored nofollow noopener"';
  const m = M(ihYm), y = Y(ihYm);
  const best = IHG.best || { groups: [] };
  const asof = [best.checked, IH.updated].filter(d => d && d <= ihToday).sort().pop() || ihToday;
  const top = IH_CODES.find(c => c.rate != null) || IH_CODES[0] || null;
  const codeLine = top ? ` 지금 쓸 수 있는 아이허브 코드는 <b>${esc(top.code)}</b>(${esc(top.label || `${top.rate}%`)})입니다.` : '';
  const copyAttr = top ? ` data-copy="${b64(top.code)}" data-label="${esc(top.code)}"` : '';
  const srch = kw => `${IH_HOME}search?kw=${encodeURIComponent(kw)}`;
  const goBtn = (ref, dest, label) => `<a class="cta hot" href="${esc(ihLink(ref, dest))}" ${aff}${copyAttr}>${top ? `${esc(top.code)} 복사하고 ` : ''}${esc(label)}</a>`;
  const stickyOf = ref => top ? `<a class="sticky" href="${esc(ihLink(ref))}" ${aff}${copyAttr}><b>${esc(top.code)}</b> 복사하고 아이허브 가기 →</a>` : '';
  const util = `<span>영양제 ${IH_SHIP.customsUsd}달러까지 면세 · 미국 발송도 같음</span>
  <span>건강기능식품 ${IH_SHIP.maxBottles}병까지</span>
  ${IH_SHIP.freeShipKrw > 0 ? `<span>${won(IH_SHIP.freeShipKrw)} 이상 무료배송</span>` : '<span>개인통관고유부호 필요</span>'}`;
  const codeList = IH_CODES.length ? `<ul class="codes">${IH_CODES.map(c => `<li><span class="name">${esc(c.code)}<em>${[c.who, c.label, c.until ? `${kdate(c.until)}까지` : ''].filter(Boolean).map(esc).join(' · ')}</em></span><span class="crate">${c.rate != null ? `${c.rate}%` : ''}</span><button type="button" data-copy="${b64(c.code)}" data-label="${esc(c.code)}">복사</button></li>`).join('')}</ul>` : '';
  const codeSection = codeList ? `<section class="full">
<h2>아이허브 할인코드 ${m}월</h2>
${codeList}
<p class="hint">코드는 한 주문에 하나만 들어가고 세일가 위에 겹칩니다. 입력 방법과 중복 규칙은 <a href="./iherb.html">아이허브 할인코드</a>에 정리했습니다.</p>
</section>` : '';
  const codeFaq = kw => [`${kw} 살 때 쓸 수 있는 할인코드가 있나요?`, IH_CODES.length
    ? `지금은 ${IH_CODES.map(c => `${c.code}(${c.label || `${c.rate}%`})`).join(', ')}가 있습니다. 코드는 한 주문에 하나만 들어가고, 이번 주 브랜드 세일가 위에 겹쳐 쓸 수 있습니다.`
    : `${m}월 코드는 아이허브 할인코드 페이지에 확인되는 대로 올립니다. 코드가 없어도 이번 주 브랜드 세일은 코드 없이 할인된 가격입니다.`];
  const notMedicine = '<p class="hint">건강기능식품은 질병을 예방하거나 치료하는 약이 아닙니다. 먹는 약이 있거나 임신 중이면 의사나 약사와 먼저 상의하십시오.</p>';
  const disclose = '<p class="hint">아이허브 링크는 제휴 링크입니다. 구매 금액은 같고 프로티파이에 수수료가 들어옵니다.</p>';
  const more = self => `<section>
<h2>아이허브 더 보기</h2>
<a class="cta ghost" href="./iherb.html">아이허브 할인코드 ${m}월</a>
${[...(IH_MONTH_CUR ? [[`iherb-${IH_MONTH_CUR}.html`, `아이허브 ${M(IH_MONTH_CUR)}월 할인코드 총정리`]] : []), ['iherb-jikgu.html', '아이허브 직구 방법'], ['iherb-best.html', '아이허브 추천템 (베스트셀러)'], ...IHG.guides.map(g => [g.file, `아이허브 ${g.cat} 추천`]), ['iherb-blackfriday.html', `아이허브 블프 ${bfYear}`]].filter(([f]) => f !== self).map(([f, t]) => `<a class="cta ghost" href="./${f}">${esc(t)}</a>`).join('\n')}
</section>`;

  // 유산균·오메가3·마그네슘 고르는 법
  for (const g of IHG.guides) {
    const ref = 'pt-' + g.file.replace('.html', '');
    // 비교표: 1회분 함량·1회분 가격·함량당 가격 (compare 가 있으면 베스트셀러 카드 대신 씁니다)
    const C = g.compare && (g.compare.items || []).length ? g.compare : null;
    const cmp = C ? C.items.map(p => {
      const amt = C.amt.reduce((s, k) => s + (p[k] || 0), 0), sv = p.count / p.perServing;
      return { ...p, amt, sv, one: p.price / sv, unit: amt ? p.price / (sv * amt) * C.per : null };
    }).filter(p => p.unit).sort((a, b) => a.unit - b.unit) : [];
    const cheap = cmp[0], altBest = C && C.alt ? cmp.find(p => p[C.alt.field] === C.alt.value) : null;
    const topSold = [...cmp].sort((a, b) => (b.reviews || 0) - (a.reviews || 0))[0];
    const amtTxt = p => `${C.amtLabel} ${p.amt.toLocaleString('ko-KR')}${C.amtUnit}`;
    const revK = n => n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}만` : n.toLocaleString('ko-KR');
    const chips = p => [
      p.perServing > 1 ? `1회 ${p.perServing}정` : '',
      g.cat === '오메가3' ? [p.form && p.form !== '표기 없음' ? p.form : '', /IFOS/.test(p.cert || '') ? 'IFOS' : ''] : [],
      g.cat === '마그네슘' ? [p.form, p.type] : [],
      g.cat === '유산균' ? [p.guarantee === '유통기한까지' ? '유통기한까지 보장' : p.guarantee === '제조 시' ? '제조 시 기준' : '', p.storage === '냉장' ? '냉장' : '', p.lgg ? 'LGG' : '', p.strains ? `${p.strains}종` : ''] : [],
    ].flat().filter(Boolean);
    const cmpLead = cheap ? `${C.perLabel} 가장 싼 건 <b>${esc(cheap.brand)} ${esc(cheap.short)}</b>(${won(cheap.unit)})입니다.${altBest && altBest !== cheap ? ` ${esc(C.alt.label)}에서 가장 싼 건 ${esc(altBest.brand)} ${esc(altBest.short)}(${won(altBest.unit)})입니다.` : ''}` : '';
    const cmpRow = (p, i) => `<tr class="${p === cheap ? 'best' : ''}${p === altBest && p !== cheap ? ' alt2' : ''}">
<td class="p"><a href="${esc(ihLink(`${ref}-c${i + 1}`, p.url))}" ${aff}><small class="br">${esc(p.brand)}${p === cheap ? '<i class="tag">가장 쌈</i>' : p === altBest ? `<i class="tag g">${esc(C.alt.value)} 최저</i>` : ''}</small>${esc(p.short)}</a><small class="sh">${[...chips(p), p.rating ? `★${p.rating} (${revK(p.reviews || 0)})` : ''].filter(Boolean).map(esc).join(' · ')}</small></td>
<td class="n">${p.amt.toLocaleString('ko-KR')}${C.amtUnit}</td>
<td class="n">${won(p.one)}<small class="sh">${won(p.price)}</small></td>
<td class="n hot">${won(p.unit)}</td></tr>`;
    const cmpHtml = cheap ? `<section class="full">
<h2>아이허브 ${esc(g.cat)} ${cmp.length}개 가격 비교</h2>
<p class="lede">${cmpLead} 리뷰가 가장 많은 건 ${esc(topSold.brand)} ${esc(topSold.short)}(리뷰 ${revK(topSold.reviews)}개)입니다.</p>
<div class="altWrap"><table class="alt">
<thead><tr><th>제품</th><th class="n">1회분<br><small>${esc(C.amtLabel)}</small></th><th class="n">1회분 가격<br><small>한 통</small></th><th class="n">${esc((C.head || [C.perLabel])[0])}${C.head ? `<br><small>${esc(C.head[1])}</small>` : ''}</th></tr></thead>
<tbody>${cmp.map(cmpRow).join('')}</tbody>
</table></div>
<p class="hint">${dot(C.checked)} 아이허브 한국 사이트의 1회 구매가(세일가 포함, 정기배송·코드 할인 전)와 라벨 1회 섭취량 기준입니다. 함량당 가격이 싸다고 더 좋은 제품은 아니니 위 형태·보관 표시를 같이 보십시오. 가격은 매주 세일에 따라 바뀝니다.</p>
</section>` : '';
    const RV = g.reviews || [];
    const rvCnt = t => RV.filter(r => r.sentiment === t).length;
    const rvHtml = RV.length ? `<section class="full">
<h2>아이허브 ${esc(g.cat)} 후기</h2>
<p class="lede">아이허브 한국어 리뷰, 디시, 네이버 블로그에서 ${RV.length}개를 골라 요약했습니다. 긍정 ${rvCnt('긍정')} · 중립 ${rvCnt('중립')} · 부정 ${rvCnt('부정')}. 협찬 글은 뺐습니다.</p>
<ul class="ihRv">${[...RV].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => `<li><span class="s ${r.sentiment === '긍정' ? 'pos' : r.sentiment === '부정' ? 'neg' : 'neu'}">${esc(r.sentiment)}</span><div><b>${esc(r.product)}</b> <span class="tp">${esc(r.topic || '')}</span><p>${esc(r.quote)}</p><small>${r.url ? (/iherb\.com/.test(r.url) ? `<a href="${esc(ihLink(`${ref}-review`, r.url))}" ${aff}>${esc(r.source)}</a>` : `<a href="${esc(r.url)}" target="_blank" rel="noopener nofollow">${esc(r.source)}</a>`) : esc(r.source)}${r.date ? ` · ${dot(r.date)}` : ''}</small></div></li>`).join('')}</ul>
<p class="hint">개인 후기라 효과는 사람마다 다릅니다.</p>
</section>` : '';
    const autoFaq = cheap ? [
      [`아이허브 ${g.cat} 가성비 제일 좋은 건 뭐예요?`, `${dot(C.checked)} 기준 ${C.perLabel} 가격으로는 ${cmp.slice(0, 3).map(p => `${p.brand} ${p.short}(${won(p.unit)})`).join(', ')} 순입니다.${altBest && altBest !== cheap ? ` ${C.alt.label}에서 가장 싼 건 ${altBest.brand} ${altBest.short}(${won(altBest.unit)})입니다.` : ''} 세일에 따라 순서가 바뀝니다.`],
      ...(g.cat === '오메가3' ? [['아이허브 오메가3 rTG는 어떤 게 있나요?', `조사한 ${cmp.length}개 중 라벨에 rTG라고 적힌 건 ${cmp.filter(p => p.form === 'rTG').map(p => `${p.brand} ${p.short}`).join(', ')}입니다. IFOS 인증 표기가 있는 건 ${cmp.filter(p => /IFOS/.test(p.cert || '')).map(p => `${p.brand} ${p.short}`).join(', ')}입니다.`]] : []),
      ...(g.cat === '마그네슘' ? [['킬레이트(글리시네이트) 마그네슘은 어떤 게 있나요?', `조사한 ${cmp.length}개 중 글리시네이트만 쓴 건 ${cmp.filter(p => p.form === '글리시네이트').map(p => `${p.brand} ${p.short}`).join(', ')}입니다. 캘리포니아 골드 뉴트리션과 스완슨 제품은 이름에 글리시네이트가 있지만 산화마그네슘이 섞여 있습니다.`]] : []),
      ...(g.cat === '유산균' ? [['아이허브 유산균 300억, 1000억 중 뭘 사요?', `같은 락토비프라도 100억 CFU당 가격은 ${cmp.filter(p => /락토비프/.test(p.short)).map(p => `${p.short.replace(/ \d+정$/, '')} ${won(p.unit)}`).join(', ')}입니다. 균 수가 많을수록 균 수당 가격은 싸지지만, 많다고 더 좋은 것은 아니니 처음이면 낮은 쪽부터 먹어 보십시오.`]] : []),
    ] : [];
    const faq = [...autoFaq, ...g.faq, codeFaq(g.kw)];
    const prodHtml = g.products.map((p, i) => `<li><b>${esc(p.name)}${p.tag ? ` <small>${esc(p.tag)}</small>` : ''}</b><ul class="tips">${p.points.map(t => `<li>${esc(t)}</li>`).join('')}</ul><a class="go" href="${esc(ihLink(`${ref}-${i + 1}`, srch(p.kw)))}" ${aff}>아이허브에서 보기 →</a></li>`).join('\n');
    const tableHtml = g.table ? `<section class="full">
<h2>${esc(g.cat)} 형태별 차이</h2>
<table><thead><tr>${g.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${g.table.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<td><b>${esc(c)}</b></td>`).join('')}</tr>`).join('')}</tbody></table>
</section>` : '';
    page({
      file: g.file, priority: 0.8, changefreq: 'weekly', current: g.file, lastmod: asof,
      title: g.title.replace('{y}', y),
      keywords: g.keywords,
      desc: `${cheap ? `아이허브 ${g.cat} ${cmp.length}개 ${C.perLabel} 가격 비교. ${cmpLead.replace(/<[^>]+>/g, '')} ` : g.answer.replace(/<[^>]+>/g, '') + ' '}후기 ${RV.length}개, 고르는 기준, ${m}월 아이허브 할인코드까지. ${dot(asof)} 확인.`,
      ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html'], [`아이허브 ${g.cat}`, g.file]]), faqLd(faq)],
      utilHtml: util,
      stickyHtml: stickyOf(`${ref}-sticky`),
      heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(C ? C.checked : asof)} 확인 · ${C ? `아이허브 ${g.cat} ${cmp.length}개 함량·가격 비교` : '아이허브 베스트셀러 기준'}</p>
<h1>${g.h1}</h1>
<p class="lede answer">${cheap ? `${cmp.length}개를 비교하면 ${cmpLead} ` : ''}${g.answer}${codeLine}</p>
${goBtn(`${ref}-hero`, srch(g.cat), `아이허브 ${g.cat} 보기`)}
${disclose}
</div>
</div>`,
      restHtml: `
${cmpHtml}
${cheap ? '' : `<section class="full">
<h2>아이허브 ${esc(g.cat)} 베스트셀러</h2>
<p class="lede">${dot(best.checked || asof)} 아이허브 베스트셀러에 오른 ${esc(g.cat)} 제품입니다. 가격은 매주 세일에 따라 바뀌어서 적지 않았습니다.</p>
<ul class="shops picks">
${prodHtml}
</ul>
</section>`}

${tableHtml}

<section>
<h2>아이허브 ${esc(g.cat)} 고르는 기준</h2>
<ol class="steps">${g.checks.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
${notMedicine}
</section>

${rvHtml}

${codeSection}

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(faq)}
</section>

${more(g.file)}
`,
    });
  }

  // 아이허브 추천템 = 베스트셀러 묶음
  if ((best.groups || []).length) {
    const ref = 'pt-iherb-best';
    const nItems = best.groups.reduce((s, g) => s + g.items.length, 0);
    const BEST_FAQ = [
      ['아이허브 추천템은 어떻게 골랐나요?', `${dot(best.checked)}에 아이허브 한국 사이트의 베스트셀러 목록을 보고 영양제, 운동 보충제, 뷰티, 식품으로 나눴습니다. 광고비를 받고 넣은 제품은 없습니다. 아이허브 링크는 제휴 링크라 구매하면 프로티파이에 수수료가 들어오고, 구매 금액은 같습니다.`],
      ['아이허브 처음 사는데 뭐부터 사면 되나요?', '많이 사는 건 마그네슘, 유산균, 오메가3, 비타민C입니다. 자체 브랜드인 캘리포니아 골드 뉴트리션(CGN)이 리뷰가 많고 무난하지만, 함량 대비 가장 싼 제품은 카테고리마다 다릅니다(오메가3·마그네슘·유산균 페이지에 비교표가 있습니다). 첫 주문이면 아이허브 화면에 뜨는 신규 고객 할인부터 확인하십시오.'],
      ['아이허브 무료배송 기준은 얼마인가요?', IH_SHIP.freeShipKrw > 0 ? `${dot(asof)} 기준 ${won(IH_SHIP.freeShipKrw)} 이상 주문하면 무료배송입니다. 장바구니에 무료배송까지 남은 금액이 표시됩니다.` : '기준이 자주 바뀌어서 장바구니에 표시되는 금액으로 확인하십시오.'],
      ['아이허브에서 한 번에 많이 사도 되나요?', `건강기능식품은 한 번에 ${IH_SHIP.maxBottles}병까지 개인 사용으로 통관되고, ${IH_SHIP.customsUsd}달러(미국 발송도 같음)를 넘으면 관세와 부가세가 붙습니다. 넘을 것 같으면 날을 달리해 주문을 나누십시오.`],
      [`아이허브 ${m}월 할인은 어떻게 받나요?`, `이번 주 브랜드 세일을 먼저 보고, 그 위에 할인코드 하나를 넣으면 됩니다.${IH_CODES.length ? ` 지금 쓸 수 있는 코드는 ${IH_CODES.map(c => c.code).join(', ')}입니다.` : ''}${m === 11 ? ` 11월 말에는 블랙프라이데이(${kdate(bfDate)})가 있어서 큰 주문은 그때로 미루는 사람도 많습니다.` : ''}`],
      ['프로틴도 아이허브에서 사나요?', `프로틴 대용량은 대부분 마이프로틴이 쌉니다. 특히 대란(할인코드 ${TH}% 이상) 때는 차이가 큽니다. 아이허브에서는 크레아틴과 소용량, 마이프로틴에 없는 브랜드를 사는 사람이 많습니다.`],
    ];
    const groupHtml = best.groups.map((g, gi) => `<section class="full">
<h2>아이허브 추천템: ${esc(g.name)}</h2>
<ul class="shops picks">
${g.items.map((it, i) => `<li><b>${esc(it.name)}</b><span>${esc(it.note || '')}</span><a class="go" href="${esc(ihLink(`${ref}-${gi + 1}-${i + 1}`, srch(it.kw)))}" ${aff}>아이허브에서 보기 →</a>${it.guide ? ` <a class="go" href="./${esc(it.guide)}">${it.guide === 'alternatives.html' ? '프로틴 가격 비교 →' : '고르는 법 →'}</a>` : ''}</li>`).join('\n')}
</ul>
</section>`).join('\n\n');
    page({
      file: 'iherb-best.html', priority: 0.8, changefreq: 'weekly', current: 'iherb-best.html', lastmod: asof,
      title: `아이허브 추천템 ${m}월 (${y}) | 베스트셀러로 본 영양제·운동·뷰티·식품`,
      keywords: ['아이허브 추천템', '아이허브 추천', '아이허브 베스트셀러', '아이허브 영양제 추천', '아이허브 인기상품', `아이허브 ${m}월`, '아이허브 크레아틴'],
      desc: `아이허브 추천템 ${m}월 정리. ${dot(best.checked)} 아이허브 베스트셀러 ${nItems}개를 영양제·운동 보충제·뷰티·식품으로 나눴습니다. 마그네슘·유산균·오메가3 고르는 법과 무료배송·관세 기준, ${m}월 할인코드까지.`,
      ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html'], ['아이허브 추천템', 'iherb-best.html']]), faqLd(BEST_FAQ)],
      utilHtml: util,
      stickyHtml: stickyOf(`${ref}-sticky`),
      heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(best.checked)} 아이허브 베스트셀러 확인</p>
<h1>아이허브 추천템 ${m}월<br>실제로 많이 팔리는 것</h1>
<p class="lede answer">아이허브 추천템은 <b>실제로 많이 팔리는 순서</b>로 보는 게 가장 정확합니다. 베스트셀러 ${nItems}개를 영양제, 운동 보충제, 뷰티, 식품으로 나눴습니다. 영양제는 <b>유산균·마그네슘·오메가3</b>가 위에 몰려 있고, 자체 브랜드 캘리포니아 골드 뉴트리션이 많습니다.${codeLine}</p>
${goBtn(`${ref}-hero`, `${IH_HOME}catalog/topsellers`, '아이허브 베스트셀러 보기')}
${disclose}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>정리한 제품</dt><dd>${nItems}개</dd></div>
  <div><dt>무료배송</dt><dd>${IH_SHIP.freeShipKrw > 0 ? won(IH_SHIP.freeShipKrw) : '장바구니 확인'}<small>${IH_SHIP.freeShipKrw > 0 ? '이상 주문 시' : ''}</small></dd></div>
  <div><dt>건강기능식품</dt><dd>${IH_SHIP.maxBottles}병까지</dd></div>
</dl>
</div>
</div>`,
      restHtml: `
${groupHtml}

${codeSection}

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(BEST_FAQ)}
</section>
${notMedicine.replace('<p class="hint">', '<section><p class="hint">').replace('</p>', '</p></section>')}

${more('iherb-best.html')}
`,
    });
  }

  // 아이허브 블프 (블랙프라이데이·사이버먼데이)
  {
    const ref = 'pt-iherb-bf';
    const BF = IHG.blackfriday || {};
    const bfCodes = (BF.codes || []).filter(c => c.code && (!c.until || c.until >= ihToday));
    const dayN = d => Math.round((Date.parse(d) - Date.parse(ihToday)) / 864e5);
    const wk = d => '일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()];
    const left = dayN(bfDate);
    const phase = left > 0 ? `블랙프라이데이까지 ${left}일 남았습니다.` : dayN(cmDate) >= 0 ? '지금 블랙프라이데이 주간입니다.' : `${bfYear}년 블랙프라이데이는 끝났습니다.`;
    const bfBox = bfCodes.length
      ? `<ul class="codes">${bfCodes.map(c => `<li><span class="name">${esc(c.code)}<em>${[c.label, c.until ? `${kdate(c.until)}까지` : ''].filter(Boolean).map(esc).join(' · ')}</em></span><span class="crate">${c.rate != null ? `${c.rate}%` : ''}</span><button type="button" data-copy="${b64(c.code)}" data-label="${esc(c.code)}">복사</button></li>`).join('')}</ul>`
      : `<p class="lede">블프 코드는 아직 안 나왔습니다. 아이허브는 보통 시작 직전에 공개하고, 나오면 여기에 바로 올립니다.${IH_CODES.length ? ' 그 전까지는 아래 지금 코드를 쓰면 됩니다.' : ''}</p>${codeList}`;
    const BF_FAQ = [
      [`아이허브 블프 ${bfYear}는 언제인가요?`, `블랙프라이데이는 ${kdate(bfDate)}(${wk(bfDate)}), 사이버먼데이는 ${kdate(cmDate)}(${wk(cmDate)})입니다. 아이허브 행사는 이 주에 열리고 앞뒤로 며칠 늘어나기도 합니다. 정확한 시작일과 코드는 아이허브가 직전에 공개합니다.`],
      ['아이허브 블프 할인율은 얼마나 되나요?', BF.rateSummary ? `${BF.rateSummary}. 지난 4년 모두 블프 주간 최대 할인은 25% 안팎이었습니다.${bfCodes.length ? ` 올해는 블프 전에 ${bfCodes.map(c => `${c.code}(${c.label}${c.until ? `, ${kdate(c.until)}까지` : ''})`).join(', ')}가 먼저 나왔습니다.` : ''}` : `해마다 다릅니다. ${(BF.history || []).map(h => `${h.year}년에는 ${h.short || h.text}`).join(', ')}.`],
      ...(BF.periodSummary ? [['아이허브 블프 기간은 보통 언제부터 언제까지예요?', `${BF.periodSummary}. 올해 본 행사 일정은 ${BF.thisYear && /공지 없음/.test(BF.thisYear.text || '') ? `${dot(BF.checked || asof)} 기준 아직 공지되지 않았고, ` : ''}공지되면 이 페이지에 바로 올립니다.`]] : []),
      ['블프 코드와 다른 할인코드 같이 쓸 수 있나요?', '할인코드는 한 주문에 하나만 들어갑니다. 블프 코드와 다른 코드 중 큰 쪽을 쓰고, 세일가와 리워드 적립금은 겹쳐 쓸 수 있습니다.'],
      ['블프 때 많이 사도 관세 안 붙나요?', `영양제는 미국 발송이어도 한 번에 ${IH_SHIP.customsUsd}달러를 넘으면 관세와 부가세가 붙고, 건강기능식품은 ${IH_SHIP.maxBottles}병까지만 개인 사용으로 통관됩니다. 같은 날 산 걸 여러 상자로 나눠 받으면 합쳐서 과세되니, 나눌 때는 주문 날짜를 달리하십시오.`],
      ['블프 때 주문하면 배송이 늦나요?', `평소엔 ${IH_SHIP.deliveryDays} 걸리지만 블랙프라이데이 뒤에는 주문과 통관이 몰려서 더 걸립니다. 급한 건 블프 전에 따로 사십시오.`],
      [`아이허브 ${m}월 할인코드는 뭔가요?`, IH_CODES.length ? `지금은 ${IH_CODES.map(c => `${c.code}(${c.label || `${c.rate}%`})`).join(', ')}가 있습니다. 블프 코드가 나오면 둘 중 큰 쪽을 쓰면 됩니다.` : `${m}월 코드는 아이허브 할인코드 페이지에 확인되는 대로 올립니다.`],
    ];
    page({
      file: 'iherb-blackfriday.html', priority: 0.8, changefreq: 'daily', current: 'iherb-blackfriday.html', lastmod: asof,
      title: `아이허브 블프 ${bfYear} | 날짜·할인율·기간 (지난 4년 기록) · 얼리 블프 코드`,
      keywords: ['아이허브 블프', '아이허브 블랙프라이데이', `아이허브 블프 ${bfYear}`, '아이허브 블프 할인율', '아이허브 블프 기간', '아이허브 얼리블프', '아이허브 11월', '아이허브 11월 할인', '아이허브 사이버먼데이', '아이허브 블프 코드'],
      desc: `아이허브 블프 ${bfYear} 정리. 블랙프라이데이 ${kdate(bfDate)}, 사이버먼데이 ${kdate(cmDate)}. ${phase} 지난 블프 할인, 관세·6병 기준, 미리 장바구니에 담을 것, 지금 쓸 수 있는 ${m}월 코드까지.`,
      ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html'], ['아이허브 블프', 'iherb-blackfriday.html']]), faqLd(BF_FAQ)],
      utilHtml: util,
      stickyHtml: stickyOf(`${ref}-sticky`),
      heroHtml: `
<div class="hero">
<div class="heroMain">
<span class="state ${left <= 0 && dayN(cmDate) >= 0 ? 'on' : 'off'}">${phase}</span>
<h1>아이허브 블프 ${bfYear}<br>${kdate(bfDate)}(${wk(bfDate)}) ~ ${kdate(cmDate)}(${wk(cmDate)})</h1>
<p class="lede answer">${bfYear}년 블랙프라이데이는 <b>${kdate(bfDate)}</b>, 사이버먼데이는 <b>${kdate(cmDate)}</b>입니다. 아이허브는 지난 4년 모두 이 주에 <b>전 품목 25% 안팎</b> 할인을 했습니다.${bfCodes.length ? ` 올해는 그 전에 <b>${esc(bfCodes[0].code)}</b>(${esc(bfCodes[0].label)}${bfCodes[0].until ? `, ${kdate(bfCodes[0].until)}까지` : ''})가 먼저 나왔습니다.` : ' 코드는 시작 직전에 나옵니다.'} 장바구니를 미리 채워 두면 됩니다.</p>
${goBtn(`${ref}-hero`, IH_HOME, '아이허브 장바구니 채우기')}
${disclose}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>블랙프라이데이</dt><dd>${kdate(bfDate)}<small>${left > 0 ? `D-${left}` : ''}</small></dd></div>
  <div><dt>사이버먼데이</dt><dd>${kdate(cmDate)}</dd></div>
  <div><dt>블프 코드</dt><dd>${bfCodes.length ? `${bfCodes.length}개` : '나오면 올림'}</dd></div>
</dl>
</div>
</div>`,
      restHtml: `
<section class="full">
<h2>아이허브 블프 코드</h2>
${bfBox}
</section>

<section>
<h2>블프 전에 해 둘 것</h2>
<ol class="steps">
  <li><b>장바구니에 미리 담기</b> 블프 첫날 인기 제품은 품절이 잘 납니다. 살 것을 미리 담아 두고 코드가 뜨면 바로 결제하십시오.</li>
  <li><b>계정과 개인통관고유부호 확인</b> 주소와 통관부호가 틀리면 통관에서 멈춥니다. 첫 주문이면 미리 가입해 두십시오.</li>
  <li><b>${IH_SHIP.maxBottles}병, ${IH_SHIP.customsUsd}달러 나누기</b> 건강기능식품은 한 번에 ${IH_SHIP.maxBottles}병까지, ${IH_SHIP.customsUsd}달러(미국 발송도 같음)를 넘으면 관세가 붙습니다. 날을 달리해 주문할 수 있게 장바구니를 나눠 두십시오.</li>
  <li><b>오래 먹을 것을 큰 통으로</b> 마그네슘, 비타민C처럼 매일 먹는 영양제는 블프 때 큰 통으로 사 두면 이득입니다. 유산균과 오메가3는 유통기한과 산패 때문에 너무 많이 사지 마십시오.</li>
  <li><b>배송은 늦는다고 생각하기</b> 블프 뒤에는 통관이 몰려서 평소보다 오래 걸립니다.</li>
</ol>
</section>

<section class="full">
<h2>지난 아이허브 블프</h2>
<div class="altWrap"><table class="alt"><thead><tr><th>연도</th><th>기간</th><th>할인</th></tr></thead><tbody>${(BF.history || []).map(h => `<tr><td class="n"><b>${h.year}</b></td><td class="nw">${h.start ? `${kdate(h.start)}${h.end ? ` ~ ${kdate(h.end)}` : '부터'}` : '-'}</td><td>${esc(h.short || h.text)}${h.url ? ` <a href="${esc(h.url)}" target="_blank" rel="noopener nofollow">출처</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
<p class="hint">아이허브 보도자료, 기사, 블로그 기준입니다. 날짜는 미국 기준인 해가 있어 한국 시간과 하루쯤 다를 수 있습니다.</p>
</section>

<section class="full">
<h2>블프 때 많이 사는 것</h2>
<p class="lede">아이허브 베스트셀러 기준으로 정리했습니다. <a href="./iherb-best.html">아이허브 추천템 전체 보기</a></p>
<ul class="shops picks">
${IHG.guides.map(g => `<li><b>${esc(g.cat)}</b><span>${esc(g.checks[0])}</span><a class="go" href="./${g.file}">아이허브 ${esc(g.cat)} 고르는 법 →</a></li>`).join('\n')}
</ul>
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(BF_FAQ)}
</section>

${bfSeason ? `<section>
<h2>마이프로틴 블프도 같이</h2>
<p class="lede">프로틴은 블프 때 마이프로틴이 가장 쌉니다. 마이프로틴 블랙프라이데이 할인율과 일정은 따로 정리했습니다.</p>
<a class="cta ghost" href="./blackfriday.html">마이프로틴 블랙프라이데이</a>
</section>` : ''}

${more('iherb-blackfriday.html')}
`,
    });
  }

  // 아이허브 직구 방법 (키워드: 아이허브 직구, 직구 방법·하는법·갯수·금액·관세·배송기간)
  {
    const ref = 'pt-iherb-jikgu';
    const IJ_CHECKED = '2026-11-09';
    const LIMIT_KRW = 204538;
    const ship = IH_SHIP.freeShipKrw > 0 ? won(IH_SHIP.freeShipKrw) : '4만원';
    const IJ_SRC = [
      ['https://kr.iherb.com/shipping', '아이허브 대한민국 배송 정보', '개인통관고유부호, 배송업체별 한도, 수입 제한 품목, 결제 수단'],
      ['https://kr.iherb.com/info/sales-and-offers', '아이허브 할인·특가·프로모션', '지금 쓸 수 있는 코드'],
      ['https://kr.iherb.com/info/promo-rules-and-exclusions', '아이허브 프로모션 규정', '주문당 코드 1개, 제외 브랜드'],
      ['https://kr.iherb.com/info/returns', '아이허브 반품 및 환불', '30일 반품, 환불 기간'],
      ['https://kr.iherb.com/info/subscribe-save', '아이허브 정기배송', '정기배송 할인'],
      ['https://kr.iherb.com/help/contact', '아이허브 고객 센터', '출고 시간, 배송 기간, 주문 취소'],
    ];
    const IJ_FAQ = [
      ['아이허브 직구 방법이 어렵나요?', `어렵지 않습니다. 한국어 화면에서 원화로 주문하고 카카오페이나 국내 카드로 결제합니다. 다른 점은 개인통관고유부호를 넣어야 하고, 한 번에 ${won(LIMIT_KRW)}(150달러)와 영양제 6개를 넘기면 주문이 막힌다는 것입니다.`],
      ['아이허브 직구는 몇 개까지 되나요?', '영양제(보충제)는 한 주문에 6개까지입니다. 7개째를 담으면 장바구니에 "수량 한도 6개를 초과했습니다"라는 경고가 뜨고 주문하기 버튼이 막힙니다. 세관이 6개를 넘는 주문에 처방전을 요구할 수 있다는 안내도 있습니다.'],
      ['아이허브 직구 금액 한도는 얼마인가요?', `한국 배송은 한 주문 150달러가 한도라, ${dot(IJ_CHECKED)} 장바구니에서는 합계가 ${won(LIMIT_KRW)}를 넘자 "KR 관세 규정에 따라 주문당 총 주문이 ${won(LIMIT_KRW)}를 초과할 수 없습니다"라며 주문이 막혔습니다. 원화 한도는 환율에 따라 바뀝니다.`],
      ['아이허브 직구 관세는 언제 붙나요?', '같은 판매처에서 같은 날 산 금액이 150달러를 넘으면 관세와 부가세가 붙을 수 있습니다. 아이허브는 한 주문을 150달러 아래로 막아 두니, 더 살 때는 날을 달리해 주문하십시오. 유청 단백질과 꿀은 하루 5kg을 넘으면 관세가 붙을 수 있다는 안내도 있습니다.'],
      ['아이허브 배송 기간은 얼마나 걸리나요?', '아이허브 고객센터 안내로는 대부분 주문 후 1시간 안에 출고되고, 출고 뒤 한국까지 3~5영업일 걸립니다. 장바구니에 예상 도착일이 표시됩니다.'],
      ['아이허브 배송비는 얼마인가요?', `${ship} 이상이면 무료배송이고, 그보다 적으면 기본 배송료 6,000원이 붙습니다(${dot(IJ_CHECKED)} 장바구니 기준). 정기배송 주문은 3만원 이상이면 무료입니다.`],
      ['카카오페이나 네이버페이로 결제되나요?', '됩니다. 한국 설정 기준으로 카카오페이, 네이버페이, PAYCO, 국내 카드(KCP), 해외 카드, 실시간 계좌이체를 쓸 수 있습니다. 토스는 목록에 없습니다.'],
      ['개인통관고유부호는 꼭 넣어야 하나요?', '필수입니다. 2026년 2월 2일부터는 고유부호에 등록된 이름·전화번호·우편번호와 주문서의 받는 사람 정보가 모두 같아야 하고, 다르면 통관이 막힐 수 있습니다.'],
      ['아이허브 주문 취소는 언제까지 되나요?', '출고 전에만 됩니다. 대부분 1시간 안에 출고돼서, 주문 직후 내 계정의 주문 페이지에서 바로 취소해야 합니다. 주문 뒤에는 주소, 수량, 결제수단을 바꿀 수 없습니다.'],
      ['아이허브 반품은 어떻게 하나요?', '받은 날부터 30일 안에(아이허브 자체 브랜드는 90일) 내 계정의 주문 페이지에서 신청합니다. 해외 반품은 배송비를 직접 내고, 환불은 보통 7~10영업일 걸립니다. 받지 못한 상품은 예상 배송일 24~48시간 뒤에 고객센터에 문의하십시오.'],
      ['리워드 코드와 할인코드를 같이 쓸 수 있나요?', '아닙니다. 리워드 코드도 할인코드 칸에 넣고, 둘을 같이 넣으면 할인이 큰 쪽만 적용됩니다.'],
    ];
    const step = (t, d, s = '') => `<li><b>${t}</b> ${d}${s}</li>`;
    page({
      file: 'iherb-jikgu.html', priority: 0.8, changefreq: 'monthly', current: 'iherb-jikgu.html', lastmod: IJ_CHECKED,
      title: `아이허브 직구 방법 ${y} | 주문 한도 150달러·6개·통관부호·배송기간 (화면으로 보기)`,
      keywords: ['아이허브 직구', '아이허브 직구 방법', '아이허브 직구 하는법', '아이허브 직구 갯수', '아이허브 직구 금액', '아이허브 직구 한도', '아이허브 직구 관세', '아이허브 직구 배송기간', '아이허브 주문 방법', '아이허브 개인통관고유부호', '아이허브 결제 방법', '아이허브 카카오페이'],
      desc: `아이허브 직구 방법을 실제 화면으로 정리했습니다. ${ship} 이상 무료배송(미만 6,000원), 한 주문 ${won(LIMIT_KRW)}(150달러)·영양제 6개를 넘기면 주문이 막히고, 개인통관고유부호는 필수, 출고 후 3~5영업일. 결제 수단과 반품까지. ${dot(IJ_CHECKED)} 확인.`,
      ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html'], ['아이허브 직구 방법', 'iherb-jikgu.html']]), faqLd(IJ_FAQ),
        { '@type': 'HowTo', name: '아이허브 직구 방법', step: ['사이트 설정', '가입·로그인', '장바구니 담기', '할인코드 넣기', '한도 확인', '통관부호와 결제', '배송과 반품'].map((n, i) => ({ '@type': 'HowToStep', position: i + 1, name: n })) }],
      utilHtml: util,
      stickyHtml: stickyOf(`${ref}-sticky`),
      heroHtml: `
<div class="hero">
<div class="heroMain">
<p class="updated">${dot(IJ_CHECKED)} 아이허브 화면과 공식 안내로 확인</p>
<h1>아이허브 직구 방법<br>주문부터 통관까지 7단계</h1>
<p class="lede answer">아이허브는 한국어·원화로 주문하는 미국 직구입니다. <b>${ship} 이상 무료배송</b>(미만 6,000원), <b>한 주문 ${won(LIMIT_KRW)}(150달러)와 영양제 6개를 넘기면 주문이 막히고</b>, <b>개인통관고유부호는 필수</b>입니다. 대부분 1시간 안에 출고돼 3~5영업일이면 옵니다.${codeLine}</p>
${goBtn(`${ref}-hero`, IH_HOME, '아이허브 가기')}
${disclose}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>무료배송</dt><dd>${ship}<small>미만 6,000원</small></dd></div>
  <div><dt>주문 한도</dt><dd>${won(LIMIT_KRW)}<small>150달러 · 넘으면 주문 막힘</small></dd></div>
  <div><dt>영양제</dt><dd>6개까지<small>7개부터 주문 막힘</small></dd></div>
</dl>
</div>
</div>`,
      restHtml: `
<section class="full">
<h2>아이허브 직구 순서</h2>
<ol class="steps">
  ${step('사이트 설정', '오른쪽 위 국가·언어·통화를 눌러 대한민국, 한국어, KRW로 맞춥니다.', shot('ih-site-settings.webp', '아이허브 사이트 환경 설정 창', '사이트 환경 설정 창. 아래쪽에 고를 수 있는 결제 수단이 보입니다.', 'tall'))}
  ${step('가입·로그인', '이메일이나 휴대폰 번호, 카카오·구글·페이스북·Apple 계정으로 가입합니다.', shot('ih-login.webp', '아이허브 로그인·회원 가입 화면', '로그인/회원 가입 화면. 카카오 계정으로도 됩니다.', 'tall'))}
  ${step('장바구니 담기', `${ship} 미만이면 배송비 6,000원이 붙고, 장바구니에 무료배송까지 남은 금액이 표시됩니다.`)}
  ${step('할인코드 넣기', `오른쪽 위 '할인코드' 칸에 코드를 넣고 적용하기를 누릅니다. 주문당 코드 1개이고, 리워드 코드도 같은 칸에 넣습니다.${top ? ` 지금은 ${esc(top.code)}(${esc(top.label || `${top.rate}%`)})가 있습니다.` : ''}`, shot('ih-cart-code.webp', '아이허브 장바구니에 할인코드를 적용한 화면', `${dot(IJ_CHECKED)} SING2611 적용: 오메가 800 30정 14,281원 → 11,140원, 4만원 미만이라 배송비 6,000원.`))}
  ${step('한도 확인', `합계가 ${won(LIMIT_KRW)}(150달러)를 넘거나 영양제가 7개가 되면 주문하기 버튼이 막힙니다. 넘으면 날을 달리해 나눠 주문하십시오.`, shot('ih-cart-150usd.webp', '아이허브 150달러 초과 경고', `"KR 관세 규정에 따라, 주문당 총 주문이 ${won(LIMIT_KRW)}을 초과할 수 없습니다."`) + shot('ih-cart-6bottles.webp', '아이허브 6개 초과 경고', '"장바구니에 있는 제품이 수량 한도 6개를 초과했습니다."'))}
  ${step('통관부호와 결제', '주문서에 개인통관고유부호를 넣습니다. 이름·전화번호·우편번호가 부호에 등록된 것과 같아야 합니다. 결제는 카카오페이, 네이버페이, PAYCO, 국내·해외 카드, 실시간 계좌이체로 합니다.', shot('ih-shipping-payment.webp', '아이허브 예상 배송일과 결제 수단', '장바구니의 예상 배송일(글로벌 에어 택배)과 결제 수단 목록.'))}
  ${step('배송과 반품', '대부분 1시간 안에 출고되고 3~5영업일이면 옵니다. 취소는 출고 전에만 됩니다. 반품은 받은 날부터 30일 안에 내 계정의 주문 페이지에서 신청합니다.')}
</ol>
${notMedicine}
</section>

<section class="full">
<h2>관세와 통관, 이것만 보면 됩니다</h2>
<div class="altWrap"><table class="alt"><thead><tr><th>기준</th><th>내용</th></tr></thead><tbody>
<tr><td class="nw"><b>주문 한도</b></td><td>한 주문 150달러(${dot(IJ_CHECKED)} 장바구니 기준 ${won(LIMIT_KRW)}). 넘으면 아이허브가 주문을 막습니다.</td></tr>
<tr><td class="nw"><b>관세</b></td><td>같은 판매처에서 같은 날 산 금액이 150달러를 넘으면 관세와 부가세가 붙을 수 있습니다. 영양제는 미국 발송이어도 150달러입니다.</td></tr>
<tr><td class="nw"><b>영양제 6개</b></td><td>보충제는 한 주문 6개까지. 7개부터 주문이 막힙니다.</td></tr>
<tr><td class="nw"><b>무게</b></td><td>배송업체마다 한 상자 최대 9kg. 유청 단백질·꿀은 하루 5kg을 넘으면 관세가 붙을 수 있습니다.</td></tr>
<tr><td class="nw"><b>통관부호</b></td><td>필수. 2026년 2월 2일부터 이름·전화번호·우편번호까지 일치해야 합니다.</td></tr>
<tr><td class="nw"><b>못 사는 것</b></td><td>멜라토닌, NAC, DHEA, 5-HTP, 우피 콜라겐 등은 한국으로 보낼 수 없습니다.</td></tr>
</tbody></table></div>
${shot('ih-pcc-carriers.webp', '아이허브 대한민국 배송 정보의 개인통관고유부호 안내와 배송업체 표', '아이허브 대한민국 배송 정보: 개인통관고유부호 안내와 배송업체별 한도(최대 9kg, 150달러).')}
</section>

${codeSection}

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(IJ_FAQ)}
</section>

<section class="full">
<h2>확인한 곳</h2>
<ul class="steps">${IJ_SRC.map(([u, t, d]) => `<li><a href="${u}" target="_blank" rel="noopener nofollow">${t}</a> ${d}</li>`).join('')}</ul>
<p class="hint">${dot(IJ_CHECKED)}에 아이허브 화면과 안내 페이지로 확인했습니다. 화면 캡처도 같은 날 찍었습니다. 아이허브 정책이 바뀌면 다를 수 있습니다.</p>
</section>

<section>
<h2>관련 페이지</h2>
<a class="cta ghost" href="./jikgu.html">마이프로틴 직구 방법</a>
</section>

${more('iherb-jikgu.html')}
`,
    });
  }

  // 아이허브 월별 할인코드 정리 (iherb-YYYY-MM.html). data/iherb.json 의 months
  for (const [ym, MO] of Object.entries(IH.months || {})) {
    const file = `iherb-${ym}.html`, mm = M(ym), yy = Y(ym), ref = `pt-iherb-${ym.replace('-', '')}`;
    const isCur = ym === ihToday.slice(0, 7);
    const live = c => !c.until || c.until >= ihToday;
    const codes = (MO.codes || []).map(c => ({ ...c, on: live(c) }));
    const onCodes = codes.filter(c => c.on);
    const best = [...onCodes].filter(c => c.who === '전체' && c.min == null).sort((a, b) => (b.rate || 0) - (a.rate || 0))[0] || null;
    const newbie = onCodes.find(c => c.who === '신규');
    const gold = onCodes.find(c => c.min);
    const app = onCodes.find(c => /앱/.test(c.who || ''));
    const endTxt = c => c.until ? `${kdate(c.until)}${c.untilTime ? ` ${c.untilTime}` : ''}까지` : '종료일 표기 없음';
    const checked = MO.checked || IH.updated;
    const inMonth = d => d && d.slice(0, 7) === ym;
    const copyBest = best ? ` data-copy="${b64(best.code)}" data-label="${esc(best.code)}"` : '';
    const go = (spot, label) => `<a class="cta hot" href="${esc(ihLink(`${ref}-${spot}`))}" ${aff}${copyBest}>${best ? `${esc(best.code)} 복사하고 ` : ''}${esc(label)}</a>`;
    const row = c => `<li${c.on ? '' : ' class="off"'}><span class="name">${esc(c.code)}<em>${[c.label.includes(c.who) ? '' : c.who, c.label, c.min && !/이상/.test(c.label) ? `${won(c.min)} 이상` : '', c.on ? endTxt(c) : '종료'].filter(Boolean).map(esc).join(' · ')}</em></span><span class="crate">${c.rate != null ? `${c.rate}%` : ''}</span>${c.on ? `<button type="button" data-copy="${b64(c.code)}" data-label="${esc(c.code)}">복사</button>` : '<span class="muted">종료</span>'}</li>`;
    // 장바구니 10만원 기준 코드별 결제 금액 (세일가 기준, 코드 하나만)
    const cart = 100000;
    const calcRows = onCodes.filter(c => c.rate != null).sort((a, b) => b.rate - a.rate).map(c => {
      const ok = !c.min || cart >= c.min;
      const off = ok ? Math.min(cart * c.rate / 100, c.code === 'GOLDKR' ? 100 * 1400 : Infinity) : 0;
      return `<tr${c === best ? ' class="hot"' : ''}><td><b>${esc(c.code)}</b><br><small>${esc(c.who)}</small></td><td class="n">${c.rate}%</td><td class="n">${ok ? `-${won(off)}` : '조건 미달'}</td><td class="n${c === best ? ' hot' : ''}">${ok ? won(cart - off) : '-'}</td></tr>`;
    }).join('');
    // 그달 일정: 코드 시작·종료, 코드 없는 행사 종료, 블프·사이버먼데이
    const tl = [];
    for (const c of codes) {
      if (inMonth(c.from)) tl.push([c.from, `${c.code} ${c.rate}% 시작`, c.label]);
      if (inMonth(c.until)) tl.push([c.until, `${c.code} 끝 (${c.untilTime || '종일'})`, c.label]);
    }
    for (const o of MO.offers || []) if (inMonth(o.until)) tl.push([o.until, `${o.label} 끝 (${o.untilTime || '종일'})`, '코드 없이 자동']);
    if (inMonth(bfDate)) tl.push([bfDate, '블랙프라이데이', '지난 4년 모두 이 주에 전 품목 25% 안팎']);
    if (inMonth(cmDate)) tl.push([cmDate, '사이버먼데이', '블프 행사 마지막 날로 이어지는 경우가 많음']);
    tl.sort((a, b) => a[0].localeCompare(b[0]));
    const wkd = d => '일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()];
    const tlRows = tl.map(([d, t, s]) => `<tr${d < ihToday ? ' class="muted"' : d === ihToday ? ' class="hot"' : ''}><td>${kdate(d)}(${wkd(d)})</td><td><b>${esc(t)}</b><br><small>${esc(s)}</small></td></tr>`).join('');
    const shots = (MO.shots || []).filter(f => SHOT_SIZES[f]);
    const shotCaps = { 'ih-nov-offers.webp': '아이허브 공식 특가 페이지의 행사 카드. 코드와 한국 시각 종료일이 같이 적혀 있습니다.', 'ih-nov-tips.webp': '같은 페이지 아래 알뜰 쇼핑 팁. GOLDKR, 정기배송 10%, 신규 KRNEW20 안내.' };
    const answer = best
      ? `${dot(checked)} 아이허브 공식 특가 페이지 기준, ${mm}월 가장 큰 코드는 <b>${esc(best.code)} ${esc(best.label)}</b>입니다. ${best.until ? `<b>${endTxt(best)}</b>(한국 시각)이니 그 전에 쓰십시오.` : ''}${newbie ? ` 처음 사는 사람은 ${esc(newbie.code)}(${newbie.rate}%)도 있지만 ${best.rate > newbie.rate ? `지금은 ${esc(best.code)} 쪽이 더 큽니다.` : '이쪽이 더 큽니다.'}` : ''}${gold ? ` ${esc(best.code)} 행사가 끝나면 ${won(gold.min)} 이상 ${esc(gold.code)} ${gold.rate}%가 남습니다.` : ''}`
      : `${dot(checked)} 확인 기준 ${mm}월에 쓸 수 있는 전체 코드는 ${onCodes.map(c => `${c.code}(${c.rate}%)`).join(', ') || '없습니다'}.`;
    const FAQ = [
      [`아이허브 ${mm}월 할인코드는 뭔가요?`, `${dot(checked)} 공식 특가 페이지에 있는 코드는 ${codes.map(c => `${c.code}(${c.label}${c.on ? '' : ', 종료'})`).join(', ')}입니다. 코드 없이 되는 행사로는 ${(MO.offers || []).map(o => o.label).join(', ')}이 있습니다.`],
      ...(best ? [[`${best.code} 코드는 언제까지 쓸 수 있나요?`, `${best.until ? `한국 시각 ${kdate(best.until)} ${best.untilTime || ''}까지입니다.` : '공식 페이지에 종료일이 없습니다.'}${best.from ? ` ${kdate(best.from)}부터 열렸습니다.` : ''} 일부 제품은 빠지니 장바구니에서 할인 금액을 꼭 확인하십시오.`]] : []),
      ['할인코드 여러 개 같이 쓸 수 있나요?', '안 됩니다. 아이허브는 한 주문에 할인코드 하나만 들어가고, 두 번째 코드를 넣으면 앞 코드가 바뀝니다. 대신 상품 자체 세일가 위에는 코드가 겹칩니다. "추천인 코드와 할인코드를 순서대로 넣으면 중복된다"는 글도 있지만, 장바구니에서는 결국 하나만 남으니 할인 금액이 큰 쪽을 남기십시오.'],
      ...(newbie ? [[`처음 사는데 ${newbie.code}, ${best ? best.code : '다른 코드'} 중 뭘 써요?`, best && best.rate > newbie.rate ? `${best.code} 쪽이 ${best.rate - newbie.rate}%p 더 큽니다. ${best.until ? `${kdate(best.until)}까지는 ${best.code}, 그 뒤에는 ${newbie.code} 코드를 쓰면 됩니다.` : ''} 둘 다 일부 제품은 빠지니 장바구니에서 금액을 비교하십시오.` : `${newbie.code}(${newbie.rate}%) 코드가 가장 큽니다. 신규 고객만 되고 다른 할인과 중복되지 않습니다.`]] : []),
      ['블로그에 있는 GOLD120, KRNEW25 같은 코드는 뭔가요?', `${dot(checked)} 아이허브 공식 특가 페이지에는 없는 코드입니다. 예전 코드이거나 일부 사람에게만 열린 코드일 수 있고, 블로그마다 할인율도 다르게 적혀 있습니다. 넣어 보고 장바구니에 할인이 안 잡히면 위 공식 코드를 쓰십시오.`],
      ...(inMonth(bfDate) ? [[`아이허브 ${yy} 블프는 언제예요? 지금 사도 되나요?`, `블랙프라이데이는 ${kdate(bfDate)}, 사이버먼데이는 ${kdate(cmDate)}입니다. 지난 4년 블프 주간 할인은 전 품목 25% 안팎이라${best ? ` 지금 ${best.code} ${best.rate}%와는 몇 %p 차이입니다. 급한 건 지금, 큰 장바구니는 블프 때 사는 편이 낫습니다.` : ' 큰 장바구니는 블프를 기다리는 편이 낫습니다.'} 지난 블프 기록은 아이허브 블프 페이지에 정리했습니다.`]] : []),
      ['아이허브 관세는 몇 달러부터 붙나요?', `영양제(건강기능식품)는 미국에서 보내도 물품값 ${IH_SHIP.customsUsd}달러를 넘으면 관세와 부가세가 붙습니다. 200달러라고 적힌 글이 많지만 그건 목록통관이 되는 일반 물품 이야기입니다. 건강기능식품은 한 번에 ${IH_SHIP.maxBottles}병까지입니다.`],
      ['아이허브 무료배송은 얼마부터예요?', IH_SHIP.freeShipKrw > 0 ? `${won(IH_SHIP.freeShipKrw)} 이상이면 무료배송입니다. 할인코드를 넣은 뒤 금액 기준이니, 코드를 넣고 무료배송 문구가 사라지지 않는지 보십시오.` : '장바구니에 무료배송까지 남은 금액이 표시됩니다.'],
    ];
    page({
      file, priority: isCur ? 0.9 : 0.6, changefreq: isCur ? 'daily' : 'monthly', current: file, lastmod: checked,
      title: isCur
        ? `아이허브 ${mm}월 할인코드 ${yy} 총정리 | ${best ? `${best.code} ${best.rate}%` : '공식 코드'}${newbie ? ` · 신규 ${newbie.rate}%` : ''}${inMonth(bfDate) ? ' · 블프 일정' : ''} (${+checked.slice(8, 10)}일 확인)`
        : `아이허브 ${yy}년 ${mm}월 할인코드 기록 | ${codes.map(c => `${c.code} ${c.rate}%`).slice(0, 3).join(' · ')}`,
      keywords: [`아이허브 ${mm}월 할인코드`, `아이허브 할인코드 ${mm}월`, `아이허브 ${mm}월 쿠폰`, `아이허브 ${mm}월 프로모션`, `iherb ${mm}월 할인코드`, `아이허브 할인코드 ${yy}`, ...codes.map(c => `아이허브 ${c.code}`), '아이허브 첫구매 할인코드', '아이허브 신규 할인코드'],
      desc: `아이허브 ${mm}월 할인코드 ${yy} 정리. ${best ? `${best.code} ${best.label} ${endTxt(best)}, ` : ''}${newbie ? `신규 ${newbie.code} ${newbie.rate}%, ` : ''}${gold ? `${won(gold.min)} 이상 ${gold.code} ${gold.rate}%, ` : ''}코드 없이 되는 행사, 블로그에 도는 코드 진위, ${mm}월 일정까지. ${dot(checked)} 공식 특가 페이지에서 확인.`,
      ld: [crumbs([['홈', 'index.html'], ['아이허브 할인코드', 'iherb.html'], [`아이허브 ${mm}월 할인코드`, file]]), faqLd(FAQ)],
      utilHtml: util,
      stickyHtml: best ? `<a class="sticky" href="${esc(ihLink(`${ref}-sticky`))}" ${aff}${copyBest}><b>${esc(best.code)}</b> 복사하고 아이허브 가기 →</a>` : '',
      heroHtml: `
<div class="hero">
<div class="heroMain">
<span class="state ${best ? 'on' : 'off'}">${isCur ? `${dot(checked)} 공식 페이지 확인` : `${yy}년 ${mm}월 기록`}</span>
<h1>아이허브 ${mm}월 할인코드<br>${yy} 총정리</h1>
<p class="lede answer">${answer}</p>
${best ? go('hero', '아이허브 가기') : ''}
${disclose}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>가장 큰 코드</dt><dd>${best ? `${best.rate}%` : '-'}${best ? `<small>${esc(best.code)} · ${best.until ? `${kdate(best.until)}까지` : '상시'}</small>` : ''}</dd></div>
  ${newbie ? `<div><dt>첫 주문</dt><dd>${newbie.rate}%<small>${esc(newbie.code)}</small></dd></div>` : ''}
  ${inMonth(bfDate) ? `<div><dt>블랙프라이데이</dt><dd>${kdate(bfDate)}<small>사이버먼데이 ${kdate(cmDate)}</small></dd></div>` : ''}
</dl>
</div>
</div>`,
      restHtml: `
<section class="full">
<h2>아이허브 ${mm}월 할인코드 (공식 확인)</h2>
<ul class="codes">${codes.map(row).join('')}</ul>
<p class="hint">${dot(checked)} <a href="https://kr.iherb.com/info/sales-and-offers" target="_blank" rel="noopener nofollow">아이허브 공식 특가 페이지</a>에서 확인한 코드만 올렸습니다. 종료 시각은 한국 시각입니다. 코드는 한 주문에 하나만 들어갑니다.</p>
</section>

${calcRows ? `<section class="full">
<h2>어떤 코드를 넣어야 할까 (장바구니 10만원 예시)</h2>
<p class="lede">세일가 기준 10만원어치를 담았을 때 코드별 결제 금액입니다. 코드는 하나만 들어가니 가장 싼 줄을 고르면 됩니다.</p>
<table class="pt"><thead><tr><th>코드</th><th class="n">할인</th><th class="n">빠지는 금액</th><th class="n">결제</th></tr></thead><tbody>${calcRows}</tbody></table>
<p class="hint">제외 제품이 섞이면 할인 금액이 줄어듭니다. 1달러 1,400원으로 어림한 금액이고, 최종 금액은 장바구니에서 확인하십시오.</p>
</section>` : ''}

${(MO.offers || []).length ? `<section class="full">
<h2>코드 없이 되는 ${mm}월 행사</h2>
<ul class="steps">${MO.offers.map(o => `<li><b>${esc(o.label)}</b> ${esc(o.note || '')}${o.until ? ` · ${kdate(o.until)}${o.untilTime ? ` ${o.untilTime}` : ''}까지` : ''}</li>`).join('')}</ul>
<p class="hint">자동 할인 행사는 할인코드와 겹치지 않는 경우가 많습니다. 행사 상품이 섞인 장바구니는 코드를 넣고 빼면서 금액을 비교하십시오.</p>
</section>` : ''}

${shots.length ? `<section class="full">
<h2>공식 특가 페이지 화면 (${dot(checked)})</h2>
${shots.map(f => shot(f, `아이허브 ${mm}월 공식 특가 페이지 캡처`, shotCaps[f] || `${dot(checked)} 아이허브 공식 특가 페이지`)).join('\n')}
</section>` : ''}

${tlRows ? `<section class="full">
<h2>아이허브 ${mm}월 일정</h2>
<table class="pt"><tbody>${tlRows}</tbody></table>
<p class="hint">코드와 행사 날짜는 공식 페이지 기준이고, 블랙프라이데이·사이버먼데이 할인율은 지난 기록입니다. 블프 코드가 나오면 바로 올립니다.</p>
</section>` : ''}

${(MO.rumors || []).length ? `<section class="full">
<h2>블로그에 도는 코드, 공식 페이지에는 없습니다</h2>
<p class="lede">${mm}월 할인코드 글을 여러 개 비교해 보니, 아이허브 공식 특가 페이지에 없는 코드가 섞여 있었습니다. 안 된다는 뜻은 아니지만, 넣어 보고 할인이 안 잡히면 위 공식 코드를 쓰십시오.</p>
<table class="pt"><thead><tr><th>코드</th><th>블로그 설명</th><th>공식 페이지</th></tr></thead><tbody>${MO.rumors.map(r => `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.said)}</td><td class="muted">없음</td></tr>`).join('')}</tbody></table>
<p class="hint">관세 기준을 "미국 발송 200달러"로 적은 글도 있는데, 영양제는 미국 발송이어도 ${IH_SHIP.customsUsd}달러입니다.</p>
</section>` : ''}

<section class="full">
<h2>할인코드 넣는 법</h2>
<ol class="steps">
  <li>아이허브에 들어가 언어 한국어, 통화 KRW, 배송 국가 대한민국인지 확인합니다.</li>
  <li>제품을 장바구니에 담습니다. 상품 자체 세일가는 자동으로 들어갑니다.</li>
  <li>장바구니의 <b>프로모션 코드</b> 칸에 ${best ? `${esc(best.code)} 코드` : '코드'}를 붙여넣고 적용을 누릅니다.</li>
  <li>할인 금액, 무료배송(${IH_SHIP.freeShipKrw > 0 ? won(IH_SHIP.freeShipKrw) : '기준'} 이상), ${IH_SHIP.customsUsd}달러·${IH_SHIP.maxBottles}병 기준을 보고 결제합니다.</li>
</ol>
<p class="hint">처음이면 <a href="./iherb-jikgu.html">아이허브 직구 방법</a>에 가입부터 개인통관고유부호, 결제까지 화면으로 정리했습니다.</p>
${best ? go('howto', '아이허브에서 코드 넣기') : ''}
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(FAQ)}
</section>

${more(file)}
`,
    });
  }
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
    summary = `${y}년 ${m}월 마이프로틴 대란은 ${st.events.length}번 있었습니다. ${evText}입니다.${fromVideos ? ' 마프대란알리미 채널 영상 기준입니다.' : ''}${isCur ? ' 이달은 아직 진행 중이라 매일 갱신됩니다.' : ''}${isCur && sureNext && ymOf(sureNext.date) === ym ? ` 다음 대란은 ${kdate(sureNext.date)} ${sureNext.label}입니다.${sureOpen ? ` 할인코드는 ${sureOpen}에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''}` : ''}`;
  } else {
    summary = `${y}년 ${m}월에는 ${isCur ? '아직 ' : ''}할인코드 ${TH}% 이상 대란이 ${isCur ? '없습니다. 대란이 시작되면 바로 기록합니다.' : '없었습니다.'}${isCur && sureNext && ymOf(sureNext.date) === ym ? ` 다음 대란은 ${kdate(sureNext.date)} ${sureNext.label}입니다.${sureOpen ? ` 할인코드는 ${sureOpen}에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''}` : ''}`;
  }
  // 할인율을 모르는 대란이 있는 달은, 매일 기록 값이 대란 기준보다 낮으면 최고값으로 쓰지 않습니다 (대란 1회인데 최고 36%처럼 보이는 것 방지)
  const bestKnown = [st.evMax, st.dayMax].filter(v => v != null);
  let best = bestKnown.length ? Math.max(...bestKnown) : null;
  if (st.events.some(e => e.max == null) && (best == null || best < TH)) best = null;

  page({
    file: monthFile(ym), priority: isCur || isUpcoming ? 0.9 : 0.6, current: monthFile(ym),
    keywords: [`마이프로틴 ${m}월 대란`, `마이프로틴 대란 ${m}월`, `마이프로틴 ${m}월 대란 가격`, `마이프로틴 ${m}월 대란 코드`, `마이프로틴 할인 ${m}월`, `마이프로틴 ${m}월 할인코드`, '마이프로틴 대란 가격', '마이프로틴 대란 일정', '마이프로틴 대란 날짜'],
    lastmod: st.lastDate ?? (st.videos.at(-1)?.date ?? st.events.at(-1)?.end ?? last.date),
    title: `마이프로틴 ${m}월 대란 일정·가격·할인코드 총정리 (${y}) | ${SITE.brand}`,
    desc: isUpcoming
      ? `${y}년 마이프로틴 ${m}월 대란 날짜와 할인코드, WPC·WPI 예상 대란가.${season.length ? ` ${seasonShort} 전후를 노리세요.` : ''} 시작되면 바로 기록합니다. 지금 쓸 수 있는 히든코드 ${last.base}%도 확인하세요.`
      : `${y}년 마이프로틴 ${m}월 대란 날짜·가격·할인코드 정리. ${st.events.length ? `대란 ${st.events.length}회(${evText}).` : '대란 없음.'} WPC·WPI 대란가 포함.${st.videos.length ? ` 히든코드와 숨은 할인 영상 ${st.videos.length}편.` : ''}`,
    changefreq: isCur || isUpcoming ? 'daily' : 'monthly',
    ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html'], [`${y}년 ${m}월 대란`, monthFile(ym)]]), ...(upFaq.length ? [faqLd(upFaq)] : []), ...st.videos.map(videoLd)],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 ${m}월 대란<br>일정·가격·할인코드</h1>
<p class="updated">${y}년 ${m}월 · ${isUpcoming ? '시작 전' : fromVideos ? '유튜브 영상 기준' : `${dot(st.lastDate)} 기준${isCur ? ' · 매일 갱신' : ''}`}</p>
<p class="lede">${summary}</p>
${isUpcoming ? `<a class="cta" href="${esc(SITE.kakao)}">${m}월 대란 시작 알림 받기</a>` : ''}
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">${isUpcoming ? `
  <div><dt>지금 히든코드</dt><dd>${last.base}%</dd></div>
  <div><dt>${sureNext ? '다음 대란' : '다음 예상 대란'}</dt><dd>${guessHere ? `${kdate(nextGuess)}${GUESS_TAG}` : '-'}</dd></div>
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

${KEY_PRODUCTS.length ? `<section class="full">
<h2>${m}월 대란 가격 (WPC·WPI)</h2>
<p class="lede">${best != null && best >= TH ? `${m}월 최고 할인코드 ${best}%를 지금 표시가(${dot(db.priceDate || last.date)})에 적용한 금액입니다. 그달 실제 표시가와는 조금 다를 수 있습니다.` : `지난 대란 평균 할인코드 ${dRate}%를 지금 표시가(${dot(db.priceDate || last.date)})에 적용한 예상 금액입니다. ${m}월 대란이 확인되면 실제 할인율로 바꿉니다.`}</p>
${ratePriceRows(KEY_PRODUCTS, best != null && best >= TH ? best : dRate, best != null && best >= TH ? `${m}월 대란가` : '예상 대란가')}
<a class="cta ghost" href="./price.html">평소 가격과 비교하기</a>
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

// ── 전체 대란 기록 + 대란 일정 허브 (키워드: 마이프로틴 대란 일정, 다음 대란, 대란 언제, 할인 기간) ──
// 이번 달부터 석 달 안의 공식 예고·체크일과 평균 주기로 계산한 다음 대란
const SCHEDULE = (() => {
  const list = [curYm, shiftYm(curYm, 1), shiftYm(curYm, 2)].flatMap(seasonal).filter(s => s.date >= last.date).map(s => ({
    date: s.date,
    label: s.label.replace(/\s*\((마이프로틴 예고|대란 확정)\)$/, ''),
    kind: s.sure ? '대란 확정' : /\(마이프로틴 예고\)$/.test(s.label) ? '공식 예고' : '체크일',
    link: s.link || (monthPages.includes(ymOf(s.date)) ? monthFile(ymOf(s.date)) : null),
  }));
  if (nextGuess && !list.some(x => x.date === nextGuess)) list.push({ date: nextGuess, label: `다음 대란 (평균 주기 약 ${cycle}일로 계산)`, kind: '예상', link: null });
  return list.sort((a, b) => a.date.localeCompare(b.date));
})();
const schedNamed = SCHEDULE.filter(s => s.kind !== '예상');
const scheduleTable = SCHEDULE.length ? `<table>
<thead><tr><th>날짜</th><th>행사</th><th class="n">구분</th></tr></thead>
<tbody>${SCHEDULE.map(s => `<tr><td class="nw">${kdate(s.date)} (${wd(s.date).slice(0, 1)})</td><td>${s.link ? `<a href="./${s.link}">${esc(s.label)}</a>` : esc(s.label)}</td><td class="n">${s.kind === '예상' ? `예상${AI_TAG}` : s.kind}</td></tr>`).join('')}</tbody>
</table>` : '';
const evDays = events.map(e => e.days).filter(Boolean);
const recYm = ymOf(events[0]?.start || rows[0].date);
const DAERAN_FAQ = [
  ['마이프로틴 다음 대란은 언제인가요?',
   `${isDaeran ? '지금 대란이 진행 중입니다. ' : sureNext ? `다음 대란은 ${kdate(sureNext.date)} ${sureNext.label}입니다.${sureOpen ? ` 할인코드는 ${sureOpen}에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''} ` : nextGuess ? `평균 주기(약 ${cycle}일)로 단순 계산하면 ${kdate(nextGuess)} 전후입니다. ` : ''}마이프로틴은 대란 날짜를 미리 공지하지 않습니다.${schedNamed.length ? ` 다만 ${schedNamed.slice(0, 3).map(s => `${kdate(s.date)} ${s.label}`).join(', ')}처럼 행사가 걸리는 날은 미리 체크해 둘 만합니다.` : ''} 시작되면 이 사이트와 단톡방에 바로 올립니다.`],
  ['마이프로틴 대란 주기는 얼마나 되나요?',
   cycle ? `${Y(recYm)}년 ${M(recYm)}월부터 기록한 대란 ${events.length}회를 보면 평균 ${cycle}일 간격입니다. 평균은 참고용이고, 11.11이나 블랙프라이데이처럼 행사가 있는 달은 평균과 다르게 올 수 있습니다.` : '아직 주기를 계산할 만큼 기록이 쌓이지 않았습니다.'],
  ['마이프로틴 할인 기간은 얼마나 되나요?',
   `평소에도 공식 할인코드가 늘 걸려 있고, 대란은 그 할인율이 ${TH}% 이상으로 오른 기간입니다.${evDays.length ? ` 기록된 대란은 짧으면 ${Math.min(...evDays)}일, 길면 ${Math.max(...evDays)}일 이어졌습니다.` : ''} 끝나는 날을 미리 알려주지 않으니 대란이 보이면 그때 사는 편이 안전합니다.`],
  ['마이프로틴 대란은 몇 시에 시작하나요?',
   '할인율은 보통 전날 저녁 7시 전후에 바뀝니다. 그래서 이 사이트는 저녁 7시 이후 확인한 값을 다음 날짜로 기록하고, 대란이 시작되면 단톡방에 바로 알립니다.'],
];
page({
  file: 'daeran.html', priority: 0.9, changefreq: 'daily', current: 'daeran.html',
  keywords: ['마이프로틴 대란 일정', '마이프로틴 대란 날짜', '마이프로틴 다음 대란', '마이프로틴 대란 언제', '마이프로틴 대란 주기', '마이프로틴 할인 기간', '마이프로틴 대란 시간', '마이프로틴 대란 방법', '11.11 대란', '12.12 대란', '마이프로틴 신년 대란', '역대 마프대란'],
  title: `마이프로틴 대란 일정 ${Y(curYm)} | 다음 대란 예상 날짜 · 역대 기록 (평균 ${cycle ?? '-'}일 주기)`,
  desc: `마이프로틴 대란 일정과 다음 대란 예상 날짜.${schedNamed.length ? ` ${schedNamed.slice(0, 3).map(s => `${kdate(s.date)} ${s.label}`).join(' · ')}.` : ''} ${Y(recYm)}년 ${M(recYm)}월부터 기록한 대란 ${events.length}회, 평균 주기 ${cycle ?? '-'}일, 히든코드 최고 ${peak != null ? pct(peak) : '-'}. 월별 정리와 영상 포함.`,
  ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html']]), faqLd(DAERAN_FAQ)],
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
${SCHEDULE.length ? `<section class="full">
<h2>다음 대란 예상 일정</h2>
<p class="lede">마이프로틴은 대란 날짜를 미리 알려주지 않습니다.${sureNext ? ` 그래도 <b>${kdate(sureNext.date)} ${esc(sureNext.label)}</b>은 대란으로 확정됐습니다.${sureOpen ? ` 할인코드는 ${sureOpen}에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''}` : ''} 공식 사이트에 올라온 행사는 <b>공식 예고</b>, 해마다 행사가 걸리는 날은 <b>체크일</b>, 평균 주기로 계산한 날은 <b>예상</b>으로 적었습니다.</p>
${scheduleTable}
</section>` : ''}

${day.length > 1 ? `<section class="full">
<h2>할인율 추이</h2>
${trendNote}
${trend(day.slice(-90))}
</section>` : ''}
${priceChart() ? `<section class="full">
<h2>임팩트웨이 가격 흐름: 정상가 vs 할인코드 적용가</h2>
<p class="lede">회색 선이 코드 넣기 전 가격, 진한 선이 그날 할인코드를 넣은 가격입니다. 주황 점이 대란 날 가격이라, 대란을 기다리면 얼마나 아끼는지 한눈에 보입니다.</p>
${priceChart()}
${priceChartNote(CHART_KEY)}
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

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(DAERAN_FAQ)}
</section>
${ytPromo}
`,
});

// ── 행사 안내 페이지 (announced 에 page 가 있는 행사. 키워드: 마이프로틴 11월 대란 일정·날짜·방법) ──
const evTime = (d, t) => `${kdate(d)}${t ? ` ${hmK(t)}` : ''}`;
for (const ev of EVENT_PAGES) {
  const y = +ev.date.slice(0, 4), m = +ev.date.slice(5, 7), dd = daysBetween(last.date, ev.date);
  const sg = ev.signup || null;
  const applyOpen = sg && sg.applyUntil ? last.date <= sg.applyUntil : !!sg;
  const over = sg && sg.useTo ? last.date > sg.useTo : last.date > addDays(ev.date, 1);
  const live = !over && dd <= 0;
  const openAt = ev.time ? evTime(ev.openDate || ev.date, ev.time) : null;
  const mPage = monthPages.includes(ymOf(ev.date)) ? monthFile(ymOf(ev.date)) : 'daeran.html';
  const evEvents = events.filter(e => e.start <= ev.date && e.end >= ev.date);
  const evMax = evEvents.length ? Math.max(...evEvents.map(e => e.max ?? 0)) : null;
  const sgRow = sg ? `
<section class="full">
<h2>${esc(sg.label || '사전 신청')} 미리 신청하기</h2>
<p class="lede">${applyOpen
    ? `마이프로틴이 ${kdate(ev.date)} ${esc(ev.label)} 전에 <b>${esc(sg.label || '사전 신청')}</b>을 받고 있습니다. ${sg.applyUntil ? `<b>${evTime(sg.applyUntil, sg.applyUntilTime)}까지</b> 신청하면 ` : '신청해 두면 '}${sg.useFrom ? `${evTime(sg.useFrom, sg.useFromTime)}부터${sg.useTo ? ` ${evTime(sg.useTo, sg.useToTime)}까지` : ''} 구매할 때 ` : '행사 때 '}자동으로 빠집니다. 할인코드와 별개라 둘 다 챙길 수 있습니다.`
    : over ? `${esc(sg.label || '사전 신청')} 신청과 사용 기간이 모두 끝났습니다.` : `${esc(sg.label || '사전 신청')} 신청은 ${sg.applyUntil ? `${evTime(sg.applyUntil, sg.applyUntilTime)}에 ` : ''}마감됐습니다.${sg.useFrom ? ` 신청해 둔 분은 ${evTime(sg.useFrom, sg.useFromTime)}부터${sg.useTo ? ` ${evTime(sg.useTo, sg.useToTime)}까지` : ''} 구매할 때 자동으로 적용됩니다.` : ''}`}</p>
${applyOpen ? `<a class="cta hot" href="${esc(sgUrl(sg.url))}" target="_blank" rel="sponsored nofollow noopener">${esc(sg.label || '사전 신청')} 미리 신청하기</a>` : ''}
${sg.how ? `<p class="lede">${esc(sg.how)}</p>` : ''}
</section>` : '';
  const timeline = [
    sg && sg.applyFrom && sg.applyUntil ? [`${kdate(sg.applyFrom)} ~ ${evTime(sg.applyUntil, sg.applyUntilTime)}`, `${esc(sg.label || '사전 신청')} 신청 기간`, sg.url && applyOpen ? `<a href="${esc(sgUrl(sg.url))}" target="_blank" rel="sponsored nofollow noopener">신청하기</a>` : '이메일 등록, 1인 1회'] : null,
    sg && sg.useFrom ? [evTime(sg.useFrom, sg.useFromTime), `${esc(sg.label || '사전 신청')} 사용 시작`, '신청한 계정으로 구매하면 자동 적용'] : null,
    ev.alert ? [esc(ev.alert), `${SITE.brand} 대란 알림`, '단톡방·유튜브로 시작을 알립니다'] : null,
    ...(openAt && ev.openDate && ev.openDate !== ev.date ? [[openAt, '할인코드 공개', `히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개`]] : []),
    [`${kdate(ev.date)} ${wd(ev.date)}`, `${esc(ev.label)} 대란 (확정)`, openAt && !(ev.openDate && ev.openDate !== ev.date) ? `할인코드 ${hmK(ev.time)} 공개` : '장바구니 담아 두고 코드 적용'],
    sg && sg.useTo ? [evTime(sg.useTo, sg.useToTime), '행사 종료', '이 시각 전에 결제'] : null,
  ].filter(Boolean);
  const EV_FAQ = [
    [`마이프로틴 ${m}월 대란은 언제인가요?`,
     `${y}년 ${kdate(ev.date)} ${wd(ev.date)} ${ev.label}입니다. 마이프로틴은 보통 대란 날짜를 미리 알려주지 않는데, 이번에는 공식 사이트에 행사가 걸려 날짜가 확정됐습니다.${openAt ? ` 할인코드는 ${openAt}에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''}`],
    ['마프대란이 뭔가요?',
     `마이프로틴 대란을 줄여 부르는 말입니다. 할인코드 할인율이 평소보다 확실히 올라가는 날이고, ${SITE.brand}는 할인코드 ${TH}% 이상인 날을 대란으로 기록합니다.${knownRange ? ` 올해 대란 때 히든코드는 ${knownRange}였습니다.` : ''}`],
    ...(sg ? [[`${sg.label || '사전 신청'}이 뭔가요? 꼭 신청해야 하나요?`,
     `마이프로틴이 큰 행사 전에 받는 사전 신청입니다. ${sg.how || ''} 할인코드와는 별개로 빠지는 돈이라 안 하면 그만큼 손해입니다.${sg.applyUntil ? ` ${evTime(sg.applyUntil, sg.applyUntilTime)}까지만 받으니 지금 해 두는 편이 좋습니다.` : ''}`],
    [`${sg.label || '사전 신청'}과 할인코드를 같이 쓸 수 있나요?`,
     `됩니다. 할인코드는 장바구니에서 넣고, ${sg.label || '사전 신청'}은 신청한 계정으로 로그인해 결제하면 자동으로 빠집니다. 결제 전에 장바구니 금액에서 둘 다 빠졌는지 확인하십시오.`]] : []),
    ['대란 전에 뭘 준비하면 되나요?',
     `장바구니를 미리 채워 두는 게 핵심입니다. 인기 맛은 대란 초반에 품절되기도 합니다. ${(SHOP.freeShipping / 10000).toLocaleString('ko-KR')}만원 이상이면 무료배송이고 ${SHOP.customsUsd}달러를 넘으면 관세가 붙을 수 있으니 그 사이로 맞추십시오.${calcWidget ? ' 할인 계산기에 금액을 넣으면 결제금액과 무료배송까지 남은 금액이 나옵니다.' : ''}`],
    ['대란 시작은 어떻게 알 수 있나요?',
     `${ev.alert ? `${ev.alert}에 ${SITE.brand} 단톡방과 유튜브로 알림을 보냅니다. ` : ''}홈 화면에도 그 시각부터 대란으로 표시되고 복사 버튼에 그날 코드가 들어갑니다.`],
    [`${m}월 대란과 블랙프라이데이 중 언제 사는 게 나은가요?`,
     `${m === 11 ? `11월 11일 대란이 먼저 오고 블랙프라이데이가 2주 뒤입니다. 할인율은 비슷하거나 블프가 조금 높을 수 있지만, 11일에는 ${sg ? `${sg.label || '사전 신청'}이 따로 빠지고 ` : ''}재고가 넉넉합니다. 지금 필요한 건 11일에 사고, 블프는 ${SITE.brand}에서 할인율을 비교해 보고 추가 구매를 정하면 됩니다.` : '할인율을 보고 정하면 됩니다. 두 행사 모두 이 사이트에 기록됩니다.'}`],
  ];
  page({
    file: ev.page, priority: over ? 0.6 : 0.95, changefreq: over ? 'monthly' : 'daily', current: ev.page,
    lastmod: last.date,
    keywords: ['마프대란', '마이프로틴대란', `마이프로틴 ${m}월 대란`, `마이프로틴 ${m}월 대란 일정`, `마이프로틴 ${m}월 대란 날짜`, '마이프로틴 대란 일정', '마이프로틴 대란 날짜', '마이프로틴 대란 방법', '마이프로틴 대란 언제', `마이프로틴 ${m}.${+ev.date.slice(8, 10)} 대란`, `마이프로틴 ${ev.label}`, ...(sg ? [`마이프로틴 ${sg.label}`, `마이프로틴 ${sg.label} 신청`] : []), '마프대란 일정', '마프대란 날짜'],
    title: over
      ? `마이프로틴 ${m}월 대란 (${y}) | ${kdate(ev.date)} ${ev.label} 기록·할인코드 | ${SITE.brand}`
      : `마이프로틴 ${m}월 대란 일정·날짜·방법 | ${kdate(ev.date)} ${ev.label} 확정${sg ? ` · ${sg.label} 미리 신청` : ''} | ${SITE.brand}`,
    desc: over
      ? `${y}년 마이프로틴 ${m}월 대란은 ${kdate(ev.date)} ${ev.label}이었습니다.${evMax != null ? ` 할인코드 최고 ${evMax}%.` : ''} 날짜·할인코드·방법 기록.`
      : `마이프로틴 ${m}월 대란 날짜는 ${kdate(ev.date)} ${wd(ev.date)} ${ev.label}로 확정.${sg && applyOpen ? ` ${sg.label}은 ${sg.applyUntil ? `${kdate(sg.applyUntil)}까지 ` : ''}미리 신청.` : ''}${ev.alert ? ` ${ev.alert} ${SITE.brand} 알림,` : ''}${openAt ? ` 할인코드 ${openAt} 공개.` : ''} 마프대란 일정·준비 방법·자주 묻는 질문 정리.`,
    ld: [crumbs([['홈', 'index.html'], ['대란 기록', 'daeran.html'], [`${m}월 ${ev.label} 대란`, ev.page]]), faqLd(EV_FAQ),
      { '@type': 'Event', name: `마이프로틴 ${kdate(ev.date)} ${ev.label} 대란`, startDate: sg && sg.useFrom ? `${sg.useFrom}T${sg.useFromTime || '00:00'}:00+09:00` : `${ev.date}T${ev.time || '00:00'}:00+09:00`, endDate: sg && sg.useTo ? `${sg.useTo}T${sg.useToTime || '23:59'}:00+09:00` : `${ev.date}T23:59:00+09:00`, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: { '@type': 'VirtualLocation', url: 'https://www.myprotein.co.kr/' }, organizer: { '@type': 'Organization', name: 'Myprotein Korea', url: 'https://www.myprotein.co.kr/' }, description: ev.note || '' }],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<span class="state ${live ? 'on' : 'off'}">${over ? '끝난 대란' : live ? '지금 대란입니다' : `대란 확정 · D-${dd}`}</span>
<h1>마이프로틴 ${m}월 대란<br>${kdate(ev.date)} ${esc(ev.label)}</h1>
<p class="lede answer">${over
    ? `${y}년 마이프로틴 ${m}월 대란은 <b>${kdate(ev.date)} ${esc(ev.label)}</b>이었습니다.${evMax != null ? ` 할인코드는 최고 ${evMax}%였습니다.` : ''} 날짜별 기록은 ${m}월 대란 페이지에 있습니다.`
    : `${y}년 마이프로틴 ${m}월 대란 날짜는 <b>${kdate(ev.date)} ${wd(ev.date)} ${esc(ev.label)}</b>로 확정됐습니다.${sg && applyOpen ? ` 먼저 <b>${esc(sg.label)}</b>을 ${sg.applyUntil ? `${kdate(sg.applyUntil)}까지 ` : ''}미리 신청해 두고,` : ''}${ev.alert ? ` <b>${esc(ev.alert)}</b> ${SITE.brand} 알림을 받으세요.` : ''}${openAt ? ` 할인코드는 <b>${openAt}</b>에 공개되고, 히든코드와 최대할인조합은 ${SITE.brand}가 가장 빠르게 공개할 예정입니다.` : ''}`}</p>
${sg && applyOpen ? `<a class="cta hot heroBtn" href="${esc(sgUrl(sg.url))}" target="_blank" rel="sponsored nofollow noopener">${esc(sg.label)} 미리 신청하기</a>` : live ? heroCta : ''}
<a class="cta ghost" href="${esc(SITE.kakao)}">대란 알림 단톡방 들어가기</a>
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>대란 날짜</dt><dd>${kdate(ev.date)}<small>${wd(ev.date)} · ${esc(ev.label)}</small></dd></div>
  ${sg && sg.applyUntil ? `<div><dt>${esc(sg.label)} 신청</dt><dd>${applyOpen ? `${kdate(sg.applyUntil)}까지` : '마감'}</dd></div>` : ''}
  ${ev.alert ? `<div><dt>${SITE.brand} 알림</dt><dd>${esc(ev.alert)}</dd></div>` : ''}
  ${openAt ? `<div><dt>할인코드 공개</dt><dd>${openAt}</dd></div>` : ''}
  <div><dt>오늘 ${pName || '할인코드'}</dt><dd>${last.base}%</dd></div>
</dl>
</div>
</div>`,
    restHtml: `
${sgRow}

<section class="full">
<h2>${m}월 대란 일정</h2>
<table>
<thead><tr><th>언제</th><th>무엇</th><th>메모</th></tr></thead>
<tbody>${timeline.map(([a, b, c]) => `<tr><td class="nw">${a}</td><td><b>${b}</b></td><td>${c}</td></tr>`).join('')}</tbody>
</table>
<p class="lede">할인율은 보통 전날 저녁에 바뀝니다. ${SITE.brand} 홈은 저녁 7시 이후 확인한 값을 다음 날짜로 기록합니다.</p>
</section>

<section class="full">
<h2>대란 때 사는 방법</h2>
<ol class="steps">
  ${sg ? `<li><b>${esc(sg.label)} 미리 신청</b> ${sg.applyUntil ? `${evTime(sg.applyUntil, sg.applyUntilTime)}까지. ` : ''}로그인한 계정의 이메일로 신청해야 적용됩니다.${applyOpen ? ` <a href="${esc(sgUrl(sg.url))}" target="_blank" rel="sponsored nofollow noopener">신청 페이지 열기</a>` : ''}</li>` : ''}
  <li><b>장바구니 미리 담기</b> 사고 싶은 제품과 맛을 미리 담아 둡니다. 인기 맛은 대란 초반에 품절되기도 합니다.${TASTE ? ' <a href="./taste.html">맛 추천</a>을 참고하세요.' : ''}</li>
  <li><b>${ev.alert ? `${esc(ev.alert)} 알림 확인` : '대란 시작 확인'}</b> ${ev.alert ? `${SITE.brand} 단톡방·유튜브로 알림이 갑니다. ` : ''}홈 화면이 "지금 대란입니다"로 바뀌는지 봅니다.</li>
  <li><b>히든코드 복사해서 적용</b> ${openAt ? `${openAt} 공개. ` : ''}${SITE.brand} 홈의 복사 버튼을 누르면 그날 코드가 들어갑니다. 장바구니 할인코드 칸에 붙여넣고 적용을 누르세요.</li>
  <li><b>금액 확인 후 결제</b> ${sg ? `코드와 ${esc(sg.label)} 둘 다` : '코드가'} 빠졌는지 보고, ${(SHOP.freeShipping / 10000).toLocaleString('ko-KR')}만원 이상 무료배송과 ${SHOP.customsUsd}달러 관세 한도 사이로 맞춥니다.${sg && sg.useTo ? ` ${evTime(sg.useTo, sg.useToTime)} 전에 결제해야 합니다.` : ''}</li>
</ol>
${calcWidget ? '<a class="cta ghost" href="./calc.html">할인 계산기로 결제금액 미리 보기</a>' : ''}
</section>

<section>
<h2>지금까지의 대란</h2>
<p class="lede">${lastEvent ? `마지막 대란은 ${range(lastEvent)}${lastEvent.max != null ? `(할인코드 ${lastEvent.max}%)` : ''}이고${cycle ? `, 평균 ${cycle}일마다 돌아왔습니다` : ''}.` : '아직 기록된 대란이 없습니다.'}${knownRange ? ` 대란 때 히든코드는 ${knownRange}였습니다.` : ''} ${kdate(ev.date)} 대란도 같은 기준으로 기록합니다.</p>
<a class="cta ghost" href="./${mPage}">${m}월 대란 전체 정리 보기</a>
<a class="cta ghost" href="./daeran.html">대란 일정과 역대 기록</a>
</section>

<section>
<h2>대란 때 얼마나 싸질까</h2>
<p class="lede">${PRODUCTS.length ? `오늘 코드 ${last.base}%와 지난 대란 평균 코드 ${dRate}%를 적용한 금액을 제품별로 비교해 두었습니다.` : `오늘 ${pName || '할인코드'}는 ${last.base}%입니다. 대란 기준은 ${TH}%입니다.`}</p>
${PRODUCTS.length ? '<a class="cta ghost" href="./price.html">제품별 대란 가격 비교</a>' : ''}
<a class="cta ghost" href="./code.html">마이프로틴 할인코드 입력 방법</a>
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(EV_FAQ)}
</section>
${ytPromo}
${kakaoBox}
`,
  });
}

// ── 마이프로틴 직구 방법 (키워드: 마이프로틴 직구, 직구 방법, 관세, 배송기간, 통관부호) ──
{
  const MP_SRC = {
    delivery: 'https://www.myprotein.co.kr/c/customer-services/delivery-information/',
    returns: 'https://www.myprotein.co.kr/c/customer-services/returns-policy/',
    terms: 'https://www.myprotein.co.kr/c/customer-services/terms-and-conditions/',
  };
  const JK_CHECKED = '2026-11-09';
  const free = won(SHOP.freeShipping), limitKrw = `약 ${Math.round(SHOP.customsUsd * SHOP.usdKrw / 10000)}만원`;
  const codeTxt = primary ? `${nameOf(primary)} ${primary.rate}%` : '할인코드';
  const JK_FAQ = [
    ['마이프로틴 직구 방법이 어렵나요?', `어렵지 않습니다. 한국어 사이트(myprotein.co.kr)에서 원화로 주문하고 결제하는 건 국내 쇼핑몰과 같습니다. 다른 점은 해외에서 오는 물건이라 ${SHOP.customsUsd}달러 관세 기준과 통관을 챙겨야 한다는 것뿐입니다.`],
    ['마이프로틴 관세는 얼마부터 붙나요?', `물품 가격이 ${SHOP.customsUsd}달러(${limitKrw})를 넘으면 넘은 부분이 아니라 전체 금액에 관세와 부가세가 붙습니다. 미국 발송 물건의 200달러 기준은 목록통관 물품에만 적용되고 식품은 목록통관 대상이 아니라서, 프로틴은 ${SHOP.customsUsd}달러로 보면 됩니다.`],
    ['마이프로틴 배송 기간은 얼마나 걸리나요?', '마이프로틴 공식 안내로는 출고 후 평균 2~6영업일입니다. 통관이나 택배사 사정으로 늦어질 수 있고, 통관이 끝나기 전에는 배송 조회가 안 될 수 있습니다.'],
    ['마이프로틴 배송비는 얼마인가요?', `${free} 이상 주문하면 무료배송이고, 그보다 적으면 배송비가 붙습니다. 배송비 금액은 장바구니에서 확인됩니다.`],
    ['마이프로틴 결제 수단은 뭐가 있나요?', '마이프로틴 도움말에는 "신용카드와 실시간 계좌이체 두 가지"라고 나오고, 장바구니에도 KCP 카드·계좌이체 버튼만 보입니다. 카카오페이·네이버페이·토스는 공식 안내에 없습니다. 영국 회사라 카드사에 따라 해외 결제 수수료가 붙을 수 있습니다.'],
    ['마이프로틴 주문 취소는 언제까지 되나요?', '마이프로틴 도움말로는 주문 뒤 취소나 변경이 기본적으로 어렵고, 주문 후 10분 안에는 내 계정의 주문 내역에서 취소 요청이 될 수도 있습니다. 취소되면 1시간 안에 확정 메일이 오니, 메일을 받기 전에는 다시 주문하지 마십시오.'],
    ['개인통관고유부호가 꼭 필요한가요?', '마이프로틴 안내에는 따로 적혀 있지 않습니다. 다만 해외 직구 식품은 통관 때 받는 사람 확인에 개인통관고유부호를 쓰니, 관세청 유니패스에서 미리 발급받아 두고 주문서에 칸이 있으면 넣으십시오. 이름과 전화번호는 부호에 등록된 것과 같게 적는 게 안전합니다.'],
    ['나눠서 주문하면 관세를 안 내나요?', '같은 판매처에서 같은 날 산 물건을 여러 상자로 나눠 받으면 합쳐서 과세됩니다. 2022년 11월 17일부터는 입항일이 같다는 이유만으로는 합치지 않아서, 다른 날 주문한 건 같은 날 도착해도 따로 봅니다.'],
    ['할인코드 두 개를 같이 쓸 수 있나요?', `안 됩니다. 마이프로틴 약관상 할인코드는 한 번에 하나만 들어갑니다. 오늘은 ${codeTxt}가 가장 높습니다. 추천인 코드는 할인코드와 별개로 첫 결제 때 체크아웃 화면에 넣습니다.`],
    ['반품이나 환불은 어떻게 하나요?', '마이프로틴 반품 안내로는 받은 날부터 14일 안에 뜯지 않은 원래 포장 상태로 반품할 수 있습니다. 잘못 왔거나 파손된 물건은 바로 고객센터에 알리면 되고, 이때는 반품 배송비도 돌려받습니다. 물건이 안 오면 출고 메일을 받은 날부터 21일 안에 알려야 합니다. 환불은 보통 7영업일 안에 처리됩니다.'],
  ];
  const step = (t, d, sh = '') => `<li><b>${t}</b> ${d}${sh}</li>`;
  page({
    file: 'jikgu.html', priority: 0.8, changefreq: 'monthly', current: 'jikgu.html', lastmod: JK_CHECKED,
    title: `마이프로틴 직구 방법 ${Y(curYm)} | 주문·관세 ${SHOP.customsUsd}달러·배송기간·통관부호 한 번에`,
    desc: `마이프로틴 직구 방법을 가입부터 받을 때까지 7단계로 정리했습니다. ${free} 이상 무료배송, ${SHOP.customsUsd}달러(${limitKrw}) 넘으면 전체 금액 과세, 출고 후 평균 2~6영업일 배송, 결제 수단과 반품까지. 마이프로틴 공식 안내와 관세청 기준.`,
    keywords: ['마이프로틴 직구', '마이프로틴 직구 방법', '마이프로틴 주문 방법', '마이프로틴 구매 방법', '마이프로틴 관세', '마이프로틴 관세 기준', '마이프로틴 배송기간', '마이프로틴 배송비', '마이프로틴 통관', '마이프로틴 개인통관고유부호', '마이프로틴 결제', '마이프로틴 반품', '마이프로틴 합산과세'],
    ld: [crumbs([['홈', 'index.html'], ['마이프로틴 직구 방법', 'jikgu.html']]), faqLd(JK_FAQ),
      { '@type': 'HowTo', name: '마이프로틴 직구 방법', totalTime: 'P7D', step: ['회원가입', '장바구니 담기', '할인코드 넣기', '배송지와 통관부호', '결제', '배송 확인', '받은 뒤 확인'].map((n, i) => ({ '@type': 'HowToStep', position: i + 1, name: n })) }],
    heroHtml: `
<div class="hero">
<div class="heroMain">
<h1>마이프로틴 직구 방법<br>가입부터 관세까지 7단계</h1>
<p class="updated">${dot(JK_CHECKED)} 마이프로틴 화면과 공식 안내로 확인</p>
<p class="lede answer">마이프로틴 직구는 한국어 사이트에서 원화로 주문하는 해외 직구입니다. <b>${free} 이상 무료배송</b>, <b>${SHOP.customsUsd}달러(${limitKrw}) 넘으면 관세</b>, <b>할인코드는 한 번에 하나</b>. 이 세 가지만 기억하면 되고, 출고 뒤 보통 2~6영업일이면 도착합니다.</p>
${heroCta}
</div>
<div class="heroSide">
<dl class="stats">
  <div><dt>무료배송</dt><dd>${free}<small>이상 주문 시</small></dd></div>
  <div><dt>면세 한도</dt><dd>${SHOP.customsUsd}달러<small>${limitKrw} · 넘으면 전체 과세</small></dd></div>
  <div><dt>배송</dt><dd>2~6영업일<small>출고 후 평균</small></dd></div>
</dl>
</div>
</div>`,
    restHtml: `
<section class="full">
<h2>마이프로틴 직구 순서</h2>
<ol class="steps">
  ${step('회원가입', `<a href="${esc(mpLink('pt-PAGE-join'))}" target="_blank" rel="sponsored nofollow noopener">여기</a>를 눌러 가입합니다. 만 18세 이상만 가입할 수 있습니다.${db.referral ? ` 이 링크로 열면 추천인 코드 ${esc(db.referral)}가 들어간 가입 화면이 열리고, 안 들어가 있으면 '추천 코드' 칸에 직접 넣으십시오. 첫 구매가 12만원 이상이면 추가 할인이나 사은품을 받습니다. <a href="./referral.html">추천인 코드 보기</a>` : ''}`, shot('mp-referral-field.webp', '마이프로틴 회원가입 화면의 추천 코드 칸', '회원가입 화면 아래쪽의 \'추천 코드\' 칸.', 'tall'))}
  ${step('장바구니 담기', `${free} 미만이면 배송비가 붙습니다. 할인까지 뺀 금액이 ${SHOP.customsUsd}달러(${limitKrw})를 넘지 않게 맞추면 관세가 없습니다. <a href="./calc.html">계산기로 최종 금액 보기</a>`, shot('mp-customs-modal.webp', '마이프로틴 장바구니의 세관 통관 안내', '장바구니 위 \'세관 통관에 대한 정보\'를 누르면 나오는 안내: 건강보조제품 6개, 150달러.', 'mid'))}
  ${step('할인코드 넣기', `장바구니의 할인코드 칸에 코드를 넣습니다. 코드는 한 번에 하나만 들어가고, 오늘은 ${esc(codeTxt)}가 가장 높습니다. <a href="./code.html">오늘 할인코드 보기</a>`, shot('mp-cart-hidden-code.webp', '마이프로틴 장바구니에 히든코드를 적용한 화면', '11월 9일 90회분 1개에 히든코드를 넣은 장바구니: 37% 할인, 합계 137,317원(앱 쇼핑지원금 5,000원 포함). 코드 이름은 가렸습니다.') + shot('mp-cart-official-code.webp', '마이프로틴 장바구니에 공식 코드를 적용한 화면', '같은 장바구니에 공식 코드(SUPER35, 35%)를 넣으면 141,835원. 히든코드 쪽이 4,518원 쌉니다.'))}
  ${step('배송지와 개인통관고유부호', '받는 사람 이름과 전화번호는 개인통관고유부호에 등록된 것과 같게 적습니다. 부호는 관세청 유니패스에서 바로 발급됩니다.')}
  ${step('결제', '\'바로 구매\'를 누르면 로그인하거나 \'비회원으로 계속하기\'로 주문합니다. 장바구니에 보이는 결제 수단은 신용카드와 실시간 계좌이체(KCP)이고, 영국 회사라 카드사에 따라 해외 결제 수수료가 붙을 수 있습니다.', shot('mp-checkout-login.webp', '마이프로틴 바로 구매 첫 화면', '\'바로 구매\' 첫 화면: 로그인, 등록, 비회원으로 계속하기.'))}
  ${step('배송 확인', '출고 후 평균 2~6영업일 걸립니다. 발송 메일의 추적 링크, 내 계정의 주문 내역, 배송 조회 페이지(주문번호와 이메일 또는 우편번호)로 확인합니다. 통관이 끝나기 전에는 조회가 안 될 수 있습니다.', shot('mp-track-order.webp', '마이프로틴 배송 조회 페이지', '배송 조회 페이지: 주문번호와 이메일 또는 우편번호로 찾습니다.', 'mid'))}
  ${step('받은 뒤 확인', '파손되거나 잘못 온 물건은 바로 고객센터에 알립니다. 물건이 안 오면 출고 메일을 받은 날부터 21일 안에 알려야 합니다.')}
</ol>
</section>

<section class="full">
<h2>관세, 이것만 보면 됩니다</h2>
<div class="altWrap"><table class="alt"><thead><tr><th>기준</th><th>내용</th></tr></thead><tbody>
<tr><td class="nw"><b>면세 한도</b></td><td>물품 가격 ${SHOP.customsUsd}달러(${limitKrw}) 이하. 식품은 목록통관 대상이 아니라 미국 발송 200달러 기준이 적용되지 않습니다.</td></tr>
<tr><td class="nw"><b>넘으면</b></td><td>넘은 부분이 아니라 <b>전체 금액</b>에 관세와 부가세가 붙습니다.</td></tr>
<tr><td class="nw"><b>나눠 주문</b></td><td>같은 판매처에서 같은 날 산 걸 나눠 받으면 합쳐서 과세됩니다. 다른 날 주문한 건 같은 날 도착해도 따로 봅니다(2022년 11월 17일부터).</td></tr>
<tr><td class="nw"><b>6개 기준</b></td><td>마이프로틴 장바구니의 세관 안내로는 건강보조제품은 개인 사용 목적으로 6개까지 살 수 있습니다.</td></tr>
<tr><td class="nw"><b>5kg 이상</b></td><td>마이프로틴 안내로는 건강보조식품을 5kg 이상 주문해 한진택배로 받을 때 개인 소비용이라는 증빙을 요구받을 수 있습니다.</td></tr>
</tbody></table></div>
${shot('mp-delivery-info.webp', '마이프로틴 배송 안내 페이지', '마이프로틴 배송 안내: 8만원 이상 무료배송, 출고 후 평균 2~6영업일, 5kg 이상 증빙 안내.')}
<p class="hint">원화 금액은 1달러 ${SHOP.usdKrw.toLocaleString('ko-KR')}원으로 어림한 값이고, 실제로는 그 주 관세청 고시 환율로 계산합니다. 배송비를 과세 가격에 넣는지는 경우마다 달라서, 기준에 아슬아슬하면 금액을 넉넉히 낮추거나 관세청 고객지원센터(125)에 물어보십시오.</p>
</section>

<section class="full">
<h2>대란 때 직구한다면</h2>
<p class="lede">대란 때는 한 번에 많이 사서 ${SHOP.customsUsd}달러를 넘기기 쉽습니다. 90회분(약 2.5kg) 두 통이면 넘는 경우가 많으니, 계산기로 할인 후 금액을 먼저 보고 넘으면 날을 달리해 나눠 주문하십시오.${sureNext ? ` 다음 대란은 ${kdate(sureNext.date)}입니다.` : ''}</p>
${sureNext && sureNext.page ? `<a class="cta ghost" href="./${sureNext.page}">${kdate(sureNext.date)} 대란 일정과 방법</a>` : '<a class="cta ghost" href="./daeran.html">대란 일정 보기</a>'}
<a class="cta ghost" href="./calc.html">할인 계산기</a>
</section>

<section class="full">
<h2>자주 묻는 질문</h2>
${faqHtml(JK_FAQ)}
</section>

<section class="full">
<h2>확인한 곳</h2>
<ul class="steps">
  <li><a href="${MP_SRC.delivery}" target="_blank" rel="noopener nofollow">마이프로틴 배송 안내</a> 무료배송 기준, 배송 기간, 5kg 이상 증빙</li>
  <li><a href="${MP_SRC.terms}" target="_blank" rel="noopener nofollow">마이프로틴 이용약관</a> 결제 수단, 할인코드 1개, 관세 부담, 가입 나이</li>
  <li><a href="${MP_SRC.returns}" target="_blank" rel="noopener nofollow">마이프로틴 반품 안내</a> 14일 반품, 파손·미배송 신고, 환불 기간</li>
  <li><a href="https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&nttSn=10069842&nttSnUrl=search" target="_blank" rel="noopener nofollow">관세청 보도자료</a> 입항일이 같아도 합산과세 면제 (2022년 11월 17일부터)</li>
  <li><a href="https://www.consumer.go.kr/consumer/subIndex/1251.do" target="_blank" rel="noopener nofollow">소비자24</a> 건강기능식품 6병, ${SHOP.customsUsd}달러 면세 기준</li>
</ul>
<p class="hint">${dot(JK_CHECKED)}에 확인했습니다. 마이프로틴이나 관세청 기준이 바뀌면 다를 수 있습니다.</p>
</section>

<section>
<h2>관련 페이지</h2>
<a class="cta ghost" href="./code.html">오늘 쓸 수 있는 할인코드</a>
<a class="cta ghost" href="./calc.html">장바구니 최종 결제금액 계산</a>
<a class="cta ghost" href="./price.html">평소와 대란 가격 차이</a>
<a class="cta ghost" href="./taste.html">마이프로틴 맛 추천</a>
${IH ? '<a class="cta ghost" href="./iherb-jikgu.html">아이허브 직구 방법</a>' : ''}
</section>

${kakaoBox}
`,
  });
}

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
  ${TASTE && (TASTE.reviews || []).length ? '<li><a href="./taste-rank.html"><span class="m">맛 순위</span><span class="s">커뮤니티 후기로 매긴 순위</span></a></li>' : ''}
  ${PRODUCTS.length ? '<li><a href="./wpc-wpi.html"><span class="m">임팩트웨이 vs 아이솔레이트</span><span class="s">WPC·WPI 비교표</span></a></li>' : ''}
  ${altMp ? '<li><a href="./alternatives.html"><span class="m">마이프로틴 대안</span><span class="s">다른 브랜드 가성비 비교</span></a></li>' : ''}
  ${db.referral ? '<li><a href="./referral.html"><span class="m">추천인 코드</span><span class="s">가입 혜택</span></a></li>' : ''}
  <li><a href="./daeran.html"><span class="m">대란 기록</span><span class="s">${events.length}회 · 월별 정리</span></a></li>
  <li><a href="./blackfriday.html"><span class="m">블랙프라이데이</span><span class="s">${bfYear}년 ${kdate(bfDate)}</span></a></li>
  ${IH ? '<li><a href="./iherb.html"><span class="m">아이허브 할인코드</span><span class="s">입력 방법 · 관세 · 추천템</span></a></li>' : ''}
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
     `첫 구매가 12만원 이상이면 ${REF_BENEFIT}을 받습니다. 추천한 쪽은 적립금 5,000원을 받는 구조라, 이 사이트의 코드를 쓰면 그 적립금이 마프대란알리미에게 돌아갑니다. 구매 금액에는 차이가 없습니다.`],
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
<a class="cta hot" href="${esc(mpLink('pt-PAGE-join'))}" target="_blank" rel="sponsored nofollow noopener" data-copy="${b64(db.referral)}">${esc(db.referral)} 복사하고 가입하기</a>
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
      ? `지금 블랙프라이데이 주간입니다. 본행사는 ${kdate(bfDate)}, 사이버먼데이 ${kdate(cmDate)}까지 이어집니다. 오늘 ${pName || "할인코드"} ${last.base}%${isDaeran ? `로 대란 기준 ${TH}%${last.base > TH ? "를 넘었습니다" : "에 닿았습니다"}. ${waitTxt || '지금 사면 됩니다.'}` : `입니다. 대란 기준 ${TH}%까지 ${gap}%p 남았습니다.`}`
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
    title: `마이프로틴 블랙프라이데이 ${bfYear} (블프) | ${kdate(bfDate)} 일정 · 할인코드 · 가격 · 사이버먼데이`,
    keywords: ['마이프로틴 블랙프라이데이', '마이프로틴 블프', `마이프로틴 블랙프라이데이 ${bfYear}`, '마이프로틴 블랙프라이데이 할인코드', '마이프로틴 블프 할인코드', '마이프로틴 블프 가격', '마이프로틴 블프 날짜', '마이프로틴 블랙프라이데이 일정', '마이프로틴 블프 할인율', '마이프로틴 사이버먼데이', '마이프로틴 11월 세일'],
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

<section class="full">
<h2>블프 전에 해 둘 것</h2>
<ol class="steps">
  <li><b>앱 설치와 가입</b> 쇼핑지원금 같은 앱 전용 이벤트가 블프 전후에 열립니다.${db.referral ? ` 처음이면 <a href="./referral.html">추천인 코드 ${esc(db.referral)}</a>를 넣고 가입하면 ${esc(REF_BENEFIT)}도 받습니다.` : ''}</li>
  <li><b>장바구니 미리 담기</b> 블프 당일엔 품절이 빠릅니다. ${TASTE ? '<a href="./taste.html">맛 등급표</a>에서 ' : ''}먹어본 맛 위주로 담아 두십시오.</li>
  <li><b>금액 나누기</b> 150달러(약 ${won(SHOP.customsUsd * SHOP.usdKrw)})를 넘으면 관세가 붙을 수 있습니다.${calcWidget ? ' <a href="./calc.html">계산기</a>로 최종 금액을 보고 필요하면 날을 달리해 주문을 나누십시오.' : ''}</li>
  <li><b>알림 받기</b> 할인율이 바뀌는 즉시 단톡방과 유튜브에 올립니다. 당일 아침보다 전날 저녁에 바뀌는 경우가 많습니다.</li>
</ol>
</section>

${KEY_PRODUCTS.length && (bfPeak ?? peak) != null ? `<section class="full">
<h2>${bfPeak != null ? '블프 가격 (WPC·WPI)' : '블프 기준가 (WPC·WPI)'}</h2>
<p class="lede">${bfPeak != null ? `블프 주간 최고 할인코드 ${bfPeak}%를 지금 표시가(${dot(db.priceDate || last.date)})에 적용한 금액입니다.` : `블프 할인율은 아직 안 나왔습니다. 아래는 올해 대란 최고 할인코드 ${peak}%를 지금 표시가(${dot(db.priceDate || last.date)})에 적용한 금액입니다. 블프 가격이 나오면 이 금액보다 싼지부터 비교하십시오.`}</p>
${ratePriceRows(KEY_PRODUCTS, bfPeak ?? peak, bfPeak != null ? '블프가' : '기준가')}
<a class="cta ghost" href="./price.html">평소 가격과 비교하기</a>
</section>` : ''}

<section class="full">
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

// 수집 날짜가 자정 넘어 다음 날로 찍히면 RSS 날짜가 미래가 되므로, 지금 시각을 넘지 않게 합니다
const rfc822 = s => new Date(Math.min(Date.now(), new Date(s + 'T09:00:00+09:00').getTime())).toUTCString();
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
