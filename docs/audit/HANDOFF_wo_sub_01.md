# WO-SUB-01 인계 문서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-27 |
| 인계 대상 | WO-SUB-01 (펀더멘털 팩트 시트) 이후 담당 에이전트 |
| 선행 상태 | **WO-SUB-00 완료 — GO/NO-GO 판정 완료** |
| 판정 문서 | `docs/audit/DECISION_wo_sub_batch_gate.md` |

---

## 1. 결론부터 — 착수해도 되는가

**된다. 단 범위가 조정됐다.**

- 🟢 **KR**: 분기 재무 97.8% 확보 → PHASE 1~6 전면 착수 가능
- 🟡 **US**: 소스는 정상이나 **유니버스에 롱테일이 4종목뿐** → 팩트시트는 착수, 값 시각화는 종목별 게이팅
- 🔴 **컨센서스**: 매출 예상치 전 그룹 0% → PHASE 4 설계 재검토 필요

판정 근거와 후속 범위 조정표는 `DECISION_wo_sub_batch_gate.md` §3 을 그대로 따를 것.

---

## 2. WO-SUB-00 에서 완료된 것

| 산출물 | 경로 | 상태 |
|---|---|---|
| 카드 함량 기준선 | `docs/audit/BASELINE_substance_audit.md` | ✅ 실측 |
| 함량 원본 | 아티팩트 `substance-audit-raw` / `baseline_substance_raw.json` | ✅ |
| 행동 지표 기준선 | `docs/audit/BASELINE_behavior_metrics.md` | ⚠️ **수집 시작 전**(계측을 이번에 새로 심음) |
| 커버리지 실사 | `docs/audit/AUDIT_fundamental_data_coverage.md` | ✅ 실측 |
| 프로브 스크립트 | `scripts/audit/probe_fundamental_sources.ts` | ✅ |
| 법무 질의 | `docs/legal/QUESTIONS_securities_law_review.md` | ✅ 질의 목록(자문 미수임) |
| GO/NO-GO | `docs/audit/DECISION_wo_sub_batch_gate.md` | ✅ |

**추가로 심은 프로덕션 코드**(WO-SUB-00 §4-2 의 "없으면 계측을 먼저 심는다" 분기):

```
apps/web/lib/ux-telemetry.ts              적재·집계 (FeedContentCache 재사용, 신규 DDL 없음)
apps/web/app/api/fomo/ux-metrics/route.ts POST 수집 / GET 일자별 기준선
apps/fomo-web/lib/pickTelemetry.ts        배치 + pagehide beacon flush
QuietPickDeck / QuietPickDepth            7개 이벤트 배선
```

---

## 3. 반드시 알고 시작해야 할 실측 사실 5가지

이걸 모르고 설계하면 잘못된 방향으로 간다.

### ① KR 사업 설명은 이미 있다 — LLM 합성부터 하지 마라
네이버 `m.stock.naver.com/api/stock/{code}/finance/quarter` → `corporationSummary.comment1~3` 이 **한국어 3문장 요약**을 준다. 45종목 중 44종목 확보(97.8%).

WO-SUB-03 은 "LLM 배치 합성"을 전제하지만, **KR 은 원문이 이미 있으므로 3슬롯(어디서 버는가 / 무엇에 걸려 있나 / 그 대상은 지금 어떤가) 매핑을 먼저 시도할 것.** 합성은 그 다음이다.

### ② 매출 컨센서스는 무료 경로에 없다
- Nasdaq `analyst/earnings-forecast` → **EPS 예상만** (`quarterlyForecast.rows` / `yearlyForecast.rows`, 키: `consensusEPSForecast`, `noOfEstimates`). 이 필드는 **문자열로도 숫자로도 온다** — 타입 단정 금지.
- 네이버 `consensusInfo` → `recommMean`(투자의견) / `priceTargetMean`(목표주가)뿐. **목표주가는 우리 원칙상 사용 금지 값이다.**

→ PHASE 4 의 "실적 진한색 + 컨센서스 연한색" 막대는 **그대로 구현 불가**.

### ③ 미국 5년 일별 종가가 무료 경로에 없다 (0/11)
Nasdaq historical 은 요청해도 소수 행만 반환한다. → US 는 `valuation.band_5y.current_percentile` 을 계산할 수 없다. 스키마상 `null` + 사유 기록이 기본값이다.

### ④ 과거 카드 페이로드가 보존되지 않는다
원장 `selection` payload 에는 `hook`·`signalTypes`·`signal` 만 있다. 사업·재무·해석 필드 자리가 없어 **과거 카드 감사를 재현할 수 없다.**
→ WO-SUB-07 의 `factsheet_snapshot_hash` 를 설계할 때 **카드 페이로드 스냅샷 보존을 함께 넣을 것.**

### ⑤ 행동 지표 기준선이 아직 없다
계측을 이번에 처음 심었다. **배포 후 14일 수집 전에는 WO-SUB-04 의 A/B 를 시작할 수 없다.**
조회: `GET /api/fomo/ux-metrics?date=YYYY-MM-DD` (주말·평일 분리 집계할 것)

---

## 4. 도구 사용법 — 실측이 필요할 때

**개발 샌드박스는 외부 egress 가 차단(CONNECT 403)돼 있다.** 로컬에서 SEC·Nasdaq·네이버를 조회할 수 없다.
실측은 GitHub Actions 에서 돌린다:

```
.github/workflows/substance-audit.yml
  - push (claude/** 브랜치, scripts/audit/** 변경 시) 또는 workflow_dispatch
  - 러너에서 소스 도달성 → 키 구조 덤프 → §4-1 → §4-3 순으로 실행
  - 결과는 아티팩트 substance-audit-raw (JSON)
```

재사용 가능한 조각:
- `scripts/audit/universe.ts` — 시드 고정 표본 추출(`AUDIT_SEED=20260727`), 안전한 플래그 파서(`flag`/`numericFlag`)
- `scripts/audit/discover_source_keys.ts` — **판정 없이 응답 키 구조만 덤프.** 새 소스를 붙일 때 이걸 먼저 돌릴 것
- `scripts/audit/probe_fundamental_sources.ts` — 필드별 확보율. `unknown` 플래그로 "재보지 못함"과 "없음"을 구분한다

### 소스별 함정 (실측으로 확인된 것)
| 소스 | 함정 |
|---|---|
| Nasdaq | **브라우저 UA 필수.** 비브라우저 UA 는 차단된다 |
| Nasdaq summary | `PERatio`·`BookValue` **키가 없다.** PER 은 가격 × SEC EPS 로 계산해야 한다 |
| SEC XBRL | 주식수는 `us-gaap` 이 아니라 **`dei` 네임스페이스**에 있다. 전 네임스페이스를 훑을 것 |
| SEC company_tickers | 간헐 403 → 백오프 재시도 필요. 실패 시 US 필드를 "없음"이 아니라 **미확인**으로 처리할 것 |
| 네이버 | 시총·PER·PBR 은 `/basic` 이 아니라 **`/integration` 의 `totalInfos[]`** 에 있다. 업종은 `industryCode` |
| 네이버 | `trTitleList[].isConsensus` 는 **6개 컬럼 전부 true** 로 온다. "예상치 컬럼" 의미로 쓰지 말 것 |

---

## 5. 미해결로 넘기는 것

| 항목 | 상태 | 해소 방법 |
|---|---|---|
| DART 정기공시 | **미확인** (조회 0회) | `DART_API_KEY` 를 레포 Secrets 에 등록 → 워크플로 재실행(코드 변경 불필요) |
| KR EPS 컨센서스 | **미확인** | `isConsensus` 의미 확인 |
| 갱신 지연일수 | **미측정** | WO-SUB-01 백필에서 함께 측정 |
| 법무 자문 | **미수임** | WO-SUB-05 착수 전 1회 |
| 미국 유니버스 4종목 | **미해결** | 배치 밖 과제 — 수급 신호 수집 단계 |

---

## 6. 작업 규칙 (이 배치 공통, 반드시 유지)

1. **투자자문 금지** — 목표주가·매매의견·"저평가/고평가/싸다/비싸다/유망/추천" 전면 금지
2. **인과 단정 금지** — 시점 병기까지만
3. **가짜 숫자 금지** — 추정·보간·전분기 복사 금지. 없으면 `null` + `데이터 없음`
4. **출처·시각 명시** — 모든 수치에 `source` + `as_of`
5. **신뢰도 정직성** — 얇으면 얇다고 표시
6. **소스 종류 분리** — 공시/실적자료 ≠ 뉴스 ≠ 커뮤니티
7. **결정론** — 동일 입력 → 동일 출력. LLM 은 배치 합성만, 온도 0, 프롬프트 버전 기록
8. **테스트를 약화시키지 않는다** — 깨지면 코드를 고친다

### 이번 WO 에서 얻은 추가 규칙 하나
> **확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만들 것.**
> 추측한 키로 센 확보율은 커버리지가 아니라 잡음이다. 이 순서를 지키지 않아 실측을 6번 반복했다.

---

## 7. 브랜치·머지

- 작업 브랜치: main 최신에서 새로 분기
- 게이트: `npm run typecheck` / `npx vitest run` / `npm run build --workspace=@fomo/web`
- PR 생성 후 CI 그린 확인 → 머지 (광혁 지시: 에이전트가 머지까지 수행)
