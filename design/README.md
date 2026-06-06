# FOMO Club — Design Tokens (DTCG)

`tokens.json` = FOMO Club 디자인 토큰의 **기계가독 단일 소스**(W3C DTCG 포맷). Figma ↔ DESIGN.md ↔ 코드의 교환 허브.

## 왕복(round-trip) 흐름

```
        ┌─────────────────────────────────────────────────────┐
        │                  design/tokens.json (DTCG)           │
        │                  ── 단일 소스 ──                      │
        └───▲───────────────────┬───────────────────────┬─────┘
            │                    │                       │
   (Figma Variables)     (DESIGN.md frontmatter)   (코드: Tailwind/fomoTheme/@fomo/core)
   Tokens Studio /        docs/DESIGN_FOMO.md        apps/fomo-web, apps/fomo-club, packages/fomo-core
   Variables API /        (사람+에이전트 읽기)
   Figma MCP
```

- **Figma → 토큰**: 사용자가 Figma로 디자인 후 Variables를 ① Tokens Studio(Git sync) 또는 ② Figma Variables API export 로 DTCG JSON으로 빼서 `tokens.json` 갱신. (또는 에이전트가 Figma MCP로 읽어 대조 — `docs/FIGMA_WORKFLOW.md`.)
- **토큰 → 코드/문서**: `tokens.json`이 진실. `docs/DESIGN_FOMO.md` frontmatter는 사람이 읽는 미러, 코드는 아래 자동화(현재 수동)로 파생.

## 단일성 보장 (현재)
- 감정색은 `packages/fomo-core/src/types.ts`의 `EMOTION_COLORS`와 **동일값**. `packages/fomo-core/__tests__/tokens-drift.test.ts`가 불일치 시 실패시킨다.
- 베이스색/간격/라운드는 `apps/fomo-web/tailwind.config.ts`, `apps/fomo-club/constants/fomoTheme.ts`가 동일값 유지(현재 수동, 추후 자동 생성).

## 자동화 (deferred — 실제 Figma 파일 생긴 뒤 활성)
MLP 페이스상 지금은 deps 미설치. Figma 디자인이 확정되면:
```bash
npm i -D style-dictionary
# style-dictionary build: tokens.json →
#   - apps/fomo-web/tailwind.preset.css (CSS vars)  → tailwind이 var() 참조
#   - apps/fomo-club/constants/generated-tokens.ts  → fomoTheme이 import
#   - (선택) DESIGN.md frontmatter 재생성
npm run tokens:build
```
Tokens Studio(Figma 플러그인)로 이 레포에 Git-sync 하면 Figma↔tokens.json 자동 왕복.

## 참고
- 표준: W3C Design Tokens(DTCG). Figma MCP: `docs/FIGMA_WORKFLOW.md`. 시각 언어 정본: `docs/DESIGN_FOMO.md`.
