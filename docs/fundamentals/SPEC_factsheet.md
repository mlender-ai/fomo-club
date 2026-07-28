# 팩트시트 스펙 — 스키마와 계산 규칙 (WO-SUB-01)

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-28 |
| WO | `WO-SUB-01` (배치 `WO-FC-SUBSTANCE-BATCH-01`) |
| 선행 | `WO-SUB-00` — 판정 `docs/audit/DECISION_wo_sub_batch_gate.md` |
| 성격 | 해석 없는 사실 스냅샷. 등급·판단·문장은 여기 없다 |

이 문서가 팩트시트의 정본이다. `WO-SUB-02`(아키타입) 이후 전 페이즈는 팩트시트를 **유일한 입력**으로 삼는다.

---

## 0. 경로 조정 (WO-SUB-01 §13 요구사항)

지시서는 `packages/fundamentals/` 신규 패키지를 제안했다. 저장소 실제 구조에 맞춰 **조정했다.**

| 지시서 제안 | 실제 배치 | 이유 |
|---|---|---|
| `packages/fundamentals/src/types.ts` | `packages/fomo-core/src/fundamentals/types.ts` | 이 레포는 **순수 계산 = `packages/fomo-core`, fetch = `apps/web/lib`** 로 이미 갈라져 있다(`assembleStockBasics` ↔ `stock-basics.ts` 선례). 새 워크스페이스는 빌드·타입체크 설정만 늘린다 |
| `src/compose/{ttm,bands,derive}.ts` | `packages/fomo-core/src/fundamentals/{ttm,bands,derive,assemble,missing,hash}.ts` | 동일 |
| `src/adapters/*.ts` | `apps/web/lib/fundamentals/{sec-xbrl,dart 미착수,naver-fundamentals,nasdaq-fundamentals}.ts` | fetch 는 `apps/web/lib` 관례 |
| `src/store/repository.ts` | `apps/web/lib/fundamentals/repository.ts` | 저장소는 기존 `FeedContentCache` 재사용 — **신규 DDL 0** |
| `src/jobs/*.ts` | `apps/web/lib/fundamentals/refresh.ts` + `app/api/fomo/cron/fundamentals/route.ts` | 이 레포의 배치는 Vercel 크론 라우트다(외부 egress 가 여기만 확보돼 있다) |
| 백필 스크립트 | `scripts/fundamentals-backfill.ts` | `scripts/*` 관례 |
| 커버리지 대시보드 | `app/api/fomo/fundamentals/coverage` + `docs/fundamentals/COVERAGE_dashboard.md` | API(데이터) + 생성 문서(1장) |

`refresh-fiscal` / `refresh-valuation` / `refresh-classification` 을 3개 잡으로 쪼개지 않고 **한 잡의 청크 루프**로 합쳤다. 세 잡이 모두 같은 종목의 같은 응답(네이버 `integration`·SEC `companyfacts`)을 읽으므로 분리하면 같은 요청을 3배 한다.

---

## 1. 저장 규약

저장소는 기존 `FeedContentCache`(JSONB 키-값). `us-candles`·`kr-candles`·`signal-stats` 와 같은 선례이며 prod DDL 승인이 필요 없다.

| 키 | 내용 |
|---|---|
| `factsheet:<market>:<canonical>` | 종목당 최신 레코드 `{ factsheet, factsheet_hash }` |
| `factsheet-snap:<market>:<canonical>:<hash>` | 내용 주소 스냅샷(불변). `WO-SUB-07` 의 `factsheet_snapshot_hash` 가 가리키는 대상 |
| `factsheet-index:<date>` | 그날 배치의 종목 → 해시 목록 |
| `factsheet-cursor` | 청크 진행 커서 |

**일별 전량 스냅샷을 쓰지 않는다.** 팩트시트는 실적 발표 때만 바뀌는데 종목 × 날짜로 행이 선형 증가하면 낭비다. 해시가 바뀔 때만 append 하므로 이력은 그대로 보존되고, 발행 시점 참조는 해시로 하므로 재현성은 동일하다.

`factsheet_hash` = 정규화 JSON(필드 정렬 + **시각 필드 제외**)의 sha256. `snapshot_at`·`fetched_at` 을 빼는 이유: 그대로 두면 내용이 같아도 매 실행 해시가 바뀌어 `WO-SUB-07` 의 스냅샷 참조가 무의미해진다.

---

## 2. 계산 규칙

### 2-1. TTM (§6-1)
- 최근 공시 4개 분기의 합. `composed_of` 에 사용 분기를 기록한다.
- 4개 미달 → 값 전부 `null`. **연환산 금지.** `composed_of` 에는 모인 분기만 남겨 원인을 감사할 수 있게 한다.
- 한 분기라도 그 항목이 결측이면 그 항목의 합은 `null`(3분기로 4분기 합을 흉내 내지 않는다).
- 같은 기간말이 여러 번 나오면(정정공시) **가장 늦게 공시된 것 하나만** 쓴다.
- 연속 분기 기간말 간격이 60~130일을 벗어나면 결산 구조 변경으로 보고 `fiscal_anomaly` 에 사유를 남기고 TTM 은 `null`, `coverage_flag: "partial"`.

### 2-2. look-ahead 방지 (§6-2)
- 모든 분기·연간 레코드는 `filed_at` 을 갖는다. 없으면 **레코드를 만들지 않는다.**
- 시점 `d` 의 TTM 은 `filed_at <= d` 인 분기만 쓴다.
- `filed_at_basis` 로 근거를 구분한다.
  - `disclosed` — 소스가 실제 공시일을 준 경우(SEC `filed`)
  - `statutory_deadline` — 소스에 공시일이 없어 **법정 제출기한**을 쓴 경우(네이버 재무 표).
    사업보고서 = 사업연도 종료 후 90일, 분·반기 = 45일. 기한은 실제 공시일보다 **늦거나 같으므로**
    look-ahead 를 만들지 않는다. 대가는 밴드의 유효 관측이 줄어드는 것이다 — 정직한 방향의 손실이다.

### 2-3. 5년 밴드 백분위 (§6-3)

```
window     = [max(T − 5년, 최초 종가일), T]
ttm(d)     = filed_at <= d 인 최근 4분기 합
per(d)     = close_adj(d) × shares_ref ÷ ni_ttm(d)     if ni_ttm(d) > 0 else null
psr(d)     = close_adj(d) × shares_ref ÷ rev_ttm(d)    if rev_ttm(d) > 0 else null
pbr(d)     = close_adj(d) × shares_ref ÷ equity(d)     if equity(d) > 0 else null
sufficient = |valid| >= 0.6 × 윈도우 거래일 수  AND  윈도우 길이 >= 3년
sufficient 아니면 → current_percentile = null (계산하지 않는다)
```

**주당 지표를 만드는 방식 — 여기가 이 스펙의 유일한 근사다.**
과거 시점의 as-reported 주당값(EPS/BPS)을 쓰면 액면분할 전후로 축이 어긋나 밴드가 통째로 왜곡된다.
그래서 조정 종가에 **기준주식수 하나**(`shares_ref`, 현재 보고 주식수)를 곱해 시가총액 시계열을 만들고
TTM 총액으로 나눈다. 이 근사가 깨지는 조건을 두 개의 가드로 막는다.

| 가드 | 동작 |
|---|---|
| 주식수 변동 | 윈도우 안에서 주식수가 20% 넘게 변하면 밴드를 만들지 않는다(`sufficient: false` + 사유) |
| 분할 미조정 종가 | 하루 사이 종가가 ½ 이하 또는 2배 이상 점프하면 조정 안 된 시계열로 보고 밴드를 만들지 않는다 |

두 번째 가드는 **소스가 조정본이라고 주장하는지에 의존하지 않는다.** 데이터 자체로 검증하므로 소스를 바꿔도 계속 작동한다.
`BandStat.basis`·`shares_ref`·`shares_ref_as_of` 를 레코드에 노출해 값이 재현·감사 가능하다.

- **적자 구간은 `null` 로 빠진다. 버그가 아니라 사실이다.** 적자 종목은 PER 밴드가 `sufficient: false` 가 되고
  값의 상태 층을 표시하지 않게 된다. 그것이 옳다. (매출이 양수면 PSR 밴드만 남는다 — 의도된 동작)
- 상장 5년 미만은 상장일부터의 윈도우를 쓰되 3년 하한과 60% 비율 기준은 동일하게 적용한다.

### 2-4. 현금 런웨이 (§6-4)
최근 4분기 영업현금흐름 합이 **음수인 경우에만** 계산한다. `현금성자산 ÷ 직전 4분기 평균 분기 소진액`.
양수면 `null` — **"무한"이라고 쓰지 않는다.**

### 2-5. 마진 (§6-5)
- `operating_stdev_8q` = 최근 8분기 영업이익률의 표본표준편차(n−1). 8분기 미만이면 `null`.
- `operating_stdev_annual` = 최근 연간 영업이익률의 표본표준편차(n−1) + `operating_stdev_annual_years`(관측 연수).
- `trend_8q` = 최근 4분기 평균 마진 − 이전 4분기 평균 마진. ±1.5%p 를 넘으면 expanding/contracting, 아니면 flat.
  8분기 미만이면 `unknown`.

> **개정 2026-07-28 (WO-SUB-02 실측 반영).**
> 원래 스펙은 시클리컬 판정 입력을 `operating_stdev_8q` 로 지정했다. **실측 결과 그 필드는 그 용도로 쓸 수 없다.**
>
> | 문제 | 실측 근거 |
> |---|---|
> | 분기 통계는 **계절성이 경기순환성을 덮어쓴다** | 라벨 40종목 중 INTU(소프트웨어) 18.7%p > CLF(철강) 3.75%p |
> | KR 은 이 필드가 **구조적으로 항상 `null`** | 네이버 재무 표 분기 5개 상한 → WO-SUB-01 실측 0/40 |
>
> 그래서 `operating_stdev_annual` 을 추가하고, **`WO-SUB-02` 의 시클리컬 판정 입력을 이 필드로 확정했다**
> (`docs/archetype/DOCTRINE_archetype_frames.md` §5). `operating_stdev_8q` 는 계속 계산·저장하지만
> 분류 입력으로 쓰지 않는다 — 분기 마진의 변동 자체는 `CYCLICAL_COMMODITY` 의 표시 지표로 의미가 있다.
>
> 두 필드의 결측 규칙이 다르다: `operating_stdev_8q` 는 **8분기 미만이면 null**, `operating_stdev_annual` 은
> **연간 관측 2개 미만이면 null**(표본표준편차의 최소 요건). KR 은 연간 3개가 확보되므로 후자는 채워진다.

### 2-6. 밸류에이션 현재값
**한 기준으로 통일한다** — `시가총액 ÷ TTM 총액`. 소스마다 다른 EPS 정의(연환산·조정 EPS 등)를 섞으면
같은 지표가 종목마다 다른 뜻이 된다. 계산이 불가능할 때만 소스가 직접 준 값(`reported`)으로 폴백하고,
그때는 `field_sources` 에 그 소스와 기준일이 그대로 들어간다.

`ev_ebitda` 는 감가상각비(TTM)가 있어야 계산한다. 없으면 `null` — 영업이익만으로 EBITDA 를 흉내 내지 않는다.

### 2-7. 통화 (§4 규칙 3)
원통화(KRW/USD)로 저장한다. **어디에서도 환율을 곱하지 않는다.** 테스트로 감시한다.

### 2-8. 비지배지분
`net_income` 은 **지배주주순이익**을 우선한다(주당지표의 표준 분자). 소스에 분리 값이 없으면 당기순이익을 쓰고,
어느 계정을 썼는지 `QuarterRecord.concepts.net_income` 에 남긴다.

---

## 3. 소스별 계약과 함정

### 3-1. US — SEC XBRL companyfacts (재무·공시일)
| 항목 | 내용 |
|---|---|
| 연락처 UA | 필수. 없으면 403 |
| CIK 매핑 | `www.sec.gov/files/company_tickers.json` — 간헐 403 → 3회 백오프. 실패는 "없음"이 아니라 **미확인**으로 남긴다 |
| 주식수 | `dei.EntityCommonStockSharesOutstanding`. **없는 회사가 있다**(실측: SHOP·CRWV 는 `dei` 에 `EntityPublicFloat` 만) → `WeightedAverageNumberOfDilutedSharesOutstanding` 폴백 |
| 개념 선택 | 후보 중 **관측이 가장 많은 것**을 고른다. 리스트 순서대로 첫 발견을 쓰면 실데이터를 놓친다 — 실측: CLBK 는 `RevenueFromContractWithCustomerExcludingAssessedTax` 가 2건뿐인데 먼저 잡혀 매출이 전 분기 `null` 이 됐고, 152건이 있는 `InterestAndDividendIncomeOperating`(은행 이자수익)이 무시됐다. SHOP 도 같은 이유로 `Revenues`(18건) 대신 12건짜리가 잡혔다 |
| **Q4** | **분기형 사실로 태깅되지 않는다**(10-K 가 연간을 보고). 실측: CLBK 분기형 37개에 12-31 종료 구간이 0개. → `Q4 = 연간 − 1~3분기` 로 구성하고 `source: "sec_xbrl:q4_from_fy_minus_9m"` 로 표시한다. 세 분기가 다 모이지 않으면 만들지 않는다. **EPS 는 구성하지 않는다**(분기별 희석주식수가 달라 차감이 정확하지 않다) → US `ttm.eps_diluted` 는 정상적으로 `null` |
| `filed_at` | 그 기간을 **처음 공시한 날**(최신 정정일이 아니라). 값도 그 최초 공시값을 쓴다 — "그때 알 수 있었던 정보"가 §6-2 의 목적이다 |
| 은행 | `OperatingIncomeLoss` 가 없다(정상). `margin.operating_*` 는 `null` |

### 3-2. US — Nasdaq (시장데이터·컨센서스·분류)
| 항목 | 내용 |
|---|---|
| UA | **브라우저 UA 필수** |
| `summary` | `PERatio`·`BookValue` 키가 **없다.** 간헐적으로 `summaryData: {}` 를 준다 → 3회 재시도, 그래도 비면 결측 |
| 가격 | `info.primaryData.lastSalePrice` 가 `summary` 보다 안정적이다 |
| 타임스탬프 | `"Jul 22, 2026 8:01 AM ET"` — `Date.parse` 로는 NaN 이다. 날짜 부분만 파싱한다 |
| 컨센서스 | `analyst/earnings-forecast` 는 **EPS 예상만.** 매출 예상 필드가 없다 → `revenue_fy*` 는 결측 |
| `consensusEPSForecast` | 문자열로도 숫자로도 온다. 문자열로 강제한다 |
| `historical` | 5년을 요청해도 소수 행만 주거나 타임아웃한다 → 일별 종가 소스로 쓰지 않는다 |

### 3-3. US — 일별 종가
이미 프로덕션이 쓰는 **TwelveData `time_series`**(`TWELVE_DATA_API_KEY`, `fetchUsDailyCandles`)로 5년치를 시도하고,
픽 크론이 봉인한 `us-candles`(260거래일)와 날짜 합집합으로 합친다. 새 유료 소스를 붙이는 것이 아니라 기존 소스 재사용이다.
조정 여부는 소스 주장에 의존하지 않고 §2-3 의 점프 탐지로 검증한다.
키가 없는 환경에서는 봉인 캔들만 남아 3년 하한에 걸려 밴드가 만들어지지 않는다(정직한 기본값).

Stooq 등 CSV 경로는 봇 검증(JS proof-of-work)이 걸려 있어 쓰지 않는다.

### 3-4. KR — 네이버 종목 API
| 항목 | 내용 |
|---|---|
| 시총·PER·PBR·EPS·BPS·배당 | `/basic` 이 아니라 **`/integration` 의 `totalInfos[]`**. 각 항목이 `valueDesc`(기준 분기)를 준다 → `as_of` 확보 |
| `isConsensus` | **문자열 `"Y"`/`"N"`** 이다. `WO-SUB-00` 실사는 이걸 boolean 으로 읽어 "전 컬럼 true" 라 기록했으나, 문자열 `"N"` 이 truthy 였을 뿐이다. 실제로는 **마지막 한 컬럼만 `"Y"`** 이고 그것이 예상치다 |
| 컨센서스 | 연간 표의 `"Y"` 컬럼이 **매출·EPS FY1 예상**이다. `integration.cnsPer`·`cnsEps` 도 추정 PER·EPS 를 준다 |
| `priceTargetMean` | 목표주가 — **우리 원칙상 금지 값**이라 읽지 않는다 |
| 단위 | 매출·이익 = **억원**, EPS/BPS/주당배당금 = 원, 비율 = % |
| 기간 상한 | 분기 **5개**(+예상 1) / 연간 **3개**(+예상 1). 페이지네이션 없음(실측: `?page=2`·`/2`·`size=20` 모두 동일 응답) |
| 공시일 | **없다** → `filed_at_basis: "statutory_deadline"` |
| 일별 차트 | `api.stock.naver.com/chart/domestic/item/{code}/day` 는 **액면분할 조정 종가**다. 실측 검증: 카카오(035720) 2021-04-14 종가 112,000 — 분할 전 명목가 560,000 이 아니다 |
| 업종 | `industryCode`(숫자 코드)만 온다. **코드→이름은 고정 표로 해석한다**(`packages/fomo-core/src/fundamentals/kr-industry.ts`, 79개 그룹 실측). 네이버 업종 체계는 GICS 계열이라 은행/제약/생물공학/철강/해운이 분리되어 아키타입 분류에 그대로 쓸 수 있다. 잔여 버킷 `25 기타`(1,500여 종목)는 **표에 넣지 않는다** → `sector: null` → `UNCLASSIFIED`(안전) |

### 3-5. KR — DART (미착수)
`DART_API_KEY` 는 Vercel 런타임에는 있으나 **GitHub Actions Secrets 에는 없고**(`gh secret list` 확인) 로컬에도 없다.
응답 구조를 한 번도 덤프하지 못했으므로 파서를 쓰지 않았다 — `WO-SUB-00` 이 남긴 규칙(*확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만들 것*)을 지킨 것이다.
`scripts/audit/discover_dart_keys.ts` 가 구조 덤프만 하고 판정하지 않는다. 시크릿이 등록되면 워크플로가 자동으로 찍는다.

**DART 가 열리면 무엇이 풀리는가** — 이것이 KR 의 유일한 잠금이다.

| 지금 막힌 것 | 원인 | DART 로 해소되는 방식 |
|---|---|---|
| KR 8분기(현재 5분기) | 네이버 표 상한 | 분기·반기·사업보고서를 연도별로 조회 |
| KR 5회계연도(현재 3년) | 동일 | 동일 |
| KR `revenue_cagr_3y` | 연간 관측 4개 필요 | 위와 함께 해소 |
| KR `operating_stdev_8q`·`trend_8q` | 8분기 필요 | 위와 함께 해소 → `WO-SUB-02` 시클리컬 판정 활성 |
| KR 밴드 백분위 | 실제 공시일이 없어 유효 관측이 윈도우의 10~25% 뿐 | `rcept_no` 앞 8자리 = 실제 접수일 → `filed_at_basis: "disclosed"` |
| KR 현금·차입금·이자비용 | 네이버 표에 없음 | 전체 재무제표(`fnlttSinglAcntAll`) |

---

## 4. 필드별 출처 계약

값이 있는 모든 스칼라는 `field_sources["<필드 경로>"] = { source, as_of }` 를 갖는다(§4 규칙 2).
스키마의 모든 필드를 `SourcedValue<T>` 로 감싸는 대신 경로 맵을 쓴 이유: 소비자(`WO-SUB-04`·`05`)가
숫자를 그대로 쓰면서도 출처 누락을 테스트로 잡을 수 있다. `fieldsMissingSource()` 가 그 검사다.

`missing_fields` 는 손으로 나열하지 않는다 — 완성된 팩트시트를 걸어서 만든다(`collectMissingFields`).
필드를 추가하고 목록 갱신을 잊는 실패가 구조적으로 불가능하다.

`null` 이 "없음"이 아닌 상태값은 결측으로 세지 않는다: `fiscal.fiscal_anomaly`(null = 이상 없음),
`valuation.band_5y.metric`(null = `WO-SUB-02` 가 아직 정하지 않음), `*.insufficient_reason`(null = 충분).

---

## 5. 배치와 요청 경로 분리

- 갱신: `GET /api/fomo/cron/fundamentals?limit=12` — 커서 기반 청크. `done: true` 까지 반복 호출한다.
- 조회: `GET /api/fomo/fundamentals/coverage` — **저장소만 읽는다.** 여기서 소스를 조회하지 않는다.
- 가드: `apps/web/__tests__/lib/fundamentals-request-path-guard.test.ts` 가 카드·덱·뎁스 렌더 경로에서
  팩트시트 계산 함수(`assembleFactSheet`·`computeBands`·`buildFactSheet` …)를 부르는지 감시한다.
  허용 위치는 팩트시트 모듈 자신 · 배치 크론 · 대시보드 API · 테스트뿐이다.

---

## 6. 이 스펙이 남긴 미해결

| 항목 | 상태 | 해소 조건 |
|---|---|---|
| DART 재무·실공시일 | **미착수** | `DART_API_KEY` 를 GitHub Actions Secrets 에 등록 → 구조 덤프 후 파서 작성 |
| ~~KR 섹터 이름~~ | **해소(2026-07-28)** | `m.stock.naver.com/api/stocks/industry?pageSize=100` 79개 그룹을 고정 표로 박제 |
| US 매출 컨센서스 | 무료 경로 부재(실측) | `WO-SUB-04` 범위 결정 후 유료 소스 검토 |
| US 5년 종가 | TwelveData 로 시도하나 프로덕션 실측 미완 | 크론 1회 실행 후 커버리지 대시보드 재생성 |
| `ev_ebitda` (KR) | 감가상각비 소스 없음 | DART 전체 재무제표 |
