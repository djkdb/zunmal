/**
 * 신화·시크릿 등장 3D 장면 (three.js + 빛 번짐 후처리).
 * EpicReveal이 동적 import로 불러온다 — 첫 화면 번들에는 포함되지 않는다.
 *
 * 공통 흐름: 모으기(캡슐 회전·떨림, 금이 가며 빛이 샘) → 폭발(섬광·충격파·입자·카메라 흔들림)
 * → 등장(모티프별 장치). 말랑이와 제목은 DOM(SVG)이 이 캔버스 위에 그린다.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { EpicParticleShape, EpicTheme } from './themes';

export type ScenePhase = 'charge' | 'burst' | 'reveal' | 'title';

export interface EpicScene {
  setPhase(phase: ScenePhase): void;
  dispose(): void;
}

export interface EpicSceneOptions {
  theme: EpicTheme;
  /** 모으기 길이 (ms) — 금이 다 퍼지는 시점 */
  chargeMs: number;
  /** 시크릿은 모든 장치가 더 크고 많다 + 전조·수축·이중 폭발 단계가 붙는다 */
  secret: boolean;
  /** 시크릿 전조 (ms): 화면이 까맣게 가라앉고 캡슐이 혜성처럼 떨어진다. 신화는 0 */
  omenMs: number;
  /** 시크릿 수축 (ms): 폭발 직전 모든 빛이 한 점으로 빨려 든다. 신화는 0 */
  implodeMs: number;
  shiny: boolean;
}

/** 화면에서 말랑이가 서는 높이 (위에서 45%) — DOM 무대와 맞춘다 */
const STAGE_Y = 0.45;
const FOV = 50;
const CAM_Z = 10;
const INK = '#2b2233';
const MAX_PARTICLES = 2400;

const SHAPE_CODE: Record<EpicParticleShape, number> = { dot: 0, star: 1, ember: 2, heart: 3, shard: 4 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;

// ── 셰이더 ─────────────────────────────────────────────────

const PARTICLE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aShape;
  attribute float aSpin;
  uniform float uPx;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vSpin;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPx / -mv.z, 0.0, 180.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aAlpha;
    vShape = aShape;
    vSpin = aSpin;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vSpin;
  float dot2(vec2 v) { return dot(v, v); }
  float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
    return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  }
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float c = cos(vSpin), s = sin(vSpin);
    vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float a;
    vec3 col = vColor;
    if (vShape < 0.5) {
      a = exp(-dot(p, p) * 5.0);
    } else if (vShape < 1.5) {
      vec2 q = abs(r);
      float rays = pow(max(0.0, 1.0 - q.x), 10.0) * pow(max(0.0, 1.0 - q.y), 0.7)
                 + pow(max(0.0, 1.0 - q.y), 10.0) * pow(max(0.0, 1.0 - q.x), 0.7);
      // 빛살이 스프라이트 가장자리에서 잘려 네모로 보이지 않도록 거리로 줄인다
      a = rays * max(0.0, 1.0 - length(p)) + exp(-dot(p, p) * 14.0);
      col = mix(col, vec3(1.0), exp(-dot(p, p) * 20.0));
    } else if (vShape < 2.5) {
      a = exp(-dot(p, p) * 3.2);
      col = mix(col, vec3(1.0, 0.95, 0.8), exp(-dot(p, p) * 10.0));
    } else if (vShape < 3.5) {
      vec2 q = vec2(r.x * 0.78, -r.y * 0.78 + 0.42);
      float d = sdHeart(q);
      a = smoothstep(0.05, -0.02, d) + exp(-max(d, 0.0) * 14.0) * 0.35;
    } else {
      float d = abs(r.x) * 2.2 + abs(r.y);
      a = smoothstep(1.0, 0.85, d) * (0.55 + 0.45 * step(r.x, 0.0)) + exp(-dot(p, p) * 8.0) * 0.4;
    }
    if (a * vAlpha < 0.003) discard;
    gl_FragColor = vec4(col * 1.3, a * vAlpha);
  }
`;

/** 화면 전체를 덮는 배경: 방사형 그라데이션 + 모티프별로 흐르는 성운 */
const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;

const BG_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uStyle;
  uniform float uGlow;
  uniform float uDim;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = vUv - vec2(0.5, ${(1 - STAGE_Y).toFixed(2)});
    p.x *= uAspect;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float t = uTime;
    vec2 q;
    if (uStyle < 0.5) {
      // 은하: 중심으로 감기는 소용돌이
      float tw = ang + r * 5.0 - t * 0.25;
      q = vec2(cos(tw), sin(tw)) * r * 3.0;
    } else if (uStyle < 1.5) {
      // 불꽃: 위로 흐르는 불길
      q = vec2(p.x * 2.5, p.y * 1.4 - t * 0.9);
    } else if (uStyle < 2.5) {
      // 무지개 꿈: 느리게 일렁이는 오로라 띠
      q = vec2(p.x * 1.6 + sin(p.y * 3.0 + t * 0.4) * 0.4, p.y * 4.0 + t * 0.15);
    } else if (uStyle < 3.5) {
      // 은하수 바다: 물결 무늬
      q = vec2(p.x * 2.0 + t * 0.12, p.y * 3.0 + sin(p.x * 4.0 + t * 0.6) * 0.3);
    } else {
      // 프리즘: 중심에서 뻗는 각진 빛
      q = vec2(ang * 3.0, r * 2.0 - t * 0.3);
    }
    float n = fbm(q + fbm(q * 0.7 + t * 0.05));
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.95, r));
    vec3 neb = mix(uA, uB, smoothstep(0.3, 0.7, n));
    neb = mix(neb, uC, smoothstep(0.55, 0.85, fbm(q * 1.7 - t * 0.07)));
    float mask = smoothstep(0.35, 0.8, n) * (1.0 - smoothstep(0.35, 1.1, r));
    col += neb * mask * 0.4;
    // 흩뿌린 먼 별
    vec2 g = vUv * vec2(uAspect, 1.0) * 90.0;
    vec2 cell = floor(g);
    float twinkle = 0.5 + 0.5 * sin(t * 3.0 + hash(cell + 3.0) * 20.0);
    float dotShape = smoothstep(0.35, 0.0, length(fract(g) - 0.5));
    float star = step(0.985, hash(cell)) * dotShape * twinkle;
    col += star * 0.7 * (1.0 - mask);
    col += uInner * uGlow * exp(-r * r * 6.0);
    col *= 1.0 - uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const GLOW_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSharp;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = exp(-d * d * uSharp) * (1.0 - smoothstep(0.85, 1.0, d));
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

/** 충격파 고리: 바깥이 밝고 안쪽으로 빠르게 사라진다 */
const RING_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float a = pow(vUv.y, 3.0) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** 시크릿 폭발 순간의 화면 왜곡: 중심으로 빨려 드는 방사 흐림 + 색 번짐 (빛 번짐 뒤, 출력 전) */
const IMPACT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new Vector2(0.5, 1 - STAGE_Y) },
    uZoom: { value: 0 },
    uSplit: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uZoom;
    uniform float uSplit;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - uCenter;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        float s = 1.0 - uZoom * float(i) / 10.0;
        col.r += texture2D(tDiffuse, uCenter + d * s * (1.0 + uSplit)).r;
        col.g += texture2D(tDiffuse, uCenter + d * s).g;
        col.b += texture2D(tDiffuse, uCenter + d * s * (1.0 - uSplit)).b;
      }
      gl_FragColor = vec4(col / 10.0, 1.0);
    }
  `,
};

const RAY_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aFade;
  varying vec3 vColor;
  varying float vFade;
  void main() { vColor = aColor; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const RAY_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(vColor, vFade * vFade * uOpacity); }
`;

// ── 입자 풀 ───────────────────────────────────────────────

interface Spawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: string;
  shape: EpicParticleShape;
  drag?: number;
  gravity?: number;
  swirl?: number;
  fadeTo?: string;
}

class ParticlePool {
  readonly points: Points;
  private readonly pos = new Float32Array(MAX_PARTICLES * 3);
  private readonly col = new Float32Array(MAX_PARTICLES * 3);
  private readonly c0 = new Float32Array(MAX_PARTICLES * 3);
  private readonly c1 = new Float32Array(MAX_PARTICLES * 3);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly baseSize = new Float32Array(MAX_PARTICLES);
  private readonly alpha = new Float32Array(MAX_PARTICLES);
  private readonly shape = new Float32Array(MAX_PARTICLES);
  private readonly spin = new Float32Array(MAX_PARTICLES);
  private readonly spinV = new Float32Array(MAX_PARTICLES);
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly drag = new Float32Array(MAX_PARTICLES);
  private readonly grav = new Float32Array(MAX_PARTICLES);
  private readonly swirl = new Float32Array(MAX_PARTICLES);
  private next = 0;
  private readonly tmp = new Color();
  readonly material: ShaderMaterial;

  constructor() {
    const g = new BufferGeometry();
    const attr = (name: string, arr: Float32Array, n: number) => {
      const a = new BufferAttribute(arr, n);
      a.setUsage(DynamicDrawUsage);
      g.setAttribute(name, a);
    };
    attr('position', this.pos, 3);
    attr('aColor', this.col, 3);
    attr('aSize', this.size, 1);
    attr('aAlpha', this.alpha, 1);
    attr('aShape', this.shape, 1);
    attr('aSpin', this.spin, 1);
    this.material = new ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uPx: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(s: Spawn) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.pos[i3] = s.x;
    this.pos[i3 + 1] = s.y;
    this.pos[i3 + 2] = s.z;
    this.vel[i3] = s.vx;
    this.vel[i3 + 1] = s.vy;
    this.vel[i3 + 2] = s.vz;
    this.tmp.set(s.color);
    this.c0[i3] = this.tmp.r;
    this.c0[i3 + 1] = this.tmp.g;
    this.c0[i3 + 2] = this.tmp.b;
    if (s.fadeTo) this.tmp.set(s.fadeTo);
    this.c1[i3] = this.tmp.r;
    this.c1[i3 + 1] = this.tmp.g;
    this.c1[i3 + 2] = this.tmp.b;
    this.life[i] = s.life;
    this.maxLife[i] = s.life;
    this.baseSize[i] = s.size;
    this.shape[i] = SHAPE_CODE[s.shape];
    this.spin[i] = rand(0, Math.PI * 2);
    this.spinV[i] = rand(-3, 3);
    this.drag[i] = s.drag ?? 0.6;
    this.grav[i] = s.gravity ?? 0;
    this.swirl[i] = s.swirl ?? 0;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const life = (this.life[i] = this.life[i]! - dt);
      const k = clamp01(life / this.maxLife[i]!);
      const damp = this.drag[i]! ** dt;
      let vx = this.vel[i3]! * damp;
      let vy = this.vel[i3 + 1]! * damp - this.grav[i]! * dt;
      const vz = this.vel[i3 + 2]! * damp;
      const sw = this.swirl[i]!;
      if (sw !== 0) {
        // 화면 중심(z축)을 도는 소용돌이
        const x = this.pos[i3]!;
        const y = this.pos[i3 + 1]!;
        vx += -y * sw * dt;
        vy += x * sw * dt;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] = this.pos[i3]! + vx * dt;
      this.pos[i3 + 1] = this.pos[i3 + 1]! + vy * dt;
      this.pos[i3 + 2] = this.pos[i3 + 2]! + vz * dt;
      for (let c = 0; c < 3; c++) this.col[i3 + c] = this.c1[i3 + c]! + (this.c0[i3 + c]! - this.c1[i3 + c]!) * k;
      // 처음엔 빠르게 커지고 끝에 스르르 꺼진다
      const born = clamp01((1 - k) * 8);
      this.alpha[i] = Math.min(1, k * 1.6) * born;
      this.size[i] = this.baseSize[i]! * (0.4 + 0.6 * k) * (0.5 + 0.5 * born);
      this.spin[i] = this.spin[i]! + this.spinV[i]! * dt;
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha', 'aSpin']) {
      const a = g.getAttribute(name);
      if (a) a.needsUpdate = true;
    }
  }
}

// ── 장면 부품 ─────────────────────────────────────────────

function glowMaterial(color: string, sharp = 4) {
  return new ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uColor: { value: new Color(color).multiplyScalar(1.8) }, uOpacity: { value: 0 }, uSharp: { value: sharp } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** 구 위에서 무작위로 뻗어 가는 금 (튜브) */
function crackGeometry(start: Vector3, steps: number): TubeGeometry {
  const pts: Vector3[] = [];
  const p = start.clone().normalize();
  let dir = new Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(p).normalize();
  for (let i = 0; i <= steps; i++) {
    pts.push(p.clone().multiplyScalar(1.012));
    dir = dir.add(new Vector3(rand(-0.7, 0.7), rand(-0.7, 0.7), rand(-0.7, 0.7))).projectOnPlane(p).normalize();
    p.addScaledVector(dir, 0.16).normalize();
  }
  return new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.022, 5, false);
}

function makeRays(count: number, colors: readonly string[], length: number, width: number): Mesh<BufferGeometry, ShaderMaterial> {
  const pos: number[] = [];
  const col: number[] = [];
  const fade: number[] = [];
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.08, 0.08);
    const len = length * rand(0.7, 1.15);
    const w = width * rand(0.6, 1.3);
    c.set(colors[i % colors.length] ?? '#ffffff');
    pos.push(0, 0, 0, Math.cos(a - w) * len, Math.sin(a - w) * len, 0, Math.cos(a + w) * len, Math.sin(a + w) * len, 0);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    fade.push(1, 0, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aFade', new BufferAttribute(new Float32Array(fade), 1));
  const m = new ShaderMaterial({
    vertexShader: RAY_VERT,
    fragmentShader: RAY_FRAG,
    uniforms: { uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  return new Mesh(g, m);
}

/** 로그 나선 팔 3개짜리 은하 (정적 점 구름) */
function makeGalaxy(theme: EpicTheme, n: number): Points {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const shape = new Float32Array(n);
  const spin = new Float32Array(n);
  const inner = new Color('#fff3c4');
  const c = new Color();
  for (let i = 0; i < n; i++) {
    const arm = i % 3;
    const t = Math.random() ** 0.7;
    const r = 0.3 + t * 5.2;
    const a = (arm / 3) * Math.PI * 2 + r * 0.9 + rand(-0.35, 0.35) * (1.2 - t);
    pos[i * 3] = Math.cos(a) * r + rand(-0.2, 0.2);
    pos[i * 3 + 1] = Math.sin(a) * r + rand(-0.2, 0.2);
    pos[i * 3 + 2] = rand(-0.15, 0.15);
    c.set(pick(theme.palette)).lerp(inner, 1 - t);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    size[i] = rand(0.05, 0.16) * (1.4 - t * 0.6);
    alpha[i] = rand(0.35, 1);
    shape[i] = Math.random() < 0.06 ? 1 : 0;
    spin[i] = rand(0, 6);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  g.setAttribute('aShape', new BufferAttribute(shape, 1));
  g.setAttribute('aSpin', new BufferAttribute(spin, 1));
  const m = new ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: { uPx: { value: 400 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const p = new Points(g, m);
  p.frustumCulled = false;
  return p;
}

function disposeTree(root: Object3D) {
  root.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

// ── 장면 ─────────────────────────────────────────────────

/**
 * container 안에 자기 캔버스를 만들어 붙인다 (dispose 때 떼어 낸다 — 컨텍스트를 다시 쓰지 않도록).
 * WebGL 컨텍스트를 만들 수 없으면 throw한다 → 호출 쪽이 2D 연출로 대체.
 */
export function createEpicScene(container: HTMLElement, opts: EpicSceneOptions): EpicScene {
  const { theme, secret } = opts;
  const scale = secret ? 1.25 : 1;

  const canvas = document.createElement('canvas');
  canvas.className = 'epic__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  container.appendChild(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  // 방 환경맵은 밝아서 캡슐 색이 하얗게 날아가지 않도록 반사만 은은하게
  scene.environmentIntensity = 0.45;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), theme.bloom, 0.5, 0.92);
  composer.addPass(bloom);
  const impact = secret ? new ShaderPass(IMPACT_SHADER) : null;
  if (impact) {
    impact.enabled = false;
    composer.addPass(impact);
  }
  composer.addPass(new OutputPass());

  // 배경
  const bgMat = new ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uStyle: { value: ['galaxy', 'phoenix', 'rainbow', 'ocean', 'prism'].indexOf(theme.motif) },
      uGlow: { value: 0 },
      uDim: { value: 0 },
      uInner: { value: new Color(theme.bgInner) },
      uOuter: { value: new Color(theme.bgOuter) },
      uA: { value: new Color(theme.nebula[0]) },
      uB: { value: new Color(theme.nebula[1]) },
      uC: { value: new Color(theme.nebula[2]) },
    },
  });
  const bg = new Mesh(new PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  // 조명: 환경 반사 + 위쪽 키 라이트는 RoomEnvironment가 담당

  // 무대 (말랑이가 서는 곳)
  const stage = new Group();
  scene.add(stage);

  // 뒤쪽 빛 무리
  const halo = new Mesh(new PlaneGeometry(1, 1), glowMaterial(theme.core, 3.5));
  halo.position.z = -1.5;
  halo.renderOrder = 1;
  stage.add(halo);

  // 광선
  const rays = theme.rays > 0 ? makeRays(Math.round(theme.rays * scale), theme.rayColors, 16, 0.06) : null;
  if (rays) {
    rays.position.z = -2;
    rays.renderOrder = 2;
    stage.add(rays);
  }

  // ── 캡슐 ──
  const capsule = new Group();
  capsule.scale.setScalar(1.35);
  stage.add(capsule);
  const topMat = new MeshPhysicalMaterial({
    color: theme.capsuleTop,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: theme.iridescence * 0.6,
    iridescenceIOR: 1.8,
    emissive: new Color(theme.core),
    emissiveIntensity: 0,
    transparent: true,
  });
  const botMat = new MeshPhysicalMaterial({
    color: theme.capsuleBottom,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: new Color(theme.core),
    emissiveIntensity: 0,
    transparent: true,
  });
  const inkMat = new MeshBasicMaterial({ color: INK, side: BackSide, transparent: true });
  const topGeo = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const botGeo = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const top = new Group();
  const bot = new Group();
  top.add(new Mesh(topGeo, topMat));
  bot.add(new Mesh(botGeo, botMat));
  // 게임 전체의 잉크 외곽선 스타일 — 뒤집힌 껍질
  const topInk = new Mesh(topGeo, inkMat);
  topInk.scale.setScalar(1.06);
  top.add(topInk);
  const botInk = new Mesh(botGeo, inkMat);
  botInk.scale.setScalar(1.06);
  bot.add(botInk);
  const seam = new Mesh(new TorusGeometry(1.01, 0.055, 12, 64), new MeshBasicMaterial({ color: INK, transparent: true }));
  seam.rotation.x = Math.PI / 2;
  top.add(seam);
  // 윗면 광택 점
  const shine = new Mesh(new SphereGeometry(0.16, 16, 12), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  shine.scale.set(1.4, 0.7, 0.5);
  shine.position.set(-0.42, 0.62, 0.68);
  top.add(shine);
  capsule.add(top, bot);

  // 금 — 순서대로 자라난다
  const crackMat = new MeshBasicMaterial({ color: new Color(theme.crack).multiplyScalar(3), transparent: true });
  const cracks: { mesh: Mesh<TubeGeometry, MeshBasicMaterial>; at: number; parent: Group }[] = [];
  const crackCount = secret ? 9 : 7;
  for (let i = 0; i < crackCount; i++) {
    const upper = i < crackCount - 2;
    const theta = rand(-1.1, 1.1);
    const y = upper ? rand(0.15, 0.85) : rand(-0.7, -0.15);
    const start = new Vector3(Math.sin(theta), y, Math.cos(theta));
    const mesh = new Mesh(crackGeometry(start, secret ? 9 : 7), crackMat);
    mesh.geometry.setDrawRange(0, 0);
    const parent = upper ? top : bot;
    parent.add(mesh);
    cracks.push({ mesh, at: 0.25 + (i / crackCount) * 0.6, parent });
  }

  // 충격파 고리
  const rings: { mesh: Mesh<RingGeometry, ShaderMaterial>; delay: number }[] = [];
  const ringCount = theme.motif === 'ocean' ? 5 : 3;
  for (let i = 0; i < ringCount; i++) {
    const m = new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { uColor: { value: new Color(i === 0 ? '#ffffff' : pick(theme.palette)).multiplyScalar(1.6) }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(new RingGeometry(0.82, 1, 96, 1), m);
    // RingGeometry uv.y는 가장자리가 1이 아니므로 반지름 기준으로 다시 쓴다
    const uv = mesh.geometry.getAttribute('uv');
    const posA = mesh.geometry.getAttribute('position');
    for (let k = 0; k < uv.count; k++) {
      const r = Math.hypot(posA.getX(k), posA.getY(k));
      uv.setXY(k, 0.5, (r - 0.82) / 0.18);
    }
    if (theme.motif === 'ocean') mesh.rotation.x = -1.25;
    else mesh.rotation.set(rand(-0.5, 0.5), rand(-0.5, 0.5), 0);
    mesh.visible = false;
    mesh.renderOrder = 6;
    stage.add(mesh);
    rings.push({ mesh, delay: i * (theme.motif === 'ocean' ? 0.14 : 0.09) });
  }

  // 폭발 섬광 (빛 번짐이 크게 퍼진다)
  const flash = new Mesh(new PlaneGeometry(1, 1), glowMaterial('#ffffff', 2.2));
  flash.position.z = 1;
  flash.renderOrder = 7;
  stage.add(flash);

  const pool = new ParticlePool();
  stage.add(pool.points);

  // ── 시크릿 전용 장치 ──
  // 혼천의처럼 캡슐·말랑이를 감싸고 도는 빛 고리 3개 (고리마다 별 구슬이 달려 있다)
  const armillary = new Group();
  const armRings: { ring: Group; mat: MeshBasicMaterial; speed: number }[] = [];
  // 폭발 직후 화면을 가로지르는 가로 빛줄기
  let streak: Mesh | null = null;
  // 두 번째 폭발(초신성)의 무지개 충격파
  const boomRings: Mesh<RingGeometry, ShaderMaterial>[] = [];
  let boomDone = false;
  if (secret) {
    const tilts: [number, number][] = [
      [1.15, 0.2],
      [1.15, -1.1],
      [0.35, 1.3],
    ];
    tilts.forEach(([rx, ry], i) => {
      const ring = new Group();
      ring.rotation.set(rx, ry, 0);
      const mat = new MeshBasicMaterial({
        color: new Color(theme.rayColors[i % theme.rayColors.length] ?? '#ffffff').multiplyScalar(2.4),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      ring.add(new Mesh(new TorusGeometry(1.75, 0.02, 8, 160), mat));
      for (let k = 0; k < 3; k++) {
        const bead = new Mesh(new SphereGeometry(0.075, 12, 8), mat);
        const a = (k / 3) * Math.PI * 2;
        bead.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0);
        ring.add(bead);
      }
      armillary.add(ring);
      armRings.push({ ring, mat, speed: (i % 2 ? -1 : 1) * (0.7 + i * 0.25) });
    });
    armillary.visible = false;
    stage.add(armillary);

    streak = new Mesh(new PlaneGeometry(1, 1), glowMaterial('#d8ecff', 3));
    streak.position.z = 1.2;
    streak.renderOrder = 8;
    stage.add(streak);

    const RB = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'];
    for (let i = 0; i < 2; i++) {
      const m = new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: RING_FRAG,
        uniforms: { uColor: { value: new Color(RB[(i * 2) % RB.length] ?? '#ffffff').multiplyScalar(2) }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(new RingGeometry(0.7, 1, 128, 1), m);
      const uv = mesh.geometry.getAttribute('uv');
      const posA = mesh.geometry.getAttribute('position');
      for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, (Math.hypot(posA.getX(k), posA.getY(k)) - 0.7) / 0.3);
      mesh.rotation.set(i ? 0.9 : 0, i ? 0.3 : 0, 0);
      mesh.visible = false;
      mesh.renderOrder = 6;
      stage.add(mesh);
      boomRings.push(mesh);
    }
  }

  /** 초신성: 폭발 0.32초 뒤 한 번 더, 더 크게 */
  const secondBoom = () => {
    boomDone = true;
    shake = 0.75;
    const RB = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff', '#ffffff'];
    for (let i = 0; i < 260; i++) {
      const u = rand(-1, 1);
      const a = rand(0, Math.PI * 2);
      const s2 = Math.sqrt(1 - u * u);
      const sp = rand(9, 17);
      pool.spawn({ x: 0, y: 0, z: 0, vx: Math.cos(a) * s2 * sp, vy: u * sp, vz: Math.sin(a) * s2 * sp * 0.4, life: rand(1.2, 2.4), size: rand(0.08, 0.2), color: pick(RB), shape: 'star', drag: 0.12 });
    }
    boomRings.forEach((r) => (r.visible = true));
  };

  // ── 모티프 장치 ──
  const motifRoot = new Group();
  motifRoot.visible = false;
  stage.add(motifRoot);
  let galaxy: Points | null = null;
  const rainbowArcs: Mesh<TorusGeometry, MeshBasicMaterial>[] = [];
  const shards: { mesh: Mesh; from: Vector3; orbitR: number; orbitA: number; speed: number; tilt: number }[] = [];
  let haloRing: Mesh<TorusGeometry, MeshBasicMaterial> | null = null;
  let warp: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;
  const warpPos: Float32Array = new Float32Array(secret ? 240 * 6 : 0);
  const warpVel: Float32Array = new Float32Array(secret ? 240 : 0);

  if (theme.motif === 'galaxy') {
    galaxy = makeGalaxy(theme, secret ? 5200 : 4200);
    galaxy.position.z = -2.5;
    galaxy.rotation.x = -1.05;
    motifRoot.add(galaxy);
  }
  if (theme.motif === 'rainbow') {
    const RB = ['#ff5f7e', '#ff9f43', '#ffd23f', '#7ed957', '#5cc8ff', '#6b7bff', '#b98cff'];
    RB.forEach((c, i) => {
      const arc = new Mesh(
        new TorusGeometry(3.4 - i * 0.2, 0.1, 8, 96, Math.PI),
        new MeshBasicMaterial({ color: new Color(c).multiplyScalar(1.5), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      );
      arc.position.set(0, -0.6, -2);
      motifRoot.add(arc);
      rainbowArcs.push(arc);
    });
  }
  if (theme.motif === 'prism') {
    const shardGeo = new OctahedronGeometry(0.28, 0);
    const shardMat = new MeshPhysicalMaterial({
      color: '#fffbe6',
      roughness: 0.05,
      metalness: 0.2,
      iridescence: 1,
      iridescenceIOR: 2.2,
      clearcoat: 1,
      emissive: new Color('#ffd23f'),
      emissiveIntensity: 0.35,
      flatShading: true,
    });
    const n = 12;
    for (let i = 0; i < n; i++) {
      const mesh = new Mesh(shardGeo, shardMat);
      mesh.scale.set(0.8, rand(1.4, 2.2), 0.8);
      stage.add(mesh);
      mesh.visible = false;
      shards.push({ mesh, from: new Vector3(), orbitR: rand(1.75, 2.15), orbitA: (i / n) * Math.PI * 2, speed: rand(0.35, 0.55), tilt: rand(-0.25, 0.25) });
    }
    haloRing = new Mesh(
      new TorusGeometry(2.45, 0.05, 12, 128),
      new MeshBasicMaterial({ color: new Color('#ffe07a').multiplyScalar(2.2), transparent: true, opacity: 0 }),
    );
    // 등 뒤의 커다란 빛 고리
    haloRing.position.set(0, 0.15, -1.2);
    motifRoot.add(haloRing);
  }
  if (theme.motif === 'ocean') {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(warpPos, 3).setUsage(DynamicDrawUsage));
    warp = new LineSegments(
      g,
      new LineBasicMaterial({ color: new Color('#bfefff').multiplyScalar(1.8), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }),
    );
    warp.frustumCulled = false;
    scene.add(warp);
    for (let i = 0; i < warpVel.length; i++) resetWarp(i, true);
  }

  function resetWarp(i: number, anywhere: boolean) {
    const a = rand(0, Math.PI * 2);
    const r = rand(0.6, 7);
    const z = anywhere ? rand(-40, 6) : rand(-45, -30);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    warpPos.set([x, y, z, x, y, z], i * 6);
    warpVel[i] = rand(18, 34);
  }

  // ── 상태 ──
  let phase: ScenePhase = 'charge';
  const start = performance.now();
  let phaseAt = start;
  /** 폭발 시각 — 캡슐 조각·섬광·충격파는 단계가 바뀌어도 이 시각 기준으로 움직인다 */
  let burstAt = 0;
  let landed = opts.omenMs <= 0;
  let shake = 0;
  let spawnAcc = 0;
  let last = start;
  let raf = 0;
  let width = 1;
  let height = 1;

  const resize = () => {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    // 빛 번짐 버퍼는 절반 해상도로 (모바일 부하 절감)
    bloom.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uAspect!.value = width / height;
    const px = (height * renderer.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360));
    pool.material.uniforms.uPx!.value = px;
    if (galaxy) (galaxy.material as ShaderMaterial).uniforms.uPx!.value = px;
  };
  resize();
  window.addEventListener('resize', resize);

  // 화면 위 45% 지점에 세계 원점이 오도록 카메라를 아래로 내린다
  const halfH = CAM_Z * Math.tan((FOV * Math.PI) / 360);
  const baseY = -(0.5 - STAGE_Y) * 2 * halfH;

  const burstOnce = () => {
    if (burstAt > 0) return;
    burstAt = performance.now();
    shake = 0.55 * scale;
    const n = Math.round(300 * scale);
    for (let i = 0; i < n; i++) {
      // 등방성 폭발 — 은하는 원반에, 불사조는 위쪽으로 쏠린다
      const u = rand(-1, 1);
      const a = rand(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      let dx = Math.cos(a) * s;
      let dy = u;
      let dz = Math.sin(a) * s;
      if (theme.motif === 'galaxy') {
        dz *= 0.15;
      } else if (theme.motif === 'phoenix') {
        dy = Math.abs(dy) * 1.3 + 0.2;
      } else if (theme.motif === 'ocean') {
        dy *= 0.35;
      }
      const sp = rand(3, 11) * (Math.random() < 0.2 ? 1.6 : 1);
      dx *= sp;
      dy *= sp;
      dz *= sp;
      pool.spawn({
        x: 0,
        y: 0,
        z: 0,
        vx: dx,
        vy: dy,
        vz: dz,
        life: rand(0.9, 2.2),
        size: rand(0.08, 0.24),
        color: pick(theme.palette),
        shape: pick(theme.shapes),
        drag: 0.18,
        gravity: theme.gravity * 0.6,
        swirl: theme.swirl,
        fadeTo: theme.fadeTo,
      });
    }
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(8, 16);
      pool.spawn({ x: 0, y: 0, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(-2, 2), life: rand(0.3, 0.7), size: rand(0.08, 0.16), color: '#ffffff', shape: 'dot', drag: 0.05 });
    }
    rings.forEach((r) => (r.mesh.visible = true));
    // 수정 조각은 캡슐 자리에서 튀어 나가 궤도에 자리 잡는다
    shards.forEach((s) => {
      s.mesh.visible = true;
      s.from.set(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3));
      s.mesh.position.copy(s.from);
    });
  };

  const setPhase = (p: ScenePhase) => {
    if (p === phase) return;
    phase = p;
    phaseAt = performance.now();
    burstOnce();
    if (p === 'reveal' || p === 'title') motifRoot.visible = true;
  };

  // 모티프별 지속 방출 (등장 이후)
  const emitAmbient = (t: number) => {
    const m = theme.motif;
    if (opts.shiny && Math.random() < 0.5) {
      // 반짝 버전: 무지개 반짝이가 말랑이 주위를 맴돈다
      const a = rand(0, Math.PI * 2);
      pool.spawn({ x: Math.cos(a) * 1.6, y: Math.sin(a) * 1.8, z: 0.5, vx: -Math.sin(a) * 1.5, vy: Math.cos(a) * 1.5, vz: 0, life: 1.2, size: rand(0.18, 0.3), color: pick(['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff']), shape: 'star', drag: 0.9 });
    }
    if (m === 'phoenix') {
      // 불꽃 날개: 양옆으로 휘어진 곡선을 따라 불씨가 솟는다
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 5; k++) {
          const u = Math.random();
          const flap = Math.sin(t * 5) * 0.35;
          const x = side * (0.8 + u * 1.9);
          const y = 0.1 + Math.sin(u * Math.PI) * (1.1 + flap) + u * (0.9 + flap);
          pool.spawn({ x, y, z: rand(-0.6, 0.2), vx: side * rand(0.1, 0.6), vy: rand(0.4, 1.6), vz: 0, life: rand(0.5, 1.1), size: rand(0.18, 0.34) * (1 - u * 0.4), color: pick(theme.palette), shape: 'ember', drag: 0.5, gravity: -1.5, fadeTo: theme.fadeTo });
        }
      }
      for (let k = 0; k < 3; k++) {
        pool.spawn({ x: rand(-5, 5), y: rand(-6, -3), z: rand(-2, 1), vx: rand(-0.3, 0.3), vy: rand(1.5, 3.5), vz: 0, life: rand(1.8, 3), size: rand(0.06, 0.14), color: pick(theme.palette), shape: 'ember', drag: 0.8, gravity: -0.6, fadeTo: theme.fadeTo });
      }
    } else if (m === 'rainbow') {
      for (let k = 0; k < 2; k++) {
        pool.spawn({ x: rand(-4, 4), y: rand(-5, -2.5), z: rand(-1.5, 1), vx: rand(-0.2, 0.2), vy: rand(0.6, 1.3), vz: 0, life: rand(3, 5), size: rand(0.22, 0.42), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9, gravity: -0.1, swirl: 0.05 });
      }
    } else if (m === 'ocean') {
      // 머리 위로 뿜는 별 물줄기
      for (let k = 0; k < 4; k++) {
        pool.spawn({ x: rand(-0.1, 0.1), y: 1.7, z: 0, vx: rand(-1.3, 1.3), vy: rand(5.5, 7.5), vz: rand(-0.5, 0.5), life: rand(1.4, 2.2), size: rand(0.12, 0.26), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.85, gravity: 7 });
      }
      // 반복되는 잔물결
      rings.forEach((r, i) => {
        const cyc = ((t * 0.55 + i / rings.length) % 1 + 1) % 1;
        r.mesh.visible = true;
        r.mesh.position.y = -1.6;
        r.mesh.scale.setScalar(0.6 + cyc * 5);
        r.mesh.material.uniforms.uOpacity!.value = (1 - cyc) * 0.4;
      });
    } else if (m === 'prism') {
      for (let k = 0; k < 2; k++) {
        pool.spawn({ x: rand(-4.5, 4.5), y: rand(3, 6), z: rand(-2, 1), vx: rand(-0.2, 0.2), vy: rand(-1.4, -0.6), vz: 0, life: rand(2, 3.5), size: rand(0.14, 0.28), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9 });
      }
    } else {
      // 은하: 원반을 따라 도는 반짝이
      for (let k = 0; k < 2; k++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(1.5, 4.5);
        pool.spawn({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.45, z: rand(-1, 1), vx: -Math.sin(a) * 1.2, vy: Math.cos(a) * 0.5, vz: 0, life: rand(1.5, 2.8), size: rand(0.12, 0.26), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.95 });
      }
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    const pt = (now - phaseAt) / 1000;
    const sb = burstAt > 0 ? (now - burstAt) / 1000 : 0;
    const elapsed = now - start;
    // 시크릿: 전조가 끝난 뒤부터 모으기, 끝 무렵 수축
    const omenK = opts.omenMs > 0 ? clamp01(elapsed / opts.omenMs) : 1;
    const charge = clamp01((elapsed - opts.omenMs) / Math.max(1, opts.chargeMs - opts.omenMs));
    const implode = opts.implodeMs > 0 && phase === 'charge' ? clamp01((elapsed - (opts.chargeMs - opts.implodeMs)) / opts.implodeMs) : 0;
    const revealed = phase === 'reveal' || phase === 'title';
    bgMat.uniforms.uTime!.value = t;

    // ── 카메라: 모으는 동안 다가가고, 등장 후 살짝 물러나 흔들린다
    let camZ = CAM_Z;
    let camX = 0;
    let camY = baseY;
    if (phase === 'charge') {
      camZ = CAM_Z + 1.5 - easeOut(charge) * 2.6;
      camX = Math.sin(t * 0.8) * 0.3 * (1 - charge);
    } else {
      const back = easeOut(sb / 1.2);
      camZ = CAM_Z - 1.1 + back * 1.1;
      if (revealed) {
        camX = Math.sin(t * 0.5) * 0.25;
        camY = baseY + Math.sin(t * 0.7) * 0.12;
      }
    }
    shake *= Math.exp(-dt * 5);
    camera.position.set(camX + rand(-shake, shake), camY + rand(-shake, shake), camZ);
    camera.lookAt(camX * 0.5, camY, 0);
    camera.fov = FOV + shake * 14;
    camera.updateProjectionMatrix();

    // ── 캡슐
    if (phase === 'charge') {
      const tremble = charge ** 2 * 0.09 * scale + implode * 0.12;
      capsule.visible = true;
      // 전조: 어둠 속 별 하나가 반짝이다가 혜성처럼 떨어져 쾅 내려앉는다
      const drop = clamp01((omenK - 0.45) / 0.55);
      const fall = 7 * (1 - drop * drop);
      capsule.position.set(rand(-tremble, tremble), fall + Math.sin(t * 2) * 0.08 + rand(-tremble, tremble), 0);
      capsule.scale.setScalar(1.35 * (1 - implode ** 2 * 0.88));
      if (omenK < 0.45) {
        if (Math.random() < 0.5) {
          pool.spawn({ x: 0, y: 4.3, z: 0, vx: 0, vy: 0, vz: 0, life: 0.25, size: 0.5 + Math.sin(t * 9) * 0.2, color: '#ffffff', shape: 'star', drag: 1 });
        }
      } else if (omenK < 1) {
        pool.spawn({ x: rand(-0.4, 0.4), y: fall + rand(0.3, 1.2), z: rand(-0.3, 0.3), vx: rand(-0.3, 0.3), vy: rand(1, 3), vz: 0, life: rand(0.4, 0.9), size: rand(0.1, 0.24), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.6 });
      } else if (!landed) {
        landed = true;
        shake = 0.22;
        for (let i = 0; i < 60; i++) {
          const a = rand(0, Math.PI * 2);
          pool.spawn({ x: 0, y: -1.2, z: 0, vx: Math.cos(a) * rand(2, 4), vy: rand(0, 0.6), vz: Math.sin(a) * rand(2, 4), life: rand(0.5, 0.9), size: rand(0.08, 0.16), color: pick(theme.palette), shape: 'dot', drag: 0.2 });
        }
      }
      capsule.rotation.y = t * (0.8 + charge * 5);
      capsule.rotation.z = Math.sin(t * 3) * 0.12;
      topMat.emissiveIntensity = charge ** 3 * 0.9 + implode * 3;
      botMat.emissiveIntensity = charge ** 3 * 0.5 + implode * 3;
      for (const c of cracks) {
        const g = c.mesh.geometry;
        const count = g.index?.count ?? 0;
        const k = clamp01((charge - c.at) / 0.18);
        g.setDrawRange(0, Math.floor((count * k) / 3) * 3);
      }
      // 모으기: 사방에서 빛 가루가 빨려 들어간다
      spawnAcc += dt;
      while (spawnAcc > 0.016) {
        spawnAcc -= 0.016;
        const n = omenK < 1 ? 0 : Math.round((2 + charge * 5 + implode * 8) * scale);
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          const r = rand(5, 9);
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          const z = rand(-3, 2);
          const sp = (rand(0.9, 1.3) / rand(0.8, 1.2)) * (1 + implode * 2);
          const tangential = theme.swirl * 1.8;
          pool.spawn({ x, y, z, vx: (-x - y * tangential) * sp, vy: (-y + x * tangential) * sp, vz: -z * sp, life: 0.9, size: rand(0.07, 0.18), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9 });
        }
      }
    } else {
      const k = easeOut(sb / 0.9);
      capsule.visible = sb < 1;
      top.position.set(-k * 2.4, k * 3.4, -k * 2.5);
      top.rotation.set(-k * 2.2, 0, k * 1.4);
      bot.position.set(k * 2.2, -k * 3.2, -k * 2.5);
      bot.rotation.set(k * 2, 0, -k * 1.1);
      const fade = 1 - clamp01(sb / 0.45);
      topMat.opacity = botMat.opacity = inkMat.opacity = crackMat.opacity = fade;
      (seam.material as MeshBasicMaterial).opacity = fade;
      (shine.material as MeshBasicMaterial).opacity = fade * 0.85;
    }

    // ── 빛 무리와 섬광
    const haloMat = halo.material as ShaderMaterial;
    const flashMat = flash.material as ShaderMaterial;
    if (phase === 'charge') {
      // 수축하는 동안 빛 무리는 바늘 끝처럼 작고 밝아진다
      halo.scale.setScalar((2.5 + charge ** 2 * 3 * scale) * (1 - implode * 0.8));
      haloMat.uniforms.uOpacity!.value = (0.1 + charge ** 2 * 0.45) * omenK + implode * 0.9;
      flashMat.uniforms.uOpacity!.value = 0;
      bgMat.uniforms.uGlow!.value = charge ** 2 * 0.25 * (1 - implode);
      bgMat.uniforms.uDim!.value = Math.max(0.92 * (1 - clamp01((omenK - 0.8) / 0.2)), implode * 0.8);
      bloom.strength = theme.bloom * (0.6 + charge * 0.5 + implode * 0.8);
    } else {
      const f = Math.exp(-sb * 6);
      flash.scale.setScalar(4 + sb * (secret ? 14 : 30));
      flashMat.uniforms.uOpacity!.value = f * (secret ? 0.8 : 1.1);
      halo.scale.setScalar(5 * scale + Math.sin(t * 2) * 0.3);
      haloMat.uniforms.uOpacity!.value = 0.2 + f * 0.4;
      bgMat.uniforms.uGlow!.value = 0.12 + f * (secret ? 0.35 : 0.8);
      bgMat.uniforms.uDim!.value = 0;
      bloom.strength = theme.bloom * (0.85 + f * (secret ? 0.5 : 0.8));
    }

    // ── 충격파
    if (phase !== 'charge' && theme.motif !== 'ocean') {
      for (const r of rings) {
        const k = clamp01((sb - r.delay) / 1.1);
        r.mesh.scale.setScalar(0.5 + easeOut(k) * 13 * scale);
        r.mesh.material.uniforms.uOpacity!.value = k > 0 ? (1 - k) ** 1.5 * 1.6 : 0;
        r.mesh.visible = k < 1;
      }
    } else if (phase !== 'charge' && !revealed) {
      for (const r of rings) {
        const k = clamp01((sb - r.delay) / 1.1);
        r.mesh.position.y = 0;
        r.mesh.scale.setScalar(0.5 + easeOut(k) * 11);
        r.mesh.material.uniforms.uOpacity!.value = k > 0 ? (1 - k) * 1.4 : 0;
      }
    }

    // ── 광선
    if (rays) {
      rays.rotation.z = t * (theme.motif === 'prism' ? 0.12 : 0.2);
      const target = revealed ? (theme.motif === 'prism' ? 0.75 : 0.5) : phase === 'burst' ? 0.3 : 0;
      const u = rays.material.uniforms.uOpacity!;
      u.value += (target - u.value) * Math.min(1, dt * 3);
    }

    // ── 모티프
    if (motifRoot.visible) {
      const appear = easeOut(pt / 1.4);
      const k = phase === 'title' ? 1 : appear;
      if (galaxy) {
        galaxy.rotation.z = -t * 0.35;
        galaxy.scale.setScalar(0.2 + k * 0.8 * scale);
      }
      rainbowArcs.forEach((arc, i) => {
        const d = clamp01(k * 1.4 - i * 0.06);
        arc.material.opacity = d * 0.85;
        arc.scale.setScalar(0.4 + d * 0.6);
      });
      if (haloRing) {
        haloRing.material.opacity = k;
        haloRing.rotation.z = t * 0.6;
      }
      if (revealed) {
        spawnAcc += dt;
        while (spawnAcc > 0.033) {
          spawnAcc -= 0.033;
          emitAmbient(t);
        }
      }
    }
    for (const s of shards) {
      if (!s.mesh.visible) continue;
      const a = s.orbitA + t * s.speed;
      // 세로 화면에 맞춘 세로로 긴 타원 궤도
      const target = new Vector3(Math.cos(a) * s.orbitR, Math.sin(a) * s.orbitR * 1.25 + s.tilt, Math.sin(a + 1.2) * 0.8);
      s.mesh.position.lerpVectors(s.from, target, easeOut(sb / 1.2));
      s.mesh.rotation.y = t * 1.5 + s.orbitA;
      s.mesh.rotation.z = Math.sin(t + s.orbitA) * 0.4;
    }

    // ── 워프 (고래)
    if (warp) {
      const speed = phase === 'charge' ? 0.4 + charge * 1.4 : revealed ? 0.12 : 2.2;
      for (let i = 0; i < warpVel.length; i++) {
        const o = i * 6;
        const z = (warpPos[o + 2] ?? 0) + (warpVel[i] ?? 0) * speed * dt;
        if (z > CAM_Z + 1) {
          resetWarp(i, false);
          continue;
        }
        warpPos[o + 2] = z;
        // 꼬리 길이 = 속도
        warpPos[o + 5] = z - (warpVel[i] ?? 0) * speed * 0.06;
      }
      warp.geometry.getAttribute('position').needsUpdate = true;
      warp.material.opacity = revealed ? 0.35 : 0.9;
    }

    // ── 시크릿 전용
    if (secret) {
      if (burstAt > 0 && !boomDone && sb > 0.32) secondBoom();
      const sb2 = Math.max(0, sb - 0.32);
      // 고리: 모으기 중 나타나 수축 때 캡슐로 오그라들었다가, 폭발 후 크게 펼쳐진다
      let ringScale: number;
      let ringAlpha: number;
      if (phase === 'charge') {
        const k = easeOut((charge - 0.05) / 0.45);
        ringScale = (0.4 + k * 0.6) * (1 - implode * 0.9);
        ringAlpha = k;
      } else {
        ringScale = 0.1 + easeOut(sb / 0.9) * 1.05;
        ringAlpha = 1;
      }
      armillary.visible = ringAlpha > 0.01;
      armillary.scale.setScalar(ringScale);
      armillary.rotation.y = t * 0.35;
      for (const r of armRings) {
        r.ring.rotation.z += dt * r.speed * (1 + implode * 8 + (phase === 'charge' ? charge * 2 : 0));
        r.mat.opacity = ringAlpha * 0.9;
      }
      if (streak) {
        const f = burstAt > 0 ? Math.exp(-sb * 1.6) : 0;
        streak.scale.set(6 + sb * 20, 0.28 * f + 0.02, 1);
        (streak.material as ShaderMaterial).uniforms.uOpacity!.value = f * 0.9;
      }
      boomRings.forEach((r, i) => {
        const k = clamp01((sb2 - i * 0.08) / 1.3);
        r.scale.setScalar(0.3 + easeOut(k) * 16);
        r.material.uniforms.uOpacity!.value = r.visible ? (1 - k) ** 2 * 1.1 : 0;
        if (k >= 1) r.visible = false;
      });
      if (impact) {
        const f = burstAt > 0 ? Math.exp(-sb * 4) + (boomDone ? Math.exp(-sb2 * 5) * 0.7 : 0) : 0;
        const zoom = implode * 0.12 + f * 0.13;
        const split = implode * 0.004 + f * 0.018;
        impact.enabled = zoom > 0.002;
        impact.uniforms.uZoom!.value = zoom;
        impact.uniforms.uSplit!.value = split;
      }
    }

    pool.update(dt);
    composer.render(dt);
  };
  raf = requestAnimationFrame(frame);

  return {
    setPhase,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      disposeTree(scene);
      envTex.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      // 모바일 브라우저의 WebGL 컨텍스트 수 제한 대비
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
