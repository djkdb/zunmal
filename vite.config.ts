/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로(./)로 빌드해 어느 주소에 올려도 동작하게 한다.
// (GitHub Pages의 /zunmal/, Cloudflare Pages의 / 모두 가능)
// HashRouter를 쓰므로 실제 URL 경로는 항상 index.html 하나라서 상대 경로가 안전하다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  build: {
    // three.js 3D 연출(scene3d)은 신화 이상이 나올 때만 따로 받는 청크라 첫 화면과 무관하다.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
