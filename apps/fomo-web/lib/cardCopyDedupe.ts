import type { FeedSignalPoint } from "./fomoApi";

type CopyCluster =
  | "foreign-supply"
  | "institution-supply"
  | "supply"
  | "news"
  | "mention"
  | "theme"
  | "price"
  | "volume"
  | "position";

interface DedupeInput {
  headline: string;
  why: string;
  feedBull?: FeedSignalPoint | undefined;
  feedBear?: FeedSignalPoint | undefined;
  subLine?: string | undefined;
  preserveGroundedReason?: boolean | undefined;
}

interface DedupeOutput {
  why?: string | undefined;
  feedBull?: FeedSignalPoint | undefined;
  feedBear?: FeedSignalPoint | undefined;
  subLine?: string | undefined;
}

function normalizeCopy(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, "").replace(/[‘’'".,:·…]/g, "").trim();
}

function clustersFor(text: string | undefined): Set<CopyCluster> {
  const clean = text ?? "";
  const clusters = new Set<CopyCluster>();
  if (/외국인/.test(clean)) clusters.add("foreign-supply");
  if (/기관/.test(clean)) clusters.add("institution-supply");
  if (/수급|사는 중|파는 중/.test(clean)) clusters.add("supply");
  if (/뉴스|공시|원문/.test(clean)) clusters.add("news");
  if (/언급|커뮤니티|글이 늘/.test(clean)) clusters.add("mention");
  if (/테마|섹터|흐름|평균보다|가장 앞/.test(clean)) clusters.add("theme");
  if (/가격|상승|하락|빠졌|올랐|덜 움직/.test(clean)) clusters.add("price");
  if (/거래량|거래/.test(clean)) clusters.add("volume");
  if (/1년|높은 가격대|낮은 가격대/.test(clean)) clusters.add("position");
  return clusters;
}

function priceMoveOverlap(a: string | undefined, b: string | undefined): boolean {
  const left = a ?? "";
  const right = b ?? "";
  const leftPct = [...left.matchAll(/[+-]?\d+(?:\.\d+)?(?=%)/g)].map((m) => Number(m[0]));
  const rightPct = [...right.matchAll(/[+-]?\d+(?:\.\d+)?(?=%)/g)].map((m) => Number(m[0]));
  if (
    leftPct.some((l) => rightPct.some((r) => Number.isFinite(l) && Number.isFinite(r) && Math.abs(l - r) <= 0.2))
  ) {
    return true;
  }
  const publicMaterialCaveat = /공개\s*재료|재료.*확인/.test(left) || /공개\s*재료|재료.*확인/.test(right);
  if (publicMaterialCaveat) return false;
  return /오늘.*가격/.test(left) && /오늘.*가격/.test(right) && /(움직|상승|하락|올랐|빠졌)/.test(left) && /(움직|상승|하락|올랐|빠졌)/.test(right);
}

function hasMaterialOverlap(a: string | undefined, b: string | undefined): boolean {
  const left = normalizeCopy(a);
  const right = normalizeCopy(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;

  const aClusters = clustersFor(a);
  const bClusters = clustersFor(b);
  if (aClusters.has("foreign-supply") && bClusters.has("foreign-supply")) return true;
  if (aClusters.has("institution-supply") && bClusters.has("institution-supply")) return true;
  if (aClusters.has("news") && bClusters.has("news")) return true;
  if (aClusters.has("mention") && bClusters.has("mention")) return true;
  if (aClusters.has("theme") && bClusters.has("theme")) return true;
  if (aClusters.has("price") && bClusters.has("price") && priceMoveOverlap(a, b)) return true;
  if (aClusters.has("volume") && bClusters.has("volume")) return true;
  if (aClusters.has("position") && bClusters.has("position")) return true;
  return false;
}

export function dedupeCardCopy({
  headline,
  why,
  feedBull,
  feedBear,
  subLine,
  preserveGroundedReason = false,
}: DedupeInput): DedupeOutput {
  const whyRestatesHeadline = !preserveGroundedReason && hasMaterialOverlap(headline, why);
  const visibleWhy = whyRestatesHeadline ? undefined : why;

  const bullText = feedBull?.text;
  const bearText = feedBear?.text;
  const shouldHideBull =
    !!feedBull &&
    (hasMaterialOverlap(headline, bullText) || (!!visibleWhy && hasMaterialOverlap(visibleWhy, bullText)));
  const shouldHideBear =
    !!feedBear &&
    (hasMaterialOverlap(headline, bearText) || (!!visibleWhy && hasMaterialOverlap(visibleWhy, bearText)));
  const visibleBull = shouldHideBull ? undefined : feedBull;
  const visibleBear = shouldHideBear ? undefined : feedBear;
  const shouldHideSubLine =
    !!subLine &&
    (hasMaterialOverlap(headline, subLine) ||
      (!!visibleWhy && hasMaterialOverlap(visibleWhy, subLine)) ||
      (!!visibleBull && hasMaterialOverlap(visibleBull.text, subLine)) ||
      (!!visibleBear && hasMaterialOverlap(visibleBear.text, subLine)));

  return {
    ...(visibleWhy ? { why: visibleWhy } : {}),
    ...(visibleBull ? { feedBull: visibleBull } : {}),
    ...(visibleBear ? { feedBear: visibleBear } : {}),
    ...(!shouldHideSubLine && subLine ? { subLine } : {}),
  };
}
