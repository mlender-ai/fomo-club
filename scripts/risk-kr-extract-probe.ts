/**
 * KR 위험 섹션 **추출기** 실측 (WO-SUB-06 §5-2).
 * 프로브 1차는 목차를 봤고, 이건 실제 추출기(`fetchKrRiskSections`)가 본문을 뽑는지 본다.
 */
import { fetchCorpCodeMap } from "../apps/web/lib/fundamentals/dart-discovery";
import { fetchKrRiskSections } from "../apps/web/lib/risk/dart-risk-section";

const SAMPLE = [
  { name: "종근당", code: "185750" },
  { name: "삼성전자", code: "005930" },
  { name: "BNK금융지주", code: "138930" },
  { name: "POSCO홀딩스", code: "005490" },
  { name: "한전KPS", code: "051600" },
  { name: "KT", code: "030200" },
];

async function main(): Promise<void> {
  const key = process.env["DART_API_KEY"]?.trim() ?? "";
  const map = await fetchCorpCodeMap("risk-extract-probe");
  console.log(`매핑 상장 ${map.listedEntries}`);
  let ok = 0;
  for (const target of SAMPLE) {
    const corpCode = map.byStockCode.get(target.code);
    if (!corpCode) { console.log(`?   ${target.name} corp_code 없음`); continue; }
    const result = await fetchKrRiskSections(target.name, corpCode, key);
    const d = result.diagnostics;
    if (result.sections.length > 0) {
      ok += 1;
      const kinds = result.sections.map((s) => `${s.section}:${s.text.length}자`).join(" ");
      console.log(`OK  ${target.name.padEnd(12)} 제목 ${d?.titles} · 섹션 ${result.sections.length} (${kinds})`);
      console.log(`      본문 앞 120자: ${result.sections[0]!.text.slice(0, 120)}`);
    } else {
      console.log(`X   ${target.name.padEnd(12)} ${result.errors.join(" | ").slice(0, 120)}`);
    }
  }
  console.log(`\n추출 성공 ${ok}/${SAMPLE.length}`);
}
void main();
