/**
 * `docs/risk/BOILERPLATE_FILTER.md` 생성기 (WO-SUB-06 §8).
 *
 * 사전 정본은 `packages/fomo-core/src/risk/boilerplate.ts` 하나다. 문서를 손으로 쓰면
 * 사전과 어긋나는데 그 어긋남은 아무 게이트에도 안 걸린다 — 독트린과 같은 이유로 생성물로 둔다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boilerplateRules } from "../packages/fomo-core/src/risk/boilerplate";

export const BOILERPLATE_DOC_PATH = join("docs", "risk", "BOILERPLATE_FILTER.md");

export function renderBoilerplateDoc(): string {
  const lines: string[] = [];
  lines.push("# 보일러플레이트 필터 사전 (WO-SUB-06 §5-2)");
  lines.push("");
  lines.push("> **생성 문서다.** 정본은 `packages/fomo-core/src/risk/boilerplate.ts` 이고 이 파일은 그것의 렌더다.");
  lines.push("> 고칠 때는 소스를 고치고 `npx tsx scripts/risk-boilerplate-render.ts` 를 다시 돌린다.");
  lines.push("> 이 문서를 직접 편집하면 테스트(`risk-boilerplate.test.ts`)가 실패한다.");
  lines.push("");
  lines.push("## 왜 필요한가");
  lines.push("");
  lines.push("공시 위험요소 섹션은 절반이 **모든 기업에 해당하는 문구**다(\"경쟁이 치열합니다\",");
  lines.push("\"경제 상황에 영향을 받습니다\"). 그대로 종목 고유 리스크로 내보내면 소스는 진짜인데");
  lines.push("정보가 0 인 문장이 화면에 나간다 — WO §10 의 \"위험요소 섹션의 보일러플레이트를 그대로 노출\".");
  lines.push("");
  lines.push("## 적용 경계 — 유형 리스크에는 쓰지 않는다");
  lines.push("");
  lines.push("이 필터는 **§5-2 공시 추출 경로 전용**이다. 독트린의 유형 리스크에는 적용하지 않는다.");
  lines.push("");
  lines.push("독트린에는 `quality-competition`(\"새로 들어오는 회사가 늘거나 가격 경쟁이 붙으면…\") 항목이 있고");
  lines.push("아래 `generic_competition` 패턴과 문구 계열이 겹친다. 둘은 다른 것이다:");
  lines.push("");
  lines.push("| | 주장 | 일반론일 때 |");
  lines.push("|---|---|---|");
  lines.push("| 유형 리스크 | \"이 유형에 흔히 해당한다\"고 **고지를 붙여** 일반론임을 밝힌다 | 정상 |");
  lines.push("| 종목 고유 리스크 | **이 회사만의 사실이라고 주장**한다 | 거짓 |");
  lines.push("");
  lines.push("그래서 필터를 공용 유틸로 만들지 않는다. 하나로 합치면 독트린 확정 항목이 조용히 지워진다.");
  lines.push("`risk-boilerplate.test.ts` 가 이 경계를 두 방향으로 고정한다 — 독트린 문안에 필터를 걸면");
  lines.push("실제로 지워진다는 것과, 유형 리스크 로더가 필터를 부르지 않는다는 것.");
  lines.push("");
  lines.push("## 사전 v1");
  lines.push("");
  lines.push("§11 지침대로 **작게 시작한다.** 과하게 잡으면 종목 고유 리스크가 함께 지워지고, 그 손실은");
  lines.push("커버리지 숫자로만 보이고 무엇이 지워졌는지는 안 보인다. 그래서 `filterBoilerplate` 는");
  lines.push("지워진 항목과 사유를 함께 돌려준다(조용한 절단 금지).");
  lines.push("");
  lines.push("| 규칙 | 패턴 | 사전에 들어온 이유 |");
  lines.push("|---|---|---|");
  for (const rule of boilerplateRules()) {
    const source = rule.source.includes("|") ? `\`${rule.source.replace(/\|/g, "\\|")}\`` : `\`${rule.source}\``;
    lines.push(`| \`${rule.rule}\` | ${source} | ${rule.note} |`);
  }
  lines.push("");
  lines.push("## 키우는 방법");
  lines.push("");
  lines.push("1. 골든셋 실행 결과에서 `dropped` 와 `kept` 를 둘 다 본다");
  lines.push("2. `kept` 에 일반론이 남아 있으면 패턴을 **좁게** 추가한다(주어가 특정되지 않은 서술만)");
  lines.push("3. `dropped` 에 종목 고유 사실이 들어갔으면 그 패턴을 좁힌다 — 커버리지가 아니라 **정직성** 손실이다");
  lines.push("4. 규칙마다 `note` 를 채운다. 사유 없는 패턴은 나중에 중복·과잉을 판단할 수 없다");
  lines.push("");
  return lines.join("\n") + "\n";
}

function main(): void {
  const text = renderBoilerplateDoc();
  mkdirSync(join("docs", "risk"), { recursive: true });
  writeFileSync(BOILERPLATE_DOC_PATH, text);
  console.log(`[boilerplate] 생성 — ${BOILERPLATE_DOC_PATH} (${text.length}자)`);
}

if (process.argv[1]?.includes("risk-boilerplate-render")) main();
