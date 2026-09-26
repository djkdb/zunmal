/**
 * public/og.png (1200×630 링크 미리보기) 만들기 — 스카이 소다. 실제 게임의 말랑이 SVG 를 그대로 가져와 배치한다.
 *
 * 쓰는 법:
 *   npm run build && (cd dist && python3 -m http.server 4999) &
 *   npx -y -p playwright-core node scripts/render-og.mjs
 * 크로미움 경로는 CHROMIUM 환경 변수로 바꾼다 (기본: /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
 *
 * 글꼴: 제목 = Jua (node_modules/@fontsource/jua), 본문 = NanumSquareRound (src/assets/fonts/nanum-square-round-{400,800}.woff2).
 * 본문 글꼴 파일이 없으면 Jua 로 대신한다. 그림을 바꿀 때만 다시 실행한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.OG_BASE ?? 'http://localhost:4999/';
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = join(ROOT, 'public/og.png');

// ── 글꼴: 로컬 파일을 가짜 주소(/__og-fonts/…)로 내어 준다 ──
const JUA_DIR = join(ROOT, 'node_modules/@fontsource/jua');
const NANUM_DIR = join(ROOT, 'src/assets/fonts');
const juaCss = readFileSync(join(JUA_DIR, '400.css'), 'utf8').replaceAll('url(./files/', `url(${BASE}__og-fonts/jua/`);
const nanumWeights = [400, 800].filter((w) => existsSync(join(NANUM_DIR, `nanum-square-round-${w}.woff2`)));
const nanumCss = nanumWeights
  .map(
    (w) =>
      `@font-face{font-family:'NanumSquareRound';font-weight:${w === 400 ? '100 599' : '600 900'};font-style:normal;` +
      `src:url(${BASE}__og-fonts/nanum/nanum-square-round-${w}.woff2) format('woff2');}`,
  )
  .join('\n');
const BODY_FONT = nanumWeights.length > 0 ? "'NanumSquareRound', 'Jua', sans-serif" : "'Jua', sans-serif";

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await ctx.route('**/__og-fonts/**', (route) => {
  const url = new URL(route.request().url());
  const [, , kind, file] = url.pathname.split('/');
  const dir = kind === 'jua' ? join(JUA_DIR, 'files') : NANUM_DIR;
  const path = join(dir, file ?? '');
  if (!file || !existsSync(path)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({
    path,
    contentType: file.endsWith('.woff2') ? 'font/woff2' : 'font/woff',
    headers: { 'access-control-allow-origin': '*' },
  });
});
const page = await ctx.newPage();
await page.goto(BASE);

// 도감에서 쓸 말랑이를 가진 저장을 만든다
const IDS = ['dream-unicorn', 'peach-mochi', 'soda-drop', 'galaxy-malang', 'phoenix', 'matcha-bean', 'moon-bunny'];
await page.evaluate((ids) => {
  const owned = {};
  for (const k of ids) owned[k] = { count: 1, shinyCount: 0, firstObtainedAt: 0 };
  const state = {
    coins: 0,
    ownedMalangs: owned,
    partnerId: ids[0],
    settings: { sfxOn: false, musicOn: false },
    unboxed: ids,
    playroom: { out: [], mat: 'sky-dots', props: [] },
  };
  localStorage.setItem('malang-gacha-save', JSON.stringify({ state, version: 8 }));
}, IDS);
await page.goto(`${BASE}#/collection`);
await page.reload();
await page.waitForTimeout(1500);

await page.evaluate(
  ({ juaCss, nanumCss, bodyFont }) => {
    const pick = (name) => {
      const b = [...document.querySelectorAll('button, a')].find((el) => el.textContent.trim().endsWith(name));
      const svg = b?.querySelector('svg.malang') || b?.querySelector('svg');
      return svg ? svg.outerHTML : '';
    };
    const m = {
      uni: pick('꿈빛 유니콘'),
      peach: pick('복숭아 모찌'),
      soda: pick('소다 방울'),
      galaxy: pick('은하 말랑'),
      phoenix: pick('불사조 말랑'),
      matcha: pick('말차 콩'),
      bunny: pick('달토끼 말랑'),
    };
    const put = (html, size, x, y) =>
      `<div class="og-m" style="width:${size}px;height:${size}px;left:${x}px;top:${y}px">${html}</div>`;
    const capsule = (top, x, y, size, rot) => `
      <svg class="og-cap" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg)" viewBox="-34 -34 68 68">
        <path d="M-30 0 A30 30 0 0 0 30 0 Z" fill="#fff" stroke="#1a4080" stroke-opacity="0.14" stroke-width="2"/>
        <path d="M-30 0 A30 30 0 0 1 30 0 Z" fill="${top}" stroke="#1a4080" stroke-opacity="0.14" stroke-width="2"/>
        <ellipse cx="-12" cy="-16" rx="8" ry="4.5" fill="#fff" opacity="0.7" transform="rotate(-30 -12 -16)"/>
        <rect x="-30" y="-2" width="60" height="4" rx="2" fill="#fff"/>
      </svg>`;
    const bubble = (x, y, r) =>
      `<i class="og-bubble" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px"></i>`;
    document.head.insertAdjacentHTML('beforeend', `<style>${juaCss}\n${nanumCss}</style>`);
    document.body.innerHTML = `
  <style>
    html, body { margin:0; background:#cfe6ff; }
    body::before, body::after { display:none !important; }
    .og { position:fixed; inset:0; width:1200px; height:630px; overflow:hidden; z-index:10;
      background: linear-gradient(180deg, #cfe6ff 0%, #eaf4ff 60%, #ffffff 100%); color:#22304a; font-family:${bodyFont}; }
    .og-bubble { position:absolute; border-radius:50%; background:rgba(255,255,255,.45); box-shadow: inset 0 0 0 2px rgba(255,255,255,.95); }
    .og-left { position:absolute; left:84px; top:118px; width:540px; }
    .og-eyebrow { margin:0; font-family:${bodyFont}; font-weight:800; font-size:22px; letter-spacing:.16em; color:#2f6dbf; }
    .og-logo { margin:14px 0 0; font-family:'Jua', sans-serif; font-weight:400; font-size:118px; line-height:1.02; letter-spacing:-0.02em; color:#22304a; white-space:nowrap; }
    .og-tag { margin:26px 0 0; font-size:34px; line-height:1.4; color:#56657f; font-weight:700; }
    .og-chips { display:flex; gap:14px; margin-top:34px; }
    .og-chip { white-space:nowrap; padding:10px 24px 11px; border-radius:999px; background:#fff; font-size:26px; font-weight:800; color:#22304a;
      box-shadow: 0 6px 14px rgba(26,64,128,.14); }
    .og-chip.pink { background:#ff9fb8; }
    .og-mat { position:absolute; left:660px; top:70px; width:480px; height:500px; border-radius:40px;
      background: radial-gradient(circle, #dbeaff 0 5px, transparent 5.5px) 0 0/44px 44px, radial-gradient(circle, #dbeaff 0 5px, transparent 5.5px) 22px 22px/44px 44px, #f6faff;
      box-shadow: inset 0 0 0 8px rgba(255,255,255,.9), 0 18px 44px rgba(26,64,128,.18); }
    .og-mat::after { content:''; position:absolute; inset:16px; border:3px dashed rgba(255,255,255,.95); border-radius:28px; }
    .og-glow { position:absolute; left:150px; top:60px; width:320px; height:320px; border-radius:50%;
      background: radial-gradient(circle, rgba(255,255,255,.95), rgba(255,214,107,.35) 48%, rgba(201,182,255,0) 70%); }
    .og-stand { position:absolute; border-radius:50%; background:#fff; box-shadow: 0 8px 18px rgba(26,64,128,.14); }
    .og-m { position:absolute; }
    .og-m svg { width:100% !important; height:100% !important; overflow:visible; }
    .og-cap { position:absolute; overflow:visible; filter: drop-shadow(0 6px 8px rgba(26,64,128,.18)); }
  </style>
  <div class="og">
    ${bubble(70, 64, 26)}${bubble(600, 560, 34)}${bubble(560, 92, 16)}${bubble(1150, 600, 22)}${bubble(40, 560, 18)}
    <div class="og-left">
      <p class="og-eyebrow">CAPSULE MALANG SHOP</p>
      <h1 class="og-logo">말랑 뽑기방</h1>
      <p class="og-tag">미니게임 하고 캡슐을 뽑아<br>말랑이를 모아요</p>
      <div class="og-chips"><span class="og-chip pink">무료</span><span class="og-chip">설치 없이 바로</span><span class="og-chip">말랑이 32종</span></div>
    </div>
    <div class="og-mat">
      <div class="og-glow"></div>
      <div class="og-stand" style="left:140px;top:262px;width:220px;height:40px"></div>
      ${put(m.uni, 270, 115, 50)}
      ${put(m.galaxy, 150, 16, 34)}
      ${put(m.phoenix, 150, 318, 26)}
      ${put(m.peach, 140, 30, 318)}
      ${put(m.soda, 124, 176, 344)}
      ${put(m.bunny, 134, 310, 326)}
      ${capsule('#ffd66b', 400, 214, 64, -14)}
      ${capsule('#8fc3ff', 26, 226, 52, 12)}
    </div>
  </div>`;
  },
  { juaCss, nanumCss, bodyFont: BODY_FONT },
);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT });
console.log(`saved ${OUT}${nanumWeights.length === 0 ? ' (본문 글꼴 파일이 없어 Jua 로 대신)' : ''}`);
await browser.close();
