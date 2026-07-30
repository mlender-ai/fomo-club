# DART 응답 구조 덤프 (WO-SUB-03.5 PART E-1 근거)

> WO-SUB-00 규칙: **확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만든다.** 이 문서는 그 근거다.
> 여기서는 판정하지 않는다 — 확보율·파서는 이 표를 근거로 그 다음에 만든다.
>
> 재현: 이 문서의 요청 목록을 직접 호출한다. **덤프 라우트는 역할을 마쳐서 제거했다** —
> 인증 없이 호출되는 경로를 남겨 두면 외부에서 반복 호출해 DART 쿼터를 태울 수 있다.
> 재사용되는 것은 `corp_code` 매핑(`apps/web/lib/fundamentals/dart-discovery.ts`) 하나다.
> 표본: 종근당(`185750`, DART `corp_code=00992871`), 사업연도 2025

## 0. 먼저 정정 — DART 는 막혀 있지 않았다

WO-SUB-01·02·03 에서 나는 "DART 키가 없다"고 기록했고, 그 근거로 KR 을 벤더 요약(네이버
`corporationSummary`)으로 돌렸다. **그 기록이 틀렸다.** 키는 Vercel 환경변수에 등록돼 있었다.

내가 한 혼동은 이것이다 — **로컬·GH Actions 에서 키를 읽을 수 없다**를 **DART 를 쓸 수 없다**로
옮겼다. 크론 라우트는 그 키를 가진 실행 환경이므로, 거기서 돌리면 된다. 실측 결과 `keyPresent: true`.

이 착오의 교훈은 일반적이다: **크레덴셜의 부재와 실행 환경의 부재는 다르다.** 키를 못 읽는 위치에서
"불가"를 선언하기 전에, 키를 가진 위치에서 실행할 수 있는지 먼저 본다.

## 1. corp_code 매핑

`fnlttSinglAcnt*` 는 8자리 `corp_code` 를 요구한다. 두 경로를 실측했다.

| 경로 | 결과 |
|---|---|
| `list.json` 행에서 `stock_code`→`corp_code` 수집 | ❌ `status 100` — "corp_code가 없는 경우 검색기간은 3개월만 가능합니다." 3개월 창 페이지네이션은 매핑 1건에 수십 콜 |
| `corpCode.xml`(ZIP 단일 엔트리) | ✅ 아래 |

```
totalEntries   118,562   (전체 법인)
listedEntries    3,925   (종목코드 있는 상장사 — 우리가 쓰는 축)
timing        fetchMs 238,258 · unzipMs 268 · parseMs 96
```

**전송이 4분이다.** 해동·파싱은 합쳐 0.4초다. 즉 느린 축은 전송 하나이고, 그래서 캐시가
설계상 필수다(`FeedContentCache`, 7일 TTL, 신규 DDL 0). 런타임에 unzip 바이너리는 없지만
`zlib.inflateRaw` 는 있어서 ZIP 로컬 헤더만 읽고 본문을 편다.

> 함정: 키가 틀리면 DART 는 ZIP 대신 XML 을 준다. 이걸 조용히 "빈 매핑"으로 삼으면 원인이 사라지므로,
> ZIP 시그니처가 아니면 사유 + 응답 본문 앞부분을 남긴다(테스트로 잠금).

## 2. `list.json` — filed_at 의 근거

`corp_code` 를 붙이면 기간 제한이 풀린다. `status 000`, 2년 창에서 정기보고서 9건.

| 필드 | 예시 | 쓰임 |
|---|---|---|
| `rcept_no` | `20251114001538` | 접수번호 — 보고서 식별 |
| `rcept_dt` | `20251114` | **접수일 = `filed_at`(`basis: "disclosed"`)** |
| `report_nm` | `분기보고서 (2025.09)` | 분기 라벨의 근거 |
| `corp_cls` | `Y` | 시장 구분(유가) |
| `stock_code` | `185750` | 종목코드 |

**look-ahead 방지에 필요한 것이 여기 다 있다.** 네이버 경로에는 접수일이 없어서 WO-SUB-01 은
KR 을 `filed_at_basis: "statutory_deadline"`(법정기한 추정)으로 둘 수밖에 없었다. DART 는
`disclosed` 로 올릴 수 있다 — 추정이 실측으로 바뀐다.

## 3. `fnlttSinglAcnt` — 주요계정, 4개 보고서 전부 `status 000`

| 보고서 | `reprt_code` | 결과 | 행수 |
|---|---|---|---|
| 1분기 | 11013 | 000 정상 | 30 |
| 반기 | 11012 | 000 정상 | 30 |
| 3분기 | 11014 | 000 정상 | 30 |
| 사업보고서 | 11011 | 000 정상 | 30 |

행 필드:

```
rcept_no, reprt_code, bsns_year, corp_code, stock_code,
fs_div(CFS/OFS), fs_nm, sj_div(BS/IS), sj_nm, account_nm,
thstrm_nm, thstrm_dt, thstrm_amount,     ← 당기
frmtrm_nm, frmtrm_dt, frmtrm_amount,     ← 전기
ord, currency
```

사업보고서(11011)에만 `bfefrmtrm_nm / bfefrmtrm_dt / bfefrmtrm_amount`(전전기)가 추가로 온다.

확보되는 계정(`account_nm`):

```
BS: 유동자산 · 비유동자산 · 자산총계 · 유동부채 · 비유동부채 · 부채총계 · 자본금 · 이익잉여금 · 자본총계
IS: 매출액 · 영업이익 · 법인세차감전 순이익 · 당기순이익 …
```

금액은 **쉼표 포함 문자열**(`"988,099,227,129"`), 통화는 `currency: "KRW"`.
기준일은 `thstrm_dt: "2025.03.31 현재"` 형태 — 파서는 이 형식을 전제해야 한다.

### 8분기가 되는가

한 보고서가 당기 + 전기를 함께 주므로, **연도 × 보고서로 요청하면 분기가 겹쳐 채워진다.**
네이버(5분기 상한, 페이지네이션 없음)와 달리 연도를 올려 부르면 되므로 8분기 상한이 없다.
정확한 조합·중복 제거 규칙은 파서 설계 단계에서 정한다 — 여기서는 구조만 확인한다.

또한 `매출액`·`영업이익`이 분기 단위로 열리므로 **영업이익률 표준편차(θ_cyclical)를 KR 에서도
실측할 수 있다.** WO-SUB-02R 이 `stdev_confirmed: false` 로 남겨 둔 KR 업종코드 단독 판정의
예외를 해소할 길이 생겼다(재검토 대상 등재분).

## 4. `fnlttSinglAcntAll` — 전체 재무제표

첫 시도 `bsns_year=2025 & reprt_code=11011 & fs_div=CFS` 가 `status 013`("조회된 데이타가
없습니다", 65바이트)여서, **"없다"가 어느 축인지** 가르는 프로브를 돌렸다. 축을 특정하지 않고
파라미터를 바꿔 보는 것은 추측이다.

| 요청 | 결과 | 행수 |
|---|---|---|
| 2025 FY · CFS | `013` 데이터 없음 | — |
| 2025 FY · **OFS** | `013` 데이터 없음 | — |
| **2024** FY · CFS | `000` 정상 | 228 |
| 2025 **Q3** · CFS | `000` 정상 | 206 |

**`fs_div` 축이 아니다.** 연도·보고서 조합 하나(당해 사업보고서)만 비어 있다.
그런데 §3 에서 같은 조합의 **주요계정은 정상**이었다(`rcept_no: 20260318001376`, 2026-03-18 접수).
즉 보고서는 존재하는데 전체 재무제표(XBRL 상세)만 아직 올라오지 않았다.

> **설계 함의**: 전체 재무제표는 있다고 가정할 수 없다. 파서는 `fnlttSinglAcntAll` 이 013 이면
> `fnlttSinglAcnt`(주요계정)로 내려가고, 상세에서만 나오는 지표(EPS 등)는 그 분기에서
> `null` 로 남긴다. 없는 값을 이전 분기로 메우면 가짜 숫자다.

행 필드 — 주요계정과 다르다:

```
rcept_no, reprt_code, bsns_year, corp_code,
sj_div, sj_nm, account_id, account_nm, account_detail,
thstrm_nm, thstrm_amount, frmtrm_nm, frmtrm_amount, ord, currency
```

사업보고서에는 `bfefrmtrm_nm / bfefrmtrm_amount`(전전기)가 추가된다. 분기 보고서에는 없다.

**`account_id` 가 있다.** 이것이 이 응답의 가장 큰 소득이다 — IFRS 표준 계정 ID 로 매핑할 수 있으므로
한글 계정명 문자열 매칭에 의존하지 않는다. 네이버 경로에서 우리를 물었던 문자열 함정
(`isConsensus` 가 `"Y"`/`"N"` 문자열이었던 것 등)을 구조적으로 피할 수 있다.

여기서만 열리는 계정:

```
기본및희석주당이익(원)   ← EPS
매출총이익 · 매출원가 · 판매비와관리비 · 영업이익(손실)
금융수익 · 금융비용 · 기타영업외수익 · 기타영업외비용
사용권자산 · 리스부채 · 순확정급여부채 …
```

### 현금흐름표 — 확보 확정

`sj_div` 를 60계정 컷과 무관하게 전수 집계해 확정했다.

```
2024 FY CFS   BS=57 · CF=32 · CIS=11 · IS=17 · SCE=111
2025 Q3 CFS   BS=57 · CF=33 · CIS=10 · IS=16 · SCE=90
```

`CF` 계정에 다음이 있다 — **02R 의 세 유형이 KR 에서 성립한다.**

| 필요 지표 | 계정 | 쓰이는 유형 |
|---|---|---|
| 영업현금흐름 | `ifrs-full_CashFlowsFromUsedInOperatingActivities` | `HYPERGROWTH_UNPROFITABLE` · `BIOTECH_PIPELINE` |
| 기말 현금 | `dart_CashAndCashEquivalentsAtEndOfPeriodCf` | 현금 런웨이 |
| CapEx | `ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities` | `MATURE_INCOME`(FCF) |
| 배당 지급 | `ifrs-full_DividendsPaidClassifiedAsFinancingActivities` | FCF 커버리지 |
| 이자 지급 | `ifrs-full_InterestPaidClassifiedAsOperatingActivities` | 이자보상 |

**단 조건부다.** CF 는 전체 재무제표에만 있고 그것은 013 으로 빌 수 있다(위 표). 그래서
`applicable_markets` 를 줄일 필요는 없지만, 결손 정직성(INV-12)이 필수다 — 가장 최근 분기에서
현금흐름이 빠질 수 있고 그때 이전 분기 값으로 메우면 런웨이가 거짓이 된다.

## 4-2. `013` 은 "데이터 없음" 이 아니다 — 일시적으로도 온다

이것이 이 덤프에서 가장 비싸게 배운 사실이다.

```
BNK금융지주(138930) 2023 Q1 주요계정
  1차 호출:  status 000, 34행
  몇 분 뒤:  status 013 "조회된 데이타가 없습니다"
같은 시점 list.json(2023 정기공시): status 000, 보고서 9건 — 보고서는 존재한다
```

문서상 `013` 은 데이터 부재지만 실제로는 일시적 실패로도 온다. 그래서

- **013 을 부재로 단정하기 전에 재시도한다**(최대 2회, 점증 지연).
- **캐시 TTL 을 비대칭으로 둔다: 성공 30일 / 부재 6시간.** 013 을 30일 부재로 굳히면 그 분기가
  영구 결손이 된다. 실측에서 밴드 이력이 10분기에서 늘지 않은 원인이 정확히 이것이었고,
  게다가 "조회 실패 0건" 으로 보고돼 원인이 보이지 않았다.
- **부재와 실패를 구분해 센다**(`reportCensus {ok, absent, failed}`). 모든 non-000 을 부재로
  삼키면 한도 초과도 "보고서 없음" 이 된다.

## 4-3. 분기 손익은 누적이 아니다

`thstrm_dt` 는 `"2025.01.01 ~ 2025.06.30"` 으로 **누적처럼 표기**하는데 `thstrm_amount` 는
**그 분기 3개월치**다. 종근당 2025:

```
1분기  400,955,846,488   ← Q1
반기   434,849,104,888   ← Q2 만. 2×Q1 이 아니다
3분기  429,818,748,658   ← Q3
사업  1,692,403,987,134  ← 연간
Q1+Q2+Q3 = 1,265,623억 · FY − 합 = 426,780억 → Q4 로 정합
```

보고서 → 분기: `11013→Q1 · 11012→Q2 · 11014→Q3`, **Q4 = 연간 − 세 분기**.
세 분기 중 하나라도 없으면 구성하지 않는다(부분 합으로 빼면 과대계상).

## 4-4. 연결·개별이 한 응답에 함께 온다

주요계정 응답에 같은 `매출액` 행이 **두 번** 온다(`fs_div: CFS` / `OFS`). 필터하지 않으면 어느 것을
집는지가 응답 순서에 달린다. 연결 우선, 섞지 않는다.

## 4-5. 은행지주는 `매출액`이 없다

BNK금융지주 주요계정: `순이자손익` · `이자수익` · `이자비용` · `순수수료손익` · `영업이익(손실)` ·
`당기순이익(손실)` · `예수부채` · `차입부채`. `매출액`이 없으므로 **PSR 관측이 0 인 것은 결함이 아니라
사실**이고 `null` 로 남는 것이 옳다.

## 5. 이 덤프가 바꾸는 것

| 대상 | 기존 | 현재 |
|---|---|---|
| `SPEC_factsheet.md` §2-2 | `filed_at_basis` 2값 | ✅ `filed_at_source` 3값 + 롤업 + 승격 시 밴드 재계산 명시 |
| `SPEC_factsheet.md` §3-5 | "DART 미착수 — 키 없음" | ✅ 실측 함정 표로 교체, DART = KR 재무 1차 소스 |
| `build.ts`(fundamentals) | 네이버 5분기 | ✅ DART 1차, 네이버는 시세·컨센서스·업종 담당 |
| 계정 매핑 | 없음 | ✅ `dart-accounts.json`(`mapping_version` 찍음, 실측 `account_id` 만 등재) |
| 밴드 입력 | 표시용 8분기(구조적 결함) | ✅ 분기 전체 이력 |
| `DOCTRINE_archetype_frames.md` | KR 업종코드 단독, `stdev_confirmed: false` | ⏳ 02R 재검토 대상(분기 영업이익 확보로 실측 가능) |
| `build.ts`(business-context) | KR 슬롯 1·2 = `vendor_summary` | ⏳ 사업보고서 "사업의 내용" 경로 미착수 |

**남은 제약은 소스 자체의 것이다.** 013 불안정성 때문에 과거 연도 확보가 호출 시점에 따라
흔들리고, 그만큼 밴드 이력 깊이도 흔들린다. 이것은 코드로 없앨 수 없고 재시도·캐시 비대칭으로
줄일 수 있을 뿐이다.
