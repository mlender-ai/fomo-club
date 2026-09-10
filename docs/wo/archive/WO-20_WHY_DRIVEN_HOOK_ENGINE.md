# WO-20 Why Driven Hook Engine

## Intent

Replace abstract discovery copy with a why-first synthesis path. Card and detail copy must explain why this stock is here using a concrete event, number, market-cap rank, sector position, volume ratio, or confirmed flow streak.

## Invariants

- No card headline may rely on filler such as "flow attached", "notable", "thin reason", or "screen to check".
- News and disclosure titles are input evidence, not headline copy.
- Generated copy must not add numbers or proper nouns that were not present in input facts.
- Advice, targets, and prediction language are rejected.
- If material is missing, the fallback must be honest and numeric, such as market-cap rank plus day move plus missing-support caveat.

## Verification

- Core fallback builds headline, observations, synthesis, and evidence from structured facts.
- App-layer `discovery-why-synthesis` uses `callAI` only after reached cards are known, with deterministic cache and validation.
- Validation rejects abstract filler, advice, added numbers, added proper nouns, and overlapping story blocks.
- Discovery guard confirms 50/50 cards have display why; current run also attached 7 volume-ratio events.
