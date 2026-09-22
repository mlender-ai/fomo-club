# UI-02 A-1 — FCE UI 가 무엇을 읽나

| | |
|---|---|
| **근거** | `UI-02` PART A-1 · 보고할 것 ① |
| **실측일** | 2026-09-23 |
| **FCE** | `/Users/cocteau/Documents/Fomo club engine` · API `127.0.0.1:8875` · UI `:8876` |

---

## 0. 결론 — 화면이 그리는 건 전부 가져올 수 있다. **자본 시계열만 빼고.**

```
FCE UI 탭 10개 · API 호출 60종     →  전부 HTTP 로 읽힌다
자본 시계열                        →  **FCE 에 없다.** 재구성한다 (§3)
```

---

## 1. FCE UI 탭과 출처

| UI 경로 | 주로 읽는 API |
|---|---|
| `/` | `/api/paper/dashboard` · `/api/market/summary` · `/api/system/status` |
| `/dashboard/[symbol]` | `/api/positions` · `/api/liq/heatmap` · `/api/backtest/stance` |
| `/engine` | `/api/system/worker` · `/api/engine` 계열 |
| `/performance` | `/api/performance` · `/api/paper/dashboard` |
| `/review` | `/api/review/calibration` · `/api/review/signatures/…` |
| `/scout` | `/api/scout/*` (11종) |
| `/trades`, `/trades/[id]` | `/api/trades` · `/api/trades/{id}` · `/api/paper/trades` |
| `/validation` | `/api/validation/runs` |
| `/settings` | `/api/alerts/settings` · `/api/system/*` |

## 2. 랩 여섯 탭이 쓸 출처

| 랩 탭 | FCE 출처 | 상태 |
|---|---|---|
| Overview | 트랙 자본·시작 자본·벤치마크 | 현재값은 있음 · **시계열 없음** |
| 전략 | `/api/paper/dashboard` · `/api/stock-paper/dashboard` · `/api/poly-paper/dashboard` | ✅ 이미 브리지에 있음 |
| 포지션 | `/api/live/positions` · `/api/live/positions/{id}` (`/deepdive` `/insight` `/snapshots` `/pattern-matrix` `/events` `/chart-analysis`) | ✅ |
| 고래 | `/api/onchain/whales` · `/api/onchain/follow/trades` · `/follow/eligibility` | ✅ 이미 브리지에 있음 |
| 연구 | — | ❌ **랩이 만든다** |
| 복기 | `/api/paper/trades` · `/api/trades/{id}` (`/review` `/timeline`) | ✅ 트랙 지표·거래는 이미 있음 |

---

## 3. 자본 시계열 — **FCE 에 없다**

라이브 DB(`backend/fomo_control_engine.db` · 5.7GB · 80 테이블)를 전부 훑었다.

```
equity · capital · nav · balance · scoreboard 이름이 붙은 테이블  →  0개
```

가장 가까운 것들도 시계열이 아니다:

| 테이블 | 실제 내용 |
|---|---|
| `stock_paper_marks` (3,547행) | **가격** 관측치. 자본이 아니다 |
| `stock_paper_tracks` · `poly_paper_track` | **현재 `cash` 한 값.** 이력 없음 |
| `paper_engine_states` (58행) | 심볼·타임프레임별 엔진 상태 |
| `validation_windows` | **0행** |

> 트랙 테이블은 `cash` 를 **덮어쓴다.** 어제 얼마였는지는 아무 데도 없다.

### 그래서 재구성한다 (UI-02 B-2 ③)

거래 이력의 **실현 손익을 누적**해 자본 곡선을 되만든다. 재료는 있다:

| 트랙 | 테이블 | 건수 | 기간 |
|---|---|---|---|
| 크립토 | `paper_trades` | 152 | 2026-07-13 ~ 09-22 (**72일**) |
| 고래 추종 | `whale_follow_trades` | 86 | `exit_at` 있음 |
| 주식 US·KR | `stock_paper_fills` | 14 | 07-22 ~ 08-14 (이후 정지) |
| 폴리마켓 | `poly_fills` | 9 | |

### 재구성이 실측과 다른 점 — **화면이 말해야 한다**

| | |
|---|---|
| **미실현이 빠진다** | 실현 손익만 누적한다. 보유 중 평가손익은 곡선에 없다 |
| 계단이 된다 | 거래가 닫히는 순간에만 값이 변한다. 실제 자산은 그 사이에도 움직였다 |
| 정지 구간이 평평하다 | 주식 US·KR 은 08-14 이후 체결이 없어 직선이다 |

그래서 `FceCapitalPoint.source` 에 `reconstructed` 를 박고, 차트가 그 사실을
띄운다(UI-02 B-2 ④).

---

## 4. 통신

`UI-02 B-3` 은 `FCE → LAB POST /api/lab/ingest/{kind}` 를 적었다.
**실제로는 반대 방향으로 이미 돌고 있다** — 랩의 업로더가 FCE 를 읽어 올린다:

```
scripts/lab/fce-upload.ts  ──읽기──▶  FCE API (127.0.0.1:8875)
                           ──쓰기──▶  POST /api/lab/fce  (LAB_INGEST_TOKEN)
```

`LAB-BRIDGE` 에서 그렇게 정한 이유는 그대로다 — **FCE 레포를 건드릴 일이 하나
줄어든다.** 인증 토큰은 `AUDIT_TOKEN` 이 아니라 `LAB_INGEST_TOKEN` 하나를 쓴다.
`UI-02` 가 "새로 만들지 않고 확장한다" 고 했으므로 이 방향을 유지한다.

실패는 큐에 쌓지 않고 **`CollectionRun` 에 기록하고 다음 주기에 다시 시도**한다.
주기가 30초~1시간이라 큐가 할 일을 다음 주기가 한다.
