/** 카운트다운 오버레이. 부모는 position: relative 여야 한다. */
export function Countdown({ count }: { count: number }) {
  if (count < 0) return null;
  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={count}>{count === 0 ? '시작!' : count}</span>
    </div>
  );
}
