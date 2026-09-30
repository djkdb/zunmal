/**
 * 신화·시크릿 등장 3D 장면 (three.js + 빛 번짐 후처리).
 * EpicReveal이 동적 import로 불러온다 — 첫 화면 번들에는 포함되지 않는다.
 *
 * 컷 편집은 모두 감독 표(director.ts)가 정한다. 이 모듈은 공유 시계(opts.clock)를 읽어 지금 컷을 찾고,
 * 컷이 바뀌면 무대 세트(배출구·캡슐·혼천의·모티프 세계…)를 갈아 끼우고 카메라를 그 컷의 구도로 옮긴다.
 * 건너뛰기는 시계만 마지막 카드로 옮기면 된다(컷에 들어올 때 그 컷의 끝 상태를 스스로 만든다).
 * 말랑이와 제목은 DOM(SVG)이 이 캔버스 위에 그린다. 화면 위 45%(STAGE_Y) = 세계 원점 (setViewOffset).
 *
 * 성능: 렌더 타깃은 기존 그대로(합성기 두 장 + 빛 번짐), 후처리 패스 하나(방사·가로 흐림 + 색 번짐)는
 * 컷 전환 순간에만 켠다. 입자 풀 2400, 워프 줄 220, 은하 점 4200~5200. 연출 동안만 그린다.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
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
  PointLight,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
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
import {
  IMPLODE_SUCK_MS,
  RING_LOCKS,
  RING_LOCK_MS,
  SUPERNOVA_DELAY,
  cameraAt,
  shakeAt,
  shotAt,
  type Shot,
  type Timeline,
} from './director';
import { STAGE_Y } from './stage';
import type { EpicParticleShape, EpicTheme } from './themes';

export interface EpicScene {
  dispose(): void;
}

export interface EpicSceneOptions {
  theme: EpicTheme;
  timeline: Timeline;
  shiny: boolean;
  /** 타임라인 시각 (ms) — EpicReveal과 같은 시계. 건너뛰면 마지막 카드 시작으로 뛴다 */
  clock(): number;
}

const MAX_PARTICLES = 2400;
const WARP_LINES = 220;

const SHAPE_CODE: Record<EpicParticleShape, number> = { dot: 0, star: 1, ember: 2, heart: 3, shard: 4 };
const RAINBOW = ['#ff8fab', '#ffd23f', '#7ed957', '#5cc8ff', '#b98cff'] as const;
const ARCH_COLORS = ['#ff5f7e', '#ff9f43', '#ffd23f', '#7ed957', '#5cc8ff', '#6b7bff', '#b98cff'] as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

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
    gl_PointSize = clamp(aSize * uPx / -mv.z, 0.0, 160.0);
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
  uniform float uFade;
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
    if (a * vAlpha * uFade < 0.003) discard;
    gl_FragColor = vec4(col * 1.3, a * vAlpha * uFade);
  }
`;

/** 화면 전체 배경: 방사형 그라데이션 + 모티프별로 흐르는 성운 (uSpeed = 흐름 빠르기, uBright = 꿈빛 밝기) */
const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;

const BG_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFlow;
  uniform float uAspect;
  uniform float uStyle;
  uniform float uGlow;
  uniform float uDim;
  uniform float uBright;
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
    float f = uFlow;
    vec2 q;
    if (uStyle < 0.5) {
      float tw = ang + r * 5.0 - f * 0.25;
      q = vec2(cos(tw), sin(tw)) * r * 3.0;
    } else if (uStyle < 1.5) {
      q = vec2(p.x * 2.5, p.y * 1.4 - f * 0.9);
    } else if (uStyle < 2.5) {
      q = vec2(p.x * 1.6 + sin(p.y * 3.0 + t * 0.4) * 0.4, p.y * 4.0 + f * 0.15);
    } else if (uStyle < 3.5) {
      q = vec2(p.x * 2.0 + f * 0.12, p.y * 3.0 + sin(p.x * 4.0 + t * 0.6) * 0.3);
    } else {
      q = vec2(ang * 3.0, r * 2.0 - f * 0.3);
    }
    float n = fbm(q + fbm(q * 0.7 + f * 0.05));
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.95, r));
    vec3 neb = mix(uA, uB, smoothstep(0.3, 0.7, n));
    neb = mix(neb, uC, smoothstep(0.55, 0.85, fbm(q * 1.7 - f * 0.07)));
    float mask = smoothstep(0.35, 0.8, n) * (1.0 - smoothstep(0.35, 1.1, r));
    col += neb * mask * (0.4 + uBright * 0.5);
    // 꿈빛 하늘: 아래에서 올라오는 파스텔 빛
    col = mix(col, mix(uA, vec3(1.0, 0.93, 0.98), 0.35), uBright * smoothstep(0.9, -0.6, vUv.y) * 0.55);
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

/** 불꽃 깃털: 뿌리는 뜨겁고 끝으로 갈수록 붉게, 가장자리는 부드럽게 일렁인다 */
const FEATHER_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSeed;
  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    float y = vUv.y;
    float w = sin(pow(y, 0.75) * 3.14159) * 0.9 + 0.1;
    float wav = sin(y * 14.0 - uTime * 10.0 + uSeed) * 0.08;
    float edge = 1.0 - smoothstep(w * 0.45, w, x + wav);
    vec3 col = mix(uA, uB, smoothstep(0.15, 0.95, y));
    float core = exp(-x * x * 22.0) * smoothstep(0.1, 0.4, y) * (1.0 - y * 0.8);
    col += vec3(1.0, 0.92, 0.7) * core * 0.8;
    float flick = 0.82 + 0.18 * sin(uTime * 13.0 + y * 9.0 + uSeed * 3.0);
    float a = edge * smoothstep(0.08, 0.35, y) * (1.0 - smoothstep(0.8, 1.0, y)) * flick * uOpacity;
    gl_FragColor = vec4(col * 0.85, a);
  }
`;

/** 고래 몸: 등은 깊은 남색, 배는 밝은 물빛 */
const WHALE_VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const WHALE_FRAG = /* glsl */ `
  varying vec2 vP;
  uniform float uOpacity;
  void main() {
    vec3 back = vec3(0.05, 0.12, 0.32);
    vec3 belly = vec3(0.22, 0.45, 0.85);
    float k = smoothstep(0.25, -0.35, vP.y);
    vec3 col = mix(back, belly, k);
    // 배 쪽 주름 줄무늬
    float groove = step(vP.y, -0.12) * (0.5 + 0.5 * sin(vP.y * 90.0)) * 0.18;
    col += groove * vec3(0.4, 0.7, 1.0);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * 전환·폭발용 화면 흐림: 가운데로 빨려 드는 방사 흐림 + 가로 휙 흐림 + 색 번짐 (빛 번짐 뒤, 출력 전).
 * 컷 전환 순간에만 켠다.
 */
const IMPACT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new Vector2(0.5, 1 - STAGE_Y) },
    uZoom: { value: 0 },
    uSplit: { value: 0 },
    uWhip: { value: 0 },
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
    uniform float uWhip;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - uCenter;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        float fi = float(i) / 10.0;
        float s = 1.0 - uZoom * fi;
        vec2 o = vec2(uWhip * (fi - 0.5), 0.0);
        col.r += texture2D(tDiffuse, uCenter + d * s * (1.0 + uSplit) + o).r;
        col.g += texture2D(tDiffuse, uCenter + d * s + o).g;
        col.b += texture2D(tDiffuse, uCenter + d * s * (1.0 - uSplit) + o).b;
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
      uniforms: { uPx: { value: 400 }, uFade: { value: 1 } },
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

  /** 모두 끄기 (컷이 바뀌며 앞 컷의 입자를 치울 때) */
  clear() {
    this.life.fill(0);
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

type GlowMesh = Mesh<PlaneGeometry, ShaderMaterial>;

function glowPlane(color: string, sharp = 4, order = 1): GlowMesh {
  const m = new Mesh(new PlaneGeometry(1, 1), glowMaterial(color, sharp));
  m.renderOrder = order;
  return m;
}

function setOpacity(m: { material: ShaderMaterial }, v: number) {
  m.material.uniforms.uOpacity!.value = v;
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
  return new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.024, 5, false);
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

function pointsMaterial() {
  return new ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: { uPx: { value: 400 }, uFade: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function staticPoints(n: number, fill: (i: number, out: { x: number; y: number; z: number; color: Color; size: number; alpha: number; shape: number }) => void): Points<BufferGeometry, ShaderMaterial> {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const shape = new Float32Array(n);
  const spin = new Float32Array(n);
  const o = { x: 0, y: 0, z: 0, color: new Color(), size: 0.1, alpha: 1, shape: 0 };
  for (let i = 0; i < n; i++) {
    fill(i, o);
    pos[i * 3] = o.x;
    pos[i * 3 + 1] = o.y;
    pos[i * 3 + 2] = o.z;
    col[i * 3] = o.color.r;
    col[i * 3 + 1] = o.color.g;
    col[i * 3 + 2] = o.color.b;
    size[i] = o.size;
    alpha[i] = o.alpha;
    shape[i] = o.shape;
    spin[i] = rand(0, 6);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  g.setAttribute('aShape', new BufferAttribute(shape, 1));
  g.setAttribute('aSpin', new BufferAttribute(spin, 1));
  const p = new Points(g, pointsMaterial());
  p.frustumCulled = false;
  return p;
}

/** 로그 나선 팔 3개짜리 은하 (xy 평면의 원반) */
function makeGalaxy(theme: EpicTheme, n: number) {
  const inner = new Color('#fff3c4');
  return staticPoints(n, (i, o) => {
    const arm = i % 3;
    const t = Math.random() ** 0.7;
    const r = 0.3 + t * 5.2;
    const a = (arm / 3) * Math.PI * 2 + r * 0.9 + rand(-0.35, 0.35) * (1.2 - t);
    o.x = Math.cos(a) * r + rand(-0.2, 0.2);
    o.y = Math.sin(a) * r + rand(-0.2, 0.2);
    o.z = rand(-0.15, 0.15) * (1.2 - t);
    o.color.set(pick(theme.palette)).lerp(inner, 1 - t);
    o.size = rand(0.035, 0.11) * (1.4 - t * 0.6);
    o.alpha = rand(0.3, 0.9) * (0.45 + 0.55 * t);
    o.shape = Math.random() < 0.06 ? 1 : 0;
  });
}

/** 고래 옆모습 (머리가 +x) */
function whaleShape(): Shape {
  const s = new Shape();
  s.moveTo(1.0, -0.02);
  s.bezierCurveTo(1.02, 0.36, 0.55, 0.5, 0.0, 0.38);
  s.bezierCurveTo(-0.45, 0.28, -0.85, 0.14, -1.18, 0.09);
  s.bezierCurveTo(-1.32, 0.2, -1.42, 0.38, -1.56, 0.46);
  s.bezierCurveTo(-1.5, 0.28, -1.44, 0.12, -1.3, 0.03);
  s.bezierCurveTo(-1.46, -0.07, -1.58, -0.26, -1.6, -0.4);
  s.bezierCurveTo(-1.46, -0.3, -1.32, -0.14, -1.17, -0.06);
  s.bezierCurveTo(-0.8, -0.16, -0.3, -0.38, 0.22, -0.36);
  s.bezierCurveTo(0.7, -0.33, 0.98, -0.22, 1.0, -0.02);
  return s;
}

function whaleFin(): Shape {
  const s = new Shape();
  s.moveTo(0.35, -0.22);
  s.bezierCurveTo(0.2, -0.45, 0.05, -0.62, -0.12, -0.7);
  s.bezierCurveTo(0.02, -0.5, 0.12, -0.34, 0.18, -0.2);
  return s;
}

/** 배출구 틀 (가운데 구멍 뚫린 둥근 네모) */
function chuteFrameGeometry(): ExtrudeGeometry {
  const rr = (s: Shape, x: number, y: number, w: number, h: number, r: number) => {
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
  };
  const outer = new Shape();
  rr(outer, -6, -6, 12, 12, 0.6);
  const hole = new Shape();
  rr(hole, -1.4, -1.45, 2.8, 2.95, 0.75);
  outer.holes.push(hole);
  return new ExtrudeGeometry(outer, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 4, curveSegments: 16 });
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
  const { theme, timeline: tl } = opts;
  const secret = tl.tier === 'secret';
  const scale = secret ? 1.25 : 1;
  const motif = theme.motif;

  const canvas = document.createElement('canvas');
  canvas.className = 'epic__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  container.appendChild(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 120);
  // 워프 줄은 카메라에 붙인다 — 어느 구도에서든 화면 안쪽에서 쏟아져 나온다
  scene.add(camera);
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), theme.bloom, 0.5, 0.92);
  composer.addPass(bloom);
  const impact = new ShaderPass(IMPACT_SHADER);
  impact.enabled = false;
  composer.addPass(impact);
  composer.addPass(new OutputPass());

  // ── 배경
  const bgMat = new ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uAspect: { value: 1 },
      uStyle: { value: ['galaxy', 'phoenix', 'rainbow', 'ocean', 'prism'].indexOf(motif) },
      uGlow: { value: 0 },
      uDim: { value: 1 },
      uBright: { value: 0 },
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

  const stage = new Group();
  scene.add(stage);

  // 가장자리를 기어가는 빛 (배출구 클로즈업·혜성)
  const rim = new PointLight(new Color(theme.core), 0, 14, 1.4);
  stage.add(rim);

  /** 카메라를 보는 평면들 (빛 무리·섬광·빛 알갱이) */
  const billboards: Object3D[] = [];
  const bb = <T extends Object3D>(o: T): T => {
    billboards.push(o);
    return o;
  };

  // 뒤쪽 빛 무리, 폭발 섬광, 빛 알갱이(말랑이의 빛)
  const halo = bb(glowPlane(theme.core, 3.5, 1));
  halo.position.z = -1.5;
  stage.add(halo);
  const flash = bb(glowPlane('#ffffff', 2.2, 7));
  flash.position.z = 1;
  stage.add(flash);
  const orb = new Group();
  const orbOuter = bb(glowPlane(theme.core, 3, 6));
  const orbInner = bb(glowPlane('#ffffff', 9, 7));
  orb.add(orbOuter, orbInner);
  stage.add(orb);

  // 광선
  const rays = theme.rays > 0 ? makeRays(Math.round(theme.rays * scale), theme.rayColors, 16, 0.06) : null;
  if (rays) {
    rays.position.z = -2;
    rays.renderOrder = 2;
    stage.add(rays);
  }
  // 역광 광선 (실루엣 컷) — 모든 모티프
  const backRays = makeRays(22, [theme.core, '#ffffff', ...theme.rayColors], 18, 0.05);
  backRays.position.z = -2.5;
  backRays.renderOrder = 2;
  stage.add(backRays);

  // ── 캡슐 (파스텔 + 흰 이음새, 잉크 외곽선 없음)
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
  const topGeo = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const botGeo = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const top = new Group();
  const bot = new Group();
  top.add(new Mesh(topGeo, topMat));
  bot.add(new Mesh(botGeo, botMat));
  const seamMat = new MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1, transparent: true, emissive: new Color('#ffffff'), emissiveIntensity: 0.1 });
  const seam = new Mesh(new TorusGeometry(1.0, 0.06, 12, 64), seamMat);
  seam.rotation.x = Math.PI / 2;
  top.add(seam);
  const shine = new Mesh(new SphereGeometry(0.16, 16, 12), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  shine.scale.set(1.4, 0.7, 0.5);
  shine.position.set(-0.42, 0.62, 0.68);
  top.add(shine);
  capsule.add(top, bot);

  const crackMat = new MeshBasicMaterial({ color: new Color(theme.crack).multiplyScalar(3), transparent: true });
  const cracks: { mesh: Mesh<TubeGeometry, MeshBasicMaterial>; at: number }[] = [];
  const crackCount = secret ? 9 : 7;
  for (let i = 0; i < crackCount; i++) {
    const upper = i < crackCount - 2;
    // 처음 두 금은 카메라 쪽(앞면)에서 시작해 클로즈업에 잘 보이게
    const theta = i < 2 ? rand(-0.35, 0.35) : rand(-1.1, 1.1);
    const y = upper ? rand(0.15, 0.85) : rand(-0.7, -0.15);
    const mesh = new Mesh(crackGeometry(new Vector3(Math.sin(theta), y, Math.cos(theta)), secret ? 9 : 7), crackMat);
    mesh.geometry.setDrawRange(0, 0);
    (upper ? top : bot).add(mesh);
    cracks.push({ mesh, at: i / crackCount });
  }
  /** 0~1: 금이 퍼진 정도 */
  const setCracks = (k: number) => {
    for (const c of cracks) {
      const g = c.mesh.geometry;
      const count = g.index?.count ?? 0;
      const f = clamp01((k - c.at * 0.8) / 0.25);
      g.setDrawRange(0, Math.floor((count * f) / 3) * 3);
    }
  };
  const setCapsuleFade = (a: number) => {
    topMat.opacity = botMat.opacity = crackMat.opacity = seamMat.opacity = a;
    (shine.material as MeshBasicMaterial).opacity = a * 0.85;
  };
  const resetCapsule = () => {
    top.position.set(0, 0, 0);
    top.rotation.set(0, 0, 0);
    bot.position.set(0, 0, 0);
    bot.rotation.set(0, 0, 0);
    setCapsuleFade(1);
  };

  // ── 배출구 세트 (신화 첫 컷): 딸기우유 몸통 틀 + 어두운 속 + 들린 덮개
  const chute = new Group();
  const frameMat = new MeshPhysicalMaterial({ color: '#ff9fb8', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const chuteFrame = new Mesh(chuteFrameGeometry(), frameMat);
  chuteFrame.position.set(0, 0.05, 1.05);
  chute.add(chuteFrame);
  const inside = new Mesh(new PlaneGeometry(9, 9), new MeshPhysicalMaterial({ color: '#1b1026', roughness: 0.8 }));
  inside.position.z = -1.6;
  chute.add(inside);
  const floorMat = new MeshPhysicalMaterial({ color: '#2a1a35', roughness: 0.5, clearcoat: 0.5 });
  const floor = new Mesh(new PlaneGeometry(5, 4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.02, 0);
  chute.add(floor);
  const flap = new Mesh(new PlaneGeometry(4.2, 1.2), new MeshPhysicalMaterial({ color: '#ffd9e4', roughness: 0.4, transparent: true, opacity: 0.85, side: DoubleSide }));
  flap.position.set(0, 1.55, 1.0);
  flap.rotation.x = -1.1;
  chute.add(flap);
  const slit = bb(glowPlane(theme.core, 5, 3));
  slit.scale.set(2.6, 0.4, 1);
  slit.position.set(0, 1.35, 0.4);
  chute.add(slit);
  chute.visible = false;
  stage.add(chute);

  // 충격파 고리
  const makeShock = (color: string, inner = 0.82) => {
    const m = new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { uColor: { value: new Color(color).multiplyScalar(1.6) }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(new RingGeometry(inner, 1, 96, 1), m);
    const uv = mesh.geometry.getAttribute('uv');
    const posA = mesh.geometry.getAttribute('position');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, (Math.hypot(posA.getX(k), posA.getY(k)) - inner) / (1 - inner));
    mesh.visible = false;
    mesh.renderOrder = 6;
    return mesh;
  };
  const shocks = [0, 1, 2].map((i) => {
    const m = makeShock(i === 0 ? '#ffffff' : pick(theme.palette));
    m.rotation.set(rand(-0.5, 0.5), rand(-0.5, 0.5), 0);
    stage.add(m);
    return m;
  });
  const groundRing = makeShock(theme.crack, 0.7);
  groundRing.rotation.x = -Math.PI / 2;
  stage.add(groundRing);

  const pool = new ParticlePool();
  stage.add(pool.points);

  // ── 시크릿: 혼천의 고리·가로 빛줄기·초신성 고리·혜성
  const armillary = new Group();
  const armRings: { ring: Group; mat: MeshBasicMaterial; tilt: [number, number]; spin: number; base: Color }[] = [];
  const TILTS: [number, number][] = [
    [1.15, 0.2],
    [1.15, -1.1],
    [0.35, 1.3],
  ];
  let streak: GlowMesh | null = null;
  const boomRings: Mesh<RingGeometry, ShaderMaterial>[] = [];
  const comet = new Group();
  if (secret) {
    TILTS.forEach((tilt, i) => {
      const ring = new Group();
      const base = new Color(theme.rayColors[i % theme.rayColors.length] ?? '#ffffff').multiplyScalar(1.6);
      const mat = new MeshBasicMaterial({ color: base.clone(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      ring.add(new Mesh(new TorusGeometry(1.75, 0.036, 8, 160), mat));
      for (let k = 0; k < 3; k++) {
        const bead = new Mesh(new SphereGeometry(0.08, 12, 8), mat);
        const a = (k / 3) * Math.PI * 2;
        bead.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0);
        ring.add(bead);
      }
      armillary.add(ring);
      armRings.push({ ring, mat, tilt, spin: (i % 2 ? -1 : 1) * (0.7 + i * 0.25), base });
    });
    armillary.visible = false;
    stage.add(armillary);

    streak = bb(glowPlane('#d8ecff', 3, 8));
    streak.position.z = 1.2;
    stage.add(streak);

    for (let i = 0; i < 2; i++) {
      const mesh = makeShock(RAINBOW[(i * 2) % RAINBOW.length] ?? '#ffffff', 0.7);
      mesh.rotation.set(i ? 0.9 : 0, i ? 0.3 : 0, 0);
      stage.add(mesh);
      boomRings.push(mesh);
    }

    const head = bb(glowPlane('#ffffff', 6, 8));
    head.scale.setScalar(1.4);
    const headGlow = bb(glowPlane(theme.nebula[2], 3, 7));
    headGlow.scale.setScalar(3.2);
    setOpacity(head, 1);
    setOpacity(headGlow, 0.7);
    comet.add(headGlow, head);
    comet.visible = false;
    stage.add(comet);
  }

  // ── 모티프 세계 ──
  const world = new Group();
  world.visible = false;
  stage.add(world);

  // 워프 줄 (은하·고래): 카메라 공간에서 화면 안쪽 → 바깥으로
  let warp: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;
  const warpPos = new Float32Array(WARP_LINES * 6);
  const warpVel = new Float32Array(WARP_LINES);
  const resetWarp = (i: number, anywhere: boolean) => {
    const a = rand(0, Math.PI * 2);
    const r = rand(0.5, 6);
    const z = anywhere ? rand(-50, -3) : rand(-55, -35);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    warpPos.set([x, y, z, x, y, z], i * 6);
    warpVel[i] = rand(20, 36);
  };
  if (motif === 'ocean' || motif === 'galaxy') {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(warpPos, 3).setUsage(DynamicDrawUsage));
    const c = new Color(motif === 'ocean' ? '#bfefff' : '#ffd6f4').multiplyScalar(1.8);
    warp = new LineSegments(g, new LineBasicMaterial({ color: c, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    warp.frustumCulled = false;
    camera.add(warp);
    for (let i = 0; i < WARP_LINES; i++) resetWarp(i, true);
  }

  let galaxy: Points<BufferGeometry, ShaderMaterial> | null = null;
  if (motif === 'galaxy') {
    galaxy = makeGalaxy(theme, secret ? 5200 : 4200);
    world.add(galaxy);
  }

  // 불꽃 날개: 옆마다 깃털 7개가 부채처럼 펼쳐진다
  const feathers: { mesh: Mesh<PlaneGeometry, ShaderMaterial>; side: number; k: number }[] = [];
  const wings = new Group();
  if (motif === 'phoenix') {
    const featherGeo = new PlaneGeometry(0.62, 3.4);
    featherGeo.translate(0, 1.7, 0);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        const mat = new ShaderMaterial({
          vertexShader: GLOW_VERT,
          fragmentShader: FEATHER_FRAG,
          uniforms: {
            uA: { value: new Color('#ffe14d') },
            uB: { value: new Color(k % 2 ? '#ff5a1f' : '#ff2d55') },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
            uSeed: { value: rand(0, 10) },
          },
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          blending: AdditiveBlending,
        });
        const mesh = new Mesh(featherGeo, mat);
        mesh.position.set(side * 0.35, 0.1, -0.9 - k * 0.02);
        mesh.renderOrder = 3;
        wings.add(mesh);
        feathers.push({ mesh, side, k });
      }
    }
    world.add(wings);
  }

  // 무지개 아치 + 구름
  const arches: Mesh<TubeGeometry, MeshBasicMaterial>[] = [];
  const clouds: GlowMesh[] = [];
  if (motif === 'rainbow') {
    ARCH_COLORS.forEach((c, i) => {
      const R = 7.4 - i * 0.34;
      const pts: Vector3[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = Math.PI - (k / 40) * Math.PI;
        pts.push(new Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
      }
      const arc = new Mesh(
        new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.17, 6, false),
        new MeshBasicMaterial({ color: new Color(c).multiplyScalar(1.3), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      );
      arc.geometry.setDrawRange(0, 0);
      arc.renderOrder = 2;
      world.add(arc);
      arches.push(arc);
    });
    for (let i = 0; i < 7; i++) {
      const cl = bb(glowPlane(i % 3 === 0 ? '#ffd6ec' : '#ffffff', 2.2, 1));
      cl.userData = { x: rand(-6, 6), y: rand(-4.2, -2.4), s: rand(3, 5.5), v: rand(-0.3, 0.3) };
      world.add(cl);
      clouds.push(cl);
    }
  }

  // 고래 그림자 + 몸의 별자리
  const whale = new Group();
  let whaleStars: Points<BufferGeometry, ShaderMaterial> | null = null;
  const whaleMats: ShaderMaterial[] = [];
  const ripples: Mesh<RingGeometry, ShaderMaterial>[] = [];
  if (motif === 'ocean') {
    const bodyMat = new ShaderMaterial({ vertexShader: WHALE_VERT, fragmentShader: WHALE_FRAG, uniforms: { uOpacity: { value: 0 } }, transparent: true, depthWrite: false, side: DoubleSide });
    whaleMats.push(bodyMat);
    const body = new Mesh(new ShapeGeometry(whaleShape(), 24), bodyMat);
    const fin = new Mesh(new ShapeGeometry(whaleFin(), 12), bodyMat);
    fin.position.z = 0.01;
    const rimMat = new MeshBasicMaterial({ color: new Color('#7fe0ff').multiplyScalar(1.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const rimBody = new Mesh(body.geometry, rimMat);
    rimBody.scale.setScalar(1.035);
    rimBody.position.z = -0.02;
    whale.add(rimBody, body, fin);
    whaleStars = staticPoints(70, (_i, o) => {
      // 몸 안쪽에 흩뿌린 별 (대략 타원 안)
      let x = 0;
      let y = 0;
      do {
        x = rand(-1.1, 0.95);
        y = rand(-0.3, 0.33);
      } while ((x / 1.1) ** 2 + (y / 0.36) ** 2 > 1);
      o.x = x;
      o.y = y;
      o.z = 0.02;
      o.color.set(pick(['#ffffff', '#bfefff', '#ffe07a']));
      o.size = rand(0.02, 0.05);
      o.alpha = rand(0.5, 1);
      o.shape = Math.random() < 0.25 ? 1 : 0;
    });
    whale.add(whaleStars);
    // 머리가 왼쪽(진행 방향)을 보게
    whale.scale.set(-4.6, 4.6, 4.6);
    whale.visible = false;
    world.add(whale);
    for (let i = 0; i < 4; i++) {
      const r = makeShock('#7fe0ff', 0.9);
      r.rotation.x = -1.25;
      world.add(r);
      ripples.push(r);
    }
  }

  // 수정 조각 + 후광 + 프리즘 광선
  const shards: { mesh: Mesh; orbitR: number; orbitA: number; speed: number; tilt: number }[] = [];
  let haloRing: Mesh<TorusGeometry, MeshBasicMaterial> | null = null;
  let prismBeams: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  if (motif === 'prism') {
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
      world.add(mesh);
      shards.push({ mesh, orbitR: rand(1.8, 2.2), orbitA: (i / n) * Math.PI * 2, speed: rand(0.35, 0.55), tilt: rand(-0.25, 0.25) });
    }
    haloRing = new Mesh(new TorusGeometry(2.45, 0.05, 12, 128), new MeshBasicMaterial({ color: new Color('#ffe07a').multiplyScalar(2.2), transparent: true, opacity: 0 }));
    haloRing.position.set(0, 0.15, -1.2);
    world.add(haloRing);
    prismBeams = makeRays(9, RAINBOW, 22, 0.11);
    prismBeams.position.z = -3;
    prismBeams.renderOrder = 2;
    world.add(prismBeams);
  }

  // ── 폭발 ──
  const burst = (power: number) => {
    const n = Math.round(300 * power);
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1);
      const a = rand(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      let dx = Math.cos(a) * s;
      let dy = u;
      let dz = Math.sin(a) * s;
      if (motif === 'galaxy') dz *= 0.15;
      else if (motif === 'phoenix') dy = Math.abs(dy) * 1.3 + 0.2;
      else if (motif === 'ocean') dy *= 0.35;
      const sp = rand(3, 11) * (Math.random() < 0.2 ? 1.6 : 1);
      pool.spawn({ x: 0, y: 0, z: 0, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: rand(0.9, 2.2), size: rand(0.08, 0.24), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.18, gravity: theme.gravity * 0.6, swirl: theme.swirl, fadeTo: theme.fadeTo });
    }
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(8, 16);
      pool.spawn({ x: 0, y: 0, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(-2, 2), life: rand(0.3, 0.7), size: rand(0.08, 0.16), color: '#ffffff', shape: 'dot', drag: 0.05 });
    }
  };
  const supernova = () => {
    for (let i = 0; i < 260; i++) {
      const u = rand(-1, 1);
      const a = rand(0, Math.PI * 2);
      const s2 = Math.sqrt(1 - u * u);
      const sp = rand(9, 17);
      pool.spawn({ x: 0, y: 0, z: 0, vx: Math.cos(a) * s2 * sp, vy: u * sp, vz: Math.sin(a) * s2 * sp * 0.4, life: rand(1.2, 2.4), size: rand(0.08, 0.2), color: pick([...RAINBOW, '#ffffff']), shape: 'star', drag: 0.12 });
    }
    boomRings.forEach((r) => (r.visible = true));
  };
  const sparkle = (x: number, y: number, z: number, n: number, colors: readonly string[], speed = 3) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.4, 1) * speed;
      pool.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(-1, 1), life: rand(0.4, 0.9), size: rand(0.1, 0.22), color: pick(colors), shape: Math.random() < 0.5 ? 'star' : 'dot', drag: 0.25 });
    }
  };

  // 모티프별 지속 방출 (세계 컷·말랑이 등장 이후)
  const emitAmbient = (calm: boolean) => {
    if (opts.shiny && Math.random() < 0.5) {
      const a = rand(0, Math.PI * 2);
      pool.spawn({ x: Math.cos(a) * 1.6, y: Math.sin(a) * 1.8, z: 0.5, vx: -Math.sin(a) * 1.5, vy: Math.cos(a) * 1.5, vz: 0, life: 1.2, size: rand(0.18, 0.3), color: pick(RAINBOW), shape: 'star', drag: 0.9 });
    }
    if (motif === 'phoenix') {
      for (const f of feathers) {
        if (Math.random() > 0.35) continue;
        const u = rand(0.35, 1);
        const a = f.mesh.rotation.z + Math.PI / 2;
        const len = 3.4 * f.mesh.scale.y * u;
        pool.spawn({ x: f.mesh.position.x + Math.cos(a) * len, y: f.mesh.position.y + Math.sin(a) * len, z: -0.7, vx: rand(-0.3, 0.3), vy: rand(0.6, 1.8), vz: 0, life: rand(0.5, 1.1), size: rand(0.14, 0.3), color: pick(theme.palette), shape: 'ember', drag: 0.5, gravity: -1.5, fadeTo: theme.fadeTo });
      }
      if (!calm) {
        // 솟구치는 느낌: 위에서 쏟아져 내려오는 불씨 (상대 운동)
        for (let k = 0; k < 6; k++) {
          pool.spawn({ x: rand(-5, 5), y: rand(5, 8), z: rand(-3, 2), vx: rand(-0.3, 0.3), vy: rand(-14, -8), vz: 0, life: rand(0.8, 1.3), size: rand(0.16, 0.34), color: pick(theme.palette), shape: 'ember', drag: 0.9, fadeTo: theme.fadeTo });
        }
      } else {
        for (let k = 0; k < 2; k++) {
          pool.spawn({ x: rand(-5, 5), y: rand(-6, -3), z: rand(-2, 1), vx: rand(-0.3, 0.3), vy: rand(1.5, 3.5), vz: 0, life: rand(1.8, 3), size: rand(0.06, 0.14), color: pick(theme.palette), shape: 'ember', drag: 0.8, gravity: -0.6, fadeTo: theme.fadeTo });
        }
      }
    } else if (motif === 'rainbow') {
      for (let k = 0; k < (calm ? 2 : 4); k++) {
        pool.spawn({ x: rand(-4.5, 4.5), y: rand(-5, -2.5), z: rand(-1.5, 1), vx: rand(-0.2, 0.2), vy: rand(0.8, 1.8), vz: 0, life: rand(2.5, 4), size: rand(0.24, 0.46), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9, gravity: -0.1, swirl: 0.05 });
      }
    } else if (motif === 'ocean') {
      if (calm) {
        for (let k = 0; k < 4; k++) {
          pool.spawn({ x: rand(-0.1, 0.1), y: 1.6, z: 0, vx: rand(-1.3, 1.3), vy: rand(5.5, 7.5), vz: rand(-0.5, 0.5), life: rand(1.4, 2.2), size: rand(0.12, 0.26), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.85, gravity: 7 });
        }
      }
    } else if (motif === 'prism') {
      for (let k = 0; k < 2; k++) {
        pool.spawn({ x: rand(-4.5, 4.5), y: rand(3, 6), z: rand(-2, 1), vx: rand(-0.2, 0.2), vy: rand(-1.4, -0.6), vz: 0, life: rand(2, 3.5), size: rand(0.14, 0.28), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9 });
      }
    } else {
      for (let k = 0; k < (calm ? 2 : 3); k++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(1.5, 4.5);
        pool.spawn({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.45, z: rand(-1, 1), vx: -Math.sin(a) * 1.2, vy: Math.cos(a) * 0.5, vz: 0, life: rand(1.5, 2.8), size: rand(0.12, 0.26), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.95 });
      }
    }
  };

  // ── 상태 ──
  let shotIndex = -1;
  let shot: Shot = tl.shots[0]!;
  let local = 0;
  let prevLocal = 0;
  const fired = new Set<string>();
  /** 이 컷의 이 시점을 처음 지나는 순간 한 번 */
  const once = (key: string, atMs: number) => {
    if (local < atMs || fired.has(key)) return false;
    fired.add(key);
    // 건너뛰어 컷 한가운데로 들어온 경우엔 폭발류를 다시 터뜨리지 않는다
    return prevLocal <= atMs || local - atMs < 120;
  };
  let spawnAcc = 0;
  let last = performance.now();
  let raf = 0;
  let width = 1;
  let height = 1;
  let manualShake = 0;

  const resize = () => {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    // 목표점(세계 원점)이 화면 위 45%에 오도록 투영 중심을 옮긴다 — 어느 구도에서든 DOM 말랑이와 맞다
    camera.setViewOffset(width, height, 0, (0.5 - STAGE_Y) * height, width, height);
    camera.updateProjectionMatrix();
    bgMat.uniforms.uAspect!.value = width / height;
  };
  resize();
  window.addEventListener('resize', resize);

  /** 세계의 모드: 컷이 바뀔 때 모티프 장치를 그 컷에 맞게 놓는다 */
  const placeWorld = (mode: 'travel' | 'calm' | 'backlight') => {
    world.visible = true;
    if (galaxy) {
      if (mode === 'travel') {
        // 위에서 내려다보는 원반 (카메라가 위에서 파고든다)
        galaxy.rotation.set(-Math.PI / 2, 0, 0);
        galaxy.position.set(0, -0.4, 0);
        galaxy.scale.setScalar(1.4);
      } else {
        galaxy.rotation.set(-1.05, 0, 0);
        galaxy.position.set(0, 0, -2.5);
        galaxy.scale.setScalar(scale);
      }
    }
    whale.visible = mode === 'travel';
    for (const r of ripples) r.visible = mode === 'calm';
  };

  const enter = (s: Shot, from: number) => {
    fired.clear();
    const id = s.id;
    // 세트 갈아 끼우기
    chute.visible = id === 'chute';
    capsule.visible = s.capsule;
    armillary.visible = secret && (id === 'rings' || id === 'implode' || id === 'supernova' || id === 'title');
    comet.visible = id === 'comet';
    world.visible = s.world;
    if (s.world) placeWorld(id === 'world' ? 'travel' : id === 'silhouette' ? 'backlight' : 'calm');
    for (const m of shocks) m.visible = false;
    groundRing.visible = false;
    boomRings.forEach((r) => (r.visible = false));
    if (streak) setOpacity(streak, 0);
    // 딱 끊는 컷은 앞 컷의 입자를 치운다 (진짜 컷처럼)
    if (s.transitionIn !== 'none' && from >= 0) pool.clear();
    if (id === 'chute' || id === 'rise' || id === 'comet' || id === 'rings') resetCapsule();
    if (id === 'burst' || id === 'supernova') {
      for (const m of shocks) {
        m.visible = true;
        m.scale.setScalar(0.5);
      }
    }
    // 건너뛰어 마지막 카드로 바로 온 경우: 입자 몇 개로 장면을 채워 둔다
    if (id === 'title' && from >= 0 && from < tl.shots.length - 2) {
      for (let i = 0; i < 40; i++) emitAmbient(true);
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const tMs = Math.max(0, opts.clock());
    const t = tMs / 1000;
    const at = shotAt(tl, tMs);
    if (at.index !== shotIndex) {
      const from = shotIndex;
      shotIndex = at.index;
      shot = at.shot;
      prevLocal = 0;
      local = at.local;
      enter(shot, from);
    }
    prevLocal = local;
    local = at.local;
    const p = at.progress;
    const id = shot.id;
    bgMat.uniforms.uTime!.value = t;

    // ── 카메라 (감독 표의 구도 + 전환)
    const pose = cameraAt(shot.camera, p);
    const whipK = shot.transitionIn === 'whip' ? Math.exp(-local / 70) : 0;
    const zoomK = shot.transitionIn === 'zoom' ? Math.exp(-local / 140) : 0;
    const yaw = pose.yaw + whipK * 0.9;
    const dist = pose.dist * (1 - zoomK * 0.45);
    const shake = shakeAt(shot.camera, local) + manualShake;
    manualShake *= Math.exp(-dt * 7);
    const cp = Math.cos(pose.pitch);
    camera.position.set(
      dist * cp * Math.sin(yaw) + rand(-shake, shake) * 0.5,
      pose.lift + dist * Math.sin(pose.pitch) + rand(-shake, shake) * 0.5,
      dist * cp * Math.cos(yaw),
    );
    camera.lookAt(0, pose.lift, 0);
    camera.rotateZ(pose.roll);
    camera.fov = pose.fov + shake * 10 + zoomK * 18;
    camera.updateProjectionMatrix();
    const px = (height * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    pool.material.uniforms.uPx!.value = px;
    if (galaxy) galaxy.material.uniforms.uPx!.value = px;
    if (whaleStars) whaleStars.material.uniforms.uPx!.value = px;
    for (const o of billboards) o.quaternion.copy(camera.quaternion);

    // 화면 흐림 (전환 순간·폭발)
    let blurZoom = zoomK * 0.3;
    let blurSplit = zoomK * 0.012;
    const blurWhip = whipK * 0.09;

    // 기본값 (컷마다 덮어쓴다)
    let dim = 0;
    let glow = 0.12;
    let bright = 0;
    let flow = t;
    let envI = 0.45;
    let bloomK = 0.9;
    let rimI = 0;
    let haloO = 0;
    let haloS = 5 * scale;
    let orbO = 0;
    let orbS = 1;
    let raysTarget = 0;
    let backRaysTarget = 0;
    let flashO = 0;
    let ambient = false;
    let calm = true;

    switch (id) {
      case 'chute': {
        // 어두운 배출구 속: 가장자리 빛이 캡슐 둘레를 기어가고 앞면 금이 테마 색으로 달아오른다
        dim = 0.94;
        envI = 0.28;
        bloomK = 0.75;
        capsule.position.set(0, -0.05 + Math.sin(t * 2.2) * 0.03, 0);
        capsule.scale.setScalar(1.0);
        capsule.rotation.set(0.12, -0.35 + p * 0.25, Math.sin(t * 3) * 0.02 * p);
        const a = -1.3 + easeInOut(p) * 2.6;
        rim.position.set(Math.sin(a) * 2.1, 1.1 + Math.cos(a) * 0.9, -1.1);
        rimI = 16;
        setCracks(p * 0.32);
        topMat.emissiveIntensity = 0.02 + p * 0.12;
        botMat.emissiveIntensity = 0.01 + p * 0.06;
        haloO = 0.08 + p * 0.12;
        haloS = 3.2;
        setOpacity(slit, 0.35 + Math.sin(t * 7) * 0.05 + p * 0.3);
        flap.rotation.x = -1.1 - Math.sin(p * Math.PI) * 0.08;
        if (Math.random() < 0.3) {
          pool.spawn({ x: rand(-1.8, 1.8), y: rand(0.4, 1.6), z: rand(-0.5, 1), vx: rand(-0.05, 0.05), vy: rand(-0.25, -0.1), vz: 0, life: rand(1, 1.6), size: rand(0.03, 0.06), color: theme.crack, shape: 'dot', drag: 1 });
        }
        break;
      }
      case 'rise': {
        // 넓게: 캡슐이 떠올라 빠르게 돌고, 빛가루가 소용돌이치며 빨려 든다
        dim = 0.55 - p * 0.3;
        glow = p * p * 0.3;
        bloomK = 0.7 + p * 0.5;
        const up = easeOut(p * 1.5);
        const tremble = p ** 2 * 0.07;
        capsule.position.set(rand(-tremble, tremble), -3.4 * (1 - up) + Math.sin(t * 2) * 0.1, rand(-tremble, tremble));
        capsule.scale.setScalar(1.35 * (1 + p * 0.08));
        capsule.rotation.set(0.1, t * (2 + p * 9), Math.sin(t * 3) * 0.14);
        setCracks(0.32 + p * 0.68);
        topMat.emissiveIntensity = 0.1 + p ** 2 * 0.65;
        botMat.emissiveIntensity = 0.05 + p ** 2 * 0.35;
        rim.position.set(0, 1.5, -1.5);
        rimI = 10;
        haloO = 0.1 + p ** 2 * 0.5;
        haloS = 2.5 + p ** 2 * 3;
        spawnAcc += dt;
        while (spawnAcc > 0.016) {
          spawnAcc -= 0.016;
          const n = Math.round(2 + p * 6);
          for (let i = 0; i < n; i++) {
            const ang = rand(0, Math.PI * 2);
            const r = rand(5, 9);
            const x = Math.cos(ang) * r;
            const y = Math.sin(ang) * r;
            const z = rand(-3, 2);
            const sp = rand(0.9, 1.3);
            const tan = 1.3 + theme.swirl;
            pool.spawn({ x, y, z, vx: (-x - y * tan) * sp, vy: (-y + x * tan) * sp, vz: -z * sp, life: 0.9, size: rand(0.07, 0.18), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9 });
          }
        }
        break;
      }
      case 'burst':
      case 'supernova': {
        const sb = local / 1000;
        if (once('burst', 0)) {
          burst(scale);
          if (id === 'supernova') manualShake = 0.2;
        }
        if (id === 'supernova' && once('nova', SUPERNOVA_DELAY)) {
          supernova();
          manualShake = 0.7;
        }
        // 캡슐 반쪽이 날아가며 사라진다
        const k = easeOut(sb / 0.9);
        capsule.visible = id === 'burst' && sb < 1;
        top.position.set(-k * 2.4, k * 3.4, -k * 2.5);
        top.rotation.set(-k * 2.2, 0, k * 1.4);
        bot.position.set(k * 2.2, -k * 3.2, -k * 2.5);
        bot.rotation.set(k * 2, 0, -k * 1.1);
        setCapsuleFade(1 - clamp01(sb / 0.45));
        const f = Math.exp(-sb * 6);
        flashO = f * (secret ? 0.5 : 1.1);
        flash.scale.setScalar(4 + sb * (secret ? 14 : 30));
        haloO = 0.2 + f * 0.4;
        glow = 0.12 + f * (secret ? 0.35 : 0.8);
        bloomK = 0.85 + f * 0.8;
        orbO = clamp01(sb * 3) * 0.9;
        orbS = 1.2 + sb * 1.5;
        for (const [i, m] of shocks.entries()) {
          const kk = clamp01((sb - i * 0.09) / 1.1);
          m.scale.setScalar(0.5 + easeOut(kk) * 13 * scale);
          setOpacity(m, kk > 0 ? (1 - kk) ** 1.5 * 1.6 : 0);
        }
        blurZoom += Math.exp(-sb * 4) * 0.13;
        blurSplit += Math.exp(-sb * 4) * 0.018;
        if (id === 'supernova') {
          const sb2 = Math.max(0, sb - SUPERNOVA_DELAY / 1000);
          const nova = local >= SUPERNOVA_DELAY ? Math.exp(-sb2 * 5) : 0;
          blurZoom += nova * 0.1;
          blurSplit += nova * 0.02;
          glow += nova * 0.25;
          bloomK += nova * 0.3;
          if (streak) {
            const sf = Math.exp(-sb * 1.6);
            streak.scale.set(6 + sb * 20, 0.28 * sf + 0.02, 1);
            setOpacity(streak, sf * 0.9);
          }
          boomRings.forEach((r, i) => {
            const kk = clamp01((sb2 - i * 0.08) / 1.3);
            r.scale.setScalar(0.3 + easeOut(kk) * 16);
            setOpacity(r, local >= SUPERNOVA_DELAY ? (1 - kk) ** 2 * 1.1 : 0);
          });
          // 수축했던 고리가 부서지듯 퍼지며 사라진다
          armillary.scale.setScalar(0.1 + easeOut(sb / 0.7) * 4);
          for (const r of armRings) r.mat.opacity = (1 - clamp01(sb / 0.6)) * 0.9;
        }
        ambient = sb > 0.3;
        calm = false;
        break;
      }
      case 'world': {
        // 말랑이마다 하나뿐인 세계 — 빛 알갱이(말랑이의 빛)를 따라간다
        calm = false;
        ambient = true;
        dim = 0;
        glow = 0.25;
        bloomK = 1.05;
        flow = t * (motif === 'phoenix' ? 3.2 : 1.6);
        orbO = 0.6 + Math.sin(t * 6) * 0.06;
        orbS = 0.9;
        haloO = 0.3;
        haloS = 4;
        if (galaxy) {
          galaxy.rotation.z = -t * 0.5;
        }
        if (motif === 'phoenix') {
          dim = 0.35;
          glow = 0.1;
          orbS = 0.9;
          const unfold = easeOut((p - 0.25) / 0.55);
          placeFeathers(unfold, t);
        }
        if (motif === 'rainbow') {
          bright = 0.6 * easeOut(p * 2);
          dim = 0;
          setArches(p * 1.35 - 0.1, 1);
          moveClouds(t, 1);
        }
        if (motif === 'ocean') {
          // 고래가 오른쪽에서 왼쪽으로 지나간다 (몸의 별자리와 함께)
          const x = 13 - easeInOut(p) * 26;
          whale.position.set(x, 1.2 + Math.sin(p * Math.PI * 2) * 0.35, -5);
          whale.rotation.z = Math.sin(t * 2.4) * 0.05;
          const wo = clamp01(p * 5) * clamp01((1 - p) * 5);
          for (const m of whaleMats) m.uniforms.uOpacity!.value = wo * 0.95;
          const rimM = (whale.children[0] as Mesh<ShapeGeometry, MeshBasicMaterial>).material;
          rimM.opacity = wo * 0.6;
          if (whaleStars) setAlphaAll(whaleStars, wo);
          // 머리 위 숨구멍에서 별 물줄기
          if (p > 0.42 && p < 0.72) {
            for (let k = 0; k < 5; k++) {
              pool.spawn({ x: x - 2.4, y: whale.position.y + 2, z: -5, vx: rand(-1.4, 1.4), vy: rand(6, 9), vz: rand(-0.5, 0.5), life: rand(1, 1.6), size: rand(0.14, 0.3), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.85, gravity: 8 });
            }
          }
        }
        if (motif === 'prism') {
          dim = 0.3;
          const k = easeOut(p / 0.6);
          placeShards(k, t);
          if (haloRing) {
            haloRing.material.opacity = k;
            haloRing.scale.setScalar(0.5 + k * 0.5);
            haloRing.rotation.z = t * 0.6;
          }
          if (prismBeams) {
            prismBeams.rotation.z = -0.6 + p * 1.4;
            setOpacity(prismBeams, 0.12 + k * 0.3);
          }
        }
        break;
      }
      case 'hero': {
        // 휙 돌려 정면: 빛 알갱이가 터지며 말랑이가 떨어져 내려와 착지
        const land = 380;
        orbO = local < land ? 0.9 : 0.9 * Math.exp(-(local - land) / 90);
        orbS = 1.3 + clamp01(local / land) * 0.8;
        if (once('land', land)) {
          groundRing.visible = true;
          sparkle(0, -1.2, 0.3, 40, [...theme.palette, '#ffffff'], 4);
        }
        const g = clamp01((local - land) / 900);
        groundRing.position.set(0, -1.25, 0);
        groundRing.scale.setScalar(0.4 + easeOut(g) * 4.5);
        setOpacity(groundRing, local >= land ? (1 - g) * 1.2 : 0);
        haloO = 0.25;
        raysTarget = 0.5;
        ambient = true;
        calm = true;
        calmWorld(t, 1);
        if (motif === 'phoenix' || motif === 'prism') dim = 0.3;
        break;
      }
      case 'title': {
        haloO = 0.22;
        raysTarget = motif === 'prism' ? 0.35 : 0.5;
        ambient = true;
        calm = true;
        calmWorld(t, 1);
        if (motif === 'phoenix' || motif === 'prism') dim = 0.3;
        if (secret) {
          // 고리가 한 걸음 물러난 말랑이를 두르고 제자리에 선다
          const k = easeOut(local / 700);
          armillary.scale.setScalar(1.7 - k * 0.62);
          armillary.rotation.y = t * 0.35;
          for (const r of armRings) {
            r.ring.visible = true;
            r.ring.scale.setScalar(1);
            r.ring.rotation.set(r.tilt[0], r.tilt[1], r.ring.rotation.z + dt * r.spin * 0.6);
            r.mat.opacity = k * 0.85;
            r.mat.color.copy(r.base);
          }
        }
        break;
      }
      case 'omen': {
        // 암전: 먼 별 하나가 반짝인다
        dim = 1;
        bloomK = 0.9;
        const tw = 0.5 + Math.sin(t * 9) * 0.2 + p * 0.25;
        if (Math.random() < 0.6) {
          pool.spawn({ x: 0.9, y: 2.5, z: -1, vx: 0, vy: 0, vz: 0, life: 0.22, size: 0.35 + tw * 0.5, color: '#ffffff', shape: 'star', drag: 1 });
        }
        break;
      }
      case 'comet': {
        // 별이 혜성이 되어 캡슐로 떨어진다 → 쾅
        dim = 0.9;
        bloomK = 0.7;
        envI = 0.12;
        const landAt = 760;
        const k = clamp01(local / landAt);
        const e = k * k;
        const cx = 2.8 * (1 - e);
        const cy = 7 * (1 - e);
        comet.visible = local < landAt;
        comet.position.set(cx, cy, 0.4);
        if (local < landAt) {
          for (let i = 0; i < 6; i++) {
            pool.spawn({ x: cx + rand(-0.12, 0.12), y: cy + rand(-0.1, 0.2), z: rand(-0.2, 0.4), vx: rand(-0.4, 0.4) + 1.2, vy: rand(1, 3), vz: 0, life: rand(0.3, 0.7), size: rand(0.1, 0.28), color: pick([theme.core, '#ffffff', ...theme.palette]), shape: i % 2 ? 'star' : 'dot', drag: 0.3 });
          }
        }
        capsule.position.set(0, 0, 0);
        capsule.scale.setScalar(1.05);
        capsule.rotation.set(0.1, t * 0.6, 0);
        rim.position.set(cx * 0.6, Math.max(1.2, cy * 0.6), 1.5);
        rimI = local < landAt ? 6 + k * 14 : 8;
        const after = Math.max(0, local - landAt) / 1000;
        topMat.emissiveIntensity = local < landAt ? k * 0.2 : 0.2 + Math.exp(-after * 5) * 0.7;
        botMat.emissiveIntensity = topMat.emissiveIntensity * 0.5;
        haloO = local < landAt ? k * 0.2 : 0.2 + Math.exp(-after * 6) * 0.8;
        haloS = 3.5;
        setCracks(local < landAt ? 0 : 0.12);
        if (once('land', landAt)) {
          manualShake = 0.35;
          groundRing.visible = true;
          for (let i = 0; i < 70; i++) {
            const a = rand(0, Math.PI * 2);
            pool.spawn({ x: 0, y: -1.25, z: 0, vx: Math.cos(a) * rand(2, 5), vy: rand(0, 1), vz: Math.sin(a) * rand(2, 5), life: rand(0.5, 0.9), size: rand(0.08, 0.18), color: pick(theme.palette), shape: 'dot', drag: 0.2 });
          }
        }
        const g = clamp01(after / 0.5);
        groundRing.position.set(0, -1.3, 0);
        groundRing.scale.setScalar(0.5 + easeOut(g) * 6);
        setOpacity(groundRing, local >= landAt ? (1 - g) * 1.5 : 0);
        break;
      }
      case 'rings': {
        // 올려다보는 구도: 고리가 하나씩 날아와 딸깍 잠기고, 캡슐이 떨며 금이 번진다
        dim = 0.82 - p * 0.2;
        glow = p * 0.2;
        envI = 0.16;
        bloomK = 0.55 + p * 0.3;
        const tremble = p ** 2 * 0.08;
        capsule.position.set(rand(-tremble, tremble), rand(-tremble, tremble), 0);
        capsule.scale.setScalar(1.05);
        capsule.rotation.set(0.1, t * (0.8 + p * 4), Math.sin(t * 3) * 0.1);
        setCracks(0.12 + p * 0.88);
        topMat.emissiveIntensity = 0.15 + p ** 2 * 0.6;
        botMat.emissiveIntensity = 0.08 + p ** 2 * 0.3;
        rim.position.set(0, -2, 1.5);
        rimI = 4 + p * 6;
        haloO = 0.08 + p ** 2 * 0.4;
        haloS = 2.5 + p * 2.5;
        armillary.scale.setScalar(1);
        armillary.rotation.y = t * 0.35;
        armRings.forEach((r, i) => {
          const lockAt = RING_LOCKS[i] ?? 0;
          const k = clamp01((local - (lockAt - RING_LOCK_MS)) / RING_LOCK_MS);
          const e = easeOut(k);
          r.ring.visible = k > 0;
          // 크게 빙글빙글 돌며 날아와 자기 기울기에 딱 멈춘다
          r.ring.scale.setScalar(2.8 - e * 1.8);
          const spinIn = (1 - e) * 6;
          r.ring.rotation.set(r.tilt[0] + spinIn * 0.6, r.tilt[1] + spinIn, r.ring.rotation.z + dt * r.spin * (1 + p * 2));
          const pulse = local >= lockAt ? Math.exp(-(local - lockAt) / 140) : 0;
          r.mat.opacity = e * 0.9;
          r.mat.color.copy(r.base).multiplyScalar(1 + pulse * 1.8);
          if (once(`lock${i}`, lockAt)) {
            manualShake = 0.12;
            const beadR = 1.75;
            for (let b = 0; b < 3; b++) {
              const v = new Vector3(Math.cos((b / 3) * Math.PI * 2) * beadR, Math.sin((b / 3) * Math.PI * 2) * beadR, 0).applyEuler(r.ring.rotation);
              sparkle(v.x, v.y, v.z, 12, ['#ffffff', ...theme.rayColors], 2.5);
            }
          }
        });
        // 셋째 고리가 잠기면 사방에서 빛이 빨려 든다
        if (local > (RING_LOCKS[2] ?? 0) - 100) {
          spawnAcc += dt;
          while (spawnAcc > 0.016) {
            spawnAcc -= 0.016;
            for (let i = 0; i < 3; i++) {
              const ang = rand(0, Math.PI * 2);
              const r = rand(5, 9);
              const x = Math.cos(ang) * r;
              const y = Math.sin(ang) * r;
              pool.spawn({ x, y, z: rand(-2, 2), vx: -x * 1.1 - y * 0.8, vy: -y * 1.1 + x * 0.8, vz: 0, life: 0.85, size: rand(0.05, 0.12), color: pick(theme.palette), shape: pick(theme.shapes), drag: 0.9 });
            }
          }
        }
        break;
      }
      case 'implode': {
        // 모든 빛이 한 점으로 → 무음 속 바늘 끝 같은 빛 하나
        const k = clamp01(local / IMPLODE_SUCK_MS);
        const silent = local >= IMPLODE_SUCK_MS;
        dim = 0.75 + k * 0.25;
        bloomK = silent ? 0.7 : 0.9 + k * 0.8;
        capsule.visible = !silent;
        capsule.scale.setScalar(1.05 * (1 - k * k * 0.92));
        capsule.rotation.y = t * 12;
        topMat.emissiveIntensity = botMat.emissiveIntensity = 0.6 + k * 2.4;
        armillary.scale.setScalar(Math.max(0.05, 1 - easeOut(k) * 0.95));
        for (const r of armRings) {
          r.ring.rotation.z += dt * r.spin * 10;
          r.mat.opacity = silent ? 0 : 0.9;
        }
        haloO = silent ? 0.7 + Math.sin(t * 40) * 0.1 : 0.4 + k * 0.6;
        haloS = silent ? 0.35 : 4 * (1 - k * 0.85);
        if (!silent) {
          blurZoom += k * 0.14;
          blurSplit += k * 0.005;
          for (let i = 0; i < 10; i++) {
            const ang = rand(0, Math.PI * 2);
            const r = rand(3, 7);
            const x = Math.cos(ang) * r;
            const y = Math.sin(ang) * r;
            pool.spawn({ x, y, z: 0, vx: -x * 3.2, vy: -y * 3.2, vz: 0, life: 0.3, size: rand(0.06, 0.14), color: '#ffffff', shape: 'dot', drag: 1 });
          }
        } else if (once('silence', IMPLODE_SUCK_MS)) {
          pool.clear();
        }
        break;
      }
      case 'silhouette': {
        // 역광 클로즈업: 뒤에서 쏟아지는 빛 속 실루엣 → 색이 번질 때 반짝
        dim = 0.35;
        glow = 0.6;
        bloomK = 1.15;
        haloO = 0.95;
        haloS = 7;
        backRaysTarget = 0.85;
        ambient = true;
        calmWorld(t, 0.6);
        if (once('color', 380)) sparkle(0, 0, 0.8, 70, [...theme.palette, '#ffffff'], 6);
        break;
      }
    }

    // 세계 컷 이외엔 워프를 느리게
    if (warp) {
      const travel = id === 'world';
      const speed = travel ? 1.8 + p * 1.2 : shot.world ? 0.12 : 0;
      warp.visible = speed > 0;
      for (let i = 0; i < WARP_LINES; i++) {
        const o = i * 6;
        const z = (warpPos[o + 2] ?? 0) + (warpVel[i] ?? 0) * speed * dt;
        if (z > -1) {
          resetWarp(i, false);
          continue;
        }
        warpPos[o + 2] = z;
        warpPos[o + 5] = z - (warpVel[i] ?? 0) * speed * 0.07;
      }
      warp.geometry.getAttribute('position').needsUpdate = true;
      warp.material.opacity = travel ? 0.9 : 0.3;
    }

    bgMat.uniforms.uDim!.value = dim;
    bgMat.uniforms.uGlow!.value = glow;
    bgMat.uniforms.uBright!.value = bright || (motif === 'rainbow' && shot.world && id !== 'world' ? 0.45 : 0);
    bgMat.uniforms.uFlow!.value = flow;
    scene.environmentIntensity = envI;
    bloom.strength = theme.bloom * bloomK;
    rim.intensity = rimI;
    setOpacity(halo, haloO * 0.45);
    halo.scale.setScalar(haloS + Math.sin(t * 2) * 0.2);
    setOpacity(flash, flashO);
    setOpacity(orbOuter, orbO * 0.8);
    setOpacity(orbInner, orbO);
    orbOuter.scale.setScalar(orbS * 2.6);
    orbInner.scale.setScalar(orbS * (1 + Math.sin(t * 9) * 0.05));
    orb.visible = orbO > 0.01;
    if (rays) {
      rays.rotation.z = t * (motif === 'prism' ? 0.12 : 0.2);
      const u = rays.material.uniforms.uOpacity!;
      u.value += (raysTarget - u.value) * Math.min(1, dt * 4);
    }
    {
      backRays.rotation.z = -t * 0.15;
      const u = backRays.material.uniforms.uOpacity!;
      u.value = id === 'silhouette' ? backRaysTarget * clamp01(local / 150) : u.value * Math.exp(-dt * 8);
    }
    if (ambient) {
      spawnAcc += dt;
      while (spawnAcc > 0.033) {
        spawnAcc -= 0.033;
        emitAmbient(calm);
      }
    }

    impact.enabled = blurZoom > 0.002 || blurWhip > 0.002;
    impact.uniforms.uZoom!.value = blurZoom;
    impact.uniforms.uSplit!.value = blurSplit;
    impact.uniforms.uWhip!.value = blurWhip;

    pool.update(dt);
    composer.render(dt);
  };

  // ── 모티프 장치 배치 도우미 ──
  function placeFeathers(unfold: number, t: number) {
    for (const f of feathers) {
      const spread = f.side * (0.3 + f.k * 0.27);
      const folded = f.side * 0.08;
      const flap = Math.sin(t * 5 + f.k * 0.3) * 0.06 * unfold;
      f.mesh.rotation.z = -(folded + (spread - folded) * unfold) - f.side * flap;
      f.mesh.scale.set(1, 0.25 + unfold * (0.8 - Math.abs(f.k - 3) * 0.04), 1);
      const m = f.mesh.material;
      m.uniforms.uOpacity!.value = 0.12 + unfold * 0.6;
      m.uniforms.uTime!.value = t;
    }
  }
  function setArches(k: number, alpha: number) {
    arches.forEach((arc, i) => {
      const d = clamp01(k * 1.2 - i * 0.05);
      const count = arc.geometry.index?.count ?? 0;
      const seg = 6 * 6;
      arc.geometry.setDrawRange(0, Math.floor((count * d) / seg) * seg);
      arc.material.opacity = alpha * 0.85;
      arc.position.set(0, -4.2, -3.5);
    });
  }
  function moveClouds(t: number, alpha: number) {
    for (const c of clouds) {
      const u = c.userData as { x: number; y: number; s: number; v: number };
      c.position.set(u.x + Math.sin(t * 0.3 + u.s) * 0.4 + u.v * t, u.y, -1.5);
      c.scale.set(u.s * 1.6, u.s * 0.7, 1);
      setOpacity(c, 0.28 * alpha);
    }
  }
  function placeShards(k: number, t: number) {
    for (const s of shards) {
      const a = s.orbitA + t * s.speed;
      const target = new Vector3(Math.cos(a) * s.orbitR, Math.sin(a) * s.orbitR * 1.25 + s.tilt, Math.sin(a + 1.2) * 0.8);
      s.mesh.position.copy(target.multiplyScalar(0.15 + k * 0.85));
      s.mesh.rotation.y = t * 1.5 + s.orbitA;
      s.mesh.rotation.z = Math.sin(t + s.orbitA) * 0.4;
    }
  }
  function setAlphaAll(pts: Points<BufferGeometry, ShaderMaterial>, a: number) {
    pts.material.uniforms.uFade!.value = a;
  }
  /** 말랑이 뒤의 차분한 세계 */
  function calmWorld(t: number, alpha: number) {
    if (galaxy) {
      galaxy.rotation.z = -t * 0.35;
    }
    if (motif === 'phoenix') placeFeathers(alpha, t);
    if (motif === 'rainbow') {
      setArches(1, alpha * 0.8);
      moveClouds(t, alpha);
      arches.forEach((a) => a.scale.setScalar(0.75));
    }
    if (motif === 'ocean') {
      ripples.forEach((r, i) => {
        const cyc = (((t * 0.55 + i / ripples.length) % 1) + 1) % 1;
        r.visible = true;
        r.position.y = -1.6;
        r.scale.setScalar(0.6 + cyc * 5);
        setOpacity(r, (1 - cyc) * 0.4 * alpha);
      });
    }
    if (motif === 'prism') {
      placeShards(1, t);
      if (haloRing) {
        haloRing.material.opacity = alpha;
        haloRing.scale.setScalar(1);
        haloRing.rotation.z = t * 0.6;
      }
      if (prismBeams) {
        prismBeams.rotation.z = t * 0.1;
        setOpacity(prismBeams, 0.2 * alpha);
      }
    }
  }

  raf = requestAnimationFrame(frame);

  return {
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
