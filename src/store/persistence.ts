/**
 * 저장 데이터 스키마, 초기값, 정화(sanitize), 마이그레이션.
 * Zustand/React와 무관한 순수 모듈 — 손상/구버전 데이터를 단위 테스트할 수 있다.
 */
import { isCharacterId } from '../data/characters';
import { GACHA_RULES } from '../data/rarity';
import { STARTING_COINS, STARTING_TICKETS } from '../economy/config';
import { isValidDateKey, seoulDateKey } from '../economy/daily';

/**
 * 저장 스키마 버전. 구조가 바뀌면 올리고 migrateSave에 변환 단계를 추가한다.
 *  - v0: 초기 프로토타입 형식 { coins, tickets, owned: string[], pity, muted, best: {gameId: n} }
 *  - v1: 현재 형식 (SaveData)
 */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'malang-gacha-save';

export interface OwnedMalang {
  count: number;
  /** 최초 획득 시각 (epoch ms) */
  firstObtainedAt: number;
}

export interface MiniGameRecord {
  bestScore: number;
  lastScore: number;
  plays: number;
}

export interface Settings {
  muted: boolean;
}

export interface SaveData {
  coins: number;
  gachaTickets: number;
  ownedMalangs: Record<string, OwnedMalang>;
  pityCount: number;
  partnerId: string | null;
  settings: Settings;
  miniGameRecords: Record<string, MiniGameRecord>;
  dailyEarnedCoins: number;
  lastDailyResetDate: string;
  totalPulls: number;
}

export function createInitialSave(now: Date = new Date()): SaveData {
  return {
    coins: STARTING_COINS,
    gachaTickets: STARTING_TICKETS,
    ownedMalangs: {},
    pityCount: 0,
    partnerId: null,
    settings: { muted: false },
    miniGameRecords: {},
    dailyEarnedCoins: 0,
    lastDailyResetDate: seoulDateKey(now),
    totalPulls: 0,
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
    result[id] = { count, firstObtainedAt: nonNegInt(entry.firstObtainedAt, now) };
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

  return {
    coins: nonNegInt(raw.coins, base.coins),
    gachaTickets: nonNegInt(raw.gachaTickets, base.gachaTickets),
    ownedMalangs,
    // 보유 말랑이가 있는데 파트너가 무효하면 첫 보유 말랑이로 대체
    partnerId: partnerId ?? Object.keys(ownedMalangs)[0] ?? null,
    pityCount: nonNegInt(raw.pityCount, 0, GACHA_RULES.pityThreshold - 1),
    settings: { muted: typeof settings.muted === 'boolean' ? settings.muted : base.settings.muted },
    miniGameRecords: sanitizeRecords(raw.miniGameRecords),
    dailyEarnedCoins: nonNegInt(raw.dailyEarnedCoins, 0),
    lastDailyResetDate: isValidDateKey(raw.lastDailyResetDate) ? raw.lastDailyResetDate : base.lastDailyResetDate,
    totalPulls: nonNegInt(raw.totalPulls, 0),
  };
}

/** v0 → v1: 필드 이름/형태 변경 */
function migrateV0toV1(raw: Record<string, unknown>, now: Date): Record<string, unknown> {
  const owned: Record<string, OwnedMalang> = {};
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (typeof id !== 'string') continue;
      const prev = owned[id];
      owned[id] = { count: (prev?.count ?? 0) + 1, firstObtainedAt: now.getTime() };
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

/**
 * 저장된 버전에서 현재 버전으로 마이그레이션한 뒤 sanitize한다.
 * 알 수 없는(미래) 버전도 가능한 필드만 살려 복구한다.
 */
export function migrateSave(persisted: unknown, fromVersion: number, now: Date = new Date()): SaveData {
  if (!isRecord(persisted)) return createInitialSave(now);
  let data: Record<string, unknown> = persisted;
  if (fromVersion < 1) data = migrateV0toV1(data, now);
  // 향후: if (fromVersion < 2) data = migrateV1toV2(data);
  return sanitizeSave(data, now);
}
