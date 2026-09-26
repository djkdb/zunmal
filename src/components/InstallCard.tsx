import { useEffect, useMemo, useState } from 'react';
import { canPromptInstall, promptInstall, subscribeInstall, wasInstalled } from '../app/installPrompt';
import { sfx } from '../audio/sfx';
import { useGameStore } from '../store/useGameStore';
import { SaveCopyButton } from './SaveTransfer';
import { IN_APP_LABEL, detectInstallEnv, externalBrowserUrl, openInBrowserSteps, type InstallEnv } from '../lib/installEnv';
import { CloseIcon, HomeAddIcon, MoreIcon, ShareIcon } from './icons';
import './InstallCard.css';

const DISMISS_KEY = 'malang-install-dismissed-at';
/** 닫으면 이 기간 동안 다시 보이지 않는다 (앱 안 브라우저 안내는 닫아도 다음 방문에 다시) */
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function currentEnv(): InstallEnv {
  if (typeof window === 'undefined') return { kind: 'desktop' };
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectInstallEnv({ userAgent: navigator.userAgent, standalone, maxTouchPoints: navigator.maxTouchPoints });
}

/**
 * 홈 화면 추가 안내.
 * - 인스타그램 등 앱 안 브라우저: 홈 화면에 추가할 수 없고 기록도 따로 저장되므로 "브라우저로 열기"부터
 * - 안드로이드 Chrome: 설치 창 바로 띄우기
 * - iOS Safari: 공유 → 홈 화면에 추가 순서 안내
 * - 이미 앱으로 열었거나 데스크톱이면 보이지 않는다
 * slot: 앱 안 브라우저 안내는 주요 버튼 바로 아래, 설치 카드는 홈 맨 아래에 둔다.
 */
export function InstallCard({ slot }: { slot: 'in-app' | 'install' }) {
  const env = useMemo(currentEnv, []);
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);
  // 뽑기나 미니게임을 한 번이라도 했으면 옮겨 갈 기록이 있다
  const hasProgress = useGameStore(
    (s) => s.totalPulls > 0 || Object.values(s.miniGameRecords).some((r) => r.plays > 0),
  );

  useEffect(() => subscribeInstall(() => force((n) => n + 1)), []);

  if (env.kind === 'standalone' || env.kind === 'desktop' || wasInstalled()) return null;

  if (env.kind === 'in-app') {
    if (slot !== 'in-app') return null;
    const appName = IN_APP_LABEL[env.app];
    const openUrl = externalBrowserUrl(window.location.href, env.os);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(window.location.href.split('#')[0] ?? window.location.href);
        setCopied(true);
      } catch {
        setShowSteps(true);
      }
    };
    // 버튼으로 바로 못 여는 곳(iOS 16 이하 등은 버튼이 있어도 안 열릴 수 있다)을 위해 메뉴 순서는 "자세히"에 접어 둔다.
    // 바로 여는 주소가 없으면 처음부터 펼친다.
    const detailsOpen = showSteps || !openUrl;
    return (
      <aside className="install install--inapp" aria-labelledby="install-inapp-title">
        <p id="install-inapp-title" className="install__title">
          {appName} 안에서 열렸어요
        </p>
        <p className="install__text">브라우저로 열어야 기록이 안전하고 홈 화면에 추가할 수 있어요.</p>
        <div className="install__actions">
          {openUrl && (
            <a className="btn btn--primary btn--small" href={openUrl} onClick={() => sfx.button()}>
              브라우저로 열기
            </a>
          )}
          <button type="button" className="btn btn--secondary btn--small" onClick={() => void copy()}>
            {copied ? '복사했어요' : '링크 복사'}
          </button>
          {openUrl && (
            <button
              type="button"
              className="install__more"
              aria-expanded={detailsOpen}
              aria-controls="install-inapp-details"
              onClick={() => {
                sfx.button();
                setShowSteps((v) => !v);
              }}
            >
              {detailsOpen ? '접기' : '자세히'}
            </button>
          )}
        </div>
        {detailsOpen && (
          <div id="install-inapp-details" className="install__details">
            <p className="install__text">
              버튼이 안 되면 {appName} 메뉴에서 열어요. 여기서 모은 기록은 {appName} 안에만 남고 지워질 수도 있어요.
            </p>
            <ol className="install__steps">
              {openInBrowserSteps(env.app, env.os).map((step, i) => (
                <li key={step}>
                  {i === 0 && <MoreIcon size={20} />}
                  {step}
                </li>
              ))}
            </ol>
            {hasProgress && (
              <div className="install__save">
                <p className="install__text">
                  브라우저로 옮길 때 기록 코드를 복사해 가세요. 새 브라우저의 도감 맨 아래 '기록 옮기기'에서 불러오면 이어서 할 수 있어요.
                </p>
                <div className="install__actions">
                  <SaveCopyButton className="btn btn--small" />
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    );
  }

  if (slot !== 'install' || dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 저장 못 해도 이번 화면에서만 닫힌다
    }
    setDismissed(true);
  };

  const canPrompt = env.kind === 'android' && canPromptInstall();
  // 안드로이드인데 설치 이벤트가 아직 없으면(다른 브라우저 등) 메뉴 안내로 대신한다
  const onAdd = async () => {
    sfx.button();
    if (canPrompt) {
      await promptInstall();
      force((n) => n + 1);
    } else {
      setShowSteps((v) => !v);
    }
  };

  return (
    <aside className="install" aria-labelledby="install-title">
      <img className="install__icon" src="./icon.svg" alt="" width={52} height={52} />
      <div className="install__body">
        <p id="install-title" className="install__title">
          홈 화면에 추가하면 앱처럼 열려요
        </p>
        <p className="install__text">설치 파일 없이 아이콘만 생겨요. 인터넷이 약해도 열려요.</p>
        <div className="install__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={() => void onAdd()} aria-expanded={canPrompt ? undefined : showSteps}>
            <HomeAddIcon size={22} />
            홈 화면에 추가
          </button>
        </div>
        {showSteps && (
          <ol className="install__steps">
            {env.kind === 'ios' ? (
              <>
                <li>
                  <ShareIcon size={20} />
                  브라우저의 공유 버튼을 눌러요
                </li>
                <li>'홈 화면에 추가'를 눌러요</li>
              </>
            ) : (
              <>
                <li>
                  <MoreIcon size={20} />
                  브라우저 메뉴(점 세 개)를 눌러요
                </li>
                <li>'홈 화면에 추가' 또는 '앱 설치'를 눌러요</li>
              </>
            )}
          </ol>
        )}
      </div>
      <button type="button" className="install__close" onClick={dismiss} aria-label="홈 화면 추가 안내 닫기">
        <CloseIcon size={18} />
      </button>
    </aside>
  );
}
