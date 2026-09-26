/**
 * 3D 캡슐 머신 모듈(three.js)을 필요할 때만 불러온다 (첫 화면 번들에서 분리).
 * 뽑기 화면에 들어오면 받기 시작한다. three 는 신화 연출·놀이방과 같은 청크를 쓴다.
 */
type Machine3dModule = typeof import('./machineScene');

let loaded: Machine3dModule | null = null;
let pending: Promise<Machine3dModule | null> | null = null;
/** WebGL 을 못 만들었거나 너무 느렸다 → 이번 방문 동안 다시 시도하지 않는다 */
let unsupported = false;

export function preloadMachine3d(): Promise<Machine3dModule | null> {
  pending ??= import('./machineScene')
    .then((m) => (loaded = m))
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

export function getLoadedMachine3d(): Machine3dModule | null {
  return loaded;
}

export function markMachine3dUnsupported(): void {
  unsupported = true;
}

export function isMachine3dUnsupported(): boolean {
  return unsupported;
}
