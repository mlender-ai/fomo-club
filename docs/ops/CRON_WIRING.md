# 크론 배선 대조표

감사일 **2026-08-14** (WO-SUB-FILL PART 1-2)

`/api/fomo/cron/*` 라우트 전수를 배선 위치와 대조했다. **만든 것이 돌지 않으면 만들지 않은 것과 같다** —
이 표의 목적은 그 상태를 한눈에 드러내는 것이다.

배선 위치는 두 가지다: **Vercel Cron**(`apps/web/vercel.json` — 함수 1회 호출) 또는
**GitHub Actions**(라운드를 이어 돌려야 하는 배치). 시각은 전부 UTC이고 KST는 +9시간이다.

## 대조표

| 라우트 | 배선 위치 | 주기 (UTC) | 최근 실행 | 상태 |
|---|---|---|---|---|
| `daily-30/[stage]` | Vercel Cron | `0·10·20 21 * * *` (trading·financial·editor) | 매일 | 자동 |
| `quiet-pick` | Vercel Cron + `quiet-pick-trigger.yml`(수동) | `25 21 * * *` | 매일 | 자동 |
| `quality-slo` | Vercel Cron + `quality-slo-monitor.yml` | `30 21 * * *` / 워크플로 `35 21` | 2026-08-12 **실패** | 자동 · **실패 등재** |
| `ledger-outcomes` | Vercel Cron + `judgment-ledger-backfill.yml`(수동) | `40 21 * * *` | 매일 | 자동 |
| `business-invalidation` | **Vercel Cron (이번에 배선)** | `50 21 * * *` | — | **신규 자동** |
| `fundamentals` | Vercel Cron + `fundamentals-backfill.yml`(수동) | `45 21 * * *` | 매일 | 자동 |
| `business-context` | Vercel Cron + `business-context-backfill.yml` | `55 21 * * *` / 워크플로 `0 19 * * *` | 2026-08-12 성공 | 자동 · **진척 정체 등재** |
| `signal-stats` | Vercel Cron + `signal-stats.yml` | `0 21 1 * *` (월 1회) | 2026-08-01 성공 | 자동 |
| `symbol-risk` | **`symbol-risk-backfill.yml` (이번에 스케줄 배선)** | `30 21 * * *` | 실행 이력 **0** → 이번 WO | **신규 자동** |
| `feed-content` | `feed-content.yml` | `30 20`·`10 7 1-5`·`40 7 5`·`0 20`·`30 0-5 1-5`·`30 21` | 2026-08-13 **실패** | 자동 · **실패 등재** |
| `us-market-prewarm/[slot]` | `us-market-prewarm.yml` | 10분 간격 (매시 2회 슬롯) | 2026-08-13 성공 | 자동 |
| `kr-candle-prewarm` | `kr-candle-prewarm.yml` | `40 19 * * 1-5` | 2026-08-12 성공 | 자동 |
| `coin-market-prewarm` | `coin-market-prewarm.yml` | `20 * * * *` | 2026-08-13 성공 | 자동 |
| `holding-probe` | `holding-company-probe.yml` | **수동만** | 2026-08-04 성공 | **의도적 수동** — 일회성 조사용 프로브 |

## 의도적으로 수동인 것

| 대상 | 왜 수동인가 |
|---|---|
| `holding-company-probe.yml` | 지주회사 분류 조사용 일회성 프로브. 정기 실행이 만들 산출물이 없다 |
| `fundamentals-backfill.yml` | 정기분은 Vercel 크론이 돈다. 워크플로는 **전량 재수집**용(라운드 반복)이라 의도적 실행만 |
| `business-context-backfill.yml` | 위와 같은 관계 — 단 이쪽은 cron 이 걸려 있다(`0 19`) |
| `judgment-ledger-backfill.yml` | 과거 구간 소급 채점용 |
| `quiet-pick-trigger.yml` | 진단·리포트용 수동 트리거 |
| `invariant-retro-scan.yml` | 소급 불변식 스캔. 위반이 있으면 실패로 끝난다(감사용) |

## 이번 감사에서 나온 것

### 미배선 1건 → 배선 완료

`business-invalidation` 이 **Vercel Cron 도 워크플로도 없었다.** 손으로 호출해야만 판정이 갱신됐다.
`50 21` 로 배선했다 — `ledger-outcomes`(`40 21`) 뒤여야 한다. 가격 무효선 판정이 그 관측을 쓰므로
순서가 뒤바뀌면 하루치 관측이 빠진 상태로 채점한다.

### 실패 2건 (등재만 — 화면을 깨뜨리지 않는다)

- `feed-content.yml` 2026-08-13 실패
- `quality-slo-monitor.yml` 2026-08-12 실패

둘 다 이번 WO 범위(배치 실행·크론 배선) 밖이고 화면을 깨뜨리지 않는다. `AC_DEBT_LEDGER.md` 에 등재.

### `CRON_SECRET` 미설정 — 크론 라우트가 인증 없이 열려 있다

`gh secret list` 에 `CRON_SECRET` 이 없고, 인증 헤더 없이 호출한 판정기가 **200 을 돌려줬다**(실증).
라우트의 `authorized()` 는 `!secret` 이면 통과시키므로 Vercel 에도 미설정이다.

**우선순위 판단**: 판정기·`quality-slo` 는 DB 만 읽어 남용 피해가 작다. 그러나 다음은
**외부 API 쿼터를 태운다** — 외부에서 반복 호출하면 그날 배치가 죽는다.

| 라우트 | 태우는 쿼터 |
|---|---|
| `symbol-risk` · `business-context` | **Groq LLM TPD**(유료 전환 시 과금) + SEC·DART |
| `fundamentals` | SEC · DART · 네이버 |
| `us-market-prewarm` · `kr-candle-prewarm` · `coin-market-prewarm` | TwelveData · 네이버 · Upbit |

**사람 조치 필요**: Vercel 환경변수와 GitHub Secrets 양쪽에 `CRON_SECRET` 을 넣는다.
양쪽에 넣어야 한다 — Vercel 에만 넣으면 워크플로의 `curl` 이 401 을 맞아 배치가 전부 멈춘다.
워크플로는 `Authorization: Bearer $CRON_SECRET` 헤더를 붙이도록 함께 고쳐야 한다.
`BATCH_CLOSE.md` 에 필요 조치로 기록했다.
