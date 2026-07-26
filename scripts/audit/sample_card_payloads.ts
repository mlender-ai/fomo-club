/**
 * WO-SUB-00 §4-1 — 카드 페이로드 샘플링 + 함량 라벨링.
 *
 * 표본 프레임은 두 층이다(둘 다 실측하고, 각각 N 을 그대로 적는다):
 *   L1 라이브 페이로드 — /api/fomo/quiet-picks 오늘자 카드. **전체 필드**가 있다.
 *   L2 발행 이력       — /api/fomo/track-record/picks. 원장에 박제된 selection payload 로,
 *                        트리거 층(훅·신호)만 들어 있다.
 *
 * 알려진 한계(문서에 그대로 남긴다): 과거 카드의 **전체 페이로드는 보존되지 않는다.**
 * 원장 selection payload 에는 hook·signalTypes·signal 만 있고 사업/재무 필드 자리가 없다.
 * 따라서 "최근 30일 200장 전체 페이로드 감사"는 지금 스키마에서 불가능하다.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_SEED, seededShuffle } from "./universe";
import { labelCard, ratio, type CardPayloadLike, type SubstanceLabels } from "./substance-labels";

const TIMEOUT_MS = 20_000;

interface QuietPickLike {
  subject: { canonical: string; symbol?: string; naverCode?: string; country?: string };
  hook?: string;
  conviction?: { whyCompany?: string; whyNow?: { summary?: string } };
  signalStats?: { headline?: string; detail?: string };
  anomalies?: Array<{ text?: string }>;
  invalidation?: { text?: string };
}

interface ScorecardPickLike {
  canonical: string;
  symbol?: string;
  date: string;
  hook?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** 외부 회사소개 원문 — 복붙 판정용. 없으면 undefined(비교 없이 진행). */
async function externalDescription(base: string, canonical: string, symbol?: string): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({ stock: canonical });
    if (symbol) params.set("symbol", symbol);
    const json = await getJson<{ summary?: string; about?: string }>(
      `${base}/api/fomo/stock-basics?${params.toString()}`
    );
    return json.summary?.trim() || json.about?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 라이브 카드 → 라벨 입력. 어떤 필드를 어디에 매핑했는지 명시적으로 둔다. */
export function toCardPayload(pick: QuietPickLike, external?: string): CardPayloadLike {
  return {
    businessText: pick.conviction?.whyCompany ?? null,
    externalDescription: external ?? null,
    // 현재 스키마에 재무 수치 자리가 존재하지 않는다 — 빈 객체가 곧 측정 결과다.
    financialValues: {},
    // "값을 어떻게 읽어야 하는지"에 해당하는 문장. 신호 성적(signalStats)은 신호 해석이지 값 해석이 아니다.
    frameText: null,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = (args[args.indexOf("--base") + 1] ?? process.env.AUDIT_BASE_URL ?? "").replace(/\/$/, "");
  const outDir = args[args.indexOf("--out") + 1] ?? "docs/audit";
  const target = Number(args[args.indexOf("--target") + 1] ?? 200);
  if (!base) {
    console.error("--base <프로덕션 URL> 필요");
    process.exit(2);
  }

  const live = await getJson<{ picks?: QuietPickLike[]; watching?: QuietPickLike[] }>(`${base}/api/fomo/quiet-picks`);
  const history = await getJson<{ picks?: ScorecardPickLike[] }>(`${base}/api/fomo/track-record/picks`);

  const livePicks = [...(live.picks ?? []), ...(live.watching ?? [])];
  const historyPicks = history.picks ?? [];

  console.log(`[audit] L1 라이브 카드 ${livePicks.length}장 / L2 발행 이력 ${historyPicks.length}장`);

  // L1 — 전체 페이로드 감사(외부 원문과 대조).
  const l1: Array<{ canonical: string; labels: SubstanceLabels }> = [];
  for (const pick of seededShuffle(livePicks, AUDIT_SEED).slice(0, target)) {
    const external = await externalDescription(base, pick.subject.canonical, pick.subject.symbol);
    l1.push({ canonical: pick.subject.canonical, labels: labelCard(toCardPayload(pick, external)) });
  }

  // L2 — 박제된 페이로드 감사. 사업/재무/해석 자리가 스키마에 없다는 사실 자체를 측정한다.
  const l2 = seededShuffle(historyPicks, AUDIT_SEED)
    .slice(0, target)
    .map((pick) => ({
      canonical: pick.canonical,
      labels: labelCard({ businessText: null, financialValues: {}, frameText: null }),
    }));

  const payload = {
    seed: AUDIT_SEED,
    auditedAt: new Date().toISOString(),
    baseUrl: base,
    targetSample: target,
    layers: {
      L1_live_payload: {
        n: l1.length,
        note: "오늘자 발행 카드 전체 페이로드. 하루 발행량이 한 자릿수라 200장에 도달하지 않는다.",
        has_business_context_pct: ratio(l1.map((i) => i.labels), "has_business_context"),
        has_financial_fact_pct: ratio(l1.map((i) => i.labels), "has_financial_fact"),
        has_frame_pct: ratio(l1.map((i) => i.labels), "has_frame"),
        items: l1,
      },
      L2_persisted_selection: {
        n: l2.length,
        note: "원장 selection payload. 트리거 층(hook/signal)만 박제되고 사업·재무·해석 필드 자리가 없다.",
        has_business_context_pct: ratio(l2.map((i) => i.labels), "has_business_context"),
        has_financial_fact_pct: ratio(l2.map((i) => i.labels), "has_financial_fact"),
        has_frame_pct: ratio(l2.map((i) => i.labels), "has_frame"),
        items: l2,
      },
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "baseline_substance_raw.json"), JSON.stringify(payload, null, 2));
  console.log(`[audit] 저장 — ${join(outDir, "baseline_substance_raw.json")}`);
  console.log(JSON.stringify({ L1: payload.layers.L1_live_payload.n, L2: payload.layers.L2_persisted_selection.n }, null, 2));
}

if (process.argv[1] && process.argv[1].includes("sample_card_payloads")) {
  main().catch((error) => {
    console.error("[audit] 실패", error);
    process.exit(1);
  });
}
