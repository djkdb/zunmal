import { useCallback, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { MiniGameLobby } from '../components/MiniGameLobby';
import { MiniGameResult } from '../components/MiniGameResult';
import { getCharacter } from '../data/characters';
import { getMiniGame } from '../minigames/registry';
import type { MiniGame, MiniGameResultPayload } from '../minigames/types';
import { useGameStore, type MiniGameFinishResult } from '../store/useGameStore';
import './MiniGamePage.css';

export function MiniGamePage() {
  const { gameId } = useParams();
  if (!gameId) {
    return (
      <section className="page" aria-labelledby="lobby-title">
        <h1 id="lobby-title" className="page-title">
          미니게임
        </h1>
        <MiniGameLobby />
      </section>
    );
  }
  const game = getMiniGame(gameId);
  if (!game) return <Navigate to="/play" replace />;
  // key로 게임이 바뀌면 상태를 새로 시작
  return <MiniGameRunner key={game.id} game={game} />;
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'playing'; round: number }
  | { kind: 'result'; payload: MiniGameResultPayload; result: MiniGameFinishResult };

/**
 * 게임 실행 → 결과 처리.
 * 코인 계산/지급과 최고 기록 저장은 store.finishMiniGame이 담당하고, 게임은 점수만 보고한다.
 */
function MiniGameRunner({ game }: { game: MiniGame }) {
  const navigate = useNavigate();
  const partnerId = useGameStore((s) => s.partnerId);
  const finishMiniGame = useGameStore((s) => s.finishMiniGame);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const best = useGameStore((s) => s.miniGameRecords[game.id]?.bestScore ?? 0);
  const roundRef = useRef(0);
  const finishedRound = useRef(-1);

  const partner = partnerId ? getCharacter(partnerId) : undefined;

  const onFinish = useCallback(
    (payload: MiniGameResultPayload) => {
      // 같은 판에서 onFinish가 여러 번 호출돼도 한 번만 지급
      if (finishedRound.current === roundRef.current) return;
      finishedRound.current = roundRef.current;
      const result = finishMiniGame(game.id, payload.score);
      setPhase({ kind: 'result', payload, result });
    },
    [finishMiniGame, game.id],
  );

  const onExit = useCallback(() => {
    sfx.button();
    navigate('/play');
  }, [navigate]);

  if (!partner) return <Navigate to="/" replace />;

  if (phase.kind === 'intro') {
    const Icon = game.icon;
    return (
      <section className="page mg-intro" aria-labelledby="mg-intro-title">
        <div className="mg-intro__icon" aria-hidden="true">
          <Icon />
        </div>
        <h1 id="mg-intro-title" className="page-title">
          {game.name}
        </h1>
        <p className="mg-intro__desc">{game.description}</p>
        {game.controls && <p className="mg-intro__controls">{game.controls}</p>}
        <p className="mg-intro__best">{best > 0 ? `내 최고 기록 ${best.toLocaleString()}점` : '첫 도전이에요!'}</p>
        <button
          type="button"
          className="btn btn--primary btn--big btn--block"
          autoFocus
          onClick={() => {
            sfx.button();
            setPhase({ kind: 'playing', round: roundRef.current });
          }}
        >
          시작!
        </button>
        <button type="button" className="btn btn--small" onClick={onExit}>
          다른 게임 고르기
        </button>
      </section>
    );
  }

  if (phase.kind === 'result') {
    return (
      <MiniGameResult
        gameName={game.name}
        partner={partner}
        payload={phase.payload}
        result={phase.result}
        onRetry={() => {
          sfx.button();
          roundRef.current += 1;
          setPhase({ kind: 'playing', round: roundRef.current });
        }}
      />
    );
  }

  const Game = game.Component;
  return (
    <section className="page minigame-stage" aria-label={game.name}>
      <Game key={phase.round} partner={partner} onFinish={onFinish} onExit={onExit} sfx={sfx} />
    </section>
  );
}
