import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, hapticPattern, setHapticsEnabled, type HapticEnv, type HapticKind } from './haptics';

function env(overrides: Partial<HapticEnv> = {}): HapticEnv & { vibrate: ReturnType<typeof vi.fn> } {
  const vibrate = vi.fn(() => true);
  return { vibrate, reducedMotion: false, hasBeenActive: true, ...overrides } as HapticEnv & {
    vibrate: ReturnType<typeof vi.fn>;
  };
}

describe('haptic patterns', () => {
  it('모든 패턴은 비어 있지 않고, 양의 정수이며, 1초를 넘지 않는다', () => {
    for (const [kind, pattern] of Object.entries(HAPTIC_PATTERNS)) {
      expect(pattern.length, kind).toBeGreaterThan(0);
      expect(pattern.length % 2, `${kind}: 진동으로 끝나야 한다`).toBe(1);
      for (const ms of pattern) {
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(10);
      }
      expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000);
    }
  });

  it('등급이 높을수록 진동 총량이 크다', () => {
    const total = (k: HapticKind) => HAPTIC_PATTERNS[k].filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    expect(total('tap')).toBeLessThan(total('success'));
    expect(total('rare')).toBeLessThan(total('legendary'));
    expect(total('legendary')).toBeLessThan(total('epic'));
  });

  it('연구 노트의 기본값을 따른다', () => {
    expect(hapticPattern('tap')).toEqual([12]);
    expect(hapticPattern('success')).toEqual([12, 60, 18]);
    expect(hapticPattern('fail')).toEqual([30, 40, 30, 40, 30]);
  });

  it('돌려준 배열을 바꿔도 표는 그대로다', () => {
    const p = hapticPattern('success');
    p[0] = 999;
    expect(HAPTIC_PATTERNS.success[0]).toBe(12);
  });
});

describe('haptic()', () => {
  afterEach(() => setHapticsEnabled(true));

  it('지원 환경에서는 패턴으로 진동한다', () => {
    const e = env();
    expect(haptic('success', e)).toBe(true);
    expect(e.vibrate).toHaveBeenCalledWith([12, 60, 18]);
  });

  it('Vibration API가 없으면(iOS 등) 아무것도 하지 않는다', () => {
    expect(haptic('tap', { reducedMotion: false, hasBeenActive: true })).toBe(false);
  });

  it('움직임 줄이기, 사용자 입력 전, 설정 끔이면 진동하지 않는다', () => {
    const a = env({ reducedMotion: true });
    expect(haptic('tap', a)).toBe(false);
    const b = env({ hasBeenActive: false });
    expect(haptic('tap', b)).toBe(false);
    setHapticsEnabled(false);
    const c = env();
    expect(haptic('tap', c)).toBe(false);
    expect(a.vibrate).not.toHaveBeenCalled();
    expect(b.vibrate).not.toHaveBeenCalled();
    expect(c.vibrate).not.toHaveBeenCalled();
  });

  it('vibrate가 예외를 던져도 앱은 계속된다', () => {
    const e = env({
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(haptic('fail', e)).toBe(false);
  });

  it('브라우저 전역이 없는 환경(node)에서도 안전하다', () => {
    expect(haptic('tap')).toBe(false);
  });
});
