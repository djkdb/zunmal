# CLAUDE.md — 말랑 뽑기방

말랑이(말랑한 젤리 캐릭터)를 수집하는 모바일 우선 웹 게임.

핵심 루프: **미니게임 플레이 → 코인 획득 → 뽑기권 구매 → 캡슐 머신 → 도감 수집**

## 주요 명령어

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # Vitest 단위 테스트 (1회 실행)
npm run test:watch # 테스트 watch 모드
npm run typecheck  # tsc -b (strict)
npm run build      # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기
```

커밋 전에는 반드시 `npm test` 와 `npm run build` 를 통과시킨다.

## 아키텍처

```
src/
  app/            App(라우터), AppShell(레이아웃)
  styles/         global.css — 디자인 토큰, 공용 클래스
  lib/            rng.ts (주입형/시드 RNG)
  hooks/          useReducedMotion 등 공용 훅
  data/           characters.ts (말랑이 15종), rarity.ts (희귀도 메타·확률 가중치)
  gacha/          engine.ts — 순수 가챠 엔진 (UI/Zustand/DOM 의존 금지)
  economy/        config.ts (모든 밸런스 숫자), economy.ts (보상/구매 계산), daily.ts (서울 날짜)
  audio/          sfx.ts — WebAudio 합성 효과음 (파일 없음)
  store/          useGameStore.ts (Zustand+persist), persistence.ts (sanitize/migrate)
  components/     Malang, TopBar, Shop, GachaMachine, PullResult, Collection, MiniGameLobby, MiniGameResult …
  minigames/      types.ts, registry.ts, shared/(HUD·카운트다운), <game-id>/{index.tsx, logic.ts, logic.test.ts}
  pages/          HomePage, GachaPage, CollectionPage, MiniGamePage
```

의존 방향 (위가 아래를 import 가능, 역방향 금지):

```
pages → components → store → gacha / economy → data → lib
minigames → (types, lib, data, audio 타입)   ※ store/economy import 금지
```

- 라우팅: `HashRouter` (GitHub Pages 새로고침 404 회피). 경로: `/`, `/play`, `/play/:gameId`, `/gacha`, `/collection`.
- 외부 이미지/사운드 파일 사용 금지. 캐릭터는 SVG, 소리는 WebAudio로 생성한다.

## 코딩 컨벤션

- TypeScript `strict` + `noUncheckedIndexedAccess`. `any` 금지, 배열 인덱싱 결과는 undefined 처리.
- 컴포넌트에 밸런스 숫자 하드코딩 금지 → `economy/config.ts` 또는 `data/rarity.ts`.
- 순수 로직(엔진, 경제, 미니게임 logic.ts)은 React/DOM/Zustand에 의존하지 않고 RNG·시간을 주입받는다.
- 컴포넌트는 함수형 + named export. 파일명은 PascalCase(컴포넌트) / camelCase(모듈).
- 스타일은 `global.css` 토큰 + 컴포넌트별 CSS 파일(`Component.css`)을 컴포넌트에서 import.
- 접근성: 모든 인터랙션은 `<button>`/`<a>` 등 네이티브 요소로, 44px 이상 터치 타깃, `:focus-visible` 유지,
  희귀도는 색 + 아이콘 + 텍스트로 표현, `prefers-reduced-motion` 존중(`useReducedMotion`).
- 360px 폭에서 가로 스크롤 금지.
- 사용자 입력 이전에 AudioContext 생성/재생 금지 (`audio/sfx.ts` 가 보장).

## 디자인 시스템

UI 작업 전에 `.claude/skills/frontend-design/SKILL.md`를 읽는다. 컨셉은 **동네 문방구 앞 뽑기방**이다.

- **팔레트** (`global.css` `:root`): 크림 `--cream`, 잉크 `--ink #2b2233`, 딸기우유 `--berry`, 소다 `--soda`, 레몬 `--lemon`, 말차 `--matcha`, 선반 `--shelf`.
- **글꼴**: Jua(간판, 제목, 숫자) + Gowun Dodum(본문). 페이지 제목은 `.page-title` 스티커 글씨(흰 글자 + 잉크 외곽선).
- **과감한 장식은 두 곳뿐**: 상단 차양(줄무늬 + 물결 테두리)과 캡슐 머신. 나머지 화면은 조용하게 둔다.
- **모양이 곧 정보**: 눌리는 것(버튼, 게임 카드)만 키캡 그림자(`--keycap`)를 가진다. 패널은 평평한 외곽선이다.
  티켓은 절취선 모양, 확률표는 테이프로 붙인 안내문, 도감은 선반 위 캡슐 창이다.
- **금지**: 이모지 아이콘(→ `components/icons.tsx`), 제목 위 작은 라벨, `A · B · C` 가운데점 나열, 버튼 끝 `→`,
  모든 요소에 같은 둥근 카드와 같은 그림자 반복, 섹션마다 등장 애니메이션.
- **문구**: 존댓말, 짧고 구체적으로. 행동 이름은 끝까지 같게 쓴다(예: "뽑기권 사기" → "뽑기권 N장을 샀어요.").

## 가챠 규칙 (`gacha/engine.ts`, `data/rarity.ts`)

| 희귀도 | 확률 | 캐릭터 수 | 중복 환급 |
|---|---|---|---|
| 일반 common | 62% | 6 | 10 |
| 레어 rare | 25% | 3 | 30 |
| 에픽 epic | 9.5% | 3 | 80 |
| 전설 legendary | 3% | 2 | 300 |
| 신화 mythic | 0.5% | 1 | 1000 |

- 확률은 basis point 정수 가중치(합 10000)로 저장한다. 같은 희귀도 내 캐릭터는 균등.
- **천장**: 전설 이상 없이 49회 연속 → 50번째 pull은 전설 이상 확정. 확정 시 전설:신화 = 6:1(원 비율 유지).
  전설/신화 등장 시 pityCount = 0. 모든 개별 pull에 적용.
- **10연**: 10 pull 후 레어 이상이 하나도 없으면 10번째를 레어 이상 풀(원 비율 유지)에서 재추첨해 교체.
  교체 결과가 전설 이상이면 pity를 다시 계산한다. 결과는 항상 10개.
- **중복**: 이미 보유(같은 10연 내 앞선 결과 포함)한 캐릭터는 희귀도별 환급 코인을 지급.
- 천장 때문에 실질 전설 이상 확률은 약 4.2% — 확률표에 함께 공개한다.

## 경제 시스템 (`economy/`)

- 코인은 **미니게임에서만** 획득. 미니게임은 점수만 보고하고 코인을 직접 변경하지 않는다.
- 보상 계산 (`computeReward`):
  ```
  baseCoins    = floor(score × gameMultiplier)
  partnerBonus = floor(baseCoins × partnerRarityBonus)
  earnedCoins  = min(baseCoins + partnerBonus, perGameCap)
  granted      = min(earnedCoins, dailyCap − dailyEarned)
  ```
- 일일 상한은 **Asia/Seoul 달력 날짜**가 바뀌면 초기화 (`daily.ts` 의 `seoulDateKey`).
- 뽑기권: 1장 100 코인, 11장 묶음 1000 코인. 1회 뽑기 = 1장, 10연 = 10장.
- 모든 숫자는 `economy/config.ts` 에 주석과 함께 둔다.

## 상태 저장 (`store/`)

- Zustand `persist`, key `malang-gacha-save`, `version` 필드 + `migrate`.
- 로드된 데이터는 항상 `sanitizeSave` 를 거친다: 잘못된 타입/음수/알 수 없는 캐릭터 id 제거, 기본값 보정.
  JSON 파싱 실패 시에도 초기 상태로 복구하며 앱이 크래시하지 않아야 한다.
- 구조 변경 시: `SAVE_VERSION` 을 올리고 `persistence.ts` 의 `migrateSave` 에 단계별 변환을 추가 + 테스트.

## 테스트

- `npm test` — Vitest, node 환경, `src/**/*.test.ts`.
- 가챠: 10만 회 확률 검증을 서로 다른 시드 여러 개로 수행(±5σ 허용), 천장/비율/10연 보장/환급.
- 경제: 보상식, 판당·일일 상한, 서울 자정 경계.
- 저장: 손상/구버전 데이터 migrate.
- 미니게임: `logic.ts` 순수 함수 (점수, 콤보, 충돌, 스폰).

## 미니게임 추가 방법

1. `src/minigames/<game-id>/logic.ts` — 순수 로직 (+ `logic.test.ts`).
2. `src/minigames/<game-id>/index.tsx` — `MiniGame` 객체를 default export:
   ```ts
   const game: MiniGame = { id, name, description, icon, Component };
   export default game;
   ```
   `Component` 는 `MiniGameProps`(`partner`, `onFinish({score, stats})`, `onExit`, `sfx`)를 받는다.
   **코인을 계산/지급하지 않는다.** 점수만 `onFinish` 로 보고.
3. `src/minigames/registry.ts` 의 `MINI_GAMES` 배열에 한 줄 추가.
4. (선택) `economy/config.ts` 의 `GAME_MULTIPLIERS` 에 배율 추가 — 없으면 기본 배율 사용.

결과 화면, 최고 기록 저장, 코인 지급은 `MiniGamePage` 가 공통 처리한다.

## Git workflow

- 작업 단위별 의미 있는 커밋 (Conventional Commits: `feat:`, `fix:`, `test:`, `ci:`, `docs:`, `refactor:`).
- 커밋 전 `npm test && npm run build`.
- `main` 푸시 시 GitHub Actions가 테스트/빌드 후 GitHub Pages에 배포 (`.github/workflows/deploy.yml`). Cloudflare Pages도 `main`을 연결해 배포한다.
- 빌드는 상대 경로(`base: ./`)라 호스팅 경로와 무관하다. HashRouter를 버리면 이 전제가 깨지므로 base를 다시 정해야 한다.
