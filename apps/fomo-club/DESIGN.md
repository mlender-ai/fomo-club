# FOMO Club (fomo-club) — DESIGN.md

이 앱의 디자인 시스템 계층 — **상위가 이긴다.**

1. **`../../docs/design/DS-00_TOKENS.md`** — 기반 토큰·원칙 정본(v2). 색·타이포·간격·형태·터치·금지 목록
2. `../../docs/DESIGN.md` — 모션·모티프·컴포넌트·보이스 (DS-01~06 도착 시 그쪽으로 이관)
3. `../../design/tokens.json` 의 `ds` 블록 — 기계가독 소스(DTCG)
4. 코드 토큰: `constants/fomoTheme.ts` (`DS` export)

핵심: 순수 검정 배경 + 무채색 + **accent `#D4FF3F`는 화면당 1회(우리 성적 자리)**. 수치는 mono, 문장은 Pretendard.
등락에 색을 쓰지 않는다(상승=흰색, 하락=`down` 회색). 그림자·그라데이션·글로우·이모지·라이트 모드 없음.
현재 데이터로 채울 수 없는 UI는 자리도 만들지 않는다.

- Figma 왕복/MCP: `../../docs/FIGMA_WORKFLOW.md`
- v1 기록: `../../docs/legacy/DESIGN_FOMO.md`
