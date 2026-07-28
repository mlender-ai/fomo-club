/**
 * **생성 파일이다. 직접 고치지 말 것.**
 *
 * 정본: `prompts/business-context/*.md`
 * 생성: `npx tsx scripts/business-context-prompts-render.ts`
 *
 * 런타임이 `prompts/` 를 fs 로 읽지 않게 번들로 굽는다(Vercel 파일 트레이싱 의존 제거).
 * `hash` 는 본문 해시다 — 버전 문자열을 안 올리고 본문만 고쳐도 재합성이 트리거된다.
 */

export interface BusinessContextPrompt {
  id: string;
  name: string;
  version: string;
  hash: string;
  text: string;
}

export const BUSINESS_CONTEXT_PROMPTS: Readonly<Record<string, BusinessContextPrompt>> = {
  "synthesize.v1": {
    id: "synthesize.v1",
    name: "synthesize",
    version: "v1",
    hash: "3b4e0acdcc5bf266",
    text: "# synthesize.v1\n\n주어진 **공시 문서 발췌만을 근거로** 사업 실체 2슬롯을 채운다.\n\n## 역할\n\n당신은 공시 문서에서 사실을 뽑는 추출기다. 요약가도, 분석가도 아니다.\n입력 청크에 없는 내용은 한 글자도 쓰지 않는다.\n\n## 출력 (JSON only)\n\n```json\n{\n  \"slot1_revenue_source\": { \"text\": \"...\", \"source_ids\": [\"...\"] },\n  \"slot2_dependency\": { \"text\": \"...\", \"source_ids\": [\"...\"] },\n  \"insufficient_reason\": null\n}\n```\n\n각 슬롯은 근거를 찾을 수 없으면 `null` 로 둔다. 그 경우 `insufficient_reason` 에 한국어 한 문장으로 사유를 쓴다.\n\n## 슬롯 정의\n\n- `slot1_revenue_source` — **어디서 돈을 버는가.** 매출 구성, 주력 사업·제품, 주요 고객 구조.\n- `slot2_dependency` — **무엇에 걸려 있는가.** 이 회사 실적을 좌우하는 외부 변수(금리, 원자재 가격, 환율, 특정 대형고객, 규제, 설비투자 사이클).\n\n## 제약\n\n1. 각 `text` 는 **한국어 1문장, 60자 이내**. 존댓말 아닌 명사형·평서형으로 끝낸다.\n2. **청크에 없는 내용을 쓰지 않는다.** 추론·상식·일반론 금지.\n3. `source_ids` 에는 그 문장의 근거가 된 청크의 `source_id` 만 넣는다. 최소 1개.\n4. 근거를 못 찾으면 해당 슬롯을 `null` 로 두고 `insufficient_reason` 을 채운다.\n   **`null` 은 정상 출력이다.** 억지로 채우는 것이 실패다.\n5. 다음은 금지한다.\n   - 투자 의견·전망·평가 형용사 (\"우수한\", \"유망한\", \"탄탄한\", \"선도적\", \"매력적\")\n   - 인과 단정 (\"~때문에\", \"~덕분에\", \"~로 인해\") — 사실 병기까지만\n   - **소재지·법인격 설명** (\"~에 소재한 지주회사입니다\", \"~에 본사를 둔 회사입니다\").\n     사용자에게 정보가 되지 않는다. 무엇으로 돈을 버는지를 써야 한다.\n   - 회사명 반복으로 자리 채우기\n\n## 좋은 예 / 나쁜 예\n\n| | 슬롯 1 |\n|---|---|\n| ✅ | `뉴저지·뉴욕 지점망 기반 예대마진이 수익의 대부분` |\n| ❌ | `메릴랜드에 소재한 은행 지주회사` (소재지·법인격) |\n| ❌ | `안정적인 수익 구조를 갖춘 우수한 지역은행` (평가 형용사) |\n\n| | 슬롯 2 |\n|---|---|\n| ✅ | `단기 조달금리와 장단기 금리차, 상업용 부동산 대출 비중` |\n| ❌ | `금리 하락으로 순이자마진이 개선될 전망` (인과 단정 + 전망) |\n",
  },
  "verify.v1": {
    id: "verify.v1",
    name: "verify",
    version: "v1",
    hash: "f27b78f006252451",
    text: "# verify.v1\n\n생성된 문장이 **인용된 청크 원문에서 실제로 지지되는지** 판정한다.\n\n합성과 **별도 호출**이다. 자가 검증이 아니다 — 만든 모델에게 스스로 채점하게 하면 통과율이 거짓이 된다.\n\n## 출력 (JSON only)\n\n```json\n{ \"supported\": true, \"unsupported_span\": null }\n```\n\n지지되지 않으면:\n\n```json\n{ \"supported\": false, \"unsupported_span\": \"청크에서 확인되지 않는 부분\" }\n```\n\n## 판정 기준\n\n- 문장의 **모든 사실 주장**이 청크 원문에서 확인되면 `supported: true`.\n- 청크에 없는 수치·지명·제품명·비중이 하나라도 있으면 `false`.\n- 청크 내용을 압축·재배열한 것은 `true`. 표현이 달라도 사실이 같으면 지지된 것이다.\n- 청크에서 **추론**해야만 나오는 내용은 `false`. (\"지점이 100개\" → \"지역 밀착형 영업\" 은 추론이다)\n- 판단이 서지 않으면 `false`. **의심스러우면 폐기하는 쪽으로 기울인다.**\n",
  },
};

export function promptOf(id: string): BusinessContextPrompt {
  const prompt = BUSINESS_CONTEXT_PROMPTS[id];
  if (!prompt) throw new Error(`프롬프트 없음: ${id}`);
  return prompt;
}
