/**
 * public/og.png (1200×630 링크 미리보기) 만들기 — 실제 게임의 말랑이 SVG를 그대로 가져와 배치한다.
 * 쓰는 법: npm run build → dist를 4999 포트로 띄움(python3 -m http.server 4999) →
 *   SP=<Cafe24Ssurround.woff가 있는 폴더> npx -y -p playwright-core node scripts/render-og.mjs
 * 크로미움 경로가 다르면 executablePath를 고친다. 그림을 바꿀 때만 다시 실행한다.
 */
import { chromium } from 'playwright-core';
const SP = process.env.SP;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await ctx.route('**/Cafe24Ssurround.woff', (x) => x.fulfill({ path: `${SP}/Cafe24Ssurround.woff`, contentType: 'font/woff', headers: { 'access-control-allow-origin': '*' } }));
const page = await ctx.newPage();
await page.goto('http://localhost:4999/');
await page.getByRole('button', { name: /시작하기/ }).click();
const ids = ['dream-unicorn', 'peach-mochi', 'soda-drop', 'galaxy-malang', 'phoenix', 'matcha-bean', 'moon-bunny', 'prism-seraph', 'milkyway-whale'];
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('malang-gacha-save'));
  const all = {};
  for (const k of ['dream-unicorn','peach-mochi','soda-drop','galaxy-malang','phoenix','matcha-bean','moon-bunny','prism-seraph','milkyway-whale']) all[k] = { count: 1, shinyCount: 0, firstObtainedAt: 0 };
  s.state.ownedMalangs = { ...s.state.ownedMalangs, ...all };
  localStorage.setItem('malang-gacha-save', JSON.stringify(s));
});
await page.goto('http://localhost:4999/#/collection'); await page.reload(); await page.waitForTimeout(1200);

await page.evaluate(() => {
  const pick = (name) => {
    const b = [...document.querySelectorAll('button, a')].find((el) => el.textContent.trim().endsWith(name));
    const svg = b?.querySelector('svg.malang') || b?.querySelector('svg');
    return svg ? svg.outerHTML : '';
  };
  const m = {
    uni: pick('꿈빛 유니콘'), peach: pick('복숭아 모찌'), soda: pick('소다 방울'), galaxy: pick('은하 말랑'),
    phoenix: pick('불사조 말랑'), matcha: pick('말차 콩'), bunny: pick('달토끼 말랑'), seraph: pick('프리즘 세라핌'), whale: pick('은하수 고래'),
  };
  const sized = (html, size, extra = '') => `<div class="og-m" style="width:${size}px;height:${size}px;${extra}">${html}</div>`;
  document.body.innerHTML = `
  <style>
    body { margin:0; }
    .og { position:relative; width:1200px; height:630px; overflow:hidden; background-color:#fff4e0; font-family:'Cafe24 Ssurround', sans-serif; color:#2b2233; }
    .og-awning { position:absolute; left:0; right:0; top:0; height:64px; background: repeating-linear-gradient(90deg, #ff7aa2 0 60px, #fffcf5 60px 120px); border-bottom:6px solid #2b2233; }
    .og-awning::after { content:''; position:absolute; left:0; right:0; bottom:-30px; height:30px; background: radial-gradient(circle at 30px 0, #ff7aa2 29px, #2b2233 30px, #2b2233 34px, transparent 35px) 0 0/120px 30px repeat-x, radial-gradient(circle at 30px 0, #fffcf5 29px, #2b2233 30px, #2b2233 34px, transparent 35px) 60px 0/120px 30px repeat-x; }
    .og-left { position:absolute; left:70px; top:128px; width:580px; }
    .og-small { display:inline-block; padding:6px 22px 8px; background:#ffd23f; border:5px solid #2b2233; border-radius:999px; font-size:40px; transform:rotate(-6deg); box-shadow:0 6px 0 #2b2233; }
    .og-logo { margin:10px 0 0; font-size:136px; line-height:1; color:#ff7aa2; -webkit-text-stroke:14px #2b2233; paint-order:stroke fill; text-shadow:0 12px 0 #2b2233; letter-spacing:-2px; }
    .og-tag { margin:30px 0 0; font-size:36px; line-height:1.35; }
    .og-chips { display:flex; gap:14px; margin-top:26px; }
    .og-chip { white-space:nowrap; padding:6px 20px 9px; border:4px solid #2b2233; border-radius:999px; background:#fffcf5; font-size:26px; }
    .og-chip.pink { background:#7ed957; }
    .og-stage { position:absolute; right:40px; top:96px; width:560px; height:520px; }
    .og-glow { position:absolute; left:130px; top:40px; width:300px; height:300px; border-radius:50%; background: radial-gradient(circle, rgba(255,255,255,.95), rgba(255,210,63,.55) 45%, rgba(185,140,255,0) 70%); }
    .og-shelf { position:absolute; left:10px; right:10px; bottom:34px; height:30px; background:#e9c99a; border:5px solid #2b2233; border-radius:14px; box-shadow:0 8px 0 #2b2233; }
    .og-m { position:absolute; }
    .og-m svg { width:100% !important; height:100% !important; overflow:visible; }
    .og-spr { position:absolute; width:26px; height:9px; border-radius:9px; opacity:.5; }
  </style>
  <div class="og">
    ${[['#ff7aa2',120,110,20],['#5cc8ff',520,560,-30],['#ffd23f',40,520,40],['#7ed957',640,120,-20],['#b98cff',690,560,30],['#ffa36b',560,140,10]].map(([c,x,y,r])=>`<i class="og-spr" style="background:${c};left:${x}px;top:${y}px;transform:rotate(${r}deg)"></i>`).join('')}
    <div class="og-awning"></div>
    <div class="og-left">
      <span class="og-small">말랑</span>
      <div class="og-logo">뽑기방</div>
      <p class="og-tag">미니게임 하고 캡슐을 뽑아<br>말랑이를 모아요</p>
      <div class="og-chips"><span class="og-chip pink">무료</span><span class="og-chip">설치 없이 바로</span><span class="og-chip">말랑이 32종</span></div>
    </div>
    <div class="og-stage">
      <div class="og-glow"></div>
      ${sized(m.uni, 280, 'left:140px;top:60px;')}
      ${sized(m.galaxy, 150, 'left:0px;top:40px;')}
      ${sized(m.phoenix, 150, 'left:410px;top:30px;')}
      ${sized(m.peach, 150, 'left:20px;top:300px;')}
      ${sized(m.soda, 130, 'left:150px;top:320px;')}
      ${sized(m.bunny, 140, 'left:280px;top:310px;')}
      ${sized(m.matcha, 130, 'left:410px;top:320px;')}
    </div>
    <div class="og-shelf" style="position:absolute;left:640px;right:40px;bottom:50px;"></div>
  </div>`;
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/home/user/zunmal/public/og.png' });
await browser.close();
