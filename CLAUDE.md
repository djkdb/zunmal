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
  app/            App(라우터), AppShell(레이아웃), routeChunks.ts (화면별 지연 청크 + 미리 받기)
  styles/         global.css — 디자인 토큰, 공용 클래스
  lib/            rng.ts (주입형/시드 RNG), share.ts (자랑하기 글·보내기 순서), josa.ts, couponLink.ts …
  hooks/          useReducedMotion, useDialogFocus(<dialog> 아닌 창의 초점 규칙) 등 공용 훅
  data/           characters.ts (말랑이 32종), rarity.ts (희귀도 메타·확률 가중치), collections.ts (테마 세트), materials.ts (촉감·특별한 속),
                  materialIds.ts (촉감 id·이름·`materialCoverage` — 첫 화면용), affection.ts (애정 단계 levelOf + 단계별 반응 표 REACTION_UNLOCKS), collectionProgress.ts (도감·세트 진행 요약), playroomDecor.ts (놀이방 무늬 id·소품·저장 검사), matPatterns.ts (매트 무늬 타일 그림, 놀이방 청크 전용)
  gacha/          engine.ts — 순수 가챠 엔진 (UI/Zustand/DOM 의존 금지)
  economy/        config.ts (모든 밸런스 숫자), economy.ts (보상/구매 계산), daily.ts (서울 날짜),
                  playReward.ts (로비 예상 코인·오늘 막대·결과 영수증), shop.ts (디저트 가게 방치 수입),
                  shopPreview.ts (직원 바꾸기 미리 보기, 가게 청크 전용), gift.ts (하루 한 번 말랑 선물),
                  affection.ts (친밀도 진행: 단계·하트·다음 단계에 받는 반응/가게 보너스/선물)
  audio/          sfx.ts (합성 효과음 + 믹서), music.ts (절차적 배경음악, 첫 입력 뒤 지연 로드), tracks.ts (경로 → 곡), tuning.ts (음높이·음량 헬퍼) — 파일 없음
  store/          useGameStore.ts (Zustand+persist), persistence.ts (sanitize/migrate)
  components/     Malang, TopBar, GachaMachine(+ machine3d/ 3D 머신), PullResult, Collection, RateTable, MiniGameLobby, MiniGameResult,
                  shop/(홈 ShopCard + 가게 화면 조각), home/(홈 허브: GoalCard, HubStatus, TodayStrip, useHub),
                  collection/(도감 요약·다음 목표·세트 목록·못 만난 캡슐), AffectionMeter(친밀도 하트 게이지) …
  minigames/      types.ts, registry.ts, lobby.ts (로비 칩 거르기), shared/(HUD·카운트다운), <game-id>/{index.tsx, logic.ts, logic.test.ts}
  missions/       missions.ts — 일일 미션 생성/진행/보상 (순수)
  goals/          홈 허브 판단 (순수): hubState.ts (저장+시각 → 지금 상태), nextGoal.ts (다음 목표 후보·우선순위),
                  firstRun.ts (첫걸음 6단계), today.ts (오늘 줄), alerts.ts (홈 탭 빨간 점)
  pages/          HomePage, GachaPage, CollectionPage, MiniGamePage, TouchPage(놀이방), ShopPage(디저트 가게)
```

의존 방향 (위가 아래를 import 가능, 역방향 금지):

```
pages → components → goals → store → gacha / economy / missions → data → lib   (goals 는 store 의 타입만 import)
minigames → (types, lib, data, audio 타입)   ※ store/economy import 금지
```

- 라우팅: `HashRouter` (GitHub Pages 새로고침 404 회피). 경로: `/`, `/play`, `/play/:gameId`, `/gacha`, `/collection`, `/shop`, `/touch`, `/touch/:id`.
- 외부 이미지/사운드 파일 사용 금지. 캐릭터는 SVG, 소리는 WebAudio로 생성한다. (3D 연출·3D 머신도 코드로 만든 도형·셰이더·캔버스 텍스처뿐)
- three.js는 신화 연출·3D 머신·놀이방 3D가 쓰는 한 청크로만 받는다(동적 import). 첫 화면 번들에 정적 import 금지.
- **첫 화면 번들 = 홈만.** 뽑기·도감·미니게임·가게·놀이방은 `app/routeChunks.ts`의 지연 청크(`ROUTE_CHUNKS`, 공용 `PageLoading`)다.
  AppShell이 한가할 때 뽑기·도감을, 링크에 pointerdown·hover·focus가 닿으면 그 화면을 미리 받는다(`prefetchRoute`, 데이터 절약 모드면 한가할 때 받기는 건너뜀).
  청크를 못 받으면 `ErrorBoundary`가 "화면을 받지 못했어요" + 다시 불러오기. 새 화면도 여기에 한 줄 추가한다.
  글꼴 조각은 data: URL로 박지 않고(`assetsInlineLimit`), @fontsource의 woff 대체 파일은 `vite.config.ts`의 `woff2Only`가 지운다
  (둘 다 없으면 첫 화면 CSS가 gzip 약 70kB 불어난다). `music.ts`도 첫 입력 뒤 음악이 켜져 있을 때 `useRouteMusic`이 받는다.

## 코딩 컨벤션

- TypeScript `strict` + `noUncheckedIndexedAccess`. `any` 금지, 배열 인덱싱 결과는 undefined 처리.
- 컴포넌트에 밸런스 숫자 하드코딩 금지 → `economy/config.ts` 또는 `data/rarity.ts`.
- 순수 로직(엔진, 경제, 미니게임 logic.ts)은 React/DOM/Zustand에 의존하지 않고 RNG·시간을 주입받는다.
- 컴포넌트는 함수형 + named export. 파일명은 PascalCase(컴포넌트) / camelCase(모듈).
- 스타일은 `global.css` 토큰 + 컴포넌트별 CSS 파일(`Component.css`)을 컴포넌트에서 import.
- 접근성: 모든 인터랙션은 `<button>`/`<a>` 등 네이티브 요소로, 44px 이상 터치 타깃, `:focus-visible` 유지,
  희귀도는 색 + 아이콘 + 텍스트로 표현, `prefers-reduced-motion` 존중(`useReducedMotion`).
- 창: 가능하면 `components/Modal`(네이티브 `<dialog>`: 초점 가둠·Esc·닫으면 연 버튼으로). 화면 위에 직접 그린 `role="dialog"`(놀이방 시트·사진)는
  `hooks/useDialogFocus`로 같은 규칙을 지킨다. 창이 열려 있으면 `html:has(dialog[open])`이 뒤 화면 스크롤을 잠근다. 모달 높이는 safe-area를 뺀 `100dvh`.
- 알림 영역(`role="status"`/`aria-live`)은 사건 한 번에 한 줄만 — 몇 초마다 오르는 숫자(가게 코인, 게임 점수)에는 붙이지 않는다.
  그 자리에서 받기 버튼이 사라지면 초점을 문서 처음으로 떨어뜨리지 않는다(도감 세트 보상: 받은 줄 또는 지금 탭으로).
- 진동은 `lib/haptics`(`haptic`)나 try/catch로 감싼 `navigator.vibrate?.()`만 (iOS엔 없고 일부 앱 안 브라우저는 예외를 던진다).
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
| 금빛(천장·코인) / 위험 | `--gold` / `--danger`(채움·선만) | #F2C14E / #F0506E |
| 좋아짐 / 나빠짐 / 레몬 글자 | `--good-ink`+`--good-tint` / `--bad-ink`+`--bad-tint` / `--lemon-ink` (글자는 늘 화살표·체크·말과 함께) | #1C6B3E #DFF6E8 / #B3203F #FFE3E8 / #7A5200 (모두 AA) |
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
- **홈 파트너**: 누르면 놀이방(`/touch`) — 링크 이름 "말랑이 만지러 가기". 아직 아무도 쓰다듬지 않았으면(`affection`이 모두 0, 저장 구조 변경 없음)
  "꾹 눌러 봐요" 말풍선 + 톡 누르는 손가락(`TapIcon`)이 붙는다(절대 위치 — 360×640 첫 화면 규칙 유지, 움직임 줄이기면 정지).
  파트너 말풍선은 **한 번에 하나**: 선물 쿠폰 > 말랑 선물 > 받은 뒤 한 줄 > "꾹 눌러 봐요" > 인사. 인사는 처음 온 날 "만나서 반가워요!"("오늘도" 아님).
  코인이 `PULL_PRICE.single`보다 적으면 주인공(딸기우유) 버튼이 "미니게임으로 코인 벌기"(`/play`)가 되고 캡슐 뽑기는 보조 버튼.
- **홈 허브** (아래 **홈 허브** 절): 파트너 아래 "다음 목표" 카드 하나가 지금 할 한 가지를 알려 준다.
- **캡슐 머신**: 반투명 흰 돔 + 파스텔 캡슐(흰 이음새, 부드러운 그림자) + 딸기우유 몸통 + 흰 "MALANG" 이름표 + 흰 손잡이 + 어두운 배출구.
  기본은 같은 구성의 3D(아래 가챠 규칙의 **3D 캡슐 머신**), SVG는 대체용.
  등급이 높을수록 연출(빛·흔들림·신화 이상 전체 화면)이 화려해지는 건 그대로다.
- **금지**: 굵은 잉크 UI 테두리·잉크색 아랫단 그림자, 흰 글자 + 잉크 외곽선(`-webkit-text-stroke`) 제목, 크림 바탕, 스프링클 무늬,
  이모지 아이콘, `.eyebrow` 외의 제목 위 작은 라벨, `A · B · C` 가운데점 나열, 버튼 끝 `→`, 넓은 영역의 무거운 blur,
  섹션마다 등장 애니메이션.
- **이전 이름**(`--cream`, `--paper`, `--berry`, `--soda`, `--matcha`, `--ink-soft`, `--line`, `--keycap` …)은 호환용 별칭으로만 남아 있다
  (미니게임 속 그림과 결과 화면 일부가 아직 쓴다. 놀이방 `/touch`는 새 토큰으로 옮겼다). 새 코드에서 쓰지 말고, 다시 칠할 때 위 토큰으로 옮긴다.
  미니게임 안의 게임 그림(블록·컵·점수 튀어나옴 등)은 자기 그림을 유지해도 되지만 틀·버튼·HUD는 토큰을 따른다.
- **조사**: 말랑이 이름 뒤 조사는 직접 쓰지 말고 `lib/josa.ts`의 `josa(name, '과/와')`로 받침에 맞춰 붙인다.
  숫자로 끝나면 읽는 소리로 고른다(`josa('Lv.5', '이/가')` → "Lv.5가", "Lv.3이", "300과").
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
- 천장 때문에 실질 전설 이상 확률은 약 4.2% — 확률표에 함께 공개한다. 확률 입구는 뽑기 화면 아래 "확률 안내 보기" 하나.
- **1회는 머신 캡슐이 곧 열기**: 머신의 캡슐을 누르면 결과 창이 이미 열린 채 뜬다(`seenIndex=0` + `seenByMachine` — 결과음·빛 조각·전설 번쩍은
  창이 뜰 때 낸다). 신화 이상은 그대로 전체 화면 연출이 먼저. 결과 창에서 다시 까는 회색 캡슐은 없다(대체로 남은 `SingleCapsule`도 윗뚜껑은 등급 색).
  세 번째 열기(놀이방에서 손으로 까기)는 그대로 — 안내 줄이 "놀이방에서 직접 까 보세요"로 미리 알려 준다.
- **결과 창**(`PullResult`): 10연 캡슐은 열기 전에도 등급이 보인다(사용자 요청). 열기 전 카드는 앞면(이름·그림)을 아예 그리지 않는다 —
  DOM·스크린리더에 결과가 새지 않게, 이름표는 "레어 캡슐 3 열기"뿐. 연 카드 이름표는 "이름, 등급, 촉감, 새 말랑이". 반짝 결과에는 등급과 따로 "반짝!" 딱지(최고 카드는 "최고 반짝!"),
  "최고" 리본은 카드 위 왼쪽(환급 딱지는 안쪽 위 오른쪽, 촉감 그림은 안쪽 위 왼쪽 — 1회 결과는 등급 배지 옆 촉감 딱지).
  새 말랑이가 있으면 "새 말랑이는 캡슐째 기다려요. 놀이방에서 직접 까 보세요"(여럿이면 "새 말랑이 N마리는 놀이방에서 직접 까 보세요") +
  "지금 만지러 가기"(가장 좋은 새 말랑이 `summarizePulls().bestNewIndex` → `/touch/:id`, 놀이방이 그 캡슐을 매트에 떨어뜨린다).
  - 딱지는 어디서나 같은 모양: NEW(처음 만남 + 첫 반짝) · 중복 [코인]+N(좁은 10연 카드만 "중복" 글자 생략) · 반짝!. 설명 띠에도 같은 딱지.
  - 다 열면 요약 줄(`dl`, 칸으로 나눔): 새 말랑이 N(= NEW 딱지 수) · 반짝 N · 환급 +N · 도감 N/32(도감 링크) · 전설 이상까지 N회(뽑은 뒤 천장).
    1회는 도감과 천장만. 그 아래 행동은 한 곳(`ResultActions`, 위계 하나): [한 줄 안내] + **주인공 버튼**(새 말랑이가 있으면 "지금 만지러 가기",
    없고 코인이 모자라면 "미니게임에서 코인 모으기") + 줄(**다시 뽑기**(방금과 같은 방식, `againRef`로 한 번만, 주인공이 없으면 이것이 딸기우유) · 자랑하기(있을 때) · 닫기).
    코인이 모자라면 다시 뽑기는 비활성(`aria-describedby`로 이유) + 줄 아래 "N코인 더 모으면 다시 뽑을 수 있어요"(`economy.coinsNeededForPull`),
    주인공이 만지러 가기면 그 줄에 "미니게임에서 코인 모으기" 글자 링크.
- **뽑기 버튼**: 1회 = 캡슐 하나 아이콘(딸기우유 주인공), 10연 = 캡슐 더미 아이콘(`CapsuleStackIcon`) + 위 모서리 레몬 딱지 "레어 이상 1개 보장"
  (`GACHA_RULES.multiGuaranteeMinRarity`). 누르면 버튼 눌림 + 아이콘이 톡 튀고(움직임 줄이기면 없음) `haptic('tap')`.
  1회도 못 뽑으면 버튼 아래 "1회 뽑기까지 N코인 더 필요해요" + "미니게임에서 코인 모으기".
- **결과를 미리 알리지 않기**: 중복 환급은 뽑는 순간 저장되지만 코인 알약에는 미뤄 두고(`coinFx.deferCoins`), 캡슐을 모두 열면
  요약 줄에서 코인이 날아간다(`releaseDeferredCoins`). 천장 카운터도 같은 순간(`onRevealed`)에 바뀐다. 창을 닫거나 화면을 떠나면 바로 풀린다.
- **등급 차별화**: 등급마다 캡슐 색, 머신 흔들림, 결과음(`playRarityFanfare`), 결과 모달 테두리가 다르다.
  시크릿은 화면이 어두워지는 예고 단계(`tease`)와 밤하늘 테마 결과 모달이 따로 있다.
- **3D 캡슐 머신** (`components/machine3d/`, three.js): 뽑기 화면의 머신은 유리 돔 + 딸기우유 몸통 + 흰 손잡이·배출구·받침을
  코드로 만든 3D(물리 기반 재질 + `RoomEnvironment` 반사 + 키 라이트 그림자 한 장 512px + 구운 바닥 번짐). 돔 속 캡슐 더미(두 색 캡슐 19 ·
  광택 공 · 진주(무지갯빛) · 크롬 마디 공·네잎 꽃, 30개)는 순수 공 쌓기 풀이기 `machine3d/pile.ts`(Verlet, 시드 고정, 테스트)로 불러올 때
  가라앉히고, 뽑을 때 `stirPile`로 휘저어 다시 가라앉힌다. 인스턴스 메시 6개라 그리기 호출이 적다.
  - 연출 단계는 여전히 `GachaMachine`이 정하고(`setPhase`) 3D는 그리기만: 투입(동전) → 흔들림(손잡이 한 바퀴 + 더미 휘젓기, 등급만큼
    세게, 에픽 이상은 돔 속 등급 빛) → 시크릿 예고(불이 깜빡이며 꺼짐) → 낙하(배출구 덮개가 들리고 캡슐이 폴짝 → 받침에 철퍽, 전설은
    보라로 떨어져 착지 때 금빛 승격) → 대기(흔들흔들 + 등급 빛·빛살) → 열기(뚜껑이 날아감). 결과 캡슐 윗면은 SVG와 같은 색(신화 무지개·시크릿 밤하늘 텍스처).
  - 캔버스는 장식(`aria-hidden`)이고 SVG 머신 상자보다 옆 14%·위 4%·아래 6% 크다(`STAGE_PAD` ↔ `.machine__stage3d`). 캡슐 열기 버튼은
    그대로 DOM — 3D 캡슐을 투영한 자리(`onHeroRect` → `--hero-x/y/size`)에 투명하게 올린다. 반짝이·고리는 DOM, 빛·빛살은 3D.
  - 돔 유리는 반사만 그리는 재질(검은 바탕 + 알파 = 반사 밝기, 미리 곱한 알파 "over") + 가장자리 프레넬 막. 투명 캔버스 위 가산 합성은
    스프라이트 대신 `premultipliedAlpha` 평면으로(스프라이트 셰이더는 미리 곱한 알파가 없어 하얗게 뜬다).
  - **대체**: `loadMachine3d.ts`로 뽑기 화면에 들어올 때 받는다(three는 epic·touch3d와 같은 청크, 정적 import 금지). 1.5초 안에 못 받거나,
    WebGL을 못 만들거나, 움직임 줄이기거나, 계속 20fps 아래면(먼저 DPR 2 → 1로 낮춤) 예전 SVG 머신 그대로. 셰이더를 `compileAsync`로
    컴파일한 뒤 0.25초 교차로 바꾸고, 연출 도중에는 바꾸지 않는다. 개발 서버 스크린숏은 `localStorage['machine-keep-3d']='1'`로 성능 조절을 끈다.
  - 움직일 때만 그린다(숨쉬기·대기 흔들기는 30fps, 가만히 몇 초 뒤 멈춤, 그림자도 움직일 때만 다시 굽기). 돔을 톡 치면 캡슐이 들썩인다.
    언마운트 시 dispose + `forceContextLoss`.
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
    → 주요 버튼 바로 아래에 **늘 접힌** 두 줄 요약 + 주 버튼 하나("브라우저로 열기" — 안드로이드 Chrome intent, iOS 17+ `x-safari-https`, https에서만;
    바로 여는 주소가 없으면 "링크 복사") + "자세히". 메뉴 위치 안내·링크 복사·기록 코드 복사는 모두 "자세히" 안 — 저절로 펼치지 않는다
    (돌아온 방문에 기록 코드 문단이 늘어나던 문제).
  - 안드로이드 Chrome은 `beforeinstallprompt`를 앱 시작 시(`app/installPrompt.ts`) 붙잡아 설치 창을 띄우고, iOS는 공유 → 홈 화면에 추가 순서를 보여 준다.
  - 이미 앱으로 열었으면(standalone) 안내하지 않는다. 설치 카드는 닫으면 7일간 숨긴다.

## 쿠폰·링크 미리보기

- 쿠폰: 목록은 `economy/config.ts`의 `COUPONS`(id·코드·코인·이름·기간), 확인은 순수 모듈 `economy/coupons.ts`(대소문자·공백 무시, 저장당 1회).
  받은 쿠폰 id는 저장 v6 `redeemedCoupons`. 입력 칸은 홈 아래 `components/CouponBox.tsx`. 서버가 없어 코드는 앱 안에 있다(선물용, 보안 수단 아님).
  현재: `zun` = 오픈 기념 1000코인. 쿠폰 칸 아래 "인스타 공지나 DM에서 받은 코드를 넣어요".
- **선물 링크**: 인스타 DM·공지에는 `https://zunmal.pages.dev/?c=zun`(HashRouter라 `#/?c=zun`도 됨)을 보낸다. 앱 시작 때(`main.tsx`,
  라우터보다 먼저) `app/couponLink.ts`가 순수 모듈 `lib/couponLink.ts`(`parseCouponLink`, 테스트)로 코드를 꺼내고 주소에서 `c`를 지운다.
  코드는 저장이 아니라 이번 실행 동안만 들고 있고, 홈 파트너 말풍선 자리에 "선물 쿠폰이 도착했어요 + 받기"(받을 수 있을 때만, 이미 받았으면 버림),
  쿠폰 칸은 미리 채워진다. 받기는 쿠폰 칸과 같은 `redeemCoupon` — 저장당 한 번.
- **자랑하기**(`lib/share.ts` 순수·테스트 + `components/ShareButton.tsx`): 뽑기 결과에 에픽 이상·반짝·새 말랑이가 있으면
  (`pullReveal.shareHighlightIndex`) 결과 창에, 도감 상세에는 항상. 글 = 한 줄(“방금 신화 말랑이 은하 말랑을 뽑았어요!” / “내 파트너 말랑이를
  소개해요!” + 이름·친밀도 Lv) + "내 말랑 도감 N/32" + "나도 말랑이 뽑기", 주소는 `SHARE_URL`(`https://zunmal.pages.dev/`, 쿠폰·추적 값 없음).
  이모지는 공유 글에만(반짝일 때 하나) — 화면에는 없다.
  - **카드 그림**(인스타그램은 글보다 그림): 파일 공유가 되는 브라우저(`canShare({ files })`)면 버튼이 보일 때 한가할 때 PNG를 미리 만든다
    (`components/share/shareCard.ts` 지연 청크 → 놀이방 사진과 같은 `touch3d/photo.ts` `composePhoto`: 하늘 도트 매트 위 말랑이 한 마리 + 등급 칩 + 이름 +
    하트 한 줄 + 아래 왼쪽 주소 `zunmal.pages.dev` + 가게 이름). 원본은 버튼 옆 화면 밖 `<Malang>`(`.share__src`)을 굽는다. 글(제목·한 줄·파일 이름)은
    순수 `shareCardText`("방금 처음 만났어요"/"방금 뽑았어요", 도감은 "[내 파트너] 친밀도 Lv.N"). 뽑기 결과는 `shareHighlightIndex`의 말랑이, 도감 상세는 그 말랑이(보고 있는 반짝 모습).
    누른 뒤 그림을 1.2초까지만 기다린다(공유 창은 사용자 입력 직후에만 열려서) — 못 만들면 글만.
  - 보내기(`runShare(c, env, files)`): 그림 + 글 + 주소 → Web Share(글 + 주소) → 클립보드 → 직접 복사(`.selectable` 글 상자).
    어느 단계든 공유 창을 닫으면(AbortError) 조용히. 복사하면 말풍선 대신 **버튼 글자가 잠깐 민트 체크 "복사했어요"**(알림 영역은 "링크를 복사했어요") —
    도감 상세 2×2 행동에서 말풍선이 옆 버튼을 가리던 문제.
- 링크 미리보기: `index.html`의 og/twitter 메타 + `public/og.png`(1200×630, `scripts/render-og.mjs`로 실제 말랑이 SVG에서 생성 — 스카이 소다:
  하늘 바탕·머리글·제목 글꼴 Jua(`@fontsource/jua`, 본문은 `src/assets/fonts`의 NanumSquareRound가 있으면)·흰 칩·도트 매트 위 말랑이). 배포 주소 `https://zunmal.pages.dev`.

## 컬렉션 (`data/collections.ts`, 도감 화면 `components/Collection.tsx` + `components/collection/`)

- 테마 세트(디저트 가게, 깊은 바다, 꿈의 끝 …). 한 말랑이가 여러 세트에 속할 수 있다.
- 세트를 완성하면 한 번 코인 보상(`SET_REWARD_COINS`, 등급 small~ultimate). 일일 상한과 무관.
- 도감 상세는 반짝을 가졌으면 반짝 모습부터 연다(파트너로 원래 모습을 고른 경우만 원래 모습).
- **도감 화면**은 모으고 싶게 만드는 곳이다. 값은 모두 `summarizeCollection`(`data/collectionProgress.ts`) 하나에서 온다. 순서:
  제목 → **요약**(`CollectionSummary`: 딸기우유 비율 고리 + 주아 큰 "17 / 32" + 남은 수 + 반짝 N종 알약, 아래 등급 칸 3칸×2줄 =
  배지(색 + 모양 + 글자) / N/M + 등급색 막대, 다 모으면 민트 + 체크, 누르면 그 등급 진열장으로 스크롤 — 360×640에서 다음 목표 카드가 첫 화면에 걸리게 낮게) → 탭(말랑 도감 / 컬렉션,
  받을 세트 보상이 있으면 컬렉션 탭에 빨간 점) → 도감 탭: **다음 목표**(`CollectionGoal`) + 등급별 진열장 / 컬렉션 탭: 세트 목록.
- **다음 목표** 카드: 받을 세트 보상이 있으면 "○○ 세트를 다 모았어요" + 보상 받기(그 자리에서, `useSetClaim`: ref 잠금 + 코인 날리기),
  아니면 `nearestSet` — "○○ 세트까지 N마리 남았어요" + 막대 + 없는 말랑이 캡슐(최대 4, 나머지 "+N") 과 등급 배지 +
  "완성하면 N코인" + "평균 N번쯤 뽑으면 모여요"(`expectedPullsToCollect`: 한 마리씩 나오는 수집 문제의 정확한 식, 천장 무시 →
  `roughPullCount`로 둥글림) + 캡슐 뽑기(코인이 모자라면 "미니게임으로 코인 벌기"). 세트를 모두 받았으면 없다.
- **세트 카드**(`SetList`): 이름·설명 + 코인 보상 알약 + 막대 N/M + 멤버(가진 것 = 누르면 상세, 없는 것 = 못 만난 캡슐) +
  아래 줄(받을 수 있음 = 보상 받기 / 받음 = 민트 "보상을 받았어요" / 진행 중 = "N마리 남았어요" + 가장 드문 말랑이 등급 배지).
  순서는 `orderSetsForDisplay`(받을 수 있음 → 시작한 세트 남은 수 순 → 시작 안 한 세트 덜 비싼 순 → 받은 세트), 탭을 열 때 한 번 정한다
  (받자마자 카드가 튀지 않게).
- **못 만난 말랑이**(`MysteryMalang`): 위 반쪽 등급 색 + 흰 아래 반쪽 + 흰 이음새 캡슐 속 등급 색 실루엣과 "?" + 구석의 등급 모양
  (시크릿은 밤하늘 캡슐 + 금 이음새). 이름 자리는 "???". 실루엣 색은 `Malang`의 `.malang-silhouette`(`--malang-silhouette`) 변수로 입힌다.
- **진열장 칸**: NEW 딱지(딸기우유 알약 — 뽑기 결과·선반과 같은 모양)는 `isNewInCollection` = 아직 캡슐 속(봉인)이거나 처음 얻은 지
  `COLLECTION_NEW_MS`(24시간) 안. 파트너 딱지가 있으면 NEW 는 쉰다. 반짝 표시, 친밀도 2단계부터 창 오른쪽 아래 작은 하트 + 단계.
- **상세 창**: 등급 배지 + **촉감 딱지**(`MaterialTag`: 촉감 그림 + 이름) → 이름 → 가진 수·반짝·코인 보너스 칸 + **친밀도 칸**(`AffectionMeter`) + 반짝 모습 보기
  + 창 아래에 붙은 행동 2×2(파트너로 정하기·만지기 / 자랑하기·닫기).
- **촉감 보이기**: 촉감은 말랑이 팬이 고르는 기준이라 고르는 자리마다 보인다 — 첫 말랑이 고르기 카드(촉감 딱지 + `STARTER_FEELS` 한 줄 "천천히 차오르는 모찌"),
  도감 상세, 뽑기 결과(1회 = 딱지, 10연 = 그림만 + 이름표), 도감 요약 "촉감 4종 중 N종" 알약(`materialCoverage`, 다 만나면 민트).
  첫 화면용 그림은 `components/MaterialIcon.tsx` — 놀이방 `playroom/MaterialIcon`과 같은 그림을 따로 둔다(한 모듈을 나눠 쓰면 번들러가 첫 화면을 조각 9개로 쪼갠다, 측정). 그림을 고치면 둘 다.
- 세트 보상을 그 자리에서 받으면(`useSetClaim(onClaimed)`) 도감의 상태 줄이 "○○ 세트 보상 N코인을 받았어요"를 읽는다.
- 첫 말랑이 고르기 화면은 도감 설명 대신 `STARTER_BLURBS`(`data/characters.ts`, 등급 이야기 없는 따뜻한 존댓말 한 줄)를 보여 준다.

## 일일 미션 (`missions/missions.ts`, `components/DailyMissions.tsx`)

- 서울 날짜로 시드를 만든 미션 3개(서로 다른 종류, 쉬움/보통/어려움 하나씩). 모든 기기에서 같은 날 같은 미션.
- 종류: 미니게임 N판, 캡슐 N개 뽑기, 말랑이 N번 쓰다듬기, 미니게임 코인 N개, 최고 기록 깨기.
- 진행은 store 액션(`finishMiniGame`, `pull`, `petMalang`)이 기록한다. 보상(`MISSION_REWARD_COINS`) + 올클리어 보너스.
  하루 기록(`progress`)은 미션이 아닌 사건도 센다(`DAILY_EVENT_KINDS`: + `shop-claim`) — 홈 "오늘" 줄이 읽는다. 날짜가 바뀌면 함께 비운다.
- 받을 보상이 있으면 홈 탭에 빨간 점(선물·가게 가득 참·봉인 캡슐도 — `goals/alerts.ts`).

## 말랑 디저트 가게 · 말랑 선물 (`economy/shop.ts`, `economy/gift.ts`, `components/shop/`, `pages/ShopPage.tsx`)

- 미니게임 반복이 귀찮다는 요청으로 만든 **방치형 수입**. 캡슐을 연(`unboxed`) 말랑이가 가게 직원으로 일하며 실제 시간만큼 코인을 모은다(앱을 닫아 둬도).
- 칸: 모은 말랑이 종류 수로 1/4/8/15/24마리 → 1~5칸(`SHOP_SLOT_UNLOCKS`). 시작 말랑이가 첫 직원, 캡슐을 처음 열면 빈 칸에 자동으로 들어간다.
  직원은 언제든 바꾼다(`setShopStaff`) — 바꾸기 전에 번 코인을 `banked`에 정산해 잃지 않는다.
- 시간당 = 희귀도 기본(`SHOP_RATE_PER_HOUR` 10/12/14/17/20/24) × (1 + 친밀도 단계당 5%·최대 25% + 반짝 25% + 촉감 특기 + 세트).
  특기(`SHOP_MATERIAL_PERKS`, 가게 화면에 한 줄): 슬로우 라이징 = 가득 참 +1시간(최대 +2), 탱탱 젤리 = 자기 +10%, 쭉쭉이 = 다른 직원 +5%씩,
  찐득이 = 친밀도 보너스 두 배. 세트: 같은 컬렉션 직원이 n마리면 그들에게 +(n−1)×10%(여러 세트면 가장 큰 것 하나, "디저트 가게 세트 +20%" 칩).
- 가득 참 8시간(`SHOP_CAP_HOURS`)어치에서 멈춘다. 시계: 경과 = clamp(now − lastTickAt, 0, 가득 참), 거꾸로 가면 주지 않고 기준을 지금으로. 한 번에 가득 찬 양까지만.
  받기는 ref 잠금 + 코인 날리기(`useShopClaim`). 미니게임 일일 상한과 무관. 목표 경제(하루 16시간 가정)는 config 주석 + `shop.test.ts`.
- 홈: 오늘의 미션 카드 아래 `ShopCard` — CSS 차양 + 창 속 직원 얼굴, 4초마다 오르는 코인, 가득 참 막대, 받기. 카드 = `/shop` 링크.
- `/shop`(지연 청크, 음악은 collection 곡): 제목이 곧 간판인 코드 그림 가게(`ShopFront`: 줄무늬 차양, 선반, 직원이 카운터 뒤에서 행주질·쟁반·폴짝,
  유리 진열장 디저트 — 움직임 줄이기면 정지), 계산대(모인 코인·막대·받기·세트 칩), 직원 칸(시간당·보너스 칩·특기, 빈 자리, 잠긴 칸 "말랑이 N마리 모으면 열려요"),
  고르기 창 `StaffPicker`.
  - 계산대 요약: 모인 코인 "152 / 500"(가득 찬 양) + 막대 + "6시간 58분 뒤에 가득 차요"(`msUntilFull`, `formatDuration`), 세 칸(시간당 · 일하는 말랑이
    N/M칸 · 가득 참 N시간), "말랑이 N마리 더 모으면 한 칸 더 열려요"(`malangsUntilNextSlot`). 직원 칸 칩 맨 앞은 "기본 N"(희귀도 기본값).
  - 고르기 창: 위에 "지금 이 자리: 이름 시간당 N코인", 말랑이마다 "지금 50 [화살표] 54코인/시간"(가게 **전체**) + 변화 딱지(오름 민트·위 화살표·"+8%",
    내림 빨강·아래 화살표, 그대로 회색 두 줄, 지금 일하는 말랑이는 "일하는 중") + 세트가 생기거나 깨지는 한 줄. 가게 전체가 가장 많이 오르는 순.
    숫자는 `economy/shopPreview.ts`의 `previewStaffChange`(assignStaff → computeShopRates → `shownPerHour`) — 화면 합계와 같은 함수라 고른 뒤 값이 똑같다.
    화살표는 글자(→) 대신 SVG(`ToIcon`, `TrendIcon`).
  가게 화면 글자(`components/shop/perks.ts`)·아이콘(`shopIcons.tsx`)은 가게 청크에만 둔다. 고르기 창은 공용 `components/Modal`
  (모든 화면이 지연 청크가 되어 Modal은 작은 공용 청크로 나뉘고 첫 화면과 무관하다).
- **말랑 선물**: 서울 날짜로 하루 한 번, 친밀도가 가장 높은 연 말랑이(같으면 파트너)가 선물 상자를 가져온다. 코인 = 60 + 애정 단계 × 15, 최대 195(`GIFT_COINS`, 9단계에서 최대 — 친밀도 최대 단계 그대로).
  가져온 말랑이가 홈 무대 파트너 옆에 코드로 그린 선물 상자를 들고 나타난다(`components/home/GiftBringer`, 절대 위치라 무대 높이 그대로;
  파트너가 가져왔으면 상자만 발치에). 상자를 톡 누르거나 말풍선 "열기" → 상자가 눌렸다 뚜껑이 날아가고 반짝이 + 코인 한 닢이 쏙,
  코인은 상자에서 알약으로 날아간다(ref 잠금, 움직임 줄이기면 열린 모습으로 바로). 받은 뒤 한 줄 "○○의 선물 N코인을 받았어요!" 동안 말랑이가 남아 있다.
  상자 버튼은 포인터용 지름길(`tabIndex -1`) — 키보드·화면 읽기는 말풍선 "열기".
  홈 파트너 말풍선 자리(선물 쿠폰 > 말랑 선물 > 받은 뒤 한 줄 > 인사), 선물이 떠 있으면 "꾹 눌러 봐요"는 쉰다. 새 플레이어는 다음 날부터.
  가게 코인을 받으면 미션 하루 기록에 `shop-claim`을 센다(홈 "오늘" 줄).

## 홈 허브 (`pages/HomePage.tsx`, `components/home/`, `goals/`)

홈은 "지금 할 한 가지"를 알려 주는 허브다. 순서(위 → 아래): 간판 → 파트너(말풍선·"꾹 눌러 봐요" 그대로) → **다음 목표 카드** → 주요 버튼 두 개
(미니게임 / 캡슐 뽑기, 코인에 따라 주인공 색이 바뀜) → [앱 안 브라우저 카드] → 상태 줄 → 오늘 줄 → 오늘의 미션 → 가게 카드 → 쿠폰 → 설치 카드.
360×640(320 폭 포함)에서 목표 카드와 주요 버튼까지 첫 화면에 들어온다 — 무거운 튜토리얼 덮개는 두지 않는다.

- **상태는 모두 저장에서 계산**(새 저장 필드 없음): `readHub(save, nowMs)`(`goals/hubState.ts`)가 오늘(서울)·남은 일일 코인·천장까지·봉인 캡슐(선반 순서)·
  첫날 여부(가장 먼저 얻은 말랑이의 날짜)·오늘 미션·선물·가게(`ready` = 가득 참 또는 `GOAL_THRESHOLDS.shopReadyCoins` 이상 또는 받으면 바로 뽑을 수 있음)·
  도감 요약을 한 번에 만든다. 화면은 `components/home/useHub.ts`(저장 + 15초마다)로 받는다.
- **다음 목표** (`goals/nextGoal.ts`, `GOAL_ORDER` 순, 테스트): 선물 → 미션 보상(올클리어 보너스) → 첫걸음 → 세트 보상 → 가게 → 봉인 캡슐(`/touch/:id`)
  → 천장 가까움(`pityCloseWithin`) → 조금 남은 미션("1판만 더 하면 +50코인", `missionNearRatio`) → 거의 다 모은 세트(`setNearMissing`)
  → 뽑기 → 코인 모으기(모자란 양, 오늘 게임 코인이 남았을 때만) → 파트너 애정(늘 있는 마지막 — `affectionProgress` 그대로:
  막대 = 단계 안 비율, 글자 "Lv.N", 설명 = 다음 단계에 생기는 첫 가지 "Lv.3이 되면 새 반응 볼 콕" 또는 "친밀도 N만 더 쌓으면 Lv.N+1이 돼요"). 문턱값은 `economy/config.ts` `GOAL_THRESHOLDS`.
  목표 = 종류·아이콘·제목·설명·진행(0..1 + 글자)·버튼 이름·행동(`route` 또는 `claim-gift|mission|mission-bonus|set|shop`).
  말풍선이 이미 말랑 선물을 보여 주면 카드는 `nextGoal(hub, ['gift'])`로 다음 것을 고른다.
- **목표 카드**(`GoalCard`): 캡슐 한 알 모양(왼쪽 종류 색 반쪽 + 아이콘, 흰 몸, 오른쪽 딸기우유 행동 알약). 카드 전체가 링크 또는 버튼 하나.
  받기 목표는 그 자리에서 받고(ref 잠금, 코인이 알약에서 날아감, 화면 읽기 알림) 다음 목표로 바뀌며 살짝 폴짝(움직임 줄이기면 없음).
- **첫걸음** (`goals/firstRun.ts`, 모두 저장 값): 첫 말랑이(보유 있음) → 첫 뽑기(`totalPulls ≥ 1`) → 새 캡슐 열기(`unboxed` 2개 이상, 또는 뽑았는데 봉인 없음)
  → 쓰다듬기(`affection` > 0) → 미니게임 한 판(판 수 합 ≥ 1) → 한 번 더 뽑기(`totalPulls ≥ 2`). 순서와 상관없이 세고, 지금 단계는 순서상 첫 미완료.
  목표 카드 막대가 여섯 칸 + "첫걸음 N/6"으로 바뀌고, 다 하면 사라진다. 봉인 캡슐 이름은 말하지 않는다(등급만 — 선반과 같음).
- **상태 줄**(`HubStatus`): 뽑기까지 코인(또는 뽑을 수 있는 횟수), 전설 이상까지 N회, 도감 N/32 + %. 칸마다 링크.
- **오늘 줄**(`TodayStrip`, `goals/today.ts`): 선물 → 미션 → 가게 → 미니게임 → 뽑기 다섯 칸을 선으로 잇는다. 한 칸 = 민트 + 체크, 할 수 있음 = 레몬 고리,
  시작한 날 선물 = "내일". 받을 미션 보상이 있으면 미션 칸 이름이 "보상 +N"(받을 코인 합, `claimableMissionCoins`). 한 일은 미션 하루 기록(`missions.progress`의 `play-games`·`pull`·`shop-claim`)과 `giftDay`·`bonusClaimed`로 판단한다(출석부 아님).
  선물·미션·가게 칸은 홈 안의 해당 카드로 스크롤·초점, 미니게임·뽑기는 그 화면으로.
- **홈 탭 빨간 점**(`goals/alerts.ts`): 선물 도착, 받을 미션·세트 보상, 가게 가득 참, 열지 않은 캡슐. 탭 이름 뒤에 이유를 읽어 준다.
- **도감 요약** (`data/collectionProgress.ts`, 테스트): `summarizeCollection({ owned, claimedSets })` → 전체 수·비율·화면용 %(`displayPercent`)·반짝 종류 수·
  등급별 수·세트별 진행(`SetProgress`: 없는 id·가장 높은 없는 등급·대략 기대 뽑기 수(정렬용 Σ1/p)·보상 받을 수 있음)·가장 가까운 미완성 세트(`nearestIncompleteSet`:
  시작한 세트 중 남은 수 → 덜 비싼 순 → 많이 모은 순, 시작한 세트가 없으면 가장 덜 비싼 세트)·받을 세트. 도감 화면의 진행 표시도 이 모듈 위에 만든다.

## 놀이방 — 말랑 만지기 (`pages/TouchPage.tsx`, `components/playroom/`, `touch/`, `audio/squish.ts`)

- `/touch`, `/touch/:id`는 **화면 전체가 하늘 바탕 위 폭신한 놀이 매트**(스카이 소다: 흰 파이핑 + 흰 바느질 + 고른 무늬)인 독립 창이다.
  AppShell이 위 막대·아래 탭을 숨기고(`useMatch('/touch/*')`), 위 HUD는 왼쪽 두 동그라미(나가기 = 이전 화면, 없으면 홈 · 꾸미기)
  · 가운데 흰 카드(집중한 말랑이 정보: 애정 단계 + 촉감 + 다음 반응 방법) · 오른쪽 두 동그라미(방법 보기 · 사진). 버튼은 흰 원 + 파란 그림자.
- **기본은 한 마리만 크게 만진다.** 들어올 때(`soloMalang`) 매트에는 주소의 말랑이(도감 "만지러 가기", 안 열었으면 그 캡슐) 또는 파트너
  하나만 둔다 — 저장된 `out`에 여럿이 있어도 줄인다. 혼자면 배치가 커지고(`computeMatLayout(…, { solo })`, 말랑이 그림 최대 240px) 가운데
  (`soloSpot`)에 **고정**된다 — 혼자일 때는 들어 옮기기·던지기·화살표 밀기가 없고(당기면 제자리에서 늘어나기만), 매 프레임 가운데로 되돌린다(폴짝 높이는 그대로). 선반 손잡이는 "친구 꺼내기"로 바뀐다. 친구를 꺼내면 여럿 배치로 — 크기는 수에 따라(`groupSpriteFor`: 둘 = 360 폭에서 약 166px·최대 200,
  셋 = 약 144px, 넷·다섯 = 예전 100~180px, 모두 360×640 매트 안에 선다 — `computeMatLayout(…, { count })`, 수가 바뀌면 다시 잰다),
  다시 하나가 되면 남은 말랑이가 가운데로 돌아온다. 배치가 바뀌어도 몸은 화면 위 같은 자리에 머문다(`remapPoint`). 소품 크기 기준(`groupSprite`)은 수와 무관.
  여럿일 때 손가락으로 잡은 말랑이는 그림만 살짝 커진다(`FOCUS_ZOOM` 1.15, `stepFocusZoom` 지수 곡선, 움직임 줄이기면 바로) — 바닥 가운데 기준
  `scale`(2D 는 감싸개, 3D 는 `place` 의 unit)이고 `BodyRec.zoom` 을 `spriteBox`·2D 손가락 판정이 같이 써서 세계 좌표·판정이 어긋나지 않는다.
  손짓·반응은 그대로다.
- **여럿이 함께**는 선반에서 꺼내 2~5마리. 상한은 폰 3, 계속 55fps 이상이면 5(`touch/perfGovernor.ts`, 순수·테스트).
  3D가 35fps 아래로 떨어지면 2D로, 2D도 30fps 아래면 상한을 줄인다(나와 있는 말랑이는 치우지 않음).
  3D → 2D 는 손가락·키로 누르고 있는 동안 미룬다(`readyToDowngrade`: 바꾸는 순간 3D 몸이 사라져 손짓이 끊겨 보였다) — 모두 떼면 다음 프레임에.
  선반 손잡이의 "매트 N/상한"은 성능 조절이 첫 판단을 마친 뒤(`PerfState.settled`, 데스크톱은 처음부터)에만 — 그 전에는 "매트 N마리"(3 → 5로 튀지 않게).
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
  닫기는 손잡이("선반 닫기") 하나(× 없음). 연 말랑이 칸 아래에는 이름(한 줄, 길면 말줄임 — 버튼 이름에 이미 있어 읽지 않음),
  봉인된 캡슐 칸 아래에는 이름 대신 등급 배지(색 + 모양 + 글자).
  **모두 열기**: 선반의 봉인 캡슐을 선반 순서대로 0.42초마다 하나씩 연다(딸깍 + 뽁, 등급 진동, 칸이 폴짝 — 움직임 줄이기면 한꺼번에·소리 한 번),
  각각 `unboxMalang`, 끝나면 선반을 닫고 한 줄 요약("캡슐 N개를 모두 열었어요." + 반짝이나 에픽 이상 한마디).
- **캡슐 열기** (`touch/capsule.ts`, 순수·테스트): v7부터 새로 얻은 말랑이는 선반에 봉인된 캡슐(등급 색 + NEW 딱지).
  꺼내면 매트에 캡슐이 떨어지고 두 손가락 비틀기(70°) · 두 손가락으로 벌리기 · 톡 세 번 · 꾹 0.9초 중 아무거나로 연다.
  톡은 금 간 단계로 쌓인다 — 앞 톡에서 2.2초(`tapWindowMs`) 안이면 이어서 센다(천천히 눌러도 열림). 첫 캡슐 머리 위에 여는 방법 딱지
  (`CAPSULE_HINT` "톡톡톡 세 번 두드리거나 꾹 눌러요"), 캡슐을 한 번 열어 볼 때까지는 손가락 시범(`CAPSULE_DEMO`, 톡톡)이 두드려 보인다.
  반짝이면 알림이 "반짝 ___이/가 나왔어요!".
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
- **손맛 목소리** (`audio/touchVoice.ts` + 물리 읽기 `touch/touchSense.ts`, 모두 순수 계산 + 테스트): 실제 말랑이 장난감 소리를 흉내 낸 **이어지는 소리**.
  누르는 순간 말랑이마다 하나 시작(`startTouchVoice`)해 매 프레임 `readSense`(눌림 깊이·눌림 속도·늘어남·늘어나는 속도·손가락 문지름·출렁임 변위/속도·
  떼어내는 빠르기) → `touchVoiceParams(촉감, 읽기)` 목표값을 `setTargetAtTime`으로 따라간다. 놓으면 `release()` — 몸이 출렁이거나 차오르는 동안
  계속 따르다 조용하면 스스로 멈춘다. 층(촉감별 세기·대역은 `VOICE_TIMBRES`): **flow** 눌리는 빠르기만큼 새는 공기·물기(폼 "스읍" 300~2.5kHz,
  깊이가 아니라 속도를 따른다 / 놓고 차오를 때 옅고 높은 들숨 — 막 놓은 순간은 조용 / 젤리·찐득이는 좁은 공명의 젖은 소리, 출렁임 속도에 찰랑),
  **rub** 손가락이 누른 자리 가까이에서 오갈 때만(멀리 끌면 당김) 속도만큼 마찰(폼 벨벳·젤리 뽀득·고무 사각·슬라임 끈적), **grains** 부스럭 알갱이
  (폼은 깊이 눌러 들어가는 동안 바삭, 찐득이는 떼어낼 때 "칙칙" 밀도 ∝ 떼는 빠르기 — 미리 만든 성긴·촘촘 딸깍 고리 두 개를 섞어 알갱이마다 노드를 만들지 않는다),
  **tone** 출렁임을 그대로 따르는 "뾰잉"(음높이 = 변위, 크기 = 진폭² × 속도 트레몰로 → 눈에 보이는 출렁임과 같은 박자, 잡고 있으면 없음),
  **creak** 고무 스틱-슬립(좁은 펄스열, 속도 ∝ 늘어나는 빠르기 × 팽팽함, 공명 ∝ 팽팽함 — 느리면 뚝뚝 삐걱, 빠르면 끼익).
  일회성은 맞는 것만 남긴다: 젤리 누름 "쮸웁"(`squish.squelch`, 좁은 공명이 빠르게 내려감), 찐득이 누름(같은 소리 낮게), 쭉쭉이 튕김 "퉁"(`squish.thwap`),
  찐득이 "쩍"(`squish.peel`). 예전 `startStretch`·`squishRelease`·`riseSigh`는 목소리로 바뀌어 없어졌다.
  동시에 3개(`MAX_TOUCH_VOICES`, 넘치면 놓은 것·오래된 것부터 페이드), 일회성 소리가 울리면 잠깐 비켜 준다(`duckTouchVoices`, `squish` 의 슬롯이 부른다).
  멈춘 소리가 남지 않게: 취소(pointercancel)·말랑이 치우기(dispose)·몸이 멈춤·화면 숨김(visibilitychange/pagehide)·update 가 0.6초 끊김(감시)에서 모두 멈춘다.
- **촉감 진동** (`touchSense.touchHaptic` — `haptic()`의 끄기·움직임 줄이기·첫 입력 검사를 그대로 거치고 패턴만 촉감 것, 안드로이드만):
  폼 부스럭·찐득이 칙칙은 알갱이 6개마다 톡(`grainTick`, 70ms 간격 제한), 젤리·고무를 놓으면 부드러운 퉁, 찐득이가 떨어지면 쩍 패턴.
- 만지면 친밀도(`affection`)가 오른다(만진 말랑이만). 친밀도는 코인을 주지 않는다.
- **친밀도는 눈에 보이는 성장**이다 (`economy/affection.ts` `affectionProgress`, 순수·테스트 — 새 규칙 없이 `levelOf`·`REACTION_UNLOCKS`·
  가게 `affectionBonus`(찐득이 두 배)·선물 `giftCoins`를 한곳에 모은다. 가게·선물 공식이 economy 에 있어 data 가 아니라 economy 에 둔다).
  단계·단계 안 애정(xp)/50·남은 양·하트 5개 채움(`heartFills`, 하나 = 10)·지금 받는 것·다음 단계에 새로 생기는 것(`levelUpPerks` →
  `perkLines`: "새 반응 녹아내리기", "가게 보너스 +20%", "선물 +15코인")·다 열었나(`maxed`: 반응·가게·선물이 마지막으로 오르는 단계,
  지금은 선물 상한이 닿는 9단계 — `affectionMaxLevel`이 표·config 에서 계산). 저장 구조는 그대로.
  - 도감 상세 `AffectionMeter`: "친밀도 Lv.4" + "다음 레벨까지 32" + 하트 5개(옅은 딸기우유 칸) + "Lv.5가 되면" 알약들.
  - 놀이방 정보 카드: 예전 막대 자리에 작은 하트 5개 + "다음 레벨까지 N"(높이 그대로), 아래 줄은 다음 반응 방법(반응이 더 없으면
    "Lv.8이 되면 선물 +15코인").
  - 단계가 오르면 기존 축하 딱지 하나가 "○○와 조금 더 친해졌어요! Lv.5" + 새 반응(방법) + 가게·선물 알약으로 바뀌고 둘레에서
    하트가 퐁퐁 떠오른다(움직임 줄이기면 멈춘 하트). 새 반응 손가락 시범은 그대로.
- **촉감** (`data/materials.ts`, 순수 데이터 + 테스트): 32종 모두 네 촉감 중 하나(`MATERIAL_BY_ID`, 없으면 탱탱 젤리).
  컴포넌트는 숫자를 들지 않는다 — 물리 모듈이 `feel`(몸 안쪽)·`world`(매트 세계)·`carryFrac`(들어 옮기기 시작 거리)·`skin`(표면 질감)만,
  3D 무대(`touch3d/jellyScene.ts`)가 `look`(거칠기·코팅·쉰·속 비침·잔결·가장자리·외곽선·젖은 반사점)과 `skin`만 읽는다. 소리 음색은 `audio/touchVoice.ts`의 `VOICE_TIMBRES`.
  - 슬로우 라이징(모찌·빵·마시멜로…): 누를 때는 빠르고 놓으면 눌림·3D 자국이 지수 곡선으로 1.5~3초에 걸쳐 차오른다
    (`physics.relaxSpring`, 히스테리시스), 거의 안 튄다. 보송한 "스읍"(누르는 빠르기만큼) + 깊이 누르면 폼 부스럭(진동 톡톡), 놓으면 거의 조용하다가
    차오르는 만큼 옅은 들숨. 겉: 바닥이 평평한 손끝 자국이 오래 남아 천천히 차오르고, 깊게 누르면 둘레에 바퀴살 주름 골.
  - 탱탱 젤리(젤리·소다·과일…): 강하고 덜 감쇠된 스프링, 매트에서 높이 튐. 누르면 젖은 "쮸웁", 놓으면 출렁임을 그대로 따르는 "뾰잉" + 찰랑,
    문지르면 뽀득. 겉: 놓거나 찌른 자리에서 잔물결이 몸을 가로질러 퍼지고(반사가 흔들린다) 잦아든다. 놓으면 부드러운 퉁 진동.
  - 쭉쭉이(떡·구름·솜사탕…): 늘림 한계 2.5배(같은 거리를 당겨 2~3배), 멀리 끌어야(`carryFrac` 1.1) 들려 따라오고,
    놓으면 넘치듯 튕긴다. 당기는 동안 고무 "끼익" 스틱-슬립(빠르기·팽팽함을 따름), 놓으면 늘어났던 만큼 "퉁"(`squish.thwap`) + 진동.
    겉: 잡은 곳과 몸 사이가 잘록해진다(목) — 법선이 따라 휘어 반사가 늘어난 방향으로 길게 선다.
  - 찐득이(펄·해파리·슬라임…): 쉬는 자세가 살짝 처짐(`sag`), 손을 떼도 `peelPlan`만큼 붙어 위로 딸려 오다 "쩍"(`squish.peel`).
    매트 마찰이 크고, 맞닿은 말랑이를 잠깐 붙잡는다(`world` 끈적임 — 둘 다 찐득이면 세게, `stickHoldMs` 뒤 풀림).
    떼어내는 동안 촘촘한 "칙칙"(떼는 빠르기만큼, 진동 톡톡) 그리고 손가락과 몸 사이에 **실 가닥**(`touch/goo.ts`, 순수·테스트):
    몸 쪽은 넓은 밑동·가운데는 가는 목·손끝은 조금 굵게, 손가락이 몸 윗면 너머로 들리며 늘어나 가늘어지다 가닥마다 다른 때 끊어져
    몸 쪽은 되감기고 손끝 쪽은 방울로 처진다. 입자 캔버스(`fxLayer` 의 `source.goo`, `touchFxDraw.drawGoo`)라 3D·2D 같다(움직임 줄이기면 캔버스가 없어 소리만).
  - **표면 질감** (`touch/surface.ts` 순수·테스트, 세기는 `skin`: rim·flat·crease·wave·neck·strands·contactDark):
    자국은 화면에서 손끝(약 10mm = 38px) 크기의 세로로 조금 긴 타원(`fingerRadius`: 그림 크기에 맞춰 몸 좌표로), 바닥이 평평하고 벽이 가파르며
    둘레가 솟는다(`dentProfile`). 3D 는 `softbody` 정점 변형(부피 보정 그대로) + 셰이더가 같은 곡선을 화소마다 다시 재 범프로 법선에 얹는다
    (`jellySkin`: 자국·폼 주름·젤리 물결 — 정점만으로는 계단져 보여서. 새 패스·텍스처 없음, uniform `uSkin`·`uSkin2`·`uRipple`·`uUnit`),
    손가락이 닿아 있는 자리는 살짝 그늘(`uContact`). 2D 는 `SkinArt`(몸 윤곽 안 겹 그림: 곱하기로 짙어지는 자국 + 밝은 테 + 폼 주름 선,
    젤리 물결 고리)을 페이지가 매 프레임 `drawSkin2d(actor.surface2d())` 로 옮긴다. 2D 에서도 누른 곳을 몸 좌표로 흉내(`pseudoHit`) 해 물결 자리가 같다.
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
    몸 텍스처는 바탕 색만: 2D 광택(`.malang-spec`)·그늘(`.malang-jelly`)·바닥 그림자·몸통 잉크 선을 빼고, 윤곽 밖은 가장자리 색으로 번져
    채운다(옆면 회색 띠 방지). 몸 밖 장식은 몸 뒤/앞 평평한 카드. 얼굴(기쁨·졸림·놀람·깜빡임)은 텍스처 교체.
  - **실제 말랑이 장난감처럼** (사진 같은 재질): MeshPhysicalMaterial + 덧붙인 GLSL 하나를 촉감별 `look`(`data/materials.ts`)이 바꾼다 —
    슬로우 라이징 = 매트한 폼(쉰 + 가루 같은 잔결 범프, 넓고 흐린 반사), 탱탱 젤리 = 반투명 구미(감싸는 빛·두꺼운 가운데 진하게·가장자리로
    새는 빛·바닥에 모이는 빛 + 또렷한 창 반사), 쭉쭉이 = 새틴 실리콘, 찐득이 = 젖은 슬라임(날카로운 반사점, 가장자리 어둡게). 반짝은 박막 무지갯빛.
    빛: 하늘빛으로 물들인 `RoomEnvironment` → PMREM(렌더러당 한 번) + 주광·보조광·역광 + 카메라 가까운 소프트박스 창 반사(셰이더).
    법선은 변형마다 다시 계산하므로 반사가 자국·당김을 따라 휘고 미끄러진다. 자국 바닥은 셰이더가 쉬는 자세 좌표 + 자국 uniform으로
    몸색 쪽으로 어둡게(슬로우 라이징 자국이 차오르는 동안 보인다). 잔결은 텍스처 없이 값 노이즈를 화면 미분으로 얹고, 작게 보이거나
    진하게 인쇄된 곳(눈)은 끈다. 외곽선은 몸색을 짙게 한 가는 뒤집힌 껍질(`look.outline`).
    바닥은 넓고 흐린 그림자 + 닿은 자리의 접촉 그림자(변형된 발자국 폭을 따라, 눌리면 넓고 진하게, 들면 옅게).
    새 패스·후처리·컨텍스트 없음 — 성능 규칙(render-on-demand, DPR 상한, 2D 대체)은 그대로.
  - `loadJelly3d.ts`로 놀이방에서만 받는 청크(three는 epic과 공유 청크). 1.5초 안에 못 받거나 WebGL이 없거나
    움직임 줄이기면 같은 세계를 2D SVG 스프라이트로(눌림 + **당긴 축으로 늘어나기**: `physics.toTransform2d` — 당긴 방향 `pullX/Y` 스프링을 따라
    rotate·scale(along, 1/√along)·rotate, 바닥 가운데 기준, 촉감 한계 `maxStretch2d` = 1 + 0.6 × feel.stretch(기본 1.6배, 쭉쭉이 2.5배),
    그만큼 기울기·세로 늘어남은 덜어내 두 번 늘지 않게, 아래로 끄는 것은 눌림만, 화면 밖으로 나가지 않게 `fitStretch`로 줄임. 혼자 모드도 제자리). 몸 하나의 텍스처가 아직 안 구워졌으면 그 몸만 2D로 보인다.
    떠나면 dispose + forceContextLoss.
  - 멈추면 그리지 않는다(숨쉬기는 놓은 뒤 약 7초만). DPR 최대 2, 느리면 자동으로 낮춘다.
    개발 서버 스크린숏: `localStorage['playroom-keep-3d']='1'`(성능 조절 끔), `window.__playroomPause = true`(물리·입자를 그 순간에 멈춤 — 느린
    소프트웨어 WebGL 에서도 손짓 도중을 찍는다), `window.__playroomRecs`(말랑이 기록). 모두 DEV 에서만.
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
  기본 꾹 누르기는 아무리 오래·위쪽을 눌러도 `TUNING.pressCap`(0.3, 키 약 70%)까지 — 녹아내리기(`MELT_SQUASH` 0.5, 5단계)와 한눈에 다르다.
  졸린 눈도 녹아내리는 중에만(잠긴 단계는 기쁜 얼굴 그대로). 자국 그늘은 얼굴을 비켜 간다: 2D 는 `surface.faceShadeFactor`(얼굴 타원
  `faceEllipse` 위에서 `faceShadeKeep` 0.2 까지 옅게), 3D 셰이더는 같은 타원(uFaceUv·uFaceR)에서 자국·손가락 그늘을 줄인다.
  애정 단계(`levelOf`, 50마다)로 하나씩 열린다(`REACTION_UNLOCKS`, 1단계는 기본 말랑만) — 게이지 아래 줄에 다음 반응, 열리면 축하 딱지.
  반응 표는 `data/affection.ts`에 있고 `touch/reactions.ts`가 다시 내보낸다(도감·가게도 읽는다).
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
  저장 방법은 순수 `lib/photoSave.ts`(`photoSaveMethod(installEnv, canShareFile)`, 테스트): 파일 공유 → 공유 창, 앱 안 브라우저·iOS·홈 화면 앱 →
  **길게 눌러 저장** 안내(창 제목 "사진을 길게 눌러 저장하세요" + 설명 한 줄 + "다 했어요", 그 사진만 `.touch-photo__img--hold`로 전역
  touch-callout 막음의 예외), 그 밖(안드로이드 Chrome·데스크톱) → 내려받기("사진 내려받기를 시작했어요"). 공유가 실패하면 `afterShareFailed`.
  성공을 확인할 수 있는 공유만 "공유했어요"라고 말한다(내려받기·길게 누르기는 "저장했어요"라고 하지 않는다).
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
  경로 → 곡은 `trackForPath`(`audio/tracks.ts`, music.ts가 다시 내보냄), AppShell의 `useRouteMusic()`이 적용(곡 엔진은 첫 입력 뒤 지연 로드). 리듬 게임(`QUIET_GAME_IDS`)은 박자가 부딪혀 음악을 끈다.
- **덕킹**: 팡파레·신화 연출 소리(`result*`, `epic*`, `secretBoom`, `secretTease`)가 스스로 `sfx.duck(초, dB)`를 불러 음악을 -5~-20dB 낮춘다.
  화면 코드는 신경 쓰지 않아도 된다. 놀이방의 이어지는 손맛 목소리는 일회성 만지기 소리 아래로 -5dB 비켜 준다(`duckTouchVoices`).
- **이어지는 소리(손맛 목소리)** 규칙: 물리에서 읽은 값으로 매 프레임 목표값만 옮긴다(`setTargetAtTime`, 새 노드를 만들지 않는다), 동시에 3개,
  시작은 15ms 페이드 인·끝은 30ms 페이드 아웃 뒤 소스 정지(딸깍 없음), 화면 숨김·update 끊김 감시로 절대 남지 않게. 대역은 200Hz~6kHz 안(테스트).
  소리를 고칠 때는 `scripts/render-touch-sounds.mjs`(개발 서버 + Playwright, 실제 MalangActor 를 가상 시계로 돌려 OfflineAudioContext 로 굽는다)로
  촉감·손짓별 WAV + 스펙트로그램 + 요약(정점 dBFS·대역 비율·DC·끝 잔향·남은 목소리 수)을 보고 듣는다. 지금 값: 네 마리를 한꺼번에 당겼다 놓아도
  정점 약 -12dBFS, 모든 손짓에서 200Hz~6kHz 에 에너지 88% 이상.
- **설정**: 효과음/배경음악 따로(`settings.sfxOn`, `settings.musicOn`, HUD 소리 버튼 → `SoundSettings` 말풍선).
  토글은 입력 안에서 엔진에도 바로 알린다(iOS 재개 조건).

## 경제 시스템 (`economy/`)

- **재화는 코인 하나뿐**이다 (뽑기권은 v3에서 폐지). 코인으로 바로 캡슐을 뽑는다.
- 코인 출처: 미니게임(일일 상한 적용), 중복 환급, 컬렉션 세트 보상, 일일 미션, 디저트 가게(방치 수입), 말랑 선물(하루 한 번). 뒤의 둘은 일일 상한과 무관. 미니게임은 점수만 보고하고 코인을 직접 변경하지 않는다.
- 보상 계산 (`computeReward`):
  ```
  baseCoins    = floor(score × gameMultiplier)
  partnerBonus = floor(baseCoins × partnerRarityBonus)
  earnedCoins  = min(baseCoins + partnerBonus, gameCap(gameId))
  granted      = min(earnedCoins, dailyCap − dailyEarned)
  ```
- 일일 상한은 **Asia/Seoul 달력 날짜**가 바뀌면 초기화 (`daily.ts` 의 `seoulDateKey`).
- **미니게임 코인은 플레이한 시간만큼**(사용자가 맡긴 결정): 예전엔 20초 게임이 분당 약 590, 2분 게임이 약 64코인이라 짧은 게임만 반복하게 됐다.
  이제 한 판 목표 = `COINS_PER_PLAY_MINUTE`(90) × (`GAME_PLAY_SECONDS[id].typical` + `PLAY_OVERHEAD_SECONDS` 15) ÷ 60 — 20초 게임 약 50,
  45초 약 90, 2분 약 200. 배율(`GAME_MULTIPLIERS`)은 보통 점수(`GAME_TYPICAL_SCORES`) × 배율 ≈ 목표가 되게 맞춘다(떨어지면 끝나는 게임은 보통 버티는 시간).
  한 판 상한 = `gameCap(id)`: 가장 긴 판(`GAME_PLAY_SECONDS.max` = durationMs, registry 테스트) 목표 × `PER_GAME_CAP_FACTOR` 1.5, 10 단위(20초 80 · 2분 300).
  테스트(`playReward.test.ts`): 모든 게임 보통 한 판의 분당 코인이 90 ±15%, 로비 "약 N코인"이 목표 ±20%, 최고/최저 효율 1.3배 안, 보통 날(게임 15분 + 미션 + 가게 + 선물)이면 10연 하루.
  "미니게임 코인 N개" 미션도 150/300/500으로 맞췄다. 결과 영수증·상한 문구는 `reward.gameCap`("이 게임은 한 판에 N코인까지 받아요.").
- 뽑기 가격(`PULL_PRICE`): 1회 100 코인, 10연 1000 코인(할인 없음 — 코인이 생기는 대로 1회씩 뽑는 짧은 루프. 1회 뽑기 ≈ 미니게임 1분 남짓. 1회 뽑기 버튼이 주인공 색).
- 모든 숫자는 `economy/config.ts` 에 주석과 함께 둔다.

## 상태 저장 (`store/`)

- Zustand `persist`, key `malang-gacha-save`, `version` 필드 + `migrate`.
- 로드된 데이터는 항상 `sanitizeSave` 를 거친다: 잘못된 타입/음수/알 수 없는 캐릭터 id 제거, 기본값 보정.
  JSON 파싱 실패 시에도 초기 상태로 복구하며 앱이 크래시하지 않아야 한다.
- 현재 v9: 반짝 수(`shinyCount`), 받은 세트 보상(`claimedSets`), 친밀도(`affection`), 반짝 파트너 표시(`partnerShiny`), 일일 미션(`missions`),
  소리 설정 `settings: { sfxOn, musicOn }`(v4의 `muted: true`는 둘 다 끔으로 옮긴다. 새 플레이어는 둘 다 켬 — 음악은 첫 입력 뒤에 시작),
  받은 쿠폰(`redeemedCoupons`, v6), 놀이방(v7): `unboxed: string[]`(캡슐을 연 말랑이) + `playroom: { out: string[] }`(매트 위, 최대 `PLAYROOM_MAX_OUT` 5).
  v6→v7은 이미 가진 말랑이를 모두 연 것으로 치고 매트에는 파트너 하나. 새 플레이어의 시작 말랑이는 열린 채 매트에.
  `pull`로 새로 얻은 말랑이는 `unboxed`에 넣지 않는다(놀이방에서 캡슐로 연다). sanitize: `unboxed` ⊆ 보유, `out` ⊆ unboxed ∩ 보유, 중복 없음, 5개까지.
  꾸미기(v8): `playroom.mat`(무늬 id, 모르면 기본 `sky-dots`) + `playroom.props: {id, x, y}[]`(x·y는 매트 바닥 기준 0..1로 자름, 모르는 id·중복 제거,
  최대 3개). v7→v8은 기본 무늬·소품 없음 + 매트에는 한 마리만 남긴다(나와 있던 파트너, 없으면 처음 꺼낸 말랑이). 들어올 때마다 `soloMalang`이 한 마리로 줄인다.
  가게(v9): `shop: { staff, lastTickAt, banked }` + `giftDay`(선물 받은 서울 날짜 또는 null). v8→v9는 파트너(연 말랑이면, 아니면 처음 연 말랑이)가 첫 직원,
  `lastTickAt` = 지금(소급 없음), 선물은 오늘 바로. sanitize: staff ⊆ unboxed ∩ 보유·중복 없음·열린 칸까지, 미래 `lastTickAt`은 지금으로, `banked` 0..`SHOP_BANK_MAX` 정수.
  v2→v3에서 남은 뽑기권은 장당 100코인(`LEGACY_TICKET_TO_COINS`)으로 바꿔 코인에 더한다.
- 구조 변경 시: `SAVE_VERSION` 을 올리고 `persistence.ts` 의 `migrateSave` 에 단계별 변환을 추가 + 테스트.

## 테스트

- `npm test` — Vitest, node 환경, `src/**/*.test.ts`.
- 가챠: 10만 회 확률 검증을 서로 다른 시드 여러 개로 수행(±5σ 허용), 천장/비율/10연 보장/환급.
- 경제: 보상식, 판당·일일 상한, 서울 자정 경계. 디저트 가게(칸·보너스·세트·특기, 쌓이기·가득 참·시계 되감기·자투리, 대표 직원 구성별 하루 수입 범위),
  말랑 선물(고르는 말랑이·코인·하루 한 번), 가게 글자(`components/shop/perks.test.ts`: 칩·남은 시간·변화 딱지·세트 한 줄),
  가게 요약(`msUntilFull`·다음 칸)·직원 바꾸기 미리 보기(`shopPreview.test.ts`: 화면과 같은 계산, 세트 짝을 빼거나 들이면 다른 직원도 바뀜, 쭉쭉 도움, 자리 바꾸기 = 그대로),
  다시 뽑기 모자란 코인(`coinsNeededForPull`).
- 자랑하기: 글(조사·또·반짝 이모지 ≤2·도감 숫자 자르기), 보내기 순서(그림 공유 → Web Share → AbortError 조용히 → 클립보드 → 직접, canShare가 파일을 거절하면 글만),
  카드 글(한 줄·반짝 제목·파일 이름·주소), 공유 주소는 쿠폰 링크가 아님(`lib/share.test.ts`), 촉감 모음·시작 말랑이 촉감 한 줄(`data/materialIds.test.ts`),
  자랑할 결과 고르기(`pullReveal.shareHighlightIndex`).
- 저장: 손상/구버전 데이터 migrate.
- 화면 청크: 경로 → 미리 받을 청크(`app/routeChunks.test.ts`, 홈·모르는 경로·`constructor` 같은 이름은 받지 않음).
- 홈 허브: 도감 요약·가장 가까운 세트(`data/collectionProgress.test.ts`), 첫걸음 단계 계산(`goals/firstRun.test.ts`), 목표 우선순위·문턱값·문구
  (`goals/nextGoal.test.ts`), 오늘 줄·탭 알림(`goals/today.test.ts`).
- 도감: 세트 탭 순서·정확한 기대 뽑기 수·둥글림·NEW 판정(`data/collectionProgress.test.ts`). 친밀도 진행: levelOf·가게·선물 공식과 같은 값,
  하트 채움, 단계별로 생기는 것, 최대 단계(`economy/affection.test.ts`). 숫자 뒤 조사(`lib/josa.test.ts`). 테스트 저장은 `goals/testSave.ts`(시작 말랑이를 고른 직후).
- 3D 머신 더미: 가라앉으면 겹침 없음·돔 안·바닥 위·멈춤, 돔 아래쪽만 참, 시드 결정성, 휘젓기 후 다시 가라앉음(`machine3d/pile.test.ts`).
- 놀이방: 매트 세계(충돌·쌓기 안정·에너지 감소·상한, 소품 장애물: 뚫지 않음·얹혀 쉼·올라탐·확 튀지 않음), 캡슐 손짓, 선반 순서, 성능 조절
  (첫 판단 `settled`·누르는 동안 2D 전환 미룸), 화면 배치(혼자 배치·자리 옮기기·수에 따른 크기·모두 매트 안·잡은 말랑이 확대),
  기본 꾹 누르기 vs 녹아내리기·2D 늘어남(축·촉감 한계·화면 안·두 번 늘지 않음 — `touch/physics.test.ts`), 얼굴 비켜 가는 자국 그늘(`touch/surface.test.ts`),
  사진 저장 방법(`lib/photoSave.test.ts`), 반응 부위·쓰다듬기, 꾸미기 데이터(타일 SVG·저장 검사·놓기/치우기·빈자리), 사진 카드(`frameGroup` 모두 담기·비율,
  무늬 자리, 등급 칩·칩 줄, 단체 한 줄 조사).
- 미니게임: `logic.ts` 순수 함수 (점수, 콤보, 충돌, 스폰). 로비 칩 거르기(`minigames/lobby.test.ts`), 예상 코인·오늘 막대·영수증 깎임·상한 문구(`economy/playReward.test.ts`).
- 소리: 콤보 음계·단위 변환·클리퍼 곡선(`tuning`), 스케줄러 박자 계산·악절 생성 결정성·경로→곡(`music`), 엔진 잠금/재개/덕킹(가짜 컨텍스트), 촉감별 소리 맛(`squish`).
- 놀이방 손맛: 촉감별 목소리 목표값(폼은 깊이 아닌 빠르기·들숨은 차오른 만큼, 젤리 음높이 = 변위·크기 = 진폭×속도·잡으면 없음, 고무 삐걱 속도·공명,
  찐득이 칙칙 밀도, 문지름 결, 대역 200Hz~6kHz, NaN), 목소리 그래프(첫 입력 전 없음·상한 3·조용하면 스스로 멈춤·update 끊김 감시·덕킹 — `audio/touchVoice.test.ts`),
  물리 읽기(눌림/들숨 속도, 젤리 변위가 물리 출렁임 박자로 부호를 바꿈, 당김 속도, 문지름 잦아듦)·진동 간격(`touch/touchSense.test.ts`),
  표면 질감(손끝 크기·평평한 바닥·솟은 테·주름·물결 퍼짐/잦아듦·목 — `touch/surface.test.ts`, `touch/softbodySkin.test.ts`: 테가 솟음, 폼 주름, 물결·목에서도 부피 1~2% 안,
  움직임 줄이기면 물결 없음), 실 가닥(늘어나 가늘어짐·차례로 끊김·방울·사라짐·결정성 — `touch/goo.test.ts`), 젤리 "쮸웁"·고무 "퉁" 값(`audio/squish.test.ts`).
- 놀이방 촉감·말랑이끼리: 슬로우 라이징 회복 시간·젤리 출렁임·쭉쭉이 한계·찐득이 떼기 지연·끈적임 풀림(`touch/materials.test.ts`), 볼 비비기 시간·쉬기·1분 상한·쌓기·쿵·흘끔·같이 졸기(`touch/interactions.test.ts`), 3D 겉모습 값 범위·재질 순서(모찌가 가장 매트, 젤리가 가장 비침, 찐득이가 가장 젖음 — `data/materials.test.ts`).

## 미니게임 추가 방법

1. `src/minigames/<game-id>/logic.ts` — 순수 로직 (+ `logic.test.ts`).
2. `src/minigames/<game-id>/index.tsx` — `MiniGame` 객체를 default export:
   ```ts
   const game: MiniGame = { id, name, description, icon, Component, durationMs: CONFIG.durationMs, blurb: '톡톡 누르기', tags: ['feel', 'record'] };
   export default game;
   ```
   `Component` 는 `MiniGameProps`(`partner`, `partnerShiny?`, `onFinish({score, stats})`, `onExit`, `sfx`)를 받는다.
   **코인을 계산/지급하지 않는다.** 점수만 `onFinish` 로 보고.
   **파트너 말랑이가 게임 안에 꼭 보여야 한다** (주인공이거나 옆에서 응원): `minigames/shared/PartnerBuddy`
   (`<Malang>` 하나 + 표정 반응 `react('happy'|'wow'|'oops'|'sad')`/`setBase`, 전설 이상은 오라). 캔버스 게임은
   DOM 스프라이트를 월드 좌표로 옮긴다(`capsule-catch`, `malang-jump`, `stack` 참고). 궤적 색은 `partnerTrailColor`.
   CSS 클래스 접두사는 게임마다 달라야 한다(모든 게임 CSS가 함께 로드된다).
   로비 카드 한 줄은 `formatPlayLength(durationMs)` + `blurb`("20초 톡톡 누르기", 합쳐 11자 이내 — 테스트). 한 판도 안 한 플레이어에게는
   `RECOMMENDED_GAME_ID`(말랑 합치기) 하나만 "처음이면 이거!"로 강조. 결과 통계 이름은 띄어 쓴다(`'최대 콤보'`).
   `tags`: 로비 칩 딱지 `pick`(추천)·`feel`(손맛)·`record`(기록 도전)·`focus`(집중) 중 하나 이상. "짧게"는 적지 않는다 —
   `durationMs ≤ SHORT_PLAY_MS`(30초)에서 계산(`minigames/lobby.ts`). 칩마다 2개 이상·전체보다 적게, 처음 추천 게임은 `pick`(테스트).
3. `src/minigames/registry.ts` 의 `MINI_GAMES` 배열에 한 줄 추가.
4. `economy/config.ts` 의 `GAME_MULTIPLIERS`(배율)와 `GAME_TYPICAL_SCORES`(보통 점수 — 로비 "약 N코인"), `GAME_PLAY_SECONDS`(보통·최대 플레이 초 — 분당 코인과 한 판 상한)에 한 줄씩.
   보통 점수 × 배율이 분당 90코인 ±15%가 되게 (registry·playReward 테스트가 확인).

결과 화면, 최고 기록 저장, 코인 지급은 `MiniGamePage` 가 공통 처리한다.

- **로비** (`/play`, `components/MiniGameLobby`): 위에서부터 오늘 받은 코인 막대("오늘 받은 코인 1,240 / 3,000", 다 받으면 민트 + 자정 안내)
  → 파트너 카드(바꾸기 창에 "홈 파트너도 바뀌어요", 바꾸고 닫으면 "홈 파트너도 ○○로 바뀌었어요" 알림 한 줄) → 가로로 미는 칩 줄(`LOBBY_FILTERS`: 전체·추천·짧게·손맛·기록 도전·집중, 고른 칩은 `sessionStorage['malang-lobby-filter']`)
  → 두 칸 타일(모두 같은 높이, 색은 registry 순서라 걸러도 그대로): 아이콘·이름·길이+blurb·내 기록 두 칸(최고 | 최근, 안 해 봤으면 "첫 도전")
  ·레몬 알약 "약 N코인"(`expectedCoins`: 해 본 게임은 최고와 최근의 가운데, 처음이면 보통 점수 → `computeReward`에 지금 파트너·오늘 남은 한도,
  10 단위 반올림. 오늘 다 받았으면 "오늘은 다 받았어요"). 최근 점수는 기존 `miniGameRecords.lastScore`(저장 구조 변경 없음).
- **결과** (`components/MiniGameResult`): 게임 이름(제목) → 파트너 + 큰 점수(새 최고면 레몬 "최고 기록!"/"첫 기록!" 딱지 + 색종이, 아니면 "최고 N")
  → 기록 칩 → 영수증(점수 보상, 파트너 얼굴 + 등급 배지 + "보너스 +N%", 한 판 상한·오늘 상한으로 깎인 코인, 받은 코인)
  → 상한이 걸리면 한 줄(`rewardNote`: "오늘 상한에 닿아 N코인만 받았어요." 등) → 오늘 받은 코인 막대.
  숫자는 모두 store `finishMiniGame`이 돌려준 `computeReward` 값 하나에서 나온다(`rewardTrims`: 보상 + 보너스 − 깎임 = 받은 코인, 테스트).
  발표: 점수 → 받은 코인이 차례로 굴러 올라가고(오늘 막대도 함께) → 코인이 위 알약으로 날아간다(`holdCounter`를 발표 끝까지 늘림).
  카드를 톡 누르면 바로 끝, 움직임 줄이기면 처음부터 끝난 값. 버튼: "다시 하기"(주) → "캡슐 뽑기"(뽑을 수 있으면 "뽑기 가능!" 딱지) + "다른 게임",
  못 뽑으면 "N코인 더 모으면 캡슐을 뽑을 수 있어요.".

## Git workflow

- 작업 단위별 의미 있는 커밋 (Conventional Commits: `feat:`, `fix:`, `test:`, `ci:`, `docs:`, `refactor:`).
- 커밋 전 `npm test && npm run build`.
- `main` 푸시 시 GitHub Actions가 테스트/빌드 후 GitHub Pages에 배포 (`.github/workflows/deploy.yml`). Cloudflare Pages도 `main`을 연결해 배포한다.
- 빌드는 상대 경로(`base: ./`)라 호스팅 경로와 무관하다. HashRouter를 버리면 이 전제가 깨지므로 base를 다시 정해야 한다.
