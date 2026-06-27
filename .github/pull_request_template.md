## Summary

- what changed
- why it changed

## Scope

- [ ] web
- [ ] api
- [ ] shared
- [ ] prisma
- [ ] docs / ci / ops

## Agent / SSOT

- [ ] SSOT aligned with `docs/PRODUCT_VISION.md`
- [ ] No investment advice / buy-sell / target price / prediction wording
- [ ] No autonomous product-direction proposal
- [ ] Labels considered: `source-discovery`, `integrity-check`, `pipeline-monitor`, `ssot-sync`, `needs-ceo-review`
- [ ] `needs-ceo-review` added if external service, paid API, prod DDL, privacy, or product/copy decision is required

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run guard:discovery` if discovery deck/card/depth/market temperature/API behavior changed
- [ ] local UI or API smoke check completed

## Product Regression Check

- [ ] Changed only the requested behavior; unrelated UX/copy/loading/order changes are called out
- [ ] Discovery cards still show sector/theme chips, not KOSPI/KOSDAQ as primary chips
- [ ] Front discovery band has no price-only hooks like "오늘 가격이 +30.0% 움직였어요"
- [ ] Discovery deck target count and first-load/retry behavior were checked

## Deployment Notes

- environment variable changes:
- migration required: yes / no
- rollout order:

## Rollback Plan

- previous healthy commit or deployment:
- rollback trigger:
- rollback steps:

## Screenshots or Logs

- UI screenshot if the PR changes frontend behavior
- relevant terminal output if the PR changes deployment or runtime behavior
