# CLAUDE.md — 말랑 뽑기방

말랑이(말랑한 젤리 캐릭터)를 수집하는 모바일 우선 웹 게임.

핵심 루프: **미니게임 플레이 → 코인 획득 → 코인으로 캡슐 뽑기 → 도감 수집**

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
  data/           characters.ts (말랑이 32종), rarity.ts (희귀도 메타·확률 가중치), collections.ts (테마 세트)
  gacha/          engine.ts — 순수 가챠 엔진 (UI/Zustand/DOM 의존 금지)
  economy/        config.ts (모든 밸런스 숫자), economy.ts (보상/구매 계산), daily.ts (서울 날짜)
  audio/          sfx.ts (합성 효과음 + 믹서), music.ts (절차적 배경음악), tuning.ts (음높이·음량 헬퍼) — 파일 없음
  store/          useGameStore.ts (Zustand+persist), persistence.ts (sanitize/migrate)
  components/     Malang, TopBar, GachaMachine, PullResult, Collection, RateTable, MiniGameLobby, MiniGameResult …
  minigames/      types.ts, registry.ts, shared/(HUD·카운트다운), <game-id>/{index.tsx, logic.ts, logic.test.ts}
  missions/       missions.ts — 일일 미션 생성/진행/보상 (순수)
  pages/          HomePage, GachaPage, CollectionPage, MiniGamePage, TouchPage
```

의존 방향 (위가 아래를 import 가능, 역방향 금지):

```
pages → components → store → gacha / economy → data → lib
minigames → (types, lib, data, audio 타입)   ※ store/economy import 금지
```

- 라우팅: `HashRouter` (GitHub Pages 새로고침 404 회피). 경로: `/`, `/play`, `/play/:gameId`, `/gacha`, `/collection`, `/touch`, `/touch/:id`.
- 외부 이미지/사운드 파일 사용 금지. 캐릭터는 SVG, 소리는 WebAudio로 생성한다. (3D 연출도 코드로 만든 도형·셰이더뿐)

## 코딩 컨벤션

- TypeScript `strict` + `noUncheckedIndexedAccess`. `any` 금지, 배열 인덱싱 결과는 undefined 처리.
- 컴포넌트에 밸런스 숫자 하드코딩 금지 → `economy/config.ts` 또는 `data/rarity.ts`.
- 순수 로직(엔진, 경제, 미니게임 logic.ts)은 React/DOM/Zustand에 의존하지 않고 RNG·시간을 주입받는다.
- 컴포넌트는 함수형 + named export. 파일명은 PascalCase(컴포넌트) / camelCase(모듈).
- 스타일은 `global.css` 토큰 + 컴포넌트별 CSS 파일(`Component.css`)을 컴포넌트에서 import.
- 접근성: 모든 인터랙션은 `<button>`/`<a>` 등 네이티브 요소로, 44px 이상 터치 타깃, `:focus-visible` 유지,
  희귀도는 색 + 아이콘 + 텍스트로 표현, `prefers-reduced-motion` 존중(`useReducedMotion`).
- 360px 폭에서 가로 스크롤 금지. 360×640 화면에서도 홈의 주요 버튼이 첫 화면에 보여야 한다.
- 재화를 쓰는 버튼은 state가 아니라 ref로 즉시 잠가 연타 중복 실행을 막는다 (`GachaPage`의 `lockRef`).
- 사용자 입력 이전에 AudioContext 생성/재생 금지 (`audio/sfx.ts` 가 보장).
- 글자 선택·길게 누르기 메뉴는 전역으로 막는다(`body` user-select/touch-callout none — iOS에서 터치를 삼킴). 입력칸과 `.selectable`만 예외.
- 버튼·UI에 ◀▶ 같은 기호 글자를 쓰지 않는다(글꼴에 없어 iOS에서 빈칸). SVG 아이콘을 쓴다 (미니게임은 `minigames/shared/ArrowIcon`).

## 디자인 시스템

UI 작업 전에 `.claude/skills/frontend-design/SKILL.md`를 읽는다. 컨셉은 **젤리 과자 가게 같은 캐주얼 모바일 게임**이다.

- **팔레트** (`global.css` `:root`): 크림 `--cream`, 잉크 `--ink #2b2233`, 딸기우유 `--berry`, 소다 `--soda`, 레몬 `--lemon`, 말차 `--matcha`, 선반 `--shelf`.
- **글꼴**: 카페24 써라운드 한 가지(눈누 jsdelivr CDN). 제목은 `.page-title` 풍선 글씨(흰 글자 + 잉크 외곽선 + 그림자).
- **재질은 젤리**: 버튼·게임 타일은 광택 하이라이트 + 같은 색 아랫단 + 눌리면 찌그러짐(`.btn`). 배경은 스프링클 무늬.
- **과감한 장식**: 홈 간판(차양 + 풍선 글씨 로고)과 캡슐 머신. 등급이 높을수록 연출이 화려해진다.
- **모양이 곧 정보**: 눌리는 것만 두꺼운 아랫단 그림자를 가진다. 패널은 평평한 외곽선이다.
  확률표는 테이프로 붙인 안내문, 도감은 선반 위 캡슐 창이다.
- **금지**: 이모지 아이콘(→ `components/icons.tsx`), 제목 위 작은 라벨, `A · B · C` 가운데점 나열, 버튼 끝 `→`,
  모든 요소에 같은 둥근 카드와 같은 그림자 반복, 섹션마다 등장 애니메이션.
- **조사**: 말랑이 이름 뒤 조사는 직접 쓰지 말고 `lib/josa.ts`의 `josa(name, '과/와')`로 받침에 맞춰 붙인다.
- **문구**: 존댓말, 짧고 구체적으로. 행동 이름은 끝까지 같게 쓴다(예: "보상 받기" → "받았어요").

## 가챠 규칙 (`gacha/engine.ts`, `data/rarity.ts`)

| 희귀도 | 확률 | 캐릭터 수 | 중복 환급 | 파트너 보너스 |
|---|---|---|---|---|
| 일반 common | 61.95% | 10 | 10 | 0% |
| 레어 rare | 25% | 7 | 30 | 5% |
| 에픽 epic | 9.5% | 6 | 80 | 10% |
| 전설 legendary | 3% | 4 | 300 | 20% |
| 신화 mythic | 0.5% | 2 | 1000 | 30% |
| 시크릿 secret | 0.05% | 3 | 5000 | 50% |

- 확률은 basis point 정수 가중치(합 10000)로 저장한다. 같은 희귀도 내 캐릭터는 균등.
  시크릿 0.05%는 일반에서 떼어 왔다 (나머지 등급은 원래 명세 그대로).
- **천장**: 전설 이상 없이 49회 연속 → 50번째 pull은 전설 이상 확정. 확정 풀은 전설·신화·시크릿을
  원래 비율(300:50:5)로 유지하므로 전설:신화 = 6:1. 전설 이상 등장 시 pityCount = 0. 모든 개별 pull에 적용.
- **10연**: 10 pull 후 레어 이상이 하나도 없으면 10번째를 레어 이상 풀(원 비율 유지)에서 재추첨해 교체.
  교체 결과가 전설 이상이면 pity를 다시 계산한다. 결과는 항상 10개.
- **반짝(shiny)**: 모든 pull에서 등급과 독립적으로 1% (`GACHA_RULES.shinyRate`). pull 1회 = RNG 3번
  (희귀도, 캐릭터, 반짝) — 테스트에서 RNG 수열을 짤 때 주의.
- **중복**: 이미 보유(같은 10연 내 앞선 결과 포함)한 캐릭터는 희귀도별 환급 코인을 지급.
  단, 반짝 버전을 처음 얻은 경우는 새 수집으로 보고 환급하지 않는다.
- 천장 때문에 실질 전설 이상 확률은 약 4.2% — 확률표에 함께 공개한다.
- **등급 차별화**: 등급마다 캡슐 색, 머신 흔들림, 결과음(`playRarityFanfare`), 결과 모달 테두리가 다르다.
  시크릿은 화면이 어두워지는 예고 단계(`tease`)와 밤하늘 테마 결과 모달이 따로 있다.
- **신화 이상 전체 화면 연출** (`components/epic/`):
  모으기(캡슐 회전·떨림·금·빛 흡수, `sfx.epicRiser`) → 폭발(섬광·충격파·입자, `sfx.epicImpact`, 진동)
  → 등장(모티프 장치 + 말랑이) → 제목 도장("신화!"/"시크릿!!") + 테마 한 줄.
  - **시크릿은 한 단계 위 연출**이 따로 붙는다 (`SCRIPTS.secret`, `scene3d`의 `secret`):
    전조(화면이 까매지고 별 하나가 반짝이다 혜성처럼 떨어짐 + 영화 화면비 띠) → 혼천의 빛 고리가 캡슐을 감쌈
    → 수축(모든 빛이 한 점으로, `sfx.epicImplode`, 방사 흐림) → 폭발 + 0.32초 뒤 초신성(`sfx.secretBoom`,
    무지개 충격파·가로 빛줄기·색 번짐, 한 프레임 색 반전) → 고리가 말랑이를 두르고 제목이 한 글자씩 찍힌다.
  - **말랑이마다 장면이 다르다** (`epic/themes.ts`, 순수 데이터 + 테스트): 은하=나선 은하, 불사조=불꽃 날개·불씨,
    유니콘=무지개 아치·하트, 고래=별빛 워프·잔물결·별 물줄기, 세라핌=궤도 수정 조각·후광·프리즘 광선.
    새 신화/시크릿은 `MOTIF_BY_ID`에 추가(없으면 effect → 등급 순으로 기본 테마). 신화·시크릿끼리 모티프가 겹치면 테스트가 실패한다.
  - **3D는 three.js** (`epic/scene3d.ts`: 캡슐·입자 셰이더·빛 번짐 후처리). 사용자가 명시적으로 요청한 유일한 대형 의존성이다.
    신화 이상이 나온 순간에만 `preloadScene3d()`로 따로 받는 청크라 첫 화면 번들에 넣지 말 것(정적 import 금지, 타입 import만).
    모듈을 1.5초 안에 못 받거나 WebGL을 못 만들면 2D 캔버스(`epic/particles.ts`)로 대체한다. 언마운트 시 dispose + 컨텍스트 해제.
  - 말랑이와 글자는 항상 DOM(SVG)이 캔버스 위에 그린다. 3D 무대 원점 = 화면 위 45%(`STAGE_Y`)로 DOM과 맞춘다.
  - 탭/Enter/Esc로 건너뛰기(처음 0.5초는 무시), 움직임 줄이기면 정지 카드만. 이때 머신은 결과음을 내지 않는다(`quietFanfare`).
## 홈 화면 앱 (PWA)

- `public/manifest.webmanifest` + `public/sw.js`(서비스 워커, 프로덕션에서만 등록) + 아이콘.
  아이콘은 `public/icon.svg`(코드로 그린 말랑이)에서 `scripts/render-icons.mjs`로 PNG를 만든다 — 그림을 바꿀 때만 다시 실행.
- 서비스 워커: 페이지는 네트워크 우선, 해시 이름 빌드 파일과 글꼴은 캐시 우선. 캐시 구조를 바꾸면 `VERSION`을 올린다.
- 설치 안내는 `components/InstallCard.tsx`, 환경 판별은 순수 모듈 `lib/installEnv.ts`(UA 테스트 있음).
  - **인스타그램·카카오톡 등 앱 안 브라우저**(주요 유입 경로: 인스타 DM 링크)는 홈 화면 추가가 안 되고 저장 공간도 따로다.
    → 주요 버튼 바로 아래에 "브라우저로 열기"(안드로이드 Chrome intent, iOS 17+ `x-safari-https`) + 링크 복사 + 메뉴 위치 안내.
  - 안드로이드 Chrome은 `beforeinstallprompt`를 앱 시작 시(`app/installPrompt.ts`) 붙잡아 설치 창을 띄우고, iOS는 공유 → 홈 화면에 추가 순서를 보여 준다.
  - 이미 앱으로 열었으면(standalone) 안내하지 않는다. 설치 카드는 닫으면 7일간 숨긴다.

## 컬렉션 (`data/collections.ts`)

- 테마 세트(디저트 가게, 깊은 바다, 꿈의 끝 …). 한 말랑이가 여러 세트에 속할 수 있다.
- 세트를 완성하면 한 번 코인 보상(`SET_REWARD_COINS`, 등급 small~ultimate). 일일 상한과 무관.

## 일일 미션 (`missions/missions.ts`, `components/DailyMissions.tsx`)

- 서울 날짜로 시드를 만든 미션 3개(서로 다른 종류, 쉬움/보통/어려움 하나씩). 모든 기기에서 같은 날 같은 미션.
- 종류: 미니게임 N판, 캡슐 N개 뽑기, 말랑이 N번 쓰다듬기, 미니게임 코인 N개, 최고 기록 깨기.
- 진행은 store 액션(`finishMiniGame`, `pull`, `petMalang`)이 기록한다. 보상(`MISSION_REWARD_COINS`) + 올클리어 보너스.
- 받을 보상이 있으면 홈 탭에 빨간 점.

## 말랑 만지기 (`pages/TouchPage.tsx`, `touch/physics.ts`, `audio/squish.ts`)

- 스프링 기반 말랑 물리(순수 모듈, 테스트 있음) + WebAudio로 합성한 찰박·쭉·뽁 소리.
- 소리는 `sfx.getOutput()`(효과음 버스)으로 같은 AudioContext와 효과음 설정을 공유한다. 자체 컨텍스트를 만들지 않는다.
- 만지면 친밀도(`affection`)가 오른다. 친밀도는 코인을 주지 않는다.
- **3D 젤리** (`components/touch3d/`, three.js): 윤곽 path를 부풀린 메시(`touch/jellyMesh.ts`) +
  순수 스프링 변형(`touch/softbody.ts`: 누른 자국·당김·비틀림·숨쉬기, 부피 보존, 테스트 있음).
  전체 눌림·기울기는 2D와 같은 `physics.ts` 값을 쓴다 → 소리·애정·미션이 두 버전에서 같다.
  - 겉모습은 화면 밖에 그린 실제 `<Malang>`을 구운 텍스처(`rasterMalang.ts`) — 새 말랑이·그림 수정이 자동 반영.
    몸 밖 장식은 몸 뒤/앞 평평한 카드, 외곽선은 뒤집힌 껍질. 얼굴(기쁨·졸림·놀람·깜빡임)은 텍스처 교체.
  - `loadJelly3d.ts`로 만지기 화면에서만 받는 청크(three는 epic과 공유 청크). 1.5초 안에 못 받거나 WebGL이 없거나
    움직임 줄이기면 기존 2D SVG. 렌더러 하나를 캐릭터 전환에도 재사용, 떠나면 dispose + forceContextLoss.
  - 멈추면 그리지 않는다(숨쉬기는 놓은 뒤 약 7초만). DPR 최대 2, 느리면 자동으로 낮춘다.

## 소리 (`audio/`)

- **믹서** (`sfx.ts`): `sfxBus`·`uiBus`·`musicBus → duck` → 저역 컷 90Hz → 버스 컴프(3.5:1) → 리미터(-1.5dB) → 안전 클리퍼(≤0.99).
  음량은 `BUS_LEVELS` 한 곳에서. 배경음악은 효과음 정점보다 약 10dB 낮게. 여러 소리가 한꺼번에 겹쳐도 클리핑 없음(오프라인 렌더로 확인).
- **iOS/모바일**: 첫 입력 전 컨텍스트 금지는 그대로. `installAudioUnlock`은 첫 입력 뒤에도 계속 듣고, `state !== 'running'`이면
  (Safari의 `'interrupted'` 포함) 입력 안에서 `resume()`한다. 화면이 숨겨지면 `suspend()`, 효과음·배경음악을 모두 끄면 컨텍스트를 멈춘다.
  컨텍스트 생성 전 `navigator.audioSession.type = 'ambient'`(지원 시) — 무음 스위치를 존중하고 다른 앱 음악과 섞인다.
- **폰 스피커**: 200Hz 아래만 있는 소리는 폰에서 안 들린다. 큰 충격음은 `boom()`(사인 + 포화 배음 + 150~400Hz 노크), 박자음·실수음은 `knock()`을 얹는다.
- **반복 피로**: 버튼·탭·코인·획득·실수음은 작은 음높이(센트)·음량(dB) 변주 + 같은 소리 연타 간격 제한(`gate`).
  콤보는 `tuning.comboPitch(level)` — 장조 5음 음계 사다리, 1.5옥타브(`MAX_COMBO_STEP`)에서 멈추고 넘으면 반짝임만 얹는다.
- **배경음악** (`music.ts`): 25ms 타이머 + 오디오 시계 기준 120ms 미리 예약(`StepClock`). 곡은 `TRACKS`(home 92 / collection 76 /
  touch 68 / gacha 100 / minigame 120 BPM)이고 시드 고정 8마디 악절 4종(`generatePhrase`, 순수·테스트)이 돌아가며 나온다.
  음색은 마림바(1:3.92:9.24)·오르골·FM 종(1:1.4)·칼림바·패드·베이스(≥110Hz + 배음)·셰이커·클릭. 화면 전환은 다음 마디 경계에서 1초 교차 페이드.
  경로 → 곡은 `trackForPath`, AppShell의 `useRouteMusic()`이 적용. 리듬 게임(`QUIET_GAME_IDS`)은 박자가 부딪혀 음악을 끈다.
- **덕킹**: 팡파레·신화 연출 소리(`result*`, `epic*`, `secretBoom`, `secretTease`)가 스스로 `sfx.duck(초, dB)`를 불러 음악을 -5~-20dB 낮춘다.
  화면 코드는 신경 쓰지 않아도 된다.
- **설정**: 효과음/배경음악 따로(`settings.sfxOn`, `settings.musicOn`, HUD 소리 버튼 → `SoundSettings` 말풍선).
  토글은 입력 안에서 엔진에도 바로 알린다(iOS 재개 조건).

## 경제 시스템 (`economy/`)

- **재화는 코인 하나뿐**이다 (뽑기권은 v3에서 폐지). 코인으로 바로 캡슐을 뽑는다.
- 코인 출처: 미니게임(일일 상한 적용), 중복 환급, 컬렉션 세트 보상, 일일 미션. 미니게임은 점수만 보고하고 코인을 직접 변경하지 않는다.
- 보상 계산 (`computeReward`):
  ```
  baseCoins    = floor(score × gameMultiplier)
  partnerBonus = floor(baseCoins × partnerRarityBonus)
  earnedCoins  = min(baseCoins + partnerBonus, perGameCap)
  granted      = min(earnedCoins, dailyCap − dailyEarned)
  ```
- 일일 상한은 **Asia/Seoul 달력 날짜**가 바뀌면 초기화 (`daily.ts` 의 `seoulDateKey`).
- 뽑기 가격(`PULL_PRICE`): 1회 100 코인, 10연 900 코인(10% 할인).
- 모든 숫자는 `economy/config.ts` 에 주석과 함께 둔다.

## 상태 저장 (`store/`)

- Zustand `persist`, key `malang-gacha-save`, `version` 필드 + `migrate`.
- 로드된 데이터는 항상 `sanitizeSave` 를 거친다: 잘못된 타입/음수/알 수 없는 캐릭터 id 제거, 기본값 보정.
  JSON 파싱 실패 시에도 초기 상태로 복구하며 앱이 크래시하지 않아야 한다.
- 현재 v5: 반짝 수(`shinyCount`), 받은 세트 보상(`claimedSets`), 친밀도(`affection`), 반짝 파트너 표시(`partnerShiny`), 일일 미션(`missions`),
  소리 설정 `settings: { sfxOn, musicOn }`(v4의 `muted: true`는 둘 다 끔으로 옮긴다. 새 플레이어는 둘 다 켬 — 음악은 첫 입력 뒤에 시작).
  v2→v3에서 남은 뽑기권은 장당 100코인(`LEGACY_TICKET_TO_COINS`)으로 바꿔 코인에 더한다.
- 구조 변경 시: `SAVE_VERSION` 을 올리고 `persistence.ts` 의 `migrateSave` 에 단계별 변환을 추가 + 테스트.

## 테스트

- `npm test` — Vitest, node 환경, `src/**/*.test.ts`.
- 가챠: 10만 회 확률 검증을 서로 다른 시드 여러 개로 수행(±5σ 허용), 천장/비율/10연 보장/환급.
- 경제: 보상식, 판당·일일 상한, 서울 자정 경계.
- 저장: 손상/구버전 데이터 migrate.
- 미니게임: `logic.ts` 순수 함수 (점수, 콤보, 충돌, 스폰).
- 소리: 콤보 음계·단위 변환·클리퍼 곡선(`tuning`), 스케줄러 박자 계산·악절 생성 결정성·경로→곡(`music`), 엔진 잠금/재개/덕킹(가짜 컨텍스트).

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
