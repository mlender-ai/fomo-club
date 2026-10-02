# 말한 매매법 — 광혁이 먼저 쓴다

> **데이터를 보기 전에 쓴다.** TRADER-01 보고서 · 거래 내역 · 차트를 다시 보지 말고, 머릿속에 있는 대로 쓴다.
> 이 파일은 **질문만** 있는 틀이다(공개 레포). 답은 비공개 사본에 쓴다:
>
> ```
> python3 scripts/trader/trader02.py init-stated     # ~/.fomo/trader/trader02/stated-rules.md 를 만든다
> (그 파일에 답을 쓴다)
> python3 scripts/trader/trader02.py seal-stated     # 봉인 — 작성 시각 · 지문을 남긴다. 이후 바꾸면 기록된다
> ```
>
> 짧게, 숫자로. 모르면 `모름`. 경우에 따라 다르면 경우를 나눠 쓴다.
> `[ ]` 안 표시는 지우지 않는다 — 기계가 질문을 찾는 표시다. 답은 `:` 뒤나 다음 줄에 쓴다.
> **숫자 칸**(`[N.…]`)은 숫자 하나만. 모르거나 경우에 따라 다르면 비워 두고 위 서술 칸에 쓴다.

## A-1. 무엇을 거래하나

- [A1.symbols] 어떤 종목을 보나 (메이저 · 알트 · 신규상장 · 고래가 들어간 것 · ...):
- [A1.avoid] 안 건드리는 종목은:
- [A1.per_day] 하루에 몇 번 정도 들어가나:
- [N.symbols] 종목 목록 (쉼표로 · 보기 BTCUSDT, ETHUSDT):
- [N.trades_per_day] 하루 진입 횟수 (숫자):

## A-2. 언제 들어가나

- [A2.must_check] 들어가기 전에 반드시 확인하는 것 3개:
- [A2.veto] 그중 하나라도 아니면 안 들어가는 것:
- [A2.timeframe] 주로 보는 시간봉:
- [A2.style] 추세 따라가나, 되돌림을 노리나, 둘 다면 언제 어느 쪽인가:
- [A2.split_entry] 진입은 한 번에인가, 나눠서인가:
- [N.side] 방향 (long · short · both):
- [N.split_entry] 나눠서 들어가나 (예 · 아니오):

## A-3. 얼마나 싣나

- [A3.leverage] 레버리지 기준:
- [A3.margin] 한 거래에 증거금의 몇 % 쯤:
- [A3.confidence] 자신 있을 때 더 싣나 — 무엇이 자신 있게 만드나:
- [N.leverage] 보통 레버리지 (배):
- [N.margin_pct] 한 거래 증거금 비율 (%):

## A-4. 언제 자르나

- [A4.stop] 손절 기준 (가격 % · 구조 이탈 · 시간 · 느낌):
- [A4.stop_order] 손절 주문을 미리 걸어두나:
- [A4.reentry] 손절 후 같은 종목 다시 들어가나:
- [N.stop_pct] 손절 % (진입가 대비, 음수. 예 -3):
- [N.stop_order] 손절 주문을 미리 거나 (예 · 아니오):
- [N.reentry_after_stop] 손절 뒤 같은 종목 다시 들어가나 (예 · 아니오):

## A-5. 언제 파나

- [A5.take_profit] 익절 기준:
- [A5.scale_out] 나눠서 파나 — 어떻게:
- [A5.let_run] 끌고 가는 경우는 언제:
- [A5.exit_signal] "이제 나와야겠다" 싶은 신호:
- [N.scale_out] 나눠서 파나 (예 · 아니오):
- [N.first_tp_pct] 첫 익절 % (진입가 대비):
- [N.first_tp_size_pct] 첫 익절 때 파는 비율 (%):
- [N.trail_pct] 끌고 가는 몫 — 고점에서 몇 % 밀리면 파나:
- [N.max_hold_hours] 길어도 몇 시간이면 정리하나:

## A-6. 안 하는 때

- [A6.pause] 매매를 쉬는 조건 (시간대 · 연속 손실 · 시장 분위기 · ...):
- [N.pause_after_losses] 몇 연패면 쉬나 (숫자):
- [N.pause_minutes] 그때 몇 분 쉬나 (숫자):
