# 카드 3슬롯 커버리지 (WO-SUB-08 착수 조건)

측정일: 2026-08-06 · 룰셋 `archetype-v1.2.0`

> **필드 존재가 아니라 화면에 낼 수 있는지로 셌다.**
> 슬롯 ② 는 `toRenderable(context)`, 슬롯 ③ 은 `buildValuationChart(...).renderable` 이 게이트다.
> `slot1_revenue_source !== null` 로 세면 화면에 못 나오는 것을 있다고 세게 된다.

> 슬롯 ① 은 **발행 카드라는 사실 자체가 근거**라 100% 다(§4-1: 없으면 카드가 성립하지 않는다).
> 표본은 원장 발행 종목이라 수급 엔진의 선택 편향이 있다 — 다만 08 이 묻는 것이
> "우리가 발행하는 카드가 어떤 모양인가"라 여기서는 그 편향이 맞는 모수다.

## 판정

①만 있는 카드가 11.7% 로 과반이 아니다. 3슬롯 구조를 기준으로 설계하되
생략 시 승격 규칙을 지킨다.

## 1. 오늘 노출 중인 덱

### live deck (n=10)

| 조합 | 카드 수 | 비율 |
|---|---|---|
| ①만 | 1 | 10.0% |
| ①② | 0 | 0.0% |
| ①③ | 7 | 70.0% |
| ①②③ | 2 | 20.0% |

- 슬롯 ② 실체 **2/10 (20.0%)** · 슬롯 ③ 값의 위치 **9/10 (90.0%)**

| 슬롯 | 못 나오는 사유 | 건수 |
|---|---|---|
| ② | `no_record` | 4 |
| ② | `not_renderable` | 4 |
| ③ | `unclassified` | 1 |

| `unclassified` 사유 | 건수 | 02R 카탈로그가 푸나 |
|---|---|---|
| `no_rule_matched` | 1 | **예** — 02R 이 정확히 이걸 푼다 |

| 아키타입 | n | 슬롯③ 성공 |
|---|---|---|
| `STABLE_EARNINGS` | 6 | 6 (100.0%) |
| `CYCLICAL_COMMODITY` | 1 | 1 (100.0%) |
| `BANK_FINANCIAL` | 1 | 1 (100.0%) |
| `UNCLASSIFIED` | 1 | 0 (0.0%) |
| `TURNAROUND_LOSS` | 1 | 1 (100.0%) |

## 2. 365일 발행 이력

### universe (n=385)

| 조합 | 카드 수 | 비율 |
|---|---|---|
| ①만 | 45 | 11.7% |
| ①② | 0 | 0.0% |
| ①③ | 327 | 84.9% |
| ①②③ | 13 | 3.4% |

- 슬롯 ② 실체 **13/385 (3.4%)** · 슬롯 ③ 값의 위치 **340/385 (88.3%)**

| 슬롯 | 못 나오는 사유 | 건수 |
|---|---|---|
| ② | `no_record` | 269 |
| ② | `not_renderable` | 103 |
| ③ | `unclassified` | 45 |

| `unclassified` 사유 | 건수 | 02R 카탈로그가 푸나 |
|---|---|---|
| `no_rule_matched` | 24 | **예** — 02R 이 정확히 이걸 푼다 |
| `no_fiscal` | 20 | 아니오 — 재무 데이터 결손 |
| `no_sector` | 1 | 아니오 — 분류 코드 결손 |

| 아키타입 | n | 슬롯③ 성공 |
|---|---|---|
| `CYCLICAL_COMMODITY` | 97 | 97 (100.0%) |
| `STABLE_EARNINGS` | 69 | 69 (100.0%) |
| `TURNAROUND_LOSS` | 48 | 48 (100.0%) |
| `UNCLASSIFIED` | 45 | 0 (0.0%) |
| `QUALITY_COMPOUNDER` | 35 | 35 (100.0%) |
| `HYPERGROWTH_UNPROFITABLE` | 29 | 29 (100.0%) |
| `BANK_FINANCIAL` | 26 | 26 (100.0%) |
| `PHARMA_STABLE` | 16 | 16 (100.0%) |
| `MATURE_INCOME` | 10 | 10 (100.0%) |
| `BIOTECH_PIPELINE` | 6 | 6 (100.0%) |
| `ASSET_DEEP_VALUE` | 4 | 4 (100.0%) |

## 3. 미분류 사유 분해 (WO-SUB-FINISH [A-0])

> A-0: **549종목을 모으기 전에** 오늘 덱 미분류가 왜 미분류인지 사유별로 확인한다.
> `no_rule_matched` 가 소수면 B2(표본 수집)를 축소하거나 중단한다 —
> 카탈로그를 늘려도 안 풀리는 것에 2~3일을 쓰지 않는다.

### live deck — 미분류 종목별 관측값 (n=1)

| 종목 | 시장 | 사유 | 체계 | 업종 | 재무 | 순이익TTM | 매출YoY | CAGR3Y | 배당률 | PBR | 순현금비 | 연간관측 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `일진파워` | KR | `no_rule_matched` | naver_industry | 건설 | full | 흑자 | 55.4 | 8.7 | 3.08 | 1.14 | -0.11 | 5 |

> 단위: 매출YoY·CAGR3Y·배당률 = %, 순현금비 = 순현금/시가총액, 연간관측 = 영업이익률 표준편차 관측 연수(5 미만이면 통계 미신뢰).

### universe — 미분류 종목별 관측값 (n=45)

| 종목 | 시장 | 사유 | 체계 | 업종 | 재무 | 순이익TTM | 매출YoY | CAGR3Y | 배당률 | PBR | 순현금비 | 연간관측 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `뉴로핏` | KR | `no_rule_matched` | naver_industry | 건강관리기술 | partial | — | — | — | — | 5.46 | — | 3 |
| `뉴엔AI` | KR | `no_rule_matched` | naver_industry | IT서비스 | partial | — | — | — | — | 1.77 | — | 3 |
| `비트코인` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `솔라나` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `스페이스X` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | partial | — | — | — | — | 11.14 | 0.04 | 0 |
| `아이엠바이오로직스` | KR | `no_rule_matched` | naver_industry | 제약 | partial | — | — | — | — | 2.13 | — | 2 |
| `에이치엘지노믹스` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `엑스알피(리플)` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `이더리움` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `일진전기` | KR | `no_rule_matched` | naver_industry | 전기장비 | full | — | 10.7 | 20.6 | 0.85 | 3.32 | -0.02 | 5 |
| `일진파워` | KR | `no_rule_matched` | naver_industry | 건설 | full | 흑자 | 55.4 | 8.7 | 3.08 | 1.14 | -0.11 | 5 |
| `1Q 단기특수은행채액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `NH농우바이오` | KR | `no_rule_matched` | naver_industry | 생물공학 | full | 흑자 | -2.7 | 6.0 | 3.64 | 0.39 | 0.09 | 5 |
| `삼양바이오팜` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `에스투더블유` | KR | `no_rule_matched` | naver_industry | IT서비스 | partial | — | — | — | — | 5.47 | — | 3 |
| `Columbia Financial, Inc./Md/` | US | `no_fiscal` | nasdaq_industry | Savings Institutions | none | — | — | — | — | — | — | 0 |
| `WON 반도체밸류체인액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `노보노디스크` | US | `no_fiscal` | nasdaq_industry | Biotechnology: Pharmaceutical Preparations | none | — | — | — | — | — | — | 0 |
| `삼성전기우` | KR | `no_rule_matched` | naver_industry | 전자장비와기기 | partial | 흑자 | 17.2 | — | 0.56 | 3.74 | — | 3 |
| `아마존` | US | `no_rule_matched` | nasdaq_industry | Catalog/Specialty Distribution | full | 흑자 | 19.6 | — | — | 5.33 | -0.02 | 1 |
| `달바글로벌` | KR | `no_rule_matched` | naver_industry | 화장품 | partial | 흑자 | 50.5 | — | 1.10 | 8.63 | — | 3 |
| `도지코인` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `바이오비쥬` | KR | `no_rule_matched` | naver_industry | 화장품 | partial | — | — | — | 0.95 | 2.44 | 0.01 | 3 |
| `스포티파이` | US | `no_fiscal` | nasdaq_industry | Broadcasting | none | — | — | — | — | — | — | 0 |
| `한전기술` | KR | `no_rule_matched` | naver_industry | 전기유틸리티 | partial | — | 7.0 | 0.9 | 1.36 | 5.10 | — | 5 |
| `마키나락스` | KR | `no_rule_matched` | naver_industry | 소프트웨어 | partial | — | — | — | — | 44.85 | 0.00 | 3 |
| `더존비즈온` | KR | `no_sector` | — | — | full | 흑자 | 18.2 | 13.5 | — | — | — | 5 |
| `TIME 글로벌AI인공지능액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `에이다` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `컴투스홀딩스` | KR | `no_rule_matched` | naver_industry | 게임엔터테인먼트 | full | 흑자 | — | — | — | 0.36 | -1.13 | 3 |
| `TIME 차이나AI테크액티브` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `트론` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `한국전력` | KR | `no_rule_matched` | naver_industry | 전기유틸리티 | full | 흑자 | 0.7 | 11.0 | 4.33 | 0.43 | — | 5 |
| `네비우스` | US | `no_rule_matched` | nasdaq_industry | Computer Software: Programming, Data Processing | partial | — | — | -58.5 | — | 12.10 | -0.01 | 5 |
| `삼익제약` | KR | `no_rule_matched` | naver_industry | 제약 | partial | — | — | — | 0.71 | 0.81 | — | 3 |
| `리센스메디컬` | KR | `no_rule_matched` | naver_industry | 건강관리장비와용품 | partial | — | — | — | — | 5.58 | 0.10 | 3 |
| `체인링크` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `폴레드` | KR | `no_rule_matched` | naver_industry | 가정용기기와용품 | partial | — | — | — | — | 2.14 | 0.11 | 3 |
| `프레스티지바이오로직스` | KR | `no_rule_matched` | naver_industry | 제약 | partial | — | -24.9 | — | — | 1.33 | -0.17 | 5 |
| `SNT홀딩스` | KR | `no_rule_matched` | naver_industry | 자동차부품 | full | 흑자 | 3.0 | 11.1 | 6.22 | 0.32 | — | 5 |
| `Amazon.com Inc.` | US | `no_rule_matched` | nasdaq_industry | Catalog/Specialty Distribution | full | 흑자 | 19.6 | — | — | 5.33 | -0.02 | 1 |
| `캔톤` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `그린광학` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |
| `리브스메드` | KR | `no_rule_matched` | naver_industry | 건강관리장비와용품 | partial | — | — | — | — | 5.72 | 0.01 | 3 |
| `메쥬` | KR | `no_fiscal` | — | — | none | — | — | — | — | — | — | 0 |

> 단위: 매출YoY·CAGR3Y·배당률 = %, 순현금비 = 순현금/시가총액, 연간관측 = 영업이익률 표준편차 관측 연수(5 미만이면 통계 미신뢰).

### A-0 판정

| 모집단 | 미분류 | `no_rule_matched` | 카탈로그 구제 가능 비율 |
|---|---|---|---|
| 오늘 덱 | 1 | 1 | 100.0% |
| 365일 유니버스 | 45 | 24 | 53.3% |

**유니버스 미분류의 53.3% 가 `no_rule_matched` 다 — 02R 이 푸는 종류다.**
B2(549종목 표본 수집)를 설계대로 진행한다.

> 덱 표본은 n=1 이다. 비율로 읽지 말고 **건수로** 읽는다 — 카탈로그가 구제할 수 있는 덱 카드는 최대 1장이고, 그것이 곧 02R 이 오늘 화면에 낼 수 있는 상한이다.

## 4. `bar_series_unavailable` 진단 — 대체 축이 가능한가

`bar_series_unavailable` 0 — 전 유형의 막대축이 소스에 있다.

## 5. 사유 읽는 법

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
