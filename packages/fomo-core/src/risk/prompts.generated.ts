/**
 * **생성 파일이다. 직접 고치지 말 것.**
 *
 * 정본: `prompts/risk/*.md`
 * 생성: `npx tsx scripts/risk-prompts-render.ts`
 *
 * 검증 프롬프트는 여기 없다 — WO-SUB-03 의 `verify.v1` 을 재사용한다(§5-2).
 */

export interface RiskPrompt {
  id: string;
  name: string;
  version: string;
  hash: string;
  text: string;
}

export const RISK_PROMPTS: Readonly<Record<string, RiskPrompt>> = {
  "synthesize.v1": {
    id: "synthesize.v1",
    name: "synthesize",
    version: "v1",
    hash: "c063dbe39f58b4a4",
    text: "# risk-synthesize.v1\n\n공시 위험 섹션 원문에서 **이 회사만의 리스크**를 뽑는다.\n\n## 무엇을 뽑는가\n\n\"이 관점이 틀릴 수 있는 이유\" 중 **이 회사에만 해당하는 것**만. 어느 기업에나 해당하는 문장은\n뽑지 않는다 — 그건 이미 유형 리스크가 따로 말한다.\n\n## 출력 (JSON only)\n\n```json\n{\n  \"risks\": [\n    { \"text\": \"매출의 42%가 상위 3개 고객에서 나와요\", \"source_ids\": [\"sec:X:0001:risk-factors#4\"] }\n  ]\n}\n```\n\n뽑을 것이 없으면 `{ \"risks\": [] }`. **억지로 채우지 않는다.** 빈 배열은 정상 결과다.\n\n## 문장 규칙\n\n- **최대 3개.** 중요한 것부터.\n- **1문장, 60자 이내.** 두 문장으로 쓰지 않는다.\n- **해요체.** \"~예요\" / \"~있어요\" / \"~해요\". 합니다체를 쓰지 않는다.\n- **수치·품목·비중을 문장에 넣는다.** 청크에 있는 숫자를 그대로 옮긴다. 숫자가 없으면 그 항목은\n  뽑지 않는다 — 수치 없는 리스크는 일반론과 구별되지 않는다.\n- `source_ids` 는 그 문장의 근거가 **실제로 있는** 청크 id 만. 비어 있으면 그 항목은 버려진다.\n\n## 뽑지 않을 것\n\n- **일반론**: 경쟁 심화 · 경기 변동 · 금리·환율 변동 · 법규 개정 · 천재지변 · 우수 인력 확보 ·\n  해킹 가능성 · 지식재산권 분쟁 가능성. 전 기업 공통이라 이 회사를 설명하지 않는다.\n- **인과 단정**: \"A 상승으로 B가 하락했어요\" ✕. 두 사실을 각각 쓰거나 조건형으로 쓴다 —\n  \"A가 오르면 B가 밀릴 수 있어요\" ○.\n- **투자 판단**: 매수·매도·목표가·추천·저평가·고평가·\"싸다\"·\"비싸다\"·전망·\"오를 것\".\n- **공포 조장**: 폭락·붕괴·위험천만·치명적. 리스크도 비례적 톤으로 쓴다.\n- **관리 방침 서술**: \"환위험을 통화선도로 관리하고 있어요\" 는 리스크가 아니라 대응이다.\n  KR 사업보고서의 위험관리 절은 절반이 이런 서술이다 — 그건 건너뛴다.\n\n## 판단이 서지 않으면\n\n넣지 않는다. 3개를 채우는 것보다 **1개가 확실한 것이 낫다.** 뽑힌 문장은 각각 별도 호출로\n근거 검증을 받고, 지지되지 않으면 버려진다.\n",
  },
};

export function riskPromptOf(id: string): RiskPrompt {
  const prompt = RISK_PROMPTS[id];
  if (!prompt) throw new Error(`리스크 프롬프트 없음: ${id}`);
  return prompt;
}
