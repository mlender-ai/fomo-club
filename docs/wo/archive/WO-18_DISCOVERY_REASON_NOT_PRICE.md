# WO-18 Discovery Reason Beyond Price Rank

## Intent

PRODUCT_VISION v5 defines discovery as unknown-stock awakening, not a restatement of price movement. This work order blocks card headlines that end at "today's strongest among peers" and makes the surface say what is known: material/news/flow/volume first, obscurity context when available, and an honest thin-reason caveat when price-rank context has no supporting signal.

## Product Invariants

- Card front headline is one compressed sentence, not a label plus prose detail.
- Internal discovery synthesis may keep state/detail parts, but the swipe card must recombine them into one readable reason.
- `theme_link` / market-context leaders do not output price-rank-only copy. They must combine non-price support or say the support is not visible yet.
- Obscure sector leaders include market-cap-rank context such as "시총 411위권".
- Empty or low-hierarchy label-only evidence boxes are not rendered on the stock card or stock depth synthesis.
- Stock depth synthesis must summarize meaning, not repeat the observed price/rank sentence.

## Verification

- `npm test -- packages/fomo-core/__tests__/discovery-supply.test.ts apps/web/__tests__/lib/discovery-supply-material.test.ts apps/fomo-web/__tests__/discoveryHeadline.test.ts apps/fomo-web/__tests__/cardCopyDedupe.test.ts`
- `npm run typecheck`
- `npm run guard:discovery`
- `SPEC_ANALYZE_GUARD_DISCOVERY_RAN=true npm run spec:analyze`
