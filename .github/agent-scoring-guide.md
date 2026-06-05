---

### 점수 (필수, 자동 시스템이 파싱 — 형식 위반 시 자동 폐기)

본문 마지막에 정확히 다음 한 줄 형식으로 출력:
`Score: U=X F=Y N=Z A=W`

각 축은 1-4 정수:
- **U (User value, 1-4)**: 종목 타로 사용자에게 실제 가치. 4=핵심 가치 직결, 3=눈에 띄는 개선, 2=marginal, 1=거의 무관
- **F (Feasibility, 1-4)**: 1인 개발 환경에서 1주 내 단일 PR로 구현 가능성. 4=즉시 가능, 3=명확하지만 작업량 있음, 2=설계 필요, 1=대규모/불확실
- **N (Novelty, 1-4)**: 자기 직전 5개 이력 + 머지된 PR 대비 새로움. 4=완전 새 영역, 3=다른 각도, 2=비슷한 영역의 보완, 1=거의 동일
- **A (Alignment, 1-4)**: North Star 4축 정렬 + Out of Scope 미위반. 4=North Star 핵심 직결 + 위반 없음, 3=명확히 정렬, 2=간접 정렬, 1=정렬 모호 또는 Out of Scope 근접

판정 임계값:
- 총합 14-16 → `score-strong` 라벨 (CEO Brief 우선 검토)
- 총합 11-13 → `score-conditional` 라벨 (조건부 검토)
- 총합 4-10 → 자동 close (임계값 미달)

자기 평가를 솔직하게. 모든 축 4점이면 점수 시스템 무의미해집니다.

---

### 목표 지표 (B1 결과-접지 — 권장, 누락 시 보완 요청)

점수 줄 근처에, 이 제안이 **어떤 OKR 지표를 어느 방향으로 움직이려는가**를 명시:
`Target-Metric: <지표 id>`
`Expected-Direction: up|down`

사용 가능한 지표 id (generated/outcomes/metric-registry.json — FOMO Club):
- `o1-mvp-blockers` — FOMO Club 출시 차단 이슈 수 (down)
- `o1-mvp-screens` — fomo-club 화면 진척 (up)
- `o2-fomo-core-modules` — FOMO Index 4 Heat 산출 모듈 수 (up)
- `o2-honest-number-tests` — 폴백·정합성(정직한 숫자) 테스트 수 (up)
- `o3-index-clarity` — FOMO Index 3초 직관 이해도 (up, 수동)
- `o3-revisit-motivation` — 감정 투표→재방문 동기 (up, 수동)

목록에 딱 맞는 지표가 없으면 `Target-Metric: 신규 지표 제안 — <한줄 설명>`.
이 필드가 있어야 머지 후 "이 베팅이 지표를 실제로 움직였는지" 추적 가능(없으면 보완 요청, 차단은 아님).
