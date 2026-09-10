# WO-05 Discovery Supply Engine

Status: Stage 1 implementation.

Goal: move the default discovery surface from a fixed sector roster to a daily event-harvested stock pool. The top-level feed is now a single infinite deck; sectors remain as card context tags, not navigation boundaries.

Implemented scope:

- `GET /api/fomo/discovery`
  - harvests Korea market movers from Naver market list pages
  - merges existing news/mention coverage
  - gates candidates to `events.length >= 1`
  - returns up to 100 candidates plus card-front seeds
- `@fomo/core` pure discovery supply primitives
  - `eligibleUniverse`
  - `rankDiscoveryCandidates`
  - `discoveryWhy`
  - weak material labeling for price/volume-only cards
- Web default surface
  - removes top sector chips from the default card feed
  - `TodayDiscoveryDeck` calls `/api/fomo/discovery` once
  - seeded `fronts` let market-list candidates render without waiting for per-card stock-front hydration

Deferred:

- KRX risk-designation adapter. The pure guard exists, but live KRX endpoint wiring is a follow-up once the exact free endpoint is validated.
- DART disclosures and earnings surprise events.
- US market adapter.
