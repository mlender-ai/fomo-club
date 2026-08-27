export * from "./types";
export * from "./mock";
export * from "./extract";
export * from "./score";
export * from "./community";
export * from "./comment";
export * from "./josa";
export * from "./stocks";
export * from "./card-front-hook";
export * from "./discovery-copy-safe";
export * from "./multi-axis-hook";
export * from "./discovery-supply";
export * from "./fomo-score";
export * from "./technical-analysis";
export * from "./verdict";
export * from "./wyckoff-analysis";
export * from "./company-score";
export * from "./signal-resume";
export * from "./signal-backtest";
export * from "./quiet-money";
export * from "./quiet-pick-hook";
export * from "./card-type";
export * from "./disclosure-kind";
export * from "./disclosure-phrase";
/**
 * `exposure-history` 도 배럴에서 뺐다 — 굽는 경로 전용이다(성능 게이트, 2026-08-27).
 *   import { buildExposureHistory } from "@fomo/core/keyword-cards/exposure-history";
 */
/**
 * `sector-stats` · `company-read` 는 **배럴에서 뺐다** (2026-08-27 성능 게이트).
 *
 * 이 둘은 **굽는 경로에서만** 쓴다(`apps/web/lib/quiet-pick.ts`). 배럴에 넣자 `@fomo/core`
 * 를 값으로 임포트하는 **조회 라우트 세 개**의 전이 모듈이 각각 +2 됐다 — 콜드스타트가
 * 나빠지고, 그게 504 사고의 원인이었다. 예산을 올리는 대신 원인을 없앴다.
 *
 * 쓰는 쪽은 경로로 직접 가져온다:
 *   import { companyRead } from "@fomo/core/keyword-cards/company-read";
 */
export * from "./quiet-signals";
export * from "./why-now";
export * from "./pick-vocabulary";
export * from "./company-summary";
