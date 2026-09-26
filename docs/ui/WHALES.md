# UI-07 — 고래 결과 보고

지시서: `docs/wo/UI-07-whales.md` · 조립: `apps/web/lib/lab/whales.ts` · 화면: `components/tabs/WhalesBody.tsx` · `WhaleWalletBody.tsx`
FCE 읽기: `scripts/lab/fce-upload.ts` `whaleBoard` · `scripts/lab/fce-whale-report.py`

## 숫자가 바뀌었다 — 박아 둔 값을 버렸다

| | 전 (09-19 · 코드에 박힘) | 지금 (FCE · 같은 대조 표본) |
|---|---|---|
| 고래 승률 | 65.8% | **72.3%** (`follow_track.exit_comparison.gap.whale_win_pct`) |
| 우리 추종 승률 | 32.4% | **37.0%** |
| 갭 | 33.4%p | **35.3%p** |
| 반사실 (고래 청산을 따랐다면) | −49.58 (75건) · "원인 아님 — 따라가면 더 나빴다" | **+236.86 · 우리 −32.90 (99건) · `EXIT_B_BETTER`** |

반사실의 결론이 **뒤집혔다.** 다만 FCE 가 스스로 단서를 단다 — 우리 출구에 결함이 있다(`holding_bars` 가 봉이 아니라
잡 실행 횟수를 센다, 95건). "버그 있는 사다리 대 고래 청산" 의 비교라 확정이 아니다. 화면은 단서를 떼지 않는다.

`docs/lab/WHALE_GAP.md` 의 반사실 문단(−49.58)과 연구 01 제목의 숫자(65.8% · 32.4%)는 **09-19 의 기록**이다.
연구 노트는 정본이라 여기서 고치지 않았다 — 다시 쓸지는 광혁이 정한다.

## 어디서 오나 (전부 FCE)

| 칸 | FCE |
|---|---|
| ① 갭 · ⑤ 가설 | `/api/onchain/whales` `follow_track.exit_comparison.gap` (가설 3개 · 정합 여부) |
| ② 비교 · 반사실 | `exit_comparison.overall` · `verdict` · `hold_hours` · 추종 버킷(`follow/trades`) |
| ③ 추적 지갑 | `follow/eligibility` `passers` + `/api/onchain/whales` `wallets[].positions` · `recent_events` · `follow_track.whales` |
| ④ 깔때기 | `eligibility.funnel` — FCE `rejection_reason` 순서(유형 → 표본 → 승률)로 뺀다 |
| ⑥ 24시간 관측 | FCE `notification_state.json` `blocked_alerts` — `_whale_observation_line` 과 같은 집계 |
| ⑦ 리더보드 | FCE `observed_win_rates` · `selection_disclosure` — 일일 리포트 `whale_line` 과 같은 호출 |

⑥ ⑦ 은 FCE 가 API 로 내지 않고 일일 리포트 문장으로만 낸다. **FCE 자신의 함수를 FCE 파이썬으로** 부른다
(DB 는 `mode=ro`). 랩이 다시 계산하지 않고, FCE 레포는 건드리지 않는다.

## 지갑 주소 — 앞 6 · 뒤 4 만

- 업로더가 FCE 에서 받은 자리에서 줄인다(`shortAddress`). 상세 경로 열쇠도 앞뒤를 붙인 것(`/whales/0x020c5872`)
- 받는 쪽(`checkPayload`)이 40자리 주소를 보면 **업로드를 거절한다**
- 전에는 `/api/lab/whales` 가 통과 지갑의 **전체 주소**를 내보내고 있었다 — 읽는 자리에서도 줄인다
- **복사 버튼은 없다.** 복사할 전체 주소가 화면에 없어서다(하지 말 것이 우선)

## 모집단 문장

UI-FIX A-4 가 `모집단` 을 내부 용어로 막았지만 UI-07 이 두 문장을 필수로 정했다 — Hero 아래 경고, 리더보드 주석.
텍스트 예산 테스트가 **이 두 문장만** 예외로 둔다.

## 완료 확인

| # | | |
|---|---|---|
| 1 | Hero 가 갭 | ✅ 35.3%p (FCE 실측 — 지시서의 33.4 는 09-19 값) |
| 2 | 모집단 경고 한 줄이 Hero 아래 | ✅ 테스트 |
| 3 | 비교표에 반사실 | ✅ + FCE 단서 |
| 4 | 추적 지갑 + 통계 | ✅ 3개(지시서 예시는 2) · 승률 · N · 레버리지 범위 · 가장 큰 보유 |
| 5 | 깔때기 | ✅ 82 → 73 → 10 → **3** |
| 6 | 확인 중인 가설 | ✅ FCE 가설 3개 · 정합 여부 |
| 7 | 24시간 관측 | ✅ |
| 8 | 리더보드 모집단 주석 | ✅ |
| 9 | 실제 FCE 데이터 | ✅ |
| 10 | 30초 갱신 | ⚠️ 화면은 30초마다 다시 읽는다 · 값은 업로드(15분)마다 |
