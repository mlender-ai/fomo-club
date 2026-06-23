# 키워드 카드 엔진 개발 스펙 (KEYWORD_ENGINE_SPEC)

| | |
|---|---|
| **상태** | 개발 착수 스펙 — 현재 화면의 모든 키워드 카드는 정적 mock |
| **대상 surface** | 웹 (`apps/fomo-web`) 우선. 앱(`apps/fomo-club`)은 보류 |
| **선행 문서** | **`docs/PRODUCT_VISION.md`(정체성 정본·SSOT)**, `docs/PRODUCT_TRUTH.md`(제품 정의), `docs/legacy/FOMO_INDEX.md`(점수 철학 기록) |
| **버전** | v1 |

> 이 문서는 발견 표면(① 종목 카드 스와이프)의 **엔진**을 정의한다 — "오늘 쏠린 곳"을 **실제 데이터로** 산출한다.
> 정체성 정합(PRODUCT_VISION v5 — 두 표면·한 엔진):
> - **발견 표면 = 종목 카드 전용.** 테마·매크로·이벤트는 콘텐츠 표면 또는 종목 카드 안 사실 한 줄로만.
> - **포모 점수 = 발견의 연료**지 진열 상품 아님 — 점수 랭킹표·TA 차트를 독립 화면으로 진열 금지.
> - **💎 조기 발견**의 토대: 키워드/종목별 **첫 감지일·연속일**(수급 선행 사실). 예측·매수신호 금지(사실까지만).
> 화면(스와이프 카드 + 깊이 페이지)은 이미 있다. 빠진 것은 그 뒤의 데이터 엔진이다.

---

## 0. 왜 이 문서가 필요한가 (현 상태의 사실)

- 사용자가 보는 키워드 카드(반도체 84, AI 77, 코인 72, 금리 54, 2차전지 38)는 **전부 손으로 쓴 정적 mock**이다.
  근거: `apps/fomo-web/components/KeywordCardFeed.tsx:4`가 `MOCK_KEYWORD_CARDS`를 직접 import한다(백엔드 호출 없음).
- `packages/fomo-core/src/keyword-cards/`는 `types.ts` + `mock.ts`만 있고 추출/점수 엔진이 없다.
  근거: `keyword-cards/index.ts`는 `export * from "./types"; export * from "./mock";`가 전부.
- 상단 "오늘의 시장 온도 45"는 데이터 전무 시 폴백값(15+15+15+0=45)이다. 근거: `packages/fomo-core/src/index-engine/calculate.ts`의 `fallbackHeat`.
- 깊이 페이지의 "곧 추가될 거야 · 이 테마 더 깊이 보기"는 placeholder다. 근거: `apps/fomo-web/components/KeywordDepthPage.tsx:55`.

**결론**: 제품의 영혼인 "정직한 숫자 원칙"이 현재 화면에서 100% 위반 중이다. 이 엔진을 만드는 것은 기능 추가가 아니라 **제품이 표방하는 가치를 처음으로 사실로 만드는 일**이다.

---

## 1. 이 엔진이 만드는 것

키워드 카드 1장의 정의(`keyword-cards/types.ts`의 `KeywordCard`에 이미 정의됨):

- `keyword`: 오늘 쏠린 테마/키워드 (예: "반도체")
- `fomoScore`: 0~100, **군중 쏠림 정도**. 시세가 아니라 "다들 여기 보는 정도".
- `comment`: 친구 톤 2~3줄 = 포모 유발 + 균형추(진정)
- `related`: 관련 종목/테마 미니 리스트 (시세 아님)
- `depth`: 왜 쏠렸나(why) + 기억해(remember 균형추)

**핵심 메커니즘**: 뜨거운 걸 보여주고(포모 유발) → 즉시 진정시킨다(균형추). 이 루프가 제품의 차별점이다. 정보를 주는 게 아니라 **정보를 감정으로 번역해 안심시킨다.**

---

## 2. 절대 규칙 (전 단계 공통 — 위반 시 카드 폐기)

`keyword-cards/types.ts` §0 규칙을 엔진 전체로 승격한다.

1. **정직한 숫자**: 모든 점수는 실제 집계 기반. 데이터 미비 시 가짜 숫자 대신 폴백을 표시하되 **폴백임을 신뢰도로 노출**(§5).
2. **투자 조언·예측 금지**: "오를 것이다 / 사라 / 목표가" 전면 금지. 과거·현재 설명만. 미래 단정 0.
3. **균형추 필수**: 모든 카드는 포모를 유발하면 반드시 진정시킨다. 균형추 없는 카드는 폐기.
4. **전문용어 금지**: PER·밸류에이션·매크로 등 노출 금지. 친구가 설명하듯.
5. **거래 부추김 금지**: "지금 안 사면 늦는다" 류 금지. 정반대가 톤이다.

---

## 3. 파이프라인 아키텍처

```
[1 소스]          [2 추출]            [3 점수]          [4 코멘트]         [5 스냅샷]       [6 API]            [7 UI]
news RSS    →   키워드/테마      →   포모 점수     →   친구톤 코멘트   →  DB 스냅샷  →  /api/fomo/    →  KeywordCardFeed
community       클러스터링          (군중 쏠림)        + 균형추 + depth    (일1~3회)      keywords          (mock 제거)
(Reddit/Naver)  (NEW)               (NEW)              LLM + 룰 폴백(NEW)   cron
```

### 재활용 vs 신규 (중요 — 바닥부터 만들지 말 것)

| 단계 | 재활용 (이미 있음) | 신규 (만들어야 함) |
|---|---|---|
| 1 소스 | `news-feed/source.ts`, `index-engine/redditFetcher.ts`, `naverFetcher.ts`, `apps/web/lib/fomo-market-sources.ts`(`fetchMacro`/`fetchWhale`), `@fomo/core`의 `fetchCommunity` | — |
| 2 추출 | `news-feed/parse.ts`(기사 파싱) | `keyword-cards/extract.ts` |
| 3 점수 | `news-feed/score.ts`(surge/rise/damp 키워드, EN+KO, 룰 기반) | `keyword-cards/score.ts`(기사 점수 → 키워드 집계) |
| 4 코멘트 | `index-engine`의 AI 런타임 envs, 가드레일 패턴 | `keyword-cards/comment.ts` |
| 5 스냅샷 | `prisma`, `fomo-index-pipeline.yml` cron 패턴 | `KeywordCardSnapshot` 모델 + `keyword-cards-pipeline.yml` |
| 6 API | `apps/web/app/api/fomo/feed/route.ts` 패턴(snapshot-first, corsJson) | `apps/web/app/api/fomo/keywords/route.ts` |
| 7 UI | `KeywordCardFeed.tsx`, `KeywordDepthPage.tsx`(화면 완성됨) | mock import → fetch 교체 |

---

## 4. 단계별 상세 스펙

### 4.1 데이터 소스 (재활용)

세 소스를 `Promise.allSettled`로 병렬 수집(한 소스 실패가 전체를 막지 않음 — `feed/route.ts` 패턴 그대로).

- **뉴스**: `news-feed/source.ts`의 RSS 다중 소스 (Yahoo Finance 등 + 한국 소스).
- **커뮤니티**: `fetchCommunity`(Reddit Public JSON + Naver 종목토론실). 언급량·참여도(upvote+댓글)·감성.
- **(선택) 매크로/고래**: `fetchMacro`/`fetchWhale` — 금리·환율 같은 거시 키워드 보강용.

각 소스 실패 시 조용히 빈 배열로 degrade. **빈 화면/에러 노출 금지.**

### 4.2 키워드/테마 추출 — `keyword-cards/extract.ts` (신규)

입력: 점수 매겨지기 전 기사·커뮤니티 글 배열. 출력: `{ keyword, articles[], mentions, emoji }[]`.

```
1) 사전 기반 1차 매핑 (MVP):
   테마 사전 = { "반도체": ["반도체","HBM","엔비디아","SK하이닉스","삼성전자","TSMC","semiconductor","chip"],
              "AI": ["AI","인공지능","엔비디아","오픈AI","챗GPT","LLM"],
              "코인": ["비트코인","이더리움","코인","crypto","bitcoin","BTC","ETF"],
              "금리": ["금리","연준","FOMC","기준금리","rate","fed","채권"],
              "2차전지": ["배터리","2차전지","에코프로","LG에너지","battery"], ... }
   각 기사/글을 사전에 매칭 → 테마 버킷에 적재. 한 글이 복수 테마 가능.
2) 테마별 mention(글 수) + engagement(upvote+댓글 합) 집계.
3) mention 0인 테마는 그날 카드에서 제외 (정직: 안 쏠렸으면 안 보여준다).
4) emoji는 테마 사전에 고정 매핑(반도체🔥, AI🤖, 코인₿, 금리💵, 2차전지🔋).
```

> 사전 기반으로 시작하는 이유: 정직·디버깅 용이·예측 불가능한 LLM 클러스터링보다 안전. v2에서 LLM 임베딩 클러스터링으로 확장(설계만 인지, 지금 구현 X).

### 4.3 포모 점수 공식 — `keyword-cards/score.ts` (신규)

**원칙: 시세가 아니라 군중 쏠림을 잰다.** `news-feed/score.ts`의 기사 단위 점수기를 재활용해 키워드 단위로 집계.

```
키워드 K의 포모 점수 (0~100):

  attention = 0~100, 다음 신호의 가중 평균:
    (a) 언급 볼륨   : 오늘 K 관련 글 수를 30일 기준선 대비 변화율 → 0~1
    (b) 언급 가속   : 최근 6h vs 직전 6h 증가율 (급가속 = 강한 포모) → 0~1
    (c) 톤 강도     : news-feed/score.ts로 매긴 기사 점수의 K 평균 (surge 키워드↑) → 0~1
    (d) 커뮤니티 열 : engagement-weighted 언급 (redditFetcher 패턴) → 0~1

  fomoScore = round( (0.35·a + 0.30·b + 0.20·c + 0.15·d) × 100 )

  단, 30일 기준선이 없으면(초기) (a)(b)는 confidence "low"로 표기하고
  (c)(d)만으로 산출. 절대 가짜 기준선을 만들지 않는다.
```

5구간 ↔ 색·표정 매핑은 `@fomo/core`의 `scoreToColor`/`scoreToEmoji` 재활용(`KeywordCardFeed.tsx:4`에서 이미 import 중). 점수 철학 기록은 `docs/legacy/FOMO_INDEX.md`에 보존.

#### Phase 2에서 반드시 해결할 것 (Phase 1 구현이 남긴 한계 — 선택 아님)

Phase 1은 30일 기준선이 없어 `(c)톤강도·(d)커뮤니티열`만 재정규화(실효 가중 tone 0.571 / community 0.429)하고 confidence "low"로 산출한다. 그대로 머지하되, Phase 2에서 `(a)volume·(b)accel` 기준선을 스냅샷에 넣을 때 아래 둘을 **반드시** 함께 푼다.

1. **(필수) community 정규화 ↔ '어제 대비' 서사 충돌.** 현재 `(d)`는 *당일* 키워드들 사이의 상대 참여도(`engagement / 당일 max`)다. "오늘의 너"의 핵심 훅(어제 64 → 오늘 45, PRODUCT_VISION §4.1)은 day-over-day delta 위에 선다. community가 당일 상대값이면 어제·오늘이 **다른 척도**라 delta가 거짓이 된다. Phase 2 스냅샷에 `(a)(b)` 기준선을 도입할 때 **community도 날짜 간 비교 가능한 절대 기준**(예: 30일 참여도 기준선 대비)으로 다듬어야 한다. **안 풀면 리텐션 훅이 깨진다.**
2. **(확인) community 소유 왜곡 — 순위 역전.** 진짜 급등인데 뉴스전용(참여 0)이면 저평가되고(상한 ~57), 중립인데 커뮤니티만 시끄러우면 과대평가된다(+최대 ~43). 기준선이 들어와도 상대정규화 특성상 자동으로 안 풀릴 수 있으니 Phase 2에서 같이 점검한다.

### 4.4 코멘트 생성 — `keyword-cards/comment.ts` (신규)

`comment`(카드 앞면) + `depth.why` + `depth.remember`를 생성. **LLM 1차, 룰 폴백 필수.**

LLM 가드레일 프롬프트(시스템):

```
너는 'FOMO Club'의 마스코트 포모다. 새벽 1시에 차트 보며 똑같이 불안해하는 친구다.
입력: 오늘 쏠린 키워드 '{keyword}', 포모점수 {score}, 관련 기사 제목 {titles}, 관련 종목 {related}.

규칙(어기면 출력 폐기):
1) 친구 반말. 따뜻하고 담담하게. 위에서 가르치지 마라.
2) 과거·현재 사실만 설명. 미래 단정·예측 절대 금지("오를/내릴", "사라/팔아라" 금지).
3) 전문용어 금지. 중학생도 알아듣게.
4) 반드시 균형추로 끝낸다: "안 급해도 돼 / 기회는 또 와 / 따라가는 건 조심" 결.
5) 점수가 높을수록(60+) 진정 톤을 더 강하게. 낮으면(40-) "조용한 건 나쁜 게 아니야" 결.

출력(JSON만, 그 외 텍스트 0):
{ "comment": "2~3줄", "why": "왜 쏠렸나, 용어 없이", "remember": "균형추 한마디" }
```

- 환경변수: 기존 `AI_API_URL`/`AI_API_KEY`/`AI_MODEL`/`AI_TEMPERATURE` 재활용.
- **룰 폴백**(LLM 실패·레이트리밋 시): 점수 구간별 템플릿 문장 + 키워드/관련 종목 슬롯 채우기. 출력 품질은 낮아도 **항상 균형추 포함**. mock.ts의 톤을 폴백 템플릿의 기준으로 삼는다.
- 출력은 금칙어 가드(투자조언/예측/전문용어 정규식)를 통과해야 저장. 실패 시 룰 폴백으로 대체.

### 4.5 스냅샷 — Prisma `KeywordCardSnapshot` (신규)

```prisma
model KeywordCardSnapshot {
  id        String   @id @default(cuid())
  date      String   // YYYY-MM-DD (KST)
  cards     Json     // KeywordCard[] (점수순 정렬)
  confidence String  // "high" | "medium" | "low" | "fallback" (전체 산출 신뢰도)
  createdAt DateTime @default(now())
  @@unique([date])
}
```

마이그레이션은 운영 규약대로 `prisma db push`(not `migrate`). 근거: `AGENT_NORTH_STAR.md` 프로젝트 사실 규약.

### 4.6 API 라우트 — `apps/web/app/api/fomo/keywords/route.ts` (신규)

`feed/route.ts` 패턴을 따른다(snapshot-first → 라이브 폴백 → 절대 빈값 없음).

```
GET /api/fomo/keywords
  1) 오늘 KeywordCardSnapshot 있으면 그대로 반환 (live:false)
  2) 없으면(파이프라인 실행 전) 라이브 산출 시도 (live:true, confidence 동봉)
  3) 라이브도 실패하면 mock.ts를 명시적 폴백으로 반환 (confidence:"fallback")
  응답: { date, cards: KeywordCard[], confidence, live }
```

**중요(지난 인사이트 반영)**: 응답에 `confidence`를 반드시 포함한다. 엔진은 신뢰도를 계산하는데 UI가 못 받으면 정직성이 사라진다.

### 4.7 UI 연결 — `KeywordCardFeed.tsx` (mock 제거)

- `import { MOCK_KEYWORD_CARDS }` 제거 → `fetch('/api/fomo/keywords')`로 교체.
- `fomoApi.ts`에 `fetchKeywords()` 추가(기존 `fetchFeed`/`fetchNews` 패턴).
- 로딩 = 스켈레톤, 실패 = 담담한 빈 상태(무한 로딩 금지).
- `confidence !== "high"`일 때 포모의 정직한 한마디 노출(§5).

### 4.8 cron 워크플로 — `.github/workflows/keyword-cards-pipeline.yml` (신규)

`fomo-index-pipeline.yml`을 복제·수정. 하루 1~3회(한국장 마감 후 + 미국장 마감 후) `npm run keywords:generate` → 스냅샷 DB 저장. AI envs 동일.

---

## 5. 신뢰도 / 폴백 (정직성 노출 — 차별점)

지난 분석의 핵심 인사이트를 제품 기능으로 전환한다: **폴백을 숨기지 말고 포모의 솔직함으로 노출한다.**

| 전체 confidence | 화면 처리 |
|---|---|
| high | 평소대로 카드 노출 |
| medium / low | 카드 노출 + 작은 한마디: "오늘은 데이터가 좀 적어서 포모도 긴가민가해 🤔" |
| fallback | "오늘은 시장이 너무 조용해서 보여줄 게 별로 없어. 그것도 정상이야." (가짜 점수 강제 생성 금지) |

이건 "함께 불안해하는 친구" 정체성과 정확히 맞고, 경쟁 감정·지수 앱이 절대 안 하는 차별화다.

---

## 6. 개발 순서 (Phase 0 → 4)

> 원칙: **매 Phase 끝에 화면에 진짜 숫자가 하나 더 늘어난다.** 엔진을 다 만들고 한 번에 붙이지 않는다.

### Phase 0 — 정리 (0.5일)
- 타로 잔재 legacy 브랜치로 이동 후 main에서 제거(`packages/tarot-core`, `apps/tarot-mobile`, `apps/web/app/api/tarot/*`, `apps/web/lib/tarot/*`, `docs/사주팔자_*`).
- `KeywordCardSnapshot` 모델 추가 + `db push`.
- **Acceptance**: 타입체크·빌드 통과, 타로 참조 0건(`grep -ri tarot apps packages | wc -l == 0`).

### Phase 1 — 추출 + 점수 (코어 엔진) (2일)
- `keyword-cards/extract.ts` + `score.ts` 작성. 순수 함수 + vitest.
- 입력은 mock 기사 배열로 먼저 테스트(네트워크 불필요).
- **Acceptance**: mock 기사 → 실제 산출된 키워드 점수가 나온다. 테스트 통과. 아직 화면 연결 X.

### Phase 2 — 실데이터 + API + UI 연결 (2일) ★ 가장 중요
- `feed/route.ts` 패턴으로 라이브 산출 → `/api/fomo/keywords`.
- `KeywordCardFeed.tsx`의 mock import 제거 → fetch 연결.
- 코멘트는 이 단계에선 **룰 폴백 템플릿**만(LLM은 Phase 3).
- **Acceptance**: 웹에서 새로고침할 때마다 실제 뉴스/커뮤니티 기반 키워드·점수가 보인다. mock 0건. confidence가 화면에 반영된다.
- → **여기서 핵심 가설(매일 신선하면 다시 온다)을 처음으로 검증 가능.**

### Phase 3 — LLM 코멘트 + 가드레일 (1.5일)
- `comment.ts` LLM 연결 + 금칙어 가드 + 룰 폴백.
- **Acceptance**: 코멘트가 매일 다르고 자연스럽다. 가드레일 테스트(투자조언/예측 문장 주입 시 폐기) 통과.

### Phase 4 — 스냅샷 cron + 깊이 페이지 실연결 (1.5일)
- `keyword-cards-pipeline.yml` cron → 일일 스냅샷.
- `KeywordDepthPage`의 "곧 추가될 거야" placeholder → depth.why/remember 실데이터 연결.
- **Acceptance**: 사용자 접속 없이도 매일 스냅샷 생성(누락 0). 깊이 페이지에 placeholder 0건.

이후(별도 라운드): 개인화(스와이프/히스토리 신호 → 덱 정렬), 카테고리 확장(부동산·환율).

---

## 7. 테스트 가드 (필수)

- `extract`/`score`/룰 폴백은 순수 함수 + vitest(네트워크 불필요).
- 가드레일 테스트: 코멘트 출력에 투자조언/예측/전문용어 정규식 매칭 시 fail.
- "균형추 누락" 테스트: 모든 코멘트에 진정 결 키워드가 1개 이상 포함되는지.
- 폴백 테스트: 입력 전무 시 에러 없이 confidence "fallback" 반환.
