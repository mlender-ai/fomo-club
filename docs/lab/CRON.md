# 크론 — STRATEGY LAB

| | |
|---|---|
| **근거** | `LAB-FIX` PART F·G |
| **실측일** | 2026-09-17 |

---

## 0. 결론부터 — 카드 크론은 이미 꺼져 있었다

`LAB-FIX` PART G 가 물은 것: *"2026-09-10 14:58 이후 schedule 이벤트가 7일간 한 번도 안 돈다."*

**고장이 아니다. `LAB-01`(#1240, 2026-09-10 16:40 머지)이 끈 것이다.**

워크플로 파일은 전부 남아 있고 GitHub 에서도 `active` 로 보인다. 하지만 `on:` 블록의
`schedule:` 과 `- cron:` 줄이 **주석 처리**돼 있다:

```yaml
on:
  # LAB-01 비활성화 — 자동 트리거 제거, 수동 실행만 남김
  # schedule:
  # - cron: "30 21 * * 1-5" # 미국장 마감 후
  workflow_dispatch:
```

마지막 schedule 실행(09-10 14:58)이 머지(16:40) **직전**이라는 것이 맞아떨어진다.

> ⚠️ 내가 먼저 보고할 때 "워크플로가 전부 active 인데 schedule 이 안 돈다, 원인 미상"
> 이라고 적었다. **틀렸다.** `grep "cron:"` 결과에 `#` 가 붙어 있는 것을 내가 못 봤다.
> 워크플로의 *상태*(active/disabled)와 *트리거*(주석 여부)는 다른 축이다.

`workflow_dispatch` 는 그대로 동작한다 — `lab-collect` 수동 실행이 돌았다(그리고 DB 때문에
실패했다). **schedule 기능 자체는 멀쩡하다.**

---

## 1. 지금 크론이 살아 있는 워크플로

| 워크플로 | 크론 | 무엇 |
|---|---|---|
| `lab-collect` | 5개 | 시세(5분) · 봉(매시 5분) · 펀딩비(8시간) · 고래(15분) · 페이퍼(매시 15분) |

**이것 하나뿐이다.** 나머지 34개는 크론이 주석 처리돼 있고 수동 실행만 된다.

---

## 2. 크론이 주석 처리된 워크플로 34개

### 2-1. LAB 에서 다시 쓸 것 — **지우지 않는다**

| 워크플로 | 어디서 쓰나 |
|---|---|
| `disclosure-collect` | `LAB-09` — DART 공시. 임원 클러스터·자사주·지분 5% 신호의 원료 |
| `supply-demand-pipeline` | `LAB-09` — 외국인·기관 수급. 연속매수 신호의 원료 |
| `judgment-ledger-daily` | `LAB-09` PART D — 판단 원장. 52% 비교의 분모 |
| `kr-candle-prewarm` | 국내 일봉. `LAB-09` 가 야후로 갈아탔으므로 **재검토 필요** |

### 2-2. 카드 제품 전용 — 되살릴 계획 없음

```
keyword-cards-pipeline   daily-bake              quiet-pick-trigger
feed-content             fomo-index-pipeline     warm-insights
us-market-prewarm        coin-market-prewarm     us-about-backfill
us-coverage-monitor      sector-map              signal-stats
macro-collect            investor-collect        investor-13f-collect
symbol-risk-backfill     business-context-backfill
quality-slo-monitor      outcome-check           card-slot-coverage
deck-stagnation          substance-audit
```

### 2-3. 레포 운영 — LAB 과 무관

```
cleanup-branches   stale-pr-sweep      slack-retro        autonomy-report
coverage-dashboard compact-constraints knowledge-distill  hardening-scout
agent-tooling-scout idea-proposal      project-progress   daily-product-monitor
```

---

## 3. 왜 파일을 지우지 않나

`LAB-09` 가 `disclosure-collect` · `supply-demand-pipeline` 을 다시 쓴다. 지우면
그때 다시 써야 하고, **다시 쓰면 그때 정한 임계와 실패 처리가 같이 사라진다.**

주석은 되돌리기 쉽고, 지운 것은 되돌리기 어렵다.

---

## 4. 다시 켜는 법

해당 파일의 `on:` 블록에서 `# schedule:` 과 `# - cron:` 의 `#` 를 뗀다.
GitHub 워크플로 상태(`gh workflow enable`)와는 **다른 축**이다 — 상태는 이미 active 다.
