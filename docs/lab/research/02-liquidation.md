---
no: "02"
title: 강제청산을 넣으면 성과가 얼마나 바뀌나
status: blocked
summary: FCE 페이퍼 체결기에 청산 분기가 없다 — 이게 실매매를 막고 있다
opened_at: 2026-09-21
tracks: [crypto, whale]
blocks: 실매매
---

## 가설

청산이 없으면 페이퍼 성과는 실전보다 **무조건** 좋게 나온다. 실제로는 증거금이
날아가 끝났을 포지션이 페이퍼에서는 되돌아와 이길 수 있다.

## 어떻게 확인하나

`evaluate_exit` 이 낼 수 있는 출구 사유를 전부 세어봤다:

```
invalidation_breach · breakeven_stop · take_profit_1 · take_profit_2
opposite_stance_flip · take_profit_pressure · time_decay
```

**청산 분기가 없다.** 유지증거금을 보는 코드도 없다. 손익률이 증거금 기준이라
10배에서 −10.8% 역행이면 −108% 가 되고 아무것도 그걸 막지 않는다.

## 근거

- 청산 분기 | 없음 | `evaluate_exit`
- 유지증거금 판정 | 없음 | 같음
- 진입 전 청산가 추정 | 있음 (`estimated_liquidation`) | `positions/simulator.py`
- 실측 최악 손익률 | −53.22% (SPCXUSDT) | 닫힌 거래 141건
- −100% 이하 거래 | **0건** | 같음 — 3배라서 손절이 청산보다 먼저 걸린다

## 결정

**지금 안전한 게 아니라 배수가 낮아서 안 드러난 것이다.** 배수를 올리는 순간
드러난다. 화면은 손익 −90% 아래 포지션에 `⚠ 청산 수준` 을 단다.

**청산 모델링 없이 실매매로 가지 않는다.**
