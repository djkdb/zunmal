/**
 * 새 미션까지 남은 시간 (서울 자정 기준). 한국 표준시는 UTC+9 고정이라 오프셋으로 계산한다. (순수 함수)
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function msUntilSeoulMidnight(now: Date): number {
  const sinceMidnight = (((now.getTime() + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight;
}

/** "3시간 12분" / "45분" / "1분" — 분은 올림해서 0분이 나오지 않게 한다 */
export function formatRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
