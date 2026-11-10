// 마프대란알리미 유튜브 채널의 최신 영상 목록을 data/youtube.json 에 기록합니다.
//
//   직접 실행:  node scripts/videos.mjs
//   시험 실행:  node scripts/videos.mjs --dry
//
// collect.mjs 가 매번 같이 부르므로 깃허브 자동 실행(하루 4번)마다 최신 영상이 반영됩니다.
// 유튜브 RSS 가 막혀 있어(2026-11 기준 404) 채널의 '동영상' 탭 페이지를 읽습니다.
// 날짜는 페이지에 "3일 전"처럼만 나와서 처음 본 날 기준으로 계산하고, 한 번 적은 날짜는 바꾸지 않습니다.
// 실패해도 다른 수집과 페이지 생성은 그대로 진행됩니다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/youtube.json');
const KEEP = 15;

const kstNow = () => new Date(Date.now() + 9 * 3600e3);
// "15시간 전", "11일 전", "1개월 전" → 한국 날짜 (대략)
function ageToDate(text, now = kstNow()) {
  const m = String(text).match(/(\d+)\s*(초|분|시간|일|주|개월|년)\s*전/);
  if (!m) return null;
  const n = Number(m[1]);
  const ms = { 초: 1e3, 분: 60e3, 시간: 3600e3, 일: 86400e3, 주: 7 * 86400e3, 개월: 30 * 86400e3, 년: 365 * 86400e3 }[m[2]];
  return new Date(now.getTime() - n * ms).toISOString().slice(0, 10);
}

export async function collectVideos({ dry = false } = {}) {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
  const channel = (site.youtubeChannel || '').match(/channel\/(UC[\w-]{22})/)?.[1];
  if (!channel) { console.log('영상: site.json youtubeChannel 에서 채널 ID를 못 찾음'); return; }
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channel}/videos`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; marp-daeran-bot/1.0)', 'accept-language': 'ko-KR,ko;q=0.9' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const raw = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)?.[1];
    if (!raw) throw new Error('ytInitialData 없음');
    const found = [];
    const walk = o => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o.lockupViewModel) {
        const v = o.lockupViewModel, md = v.metadata?.lockupMetadataViewModel;
        const parts = (md?.metadata?.contentMetadataViewModel?.metadataRows || []).flatMap(r => (r.metadataParts || []).map(p => p.text?.content || ''));
        if (/^[\w-]{11}$/.test(v.contentId || '') && md?.title?.content) found.push({ id: v.contentId, title: md.title.content, age: parts.find(t => /전$/.test(t)) || '' });
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(JSON.parse(raw));
    if (!found.length) throw new Error('영상 목록을 못 찾음 (페이지 구조가 바뀌었을 수 있음)');
    const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { videos: [] };
    const known = Object.fromEntries((old.videos || []).map(v => [v.id, v]));
    const videos = found.slice(0, KEEP).map(v => ({ id: v.id, title: v.title, date: known[v.id]?.date || ageToDate(v.age) || kstNow().toISOString().slice(0, 10) }));
    const fresh = videos.filter(v => !known[v.id]);
    console.log(`영상 ${videos.length}개 · 새 영상 ${fresh.length}개${fresh.length ? ': ' + fresh.map(v => v.title).join(' / ') : ''}`);
    // 목록이 그대로면 파일을 안 건드립니다 (자동 실행마다 의미 없는 커밋이 생기지 않게)
    if (dry || JSON.stringify(videos) === JSON.stringify(old.videos)) return;
    const out = {
      _readme: '마프대란알리미 유튜브 채널의 최신 영상 목록입니다. scripts/videos.mjs 가 자동 실행마다 채우니 직접 고칠 필요는 없습니다. 맨 앞이 가장 최근 영상이고, date 는 처음 발견한 날 기준으로 계산한 업로드 날짜(대략)입니다. updated 는 목록이 마지막으로 바뀐 시각입니다. 홈의 유튜브 칸과 월별 대란 페이지 영상에 같이 쓰입니다.',
      updated: kstNow().toISOString().slice(0, 16).replace('T', ' '),
      videos,
    };
    fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
  } catch (e) { console.log(`영상: 읽기 실패 (${e.message})`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await collectVideos({ dry: process.argv.includes('--dry') });
