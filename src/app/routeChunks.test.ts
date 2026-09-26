import { describe, expect, it } from 'vitest';
import { chunkForPath } from './routeChunks';

describe('chunkForPath', () => {
  it.each([
    ['/gacha', 'gacha'],
    ['#/gacha', 'gacha'],
    ['#/collection', 'collection'],
    ['/play', 'play'],
    ['#/play/malang-merge', 'play'],
    ['/shop', 'shop'],
    ['#/touch/peach-mochi', 'touch'],
    ['#/touch?x=1', 'touch'],
  ])('%s → %s', (path, name) => {
    expect(chunkForPath(path)).toBe(name);
  });

  it('홈·모르는 경로·바깥 주소는 미리 받지 않는다', () => {
    expect(chunkForPath('#/')).toBeNull();
    expect(chunkForPath('/')).toBeNull();
    expect(chunkForPath('#/nope')).toBeNull();
    expect(chunkForPath('https://zunmal.pages.dev/')).toBeNull();
    expect(chunkForPath('#/constructor')).toBeNull();
  });
});
