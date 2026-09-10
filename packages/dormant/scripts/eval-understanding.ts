/**
 * 이해 레이어 grounding 평가 — 응축 워딩이 원문에 실제로 근거하는지 LLM-as-judge로 점수화.
 *
 * 왜: 제품의 #1 리스크는 "지어내기"(grounding 위반). 이 점수가 안 보이면 응축 품질 개선이 정체된다.
 * 무엇: (원문 sources, 생성 wordings) 쌍을 모델이 보고 각 워딩의 grounded 여부를 판정 → pass rate.
 * 어떻게: 공용 callAI(@fomo/shared) 사용 → OPIK_* 설정 시 자동으로 opik 에 추적/평가 기록.
 *
 * 실행: npm run eval:understanding   (또는 tsx scripts/eval-understanding.ts)
 * 회귀: 아래 SAMPLES 를 실제 파이프라인 출력(runUnderstanding 결과)으로 교체하면 모델·프롬프트 변경 회귀 측정.
 * CI 게이트: pass rate < 80% 이면 exit 1.
 */
import { callAI, isAiConfigured } from "@fomo/shared";

interface Sample {
  subject: string;
  sources: string[];
  wordings: string[];
}

// 내장 샘플(반도체) — 일부러 grounded/비grounded 섞음. 실제 출력으로 교체 가능.
const SAMPLES: Sample[] = [
  {
    subject: "반도체",
    sources: [
      "SK하이닉스가 HBM3E 12단 양산을 시작했다고 23일 밝혔다.",
      "삼성전자 4분기 영업이익이 전분기 대비 둔화됐다는 증권가 전망이 나왔다.",
      "외국인은 이번 주 코스피 반도체 업종을 3거래일 연속 순매수했다.",
    ],
    wordings: [
      "HBM 양산이 본격화되는 분위기", // grounded (source 1)
      "외국인 수급이 반도체로 유입", // grounded (source 3)
      "삼성전자 실적은 무조건 반등한다", // NOT grounded (단정·예측, source 2는 둔화 전망)
    ],
  },
];

function buildJudgePrompt(s: Sample): string {
  return [
    "너는 투자정보 응축 엔진의 grounding 심사관이다.",
    "각 '워딩'이 아래 '원문 출처'에 실제로 근거하는지 판정하라.",
    "grounded=true: 출처에서 사실로 확인됨. grounded=false: 출처에 없거나, 예측·단정·과장으로 비약.",
    "출처에 없는 미래 단정('무조건/반드시/반등한다')은 grounded=false.",
    "",
    `[원문 출처]\n${s.sources.map((x, i) => `(${i + 1}) ${x}`).join("\n")}`,
    "",
    `[워딩]\n${JSON.stringify(s.wordings)}`,
    "",
    '출력은 JSON 배열만: [{"wording":"원문그대로","grounded":true,"reason":"짧은 사유"}]',
  ].join("\n");
}

interface Verdict {
  wording: string;
  grounded: boolean;
  reason: string;
}

function parseVerdicts(content: string): Verdict[] {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((o) => ({
        wording: typeof o["wording"] === "string" ? o["wording"] : "",
        grounded: o["grounded"] === true,
        reason: typeof o["reason"] === "string" ? o["reason"] : "",
      }));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  if (!isAiConfigured()) {
    console.error("AI 미설정 — AI_API_URL/AI_API_KEY 필요(.env.example 참조)");
    process.exit(1);
  }

  let total = 0;
  let grounded = 0;

  for (const sample of SAMPLES) {
    const res = await callAI({
      messages: [{ role: "user", content: buildJudgePrompt(sample) }],
      temperature: 0,
      trace: "eval-understanding",
      metadata: { subject: sample.subject },
    });
    if (!res.ok) {
      console.warn(`[eval] 판정 실패 (${sample.subject}) status=${res.status}`);
      continue;
    }
    for (const v of parseVerdicts(res.content)) {
      total += 1;
      if (v.grounded) grounded += 1;
      console.log(`${v.grounded ? "✓" : "✗"} [${sample.subject}] ${v.wording} — ${v.reason}`);
    }
  }

  const rate = total > 0 ? Math.round((grounded / total) * 100) : 0;
  console.log(`\nGrounding pass rate: ${grounded}/${total} (${rate}%)  model=${SAMPLES.length ? "see traces" : "-"}`);
  if (process.env["OPIK_API_KEY"] || process.env["OPIK_URL_OVERRIDE"]) {
    console.log("→ opik 에 추적 기록됨(프로젝트: " + (process.env["OPIK_PROJECT_NAME"] ?? "fomo-club") + ")");
  }
  process.exit(rate >= 80 ? 0 : 1);
}

void main();
