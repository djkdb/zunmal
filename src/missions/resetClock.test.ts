import { describe, expect, it } from 'vitest';
import { formatRemaining, msUntilSeoulMidnight } from './resetClock';

describe('resetClock', () => {
  it('서울 자정까지 남은 시간', () => {
    // 2026-05-05 21:00 KST = 12:00 UTC → 3시간
    expect(msUntilSeoulMidnight(new Date('2026-05-05T12:00:00Z'))).toBe(3 * 3600 * 1000);
    // 서울 자정 정각이면 꼬박 하루
    expect(msUntilSeoulMidnight(new Date('2026-05-05T15:00:00Z'))).toBe(24 * 3600 * 1000);
    // 서울 23:59:30 → 30초
    expect(msUntilSeoulMidnight(new Date('2026-05-05T14:59:30Z'))).toBe(30 * 1000);
  });

  it('남은 시간 문구', () => {
    expect(formatRemaining(3 * 3600 * 1000 + 12 * 60 * 1000)).toBe('3시간 12분');
    expect(formatRemaining(2 * 3600 * 1000)).toBe('2시간');
    expect(formatRemaining(45 * 60 * 1000)).toBe('45분');
    expect(formatRemaining(30 * 1000)).toBe('1분');
    expect(formatRemaining(0)).toBe('1분');
  });
});
