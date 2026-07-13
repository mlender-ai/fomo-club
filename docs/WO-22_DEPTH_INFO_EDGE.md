# WO-22: 뎁스 정보 우위 — "카드와 뎁스가 다를 게 없다" 해소 (2026-07-13)

> BCG식 진단→처방. 정본: `docs/PRODUCT_VISION.md`(§6 뎁스 = 사실·출처·시점·양면) > `AGENTS.md` > `docs/DATA_ENGINE_STRATEGY.md`. WO-19(원문 제목 그대로 금지)·WO-20(why-first) 정합.

## 0. Executive Summary

유저 불만 3가지 — ① US 종목 훅이 영어 원문 그대로, ② 근거가 "RSI 39" 식 지표 나열(의미 없음), ③ 카드 대비 뎁스의 정보 우위 없음(결제/광고 걸 메리트 부재).

**진단: 새 데이터가 필요한 게 아니라, 이미 만들어 놓은 데이터를 뎁스가 버리고 있다.**
- `stock-insight`(크론 LLM)가 주는 `CondensedInsight`에는 **whyHot 2~3문장, 강세/약세 양면 근거(bull/bear)+원문 링크, 공식 지표(officialFacts), 출처 다양성 정직 표기, 숨은 연관주**가 전부 있는데 — `StockInsightView`는 **whyHot 첫 문장 하나만** 근거 리스트에 끼워 넣고 나머지를 폐기한다.
- 양면 컴포넌트 `StockReadGuide`(강세/약세/관전 포인트)는 **정의만 있고 어디서도 렌더 안 되는 죽은 코드**.
- verdict 엔진은 `insider` 입력을 지원하는데 `assembleStockFront`가 **한 번도 전달하지 않는다** — US 종목은 수급 신호가 0이라 거의 항상 "관망 + 신호 부족".
- US 훅 영어 노출: 번역 캐시(`koreanTitle`)는 URL 키인데, ①심볼별 Yahoo RSS 기사가 번역 크론 코퍼스(`fetchAllNews`)에 안 들어가고 ②`newsEventLabel` 경로는 URL을 버려서 조회 자체가 불가.

## 1. 이슈 트리 (MECE)

```
뎁스에 정보 우위가 없다
├─ A. 이미 있는 인사이트를 안 보여줌 (P0 — 프론트만으로 해결)
│   ├─ A1. whyHot 전문·bull/bear 양면·원문 링크·officialFacts 미렌더 (StockInsightView)
│   └─ A2. 출처 정직 표기(singleOutlet·lean) 미렌더 — PRODUCT_VISION "양면" 위반 상태
├─ B. 근거가 숫자 나열 (P0 — 서술화 사전)
│   └─ "RSI 39" → 의미 밴드("과열 아님, 많이 눌린 자리") 없이 노출
├─ C. US 콘텐츠 영어 (P0 — 번역 파이프 2개 구멍)
│   ├─ C1. 심볼별 Yahoo 기사 번역 코퍼스 미포함 (훅/재료 제목)
│   └─ C2. newsEventLabel 경로가 URL 폐기 → koreanTitle 조회 불가
└─ D. 신호 자체의 얇음 (P1~ — 데이터 연결)
    ├─ D1. insider 미연결 (verdict 지원하는데 전달 0 — US 신호 공백의 주범)
    ├─ D2. DART/SEC 공시·증권사 리서치가 뎁스 섹션으로 없음 (LLM 코퍼스에만)
    └─ D3. 숨은 연관주(relatedStocks) 뎁스 미노출
```

## 2. 처방 — 우선순위 (Impact × Effort)

| WS | 내용 | Impact | Effort | Phase |
| --- | --- | --- | --- | --- |
| A | **뎁스 "원문 정리" 섹션 복원** — whyHot 전문 + 강세/약세 양면(원문 보기 링크) + 공식 지표 + 한곳출처 정직 표기 | 카드↔뎁스 차별화 즉시 | S(데이터 이미 도착) | **0** |
| B | **근거 서술화** — RSI·52주 갭·거래량에 의미 밴드 문구(결정론 사전) | "뭐 어쩌라고" 해소 | S | **0** |
| C | **US 한글화** — 번역 크론에 US 무버 심볼별 기사 포함 + newsEvent 경로 URL 보존→koreanTitle 적용 | 영어 노출 제거 | M | **0** |
| D1 | insider → verdict 연결(KR DART·US SEC Form4, 크론 캐시 경유) — US "신호 부족" 해소 | 판단 품질 | M | **1** |
| D2 | 공시·리서치 타임라인 섹션("무슨 일이 있었나" 확장) | 정보 밀도 | M | **1** |
| D3 | 숨은 연관주 뎁스 노출(발굴 정체성 — "이걸 본 사람이 놓친 종목") | 차별화·BM | M | **2** |
| E | 결제 훅 설계(뎁스 프리미엄 구획) — D1~D3 정보 우위 확보 후 | BM | L | **2** |

비범위: 발견 표면 변경 금지, 예측/목표가/매수신호 금지(양면 사실까지만), 새 유료 API 도입 보류.

## 3. Phase 0 구현

| 파일 | 변경 |
| --- | --- |
| `apps/fomo-web/components/KeywordDepthPage.tsx` | StockInsightView why-탭에 "원문 정리" 섹션(whyHot 전문+bull/bear evidenceItem 링크+officialFacts+singleOutlet)·근거 서술화 사전 |
| `apps/web/lib/content-i18n.ts` | (필요시) 번역 대상 수집 헬퍼 |
| `apps/web/app/api/fomo/cron/feed-content/route.ts` | morning 슬롯: US 무버/덱 상위 심볼별 Yahoo 기사 제목 번역 코퍼스 추가 |
| `apps/web/lib/stock-signal-coverage.ts` | newsEvent에 URL 보존 → 소비처에서 `koreanTitle(url)` 적용 |
| `apps/web/lib/stock-front.ts` | axisHook/materialLabel에 한글 제목 우선 적용 |

검증: vitest(신규: 서술화 사전·newsEvent URL 보존), typecheck, guard:discovery(stock-front 접촉), 배포 후 메타 뎁스 실측(영어 훅 소멸 + 원문 정리 섹션).

KPI: ① 뎁스 전용 정보 블록 수 2개(판단/재무) → 4개+(양면·공식지표·출처) ② US 뎁스 영어 훅 노출 0 ③ 근거 문장 중 "숫자 단독" 0.

## 4. 사건 맥락

같은 날 WO-21(브리핑 신선도)과 함께 발생한 신뢰 이슈. 공통 교훈: **수집·생성은 돼 있는데 표면화가 끊긴 곳이 신뢰를 깎는다** — 파이프라인 끝단(렌더)까지 데이터가 흐르는지 정기 점검 필요(Phase 1에서 `pipeline-monitor` 에이전트 항목으로 추가 검토).
