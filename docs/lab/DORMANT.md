# 격리 목록 — DORMANT

| | |
|---|---|
| **근거** | `LAB-01` PART B |
| **격리일** | 2026-09-11 |
| **위치** | `packages/dormant/` |
| **빌드** | **제외됨.** 워크스페이스·타입체크·테스트·번들 어디에도 들어가지 않는다 |
| **되살릴 때** | `LAB-09` — 주식 신호를 전략 진입 조건으로 |

> **지우지 않았다.** `LAB-09` 에서 신호 로직을 다시 쓴다.
> 파일은 그대로 있고 `git log --follow` 로 이력도 이어진다.

---

## 어떻게 빌드에서 빠져 있나

세 곳에서 동시에 막는다. 하나만 걸어두면 언젠가 되살아난다.

| 장치 | 파일 | 내용 |
|---|---|---|
| 워크스페이스 명시 | `package.json` | `workspaces` 를 글롭(`packages/*`)에서 **명시 목록**으로 바꿨다 — `apps/api` · `apps/web` · `packages/shared` · `packages/lab` 넷뿐이다. `packages/dormant/*` 는 심링크가 생기지 않으므로 `@fomo/core` 같은 이름이 아예 해석되지 않는다. |
| 타입체크 | 워크스페이스별 `tsconfig.json` | `npm run typecheck` 은 위 네 워크스페이스만 돈다. 격리분은 어떤 `include` 에도 없다. |
| 테스트 | `vitest.config.ts` | `exclude: ["packages/dormant/**"]`. 격리된 테스트 110건은 `LAB-09` 가 신호 로직과 함께 되살린다. |

**격리분은 컴파일되지 않는다.** 그래서 아래 "끊긴 참조"가 있어도 빌드는 초록이다.

---

## 무엇이 들어 있나

총 **644 파일.**

### PART B 가 지목한 것

| 지목 | 어디에 있나 | 파일 |
|---|---|---|
| **신호 검출기** | `fomo-core/src/keyword-cards/` — `quiet-signals.ts`(시장대비 이격·거래량 각성) · `macro-move.ts` · `sector-flow.ts` · `technical-analysis.ts` · `investor-holdings.ts` · `discovery-supply.ts` · `fomo-score.ts` · `score.ts`. 검출기 코드 판정은 `reexposure.ts` 의 `kindOfSignal` 에 있다(`volume_awakening` · `market_divergence` · `insider_cluster` · `flow_entry` · `institution_streak` · `foreign_streak` · `multi_actor`). | — |
| **DART 공시 수집** | `web/lib/dart-disclosures.ts` · `dart-body.ts` · `disclosure-collect.ts` · `disclosure-store.ts` · `web/lib/fundamentals/dart-discovery.ts` · `dart-fundamentals.ts` · `web/lib/risk/dart-risk-section.ts` | — |
| **SEC 수집** | `web/lib/sec-edgar.ts` · `web/lib/fundamentals/sec-xbrl.ts` · `web/lib/business-context/sec-filing.ts` | — |
| **팩트시트** | `web/lib/business-context/` 8개 · `web/lib/stock-basics.ts` · `stock-front.ts` · `insight-synthesis.ts` · `us-company-about.ts` · `fomo-core/src/business-context/` | — |
| **업종 분류** | `web/lib/sector-map.ts` · `sector-map-store.ts` · `fomo-core/src/fundamentals/kr-industry.ts` · `fomo-core/src/keyword-cards/sector-display.ts` · `sector-stats.ts` | — |
| **공시 뜻풀이** | `fomo-core/src/keyword-cards/disclosure-body.ts` · `disclosure-figures.ts` · `disclosure-kind.ts` · `disclosure-phrase.ts` | — |

### 디렉터리별

| 경로 | 파일 | 원래 위치 | 무엇 |
|---|---|---|---|
| `fomo-core/` | 228 | `packages/fomo-core` | 신호 검출기 · 팩트시트 · 공시 뜻풀이 · 업종 · 카드 문안 생성이 한 패키지에 얽혀 있다 |
| `web/app/api/fomo/` | 75 | `apps/web/app/api/fomo` | 소비자 API + **크론 라우트 22개**(A-3 — 중단만 하고 파일은 남겼다) |
| `web/lib/` | 97 | `apps/web/lib` | 수집·저장·신호·판단 원장 구현 |
| `web/__tests__/` | 110 | `apps/web/__tests__` | 위 것들의 테스트. `LAB-09` 이식 검증에 쓴다 |
| `web/e2e/` | 1 | `apps/web/e2e` | 소비자 화면 스모크 |
| `web/app/globals.css` | 1 | `apps/web/app/globals.css` | 옛 소비자 디자인 토큰 7,470줄. `agent-*`(97) · `strategy-*`(46) · `console-*`(19) 규칙은 트레이딩 콘솔용이라 **`LAB-05` 가 캐 갈 수 있다** |
| `scripts/` | 108 | `scripts` | 옛 제품 파이프라인·에이전트 조직 운영. `perf-regression-gate.ts` · `invariants-render.ts` 는 CI 게이트였다 |
| `ctx-flow/` | 8 | `packages/flow` | CTX-01 수급 주체·연속성. 순수 함수 — **`LAB-09` 진입 조건 재료** |
| `ctx-structure/` | 6 | `packages/structure` | CTX-02 가격·거래량 구조 판정. 순수 함수 — `LAB-04`·`LAB-06` 이 지표로 쓸 수 있다 |
| `ctx-materials/` | 5 | `packages/materials` | CTX-03 재료 수집 타입(filing·earnings·news·market) |
| `ctx-background/` | 6 | `packages/background` | CTX-05 문안 금지어 사전 |

---

## 끊긴 참조 — `LAB-09` 가 알아야 할 것

`LAB-01` PART A-2 가 지목한 **카드 생성 로직은 제거**했다. 격리분 일부가 그것을 import 하므로,
되살릴 때 그 자리에서 컴파일 오류가 난다. **의도한 결과다** — 되살릴 것은 신호이고 덱이 아니다.

제거된 것 중 격리분이 참조하는 것:

| 제거된 파일 | 무엇이었나 |
|---|---|
| `apps/web/lib/card-axis.ts` · `card-headline.ts` | 카드 축·헤드라인 조립 |
| `apps/web/lib/card-slots/payload.ts` · `coverage.ts` | 카드 슬롯 페이로드 |
| `apps/web/lib/deck-content.ts` · `deck-ranking.ts` · `deck-rotation-report.ts` | 덱 구성·정렬·회전 |
| `apps/web/lib/copy-guards.ts` · `content-i18n.ts` | 문안 가드·다국어 |
| `apps/web/lib/fomo-comment.ts` · `fomo-keyword-comment.ts` · `fomo-chart-cards.ts` | 카드 코멘트·차트 카드 |
| `apps/web/lib/discovery-route-policy.ts` · `ux-telemetry.ts` | 발견 라우팅·카드 UX 계측 |

**`LAB-09` 는 검출기 함수를 직접 호출한다.** 카드 파이프라인을 거치지 않으므로 위 파일들이
필요하지 않다. 필요해지면 그건 카드를 되살리는 것이고, 그건 `LAB-09` 가 아니다.

---

## 되살리는 절차

1. `package.json` 의 `workspaces` 에 대상 패키지를 추가한다 — **전부가 아니라 필요한 것만.**
2. `vitest.config.ts` 의 `exclude` 를 좁힌다.
3. 되살린 파일이 참조하는 제거분(위 표)을 끊고, 검출기 함수만 남긴다.
4. `web/__tests__/` 의 해당 테스트를 같이 되살려 **이식 전후 결과가 같은지** 확인한다.

`LAB-00` §5 실측 주의와 같은 이야기다 — 옮기는 것 자체가 결함이 들어오는 경로다.

---

## 중단한 Vercel 크론 (A-3)

`apps/web/vercel.json` 의 `crons` 배열 10건을 제거했다. **라우트 파일은 위 `web/app/api/fomo/cron/` 에 그대로 있다** —
되살릴 때 이 스케줄을 그대로 다시 넣으면 된다.

| 경로 | 스케줄 (UTC) |
|---|---|
| `/api/fomo/cron/daily-30/trading` | `0 21 * * *` |
| `/api/fomo/cron/daily-30/financial` | `10 21 * * *` |
| `/api/fomo/cron/daily-30/editor` | `20 21 * * *` |
| `/api/fomo/cron/quiet-pick` | `25 21 * * *` |
| `/api/fomo/cron/quality-slo` | `30 21 * * *` |
| `/api/fomo/cron/ledger-outcomes` | `40 21 * * *` |
| `/api/fomo/cron/business-invalidation` | `50 21 * * *` |
| `/api/fomo/cron/fundamentals` | `45 21 * * *` |
| `/api/fomo/cron/business-context` | `55 21 * * *` |
| `/api/fomo/cron/signal-stats` | `0 21 1 * *` |

> **`vercel.json` 에 메모를 남기지 말 것.** 처음엔 `_lab01` 키로 이 설명을 그 파일에 적었는데
> Vercel 스키마가 알 수 없는 속성을 거부해 배포가 통째로 실패했다
> (`should NOT have additional property '_lab01'`). JSON 이라 주석도 못 넣는다.
> 그래서 설명은 여기 둔다.
