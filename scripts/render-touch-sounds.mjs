// 놀이방 만지기 소리 오프라인 렌더 (소리를 다듬을 때 귀로·숫자로 확인하는 도구 — 앱 번들과 무관).
//
// 실제 MalangActor(2D 모드) + 손맛 목소리(audio/touchVoice) + 일회성 소리(audio/squish)를 가상 시계로 60fps 돌려
// OfflineAudioContext 로 WAV 를 굽고, 스펙트로그램 PNG 와 요약(정점 dBFS·대역 비율·DC·끝 잔향·남은 목소리)을 남긴다.
// 믹서는 sfx.ts 의 buildGraph 와 같은 사슬(효과음 버스 → 90Hz 저역 컷 → 컴프 → 리미터 → 안전 클리퍼).
//
// 쓰는 법: 개발 서버를 새로 띄운 뒤(모듈을 고친 뒤 띄운 채로 두면 HMR 타임스탬프 때문에 모듈이 둘이 된다)
//   npx vite --port 5311 --strictPort &
//   OUT=/tmp/squishfeel node scripts/render-touch-sounds.mjs
// 환경 변수: PORT(기본 5311), OUT(기본 ./squishfeel), CHROME(크롬 실행 파일), PLAYWRIGHT_DIR(playwright 가 있는 node_modules),
//            ONLY_STRESS=1 (겹침 시험만)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_DIR ?? '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve(process.env.OUT ?? 'squishfeel');
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT ?? '5311';
const SR = 48000;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[page]', m.text());
});
await page.goto(`http://127.0.0.1:${PORT}/#/nothing-here`);
await page.waitForTimeout(1500);

const GESTURES = {
  // 누르고 1.4초 버티다 놓기 (폼 스읍·들숨, 젤리 쮸웁·뾰잉, 찐득이 칙칙·쩍)
  press: { total: 4200, events: [{ t: 100, k: 'begin', x: 120, y: 105 }, { t: 1500, k: 'end' }] },
  // 위로 쭉 당겼다 잠깐 버티고 놓기
  pull: {
    total: 3600,
    events: [
      { t: 100, k: 'begin', x: 120, y: 100 },
      { t: 150, k: 'drag', to: 750, dx: 25, dy: -150 },
      { t: 1100, k: 'end' },
    ],
  },
  // 좌우로 문지르기 (3Hz)
  rub: {
    total: 2800,
    events: [
      { t: 100, k: 'begin', x: 120, y: 110 },
      { t: 150, k: 'rub', to: 1650, amp: 28, hz: 3.2 },
      { t: 1700, k: 'end' },
    ],
  },
};

const results = await page.evaluate(
  async ({ GESTURES, SR, onlyStress }) => {
    const V = await import('/src/audio/touchVoice.ts');
    const S = await import('/src/audio/squish.ts');
    const A = await import('/src/components/playroom/malangActor.ts');
    const M = await import('/src/data/materials.ts');
    const R = await import('/src/data/rarity.ts');
    const SH = await import('/src/components/malang/shapes.ts');
    const SFX = await import('/src/audio/sfx.ts');
    const TU = await import('/src/audio/tuning.ts');
    const C = await import('/src/data/characters.ts');

    // ── 가상 시계 (performance.now·setTimeout 을 오디오 시각에 맞춘다) ──
    let vnow = 0;
    let timers = [];
    let tid = 1;
    performance.now = () => vnow;
    window.setTimeout = (fn, ms = 0) => {
      const id = tid++;
      timers.push({ id, at: vnow + ms, fn });
      return id;
    };
    window.clearTimeout = (id) => {
      timers = timers.filter((t) => t.id !== id);
    };
    const runTimers = () => {
      for (;;) {
        const due = timers.filter((t) => t.at <= vnow).sort((a, b) => a.at - b.at);
        if (due.length === 0) break;
        timers = timers.filter((t) => t.at > vnow);
        for (const t of due) t.fn();
      }
    };

    const mixer = (ctx) => {
      const bus = ctx.createGain();
      bus.gain.value = SFX.BUS_LEVELS.sfx;
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 90;
      hpf.Q.value = 0.707;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 8;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.008;
      comp.release.value = 0.2;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -1.5;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.08;
      const clip = ctx.createWaveShaper();
      clip.curve = TU.softClipCurve();
      bus.connect(hpf);
      hpf.connect(comp);
      comp.connect(lim);
      lim.connect(clip);
      clip.connect(ctx.destination);
      return bus;
    };

    const character = C.CHARACTERS[0];
    const makeActor = (mat, left = 0) =>
      new A.MalangActor({
        character,
        shape: SH.SHAPES.round,
        fxSpec: R.TOUCH_FX.common,
        material: M.MATERIALS[mat],
        filling: null,
        shiny: false,
        reduced: () => false,
        level: () => 1,
        geom: () => ({ left, top: 0, size: 240 }),
        view: () => null,
        fx: () => null,
        requestFrame() {},
        pet() {},
        onChange() {},
      });

    const toWav = (data) => {
      const n = data.length;
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF');
      v.setUint32(4, 36 + n * 2, true);
      w(8, 'WAVE');
      w(12, 'fmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, SR, true);
      v.setUint32(28, SR * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      w(36, 'data');
      v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };

    // 하나의 장면: actors 마다 손짓 이벤트. 60fps 로 actor.frame + 목소리 update
    const render = async (totalMs, scenes) => {
      vnow = 0;
      timers = [];
      const ctx = new OfflineAudioContext(1, Math.ceil((SR * totalMs) / 1000), SR);
      const bus = mixer(ctx);
      S.setSquishOutput({ ctx, out: bus });
      V.setTouchVoiceOutput({ ctx, out: bus });
      const frames = Math.floor((totalMs / 1000) * 60);
      const dt = 1000 / 60;
      const log = [];
      const ps = scenes.map(() => ({ x: 0, y: 0, down: false }));
      for (let k = 1; k < frames; k++) {
        const at = k / 60;
        ctx.suspend(at).then(() => {
          try {
          vnow = at * 1000;
          runTimers();
          scenes.forEach((sc, i) => {
            const p = ps[i];
            for (const e of sc.events) {
              const tt = e.t;
              if (e.k === 'begin' && !e.done && vnow >= tt) {
                e.done = true;
                p.x = e.x + (sc.left ?? 0);
                p.y = e.y;
                p.down = true;
                sc.actor.begin('pointer', p.x, p.y, null);
                log.push(['begin v=' + V.activeTouchVoices(), vnow]);
              }
              if (e.k === 'drag' && vnow >= tt && vnow <= e.to + dt) {
                const f = Math.min(1, (vnow - tt) / (e.to - tt));
                const ease = f * f * (3 - 2 * f);
                const x = e.xs ?? p.bx ?? (p.bx = p.x);
                const y0 = p.by ?? (p.by = p.y);
                sc.actor.move(x + e.dx * ease, y0 + e.dy * ease);
              }
              if (e.k === 'rub' && vnow >= tt && vnow <= e.to) {
                const x0 = p.bx ?? (p.bx = p.x);
                const s = (vnow - tt) / 1000;
                sc.actor.move(x0 + e.amp * Math.sin(2 * Math.PI * e.hz * s), p.y + 5 * Math.sin(4 * Math.PI * e.hz * s));
              }
              if (e.k === 'end' && !e.done && vnow >= tt) {
                e.done = true;
                sc.actor.end(false);
                log.push(['end', vnow]);
              }
            }
            sc.actor.frame(dt, vnow, false);
          });
          } catch (err) {
            log.push(['ERR ' + err.message, vnow]);
          }
          ctx.resume();
        });
      }
      const buf = await ctx.startRendering();
      for (const sc of scenes) sc.actor.dispose();
      const left = V.activeTouchVoices();
      V.stopAllTouchVoices();
      return { data: buf.getChannelData(0), log, voicesLeft: left };
    };

    const out = [];
    if (!onlyStress) {
      for (const mat of ['slowRise', 'jelly', 'stretchy', 'sticky']) {
        for (const [g, spec] of Object.entries(GESTURES)) {
          const r = await render(spec.total, [{ actor: makeActor(mat), events: spec.events.map((e) => ({ ...e })) }]);
          out.push({ name: `${mat}-${g}`, wav: toWav(r.data), log: r.log, voicesLeft: r.voicesLeft });
        }
      }
    }
    // 겹침 시험: 네 마리를 거의 동시에 세게 당겼다 놓기 + 콕 연타 (목소리 상한 3 + 일회성 소리)
    const mats = ['jelly', 'stretchy', 'sticky', 'slowRise'];
    const scenes = mats.map((m, i) => ({
      actor: makeActor(m, i * 260),
      left: i * 260,
      events: [
        { t: 100 + i * 60, k: 'begin', x: 120, y: 100 },
        { t: 150 + i * 60, k: 'drag', to: 500 + i * 60, dx: 30, dy: -160 },
        { t: 900 + i * 40, k: 'end' },
      ],
    }));
    const r = await render(3500, scenes);
    out.push({ name: 'stress-4-at-once', wav: toWav(r.data), log: r.log, voicesLeft: r.voicesLeft });
    return out;
  },
  { GESTURES, SR, onlyStress: process.env.ONLY_STRESS === '1' },
);

// ── 분석 ──
function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const ai = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
      }
    }
  }
}
function analyse(x) {
  let peak = 0;
  let sum = 0;
  let sq = 0;
  let maxDiff = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    peak = Math.max(peak, Math.abs(v));
    sum += v;
    sq += v * v;
    if (i > 0) maxDiff = Math.max(maxDiff, Math.abs(v - x[i - 1]));
  }
  const N = 2048;
  const bands = { lt200: 0, b200_6k: 0, gt6k: 0 };
  const cent = [];
  for (let o = 0; o + N <= x.length; o += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fftMag(re, im);
    let e = 0;
    let c = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      e += p;
      c += p * f;
      if (f < 200) bands.lt200 += p;
      else if (f <= 6000) bands.b200_6k += p;
      else bands.gt6k += p;
    }
    if (e > 1e-6) cent.push(c / e);
  }
  const tot = bands.lt200 + bands.b200_6k + bands.gt6k || 1;
  // 끝 50ms 의 크기 (목소리가 멈췄나)
  let tail = 0;
  const tn = Math.floor(SR * 0.05);
  for (let i = x.length - tn; i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {
    peakDb: +db(peak).toFixed(2),
    rmsDb: +db(Math.sqrt(sq / x.length)).toFixed(1),
    dc: +(sum / x.length).toExponential(2),
    bandPct: {
      lt200: +((100 * bands.lt200) / tot).toFixed(1),
      '200-6k': +((100 * bands.b200_6k) / tot).toFixed(1),
      gt6k: +((100 * bands.gt6k) / tot).toFixed(1),
    },
    medianCentroidHz: cent.length ? Math.round(cent.sort((a, b) => a - b)[Math.floor(cent.length / 2)]) : 0,
    maxStepDb: +db(maxDiff).toFixed(1),
    tailPeakDb: +db(tail).toFixed(1),
    firstSample: x[0],
  };
}

const summary = [];
for (const r of results) {
  fs.writeFileSync(path.join(OUT, `${r.name}.wav`), Buffer.from(r.wav, 'base64'));
  const b = Buffer.from(r.wav, 'base64');
  const n = (b.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32767;
  const a = analyse(x);
  summary.push({ name: r.name, ...a, voicesLeft: r.voicesLeft, events: r.log.map(([k, t]) => `${k}@${Math.round(t)}`).join(' ') });
}
// ── 스펙트로그램 PNG (가로 = 시간, 세로 = 로그 주파수 80Hz~12kHz, 아래 = 파형 포락선) ──
const specs = [];
for (const r of results) {
  const b = Buffer.from(r.wav, 'base64');
  const n = (b.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32767;
  const N = 2048;
  const hop = 480;
  const H = 180;
  const cols = [];
  const env = [];
  for (let o = 0; o + N <= n; o += hop) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    let pk = 0;
    for (let i = 0; i < N; i++) {
      re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      if (i < hop) pk = Math.max(pk, Math.abs(x[o + i]));
    }
    fftMag(re, im);
    const col = [];
    for (let yb = 0; yb < H; yb++) {
      const f0 = 80 * Math.pow(12000 / 80, yb / H);
      const f1 = 80 * Math.pow(12000 / 80, (yb + 1) / H);
      const k0 = Math.max(1, Math.floor((f0 * N) / SR));
      const k1 = Math.max(k0 + 1, Math.ceil((f1 * N) / SR));
      let p = 0;
      for (let k = k0; k < k1; k++) p = Math.max(p, re[k] * re[k] + im[k] * im[k]);
      col.push(10 * Math.log10(p + 1e-12));
    }
    cols.push(col);
    env.push(pk);
  }
  specs.push({ name: r.name, cols, env, H, dur: n / SR });
}
const sp = await browser.newPage({ viewport: { width: 900, height: 300 } });
for (const s of specs) {
  const png = await sp.evaluate((s) => {
    const W = s.cols.length;
    const c = document.createElement('canvas');
    c.width = W + 60;
    c.height = s.H + 70;
    const g = c.getContext('2d');
    g.fillStyle = '#111';
    g.fillRect(0, 0, c.width, c.height);
    const img = g.createImageData(W, s.H);
    for (let xx = 0; xx < W; xx++) {
      for (let yy = 0; yy < s.H; yy++) {
        const v = s.cols[xx][s.H - 1 - yy];
        const t = Math.max(0, Math.min(1, (v + 30) / 80));
        const i = (yy * W + xx) * 4;
        img.data[i] = 255 * Math.min(1, t * 1.6);
        img.data[i + 1] = 255 * Math.max(0, t * 1.6 - 0.6);
        img.data[i + 2] = 255 * Math.max(0, 0.5 - Math.abs(t - 0.35)) * 1.6;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 50, 10);
    g.fillStyle = '#ccc';
    g.font = '10px sans-serif';
    for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) {
      const y = 10 + s.H - (Math.log(f / 80) / Math.log(12000 / 80)) * s.H;
      g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 4, y + 3);
      g.fillRect(44, y, 5, 1);
    }
    g.fillStyle = '#6cf';
    for (let xx = 0; xx < W; xx++) {
      const h = Math.max(0.5, s.env[xx] * 50);
      g.fillRect(50 + xx, 10 + s.H + 55 - h, 1, h);
    }
    g.fillStyle = '#fff';
    g.fillText(s.name + '  (' + s.dur.toFixed(1) + 's)', 52, 10 + s.H + 12);
    return c.toDataURL('image/png');
  }, s);
  fs.writeFileSync(path.join(OUT, `${s.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
}

console.table(summary.map((s) => ({ ...s, bandPct: JSON.stringify(s.bandPct) })));
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
await browser.close();
