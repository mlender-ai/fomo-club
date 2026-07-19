# Judgment Ledger

FOMO Club의 신호, 판단, 점수, 선정, 사용자 행동, 성과를 당시 가격과 함께 보존하는 append-only 원장이다.

## 불변 규약

- 모든 행은 `priceAt > 0`이어야 한다. 가격을 확보하지 못한 사건은 원장에 쓰지 않으며 값을 만들지 않는다.
- `date`는 KST `YYYY-MM-DD`, `ts`는 실제 기록 시각이다.
- 애플리케이션 저장 API는 `appendJudgmentLedger()` 하나뿐이다. update/delete 함수는 제공하지 않는다.
- PostgreSQL 트리거가 소유자 연결을 포함한 모든 `UPDATE/DELETE`를 거부한다.
- RLS는 `SELECT/INSERT`만 허용하며 `UPDATE/DELETE/TRUNCATE` 권한을 회수한다.
- 재시도는 날짜 파티션 안의 `idempotencyKey`로 중복되지 않는다.

## 생산자

| 생산자 | 원장 kind | actor |
|---|---|---|
| daily-30 결정론 후보 | signal, verdict, score | engine |
| 비상 엔진 최종 덱 | selection | engine |
| 위원회 승인 덱 | signal, verdict, score, selection | committee |
| 스와이프·뎁스 | user_action | user:session:* / user:uid:* |
| 성과 크론 | outcome | engine |

같은 날짜의 같은 종목에 엔진 선정과 위원회 선정이 모두 있으면 조회 시 위원회 선정을 최종본으로 사용한다. 행 자체는 지우지 않는다.
선정 payload에는 당시 카드와 front 렌더 스냅샷도 함께 들어간다. 공개 `daily-30`은 오늘 원장, 3일 이내 최근 원장, 엔진 직생성 순서로 복원하며 별도 picks 저장소를 읽지 않는다.

## 성과 산식

- 창은 7일, 30일, 90일로 고정한다.
- 목표일이 휴장일이면 그 뒤 첫 거래일 종가를 사용한다.
- `returnPct = (목표일 종가 - 선정가) / 선정가 * 100`이다.
- 상승 비율은 수익률이 0보다 큰 전체 표본 비율이다.
- 전체, 자산군, 신호 유형, 점수대 모두 동일한 outcome 집합을 사용한다. 손실 표본도 제외하지 않는다.
- 거래비용, 세금, 환율 효과는 포함하지 않는다고 공개 화면에 명시한다.

## 배포 순서

1. `prisma/sql/2026-07-20_judgment_ledger.sql`로 파티션 테이블과 불변 트리거를 먼저 만든다.
2. `prisma db push`로 Prisma 스키마를 동기화한다.
3. `npm run ledger:migrate`로 가격이 있는 `daily30-picks:` 레거시 선정분을 백필한다.
4. `npm run ledger:outcomes`로 기한이 지난 고정창 성과를 생성한다.
5. `npm run ledger:verify`로 UPDATE/DELETE 거부를 실제 DB에서 확인한다. 검증 probe도 삭제하지 않는다.

`TasteSignal`은 발견가가 없어 소급 가격을 만들 수 없으므로 백필 대상에서 제외한다. 신규 쓰기는 410으로 닫혀 있으며, 브라우저의 기존 `fomo_discovery_seen` 중 실제 발견가가 있는 행만 첫 방문 때 원장으로 옮긴 뒤 삭제한다.
