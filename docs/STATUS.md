# 현재 상태

> **이 파일 하나만 읽으면 현재 상태를 알 수 있어야 한다.** 다음 세션은 여기서 시작한다.
> 문서 기록이 아니라 **실측**을 적는다. 확인 안 한 것은 `미확인` 으로 남긴다 — 추정으로 메우지 않는다.
> 갱신 책임: **매 LAB 지시서 완료 시 이 파일을 갱신**한다.

| 항목 | 값 |
|---|---|
| 최종 갱신 | **2026-09-11** · `LAB-02` 데이터 모델 완료 (프로덕션 적재만 대기) |
| 제품 | **STRATEGY LAB** — 전략 경쟁 랩. 사용자 1명 · BM 없음 · 최종 목표 실제 자금 자동매매 |
| 정본 | `docs/LAB-00_MASTER.md` |
| 옛 상태 문서 | `docs/wo/archive/STATUS_pre-LAB.md` (틴더 제품 기준 3,499줄) |

---

## 진행

```
LAB-01 ✅ → LAB-02 → LAB-03 → LAB-04 ─┬→ LAB-05
                                      └→ LAB-06 → LAB-07 → LAB-08 → LAB-09
```

| ID | 제목 | 상태 |
|---|---|---|
| `LAB-01` | 정리 — 버릴 것 걷어내기 | ✅ 2026-09-11 |
| `LAB-02` | 데이터 모델 | ✅ 2026-09-11 · **프로덕션 마이그레이션은 미실행** (아래 참조) |
| `LAB-03` | 크립토 데이터 수집 | 대기. 시작 전 **거래소·대상 종목**을 정해야 한다(`LAB-00` §9) |
| `LAB-04` | 백테스트 엔진 이식 | 대기 |
| `LAB-05` | 백테스트 화면 | 대기 — **1차 목표.** 여기서 알파가 안 나오면 그 뒤는 의미가 없다 |
| `LAB-06` | 전략 정의 + 초기 3종 | 대기. 시작 전 **가상 자본 규모** 결정 |
| `LAB-07` | 페이퍼 실행기 | 대기. 시작 전 **업로드 주기** 결정 |
| `LAB-08` | 전광판·상세 화면 | 대기 |
| `LAB-09` | 주식 신호를 전략으로 | 대기 — `packages/dormant/` 를 되살린다 |

---

## 지금 실제로 있는 것

### 화면 — 셋뿐이다

| 경로 | 무엇 | 지금 상태 |
|---|---|---|
| `/` | 백테스트 (기본) | `아직 데이터가 없습니다.` |
| `/live` | 전광판 | `아직 데이터가 없습니다.` |
| `/strategy/[id]` | 전략 상세 | `아직 데이터가 없습니다.` |

`LAB-05` 까지 이 상태로 둔다.

### 엔진 — `apps/api` 에 이미 있다

`LAB-00` 부록 B 결정대로 **`apps/api` 를 되살려 확장**한다. 2026-06-22 이후 방치됐던 것이다.

| 있는 것 | 파일 |
|---|---|
| 페이퍼 체결 | `src/domain/broker/paperBroker.ts` |
| 주문 실행 | `src/domain/execution/tradeExecutor.ts` · `tradeFilter.ts` |
| 수수료 모델 | `src/domain/execution/feeModel.ts` |
| 전략 평가 | `src/domain/strategy/strategyEvaluator.ts` |
| 워커 | `src/worker/strategyWorker.ts` |
| 지표 | `src/domain/indicators/indicatorEngine.ts` |
| 시세 수집 | `src/domain/exchange/adapters/binancePublicMarketDataAdapter.ts` |

**미확인 — `LAB-04` 전에 감사해야 한다:** 체결 가정(슬리피지·수수료·주문 역할)이 어떤 전제로
박혀 있는지 아직 읽지 않았다. `LAB-00` §5 가 페이퍼 체결 로직에 "체결 가정 확인 필요"를 달아둔
항목이고, 이건 FCE 가 아니라 **우리 레포에 이미 있는 코드** 쪽 문제다. 갈라지면 백테스트와
페이퍼 숫자를 비교할 수 없다.

### 없는 것 — 새로 지어야 한다

| 없는 것 | 어느 지시서 |
|---|---|
| OHLCV 백테스트 엔진 + 워크포워드 | `LAB-04` |
| Hyperliquid 수집 (검색 결과 0건) | `LAB-03` |
| 재진입 잠금 | `LAB-04`·`LAB-07` |
| 백테스트 결과 표 · 자산곡선 | `LAB-05` |
| 전광판 표 | `LAB-08` |

### 데이터 모델 — 대부분 이미 있다

`prisma/schema.prisma` 에 `Bot`(`paperBalance` · `maker/takerFeeRate` · `slippageBps` ·
`entry/exitOrderRole`) · `Strategy`(`config Json` = 선언적) · `StrategySession`(`configSnapshot`) ·
`StrategyRun` · `Position` · `Trade` · `MarketCandle` 이 있다. `LAB-02` 는 새로 짓는 것이
아니라 **전환**이다.

`packages/lab/src/stats.ts` 는 `LAB-00` §7 의 두 규칙을 이미 타입으로 강제한다 —
`MIN_SAMPLE = 30`, `Provenance = "ledger" | "backtest"`(합산이 컴파일 단계에서 막힌다).

---

## `LAB-01` 실측 (2026-09-11)

### 번들

| 항목 | 전 | 후 | 변화 |
|---|---|---|---|
| 빌드 산출물 전체 | 190,660 KB | 71,668 KB | **−118,992 KB (−62.4%)** |
| 서버 번들 | 8,848 KB | 1,564 KB | **−7,284 KB (−82.3%)** |
| 정적 번들 | 1,444 KB | 996 KB | −448 KB (−31.0%) |
| 라우트 JS 파일 | 210 | 38 | **−172 (−81.9%)** |

측정: `rm -rf apps/web/.next-build && npm run build:web` 후 `du -sk`.

### 파일

| 처리 | 파일 수 |
|---|---|
| 격리 (`packages/dormant/`) | **644** |
| 제거 | **277** (`apps/fomo-web` 199 · `apps/fomo-club` 32 · 화면·카드 생성·옛 조직 46) |
| 유지 (`apps/web` 의 `.ts`·`.tsx`) | 81 |

### 크론

| 처리 | 수 |
|---|---|
| GitHub Actions 자동 트리거 제거 | 66 (`ci.yml` 만 남았다) |
| Vercel 크론 제거 | 10 |
| 크론 라우트 격리 (파일은 남겼다) | 22 |

### 게이트

| 항목 | 상태 |
|---|---|
| `npm run lint` | ✅ 4 워크스페이스 |
| `npm run typecheck` | ✅ 4 워크스페이스 · 0 오류 |
| `npm test` | ✅ 8 파일 · 84 건 |
| `npm ci` | ✅ 305 패키지 · 감사 대상 310개 (전 1,000+) |
| `npm run build` | ✅ |
| CI 게이트 변경 | `perf-regression-gate` · `invariants-render` 제거(카드 렌더 대상), `build-fomo-web` 잡 제거(워크스페이스 없음) |
| 배포 확인 | ✅ `6f68792` · `fomo-club-backend.vercel.app` — `/` · `/live` · `/strategy/[id]` 200, `/ticker/*` · `/sector/*` · `/admin` · 카드 API 전부 404 |

`vercel.json` 에 메모 키(`_lab01`)를 남겨 배포가 한 번 깨졌다. Vercel 은 알 수 없는
속성을 거부하고 JSON 이라 주석도 못 넣는다. **로컬 게이트로는 잡을 수 없다** —
lint·typecheck·test·build 와 깨끗한 클론 재현까지 전부 초록이었다. 설명은
`docs/lab/DORMANT.md` 로 옮겼다(`7372efa`).

---

## `LAB-02` 실측 (2026-09-11)

상세는 `docs/lab/DATA_MODEL.md`. 다이어그램도 거기 있다.

### 스키마

| 항목 | 값 |
|---|---|
| 새 테이블 | **6** — `Strategy` · `Run` · `Trade` · `Equity` · `Metric` · `Benchmark` |
| 새 enum | 5 — `Market` · `StrategyState` · `RunKind` · `TradeSide` · `ExitReason` |
| 개명 | `Strategy` → `LegacyStrategy`, `Trade` → `LegacyTrade` (**데이터 그대로**, `ALTER TABLE RENAME`) |
| 마이그레이션의 `DROP` 문 | **0** |
| 고친 호출부 | `apps/api` 9파일 18곳 (`prisma.strategy` → `prisma.legacyStrategy` 등) |

`Run.kind` 가 `BACKTEST` · `PAPER` · `LIVE` · `LEGACY` 를 가른다. **백테스트와 페이퍼가
같은 테이블에 쌓인다**(§0).

### 게이트

| 항목 | 결과 |
|---|---|
| `npm run lab:migrate:verify` | ✅ **9/9** — 적용 → 데이터 → 롤백 → **레거시 살아남음** → 재적용 |
| `npm run lab:verify-store` | ✅ **5/5** — `stop_pct` 없으면 저장 거부, 거부 후 행 안 늘어남 |
| `npm test` | ✅ 9파일 · **106건** (LAB-01 84건 → 전략 정의 검증 22건 신규) |
| `npm run lint` · `typecheck` · `build` | ✅ |
| `npm ci` | ✅ |

### 적재 (로컬 검증용 DB)

| 테이블 | 행 |
|---|---|
| `Benchmark` (BTC 일봉) | **1,200** — 2023-05-30 ~ 2026-09-10, **빠진 날 없음** |
| `Run` (`kind=LEGACY`) | 6 — 자산 2종 × 창 3개(7·30·90일) |
| `Trade` | 9 (보유중 6) |
| `JudgmentLedger` | 7 — **불변.** 읽기만 했다 |

### ⚠️ 프로덕션은 아직 아니다

| 막힌 것 | 왜 |
|---|---|
| 프로덕션 마이그레이션 | `DATABASE_URL` 이 없다. `.env` 에도 없고 Vercel 토큰도 없다 |
| **판단 원장 이전 건수 = 0** | 실제 원장은 프로덕션에 있다. 위 9건은 **프로덕션과 같은 모양의 합성 행**으로 스크립트를 검증한 것이다 |
| 프로덕션 벤치마크 적재 | 같은 이유 |

`docs/lab/DATA_MODEL.md` 의 "마이그레이션 · 롤백" 절에 프로덕션 적용 순서가 있다.
**`0_init` 은 적용하지 말고 적용된 것으로 표시해야 한다** — 프로덕션에는 이미 그 38개
테이블이 서 있다.

---

## 사람이 해야 할 것

| 항목 | 왜 |
|---|---|
| GitHub 레포 description 수정 | `LAB-01` PART E — 에이전트가 못 바꾼다 |
| `fomo-web-mlender-ais-projects.vercel.app` 처분 | `apps/fomo-web` 을 제거했으므로 이 배포는 더 이상 갱신되지 않는다. 랩은 `fomo-club-backend.vercel.app` 이다 |
| **`DATABASE_URL` 전달 또는 직접 마이그레이션** | `LAB-02` 를 프로덕션에 적재하려면 필요하다. 판단 원장 이전 건수도 그때 나온다 |
| `LAB-03` 지시서 | 다음 단계. 시작 전 **거래소·대상 종목**을 정해야 한다(LAB-00 §9) |
