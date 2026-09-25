/**
 * Asia/Seoul 기준 달력 날짜 계산.
 * 한국 표준시(KST)는 1988년 이후 서머타임이 없어 UTC+9로 고정이므로
 * Intl/ICU에 의존하지 않고 오프셋으로 계산한다 (모든 환경에서 결정적).
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (Asia/Seoul) */
export function seoulDateKey(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
