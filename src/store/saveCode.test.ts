import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createInitialSave } from './persistence';
import { SAVE_CODE_PREFIX, checksum, decodeSaveCode, encodePersistedSave, encodeSaveCode } from './saveCode';

const NOW = new Date('2026-05-05T03:00:00Z');

function sampleSave() {
  return {
    ...createInitialSave(NOW),
    coins: 4321,
    ownedMalangs: {
      'peach-mochi': { count: 3, shinyCount: 1, firstObtainedAt: 100 },
      'galaxy-malang': { count: 1, shinyCount: 0, firstObtainedAt: 200 },
    },
    partnerId: 'galaxy-malang',
    pityCount: 7,
    totalPulls: 31,
    miniGameRecords: { 'button-malang': { bestScore: 300, lastScore: 120, plays: 4 } },
    claimedSets: ['dessert-shop'],
    affection: { 'peach-mochi': 12 },
  };
}

describe('saveCode', () => {
  it('코드로 바꿨다가 되돌리면 같은 기록', () => {
    const save = sampleSave();
    const code = encodeSaveCode(save);
    expect(code.startsWith(`${SAVE_CODE_PREFIX}.`)).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9._-]+$/); // 메신저에 붙여도 깨지지 않는 글자만
    const res = decodeSaveCode(code, NOW);
    expect(res).toEqual({ ok: true, save, version: SAVE_VERSION });
  });

  it('localStorage의 persist 문자열도 그대로 코드로', () => {
    const raw = JSON.stringify({ state: sampleSave(), version: SAVE_VERSION });
    const code = encodePersistedSave(raw);
    expect(code).not.toBeNull();
    expect(decodeSaveCode(code ?? '', NOW)).toMatchObject({ ok: true, save: { coins: 4321 } });
    expect(encodePersistedSave(null)).toBeNull();
    expect(encodePersistedSave('{broken')).toBeNull();
    expect(encodePersistedSave('"text"')).toBeNull();
  });

  it('메신저가 넣은 줄바꿈·공백은 무시', () => {
    const code = encodeSaveCode(sampleSave());
    const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} \r\n${code.slice(50)}  `;
    expect(decodeSaveCode(wrapped, NOW).ok).toBe(true);
  });

  it('한 글자라도 바뀌거나 잘린 코드는 거절', () => {
    const code = encodeSaveCode(sampleSave());
    const i = Math.floor(code.length / 2);
    const flipped = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    expect(decodeSaveCode(flipped, NOW)).toEqual({ ok: false, reason: 'checksum' });
    expect(decodeSaveCode(code.slice(0, -12), NOW).ok).toBe(false);
    expect(decodeSaveCode('', NOW)).toEqual({ ok: false, reason: 'format' });
    expect(decodeSaveCode('hello world', NOW)).toEqual({ ok: false, reason: 'format' });
    expect(decodeSaveCode('MALANG1.@@@.00000000', NOW)).toEqual({ ok: false, reason: 'format' });
  });

  it('체크섬은 맞지만 내용이 JSON이 아니면 거절', () => {
    const payload = 'bm90LWpzb24'; // "not-json"
    expect(decodeSaveCode(`MALANG1.${payload}.${checksum(payload)}`, NOW)).toEqual({ ok: false, reason: 'format' });
  });

  it('말랑이가 없는 빈 기록은 거절 (지금 기록을 지우지 않도록)', () => {
    expect(decodeSaveCode(encodeSaveCode(createInitialSave(NOW)), NOW)).toEqual({ ok: false, reason: 'empty' });
  });

  it('예전 버전 코드는 migrate: v2 뽑기권은 코인으로', () => {
    const old = {
      coins: 50,
      gachaTickets: 3,
      ownedMalangs: { 'soda-drop': { count: 2, firstObtainedAt: 5 } },
      partnerId: 'soda-drop',
    };
    const res = decodeSaveCode(encodeSaveCode(old, 2), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.version).toBe(2);
    expect(res.save.coins).toBe(50 + 3 * 100);
    expect(res.save.ownedMalangs['soda-drop']).toEqual({ count: 2, shinyCount: 0, firstObtainedAt: 5 });
  });

  it('v0 형식도 migrate', () => {
    const res = decodeSaveCode(encodeSaveCode({ coins: 10, tickets: 1, owned: ['ember-imp', 'ember-imp'] }, 0), NOW);
    expect(res).toMatchObject({ ok: true, save: { coins: 110, ownedMalangs: { 'ember-imp': { count: 2 } } } });
  });

  it('손본 값은 sanitize로 걸러진다', () => {
    const res = decodeSaveCode(
      encodeSaveCode({ ...sampleSave(), coins: -999, ownedMalangs: { ...sampleSave().ownedMalangs, hacked: { count: 9 } } }),
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.save.coins).toBe(0);
    expect(res.save.ownedMalangs).not.toHaveProperty('hacked');
  });
});
