# 카드 3슬롯 커버리지 (WO-SUB-08 착수 조건)

측정일: 2026-08-06 · 룰셋 `archetype-v1.0.0`

> **필드 존재가 아니라 화면에 낼 수 있는지로 셌다.**
> 슬롯 ② 는 `toRenderable(context)`, 슬롯 ③ 은 `buildValuationChart(...).renderable` 이 게이트다.
> `slot1_revenue_source !== null` 로 세면 화면에 못 나오는 것을 있다고 세게 된다.

> 슬롯 ① 은 **발행 카드라는 사실 자체가 근거**라 100% 다(§4-1: 없으면 카드가 성립하지 않는다).
> 표본은 원장 발행 종목이라 수급 엔진의 선택 편향이 있다 — 다만 08 이 묻는 것이
> "우리가 발행하는 카드가 어떤 모양인가"라 여기서는 그 편향이 맞는 모수다.

## 판정

①만 있는 카드가 36.5% 로 과반이 아니다. 3슬롯 구조를 기준으로 설계하되
생략 시 승격 규칙을 지킨다.

## 1. 오늘 노출 중인 덱

### live deck (n=10)

| 조합 | 카드 수 | 비율 |
|---|---|---|
| ①만 ⚠️ | 6 | 60.0% |
| ①② | 3 | 30.0% |
| ①③ | 1 | 10.0% |
| ①②③ | 0 | 0.0% |

- 슬롯 ② 실체 **3/10 (30.0%)** · 슬롯 ③ 값의 위치 **1/10 (10.0%)**

| 슬롯 | 못 나오는 사유 | 건수 |
|---|---|---|
| ② | `no_record` | 4 |
| ② | `not_renderable` | 3 |
| ③ | `unclassified` | 7 |
| ③ | `bar_series_unavailable` | 2 |

| `unclassified` 사유 | 건수 | 02R 카탈로그가 푸나 |
|---|---|---|
| `no_rule_matched` | 7 | **예** — 02R 이 정확히 이걸 푼다 |

| 아키타입 | n | 슬롯③ 성공 |
|---|---|---|
| `UNCLASSIFIED` | 7 | 0 (0.0%) |
| `BANK_FINANCIAL` | 2 | 0 (0.0%) |
| `CYCLICAL_COMMODITY` | 1 | 1 (100.0%) |

## 2. 365일 발행 이력

### universe (n=362)

| 조합 | 카드 수 | 비율 |
|---|---|---|
| ①만 | 132 | 36.5% |
| ①② | 5 | 1.4% |
| ①③ | 221 | 61.0% |
| ①②③ | 4 | 1.1% |

- 슬롯 ② 실체 **9/362 (2.5%)** · 슬롯 ③ 값의 위치 **225/362 (62.2%)**

| 슬롯 | 못 나오는 사유 | 건수 |
|---|---|---|
| ② | `no_record` | 331 |
| ② | `not_renderable` | 22 |
| ③ | `unclassified` | 105 |
| ③ | `bar_series_unavailable` | 32 |

| `unclassified` 사유 | 건수 | 02R 카탈로그가 푸나 |
|---|---|---|
| `no_rule_matched` | 82 | **예** — 02R 이 정확히 이걸 푼다 |
| `no_fiscal` | 20 | 아니오 — 재무 데이터 결손 |
| `no_sector` | 3 | 아니오 — 분류 코드 결손 |

| 아키타입 | n | 슬롯③ 성공 |
|---|---|---|
| `UNCLASSIFIED` | 105 | 0 (0.0%) |
| `CYCLICAL_COMMODITY` | 95 | 95 (100.0%) |
| `TURNAROUND_LOSS` | 44 | 44 (100.0%) |
| `QUALITY_COMPOUNDER` | 33 | 33 (100.0%) |
| `HYPERGROWTH_UNPROFITABLE` | 26 | 26 (100.0%) |
| `BANK_FINANCIAL` | 22 | 0 (0.0%) |
| `PHARMA_STABLE` | 16 | 16 (100.0%) |
| `MATURE_INCOME` | 10 | 0 (0.0%) |
| `BIOTECH_PIPELINE` | 6 | 6 (100.0%) |
| `ASSET_DEEP_VALUE` | 5 | 5 (100.0%) |

## 3. 미분류 사유 분해 (WO-SUB-FINISH [A-0])

> A-0: **549종목을 모으기 전에** 오늘 덱 미분류가 왜 미분류인지 사유별로 확인한다.
> `no_rule_matched` 가 소수면 B2(표본 수집)를 축소하거나 중단한다 —
> 카탈로그를 늘려도 안 풀리는 것에 2~3일을 쓰지 않는다.

### live deck — 미분류 종목별 관측값 (n=7)

| 종목 | 시장 | 사유 | 체계 | 업종 | 재무 | 순이익TTM | 매출YoY | CAGR3Y | 배당률 | PBR | 순현금비 | 연간관측 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Albertsons Companies, Inc.` | US | `no_rule_matched` | nasdaq_industry | Food Chains | full | 흑자 | 0.2 | 2.3 | — | 3.63 | — | 5 |
| `Orion Group Holdings Inc` | US | `no_rule_matched` | nasdaq_industry | Military/Government/Technical | full | 흑자 | 14.7 | 4.4 | — | 2.47 | -0.15 | 5 |
| `V F Corp` | US | `no_rule_matched` | nasdaq_industry | Garments and Clothing | full | 흑자 | 8.0 | -6.2 | — | 3.24 | -0.45 | 5 |
| `빅텍` | KR | `no_rule_matched` | naver_industry | 우주항공과국방 | full | 흑자 | 39.9 | 3.7 | 1.02 | 1.46 | -0.22 | 5 |
| `우진` | KR | `no_rule_matched` | naver_industry | 기계 | full | 흑자 | 36.9 | 6.6 | 2.03 | 1.24 | 0.07 | 5 |
| `일진파워` | KR | `no_rule_matched` | naver_industry | 건설 | full | 흑자 | 55.4 | 8.7 | 3.21 | 1.09 | -0.12 | 5 |
| `풍산` | KR | `no_rule_matched` | naver_industry | 비철금속 | full | 흑자 | 9.9 | 4.9 | 2.41 | 0.43 | -0.43 | 5 |

> 단위: 매출YoY·CAGR3Y·배당률 = %, 순현금비 = 순현금/시가총액, 연간관측 = 영업이익률 표준편차 관측 연수(5 미만이면 통계 미신뢰).

### universe — 미분류 종목별 관측값 (n=105)

| 종목 | 시장 | 사유 | 체계 | 업종 | 재무 | 순이익TTM | 매출YoY | CAGR3Y | 배당률 | PBR | 순현금비 | 연간관측 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `1Q 단기특수은행채액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `Albertsons Companies, Inc.` | US | `no_rule_matched` | nasdaq_industry | Food Chains | full | 흑자 | 0.2 | 2.3 | — | 3.63 | — | 5 |
| `CJ프레시웨이` | KR | `no_rule_matched` | naver_industry | 식품과기본식료품소매 | full | 흑자 | 4.4 | 8.2 | 2.16 | 0.72 | -0.27 | 5 |
| `Lam Research Corporation` | US | `no_rule_matched` | nasdaq_industry | Industrial Machinery/Components | full | 흑자 | 23.8 | 2.3 | 0.35 | 37.54 | 0.00 | 5 |
| `NH농우바이오` | KR | `no_rule_matched` | naver_industry | 생물공학 | full | 흑자 | -2.7 | 6.0 | 3.69 | 0.38 | 0.09 | 5 |
| `Orion Group Holdings Inc` | US | `no_rule_matched` | nasdaq_industry | Military/Government/Technical | full | 흑자 | 14.7 | 4.4 | — | 2.47 | -0.15 | 5 |
| `V F Corp` | US | `no_rule_matched` | nasdaq_industry | Garments and Clothing | full | 흑자 | 8.0 | -6.2 | — | 3.24 | -0.45 | 5 |
| `델테크놀로지스` | US | `no_rule_matched` | nasdaq_industry | Computer Manufacturing | full | 흑자 | 87.5 | 3.5 | — | — | -0.06 | 5 |
| `램리서치` | US | `no_rule_matched` | nasdaq_industry | Industrial Machinery/Components | full | 흑자 | 23.8 | 2.3 | 0.35 | 37.54 | 0.00 | 5 |
| `비트코인` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `빅텍` | KR | `no_rule_matched` | naver_industry | 우주항공과국방 | full | 흑자 | 39.9 | 3.7 | 1.02 | 1.46 | -0.22 | 5 |
| `삼양바이오팜` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `솔라나` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `에스투더블유` | KR | `no_rule_matched` | naver_industry | IT서비스 | partial | — | — | — | — | 5.57 | — | 3 |
| `우진` | KR | `no_rule_matched` | naver_industry | 기계 | full | 흑자 | 36.9 | 6.6 | 2.03 | 1.24 | 0.07 | 5 |
| `이더리움` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `일진파워` | KR | `no_rule_matched` | naver_industry | 건설 | full | 흑자 | 55.4 | 8.7 | 3.21 | 1.09 | -0.12 | 5 |
| `퀄컴` | US | `no_rule_matched` | nasdaq_industry | Radio And Television Broadcasting And Communications Equipment | full | 흑자 | -4.0 | 0.1 | 2.43 | 6.18 | -0.05 | 5 |
| `풍산` | KR | `no_rule_matched` | naver_industry | 비철금속 | full | 흑자 | 9.9 | 4.9 | 2.41 | 0.43 | -0.43 | 5 |
| `Columbia Financial, Inc./Md/` | US | `no_fiscal` | nasdaq_industry | Savings Institutions | none | — | — | — | — | — | — | 0 |
| `한글과컴퓨터` | KR | `no_rule_matched` | naver_industry | 소프트웨어 | full | 흑자 | 4.4 | 10.5 | 2.15 | 0.91 | 0.22 | 5 |
| `갤럭시아머니트리` | KR | `no_rule_matched` | naver_industry | IT서비스 | full | 흑자 | 12.5 | 4.9 | 0.89 | 1.68 | -0.50 | 5 |
| `Alphabet Inc.` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | full | 흑자 | — | 10.7 | 0.24 | 7.17 | -0.01 | 4 |
| `Elevance Health Inc.` | US | `no_rule_matched` | nasdaq_industry | Medical Specialities | full | 흑자 | 1.4 | 8.3 | — | 1.83 | -0.25 | 5 |
| `LS에코에너지` | KR | `no_rule_matched` | naver_industry | 전기장비 | full | 흑자 | 25.0 | 5.5 | 0.57 | 3.99 | -0.09 | 5 |
| `WON 반도체밸류체인액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `노보노디스크` | US | `no_fiscal` | nasdaq_industry | Biotechnology: Pharmaceutical Preparations | none | — | — | — | — | — | — | 0 |
| `삼성전기우` | KR | `no_rule_matched` | naver_industry | 전자장비와기기 | partial | 흑자 | 17.2 | — | 0.55 | 3.39 | — | 3 |
| `성호전자` | KR | `no_rule_matched` | naver_industry | 전기제품 | full | 흑자 | 11.4 | 14.7 | — | 1.71 | -0.10 | 5 |
| `아마존` | US | `no_rule_matched` | nasdaq_industry | Catalog/Specialty Distribution | full | 흑자 | 19.6 | — | — | 5.42 | -0.02 | 1 |
| `알파벳` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | full | 흑자 | — | 10.7 | 0.24 | 7.21 | -0.01 | 4 |
| `엑스알피(리플)` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `달바글로벌` | KR | `no_rule_matched` | naver_industry | 화장품 | partial | 흑자 | 50.5 | — | 1.10 | 8.63 | — | 3 |
| `어플라이드머티어리얼즈` | US | `no_rule_matched` | nasdaq_industry | Semiconductors | full | 흑자 | 11.4 | 3.2 | 0.41 | 18.15 | 0.00 | 5 |
| `오라클` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Prepackaged Software | full | 흑자 | 20.6 | 10.5 | — | 9.87 | -0.23 | 5 |
| `현대코퍼레이션` | KR | `no_rule_matched` | naver_industry | 무역회사와판매업체 | full | 흑자 | 11.6 | 7.2 | 2.71 | 0.47 | -1.67 | 5 |
| `Salesforce Inc.` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Prepackaged Software | full | 흑자 | 13.3 | 9.8 | — | 4.57 | -0.19 | 5 |
| `도지코인` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `디케이티` | KR | `no_rule_matched` | naver_industry | 핸드셋 | full | 흑자 | 33.8 | 5.4 | — | 1.63 | -0.03 | 5 |
| `레이` | KR | `no_rule_matched` | naver_industry | 건강관리장비와용품 | full | 흑자 | 4.9 | -4.8 | — | 1.13 | -0.40 | 5 |
| `바이오비쥬` | KR | `no_rule_matched` | naver_industry | 화장품 | partial | — | — | — | 0.91 | 2.57 | 0.01 | 3 |
| `스페이스X` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | partial | — | — | — | — | 12.90 | 0.03 | 0 |
| `스포티파이` | US | `no_fiscal` | nasdaq_industry | Broadcasting | none | — | — | — | — | — | — | 0 |
| `아모텍` | KR | `no_rule_matched` | naver_industry | 핸드셋 | full | 흑자 | -27.4 | 5.6 | — | 1.21 | -0.21 | 5 |
| `어도비` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Prepackaged Software | full | 흑자 | 12.7 | 10.6 | — | 8.89 | 0.00 | 5 |
| `한전기술` | KR | `no_rule_matched` | naver_industry | 전기유틸리티 | partial | — | 7.0 | 0.9 | 1.36 | 5.10 | — | 5 |
| `IBM` | US | `no_rule_matched` | nasdaq_industry | Computer Manufacturing | full | 흑자 | 1.1 | 3.7 | — | 6.43 | -0.22 | 0 |
| `마키나락스` | KR | `no_rule_matched` | naver_industry | 소프트웨어 | partial | — | — | — | — | 33.70 | 0.00 | 3 |
| `세일즈포스` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Prepackaged Software | full | 흑자 | 13.3 | 9.8 | — | 4.57 | -0.19 | 5 |
| `에어비앤비` | US | `no_rule_matched` | nasdaq_industry | Diversified Commercial Services | full | 흑자 | 17.9 | 13.4 | — | 11.83 | 0.17 | 5 |
| `현대모비스` | KR | `no_rule_matched` | naver_industry | 자동차부품 | full | 흑자 | 5.5 | 5.6 | 1.35 | 0.85 | 0.06 | 5 |
| `Constellation Energy Corporation` | US | `no_rule_matched` | nasdaq_industry | Electric Utilities: Central | full | 흑자 | 63.9 | 1.5 | 0.62 | 2.85 | -0.17 | 5 |
| `Elevance Health, Inc.` | US | `no_rule_matched` | nasdaq_industry | Medical Specialities | full | 흑자 | 1.4 | 8.3 | — | 1.83 | -0.25 | 5 |
| `HD건설기계` | KR | `no_rule_matched` | naver_industry | 기계 | full | 흑자 | 154.2 | 2.4 | 0.43 | 1.24 | — | 5 |
| `Hewlett Packard Enterprise Company` | US | `no_rule_matched` | nasdaq_industry | Retail: Computer Software & Peripheral Equipment | full | 흑자 | 40.0 | 6.4 | — | 2.74 | -0.19 | 5 |
| `SK텔레콤` | KR | `no_rule_matched` | naver_industry | 무선통신서비스 | full | 흑자 | -1.4 | -0.4 | — | 1.42 | 0.05 | 5 |
| `더존비즈온` | KR | `no_sector` | — | — | full | 흑자 | 18.2 | 13.5 | — | — | — | 5 |
| `두산에너빌리티` | KR | `no_rule_matched` | naver_industry | 기계 | full | 흑자 | 13.7 | 3.4 | — | 3.70 | -0.03 | 5 |
| `Applied Materials Inc.` | US | `no_rule_matched` | nasdaq_industry | Semiconductors | full | 흑자 | 11.4 | 3.2 | 0.41 | 18.15 | 0.00 | 5 |
| `TIME 글로벌AI인공지능액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `대한전선` | KR | `no_rule_matched` | naver_industry | 전기장비 | full | 흑자 | 26.6 | 14.0 | — | 2.48 | 0.03 | 5 |
| `동진쎄미켐` | KR | `no_rule_matched` | naver_industry | 반도체와반도체장비 | full | 흑자 | -10.9 | -6.4 | 1.60 | 1.75 | -0.13 | 5 |
| `미래반도체` | KR | `no_rule_matched` | naver_industry | 반도체와반도체장비 | full | 흑자 | 113.8 | 4.9 | — | 1.60 | -0.36 | 5 |
| `삼성E&A` | KR | `no_rule_matched` | naver_industry | 건설 | full | 흑자 | 8.1 | -3.5 | 1.65 | 1.99 | 0.17 | 5 |
| `삼표시멘트` | KR | `no_rule_matched` | naver_industry | 건축자재 | full | 흑자 | 10.0 | -2.1 | 1.61 | 1.04 | -0.23 | 5 |
| `삼화콘덴서` | KR | `no_rule_matched` | naver_industry | 전기제품 | full | 흑자 | 0.6 | 3.8 | 0.64 | 2.87 | 0.05 | 5 |
| `아이로보틱스` | KR | `no_rule_matched` | naver_industry | 화학 | full | 흑자 | 20.1 | -0.9 | — | 1.93 | -0.01 | 5 |
| `에이다` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `일진전기` | KR | `no_rule_matched` | naver_industry | 전기장비 | full | — | 10.7 | 20.6 | 0.89 | 3.32 | -0.02 | 5 |
| `컴투스홀딩스` | KR | `no_rule_matched` | naver_industry | 게임엔터테인먼트 | full | 흑자 | — | — | — | 0.38 | -1.08 | 3 |
| `케이씨텍` | KR | `no_rule_matched` | naver_industry | 반도체와반도체장비 | full | 흑자 | 101.0 | 0.4 | 0.64 | 1.81 | — | 5 |
| `한국항공우주` | KR | `no_rule_matched` | naver_industry | 우주항공과국방 | full | 흑자 | 56.3 | 9.9 | 0.36 | 6.68 | -0.01 | 5 |
| `한진중공업홀딩스` | KR | `no_rule_matched` | naver_industry | 가스유틸리티 | full | 흑자 | -1.9 | -5.8 | 2.52 | 0.27 | -1.91 | 5 |
| `TIME 차이나AI테크액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `마라홀딩스` | US | `no_rule_matched` | nasdaq_industry | EDP Services | full | — | 18.3 | -20.7 | — | 2.01 | -0.42 | 5 |
| `신세계` | KR | `no_rule_matched` | naver_industry | 백화점과일반상점 | full | 흑자 | 10.9 | -3.9 | 1.22 | 0.59 | -0.92 | 5 |
| `트론` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `한국전력` | KR | `no_rule_matched` | naver_industry | 전기유틸리티 | full | 흑자 | 0.7 | 11.0 | 4.39 | 0.43 | — | 5 |
| `GE Vernova Inc.` | US | `no_sector` | nasdaq_industry | — | full | 흑자 | 21.9 | 8.7 | — | 20.67 | — | 4 |
| `가비아` | KR | `no_rule_matched` | naver_industry | IT서비스 | full | 흑자 | 10.4 | 11.9 | 0.21 | 1.65 | -0.13 | 5 |
| `남해화학` | KR | `no_rule_matched` | naver_industry | 화학 | full | 흑자 | 12.6 | -9.6 | 1.60 | 0.51 | -0.44 | 5 |
| `네비우스` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | partial | — | — | -58.5 | — | 12.48 | -0.01 | 5 |
| `넷마블` | KR | `no_rule_matched` | naver_industry | 게임엔터테인먼트 | full | 흑자 | 4.5 | 2.0 | 2.23 | 0.52 | -0.07 | 5 |
| `비스트라` | US | `no_rule_matched` | nasdaq_industry | Electric Utilities: Central | full | 흑자 | 43.4 | 8.9 | — | 8.63 | -0.38 | 5 |
| `삼익제약` | KR | `no_rule_matched` | naver_industry | 제약 | partial | — | — | — | 0.86 | 0.67 | — | 3 |
| `시스코` | US | `no_rule_matched` | nasdaq_industry | Computer Communications Equipment | full | 흑자 | 12.0 | 3.2 | 1.45 | 9.82 | -0.03 | 5 |
| `리센스메디컬` | KR | `no_rule_matched` | naver_industry | 건강관리장비와용품 | partial | — | — | — | — | 5.50 | 0.11 | 3 |
| `체인링크` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `폴레드` | KR | `no_rule_matched` | naver_industry | 가정용기기와용품 | partial | — | — | — | — | 2.04 | 0.11 | 3 |
| `프레스티지바이오로직스` | KR | `no_rule_matched` | naver_industry | 제약 | partial | — | -24.9 | — | — | 1.32 | -0.17 | 5 |
| `SNT홀딩스` | KR | `no_rule_matched` | naver_industry | 자동차부품 | full | 흑자 | 3.0 | 11.1 | 6.12 | 0.32 | — | 5 |
| `암젠` | US | `no_rule_matched` | nasdaq_industry | Biotechnology: Biological Products (No Diagnostic Substances) | full | 흑자 | 5.8 | 11.8 | 2.66 | 22.25 | -0.22 | 5 |
| `Amazon.com Inc.` | US | `no_rule_matched` | nasdaq_industry | Catalog/Specialty Distribution | full | 흑자 | 19.6 | — | — | 5.42 | -0.02 | 1 |
| `캔톤` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `RF머트리얼즈` | KR | `no_rule_matched` | naver_industry | 우주항공과국방 | full | 흑자 | 69.6 | 8.3 | — | 3.58 | -0.01 | 5 |
| `그린광학` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `Verisk Analytics Inc.` | US | `no_rule_matched` | nasdaq_industry | Diversified Commercial Services | full | 흑자 | 3.9 | 7.2 | 1.04 | — | -0.17 | 5 |
| `리브스메드` | KR | `no_rule_matched` | naver_industry | 건강관리장비와용품 | partial | — | — | — | — | 5.72 | 0.01 | 3 |
| `메쥬` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `아세아시멘트` | KR | `no_rule_matched` | naver_industry | 건축자재 | full | 흑자 | 9.1 | -0.6 | 2.71 | 0.30 | 0.12 | 5 |
| `인피니트헬스케어` | KR | `no_rule_matched` | naver_industry | 건강관리기술 | full | 흑자 | 31.1 | 5.1 | 2.13 | 1.12 | 0.06 | 5 |
| `Autodesk Inc.` | US | `no_fiscal` | nasdaq_industry | Computer Software: Prepackaged Software | none | — | — | — | — | — | — | 0 |
| `GE버노바` | US | `no_sector` | nasdaq_industry | — | full | 흑자 | 21.9 | 8.7 | — | 20.44 | — | 4 |
| `콜마홀딩스` | KR | `no_rule_matched` | naver_industry | 화장품 | full | 흑자 | -0.3 | -1.0 | 2.91 | 0.38 | 0.27 | 5 |
| `한국콜마` | KR | `no_rule_matched` | naver_industry | 화장품 | full | 흑자 | 11.5 | 13.4 | 0.91 | 1.18 | -0.32 | 5 |

> 단위: 매출YoY·CAGR3Y·배당률 = %, 순현금비 = 순현금/시가총액, 연간관측 = 영업이익률 표준편차 관측 연수(5 미만이면 통계 미신뢰).

### A-0 판정

| 모집단 | 미분류 | `no_rule_matched` | 카탈로그 구제 가능 비율 |
|---|---|---|---|
| 오늘 덱 | 7 | 7 | 100.0% |
| 365일 유니버스 | 105 | 82 | 78.1% |

**유니버스 미분류의 78.1% 가 `no_rule_matched` 다 — 02R 이 푸는 종류다.**
B2(549종목 표본 수집)를 설계대로 진행한다.

> 덱 표본은 n=7 이다. 비율로 읽지 말고 **건수로** 읽는다 — 카탈로그가 구제할 수 있는 덱 카드는 최대 7장이고, 그것이 곧 02R 이 오늘 화면에 낼 수 있는 상한이다.

## 4. 사유 읽는 법

| 사유 | 뜻 | 해소 경로 |
|---|---|---|
| `no_record` | 사업 실체 레코드 자체가 없다 | WO-SUB-03 배치가 아직 안 돈 종목 |
| `not_renderable` | 레코드는 있는데 배지가 `없음`이거나 슬롯1 미검증 | 입력 크기·검증기 문제(03.5 C-1) |
| `no_factsheet` | 팩트시트가 없다 | WO-SUB-01 백필 |
| `unclassified` | 아키타입 미분류 | 02R 카탈로그 재도출 |
| `bar_series_unavailable` | 그 유형의 막대축 시계열이 소스에 없다 | **데이터를 더 모아도 안 된다** — 축 설계 문제 |
| `no_bar_data` | 축은 되는데 이 종목에 값이 없다 | 그 종목의 결손 |

`unclassified` 안쪽 사유(A-0):

| 사유 | 뜻 | 02R 카탈로그가 푸나 |
|---|---|---|
| `no_rule_matched` | 규칙을 전부 통과했는데 어디에도 안 걸렸다 | **예** |
| `no_sector` | 업종·섹터 분류 코드가 없다 | 아니오 — 분류 코드 결손 |
| `no_fiscal` | 재무 커버리지가 `none` 이다 | 아니오 — 재무 데이터 결손 |
| `unknown_scheme` | 분류 체계를 업종 집합으로 해석할 수 없다 | 아니오 — 체계 매핑 부재 |
