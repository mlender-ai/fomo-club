# Agent Handoff

This document is for the next coding agent who picks up the repo.
Use it as the fastest orientation guide before touching code.

## 1. Current Product Shape

The product has pivoted from a generic trading console into an AI research operating system.

Core user flow:

1. home briefing
2. news -> analysis -> action
3. ticker or sector search
4. ticker / sector depth page
5. AI meeting / product review loop

Primary routes:

- `/`
- `/ticker/[ticker]`
- `/sector/[sector]`

## 2. What Users See Now

### Home

- editorial overview canvas
- favorite sectors and key tickers
- compact watchlist rail
- calm search CTA
- tabs for `뉴스`, `티커 분석`, `에이전트 회의`

### Ticker Page

- hero summary
- catalysts
- bull/base/bear scenarios
- TradingView embed
- technical interpretation
- related opportunity map

### Sector Page

- sector summary hero
- morning routine
- catalyst watch
- headline stack
- cross-market beneficiary group

### Fallback Pages

- `loading.tsx`
- `error.tsx`
- `global-error.tsx`
- `not-found.tsx`

The product should never degrade into raw framework errors on primary user flows.

## 3. Most Important Files

### UI

- `apps/web/components/research/ResearchWorkspace.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/page.tsx`
- `apps/web/app/ticker/[ticker]/page.tsx`
- `apps/web/app/sector/[sector]/page.tsx`

### Data / Contracts

- `packages/shared/src/research.ts`
- `packages/shared/src/researchLive.ts`
- `packages/shared/src/researchBehaviorStore.ts`
- `apps/web/lib/researchPipelineStore.ts`
- `apps/web/lib/researchInsights.ts`

### Automation

- `scripts/research-pipeline.ts`
- `scripts/research-agent-issues.ts`
- `scripts/research-newsletter.ts`
- `.github/workflows/research-pipeline.yml`
- `.github/workflows/daily-newsletter.yml`
- `.github/workflows/agent-council-sync.yml`

## 4. Design Rules

Read `docs/DESIGN.md` and `design/tokens.json` before doing UI work.

Short version:

- reduce elements before decorating
- group by reading logic, not by implementation source
- home is a briefing cover page, not a dashboard wall
- keep depth on depth pages
- do not expose internal system wording to end users

Words to avoid on primary user-facing UI:

- pipeline
- provider
- runtime
- JSON
- fallback
- implementation detail copy

## 5. Data Flow

The app does not depend on one live request path only.

Preferred order:

1. stored snapshot from `generated/research/latest.json`
2. published snapshot from GitHub raw URL
3. live rebuild

Why this matters:

- homepage stays fast
- Actions, newsletter, and UI stay on one contract
- the product still renders when live sources fail

## 6. Generated Artifacts

Tracked artifacts:

- `generated/research/latest.json`
- `generated/research/latest.md`
- `.github/agent-council/completed-items.md`

These files are intentionally committed because:

- the web reads the published snapshot
- GitHub Actions publishes the same output
- agent council completion memory is persistent state

Do not casually delete or stop updating them without changing the runtime strategy.

## 7. Safe Local Commands

Run these before shipping:

```bash
npm run typecheck
npm run build:web
npm run research:generate
```

If UI changed:

```bash
npm run qa:screenshot -- --url http://127.0.0.1:3100/ --out /tmp/qa-check.png --width 1440 --height 1200 --budget 7000
```

If research automation changed:

```bash
npm run research:issues
npm run research:newsletter
```

## 8. Current Known Gaps

Still not fully solved:

- relationship graph is rule-based
- portfolio-native product layer is missing
- email sending depends on final provider secrets
- GitHub Models can rate-limit and degrade to rule-based output
- relevance quality for some themes still needs tuning

## 9. Recommended Next Work

If you need the highest-impact next tasks:

1. improve search intent split between ticker / sector / theme
2. strengthen related opportunity graph beyond sector buckets
3. refine home information density without adding more cards
4. connect portfolio gravity layer
5. improve agent council quality scoring and shipped-feature tracking

## 10. Git Hygiene

- prefer small scoped commits
- keep generated snapshot changes intentional
- do not silently revert user changes
- if worktree is mixed, stage only the relevant files
- run at least `typecheck` and `build:web` before push
