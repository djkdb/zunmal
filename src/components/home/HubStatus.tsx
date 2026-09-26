import { Link } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import type { HubState } from '../../goals/hubState';
import { BookIcon, CoinIcon, StarIcon } from '../icons';
import './HubStatus.css';

/**
 * 홈 상태 줄: 다음 뽑기까지 코인, 전설 이상까지 남은 뽑기, 도감 수집률. 칸마다 그곳으로 가는 링크.
 * 숫자가 먼저 눈에 들어오고 이름은 아래 작게.
 */
export function HubStatus({ hub }: { hub: HubState }) {
  const { collection } = hub;
  return (
    <nav className="hub-status" aria-label="진행 상황">
      <Link to={hub.canPull ? '/gacha' : '/play'} className="hub-status__cell" onClick={() => sfx.button()}>
        <span className="hub-status__value">
          <CoinIcon size={18} />
          {hub.canPull ? `${hub.pullsAffordable.toLocaleString()}번` : hub.coinsToPull.toLocaleString()}
        </span>
        <span className="hub-status__label">{hub.canPull ? '뽑을 수 있어요' : '뽑기까지 코인'}</span>
      </Link>
      <Link to="/gacha" className="hub-status__cell" onClick={() => sfx.button()}>
        <span className="hub-status__value">
          <StarIcon size={18} />
          {hub.pityLeft}회
        </span>
        <span className="hub-status__label">전설 이상까지</span>
      </Link>
      <Link to="/collection" className="hub-status__cell" onClick={() => sfx.button()}>
        <span className="hub-status__value">
          <BookIcon size={18} />
          {collection.owned}
          <span className="hub-status__of">/{collection.total}</span>
        </span>
        <span className="hub-status__label">도감 {collection.percent}%</span>
      </Link>
    </nav>
  );
}
