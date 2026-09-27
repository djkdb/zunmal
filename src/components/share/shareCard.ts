/**
 * 자랑 카드 그림 (PNG 한 장) — 인스타그램 DM·스토리로 보낼 때 글만 가면 심심하다는 요청.
 * ShareButton 이 필요할 때만 동적 import 하는 작은 청크다(첫 화면 번들에 넣지 않는다).
 *
 * 놀이방 사진과 같은 카드(`touch3d/photo.ts` composePhoto: 하늘 바탕 + 흰 카드 + 하늘 도트 매트 + 등급 칩 + 이름 + 하트 한 줄 + 가게 이름)에
 * 말랑이 한 마리를 가운데 두고, 아래 왼쪽에 주소를 적는다. 말랑이는 화면 밖에 그린 실제 `<Malang>` SVG 를 굽는다.
 */
import type { Character } from '../../data/characters';
import { matPattern, matTileDataUrl } from '../../data/matPatterns';
import type { ShareCardText } from '../../lib/share';
import { frameGroup, photoCardLayout } from '../../touch/photoCard';
import { SHAPES } from '../malang/shapes';
import { RASTER_PAD, composePhoto, rasterizeVisibleMalang } from '../touch3d/photo';

/** 카드 속 말랑이 크기 (가상 화면 px — 매트 무늬가 놀이방 사진과 비슷한 배율이 되게) */
const UNIT = 240;
/** frameGroup 여백 단위 (말랑이 크기 대비) — 작을수록 말랑이가 크게 담긴다 */
const FRAME_UNIT = 0.78;

export interface ShareCardInput {
  /** 화면 밖에 그려 둔 <Malang> svg */
  svg: SVGSVGElement;
  character: Character;
  shiny: boolean;
  text: ShareCardText;
}

export async function renderShareCard(input: ShareCardInput): Promise<File> {
  const shape = SHAPES[input.character.shape];
  const image = await rasterizeVisibleMalang(input.svg, shape.body, shape.bottom);
  const box = { x: 0, y: 0, w: UNIT, h: UNIT };
  const slot = photoCardLayout('', () => 0.5).photo;
  // 놀이방 사진보다 조금 크게 담는다 (한 마리 자랑 카드라 말랑이가 주인공) — 오라 빛살이 거의 다 들어오는 정도
  const capture = frameGroup([box], slot.w / slot.h, UNIT * FRAME_UNIT);
  const pad = UNIT * RASTER_PAD;
  const pattern = matPattern('sky-dots');
  const blob = await composePhoto({
    id: input.character.id,
    name: input.text.title,
    rarity: input.character.rarity,
    shiny: input.shiny,
    level: 1,
    caption: input.text.caption,
    capture,
    mat: { tileUrl: matTileDataUrl('sky-dots'), tile: pattern.tile, base: pattern.base, origin: { x: capture.x, y: capture.y } },
    layers: [{ image, rect: { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad } }],
    footer: input.text.footer,
  });
  return new File([blob], input.text.fileName, { type: 'image/png' });
}
