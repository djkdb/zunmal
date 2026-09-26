import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  /** 접근성 제목 id (aria-labelledby) */
  labelledBy: string;
  onClose(): void;
  children: ReactNode;
  className?: string;
}

/**
 * 가게 청크용 <dialog> 창 — components/Modal.tsx 와 같은 동작·같은 클래스(.modal).
 * 가게 화면(지연 청크)이 Modal 모듈을 직접 가져오면 번들러가 첫 화면 공용 모듈(react 등)을 여러 조각으로 쪼개
 * 첫 화면이 몇 kB 무거워져서, 이 작은 사본을 가게 청크에 둔다. 동작을 바꾸면 Modal.tsx 와 함께 바꾼다.
 *
 * 네이티브 <dialog> 기반 모달. showModal()로 포커스 가둠, Esc 닫기, 배경 inert를 브라우저에 맡긴다.
 * 마운트 = 열림, 언마운트 = 닫힘. 닫힌 뒤 이전 포커스로 복귀한다.
 */
export function SheetDialog({ labelledBy, onClose, children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={['modal', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      onClick={(e) => {
        // 배경(다이얼로그 바깥 영역) 클릭 시 닫기
        if (e.target === ref.current) onCloseRef.current();
      }}
    >
      <div className="modal__body">{children}</div>
    </dialog>
  );
}
