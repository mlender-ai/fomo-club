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

## 0-2. 되살린 크론은 다시 발화했다 — 실행 위치 제약이 남았다

2026-09-18 새 DB 연결 뒤 `lab-collect`의 schedule 실행이 실제로 생성됐다. 따라서 아래
"schedule 이벤트가 배달되지 않는다" 판정은 **2026-09-17 당시 관측 기록**이고 현재
상태가 아니다.

다만 GitHub-hosted runner에서 Binance가 HTTP 451(지역 제한)을 반환한다. 크론 전달은
복구됐지만 `latest`·`candles`·`funding`·`benchmark`는 같은 러너에서 정상 수집할 수 없다.
로컬에서는 같은 코드로 봉 82,119행과 펀딩비 9,855행을 정상 적재했다. 상주 워커나
Binance 허용 리전의 실행기로 옮기기 전까지 GitHub-hosted 수집 성공을 기대하면 안 된다.

### 2026-09-17 관측 기록

`LAB-01` 의 주석 처리는 **09-10~09-17 공백만** 설명한다. `lab-collect` 는 2026-09-17
12:22 UTC 에 main 에 올라가며 `*/5` 크론이 살아났는데, **2시간 40분 동안 0회 발화했다.**

> 런이 실패한 게 아니라 **만들어지지도 않았다.** 워크플로 런 총 1건, 그것도 수동 실행이다.

### 대조 실험

크론과 `echo` 뿐인 워크플로(`cron-probe.yml`)를 main 에 넣고 47분을 봤다 — **0건.**
`lab-collect.yml` 의 문제가 아니라 **레포/계정 차원**이다. 실험 파일은 판정 후 지웠다.

<details><summary>다시 재현하려면</summary>

```yaml
name: Cron Probe
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - run: echo "발화 $(date -u +%FT%TZ) · event=${{ github.event_name }}"
```
</details>

### 배제된 것 (전부 실측)

| 가설 | 실측 | 판정 |
|---|---|---|
| Actions 분 소진 | `private=false` — 공개 레포는 무제한 | 배제 |
| 결제 문제 | 위와 같은 이유 | 배제 |
| 기본 브랜치 아님 | `default_branch=main`, 파일도 main 에 있음 | 배제 |
| Actions 제한 설정 | `{"enabled":true,"allowed_actions":"all"}` | 배제 |
| 워크플로 비활성 | `state=active` (`disabled_inactivity` 아님) | 배제 |
| YAML 깨짐 | 69개 전부 파싱 통과 | 배제 |
| GitHub 장애 | Actions `operational`, 미해결 인시던트 0 | 배제 |
| 워크플로 파일 고유 문제 | 대조 실험도 0건 | 배제 |

`workflow_dispatch` 는 **정상 동작한다.** schedule 이벤트만 배달되지 않는다.

### 남은 것 — API 로 안 보인다

레포 소유자만 볼 수 있는 자리가 있다: **Actions 탭 상단 배너.** 스케줄 비활성 안내나
계정 제한 안내가 거기 뜬다. 그걸로도 안 나오면 GitHub 지원 문의 건이다.

### 대안은 Vercel Cron 이 아니다

`LAB-FIX` G-2 는 "못 찾으면 Vercel Cron 으로 옮긴다" 고 했는데, **이 계정은 Hobby 라
크론이 하루 1회**다(`LAB-07` §0 실측). 5분·매시 주기를 대신 못 한다. 실제 선택지는:

| 대안 | 비고 |
|---|---|
| 외부 핑거(cron-job.org 등) → 인증된 엔드포인트 | 가장 빠름. 시크릿 헤더 필요 |
| `apps/api` 상주 워커 | `LAB-07` §0 이 이미 "진짜 1분 주기는 상주 워커" 라고 적어둠 |
| GitHub 지원 문의 | 원인 규명 |

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
