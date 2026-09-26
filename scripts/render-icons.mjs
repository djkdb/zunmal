/**
 * public/icon.svg → PNG 아이콘 (홈 화면용). 아이콘 그림을 바꿨을 때만 실행한다.
 *   npx -y -p playwright-core node scripts/render-icons.mjs  (CHROMIUM 환경변수로 실행 파일 지정 가능)
 * 마스크 아이콘은 가장자리가 잘려도 되도록 그림을 80%로 줄여 가운데 둔다.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  ['icon-maskable-512.png', 512, 0.8],
];
for (const [name, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:#fff4e0;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
     </body>`,
  );
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
  console.log('wrote', name);
}
await browser.close();
