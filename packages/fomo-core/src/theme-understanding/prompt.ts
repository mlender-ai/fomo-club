import type { SourceDoc } from "./types";

/**
 * 이해 레이어 프롬프트 — DATA_ENGINE_STRATEGY §4 Track A. 순수(네트워크 0).
 *
 * 핵심 제약(SSOT, 운영자 강조):
 * 1) 근거는 *제공된 원문에만* 출처가 있어야 한다. 일반론·배경지식 금지("반도체는 경기민감주"류 X).
 *    각 근거에 그 원문에 실제로 있는 문구(quote)를 함께 — assemble 이 substring 으로 검증, 없으면 폐기.
 * 2) 강세/약세 둘 다. 한쪽뿐이면 지어내지 말고 그 사실을 stanceNote 로 정직하게.
 * 3) 투자조언·매매신호 금지(사라/팔아라/오른다 단정 X). 판단 재료지 답이 아님.
 */
export function buildThemeInsightPrompt(theme: string, docs: readonly SourceDoc[]): string {
  const corpus = docs
    .map((d) => {
      const meta = [d.source, d.publishedAt].filter(Boolean).join(" · ");
      const bodyLine = d.body ? `\n   본문: ${d.body}` : "";
      return `[${d.id}] (${d.kind}${meta ? " · " + meta : ""})\n   제목: ${d.title}${bodyLine}`;
    })
    .join("\n\n");

  return [
    `너는 '${theme}' 테마를 조사하는 애널리스트다. 아래 *수집된 원문만* 읽고 구조화해라.`,
    "수집한 원문 외의 배경지식·일반론은 절대 쓰지 마라(예: '반도체는 변동성이 크다' 같은 일반론 금지).",
    "",
    "규칙(어기면 그 항목은 폐기된다):",
    "1) 모든 강세/약세 근거는 위 원문 중 하나에서 나와야 한다. 각 근거에:",
    "   - claim: 그 근거를 친구에게 설명하듯 한 줄(쉽게, 용어 풀어서).",
    "   - sourceId: 근거가 나온 원문 번호(예: \"S1\").",
    "   - quote: 그 원문 제목/본문에 *실제로 있는* 문구를 그대로(짧게라도). 지어내지 마라.",
    "2) 강세(bull)와 약세(bear)를 모두 찾아라. 한쪽이 원문에 정말 없으면 그쪽은 빈 배열로 두고,",
    "   stanceNote 에 그 사실을 적어라(예: \"약세 관점은 원문에서 안 보임\"). 없는 근거를 만들지 마라.",
    "3) 투자조언·매매신호·미래 단정 금지(사라/팔아라/매수/오른다/목표가 X). 사실 전달만.",
    "4) wordings: 사람들이 *실제로 한 말*(특히 커뮤니티 원문)을 그대로 인용. 없으면 빈 배열.",
    "5) stocks: 원문에서 언급된 종목/섹터만.",
    "6) 공식 데이터(official — FRED/연준 등 실제 숫자)가 원문에 있으면, 관련 사실 근거에 *우선 인용*하라. 주장보다 신뢰도가 높다.",
    "",
    "수집된 원문:",
    corpus || "(원문 없음)",
    "",
    "출력은 JSON 객체만(그 외 텍스트 0):",
    '{"stocks":[],"bull":[{"claim":"","sourceId":"S1","quote":""}],"bear":[],"wordings":[{"text":"","sourceId":"S2"}],"stanceNote":""}',
  ].join("\n");
}
