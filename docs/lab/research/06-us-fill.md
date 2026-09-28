---
no: "06"
title: 주식 US 체결 가격 이상은 왜 생기나
status: open
summary: 재개했다 — US 첫 체결이 검사를 통과했다
opened_at: 2026-09-21
tracks: [stock_us, stock_kr]
---

## 왜 궁금한가

주식 US 트랙이 `체결 가격 이상` 으로 멈췄고, 주식 KR 은 같은 일을 피하려고 대기 주문 13,940건을 보류했다.
주식 두 트랙이 서 있으면 주식 쪽 질문([[07]])은 표본이 생기지 않는다.

## 가설

1. 검사(invariant)가 틀린 게 아니라 **비교 대상이 틀렸다**
2. US 정지와 KR 보류는 같은 원인이다

## 어떻게 확인하나

1. FCE 가 정지시키는 자리와 체결가를 만드는 자리를 나란히 읽는다

## 지금까지 알아낸 것

- ✓ 체결가는 **세션 시가**로 만들고, 검사는 **현재 분봉**과 비교한다 — 봉이 다르다 | FCE `stock_paper/broker.py:63` · `core/config.py:201`
  → 가설 1 확인. 정지는 옳은 동작이다 — 검사가 제 일을 했다.
- ✓ KR 보류 13,940건은 같은 버그를 밟지 않으려고 미리 멈춘 것 | FCE `stock_paper/service.py:350`
  → 가설 2 확인. 봉 불일치 하나를 고치면 둘 다 풀린다.
- ✓ 수리는 이미 들어가 있다 — 체결가를 **현재 분봉 종가**로 만들고 스프레드를 얹은 값을 봉 안으로 자른다. 돌고 있는 엔진(09-19 기동)이 그 코드다 | FCE `de609317` (08-31) · `stock_paper/execution.py`
  → 원인 수정 배포(OPS-02 D-1)는 끝나 있었다. 정지가 풀리지 않은 건 정지가 **수동 해제**이기 때문이다(FCE RESTART_RUNBOOK).
- ✓ 과거 체결 14건을 지금 모형으로 다시 돌리면 위반 10 → 1. US 는 0 | LAB `scripts/ops/stock-fill-audit.py` (09-29)
  → 기록된 위반 10건은 전부 수리 전 체결이고 1틱 안팎 — 스프레드 · 올림이 봉 밖으로 민 것이다.
- ✓ 남은 1건은 KR 005930 07-22 — 봉이 260,750 한 값인데 FCE 틱 표(20만~50만 = 500원)에 없는 값이다. 1분봉 종가의 1~10% 가 격자 절반에 찍힌다 | FCE `toss_candles` 1m · `execution.py` `krx_tick_size`
  → 1틱보다 좁은 봉에서 체결하면 KR 이 다시 정지할 수 있다. 격자 밖 값이 왜 나오는지 모른다 — 추측으로 고치지 않는다.
- ✓ **지금 주식 두 트랙을 막는 것은 시세다** — 토스 OpenAPI 토큰 발급이 `403 IP address not allowed`. 시세 마지막 관측 08-14 | FCE `/api/system/toss/auth-diagnosis` (09-29) · `toss_quotes`
  → 이게 풀리기 전에는 US 를 재개해도 · KR 이 running 이어도 체결이 없다.
- ✓ KR 대기 13,940건은 **2종목(035420 · 009150) 시간 청산 매도가 틱마다 새 주문으로 쌓인 것**. US 1,971건은 NVDA 하나 | FCE `stock_paper_orders` (09-29)
  → 과거 신호다 — 체결하지 않고 폐기한다(`cancelled` · 사유 `cancelled_stale` · 스냅샷 보존). 중복 생성은 `de609317` 이 막았다.
- ✓ **재개 (09-29 00:49 KST)** — 토스 IP 허용 · 대기 15,911건 폐기 · US `running`. 재개 직후 US NVDA 매도 229.56 이 invariant 통과 · 정지 없음 | FCE `stock_paper_fills` · `stock_paper_tracks`
  → US 정지의 원인(봉 불일치)은 수리로 풀렸다. KR 은 09-29 09:00 개장 첫 체결로 확인한다.
- ✓ 휴장 달력은 FCE 에 있다. 추석(09-24·25) · 개천절 대체(10-05) 등은 `확인 필요` 로 남아 유효일 분모에 섞인다 | FCE `worker/market_calendar.py`
  → 09-29 확정으로 옮겼다 — KRX 2026 목록 두 곳과 대조 · 9일. 6/3 은 확인 필요 유지(FCE #37).

## 결정

아직 닫지 않는다 — 재개 뒤 첫 체결이 invariant 를 통과해야 닫는다(OPS-02).
그 전까지 주식 트랙 성적을 전략 판단에 쓰지 않는다 — 전략 탭은 `정지` · `보류` 로만 둔다.
재개 순서: 토스 IP 허용 → 대기 주문 폐기 → US 재개 → 24시간 재발 0 → KR 큐 보류 해제(`docs/ops/OPS-02.md`).

## 관련

- 트랙 | 주식 US · 주식 KR
- 연구 | 07 FOMO Club 신호 8종에 청산 규칙을 붙이면 알파가 있나
- 화면 | /strategies/stock_us

## 근거

- 정지 지점 | `stock_paper/broker.py:63` | FCE
- 체결가 출처 | 세션 시가 | `core/config.py:201`
- KR 큐 보류 | 13,940건 | `stock_paper/service.py:350`
- 수리 커밋 | 08-31 | FCE `de609317`
- 재검사 (지금 모형) | 14건 중 위반 1 (KR 005930 · 틱 격자) | LAB `stock-fill-audit.py`
- 시세 차단 | 403 IP address not allowed | FCE auth-diagnosis
- 대기 주문 | KR 13,940 · US 1,971 (3종목 청산 매도) → cancelled_stale | FCE `stock_paper_orders`
- 재개 뒤 첫 체결 | US NVDA 매도 229.56 · 통과 | FCE `stock_paper_fills` 09-28 15:49 UTC
