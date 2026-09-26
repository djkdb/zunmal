/**
 * 자랑하기(공유) — 순수 모듈 (DOM 없음, 테스트 있음).
 *
 * 공유 글은 친구에게 나가는 글이라 짧고 구체적으로: 무엇을 뽑았는지 한 줄 + 내 도감 + "나도 말랑이 뽑기" + 주소.
 * 주소는 해시 없는 첫 화면(`SHARE_URL`) 그대로 — 쿠폰(`?c=`)이나 추적 값은 붙이지 않는다.
 * 보내기 순서(`runShare`): Web Share(글 + 주소) → 안 되면 클립보드 복사 → 그것도 안 되면 직접 복사(`manual`).
 * 공유 창을 사용자가 닫으면(AbortError) 조용히 끝낸다. 브라우저 기능은 `ShareEnv`로 주입받는다.
 */
import { josa } from './josa';

/** 배포 주소 (HashRouter라 첫 화면은 `/` 하나) */
export const SHARE_URL = 'https://zunmal.pages.dev/';

/** 공유 창 제목 (앱 이름) */
export const SHARE_TITLE = '말랑 뽑기방';

/** 글 끝에 붙는 초대 한 줄 */
export const SHARE_INVITE = '나도 말랑이 뽑기';

export interface ShareContent {
  title: string;
  /** 주소를 뺀 글 (Web Share는 주소를 따로 받는다) */
  text: string;
  url: string;
}

export interface PullShareInput {
  name: string;
  /** 등급 이름('신화' 등). 자랑할 만한 등급(에픽 이상)일 때만 넣는다 */
  rarityLabel?: string;
  shiny: boolean;
  /** 처음 만난 말랑이인가 (새 반짝도 포함) */
  isNew: boolean;
  /** 도감에 모은 종류 수 / 전체 */
  owned: number;
  total: number;
}

export interface MalangShareInput {
  name: string;
  /** 등급 이름. 일반은 빼도 된다 */
  rarityLabel?: string;
  shiny: boolean;
  /** 친밀도 단계 (data/affection.ts levelOf) */
  level: number;
  partner: boolean;
  owned: number;
  total: number;
}

function collectionLine(owned: number, total: number): string {
  const t = Math.max(0, Math.floor(total));
  const o = Math.min(t, Math.max(0, Math.floor(owned)));
  return `내 말랑 도감 ${o}/${t}`;
}

function compose(lines: string[]): ShareContent {
  return { title: SHARE_TITLE, text: [...lines, SHARE_INVITE].join('\n'), url: SHARE_URL };
}

/**
 * 뽑기 결과 자랑 글.
 *  - 에픽 이상이나 반짝: "방금 신화 말랑이 은하 말랑을 뽑았어요!" (이미 있던 말랑이면 "또 뽑았어요")
 *  - 그 밖의 새 말랑이: "새 말랑이 커스터드 빵을 만났어요!"
 * 반짝이면 첫 줄 끝에 반짝 이모지 하나 (공유 글에만 — 화면에는 이모지를 쓰지 않는다).
 */
export function pullShareContent(i: PullShareInput): ShareContent {
  const special = i.rarityLabel !== undefined || i.shiny;
  let head: string;
  if (special) {
    const who = `${i.shiny ? '반짝 ' : ''}${i.rarityLabel ? `${i.rarityLabel} 말랑이 ` : ''}${i.name}`;
    head = `방금 ${josa(who, '을/를')} ${i.isNew ? '' : '또 '}뽑았어요!`;
  } else {
    head = `새 말랑이 ${josa(i.name, '을/를')} 만났어요!`;
  }
  if (i.shiny) head += ' ✨';
  return compose([head, collectionLine(i.owned, i.total)]);
}

/** 도감 상세·파트너 자랑 글: "내 파트너 말랑이를 소개해요!" + "복숭아 모찌, 친밀도 Lv.8" */
export function malangShareContent(i: MalangShareInput): ShareContent {
  const head = i.partner ? '내 파트너 말랑이를 소개해요!' : '내 말랑이를 소개해요!';
  const name = `${i.shiny ? '반짝 ' : ''}${i.name}${i.rarityLabel ? ` (${i.rarityLabel})` : ''}`;
  const level = Math.max(1, Math.floor(i.level));
  return compose([head, `${name}, 친밀도 Lv.${level}`, collectionLine(i.owned, i.total)]);
}

/** 클립보드·직접 복사용 한 덩어리 (글 + 주소) */
export function shareMessage(c: ShareContent): string {
  return `${c.text}\n${c.url}`;
}

export interface ShareData {
  title: string;
  text: string;
  url: string;
}

/** 브라우저 기능 (없으면 undefined). 테스트에서 가짜로 넣는다. */
export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  copy?: (text: string) => Promise<void>;
}

/** shared: 공유 창으로 보냄 · copied: 클립보드에 복사 · cancelled: 공유 창을 닫음 · manual: 직접 복사해야 함 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual';

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/**
 * Web Share 먼저, 안 되면(없음·canShare 거절·AbortError 아닌 실패) 클립보드, 그것도 안 되면 manual.
 * 버튼 누름(사용자 입력) 안에서 바로 부른다.
 */
export async function runShare(c: ShareContent, env: ShareEnv): Promise<ShareOutcome> {
  const data: ShareData = { title: c.title, text: c.text, url: c.url };
  let canShare = typeof env.share === 'function';
  if (canShare && env.canShare) {
    try {
      canShare = env.canShare(data);
    } catch {
      canShare = false;
    }
  }
  if (canShare && env.share) {
    try {
      await env.share(data);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
    }
  }
  if (env.copy) {
    try {
      await env.copy(shareMessage(c));
      return 'copied';
    } catch {
      // 권한 없음·보안 문맥 아님 → 직접 복사
    }
  }
  return 'manual';
}
