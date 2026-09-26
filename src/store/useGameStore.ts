import { isMatPatternId, isPropId, withProp, withoutProp, type MatPatternId, type PropId } from '../data/playroomDecor';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { STARTER_CHARACTER_IDS, getCharacter } from '../data/characters';
import { collectionProgress, getCollection } from '../data/collections';
import { MISSION_ALL_CLEAR_BONUS, SET_REWARD_COINS } from '../economy/config';
import { checkCoupon, type CouponResult } from '../economy/coupons';
import { seoulDateKey } from '../economy/daily';
import {
  applyDailyReset,
  computeReward,
  payForPull,
  type PullKind,
  type RewardBreakdown,
} from '../economy/economy';
import { pullMulti, pullSingle, resolveDuplicates, type ResolvedPull } from '../gacha/engine';
import { defaultRng, type RNG } from '../lib/rng';
import {
  canClaimBonus,
  claimMission,
  generateDailyMissions,
  recordMission,
  rollMissions,
  type MissionKind,
  type MissionState,
} from '../missions/missions';
import {
  PLAYROOM_MAX_OUT,
  SAVE_KEY,
  SAVE_VERSION,
  createInitialSave,
  migrateSave,
  sanitizeSave,
  type SaveData,
} from './persistence';

export type { PullKind };

export type PullActionResult =
  | { ok: true; kind: PullKind; items: ResolvedPull[]; totalRefund: number }
  | { ok: false; reason: 'insufficient-coins' };

export interface MiniGameFinishResult {
  reward: RewardBreakdown;
  isNewBest: boolean;
  previousBest: number;
}

export interface GameActions {
  /** 첫 실행 시 시작 말랑이 선택 (이미 보유 중이면 무시) */
  chooseStarter(characterId: string, now?: Date): boolean;
  pull(kind: PullKind, rng?: RNG, now?: Date): PullActionResult;
  /** 미니게임 결과 기록 + 코인 지급 (코인 계산은 economy 모듈이 담당) */
  finishMiniGame(gameId: string, score: number, now?: Date): MiniGameFinishResult;
  setPartner(characterId: string): void;
  /** 반짝 버전을 가진 파트너를 반짝 모습으로 보여줄지 */
  setPartnerShiny(shiny: boolean): void;
  /** 완성한 컬렉션 세트의 코인 보상 받기 (세트당 1회) */
  claimSet(collectionId: string): ClaimSetResult;
  /** 말랑이 만지기: 친밀도 증가 (+ 쓰다듬기 미션 진행) */
  petMalang(characterId: string, amount?: number, now?: Date): void;
  /**
   * 놀이방: 봉인된 캡슐을 열었다 → 연 말랑이로 기록하고 매트에 올린다 (자리가 있으면).
   * cap 은 이 기기의 매트 상한 (PLAYROOM_MAX_OUT 이하). 처음 연 것이면 true.
   */
  unboxMalang(characterId: string, cap?: number): boolean;
  /** 놀이방: 연 말랑이를 매트에 꺼낸다. 이미 나와 있거나 매트가 꽉 찼거나 안 연 말랑이면 false */
  takeOutMalang(characterId: string, cap?: number): boolean;
  /** 놀이방: 매트의 말랑이를 선반에 넣는다 */
  putBackMalang(characterId: string): void;
  /** 놀이방 꾸미기: 매트 무늬 바꾸기 (무료) */
  setPlayroomMat(mat: MatPatternId): void;
  /** 놀이방 꾸미기: 소품을 놓거나 옮긴다 (x, y 는 매트 바닥 기준 0..1). 가득 차서 못 놓으면 false */
  placeProp(id: PropId, x: number, y: number): boolean;
  /** 놀이방 꾸미기: 소품 치우기 */
  removeProp(id: PropId): void;
  /** 오늘의 미션 보상 받기 */
  claimMission(id: MissionKind, now?: Date): { ok: true; coins: number } | { ok: false; reason: string };
  /** 미션 3개를 모두 받은 뒤 추가 보너스 받기. 받은 코인(없으면 0)을 돌려준다. */
  claimMissionBonus(now?: Date): number;
  /** 쿠폰 코드 입력 → 코인 지급 (저장당 한 번, 일일 상한과 무관) */
  redeemCoupon(code: string, now?: Date): CouponResult;
  /** 모든 소리 끄기/켜기 (효과음 + 배경음악) */
  setMuted(muted: boolean): void;
  /** 효과음 켜기/끄기 */
  setSfxOn(on: boolean): void;
  /** 배경음악 켜기/끄기 */
  setMusicOn(on: boolean): void;
  /** 서울 날짜 변경 시 일일 획득량 초기화 */
  refreshDaily(now?: Date): void;
  resetAll(): void;
}

export type GameState = SaveData & GameActions;

export type ClaimSetResult =
  | { ok: true; coins: number }
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

/** 오늘 날짜로 미션을 넘긴 뒤 이벤트들을 기록한다. */
function progressMissions(missions: MissionState, now: Date, events: [MissionKind, number][]): MissionState {
  let next = rollMissions(missions, seoulDateKey(now));
  for (const [kind, amount] of events) next = recordMission(next, kind, amount);
  return next;
}

/** SaveData 필드만 골라낸다 (액션 제외). */
function pickSave(state: GameState): SaveData {
  return {
    coins: state.coins,
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
    missions: state.missions,
    redeemedCoupons: state.redeemedCoupons,
    unboxed: state.unboxed,
    playroom: state.playroom,
  };
}

function clampCap(cap: number | undefined): number {
  if (cap === undefined || !Number.isFinite(cap)) return PLAYROOM_MAX_OUT;
  return Math.max(1, Math.min(PLAYROOM_MAX_OUT, Math.floor(cap)));
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
            // 시작 말랑이는 직접 골랐으니 캡슐 없이 바로 매트에
            unboxed: [characterId],
            playroom: { ...get().playroom, out: [characterId] },
          });
          return true;
        },

        pull(kind, rng = defaultRng, now = new Date()) {
          const state = get();
          const payment = payForPull(state.coins, kind);
          if (!payment.ok) return { ok: false, reason: 'insufficient-coins' };

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
            pityCount: outcome.pityCount,
            ownedMalangs: owned,
            coins: payment.coins + totalRefund,
            totalPulls: state.totalPulls + items.length,
            partnerId: state.partnerId ?? items[0]?.character.id ?? null,
            missions: progressMissions(state.missions, now, [['pull', items.length]]),
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
            missions: progressMissions(state.missions, now, [
              ['play-games', 1],
              ['earn-coins', reward.grantedCoins],
              ['new-best', isNewBest ? 1 : 0],
            ]),
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
          const coins = SET_REWARD_COINS[collection.tier];
          set({ coins: state.coins + coins, claimedSets: [...state.claimedSets, collectionId] });
          return { ok: true, coins };
        },

        petMalang(characterId, amount = 1, now = new Date()) {
          const state = get();
          if (!state.ownedMalangs[characterId]) return;
          const add = Math.max(0, Math.floor(amount));
          if (add === 0) return;
          const prev = state.affection[characterId] ?? 0;
          const next = Math.min(MAX_AFFECTION, prev + add);
          set({
            affection: next !== prev ? { ...state.affection, [characterId]: next } : state.affection,
            missions: progressMissions(state.missions, now, [['pet', add]]),
          });
        },

        unboxMalang(characterId, cap) {
          const state = get();
          if (!state.ownedMalangs[characterId]) return false;
          const first = !state.unboxed.includes(characterId);
          const out = state.playroom.out;
          const canPlace = !out.includes(characterId) && out.length < clampCap(cap);
          if (!first && !canPlace) return false;
          set({
            unboxed: first ? [...state.unboxed, characterId] : state.unboxed,
            playroom: canPlace ? { ...state.playroom, out: [...out, characterId] } : state.playroom,
          });
          return first;
        },

        takeOutMalang(characterId, cap) {
          const state = get();
          if (!state.ownedMalangs[characterId] || !state.unboxed.includes(characterId)) return false;
          const out = state.playroom.out;
          if (out.includes(characterId) || out.length >= clampCap(cap)) return false;
          set({ playroom: { ...state.playroom, out: [...out, characterId] } });
          return true;
        },

        putBackMalang(characterId) {
          const playroom = get().playroom;
          if (!playroom.out.includes(characterId)) return;
          set({ playroom: { ...playroom, out: playroom.out.filter((id) => id !== characterId) } });
        },

        setPlayroomMat(mat) {
          if (!isMatPatternId(mat)) return;
          const playroom = get().playroom;
          if (playroom.mat !== mat) set({ playroom: { ...playroom, mat } });
        },

        placeProp(id, x, y) {
          if (!isPropId(id)) return false;
          const playroom = get().playroom;
          const props = withProp(playroom.props, id, x, y);
          if (!props.some((p) => p.id === id)) return false;
          set({ playroom: { ...playroom, props } });
          return true;
        },

        removeProp(id) {
          const playroom = get().playroom;
          if (!playroom.props.some((p) => p.id === id)) return;
          set({ playroom: { ...playroom, props: withoutProp(playroom.props, id) } });
        },

        claimMission(id, now = new Date()) {
          const state = get();
          const missions = rollMissions(state.missions, seoulDateKey(now));
          const res = claimMission(missions, generateDailyMissions(missions.date), id);
          if (!res.ok) return res;
          set({ coins: state.coins + res.coins, missions: res.state });
          return { ok: true, coins: res.coins };
        },

        claimMissionBonus(now = new Date()) {
          const state = get();
          const missions = rollMissions(state.missions, seoulDateKey(now));
          if (!canClaimBonus(missions, generateDailyMissions(missions.date))) return 0;
          set({ coins: state.coins + MISSION_ALL_CLEAR_BONUS, missions: { ...missions, bonusClaimed: true } });
          return MISSION_ALL_CLEAR_BONUS;
        },

        redeemCoupon(code, now = new Date()) {
          const state = get();
          const res = checkCoupon(code, state.redeemedCoupons, now);
          if (res.ok) {
            set({ coins: state.coins + res.coupon.coins, redeemedCoupons: [...state.redeemedCoupons, res.coupon.id] });
          }
          return res;
        },

        setMuted(muted) {
          set((s) => ({ settings: { ...s.settings, sfxOn: !muted, musicOn: !muted } }));
        },

        setSfxOn(on) {
          set((s) => ({ settings: { ...s.settings, sfxOn: on } }));
        },

        setMusicOn(on) {
          set((s) => ({ settings: { ...s.settings, musicOn: on } }));
        },

        refreshDaily(now = new Date()) {
          const state = pickSave(get());
          const next = applyDailyReset(state, now);
          if (next !== state) {
            set({ dailyEarnedCoins: next.dailyEarnedCoins, lastDailyResetDate: next.lastDailyResetDate });
          }
          const missions = rollMissions(state.missions, seoulDateKey(now));
          if (missions !== state.missions) set({ missions });
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
