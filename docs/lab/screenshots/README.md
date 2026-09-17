# 화면 기록

`LAB-FIX` PART E-3.

| 파일 | 어디서 | 무엇 |
|---|---|---|
| `2026-09-17-prod-db-down.png` | **정규 도메인** | `화면을 불러오지 못했습니다` — 프로덕션 DB 가 없다 |
| `2026-09-17-local-backtest-board.png` | **로컬** (`localhost:3200`) | 같은 코드에 데이터가 있을 때의 백테스트 표 + 자산곡선 |
| `2026-09-17-local-live.png` | **로컬** | 전광판 |

## 로컬 화면을 프로덕션이라고 읽지 말 것

로컬 둘은 **같은 커밋의 코드**를 로컬 Postgres(도커 `lab-pg`)에 붙여 찍은 것이다.
화면 코드가 도는 것은 보여주지만 **완료 확인이 아니다.**

`LAB-FIX` 완료 조건은 *"정규 도메인에서 백테스트 결과가 보인다"* 이고, 그건
프로덕션 DB 가 돌아와야 찍을 수 있다:

```
FATAL: (ENOTFOUND) tenant/user postgres.axpkkufhkughmnfjuyla not found
        aws-1-ap-northeast-2.pooler.supabase.com:5432
```

DB 가 살아나면 정규 도메인에서 다시 찍어 `2026-XX-XX-prod-backtest-board.png` 로 남긴다.
