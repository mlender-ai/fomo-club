# Development Quality Guardrails

> 목적: 한 버그를 고치며 다른 핵심 경험을 깨뜨리는 회귀를 막는다. 특히 발견 덱은 제품의 첫인상이므로, 작은 수정도 아래 불변식을 먼저 확인한다.

## 1. 작업 전 고정 절차

1. `docs/PRODUCT_VISION.md`를 최상위 정본으로 보고, `docs/PRODUCT_TRUTH.md`, `docs/DATA_ENGINE_STRATEGY.md`, `docs/KEYWORD_ENGINE_SPEC.md`, `docs/AGENT_REDESIGN.md`, `docs/SECURITY_CHECKLIST.md`, `AGENTS.md`, `CLAUDE.md`를 현재 작업 범위에 맞게 확인한다.
2. 바꿀 것과 바꾸지 않을 것을 PR 본문 또는 HANDOFF에 적는다. 사용자가 지시하지 않은 UX, 카피, 정렬, 로딩 방식은 임의로 바꾸지 않는다.
3. 코드 작성 전 게으름 사다리를 적용한다. 기존 함수, 타입, 테스트, 스크립트를 먼저 찾고 최소 변경으로 해결한다.
4. 변경 전 원인과 변경 후 기대 결과를 하나의 문장으로 고정한다. 예: "카드가 가격-only로 퇴보했다 -> 앞단 카드의 가격-only 훅을 게이트에서 실패시킨다."
5. 데이터가 없으면 지어내지 않는다. 대신 fallback, confidence, fail-closed 동작을 명시한다.

## 2. 제품 불변식

아래 항목은 디자인 취향이 아니라 제품 정체성이다.

- 발견 표면은 종목 카드 전용이다. 테마, 매크로, 뉴스 카드를 독립 카드로 섞지 않는다.
- 발견 카드는 추천, 매수, 매도, 목표가, 예측으로 읽히면 안 된다.
- 카드 훅은 "왜 볼지"를 말해야 한다. 앞단 카드가 단독 가격 등락률 문장으로 채워지면 실패다.
- "오늘 가격이 +30.0% 움직였어요" 같은 가격-only 훅은 앞단 카드에 노출하지 않는다.
- 카드 칩은 KOSPI/KOSDAQ 같은 시장명이 아니라 업종, 테마, 섹터여야 한다.
- 삼성전자, SK하이닉스, NAVER 같은 유명주는 덱에 들어올 수 있지만 첫 묶음을 독점하면 안 된다.
- 발견 덱은 기본 50장을 목표로 한다. 카드 수 변경은 별도 제품 결정 없이 하지 않는다.
- 최초 입장, retry, stale cache에서 빈 화면으로 멈추면 실패다.
- 시장 온도는 "데이터 수집 중"에 무기한 머물면 실패다. 이전 값 또는 안전한 fallback을 보여준다.
- 뎁스는 카드에서 본 이유를 가격, 차트, 원문 근거로 나눠 확인하게 해야 한다. 기본 지표 누락은 원인을 해결한다.

## 3. 발견 덱 자동 게이트

발견 덱, 카드 훅, 카드 정렬, 섹터 라벨, discovery API, depth reason을 건드리면 반드시 실행한다.

```bash
npm run guard:discovery
```

이 게이트는 현재 코드로 만든 발견 덱을 검사한다. 네트워크가 막힌 환경이나 고정 fixture 검증에는 JSON을 넘겨 실행한다.

```bash
DISCOVERY_GATE_JSON=/tmp/discovery.json npm run guard:discovery
DISCOVERY_GATE_URL=https://fomo-web-mlender-ais-projects.vercel.app/api/fomo/discovery npm run guard:discovery
```

기본 실패 조건:

- 카드 수가 50장 미만
- 앞단 카드에 가격-only 훅 또는 "공개 재료 확인 안 됨" 문장이 있음
- 앞단 카드 칩이 KOSPI/KOSDAQ 같은 시장명임
- 앞단 카드에 유명주 blocklist가 들어옴
- 앞단 카드에서 같은 이유 문장이 과도하게 반복됨
- 금칙어(매수, 매도, 목표가, 급등임박, 추천 등)가 노출됨

게이트가 실패하면 테스트를 약화하지 말고 제품 회귀를 고친다. 예외가 필요하면 PR 본문에 이유와 사용자 승인 여부를 남긴다.

## 4. 변경 범위별 필수 검증

| 변경 범위 | 필수 검증 |
| --- | --- |
| 발견 덱/카드/정렬/훅 | `npm run guard:discovery`, 관련 vitest, production 또는 local API smoke |
| 뎁스 화면 | 카드 이유가 depth에 전달되는지, 기본 지표가 누락되지 않는지, 가격/차트/근거 섹션이 모순 없는지 확인 |
| 시장 온도 | API 실패, stale cache, cold start에서도 무한 "데이터 수집 중"이 없는지 확인 |
| copy/문장 | 투자조언 금칙어, 가격-only 회귀, 원문 없는 재료 생성 여부 확인 |
| 데이터 수집/API | timeout, CORS, cache, empty response, fail-closed 동작 확인 |
| UI layout/font | 모바일 390px, 긴 종목명, 긴 이유 문장, 하단 브라우저 바에서 잘림 확인 |

## 5. PR/HANDOFF에 남길 것

모든 PR은 아래를 요약한다.

- 사용자의 원래 불만과 직접 연결되는 수정점
- 바꾸지 않은 영역
- 실행한 게이트와 결과
- 발견 덱 상위 샘플 또는 품질 수치
- 남은 위험과 fallback

HANDOFF 예시:

```text
HANDOFF
- 목표: 발견 덱 가격-only 회귀 방지
- 한 일: guard:discovery 추가, AGENTS/CLAUDE/PR 템플릿 연결
- 안 한 일/막힌 곳: CI 필수 단계 연결은 별도
- 다음 액션: 발견 덱 변경 PR마다 guard 결과 첨부
- 검증: npm test -- scripts/__tests__/discovery-regression-gate.test.ts, npm run guard:discovery
- SSOT 변경: DEVELOPMENT_QUALITY_GUARDRAILS 신규
```

