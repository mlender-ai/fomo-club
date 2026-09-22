---
no: "03"
title: 호스트가 자는 동안 잃은 날은 며칠인가
status: open
summary: 달력 48일 중 유효 3일 — 94%를 잃고 있다
opened_at: 2026-09-22
tracks: [stock_us, stock_kr]
---

## 가설

검증 창이 28일인데 유효일이 며칠 안 되면 **표본이 없는 것과 같다.**

## 어떻게 확인하나

FCE 가 트랙마다 `elapsed_days` · `calendar_days` 를 이미 재고 있다. 그대로 읽는다.

## 근거

- 주식 US | 유효 2일 / 달력 49일 (유실 47) | `/api/stock-paper/dashboard`
- 주식 KR | 유효 3일 / 달력 48일 (유실 45) | 같음
- `caffeinate -dimsu` | 실행중 | `pmset`
- 수집 끊김 | 09-21 23:57 ~ 09-22 14:33 (876분) | `FceUpload`

## 결정

전광판에 `유효일` 칸을 넣었다 — 안 적으면 수익률·MDD·승률이 두 달치 성과로
읽힌다. **근본 해결은 FCE 를 서버로 옮기는 것이다**(LAB-00 6단계).
