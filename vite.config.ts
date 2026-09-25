/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/<repo>/ 경로로 서빙되므로 base를 저장소 이름으로 맞춘다.
// 로컬 개발 서버(dev)에서만 루트로 둔다. preview는 배포와 같은 경로로 확인한다.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/zunmal/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
