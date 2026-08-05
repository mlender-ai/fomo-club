# WO-SUB-07 [F] 1단계 — 발행 시점 기록 시작

착수 2026-08-06 · WO-SUB-FINISH [F] "지금 당장 해야 하는 것 하나 — 소급 불가"

> 발행 시점 기록을 지금부터 시작한다. T+180 채점이 있으므로 기록이 늦으면 첫 성적표가
> 그만큼 늦어진다. **이건 05·06을 기다리지 말고 이번 주에 시작한다.**

채점 로직은 나중에 붙여도 된다. **기록만 먼저.** 이 문서는 그 1단계의 범위와 남은 것을 고정한다.

## 1. 무엇을 기록하는가

발행 경로(`/api/fomo/cron/quiet-pick`)가 원장에 `kind=selection`·`pickType=quiet` 행을 쓸 때
`payload.publication` 스탬프를 같이 싣는다.

| [F] 최소 필드 | 어디에 | 상태 |
|---|---|---|
| `card_id` | 원장 행 `id` | 기존 |
| `symbol` | `subject.symbol`·`canonical` | 기존 |
| `published_at` | 행 `date`·`ts` | 기존 |
| `reference_price` | 행 `priceAt` + 스탬프에 중복 기록 | 기존 + 신규 |
| `reference_price_as_of` | `publication.reference_price_as_of` | **신규** |
| `archetype` | `publication.archetype` (+`archetype_reason`) | **신규** |
| `ruleset_version` | `publication.ruleset_version` | **신규** |
| `factsheet_hash` | `publication.factsheet_hash` (+`factsheet_as_of`) | **신규** |
| `invalidation_price` | `publication.invalidation_price` (+`invalidation_text`) | **신규** |
| `invalidation_business` | `publication.invalidation_business` = `null` | **06 대기** |
| `earnings_date` | `publication.earnings_date` (+`earnings_date_status`) | **신규(부분)** |

## 2. 발행 시점 복원이 가능한 이유

`factsheet_hash` 하나로 그 순간의 팩트시트를 되찾는다 — `readFactSheetSnapshot(market, canonical, hash)`
경로가 이미 있고, `writeFactSheet()` 가 해시가 바뀔 때마다 불변 스냅샷을 append 해뒀다.
따라서 스탬프는 **해시만 남기면 되고 팩트시트 사본을 원장에 복사하지 않는다.**

## 3. 결측을 값으로 채우지 않는다

`earnings_date: null` 은 그것만으로는 "어닝이 없다" 로 오독된다. 그래서 상태가 항상 짝으로 붙는다.

| `earnings_date_status` | 뜻 |
|---|---|
| `found` | 저장된 주간 캘린더에서 확보 |
| `outside_window` | 캘린더는 읽었으나 7일 창 밖 — 없는 것이 아니라 아직 모르는 것 |
| `no_source_kr` | KR 은 사전 공표 소스가 없다(DART 는 사후 공시). **데이터를 더 모아도 안 된다** |
| `calendar_unavailable` | 캘린더 자체를 못 읽었다(크론 미실행·저장 장애) |

`missing[]` 에 확보하지 못한 필드 이름이 쌓인다. 채점 시 **분모에서 빼는 근거**가 이것이다.
`invalidation_business` 는 06 미착수라 전 행에 들어간다 — 06 이 붙으면 사라진다.

## 4. 발행을 막지 않는다

- 스탬프는 **저장 레코드만 읽는다**(팩트시트·주간 캘린더). 외부 소스를 두들기지 않아 발행 경로가
  소스 장애에 묶이지 않는다
- 스탬프 조립 실패는 삼중으로 흡수된다: 종목별 → 덱 전체 → 원장 append. 어느 단계가 실패해도
  **원장 기록 자체는 남는다**. 기록이 늦는 쪽이 더 큰 손실이기 때문이다
- 크론 응답에 `stamped` 와 `stampMissing[]` 을 노출한다. 소급 불가라 **그날 0 이면 영구 결손**이고,
  그 사실이 응답에 보여야 다음 날 알아챈다

## 5. 이번 범위에서 하지 않은 것 (부채)

| 항목 | 사유 |
|---|---|
| daily-30 `selection` 경로 스탬프 | 성적표 계열은 `pickType=quiet` 다. daily-30 선정은 다음 단계 |
| T+30 채점 로직 | [F] 축소 완료 조건 3. 기록이 쌓인 뒤 붙인다 |
| 성적표 탭 축별 결과 + n 병기 | [F] 축소 완료 조건 4. 05 의 축이 확정돼야 축별이 된다 |
| `invalidation_business` 실제 값 | WO-SUB-06 산출물 |
| 생존 편향 처리 · 버전별 집계 필터 · 채점 방법론 공개 | [F] 원 지시서에서 이미 부채로 지정 |

## 6. 검증

- 단위 8건(`publication-stamp.test.ts`) — 확보/미확보 구분, KR 소스 부재, 창 밖/캘린더 부재 구분,
  덱 단위 부분 실패 흡수
- 전체 1,689건 통과 · 타입체크 통과
- **실측**: 다음 `quiet-pick` 크론 실행의 응답 `stamped`·`stampMissing` 으로 확인한다.
  화면 변경이 없는 WO 라 완료 확인은 크론 응답이다
