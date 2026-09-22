# FCE 인벤토리 — 랩이 다시 만들지 않을 것들

| | |
|---|---|
| **근거** | `LAB-BRIDGE` PART A |
| **날짜** | 2026-09-19 |
| **읽은 것** | `mlender-ai/fomo-control-engine` @ `6319efc` (공개 · 읽기 전용 클론) |
| **규모** | 파이썬 416파일 · `backend/app` 아래 30여 모듈 |

> **LAB 은 엔진을 갖지 않는다.** 여기 있는 것은 전부 FCE 가 이미 하고 있고,
> 랩은 읽어서 보여주기만 한다.

---

## 0. 랩이 FCE 를 다시 만들고 있었다

| LAB | FCE | |
|---|---|---|
| 고래 추종 v1 · **거래 0 · 데이터 없음** | 고래 추종 트랙 · **N=74 운용중** | 같은 아이디어를 랩이 빈손으로 다시 지었다 |
| 추세 스윙 v1 · 거래 80 · C/M 0.30 | 크립토 트랙 · N=136 | |
| 페이퍼 실행기(LAB-07) | `backend/app/paper/` | 체결·청산·리스크 전부 |
| 백테스트 엔진(LAB-04) | `backend/app/backtest/` | |

랩의 고래 전략이 "데이터 없음" 인 이유는 Hyperliquid 가 과거 이력을 안 주기 때문인데,
**FCE 는 수집을 계속 돌려서 74건을 쌓았다.** 랩이 못 한 게 아니라 안 해도 될 일이었다.

---

## 1. 트랙 다섯

| 트랙 | 자본 | 상태 |
|---|---|---|
| 크립토 | 500 USDT | 운용중 |
| 고래 추종 | 500 USDT | 운용중 |
| 주식 US | 100,000 USD | **⛔ 정지** — 체결 invariant |
| 주식 KR | 100,000,000 KRW | **⚠ 큐 보류** |
| 폴리마켓 | 10,000 USDC | **⛔ 제외** — 451 지역 차단 |

전부 **페이퍼다. 실주문 없다.**

---

## 2. FCE 가 이미 만든 것

| 항목 | 어디에 |
|---|---|
| 페이퍼 체결·출구 판정 | `backend/app/paper/policy.py` — `evaluate_exit` · `apply_exit_decision` |
| 진입 게이트 12종 | `backend/app/paper/service.py` — 하나라도 실패하면 진입 안 함 |
| 포지션 시뮬레이션 | `backend/app/positions/simulator.py` — 청산가 추정·RR·체크리스트 |
| 고래 추종 | `backend/app/paper/whale_follow.py` |
| 고래 청산 반사실 | `backend/app/paper/whale_exit_replay.py` |
| 지갑 자격 심사 | `GET /onchain/whales/follow-eligibility` |
| 주식 페이퍼 | `backend/app/stock_paper/` — 브로커·큐·invariant |
| 일일 계좌 리포트 | `backend/app/notify/daily_report.py` + `daily_report_source.py` |
| 성과 재계산 | `backend/app/review/paper_performance.py` · `loss_attribution.py` |

### 진입 게이트 12종 (`service.py:1486`)

```
confirmed_flip · evidence · checklist · invalidation_hygiene · risk_reward
liquidation_safety · action_levels · signature_gate · regime_gate
event_window · freshness · capacity
```

`if not all(gates.values())` — **하나라도 실패하면 진입하지 않는다.**

---

## 3. 청산 모델링 — **없다** (PART D-1)

`evaluate_exit` 이 낼 수 있는 출구 사유 전부:

```
invalidation_breach · breakeven_stop · take_profit_1 · take_profit_2
opposite_stance_flip · take_profit_pressure · time_decay
```

**청산(liquidation) 분기가 없다.** 유지증거금을 보는 코드도 없다.

그리고 손익률이 증거금 기준이다:

```python
"net_return_pct": (net / trade.margin_usdt) * 100.0
```

10배에서 −10.8% 역행이면 **−108%** 가 되고, 아무것도 그걸 막지 않는다.
`NEARUSDT 숏 10x · −108.55% · 포지션 살아 있음` 이 그래서 나온다.

### FCE 도 이걸 절반은 알고 있다

`positions/simulator.py` 가 진입 시점에 청산가를 추정한다:

```
estimated_liquidation          entry × (1 ∓ 1/lev ± MMR ± 수수료버퍼)
survives_to_invalidation       무효선까지 살아남나
liquidation_safety             위 판정을 게이트로 씀
```

**하지만 그건 진입 전 심사일 뿐, 보유 중 판정이 아니다.** 게이트는 "무효선까지" 만
보장하고, 갭으로 무효선을 건너뛰거나 부분청산 뒤 손절선이 옮겨지면 보장이 깨진다.

> **청산이 없으면 페이퍼 성과는 실전보다 무조건 좋게 나온다.**
> 실제로는 증거금이 날아가 끝났을 포지션이 페이퍼에서는 되돌아와 이길 수 있다.

### 실측으로는 아직 안 터졌다 — **3배라서다**

청산된 거래 141건 중 −100% 이하는 **0건**이고, 최악이 −53.22%(SPCXUSDT ·
`invalidation_breach`)다. 3배에서는 손절이 청산보다 먼저 걸린다.

> **지금 안전한 게 아니라 배수가 낮아서 안 드러난 것이다.** 배수를 올리는 순간 드러난다.
> 화면은 손익 −90% 아래 포지션에 `⚠ 청산 수준` 을 단다(`/live`).

---

## 4. 레버리지 (PART D-2)

```python
paper_leverage: float = Field(3.0, validation_alias=("FCE_PAPER_LEVERAGE", "PAPER_LEVERAGE"))
paper_margin_usdt: float = Field(100.0, ...)
paper_max_open_positions: int = Field(5, ...)
```

**기본값은 3배이고, 실측도 3배다.**

> ⚠️ **정정.** 처음에는 "화면의 10배는 환경변수 override" 라고 적었다. **추론이었고 틀렸다** —
> API 를 열어보니 보유 5건·청산 141건이 **전부 `lev=3.0`** 이다. 지시서의 10배와
> `NEARUSDT −108.55%` 는 예전 리포트의 값이다.

그래도 **배수를 화면에 띄운다.** 환경변수로 덮이는 값이라 레포만 봐서는 알 수 없고,
MDD 도 배수에서 나온 숫자다 — 안 적으면 낙폭이 전략 탓으로 읽힌다.
`fce-upload` 는 설정값이 아니라 **열려 있는 포지션이 실제로 쓰는 배수**를 올린다.

### 1배 트랙 (PART D-2 ③) — **지금 만들면 아무것도 안 나온다**

지시서는 "1배 트랙을 하나 만들어 비교한다" 였다. 만들기 전에 **무엇이 달라지는지**
계산했다. 닫힌 거래 147건 실측:

```
손익률(증거금대비)  ≈  가격변동%  ×  레버리지  −  비용
비용(수수료·펀딩비)  ∝  명목  =  증거금 × 레버리지
```

총손익도 비용도 명목에 비례하므로 **1배는 정확히 1/3 스케일**이다:

| | 3배 | 1배 |
|---|---|---|
| 손익 · MDD | 기준 | **1/3** |
| 승률 · PF | 기준 | **완전히 같다** |

순손익의 **부호가 바뀌는 거래가 하나도 없다.** 승률도 손익비도 소수점까지 같다.

> **청산 모델이 없는 한 레버리지는 순수한 배율이다.**

3배가 1배와 **질적으로** 달라지는 유일한 지점은 3배가 청산당하는 자리인데,
FCE 에 그 분기가 없다(§3). 지금 1배 트랙을 세우면 나눗셈을 두 번 하는 것이고,
**둘 다 똑같이 좋아 보인다.**

그래서 순서를 뒤집는다: **D-1(청산 모델링)이 먼저고, 1배 비교는 그 다음이다.**
그때는 3배가 죽고 1배가 살아남는 거래가 생기고, 그게 재고 싶었던 차이다.

---

## 5. 주식 두 트랙이 멈춘 이유 — **뿌리가 하나다** (PART F)

### US — `fill_price_outside_observed_range`

`stock_paper/broker.py:63` 이 트랙을 정지시킨다. 알려진 기전은 **봉 불일치**:

> 체결가는 **세션 시가**로 만들고 invariant 는 **현재 분봉**으로 검사한다
> — `core/config.py:201`

서로 다른 봉을 비교하니 체결가가 "관측 범위 밖" 으로 나온다.
**invariant 가 틀린 게 아니라 비교 대상이 틀렸다.** 정지한 것은 옳은 동작이다.

### KR — 큐 보류 13,940건

`stock_paper_hold_queued_orders` 를 켜서 주문을 체결하지 않고 쌓아둔다.

> 체결가는 세션 시가에서 만들고 invariant 는 현재 분봉으로 검사한다 — 봉 불일치로
> US 가 정지했다. **임시 방어이며 근본 수리는 별건이다.** — `stock_paper/service.py:350`

즉 **KR 은 같은 버그를 밟지 않으려고 미리 멈춰 선 것**이다.

> 둘은 다른 고장이 아니다. **봉 불일치 하나를 고치면 둘 다 풀린다.**

---

## 6. 폴리마켓 · 펀딩비

| 항목 | 상태 |
|---|---|
| 폴리마켓 | 451 지역 차단 · 평가 불가 포지션 1,583.12 USDC → **NAV 미산출** |
| 펀딩비 | `fapi.binance.com` HTTP 451 — **대체 소스가 아니라 실행 위치 문제였다**(아래) |

펀딩비 없이 무기한 선물 성과를 내면 **보유 비용이 빠진 숫자**가 된다.

### 펀딩비 — 대체 소스를 찾을 일이 아니었다 (PART F-4)

지시서는 "대체 소스를 찾는다" 였다. 찾기 전에 **어디서 451 이 나는지**부터 쟀다:

| 어디서 | 결과 |
|---|---|
| GitHub Actions 러너 (미국 IP) | **451** |
| 이 맥 | **200** — 27행 정상 수신 |

**호스트 위치 문제다.** 현물로 대체하면 다른 데이터를 섞는 것이라 안 했고, 그럴
필요도 없었다. 수집을 로컬 러너로 옮겨서 풀었다(`docs/lab/CRON.md` §0-3).
`lab-collect` 의 펀딩비 크론은 껐다 — 거기서는 구조적으로 안 되는 일이다.

---

## 7. 랩이 가져올 것 (PART B 입력)

| 항목 | 출처 | 주기 |
|---|---|---|
| 트랙별 자본·실현·미실현 | `daily_report_source.py` 가 조립하는 것과 같은 재료 | 15분 |
| 트랙 지표 N·승률·PF·MDD | `review/paper_performance.py` | 15분 |
| 트랙 상태 + 사유 | `stop_track` · `queue_hold_reason` | 15분 |
| 포지션 목록 + 건강도 | `positions/` | 15분 |
| 거래 이력 | `paper_trades` | 발생 시 |
| 지갑 자격 | `GET /onchain/whales/follow-eligibility` | 1시간 |
| 갭·반사실 | `whale_exit_replay.py` | 1시간 |

**계산하지 않는다 — 조립한다.** FCE 리포트가 스스로에게 건 규칙이고, 랩도 같다.

---

## 8. 유효일 — 달력 48일에 유효 3일 (PART D-3 · 완료확인 12)

`caffeinate -dimsu` 는 돌고 있고 **유효일이 0일에서 늘기 시작했다.** 다만:

| 트랙 | 유효일 | 달력일 | 유실 |
|---|---|---|---|
| 주식 (하나) | **3** | 48 | 45 |
| 주식 (다른 하나) | **2** | 49 | 47 |

**늘긴 했지만 94% 를 잃고 있다.** `caffeinate` 는 절전을 막을 뿐, 그 전에 맥이
꺼져 있거나 프로세스가 죽어 있던 시간은 못 되살린다.

이 값을 전광판 `유효일` 칸에 띄운다. 안 띄우면 위의 수익률·MDD·승률이 **두 달치
성과로 읽힌다.** 실제로는 3일치다.

> 근본 해결은 FCE 를 서버로 옮기는 것이다(지시서 B-4 "중기" · `LAB-00` 6단계).
