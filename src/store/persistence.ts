/**
 * 저장 데이터 스키마, 초기값, 정화(sanitize), 마이그레이션.
 * Zustand/React와 무관한 순수 모듈 — 손상/구버전 데이터를 단위 테스트할 수 있다.
 */
import { isCharacterId } from '../data/characters';
import { isCollectionId } from '../data/collections';
import { MISSION_KINDS, createMissionState, type MissionKind, type MissionState } from '../missions/missions';
import { GACHA_RULES } from '../data/rarity';
import { LEGACY_TICKET_TO_COINS, STARTING_COINS } from '../economy/config';
import { isCouponId } from '../economy/coupons';
import { isValidDateKey, seoulDateKey } from '../economy/daily';

/**
 * 저장 스키마 버전. 구조가 바뀌면 올리고 migrateSave에 변환 단계를 추가한다.
 *  - v0: 초기 프로토타입 형식 { coins, tickets, owned: string[], pity, muted, best: {gameId: n} }
 *  - v1: { ..., ownedMalangs: {id: {count, firstObtainedAt}} }
 *  - v2: 반짝 수집(shinyCount), 컬렉션 보상 수령(claimedSets), 친밀도(affection), 반짝 파트너(partnerShiny)
 *  - v3: 뽑기권 폐지 — 재화는 코인 하나. 남은 뽑기권(gachaTickets)은 코인으로 환산
 *  - v4: 일일 미션 진행(missions)
 *  - v5: 소리 설정 분리 — settings { muted } → { sfxOn, musicOn } (효과음/배경음악)
 *  - v6: 받은 쿠폰(redeemedCoupons)
 *  - v7: 놀이방 — 캡슐을 연 말랑이(unboxed), 매트 위에 꺼내 둔 말랑이(playroom.out)
 */
export const SAVE_VERSION = 7;
/** 매트 위에 동시에 꺼내 둘 수 있는 최대 수 (저장 상한. 기기별 실제 상한은 touch/perfGovernor.ts 가 정한다) */
export const PLAYROOM_MAX_OUT = 5;
export const SAVE_KEY = 'malang-gacha-save';

export interface OwnedMalang {
  count: number;
  /** 반짝 버전 보유 수 (count에 포함됨) */
  shinyCount: number;
  /** 최초 획득 시각 (epoch ms) */
  firstObtainedAt: number;
}

export interface MiniGameRecord {
  bestScore: number;
  lastScore: number;
  plays: number;
}

export interface Settings {
  /** 효과음(버튼·뽑기·미니게임·만지기 소리) */
  sfxOn: boolean;
  /** 배경음악. 켜져 있어도 첫 사용자 입력 전에는 재생하지 않는다. */
  musicOn: boolean;
}

export interface PlayroomSave {
  /** 매트 위에 꺼내 둔 말랑이 id (꺼낸 순서). 항상 unboxed ∩ 보유, 최대 PLAYROOM_MAX_OUT */
  out: string[];
}

export interface SaveData {
  coins: number;
  ownedMalangs: Record<string, OwnedMalang>;
  pityCount: number;
  partnerId: string | null;
  settings: Settings;
  miniGameRecords: Record<string, MiniGameRecord>;
  dailyEarnedCoins: number;
  lastDailyResetDate: string;
  totalPulls: number;
  /** 보상을 받은 컬렉션 세트 id */
  claimedSets: string[];
  /** 말랑이별 친밀도 (만지기) */
  affection: Record<string, number>;
  /** 파트너를 반짝 모습으로 보여줄지 (반짝 보유 시) */
  partnerShiny: boolean;
  /** 오늘의 미션 진행 (서울 날짜가 바뀌면 초기화) */
  missions: MissionState;
  /** 받은 쿠폰 id (economy/config.ts COUPONS) */
  redeemedCoupons: string[];
  /** 캡슐을 열어 본 말랑이 id — 여기 없는 보유 말랑이는 놀이방 선반에 봉인된 캡슐로 나온다 */
  unboxed: string[];
  /** 놀이방(만지기) 매트 상태 */
  playroom: PlayroomSave;
}

export function createInitialSave(now: Date = new Date()): SaveData {
  return {
    coins: STARTING_COINS,
    ownedMalangs: {},
    pityCount: 0,
    partnerId: null,
    settings: { sfxOn: true, musicOn: true },
    miniGameRecords: {},
    dailyEarnedCoins: 0,
    lastDailyResetDate: seoulDateKey(now),
    totalPulls: 0,
    claimedSets: [],
    affection: {},
    partnerShiny: false,
    missions: createMissionState(seoulDateKey(now)),
    redeemedCoupons: [],
    unboxed: [],
    playroom: { out: [] },
  };
}

// ── 타입 가드 헬퍼 ────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 음이 아닌 정수로 보정. 실패 시 fallback. */
function nonNegInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function sanitizeOwned(value: unknown, now: number): Record<string, OwnedMalang> {
  const result: Record<string, OwnedMalang> = {};
  if (!isRecord(value)) return result;
  for (const [id, entry] of Object.entries(value)) {
    if (!isCharacterId(id)) continue; // 알 수 없는 캐릭터 제거
    if (!isRecord(entry)) continue;
    const count = nonNegInt(entry.count, 0);
    if (count < 1) continue;
    result[id] = {
      count,
      shinyCount: Math.min(count, nonNegInt(entry.shinyCount, 0)),
      firstObtainedAt: nonNegInt(entry.firstObtainedAt, now),
    };
  }
  return result;
}

function sanitizeRecords(value: unknown): Record<string, MiniGameRecord> {
  const result: Record<string, MiniGameRecord> = {};
  if (!isRecord(value)) return result;
  for (const [gameId, entry] of Object.entries(value)) {
    if (!isRecord(entry) || gameId.length === 0 || gameId.length > 64) continue;
    result[gameId] = {
      bestScore: nonNegInt(entry.bestScore, 0),
      lastScore: nonNegInt(entry.lastScore, 0),
      plays: nonNegInt(entry.plays, 0),
    };
  }
  return result;
}

function sanitizeAffection(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!isRecord(value)) return result;
  for (const [id, v] of Object.entries(value)) {
    if (!isCharacterId(id)) continue;
    const n = nonNegInt(v, 0);
    if (n > 0) result[id] = n;
  }
  return result;
}

function sanitizeSetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && isCollectionId(v)))];
}

function sanitizeMissions(value: unknown, fallback: MissionState): MissionState {
  if (!isRecord(value) || !isValidDateKey(value.date)) return fallback;
  const progress: MissionState['progress'] = {};
  if (isRecord(value.progress)) {
    for (const kind of MISSION_KINDS) {
      const n = nonNegInt(value.progress[kind], 0);
      if (n > 0) progress[kind] = n;
    }
  }
  const claimed = Array.isArray(value.claimed)
    ? [...new Set(value.claimed.filter((k): k is MissionKind => (MISSION_KINDS as readonly unknown[]).includes(k)))]
    : [];
  return { date: value.date, progress, claimed, bonusClaimed: value.bonusClaimed === true };
}

function sanitizeUnboxed(value: unknown, owned: Record<string, OwnedMalang>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && owned[v] !== undefined))];
}

/** 매트 위 말랑이: 캡슐을 연 보유 말랑이만, 중복 없이, 최대 PLAYROOM_MAX_OUT */
function sanitizePlayroom(value: unknown, unboxed: readonly string[]): PlayroomSave {
  const out = isRecord(value) && Array.isArray(value.out) ? value.out : [];
  const allowed = new Set(unboxed);
  const ids = [...new Set(out.filter((v): v is string => typeof v === 'string' && allowed.has(v)))];
  return { out: ids.slice(0, PLAYROOM_MAX_OUT) };
}

/**
 * 임의의 값을 안전한 SaveData로 변환한다. 어떤 입력에도 throw하지 않는다.
 * 잘못된 필드는 기본값으로, 알 수 없는 캐릭터는 제거한다.
 */
export function sanitizeSave(raw: unknown, now: Date = new Date()): SaveData {
  const base = createInitialSave(now);
  if (!isRecord(raw)) return base;

  const ownedMalangs = sanitizeOwned(raw.ownedMalangs, now.getTime());
  const partnerId =
    typeof raw.partnerId === 'string' && ownedMalangs[raw.partnerId] ? raw.partnerId : null;
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const unboxed = sanitizeUnboxed(raw.unboxed, ownedMalangs);

  return {
    // 시작 선물 코인은 새 저장(createInitialSave)에만 준다. 기존 저장의 코인이 손상되면 0으로.
    coins: nonNegInt(raw.coins, 0),
    ownedMalangs,
    // 보유 말랑이가 있는데 파트너가 무효하면 첫 보유 말랑이로 대체
    partnerId: partnerId ?? Object.keys(ownedMalangs)[0] ?? null,
    pityCount: nonNegInt(raw.pityCount, 0, GACHA_RULES.pityThreshold - 1),
    settings: {
      sfxOn: typeof settings.sfxOn === 'boolean' ? settings.sfxOn : base.settings.sfxOn,
      musicOn: typeof settings.musicOn === 'boolean' ? settings.musicOn : base.settings.musicOn,
    },
    miniGameRecords: sanitizeRecords(raw.miniGameRecords),
    dailyEarnedCoins: nonNegInt(raw.dailyEarnedCoins, 0),
    lastDailyResetDate: isValidDateKey(raw.lastDailyResetDate) ? raw.lastDailyResetDate : base.lastDailyResetDate,
    totalPulls: nonNegInt(raw.totalPulls, 0),
    claimedSets: sanitizeSetIds(raw.claimedSets),
    affection: sanitizeAffection(raw.affection),
    partnerShiny: raw.partnerShiny === true,
    missions: sanitizeMissions(raw.missions, base.missions),
    redeemedCoupons: Array.isArray(raw.redeemedCoupons) ? [...new Set(raw.redeemedCoupons.filter(isCouponId))] : [],
    unboxed,
    playroom: sanitizePlayroom(raw.playroom, unboxed),
  };
}

/** v0 → v1: 필드 이름/형태 변경 */
function migrateV0toV1(raw: Record<string, unknown>, now: Date): Record<string, unknown> {
  const owned: Record<string, OwnedMalang> = {};
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (typeof id !== 'string') continue;
      const prev = owned[id];
      owned[id] = { count: (prev?.count ?? 0) + 1, shinyCount: 0, firstObtainedAt: now.getTime() };
    }
  }
  const records: Record<string, MiniGameRecord> = {};
  if (isRecord(raw.best)) {
    for (const [gameId, best] of Object.entries(raw.best)) {
      const bestScore = nonNegInt(best, 0);
      records[gameId] = { bestScore, lastScore: 0, plays: 0 };
    }
  }
  return {
    coins: raw.coins,
    gachaTickets: raw.tickets,
    ownedMalangs: owned,
    pityCount: raw.pity,
    settings: { muted: raw.muted },
    miniGameRecords: records,
  };
}

/** v2 → v3: 뽑기권을 코인으로 환산해 합친다 (손해 없음). */
function migrateV2toV3(raw: Record<string, unknown>): Record<string, unknown> {
  const { gachaTickets, ...rest } = raw;
  const coins = nonNegInt(raw.coins, 0);
  const tickets = nonNegInt(gachaTickets, 0);
  return { ...rest, coins: coins + tickets * LEGACY_TICKET_TO_COINS };
}

/** v4 → v5: 한 개였던 음소거를 효과음/배경음악 두 설정으로. 음소거였다면 둘 다 끈다. */
function migrateV4toV5(raw: Record<string, unknown>): Record<string, unknown> {
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const on = settings.muted !== true;
  return { ...raw, settings: { sfxOn: on, musicOn: on } };
}

/**
 * v6 → v7: 놀이방. 이미 가진 말랑이는 모두 연 것으로 친다 (기존 플레이어가 캡슐 수십 개를 열지 않게).
 * 매트에는 파트너 하나를 꺼내 둔다.
 */
function migrateV6toV7(raw: Record<string, unknown>): Record<string, unknown> {
  const owned = isRecord(raw.ownedMalangs) ? Object.keys(raw.ownedMalangs) : [];
  const partner = typeof raw.partnerId === 'string' && owned.includes(raw.partnerId) ? raw.partnerId : null;
  return { ...raw, unboxed: owned, playroom: { out: partner ? [partner] : [] } };
}

/**
 * 저장된 버전에서 현재 버전으로 마이그레이션한 뒤 sanitize한다.
 * 알 수 없는(미래) 버전도 가능한 필드만 살려 복구한다.
 */
export function migrateSave(persisted: unknown, fromVersion: number, now: Date = new Date()): SaveData {
  if (!isRecord(persisted)) return createInitialSave(now);
  let data: Record<string, unknown> = persisted;
  if (fromVersion < 1) data = migrateV0toV1(data, now);
  // v1 → v2: 새 필드는 sanitize가 기본값(반짝 0, 세트 없음, 친밀도 없음)으로 채운다.
  if (fromVersion < 3) data = migrateV2toV3(data);
  // v3 → v4: missions는 sanitize가 오늘 날짜의 빈 진행으로 채운다.
  if (fromVersion < 5) data = migrateV4toV5(data);
  // v5 → v6: redeemedCoupons는 sanitize가 빈 목록으로 채운다.
  if (fromVersion < 7) data = migrateV6toV7(data);
  // 향후: if (fromVersion < 8) data = migrateV7toV8(data);
  return sanitizeSave(data, now);
}
