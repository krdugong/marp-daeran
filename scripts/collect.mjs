// 할인율을 수집해 data/discount.json 에 하루치를 기록합니다.
//
//   자동 수집:  node scripts/collect.mjs
//   수동 입력:  node scripts/collect.mjs 41
//   시험 실행:  node scripts/collect.mjs --dry
//
// 주의: 아래 SOURCE 의 url 과 pattern 은 제가 실제로 확인한 값이 아닙니다.
// 먼저 --dry 로 돌려서 어떤 숫자가 잡히는지 눈으로 확인한 뒤 고정하십시오.
// 대상 사이트의 이용약관과 robots.txt 를 반드시 먼저 확인하십시오.

import fs from 'node:fs';
import path from 'node:path';

const SOURCE = {
  url: 'https://www.myprotein.co.kr/',
  // 페이지에서 "최대 42%" 같은 표기를 찾습니다. 실제 표기에 맞게 고치십시오.
  pattern: /최대\s*(\d{2})\s*%/g,
  // 할인율이 바뀌는 시각(현지 기준). 이 시각 이후 관측값은 다음 날짜로 기록합니다.
  rolloverHour: 19,
  // 비정상값 방어
  min: 20, max: 70,
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'data/discount.json');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const manual = args.find(a => /^\d{2}$/.test(a));

function today() {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  if (now.getUTCHours() >= SOURCE.rolloverHour) now.setUTCDate(now.getUTCDate() + 1);
  return now.toISOString().slice(0, 10);
}

async function scrape() {
  const res = await fetch(SOURCE.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; marp-daeran-bot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const found = [...html.matchAll(SOURCE.pattern)]
    .map(m => Number(m[1]))
    .filter(n => n >= SOURCE.min && n <= SOURCE.max);
  if (!found.length) throw new Error('할인율을 찾지 못했습니다. SOURCE.pattern 을 확인하십시오.');
  console.log('찾은 값:', [...new Set(found)].sort((a, b) => a - b).join(', '));
  return Math.max(...found); // 그날의 최대 할인율
}

const rate = manual ? Number(manual) : await scrape();
const date = today();
console.log(`${date} → ${rate}%`);
if (dry) process.exit(0);

const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const i = db.entries.findIndex(e => e.date === date);
const row = { date, rate, source: manual ? 'manual' : 'auto' };

if (i >= 0) {
  // 같은 날 여러 번 수집되면 더 높은 값을 남깁니다.
  if (rate <= db.entries[i].rate) { console.log('기존 값이 더 높아 유지합니다.'); process.exit(0); }
  db.entries[i] = row;
} else {
  db.entries.push(row);
}

db.entries.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
console.log('기록했습니다.');
