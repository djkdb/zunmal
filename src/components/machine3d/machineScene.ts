/**
 * 3D 캡슐 머신 (three.js). GachaMachine 이 동적 import 로 불러온다 — 첫 화면 번들에는 없다.
 *
 * 유리 돔 속에 미리 가라앉힌 캡슐 더미(`pile.ts`) + 딸기우유 몸통 + 흰 손잡이 + 배출구.
 * 재질은 모두 코드: 물리 기반 재질(클리어코트 플라스틱·진주·크롬) + RoomEnvironment 반사 + 그림자 한 장.
 * 연출 단계(투입·흔들림·예고·낙하·대기·열기)는 GachaMachine 이 정하고 여기서는 그리기만 한다.
 * 움직이는 것이 없으면 그리지 않는다. 캡슐 버튼(DOM)은 `onHeroRect` 로 받은 자리에 올린다.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  FrontSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Side,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rarityRank, type Rarity } from '../../data/rarity';
import { createSeededRng } from '../../lib/rng';
import type { MachinePhase } from '../GachaMachine';
import { buildSettledPile, pileMotion, stepPile, stirPile, type PieceKind, type PileBody } from './pile';

export interface HeroRect {
  /** 캔버스 상자 기준 px — 캡슐 가운데와 지름 */
  x: number;
  y: number;
  size: number;
}

export interface MachineSceneOptions {
  /** 캔버스를 넣을 상자 (크기도 이 상자를 따른다) */
  container: HTMLElement;
  /** 계속 느리거나 컨텍스트를 잃었다 → SVG 머신으로 돌아간다 */
  onSlow(): void;
  onHeroRect(rect: HeroRect): void;
  /** 성능 조절을 끈다 (개발용 스크린숏) */
  noGovernor?: boolean;
}

export interface MachineRun3d {
  rarity: Rarity;
  shiny?: boolean;
}

export interface MachineScene {
  /** 셰이더 컴파일 + 첫 장면이 끝나면 풀린다 → 그때 SVG 에서 바꾼다 */
  ready: Promise<void>;
  setPhase(phase: MachinePhase, run: MachineRun3d | null, durationMs: number): void;
  /** 돔을 톡 — 캡슐이 들썩인다 (nx, ny: 캔버스 기준 0..1) */
  poke(nx: number, ny: number): void;
  stats(): { emaMs: number; dpr: number; frames: number; calls: number; triangles: number; renderMs: number; initMs: number; settleMs: number };
  dispose(): void;
}

// ── 치수 (돔 반지름 1 기준) ─────────────────────────────────

const NECK_Y = -0.74; // 돔이 몸통 목에 끼는 높이
const BODY = { w: 2.3, h: 1.62, d: 1.5 };
const BODY_Y = NECK_Y - 0.08 - BODY.h / 2;
const BOTTOM_Y = BODY_Y - BODY.h / 2;
const FRONT_Z = BODY.d / 2;
const CHUTE = { x: 0.42, y: -1.94, w: 0.66, h: 0.46 };
const KNOB = { x: -0.52, y: -1.78 };
const SLOT = { x: 0.42, y: -1.4 };
const HERO_R = 0.35;
const TRAY_TOP = CHUTE.y - CHUTE.h / 2 + 0.03;
const HERO_REST = new Vector3(CHUTE.x, TRAY_TOP + HERO_R, FRONT_Z + 0.3);
const CAM_TARGET = new Vector3(0, -0.68, 0);
const FOV = 22;
const MAX_DPR = 2;
/** 캔버스 여백 (머신 상자 폭·높이 대비) — GachaMachine.css 의 .machine__stage3d 와 같아야 한다 */
const STAGE_PAD = { x: 0.14, top: 0.04, bottom: 0.06 };
/** 방 반사 세기 · 키 라이트 세기 (예고 때 둘 다 꺼진다) */
const ENV_BASE = 0.8;
const KEY_BASE = 2.1;

/** 캡슐 윗면 파스텔 (스카이 소다 딸기우유·소다·레몬·민트·포도·복숭아) */
const TONES = ['#ff9fb8', '#8fc3ff', '#ffd66b', '#9fe0b8', '#c9b6ff', '#ffc2a0'];
const PEARL_TONES = ['#fff3f8', '#eef6ff', '#fff8e8'];
const CLOVER_TONES = ['#eef3fa', '#ffc9d8'];
const SHELL = '#ffffff';

/** 결과 캡슐 윗면 (SVG 머신과 같은 색) */
const HERO_TOP: Record<Rarity, string> = {
  common: '#dfe7f1',
  rare: '#7fbfff',
  epic: '#c79bff',
  legendary: '#ffc94d',
  mythic: '#ffb3cf',
  secret: '#3a2a78',
};
/** 등급 빛 (--rarity-*) */
const GLOW: Record<Rarity, string> = {
  common: '#c3cddb',
  rare: '#7db8ff',
  epic: '#b592ff',
  legendary: '#ffc53d',
  mythic: '#ff8fb5',
  secret: '#8f6bff',
};

// ── 코드로 그린 텍스처 ──────────────────────────────────────

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c: HTMLCanvasElement, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

function blobTexture(alpha: number): CanvasTexture {
  const [c, ctx] = canvas2d(128, 128);
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(26,64,128,${alpha})`);
    g.addColorStop(0.45, `rgba(26,64,128,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(26,64,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return tex(c);
}

function glowTexture(): CanvasTexture {
  const [c, ctx] = canvas2d(128, 128);
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return tex(c);
}

/** 빛살: 가운데에서 퍼지는 쐐기 + 바깥으로 옅어짐 */
function raysTexture(rainbow: boolean): CanvasTexture {
  const [c, ctx] = canvas2d(256, 256);
  if (ctx) {
    const n = 18;
    const hues = ['#ff8fab', '#ffd966', '#7fd8be', '#8ecdf7', '#c3a6ff'];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / n / 2.6;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.arc(128, 128, 128, a0, a1);
      ctx.closePath();
      ctx.fillStyle = rainbow ? (hues[i % hues.length] ?? '#fff') : '#fff';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return tex(c);
}

/** 신화 캡슐: 파스텔 무지개가 비스듬히 감긴다 (u 방향으로 끊김 없이) */
function rainbowTexture(): CanvasTexture {
  const [c, ctx] = canvas2d(256, 64);
  if (ctx) {
    const img = ctx.createImageData(256, 64);
    const stops = [
      [255, 143, 171],
      [255, 217, 102],
      [127, 216, 190],
      [142, 205, 247],
      [195, 166, 255],
    ];
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 256; x++) {
        const h = ((2 * x) / 256 + (0.7 * y) / 64) % 1;
        const f = h * stops.length;
        const i = Math.floor(f);
        const a = stops[i % stops.length] ?? [255, 255, 255];
        const b = stops[(i + 1) % stops.length] ?? [255, 255, 255];
        const k = f - i;
        const o = (y * 256 + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.round((a[ch] ?? 255) * (1 - k) + (b[ch] ?? 255) * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return tex(c);
}

/** 시크릿 캡슐: 밤하늘 + 별 (별은 스스로 빛나는 지도로 한 장 더) */
function cosmicTextures(): { map: CanvasTexture; glow: CanvasTexture } {
  const [c, ctx] = canvas2d(256, 128);
  const [s, sctx] = canvas2d(256, 128);
  const rng = createSeededRng(77);
  if (ctx && sctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#120a2e');
    g.addColorStop(0.6, '#2d1b5e');
    g.addColorStop(1, '#6b4fd8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 60; i++) {
      const x = rng() * 256;
      const y = rng() * 110;
      const r = 0.6 + rng() * 1.6;
      for (const k of [ctx, sctx]) {
        k.fillStyle = i % 5 === 0 ? '#ffe07a' : '#ffffff';
        k.beginPath();
        k.arc(x, y, r, 0, Math.PI * 2);
        k.fill();
      }
    }
  }
  return { map: tex(c), glow: tex(s) };
}

function labelTexture(): CanvasTexture {
  const [c, ctx] = canvas2d(512, 128);
  if (ctx) {
    const css = getComputedStyle(document.documentElement);
    const family = css.getPropertyValue('--font-ui').trim() || '"NanumSquareRound", sans-serif';
    ctx.fillStyle = css.getPropertyValue('--ink').trim() || '#22304a';
    ctx.font = `800 58px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'MALANG';
    const spacing = 14;
    const widths = [...text].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
    let x = 256 - total / 2;
    [...text].forEach((ch, i) => {
      const w = widths[i] ?? 0;
      ctx.fillText(ch, x + w / 2, 68);
      x += w + spacing;
    });
  }
  return tex(c);
}

// ── 도형 ────────────────────────────────────────────────────

/** 가운데 기준 둥근 사각형 윤곽 */
function roundedRect(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const k = Math.min(r, w / 2, h / 2);
  const s = new Shape();
  s.moveTo(x + k, y);
  s.lineTo(x + w - k, y);
  s.quadraticCurveTo(x + w, y, x + w, y + k);
  s.lineTo(x + w, y + h - k);
  s.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  s.lineTo(x + k, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - k);
  s.lineTo(x, y + k);
  s.quadraticCurveTo(x, y, x + k, y);
  return s;
}

/** 캡슐 윗반구 + 아랫반구에 겹치는 턱 (이음새) */
function capsuleTopGeometry(): BufferGeometry {
  const dome = new SphereGeometry(1, 28, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const lip = new CylinderGeometry(1.02, 1.02, 0.1, 28, 1, true);
  lip.translate(0, -0.05, 0);
  const edge = new TorusGeometry(1.0, 0.025, 4, 28);
  edge.rotateX(Math.PI / 2);
  edge.translate(0, -0.1, 0);
  const merged = mergeGeometries([dome, lip, edge]);
  dome.dispose();
  lip.dispose();
  edge.dispose();
  return merged ?? new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
}

function capsuleBottomGeometry(): BufferGeometry {
  return new SphereGeometry(0.985, 28, 9, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
}

/** 크롬 마디 공: 위아래로 볼록한 띠가 이어진 선반 돌림 */
function ribbedGeometry(): BufferGeometry {
  const pts: Vector2[] = [];
  const n = 56;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const r = 1 - 0.07 * (0.5 - 0.5 * Math.cos(t * 14));
    pts.push(new Vector2(Math.max(0.0001, Math.sin(t) * r), Math.cos(t) * r));
  }
  return new LatheGeometry(pts, 28);
}

/** 크롬 네잎 꽃: 가로로 네 번 볼록한 통통한 공 */
function cloverGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 36, 18);
  const p = g.attributes.position;
  if (p) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const h = Math.hypot(x, z);
      const az = Math.atan2(z, x);
      const k = 1 + 0.2 * Math.cos(4 * az) * h * h;
      p.setXYZ(i, x * k, y * 0.78, z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 유리의 반사만 그리는 재질: 검은 바탕(빛을 흩뜨리지 않음) + 환경 반사·프레넬.
 * 투명 캔버스 위에서도 맞게 섞이도록 알파 = 반사 밝기(미리 곱한 알파로 "over") — 밝은 반사만 남고 나머지는 비친다.
 */
function reflectionGlass(side: Side, envIntensity: number, roughness: number): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0x000000,
    roughness,
    metalness: 0,
    side,
    transparent: true,
    depthWrite: false,
    envMapIntensity: envIntensity,
    specularIntensity: 1,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = clamp(max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), 0.0, 1.0);',
    );
  };
  return m;
}

// ── 장면 ────────────────────────────────────────────────────

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const easeOutBack = (x: number) => {
  const c1 = 1.7;
  const t = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c1 + 1) * t * t * t + c1 * t * t;
};

interface PieceRec {
  body: PileBody;
  mesh: InstancedMesh;
  /** 두 색 캡슐은 아랫반구도 같은 자리 */
  mesh2?: InstancedMesh;
  index: number;
  q: Quaternion;
  color: Color;
}

export function createMachineScene(opts: MachineSceneOptions): MachineScene {
  const { container } = opts;
  const t0 = performance.now();
  let initMs = 0;
  const canvas = document.createElement('canvas');
  canvas.className = 'machine__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // WebGL 을 못 만들면 throw → 부르는 쪽이 SVG 로
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  container.appendChild(canvas);
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // 그림자는 무언가 움직일 때만 다시 굽는다 (숨쉬기는 장면 전체가 같이 돌아 그림자가 그대로)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = keep(pmrem.fromScene(room, 0.03).texture);
  room.traverse((o) => (o as Mesh).geometry?.dispose());
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = ENV_BASE;

  const camera = new PerspectiveCamera(FOV, 204 / 300, 0.1, 40);

  // 빛: 반사는 방 환경맵이 맡고, 그림자·입체감은 위 앞쪽 키 라이트 하나 + 하늘빛 반구광
  const key = new DirectionalLight(0xffffff, KEY_BASE);
  key.position.set(-1.6, 4.2, 3.2);
  key.target.position.set(0, -0.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -1.5;
  key.shadow.camera.right = 1.5;
  key.shadow.camera.top = 1.4;
  key.shadow.camera.bottom = -2.8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 10;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const hemi = new HemisphereLight(0xe4f0ff, 0xffd9e3, 0.3);
  scene.add(hemi);
  const rim = new DirectionalLight(0xdcecff, 0.7);
  rim.position.set(2.5, 2, -3);
  scene.add(rim);

  const machine = new Group();
  scene.add(machine);

  // ── 재질 ──
  const plastic = keep(
    new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 }),
  );
  const shellMat = keep(
    new MeshPhysicalMaterial({
      color: SHELL,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      sheen: 0.15,
      sheenColor: new Color('#dcecff'),
    }),
  );
  const pearlMat = keep(
    new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      iridescence: 1,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 520],
    }),
  );
  const chromeMat = keep(new MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 }));
  const bodyMat = keep(
    new MeshPhysicalMaterial({ color: '#ffa8bd', roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.14, vertexColors: true }),
  );
  const whiteMat = keep(new MeshPhysicalMaterial({ color: '#fbfdff', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1 }));
  const darkMat = keep(new MeshStandardMaterial({ color: '#2c2640', roughness: 0.6 }));
  const trimMat = keep(new MeshStandardMaterial({ color: '#f2f6fb', metalness: 1, roughness: 0.16 }));
  const gripMat = keep(new MeshPhysicalMaterial({ color: '#ff9fb8', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const coinMat = keep(new MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.28 }));

  // ── 몸통 ──
  const bodyGeo = keep(new RoundedBoxGeometry(BODY.w, BODY.h, BODY.d, 6, 0.3));
  // 구운 가림: 바닥 쪽·돔 목 아래가 살짝 어둡다 (정점 색) — 바닥에 놓인 물건처럼
  {
    const pos = bodyGeo.attributes.position;
    if (pos) {
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / BODY.h + 0.5; // 0 바닥 ~ 1 위
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        const neck = y > 0.97 && r < 0.95 ? 0.9 : 1;
        const v = (0.8 + 0.2 * smooth(y / 0.45)) * neck;
        col[i * 3] = v;
        col[i * 3 + 1] = v;
        col[i * 3 + 2] = v;
      }
      bodyGeo.setAttribute('color', new BufferAttribute(col, 3));
    }
  }
  const body = new Mesh(bodyGeo, bodyMat);
  body.position.y = BODY_Y;
  body.receiveShadow = true;
  machine.add(body);

  // 목: 돔을 받치는 흰 받침 + 크롬 테
  const collarGeo = keep(new CylinderGeometry(0.84, 0.98, 0.2, 48, 1, true));
  const collar = new Mesh(collarGeo, whiteMat);
  collar.position.y = NECK_Y + 0.02;
  collar.receiveShadow = true;
  machine.add(collar);
  const collarTopGeo = keep(new TorusGeometry(0.84, 0.035, 10, 48));
  const collarTop = new Mesh(collarTopGeo, trimMat);
  collarTop.rotation.x = Math.PI / 2;
  collarTop.position.y = NECK_Y + 0.12;
  machine.add(collarTop);
  const floorGeo = keep(new CylinderGeometry(0.8, 0.8, 0.04, 40));
  const floor = new Mesh(floorGeo, whiteMat);
  floor.position.y = -0.72;
  floor.receiveShadow = true;
  machine.add(floor);

  // 돔 꼭대기 흰 뚜껑
  const capGeo = keep(new SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const cap = new Mesh(capGeo, whiteMat);
  cap.position.y = 0.975;
  cap.scale.y = 0.75;
  machine.add(cap);
  const capRingGeo = keep(new TorusGeometry(0.17, 0.022, 8, 32));
  const capRing = new Mesh(capRingGeo, trimMat);
  capRing.rotation.x = Math.PI / 2;
  capRing.position.y = 0.975;
  machine.add(capRing);

  // 이름표
  const plateGeo = keep(new RoundedBoxGeometry(1.24, 0.3, 0.06, 4, 0.03));
  const plate = new Mesh(plateGeo, whiteMat);
  plate.position.set(0, NECK_Y - 0.3, FRONT_Z + 0.01);
  machine.add(plate);
  const labelTex = keep(labelTexture());
  const labelMat = keep(new MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false }));
  const labelGeo = keep(new PlaneGeometry(1.2, 0.3));
  const label = new Mesh(labelGeo, labelMat);
  label.position.set(0, NECK_Y - 0.3, FRONT_Z + 0.045);
  machine.add(label);

  // 손잡이: 흰 원판 + 딸기우유 막대 (흔들림 때 한 바퀴)
  const knob = new Group();
  knob.position.set(KNOB.x, KNOB.y, FRONT_Z);
  const knobBaseGeo = keep(new CylinderGeometry(0.31, 0.33, 0.1, 40));
  const knobBase = new Mesh(knobBaseGeo, whiteMat);
  knobBase.rotation.x = Math.PI / 2;
  knobBase.position.z = 0.04;
  knobBase.castShadow = true;
  knob.add(knobBase);
  const gripGeo = keep(new RoundedBoxGeometry(0.5, 0.13, 0.13, 3, 0.06));
  const grip = new Mesh(gripGeo, gripMat);
  grip.position.z = 0.14;
  grip.castShadow = true;
  knob.add(grip);
  const hubGeo = keep(new SphereGeometry(0.07, 16, 8));
  const hub = new Mesh(hubGeo, trimMat);
  hub.position.z = 0.2;
  knob.add(hub);
  machine.add(knob);

  // 동전 투입구
  const slotGeo = keep(new RoundedBoxGeometry(0.34, 0.2, 0.06, 3, 0.05));
  const slot = new Mesh(slotGeo, whiteMat);
  slot.position.set(SLOT.x, SLOT.y, FRONT_Z + 0.01);
  machine.add(slot);
  const slitGeo = keep(new RoundedBoxGeometry(0.2, 0.045, 0.02, 2, 0.02));
  const slit = new Mesh(slitGeo, darkMat);
  slit.position.set(SLOT.x, SLOT.y, FRONT_Z + 0.04);
  machine.add(slit);
  const coinGeo = keep(new CylinderGeometry(0.085, 0.085, 0.025, 28));
  const coin = new Mesh(coinGeo, coinMat);
  coin.rotation.x = Math.PI / 2;
  coin.visible = false;
  machine.add(coin);

  // 배출구: 둥근 흰 테 + 어두운 구멍 + 반투명 딸기 덮개 + 앞으로 나온 둥근 받침
  const rimShape = roundedRect(CHUTE.w + 0.16, CHUTE.h + 0.16, 0.2);
  rimShape.holes.push(roundedRect(CHUTE.w, CHUTE.h, 0.14));
  const chuteRimGeo = keep(
    new ExtrudeGeometry(rimShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 10 }),
  );
  const chuteRim = new Mesh(chuteRimGeo, whiteMat);
  chuteRim.position.set(CHUTE.x, CHUTE.y, FRONT_Z - 0.02);
  chuteRim.castShadow = true;
  machine.add(chuteRim);
  const holeGeo = keep(new ShapeGeometry(roundedRect(CHUTE.w + 0.02, CHUTE.h + 0.02, 0.15), 10));
  const hole = new Mesh(holeGeo, darkMat);
  hole.position.set(CHUTE.x, CHUTE.y, FRONT_Z + 0.004);
  machine.add(hole);
  const flapPivot = new Group();
  flapPivot.position.set(CHUTE.x, CHUTE.y + CHUTE.h / 2 - 0.02, FRONT_Z + 0.03);
  const flapMat = keep(
    new MeshPhysicalMaterial({ color: '#ffb3c6', roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false }),
  );
  const flapGeo = keep(new ShapeGeometry(roundedRect(CHUTE.w - 0.04, CHUTE.h * 0.6, 0.1), 8));
  const flap = new Mesh(flapGeo, flapMat);
  flap.position.y = -CHUTE.h * 0.3;
  flapPivot.add(flap);
  machine.add(flapPivot);
  const trayShape = roundedRect(CHUTE.w + 0.16, 0.62, 0.22);
  const trayGeo = keep(
    new ExtrudeGeometry(trayShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 }),
  );
  trayGeo.rotateX(-Math.PI / 2);
  const tray = new Mesh(trayGeo, whiteMat);
  tray.position.set(CHUTE.x, TRAY_TOP - 0.09, FRONT_Z + 0.24);
  tray.receiveShadow = true;
  tray.castShadow = true;
  machine.add(tray);

  // 바닥 그림자 (구운 번짐) — 흔들려도 제자리
  const blobTex = keep(blobTexture(0.34));
  const blobMat = keep(new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
  const blobGeo = keep(new PlaneGeometry(3.3, 2.1));
  const blob = new Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, BOTTOM_Y - 0.005, 0.1);
  scene.add(blob);

  // ── 캡슐 더미 ──
  const ts = performance.now();
  const pile = buildSettledPile(20260926);
  const settleMs = performance.now() - ts;
  const pileRng = createSeededRng(4242);
  const counts: Record<PieceKind, number> = { capsule: 0, ball: 0, pearl: 0, ribbed: 0, clover: 0 };
  for (const b of pile.bodies) counts[b.kind]++;
  const topGeo = keep(capsuleTopGeometry());
  const bottomGeo = keep(capsuleBottomGeometry());
  const ballGeo = keep(new SphereGeometry(1, 28, 14));
  const ribGeo = keep(ribbedGeometry());
  const cloverGeo = keep(cloverGeometry());
  const inst = (geo: BufferGeometry, mat: Material, n: number) => {
    const m = keep(new InstancedMesh(geo, mat, Math.max(1, n)));
    m.count = n;
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    machine.add(m);
    return m;
  };
  const tops = inst(topGeo, plastic, counts.capsule);
  const bottoms = inst(bottomGeo, shellMat, counts.capsule);
  const balls = inst(ballGeo, plastic, counts.ball);
  const pearls = inst(ballGeo, pearlMat, counts.pearl);
  const ribs = inst(ribGeo, chromeMat, counts.ribbed);
  const clovers = inst(cloverGeo, chromeMat, counts.clover);
  const next: Record<PieceKind, number> = { capsule: 0, ball: 0, pearl: 0, ribbed: 0, clover: 0 };
  const pieces: PieceRec[] = [];
  const up = new Vector3(0, 1, 0);
  const shellColor = new Color(SHELL);
  for (const b of pile.bodies) {
    const index = next[b.kind]++;
    // 두 색 캡슐은 대부분 색 있는 윗면이 앞·위를 보게 (사진 속 기계처럼 알록달록하게) — 나머지는 아무렇게나
    const facing =
      pileRng() < 0.7
        ? new Vector3(pileRng() * 1.2 - 0.6, 0.7 + pileRng() * 0.5, 0.15 + pileRng() * 0.55)
        : new Vector3(pileRng() - 0.5, pileRng() - 0.5, pileRng() - 0.5);
    const q = new Quaternion().setFromUnitVectors(up, facing.normalize());
    q.multiply(new Quaternion().setFromAxisAngle(up, pileRng() * Math.PI * 2));
    let mesh: InstancedMesh;
    let mesh2: InstancedMesh | undefined;
    let hex: string;
    switch (b.kind) {
      case 'capsule':
        mesh = tops;
        mesh2 = bottoms;
        hex = TONES[b.tone % TONES.length] ?? '#fff';
        break;
      case 'ball':
        mesh = balls;
        hex = TONES[(b.tone + 2) % TONES.length] ?? '#fff';
        break;
      case 'pearl':
        mesh = pearls;
        hex = PEARL_TONES[b.tone % PEARL_TONES.length] ?? '#fff';
        break;
      case 'ribbed':
        mesh = ribs;
        hex = '#eef3fa';
        break;
      case 'clover':
        mesh = clovers;
        hex = CLOVER_TONES[b.tone % CLOVER_TONES.length] ?? '#fff';
        break;
    }
    pieces.push({ body: b, mesh, mesh2, index, q, color: new Color(hex) });
  }
  const m4 = new Matrix4();
  const v3 = new Vector3();
  const s3 = new Vector3();
  const shade = new Color();
  const writePieces = () => {
    for (const p of pieces) {
      v3.set(p.body.x, p.body.y, p.body.z);
      // 크롬 꽃은 가로 반지름이 1.2 → 부딪힘 반지름에 맞춰 줄인다
      const k = p.body.kind === 'clover' ? p.body.r / 1.2 : p.body.r;
      s3.set(k, k, k);
      m4.compose(v3, p.q, s3);
      p.mesh.setMatrixAt(p.index, m4);
      p.mesh2?.setMatrixAt(p.index, m4);
      // 더미 안쪽·아래쪽은 빛이 덜 든다 (구운 앰비언트 가림 흉내) — 뒤쪽도 조금
      const low = smooth((p.body.y - pile.bounds.floorY) / 0.75);
      const back = smooth((-p.body.z + 0.2) / 0.8);
      const ao = 0.62 + 0.38 * low - 0.1 * back;
      p.mesh.setColorAt(p.index, shade.copy(p.color).multiplyScalar(ao));
      p.mesh2?.setColorAt(p.index, shade.copy(shellColor).multiplyScalar(ao));
    }
    for (const m of [tops, bottoms, balls, pearls, ribs, clovers]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };
  writePieces();

  // ── 유리 돔: 흐린 막 + 가산 반사 껍질(안쪽 면·바깥 면) ──
  const domeGeo = keep(new SphereGeometry(1, 48, 32));
  const glassBack = keep(reflectionGlass(BackSide, 0.8, 0.06));
  // 유리 두께: 가장자리로 갈수록 짙어지는 옅은 하늘빛 막 (프레넬) — 밝은 바탕 위에서도 돔 윤곽이 보인다
  const glassFilm = keep(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new Color('#cfe3fa') }, uEdge: { value: 0.5 }, uBase: { value: 0.05 } },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uEdge;
        uniform float uBase;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          gl_FragColor = vec4(uColor, uBase + uEdge * f);
          #include <colorspace_fragment>
        }`,
    }),
  );
  const glassFront = keep(reflectionGlass(FrontSide, 1.9, 0.03));
  const domeBack = new Mesh(domeGeo, glassBack);
  const domeFilm = new Mesh(domeGeo, glassFilm);
  const domeFront = new Mesh(domeGeo, glassFront);
  domeBack.renderOrder = 1;
  domeFilm.renderOrder = 2;
  domeFront.renderOrder = 3;
  machine.add(domeBack, domeFilm, domeFront);

  // 돔 안 등급 빛 (흔들림·예고 때만)
  const inner = new PointLight(0xffffff, 0, 3.5, 1.6);
  inner.position.set(0, -0.25, 0.1);
  machine.add(inner);

  // ── 결과 캡슐 ──
  const hero = new Group();
  hero.visible = false;
  const heroTopMat = keep(
    new MeshPhysicalMaterial({
      color: HERO_TOP.common,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      emissive: 0xffffff,
      emissiveIntensity: 0,
    }),
  );
  const heroBottomMat = keep(
    new MeshPhysicalMaterial({
      color: SHELL,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      sheen: 0.15,
      sheenColor: new Color('#dcecff'),
    }),
  );
  const heroTop = new Mesh(topGeo, heroTopMat);
  const heroBottom = new Mesh(bottomGeo, heroBottomMat);
  heroTop.castShadow = heroBottom.castShadow = true;
  heroTop.renderOrder = heroBottom.renderOrder = 6;
  const heroTilt = new Group();
  heroTilt.add(heroTop, heroBottom);
  heroTilt.scale.setScalar(HERO_R);
  hero.add(heroTilt);
  machine.add(hero);
  const heroShadowTex = keep(blobTexture(0.5));
  const heroShadowMat = keep(
    new MeshBasicMaterial({ map: heroShadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }),
  );
  const heroShadowGeo = keep(new PlaneGeometry(0.8, 0.5));
  const heroShadow = new Mesh(heroShadowGeo, heroShadowMat);
  heroShadow.rotation.x = -Math.PI / 2;
  heroShadow.position.set(HERO_REST.x, TRAY_TOP + 0.003, HERO_REST.z);
  heroShadow.renderOrder = 4;
  machine.add(heroShadow);

  const glowTex = keep(glowTexture());
  const glowMat = keep(
    new MeshBasicMaterial({ map: glowTex, blending: AdditiveBlending, premultipliedAlpha: true, toneMapped: false, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
  );
  // 빛·빛살은 카메라를 보는 평면 (스프라이트 셰이더는 미리 곱한 알파를 지원하지 않아 투명 캔버스 위에서 하얗게 뜬다)
  const quadGeo = keep(new PlaneGeometry(1, 1));
  const glow = new Mesh(quadGeo, glowMat);
  glow.renderOrder = 5;
  glow.scale.setScalar(HERO_R * 5);
  machine.add(glow);
  const raysTex = keep(raysTexture(false));
  const rainbowRaysTex = keep(raysTexture(true));
  const raysMat = keep(
    new MeshBasicMaterial({ map: raysTex, blending: AdditiveBlending, premultipliedAlpha: true, toneMapped: false, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
  );
  const rays = new Mesh(quadGeo, raysMat);
  glow.rotation.x = rays.rotation.x = -0.1; // 카메라가 살짝 내려다보는 만큼
  rays.renderOrder = 5;
  rays.scale.setScalar(HERO_R * 7.5);
  machine.add(rays);
  const rainbowTex = keep(rainbowTexture());
  const cosmic = cosmicTextures();
  keep(cosmic.map);
  keep(cosmic.glow);

  // ── 상태 ──
  let phase: MachinePhase = 'idle';
  let run: MachineRun3d | null = null;
  let phaseAt = performance.now();
  let phaseDur = 1;
  let nextStirAt = Infinity;
  let stirsLeft = 0;
  let simAwake = false;
  let calmSteps = 0;
  let simAcc = 0;
  let breatheUntil = performance.now() + 5000;
  let breatheAmp = 0;
  let heroColorKey = '';
  let disposed = false;

  const rank = () => (run ? rarityRank(run.rarity) : 0);

  function setHeroLook(r: Rarity, shiny: boolean) {
    const k = `${r}:${shiny}`;
    if (k === heroColorKey) return;
    heroColorKey = k;
    heroTopMat.map = r === 'mythic' ? rainbowTex : r === 'secret' ? cosmic.map : null;
    heroTopMat.color.set(r === 'mythic' || r === 'secret' ? '#ffffff' : HERO_TOP[r]);
    heroTopMat.emissiveMap = r === 'secret' ? cosmic.glow : null;
    heroTopMat.emissiveIntensity = r === 'secret' ? 1.3 : 0;
    heroTopMat.iridescence = shiny || r === 'mythic' ? 1 : 0;
    heroTopMat.roughness = r === 'legendary' ? 0.18 : 0.26;
    heroTopMat.metalness = r === 'legendary' ? 0.35 : 0;
    heroTopMat.needsUpdate = true;
    heroBottomMat.iridescence = shiny ? 1 : 0;
    heroBottomMat.needsUpdate = true;
    const glowColor = r === 'legendary' && phase === 'dropping' ? GLOW.epic : GLOW[r];
    glowMat.color.set(glowColor);
    raysMat.map = r === 'mythic' ? rainbowRaysTex : raysTex;
    raysMat.color.set(r === 'mythic' ? '#ffffff' : GLOW[r]);
    raysMat.needsUpdate = true;
  }

  // ── 크기·카메라 ──
  let width = 1;
  let height = 1;
  function layout() {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    // 캔버스는 SVG 머신 상자보다 조금 크다 (빛살·흔들림이 잘리지 않게) — 카메라는 머신 상자에 맞추고 넓힌다
    const boxW = width / (1 + 2 * STAGE_PAD.x);
    const boxH = (boxW * 300) / 204;
    const offX = STAGE_PAD.x * boxW;
    const offY = STAGE_PAD.top * boxH;
    const aspect = boxW / boxH;
    camera.aspect = aspect;
    // 머신 전체(돔 꼭대기 ~ 바닥, 몸통 폭)가 상자에 들어오는 거리
    const half = Math.tan(((FOV / 2) * Math.PI) / 180);
    const needH = 3.72;
    const needW = 2.74;
    const dist = Math.max(needH / (2 * half), needW / (2 * half * aspect));
    const pitch = 0.1; // 살짝 내려다본다
    camera.position.set(0, CAM_TARGET.y + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(CAM_TARGET);
    camera.setViewOffset(boxW, boxH, -offX, -offY, width, height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // 결과 캡슐 자리 → DOM 버튼 (머신 상자 기준 px)
    const c = HERO_REST.clone().project(camera);
    const edge = HERO_REST.clone().add(new Vector3(HERO_R, 0, 0)).project(camera);
    opts.onHeroRect({
      x: ((c.x + 1) / 2) * width - offX,
      y: ((1 - c.y) / 2) * height - offY,
      size: Math.abs(edge.x - c.x) * width,
    });
  }

  // ── 그리기 루프 ──
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let emaMs = 16.7;
  let samples = 0;
  let frames = 0;
  let slowStrikes = 0;
  let renderMs = 0;

  function wake() {
    if (disposed || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function update(now: number, dt: number): boolean {
    const t = now - phaseAt;
    const p = Math.min(1, t / phaseDur);
    let busy = false;
    const r = rank();

    // 캡슐 더미 물리 (고정 스텝)
    if (stirsLeft > 0 && now >= nextStirAt) {
      stirPile(pile, pileRng, 0.9 + 0.22 * r);
      stirsLeft--;
      nextStirAt = now + 260;
      simAwake = true;
      calmSteps = 0;
    }
    if (simAwake) {
      simAcc = Math.min(simAcc + dt, 0.05);
      const h = 1 / 120;
      while (simAcc >= h) {
        const before = pieces.map((pc) => [pc.body.x, pc.body.z]);
        stepPile(pile, h, { damping: 0.994, friction: 0.9 });
        // 굴러간 만큼 돌린다 (바닥 쪽 수평 이동 → 수평 축 둘레 회전)
        pieces.forEach((pc, i) => {
          const b0 = before[i];
          if (!b0) return;
          const dx = pc.body.x - (b0[0] ?? 0);
          const dz = pc.body.z - (b0[1] ?? 0);
          const d = Math.hypot(dx, dz);
          if (d < 1e-6) return;
          tmpQ.setFromAxisAngle(tmpAxis.set(dz / d, 0, -dx / d), d / pc.body.r);
          pc.q.premultiply(tmpQ);
        });
        simAcc -= h;
        if (pileMotion(pile) < 2e-9) calmSteps++;
        else calmSteps = 0;
      }
      writePieces();
      if (calmSteps > 40 && stirsLeft === 0) simAwake = false;
      busy = true;
    }

    // 머신 흔들림·손잡이·빛
    machine.position.set(0, 0, 0);
    machine.rotation.set(0, 0, 0);
    let innerTarget = 0;
    let envTarget = ENV_BASE;
    if (phase === 'inserting') {
      coin.visible = p < 0.95;
      const fall = smooth(p / 0.7);
      coin.position.set(SLOT.x, SLOT.y + 0.5 - 0.5 * fall, FRONT_Z + 0.12);
      coin.scale.set(1, 1, 1 - 0.6 * smooth((p - 0.7) / 0.3));
      busy = p < 1;
    } else coin.visible = false;
    if (phase === 'shaking') {
      knob.rotation.z = -Math.PI * 2 * smooth(p);
      const amp = 0.022 * (1 + 0.35 * r) * (1 - 0.3 * p);
      const w = now * 0.042;
      machine.position.x = Math.sin(w) * amp;
      machine.rotation.z = Math.sin(w + 0.9) * 0.01 * (1 + 0.3 * r);
      if (r >= 2) innerTarget = (r - 1) * 5 * smooth(p * 1.6);
      busy = true;
    } else if (phase === 'tease') {
      // 불이 깜빡이며 꺼지고, 머신이 낮게 웅웅 떤다
      const flick = [0.35, 1, 0.3, 1, 0.25, 1.4];
      const i = Math.min(flick.length - 1, Math.floor(p * flick.length));
      envTarget = p < 0.8 ? 0.25 * (flick[i] ?? 1) : 0.35;
      innerTarget = 10 + 8 * Math.sin(now * 0.02);
      machine.position.x = Math.sin(now * 0.09) * 0.006;
      busy = true;
    } else if (phase !== 'dropping' && phase !== 'ready' && phase !== 'opening') {
      knob.rotation.z = 0;
    }
    if (run?.rarity === 'secret' && (phase === 'dropping' || phase === 'ready' || phase === 'opening')) {
      innerTarget = 6;
    }
    inner.color.set(run ? GLOW[run.rarity === 'legendary' && phase === 'shaking' ? 'legendary' : run.rarity] : '#ffffff');
    const k = 1 - Math.exp(-dt * 10);
    inner.intensity += (innerTarget - inner.intensity) * k;
    scene.environmentIntensity += (envTarget - scene.environmentIntensity) * k;
    key.intensity = (KEY_BASE * scene.environmentIntensity) / ENV_BASE;
    if (Math.abs(innerTarget - inner.intensity) > 0.05 || Math.abs(envTarget - scene.environmentIntensity) > 0.01) busy = true;

    // 결과 캡슐
    const showHero = !!run && (phase === 'dropping' || phase === 'ready' || phase === 'opening');
    hero.visible = showHero;
    flapPivot.rotation.x = 0;
    heroShadowMat.opacity = 0;
    glowMat.opacity = 0;
    raysMat.opacity = 0;
    if (showHero && run) {
      setHeroLook(run.rarity === 'legendary' && phase === 'dropping' ? 'epic' : run.rarity, !!run.shiny);
      heroTop.position.set(0, 0, 0);
      heroTop.rotation.set(0, 0, 0);
      heroBottom.position.set(0, 0, 0);
      heroTopMat.opacity = 1;
      heroBottomMat.opacity = 1;
      hero.rotation.set(-0.32, 0.35, 0);
      hero.scale.setScalar(1);
      hero.position.copy(HERO_REST);
      if (phase === 'dropping') {
        // 배출구에서 쏙 나와(덮개가 들림) 폴짝 떴다가 받침에 철퍽
        const a = smooth(p / 0.3);
        const b = Math.min(1, Math.max(0, (p - 0.3) / 0.7));
        const hop = Math.sin(Math.PI * Math.min(1, b / 0.72)) * 0.42 * (b < 0.72 ? 1 : 0);
        const z0 = FRONT_Z - 0.1;
        hero.position.set(HERO_REST.x, HERO_REST.y + hop, z0 + (HERO_REST.z - z0) * a);
        hero.scale.setScalar(0.55 + 0.45 * a);
        hero.rotation.x = -0.32 - (1 - smooth(b)) * Math.PI * 2;
        flapPivot.rotation.x = -1.1 * Math.sin(Math.PI * Math.min(1, p / 0.45));
        if (b > 0.72) {
          const s = Math.sin(((b - 0.72) / 0.28) * Math.PI) * 0.16;
          hero.scale.set(1 + s, 1 - s, 1 + s);
        }
        heroShadowMat.opacity = a * (1 - hop);
        glowMat.opacity = r >= 1 ? 0.35 * a : 0;
        busy = true;
      } else if (phase === 'ready') {
        const cyc = (t % 1000) / 1000;
        const wig = cyc < 0.6 ? Math.sin((cyc / 0.6) * Math.PI * 2) * -0.14 * Math.sin((cyc / 0.6) * Math.PI) : 0;
        hero.rotation.z = wig;
        // 전설: 착지 순간 금빛으로 승격 — 톡 부푼다
        const pop = run.rarity === 'legendary' ? 1 + 0.14 * (1 - easeOutBack(t / 320)) : 1;
        hero.scale.setScalar(pop);
        heroShadowMat.opacity = 1;
        const breathe = 0.5 + 0.5 * Math.sin((t / 1400) * Math.PI * 2);
        glowMat.opacity = r >= 1 ? (r === 1 ? 0.3 : 0.45 + 0.3 * breathe) : 0;
        glow.scale.setScalar(HERO_R * (4.4 + 0.8 * breathe));
        if (r >= rarityRank('legendary')) {
          raysMat.opacity = 0.75 * smooth(t / 200);
          rays.rotation.z = -(t / 5000) * Math.PI * 2;
        }
        busy = true;
      } else if (phase === 'opening') {
        const e = smooth(p / 0.7);
        heroTop.position.set(-0.3 * e, 1.9 * e, 0);
        heroTop.rotation.z = 0.5 * e;
        heroBottom.position.y = -0.3 * e;
        heroTopMat.opacity = 1 - smooth((p - 0.35) / 0.65);
        heroBottomMat.opacity = 1 - 0.7 * smooth((p - 0.2) / 0.8);
        heroShadowMat.opacity = 1 - e * 0.6;
        glowMat.opacity = r >= 1 ? 0.8 * (1 - p) : 0;
        busy = p < 1;
      }
      glow.position.set(hero.position.x, hero.position.y, hero.position.z - 0.05);
      rays.position.copy(glow.position);
    }

    // 가만히: 카메라가 아주 느리게 숨쉰다 (끝날 때 부드럽게 멈춤)
    const target = now < breatheUntil && phase === 'idle' ? 1 : 0;
    breatheAmp += (target - breatheAmp) * (1 - Math.exp(-dt * 1.5));
    if (breatheAmp < 0.002 && target === 0) breatheAmp = 0;
    const ang = breatheAmp * 0.07 * Math.sin((now / 5200) * Math.PI * 2);
    scene.rotation.y = ang;
    if (breatheAmp > 0) busy = true;
    return busy;
  }

  const tmpQ = new Quaternion();
  const tmpAxis = new Vector3();

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    const interval = now - last;
    last = now;
    const wasAwake = simAwake;
    const busy = update(now, dt);
    if (wasAwake || simAwake || phase !== 'idle') renderer.shadowMap.needsUpdate = true;
    // 숨쉬기·대기 흔들기만 있으면 30fps 로 충분
    const lazy = !simAwake && (phase === 'idle' || phase === 'ready');
    if (!lazy || now - lastDraw >= 32) {
      const r0 = performance.now();
      renderer.render(scene, camera);
      renderMs = renderMs * 0.8 + (performance.now() - r0) * 0.2;
      lastDraw = now;
      frames++;
      if (!lazy && !opts.noGovernor) govern(interval);
    }
    if (busy) raf = requestAnimationFrame(frame);
  }

  /** 느리면 해상도부터 낮추고, 그래도 20fps 아래면 SVG 로 */
  function govern(interval: number) {
    if (interval <= 0 || interval > 250) return;
    emaMs = emaMs * 0.9 + interval * 0.1;
    samples++;
    if (samples < 24) return;
    if (emaMs > 26 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      samples = 0;
      emaMs = 18;
    } else if (emaMs > 50) {
      if (++slowStrikes >= 2) opts.onSlow();
      samples = 0;
      emaMs = 30;
    }
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    opts.onSlow();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    layout();
    renderer.render(scene, camera);
  }) : null;
  ro?.observe(container);
  layout();
  // 셰이더는 가능하면 병렬로 컴파일하고(첫 화면 멈춤 방지) 끝나면 첫 장면을 그린다
  const ready = renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(() => {
      if (disposed) return;
      renderer.render(scene, camera);
      initMs = performance.now() - t0;
      wake();
    });

  return {
    setPhase(next, nextRun, durationMs) {
      if (disposed) return;
      const prev = phase;
      phase = next;
      run = nextRun;
      phaseAt = performance.now();
      phaseDur = Math.max(1, durationMs);
      if (next === 'shaking' && prev !== 'shaking') {
        stirsLeft = 4;
        nextStirAt = phaseAt;
      }
      renderer.shadowMap.needsUpdate = true;
      if (next === 'idle') {
        heroColorKey = '';
        breatheUntil = phaseAt + 4000;
      }
      wake();
    },
    poke(nx, ny) {
      if (disposed) return;
      // 돔(화면 위쪽 절반쯤)을 누르면 캡슐이 들썩인다
      void nx;
      if (ny < 0.5 && phase === 'idle') {
        stirPile(pile, pileRng, 0.45);
        simAwake = true;
        calmSteps = 0;
      }
      breatheUntil = performance.now() + 5000;
      wake();
    },
    ready,
    stats: () => ({ emaMs, dpr, frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, renderMs, initMs, settleMs }),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      scene.traverse((o: Object3D) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry?.dispose();
      });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
