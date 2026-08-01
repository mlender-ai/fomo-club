# Flaky 테스트 감사 (WO-SUB-03.5 PART D)

> **PR 게이트에 남는 테스트는 전부 결정론적이어야 한다.**
> 삭제·skip 은 금지다. 처리 방식은 **고정(픽스처)** 또는 **격리(@network 태그 + 별도 잡)** 둘 중 하나다.

측정일: 2026-07-25 · 대상: 전 스위트(`vitest run`, 144 파일 / 1,599 테스트)

---

## 1. 식별 방법

1. 테스트 파일에서 실네트워크 함수 호출을 정적 스캔
   (`fetchRedditSignals`·`fetchStockDaily`·`fetchUsDailyCandles`·`fetchNasdaq*`·`fetchKrMarketRows`·
   `fetchInsiderCluster*`·`fetchDart*`·`computeLiveFomoIndex`·`fetchSupplyDemand`·`callAI`·
   `fetchFredSeries*`·`assembleStockFront`)
2. 후보별로 모킹 여부 확인(`vi.mock` / `vi.stubGlobal` / 의존성 주입 / 소스 스캐너)
3. **모킹되지 않은 것만** 반복 실행으로 flakiness 실증(단일 파일 5회 + 전 스위트 3회)

"main 에서도 재현된다"는 면죄부가 아니라 범위다 — main 기준으로 재현시킨 뒤 고쳤다.

---

## 2. 식별 결과

| 테스트 | 네트워크 함수 | 상태 | 처리 |
|---|---|---|---|
| `apps/web/__tests__/api/fomo/index.test.ts` | `computeLiveFomoIndex` → `fetchRedditSignals` | **flaky 실증** | **고정** |
| `apps/web/__tests__/lib/stock-front-lite.test.ts` | `fetchStockDaily` 등 | 모킹됨(`vi.mock` 3) | 유지 |
| `apps/web/__tests__/lib/theme-understanding-naver-code.test.ts` | 네이버 계열 | 모킹됨(`vi.mock` 6) | 유지 |
| `apps/web/__tests__/lib/stock-official-facts.test.ts` | 수급·공시 | 모킹됨(`vi.mock` 1) | 유지 |
| `packages/shared/__tests__/ai-client.test.ts` | `callAI` | `vi.stubGlobal("fetch", …)` 4곳 | 유지 |
| `apps/web/__tests__/lib/quiet-pick.test.ts` | `assembleStockFront`·`fetchDart*` 등 | **의존성 주입**(`QuietPickDeps`) | 유지 |
| `apps/web/__tests__/lib/fundamentals-request-path-guard.test.ts` | (이름만 등장) | 소스 스캐너(`readFileSync` 5) | 유지 |
| `apps/web/__tests__/lib/business-context-request-path-guard.test.ts` | (이름만 등장) | 소스 스캐너(`readFileSync` 6) | 유지 |
| `packages/fomo-core/__tests__/invariant-14-render-path.test.ts` | (이름만 등장) | 소스 스캐너(`readFileSync` 3) | 유지 |

**실제 flaky 는 1건**이었다. 나머지 후보는 이미 결정론(모킹·주입·정적 스캔)이라 조치 대상이 아니다.

---

## 3. `index.test.ts` — 원인과 처리

### 원인 (실측)

반복 실행에서 실패 건수가 0 → 2 → 5 로 흔들렸고, 실패 메시지는 전부 동일했다.

```
× 감정 투표 데이터 있을 때 score가 중립이 아닌 값   5004ms
× 감정 투표 없을 때 중립 스냅샷 반환                5001ms
× 공포 투표 우세 → score < 45                      5003ms
× snapshot 조회 실패 → 라이브/중립 폴백 200 반환    5002ms
× Access-Control-Allow-Origin: * 포함              5002ms
Error: Test timed out in 5000ms.
```

전부 **5,000ms 타임아웃**이다. 스냅샷이 없을 때 라우트가 타는 라이브 폴백 경로가 원인이었다.

```
GET /api/fomo/index
  └ prisma.fomoIndexSnapshot.findUnique  → 테스트에서 모킹됨(null/reject)
  └ computeLiveFomoIndex(date)           → 모킹 안 됨
      ├ todayTally(date)                 → prisma (모킹됨)
      └ fetchRedditSignals()             → **실제 Reddit HTTP (timeout 5000ms)**
```

`fetchRedditSignals` 의 자체 타임아웃(5,000ms)이 vitest 기본 테스트 타임아웃(5,000ms)과 같아서,
러너 네트워크가 느리거나 Reddit 이 막히면 테스트가 먼저 죽었다. 네트워크가 빠른 실행에서는 통과했다.
**같은 코드가 실행마다 다른 결과를 내는 상태** — 원칙 7(결정론) 위반.

### 처리 — 고정(픽스처)

이 테스트가 검증하는 것은 **감정투표 → 점수 로직**이다(fomo/greed 우세 → score > 45,
fear/regret 우세 → score < 45, 투표 없음 → 45/관심). 커뮤니티 시그널은 검증 대상이 아니므로
빈 배열로 고정했다.

```ts
vi.mock("@fomo/core", async () => {
  const actual = await vi.importActual<typeof import("@fomo/core")>("@fomo/core");
  return { ...actual, fetchRedditSignals: vi.fn(async () => []) };
});
```

- `importActual` 로 나머지 export(`computeFomoIndex`·`scoreToColor` 등)는 **실물 그대로** 둔다.
  점수 계산 로직을 모킹으로 바꿔치기하면 테스트가 의미를 잃는다.
- 단정문은 한 줄도 바꾸지 않았다. 통과 조건을 낮춰 초록으로 만든 것이 아니다.

### 검증

| 대상 | 반복 | 결과 |
|---|---|---|
| `index.test.ts` (수정 전) | 3회 | `7 passed` / `7 passed` / **`2 failed`** |
| `index.test.ts` (수정 전, 재현) | 1회 | **`5 failed`** |
| `index.test.ts` (수정 후) | 5회 | `7 passed` × 5 |
| 전 스위트 (수정 후) | 3회 | `1599 passed` × 3 |

---

## 4. `@network` 격리 잡을 만들지 않은 이유

WO 는 고정과 격리 둘 중 하나를 택하라고 했고 **고정을 권장**했다. 유일한 flaky 1건이 고정으로
해소됐으므로 격리 잡은 만들지 않았다. 현재 PR 게이트에 실네트워크 의존 테스트가 없기 때문에
빈 잡을 두면 관리 대상만 늘고 검증하는 것이 없다.

**앞으로 실네트워크가 꼭 필요한 테스트가 생기면** 그때 `@network` 태그와 별도 잡을 도입한다.
그 전까지의 규칙: **PR 게이트 테스트는 네트워크를 타지 않는다.** 외부 소스 실측은 테스트가 아니라
`substance-audit.yml`·`quiet-pick-trigger.yml` 같은 **명시적 실측 워크플로**에서 한다(이미 그렇게 분리돼 있다).

---

## 5. 남은 위험

- 새로 추가되는 테스트가 라우트를 직접 호출하면 같은 함정에 다시 빠질 수 있다.
  라우트 테스트는 **prisma 뿐 아니라 외부 fetch 계층까지** 모킹해야 한다는 것이 이번 교훈이다.
- 정적 스캔은 이름 기반이라 새 네트워크 함수가 목록에 없으면 놓친다. §1 의 함수 목록은
  네트워크 소스를 추가할 때 같이 갱신한다.
