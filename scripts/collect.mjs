// 기본 할인율을 수집해 data/discount.json 에 하루치를 기록합니다.
//
//   자동 수집 시도:  node scripts/collect.mjs
//   수동 입력:       node scripts/collect.mjs 41
//   시험 실행:       node scripts/collect.mjs --dry
//
// 주의: 아래 SOURCE 의 url과 pattern은 제가 실제로 검증한 값이 아닙니다.
// 먼저 --dry로 돌려서 어떤 숫자가 잡히는지 눈으로 확인한 뒤 고정하십시오.
// 마이프로틴은 상품 자체 할인과 코드 할인이 같이 표기되는 경우가 많아
// 엉뚱한 숫자를 집을 수 있습니다. 대상 사이트의 이용약관도 먼저 확인하십시오.
// 이 스크립트가 실패해도 페이지 생성은 계속되도록 워크플로에서 처리해 뒀습니다.

import fs from 'node:fs';
import path from 'node:path';

const SOURCE = {
  url: 'https://www.myprotein.co.kr/',
  pattern: /코드\s*할인\s*최대\s*(\d{2})\s*%/g, // 실제 표기에 맞게 고치십시오
  rolloverHour: 19, // 할인율이 보통 바뀌는 한국 시각. 이후 관측값은 다음 날짜로 기록
  min: 20, max: 70, // 비정상값 방어
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'data/discount.json');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const manual = args.find(a => /^\d{2}$/.test(a));

function today() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  if (now.getUTCHours() >= SOURCE.rolloverHour) now.setUTCDate(now.getUTCDate() + 1);
  return now.toISOString().slice(0, 10);
}

async function scrape() {
  const res = await fetch(SOURCE.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; marp-daeran-bot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const found = [...html.matchAll(SOURCE.pattern)].map(m => Number(m[1])).filter(n => n >= SOURCE.min && n <= SOURCE.max);
  if (!found.length) throw new Error('할인율을 찾지 못했습니다. SOURCE.pattern 을 확인하십시오.');
  console.log('찾은 값:', [...new Set(found)].sort((a, b) => a - b).join(', '));
  return Math.max(...found);
}

const rate = manual ? Number(manual) : await scrape();
const date = today();
console.log(`${date} → ${rate}%`);
if (dry) process.exit(0);

const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const i = db.entries.findIndex(e => e.date === date);
const row = { date, base: rate, source: manual ? 'manual' : 'auto' };

if (i >= 0) {
  if (rate <= (db.entries[i].base ?? db.entries[i].rate)) { console.log('기존 값이 더 높아 유지합니다.'); process.exit(0); }
  db.entries[i] = row;
} else {
  db.entries.push(row);
}
db.entries.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
console.log('기록했습니다.');
