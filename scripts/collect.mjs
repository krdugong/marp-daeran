// 기본 할인율을 수집해 data/discount.json 에 하루치를 기록합니다.
//
//   자동 수집 시도:  node scripts/collect.mjs
//   수동 입력:       node scripts/collect.mjs 41
//   시험 실행:       node scripts/collect.mjs --dry
//
// 메인 배너의 공식 코드 할인율과 코드 이름을 읽습니다(2026-10-28 MP35 35%로 확인).
// 배너 문구가 바뀌면 못 읽을 수 있으니, 값이 이상하면 --dry로 먼저 확인하십시오.
// 마이프로틴은 상품 자체 할인과 코드 할인이 같이 표기되는 경우가 많아
// 엉뚱한 숫자를 집을 수 있습니다. 대상 사이트의 이용약관도 먼저 확인하십시오.
// 이 스크립트가 실패해도 페이지 생성은 계속되도록 워크플로에서 처리해 뒀습니다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectVideos } from './videos.mjs';

const SOURCE = {
  url: 'https://www.myprotein.co.kr/',
  // 2026년 10월 메인 배너 표기 기준. 예: "할인코드 'MP35' 입력시 최대 35% 추가 할인", "추가 최대 35% 할인코드"
  // 표기가 바뀌면 여기에 한 줄 추가하십시오.
  patterns: [
    /최대\s*(\d{2})\s*%\s*추가\s*할인/g,
    /추가\s*최대\s*(\d{2})\s*%\s*할인\s*코드/g,
    /코드\s*할인\s*최대\s*(\d{2})\s*%/g,
    // 2026-11 표기: "할인코드 입력시 추가 35% 할인 ... ㅣ 할인코드: SUPER35"
    /할인\s*코드\s*입력\s*시\s*(?:최대\s*)?추가\s*(?:최대\s*)?(\d{2})\s*%\s*할인/g,
  ],
  // 할인율 옆에 적힌 공식 코드 이름. 예: "추가 최대 35% 할인코드:MP35", "할인코드 'MP35' 입력시 최대 35%"
  // 못 찾아도 할인율 기록은 그대로 됩니다. 코드 이름은 영문 대문자·숫자 3~15자(영문 1자 이상)만 받습니다.
  codePatterns: [
    /추가\s*최대\s*(?<rate>\d{2})\s*%\s*할인\s*코드\s*[:：]\s*(?<code>(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,15})(?![A-Za-z0-9])/g,
    /할인\s*코드[^'"‘’“”A-Za-z0-9가-힣]{0,8}['"‘’“”](?<code>(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,15})['"‘’“”]\s*입력\s*시\s*최대\s*(?<rate>\d{2})\s*%/g,
    /할인\s*코드\s*입력\s*시\s*(?:최대\s*)?추가\s*(?:최대\s*)?(?<rate>\d{2})\s*%[^ㅣ|<]{0,80}[ㅣ|]\s*할인\s*코드\s*[:：]\s*(?<code>(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,15})(?![A-Za-z0-9])/g,
  ],
  rolloverHour: 19, // 할인율이 보통 바뀌는 한국 시각. 이후 관측값은 다음 날짜로 기록
  min: 20, max: 70, // 비정상값 방어
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/discount.json');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const manual = args.find(a => /^\d{2}$/.test(a));

// 저녁 7시가 지나면 다음 날짜로 기록합니다. 단, 그날 끝나는 코드에 untilTime(예: "23:59")이 있고 아직 안 끝났으면 그 시각까지는 오늘로 둡니다.
function today(codes = []) {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const day = now.toISOString().slice(0, 10), hm = now.toISOString().slice(11, 16);
  const extended = codes.some(c => c.until === day && c.untilTime && hm < c.untilTime);
  if (now.getUTCHours() >= SOURCE.rolloverHour && !extended) now.setUTCDate(now.getUTCDate() + 1);
  return now.toISOString().slice(0, 10);
}

async function scrape() {
  const res = await fetch(SOURCE.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; marp-daeran-bot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).replace(/&#0*39;|&#x0*27;|&apos;/gi, "'").replace(/&quot;/g, '"');
  const found = SOURCE.patterns.flatMap(p => [...html.matchAll(p)]).map(m => Number(m[1])).filter(n => n >= SOURCE.min && n <= SOURCE.max);
  if (!found.length) throw new Error('할인율을 찾지 못했습니다. SOURCE.patterns 를 확인하십시오.');
  const rate = Math.max(...found);
  // 그 할인율과 같이 적힌 코드 이름 중 가장 많이 나온 것 (태그 안 속성 글자와 태그를 뺀 글자 양쪽에서 찾음)
  const hay = html + '\n' + html.replace(/<[^>]+>/g, ' ');
  const count = {};
  for (const p of SOURCE.codePatterns) for (const m of hay.matchAll(p)) if (Number(m.groups.rate) === rate) count[m.groups.code] = (count[m.groups.code] || 0) + 1;
  const code = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
  console.log('찾은 값:', [...new Set(found)].sort((a, b) => a - b).join(', '), code ? `· 공식 코드 ${code}` : '· 공식 코드 이름은 못 찾음');
  return { rate, code };
}

// ── 제품 가격 기록 (data/prices.json) ──
// discount.json 의 products 상품 페이지에서 판매가와 정상가(취소선 가격)를 읽어 날짜별로 쌓습니다.
// 상품 페이지에는 용량 이름이 없어서, 정상가가 products 의 rrp 와 같은 옵션들을 그 용량으로 봅니다.
// 맛마다 값이 다르면 가장 많은 맛이 쓰는 값을 씁니다. 실패해도 할인율 수집은 계속됩니다.
const PRICE_FILE = path.join(ROOT, 'data/prices.json');
async function collectPrices(products, date) {
  const byUrl = {};
  for (const p of products) if (p.url && p.rrp) (byUrl[p.url] ||= []).push(p);
  const got = {};
  for (const [url, list] of Object.entries(byUrl)) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; marp-daeran-bot/1.0)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const variants = [];
      for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
        let j; try { j = JSON.parse(m[1]); } catch { continue; }
        const g = [j, ...(j['@graph'] || [])].find(o => o && o.hasVariant);
        if (!g) continue;
        for (const v of g.hasVariant) {
          const o = v.offers || {}, ps = o.priceSpecification || [];
          const rrp = ps.find(s => /Strikethrough|ListPrice/.test(s.priceType || ''))?.price ?? o.price;
          if (o.price > 0) variants.push({ price: Number(o.price), rrp: Number(rrp), stock: /InStock/.test(o.availability || '') });
        }
      }
      for (const p of list) {
        const vs = variants.filter(v => v.rrp === p.rrp && v.stock);
        if (!vs.length) { console.log(`가격: ${p.name} ${p.size} 옵션을 못 찾음 (정상가가 ${p.rrp}원에서 바뀌었을 수 있음)`); continue; }
        const count = {};
        for (const v of vs) count[v.price] = (count[v.price] || 0) + 1;
        const price = Number(Object.keys(count).sort((a, b) => count[b] - count[a] || b - a)[0]);
        got[`${p.name} ${p.size}`] = { price, rrp: p.rrp, low: Math.min(...vs.map(v => v.price)) };
      }
    } catch (e) { console.log(`가격: ${url} 읽기 실패 (${e.message})`); }
  }
  const n = Object.keys(got).length;
  console.log(`가격 ${n}개:`, Object.entries(got).map(([k, v]) => `${k} ${v.price}`).join(', '));
  if (!n || dry) return;
  const ph = fs.existsSync(PRICE_FILE) ? JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8')) : { _readme: '', entries: [] };
  ph._readme = '마이프로틴 제품 가격 기록입니다. 깃허브 자동 수집(collect.mjs)이 매일 채우니 직접 고칠 필요는 없습니다. price 는 상품 페이지 판매가(할인코드 넣기 전), rrp 는 취소선 정상가, low 는 그 용량에서 가장 싼 맛의 가격입니다. 키는 discount.json products 의 "이름 용량"입니다.';
  const i = ph.entries.findIndex(e => e.date === date);
  const row = { date, prices: { ...(i >= 0 ? ph.entries[i].prices : {}), ...got } };
  if (i >= 0) ph.entries[i] = row; else ph.entries.push(row);
  ph.entries.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(PRICE_FILE, JSON.stringify(ph, null, 2) + '\n');
}

// 수동 입력은 히든코드 할인율 그대로, 자동 수집은 공식 배너 코드 + hiddenCodeBonus 로 기록합니다.
const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!manual) await collectPrices(db.products || [], today(db.codes));
await collectVideos({ dry }); // 유튜브 최신 영상 (data/youtube.json)
const bonus = Number(db.hiddenCodeBonus || 0);
const got = manual ? null : await scrape();
const official = got ? got.rate : null;
const officialCode = got ? got.code : null;
const rate = manual ? Number(manual) : official + bonus;
const date = today(db.codes);
console.log(`${date} → ${manual ? `수동 ${rate}%` : `공식 ${official}% + 히든코드 보너스 ${bonus}%p = ${rate}%`}`);
if (dry) process.exit(0);

const i = db.entries.findIndex(e => e.date === date);
const row = manual ? { date, base: rate, source: 'manual' } : { date, base: rate, official, ...(officialCode && { officialCode }), source: 'auto' };

if (i >= 0) {
  const prev = db.entries[i];
  const prevRate = prev.base ?? prev.rate;
  // 할인율이 같아도, 자동 기록에 공식 코드 이름이 없거나 바뀌었으면 고쳐 씁니다
  const newCode = !manual && prev.source === 'auto' && rate === prevRate && officialCode && prev.officialCode !== officialCode;
  if (rate <= prevRate && !newCode) { console.log('기존 값이 같거나 더 높아 유지합니다.'); process.exit(0); }
  db.entries[i] = row;
} else {
  db.entries.push(row);
}
db.entries.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
console.log('기록했습니다.');
