import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import type { Character } from '../data/characters';
import { runShare, shareMessage, type ShareCardText, type ShareContent, type ShareData, type ShareEnv } from '../lib/share';
import { CheckIcon, ShareIcon } from './icons';
import { Malang } from './Malang';
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

/** 그림 파일을 공유할 수 있는 브라우저인가 (모바일 Chrome·Safari). 아니면 카드 그림을 만들지도 않는다 */
function canShareImages(): boolean {
  try {
    const nav = navigator as ShareNavigator;
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    return nav.canShare({ title: '', text: '', url: '', files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** "복사했어요" 표시가 버튼에 머무는 시간 */
const TOAST_MS = 2200;

/** 누른 뒤 카드 그림을 기다리는 최대 시간 — 넘기면 글만 보낸다 (공유 창은 사용자 입력 직후에만 열린다) */
const CARD_WAIT_MS = 1200;

/** 자랑 카드 그림에 넣을 말랑이 */
export interface ShareCardSpec {
  character: Character;
  shiny: boolean;
  text: ShareCardText;
}

interface ShareButtonProps {
  /** 보낼 글 (누를 때 만든다) */
  content: () => ShareContent;
  /** 있으면 그림(카드 PNG)도 함께 보낸다 — 파일 공유가 되는 브라우저에서만 */
  card?: ShareCardSpec;
  /** 버튼 글자 */
  label?: string;
  /** 버튼 클래스 (기본 작은 흰 버튼) */
  className?: string;
  /** 좁은 화면(350px 미만)에서는 아이콘만 (글자는 스크린리더용으로 남는다) */
  squeeze?: boolean;
  /** 직접 복사 상자가 붙는 쪽 */
  align?: 'start' | 'end';
}

interface CardEntry {
  key: string;
  file: File | null;
  promise: Promise<File | null>;
}

/**
 * 자랑하기 버튼: [그림 + 글 + 주소(파일 공유)] → Web Share(글 + 주소) → 클립보드 → 직접 복사(글 상자).
 * 카드 그림은 버튼이 보이면 한가할 때 미리 만들어 둔다(`components/share/shareCard.ts`, 지연 청크) — 공유 창은 누른 직후에만 열려서.
 * 공유 창을 닫으면 아무 말도 하지 않는다. 복사하면 버튼 글자가 잠깐 "복사했어요"로 바뀐다(말풍선이 옆 버튼을 가리지 않게).
 */
export function ShareButton({
  content,
  card,
  label = '자랑하기',
  className = 'btn btn--small btn--secondary',
  squeeze = false,
  align = 'end',
}: ShareButtonProps) {
  const [status, setStatus] = useState<'copied' | 'manual' | null>(null);
  const [manualText, setManualText] = useState('');
  const [images] = useState(canShareImages);
  const busyRef = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const srcRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<CardEntry | null>(null);
  const withCard = images && card !== undefined;
  const cardKey = card?.text.key;
  const specRef = useRef(card);
  specRef.current = card;

  const prepareCard = (): CardEntry | null => {
    const spec = specRef.current;
    if (!withCard || !spec) return null;
    if (cardRef.current?.key === spec.text.key) return cardRef.current;
    const entry: CardEntry = { key: spec.text.key, file: null, promise: Promise.resolve(null) };
    entry.promise = (async () => {
      try {
        const svg = srcRef.current?.querySelector<SVGSVGElement>('svg');
        if (!svg) return null;
        const mod = await import('./share/shareCard');
        const file = await mod.renderShareCard({ svg, character: spec.character, shiny: spec.shiny, text: spec.text });
        entry.file = file;
        return file;
      } catch {
        return null; // 그림을 못 만들면 글만 보낸다
      }
    })();
    cardRef.current = entry;
    return entry;
  };

  // 버튼이 보이면(또는 말랑이가 바뀌면) 한가할 때 그림을 미리 만든다
  useEffect(() => {
    if (!withCard) return;
    // Safari 에는 requestIdleCallback 이 없다
    const idle = typeof window.requestIdleCallback === 'function';
    const id = idle
      ? window.requestIdleCallback(() => void prepareCard(), { timeout: 900 })
      : window.setTimeout(() => void prepareCard(), 300);
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [withCard, cardKey]);

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

  const cardFiles = async (): Promise<File[] | undefined> => {
    const entry = prepareCard();
    if (!entry) return undefined;
    const file =
      entry.file ??
      (await Promise.race([entry.promise, new Promise<null>((r) => window.setTimeout(() => r(null), CARD_WAIT_MS))]));
    return file ? [file] : undefined;
  };

  const onClick = async () => {
    // 공유 창이 떠 있는 동안 다시 누르면 브라우저가 오류를 낸다 — 한 번에 하나만
    if (busyRef.current) return;
    busyRef.current = true;
    sfx.button();
    const c = content();
    try {
      const files = await cardFiles();
      const outcome = await runShare(c, browserShareEnv(), files);
      if (outcome === 'copied') setStatus('copied');
      else if (outcome === 'manual') {
        setManualText(shareMessage(c));
        setStatus('manual');
      } else setStatus(null);
    } finally {
      busyRef.current = false;
    }
  };

  const copied = status === 'copied';
  return (
    <span className={`share share--${align}`}>
      <button
        type="button"
        className={`${className} share-btn${squeeze ? ' share-btn--squeeze' : ''}${copied ? ' is-copied' : ''}`}
        onClick={onClick}
        onPointerDown={() => void prepareCard()}
      >
        {copied ? <CheckIcon size={20} /> : <ShareIcon size={20} />}
        <span className="share-btn__label">{copied ? '복사했어요' : label}</span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? '링크를 복사했어요' : ''}
      </span>
      {withCard && card && (
        // 카드 그림용 원본: 화면 밖(보이지 않게) 정지 그림 한 마리
        <span ref={srcRef} className="share__src" aria-hidden="true">
          <Malang character={card.character} size={240} animation="none" decorative shiny={card.shiny} aura="auto" />
        </span>
      )}
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
