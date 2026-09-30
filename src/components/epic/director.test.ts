import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../data/characters';
import {
  INVERT_MS,
  MAX_FLASHES_PER_SECOND,
  SILENCE_MS,
  buildTimeline,
  cameraAt,
  cuePassed,
  maxFlashesPerSecond,
  shakeAt,
  shotAt,
  skipTarget,
  timelineCues,
  timelineFlashes,
  type EpicTier,
  type Timeline,
} from './director';
import { isEpicRarity } from './epicRarity';
import { EPIC_THEMES, epicThemeFor } from './themes';

const TIERS: EpicTier[] = ['mythic', 'secret'];
const worlds = Object.values(EPIC_THEMES).map((t) => t.world);
const all: Timeline[] = TIERS.flatMap((tier) => worlds.map((w) => buildTimeline(tier, w)));

describe('epic director', () => {
  it('컷 순서가 등급마다 정해져 있다', () => {
    const w = EPIC_THEMES.galaxy.world;
    expect(buildTimeline('mythic', w).shots.map((s) => s.id)).toEqual(['chute', 'rise', 'burst', 'world', 'hero', 'title']);
    expect(buildTimeline('secret', w).shots.map((s) => s.id)).toEqual([
      'omen',
      'comet',
      'rings',
      'implode',
      'supernova',
      'world',
      'silhouette',
      'title',
    ]);
  });

  it('컷은 0부터 빈틈·겹침 없이 이어지고 합이 전체 길이다', () => {
    for (const tl of all) {
      let at = 0;
      for (const s of tl.shots) {
        expect(s.start).toBe(at);
        expect(s.duration).toBeGreaterThan(0);
        at += s.duration;
      }
      expect(tl.total).toBe(at);
    }
  });

  it('신화는 6~7초, 시크릿은 9~10초이고 시크릿이 더 길고 컷도 많다', () => {
    for (const w of worlds) {
      const m = buildTimeline('mythic', w);
      const s = buildTimeline('secret', w);
      expect(m.total).toBeGreaterThanOrEqual(6000);
      expect(m.total).toBeLessThanOrEqual(7000);
      expect(s.total).toBeGreaterThanOrEqual(9000);
      expect(s.total).toBeLessThanOrEqual(10000);
      expect(s.total).toBeGreaterThan(m.total);
      expect(s.shots.length).toBeGreaterThan(m.shots.length);
    }
  });

  it('같은 입력이면 같은 타임라인 (결정적)', () => {
    const w = EPIC_THEMES.ocean.world;
    expect(buildTimeline('secret', w)).toEqual(buildTimeline('secret', w));
  });

  it('딱 끊는 컷은 앞 컷과 구도가 다르다 (진짜 컷)', () => {
    for (const tl of all) {
      tl.shots.forEach((s, i) => {
        if (i === 0 || s.transitionIn === 'none') return;
        const prev = tl.shots[i - 1]!;
        const a = prev.camera.to;
        const b = s.camera.from;
        const differs = prev.camera.kind !== s.camera.kind || Math.abs(a.dist - b.dist) > 1 || Math.abs(a.yaw - b.yaw) > 0.2 || Math.abs(a.pitch - b.pitch) > 0.2;
        expect(differs, `${tl.tier} ${prev.id}→${s.id}`).toBe(true);
      });
    }
  });

  it('소리 신호는 컷 안에 있고 시간 순서다, 팡파레는 한 번', () => {
    for (const tl of all) {
      for (const s of tl.shots) {
        for (const c of s.cues) {
          expect(c.at).toBeGreaterThanOrEqual(0);
          expect(c.at).toBeLessThan(s.duration);
        }
      }
      const cues = timelineCues(tl);
      for (let i = 1; i < cues.length; i++) expect(cues[i]!.time).toBeGreaterThanOrEqual(cues[i - 1]!.time);
      expect(cues.filter((c) => c.kind === 'fanfare')).toHaveLength(1);
      expect(cues.filter((c) => c.kind === 'riser').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('시크릿: 고리 세 번 잠김, 수축 뒤 무음 0.3~0.5초 동안 다른 소리 없음, 초신성 두 번째 폭발', () => {
    for (const w of worlds) {
      const tl = buildTimeline('secret', w);
      const cues = timelineCues(tl);
      expect(cues.filter((c) => c.kind === 'ringLock').map((c) => c.index)).toEqual([0, 1, 2]);
      const hush = cues.find((c) => c.kind === 'hush')!;
      expect(SILENCE_MS).toBeGreaterThanOrEqual(300);
      expect(SILENCE_MS).toBeLessThanOrEqual(500);
      const during = cues.filter((c) => c.time > hush.time && c.time < hush.time + SILENCE_MS);
      expect(during).toHaveLength(0);
      const impact = cues.find((c) => c.kind === 'impact')!;
      const boom = cues.find((c) => c.kind === 'boom')!;
      expect(impact.time).toBe(hush.time + SILENCE_MS);
      expect(boom.time - impact.time).toBeGreaterThan(200);
    }
  });

  it('깜빡임 안전: 1초에 3번 이하, 색 반전은 시크릿에 한 번·짧게', () => {
    for (const tl of all) {
      expect(maxFlashesPerSecond(tl)).toBeLessThanOrEqual(MAX_FLASHES_PER_SECOND);
      const inverts = timelineFlashes(tl).filter((f) => f.kind === 'invert');
      expect(inverts.length).toBe(tl.tier === 'secret' ? 1 : 0);
      for (const f of inverts) expect(f.ms).toBeLessThanOrEqual(INVERT_MS);
      for (const f of timelineFlashes(tl)) {
        expect(f.peak).toBeGreaterThan(0);
        expect(f.peak).toBeLessThanOrEqual(1);
      }
    }
  });

  it('번쩍임 계산은 1초 창을 제대로 센다', () => {
    const base = buildTimeline('mythic', EPIC_THEMES.galaxy.world);
    const dense: Timeline = {
      ...base,
      shots: base.shots.map((s, i) => (i === 0 ? { ...s, flashes: [0, 200, 400, 600].map((at) => ({ kind: 'white' as const, at, ms: 100, peak: 1 })) } : s)),
    };
    expect(maxFlashesPerSecond(dense)).toBeGreaterThanOrEqual(4);
  });

  it('마지막 카드: 말랑이와 제목이 보이고 영화 띠가 걷힌다, 건너뛰기는 거기로 간다', () => {
    for (const tl of all) {
      const last = tl.shots[tl.shots.length - 1]!;
      expect(last.id).toBe('title');
      expect(last.malang).toBe('full');
      expect(last.title).toBe(true);
      expect(last.letterbox).toBe(false);
      expect(tl.finalStart).toBe(last.start);
      expect(skipTarget(tl, 600)).toBe(tl.finalStart);
      expect(skipTarget(tl, tl.finalStart - 1)).toBe(tl.finalStart);
      expect(skipTarget(tl, tl.finalStart)).toBeNull();
      expect(shotAt(tl, skipTarget(tl, 0)!).shot.id).toBe('title');
      // 제목은 마지막 카드에만
      expect(tl.shots.filter((s) => s.title)).toHaveLength(1);
    }
  });

  it('말랑이는 캡슐이 사라진 뒤에만 보인다, 모티프 세계 컷이 하나 있다', () => {
    for (const tl of all) {
      const firstMalang = tl.shots.findIndex((s) => s.malang !== 'hidden');
      const lastCapsule = tl.shots.map((s) => s.capsule).lastIndexOf(true);
      expect(firstMalang).toBeGreaterThan(lastCapsule);
      const worldShots = tl.shots.filter((s) => s.id === 'world');
      expect(worldShots).toHaveLength(1);
      expect(worldShots[0]!.world).toBe(true);
    }
  });

  it('shotAt: 경계와 범위 밖', () => {
    const tl = buildTimeline('mythic', EPIC_THEMES.phoenix.world);
    expect(shotAt(tl, -50).shot.id).toBe('chute');
    expect(shotAt(tl, 0).progress).toBe(0);
    const second = tl.shots[1]!;
    expect(shotAt(tl, second.start).shot.id).toBe(second.id);
    expect(shotAt(tl, second.start - 1).index).toBe(0);
    const end = shotAt(tl, tl.total + 999);
    expect(end.shot.id).toBe('title');
    expect(end.progress).toBe(1);
  });

  it('카메라: 처음엔 from, 끝엔 to, 흔들림은 잦아든다', () => {
    const m = EPIC_THEMES.prism.world.camera;
    expect(cameraAt(m, 0)).toEqual(m.from);
    expect(cameraAt(m, 1)).toEqual(m.to);
    const burst = buildTimeline('mythic', EPIC_THEMES.galaxy.world).shots.find((s) => s.id === 'burst')!;
    expect(shakeAt(burst.camera, 0)).toBeGreaterThan(shakeAt(burst.camera, 300));
    expect(shakeAt(buildTimeline('mythic', EPIC_THEMES.galaxy.world).shots[0]!.camera, 0)).toBe(0);
  });

  it('cuePassed: 건너뛰기 전에 팡파레가 울렸는지', () => {
    const tl = buildTimeline('secret', EPIC_THEMES.rainbow.world);
    expect(cuePassed(tl, 'fanfare', 1000)).toBe(false);
    expect(cuePassed(tl, 'fanfare', tl.finalStart)).toBe(true);
  });
});

describe('epic worlds', () => {
  it('신화·시크릿 말랑이마다 하나뿐인 모티프 세계 컷이 있다', () => {
    const epics = CHARACTERS.filter((c) => isEpicRarity(c.rarity));
    const ids = epics.map((c) => epicThemeFor(c).world.id);
    expect(new Set(ids).size).toBe(epics.length);
    for (const c of epics) {
      const tl = buildTimeline(c.rarity === 'secret' ? 'secret' : 'mythic', epicThemeFor(c).world);
      expect(tl.worldId).toBe(epicThemeFor(c).world.id);
    }
  });

  it('세계 컷 카메라는 움직이고, 추가 소리는 컷 길이 안', () => {
    for (const w of worlds) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.camera.from).not.toEqual(w.camera.to);
      for (const c of w.cues ?? []) expect(c.at).toBeLessThan(1600);
    }
  });
});
