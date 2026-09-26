import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../audio/sfx';
import { useGameStore } from '../store/useGameStore';
import { MusicIcon, SoundOffIcon, SoundOnIcon } from './icons';
import './SoundSettings.css';

interface SwitchRowProps {
  label: string;
  icon: ReactNode;
  on: boolean;
  onToggle: () => void;
}

function SwitchRow({ label, icon, on, onToggle }: SwitchRowProps) {
  return (
    <button type="button" className="sound__row" aria-pressed={on} onClick={onToggle}>
      <span className="sound__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sound__label">{label}</span>
      <span className="sound__state" aria-hidden="true">
        {on ? '켜짐' : '꺼짐'}
      </span>
      <span className="sound__switch" aria-hidden="true">
        <span className="sound__knob" />
      </span>
    </button>
  );
}

/** HUD 소리 버튼 + 효과음/배경음악 스위치 말풍선 */
export function SoundSettings() {
  const sfxOn = useGameStore((s) => s.settings.sfxOn);
  const musicOn = useGameStore((s) => s.settings.musicOn);
  const setSfxOn = useGameStore((s) => s.setSfxOn);
  const setMusicOn = useGameStore((s) => s.setMusicOn);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const allOff = !sfxOn && !musicOn;

  // 바깥을 누르거나 Esc를 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 엔진에도 입력 안에서 바로 알린다 — iOS는 사용자 입력 안에서만 오디오를 다시 깨울 수 있다
  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxOn(next);
    sfx.setSfxEnabled(next);
    if (next) sfx.button();
  };
  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    sfx.setMusicEnabled(next);
    sfx.button();
  };

  return (
    <div className="sound" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={allOff ? '소리 설정 (모두 꺼짐)' : '소리 설정'}
        onClick={() => {
          setOpen((o) => !o);
          sfx.button();
        }}
      >
        {allOff ? <SoundOffIcon size={22} /> : <SoundOnIcon size={22} />}
      </button>
      {open && (
        <div className="sound__panel" id={panelId} role="group" aria-labelledby={titleId}>
          <p className="sound__title" id={titleId}>
            소리
          </p>
          <SwitchRow label="효과음" icon={<SoundOnIcon size={24} />} on={sfxOn} onToggle={toggleSfx} />
          <SwitchRow label="배경음악" icon={<MusicIcon size={24} />} on={musicOn} onToggle={toggleMusic} />
          <p className="sound__hint">아이폰 무음 모드에서는 소리가 나지 않아요.</p>
        </div>
      )}
    </div>
  );
}
