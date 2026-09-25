import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { STARTER_CHARACTER_IDS, getCharacter } from '../data/characters';
import { collectionProgress, getCollection } from '../data/collections';
import { PULL_COST, SET_REWARD_TICKETS } from '../economy/config';
import {
  applyDailyReset,
  computeReward,
  purchaseTickets,
  type PurchaseResult,
  type RewardBreakdown,
  type TicketPackId,
} from '../economy/economy';
import { pullMulti, pullSingle, resolveDuplicates, type ResolvedPull } from '../gacha/engine';
import { defaultRng, type RNG } from '../lib/rng';
import { SAVE_KEY, SAVE_VERSION, createInitialSave, migrateSave, sanitizeSave, type SaveData } from './persistence';

export type PullKind = keyof typeof PULL_COST;

export type PullActionResult =
  | { ok: true; kind: PullKind; items: ResolvedPull[]; totalRefund: number }
  | { ok: false; reason: 'insufficient-tickets' };

export interface MiniGameFinishResult {
  reward: RewardBreakdown;
  isNewBest: boolean;
  previousBest: number;
}

export interface GameActions {
  /** 첫 실행 시 시작 말랑이 선택 (이미 보유 중이면 무시) */
  chooseStarter(characterId: string, now?: Date): boolean;
  buyTickets(packId: TicketPackId): PurchaseResult;
  pull(kind: PullKind, rng?: RNG, now?: Date): PullActionResult;
  /** 미니게임 결과 기록 + 코인 지급 (코인 계산은 economy 모듈이 담당) */
  finishMiniGame(gameId: string, score: number, now?: Date): MiniGameFinishResult;
  setPartner(characterId: string): void;
  /** 반짝 버전을 가진 파트너를 반짝 모습으로 보여줄지 */
  setPartnerShiny(shiny: boolean): void;
  /** 완성한 컬렉션 세트의 뽑기권 보상 받기 (세트당 1회) */
  claimSet(collectionId: string): ClaimSetResult;
  /** 말랑이 만지기: 친밀도 증가 */
  petMalang(characterId: string, amount?: number): void;
  setMuted(muted: boolean): void;
  /** 서울 날짜 변경 시 일일 획득량 초기화 */
  refreshDaily(now?: Date): void;
  resetAll(): void;
}

export type GameState = SaveData & GameActions;

export type ClaimSetResult =
  | { ok: true; tickets: number }
  | { ok: false; reason: 'unknown' | 'incomplete' | 'already-claimed' };

/** 친밀도 최대치 */
export const MAX_AFFECTION = 9999;

/**
 * localStorage 접근과 JSON 파싱을 모두 try/catch로 감싼 저장소.
 * 사생활 보호 모드/용량 초과/손상된 JSON에서도 앱이 크래시하지 않는다.
 */
export function createSafeStorage(getBackend: () => Storage | undefined): PersistStorage<SaveData> {
  return {
    getItem(name) {
      try {
        const raw = getBackend()?.getItem(name);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const { state, version } = parsed as Partial<StorageValue<unknown>>;
        return {
          state: state as SaveData,
          version: typeof version === 'number' && Number.isFinite(version) ? version : 0,
        };
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      try {
        getBackend()?.setItem(name, JSON.stringify(value));
      } catch {
        // 저장 실패(용량 초과 등)는 게임 진행을 막지 않는다.
      }
    },
    removeItem(name) {
      try {
        getBackend()?.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
}

const browserStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

/** SaveData 필드만 골라낸다 (액션 제외). */
function pickSave(state: GameState): SaveData {
  return {
    coins: state.coins,
    gachaTickets: state.gachaTickets,
    ownedMalangs: state.ownedMalangs,
    pityCount: state.pityCount,
    partnerId: state.partnerId,
    settings: state.settings,
    miniGameRecords: state.miniGameRecords,
    dailyEarnedCoins: state.dailyEarnedCoins,
    lastDailyResetDate: state.lastDailyResetDate,
    totalPulls: state.totalPulls,
    claimedSets: state.claimedSets,
    affection: state.affection,
    partnerShiny: state.partnerShiny,
  };
}

export function createGameStore(storage: PersistStorage<SaveData> = createSafeStorage(browserStorage)) {
  return create<GameState>()(
    persist(
      (set, get) => ({
        ...createInitialSave(),

        chooseStarter(characterId, now = new Date()) {
          const state = get();
          if (Object.keys(state.ownedMalangs).length > 0) return false;
          if (!STARTER_CHARACTER_IDS.includes(characterId)) return false;
          set({
            ownedMalangs: { [characterId]: { count: 1, shinyCount: 0, firstObtainedAt: now.getTime() } },
            partnerId: characterId,
          });
          return true;
        },

        buyTickets(packId) {
          const state = get();
          const result = purchaseTickets(state.coins, state.gachaTickets, packId);
          if (result.ok) set({ coins: result.coins, gachaTickets: result.tickets });
          return result;
        },

        pull(kind, rng = defaultRng, now = new Date()) {
          const state = get();
          const cost = PULL_COST[kind];
          if (state.gachaTickets < cost) return { ok: false, reason: 'insufficient-tickets' };

          const outcome = kind === 'multi' ? pullMulti(state.pityCount, rng) : pullSingle(state.pityCount, rng);
          const { items, totalRefund } = resolveDuplicates(outcome.results, state.ownedMalangs);

          const owned = { ...state.ownedMalangs };
          for (const item of items) {
            const prev = owned[item.character.id];
            owned[item.character.id] = {
              count: (prev?.count ?? 0) + 1,
              shinyCount: (prev?.shinyCount ?? 0) + (item.shiny ? 1 : 0),
              firstObtainedAt: prev?.firstObtainedAt ?? now.getTime(),
            };
          }

          set({
            gachaTickets: state.gachaTickets - cost,
            pityCount: outcome.pityCount,
            ownedMalangs: owned,
            coins: state.coins + totalRefund,
            totalPulls: state.totalPulls + items.length,
            partnerId: state.partnerId ?? items[0]?.character.id ?? null,
          });
          return { ok: true, kind, items, totalRefund };
        },

        finishMiniGame(gameId, score, now = new Date()) {
          const state = applyDailyReset(pickSave(get()), now);
          const partner = state.partnerId ? getCharacter(state.partnerId) : undefined;
          const reward = computeReward({
            gameId,
            score,
            partnerRarity: partner?.rarity,
            dailyEarned: state.dailyEarnedCoins,
          });
          const prev = state.miniGameRecords[gameId] ?? { bestScore: 0, lastScore: 0, plays: 0 };
          const isNewBest = reward.score > prev.bestScore;

          set({
            coins: state.coins + reward.grantedCoins,
            dailyEarnedCoins: state.dailyEarnedCoins + reward.grantedCoins,
            lastDailyResetDate: state.lastDailyResetDate,
            miniGameRecords: {
              ...state.miniGameRecords,
              [gameId]: {
                bestScore: Math.max(prev.bestScore, reward.score),
                lastScore: reward.score,
                plays: prev.plays + 1,
              },
            },
          });
          return { reward, isNewBest, previousBest: prev.bestScore };
        },

        setPartner(characterId) {
          if (get().ownedMalangs[characterId]) set({ partnerId: characterId });
        },

        setPartnerShiny(shiny) {
          set({ partnerShiny: shiny });
        },

        claimSet(collectionId) {
          const state = get();
          const collection = getCollection(collectionId);
          if (!collection) return { ok: false, reason: 'unknown' };
          if (state.claimedSets.includes(collectionId)) return { ok: false, reason: 'already-claimed' };
          const progress = collectionProgress(collection, new Set(Object.keys(state.ownedMalangs)));
          if (!progress.complete) return { ok: false, reason: 'incomplete' };
          const tickets = SET_REWARD_TICKETS[collection.tier];
          set({ gachaTickets: state.gachaTickets + tickets, claimedSets: [...state.claimedSets, collectionId] });
          return { ok: true, tickets };
        },

        petMalang(characterId, amount = 1) {
          const state = get();
          if (!state.ownedMalangs[characterId]) return;
          const prev = state.affection[characterId] ?? 0;
          const next = Math.min(MAX_AFFECTION, prev + Math.max(0, Math.floor(amount)));
          if (next !== prev) set({ affection: { ...state.affection, [characterId]: next } });
        },

        setMuted(muted) {
          set((s) => ({ settings: { ...s.settings, muted } }));
        },

        refreshDaily(now = new Date()) {
          const state = pickSave(get());
          const next = applyDailyReset(state, now);
          if (next !== state) {
            set({ dailyEarnedCoins: next.dailyEarnedCoins, lastDailyResetDate: next.lastDailyResetDate });
          }
        },

        resetAll() {
          set(createInitialSave());
        },
      }),
      {
        name: SAVE_KEY,
        version: SAVE_VERSION,
        storage,
        partialize: pickSave,
        migrate: (persisted, version) => migrateSave(persisted, version),
        // 같은 버전이라도 손상 가능성이 있으므로 항상 sanitize 후 병합
        merge: (persisted, current) => ({ ...current, ...sanitizeSave(persisted) }),
      },
    ),
  );
}

export const useGameStore = createGameStore();
