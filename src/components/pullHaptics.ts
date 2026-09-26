/**
 * 뽑기 연출용 짧은 진동. 지원하지 않는 기기(iOS Safari 등)나 움직임 줄이기에서는 아무것도 하지 않는다.
 * (공용 haptics 모듈이 생기면 그쪽으로 옮긴다)
 */
export function buzz(pattern: number | number[], reduced: boolean): void {
  if (reduced || typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 일부 앱 안 브라우저는 권한 문제로 예외를 던진다 — 진동은 없어도 된다
  }
}
