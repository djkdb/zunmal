/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * @fontsource 글꼴 CSS는 조각마다 woff2 + woff(구형 대비)를 함께 적는다. 4kB 아래 woff 조각은 Vite가 data: URL로
 * 첫 화면 CSS에 박아 넣어 ~80kB(gzip ~55kB)가 불어나는데, woff2를 못 읽는 브라우저는 우리가 지원하지 않으므로 woff 쪽을 지운다.
 */
function woff2Only(): Plugin {
  return {
    name: 'woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource[\\/].+\.css$/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
    },
  };
}

// 상대 경로(./)로 빌드해 어느 주소에 올려도 동작하게 한다.
// (GitHub Pages의 /zunmal/, Cloudflare Pages의 / 모두 가능)
// HashRouter를 쓰므로 실제 URL 경로는 항상 index.html 하나라서 상대 경로가 안전하다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [woff2Only(), react()],
  build: {
    // 글꼴 조각은 data: URL로 박지 않는다 — 유니코드 범위 조각은 그 글자가 화면에 나올 때만 받아야 첫 화면 CSS가 가볍다
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    // three.js 3D 연출(scene3d)은 신화 이상이 나올 때만 따로 받는 청크라 첫 화면과 무관하다.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
