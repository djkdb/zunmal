/**
 * 말랑 만지기 3D 젤리 장면 (three.js). TouchPage 가 동적 import 로만 불러온다 — 첫 화면 번들과 분리.
 *
 * - 몸: 말랑이 윤곽을 부풀린 메시(touch/jellyMesh) + 순수 스프링 변형(touch/softbody).
 *   정점은 매 프레임 CPU 에서 옮기고 법선을 다시 계산한다 (정점 약 2.6k).
 * - 겉모습: 실제 <Malang> SVG 를 구운 텍스처(얼굴·무늬·앞 장식 포함)를 앞면에 투영 → 찌그러지면 얼굴도 같이 찌그러진다.
 *   몸 밖으로 나온 장식은 몸 뒤/앞의 평평한 카드로 그려 같은 변형장을 따라 움직인다.
 * - 재질: 클리어코트 + 쉰(sheen) + 가장자리 빛(프레넬) + 가운데가 은은히 밝은 가짜 속빛 → 젤리.
 *   게임의 스티커 느낌을 위해 잉크색 뒤집힌 껍질 외곽선(epic 캡슐과 같은 방식).
 * - 성능: 렌더러는 하나를 공유해 캐릭터를 바꿔도 다시 만들지 않는다. DPR 최대 2 (느리면 1.5 → 1.25),
 *   그리기는 호출될 때만(draw) — 멈춰 있으면 페이지가 부르지 않는다.
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
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MalangShape } from '../../data/characters';
import { SHAPES } from '../malang/shapes';
import { VIEWBOX } from '../malang/helpers';
import { buildCardGrid, buildJellyMesh, computeNormals, flattenPath, type JellyMesh } from '../../touch/jellyMesh';
import { createScratch, deformJelly, deformPoints, type Pose, type SoftHit, type SoftState } from '../../touch/softbody';
import { rasterizeMalang, type RasterRect } from './rasterMalang';

export type JellyFace = 'default' | 'happy' | 'sleepy' | 'wide';

export interface JellyViewOptions {
  /** 캔버스를 붙일 상자 (무대 위를 덮는 절대 위치 요소) */
  container: HTMLElement;
  /** 2D 말랑이 상자 (VIEWBOX 148 단위 정사각형) — 3D 몸을 여기에 정확히 맞춘다 */
  anchor: HTMLElement;
  shape: MalangShape;
  /** 얼굴별 원본 SVG (화면 밖에 그려 둔 <Malang>) */
  getSource: (face: JellyFace) => SVGSVGElement | null;
  /** 첫 얼굴 */
  face: JellyFace;
  /** WebGL 컨텍스트를 잃었을 때 (2D 로 돌아간다) */
  onLost: () => void;
  /** 몸 뒤 빛 (전설 이상·반짝). strength 0 이면 없음 */
  glow?: { color: string; strength: number };
  /** 반짝 말랑이 무지갯빛 (0~1) */
  iridescence?: number;
}

export interface JellyView {
  /** 텍스처를 굽고 첫 장면을 그리면 끝난다. 실패하면 reject → 2D 로 */
  ready: Promise<void>;
  /** 크기·위치 다시 맞추기 (창 크기 변경) */
  layout(): void;
  /** 화면 좌표 → 몸 표면 (쉬는 자세 기준). 몸 밖이면 null */
  hit(clientX: number, clientY: number): SoftHit | null;
  /** 앞면 가운데 (키보드 조작용) */
  frontHit(): SoftHit;
  /** 변형해서 그린다 */
  draw(pose: Pose, soft: SoftState): void;
  setFace(face: JellyFace): void;
  /** 만질 때 몸 뒤 빛과 가장자리 빛이 잠깐 부푼다 (0~1) */
  pulse(amount: number): void;
  /** 빛이 아직 부풀어 있다 → 페이지가 그리기를 계속해야 한다 */
  busy(): boolean;
  dispose(): void;
}

const INK = '#2b2233';
const FOV = 20;
const TEX_SIZE = 512;
/** 외곽선 두께 (몸 좌표 단위, 1 ≈ 말랑이 크기 230px 에서 1.55px) */
const OUTLINE = 2.8;
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
  const env = pmrem.fromScene(envScene, 0.04).texture;
  envScene.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
  });
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

function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 0.25, 0, 0);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(43,34,51,0.55)');
    g.addColorStop(0.55, 'rgba(43,34,51,0.28)');
    g.addColorStop(1, 'rgba(43,34,51,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ── 재질 ─────────────────────────────────────────────────

interface JellyUniforms {
  uRimBoost: { value: number };
  uRimColor: { value: Color };
  uShiny: { value: number };
  uTime: { value: number };
}

function jellyMaterial(map: Texture, u: JellyUniforms, iridescence: number): MeshPhysicalMaterial {
  const mat = new MeshPhysicalMaterial({
    map,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.6,
    sheenRoughness: 0.35,
    sheenColor: new Color('#fff4f8'),
    specularIntensity: 0.6,
    // 반짝: 비눗방울 같은 박막 간섭 무지갯빛
    iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `uniform float uRimBoost;
      uniform vec3 uRimColor;
      uniform float uShiny;
      uniform float uTime;
      vec3 jellyHue(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }
      void main() {`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
      {
        float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        // 가장자리 빛: 젤리 표면을 스치는 빛 (전설 이상은 등급 색으로 더 밝게, 만지면 부푼다)
        float rim = pow(1.0 - nv, 2.4);
        outgoingLight += mix(vec3(1.0, 0.96, 0.98), uRimColor, min(1.0, uRimBoost * 1.5)) * rim * (0.32 + uRimBoost);
        // 반짝: 보는 각도와 시간에 따라 도는 무지개 가장자리
        outgoingLight += jellyHue(fract(nv * 1.3 + vViewPosition.y * 0.004 + uTime * 0.12)) * pow(1.0 - nv, 1.6) * 0.3 * uShiny;
        // 가짜 속빛: 정면일수록 본래 색이 안에서 비치듯 밝게 (그림 색을 지킨다)
        outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.04 + 0.02, 0.42 * nv * nv);
      }
      #include <opaque_fragment>`,
      );
  };
  return mat;
}

function outlineMaterial(): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({ color: INK, side: BackSide, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3( position ) + normal * ${OUTLINE.toFixed(2)};`,
    );
  };
  return mat;
}

// ── 장면 ─────────────────────────────────────────────────

export function createJellyView(opts: JellyViewOptions): JellyView {
  const shape = SHAPES[opts.shape];
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

  // 몸통 윤곽 범위 + 여백 = 몸 텍스처 영역
  const flat = flattenPath(shape.body);
  const minX = Math.min(...flat.map((p) => p.x));
  const maxX = Math.max(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y));
  const maxY = Math.max(...flat.map((p) => p.y));
  const bodyRect: RasterRect = { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };

  const mesh: JellyMesh = buildJellyMesh(shape.body, { uvRect: bodyRect });
  const scratch = createScratch(mesh);

  const scene = new Scene();
  scene.environment = s.env;
  scene.environmentIntensity = 0.55;
  const camera = new PerspectiveCamera(FOV, 1, 1, 5000);
  scene.add(new HemisphereLight('#fffaf2', '#f3dce6', 1.1));
  const key = new DirectionalLight('#ffffff', 1.5);
  key.position.set(-0.6, 1, 0.9);
  scene.add(key);

  const root = new Group();
  scene.add(root);

  // 몸
  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(mesh.rest), 3);
  pos.setUsage(DynamicDrawUsage);
  const nor = new BufferAttribute(new Float32Array(mesh.restNormal), 3);
  nor.setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('uv', new BufferAttribute(mesh.uv, 2));
  geo.setIndex(new BufferAttribute(mesh.index, 1));
  // 변형해도 레이캐스트가 미리 걸러내지 않도록 넉넉한 경계
  geo.boundingSphere = new Sphere(new Vector3(0, mesh.height / 2, 0), 400);
  geo.boundingBox = new Box3(new Vector3(-400, -400, -400), new Vector3(400, 400, 400));

  const glowOpt = opts.glow && opts.glow.strength > 0 ? opts.glow : null;
  const glowColor = new Color(glowOpt?.color ?? '#ffffff');
  const uniforms: JellyUniforms = {
    uRimBoost: { value: 0 },
    uRimColor: { value: glowColor },
    uShiny: { value: Math.max(0, Math.min(1, opts.iridescence ?? 0)) },
    uTime: { value: 0 },
  };
  const baseRim = glowOpt ? glowOpt.strength * 0.3 : 0;
  uniforms.uRimBoost.value = baseRim;
  const placeholder = new CanvasTexture(document.createElement('canvas'));
  const bodyMat = jellyMaterial(placeholder, uniforms, uniforms.uShiny.value);
  const body = new Mesh(geo, bodyMat);
  body.frustumCulled = false;
  root.add(body);
  const inkMat = outlineMaterial();
  const ink = new Mesh(geo, inkMat);
  ink.frustumCulled = false;
  root.add(ink);

  // 장식 카드 (뒤: 외곽선 아래 / 앞: 외곽선 위)
  const makeCard = (z: number, order: number, depthTest: boolean) => {
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
      depthTest,
      toneMapped: false,
      visible: false,
    });
    const card = new Mesh(g, m);
    card.frustumCulled = false;
    card.renderOrder = order;
    root.add(card);
    return { grid, mesh: card, pos: p, mat: m };
  };
  const backCard = makeCard(-2, 2, true);
  const frontCard = makeCard(3, 4, false);

  // 바닥 그림자 (몸 뒤, 아래 절반만 보인다)
  const shadowTex = shadowTexture();
  const shadowMat = new MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  });
  const shadow = new Mesh(new PlaneGeometry(1, 1), shadowMat);
  shadow.renderOrder = 1;
  shadow.frustumCulled = false;
  const shadowZ = -mesh.depth * 0.6 - 3;
  shadow.position.set(0, 0, shadowZ);
  root.add(shadow);

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
  let wantFace: JellyFace = opts.face;
  let lastPose: Pose | null = null;

  const bake = (face: JellyFace): Promise<CanvasTexture | null> => {
    const cached = faceTex.get(face);
    if (cached) return Promise.resolve(cached);
    let p = pendingFace.get(face);
    if (!p) {
      const src = opts.getSource(face);
      p = src
        ? rasterizeMalang(src, { part: 'body', rect: bodyRect, size: TEX_SIZE, bodyPath: shape.body, bottom: mesh.bottom }).then(
            (c) => {
              if (disposed) return null;
              const t = toTexture(c, renderer);
              faceTex.set(face, t);
              return t;
            },
          )
        : Promise.resolve(null);
      pendingFace.set(face, p);
    }
    return p;
  };

  const applyFace = (t: CanvasTexture) => {
    if (bodyMat.map === t) return;
    // 텍스처끼리 바꾸는 것은 셰이더를 다시 만들 필요가 없다 (눈 깜빡임이 가볍다)
    bodyMat.map = t;
  };

  // ── 배치 ──
  let cssW = 1;
  let cssH = 1;
  const layout = () => {
    const cr = opts.container.getBoundingClientRect();
    const ar = opts.anchor.getBoundingClientRect();
    cssW = Math.max(1, Math.round(cr.width));
    cssH = Math.max(1, Math.round(cr.height));
    renderer.setPixelRatio(s.dpr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    const dist = cssH / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.5;
    camera.far = dist * 1.6;
    camera.updateProjectionMatrix();
    const unit = ar.width / VIEWBOX.w;
    root.scale.setScalar(unit);
    const px = ar.left - cr.left + (60 - VIEWBOX.x) * unit;
    const py = ar.top - cr.top + (mesh.bottom - VIEWBOX.y) * unit;
    root.position.set(px - cssW / 2, cssH / 2 - py, 0);
  };

  // ── 그리기 ──
  let emaMs = 0;
  let samples = 0;
  let lastDraw = 0;
  const adaptQuality = () => {
    const now = performance.now();
    const gap = now - lastDraw;
    lastDraw = now;
    if (gap <= 0 || gap > 100) return; // 연속 그리기 중일 때만 잰다
    emaMs = samples === 0 ? gap : emaMs * 0.9 + gap * 0.1;
    samples++;
    // 계속 느리면(≈ 40fps 미만) 해상도를 낮춘다
    if (samples > 45 && emaMs > 25 && s.dpr > 1.25) {
      s.dpr = Math.max(1.25, s.dpr - 0.5);
      samples = 0;
      layout();
    }
  };

  const drawNow = (pose: Pose, soft: SoftState) => {
    if (disposed) return;
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
    // 그림자: 눌려 퍼지면 넓게, 떠오르면 옅게
    const w = mesh.halfWidth * 2.25 * pose.scaleX;
    shadow.scale.set(w, 20 * Math.max(0.6, pose.scaleX), 1);
    shadow.position.x = pose.offsetX;
    shadowMat.opacity = 0.9 * Math.max(0.3, 1 - Math.max(0, pose.offsetY) / 20);
    const now = performance.now();
    const p = pulseNow(now);
    uniforms.uRimBoost.value = baseRim + p * 0.35;
    uniforms.uTime.value = now / 1000;
    if (glow && glowMat && glowOpt) {
      // 몸을 따라 움직이고 숨쉬듯 아주 조금 커졌다 작아진다
      const breathe = 1 + 0.03 * Math.sin(now / 900);
      const size = mesh.halfWidth * 3.3 * (breathe + p * 0.35);
      glow.scale.set(size * pose.scaleX, size * pose.scaleY, 1);
      glow.position.x = pose.offsetX;
      glow.position.y = mesh.height * 0.5 * pose.scaleY + pose.offsetY;
      glowMat.opacity = Math.min(1, glowOpt.strength * 0.75 + p * 0.5);
    }
    renderer.render(scene, camera);
  };

  let lastSoft: SoftState | null = null;
  const redraw = () => {
    if (lastPose && lastSoft) drawNow(lastPose, lastSoft);
  };

  const ready = (async () => {
    // 원본 그림이 화면에 붙을 때까지 한 프레임 기다린다
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (disposed) return;
    const bakeCard = async (part: 'back' | 'front', card: typeof backCard) => {
      const src = opts.getSource('default');
      if (!src) return;
      const c = await rasterizeMalang(src, { part, rect: CARD_RECT, size: TEX_SIZE, bodyPath: shape.body, bottom: mesh.bottom });
      if (disposed) return;
      card.mat.map = toTexture(c, renderer);
      card.mat.visible = true;
      card.mat.needsUpdate = true;
    };
    const [first] = await Promise.all([bake(opts.face), bakeCard('back', backCard), bakeCard('front', frontCard)]);
    if (disposed) return;
    if (!first) throw new Error('no source');
    applyFace(first);
    bodyMat.needsUpdate = true;
    placeholder.dispose();
    layout();
  })();

  const raycaster = new Raycaster();
  const ndc = new Vector2();
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

  return {
    ready,
    layout: () => {
      layout();
      redraw();
    },
    hit(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(body, false);
      const h = hits[0];
      if (!h || !h.face) return null;
      const local = body.worldToLocal(h.point.clone());
      const p = pos.array as Float32Array;
      const { a, b, c } = h.face;
      va.fromArray(p, a * 3);
      vb.fromArray(p, b * 3);
      vc.fromArray(p, c * 3);
      tri.set(va, vb, vc);
      if (!tri.getBarycoord(local, bary)) return null;
      return restHit(a, b, c, bary);
    },
    frontHit() {
      return restHit(0, 0, 0, new Vector3(1, 0, 0));
    },
    draw(pose, soft) {
      lastSoft = soft;
      adaptQuality();
      drawNow(pose, soft);
    },
    pulse(amount) {
      if (!(amount > 0)) return;
      const now = performance.now();
      pulseAmt = Math.min(1, pulseNow(now) + amount);
      pulseAt = now;
    },
    busy() {
      return pulseNow(performance.now()) > 0.005;
    },
    setFace(face) {
      wantFace = face;
      void bake(face).then((t) => {
        if (!t || disposed || wantFace !== face) return;
        applyFace(t);
        redraw();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      root.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
      });
      bodyMat.dispose();
      inkMat.dispose();
      for (const card of [backCard, frontCard]) {
        card.mat.map?.dispose();
        card.mat.dispose();
      }
      shadowMat.dispose();
      shadowTex.dispose();
      glowMat?.dispose();
      glowTex?.dispose();
      placeholder.dispose();
      faceTex.forEach((t) => t.dispose());
      faceTex.clear();
      renderer.renderLists.dispose();
      canvas.remove();
      releaseRenderer();
    },
  };
}
