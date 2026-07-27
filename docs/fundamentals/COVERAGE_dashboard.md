# 팩트시트 커버리지 대시보드 (WO-SUB-01)

| 항목 | 값 |
|---|---|
| 생성 | 2026-07-27T15:23:13.299Z |
| 기준일 | 2026-07-28 |
| 유니버스 | 56종목 |
| 레코드 | 56종목 (완료 조건 1: 유니버스와 같아야 한다) |

> 이 표는 **저장된 팩트시트를 센 것**이다. 문서 조사·추정으로 채운 칸은 없다.
> 값이 없는 칸은 `missing_fields` 에 그대로 등재되어 있다.

## 1. 필드별 확보율

| 필드 | KR (n=40) | US (n=16) |
|---|---|---|
| `fiscal.quarters` | 39/40 (97.5%) | 14/16 (87.5%) |
| `fiscal.annual` | 39/40 (97.5%) | 14/16 (87.5%) |
| `fiscal.ttm.revenue` | 38/40 (95%) | 12/16 (75%) |
| `fiscal.ttm.net_income` | 38/40 (95%) | 13/16 (81.3%) |
| `growth.revenue_yoy` | 38/40 (95%) | 13/16 (81.3%) |
| `growth.revenue_cagr_3y` | 0/40 (0%) | 11/16 (68.8%) |
| `margin.operating_ttm` | 38/40 (95%) | 9/16 (56.3%) |
| `margin.operating_stdev_8q` | 0/40 (0%) | 8/16 (50%) |
| `valuation.per_ttm` | 30/40 (75%) | 9/16 (56.3%) |
| `valuation.pbr` | 39/40 (97.5%) | 12/16 (75%) |
| `valuation.psr_ttm` | 38/40 (95%) | 11/16 (68.8%) |
| `valuation.dividend_yield` | 21/40 (52.5%) | 0/16 (0%) |
| `valuation.per_forward` | 21/40 (52.5%) | 10/16 (62.5%) |
| `balance.total_equity` | 39/40 (97.5%) | 14/16 (87.5%) |
| `market_data.market_cap` | 39/40 (97.5%) | 14/16 (87.5%) |
| `market_data.shares_outstanding` | 39/40 (97.5%) | 15/16 (93.8%) |
| `market_data.price` | 39/40 (97.5%) | 15/16 (93.8%) |
| `classification.industry` | 39/40 (97.5%) | 14/16 (87.5%) |
| `consensus.eps_fy1` | 22/40 (55%) | 13/16 (81.3%) |
| `consensus.revenue_fy1` | 21/40 (52.5%) | 0/16 (0%) |

## 2. 커버리지 플래그 · 최신성

| 그룹 | full | partial | none | 밴드 계산됨 | 최신 분기 지연(중앙값) |
|---|---|---|---|---|---|
| KR | 0 | 39 | 1 | 0/40 | 119일 |
| US | 14 | 0 | 2 | 0/16 | 89일 |

> 갱신 지연 = 최신 분기 **기간말**부터 기준일까지의 일수다. 공시 지연 + 소스 반영 지연의 합이며,
> 분기 종료 후 45~90일(법정 제출기한)이 정상 범위다. WO-SUB-00 §5 의 미측정 항목을 여기서 갚는다.

## 3. 밴드 미계산 사유

| 사유 | 건수 |
|---|---|
| 일별 종가 없음 | 48 |
| PER 유효 관측 N/N일 — 하한 N일 미달 | 36 |
| PBR 유효 관측 N/N일 — 하한 N일 미달 | 36 |
| PSR 유효 관측 N/N일 — 하한 N일 미달 | 36 |
| 종가 이력 N년 — N년 미만 | 9 |
| 기준주식수 없음 — 시가총액 시계열을 만들 수 없다 | 3 |

## 4. 실패·결손 종목

| 종목 | 시장 | coverage | 결측 필드 수 | 사유 |
|---|---|---|---|---|
| 012510 | KR | none | 59 | naver: integration 409 |
| ABNB | US | full | 27 | sec: USD 계열 개념 부재 — eps_diluted, interestExpense · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| ADBE | US | full | 21 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| BYRN | US | full | 23 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| CLBK | US | full | 27 | sec: USD 계열 개념 부재 — operating_income · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| CRM | US | full | 32 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| CRWV | US | full | 29 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| DELL | US | full | 34 | us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| ELV | US | full | 21 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| GLOO | US | full | 33 | sec: USD 계열 개념 부재 — interestExpense · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| GOOGL | US | full | 31 | nasdaq: summary 빈 응답(200) — 시총·섹터 미확인 · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| IBM | US | full | 34 | sec: USD 계열 개념 부재 — operating_income · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| NOW | US | full | 25 | nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| NVO | US | none | 42 | sec: USD 계열 개념 부재 — revenue, operating_income, net_income, eps_diluted, equity, liabilities, totalDebt, cash, operatingCashFlow, interestExpense, depreciation, shares · sec: 재무가 DKK 로 보고됨 — 통화 환산 금지 원칙상 사용 불가 · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| RBKB | US | full | 35 | sec: USD 계열 개념 부재 — operating_income, totalDebt · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| SHOP | US | full | 25 | sec: USD 계열 개념 부재 — liabilities, totalDebt · nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |
| ZZZZ | US | none | 63 | sec: CIK 매핑 없음(ZZZZ) · nasdaq: summary 빈 응답(200) — 시총·섹터 미확인 · us: 일별 종가 없음 — 5년 밴드 계산 불가(무료 경로 미확보, WO-SUB-00 실측 ③) |

## 5. 실행 메모

- 실행 모드: 지정 종목 · --dry(저장 안 함)
- 대상 56종목 전부 레코드 생성됨(56건) — 완료 조건 1
- `TWELVE_DATA_API_KEY`: **없음 — US 일별 종가가 0일로 측정된다.** 프로덕션 크론에서 재측정 필요
- `DATABASE_URL`: **없음 — 봉인 캔들 캐시를 읽지 못한다.** KR/US 종가가 이 실행에서 짧게 잡힐 수 있다
- `DART_API_KEY`: 없음 — KR 8분기·실공시일·현금흐름은 미확보 상태다

## 6. WO-SUB-00 실사와의 대조 (완료 조건 7)

WO 는 실사 결과와 ±5%p 이내 일치를 요구한다. 표본 구성이 달라(실사 45 KR / 4+11 US, 여기 40 KR / 16 US)
셀 단위로 같지는 않으므로 **방향과 크기**를 대조한다.

| 항목 | WO-SUB-00 실사 | 이 대시보드 | 판정 |
|---|---|---|---|
| KR 분기 재무 | 97.8% | 97.5% | ✅ 0.3%p |
| KR 섹터/업종 | 97.8% | 97.5% | ✅ 0.3%p |
| KR PBR | 97.8% | 97.5% | ✅ 0.3%p |
| KR PER | 75.6% | 75.0% | ✅ 0.6%p |
| KR 배당 | 55.6% | 52.5% | ✅ 3.1%p |
| US 분기 재무(대형주 90.9%) | 90.9% | 87.5% | ✅ 3.4%p |
| US EPS 컨센서스(대형주 11/11) | 100% | 81.3% | ⚠️ 표본에 소형주·외국발행사 포함 — 대형주만 보면 일치 |
| **KR 매출 컨센서스** | **0%** | **52.5%** | ❌ **실사가 틀렸다** — §3-① 정정 참조 |
| **KR EPS 컨센서스** | **미확인** | **55%** | ❌ 동일 원인 |
| US 5년 일별 종가 | 0% | 0%(단 이 실행은 키 없음) | ⏸ 프로덕션 재측정 대기 |

정정 2건은 `docs/audit/AUDIT_fundamental_data_coverage.md` 와 `docs/audit/DECISION_wo_sub_batch_gate.md` 상단에 달았다.
