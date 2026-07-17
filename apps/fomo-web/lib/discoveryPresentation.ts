import type { CardVerdict, FomoScoreResult } from "@fomo/core";

export type DiscoveryStatusTone = "hot" | "moving" | "warming" | "early" | "quiet" | "cooling";

export interface DiscoveryStatusView {
  label: string;
  summary: string;
  tone: DiscoveryStatusTone;
  color: string;
}

const STATUS_BY_LABEL: Record<FomoScoreResult["label"], DiscoveryStatusView> = {
  hot: {
    label: "주목 집중",
    summary: "가격과 주목이 함께 강해진 종목이에요.",
    tone: "hot",
    color: "#FF5A5F",
  },
  lone: {
    label: "가격 먼저",
    // 자백 템플릿("확인은 더 필요해요") 금지(WO 뎁스 재건 A) — 사실 서술로.
    summary: "가격이 먼저 움직였고, 거래·언급은 아직 잠잠해요.",
    tone: "moving",
    color: "#F59E0B",
  },
  warming: {
    // "관심 붙는 중"은 의미가 모호(WO 뎁스 재건 C) — 무엇이 늘고 있는지 즉시 읽히게.
    label: "거래·언급 느는 중",
    summary: "가격이나 거래에서 평소와 다른 움직임이 붙었어요.",
    tone: "warming",
    color: "#D8FF3A",
  },
  incoming: {
    label: "수급 먼저",
    summary: "가격보다 수급이나 관심 신호가 먼저 확인됐어요.",
    tone: "early",
    color: "#38BDF8",
  },
  quiet: {
    label: "조용",
    summary: "작은 변화는 있지만 아직 뚜렷한 쏠림은 적어요.",
    tone: "quiet",
    color: "#C9C9C4",
  },
  silent: {
    label: "조용",
    summary: "오늘은 가격·거래·주목 신호가 모두 잔잔해요.",
    tone: "quiet",
    color: "#8A8A86",
  },
  cooling: {
    label: "열기 식는 중",
    summary: "이전에 모였던 가격·거래의 열기가 약해졌어요.",
    tone: "cooling",
    color: "#8A8A86",
  },
};

const LOADING_STATUS: DiscoveryStatusView = {
  label: "신호 확인 중",
  summary: "오늘의 가격·거래 신호를 확인하고 있어요.",
  tone: "quiet",
  color: "#8A8A86",
};

export function discoveryStatus(
  fomo: Pick<FomoScoreResult, "label" | "fomoScore"> | null | undefined
): DiscoveryStatusView {
  return fomo ? STATUS_BY_LABEL[fomo.label] : LOADING_STATUS;
}

export interface VerdictBalanceView {
  label: "강세 신호 우세" | "신호 혼조" | "약세 신호 우세";
  summary: string;
  color: string;
}

export function verdictBalance(
  verdict: Pick<CardVerdict, "stance"> | null | undefined
): VerdictBalanceView | undefined {
  if (!verdict) return undefined;
  if (verdict.stance === "enter") {
    return {
      label: "강세 신호 우세",
      summary: "현재 차트에서는 강세 근거가 약세 근거보다 많이 확인돼요.",
      color: "#22C55E",
    };
  }
  if (verdict.stance === "avoid") {
    return {
      label: "약세 신호 우세",
      summary: "현재 차트에서는 약세 근거가 강세 근거보다 많이 확인돼요.",
      color: "#EF4444",
    };
  }
  return {
    label: "신호 혼조",
    summary: "현재 차트의 강세·약세 근거가 섞여 있어요.",
    color: "#C9C9C4",
  };
}
