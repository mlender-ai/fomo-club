# Quality SLO Ledger

daily-30 발행 품질을 매일 같은 결정론 규칙으로 계산해 보존하는 append-only 원장이다.

## 고정 목표

| SLO | 목표 |
|---|---:|
| ±3% 카드 원인 설명률 | 90% 이상 |
| 가격·sparkline 실값 | 100% |
| verdict 문장 유니크 | 10개 이상 |
| 동일 문장 최다 반복 | 3회 이하 |
| 전일 종목 중복률 | 50% 이하 |
| 자산 구성 | US 8개 이상, 코인 3~5개 |
| 위원회 | 발행 성공 |
| 재무·테마·신호이력 뎁스 완결률 | 90% 이상 |

목표는 `QUALITY_SLO_TARGETS` 단일 상수에 고정하며 운영 상태에 맞춰 자동 완화하지 않는다.

## 기록 규약

- idempotency key는 `quality:YYYY-MM-DD`이고 날짜마다 한 행만 허용한다.
- 위원회 editor 발행 직후 계산하며, 10분 뒤 품질 크론이 최근 2개 immutable selection 날짜의 누락 행만 보충한다.
- catch-up은 당시 selection/front/committee 스냅샷으로 다시 계산한 신규 append다. 기존 품질 행은 재계산·수정하지 않는다.
- PostgreSQL 트리거와 RLS가 `UPDATE`, `DELETE`, `TRUNCATE`를 거부한다.
- 품질 미달은 daily-30 공급을 중단하지 않지만 `Quality SLO Monitor` Action을 실패시켜 경고한다.

## 운영

1. `Quality SLO Ledger Bootstrap`을 실행해 정확한 파티션 SQL을 적용한다.
2. 같은 워크플로가 최근 2개 날짜를 자동 materialize하고 UPDATE/DELETE 거부를 검증한다.
3. `/admin/quality`에서 추이와 미달 셀을 확인한다.
4. `/api/fomo/quality-slo`는 운영 실측용 read-only projection이다.
