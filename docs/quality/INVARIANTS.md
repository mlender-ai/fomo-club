# 품질 불변식 (WO-SUB-09)

> **생성 문서다. 직접 고치지 말 것.**
> 정본: `packages/fomo-core/src/invariants/registry.json`
> 생성: `npx tsx scripts/invariants-render.ts`

레지스트리 버전: `inv-v1.0.0`

WO-SUB-09 품질 게이트의 정본. docs/quality/INVARIANTS.md 는 이 파일의 생성물이다.

## 1. 현황

| ID | 내용 | 선행 조건 | 상태 |
|---|---|---|---|
| `INV-06` | 아키타입 금지 지표 미노출 | WO-SUB-02 완료 | ⏸ 유예 |
| `INV-08` | 수치 렌더 시 source + as_of 동반 | WO-SUB-01 완료 | ✅ 활성 |
| `INV-09` | 금지어 사전 | 무조건 | ✅ 활성 |
| `INV-11` | 경고문 강제 부착 | WO-SUB-02 완료 | ⏸ 유예 |
| `INV-12` | 결측 정직성 | WO-SUB-01 완료 | ✅ 활성 |
| `INV-14` | 렌더 경로에서 계산/LLM 임포트 금지 | WO-SUB-01 + 03 완료 | ✅ 활성 |

활성 4종 · 유예 2종.

## 2. 불변식별 상세

### INV-06 — 아키타입 금지 지표 미노출

아키타입의 forbidden_metrics 에 등재된 경로는 어떤 렌더 투영에도 나타나지 않는다.

- 상태: **유예** · 선행 조건: WO-SUB-02 완료
- 정본: `packages/fomo-core/src/archetype/doctrine.json#forbidden_metrics`
- 유예 사유: WO-SUB-02R 에서 카탈로그(유형 목록·금지 지표)가 바뀐다. 지금 쓰면 카탈로그 확정 후 다시 써야 하므로 02R 과 함께 활성화한다.

### INV-08 — 수치 렌더 시 source + as_of 동반

렌더 투영에 실리는 모든 수치는 field_sources 에 source 와 as_of 를 가진다. 없으면 투영에서 제외된다.

- 상태: **활성** · 선행 조건: WO-SUB-01 완료
- 정본: `packages/fomo-core/src/fundamentals/types.ts#FactSheet.field_sources`

### INV-09 — 금지어 사전

실체 배치가 생성한 모든 문장(사업 실체 슬롯·경고문·독트린 문안)은 투자자문·평가·인과·예측 어휘를 포함하지 않는다.

- 상태: **활성** · 선행 조건: 무조건
- 정본: `packages/fomo-core/src/invariants/banned-words.ts`
- 범위: 기존 apps/web/lib/copy-guards.ts 의 FORBIDDEN_COPY 는 DEV_CONSTRAINTS_LIFTED=true 로 해제된 상태다(docs/CONSTRAINT_OVERRIDE_DEV.md ACTIVE). 그 플래그는 기존 피드 카피의 제품 결정이므로 이 WO 에서 뒤집지 않는다. 대신 실체 배치 사전은 그 플래그와 무관하게 항상 켜져 있다 — 배치의 절대 규칙은 개발 편의로 해제할 수 있는 것이 아니다.

### INV-11 — 경고문 강제 부착

requires_warning_metrics 에 등재된 지표를 렌더할 때 해당 유형의 경고문이 함께 나간다.

- 상태: **유예** · 선행 조건: WO-SUB-02 완료
- 정본: `packages/fomo-core/src/archetype/doctrine.json#requires_warning_metrics`
- 유예 사유: INV-06 과 같은 이유 — 02R 에서 경고문 전종 문안이 재작성된다(사람 승인 게이트). 문안 확정 전에 부착 규칙을 고정하면 두 번 쓴다.

### INV-12 — 결측 정직성

missing_fields 에 등재된 경로는 렌더 투영에 값으로 나타나지 않는다. 이전 기간 값으로 메우는 것도 금지다.

- 상태: **활성** · 선행 조건: WO-SUB-01 완료
- 정본: `packages/fomo-core/src/fundamentals/missing.ts#collectMissingFields`

### INV-14 — 렌더 경로에서 계산/LLM 임포트 금지

렌더 경로는 저장된 레코드만 읽는다. 계산 조립·외부 fetch·LLM 호출을 임포트하지 않는다.

- 상태: **활성** · 선행 조건: WO-SUB-01 + 03 완료
- 정본: `apps/web/__tests__/lib/*-request-path-guard.test.ts`

## 3. 유예의 의미

`유예` 는 **방치가 아니다.** 사유가 적혀 있고, 그 사유가 해소되는 WO 가 지정돼 있다.
사유 없는 유예는 이 표에 들어올 수 없다(레지스트리 스키마가 막는다).
