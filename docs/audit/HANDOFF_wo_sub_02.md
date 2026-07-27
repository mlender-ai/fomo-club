# WO-SUB-02 인계 문서 (WO-SUB-01 완료 보고)

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-28 |
| 인계 대상 | `WO-SUB-02`(아키타입 분류기) · `WO-SUB-03`(사업 실체) 담당 에이전트 |
| 선행 상태 | **WO-SUB-01 완료** — 팩트시트 파이프라인 가동, 프로덕션 크론 배선 |
| 정본 | `docs/fundamentals/SPEC_factsheet.md` (스키마·계산 규칙) |
| 실측 | `docs/fundamentals/COVERAGE_dashboard.md` (56종목 전수 조회) |

---

## 1. 결론부터 — 착수해도 되는가

**된다.** 팩트시트는 전 유니버스에 존재하고, 결측은 `missing_fields` 에 정직하게 등재되어 있다.

- 🟢 **분류 입력(섹터·재무·마진)**: KR 분기재무 97.5% / US 87.5% / 업종 KR 97.5% · US 87.5%
- 🟡 **시클리컬 판정 입력(`margin.operating_stdev_8q`)**: US 50% / **KR 0%** — KR 은 8분기가 없다(§4)
- 🔴 **값의 상태(밴드 백분위)**: 전 종목 미계산. 원인이 시장별로 다르다(§4)

`WO-SUB-02` 의 분류 규칙 초안은 `stdev(operating_margin_8q) > θ_cyc` 를 시클리컬 판정에 쓴다.
**KR 에서 이 입력이 0% 다.** 규칙을 그대로 구현하면 국내 시클리컬(SK하이닉스·해운·화학)이 전부
다른 유형으로 떨어지거나 `UNCLASSIFIED` 가 된다. 착수 전에 §4 를 읽고 대안을 정할 것.

---

## 2. WO-SUB-01 에서 만든 것

| 산출물 | 경로 |
|---|---|
| 순수 계산(타입·TTM·밴드·파생·해시·결측) | `packages/fomo-core/src/fundamentals/` |
| 소스 어댑터(SEC XBRL·네이버·Nasdaq) | `apps/web/lib/fundamentals/{sec-xbrl,naver-fundamentals,nasdaq-fundamentals}.ts` |
| 조립·유니버스·저장소·배치 | `apps/web/lib/fundamentals/{build,universe,repository,refresh,coverage}.ts` |
| 배치 크론 | `GET /api/fomo/cron/fundamentals?limit=12` (vercel.json 21:45 UTC) |
| 커버리지 API | `GET /api/fomo/fundamentals/coverage` |
| 백필 스크립트 | `npm run fundamentals:backfill -- --dry --symbols "CLBK:US,185750:KR" --out docs/fundamentals` |
| 스펙 | `docs/fundamentals/SPEC_factsheet.md` |
| 커버리지 대시보드 | `docs/fundamentals/COVERAGE_dashboard.md` |
| DART 구조 덤프(파서 아님) | `scripts/audit/discover_dart_keys.ts` + `substance-audit.yml` 스텝 |

**팩트시트를 읽는 방법** (요청 경로에서 계산하지 말 것 — 테스트가 막는다):

```ts
import { readFactSheet } from "@/lib/fundamentals/repository";
const record = await readFactSheet("KR", "종근당");   // { factsheet, factsheet_hash } | null
```

---

## 3. 반드시 알고 시작해야 할 실측 사실 6가지

### ① KR 컨센서스는 있다 — WO-SUB-00 판정이 틀렸다
네이버 `trTitleList[].isConsensus` 는 boolean 이 아니라 **문자열 `"Y"`/`"N"`** 이다.
문자열 `"N"` 이 JS 에서 truthy 라서 WO-SUB-00 은 "6개 컬럼 전부 true → 의미 없음" 으로 판정했는데,
실제로는 **마지막 한 컬럼만 `"Y"`** 이고 그것이 예상치다.

- KR `consensus.revenue_fy1` **52.5%** · `consensus.eps_fy1` **55%** (실측)
- → `WO-SUB-04` 의 "실적 진한색 + 예상 연한색" 매출 막대는 **KR 에서 구현 가능하다.**
- US 는 여전히 매출 예상 부재(Nasdaq 은 EPS 예상만) — `consensus.revenue_fy1` 0/16.

`AUDIT_fundamental_data_coverage.md`·`DECISION_wo_sub_batch_gate.md` 상단에 정정을 달았다.

### ② 밴드 백분위는 아직 전 종목 미계산이다 — 시장별 원인이 다르다
| 시장 | 원인 | 해소 조건 |
|---|---|---|
| KR | 네이버 재무 표에 **공시일이 없어** 법정 제출기한을 쓴다 + 분기 5개 상한 → 유효 관측이 윈도우의 10~25% (하한 60%) | **DART**(§5) |
| US | **일별 종가 5년이 없다.** TwelveData 경로를 붙였으나 로컬 실측 환경에 키가 없어 0일로 측정됐다 | 프로덕션 크론 1회 실행 후 재측정 |

`WO-SUB-04` 는 `band_5y.*.sufficient` 로 종목별 게이팅하고, `insufficient_reason` 을 그대로 근거로 쓸 것.
**`sufficient: false` 인데 `current_percentile` 이 채워지는 경로는 코드상 존재하지 않는다**(테스트로 고정).

### ③ US TTM EPS 는 정상적으로 null 이다
SEC 는 **Q4 를 분기형 사실로 태깅하지 않는다**(10-K 가 연간을 보고). 그래서 `Q4 = 연간 − 1~3분기` 로 구성하는데,
EPS 는 분기별 희석주식수가 달라 차감이 정확하지 않으므로 **구성하지 않는다.**
US 밸류에이션은 `시가총액 ÷ TTM 총액` 으로 계산하므로 EPS 없이도 PER 이 나온다. EPS 를 쓰려 하지 말 것.

### ④ 은행은 `operating_income` 이 없다 — 결측이 아니라 사실이다
`OperatingIncomeLoss` 를 보고하지 않는다(CLBK·RBKB·IBM 실측). `margin.operating_*` 는 `null` 이다.
`WO-SUB-02` 의 `BANK_FINANCIAL` 은 P/B·ROE·순이자마진을 쓰므로 영향은 없지만,
**시클리컬 판정에 영업이익률을 쓰는 규칙이 은행에서 항상 실패**한다는 점은 알고 있어야 한다.

CLBK 는 PSR 2.37 · net_cash −966M 처럼 **은행에서 무의미한 값도 계산되어 저장된다.**
WO-SUB-01 은 저장까지만 한다(§3 범위 밖). **금지 지표를 가리는 것은 `WO-SUB-02`·`INV-06` 의 일이다.**

### ⑤ 외국 발행사는 통화 때문에 비어 있다
NVO(노보노디스크)는 SEC 에 **DKK 로 보고**한다. 통화 환산 금지(§4 규칙 3)라서 쓰지 않고,
`source_errors` 에 `"sec: 재무가 DKK 로 보고됨 — 통화 환산 금지 원칙상 사용 불가"` 를 남긴다.
`coverage_flag: "none"` 이지만 **레코드는 존재한다**(완료 조건 1).

### ⑥ KR 섹터 **이름**이 없다
네이버는 `industryCode`(숫자, 예 `261`)만 준다. `classification.sector` 는 `null` 이고 `industry` 에 코드가 들어간다.
`WO-SUB-02` 의 분류 규칙은 `sector in {Banks, Thrifts, …}` 같은 **이름 매칭**을 전제한다 —
KR 에서는 코드 → 업종명 사전이 필요하다. 없으면 KR 이 전부 `UNCLASSIFIED` 로 떨어진다.

---

## 4. WO-SUB-02 착수 전 결정해야 할 것

| # | 문제 | 선택지 |
|---|---|---|
| 1 | KR 시클리컬 판정 입력 부재(`operating_stdev_8q` 0%) | (a) DART 로 8분기 확보 후 착수 (b) 연간 3개년 영업이익률 표준편차로 대체(임계값 재튜닝 필요) (c) KR 은 업종 코드만으로 시클리컬 판정 |
| 2 | KR 업종 코드 → 이름 매핑 | (a) 코드 사전을 상수 파일로 추가 (b) 코드 자체로 분류 규칙을 쓰고 화면에는 이름을 안 쓴다 |
| 3 | 은행 판정 근거 | `classification.industry` 문자열(`"Savings Institutions"`·`"Major Banks"`)이 US 에는 있다. KR 은 #2 에 의존 |

**결정을 `DOCTRINE_archetype_frames.md` 에 버전과 함께 박제할 것.** 임계값이 바뀌면 과거 분류가 무효화되므로
판단 원장에 분류 버전을 함께 기록해야 한다(WO-SUB-02 원문).

---

## 5. DART — 이것이 KR 의 유일한 잠금이다

`DART_API_KEY` 는 **Vercel 런타임에는 있으나 GitHub Actions Secrets 에는 없다**(`gh secret list` 확인).
응답 구조를 한 번도 덤프하지 못했으므로 **파서를 쓰지 않았다** — WO-SUB-00 이 남긴 규칙
(*확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만들 것*)을 지킨 것이다.

**해소 절차 (1회)**

```bash
gh secret set DART_API_KEY --repo mlender-ai/fomo-club   # 값은 터미널에서 직접 입력
gh workflow run substance-audit.yml --repo mlender-ai/fomo-club
```

워크플로가 `docs/audit/dart_key_discovery.json` 을 아티팩트로 남긴다. 그 덤프를 근거로
`apps/web/lib/fundamentals/dart.ts` 를 쓰고 `build.ts` 의 KR 경로에서 네이버보다 우선하게 붙이면 된다.

**DART 가 열리면 풀리는 것**

| 지금 막힌 것 | 실측 확보율 | DART 로 해소되는 방식 |
|---|---|---|
| KR 8분기 | 5분기(네이버 상한) | 분기·반기·사업보고서를 연도별 조회 |
| KR 5회계연도 | 3년 | 동일 |
| KR `revenue_cagr_3y` | **0%** | 연간 관측 4개 확보 |
| KR `operating_stdev_8q`·`trend_8q` | **0%** | 8분기 확보 → §4 문제 1 해소 |
| KR 밴드 백분위 | 0% | `rcept_no` 앞 8자리 = 실제 접수일 → `filed_at_basis: "disclosed"` |
| KR 현금·차입금·이자비용 | 결측 | 전체 재무제표(`fnlttSinglAcntAll`) |

---

## 6. 미해결로 넘기는 것

| 항목 | 상태 | 해소 방법 |
|---|---|---|
| DART 재무·실공시일 | **미착수** | §5 |
| US 5년 종가 프로덕션 실측 | **미완** | 크론 1회 실행 후 `GET /api/fomo/fundamentals/coverage` 재확인 |
| US 배당수익률 | 0/16 | Nasdaq `summary` 에 `Yield`·`AnnualizedDividend` 키가 **없는 종목이 많다**(실측: IBM). 다른 소스 필요 |
| US 매출 컨센서스 | 무료 경로 부재(WO-SUB-00 유지) | `WO-SUB-04` 범위 결정 후 유료 소스 검토 |
| KR 섹터 이름 | 결측 | §4 문제 2 |
| 미국 유니버스 16종목 | **미해결**(배치 밖) | 수급 신호 수집 단계 — WO-SUB-00 §4 와 동일 |
| 행동 지표 기준선 | 수집 시작 전 | 배포 후 14일 (WO-SUB-04 A/B 선행 조건) |
| 법무 자문 | 미수임 | WO-SUB-05 착수 전 1회 |

---

## 7. 작업 규칙 (배치 공통 — 유지)

1. **투자자문 금지** — 목표주가·매매의견·"저평가/고평가/싸다/비싸다/유망/추천" 전면 금지
2. **인과 단정 금지** — 시점 병기까지만
3. **가짜 숫자 금지** — 추정·보간·전분기 복사 금지. 없으면 `null` + `데이터 없음`
4. **출처·시각 명시** — 팩트시트는 `field_sources["<필드 경로>"]` 로 준다. 렌더할 때 반드시 함께 쓸 것
5. **신뢰도 정직성** — `missing_fields` 에 있는 필드를 값으로 렌더하지 말 것(INV-12)
6. **소스 종류 분리** — 공시/실적자료 ≠ 뉴스 ≠ 커뮤니티
7. **결정론** — LLM 은 배치 합성만, 온도 0, 프롬프트 버전 기록
8. **테스트를 약화시키지 않는다**

### WO-SUB-01 에서 얻은 규칙 하나
> **키 이름만 덤프하지 말고 값의 타입까지 확인할 것.**
> WO-SUB-00 은 키를 실측했지만 `isConsensus` 의 **값이 문자열**이라는 걸 놓쳐 "KR 컨센서스 없음"을 박제했다.
> `typeof` 를 찍는 데 드는 비용은 0이고, 틀린 판정은 배치 하나의 설계를 바꾼다.

---

## 8. 브랜치·머지

- 작업 브랜치: main 최신에서 새로 분기
- 게이트: `npm run typecheck` / `npx vitest run` / `npm run build --workspace=@fomo/web`
- PR 생성 후 CI 그린 확인 → 머지
