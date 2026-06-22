# 에이전트 재설계 방향 (AGENT_REDESIGN)

| | |
|---|---|
| **언제** | Phase C(수집 확장) 완료 후 착수 |
| **왜** | 멈춰둔 에이전트들이 (1) 옛 정체성(감정 시각화·타로·자율기획)에 묶여 있고 (2) 지금 방향(데이터 엔진 고도화)과 안 맞음 |
| **원칙** | 에이전트는 **내가 약한 곳**(리서치·소스발굴·정합성·백엔드 모니터링)을 메운다. **내가 강한 곳**(디자인·UX·PM/PO·기획)은 직접 한다. |
| **선행 문서** | **PRODUCT_VISION(정체성 정본·SSOT)** / PRODUCT_TRUTH / KEYWORD_ENGINE_SPEC / DATA_ENGINE_STRATEGY |

> ⚠️ 정체성 정본은 `docs/PRODUCT_VISION.md`(주식시장의 틴더 v5 — 두 표면·한 엔진). 에이전트 작업 범위는 **발견 척추**(종목 카드·포모 점수·💎·취향 매칭·발굴 성적표)가 우선이고, 콘텐츠 표면은 후속. **자동 거부**: 발견 표면에 비종목 카드 섞기 / 포모 점수·TA 독립 진열 / 💎·점수에 예측·매수신호 / 매칭을 "사도 되는 자리"로 표현 / BM에 제품 맞추기 / 옛 정체성(마스코트·감정 진정·투표) 회귀. (PRODUCT_VISION §12)

---

## 1. 현재 레포 진단 (실제 코드 기준)

에이전트가 **두 시스템**으로 나뉘어 있다.

### A. GitHub Actions 자율 조직 (`.github/agents/` + workflows)
7개 페르소나(CEO·CTO·PM·Researcher·Security…)가 cron 으로 "매일 회의 → 프로젝트 제안 → 자동 구현"하는 **자율 기획 조직**.
- **문제 1 — 옛 정체성에 묶임**: CEO/Researcher 페르소나가 전부 "감정 시각화 / FOMO Index / 마스코트 포모 / 타로 보존"으로 정의됨(2026-06-05 리포지셔닝 기준). 우리가 지금 폐기·진화시킨 방향("위로 아님 / 파편 정보 응축 / 취향 피드 / 데이터 엔진")과 **정면으로 안 맞음**.
- **문제 2 — 자율 기획 자체가 지금 방향과 안 맞음**: CEO 페르소나가 "나는 결정한다, 자율적으로 제품을 발전시킨다"라고 정의됨. 그런데 지금은 방향이 명확해서(데이터 엔진 고도화) 에이전트가 "뭘 만들까"를 제안하면 안 된다. 기획은 광혁(PM/PO)이 한다.
- **이미 정지됨**: idea-proposal·propose-project·propose-northstar 등 자율 기획 워크플로는 이전에 멈춤(pause-agent-prs). 재가동하지 않는다.

### B. Claude Code 서브에이전트 (`.claude/agents/`)
17개. 코드 작업 보조(code-reviewer·build-error-resolver·refactor-cleaner·tdd-guide…)와 도메인 검증(regulation-reviewer·pm-reviewer·po-validator·mascot-keeper…).
- **쓸 만한 것**: regulation-reviewer(투자조언 금칙어 검사), code-reviewer, build-error-resolver, auto-qa-web. 이건 방향 무관하게 유용.
- **옛 정체성에 묶인 것**: mascot-keeper(포모 마스코트), idea-generator(자율 발산), lovable-reviewer 등 — 지금 방향과 약하거나 안 맞음.
- **갱신 필요**: regulation-reviewer 가 아직 "FOMO Index 면책 / 마스코트 멘트"를 대상으로 봄. 지금 구조(키워드 카드·이해 레이어 코멘트)로 갱신 필요.

---

## 2. 재설계 3원칙

1. **약한 곳 위임 / 강한 곳 직접**. 에이전트 = 리서치·소스발굴·뉴스정합성·백엔드 모니터링·규제검증. 광혁 직접 = 디자인·UX·카피·PM/PO·기획·방향.
2. **자율 기획 폐기, 실행·검증·발굴로 전환**. 에이전트가 "뭘 만들까"를 제안하지 않는다. "정해진 방향(SSOT) 안에서 실행하고, 검증하고, 재료를 발굴"한다.
3. **SSOT 거버넌스로 묶는다**. 모든 에이전트는 4개 SSOT 문서를 읽고 그 안에서만 움직인다. "위로 톤으로 바꾸자 / 토스 긁자 / 마스코트 살리자" 같은 폐기된 방향으로 못 흐르게.

---

## 3. 끌 것 / 고칠 것 / 만들 것

### 끌 것 (재가동 금지)
- GitHub Actions 자율 기획 일체: idea-proposal, propose-project, propose-northstar, project-kickoff/decompose/progress, autonomy-report, slack-retro.
- `.github/agents/` 7 페르소나 자율 조직(CEO 등). 정지 유지. (삭제는 보류 — 참고용 보존, 단 cron 비활성.)
- `.claude/agents/` 중 옛 정체성: mascot-keeper, idea-generator, lovable-reviewer.

### 고칠 것 (유지하되 SSOT 기준으로 갱신)
- **regulation-reviewer**: 대상을 "FOMO Index 면책·마스코트 멘트" → "키워드 카드 코멘트·이해 레이어 강세/약세·커뮤니티 워딩"으로 갱신. 투자조언 금칙어 + 워딩 필터 가드 통합.
- **code-reviewer / build-error-resolver / auto-qa-web / tdd-guide**: 방향 무관 유용. 유지, SSOT 참조만 추가.
- **doc-updater**: SSOT 4문서 동기화 담당으로 명확화.

### 만들 것 (내가 약한 곳 — 데이터 엔진 방향)
1. **소스 발굴 에이전트** — 광혁이 레퍼런스 이미지로 직접 하던 일 자동화. "한국 4060/개미 새 커뮤니티·채널", "무료 공신력 데이터 소스(FRED·Yardeni류)"를 주기적으로 훑어 후보 + tier 제안. DATA_ENGINE_STRATEGY §4.5 소스 지도를 살찌움. **제안만, 추가는 광혁 승인.**
2. **뉴스/소스 정합성 에이전트** — grounding 파수꾼. 수집물이 진짜인지·찌라시인지·tier 가 맞는지 검증. 워딩 필터 1차 게이트.
3. **파이프라인 모니터링 에이전트** — 스크래퍼 깨짐(소스 구조 변경 잦음)·수집량 급감·가공품질 저하 감시·자동 보고. C 이후 자율 수집의 안전망.
4. (후순위) **마케팅/SNS 에이전트** — PRODUCT_VISION 카드레터 전략. 출시 가까워질 때.

---

## 4. 거버넌스 (Simulo 방식 차용)

광혁이 Simulo 에서 만든 거버넌스(CLAUDE.md·AGENTS.md·MEMORY.md…)와 같은 원리.
- 각 에이전트 정의 상단에 "이 에이전트는 [SSOT 문서]를 읽고 그 안에서만 움직인다" 명시.
- 폐기된 방향 블랙리스트: 위로/감정진정 톤, 토스 스크래핑, 마스코트 부활, 자율 기획, 투자조언.
- 에이전트 출력은 "제안 + 근거"까지. 실행(머지·추가·방향변경)은 광혁 또는 정해진 자동머지 정책(DATA_ENGINE_STRATEGY §5.5).

---

## 5. 착수 순서 (C 완료 후)

```
1. 진단 갱신: C 를 겪으며 "뭐가 자주 깨졌나"를 관찰 → 모니터링 에이전트 우선순위 확정
2. 끌 것 정리(자율기획 cron 완전 비활성 확인) + 옛 정체성 에이전트 정리
3. 고칠 것(regulation-reviewer 등 SSOT 기준 갱신)
4. 만들 것: 소스발굴 → 정합성 → 모니터링 순 (1개씩, 검증하며)
5. 거버넌스 묶기: 전 에이전트 SSOT 참조 + 블랙리스트 박기
```

> 핵심: C 를 먼저 겪어야 "어떤 에이전트가 진짜 급한지"가 데이터로 드러난다.
> 지금은 이 방향만 박아두고, C 진행 중 "자주 깨지는 것 / 자주 막히는 것"을 관찰해 둘 것.
