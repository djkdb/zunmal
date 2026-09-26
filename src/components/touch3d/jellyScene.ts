/**
 * 놀이방 3D 젤리 무대 (three.js). 놀이방 페이지가 동적 import 로만 불러온다 — 첫 화면 번들과 분리.
 *
 * - 무대(JellyStage) 하나 = 렌더러·장면·카메라 하나. 매트 위 말랑이 N 마리는 무대 안의 몸(JellyBodyView)이다.
 *   몸마다 메시·재질·텍스처를 갖고, 그리기는 무대가 한 번에 한다 (render-on-demand: 페이지가 부를 때만).
 * - 몸: 말랑이 윤곽을 부풀린 메시(touch/jellyMesh) + 순수 스프링 변형(touch/softbody).
 *   정점은 CPU 에서 옮기고 법선을 다시 계산한다 (몸당 정점 약 2.6k) — 멈춰 있는 몸은 다시 계산하지 않는다.
 * - 겉모습: 실제 <Malang> SVG 를 구운 텍스처(얼굴·무늬·앞 장식 포함)를 앞면에 투영 → 찌그러지면 얼굴도 같이 찌그러진다.
 *   몸 밖으로 나온 장식은 몸 뒤/앞의 평평한 카드로 그려 같은 변형장을 따라 움직인다.
 * - 재질: 실제 말랑이 장난감 사진처럼. MeshPhysicalMaterial(클리어코트·쉰·박막) + 덧붙인 GLSL 하나를
 *   촉감별 겉모습 값(`data/materials` 의 `look`)으로 바꿔 네 가지로 그린다 — 매트한 폼(모찌), 속이 비치는 구미 젤리,
 *   새틴 실리콘, 젖은 슬라임. 빛: 스튜디오 방 반사(RoomEnvironment → PMREM, 렌더러당 한 번) + 주광·보조광·역광.
 *   · 가짜 속 비침: 감싸는 빛 + 두꺼운 가운데는 진하게 + 얇은 가장자리로 새는 빛 + 바닥에 모이는 빛 (새 패스 없음)
 *   · 잔결: 코드로 만든 값 노이즈를 화면 미분으로 법선에 얹는 범프 (텍스처 없음)
 *   · 자국: 정점마다 법선을 다시 계산해 반사가 자국을 따라 미끄러지고, 자국 바닥은 가려진 만큼 어둡다(쉬는 자세 좌표 + 자국 uniform)
 *   · 그림 텍스처의 2D 광택·그늘은 빼고 굽는다 (진짜 빛과 겹치지 않게). 외곽선은 몸색을 짙게 한 가는 뒤집힌 껍질.
 *   · 바닥: 넓고 흐린 그림자 + 닿은 자리의 진한 접촉 그림자 (실제 발자국 폭을 따라 눌리면 넓고 진해지고, 들면 옅어진다)
 * - 3/4 시점: 몸은 화면을 보고 서 있고, 매트 깊이는 z(카메라 쪽)로 둔다. 원근 때문에 앞뒤 몸의 크기·위치가
 *   어긋나지 않도록 z 만큼 위치·크기를 되돌려(보정) DOM 좌표와 정확히 맞춘다.
 * - 성능: 렌더러 하나를 공유해 다시 만들지 않는다. DPR 최대 2 (느리면 1.5 → 1.25). 떠나면 dispose + 컨텍스트 해제.
 * - 3단계(꾸미기·단체 사진)는 이 무대에 소품 메시를 더하는 자리(`stage.scene`)를 쓴다.
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Box3,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  Group,
  SRGBColorSpace,
  Sphere,
  Triangle,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MalangShape } from '../../data/characters';
import { DEFAULT_MATERIAL, MATERIALS, type MaterialLook } from '../../data/materials';
import { SHAPES } from '../malang/shapes';
import { VIEWBOX } from '../malang/helpers';
import { buildCardGrid, buildJellyMesh, computeNormals, flattenPath, type JellyMesh } from '../../touch/jellyMesh';
import { createScratch, deformJelly, deformPoints, type Pose, type SoftHit, type SoftState } from '../../touch/softbody';
import { rasterizeMalang, type RasterRect } from './rasterMalang';
import { faceExtras, type TouchFace } from '../../touch/faceExtras';

export type JellyFace = TouchFace;

export interface JellyStageOptions {
  /** 캔버스를 붙일 상자 (매트 전체를 덮는 절대 위치 요소) */
  container: HTMLElement;
  /** WebGL 컨텍스트를 잃었을 때 (2D 로 돌아간다) */
  onLost: () => void;
}

export interface JellyBodyOptions {
  shape: MalangShape;
  /** 얼굴별 원본 SVG (화면 밖에 그려 둔 <Malang>) */
  getSource: (face: JellyFace) => SVGSVGElement | null;
  /** 첫 얼굴 */
  face: JellyFace;
  /** 몸 뒤 빛 (전설 이상·반짝). strength 0 이면 없음 */
  glow?: { color: string; strength: number };
  /** 반짝 말랑이 무지갯빛 (0~1) */
  iridescence?: number;
  /**
   * 몸속 특별한 속 (전설 이상): kind = touch/filling 의 fillKindIndex (1 반짝이 가루, 2 물방울 속 별, 3 은하, 4 무지개 젤).
   * 셰이더 uniform 만으로 그린다 (새 텍스처·렌더 타깃 없음).
   */
  filling?: { kind: number; colors: readonly [string, string] };
  /** 촉감별 겉모습 (`materialOf(c).look`). 없으면 탱탱 젤리 */
  look?: MaterialLook;
  /** 몸 대표 색 — 가는 외곽선을 몸색을 짙게 한 색으로 */
  color?: string;
}

/** 몸을 놓을 자리 (client px) */
export interface BodyPlacement {
  /** 몸통 바닥 가운데 (들어 올린 높이 포함) */
  x: number;
  y: number;
  /** 그림 좌표 1 단위가 몇 px 인가 (말랑이 상자 px / VIEWBOX.w) */
  unit: number;
  /** 앞뒤 순서: 클수록 앞 (px 단위, 매트 위 깊이) */
  depth: number;
  /** 매트에서 들어 올린 높이 (px) — 그림자는 매트에 남는다 */
  lift: number;
}

export interface JellyBodyView {
  /** 텍스처를 구우면 끝난다. 실패하면 reject → 이 몸은 2D 로 */
  ready: Promise<void>;
  place(p: BodyPlacement): void;
  /** 화면 좌표 → 이 몸 표면 (쉬는 자세 기준). 몸 밖이면 null */
  hit(clientX: number, clientY: number): SoftHit | null;
  /** 앞면 가운데 (키보드 조작용) */
  frontHit(): SoftHit;
  /** 변형 (그리기는 stage.render) */
  update(pose: Pose, soft: SoftState): void;
  setFace(face: JellyFace): void;
  /** 얼굴을 손가락 쪽으로 (그림 좌표, 최대 몇 단위) */
  setGaze(x: number, y: number): void;
  /** 만질 때 몸 뒤 빛과 가장자리 빛이 잠깐 부푼다 (0~1) */
  pulse(amount: number): void;
  /** 몸속 속의 밝기(0~1)와 소용돌이 각도(rad) */
  setFill(glow: number, swirl: number): void;
  /** 빛이 아직 부풀어 있다 → 페이지가 그리기를 계속해야 한다 */
  busy(): boolean;
  setVisible(v: boolean): void;
  dispose(): void;
}

export interface JellyStage {
  addBody(opts: JellyBodyOptions): JellyBodyView;
  /** 화면 좌표에서 가장 앞에 닿는 몸 (없으면 null) */
  pick(clientX: number, clientY: number): { body: JellyBodyView; hit: SoftHit } | null;
  /** 크기 다시 맞추기 (창 크기 변경) */
  layout(): void;
  render(): void;
  /** 지금 모습을 다시 그려 2D 캔버스로 복사 (사진 찍기). 컨테이너 전체 */
  snapshot(): HTMLCanvasElement | null;
  canvas: HTMLCanvasElement;
  /** 3단계 소품이 들어갈 장면 */
  scene: Scene;
  dispose(): void;
}

const INK = '#2b2233';
const FOV = 20;
const TEX_SIZE = 512;
/** 외곽선 두께 (몸 좌표 단위, 1 ≈ 말랑이 크기 230px 에서 1.55px) */
const OUTLINE = 2.8;
/** 잔결 범프 세기 배수 (look.grain 1 일 때) */
const GRAIN_BUMP = 1;
/** 몸 밖 장식을 담는 영역 (VIEWBOX 보다 조금 넓게 — 후광·반짝이) */
const CARD_RECT: RasterRect = { x: VIEWBOX.x - 10, y: VIEWBOX.y - 10, w: VIEWBOX.w + 20, h: VIEWBOX.h + 20 };
const MAX_DPR = 2;

// ── 공유 렌더러 ───────────────────────────────────────────

interface Shared {
  renderer: WebGLRenderer;
  env: Texture;
  users: number;
  releaseTimer: number | null;
  dpr: number;
}

let shared: Shared | null = null;

/** WebGL 을 만들 수 없으면 throw */
function acquireRenderer(): Shared {
  if (shared) {
    if (shared.releaseTimer !== null) window.clearTimeout(shared.releaseTimer);
    shared.releaseTimer = null;
    shared.users++;
    return shared;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'touch3d__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'default',
  });
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  // 스튜디오 방을 하늘빛으로 물들인다: 회색 벽이 비치면 말랑이 가장자리가 쇠붙이처럼 보인다 → 매트와 같은 맑은 하늘 반사
  envScene.traverse((o) => {
    const m = o as Mesh;
    const mat = m.isMesh ? (m.material as MeshStandardMaterial) : null;
    if (!mat || !('color' in mat) || !mat.color) return;
    if (mat.side === BackSide) mat.color.set('#d6e8ff');
    else if (!mat.emissive || mat.emissive.getHex() === 0) mat.color.set('#f4f8ff');
  });
  // 렌더러당 한 번만 굽는다 (무대·몸이 여럿이어도 같은 텍스처)
  const env = pmrem.fromScene(envScene, 0.04).texture;
  envScene.dispose();
  pmrem.dispose();
  shared = { renderer, env, users: 1, releaseTimer: null, dpr };
  return shared;
}

function releaseRenderer() {
  const s = shared;
  if (!s) return;
  s.users = Math.max(0, s.users - 1);
  if (s.users > 0) return;
  // 캐릭터를 바꾸면 곧바로 새 장면이 같은 렌더러를 가져간다 → 잠깐 기다렸다가 정리
  s.releaseTimer = window.setTimeout(() => {
    if (shared !== s || s.users > 0) return;
    shared = null;
    s.env.dispose();
    s.renderer.dispose();
    // 모바일 브라우저의 WebGL 컨텍스트 수 제한 대비
    s.renderer.forceContextLoss();
    s.renderer.domElement.remove();
  }, 1200);
}

// ── 텍스처 ───────────────────────────────────────────────

function toTexture(canvas: HTMLCanvasElement, renderer: WebGLRenderer): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // 곧은 알파로 올린다 — 카드 재질(premultipliedAlpha)이 셰이더에서 한 번 곱한다. 두 번 곱하면 빛 번짐이 거뭇해진다
  tex.premultiplyAlpha = false;
  return tex;
}

/** 몸 뒤 빛: 가운데가 밝은 둥근 번짐 (한 번 그려 두고 색·세기는 재질로) */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * 바닥 그림자 한 장 (타원 번짐). soft = 넓고 흐린 주변 그림자, 아니면 닿은 자리의 진한 접촉 그림자.
 * 색은 매트 하늘빛에 맞춘 푸른 잉크 (스카이 소다 그림자와 같은 기운).
 */
function shadowTexture(soft: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 0.25, 0, 0);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (soft) {
      g.addColorStop(0, 'rgba(30,52,96,0.42)');
      g.addColorStop(0.45, 'rgba(30,52,96,0.24)');
      g.addColorStop(0.8, 'rgba(30,52,96,0.07)');
      g.addColorStop(1, 'rgba(30,52,96,0)');
    } else {
      g.addColorStop(0, 'rgba(22,32,58,0.85)');
      g.addColorStop(0.5, 'rgba(22,32,58,0.6)');
      g.addColorStop(0.78, 'rgba(22,32,58,0.18)');
      g.addColorStop(1, 'rgba(22,32,58,0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ── 재질 ─────────────────────────────────────────────────

/** 주광 방향 (월드 = 보기 공간: 카메라는 돌지 않는다) — 왼쪽 위 앞 */
const KEY_DIR = new Vector3(-0.55, 0.9, 0.8).normalize();
/** 동시에 셰이더로 넘기는 자국 수 (softbody SOFT_TUNING.maxDents 와 같게) */
const MAX_DENTS = 3;

interface JellyUniforms {
  uGaze: { value: Vector2 };
  uFaceUv: { value: Vector2 };
  uFaceR: { value: Vector2 };
  uRimBoost: { value: number };
  uRimColor: { value: Color };
  uShiny: { value: number };
  uTime: { value: number };
  /** 몸속 속: x 종류(0 없음), y 켜짐, z 소용돌이, w 밝기 */
  uFill: { value: Vector4 };
  uFillA: { value: Color };
  uFillB: { value: Color };
  /** 겉모습: x 속 비침, y 가장자리 어둡게, z 그림 색 지키기, w 젖은 반사점 */
  uLook: { value: Vector4 };
  /** 잔결: x 세기, y 촘촘함 */
  uGrain: { value: Vector2 };
  uKeyDir: { value: Vector3 };
  /** 자국 (쉬는 자세 몸 좌표): xyz 가운데, w 반지름 */
  uDentC: { value: Vector4[] };
  /** 자국 깊이 (안쪽 +) */
  uDentD: { value: Vector3 };
  /** 몸 높이 (쉬는 자세) */
  uHeight: { value: number };
}

function jellyMaterial(map: Texture, u: JellyUniforms, iridescence: number, look: MaterialLook, env: Texture): MeshPhysicalMaterial {
  const mat = new MeshPhysicalMaterial({
    map,
    roughness: look.roughness,
    metalness: 0,
    clearcoat: look.clearcoat,
    clearcoatRoughness: look.clearcoatRoughness,
    sheen: look.sheen,
    sheenRoughness: look.sheenRoughness,
    sheenColor: new Color('#fff6fa'),
    specularIntensity: look.specular,
    // 재질마다 방 반사 세기가 달라 장면 환경 대신 같은 텍스처를 재질에 직접 건다 (PMREM 은 한 장뿐)
    envMap: env,
    envMapIntensity: look.envIntensity,
    // 반짝: 비눗방울 같은 박막 간섭 무지갯빛
    iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        /* glsl */ `attribute vec3 aRest;
      attribute float aFront;
      uniform vec4 uDentC[${MAX_DENTS}];
      uniform vec3 uDentD;
      uniform float uHeight;
      varying float vDent;
      varying float vFront;
      varying float vHn;
      void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
      {
        // 자국 바닥이 얼마나 가려졌나 (쉬는 자세 좌표로 재니 몸이 어떻게 변형돼도 같은 자리)
        float ao = 0.0;
        for (int i = 0; i < ${MAX_DENTS}; i++) {
          float dd = uDentD[i];
          if (dd <= 0.0) continue;
          vec3 d = aRest - uDentC[i].xyz;
          float r = uDentC[i].w;
          ao = max(ao, exp(-dot(d, d) / (r * r)) * min(1.0, dd / r));
        }
        vDent = ao;
        vFront = aFront;
        vHn = aRest.y / max(uHeight, 1.0);
      }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `uniform vec2 uGaze;
      uniform vec2 uFaceUv;
      uniform vec2 uFaceR;
      uniform float uRimBoost;
      uniform vec3 uRimColor;
      uniform float uShiny;
      uniform float uTime;
      uniform vec4 uFill;
      uniform vec3 uFillA;
      uniform vec3 uFillB;
      uniform vec4 uLook;
      uniform vec2 uGrain;
      uniform vec3 uKeyDir;
      #define BODY_EXPOSURE 0.84
      // 소프트박스 창 방향: 카메라 가까이 왼쪽 위 (앞면 가운데에서 조금 비낀 곳에 비친다)
      #define SOFTBOX_DIR vec3(-0.33, 0.47, 0.82)
      varying float vDent;
      varying float vFront;
      varying float vHn;
      vec3 jellyHue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }
      float jellyHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      // 부드러운 값 노이즈 (잔결 범프용 — 미분이 매끈해야 반짝이 점이 생기지 않는다)
      float jellyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = jellyHash(i);
        float b = jellyHash(i + vec2(1.0, 0.0));
        float c = jellyHash(i + vec2(0.0, 1.0));
        float d = jellyHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      // 몸속 특별한 속: 앞면 가운데에서만, 얼굴은 비켜서, 눌린 만큼(uFill.w) 밝게, 소용돌이(uFill.z)만큼 돈다
      // 반환: rgb = 속 색, a = 덮는 정도 (밝은 몸에서도 보이게 더하지 않고 섞는다)
      vec4 jellyFilling(vec2 uv, float nv) {
        vec2 p = (uv - vec2(0.5, 0.42)) * vec2(2.0, 2.2);
        float r = length(p);
        float body = 1.0 - smoothstep(0.6, 1.0, r);
        float face = 1.0 - smoothstep(0.75, 1.2, length((uv - uFaceUv) / uFaceR));
        float mask = body * nv * (1.0 - 0.85 * face);
        if (mask <= 0.001) return vec4(0.0);
        float ang = atan(p.y, p.x) + uFill.z * (1.2 - r);
        vec2 q = vec2(cos(ang), sin(ang)) * r;
        float k = uFill.x;
        vec3 col = vec3(0.0);
        float cover = 0.0;
        if (k < 1.5) {
          vec2 g = q * 6.5;
          vec2 cell = floor(g);
          float h = jellyHash(cell);
          vec2 f = fract(g) - 0.5 - (vec2(jellyHash(cell + 3.1), jellyHash(cell + 7.7)) - 0.5) * 0.5;
          float tw = 0.55 + 0.45 * sin(uTime * 4.0 + h * 40.0);
          float s = smoothstep(0.26, 0.05, length(f)) * step(0.3, h) * tw;
          s += smoothstep(0.05, 0.0, abs(f.x)) * smoothstep(0.34, 0.0, abs(f.y)) * step(0.75, h) * tw * 0.8;
          col = mix(uFillA, uFillB, h);
          cover = s;
        } else if (k < 2.5) {
          vec2 g = (q + vec2(0.0, uTime * 0.04)) * 2.4;
          vec2 cell = floor(g);
          float h = step(0.3, jellyHash(cell));
          vec2 f = fract(g) - 0.5 - (vec2(jellyHash(cell + 1.3), jellyHash(cell + 5.9)) - 0.5) * 0.4;
          float d = length(f);
          float bead = smoothstep(0.32, 0.27, d) * h;
          float ring = (smoothstep(0.33, 0.29, d) - smoothstep(0.28, 0.22, d)) * h;
          float a = atan(f.y, f.x) + uFill.z;
          float star = smoothstep(0.13 + 0.08 * cos(a * 5.0), 0.07, d) * h;
          // 방울: 속은 옅게, 테두리는 진하게 (밝은 몸에서도 동그라미가 보이게) + 가운데 별
          col = mix(mix(uFillA, uFillA * 0.55, ring), uFillB, star);
          cover = max(max(bead * 0.5, ring * 0.95), star);
        } else if (k < 3.5) {
          float arm = pow(0.5 + 0.5 * cos(ang * 2.0 - r * 9.0), 3.0);
          float core = exp(-r * r * 9.0);
          vec2 g = q * 14.0;
          float st = smoothstep(0.16, 0.0, length(fract(g) - 0.5)) * step(0.78, jellyHash(floor(g)));
          col = mix(mix(uFillA, uFillB, clamp(r * 1.4, 0.0, 1.0)), vec3(1.0, 0.96, 1.0), clamp(core + st, 0.0, 1.0));
          cover = clamp(arm * (1.0 - r) * 0.9 + core * 0.6 + st, 0.0, 1.0);
        } else {
          // 무지개 젤: 색색의 말랑한 젤 알갱이가 몸속에서 돈다
          vec2 g = q * 2.2 + vec2(0.0, uTime * 0.03);
          vec2 cell = floor(g);
          float h = jellyHash(cell);
          vec2 f = fract(g) - 0.5 - (vec2(jellyHash(cell + 2.3), jellyHash(cell + 4.1)) - 0.5) * 0.35;
          float blob = smoothstep(0.42, 0.18, length(f));
          col = mix(jellyHue(fract(h + uFill.z * 0.05)) * 0.85 + 0.15, mix(uFillA, uFillB, h), 0.25);
          cover = blob * 0.8;
        }
        return vec4(col, clamp(cover * mask * (0.65 + 0.35 * uFill.w) * uFill.y, 0.0, 0.92));
      }
      void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
      #ifdef USE_MAP
        // 눈길: 얼굴 둘레만 부드럽게 끌어 손가락 쪽을 보게 한다
        vec2 jellyUv = vMapUv;
        {
          float w = 1.0 - smoothstep(0.55, 1.0, length((jellyUv - uFaceUv) / uFaceR));
          jellyUv -= uGaze * w;
        }
        diffuseColor *= texture2D( map, jellyUv );
      #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
      #ifdef USE_MAP
      if (uGrain.x > 0.0) {
        // 잔결: 높이 노이즈를 화면 미분으로 법선에 얹는다 (Mikkelsen 범프, 텍스처·접선 없음)
        vec2 gp = vMapUv * uGrain.y;
        float gh = jellyNoise(gp) * 0.65 + jellyNoise(gp * 2.7 + 7.1) * 0.35;
        vec3 dpdx = dFdx(-vViewPosition);
        vec3 dpdy = dFdy(-vViewPosition);
        vec3 r1 = cross(dpdy, normal);
        vec3 r2 = cross(normal, dpdx);
        float det = dot(dpdx, r1);
        vec3 grad = sign(det) * (dFdx(gh) * r1 + dFdy(gh) * r2);
        // 작게 보이면 (칸이 픽셀보다 작아지면) 잔결이 지글거리는 점이 된다 → 그만큼 옅게
        float gAa = 1.0 - smoothstep(0.2, 0.55, length(fwidth(gp)));
        // 눈·입처럼 진하게 인쇄된 곳은 매끈하게 (반짝이는 눈이 거칠어 보이지 않게)
        gAa *= smoothstep(0.04, 0.2, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
        normal = normalize(abs(det) * normal - uGrain.x * gAa * grad);
      }
      #endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
      {
        // 자국 바닥: 둘레 벽에 가려 방 반사가 덜 든다 (색 그늘은 아래 opaque 에서)
        float dentAo = 1.0 - 0.6 * vDent;
        reflectedLight.indirectSpecular *= dentAo;
        // 속 비침 (1): 몸속에서 흩어진 빛이 그늘진 쪽까지 감싼다
        float wrap = clamp((dot(normal, uKeyDir) + 0.7) / 1.7, 0.0, 1.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * wrap * uLook.x * 0.3 * dentAo;
      }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
      {
        vec3 jV = normalize(vViewPosition);
        float nv = clamp(dot(normalize(nonPerturbedNormal), jV), 0.0, 1.0);
        float edge = 1.0 - nv;
        float tl = uLook.x;
        // 정면은 그림 색을 지킨다 (얼굴·무늬가 또렷하게)
        outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.92 + 0.01, uLook.z * nv * nv);
        // 자국 바닥: 회색이 아니라 몸색 쪽으로 짙어진다 (실제 실리콘 자국처럼)
        outgoingLight *= mix(vec3(1.0), diffuseColor.rgb * 0.75 + 0.05, vDent * 0.6);
        // 속 비침 (2): 두꺼운 가운데는 색이 진하고 맑게 (몸색을 한 번 더 곱한다)
        float thick = nv * mix(0.55, 1.0, vFront);
        outgoingLight = mix(outgoingLight, outgoingLight * (diffuseColor.rgb * 1.1 + 0.02), tl * thick * 0.7);
        // 몸 바탕은 조금 낮춰 반사가 톤 매핑에 눌려 사라지지 않을 머리 공간을 남긴다 (밝은 파스텔 몸에서도 광택이 보이게)
        outgoingLight *= BODY_EXPOSURE;
        // 스튜디오 소프트박스: 주광 쪽 네모난 창이 비친다 (제품 사진의 반사). 거칠수록 넓고 흐리고 옅다 —
        // 폼은 은은한 번짐, 젤리·슬라임은 또렷한 창. 반사 방향으로 재니 눌린 자국을 따라 창이 휘고 미끄러진다
        {
          float rough = roughnessFactor;
          vec3 box = SOFTBOX_DIR;
          vec3 R = reflect(-jV, normal);
          vec3 T1 = normalize(cross(box, vec3(0.0, 1.0, 0.0)));
          vec3 T2 = cross(T1, box);
          float soft = mix(0.02, 0.5, rough * rough);
          float a = abs(dot(R, T1));
          float b = abs(dot(R, T2));
          float win = (1.0 - smoothstep(0.15, 0.15 + soft, a)) * (1.0 - smoothstep(0.22, 0.22 + soft, b));
          win *= smoothstep(0.0, 0.3, dot(R, box));
          outgoingLight += vec3(1.0, 0.99, 0.97) * win * mix(1.1, 0.12, rough) * (1.0 - 0.7 * vDent);
        }
        // 윤곽 쪽은 둥글게 어두워진다 (만화 외곽선 대신)
        outgoingLight *= 1.0 - uLook.y * pow(edge, 2.2);
        // 속 비침 (3): 얇은 가장자리로 빛이 새어 나오고 (역광), 바닥 쪽에 빛이 모인다 (굴절된 빛)
        vec3 glowCol = mix(diffuseColor.rgb, vec3(1.0), 0.35);
        outgoingLight += glowCol * pow(edge, 2.0) * tl * 0.4;
        float pool = exp(-pow((vHn - 0.16) / 0.13, 2.0)) * nv;
        outgoingLight += diffuseColor.rgb * pool * tl * 0.22;
        // 젖은 반사점: 창 가운데와 주광에 맺히는 아주 작은 흰 점 (눌린 자국을 따라 미끄러진다)
        if (uLook.w > 0.0) {
          vec3 R = reflect(-jV, normal);
          float sp = pow(max(dot(R, SOFTBOX_DIR), 0.0), 420.0);
          vec3 H = normalize(uKeyDir + jV);
          sp += pow(max(dot(normal, H), 0.0), 700.0);
          outgoingLight += vec3(1.0) * sp * uLook.w * 1.4 * (1.0 - 0.6 * vDent);
        }
        // 가장자리 빛: 전설 이상은 등급 색으로 더 밝게, 만지면 부푼다
        float rim = pow(edge, 2.4);
        outgoingLight += mix(vec3(1.0, 0.97, 0.99), uRimColor, min(1.0, uRimBoost * 1.5)) * rim * (0.12 + uRimBoost);
        // 반짝: 보는 각도와 시간에 따라 도는 무지개 가장자리
        outgoingLight += jellyHue(fract(nv * 1.3 + vViewPosition.y * 0.004 + uTime * 0.12)) * pow(edge, 1.6) * 0.45 * uShiny;
        #ifdef USE_MAP
        if (uFill.x > 0.5) {
          vec4 fill = jellyFilling(vMapUv, nv);
          outgoingLight = mix(outgoingLight, fill.rgb, fill.a);
          // 꾹 누르면 속이 안에서 반짝 빛난다
          outgoingLight += fill.rgb * fill.a * uFill.w * 0.35;
        }
        #endif
      }
      #include <opaque_fragment>`,
      );
  };
  return mat;
}

/** 가는 외곽선: 몸색을 짙게 한 색의 뒤집힌 껍질. 굵기는 겉모습 값(outline)을 따른다 */
function outlineMaterial(color: Color, width: number): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({ color, side: BackSide, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3( position ) + normal * ${width.toFixed(2)};`,
    );
  };
  // 굵기가 셰이더 글자에 들어가므로 굵기마다 따로 컴파일한다 (함수 글자가 같아 캐시가 섞이지 않게)
  mat.customProgramCacheKey = () => `jelly-outline-${width.toFixed(2)}`;
  return mat;
}

// ── 무대 ─────────────────────────────────────────────────

interface BodyInternal {
  view: JellyBodyView;
  mesh: Mesh;
  applyPlacement(): void;
  beforeRender(now: number): void;
  hitFrom(h: { point: Vector3; face?: { a: number; b: number; c: number } | null }): SoftHit | null;
}

export function createJellyStage(opts: JellyStageOptions): JellyStage {
  const s = acquireRenderer();
  const renderer = s.renderer;
  const canvas = renderer.domElement;
  opts.container.appendChild(canvas);

  let disposed = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    if (!disposed) opts.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const scene = new Scene();
  scene.environment = s.env;
  scene.environmentIntensity = 0.55;
  const camera = new PerspectiveCamera(FOV, 1, 1, 5000);
  // 스튜디오 조명: 하늘빛 방(반구광) + 왼쪽 위 부드러운 주광 + 오른쪽 차가운 보조광 + 뒤 위 역광(윗가장자리 빛)
  scene.add(new HemisphereLight('#fdfcff', '#dfe9f7', 0.6));
  const key = new DirectionalLight('#fff8f0', 1.45);
  key.position.copy(KEY_DIR);
  scene.add(key);
  const fill = new DirectionalLight('#e4efff', 0.45);
  fill.position.set(0.95, 0.15, 0.6);
  scene.add(fill);
  const back = new DirectionalLight('#ffffff', 0.8);
  back.position.set(0.3, 0.85, -1);
  scene.add(back);

  const bodies = new Set<BodyInternal>();
  const meshOwner = new Map<Mesh, BodyInternal>();

  let cssW = 1;
  let cssH = 1;
  let dist = 1000;
  let rect = { left: 0, top: 0 };
  const layout = () => {
    const cr = opts.container.getBoundingClientRect();
    rect = { left: cr.left, top: cr.top };
    cssW = Math.max(1, Math.round(cr.width));
    cssH = Math.max(1, Math.round(cr.height));
    renderer.setPixelRatio(s.dpr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    dist = cssH / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.4;
    camera.far = dist * 1.8;
    camera.updateProjectionMatrix();
    for (const b of bodies) b.applyPlacement();
  };
  layout();

  // 계속 느리면(≈ 40fps 미만) 해상도를 낮춘다
  let emaMs = 0;
  let samples = 0;
  let lastDraw = 0;
  const adaptQuality = () => {
    const now = performance.now();
    const gap = now - lastDraw;
    lastDraw = now;
    if (gap <= 0 || gap > 600) return;
    emaMs = samples === 0 ? gap : emaMs * 0.9 + gap * 0.1;
    samples++;
    if (samples > 45 && emaMs > 25 && s.dpr > 1.25) {
      s.dpr = Math.max(1.25, s.dpr - 0.5);
      samples = 0;
      layout();
    }
  };

  const renderNow = () => {
    if (disposed) return;
    const now = performance.now();
    for (const b of bodies) b.beforeRender(now);
    renderer.render(scene, camera);
  };

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const setRay = (clientX: number, clientY: number): boolean => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    scene.updateMatrixWorld();
    return true;
  };

  const addBody = (bo: JellyBodyOptions): JellyBodyView => {
    const shape = SHAPES[bo.shape];
    // 몸통 윤곽 범위 + 여백 = 몸 텍스처 영역
    const flat = flattenPath(shape.body);
    const minX = Math.min(...flat.map((p) => p.x));
    const maxX = Math.max(...flat.map((p) => p.x));
    const minY = Math.min(...flat.map((p) => p.y));
    const maxY = Math.max(...flat.map((p) => p.y));
    const bodyRect: RasterRect = { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };
    const mesh: JellyMesh = buildJellyMesh(shape.body, { uvRect: bodyRect });
    const scratch = createScratch(mesh);
    let bodyDisposed = false;

    const root = new Group();
    scene.add(root);

    const geo = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(mesh.rest), 3);
    pos.setUsage(DynamicDrawUsage);
    const nor = new BufferAttribute(new Float32Array(mesh.restNormal), 3);
    nor.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nor);
    geo.setAttribute('uv', new BufferAttribute(mesh.uv, 2));
    // 셰이더용 고정 값: 쉬는 자세 좌표(자국 그늘) + 앞면 높이 비율(두께)
    geo.setAttribute('aRest', new BufferAttribute(mesh.rest, 3));
    geo.setAttribute('aFront', new BufferAttribute(mesh.front, 1));
    geo.setIndex(new BufferAttribute(mesh.index, 1));
    // 변형해도 레이캐스트가 미리 걸러내지 않도록 넉넉한 경계
    geo.boundingSphere = new Sphere(new Vector3(0, mesh.height / 2, 0), 400);
    geo.boundingBox = new Box3(new Vector3(-400, -400, -400), new Vector3(400, 400, 400));

    const look = bo.look ?? MATERIALS[DEFAULT_MATERIAL].look;
    const glowOpt = bo.glow && bo.glow.strength > 0 ? bo.glow : null;
    const glowColor = new Color(glowOpt?.color ?? '#ffffff');
    const uniforms: JellyUniforms = {
      uGaze: { value: new Vector2(0, 0) },
      uFaceUv: { value: new Vector2(0.5, 0.5) },
      uFaceR: { value: new Vector2(0.3, 0.3) },
      uRimBoost: { value: 0 },
      uRimColor: { value: glowColor },
      uShiny: { value: Math.max(0, Math.min(1, bo.iridescence ?? 0)) },
      uTime: { value: 0 },
      uFill: { value: new Vector4(bo.filling?.kind ?? 0, bo.filling ? 1 : 0, 0, 0) },
      uFillA: { value: new Color(bo.filling?.colors[0] ?? '#ffffff') },
      uFillB: { value: new Color(bo.filling?.colors[1] ?? '#ffffff') },
      uLook: { value: new Vector4(look.translucency, look.edgeDark, look.albedoHold, look.wet) },
      uGrain: { value: new Vector2(look.grain * GRAIN_BUMP, look.grainScale) },
      uKeyDir: { value: KEY_DIR },
      uDentC: { value: Array.from({ length: MAX_DENTS }, () => new Vector4(0, 0, 0, 1)) },
      uDentD: { value: new Vector3(0, 0, 0) },
      uHeight: { value: mesh.height },
    };
    // 얼굴 영역 (텍스처 좌표): 눈과 볼을 넉넉히 감싼다
    uniforms.uFaceUv.value.set((60 - bodyRect.x) / bodyRect.w, 1 - (shape.faceY + 3 - bodyRect.y) / bodyRect.h);
    uniforms.uFaceR.value.set((shape.eyeGap + 17) / bodyRect.w, 17 / bodyRect.h);
    const baseRim = glowOpt ? glowOpt.strength * 0.3 : 0;
    uniforms.uRimBoost.value = baseRim;
    const placeholder = new CanvasTexture(document.createElement('canvas'));
    const bodyMat = jellyMaterial(placeholder, uniforms, uniforms.uShiny.value, look, s.env);
    const bodyMesh = new Mesh(geo, bodyMat);
    bodyMesh.frustumCulled = false;
    bodyMesh.visible = false;
    root.add(bodyMesh);
    // 가는 외곽선: 몸색을 짙게 해 잉크 쪽으로 조금 — 만화 테두리가 아니라 모양을 알아보게 하는 선
    const inkColor = new Color(bo.color ?? INK).multiplyScalar(0.42).lerp(new Color(INK), 0.45);
    const inkMat = look.outline > 0 ? outlineMaterial(inkColor, OUTLINE * (0.2 + 0.4 * look.outline)) : null;
    const ink = inkMat ? new Mesh(geo, inkMat) : null;
    if (ink) {
      ink.frustumCulled = false;
      ink.visible = false;
      root.add(ink);
    }

    // 장식 카드: 뒤 = 몸 뒤, 앞 = 몸 앞면보다 조금 앞 (깊이 검사를 켜야 여러 마리가 겹칠 때 앞 몸이 가린다)
    const makeCard = (z: number, order: number) => {
      const grid = buildCardGrid(CARD_RECT, mesh.bottom, z, 18);
      const g = new BufferGeometry();
      const p = new BufferAttribute(new Float32Array(grid.rest), 3);
      p.setUsage(DynamicDrawUsage);
      g.setAttribute('position', p);
      g.setAttribute('uv', new BufferAttribute(grid.uv, 2));
      g.setIndex(new BufferAttribute(grid.index, 1));
      const m = new MeshBasicMaterial({
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        visible: false,
      });
      const card = new Mesh(g, m);
      card.frustumCulled = false;
      card.renderOrder = order;
      root.add(card);
      return { grid, mesh: card, pos: p, mat: m };
    };
    const backCard = makeCard(-2, 2);
    const frontCard = makeCard(mesh.depth + 2, 4);

    // 바닥 그림자 (몸 뒤, 매트에 남는다): 넓고 흐린 주변 그림자 + 닿은 자리의 진한 접촉 그림자
    const shadowZ = -mesh.depth * 0.6 - 3;
    const makeShadow = (soft: boolean, order: number) => {
      const tex = shadowTexture(soft);
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 });
      const m = new Mesh(new PlaneGeometry(1, 1), mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      m.position.set(0, 0, shadowZ + (soft ? 0 : 0.5));
      root.add(m);
      return { tex, mat, mesh: m };
    };
    const shadow = makeShadow(true, 1);
    const contact = makeShadow(false, 1);
    // 발자국: 변형된 몸에서 바닥에 닿은 폭·가운데·바닥과의 틈 (몸 좌표)
    const foot = { minX: -mesh.halfWidth * 0.8, maxX: mesh.halfWidth * 0.8, gap: 0, squash: 0 };
    let liftUnits = 0;
    const applyShadow = () => {
      const width = Math.max(4, foot.maxX - foot.minX);
      const cx = (foot.minX + foot.maxX) / 2;
      const up = liftUnits + foot.gap;
      // 들수록 넓고 옅게 퍼진다
      const spread = 1 + Math.min(0.6, up / 90);
      shadow.mesh.scale.set((width * 1.3 + 14) * spread, 22 * spread * (1 + foot.squash * 0.6), 1);
      shadow.mesh.position.set(cx, -liftUnits - 1, shadowZ);
      shadow.mat.opacity = Math.max(0.3, 1 - up / 110);
      // 접촉 그림자: 닿아 있을 때만, 눌릴수록 넓고 진하게
      const touch = Math.max(0, 1 - up / 7);
      contact.mesh.visible = touch > 0.01;
      contact.mesh.scale.set(width * 1.02 + 4, 7 * (1 + foot.squash * 0.8), 1);
      contact.mesh.position.set(cx, -liftUnits - 0.5, shadowZ + 0.5);
      contact.mat.opacity = touch * Math.min(1, 0.62 + foot.squash * 1.2);
    };
    applyShadow();

    // 몸 뒤 빛 (전설 이상·반짝): 텍스처 한 장 + 보통 섞기 — 새 렌더 타깃·후처리 없음
    let glowTex: CanvasTexture | null = null;
    let glowMat: MeshBasicMaterial | null = null;
    let glow: Mesh | null = null;
    if (glowOpt) {
      glowTex = glowTexture();
      glowMat = new MeshBasicMaterial({
        map: glowTex,
        color: glowColor,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      });
      glow = new Mesh(new PlaneGeometry(1, 1), glowMat);
      glow.renderOrder = 0;
      glow.frustumCulled = false;
      glow.position.set(0, mesh.height * 0.5, shadowZ - 4);
      root.add(glow);
    }
    // 만질 때 부푸는 양: 시각(ms) 기준으로 스스로 줄어든다
    let pulseAmt = 0;
    let pulseAt = 0;
    const PULSE_MS = 650;
    const pulseNow = (now: number) => {
      if (pulseAmt <= 0) return 0;
      const k = 1 - (now - pulseAt) / PULSE_MS;
      return k > 0 ? pulseAmt * k * k : 0;
    };

    // ── 텍스처 ──
    const faceTex = new Map<JellyFace, CanvasTexture>();
    const pendingFace = new Map<JellyFace, Promise<CanvasTexture | null>>();
    let wantFace: JellyFace = bo.face;
    const bake = (face: JellyFace): Promise<CanvasTexture | null> => {
      const cached = faceTex.get(face);
      if (cached) return Promise.resolve(cached);
      let p = pendingFace.get(face);
      if (!p) {
        const src = bo.getSource(face);
        p = src
          ? rasterizeMalang(src, {
              part: 'body',
              rect: bodyRect,
              size: TEX_SIZE,
              bodyPath: shape.body,
              bottom: mesh.bottom,
              extras: faceExtras(face, shape),
            }).then((c) => {
              if (bodyDisposed || disposed) return null;
              const t = toTexture(c, renderer);
              faceTex.set(face, t);
              return t;
            })
          : Promise.resolve(null);
        pendingFace.set(face, p);
      }
      return p;
    };
    const applyFace = (t: CanvasTexture) => {
      // 텍스처끼리 바꾸는 것은 셰이더를 다시 만들 필요가 없다 (눈 깜빡임이 가볍다)
      if (bodyMat.map !== t) bodyMat.map = t;
    };

    // ── 자리 ──
    let placement: BodyPlacement | null = null;
    let lastPose: Pose | null = null;
    let visible = true;
    let ready = false;
    const applyPlacement = () => {
      const p = placement;
      if (!p) return;
      // 깊이(zg)만큼 카메라에 가까워진 만큼 위치·크기를 줄여 화면에서는 정확히 p 에 보이게 한다
      const zg = Math.max(-dist * 0.5, Math.min(dist * 0.5, p.depth));
      const k = (dist - zg) / dist;
      const px = p.x - rect.left;
      const py = p.y - rect.top;
      root.position.set((px - cssW / 2) * k, (cssH / 2 - py) * k, zg);
      root.scale.setScalar(p.unit * k);
      liftUnits = p.unit > 0 ? Math.max(0, p.lift / p.unit) : 0;
      applyShadow();
    };

    const updateNow = (pose: Pose, soft: SoftState) => {
      if (bodyDisposed || disposed) return;
      lastPose = pose;
      const out = pos.array as Float32Array;
      deformJelly(mesh, pose, soft, out, scratch);
      computeNormals(out, mesh.index, nor.array as Float32Array);
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      for (const card of [backCard, frontCard]) {
        if (!card.mat.visible) continue;
        deformPoints(card.grid.rest, card.grid.vertexCount, mesh.height, pose, soft, card.pos.array as Float32Array);
        card.pos.needsUpdate = true;
      }
      // 자국 그늘: 셰이더가 쉬는 자세 좌표로 잰다
      const dc = uniforms.uDentC.value;
      const dd = uniforms.uDentD.value;
      for (let i = 0; i < MAX_DENTS; i++) {
        const d = soft.dents[i];
        const depth = d ? Math.max(0, d.depth.x) : 0;
        dd.setComponent(i, depth);
        if (d) dc[i]!.set(d.center.x, d.center.y, d.center.z, Math.max(1, d.radius));
      }
      // 발자국: 가장 낮은 정점 근처 정점들의 폭 (당김·기울기·눌림을 그대로 따른다)
      let lo = Infinity;
      for (let i = 1; i < out.length; i += 3) if (out[i]! < lo) lo = out[i]!;
      const band = lo + Math.max(2, mesh.height * 0.05);
      let fx0 = Infinity;
      let fx1 = -Infinity;
      for (let i = 0; i < out.length; i += 3) {
        if (out[i + 1]! > band) continue;
        const x = out[i]!;
        if (x < fx0) fx0 = x;
        if (x > fx1) fx1 = x;
      }
      if (fx1 > fx0) {
        foot.minX = fx0;
        foot.maxX = fx1;
      }
      foot.gap = Math.max(0, lo);
      foot.squash = Math.max(0, Math.min(0.5, 1 - pose.scaleY));
      applyShadow();
    };

    const beforeRender = (now: number) => {
      const p = pulseNow(now);
      uniforms.uRimBoost.value = baseRim + p * 0.35;
      uniforms.uTime.value = now / 1000;
      if (glow && glowMat && glowOpt) {
        // 몸을 따라 움직이고 숨쉬듯 아주 조금 커졌다 작아진다
        const pose = lastPose;
        const sx = pose?.scaleX ?? 1;
        const sy = pose?.scaleY ?? 1;
        const breathe = 1 + 0.03 * Math.sin(now / 900);
        const size = mesh.halfWidth * 3.3 * (breathe + p * 0.35);
        glow.scale.set(size * sx, size * sy, 1);
        glow.position.x = pose?.offsetX ?? 0;
        glow.position.y = mesh.height * 0.5 * sy + (pose?.offsetY ?? 0);
        glowMat.opacity = Math.min(1, glowOpt.strength * 0.75 + p * 0.5);
      }
    };

    const tri = new Triangle();
    const bary = new Vector3();
    const va = new Vector3();
    const vb = new Vector3();
    const vc = new Vector3();
    const restHit = (a: number, b: number, c: number, w: Vector3): SoftHit => {
      const r = mesh.rest;
      const n = mesh.restNormal;
      const mix = (arr: Float32Array, k: number) => arr[a * 3 + k]! * w.x + arr[b * 3 + k]! * w.y + arr[c * 3 + k]! * w.z;
      const nx = mix(n, 0);
      const ny = mix(n, 1);
      const nz = mix(n, 2);
      const l = Math.hypot(nx, ny, nz) || 1;
      return {
        point: { x: mix(r, 0), y: mix(r, 1), z: mix(r, 2) },
        normal: { x: nx / l, y: ny / l, z: nz / l },
      };
    };
    const hitFrom = (h: { point: Vector3; face?: { a: number; b: number; c: number } | null }): SoftHit | null => {
      if (!h.face) return null;
      const local = bodyMesh.worldToLocal(h.point.clone());
      const p = pos.array as Float32Array;
      const { a, b, c } = h.face;
      va.fromArray(p, a * 3);
      vb.fromArray(p, b * 3);
      vc.fromArray(p, c * 3);
      tri.set(va, vb, vc);
      if (!tri.getBarycoord(local, bary)) return null;
      return restHit(a, b, c, bary);
    };

    const readyP = (async () => {
      // 원본 그림이 화면에 붙을 때까지 한 프레임 기다린다
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (bodyDisposed || disposed) return;
      const bakeCard = async (part: 'back' | 'front', card: typeof backCard) => {
        const src = bo.getSource('default');
        if (!src) return;
        const c = await rasterizeMalang(src, { part, rect: CARD_RECT, size: TEX_SIZE, bodyPath: shape.body, bottom: mesh.bottom });
        if (bodyDisposed || disposed) return;
        card.mat.map = toTexture(c, renderer);
        card.mat.visible = true;
        card.mat.needsUpdate = true;
      };
      const [first] = await Promise.all([bake(bo.face), bakeCard('back', backCard), bakeCard('front', frontCard)]);
      if (bodyDisposed || disposed) return;
      if (!first) throw new Error('no source');
      applyFace(first);
      bodyMat.needsUpdate = true;
      placeholder.dispose();
      ready = true;
      bodyMesh.visible = true;
      if (ink) ink.visible = true;
    })();

    const internal: BodyInternal = {
      view: null as unknown as JellyBodyView,
      mesh: bodyMesh,
      applyPlacement,
      beforeRender,
      hitFrom,
    };
    const view: JellyBodyView = {
      ready: readyP,
      place(p) {
        placement = p;
        applyPlacement();
      },
      hit(clientX, clientY) {
        if (!ready || !visible || !setRay(clientX, clientY)) return null;
        const h = raycaster.intersectObject(bodyMesh, false)[0];
        return h ? hitFrom(h) : null;
      },
      frontHit() {
        return restHit(0, 0, 0, new Vector3(1, 0, 0));
      },
      update: updateNow,
      setFace(face) {
        wantFace = face;
        void bake(face).then((t) => {
          if (!t || bodyDisposed || wantFace !== face) return;
          applyFace(t);
        });
      },
      setGaze(x, y) {
        const gx = x / bodyRect.w;
        const gy = -y / bodyRect.h;
        const g = uniforms.uGaze.value;
        if (Math.abs(g.x - gx) < 1e-4 && Math.abs(g.y - gy) < 1e-4) return;
        g.set(gx, gy);
      },
      pulse(amount) {
        if (!(amount > 0)) return;
        const now = performance.now();
        pulseAmt = Math.min(1, pulseNow(now) + amount);
        pulseAt = now;
      },
      setFill(glow, swirl) {
        const f = uniforms.uFill.value;
        f.z = Number.isFinite(swirl) ? swirl : 0;
        f.w = Number.isFinite(glow) ? Math.max(0, Math.min(1, glow)) : 0;
      },
      busy() {
        return pulseNow(performance.now()) > 0.005;
      },

      setVisible(v) {
        visible = v;
        root.visible = v;
      },
      dispose() {
        if (bodyDisposed) return;
        bodyDisposed = true;
        bodies.delete(internal);
        meshOwner.delete(bodyMesh);
        scene.remove(root);
        root.traverse((o) => {
          const m = o as Mesh;
          m.geometry?.dispose();
        });
        bodyMat.dispose();
        inkMat?.dispose();
        for (const card of [backCard, frontCard]) {
          card.mat.map?.dispose();
          card.mat.dispose();
        }
        for (const sh of [shadow, contact]) {
          sh.mat.dispose();
          sh.tex.dispose();
        }
        glowMat?.dispose();
        glowTex?.dispose();
        placeholder.dispose();
        faceTex.forEach((t) => t.dispose());
        faceTex.clear();
      },
    };
    internal.view = view;
    bodies.add(internal);
    meshOwner.set(bodyMesh, internal);
    return view;
  };

  return {
    canvas,
    scene,
    addBody,
    pick(clientX, clientY) {
      if (!setRay(clientX, clientY)) return null;
      const meshes: Mesh[] = [];
      for (const b of bodies) if (b.mesh.visible && b.mesh.parent?.visible !== false) meshes.push(b.mesh);
      // 가까운 것부터 온다 → 가장 앞 몸
      for (const h of raycaster.intersectObjects(meshes, false)) {
        const owner = meshOwner.get(h.object as Mesh);
        const hit = owner?.hitFrom(h);
        if (owner && hit) return { body: owner.view, hit };
      }
      return null;
    },
    layout,
    render() {
      adaptQuality();
      renderNow();
    },
    snapshot() {
      if (disposed) return null;
      renderNow();
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      // 그린 직후(같은 작업 안)라 preserveDrawingBuffer 없이도 읽을 수 있다
      ctx.drawImage(canvas, 0, 0);
      return out;
    },
    dispose() {
      if (disposed) return;
      for (const b of [...bodies]) b.view.dispose();
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      renderer.renderLists.dispose();
      canvas.remove();
      releaseRenderer();
    },
  };
}
