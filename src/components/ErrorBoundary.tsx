import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { BACKUP_SUFFIX } from '../lib/saveBackup';
import { SAVE_KEY } from '../store/persistence';
import { encodePersistedSave } from '../store/saveCode';
import './ErrorBoundary.css';

/**
 * 앱 전체 오류 경계. 화면을 그리다 오류가 나도 하얀 화면 대신 안내와 "다시 불러오기"를 보여 준다.
 * 저장소는 읽기만 한다 — 기록을 지우거나 덮지 않는다.
 * (React 오류 경계는 클래스로만 만들 수 있어 이 파일만 예외로 클래스를 쓴다.)
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[malang] 화면 오류', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

/** 스토어를 거치지 않고 저장 문자열(원본 → 백업 순)에서 기록 코드를 만든다 */
function codeFromStorage(): string | null {
  const read = (get: () => Storage, key: string) => {
    try {
      return get().getItem(key);
    } catch {
      return null;
    }
  };
  return (
    encodePersistedSave(read(() => localStorage, SAVE_KEY)) ??
    encodePersistedSave(read(() => sessionStorage, SAVE_KEY)) ??
    encodePersistedSave(read(() => localStorage, SAVE_KEY + BACKUP_SUFFIX))
  );
}

function CrashScreen() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reload = (home: boolean) => {
    if (home) window.location.hash = '#/';
    window.location.reload();
  };
  const copy = async () => {
    const next = codeFromStorage();
    setCode(next ?? '');
    if (!next) return;
    try {
      await navigator.clipboard.writeText(next);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="crash" role="alert" aria-labelledby="crash-title">
      <svg className="crash__capsule" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M18 60a42 42 0 0 1 84 0z" fill="var(--primary)" stroke="rgba(26,64,128,0.16)" strokeWidth="2.5" transform="rotate(-18 60 60) translate(0 -8)" />
        <path d="M18 60a42 42 0 0 0 84 0z" fill="#fff" stroke="rgba(26,64,128,0.16)" strokeWidth="2.5" transform="rotate(10 60 60) translate(0 8)" />
        <circle cx="46" cy="44" r="6" fill="#fff" opacity="0.8" />
      </svg>
      <h1 id="crash-title" className="crash__title">
        화면을 그리다 멈췄어요
      </h1>
      <p className="crash__text">기록은 이 기기에 그대로 있어요. 다시 불러오면 이어서 할 수 있어요.</p>
      <div className="crash__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={() => reload(false)}>
          다시 불러오기
        </button>
        <button type="button" className="btn btn--block" onClick={() => reload(true)}>
          홈에서 다시 시작
        </button>
      </div>
      <div className="crash__save">
        <p className="crash__text">계속 멈추면 기록 코드를 복사해 두세요. 다른 브라우저의 도감 맨 아래에서 불러올 수 있어요.</p>
        <button type="button" className="btn btn--small btn--lemon" onClick={() => void copy()}>
          {copied ? '복사했어요' : '기록 코드 복사'}
        </button>
        {code === '' && <p className="crash__text">이 기기에 저장된 기록이 없어요.</p>}
        {code && !copied && (
          <textarea
            className="crash__code"
            readOnly
            rows={3}
            value={code}
            aria-label="기록 코드 (길게 눌러 복사)"
            ref={(el) => el?.select()}
          />
        )}
      </div>
    </main>
  );
}
