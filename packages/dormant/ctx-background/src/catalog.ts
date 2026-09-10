import type { BackgroundCode } from "./types";

/**
 * §3 배경 후보 카탈로그 — 문안·반증조건 정본.
 *
 * §10: **후보 문안 초안은 사람 검토를 받는다. 승인 전까지 `draft` + 프로덕션 노출 차단.**
 * 그래서 각 항목에 `status` 를 두고, 프로덕션 노출 여부를 코드가 판단하게 한다.
 * 승인은 사람이 이 파일의 `status` 를 `"approved"` 로 바꾸는 것으로 표시한다.
 *
 * 반증조건은 **자동 판정 가능한 형태**로 쓴다(§9 실패 모드). "관측 불가능한 서술" 금지 —
 * 각 문장이 어떤 지표로 검증되는지 `falsifier_metric` 에 함께 남긴다.
 */

export type CatalogStatus = "draft" | "approved";

export interface CatalogEntry {
  code: BackgroundCode;
  label_ko: string;
  falsifier: string;
  /** 반증 판정에 쓰는 지표. 자동 채점(§7)이 이걸 읽는다. */
  falsifier_metric: string;
  /** §10 — 사람 승인 전에는 프로덕션에 내보내지 않는다. */
  status: CatalogStatus;
}

/**
 * 전 항목 `draft` 다. **의도된 상태다** — 아직 사람 검토를 받지 않았다.
 * `NO_VISIBLE_REASON` 도 예외가 아니다.
 */
export const BACKGROUND_CATALOG: readonly CatalogEntry[] = [
  {
    code: "DEEP_DRAWDOWN",
    label_ko: "많이 떨어진 자리에서 사고 있어요",
    falsifier: "낙폭이 더 깊어지는데 순매수가 끊기면 이 배경은 아니에요",
    falsifier_metric: "drawdown_from_high & streak_days",
    status: "draft",
  },
  {
    code: "RANGE_ACCUMULATION",
    label_ko: "좁은 범위에서 물량이 넘어가고 있어요",
    falsifier: "범위 아래로 이탈하고 회복이 없으면 이 배경은 아니에요",
    falsifier_metric: "below_range_recovery",
    status: "draft",
  },
  {
    code: "PRE_EVENT",
    label_ko: "실적 발표를 앞두고 사고 있어요",
    falsifier: "실적 발표 후에도 순매수가 이어지면 다른 배경이에요",
    falsifier_metric: "next_earnings_date & streak_days",
    status: "draft",
  },
  {
    code: "POST_MATERIAL",
    label_ko: "재료가 나온 뒤에도 계속 사고 있어요",
    falsifier: "재료 이후 순매수가 끊기면 이 배경은 아니에요",
    falsifier_metric: "days_since_last_filing & streak_days",
    status: "draft",
  },
  {
    code: "GUIDANCE_SHIFT",
    label_ko: "회사가 제시한 전망이 바뀐 뒤예요",
    falsifier: "전망 공시 이전부터 순매수가 이어졌다면 이 배경은 아니에요",
    falsifier_metric: "GUIDANCE disclosed_at & streak_start",
    status: "draft",
  },
  {
    code: "SHAKEOUT_BUY",
    label_ko: "아래로 뚫린 뒤 되돌아오는 구간에서 사고 있어요",
    falsifier: "회복 없이 하단 아래에 머무르면 이 배경은 아니에요",
    falsifier_metric: "below_range_recovery.events",
    status: "draft",
  },
  {
    code: "VOLUME_WAKING",
    label_ko: "조용하던 거래가 붙기 시작했어요",
    falsifier: "거래량이 다시 평소 아래로 내려가면 이 배경은 아니에요",
    falsifier_metric: "volume_ratio & volume_spike_days",
    status: "draft",
  },
  {
    code: "NO_VISIBLE_REASON",
    label_ko: "배경을 특정하지 못했어요",
    // §3-1 규칙 2 — 실패가 아니다. 그 자체가 정보다.
    falsifier: "나중에 재료가 확인되면 그 시점 기준으로 배경이 다시 판정돼요",
    falsifier_metric: "materials.events after as_of",
    status: "draft",
  },
];

const BY_CODE = new Map(BACKGROUND_CATALOG.map((e) => [e.code, e] as const));

export function catalogEntry(code: BackgroundCode): CatalogEntry | null {
  return BY_CODE.get(code) ?? null;
}

/** §10 — 승인 전 후보는 프로덕션에 노출하지 않는다. */
export function isProductionExposable(code: BackgroundCode): boolean {
  return catalogEntry(code)?.status === "approved";
}

/** 사람 검토가 남은 항목. 승인 절차 추적용. */
export function pendingReview(): BackgroundCode[] {
  return BACKGROUND_CATALOG.filter((e) => e.status === "draft").map((e) => e.code);
}
