# 행동 지표 기준선 (WO-SUB-00 §4-2)

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-27 |
| 상태 | **기준선 미확정 — 계측을 이번 WO 에서 새로 심었다** |
| 근거 커밋 | `feat(analytics): WO-SUB-00 §4-2 행동 계측` |

---

## 1. 결론 먼저

**기준선을 계산할 원천 데이터가 존재하지 않았다.**
WO-SUB-00 §4-2 는 "이벤트가 이미 계측되고 있는지 코드에서 확인한다. **없으면 이 WO 안에서 계측을 먼저 심는다**"고 했고, 확인 결과가 후자였다.

수치를 추정으로 채우지 않는다. 기준선은 계측 배포 후 14일 수집으로 확정한다.

---

## 2. 계측 실사 결과 (코드에서 직접 확인)

라이브 홈 화면은 `HomeView → QuietPickDeck` 이다. 이 경로에서 서버로 나가는 행동 신호는 **0건**이었다.

| 확인 대상 | 파일 | 실제 상태 |
|---|---|---|
| `recordTaste("stock", …)` — 픽 덱이 스와이프마다 호출 | `apps/fomo-web/lib/fomoApi.ts` | **no-op 스텁.** WO-M1 에서 본문이 제거되고 인자를 `void` 처리만 한다. 호출부만 남아 있어 계측되는 것처럼 보였다 |
| `discoveryMetrics` | `apps/fomo-web/lib/discoveryMetrics.ts` | `sessionStorage` 에만 기록. **전송 경로 없음** |
| 원장 `user_action`(seen/pass/star/depth) | `apps/fomo-web/lib/discoveryPerformance.ts` | 서버 적재는 되지만 호출부가 `StockSwipeDeck`(구 발굴 덱)뿐. **QuietPickDeck 에서는 호출되지 않는다** |

즉 현재 홈에서 사용자가 무엇을 보고 얼마나 머물고 어디서 이탈하는지에 대한 서버측 기록이 없다.

### WO 요구 이벤트 대비 (계측 전)

| 요구 이벤트 | 계측 전 | 계측 후(이번 WO) |
|---|---|---|
| `card_view` | 없음 | 추가 — 위치 포함 |
| `card_dwell` | 없음 | 추가 — 카드 전환 시 확정 |
| `card_detail_open` | 없음 | 추가 — 진입점(탭/버튼) 구분 |
| `detail_scroll_depth` | 없음 | 추가 — 최대 도달 비율 |
| `card_watchlist_add` | 없음 | 추가 |
| `deck_complete` | 없음 | 추가 — 소비 카드 수 |
| `card_skip` | 없음 | 추가 — 위치 포함 |

---

## 3. 심은 계측의 구조

```
QuietPickDeck / QuietPickDepth
      └─ lib/pickTelemetry.ts     배치(8건) + 4초 타이머 + pagehide/visibilitychange beacon flush
             └─ POST /api/fomo/ux-metrics
                    └─ FeedContentCache  키: ux-metrics:{date}:{sessionId}
      GET /api/fomo/ux-metrics?date=YYYY-MM-DD  → 일자별 집계
```

설계 판단
- **세션당 한 행.** 한 행에 몰아 쓰면 동시 갱신에서 read-modify-write 경합으로 카운트가 유실된다.
- **신규 DDL 없음.** 기존 JSONB KV(`FeedContentCache`) 재사용.
- **분모가 0이면 비율은 `null`.** 0% 로 표기하면 "측정했는데 0"과 "측정 자체가 없음"이 구분되지 않는다.
- **실패는 삼킨다.** 계측 오류가 사용자 흐름을 막지 않는다(POST 는 항상 200).
- 개인정보: 카운터·세션 식별자·위치만. 원문 텍스트나 종목별 개인 이력은 보내지 않는다.

---

## 4. 기준선 산출 절차 (계측 배포 후)

1. 배포 후 **14일** 수집. 주말·평일을 **분리 집계**한다(요일 효과를 뭉개지 않는다 — WO 명시).
2. `GET /api/fomo/ux-metrics?date=…` 를 날짜별로 조회해 아래 표를 채운다.
3. 표본이 적은 날은 표본수를 함께 적고, 합산으로 덮지 않는다.

| 지표 | 산식 | 값 |
|---|---|---|
| 카드당 체류시간 중앙값 / p90 | `card_dwell` 백분위 | *(수집 후)* |
| `더보기` 클릭률 | `card_detail_open / card_view` | *(수집 후)* |
| 디테일 스크롤 깊이 p50 / p90 | `detail_scroll_depth` 백분위 | *(수집 후)* |
| 관심 등록률 | `card_watchlist_add / card_view` | *(수집 후)* |
| 덱 완주율 | `deck_complete / (위치 1 노출)` | *(수집 후)* |
| 카드 위치별 이탈률 | `card_skip@n / card_view@n` | *(수집 후)* |

---

## 5. 이 결과가 이후 페이즈에 미치는 영향

- `WO-SUB-04`의 **A/B 는 기준선 수집 완료 전에 시작할 수 없다.** 비교 기준이 없으면 "좋아졌다"를 증명할 수 없다.
- 배치 전체 성공 판정표의 행동 지표 목표치(스크롤 깊이 +40%, 더보기 클릭률 +30%)는 **기준선 확정 후 재설정**한다. 현재 숫자는 방향 표시일 뿐이다.

---

## 6. 한계

- 계측은 **앞으로 발생하는 행동만** 잡는다. 과거 30일을 소급 복원할 방법은 없다.
- 세션 식별자는 브라우저 로컬 기준이라 기기·브라우저가 바뀌면 다른 세션으로 집계된다. 절대값보다 **개선 전후 비교**에 쓰는 것이 맞다.
- 체류시간은 카드 전환 시점에 확정하므로, 마지막 카드를 보다가 탭을 닫으면 beacon flush 에 의존한다. 유실 가능성이 0은 아니다.
