# INCIDENT — quiet-picks 503 · 스냅샷 부재 (WO-OPS-QP503)

| 항목 | 값 |
|---|---|
| 접수 | 2026-08-15 (프로덕션 `GET /api/fomo/quiet-picks` 503) |
| 조사 | 2026-08-15 04:39~05:10 UTC · 프로덕션 HTTP 실측 + 코드 정독 |
| 상태 | **부분 규명 · 미종결** — 원인 후보 1개 배제, 최종 판정은 DB 조회 대기 |
| 확정한 것 | 원장 중복 위험은 **실재했다**(단, WO 가정과 다른 경로). 수리 완료 |
| 미확정 | `quiet-pick:active` 행이 실제로 없는지 — 프로덕션 DB 접근이 막혀 판정 못 함 |

조사 원칙은 WO 그대로다: **추측 없이 읽고, 읽은 것만 적는다.** 아래 수치는 전부 실측이다.

---

## 1. 현상 재확인 (2026-08-15 05:06:45 UTC)

```
GET https://fomo-club-backend.vercel.app/api/fomo/quiet-picks
status=503  time=3.06s
{"asOf":"2026-08-15T05:06:45.411Z","date":"2026-08-15","picks":[],
 "qualification":null,"source":"quiet-pick-engine"}
```

WO 접수 시각(04:39 UTC, 0.58초)과 **같은 본문**이다. 타임아웃이 아니라
`apps/web/app/api/fomo/quiet-picks/route.ts` 의 "스냅샷 부재" 분기다.

## 2. 배포·별칭은 정상 — 후보에서 배제

`#1076` 이 등재한 "정규 도메인 별칭이 최신 배포를 안 가리킨다" 는 **이번엔 해당 없다.**

```
vercel inspect https://fomo-club-backend.vercel.app
  → dpl_Y5nWFcCTU5xhRaQGB66PaKCjpTfD · target=production · Ready
  → created Sat Aug 15 2026 13:36:05 KST (조회 시점 32분 전 = #1078 계열)
  Aliases: taro-stock-web.vercel.app / fomo-club-backend.vercel.app / …
```

정규 별칭이 최신 프로덕션 배포에 붙어 있다. 낡은 배포를 보고 있는 게 아니다.

## 3. DB 는 살아 있다 — `FeedContentCache` 읽기 경로 자체는 동작한다

WO 의 1번 질문("행이 없나, 아니면 `readFeedContent` 가 DB 오류를 삼켜 null 을 주나")은
DB 접근 없이도 **부분적으로** 가를 수 있다. 같은 테이블을 **같은 `readFeedContent` 로**
읽는 다른 공개 라우트가 있다 — `readPublishedCommitteeSnapshot()`
(`apps/web/lib/expert-review-store.ts:68`).

같은 시각 실측:

```
GET /api/fomo/committee-report
status=200  time=4.84s
{"ok":true,"active":{"date":"2026-08-01","runId":"2026-08-01-ms9glj5m-…", …}}
```

**Prisma 연결·`FeedContentCache` 테이블·`readFeedContent` 코드 경로가 모두 정상이다.**
따라서 "DB 가 통째로 죽어서 모든 읽기가 null" 시나리오는 배제된다.

다만 이것으로 **`quiet-pick:active` 행 하나의 존재 여부까지 확정되지는 않는다.** 남은
가능성은 (a) 그 행만 없다 (b) 그 행만 읽기가 실패한다(행이 커서 등)이다. 이 둘은
현재 코드로는 **바깥에서 구분 불가** — 그게 정확히 WO 가 지목한 `feed-content-store.ts:44`
의 문제이고, 이번에 수리했다(§6).

### 행이 사라질 수 있는 코드 경로는 없다

- `writeFeedContent` 는 `ON CONFLICT DO UPDATE` 업서트다. 삭제하지 않는다.
- `deleteFeedContent` 호출처는 전 코드베이스에 **하나**뿐이고
  (`apps/web/lib/feed-briefing.ts:348`) 대상은 `briefing:kr:<date>` 다.
  `quiet-pick:*` 를 지우는 경로는 **없다.**

즉 2026-08-14 07:2x UTC 에 존재했던 `asOf 2026-08-13T21:36:11Z` 스냅샷이
애플리케이션 코드에 의해 지워졌을 리는 없다. **이 모순이 이번 사건의 핵심 미해결점이다.**

## 4. 막힌 것 — 무엇을 못 했고 왜인가

정직하게 남긴다. 아래 둘은 **시도했고 환경이 거부했다.**

| 하려던 것 | 결과 |
|---|---|
| `vercel env pull` 로 `DATABASE_URL` 을 받아 WO 의 `SELECT … WHERE id LIKE 'quiet-pick:%'` 실행 | 권한 분류기가 차단. **DB 판정 미실행** |
| `vercel logs` 로 2026-08-14 21:25 UTC 크론 실행 결과 확인 | CLI 는 **라이브 스트림 전용**. 그 시각 크론은 이미 교체된 배포에서 돌아 조회 불가 |

로컬 `.env` 에는 `AI_*`/`OPIK_*` 만 있고 `DATABASE_URL` 이 없다.

**따라서 WO 질문 1·2 는 종결되지 않았다.** 남은 판정 수단은 두 가지다:

1. `DATABASE_URL` 을 사람이 직접 넣고 WO 의 쿼리를 실행한다.
2. **또는 이 PR 배포 후 라우트 본문을 다시 읽는다** — §6 의 수리로 두 경우가
   `reason` 필드로 갈린다. `"not-published"` 면 행이 없는 것이고,
   `"store-read-failed"` 면 읽기가 실패하는 것이다.

2번이 사람 손을 덜 탄다. **배포 후 이 문서를 갱신할 것.**

## 5. 원장 중복 — WO 의 경계는 옳았고, 기전은 달랐다

WO 3번은 "**키에 `ts` 가 들어가면** 같은 날 두 번 호출 시 selection 행이 중복된다" 였다.
`ledgerContentKey`(`apps/web/lib/judgment-ledger.ts:150`)를 읽은 결과:

```ts
export function ledgerContentKey(input: …): string {
  const ts = input.ts ?? new Date();
  return ledgerKey(
    normalizeDate(input.date, ts),   // ← ts 는 여기서 "날짜를 고를 때"만 쓰인다
    input.subject.asset, input.subject.canonical.trim(),
    input.kind, stableJson(input.payload)
  );
}
```

**`ts` 는 해시 재료가 아니다.** `input.date` 가 주어지면(quiet-pick 은 `response.date` 를
항상 준다) `ts` 는 결과에 아무 영향이 없다. **가정은 틀렸다.**

그런데 **중복 위험 자체는 실재했다.** 경로가 다르다:

1. `appendJudgmentLedger` 는 행을 만들 때 `idempotencyKey: contentKey` 로
   **호출자가 준 `idempotencyKey` 를 통째로 버렸다**(옛 `judgment-ledger.ts:219`).
   세 호출처 모두 안정적인 키를 정성껏 만들어 넘기고 있었는데도 그렇다:
   - `quietPickLedgerEntries`: `ledgerKey("<date>:<asset>:<symbol>:quiet-pick", "selection")`
   - `ledger-track-record.ts:168`: `ledgerKey("outcome", selection.id, windowDays)`
   - `business-invalidation-judge.ts:157`: `business-invalidation:<selection.id>`
2. 그래서 멱등성이 **페이로드 안정성에 통째로 의존**하게 됐다.
3. quiet-pick 페이로드에는 발행 스탬프가 실린다. 그 안의
   `reference_price_as_of` 는 `response.asOf`(`publication-stamp.ts:304`)이고,
   `response.asOf` 는 `new Date().toISOString()`(`quiet-pick.ts:1193`)이다.

**결론: 같은 날 크론을 두 번 쏘면 페이로드가 달라지고 → `contentKey` 가 달라지고 →
`skipDuplicates` 가 못 걸러 selection 행이 중복된다.** 스탬프의 `reference_price`(현재가)도
같이 흔들린다.

이번 세션이 크론을 쏘지 않은 판단은 **결과적으로 옳았다.**

## 6. 수리 (이 PR)

### (a) 침묵하는 null 을 없앤다 — `feed-content-store.ts`

`readFeedContent` 는 "행 없음" 과 "읽기 실패" 를 똑같이 `null` 로 줬다(게다가 `catch` 의
`P2010` 분기와 폴스루가 **둘 다 `return null`** 인 죽은 코드였다). 구분이 필요한
호출자를 위해 `readFeedContentStrict` 를 추가했다 — 예외를 삼키지 않는다.
기존 `readFeedContent` 는 동작을 유지하되 **삼킬 때 `console.error` 로 흔적을 남긴다.**

### (b) 조회 라우트가 원인을 말하게 한다 — `quiet-picks/route.ts`

`readFeedContentStrict` 를 쓴다. 503 본문에 `reason` 이 붙는다:

| 상황 | 본문 |
|---|---|
| 스냅샷 부재 | `{…, "reason":"not-published"}` |
| 읽기 실패 | `{"error":"<메시지>", "picks":[], "reason":"store-read-failed"}` |

부수 효과가 하나 더 있는데 이쪽이 더 중요할 수 있다. 예외를 던지면
**`unstable_cache` 가 그 결과를 캐시하지 않는다.** 종전에는 일시적 DB 오류가 `null` 로
바뀌어 돌아왔고, 그 `null` 이 `revalidate: 300` 으로 **5분간 "발행 전" 으로 굳었다.**

### (c) 원장 멱등성을 문서화된 계약대로 돌린다 — `judgment-ledger.ts`

- `idempotencyKey` 는 이제 **호출자 키**를 쓴다. `kind === "score"` 만 예외로 내용 키를
  유지한다 — 같은 날 재계산분을 새 행으로 남기고 `_ledger.supersedes` 로 이전 행을
  가리키는 것이 의도된 동작이라, 키를 고정하면 재계산이 통째로 삼켜진다.
- 키 방식을 바꾸는 것만으로는 **과거 날짜를 다시 구울 때 오히려 중복이 난다**(옛 행은
  내용 해시 키라 새 키와 안 겹친다). 그래서 selection 에 한해
  `(date, asset, canonical, actor)` 존재 검사를 추가했다. 엔진분과 위원회분은 `actor` 로
  갈리므로 둘 다 정상 보존된다. `outcome` 은 `windowDays` 별로 여러 행이 정당하므로
  이 검사를 걸지 않는다.

`apps/web/__tests__/lib/judgment-ledger-append-idempotency.test.ts` 5건이 위를 고정한다.
전체 스위트 203 파일 · 2028건 통과, `tsc --noEmit` 무오류.

## 7. 남은 일

1. **배포 후 `/api/fomo/quiet-picks` 의 `reason` 을 읽어 §3 의 (a)/(b) 를 판정하고 이 문서를 갱신한다.**
2. 2026-08-14 21:25 UTC 크론 실행 결과는 Vercel 대시보드(Observability → Cron Jobs)에서만
   확인 가능하다. WO 가정대로 504 시기와 겹쳐 실패했는지 확인이 필요하다.
3. 오늘 21:25 UTC 크론이 성공하면 자연 복구다. **(c) 수리가 배포된 뒤라면** 수동 재발행도
   안전하다 — 중복이 두 겹으로 막힌다.
