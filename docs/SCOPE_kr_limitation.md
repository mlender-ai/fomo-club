# KR 범위 한계 — 공식 확정 기록 (WO-SUB-03.5 PART E-1)

| 항목 | 값 |
|---|---|
| 등재일 | 2026-07-29 |
| 판정 | **시나리오 2 — DART 미확보 (현 상태 유지)** |
| 재판정 조건 | `DART_API_KEY` 를 GitHub Actions Secrets 에 등재 |

> WO 지시: *"둘 중 하나를 문서에 확정 기록한다. `미확인`으로 남기지 않는다."*

---

## 1. 왜 시나리오 2인가 — 키 확보 상태 실측

| 환경 | `DART_API_KEY` | 확인 방법 |
|---|---|---|
| Vercel 프로덕션 런타임 | **있음** | `apps/web/lib/dart-disclosures.ts` 가 이미 사용 중(내부자 공시 경로 동작) |
| GitHub Actions Secrets | **없음** | `gh secret list` (2026-07-29) |
| 로컬 개발 환경 | **없음** | `.env` 조회 |

`WO-SUB-02R` 문서는 §0-3 에서 *"DART 키가 확보되어 KR 재무가 열렸다"* 를 전제하지만,
**에이전트가 실행할 수 있는 환경 어디에도 키가 없다.** 재백필도 구조 덤프도 불가하다.

`WO-SUB-00` 이 남긴 규칙 — *확보율을 세기 전에 응답 구조를 먼저 덤프해 근거를 만들 것* — 때문에
응답을 보지 못한 상태로 DART 파서를 쓰지 않는다. 추측 파서는 프로덕션에서만 깨진다.

## 2. 현재 KR 종목에서 제공하지 못하는 것

```
사업 실체(WO-SUB-03)
  - 슬롯 2(무엇에 걸려 있나) : 네이버 corporationSummary 3문장에 해당 정보가 없다
  - 슬롯 3(그 대상의 현재 상태) : 슬롯 2 가 없으면 변수 매핑 대상이 없어 연쇄로 빈다
  - 사업 정보 확보 수준 배지 상한 : 낮음 (공시 근거가 없어 '충분' 을 주지 않는다)

팩트시트(WO-SUB-01)
  - 분기 관측 5개 (네이버 상한, 8분기 필요)      → margin.operating_stdev_8q = 0%
  - 연간 관측 3개 (4개 필요)                    → growth.revenue_cagr_3y = 0%
  - margin.trend_8q                            → 전 종목 unknown
  - 밴드 백분위(band_5y.*.current_percentile)   → 실공시일이 없어 유효 관측 10~25%
  - 현금·차입금·이자비용                         → 네이버 표에 없음

아키타입(WO-SUB-02)
  - stdev_confirmed: false 14건 (연간 3개년으로는 통계를 신뢰하지 않는다)
  - cagr_3y 결손으로 QUALITY_COMPOUNDER·MATURE_INCOME 규칙이 KR 에서 발동하지 못함 (미분류 13건)
```

**영향 범위**: 유니버스 기준 KR 비중. WO-SUB-00 표본은 KR 45 / US 4(92%),
WO-SUB-01 실측 유니버스는 KR 40 / US 16(71%), 프로덕션 전체 유니버스는 285종목.
어느 기준으로도 **KR 이 다수**이며, 위 결손이 제품의 주 사용 구간에 걸린다.

## 3. 해소 절차 (1회)

```bash
gh secret set DART_API_KEY --repo mlender-ai/fomo-club   # 값은 터미널에서 직접 입력
gh workflow run substance-audit.yml --repo mlender-ai/fomo-club
```

워크플로가 `scripts/audit/discover_dart_keys.ts` 로 **판정 없이 구조만** 덤프하고
`docs/audit/dart_key_discovery.json` 을 아티팩트로 남긴다. 그 덤프를 근거로 파서를 쓴다.

해소되면 위 결손이 한꺼번에 풀리고, `WO-SUB-02R`(카탈로그 재도출)의 착수 조건도 함께 충족된다.

## 4. 이 문서의 성격

이건 "나중에 하자"가 아니라 **현재 제품이 무엇을 못 하는지의 공식 기록**이다.
`미확인` 으로 두면 하위 WO 가 있다고 가정하고 설계하게 된다 — `WO-SUB-05` 의 4축 중
'사업 체력' 축이 KR 다수에서 비는 것이 그 예다(PART E-2 참조).
