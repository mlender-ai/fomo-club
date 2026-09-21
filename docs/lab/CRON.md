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

처음에는 GitHub-hosted runner에서 Binance 거래 API 호스트가 HTTP 451을 반환했다.
공식 공개 시장데이터 전용 호스트로 옮긴 뒤 `latest`·`candles`·`benchmark`·`paper`는
같은 러너에서 성공했다. **`funding`만** Futures 호스트의 HTTP 451이 남아 있다.
현물 값으로 대체하면 다른 데이터를 섞는 것이므로 우회하지 않았다. 상세 실측은
`docs/lab/DATA_SOURCES.md`에 남겼다.

## 0-3. 2026-09-21 — 발화는 한다. **주기를 못 지킨다.** 그래서 로컬로 옮겼다

`/data` 가 세 심볼 전부 `끊김` 으로 떠 있었다. 임계(`STALE_AFTER_MS` 3분)를 의심하기
전에 **언제 마지막으로 들어왔는지**부터 쟀다:

| 잡 | 걸어둔 주기 | 실측 | 마지막 |
|---|---|---|---|
| `latest-price` | 5분 | **19.2분에 한 번** | 18분 전 |
| `candles` | 매시 | 3.5시간째 안 돎 | 10:35 |
| `paper-tick` | 매시 | 8시간째 안 돎 | 06:25 |
| `funding` | 8시간 | **연속 실패 12회** | — |

**임계가 틀린 게 아니라 수집이 안 된 것이다.** 3분을 20분으로 늘리면 화면이 `정상` 이
되지만 데이터는 그대로 낡아 있다. 그건 고친 게 아니라 가린 것이다.

GitHub `schedule` 은 지연·누락을 보장하지 않는다 — 문서에 그렇게 적혀 있고, 실측이
그대로다. 5분짜리를 걸어도 19분에 한 번이면 **1분 주기 화면을 만들 수 없다.**

### 그리고 451 은 러너 위치 문제였다

`funding` 만 계속 451 이던 것(§0-2)의 정체를 확인했다. **이 맥에서는 같은 호출이 200 이다.**

```
시세: BTCUSDT=85340.93 ETHUSDT=2722 SOLUSDT=118.09
펀딩비 행: 27          ← GitHub 러너에서는 451
봉: 5
리더보드: 46626
```

즉 수집을 로컬로 옮기면 **주기 문제와 펀딩비 문제가 같이 풀린다.** 현물로 대체하는
우회(§0-2 에서 거부한 것)를 하지 않아도 된다.

### 구조 — 쓰기는 API 가 한다

```
scripts/lab/runner.ts  ──▶  POST /api/lab/market  ──▶  DB  ──▶  화면
     (이 맥, 공개 소스를 읽는다)      (인증)
```

로컬에 프로덕션 `DATABASE_URL` 이 없다(Vercel 이 암호화해 안 내려준다). FCE 브리지와
**같은 방식**이다 — 러너는 읽고, 쓰기는 인증된 엔드포인트가 한다.

```bash
npm run lab:runner            # 계속 돈다. 이 맥에서 떠 있어야 한다
npm run lab:runner -- --once  # 전부 한 번씩만
```

| 잡 | 주기 | 어디서 도나 |
|---|---|---|
| `latest-price` | 1분 | 로컬 |
| `candles` | 5분 | 로컬 |
| `whale` · `fce` | 15분 | 로컬 |
| `paper` | 1시간 | **Actions** — 로컬은 깨우기만 한다 |
| `funding` | 8시간 | 로컬 |

### 페이퍼만 다른 이유 — 실행기를 둘로 만들지 않는다

페이퍼는 DB 를 직접 읽고 쓴다(전략 상태·거래·자산). 이 맥에는 프로덕션
`DATABASE_URL` 이 없다. 그렇다고 실행기를 API 쪽에 다시 짜면 **실행기가 둘이 된다** —
`LAB-07 PART A` 가 하지 말라고 못박은 것이고, 백테스트와 페이퍼가 같은 `execute()` 를
쓴다는 보장(`engine-resume.test.ts`)이 깨진다.

그래서 역할을 나눴다:

| | 무엇을 준다 | 왜 |
|---|---|---|
| 로컬 러너 | **주기** | GitHub `schedule` 이 못 지키는 것이 이것이다 |
| Actions | **DB 자격** | `workflow_dispatch` 는 정상 동작한다(§0-2) |

러너가 1시간마다 `gh workflow run lab-collect.yml -f job=paper` 를 부른다. `gh` 가 이
맥에 로그인돼 있어야 하고, 없으면 **이 잡만** 실패하고 나머지는 돈다.

한 번에 **하나만** 돈다. 병렬이면 DB 커넥션이 몰리고(서버리스는 람다당 1개다) 어느 잡이
느린지도 안 보인다. 실패는 콘솔에만 남기지 않고 `CollectionRun` 에 같이 적는다 —
**성공만 적으면 언제부터 안 들어왔는지 모른다.**

### 고래 코호트는 러너가 정하지 않는다

`GET /api/lab/market?cohort=1` 로 **이미 보던 지갑**을 받아서 쓴다. 매번 리더보드에서
다시 뽑으면 순위에서 밀린 지갑의 관측이 끊긴다 — 표본이 남되 **자라지 않는다**
(FCE `c0e4805` 가 고친 결함). 처음 한 번만, 그것도 성과가 아니라 **계좌 규모**로 뽑는다.

### 상시화 — 터미널을 닫아도 돈다

러너가 터미널 세션에 매여 있으면 창을 닫거나 재부팅하는 순간 죽고, **화면은 그때부터
조용히 낡아간다.** 그래서 launchd 에 올린다:

```bash
scripts/lab/launchd/install.sh
```

| | |
|---|---|
| `RunAtLoad` | 로그인 직후부터 돈다 |
| `KeepAlive` | 죽으면 다시 띄운다 |
| `ThrottleInterval 30` | 즉시 재시작을 반복하지 않는다 — 소스에 무례하다 |
| 로그 | `/tmp/lab-runner.log` · `/tmp/lab-runner.err` |

토큰이 plist 안에 들어가므로 `~/Library/LaunchAgents/com.fomo.lab.runner.plist` 는
`600` 으로 둔다. 제거는:

```bash
launchctl bootout gui/$(id -u)/com.fomo.lab.runner && rm ~/Library/LaunchAgents/com.fomo.lab.runner.plist
```

### 남은 약점

맥이 자면 멈춘다. `caffeinate -dimsu &` 로 막고, 그래도 끊기면 **화면이 먼저 말한다**
(`/data` 의 `끊김`, 전광판의 끊김 구간). 맥이 꺼져 있는 동안은 `lab-collect` 크론이
느리게나마 백스톱을 한다.

---

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

> 2026-09-21 부터 시세·봉·펀딩비·고래는 **로컬 러너가 주력**이다(§0-3). `lab-collect`
> 는 지우지 않고 남겨둔다 — 맥이 꺼져 있는 동안의 백스톱이고, 둘 다 `skipDuplicates`
> 라 같은 봉을 두 번 넣지 않는다. `paper` 는 **여전히 Actions 가 실행한다** — 러너는
> 주기만 준다(§0-3).

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
