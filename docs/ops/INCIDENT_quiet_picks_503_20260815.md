# INCIDENT — quiet-picks 간헐 503 (WO-OPS-QP503)

| 항목 | 값 |
|---|---|
| 접수 | 2026-08-15 (프로덕션 `GET /api/fomo/quiet-picks` 503) |
| 조사 | 2026-08-15 04:39~05:2x UTC · 프로덕션 HTTP 실측 + 코드 정독 |
| 상태 | **원인 규명 완료 · 수리 PR 대기** |
| 근본 원인 | `readFeedContent` 가 **DB 읽기 실패를 `null` 로 삼켜** 라우트가 그것을 "아직 발행 전" 으로 번역한다. `unstable_cache` 가 그 `null` 을 **300초간 굳힌다** |
| 접수 시 가정 | "스냅샷이 없다" — **틀렸다.** 행은 내내 있었다 |

조사 원칙은 WO 그대로다: **추측 없이 읽고, 읽은 것만 적는다.** 아래 수치는 전부 실측이다.

---

## 1. 사건은 행 부재가 아니라 간헐 실패였다

접수 시 관측(2026-08-15 04:39 UTC) 및 조사 초기 재현(05:06:45 UTC):

```
GET /api/fomo/quiet-picks
status=503  time=0.58s / 3.06s
{"asOf":"…","date":"2026-08-15","picks":[],"qualification":null,"source":"quiet-pick-engine"}
```

같은 날 05:2x UTC, **12회 연속 재측정**:

```
 1 status=200 0.051s picks=10 asOf=2026-08-14T21:41:50.762Z
 2 status=200 0.053s picks=10 asOf=2026-08-14T21:41:50.762Z
 …
12 status=200 0.038s picks=10 asOf=2026-08-14T21:41:50.762Z
```

**12/12 성공.** 스냅샷의 `asOf` 는 `2026-08-14T21:41:50.762Z` 다.

이 한 줄이 접수 시 가정을 무너뜨린다. `asOf` 는 **04:39 UTC 의 503 보다 7시간 앞선다.**
즉 503 을 받던 그 시각에 **`quiet-pick:active` 행은 이미 DB 에 있었다.**

> 이 정정은 병행 세션(FeedContentCache 성능 저하 분석)이 먼저 제기했고,
> 위 12회 실측으로 독립 확인했다.

### 따라서 WO 질문 1·2 는 종결된다

| WO 질문 | 답 |
|---|---|
| ① 행이 없나, `readFeedContent` 가 오류를 삼켰나 | **삼켰다.** 행은 있었다 |
| ② 2026-08-14 21:25 UTC 크론이 실패했나 | **성공했다.** `asOf` 가 그날 굽기의 증거다 |
| ③ 크론 수동 호출 시 원장 중복 | 호출 불필요(이미 구워짐). 다만 **위험은 실재했다** — §5 |

## 2. 왜 7시간 동안 503 이었나 — `unstable_cache` 가 증폭한다

행이 있는데도 503 이 계속된 이유가 여기 있다. 세 겹이다.

1. `readFeedContent` 가 **읽기 실패를 `null` 로 바꾼다**(`feed-content-store.ts:44`).
   `catch` 안에서 `P2010` 분기와 폴스루가 **둘 다 `return null`** 인 죽은 코드였다.
2. 라우트는 그 `null` 을 "아직 발행 전" 으로 번역해 503 을 낸다. **호출부에서 구분 불가다.**
3. **그 `null` 이 `unstable_cache` 에 들어간다**(`revalidate: 300`).
   → **일시적 DB 오류 한 번이 5분짜리 "발행 전" 상태로 굳는다.**

읽기가 실제로 느리다는 정황도 있다. 503 응답은 0.58s·3.06s 였고, 같은 시각
`FeedContentCache` 를 읽는 `/api/fomo/committee-report` 는 **4.84초**가 걸렸다.
(지금 200 이 ~50ms 인 것은 CDN 캐시 히트다 — 503 은 `no-store` 라 매번 오리진을 쳤다.)
느린 읽기가 간헐적으로 실패 → 삼킴 → 5분 고착이 반복되면 관측상 "몇 시간째 503" 이 된다.

**`FeedContentCache` 읽기 지연 자체는 이 문서의 범위 밖이다** — 병행 세션이 그쪽을 판다.
여기서 고치는 것은 **그 지연이 "발행 전" 으로 위장되는 경로**다.

## 3. 배제한 것

- **별칭 문제 아님**(#1076 재발 아님). `vercel inspect` — 정규 도메인
  `fomo-club-backend.vercel.app` 이 최신 프로덕션 배포
  `dpl_Y5nWFcCTU5xhRaQGB66PaKCjpTfD`(2026-08-15 13:36 KST, #1078 계열)에 붙어 있다.
- **행이 지워진 것 아님.** `writeFeedContent` 는 `ON CONFLICT DO UPDATE` 업서트고,
  `deleteFeedContent` 호출처는 전 코드베이스에 하나뿐이며(`feed-briefing.ts:348`)
  대상은 `briefing:kr:<date>` 다. `quiet-pick:*` 를 지우는 경로는 **없다.**

## 4. 곁가지로 나온 관측 — 크론 완료 시각

`asOf` 는 응답 조립 **마지막에** 찍힌다(`quiet-pick.ts:1192`). 즉 그날 굽기는
**21:41:50Z 에 끝났다.** 크론 스케줄은 `25 21 * * *`(`apps/web/vercel.json`)이고
라우트의 `maxDuration` 은 **300초**다. 21:25 → 21:41:50 은 약 17분이라
**한 번의 호출이 그 간격을 통째로 쓸 수는 없다.** 호출이 늦게 시작됐거나 재시도가 있었다는 뜻이다.

이번 사건의 원인은 아니지만(굽기는 성공했다) 기록해 둔다. Vercel Observability →
Cron Jobs 에서 실제 시작 시각을 보면 정리된다.

## 5. 원장 중복 — 급하진 않지만 실재했다

WO 3번은 "**키에 `ts` 가 들어가면** 같은 날 두 번 호출 시 중복" 이었다.
`ledgerContentKey`(`judgment-ledger.ts:150`)를 읽은 결과 **`ts` 는 해시 재료가 아니다** —
`normalizeDate(input.date, ts)` 로 **날짜를 고를 때만** 쓰이고, quiet-pick 은 `response.date`
를 항상 주므로 영향이 없다. **가정은 틀렸다.**

**그런데 중복 위험 자체는 실재했다.** 경로가 다르다:

1. `appendJudgmentLedger` 가 행을 만들 때 `idempotencyKey: contentKey` 로
   **호출자가 준 키를 통째로 버렸다**(옛 `judgment-ledger.ts:219`). 세 호출처 모두
   안정 키를 만들어 넘기는데도 그랬다.
2. 그래서 멱등성이 **페이로드 안정성에 통째로 의존**하게 됐다.
3. quiet-pick 페이로드의 발행 스탬프에는 `reference_price_as_of` 가 실리고, 그 값은
   `response.asOf`(`publication-stamp.ts:304`) = `new Date().toISOString()`(`quiet-pick.ts:1192`)다.

**결론: 같은 날 두 번 구우면 페이로드가 달라져 `skipDuplicates` 가 못 걸렀다.**
이번 세션이 크론을 쏘지 않은 판단은 결과적으로 옳았다. 같은 PR 에서 고쳤다(§6-c).

## 6. 수리 (PR #1081)

### (a) 침묵하는 null 을 없앤다 — `feed-content-store.ts`

`readFeedContentStrict` 추가 — 예외를 삼키지 않는다. 기존 `readFeedContent` 는 동작을
유지하되 **삼킬 때 `console.error` 로 흔적을 남긴다.**

### (b) 조회 라우트가 원인을 말한다 — `quiet-picks/route.ts`

| 상황 | 본문 |
|---|---|
| 스냅샷 부재 | `{…, "reason":"not-published"}` |
| 읽기 실패 | `{"error":"<메시지>", "picks":[], "reason":"store-read-failed"}` |

**그리고 이쪽이 사용자에게 더 중요하다:** 예외를 던지면 `unstable_cache` 가 그 결과를
캐시하지 않는다. §2 의 **5분 고착이 사라진다** — 다음 요청이 곧바로 다시 읽는다.

### (c) 원장 멱등성 — `judgment-ledger.ts`

- `idempotencyKey` 는 이제 **호출자 키**를 쓴다. `kind === "score"` 만 내용 키 유지
  (같은 날 재계산분을 새 행으로 남기고 `_ledger.supersedes` 로 잇는 게 의도된 동작이라).
- 키만 바꾸면 옛 내용 해시 행과 안 겹쳐 **오히려** 중복이 나므로, selection 에 한해
  `(date, asset, canonical, actor)` 존재 검사를 추가했다. 엔진분/위원회분은 `actor` 로
  갈리고, `outcome` 은 `windowDays` 별 다중 행이 정당하므로 대상이 아니다.

### (d) 다른 삼킴 호출부는 그대로 둔다 — 의도된 삼킴이다

`quiet-pick:active` 를 읽는 나머지 세 곳은 **바꾸지 않는다.**

| 호출부 | 성격 |
|---|---|
| `card-slots/payload.ts:155` | 카드 슬롯 보강 |
| `card-slots/coverage.ts:279` | 커버리지 집계 |
| `fundamentals/universe.ts:39` | 유니버스 보강 |

셋 다 이미 `.catch(() => null)` 을 **스스로** 덧대고 있고, 실패 시 보강을 건너뛰는
**정상 열화 경로**다. 여기서는 "없음" 과 "실패" 를 구분할 실익이 없다.

**구분이 필요한 곳은 `null` 을 사용자에게 보이는 상태 주장으로 번역하는 지점뿐이다** —
조회 라우트가 유일하다. 삼킴 자체가 죄는 아니고, 삼킨 것을 "발행 전" 이라고 **말하는** 게 죄다.

### 검증

`__tests__/lib/judgment-ledger-append-idempotency.test.ts` 5건 신규.
전체 203 파일 · 2028건 통과, `tsc --noEmit` 무오류.

## 7. 남은 일

1. **`FeedContentCache` 읽기 지연** — 왜 4.84초가 걸리는가. 병행 세션 소관.
   이 문서의 수리는 지연을 없애지 못하고 **오진만 없앤다.**
2. 배포 후 `reason` 필드로 향후 503 의 성격을 즉시 판별할 수 있다.
   `store-read-failed` 가 잡히기 시작하면 1번이 확증된다.
3. 크론 실제 시작 시각 확인(§4).
