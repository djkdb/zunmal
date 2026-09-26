/**
 * three.js 장면 모듈을 필요할 때만 불러온다 (첫 화면 번들에서 분리).
 * 뽑기 화면에 들어가면 미리 불러 두고, 등장 연출 시점에 이미 받아 둔 모듈을 동기적으로 꺼내 쓴다.
 */
type Scene3dModule = typeof import('./scene3d');

let loaded: Scene3dModule | null = null;
let pending: Promise<Scene3dModule | null> | null = null;

export function preloadScene3d(): Promise<Scene3dModule | null> {
  pending ??= import('./scene3d')
    .then((m) => (loaded = m))
    .catch(() => {
      // 네트워크 실패 시 다음 기회에 다시 시도
      pending = null;
      return null;
    });
  return pending;
}

export function getLoadedScene3d(): Scene3dModule | null {
  return loaded;
}
