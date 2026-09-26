/**
 * 말랑 만지기 3D 모듈(three.js)을 필요할 때만 불러온다 (첫 화면 번들에서 분리).
 * 만지기 화면에 들어오면 받기 시작하고, 이미 받은 모듈은 동기적으로 꺼내 쓴다 (캐릭터를 바꿔도 바로 3D).
 */
type Jelly3dModule = typeof import('./jellyScene');

let loaded: Jelly3dModule | null = null;
let pending: Promise<Jelly3dModule | null> | null = null;
/** 이 기기에서 WebGL 을 만들지 못했다 → 이번 방문 동안 다시 시도하지 않는다 */
let unsupported = false;

export function preloadJelly3d(): Promise<Jelly3dModule | null> {
  pending ??= import('./jellyScene')
    .then((m) => (loaded = m))
    .catch(() => {
      // 네트워크 실패 시 다음 기회에 다시 시도
      pending = null;
      return null;
    });
  return pending;
}

export function getLoadedJelly3d(): Jelly3dModule | null {
  return loaded;
}

export function markJelly3dUnsupported(): void {
  unsupported = true;
}

export function isJelly3dUnsupported(): boolean {
  return unsupported;
}
