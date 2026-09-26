import { useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import { CHARACTERS } from '../data/characters';
import { SAVE_VERSION } from '../store/persistence';
import { decodeSaveCode, encodeSaveCode, type DecodeResult } from '../store/saveCode';
import { useGameStore } from '../store/useGameStore';
import './SaveTransfer.css';

/** 지금 기록을 코드로 (스토어 상태 그대로 — localStorage가 막혀 있어도 된다) */
function currentCode(): string {
  // 액션 함수는 JSON에서 빠진다
  return encodeSaveCode(useGameStore.getState(), SAVE_VERSION);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ERROR_TEXT: Record<Exclude<DecodeResult, { ok: true }>['reason'], string> = {
  format: '기록 코드가 아니에요. MALANG1로 시작하는 코드를 통째로 붙여넣어 주세요.',
  checksum: '코드가 잘렸거나 바뀌었어요. 처음부터 끝까지 다시 복사해 주세요.',
  empty: '말랑이가 없는 기록이라 불러오지 않았어요.',
};

function countOwned(owned: Record<string, unknown>): number {
  return CHARACTERS.filter((c) => owned[c.id]).length;
}

/**
 * 기록 코드 복사 버튼 하나. 자동 복사가 막힌 앱 안 브라우저에서는 코드를 직접 골라 복사하도록 보여 준다.
 */
export function SaveCopyButton({ className = 'btn btn--small btn--lemon' }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [code, setCode] = useState('');
  const onCopy = async () => {
    sfx.button();
    const next = currentCode();
    setCode(next);
    setState((await copyText(next)) ? 'copied' : 'manual');
  };
  return (
    <>
      <button type="button" className={className} onClick={() => void onCopy()}>
        {state === 'copied' ? '복사했어요' : '기록 코드 복사'}
      </button>
      {state === 'manual' && <ManualCopy code={code} />}
    </>
  );
}

function ManualCopy({ code }: { code: string }) {
  return (
    <div className="save-transfer__manual">
      <p className="save-transfer__note" role="status">
        자동 복사가 막혀 있어요. 아래 코드를 길게 눌러 전체 선택한 뒤 복사해 주세요.
      </p>
      <textarea
        className="save-transfer__code"
        readOnly
        value={code}
        rows={3}
        aria-label="기록 코드"
        onFocus={(e) => e.currentTarget.select()}
        ref={(el) => el?.select()}
      />
    </div>
  );
}

/**
 * 기록 옮기기: 지금 기록을 코드로 복사하고, 다른 곳에서 붙여넣어 불러온다.
 * 로그인이 없으므로 브라우저를 바꾸거나(인스타그램 → Safari/Chrome) 홈 화면 앱으로 옮길 때 쓴다.
 * 불러오기는 migrateSave/sanitizeSave를 거치고, 지금 기록을 덮기 전에 한 번 더 묻는다.
 */
export function SaveTransfer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Extract<DecodeResult, { ok: true }> | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ownedNow = useGameStore((s) => countOwned(s.ownedMalangs));

  const check = () => {
    sfx.button();
    const res = decodeSaveCode(input);
    if (!res.ok) {
      setError(ERROR_TEXT[res.reason]);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setPending(res);
  };

  const apply = () => {
    if (!pending) return;
    useGameStore.setState(pending.save);
    useGameStore.getState().refreshDaily();
    sfx.success();
    setPending(null);
    setInput('');
    setOpen(false);
    setDone(true);
  };

  return (
    <section className="save-transfer" aria-labelledby="save-transfer-title">
      <h2 id="save-transfer-title" className="save-transfer__title">
        기록 옮기기
      </h2>
      <p className="save-transfer__text">
        다른 브라우저나 폰으로 옮길 때 기록 코드를 복사해 가세요. 새 곳에서 붙여넣으면 이어서 할 수 있어요.
      </p>
      <div className="save-transfer__actions">
        <SaveCopyButton />
        <button
          type="button"
          className="btn btn--small"
          aria-expanded={open}
          onClick={() => {
            sfx.button();
            setOpen((v) => !v);
            setDone(false);
            setPending(null);
            setError(null);
          }}
        >
          코드로 불러오기
        </button>
      </div>
      {done && (
        <p className="save-transfer__note is-ok" role="status">
          기록을 불러왔어요. 이어서 놀아요!
        </p>
      )}
      {open && !pending && (
        <div className="save-transfer__form">
          <label className="save-transfer__label" htmlFor="save-code-input">
            복사해 온 기록 코드
          </label>
          <textarea
            id="save-code-input"
            ref={inputRef}
            className="save-transfer__code"
            rows={3}
            value={input}
            placeholder="MALANG1.로 시작하는 코드"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'save-code-error' : undefined}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p id="save-code-error" className="save-transfer__note is-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--small btn--sky" disabled={input.trim() === ''} onClick={check}>
            불러오기
          </button>
        </div>
      )}
      {pending && (
        <div className="save-transfer__confirm" role="alertdialog" aria-labelledby="save-confirm-text">
          <p id="save-confirm-text">
            코드의 기록(말랑이 {countOwned(pending.save.ownedMalangs)}마리, 코인 {pending.save.coins.toLocaleString()}개)을
            불러올까요? 지금 기록(말랑이 {ownedNow}마리)은 사라져요.
          </p>
          <div className="save-transfer__actions">
            <button type="button" className="btn btn--small btn--primary" onClick={apply}>
              불러오기
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                sfx.button();
                setPending(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
