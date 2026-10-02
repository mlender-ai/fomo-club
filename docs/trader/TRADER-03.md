# TRADER-03 — 광혁 vs 엔진 비교 화면 · 절차와 결과

> 지시서: `docs/wo/TRADER-03-compare.md` · 선행: `docs/trader/TRADER-01.md` · `docs/trader/TRADER-02.md`
> **이 문서에는 실계좌 숫자를 적지 않는다.**

| 항목 | 상태 |
|---|---|
| 화면 | `/me/compare` · `/me/rules` · `/me/login` — 로그인 뒤 |
| API | `/api/me/{login,logout,compare,rules}` (쿠키) · `/api/me/ingest` (업로드 토큰) |
| 저장 | 새 표 `MeSnapshot` — **공개 랩 표와 따로**. 마이그레이션 `20261002000000_trader03_me`(CREATE TABLE 하나 · DROP 없음) |
| 업로더 | 맥 `scripts/trader/me_upload.py` · 15분 launchd(`install-trader-me.sh`) |
| 상태 | 코드 · 시험 · 폰 캡처(합성 데이터)까지. **🧑 마이그레이션 승인 · 환경변수 · 업로더 설치 대기** |

---

## 1. 🧑 광혁이 할 일

| # | 할 일 | 어디 |
|---|---|---|
| 1 | 마이그레이션 적용 승인(표 하나 추가) | 에이전트에게 "적용해" — AGENTS 3원칙 예외 ②(prod DDL) |
| 2 | `ME_PASSWORD` (8자 이상) | Vercel 환경변수(Production) |
| 3 | `ME_INGEST_TOKEN` (16자 이상, 아무 긴 난수) | Vercel **과 같은 값을** 맥 `~/fce/backend/.env` 에도 |
| 4 | (선택) `ME_SESSION_SECRET` | Vercel. 없으면 비밀번호에서 만든다 — 비밀번호를 바꾸면 모든 세션이 끊긴다 |
| 5 | 업로더 설치 | 맥: `scripts/ops/launchd/install-trader-me.sh` |
| 6 | 로그인 | `/me/login` — 헤더에 `\| 나` 가 생긴다 |

환경변수를 넣은 뒤 배포가 한 번 돌아야 적용된다.

---

## 2. 잠금 (0-1)

| | |
|---|---|
| 비밀번호 | `ME_PASSWORD` 하나. 없으면 로그인 자체가 닫힌다(503) · 모든 `/me` · `/api/me` 401 |
| 쿠키 | `fomo_me` = `v1.만료.HMAC` — httpOnly · Secure · SameSite=Lax · 30일. **비밀번호를 쿠키에 넣지 않는다** |
| 잠금 | IP 별 5회 틀리면 15분. 서버(`MeSnapshot.auth`)가 센다 — 쿠키를 지워도 안 풀린다. 잠긴 동안은 맞는 비밀번호도 거부 |
| 화면 | 서버 화면이 쿠키를 검사해 `/me/login` 으로 보낸다 |
| API | `/api/me/compare` · `rules` 는 쿠키 없거나 틀리면 **401**. 표시용 쿠키(`fomo_me_ui`)만으로는 안 열린다 |
| 검색 | `noindex` — 메타 태그 + `X-Robots-Tag` 헤더(`next.config.mjs`) · `Cache-Control: private, no-store`. `robots.txt` 에는 안 적는다(적으면 경로를 알리는 것) |
| 링크 | 공개 화면에 `/me` 링크 없음. `나` 탭은 로그인한 브라우저에서만 보인다 |
| 옛 `/login` | 비밀번호를 쿠키에 그대로 넣는 옛 화면 — 이 기능과 무관해 건드리지 않았다(지울지는 별건) |

## 3. 데이터 흐름 (F)

```
맥: FCE(읽기 전용) + Bitget 조회 키 → TRADER-01 수집(최근 7일)
    → account(거래 · 일별 손익 · 시간가중 지수) · replica(TRADER-02 페이퍼) · rules(TRADER-02 산출물)
    → POST /api/me/ingest  (Authorization: Bearer ME_INGEST_TOKEN · 랩 토큰과 따로)
랩: MeSnapshot ─(쿠키)→ /api/me/compare · /me/compare
    엔진 열은 공개 랩 표(FceTrack · FceTrade · FceCapitalPoint · BTC 일봉)에서 그때그때
```

**공개 `/api/lab/*` 에 안 섞이는 이유** — 실계좌는 `MeSnapshot` 에만 있고, 그 표를 읽는 코드는 `lib/me` 뿐이다. `__tests__/me-isolation.test.ts` 가 소스로 강제한다: `MeSnapshot` 을 만지는 파일 · `lib/me` 를 import 하는 공개 파일 · 공개 상태 표시(sync) · 업로더가 보내는 주소 · `lib/me`/`api/me` 의 console 로그.

## 4. 같은 잣대

| 항목 | 광혁 | 엔진 | BTC |
|---|---|---|---|
| 기간 | 30 · 90 · 180일, 청산 시각 기준 | 같음 | 같음 |
| % | **시간가중**(장부 이체마다 끊어 곱한 지수, 업로더) | 자본곡선 변화(엔진은 입출금 없음) · 없으면 손익 ÷ 시작 자본 | 일봉 종가 |
| MDD | 지수에서 | 자본곡선에서 | 종가에서 |
| 비용 비중 | (수수료 + 낸 펀딩) ÷ \|비용 전 손익\| | 비용 ÷ \|비용 전 손익\| (ENG-02 정의) | — |
| 분포 | 손익 ÷ 증거금(없으면 명목 ÷ 레버리지) | FCE 증거금 대비 손익률 | — |
| 곡선 | 시작 1,000 | 시작 1,000 | 시작 1,000(점선) |

- **엔진 열**: `FceTrack` 중 주식 · 폴리마켓을 뺀 것 — 크립토 트랙이 늘면 자동으로 열이 는다
- **색**: 좋은 방향이 정해진 줄만(순손익 · 수익률 · PF · 승률 · 평균 이익/손실 · 손익비 · 최대 일손실 · MDD 는 높을수록, 비용 비중은 낮을수록). 거래 수 · 보유 · 레버리지는 칠하지 않는다. BTC 열 제외
- **맨 위 결론**: 시간가중 수익률이 가장 높은 쪽(광혁 · 복제 · 엔진). 순손익 줄은 광혁과 순손익 최고 엔진
- **가장 큰 차이**: 순손익 최고 엔진과 견줘 상대 차이가 가장 큰 항목(PF · 손익비는 비율의 로그 차이) + 그 항목 문장
- **같은 순간**: 같은 종목 · 같은 방향 · ±1시간이면 진입 ✅, 그 시각 같은 종목을 들고 있었으면 보유 중
- **오른쪽 꼬리**: 광혁 거래 상위 10% 문턱 이상으로 번 거래의 비중을 광혁 · 엔진 각각

## 5. 시험

- `apps/web/__tests__/me-compare.test.ts` (20) — 쿠키 서명 · 만료 · 위조 · 비밀번호 변경 · 잠금 5회/15분 · 비교표 열 · 시간가중 · 색 · 결론 · 가장 큰 차이 · 1,000 출발 · 달력 · 꼬리 · 따라간 비율 · 매매법
- `apps/web/__tests__/me-isolation.test.ts` (9) — 완료 1 · 2(위)
- `scripts/trader/tests/test_me_upload.py` — 올리는 모양이 서버 타입과 같다 · `--dry` 는 아무것도 안 보낸다
- 폰 390px 캡처(합성 데이터): 페이지 가로 넘침 0 · 비교표만 가로 스크롤 · 항목 · 광혁 열 고정

## 6. 한계

| | |
|---|---|
| 순손익(USDT) 칸 | 자본이 달라 절대 금액은 규모 차이가 섞인다 — 그래서 결론은 시간가중 % 로 낸다 |
| 엔진 % | 자본곡선은 실현 손익을 쌓아 되만든 것(`FceCapitalPoint`, 미실현 제외) — 광혁 지수도 지갑(실현) 기준이라 같은 결이다 |
| 갱신 | 실계좌는 맥이 켜져 있을 때 15분마다. 꺼지면 `실계좌 기준` 시각이 멈춘다 |
