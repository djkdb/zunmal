/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/<repo>/ 경로로 서빙되므로 base를 저장소 이름으로 맞춘다.
// 로컬 개발(dev)에서는 루트로 둔다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/zunmal/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
