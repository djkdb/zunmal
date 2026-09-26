import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/**
 * 네이티브 `<dialog>`(components/Modal)를 쓰지 못하는 창(놀이방 시트·사진 창처럼 화면 위에 직접 그린 `role="dialog"`)의 초점 규칙:
 * 열리면 `initial`(없으면 첫 버튼)로 초점을 옮기고, Tab 은 창 안에서만 돌고, Esc 는 닫고, 닫히면 연 버튼으로 돌려준다.
 * 마운트 = 열림, 언마운트 = 닫힘 (Modal 과 같은 약속).
 */
export function useDialogFocus(
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialRef?: RefObject<HTMLElement | null>,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialRef?.current ?? focusables(root)[0] ?? root).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // 열릴 때 한 번 (onClose 가 바뀌어도 초점을 다시 빼앗지 않는다)
  }, []);
}
