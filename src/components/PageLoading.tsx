import { CapsuleIcon } from './icons';

/**
 * 지연 청크 화면을 받는 동안 잠깐 보이는 안내. 빨리 받으면 보이지 않도록 0.25초 뒤에 나타난다(CSS).
 * 캡슐이 통통 튀고(움직임 줄이기면 가만히) 글자는 스크린리더가 읽는다.
 */
export function PageLoading() {
  return (
    <div className="page-loading" role="status">
      <span className="page-loading__capsule" aria-hidden="true">
        <CapsuleIcon size={40} />
      </span>
      <span>화면을 불러오고 있어요</span>
    </div>
  );
}
