/**
 * 라이브 grounding 평가 — 실제 파이프라인 출력으로 우리 제품의 진짜 점수 측정.
 *
 * 실제 수집(collectThemeDocs)→이해(runUnderstanding)가 만든 **강세(bull)·약세(bear) 주장**이
 * 인용한 원문에 실제로 근거하는지 LLM-as-judge로 독립 채점한다.
 * (제품은 assemble 단계에서 이미 grounding 필터를 하지만, 그 결과를 한 번 더 검증하는 안전망)
 *
 * 실행: AI_API_URL=... AI_API_KEY=... npm run eval:understanding:live -- 반도체
 *       (OPIK_* 설정 시 callAI 가 opik 에 자동 추적)
 */
import { callAI, isAiConfigured } from "@fomo/shared";
import { collectThemeDocs, runUnderstanding } from "../apps/web/lib/theme-understanding";

const theme = process.argv[2] ?? "반도체";

interface Claim {
  claim: string;
  sourceId: string;
  quote: string;
}
interface JudgeItem {
  side: string;
  claim: string;
  quote: string;
  sourceText: string;
}

function buildJudgePrompt(items: JudgeItem[]): string {
  const blocks = items
    .map(
      (it, i) =>
        `(${i + 1}) [${it.side}] 주장: "${it.claim}"\n    인용: "${it.quote}"\n    원문출처: ${it.sourceText}`
    )
    .join("\n\n");
  return [
    "너는 투자정보 응축 엔진의 grounding 심사관이다.",
    "각 '주장'이 같이 제시된 '원문출처'에 실제로 근거하는지 판정하라.",
    "grounded=true: 출처에서 사실로 확인됨(인용이 출처에 있고 주장이 과장 없이 부합).",
    "grounded=false: 출처에 없음 / 인용 왜곡 / 예측·단정으로 비약('무조건 오른다' 등).",
    "",
    blocks,
    "",
    '출력은 JSON 배열만(순서대로): [{"i":1,"grounded":true,"reason":"짧은 사유"}]',
  ].join("\n");
}

interface Verdict {
  i: number;
  grounded: boolean;
  reason: string;
}
function parseVerdicts(content: string): Verdict[] {
  const s = content.indexOf("[");
  const e = content.lastIndexOf("]");
  if (s === -1 || e <= s) return [];
  try {
    const arr = JSON.parse(content.slice(s, e + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((o) => ({
        i: typeof o["i"] === "number" ? o["i"] : 0,
        grounded: o["grounded"] === true,
        reason: typeof o["reason"] === "string" ? o["reason"] : "",
      }));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  if (!isAiConfigured()) {
    console.error("AI 미설정 — AI_API_URL/AI_API_KEY 필요");
    process.exit(1);
  }

  console.log(`[live] 테마 "${theme}" 원문 수집 중...`);
  const docs = await collectThemeDocs(theme);
  console.log(`[live] 수집된 원문 ${docs.length}건`);
  if (docs.length === 0) {
    console.error("수집 0건 — 네트워크/소스 도달 실패.");
    process.exit(1);
  }

  const llmDocCount = Number.parseInt(process.env["LIVE_DOCS"] ?? "8", 10);
  const docsForLlm = docs.slice(0, llmDocCount);
  console.log(`[live] 이해 레이어 실행 중... 원문 ${docsForLlm.length}건 투입 (LLM)`);
  const insight = await runUnderstanding(theme, docsForLlm, "theme");

  // sourceId(S1..) → 원문 텍스트. assemble 은 doc 순서대로 S{i+1} 부여.
  const sourceText = new Map<string, string>();
  docsForLlm.forEach((d, i) => {
    const body = (d.body ?? "").replace(/\s+/g, " ").slice(0, 220);
    sourceText.set(`S${i + 1}`, `${d.title}${body ? ` — ${body}` : ""}`);
  });

  const i2 = insight as unknown as { bull?: Claim[]; bear?: Claim[]; reason?: string };
  const claims: JudgeItem[] = [
    ...(i2.bull ?? []).map((c) => ({ side: "강세", ...c })),
    ...(i2.bear ?? []).map((c) => ({ side: "약세", ...c })),
  ].map((c) => ({
    side: c.side,
    claim: c.claim,
    quote: c.quote,
    sourceText: sourceText.get(c.sourceId) ?? "(인용 출처 없음)",
  }));

  console.log(`[live] 생성된 강세/약세 주장 ${claims.length}건 (제품 reason: ${i2.reason ?? "-"})`);
  if (claims.length === 0) {
    console.log("[live] 주장 0건(정직한 빈 상태) — 수집 원문에 강세/약세 신호 부족.");
    process.exit(0);
  }

  const res = await callAI({
    messages: [{ role: "user", content: buildJudgePrompt(claims) }],
    temperature: 0,
    trace: "eval-understanding-live",
    metadata: { theme, docs: docsForLlm.length, claims: claims.length },
  });
  if (!res.ok) {
    console.error(`판정 실패 status=${res.status}`);
    process.exit(1);
  }

  const verdicts = parseVerdicts(res.content);
  let grounded = 0;
  claims.forEach((c, idx) => {
    const v = verdicts.find((x) => x.i === idx + 1);
    const ok = v?.grounded ?? false;
    if (ok) grounded += 1;
    console.log(`${ok ? "✓" : "✗"} [${c.side}] ${c.claim} — ${v?.reason ?? "판정 누락"}`);
  });
  const total = claims.length;
  const rate = total > 0 ? Math.round((grounded / total) * 100) : 0;
  console.log(`\n[live] "${theme}" Grounding pass rate: ${grounded}/${total} (${rate}%)`);
  if (process.env["OPIK_API_KEY"] || process.env["OPIK_URL_OVERRIDE"]) {
    console.log(`→ opik 추적 전송 중(프로젝트: ${process.env["OPIK_PROJECT_NAME"] ?? "fomo-club"})...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.exit(rate >= 80 ? 0 : 1);
}

void main();
