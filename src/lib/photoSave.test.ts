import { describe, expect, it } from 'vitest';
import { detectInstallEnv } from './installEnv';
import { afterShareFailed, photoSaveMethod } from './photoSave';

const UA = {
  iosInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5; iOS 17_5; ko_KR; ko)',
  iosKakao:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Instagram 330.0.0.0 Android',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const env = (userAgent: string, standalone = false) => detectInstallEnv({ userAgent, standalone });

describe('photoSaveMethod', () => {
  it('파일 공유가 되면 공유 창', () => {
    for (const ua of Object.values(UA)) expect(photoSaveMethod(env(ua), true)).toBe('share');
  });

  it('iOS·앱 안 브라우저(공유 없음)는 길게 눌러 저장 — 내려받기는 조용히 실패한다', () => {
    expect(photoSaveMethod(env(UA.iosInstagram), false)).toBe('long-press');
    expect(photoSaveMethod(env(UA.iosKakao), false)).toBe('long-press');
    expect(photoSaveMethod(env(UA.androidInstagram), false)).toBe('long-press');
    expect(photoSaveMethod(env(UA.iosSafari), false)).toBe('long-press');
    expect(photoSaveMethod(env(UA.iosSafari, true), false)).toBe('long-press');
  });

  it('안드로이드 Chrome·데스크톱은 내려받기', () => {
    expect(photoSaveMethod(env(UA.androidChrome), false)).toBe('download');
    expect(photoSaveMethod(env(UA.desktop), false)).toBe('download');
  });

  it('공유가 실패하면: 내려받기가 되는 곳은 내려받기, 아니면 길게 누르기', () => {
    expect(afterShareFailed(env(UA.desktop))).toBe('download');
    expect(afterShareFailed(env(UA.iosInstagram))).toBe('long-press');
  });
});
