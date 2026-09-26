/**
 * 음높이·음량 계산 순수 헬퍼 (WebAudio/DOM 의존 없음, 단위 테스트 대상).
 * 효과음(sfx.ts)과 배경음악(music.ts)이 같은 음계를 써서 서로 부딪히지 않게 한다.
 */

export type Rand = () => number;

/** 장조 5음 음계 (도 레 미 솔 라) — 어떤 순서로 울려도 배경음악 화음과 부딪히지 않는다. */
export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;

/** 콤보 사다리 꼭대기 단계 (0부터). 8단계 = 1옥타브 + 5도 ≈ 1.5옥타브 */
export const MAX_COMBO_STEP = 8;

/** 콤보 사다리의 첫 음: C5 */
export const COMBO_BASE_FREQ = 523.25;

export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

/** MIDI 음 번호 → 주파수 (A4 = 69 = 440Hz) */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** [-amount, +amount] 범위의 균등 난수 */
export function spread(amount: number, rand: Rand): number {
  return (rand() * 2 - 1) * amount;
}

/** 콤보 단계를 0..MAX_COMBO_STEP 정수로 자른다. NaN/음수는 0. */
export function comboStep(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(MAX_COMBO_STEP, Math.floor(level));
}

/** n번째 5음 음계 단계의 반음 수 (n=5 → 12, n=8 → 19) */
export function pentatonicSemitones(step: number): number {
  const s = Math.max(0, Math.floor(step));
  const degree = MAJOR_PENTATONIC[s % MAJOR_PENTATONIC.length] ?? 0;
  return 12 * Math.floor(s / MAJOR_PENTATONIC.length) + degree;
}

/**
 * 콤보 음높이: level이 오를 때마다 장조 5음 음계를 한 칸씩 올라간다.
 * 1.5옥타브(MAX_COMBO_STEP)에서 멈춰 너무 높은 음으로 귀가 아프지 않게 한다.
 */
export function comboPitch(level: number, base: number = COMBO_BASE_FREQ): number {
  return base * 2 ** (pentatonicSemitones(comboStep(level)) / 12);
}

/** 콤보가 사다리 꼭대기를 넘었는가 (음 대신 반짝임을 더할 때) */
export function comboOverflow(level: number): boolean {
  return Number.isFinite(level) && level > MAX_COMBO_STEP;
}

/**
 * 안전 클리퍼 곡선: |x| ≤ knee 구간은 그대로 두고, 그 위는 tanh로 부드럽게 눌러
 * 출력이 절대 ceiling을 넘지 않게 한다 (WaveShaperNode는 [-1,1] 밖 입력을 끝값으로 고정).
 */
export function softClipCurve(size = 2049, knee = 0.8, ceiling = 0.99): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const room = ceiling - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** 포화(saturation) 곡선: 낮은 음에 배음을 만들어 폰 스피커에서도 "쿵"이 들리게 한다. */
export function saturationCurve(drive = 4, size = 1025): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}
