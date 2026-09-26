import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { FILLING_BY_ID, MATERIALS, MATERIAL_BY_ID, MATERIAL_IDS, fillingOf, materialIdOf, materialOf } from './materials';

describe('촉감 표', () => {
  it('32종 모두 촉감이 정해져 있고 표에 없는 id 가 없다', () => {
    for (const c of CHARACTERS) expect(MATERIAL_BY_ID[c.id], c.id).toBeDefined();
    const ids = new Set(CHARACTERS.map((c) => c.id));
    for (const id of Object.keys(MATERIAL_BY_ID)) expect(ids.has(id), id).toBe(true);
  });

  it('네 가지 촉감이 모두 쓰이고 한쪽으로 쏠리지 않는다', () => {
    const count = new Map<string, number>();
    for (const c of CHARACTERS) count.set(materialIdOf(c), (count.get(materialIdOf(c)) ?? 0) + 1);
    for (const m of MATERIAL_IDS) expect(count.get(m) ?? 0, m).toBeGreaterThanOrEqual(5);
  });

  it('모르는 말랑이는 기본 촉감', () => {
    expect(materialOf({ id: 'nope' }).id).toBe('jelly');
  });

  it('촉감마다 성격이 숫자로 드러난다', () => {
    const { slowRise, jelly, stretchy, sticky } = MATERIALS;
    expect(slowRise.feel.riseTauMs).toBeGreaterThan(0);
    expect(jelly.world.bounce).toBeGreaterThan(slowRise.world.bounce * 3);
    expect(stretchy.feel.stretch).toBeGreaterThanOrEqual(2);
    expect(stretchy.carryFrac).toBeGreaterThan(jelly.carryFrac);
    expect(sticky.feel.stickMs).toBeGreaterThan(0);
    expect(sticky.world.stick).toBeGreaterThan(0);
    for (const m of MATERIAL_IDS) {
      if (m !== 'sticky') expect(MATERIALS[m].world.stick).toBe(0);
    }
  });
});

describe('3D 겉모습', () => {
  it('값이 모두 유효한 범위에 있다', () => {
    for (const m of MATERIAL_IDS) {
      const l = MATERIALS[m].look;
      for (const [k, v] of Object.entries(l)) {
        expect(Number.isFinite(v), `${m}.${k}`).toBe(true);
        expect(v, `${m}.${k}`).toBeGreaterThanOrEqual(0);
        if (k !== 'grainScale' && k !== 'envIntensity') expect(v, `${m}.${k}`).toBeLessThanOrEqual(1);
      }
      expect(l.envIntensity).toBeLessThanOrEqual(2);
      expect(l.grainScale).toBeGreaterThanOrEqual(20);
      // 얼굴을 알아볼 수 있게 외곽선은 가늘게라도 남는다
      expect(l.outline, m).toBeGreaterThan(0);
    }
  });

  it('재질마다 겉모습이 실제 장난감처럼 다르다', () => {
    const { slowRise, jelly, stretchy, sticky } = MATERIALS;
    // 모찌·폼: 가장 매트하고 보송하며 잔결이 있다, 코팅 광택 없음
    for (const o of [jelly, stretchy, sticky]) {
      expect(slowRise.look.roughness).toBeGreaterThan(o.look.roughness);
      expect(slowRise.look.sheen).toBeGreaterThan(o.look.sheen);
      expect(slowRise.look.grain).toBeGreaterThan(o.look.grain);
    }
    expect(slowRise.look.clearcoat).toBe(0);
    // 젤리: 가장 많이 비친다
    for (const o of [slowRise, stretchy, sticky]) expect(jelly.look.translucency).toBeGreaterThan(o.look.translucency);
    // 쭉쭉이: 매트와 젤리 사이 (새틴)
    expect(stretchy.look.roughness).toBeLessThan(slowRise.look.roughness);
    expect(stretchy.look.roughness).toBeGreaterThan(jelly.look.roughness);
    expect(stretchy.look.sheen).toBeGreaterThan(0);
    // 찐득이: 가장 젖은 듯 매끈하고 반사가 날카롭다
    for (const o of [slowRise, jelly, stretchy]) {
      expect(sticky.look.wet).toBeGreaterThan(o.look.wet);
      expect(sticky.look.clearcoatRoughness).toBeLessThan(o.look.clearcoatRoughness);
    }
  });
});

describe('특별한 속', () => {
  it('전설 이상만 속이 있고 모두 있다', () => {
    for (const c of CHARACTERS) {
      const f = fillingOf(c);
      const high = c.rarity === 'legendary' || c.rarity === 'mythic' || c.rarity === 'secret';
      expect(f !== null, c.id).toBe(high);
      if (high) expect(FILLING_BY_ID[c.id], c.id).toBeDefined();
    }
  });

  it('표에 없는 전설은 기본 반짝이 가루', () => {
    const f = fillingOf({ id: 'x', rarity: 'legendary', color: '#123456' });
    expect(f?.kind).toBe('glitter');
    expect(f?.label).toBe('반짝이 가루 속');
  });
});
