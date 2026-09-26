/**
 * 저장 백업 — 앱 안 브라우저(인스타그램 등)는 페이지를 옮길 때 localStorage를 지우기도 한다.
 * 그래서 저장 문자열을 두 곳에 더 복사해 둔다.
 *  - sessionStorage (같은 탭에서는 더 오래 살아남는다)
 *  - localStorage의 다른 키 (`<key>.bak`)
 * 시작할 때 원래 키가 비었거나 깨졌으면, 스토어가 읽기 전에 백업을 되돌린다.
 *
 * 저장소는 주입받는다(테스트 가능). 모든 접근은 try/catch — 사생활 보호 모드에서도 앱을 멈추지 않는다.
 * 저장 형식은 건드리지 않고 문자열을 그대로 복사하므로 저장 스키마·버전과 무관하다.
 */

export const BACKUP_SUFFIX = '.bak';

export interface BackupStores {
  local?: Pick<Storage, 'getItem' | 'setItem'>;
  session?: Pick<Storage, 'getItem' | 'setItem'>;
}

function read(store: BackupStores['local'], key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: BackupStores['local'], key: string, value: string): boolean {
  try {
    store?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** zustand persist 형식({ state: {...}, version })으로 읽을 수 있는 문자열인지 */
export function isUsableSave(raw: string | null): raw is string {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { state?: unknown }).state === 'object' &&
      (parsed as { state?: unknown }).state !== null
    );
  } catch {
    return false;
  }
}

/** 지금 저장 문자열을 백업 두 곳에 복사한다. 쓸 수 없는 값이면 백업을 덮지 않는다. */
export function mirrorSave(key: string, stores: BackupStores): void {
  const raw = read(stores.local, key);
  if (!isUsableSave(raw)) return;
  if (read(stores.session, key) !== raw) write(stores.session, key, raw);
  if (read(stores.local, key + BACKUP_SUFFIX) !== raw) write(stores.local, key + BACKUP_SUFFIX, raw);
}

/**
 * 원래 키가 비었거나 깨졌으면 백업(세션 → 로컬 백업 순)으로 되돌린다.
 * 되돌렸으면 어디서 가져왔는지, 아니면 null.
 */
export function restoreSaveIfMissing(key: string, stores: BackupStores): 'session' | 'local-backup' | null {
  if (isUsableSave(read(stores.local, key))) return null;
  const fromSession = read(stores.session, key);
  if (isUsableSave(fromSession)) {
    // localStorage를 못 쓰는 환경이면 되돌릴 수 없다
    return write(stores.local, key, fromSession) ? 'session' : null;
  }
  const fromBackup = read(stores.local, key + BACKUP_SUFFIX);
  if (isUsableSave(fromBackup)) {
    return write(stores.local, key, fromBackup) ? 'local-backup' : null;
  }
  return null;
}

/** 브라우저 저장소 (없거나 접근이 막혀 있으면 undefined) */
export function browserStores(): BackupStores {
  const get = (name: 'localStorage' | 'sessionStorage') => {
    try {
      return typeof window === 'undefined' ? undefined : window[name];
    } catch {
      return undefined;
    }
  };
  return { local: get('localStorage'), session: get('sessionStorage') };
}
