# KR 재백필 · 현금흐름 확보 상태 (02R 착수 조건 답변)

측정일: 2026-08-01 · 소스: 프로덕션 `GET /api/fomo/fundamentals/coverage` (generatedAt `2026-08-01T01:41:05Z`)

> **결론은 §4 다** (2026-08-02 갱신): KR 현금흐름 확보율 **88.4%** — 기준 60% 를 넘어
> **A(스키마·파서 추가) 유지 확정**. §2 의 "확보되지 않았다"와 §3 의 미확정 서술은
> 그 판정에 이르기까지의 기록이다.

---

## 1. KR 재백필 — **완료됐다**

유니버스 326 · 레코드 308 · KR 226종목 기준.

| 필드 | KR | US | 비고 |
|---|---|---|---|
| `fiscal.quarters` | **212/226 (93.8%)** | 75/82 (91.5%) | DART 분기 확보 |
| `fiscal.annual` | 212/226 (93.8%) | 78/82 (95.1%) | |
| `fiscal.ttm.revenue` | 182/226 (80.5%) | 70/82 (85.4%) | |
| `growth.revenue_yoy` | 186/226 (82.3%) | 71/82 (86.6%) | |
| **`growth.revenue_cagr_3y`** | **176/226 (77.9%)** | 71/82 (86.6%) | **이전 KR 0/40 → 해소** |
| `margin.operating_ttm` | 182/226 (80.5%) | 67/82 (81.7%) | |
| `margin.operating_stdev_8q` | **167/226 (73.9%)** | 65/82 (79.3%) | **네이버 5분기 상한 시절 KR 항상 null → 해소** |
| `valuation.pbr` | 211/226 (93.4%) | 74/82 (90.2%) | |
| `valuation.per_ttm` | 145/226 (64.2%) | 53/82 (64.6%) | 적자 종목 제외라 정상 |
| `consensus.revenue_fy1` | 112/226 (49.6%) | **0/82** | KR 이 US 보다 높다(네이버 `isConsensus` 문자열 함정 해소분) |

### 02R 에 미치는 영향 — 차단 두 개가 풀렸다

`WO-SUB-02` 골든셋에서 미분류 24건의 거의 전부가 `no_rule_matched` 였고, 그 원인이
**`growth.revenue_cagr_3y` KR 0/40** 이었다. 이제 77.9% 다.

| 규칙 | 이전 | 지금 |
|---|---|---|
| `QUALITY_COMPOUNDER` | KR 에서 **발동 불가**(cagr_3y 없음) | 발동 가능 |
| `MATURE_INCOME` | KR 에서 **발동 불가** | 발동 가능(단 §2 참조) |
| `stdev_confirmed` | KR 연간 3개라 대부분 `false` | 분기 8개 확보 → 판정 가능 |

**결론: 02R 착수 조건(KR 팩트시트)은 충족됐다.**

---

## 2. 현금흐름표 — **확보되지 않았다**

### 실측

| 확인 지점 | 결과 |
|---|---|
| 팩트시트 스키마(`packages/fomo-core/src/fundamentals/types.ts`)에 현금흐름 필드 | **0건** (`operating_cash`·`capex`·`financing`·`dividend_paid`·`cash_end` 전부 없음) |
| `dart-fundamentals.ts` 의 CF 계정 추출 코드 | **없음** — 현금흐름 언급은 **주석뿐** |
| 커버리지 대시보드의 CF 필드 | **없음** |

### 소스에는 있는데 스키마에 없다

이전 세션이 확인한 것은 **DART 응답에 CF 데이터가 존재한다**는 사실이다
(`fnlttSinglAcntAll` 의 `sj_div=CF` 32~33행). 그것은 **파이프라인이 그 값을 팩트시트에 담았다는 뜻이 아니다.**
현재 `fnlttSinglAcntAll` 은 EPS·매출원가·판관비 때문에 열고 있고, CF 행은 읽지 않는다.

> 덤프가 60계정에서 잘려 "미확인"으로 남아 있다는 지적이 맞다.
> 정확히는 **소스 가용성은 확인됨 / 파이프라인 반영은 미착수**다.

추가 제약 하나: `fnlttSinglAcntAll` 은 당해 사업보고서가 `013`(미제공)일 수 있고
(실측: 2025 FY 는 CFS·OFS 모두 013, 2024 FY·2025 Q3 는 정상), 그 보고서에서는
현금흐름·EPS 가 구조적으로 `null` 이다. **CF 확보율은 `detailedReports.opened / attempted` 에 상한이 걸린다.**

### 02R 자격 판정에 미치는 영향 (규칙 3: 데이터 확보 가능성이 자격 조건)

| 유형 | 필요한 CF 지표 | KR 성립 여부 |
|---|---|---|
| `HYPERGROWTH_UNPROFITABLE` | 현금 소진 속도(영업활동현금흐름) | **불가** |
| `BIOTECH_PIPELINE` | 현금 소진 속도 | **불가** |
| `MATURE_INCOME` | 배당 지속 가능성(배당금지급 vs 영업CF) | **부분** — `valuation.dividend_yield` 49.6% 로 배당 **여부**는 보이나 **유지 가능성**은 CF 없이 판정 불가 |

세 유형의 경고문이 관측 지점으로 지목하는 것이 정확히 이 지표들이다
(`BIOTECH_PIPELINE`: "관측 가능한 사실은 현금 소진 속도와 임상 일정",
`MATURE_INCOME`: "성장률보다 배당이 유지될 수 있는지가 관측 지점").
**경고문이 가리키는 지표를 KR 에서 못 주는 상태**다.

### 선택지 (02R 판정 입력)

| 선택 | 내용 | 비용 |
|---|---|---|
| A | CF 계정을 팩트시트 스키마·파서에 추가 | `account_id` 기반이라 계정명 매칭 불필요. `013` 보고서는 null(이전 분기로 메우지 않는다) |
| B | 세 유형을 KR 에서 **자격 미달**로 처리 | 규칙 3 을 그대로 적용. KR 분류 커버리지가 줄어든다 |
| C | 대체 지표로 완화 | `MATURE_INCOME` 만 부분 가능(배당수익률+이익 추이). 나머지 둘은 대체 불가 |

**A 를 하지 않으면 B 가 정답이다** — 데이터 없이 유형을 남겨두면 경고문이 가리키는 관측 지점이 빈다.

---

## 3. 결정: **A** — 스키마·파서에 CF 추가 (2026-08-01)

> 지시: "현금흐름 = A. 스키마·파서에 CF 추가. account_id 기반, 013은 null + missing_fields 등재.
> 단 실제 확보율을 먼저 실측하고, **60% 미만이면 B/C 재논의**."

### 구현된 것

| 지점 | 내용 |
|---|---|
| `dart-accounts.json` | `dividend_paid` 추가(`ifrs-full_DividendsPaidClassifiedAsFinancingActivities` — 덤프 §3 실측 등재분). `mapping_version` v1.0.0 → **v1.1.0** |
| `dart-fundamentals.ts` | `capex`·`dividend_paid` 를 분기별로 추출. **`report.detailed` 가 false(013)면 `null`** — 이전 분기로 메우지 않는다 |
| `types.ts` | `FactSheetCashflow` 절 신설 → `FactSheet.cashflow` |
| `derive.ts` | `deriveCashflow()` — TTM 4분기 미달이면 전부 `null`(부분 합을 1년치로 읽지 않는다) |
| `missing.ts` | `cashflow.*` 는 일반 walk 로 자동 등재. 단 `burn_per_quarter`·`dividend_coverage` 는 **상태 null**(흑자·무배당)이라 결손에서 제외 — 세면 확보율이 실제보다 낮게 보인다 |
| `sec-xbrl.ts` | US 도 `capex`·`dividendPaid` 후보 개념 추가. **다만 KR 의 `account_id` 와 신뢰도가 다르다**(덤프 실측이 아니라 us-gaap 표준 개념 후보) — 적중률은 커버리지가 답한다 |
| `coverage.ts` | 그룹별 `cashflow` 블록 — 확보/부분/전무를 나눠 센다 |

### 부호 관행 — 절대값으로 크기만 쓴다

DART·SEC 모두 유출을 음수로 주는 종목과 양수로 주는 종목이 섞인다. CapEx·배당은
**절대값**으로 읽는다(이 둘이 순유입인 경우는 없다). 영업현금흐름은 부호가 판정 의미를
가지므로(적자 소진) 원부호를 유지한다. `fundamentals-cashflow.test.ts` 가 두 부호 관행이
같은 결과를 내는 것을 고정한다.

### DART 쿼터를 다시 태우지 않는다

`REPORT_CACHE_VERSION` 은 **올리지 않았다.** 캐시가 DART 응답 `rows` 를 통째로 들고 있어
CapEx·배당은 **캐시된 원본에서 재추출**된다. 조회 로직이 바뀐 것이 아니라 읽는 계정이
늘어난 것뿐이라, 버전을 올리면 6년치 재조회가 무의미하게 발생한다.

---

## 4. 확보율 실측 — **A 유지 확정** (2026-08-02)

측정: `fundamentals-backfill.yml` run `30740836692` 완주(`done=true`, 유니버스 329) 직후
저장된 팩트시트를 직접 집계. `fs_div` 버그 수정(#1020) 이후 첫 전량 백필이다.

| 시장 | 영업CF TTM | 부분확보 | 전무 | 관측분기 중앙값 | CapEx | FCF | 배당 관측 | 소진 중 |
|---|---|---|---|---|---|---|---|---|
| **KR** | **213/241 (88.4%)** | 5 | 23 | 21 | 201 | 200 | 130 | 76 |
| US | 77/88 (87.5%) | 4 | 7 | 10.5 | 77 | 77 | 30 | 19 |

**판정: KR 88.4% ≥ 기준 60% → A(스키마·파서 추가) 유지. B/C 재논의는 하지 않는다.**

`fs_div` 버그 수정 전 0/238(0.0%)에서 213/241 로 열렸다. KR 이 US 를 앞서고(88.4% vs 87.5%),
관측 분기 중앙값은 KR 21분기로 US 10.5분기의 두 배다 — DART 6년치가 SEC 보다 깊다.

### 결손 28건은 대부분 "기업이 아니다"

| 성격 | 수 | 종목 | CF 가 있어야 하는가 |
|---|---|---|---|
| 암호화폐 | 9 | 비트코인·이더리움·리플·솔라나·에이다·도지코인·트론·체인링크·캔톤 | **아니오** — 발행 주체가 없다 |
| ETF·액티브펀드 | 3 | TIME 글로벌AI·TIME 차이나AI·WON 반도체밸류체인 | **아니오** |
| 우선주 | 2 | 삼성전자우·삼성전기우 | **아니오** — 본주에 있다(`corp_code` 없음이 정상) |
| 네이버 종목코드 형식 오류 | 3 | 그린광학·메쥬 등(`0015G0` 형식) | 예 — 조회 경로 문제 |
| DART 분기 결손·감가상각비 미확보 | 11 | 한미약품·나노신소재 등 | 예 — 부분 결손 |

비기업 14종목을 분모에서 빼면 **213/227 (93.8%)** 이다. 다만 **판정에는 전체 모수
88.4% 를 쓴다** — 분모를 유리하게 고르지 않는다. 어느 쪽으로 세도 60% 기준은 넘는다.

### 02R PART B-3 에 주는 답

세 유형의 자격이 **데이터로 확보됐다**(규칙 3: 데이터 확보 가능성이 자격 조건).

| 유형 | 필요 지표 | 이전 판정 | 지금 |
|---|---|---|---|
| `HYPERGROWTH_UNPROFITABLE` | 현금 소진 속도 | 불가 | **가능** — KR 76종목에서 소진 관측 |
| `BIOTECH_PIPELINE` | 현금 소진 속도 | 불가 | **가능** — 같은 근거 |
| `MATURE_INCOME` | 배당 지속 가능성(배당금 vs 영업CF) | 부분 | **가능** — KR 130종목에서 배당 지급 관측 |

### 측정 경로 주의 — 커버리지 엔드포인트를 쓰지 못했다

백필 워크플로의 커버리지 요약이 `GITHUB_STEP_SUMMARY` 로만 나가는데 그건 **API 로 읽을 수
없다.** 백필은 성공했는데 확보율을 사후에 확인할 길이 없어 저장소를 직접 집계했다.
같은 일이 반복되지 않게 요약을 stdout 에도 찍게 고쳤다(`fundamentals-backfill.yml`).

<details>
<summary>재현 쿼리 (팩트시트 저장소 직접 집계 — 15분 캐시 §5-7 우회)</summary>

```sql
select f->>'market' as market, count(*) as n,
  count(*) filter (where f->'cashflow'->>'operating_ttm' is not null) as op_ttm,
  count(*) filter (where f->'cashflow'->>'operating_ttm' is null
                     and (f->'cashflow'->>'observed_quarters')::int > 0) as partial,
  count(*) filter (where f->'cashflow'->>'dividend_paid_ttm' is not null) as dividend_observed,
  count(*) filter (where f->'cashflow'->>'burn_per_quarter' is not null) as burning
from (select "row"->'factsheet' as f from "FeedContentCache" where id like 'factsheet:%') t
group by 1;
```

`coverage.ts` 의 집계 정의와 같은 조건이다(`operating_ttm` null + `observed_quarters` > 0 = 부분확보).
</details>

---

## 부록 — 실측 전 예측 (2026-08-01 시점 기록)

### 남은 것 — 확보율 실측

측정 경로: 백엔드 배포 → `fundamentals-backfill.yml` dispatch(`reset: true`) →
`GET /api/fomo/fundamentals/coverage` 의 `groups[].cashflow`.

판정 기준(지시): **KR `cashflow.operating_ttm` 확보율 60% 이상이면 A 유지, 미만이면 B/C 재논의.**

상한이 걸려 있는 지점을 미리 적어 둔다 — `detailedReports.opened / attempted` 다.
전체 재무제표가 `013` 인 보고서에서는 CF 가 구조적으로 없고, TTM 은 4분기가 다 있어야
구성되므로 **한 분기만 013 이어도 그 종목의 `operating_ttm` 은 null** 이 된다.
그래서 확보율은 "부분 확보"와 함께 읽어야 한다(커버리지가 둘을 나눠 낸다).
