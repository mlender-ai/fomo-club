# OPS-04 — 서버 이전 (맥 의존 끝)

지시서: `docs/wo/OPS-04-server.md` · 기준 2026-09-30.

**지금:** 서버 준비물(스크립트 · systemd · 대조 · 단일 업로더 문)은 레포에 있다. **서버는 아직 없다** — 유료 서버를
고르고 만드는 것은 🧑 광혁 몫이다(AGENTS 3원칙 예외 ③ 유료 신규 결제). 아래 완료 확인 9개는 **전부 미완**이다.
완료는 가동으로 판정한다 — 스크립트가 있는 것은 완료가 아니다.

---

## 한눈에 — 누가 무엇을

| # | 누가 | 무엇 | 명령 · 자리 |
|---|---|---|---|
| 1 | 🧑 | 서울 리전에 Ubuntu 24.04 서버 하나 만든다(§A) | 제공자 콘솔 |
| 2 | 🧑 | **결제 전에** 후보 서버에서 API 확인 — 하나라도 막히면 지우고 다른 곳 | `bash probe-apis.sh` |
| 3 | 🧑 | 준비 | `sudo bash scripts/ops/server/bootstrap.sh` |
| 4 | 🧑 | 비밀 넣기 — 조회 전용 키만(§C) | `/etc/fomo/*-secrets.env` |
| 5 | 🧑 | 맥 → 서버 FCE 상태 복사 | 맥: `scripts/ops/server/migrate-db-from-mac.sh ubuntu@<IP>` |
| 6 | 🧑 | 서버에 풀고 그림자로 올린다 | `restore-fce-state.sh` → `install.sh --mode shadow --since <5가 알려 준 시각>` |
| 7 | 🤖 | 매일 대조 보고서를 이 문서 §D-3 에 옮긴다 | 서버 `/var/lib/fomo/shadow/reports/*.md` |
| 8 | 🧑🤖 | 7일 일치 → 운영 전환(§D-4) | 순서 그대로 |
| 9 | 🧑 | 맥을 끄고 24시간 · 서버 재부팅 · 복원 시험 · 비용 기록(§E) | `reboot-check.sh` · `fce-restore-test.sh` |

---

## A. 어디에

### A-1. 조건과 고른 것

| 조건 | 왜 |
|---|---|
| **서울** | 랩 DB(Supabase)가 서울이다. 토스 OpenAPI · 거래소 지연 |
| 상시 가동 VM | FCE 는 떠 있는 프로세스다(uvicorn + 워커). 서버리스 안 된다 |
| Ubuntu 24.04 | 스크립트가 이것 기준 · systemd |
| 크기 | 메모리 **4GB 권장** — FCE(파이썬) · 러너(Node) · ENG-02 재판정(파이썬)이 같이 돈다. 디스크 **80GB** — FCE DB 가 지금 ~5GB 이고 늘어난다 · 백업 7개(압축) |

제공자는 🧑 가 고른다. 서울 리전이 있는 곳이면 된다(예: AWS Lightsail · EC2 `ap-northeast-2`, GCP `asia-northeast3`,
Vultr Seoul). **시간 단위로 과금되는 곳이면 만들어서 2번을 돌려 보고 막히면 바로 지운다** — 달로 결제하기 전에 판정한다.
실제 월 비용은 §E-5 에 콘솔 표시값 그대로 적는다(여기에 추정치를 적지 않는다).

### A-2. 먼저 확인 — `scripts/ops/server/probe-apis.sh`

FCE · 러너 코드에서 호출 주소를 전부 뽑아 한 번씩 부른다(2026-09-30 기준):

| 누가 | 주소 | 무엇 |
|---|---|---|
| FCE | `api.bitget.com` | 크립토 봉 · 계좌 포지션 |
| FCE · 러너 | `api.hyperliquid.xyz` · `stats-data.hyperliquid.xyz` | 고래 |
| FCE | `openapi.tossinvest.com` | 주식 시세(US · KR) — **허용 IP 등록제** |
| FCE | `open-api-v4.coinglass.com` · `marketdata.theocc.com` · `api.openai.com` | 보조 |
| FCE · 알림 | `api.telegram.org` | |
| 러너 | `data-api.binance.vision` · `fapi.binance.com` | 시세 · 펀딩비 — **미국 GitHub 러너에서 451 이던 곳** |

| 판정 | 뜻 |
|---|---|
| ✅ 200 | 닿는다 |
| ✅ 401 (키 필요한 곳) | 닿는다 — 키가 없어서 거절했을 뿐. 지역 차단은 403 · 451 이다 |
| ⛔ 403 · 451 | **지역 · IP 차단 → 그 지역 탈락** |
| ❌ 000 | 연결 안 됨 → 탈락(방화벽 · DNS 먼저 확인) |

키를 넣은 뒤 토스가 실제로 200 을 주는지는 `probe-apis.sh --with-fce` (FCE 자기 진단 `/api/system/toss/auth-diagnosis`).
**폴리마켓(gamma · clob)은 판정에 넣지 않는다** — 제외 유지 · 그것 때문에 지역을 고르지 않는다.

> 이 세션(클라우드 샌드박스)에서 돌려 봤다 — 샌드박스 프록시가 전부 막아 11개 모두 `❌ 000` 이고 스크립트가
> **탈락**으로 판정했다. 서울 판정이 아니다. 막히면 통과시키지 않는다는 확인일 뿐이다. **서울 판정은 후보 서버에서.**

---

## B. 무엇을 옮기나 — `scripts/ops/server/`

```
/opt/fce              FCE 레포 클론 (코드 그대로) · .venv (Python 3.13 — 맥과 같은 버전)
/opt/fomo-club        이 레포 클론 (러너 · 대조 · 스크립트)
/etc/fomo/            fce.env · runner.env (운영 값) · *-secrets.env (🧑 root 0600)
/var/lib/fomo/shadow  그림자 기록 · 대조 보고서
/var/log/fomo         fce.log · lab-runner.log · lab-shadow.log (매일 · 14일 보존)
/var/backups/fce      FCE DB 백업 (매일 · 7일)
```

| 유닛 | 맥에서는 | 무엇 |
|---|---|---|
| `fce.service` | `com.fomo.fce.supervisor` | uvicorn 127.0.0.1:8875 · 워커 포함 · 파일 한도 65536 |
| `fce-health.timer` | 감시 루프의 매달림 재시작 | 1분마다 `/health` · 3번 연속 실패면 재시작 |
| `lab-runner.service` | `com.fomo.lab.runner` | **운영 모드에서만** |
| `lab-shadow.timer` | — | **그림자 모드에서만** · 15분마다 업로드할 것을 파일로만 |
| `lab-shadow-compare.timer` | — | 그림자 모드 · 매일 07:15 KST 대조 |
| `fce-backup.timer` | — | 매일 04:40 KST |
| `fomo-alert@.service` | — | 위 유닛이 실패하면 텔레그램 한 줄 |

- **FCE 코드는 한 줄도 안 바꾼다.** FCE 의 macOS 전용 점검(`sleep_guard` · `pmset`)은 리눅스에서 스스로 꺼진다(`macOS 전용 점검`)
- 운영 값은 **맥과 같은 파일 하나**(`scripts/ops/launchd/fce.env`)를 서버도 읽는다 — `install.sh` 가 붙여 `/etc/fomo/fce.env` 를 만든다
- 옮기는 FCE 상태: `backend/*.db`(sqlite 온라인 백업) · `notification_state.json` · `logs/shadows`(ENG-02 실험). **`.env` 는 옮기지 않는다** — 맥 키가 들어 있다

---

## C. 키와 비밀

### C-1. 서버에 무엇이 들어가나

| 키 | 필요한가 | 권한 |
|---|---|---|
| Bitget | 페이퍼엔 **없어도 된다** — 계좌 포지션 조회(FCE 로컬 UI 건강도)에만 쓴다 | **새로 만든다 · 읽기 전용만 · 거래 ✗ · 출금 ✗ · IP = 서버** |
| 토스 OpenAPI | 주식 트랙 시세 | FCE 는 시세 조회 경로만 부른다(`TossReadOnlyClient`). 허용 IP 에 **서버 IP 추가** |
| FCE 텔레그램 봇 | 운영 전환 뒤 | 그림자 주에는 **넣지 않는다**(아래) |
| `LAB_INGEST_TOKEN` | 러너 · 대조 | 그림자 주에는 대조가 **읽기**에만 쓴다 |
| 알림(`alert-secrets.env`) | 유닛 실패 알림 | OPS-03 알림 봇과 같은 값이면 된다 |

**주문 키 · 출금 권한 키는 어디에도 없다.** 실매매 때 주문 키를 따로 만든다(출금 ✗).

### C-2. 🧑 넣는 법 — 에이전트는 값을 보지 않는다

```bash
sudo install -m 600 -o root -g root /dev/null /etc/fomo/fce-secrets.env
sudo nano /etc/fomo/fce-secrets.env        # 틀: scripts/ops/server/env/fce-secrets.env.example
```

systemd 가 root 로 읽어 서비스에 넘긴다 — 파일은 root 만 읽는다. `install.sh` 는 권한이 `600 root` 가 아니거나
값이 비었거나 자리표시(`…` · `여기에`)면 **올리지 않는다**(OPS-01 에서 토큰 자리의 `…` 로 러너가 전부 실패했다).

### C-3. IP 화이트리스트

- Bitget 새 키: IP 제한 = 서버 공인 IP 하나
- 토스 콘솔 허용 IP: 서버 IP **추가**(그림자 주에는 맥 IP 도 남겨 둔다 · 전환 뒤 맥 IP 삭제)

### C-4. ⚠ 같은 자격증명을 두 기계가 같이 쓰면 안 되는 것 둘

FCE 코드를 읽다 찾았다. **그림자 주에 맥 운영을 깨뜨릴 수 있다.**

| 무엇 | 왜 | 그래서 |
|---|---|---|
| 토스 | 토큰을 새로 받으면 **앞 토큰이 무효**가 된다(FCE `toss/client.py` — "issuing again and invalidating it") | 그림자 서버에 맥과 같은 앱 값을 넣으면 **맥 주식 트랙이 인증 실패**한다. 서버용 앱을 따로 만들 수 있으면 그 값, 없으면 **비워 둔다**(서버 주식 트랙은 그림자 대조에서 빠진다 → 전환 뒤 따로 확인) |
| FCE 텔레그램 봇 | 봇이 `getUpdates` 로 계속 부른다. 같은 토큰으로 두 곳이 부르면 텔레그램이 한쪽을 끊는다 | 그림자 모드는 봇을 끈다(`env/fce-shadow.env` · `FCE_TELEGRAM_BOT_ENABLED=false`). 토큰이 있으면 `install.sh` 가 거부한다 |

---

## D. 병행 운용 (맥 → 서버)

### D-1. 둘이 동시에 올리지 않는다 — 두 겹

| 겹 | 무엇 |
|---|---|
| 그림자 서버는 **올리는 코드가 안 돈다** | `lab-runner.service` 는 꺼져 있고 `lab-shadow.timer` 는 `fce-upload --emit`(push 전에 돌아온다)만 돈다. `install.sh` 는 모드를 바꿀 때 반대쪽을 먼저 끈다 |
| 랩이 **쓰는 쪽 하나만 받는다** | 러너 · 업로더가 쓰기마다 `x-lab-writer` 에 기계 이름을 싣는다. Vercel `LAB_WRITER` 가 있으면 그 이름만 쓰고 나머지는 `409 not_primary_writer`(`apps/web/lib/lab/writer.ts`) — FCE 업로드 · 시세 · 조립본 · 심장박동 · 실험 7곳 전부 |

`LAB_WRITER` 가 없으면 지금처럼 누구든 쓴다 — 이 PR 을 배포해도 맥 운영은 그대로다. 심장박동에 `writer` 가 같이
적혀 `/api/lab/watch` 에서 지금 누가 올리는지 보인다.

### D-2. 대조 — `lab-shadow-compare.timer` (매일 07:15 KST)

```
맥(운영)     → 랩 DB    → GET /api/lab/ledger?since=   (읽기만 · 토큰)
서버(그림자) → 로컬 파일 → /var/lib/fomo/shadow/fce-*.json 중 최근
            → apps/web/lib/lab/shadow-diff.ts → reports/YYYY-MM-DD.md
```

| 대조 항목 | 어떻게 |
|---|---|
| 같은 신호가 나왔나 | 갈라진 시각 뒤의 **진입**이 양쪽에 다 있나. 트랙 · 심볼 · 방향 · 진입 시각으로 짝짓는다(id 는 양쪽이 따로 만든 uuid 라 다르다) |
| 같은 시각에 체결했나 | 크립토 **0분**(확정 봉 시각으로 들어간다) · 고래 **15분**(지갑 체결을 읽는 간격) |
| 같은 가격인가 | 진입가 · 청산가 **1bp** 안 |
| 트랙별 N · 손익 | 트랙 거래 수 · 상태 · 자본 · 갈라진 뒤 청산 순손익 |

갈라지기 **전에 열려 있던** 거래는 id 가 같다 — id 로 짝짓고 청산만 본다. 한 줄이라도 어긋나면 **불일치**, 유닛이
실패로 끝나 알림이 간다. 테스트: `apps/web/__tests__/shadow-diff.test.ts`.

**첫날 주의:** 맥 DB 를 복사한 순간부터 서버 FCE 가 뜨기까지 몇 분 사이에 맥이 진입하면 그건 `맥에만` 으로 뜬다.
그 시각대의 것만이면 첫날은 그 사유로 적고 둘째 날부터 판정한다.

### D-3. 대조 기록

| 날짜 | 판정 | 사유 |
|---|---|---|
| — | — | 서버가 아직 없다 |

(🤖 매일 서버 `reports/*.md` 를 여기 붙인다 — 완료 확인 4)

### D-4. 운영 전환 — 순서대로

**7일 일치**(또는 불일치 원인을 전부 규명)한 뒤에만.

| # | 누가 | 무엇 | 왜 이 순서 |
|---|---|---|---|
| 1 | 🧑 | 맥 러너를 내린다 `launchctl bootout gui/$(id -u)/com.fomo.lab.runner` | 업로드를 먼저 끊는다 |
| 2 | 🧑 | 맥 FCE 를 내린다 `launchctl bootout gui/$(id -u)/com.fomo.fce.supervisor` | 텔레그램 봇 · 토스 토큰이 서버와 부딪히지 않게 |
| 3 | 🧑 | **맥 FCE 상태를 한 번 더 옮긴다** `migrate-db-from-mac.sh` → 서버 `restore-fce-state.sh` | 그림자 주에 서버가 만든 거래는 id 가 맥과 다르다. 그대로 운영으로 올리면 **같은 거래가 두 id 로 원장에 들어간다.** 맥의 마지막 상태에서 이어 간다 |
| 4 | 🧑 | 서버 `fce-secrets.env` 에 텔레그램 봇 · 토스 운영 값 · 토스 허용 IP 에 서버 | 이제 서버 혼자 쓴다 |
| 5 | 🧑 | Vercel → 백엔드 프로젝트 → Environment Variables → `LAB_WRITER=seoul-1` → **재배포** | 맥 러너가 실수로 살아나도 원장에 못 쓴다 |
| 6 | 🧑 | 서버 `sudo install.sh --mode primary` | 그림자를 끄고 러너를 켠다 |
| 7 | 🤖 | 확인 — 러너 로그 `fce ✅` · `/api/lab/watch` 심장박동 `writer: seoul-1` · 헤더 초록 | |
| 8 | 🧑 | 맥 launchd 파일 정리 `rm ~/Library/LaunchAgents/com.fomo.{lab.runner,fce.supervisor}.plist` · 토스 허용 IP 에서 맥 IP 삭제 | 재부팅해도 맥이 다시 뜨지 않게 |

되돌리기: 서버 `systemctl disable --now lab-runner` → Vercel `LAB_WRITER` 삭제 · 재배포 → 맥 `install-fce.sh` · `install.sh`.

---

## E. 운영

### E-1. 재시작 정책

`Restart=always` · `RestartSec=10` · `StartLimitIntervalSec=300` · `StartLimitBurst=5` · `OnFailure=fomo-alert@%n`.
죽으면 10초 뒤 다시 뜨고, **5분 안에 5번째로 뜨면 systemd 가 멈추고** 그때 알림이 한 번 간다. 떠 있는데 대답이 없는
경우는 `fce-health.timer`(3분 연속 `/health` 실패 → 재시작).

시험(🧑 · 그림자 주에 한 번):
```bash
for i in 1 2 3 4 5 6; do sudo systemctl kill -s KILL fce.service; sleep 12; done
systemctl status fce.service      # failed · "start request repeated too quickly" 여야 한다 · 텔레그램 한 줄
sudo systemctl reset-failed fce.service && sudo systemctl start fce.service
```

### E-2. 재부팅 — 완료 확인 7

```bash
sudo reboot
# 10분 뒤, 아무것도 실행하지 않고
sudo /opt/fomo-club/scripts/ops/server/bin/reboot-check.sh
```

유닛 · `/health` · 타이머 · (운영이면) 러너 `fce ✅` · (그림자면) 러너가 **꺼져 있는지**까지 본다.
자동 보안 업데이트는 켜 두되 **자동 재부팅은 끈다**(`bootstrap.sh`) — 재부팅은 사람이 하고 이 시험으로 확인한다.

### E-3. 백업 · 복원 — 완료 확인 8

- 매일 04:40 KST `sqlite3 .backup`(쓰는 중에도 한 시점 사본) → `quick_check` → zstd → 7일 넘은 것 삭제. 사본 검사가 실패하면 **지우지 않고** 실패로 끝나 알림
- 복원 시험: `sudo /opt/fomo-club/scripts/ops/server/bin/fce-restore-test.sh` — 임시 자리에 풀고 `integrity_check` · 주요 표 행 수를 운영과 견주고 · FCE 자기 코드(`create_repository`)로 연다. **운영 DB 는 건드리지 않는다**
- 이 세션에서 가짜 DB 로 백업 스크립트를 돌렸다: 새 백업 생성 · 8일 된 것 삭제 · 3일 된 것 유지 · 복원본 `integrity_check ok` · 행 수 같음. **FCE 실 DB 로는 서버에서 한다**
- 같은 디스크의 백업은 디스크를 잃으면 같이 잃는다 — 제공자 스냅샷(자동)을 켤 수 있으면 켠다(🧑 · 비용 확인)

| 날짜 | 백업 파일 | integrity | 행 수 대조 | FCE 로 열림 |
|---|---|---|---|---|
| — | — | — | — | — |

### E-4. 감시 — OPS-03 그대로

심장박동은 러너가 보낸다(1분). 맥 밖 감시(`pg_cron` → `/api/lab/cron/watch`)는 **어느 기계가 보내든 같다** — 바꿀 것이 없다.
전환 뒤 심장박동 `writer` 가 `seoul-1` 로 바뀌었는지만 본다.

### E-5. 월 비용

| 항목 | 월 | 출처 |
|---|---|---|
| 서버 | — | 🧑 제공자 콘솔 표시값 |
| 스냅샷(켰다면) | — | |
| 합계 | — | |

---

## F. 맥은 이후에

| | |
|---|---|
| FCE 로컬 UI(8876) | 맥 FCE 백엔드를 끈 상태에서 `ssh -N -L 8875:127.0.0.1:8875 ubuntu@<서버>` — UI 는 `127.0.0.1:8875` 로 프록시하므로 **설정을 안 바꾸고** 서버 FCE 를 본다. 8875 는 서버 밖으로 열지 않는다 |
| 개발 | 맥에서 계속 |
| 운영 | 서버 |

---

## 완료 확인

| # | 항목 | 상태 |
|---|---|---|
| 1 | 서버 지역에서 모든 API 200 | ⬜ 서버 없음 — `probe-apis.sh` 준비됨 |
| 2 | FCE · 러너가 systemd 로 돈다 | ⬜ 유닛 준비됨(`systemd-analyze verify` 통과) |
| 3 | 서버에 조회 전용 키만 · 출금 권한 0 | ⬜ 🧑 키 생성 |
| 4 | 1주 병행 대조 결과가 문서에 | ⬜ §D-3 |
| 5 | 일치 확인 후 운영 전환 | ⬜ §D-4 |
| 6 | 맥을 끄고 24시간 전 트랙 정상 | ⬜ |
| 7 | 서버 재부팅 자동 기동 | ⬜ `reboot-check.sh` |
| 8 | 백업 복원 시험 | ⬜ `fce-restore-test.sh` |
| 9 | 월 비용 기록 | ⬜ §E-5 |
