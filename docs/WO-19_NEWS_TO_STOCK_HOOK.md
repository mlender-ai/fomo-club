# WO-19 News To Stock Hook Reprocessing

## Intent

News is an input, not the card output. Discovery cards must explain what the news means for this stock in one short stock-perspective sentence. Raw article titles and publisher names stay in evidence only.

## Product Invariants

- News-primary headlines use `DiscoveryEvent.headlineHook`, not `sourceTitle`.
- If a news/disclosure event has no valid reprocessed hook, it cannot become a news-primary card headline.
- Card headlines do not include publisher names such as Yahoo Finance or 한경비즈니스.
- Support signals such as peer movement or volume are not appended to news headlines; they remain observations/detail.
- Stock depth synthesis can show the reprocessed reason, while the evidence line carries original title + publisher.
- Reprocessing uses `callAI` through `@fomo/shared` when configured, with rule fallback and validation for length, source leakage, title paste, forbidden advice, and added numbers.

## Verification

- `npm test -- packages/fomo-core/__tests__/discovery-supply.test.ts apps/web/__tests__/lib/discovery-supply-material.test.ts apps/web/__tests__/lib/news-reprocess.test.ts apps/fomo-web/__tests__/cardCopyDedupe.test.ts`
- `npm run typecheck`
- `npm run guard:discovery`
- `SPEC_ANALYZE_GUARD_DISCOVERY_RAN=true npm run spec:analyze`
- `npm run lint`
- `npm run build`
