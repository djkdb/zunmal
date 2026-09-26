import { describe, expect, it, vi } from 'vitest';
import { parseCouponLink } from './couponLink';
import {
  SHARE_INVITE,
  SHARE_URL,
  malangShareContent,
  pullShareContent,
  runShare,
  shareMessage,
  type ShareContent,
} from './share';

const EMOJI = /\p{Extended_Pictographic}/gu;

describe('pullShareContent', () => {
  it('신화 새 말랑이: 등급 + 이름 + 조사, 도감, 초대 줄', () => {
    const c = pullShareContent({ name: '은하 말랑', rarityLabel: '신화', shiny: false, isNew: true, owned: 17, total: 32 });
    expect(c.text).toBe(`방금 신화 말랑이 은하 말랑을 뽑았어요!\n내 말랑 도감 17/32\n${SHARE_INVITE}`);
    expect(c.url).toBe(SHARE_URL);
    expect(c.title).toBe('말랑 뽑기방');
  });

  it('받침 없는 이름은 "를", 이미 있던 말랑이는 "또"', () => {
    const c = pullShareContent({ name: '벚꽃 요정', rarityLabel: '에픽', shiny: false, isNew: false, owned: 9, total: 32 });
    expect(c.text.split('\n')[0]).toBe('방금 에픽 말랑이 벚꽃 요정을 또 뽑았어요!');
    const d = pullShareContent({ name: '복숭아 모찌', rarityLabel: '전설', shiny: false, isNew: true, owned: 9, total: 32 });
    expect(d.text.split('\n')[0]).toBe('방금 전설 말랑이 복숭아 모찌를 뽑았어요!');
  });

  it('일반 새 말랑이는 등급 없이 "만났어요"', () => {
    const c = pullShareContent({ name: '커스터드 빵', shiny: false, isNew: true, owned: 3, total: 32 });
    expect(c.text.split('\n')[0]).toBe('새 말랑이 커스터드 빵을 만났어요!');
    expect(c.text.match(EMOJI)).toBeNull();
  });

  it('반짝은 "반짝" + 이모지 하나 (2개 이하)', () => {
    const c = pullShareContent({ name: '소다 방울', shiny: true, isNew: true, owned: 5, total: 32 });
    expect(c.text.split('\n')[0]).toBe('방금 반짝 소다 방울을 뽑았어요! ✨');
    expect((c.text.match(EMOJI) ?? []).length).toBeLessThanOrEqual(2);
  });

  it('도감 숫자는 정수로, 전체보다 크지 않게', () => {
    const c = pullShareContent({ name: '말차 콩', shiny: false, isNew: true, owned: 40.7, total: 32 });
    expect(c.text).toContain('내 말랑 도감 32/32');
    const d = pullShareContent({ name: '말차 콩', shiny: false, isNew: true, owned: -3, total: 32 });
    expect(d.text).toContain('내 말랑 도감 0/32');
  });
});

describe('malangShareContent', () => {
  it('파트너: 소개 + 이름(등급), 친밀도 단계, 도감', () => {
    const c = malangShareContent({ name: '은하 말랑', rarityLabel: '신화', shiny: true, level: 8, partner: true, owned: 17, total: 32 });
    expect(c.text).toBe(`내 파트너 말랑이를 소개해요!\n반짝 은하 말랑 (신화), 친밀도 Lv.8\n내 말랑 도감 17/32\n${SHARE_INVITE}`);
  });

  it('파트너가 아니고 등급 없으면 이름만, 단계는 1 이상', () => {
    const c = malangShareContent({ name: '복숭아 모찌', shiny: false, level: 0, partner: false, owned: 1, total: 32 });
    expect(c.text.split('\n').slice(0, 2)).toEqual(['내 말랑이를 소개해요!', '복숭아 모찌, 친밀도 Lv.1']);
  });
});

describe('shareMessage / 주소', () => {
  it('글 다음 줄에 주소', () => {
    const c = pullShareContent({ name: '말차 콩', shiny: false, isNew: true, owned: 2, total: 32 });
    expect(shareMessage(c)).toBe(`${c.text}\n${SHARE_URL}`);
  });

  it('공유 주소에는 쿠폰 코드가 없다 (선물 링크로 읽히지 않음)', () => {
    expect(parseCouponLink(SHARE_URL)).toEqual({ code: null, cleanUrl: SHARE_URL });
    expect(SHARE_URL).not.toContain('#');
  });
});

describe('runShare', () => {
  const c: ShareContent = { title: 't', text: '글', url: SHARE_URL };

  it('Web Share가 있으면 글과 주소를 따로 넘긴다', async () => {
    const share = vi.fn(async () => {});
    const copy = vi.fn(async () => {});
    expect(await runShare(c, { share, copy })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 't', text: '글', url: SHARE_URL });
    expect(copy).not.toHaveBeenCalled();
  });

  it('공유 창을 닫으면(AbortError) 조용히 cancelled — 복사하지 않는다', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'AbortError' });
    });
    const copy = vi.fn(async () => {});
    expect(await runShare(c, { share, copy })).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });

  it('공유가 다른 이유로 실패하거나 canShare가 거절하면 클립보드로', async () => {
    const copy = vi.fn(async () => {});
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    expect(await runShare(c, { share: failing, copy })).toBe('copied');
    expect(copy).toHaveBeenCalledWith(shareMessage(c));
    const share = vi.fn(async () => {});
    expect(await runShare(c, { share, canShare: () => false, copy })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(await runShare(c, { share, canShare: () => { throw new Error('x'); }, copy })).toBe('copied');
  });

  it('공유도 클립보드도 없거나 실패하면 manual', async () => {
    expect(await runShare(c, {})).toBe('manual');
    const copy = vi.fn(async () => {
      throw new Error('denied');
    });
    expect(await runShare(c, { copy })).toBe('manual');
  });
});
