# 소급 불변식 스캔 (WO-SUB-03.5 PART A-2)

> 활성 불변식을 **이미 생성된 산출물 전량**에 소급 실행한 결과다.
> 위반이 나오면 그것이 작업 목록이고, 0건이면 0건인 것도 결과로 기록한다(지시서 A-2).
> `INV-06`·`INV-11` 은 02R 유예 대상이라 검사하지 않는다 — 유예를 검사하면 유예의 의미가 사라진다.

## 1. 대상

| 산출물 | 건수 |
|---|---|
| 팩트시트 | 67 |
| 사업 실체 | 13 |
| 아키타입 분류(팩트시트에서 재계산) | 67 |

## 2. 불변식별 위반 건수

| 불변식 | 내용 | 위반 |
|---|---|---|
| `INV-08` | 수치 렌더 시 source + as_of 동반 | 0 |
| `INV-09` | 금지어 사전 | 0 |
| `INV-12` | 결측 정직성 | 0 |
| `INV-14` | 렌더 경로에서 계산/LLM 임포트 금지 | 0 |
| (결정론) | 같은 입력 → 같은 분류 | 0 |

### INV-14 는 파일 스캔이라 여기서 세지 않는다

렌더 경로 임포트 금지는 산출물이 아니라 **소스 트리**에 대한 규칙이다.
CI 의 `packages/fomo-core/__tests__/invariant-14-render-path.test.ts` 와
`apps/web/__tests__/lib/*-request-path-guard.test.ts` 가 PR 게이트에서 매번 실행된다.

## 3. 위반 샘플

**0건.** 활성 불변식 위반이 없다.

INV-08·INV-12 가 0건인 것은 우연이 아니다 — `projectForRender()` 가 출처 없는 값과
`missing_fields` 경로를 **통과시키지 않으므로** 위반이 만들어질 경로가 없다. 이 스캔은
그 구조가 실제 데이터에서도 성립하는지 확인하는 것이고, 성립했다.

## 4. 아키타입 분포 (참고)

| 유형 | 건수 |
|---|---|
| `UNCLASSIFIED` | 24 |
| `CYCLICAL_COMMODITY` | 9 |
| `TURNAROUND_LOSS` | 8 |
| `PHARMA_STABLE` | 7 |
| `QUALITY_COMPOUNDER` | 7 |
| `BANK_FINANCIAL` | 4 |
| `BIOTECH_PIPELINE` | 3 |
| `HYPERGROWTH_UNPROFITABLE` | 3 |
| `MATURE_INCOME` | 2 |
