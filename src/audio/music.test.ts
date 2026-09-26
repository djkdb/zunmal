import { describe, expect, it } from 'vitest';
import {
  BASS_MIN_MIDI,
  PHRASE_VARIANTS,
  STEPS_PER_BAR,
  STEPS_PER_PHRASE,
  StepClock,
  TRACKS,
  bucketPhrase,
  chordPitchClasses,
  generatePhrase,
  pentatonicRange,
  stepSeconds,
  swingOffset,
  trackForPath,
  type TrackId,
} from './music';
import { MAJOR_PENTATONIC, midiToFreq } from './tuning';

const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

describe('StepClock (두 개의 시계 스케줄러)', () => {
  it('예약 창 안의 박을 빠짐없이, 한 번씩만, 재생 시각 전에 꺼낸다', () => {
    const clock = new StepClock(0.125, 10);
    const seen: number[] = [];
    let now = 10;
    // 25ms마다 도는 타이머를 흉내: 가끔 90ms 늦어도 박은 모두 제시간 전에 예약돼야 한다
    for (let i = 0; i < 200; i++) {
      for (const { step, time } of clock.collect(now, 0.12)) {
        expect(time).toBeCloseTo(10 + step * 0.125, 9);
        expect(time).toBeLessThan(now + 0.12);
        expect(time).toBeGreaterThanOrEqual(now - 1e-9);
        seen.push(step);
      }
      now += i % 17 === 16 ? 0.09 : 0.025;
    }
    now -= 0.025;
    expect(seen).toEqual(seen.map((_, i) => i));
    // 불변식: now + ahead 이전의 박은 모두 반환됨
    expect(clock.timeOf(clock.nextStep)).toBeGreaterThanOrEqual(now + 0.12);
  });

  it('오래 멈췄다 돌아오면 놓친 박을 몰아서 울리지 않고 건너뛴다', () => {
    const clock = new StepClock(0.125, 0);
    clock.collect(0, 0.1);
    clock.resync(30);
    const got = clock.collect(30, 0.1);
    expect(got.length).toBeLessThanOrEqual(2);
    expect(got[0]?.time ?? 0).toBeGreaterThanOrEqual(30);
  });

  it('다음 마디 경계는 16박 단위이고 이미 예약한 박보다 뒤', () => {
    const clock = new StepClock(0.1, 0);
    clock.collect(0.5, 0.1); // 0..5 예약
    const bar = clock.nextBarStep(0.5);
    expect(bar % STEPS_PER_BAR).toBe(0);
    expect(bar).toBeGreaterThanOrEqual(clock.nextStep);
    expect(clock.timeOf(bar)).toBeGreaterThan(0.5);
    expect(clock.nextBarStep(1.61)).toBe(32);
  });

  it('BPM → 16분음표 길이, 스윙은 뒷박 8분음표만 늦춘다', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 9);
    expect(swingOffset(2, 0.1, 0.125)).toBeCloseTo(0.0125, 9);
    expect(swingOffset(0, 0.1, 0.125)).toBe(0);
    expect(swingOffset(1, 0.1, 0.125)).toBe(0);
  });
});

describe('곡 정의', () => {
  it('화면마다 정한 템포 범위', () => {
    expect(TRACKS.home.bpm).toBeGreaterThanOrEqual(88);
    expect(TRACKS.home.bpm).toBeLessThanOrEqual(96);
    expect(TRACKS.collection.bpm).toBeGreaterThanOrEqual(72);
    expect(TRACKS.collection.bpm).toBeLessThanOrEqual(80);
    expect(TRACKS.touch.bpm).toBeGreaterThanOrEqual(64);
    expect(TRACKS.touch.bpm).toBeLessThanOrEqual(72);
    expect(TRACKS.gacha.bpm).toBe(100);
    expect(TRACKS.minigame.bpm).toBeGreaterThanOrEqual(110);
  });

  it('화음 구성음', () => {
    expect(chordPitchClasses({ root: 9, quality: 'min' })).toEqual([9, 0, 4]);
    expect(chordPitchClasses({ root: 7, quality: 'dom7' })).toEqual([7, 11, 2, 5]);
  });

  it('5음 음계 범위', () => {
    expect(pentatonicRange(60, 60, 72)).toEqual([60, 62, 64, 67, 69, 72]);
  });
});

describe('generatePhrase', () => {
  it.each(TRACK_IDS)('%s: 같은 악절 번호면 항상 같은 결과 (결정적)', (id) => {
    const spec = TRACKS[id];
    expect(generatePhrase(spec, 0)).toEqual(generatePhrase(spec, 0));
    expect(generatePhrase(spec, 3)).toEqual(generatePhrase(spec, 3 + PHRASE_VARIANTS));
  });

  it.each(TRACK_IDS)('%s: 악절마다 선율이 달라 반복감이 적다', (id) => {
    const spec = TRACKS[id];
    const melody = (i: number) =>
      generatePhrase(spec, i)
        .filter((e) => e.voice === spec.lead)
        .map((e) => `${e.step}:${e.midi}`)
        .join(',');
    const variants = new Set([0, 1, 2, 3].map(melody));
    expect(variants.size).toBeGreaterThanOrEqual(3);
  });

  it.each(TRACK_IDS)('%s: 선율은 5음 음계, 베이스는 110Hz 이상, 모든 음은 악절 안', (id) => {
    const spec = TRACKS[id];
    for (let p = 0; p < PHRASE_VARIANTS; p++) {
      const events = generatePhrase(spec, p);
      expect(events.length).toBeGreaterThan(20);
      for (const e of events) {
        expect(e.step).toBeGreaterThanOrEqual(0);
        expect(e.step).toBeLessThan(STEPS_PER_PHRASE);
        expect(e.len).toBeGreaterThanOrEqual(1);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        if (e.voice === spec.lead) {
          const pc = (((e.midi - spec.key) % 12) + 12) % 12;
          expect(MAJOR_PENTATONIC as readonly number[]).toContain(pc);
        }
        if (e.voice === 'bass') {
          expect(e.midi).toBeGreaterThanOrEqual(BASS_MIN_MIDI);
          expect(midiToFreq(e.midi)).toBeGreaterThanOrEqual(110 - 1e-9);
        }
        if (e.voice === 'pad') expect(midiToFreq(e.midi)).toBeGreaterThan(190);
      }
      // 악절 첫 박에는 선율이 있다
      expect(events.some((e) => e.step === 0 && e.voice === spec.lead)).toBe(true);
    }
  });

  it('bucketPhrase: 모든 음이 자기 자리에', () => {
    const events = generatePhrase(TRACKS.home, 1);
    const buckets = bucketPhrase(events);
    expect(buckets).toHaveLength(STEPS_PER_PHRASE);
    expect(buckets.flat()).toHaveLength(events.length);
    buckets.forEach((b, i) => b.forEach((e) => expect(e.step).toBe(i)));
  });

  it('만지기 방은 타악기가 없다', () => {
    const events = generatePhrase(TRACKS.touch, 0);
    expect(events.some((e) => e.voice === 'shaker' || e.voice === 'click')).toBe(false);
  });
});

describe('trackForPath', () => {
  it.each([
    ['/', 'home'],
    ['', 'home'],
    ['/play', 'minigame'],
    ['/play/button-malang', 'minigame'],
    ['/gacha', 'gacha'],
    ['/collection', 'collection'],
    ['/shop', 'collection'],
    ['/touch', 'touch'],
    ['/touch/peach-mochi', 'touch'],
    ['/unknown', 'home'],
  ])('%s → %s', (path, track) => {
    expect(trackForPath(path)).toBe(track);
  });

  it('박자 게임(리듬)에서는 음악을 끈다', () => {
    expect(trackForPath('/play/rhythm')).toBeNull();
  });
});
