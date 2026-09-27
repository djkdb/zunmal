/**
 * 사진 카드 저장 방법 고르기 (순수 함수 — 실행 환경은 lib/installEnv 의 판별 결과를 주입받는다).
 *
 * - 파일 공유(Web Share)가 되면 공유 창이 가장 확실하다 (사진 앱에 저장도 거기서).
 * - 앱 안 브라우저(인스타그램·카카오톡 …)와 iOS 는 내려받기(`<a download>`)가 조용히 실패하거나
 *   파일 앱으로 가 버린다 → 사진을 크게 보여 주고 "길게 눌러 저장"을 안내한다 (성공을 알 수 없으니 저장했다고 말하지 않는다).
 * - 그 밖(안드로이드 Chrome·데스크톱)은 내려받기.
 */
import type { InstallEnv } from './installEnv';

export type PhotoSaveMethod = 'share' | 'download' | 'long-press';

export function photoSaveMethod(env: InstallEnv, canShareFile: boolean): PhotoSaveMethod {
  if (canShareFile) return 'share';
  if (env.kind === 'in-app' || env.kind === 'ios') return 'long-press';
  // 홈 화면 앱(standalone)에서는 내려받기가 어디로 가는지 알 수 없다 (iOS 는 안 된다) → 길게 누르기가 안전하다
  if (env.kind === 'standalone') return 'long-press';
  return 'download';
}

/** 공유가 실패했을 때(취소 아님) 다음 방법 */
export function afterShareFailed(env: InstallEnv): Exclude<PhotoSaveMethod, 'share'> {
  return photoSaveMethod(env, false) === 'download' ? 'download' : 'long-press';
}
