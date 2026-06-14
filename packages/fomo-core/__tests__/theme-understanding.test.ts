import { describe, expect, it } from "vitest";
import {
  assembleThemeInsight,
  emptyThemeInsight,
  parseThemeInsightResponse,
  buildThemeInsightPrompt,
  parseNaverBoardPosts,
  type SourceDoc,
} from "../src";
import type { RawThemeInsight } from "../src/theme-understanding/parse";

const DOCS: SourceDoc[] = [
  { id: "S1", kind: "news", title: "엔비디아 신고가, HBM 수요 폭발", body: "외국인 매수세가 삼성전자·SK하이닉스로 번졌다.", source: "한국경제" },
  { id: "S2", kind: "news", title: "반도체 고점 논란, 일부 차익실현", body: "단기 과열 우려에 일부 기관이 차익실현에 나섰다.", source: "매일경제" },
  { id: "S3", kind: "community", title: "삼성전자 가즈아 풀매수", source: "네이버 종토방 삼성전자" },
];

const baseRaw: RawThemeInsight = { stocks: [], bull: [], bear: [], wordings: [], stanceNote: "" };

describe("assembleThemeInsight — grounding 가드(환각 차단)", () => {
  it("원문에 박힌 quote 만 통과, 지어낸 quote 는 폐기", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      stocks: ["삼성전자", "SK하이닉스"],
      bull: [
        { claim: "외국인 매수세가 반도체 대형주로 번졌어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }, // grounded
        { claim: "메모리 초호황 사이클이 시작됐대", sourceId: "S1", quote: "초호황 슈퍼사이클 진입" }, // 원문에 없음 → 폐기
      ],
      bear: [{ claim: "단기 과열로 차익실현이 나왔어", sourceId: "S2", quote: "차익실현에 나섰다" }],
    };
    const r = assembleThemeInsight("반도체", DOCS, raw);
    expect(r.bull.map((e) => e.claim)).toEqual(["외국인 매수세가 반도체 대형주로 번졌어"]);
    expect(r.bear).toHaveLength(1);
    expect(r.stance).toBe("balanced");
    expect(r.stocks).toEqual(["삼성전자", "SK하이닉스"]); // 원문에 등장
  });

  it("존재하지 않는 sourceId 인용 → 폐기", () => {
    const raw: RawThemeInsight = { ...baseRaw, bull: [{ claim: "근거", sourceId: "S99", quote: "엔비디아" }] };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });

  it("너무 짧은 quote 는 grounding 으로 인정 안 함(아무 데나 걸림 방지)", () => {
    const raw: RawThemeInsight = { ...baseRaw, bull: [{ claim: "c", sourceId: "S1", quote: "수" }] };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });

  it("투자조언/매매신호 claim 은 폐기(키워드 엔진 가드 재활용)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "지금 삼성전자 매수해라", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });
});

describe("균형(강세/약세) 정직 표기", () => {
  it("강세만 grounded → bull-dominant + 약세 안 보임 정직 표기", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
    };
    const r = assembleThemeInsight("반도체", DOCS, raw);
    expect(r.stance).toBe("bull-dominant");
    expect(r.stanceNote).toContain("약세");
    expect(r.stanceNote).toContain("안 보여");
  });

  it("강세·약세 둘 다 → balanced", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인 매수", sourceId: "S1", quote: "외국인 매수세" }],
      bear: [{ claim: "차익실현", sourceId: "S2", quote: "차익실현에 나섰다" }],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).stance).toBe("balanced");
  });

  it("grounded 근거 0건 → insufficient(정직한 빈 상태)", () => {
    const raw: RawThemeInsight = { ...baseRaw, bull: [{ claim: "x", sourceId: "S1", quote: "원문에없는문구입니다" }] };
    const r = assembleThemeInsight("반도체", DOCS, raw);
    expect(r.stance).toBe("insufficient");
    expect(r.confidence).toBe("insufficient");
  });

  it("원문 없음 / raw null → 정직한 빈 상태", () => {
    expect(assembleThemeInsight("반도체", [], baseRaw).confidence).toBe("insufficient");
    expect(assembleThemeInsight("반도체", DOCS, null).confidence).toBe("insufficient");
    expect(emptyThemeInsight("반도체", "테스트").bull).toEqual([]);
  });

  it("confidence 는 PoC 상 최대 low(가짜 high 금지)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인 매수", sourceId: "S1", quote: "외국인 매수세" }],
      bear: [{ claim: "차익실현", sourceId: "S2", quote: "차익실현에 나섰다" }],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).confidence).toBe("low");
  });

  it("사용된 출처만 sources 에(검증용 — 근거가 가리킨 원문)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인 매수", sourceId: "S1", quote: "외국인 매수세" }],
    };
    const r = assembleThemeInsight("반도체", DOCS, raw);
    expect(r.sources.map((s) => s.id)).toEqual(["S1"]);
  });
});

describe("워딩(여론 원문) grounding", () => {
  it("커뮤니티 원문에 실재하는 워딩만 통과", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인 매수", sourceId: "S1", quote: "외국인 매수세" }],
      wordings: [
        { text: "가즈아 풀매수", sourceId: "S3" }, // 원문에 있음
        { text: "다들 손절했다더라", sourceId: "S3" }, // 원문에 없음 → 폐기
      ],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).wordings.map((w) => w.text)).toEqual(["가즈아 풀매수"]);
  });
});

describe("parse / prompt / 커뮤니티 원문 보존", () => {
  it("parseThemeInsightResponse — 코드펜스/잡텍스트 허용", () => {
    const raw = '응답:\n```json\n{"stocks":["삼성전자"],"bull":[{"claim":"c","sourceId":"S1","quote":"q"}],"bear":[],"wordings":[],"stanceNote":""}\n```';
    const p = parseThemeInsightResponse(raw)!;
    expect(p.stocks).toEqual(["삼성전자"]);
    expect(p.bull).toHaveLength(1);
    expect(parseThemeInsightResponse("not json")).toBeNull();
  });

  it("buildThemeInsightPrompt — 원문 번호·환각금지·균형·JSON 지시 포함", () => {
    const p = buildThemeInsightPrompt("반도체", DOCS);
    expect(p).toContain("[S1]");
    expect(p).toContain("일반론");
    expect(p).toMatch(/강세|약세/);
    expect(p).toContain("quote");
  });

  it("parseNaverBoardPosts — 제목 보존 + 감성 분류(개수 아님)", () => {
    const html = `
      <a href="board_read.naver?code=005930&nid=1" title="삼성전자 가즈아 풀매수">x</a><span>2026.06.14 11:00</span>
      <a href="board_read.naver?code=005930&nid=2" title="고점이다 손절각">y</a><span>2026.06.14 10:00</span>
    `;
    const posts = parseNaverBoardPosts(html, Date.parse("2026-06-14T03:30:00Z"), 10);
    expect(posts).toHaveLength(2);
    expect(posts.map((p) => p.title)).toContain("삼성전자 가즈아 풀매수");
    expect(posts.find((p) => p.title.includes("가즈아"))!.tone).toBe("bull");
    expect(posts.find((p) => p.title.includes("손절"))!.tone).toBe("bear");
  });
});
