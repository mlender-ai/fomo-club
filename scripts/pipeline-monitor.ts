import { collectThemeDocs, themeNaverCodesFor } from "../apps/web/lib/theme-understanding";

const DEFAULT_THEMES = [
  "반도체",
  "AI",
  "2차전지",
  "바이오",
  "방산",
  "조선",
  "자동차",
  "금융",
  "유통",
  "게임",
  "건설",
  "에너지",
  "화장품",
  "클라우드",
  "로봇",
  "양자",
];

const themes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_THEMES;
const warnBelow = Number(process.env.PIPELINE_MONITOR_WARN_BELOW ?? 2);

async function main(): Promise<void> {
  console.log("Collection pipeline monitor (manual)");
  console.log(`warnBelow=${warnBelow}`);
  let warnings = 0;

  for (const theme of themes) {
    const codes = themeNaverCodesFor(theme);
    const docs = await collectThemeDocs(theme);
    const byKind = new Map<string, number>();
    for (const doc of docs) byKind.set(doc.kind, (byKind.get(doc.kind) ?? 0) + 1);
    const news = byKind.get("news") ?? 0;
    const community = byKind.get("community") ?? 0;
    const official = byKind.get("official") ?? 0;
    const isWarn = docs.length < warnBelow || codes.length === 0;
    if (isWarn) warnings += 1;
    console.log(
      `${isWarn ? "WARN" : "OK  "} ${theme.padEnd(6)} codes=${codes.length} total=${docs.length} news=${news} community=${community} official=${official}`
    );
  }

  if (warnings > 0) {
    console.log(`\n${warnings} theme(s) below collection threshold. This script only measures; it does not schedule or mutate collection.`);
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
