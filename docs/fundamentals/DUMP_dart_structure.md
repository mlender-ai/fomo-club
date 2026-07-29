# DART 응답 구조 덤프 (WO-SUB-03.5 PART E-1 근거)

> WO-SUB-00 규칙: **확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만든다.** 이 문서는 그 근거다.
> 여기서는 판정하지 않는다 — 확보율·파서는 이 표를 근거로 그 다음에 만든다.
>
> 재현: `GET /api/fomo/cron/dart-discovery?code=185750[&refresh=1]`
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

## 4. `fnlttSinglAcntAll` — 확인 중

첫 시도 `bsns_year=2025 & reprt_code=11011 & fs_div=CFS` 는 `status 013`("조회된 데이타가
없습니다"). 65바이트. 주요계정(§3)은 같은 연도·보고서로 정상이므로 **연도나 보고서 축의 문제가
아니다.** `fs_div` 축 또는 전체 재무제표 자체의 제공 범위를 의심한다.

원인을 가르기 위해 OFS·전년도·3분기를 같이 찍는 프로브를 추가했다. 결과는 이 절에 이어 붙인다.
현금흐름·EPS 가 여기서만 나오므로, 열리지 않으면 그 두 지표는 **KR 미확보로 남긴다**(대체 지표로
억지로 만들지 않는다 — WO-SUB-03.5 원칙).

## 5. 이 덤프가 바꾸는 것

| 문서 | 기존 기록 | 이 덤프 이후 |
|---|---|---|
| `SCOPE_kr_limitation.md` | KR 분기 5개 상한(네이버) | 상한 해소 경로 확보 — 재작성 대상 |
| `SPEC_factsheet.md` | KR `filed_at_basis: statutory_deadline` | `disclosed` 로 승격 가능 |
| `DOCTRINE_archetype_frames.md` | KR 시클리컬은 업종코드 단독, `stdev_confirmed: false` | 실측 stdev 로 확인 가능 — 재검토 |
| `build.ts`(business-context) | KR 슬롯 1·2 는 `vendor_summary` | 사업보고서 "사업의 내용" 경로 검토 대상 |

**아직 아무것도 고치지 않았다.** 위 표는 다음 단계의 작업 목록이고, 그 근거가 이 문서다.
