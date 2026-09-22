---
no: "06"
title: 주식 US 체결 가격 이상은 왜 생기나
status: open
summary: 봉 불일치 — 체결가는 세션 시가로 만들고 invariant 는 현재 분봉으로 검사한다
opened_at: 2026-09-21
tracks: [stock_us, stock_kr]
---

## 가설

`fill_price_outside_observed_range` 로 트랙이 멈췄다. invariant 가 틀린 게 아니라
**비교 대상이 틀렸다.**

## 어떻게 확인하나

`stock_paper/broker.py` 가 정지시키는 자리와 체결가를 만드는 자리를 나란히 읽는다.

## 근거

- 정지 지점 | `stock_paper/broker.py:63` | FCE
- 체결가 출처 | **세션 시가** | `core/config.py:201`
- invariant 검사 대상 | **현재 분봉** | 같음
- KR 큐 보류 | 13,940건 — 같은 버그를 밟지 않으려고 미리 멈춤 | `stock_paper/service.py:350`

## 결정

**둘은 다른 고장이 아니다. 봉 불일치 하나를 고치면 둘 다 풀린다.**
정지한 것은 옳은 동작이다 — invariant 가 제 일을 했다. 수리는 FCE 쪽 별건이다.
