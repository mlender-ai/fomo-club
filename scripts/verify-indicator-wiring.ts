import type { DiscoveryCandidate, DiscoveryEvent } from "@fomo/core";
import { attachMaterialEventIndicators } from "../apps/web/lib/discovery-supply";
import { __debugInsightInputText } from "../apps/web/lib/insight-synthesis";

const asOf = "2026-06-29";

const materialEvent: DiscoveryEvent = {
  kind: "news_mention",
  firstSeen: true,
  strength: 0.92,
  source: "한국경제",
  sourceName: "한국경제",
  sourceTitle: "티앤알바이오팹, 심근세포 정제 관련 특허 취득",
  headlineHook: "심근세포 정제 관련 특허 취득",
  summary: "심근세포 정제 관련 특허 취득",
  asOf,
  confidence: "H",
  label: "심근세포 정제 관련 특허 취득",
  direction: "up",
};

function candidateWith(events: DiscoveryEvent[]): DiscoveryCandidate {
  return {
    ticker: "티앤알바이오팹",
    market: "KOSDAQ",
    country: "KR",
    sector: "바이오",
    marketCapRank: 414,
    asOf,
    events,
  };
}

const beforeInput = __debugInsightInputText(candidateWith([materialEvent]));
const enrichedEvent = attachMaterialEventIndicators(materialEvent, { changePct: 16.21, volumeRatio: 3.2 });
const afterInput = __debugInsightInputText(candidateWith([enrichedEvent]));

const beforeHasChange = beforeInput.includes("16.21");
const beforeHasVolume = beforeInput.includes("3.2");
const afterHasChange = afterInput.includes("16.21");
const afterHasVolume = afterInput.includes("3.2");

console.log("BEFORE:", beforeInput);
console.log(`→ 입력에 '16.21' 포함? ${beforeHasChange} | 거래량 포함? ${beforeHasVolume}`);
console.log("");
console.log("AFTER:", afterInput);
console.log(`→ 입력에 '16.21' 포함? ${afterHasChange} | 거래량 포함? ${afterHasVolume}`);

if (beforeHasChange || beforeHasVolume || !afterHasChange || !afterHasVolume) {
  console.error("indicator wiring verification failed");
  process.exit(1);
}
