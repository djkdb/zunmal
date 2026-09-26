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
  data/           characters.ts (말랑이 32종), rarity.ts (희귀도 메타·확률 가중치), collections.ts (테마 세트), materials.ts (촉감·특별한 속),
                  playroomDecor.ts (놀이방 무늬 id·소품·저장 검사), matPatterns.ts (매트 무늬 타일 그림, 놀이방 청크 전용)
  gacha/          engine.ts — 순수 가챠 엔진 (UI/Zustand/DOM 의존 금지)
  economy/        config.ts (모든 밸런스 숫자), economy.ts (보상/구매 계산), daily.ts (서울 날짜)
  audio/          sfx.ts (합성 효과음 + 믹서), music.ts (절차적 배경음악), tuning.ts (음높이·음량 헬퍼) — 파일 없음
  store/          useGameStore.ts (Zustand+persist), persistence.ts (sanitize/migrate)
  components/     Malang, TopBar, GachaMachine, PullResult, Collection, RateTable, MiniGameLobby, MiniGameResult …
  minigames/      types.ts, registry.ts, shared/(HUD·카운트다운), <game-id>/{index.tsx, logic.ts, logic.test.ts}
  missions/       missions.ts — 일일 미션 생성/진행/보상 (순수)
  pages/          HomePage, GachaPage, CollectionPage, MiniGamePage, TouchPage(놀이방)
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

## 디자인 시스템 — 스카이 소다 (시안 G)

UI 작업 전에 `.claude/skills/frontend-design/SKILL.md`를 읽는다. 컨셉은 **맑은 하늘색 바탕 + 흰 카드 + 딸기우유 포인트의
깔끔하고 귀여운 모바일 게임**(Figma `LEC6GGqQ9ELZ5y0LNxTLaZ`, 프레임 "시안 G — 스카이 소다"). 말랑이 그림(잉크 외곽선)만 캐릭터 쪽에 남고,
UI는 테두리 없이 그림자로 층을 나눈다. 토큰은 모두 `global.css` `:root`에 있다 — 새 코드는 아래 이름만 쓴다.

| 역할 | 토큰 | 값 |
|---|---|---|
| 바탕 그라데이션 | `--sky-top` → `--sky-mid`(60%) → `--sky-bottom`, `--bg-gradient` | #CFE6FF → #EAF4FF → #FFF |
| 글자 / 보조 글자 / 링크 | `--ink` / `--sub` / `--link` | #22304A / #56657F / #2F6DBF (모두 흰 바탕 AA) |
| 주 행동(딸기우유) | `--primary` (+ `--primary-deep` 눌림·링, `--primary-tint` 옅은 바탕, `--primary-text` 흰 바탕 위 글자) | #FF9FB8 |
| 레몬 / 소다 / 민트 / 포도 / 복숭아 | `--lemon` `--sky` `--mint` `--grape` `--peach` (+ `--lemon-tint`, `--sky-tint`) | #FFD66B #8FC3FF #9FE0B8 #C9B6FF #FFC2A0 |
| 면 / 칸 / 가는 선 | `--surface` / `--surface-2` / `--border` | #FFF / #F3F8FE / #E3EDF8 |
| 금빛(천장·코인) / 위험 | `--gold` / `--danger` | #F2C14E / #F0506E |
| 모서리 | `--radius-card` 22 · `--radius-btn` 18 · `--radius-s` 12 · `--radius-pill` 999 | |
| 그림자 | `--shadow-card`(카드) · `--shadow-btn`(버튼) · `--shadow-btn-press`(눌림) · `--shadow-float`(모달·말풍선) · `--shadow-up`(하단 탭) | 파란 기운 rgba(26,64,128,…) |
| 희귀도 | `--rarity-<r>`(대표색·빛) · `--rarity-<r>-tint`(배지 바탕) · `--rarity-<r>-ink`(배지 글자) | 일반 회색, 레어 파랑, 에픽 보라, 전설 금, 신화 분홍·무지개, 시크릿 밤하늘 |

- **글꼴**: 제목·로고·말랑이 이름·큰 점수·신화 도장 = **주아** `--font-display` (두께 400 하나, 잉크색, 외곽선 없음, `--tracking-title` -0.01em).
  나머지 = **나눔스퀘어라운드** `--font-body`; 버튼·칩·숫자는 `--font-ui` + `--fw-ui`(700). 주아는 `main.tsx`에서 `@fontsource/jua/400.css`
  (유니코드 범위 조각), 나눔스퀘어라운드는 `global.css` @font-face + `src/assets/fonts/nanum-square-round-{400,800}.woff2`
  (`scripts/subset-fonts.py`로 완성형 2,350자 + 앱 코드 한글만 남긴 파일 — 새 문구에 드문 글자를 넣으면 다시 실행. 600 이상은 모두 800 파일).
  빠진 글자는 Pretendard Variable(dynamic-subset)이 대신 그린다. `html { font-synthesis: style }` — 가짜 굵게 금지.
  해시 이름 `assets/` 파일이라 서비스 워커가 캐시 우선으로 보관한다. 캔버스 글자는 `"Jua", "NanumSquareRound", "Pretendard Variable", sans-serif`.
- **바탕**: `body::before`(고정 그라데이션) + `body::after`(비눗방울 몇 개: 흰 45% + 1.5px 흰 테두리, 아주 느린 떠오르기 — 움직임 줄이기면 멈춤).
  `body`에는 배경을 두지 않는다(두면 z-index:-1 층을 덮는다). 캔버스 색은 `html`.
- **면**: 카드·패널은 흰색 + `--shadow-card`, 테두리 없음. 카드 안의 칸·진행 막대 바탕·비활성은 `--surface-2`/`--sky-tint`.
  **버튼**(`.btn`): 주 = `.btn--primary`(딸기우유 + 잉크 글자), 보조 = 기본/`.btn--secondary`(흰색 + 그림자), 작은 강조 = `.btn--lemon`.
  누르면 `translateY(2px) scale(.97)` + 그림자가 눌리고, 떼면 `--ease-jelly` 스프링. 비활성은 `--surface-2` + `--sub` 글자 + 가는 테두리.
  칩은 흰 알약(`.chip`) 또는 레몬(`.chip--lemon`). 하단 탭은 흰 바(위 모서리 22) + 선택 탭 딸기우유 칸. 코인은 반투명 흰 알약.
- **아이콘**(`components/icons.tsx`): 둥근 선 + 파스텔 채움, 선 색은 `currentColor`(코인만 금빛).
- **홈 간판**: 영문 머리글 `.eyebrow`("CAPSULE MALANG SHOP", 시안에 있는 유일한 머리글) + 주아 "말랑 뽑기방". 파트너는 흰 받침 타원 위.
- **캡슐 머신**: 반투명 흰 돔 + 파스텔 캡슐(흰 이음새, 부드러운 그림자) + 딸기우유 몸통 + 흰 "MALANG" 이름표 + 흰 손잡이 + 어두운 배출구.
  등급이 높을수록 연출(빛·흔들림·신화 이상 전체 화면)이 화려해지는 건 그대로다.
- **금지**: 굵은 잉크 UI 테두리·잉크색 아랫단 그림자, 흰 글자 + 잉크 외곽선(`-webkit-text-stroke`) 제목, 크림 바탕, 스프링클 무늬,
  이모지 아이콘, `.eyebrow` 외의 제목 위 작은 라벨, `A · B · C` 가운데점 나열, 버튼 끝 `→`, 넓은 영역의 무거운 blur,
  섹션마다 등장 애니메이션.
- **이전 이름**(`--cream`, `--paper`, `--berry`, `--soda`, `--matcha`, `--ink-soft`, `--line`, `--keycap` …)은 호환용 별칭으로만 남아 있다
  (미니게임 속 그림과 결과 화면 일부가 아직 쓴다. 놀이방 `/touch`는 새 토큰으로 옮겼다). 새 코드에서 쓰지 말고, 다시 칠할 때 위 토큰으로 옮긴다.
  미니게임 안의 게임 그림(블록·컵·점수 튀어나옴 등)은 자기 그림을 유지해도 되지만 틀·버튼·HUD는 토큰을 따른다.
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

## 쿠폰·링크 미리보기

- 쿠폰: 목록은 `economy/config.ts`의 `COUPONS`(id·코드·코인·이름·기간), 확인은 순수 모듈 `economy/coupons.ts`(대소문자·공백 무시, 저장당 1회).
  받은 쿠폰 id는 저장 v6 `redeemedCoupons`. 입력 칸은 홈 아래 `components/CouponBox.tsx`. 서버가 없어 코드는 앱 안에 있다(선물용, 보안 수단 아님).
  현재: `zun` = 오픈 기념 1000코인.
- 링크 미리보기: `index.html`의 og/twitter 메타 + `public/og.png`(1200×630, `scripts/render-og.mjs`로 실제 말랑이 SVG에서 생성 — 스카이 소다:
  하늘 바탕·머리글·제목 글꼴 Jua(`@fontsource/jua`, 본문은 `src/assets/fonts`의 NanumSquareRound가 있으면)·흰 칩·도트 매트 위 말랑이). 배포 주소 `https://zunmal.pages.dev`.

## 컬렉션 (`data/collections.ts`)

- 테마 세트(디저트 가게, 깊은 바다, 꿈의 끝 …). 한 말랑이가 여러 세트에 속할 수 있다.
- 세트를 완성하면 한 번 코인 보상(`SET_REWARD_COINS`, 등급 small~ultimate). 일일 상한과 무관.

## 일일 미션 (`missions/missions.ts`, `components/DailyMissions.tsx`)

- 서울 날짜로 시드를 만든 미션 3개(서로 다른 종류, 쉬움/보통/어려움 하나씩). 모든 기기에서 같은 날 같은 미션.
- 종류: 미니게임 N판, 캡슐 N개 뽑기, 말랑이 N번 쓰다듬기, 미니게임 코인 N개, 최고 기록 깨기.
- 진행은 store 액션(`finishMiniGame`, `pull`, `petMalang`)이 기록한다. 보상(`MISSION_REWARD_COINS`) + 올클리어 보너스.
- 받을 보상이 있으면 홈 탭에 빨간 점.

## 놀이방 — 말랑 만지기 (`pages/TouchPage.tsx`, `components/playroom/`, `touch/`, `audio/squish.ts`)

- `/touch`, `/touch/:id`는 **화면 전체가 하늘 바탕 위 폭신한 놀이 매트**(스카이 소다: 흰 파이핑 + 흰 바느질 + 고른 무늬)인 독립 창이다.
  AppShell이 위 막대·아래 탭을 숨기고(`useMatch('/touch/*')`), 위 HUD는 왼쪽 두 동그라미(나가기 = 이전 화면, 없으면 홈 · 꾸미기)
  · 가운데 흰 카드(집중한 말랑이 정보: 애정 단계 + 촉감 + 다음 반응 방법) · 오른쪽 두 동그라미(방법 보기 · 사진). 버튼은 흰 원 + 파란 그림자.
- **기본은 한 마리만 크게 만진다.** 들어올 때(`soloMalang`) 매트에는 주소의 말랑이(도감 "만지러 가기", 안 열었으면 그 캡슐) 또는 파트너
  하나만 둔다 — 저장된 `out`에 여럿이 있어도 줄인다. 혼자면 배치가 커지고(`computeMatLayout(…, { solo })`, 말랑이 그림 최대 240px) 가운데
  (`soloSpot`)에 선다. 선반 손잡이는 "친구 꺼내기"로 바뀐다. 친구를 꺼내면 여럿 배치(100~180px)로, 다시 하나가 되면 남은 말랑이가
  가운데로 돌아온다. 배치가 바뀌어도 몸은 화면 위 같은 자리에 머문다(`remapPoint`). 손짓·반응은 그대로다.
- **여럿이 함께**는 선반에서 꺼내 2~5마리. 상한은 폰 3, 계속 55fps 이상이면 5(`touch/perfGovernor.ts`, 순수·테스트).
  3D가 35fps 아래로 떨어지면 2D로, 2D도 30fps 아래면 상한을 줄인다(나와 있는 말랑이는 치우지 않음).
- **두 층 물리** (모두 순수·dt 주입·테스트):
  - 몸 전체 위치 = 매트 세계 하나 `touch/world.ts`: 매트 쪽 중력, 반지름 r 인 말랑한 공끼리 부드러운 밀어내기 + 쿨롱 마찰
    (가운데 올리면 얹혀 쉬고 많이 비끼면 기대다 미끄러짐), 벽 튕김, 들어 옮기기(`grabBody`/`moveHeld`, 천천히 다른 말랑이 위로
    가져가면 올라타 쌓이고 빠르면 밀어냄), 던지기(`releaseBody`), 화살표 툭(`nudgeBody`). 착지·부딪힘·벽 사건을 돌려준다.
    재질(`BodyMaterial`: 튐·마찰·강성·질량·끈적임)은 말랑이마다 촉감 표에서 온다(아래 **촉감**).
    옆구리에 대고 살짝 미는 것은 올라타지 않는다: 손가락 목표가 상대 가운데 가까이(`climbTarget`)일 때만 올라탄다.
    지난 스텝의 맞닿음 목록(`world.touching`: 법선·파고듦·맞닿은 시간)과 부딪힘 사건의 `nz`를 말랑이끼리 판정에 넘긴다.
    움직이지 않는 장애물(`world.obstacles`, `setObstacles`/`moveObstacle`) = 꾸미기 소품: 질량이 무한한 공이라 말랑이만 밀려나고
    (크게 겹쳐도 `obstaclePushMax` 깊이까지만 밀어 확 튀지 않음) 위에 얹히거나 들고 가면 올라탄다. 부딪히면 `wall` 사건.
    상한(cap)·맞닿음 목록·말랑이끼리 판정에는 들어가지 않는다. `findDropSpot`은 소품을 피한다.
  - 몸 안쪽 출렁임 = 말랑이마다 `components/playroom/malangActor.ts`(`MalangActor`): 예전 한 마리 코드 그대로 —
    `physics.ts`(눌림·기울기, 착지·부딪힘은 `impact`) + `softbody.ts`(3D 자국·당김) + 반응·눈길·졸음·소리·입자·진동·애정.
  - 화면 배치는 `touch/matView.ts`(3/4 시점: 깊이 y는 화면 아래, 높이 z는 위, 맞닿아 눌린 모양 `squeezePose`).
- 손가락: 누르면 그 말랑이가 "집중"(정보 표시). 제자리에서 누르기·당기기·문지르기·콕은 예전과 같고, **말랑이 크기 절반 넘게 끌면 들어 옮긴다**
  (늘어난 채 따라옴), 휙 놓으면 던진다. 말랑이마다 손가락 하나, 여러 손가락으로 여러 마리 동시에. 3D 는 레이캐스트로 가장 앞 몸,
  2D 는 몸통 타원 + 폰용 넉넉한 거리. 키보드: Tab 으로 매트 위 말랑이(투명 버튼), Enter/Space = 콕(길게 = 꾹), 누른 채 화살표 = 당기기,
  화살표만 = 그쪽으로 톡 밀기.
- **선반**(`components/playroom/Shelf.tsx`, 순서는 `touch/shelf.ts`): 아래 흰 손잡이를 올리면 하얀 아크릴 선반(칸마다 투명 받침).
  등급 높은 순 → 최근 얻은 순. 나와 있는 칸은 빈 받침, 누르면 넣기. 매트가 꽉 차면 알림. 선반이 열려 있어도 매트 배치는 닫힌 손잡이 기준.
- **캡슐 열기** (`touch/capsule.ts`, 순수·테스트): v7부터 새로 얻은 말랑이는 선반에 봉인된 캡슐(등급 색 + NEW 딱지).
  꺼내면 매트에 캡슐이 떨어지고 두 손가락 비틀기(70°) · 두 손가락으로 벌리기 · 톡 세 번 · 꾹 0.9초 중 아무거나로 연다.
  비틀 때 톱니 딱(`squish.capsuleTick`) → 딸깍(`capsuleClick`) + 뽁(`popOut`) → 뚜껑이 날아가고 말랑이가 폴짝 튀어나와 철퍽 착지,
  반짝이는 `TOUCH_FX.milestone`(등급별) + 등급 진동. 연 순간 `unboxMalang`으로 저장. 캡슐은 DOM(SVG)으로 3D 캔버스 위에 그린다.
  캡슐 그림(`CapsuleArt`)은 캡슐 머신과 같은 파스텔 캡슐 + 흰 이음새 + 부드러운 그림자(잉크 외곽선 없음).
- **반응을 찾게 돕기**: 반응 표(`REACTION_UNLOCKS`)에 `howTo`(한 줄 방법)·`gesture`·`area`가 있고 기본 손짓은 `BASIC_GESTURES` —
  방법 보기 시트(`ReactionGuide`, 그림 `GestureArt`: 실루엣 + 만질 곳 + 손짓 표시, 열림/잠김 단계), 반투명 손가락 시범(`GhostFinger`,
  처음 방문·새 반응이 열릴 때·시트의 "보기", 만지면 사라짐, 움직임 줄이기면 움직이지 않는 그림), 열림 딱지 "새 반응: 이름" + 방법 줄,
  정보 패널 아래 줄은 다음 반응의 방법. 본 시범은 `localStorage['malang-playroom-demos']`(저장 데이터 아님).
  부위는 넉넉하게: 머리 = 몸 위 35%, 볼 = 그 아래 양옆 25% 띠. 머리 쓰다듬기는 1초 안에 좌우 두 번 오가거나(`rubStep`) 머리를 톡.
- 소리는 `sfx.getOutput()`(효과음 버스)으로 같은 AudioContext와 효과음 설정을 공유한다. 자체 컨텍스트를 만들지 않는다. 착지·부딪힘 소리
  (`squish.land`/`bump`)는 연타 간격 제한.
- 만지면 친밀도(`affection`)가 오른다(만진 말랑이만). 친밀도는 코인을 주지 않는다.
- **촉감** (`data/materials.ts`, 순수 데이터 + 테스트): 32종 모두 네 촉감 중 하나(`MATERIAL_BY_ID`, 없으면 탱탱 젤리).
  컴포넌트는 숫자를 들지 않는다 — 물리 모듈이 `feel`(몸 안쪽)·`world`(매트 세계)·`carryFrac`(들어 옮기기 시작 거리)만 읽는다.
  - 슬로우 라이징(모찌·빵·마시멜로…): 누를 때는 빠르고 놓으면 눌림·3D 자국이 지수 곡선으로 1.5~3초에 걸쳐 차오른다
    (`physics.relaxSpring`, 히스테리시스), 거의 안 튄다, 낮고 조용한 소리 + 차오르는 "스으"(`squish.riseSigh`).
  - 탱탱 젤리(젤리·소다·과일…): 강하고 덜 감쇠된 스프링, 매트에서 높이 튐, 높은 "뾰잉".
  - 쭉쭉이(떡·구름·솜사탕…): 늘림 한계 2.5배(같은 거리를 당겨 2~3배), 멀리 끌어야(`carryFrac` 1.1) 들려 따라오고,
    놓으면 넘치듯 튕긴다. 늘어난 길이만큼 올라가는 "쭈우욱"(`startStretch('stretchy')`의 고무 음).
  - 찐득이(펄·해파리·슬라임…): 쉬는 자세가 살짝 처짐(`sag`), 손을 떼도 `peelPlan`만큼 붙어 위로 딸려 오다 "쩍"(`squish.peel`).
    매트 마찰이 크고, 맞닿은 말랑이를 잠깐 붙잡는다(`world` 끈적임 — 둘 다 찐득이면 세게, `stickHoldMs` 뒤 풀림).
  - 소리 맛: `squish.*`의 선택 인수 `flavor`(`FLAVOR_TONES`, 순수·테스트). 인수 없으면 예전 소리 그대로.
  - 정보 패널에 촉감 딱지(`MaterialIcon` + 이름), 선반 칸 구석에 촉감 그림. 저장 구조는 그대로(캐릭터 id 에서 계산).
- **특별한 속** (전설 이상, `FILLING_BY_ID`): 반짝이 가루 속·물방울 속 별·은하 속·무지개 젤 속. 누른 만큼 밝아지고 누름이 바뀔 때
  소용돌이친다(`touch/filling.ts`, 순수·테스트). 3D 는 몸 셰이더 uniform 하나(`uFill`: 종류·소용돌이·밝기 + 두 색, 얼굴은 비켜서),
  2D 는 몸 윤곽 마스크 SVG(`FillingArt`, `--fill-glow`·`--fill-swirl`). 움직임 줄이기면 돌지 않고 밝기만. 다 식으면 그리기를 쉰다.
- **말랑이끼리** (`touch/interactions.ts`, 순수·테스트, 시간·RNG 주입): 세계 맞닿음·부딪힘에서 사건을 고른다.
  - 볼 비비기: 한 말랑이를 끌어 옆 말랑이 옆구리에 대고 1초(`rubHoldMs`) — 둘 다 빨개져 비비고 하트, 애정 +2 씩(`petMalang`),
    말랑이마다 1분에 3번까지만(`rubPetsPerMin`). 같은 쌍은 3.5초 쉬었다가 다시.
  - 쌓기: 위에 얹혀 자리 잡으면 아래는 "끙"(`strain` 얼굴: 감은 눈·물결 입·땀방울, `squish.groan`), 위는 신남.
    높이서 덮치면 둘 다 통 튄다(`popBody`, `squish.boing`).
  - 쿵: 빠르게 부딪히면 둘 다 깜짝 + 머리 위 별. 같은 촉감끼리: 젤리 둘은 더 멀리 튕기고, 찐득이 둘은 붙었다 떨어질 때 "쩍".
  - 가만히 있는 이웃끼리 가끔 서로 흘끔(`idleInteractions`, 1초마다), 옆에서 졸면 9초만 가만히 있어도 따라 졸고 숨 위상을 맞춘다
    (3D 는 `soft.timeMs` 복사, 2D 는 졸음 애니메이션 음수 지연 = 페이지 시계).
  - 방법 보기 시트: 기본 손짓·반응 표 아래 "함께 놀기"(`PAIR_PLAYS`)와 "촉감"(네 촉감 + 집중한 말랑이 표시, 특별한 속 한 줄).
- **꾸미기** (HUD 붓 버튼 → 아래 시트 `components/playroom/DecorSheet.tsx`, 무료): 매트 무늬 6가지(하늘 도트 기본 · 구름 · 파스텔 체크 ·
  딸기우유 · 민트 줄무늬 · 별밤)와 소품(쿠션 · 작은 화분 · 별 조명 · 리본 상자) 최대 3개(`MAX_PROPS`).
  - 무늬는 `data/matPatterns.ts`의 코드로 그린 타일 SVG 한 장(`matTileSvg`) → CSS 배경(`--mat-bg`, data: URL)과 사진 카드 캔버스 패턴이 같은 그림.
    id 목록·저장 검사는 첫 화면 번들에 들어가는 `data/playroomDecor.ts`에만(무늬 그림은 놀이방 청크).
  - 소품은 `data/playroomDecor.ts`의 `PROPS`(부딪힘 반지름·높이·그림 폭) + 그림 `PropArt`(색은 모두 속성 — 사진에 그대로 구움).
    새 소품은 말랑이·소품에서 먼 가장자리(`propSpot`)에 놓이고, 손가락으로 끌어 옮기면(말랑이·캡슐이 아닌 곳을 눌렀을 때 `hitProp`)
    놓은 자리(매트 바닥 기준 0..1)를 저장한다. 화면 기록은 `bodyRec.ts`의 `PropRec`(세계 장애물 id `prop:<id>`).
    3D에서는 3D 캔버스 아래 층(`.playroom__props`), 2D에서는 말랑이와 같은 층에서 깊이 순서. 크기는 `groupSprite` 기준이라 혼자 놀 때도 같다.
    움직이지 않으니 그리기 루프를 깨우지 않는다(끄는 동안만).
- **3D 젤리** (`components/touch3d/`, three.js): 무대 하나(`createJellyStage`: 렌더러·장면·카메라) 안에 몸 N개(`stage.addBody`).
  몸은 화면을 보고 서 있고 매트 깊이는 z로 두되 원근만큼 위치·크기를 되돌려 DOM 좌표와 정확히 맞춘다. 멈춘 몸은 정점을 다시 계산하지 않는다.
  윤곽 path를 부풀린 메시(`touch/jellyMesh.ts`) +
  순수 스프링 변형(`touch/softbody.ts`: 누른 자국·당김·비틀림·숨쉬기, 부피 보존, 테스트 있음).
  전체 눌림·기울기는 2D와 같은 `physics.ts` 값을 쓴다 → 소리·애정·미션이 두 버전에서 같다.
  - 겉모습은 화면 밖에 그린 실제 `<Malang>`을 구운 텍스처(`rasterMalang.ts`) — 새 말랑이·그림 수정이 자동 반영.
    몸 밖 장식은 몸 뒤/앞 평평한 카드, 외곽선은 뒤집힌 껍질. 얼굴(기쁨·졸림·놀람·깜빡임)은 텍스처 교체.
  - `loadJelly3d.ts`로 놀이방에서만 받는 청크(three는 epic과 공유 청크). 1.5초 안에 못 받거나 WebGL이 없거나
    움직임 줄이기면 같은 세계를 2D SVG 스프라이트로(간단한 눌림). 몸 하나의 텍스처가 아직 안 구워졌으면 그 몸만 2D로 보인다.
    떠나면 dispose + forceContextLoss.
  - 멈추면 그리지 않는다(숨쉬기는 놓은 뒤 약 7초만). DPR 최대 2, 느리면 자동으로 낮춘다.
- **등급별 손맛** (`data/rarity.ts`의 `TOUCH_FX`·`SHINY_TOUCH_FX` 표만 읽는다): 일반 거품 → 레어 반짝이 → 에픽 반짝이+끌기 꼬리
  → 전설 금별+몸 뒤 빛(찌르면 부푼다) → 신화·시크릿은 `epic/themes.ts` 모티프(은하 소용돌이 별, 불사조 불씨, 유니콘 무지개 하트,
  고래 거품·별 물방울·잔물결, 세라핌 빛 조각·깃털·후광 반짝). 시크릿은 가만히 있어도 모티프 입자가 떠다닌다.
  반짝은 무지개 반짝이 추가 + 3D 박막 무지갯빛. 방울 소리(`squish.chime`, 연타 간격 제한)·진동(`haptic`)도 등급 따라 커진다.
  - 입자: 순수 모듈 `touch/touchFx.ts`(풀 120개, RNG·dt 주입, 테스트) + `touchFxDraw.ts` + 캔버스 한 장(`touch3d/fxLayer.ts`,
    말랑이마다 `layer.source()` 하나 — 풀·루프는 함께).
    3D 캔버스 위에 얹고 2D 대체에서도 같다. 입자가 없으면 루프를 멈추고, 떠다니는 입자만 있으면 30fps. 움직임 줄이기면 캔버스 없음.
  - 3D 빛은 같은 렌더러 안의 텍스처 한 장 + 가장자리 빛 uniform (새 컨텍스트·후처리 없음).
- **반응** (`touch/reactions.ts`, 순수·테스트): 머리 쓰다듬기(가르랑+하트), 볼 콕(빨개짐), 배 콕(킥킥 폴짝), 빠른 연타(깔깔 흔들기),
  오래 누르기(녹아내리기, `physics.melt`), 세게 튕기기(빙글빙글 소용돌이 눈), 머리 세 번(애교 점프, `physics.hop`).
  애정 단계(`levelOf`, 50마다)로 하나씩 열린다(`REACTION_UNLOCKS`, 1단계는 기본 말랑만) — 게이지 아래 줄에 다음 반응, 열리면 축하 딱지.
  저장 구조는 그대로(애정 값에서 계산).
  - 눈길: 손가락/마우스 쪽으로 얼굴이 옮겨 간다(2D는 `.malang-face` CSS 변수, 3D는 셰이더 UV 당김). 떼면 다시 앞을 본다.
  - 만지기 전용 얼굴(`touch/faceExtras.ts`: 소용돌이 눈·하품 입·진한 볼·"끙" 얼굴)은 SVG path — 2D는 덧그린 `<svg>`, 3D는 구운 텍스처에 Path2D.
  - 가만히 8초 → 하품, 20초 → 졸기(말랑이마다 따로. 감은 눈, z 입자, 느린 숨 — 3D는 20fps로만 그림). 만지거나 세게 부딪히면 깜짝 놀라 폴짝.
- **사진 찍기** (`touch3d/photo.ts` 동적 import, 배치는 순수 `touch/photoCard.ts`): 매트 위 모든 말랑이(3D 무대 스냅샷 또는 2D SVG)+소품+입자를
  1080×1350 스카이 소다 카드(하늘 그라데이션 + 비눗방울, 흰 카드 + 파란 그림자, 사진 칸 바탕은 고른 매트 무늬 — 화면과 같은 자리·배율
  `patternPlacement`)로 PNG. 사진 칸은 모든 말랑이 그림 상자를 감싸고 여백을 준 뒤 칸 비율로 넓힌 영역(`frameGroup`, 넓히기만 해서 아무도 안 잘림,
  한 마리는 `FRAME_MIN_W`보다 확대하지 않음). 등급 칩(색 + 별 + 글자, 여럿이면 `groupRarityChips` 등급별 마릿수), 제목 글꼴 이름
  (여럿이면 `groupTitle` "말랑이 N마리와 함께"), 하트 + 애정 단계 또는 `caption`(`groupCaption`: 왼쪽부터 이름을 조사 맞춰 나란히, 길면
  "A와 친구 N마리"), 가게 이름. 캔버스 글꼴은 CSS 토큰(`--font-display`/`--font-body`)을 읽는다. 미리보기에서 한 번 더 눌러 공유(Web Share 파일) 또는 저장.
  셔터 소리 `squish.shutter`, 흰 번쩍임(움직임 줄이기면 없음).

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
- 뽑기 가격(`PULL_PRICE`): 1회 100 코인, 10연 1000 코인(할인 없음 — 모으느라 지치지 않게 "한 판 → 한 번 뽑기"가 기본 루프. 1회 뽑기 버튼이 주인공 색).
- 모든 숫자는 `economy/config.ts` 에 주석과 함께 둔다.

## 상태 저장 (`store/`)

- Zustand `persist`, key `malang-gacha-save`, `version` 필드 + `migrate`.
- 로드된 데이터는 항상 `sanitizeSave` 를 거친다: 잘못된 타입/음수/알 수 없는 캐릭터 id 제거, 기본값 보정.
  JSON 파싱 실패 시에도 초기 상태로 복구하며 앱이 크래시하지 않아야 한다.
- 현재 v8: 반짝 수(`shinyCount`), 받은 세트 보상(`claimedSets`), 친밀도(`affection`), 반짝 파트너 표시(`partnerShiny`), 일일 미션(`missions`),
  소리 설정 `settings: { sfxOn, musicOn }`(v4의 `muted: true`는 둘 다 끔으로 옮긴다. 새 플레이어는 둘 다 켬 — 음악은 첫 입력 뒤에 시작),
  받은 쿠폰(`redeemedCoupons`, v6), 놀이방(v7): `unboxed: string[]`(캡슐을 연 말랑이) + `playroom: { out: string[] }`(매트 위, 최대 `PLAYROOM_MAX_OUT` 5).
  v6→v7은 이미 가진 말랑이를 모두 연 것으로 치고 매트에는 파트너 하나. 새 플레이어의 시작 말랑이는 열린 채 매트에.
  `pull`로 새로 얻은 말랑이는 `unboxed`에 넣지 않는다(놀이방에서 캡슐로 연다). sanitize: `unboxed` ⊆ 보유, `out` ⊆ unboxed ∩ 보유, 중복 없음, 5개까지.
  꾸미기(v8): `playroom.mat`(무늬 id, 모르면 기본 `sky-dots`) + `playroom.props: {id, x, y}[]`(x·y는 매트 바닥 기준 0..1로 자름, 모르는 id·중복 제거,
  최대 3개). v7→v8은 기본 무늬·소품 없음 + 매트에는 한 마리만 남긴다(나와 있던 파트너, 없으면 처음 꺼낸 말랑이). 들어올 때마다 `soloMalang`이 한 마리로 줄인다.
  v2→v3에서 남은 뽑기권은 장당 100코인(`LEGACY_TICKET_TO_COINS`)으로 바꿔 코인에 더한다.
- 구조 변경 시: `SAVE_VERSION` 을 올리고 `persistence.ts` 의 `migrateSave` 에 단계별 변환을 추가 + 테스트.

## 테스트

- `npm test` — Vitest, node 환경, `src/**/*.test.ts`.
- 가챠: 10만 회 확률 검증을 서로 다른 시드 여러 개로 수행(±5σ 허용), 천장/비율/10연 보장/환급.
- 경제: 보상식, 판당·일일 상한, 서울 자정 경계.
- 저장: 손상/구버전 데이터 migrate.
- 놀이방: 매트 세계(충돌·쌓기 안정·에너지 감소·상한, 소품 장애물: 뚫지 않음·얹혀 쉼·올라탐·확 튀지 않음), 캡슐 손짓, 선반 순서, 성능 조절,
  화면 배치(혼자 배치·자리 옮기기), 반응 부위·쓰다듬기, 꾸미기 데이터(타일 SVG·저장 검사·놓기/치우기·빈자리), 사진 카드(`frameGroup` 모두 담기·비율,
  무늬 자리, 등급 칩·칩 줄, 단체 한 줄 조사).
- 미니게임: `logic.ts` 순수 함수 (점수, 콤보, 충돌, 스폰).
- 소리: 콤보 음계·단위 변환·클리퍼 곡선(`tuning`), 스케줄러 박자 계산·악절 생성 결정성·경로→곡(`music`), 엔진 잠금/재개/덕킹(가짜 컨텍스트), 촉감별 소리 맛(`squish`).
- 놀이방 촉감·말랑이끼리: 슬로우 라이징 회복 시간·젤리 출렁임·쭉쭉이 한계·찐득이 떼기 지연·끈적임 풀림(`touch/materials.test.ts`), 볼 비비기 시간·쉬기·1분 상한·쌓기·쿵·흘끔·같이 졸기(`touch/interactions.test.ts`).

## 미니게임 추가 방법

1. `src/minigames/<game-id>/logic.ts` — 순수 로직 (+ `logic.test.ts`).
2. `src/minigames/<game-id>/index.tsx` — `MiniGame` 객체를 default export:
   ```ts
   const game: MiniGame = { id, name, description, icon, Component };
   export default game;
   ```
   `Component` 는 `MiniGameProps`(`partner`, `partnerShiny?`, `onFinish({score, stats})`, `onExit`, `sfx`)를 받는다.
   **코인을 계산/지급하지 않는다.** 점수만 `onFinish` 로 보고.
   **파트너 말랑이가 게임 안에 꼭 보여야 한다** (주인공이거나 옆에서 응원): `minigames/shared/PartnerBuddy`
   (`<Malang>` 하나 + 표정 반응 `react('happy'|'wow'|'oops'|'sad')`/`setBase`, 전설 이상은 오라). 캔버스 게임은
   DOM 스프라이트를 월드 좌표로 옮긴다(`capsule-catch`, `malang-jump`, `stack` 참고). 궤적 색은 `partnerTrailColor`.
   CSS 클래스 접두사는 게임마다 달라야 한다(모든 게임 CSS가 함께 로드된다).
3. `src/minigames/registry.ts` 의 `MINI_GAMES` 배열에 한 줄 추가.
4. (선택) `economy/config.ts` 의 `GAME_MULTIPLIERS` 에 배율 추가 — 없으면 기본 배율 사용.

결과 화면, 최고 기록 저장, 코인 지급은 `MiniGamePage` 가 공통 처리한다.

## Git workflow

- 작업 단위별 의미 있는 커밋 (Conventional Commits: `feat:`, `fix:`, `test:`, `ci:`, `docs:`, `refactor:`).
- 커밋 전 `npm test && npm run build`.
- `main` 푸시 시 GitHub Actions가 테스트/빌드 후 GitHub Pages에 배포 (`.github/workflows/deploy.yml`). Cloudflare Pages도 `main`을 연결해 배포한다.
- 빌드는 상대 경로(`base: ./`)라 호스팅 경로와 무관하다. HashRouter를 버리면 이 전제가 깨지므로 base를 다시 정해야 한다.
