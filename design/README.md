# FOMO Club — Design Tokens (DTCG)

`tokens.json` = FOMO Club 디자인 토큰의 **기계가독 소스**(W3C DTCG 포맷). Figma ↔ 문서 ↔ 코드의 교환 허브.

> **값의 정본은 `docs/design/DS-00_TOKENS.md`(DS-00, v2)이고, 이 파일의 `ds` 블록이 그 미러다.**
> 최상위 `color`/`typography`/`spacing`/`radius`는 v1 레거시(점진 마이그레이션). 충돌 시 `ds`가 이긴다.
> 변경 순서: DS-00 문서 → `ds` 블록 → 코드(Tailwind/fomoTheme) → `docs/DESIGN.md` 미러.
> 드리프트 가드: `packages/fomo-core/__tests__/ds-tokens-drift.test.ts`

## 왕복(round-trip) 흐름

```
        ┌─────────────────────────────────────────────────────┐
        │                  design/tokens.json (DTCG)           │
        │                  ── 단일 소스 ──                      │
        └───▲───────────────────┬───────────────────────┬─────┘
            │                    │                       │
   (Figma Variables)     (사람 읽는 정본 문서)   (코드: Tailwind/fomoTheme/@fomo/core)
   Tokens Studio /        DS-00 + docs/DESIGN.md      apps/fomo-web, apps/fomo-club, packages/fomo-core
   Variables API /        (사람+에이전트 읽기)
   Figma MCP
```

- **Figma → 토큰**: 사용자가 Figma로 디자인 후 Variables를 ① Tokens Studio(Git sync) 또는 ② Figma Variables API export 로 DTCG JSON으로 빼서 `tokens.json` 갱신. (또는 에이전트가 Figma MCP로 읽어 대조 — `docs/FIGMA_WORKFLOW.md`.)
- **토큰 → 코드**: `ds` 블록이 코드의 기준. 코드는 아래 자동화(현재 수동)로 파생.

## 단일성 보장 (현재)
- 감정색은 `packages/fomo-core/src/types.ts`의 `EMOTION_COLORS`와 **동일값**(단, DS-00 §9에 따라 **UI 사용 금지** — 데이터 계약으로만 존재). `packages/fomo-core/__tests__/tokens-drift.test.ts`가 불일치 시 실패시킨다.
- `ds` 토큰 ↔ `apps/fomo-web/tailwind.config.ts`(`ds.*`) ↔ `apps/fomo-club/constants/fomoTheme.ts`(`DS`) 일치를 `ds-tokens-drift.test.ts`가 강제.

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
- 표준: W3C Design Tokens(DTCG). Figma MCP: `docs/FIGMA_WORKFLOW.md`. 시각 언어: `docs/design/DS-00_TOKENS.md`(기반 토큰 정본) + `docs/DESIGN.md`. v1 기록: `docs/legacy/DESIGN_FOMO.md`.
