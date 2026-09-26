import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import { runShare, shareMessage, type ShareContent, type ShareData, type ShareEnv } from '../lib/share';
import { ShareIcon } from './icons';
import './ShareButton.css';

type ShareNavigator = Navigator & { canShare?: (data: ShareData) => boolean };

/** 이 브라우저의 공유·클립보드 기능 (없으면 비워 둔다 → lib/share.ts 가 다음 방법으로) */
function browserShareEnv(): ShareEnv {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as ShareNavigator;
  const canShare = nav.canShare;
  return {
    share: typeof nav.share === 'function' ? (d) => nav.share(d) : undefined,
    canShare: typeof canShare === 'function' ? (d) => canShare.call(nav, d) : undefined,
    copy: typeof nav.clipboard?.writeText === 'function' ? (t) => nav.clipboard.writeText(t) : undefined,
  };
}

/** "링크를 복사했어요" 말풍선이 떠 있는 시간 */
const TOAST_MS = 2200;

interface ShareButtonProps {
  /** 보낼 글 (누를 때 만든다) */
  content: () => ShareContent;
  /** 버튼 글자 */
  label?: string;
  /** 버튼 클래스 (기본 작은 흰 버튼) */
  className?: string;
  /** 좁은 화면(350px 미만)에서는 아이콘만 (글자는 스크린리더용으로 남는다) */
  squeeze?: boolean;
  /** 말풍선 붙는 쪽 */
  align?: 'start' | 'end';
}

/**
 * 자랑하기 버튼: Web Share(글 + 주소) → 클립보드("링크를 복사했어요") → 직접 복사(글 상자).
 * 공유 창을 닫으면 아무 말도 하지 않는다. 결과 말풍선은 버튼 위에 뜬다(모달 안에서도 보이게 버튼과 같은 층).
 */
export function ShareButton({
  content,
  label = '자랑하기',
  className = 'btn btn--small btn--secondary',
  squeeze = false,
  align = 'end',
}: ShareButtonProps) {
  const [status, setStatus] = useState<'copied' | 'manual' | null>(null);
  const [manualText, setManualText] = useState('');
  const busyRef = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status !== 'copied') return;
    const id = window.setTimeout(() => setStatus(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (status !== 'manual') return;
    const box = boxRef.current;
    box?.focus({ preventScroll: true });
    box?.select();
  }, [status]);

  const onClick = async () => {
    // 공유 창이 떠 있는 동안 다시 누르면 브라우저가 오류를 낸다 — 한 번에 하나만
    if (busyRef.current) return;
    busyRef.current = true;
    sfx.button();
    const c = content();
    try {
      const outcome = await runShare(c, browserShareEnv());
      if (outcome === 'copied') setStatus('copied');
      else if (outcome === 'manual') {
        setManualText(shareMessage(c));
        setStatus('manual');
      } else setStatus(null);
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <span className={`share share--${align}`}>
      <button type="button" className={`${className} share-btn${squeeze ? ' share-btn--squeeze' : ''}`} onClick={onClick}>
        <ShareIcon size={20} />
        <span className="share-btn__label">{label}</span>
      </button>
      <span className="share__live" role="status" aria-live="polite">
        {status === 'copied' && <span className="share__toast">링크를 복사했어요</span>}
      </span>
      {status === 'manual' && (
        <span className="share__manual" role="group" aria-label="보낼 글">
          <span className="share__manual-hint">글을 길게 눌러 복사해요</span>
          <textarea ref={boxRef} className="share__text selectable" readOnly rows={5} value={manualText} />
          <button type="button" className="btn btn--small btn--secondary share__close" onClick={() => setStatus(null)}>
            닫기
          </button>
        </span>
      )}
    </span>
  );
}
