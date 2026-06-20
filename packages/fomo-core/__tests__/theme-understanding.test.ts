import { describe, expect, it } from "vitest";
import {
  assembleThemeInsight,
  emptyThemeInsight,
  parseThemeInsightResponse,
  communityWordings,
  buildThemeInsightPrompt,
  parseNaverBoardPosts,
  condenseThemeInsight,
  discoverRelatedStocks,
  screenWordingRule,
  type SourceDoc,
  type ThemeInsight,
} from "../src";
import type { RawThemeInsight } from "../src/theme-understanding/parse";

const DOCS: SourceDoc[] = [
  { id: "S1", kind: "news", title: "엔비디아 신고가, HBM 수요 폭발", body: "외국인 매수세가 삼성전자·SK하이닉스로 번졌다.", source: "한국경제" },
  { id: "S2", kind: "news", title: "반도체 고점 논란, 일부 차익실현", body: "단기 과열 우려에 일부 기관이 차익실현에 나섰다.", source: "매일경제" },
  { id: "S3", kind: "community", title: "삼성전자 가즈아 풀매수", source: "네이버 종토방 삼성전자" },
];

const baseRaw: RawThemeInsight = { stocks: [], bull: [], bear: [], wordings: [], stanceNote: "" };

// ─────────────────────────────────────────────────────────────────────────────
// ★ 불변 규칙 (회귀 방지, BTRACK_VERIFIED_HANDOFF §1) — 절대 원칙의 코드화.
// 이 5종이 빨개지면 그건 회귀다. 테스트를 약화시키지 말고 코드를 고친다.
// ─────────────────────────────────────────────────────────────────────────────
describe("★ 불변 규칙 (회귀 방지)", () => {
  const fullRaw: RawThemeInsight = {
    stocks: ["삼성전자"],
    bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
    bear: [{ claim: "단기 차익실현이 나왔어", sourceId: "S2", quote: "차익실현에 나섰다" }],
    wordings: [{ text: "가즈아 풀매수", sourceId: "S3" }],
    stanceNote: "",
  };

  it("불변1 — 결정성: 같은 input 이면 항상 같은 output(강세/약세/워딩 동일)", () => {
    const a = assembleThemeInsight("반도체", DOCS, fullRaw);
    const b = assembleThemeInsight("반도체", DOCS, fullRaw);
    expect(a).toEqual(b);
    expect(a.bull.length).toBe(b.bull.length);
    expect(a.bear.length).toBe(b.bear.length);
    expect(a.wordings).toEqual(b.wordings);
  });

  it("불변2a — 워딩은 community 만(news/official 워딩 폐기)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
      wordings: [{ text: "외국인 매수세가 삼성전자", sourceId: "S1" }], // news → 폐기
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).wordings).toHaveLength(0);
  });

  it("불변2b — 강세/약세 근거는 news/official 만(community 근거 폐기)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "가즈아 분위기", sourceId: "S3", quote: "가즈아 풀매수" }], // community → 폐기
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });

  it("불변3 — grounding: 원문에 없는 quote(환각)는 폐기", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "지어낸 일반론", sourceId: "S1", quote: "이 문장은 원문에 절대 없다" }],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });

  it("불변4 — 균형/정직: 약세 0이면 stance 가 '약세 안 보여'로 정직 표기(가짜 안 채움)", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
    };
    const r = assembleThemeInsight("반도체", DOCS, raw);
    expect(r.stance).toBe("bull-dominant");
    expect(r.bear).toHaveLength(0);
    expect(r.stanceNote).toMatch(/약세.*안 보여/);
  });

  it("불변5 — 투자조언 차단: 매수/매도/예측 명령형 claim 은 폐기", () => {
    const raw: RawThemeInsight = {
      ...baseRaw,
      bull: [{ claim: "지금 삼성전자 매수해라", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
    };
    expect(assembleThemeInsight("반도체", DOCS, raw).bull).toHaveLength(0);
  });

  it("불변5b — 매매신호 relay 차단: '매수 신호'·'추천'(시그널 서비스 인용)도 폐기", () => {
    for (const claim of [
      "AI 기자가 블록에 매수 신호를 보냈어",
      "네패스를 추천 후 주가가 올랐어",
    ]) {
      const raw: RawThemeInsight = { ...baseRaw, bull: [{ claim, sourceId: "S1", quote: "외국인 매수세가 삼성전자" }] };
      expect(assembleThemeInsight("반도체", DOCS, raw).bull, claim).toHaveLength(0);
    }
  });
});

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

describe("디시 주식갤러리 파서 (C-3)", () => {
  it("parseDcGalleryTitles — board/view 앵커 제목 추출(태그/엔티티 정리·중복·숫자만 스킵)", async () => {
    const { parseDcGalleryTitles } = await import("../src");
    const html = `
      <td class="gall_tit"><a href="/board/view/?id=stock&amp;no=123">삼성전자 <b>가즈아</b></a></td>
      <td class="gall_tit"><a href="/board/view/?id=stock&no=124">반도체 슈퍼사이클 온다</a></td>
      <td class="gall_tit"><a href="/board/view/?id=stock&no=125">반도체 슈퍼사이클 온다</a></td>
      <td><a href="/board/view/?id=stock&no=126">42</a></td>
    `;
    const out = parseDcGalleryTitles(html, 10);
    expect(out).toContain("삼성전자 가즈아");
    expect(out).toContain("반도체 슈퍼사이클 온다");
    expect(out.filter((t) => t === "반도체 슈퍼사이클 온다")).toHaveLength(1); // 중복 제거
    expect(out).not.toContain("42"); // 숫자만 스킵
  });

  it("빈/무효 입력 → 빈 배열", async () => {
    const { parseDcGalleryTitles } = await import("../src");
    expect(parseDcGalleryTitles("")).toEqual([]);
    expect(parseDcGalleryTitles("<div>no anchors</div>")).toEqual([]);
  });
});

describe("FRED 공식 데이터 (C-2)", () => {
  it("parseFredCsvLatest — 최신 유효 관측치(결측 '.' 스킵)", async () => {
    const { parseFredCsvLatest } = await import("../src");
    const csv = "observation_date,FEDFUNDS\n2026-03-01,4.33\n2026-04-01,.\n2026-05-01,3.63\n";
    expect(parseFredCsvLatest(csv)).toEqual({ date: "2026-05-01", value: 3.63 });
    expect(parseFredCsvLatest("")).toBeNull();
    expect(parseFredCsvLatest("observation_date,X\n2026-05-01,.\n")).toBeNull(); // 전부 결측
  });

  it("buildFredDoc — 팩트 문장 + official-high + kind official(주장 아닌 숫자)", async () => {
    const { buildFredDoc } = await import("../src");
    const doc = buildFredDoc("S1", "FEDFUNDS", { date: "2026-05-01", value: 3.63 })!;
    expect(doc.kind).toBe("official");
    expect(doc.tier).toBe("official-high");
    expect(doc.title).toContain("3.63%");
    expect(doc.body).toContain("FRED FEDFUNDS");
    expect(doc.source).toContain("FRED");
    // 사전에 없는 시리즈 → null
    expect(buildFredDoc("S2", "UNKNOWN_X", { date: "2026-05-01", value: 1 })).toBeNull();
  });

  it("FRED 문장은 이해 레이어의 grounding 근거로 쓰인다(quote substring)", async () => {
    const { buildFredDoc } = await import("../src");
    const doc = buildFredDoc("S1", "FEDFUNDS", { date: "2026-05-01", value: 3.63 })!;
    const raw = {
      stocks: [],
      bull: [],
      bear: [{ claim: "기준금리가 높게 유지돼 부담이라는 시각", sourceId: "S1", quote: "기준금리(연방기금금리)는 3.63%" }],
      wordings: [],
      stanceNote: "",
    };
    const r = assembleThemeInsight("금리", [doc], raw);
    expect(r.bear).toHaveLength(1); // 연준 숫자에 grounded → 통과
    expect(r.sources[0]!.tier).toBe("official-high");
  });
});

describe("소스 tier 전파 (C-1)", () => {
  it("SourceDoc.tier → InsightSourceRef.tier 로 전파(가중·표기용)", () => {
    const docs: SourceDoc[] = [
      { id: "S1", kind: "news", title: "외국인 매수세가 삼성전자", source: "연합뉴스", tier: "news-mid" },
    ];
    const raw = {
      stocks: [],
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
      bear: [],
      wordings: [],
      stanceNote: "",
    };
    const r = assembleThemeInsight("반도체", docs, raw);
    expect(r.sources[0]!.tier).toBe("news-mid");
  });
});

describe("워딩 안전 필터 (룰 단계, Track C 선행)", () => {
  it("욕설/혐오 → 탈락", () => {
    expect(screenWordingRule("시발 존버 지친다").kept).toBe(false);
    expect(screenWordingRule("틀딱들 다 팔아").kept).toBe(false);
  });
  it("종목 단정/매매신호/찌라시 → 탈락", () => {
    expect(screenWordingRule("삼성 무조건 간다").kept).toBe(false);
    expect(screenWordingRule("내부 정보 입수했다").kept).toBe(false);
    expect(screenWordingRule("이거 100% 상한가").kept).toBe(false);
  });
  it("감정·심리 표현 → 통과(원문 그대로)", () => {
    expect(screenWordingRule("전강후약 쎄함").kept).toBe(true);
    expect(screenWordingRule("존버 지친다").kept).toBe(true);
    expect(screenWordingRule("국장 장투할거야? 난 치고 빠질래").kept).toBe(true);
  });
  it("탈락 사유(reason)를 남긴다(검수용)", () => {
    expect(screenWordingRule("시발").reason).toContain("욕설");
    expect(screenWordingRule("무조건 간다").reason).toMatch(/단정|매매|찌라시/);
  });

  it("assemble: 룰 위반 워딩은 wordings 에서 빠지고 audit 에 사유로 남는다", () => {
    const docs: SourceDoc[] = [
      { id: "S1", kind: "news", title: "외국인 매수세가 삼성전자", source: "한국경제" },
      { id: "S3", kind: "community", title: "전강후약 쎄함 씨발 무조건 간다", source: "종토방" },
    ];
    const raw = {
      stocks: [],
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
      bear: [],
      wordings: [
        { text: "전강후약 쎄함", sourceId: "S3" },
        { text: "씨발 무조건 간다", sourceId: "S3" },
      ],
      stanceNote: "",
    };
    const r = assembleThemeInsight("반도체", docs, raw);
    expect(r.wordings.map((w) => w.text)).toEqual(["전강후약 쎄함"]); // 욕설/단정 워딩 제거
    expect(r.wordingAudit).toBeDefined();
    const bad = r.wordingAudit!.find((a) => a.text === "씨발 무조건 간다")!;
    expect(bad.kept).toBe(false);
    expect(bad.reason).toContain("욕설");
  });
});

describe("출처 종류 강제 — 워딩은 community 전용 (§3-b)", () => {
  it("뉴스 원문에 grounded 된 워딩은 폐기(워딩=사람들 말=community)", () => {
    const docs: SourceDoc[] = [
      { id: "S1", kind: "news", title: "외국인 매수세가 삼성전자로 번졌다", source: "매일경제" },
      { id: "S2", kind: "community", title: "가즈아 풀매수 ㄱㄱ", source: "종토방" },
    ];
    const raw = {
      stocks: [],
      bull: [{ claim: "외국인이 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" }],
      bear: [],
      wordings: [
        { text: "외국인 매수세가 삼성전자", sourceId: "S1" }, // 뉴스 → 폐기
        { text: "가즈아 풀매수", sourceId: "S2" }, // 커뮤니티 → 통과
      ],
      stanceNote: "",
    };
    const r = assembleThemeInsight("반도체", docs, raw);
    expect(r.wordings.map((w) => w.text)).toEqual(["가즈아 풀매수"]); // 뉴스 워딩 사라짐
    // 폐기 사유가 감사 로그에 남는다.
    const dropped = r.wordingAudit!.find((a) => a.text === "외국인 매수세가 삼성전자")!;
    expect(dropped.kept).toBe(false);
    expect(dropped.reason).toContain("community 아님");
  });

  it("강세/약세 근거는 news/official 만 — community 출처 근거는 폐기(워딩 전용)", () => {
    const docs: SourceDoc[] = [
      { id: "S1", kind: "news", title: "삼성전자 외국인 순매수 지속", source: "한국경제" },
      { id: "S2", kind: "community", title: "하닉 고점이다 손절각", source: "종토방" },
      { id: "S3", kind: "official", title: "미국 기준금리 3.63%", source: "FRED" },
    ];
    const raw = {
      stocks: [],
      bull: [
        { claim: "외국인 순매수가 이어졌어", sourceId: "S1", quote: "외국인 순매수" }, // news → 통과
        { claim: "공식 금리가 높아", sourceId: "S3", quote: "기준금리 3.63%" }, // official → 통과
      ],
      bear: [{ claim: "고점이라는 시각", sourceId: "S2", quote: "고점이다" }], // community → 폐기
      wordings: [],
      stanceNote: "",
    };
    const r = assembleThemeInsight("반도체", docs, raw);
    expect(r.bull).toHaveLength(2); // news + official
    expect(r.bear).toHaveLength(0); // community 약세 폐기
    expect(r.stance).toBe("bull-dominant"); // 약세 0 → 정직하게
    expect(r.sources.every((s) => s.kind !== "community")).toBe(true); // 근거 출처에 community 없음
  });

  it("근거(bull/bear)의 출처 종류는 doc.kind 그대로 라벨됨(뉴스↔공식 안 섞임)", () => {
    const docs: SourceDoc[] = [
      { id: "S1", kind: "news", title: "삼성전자 외국인 순매수", source: "한국경제", tier: "news-mid" },
      { id: "S2", kind: "official", title: "미국 기준금리 3.63%", source: "FRED", tier: "official-high" },
    ];
    const raw = {
      stocks: [],
      bull: [{ claim: "외국인이 순매수했어", sourceId: "S1", quote: "외국인 순매수" }],
      bear: [{ claim: "금리가 높아 부담이라는 시각", sourceId: "S2", quote: "기준금리 3.63%" }],
      wordings: [],
      stanceNote: "",
    };
    const r = assembleThemeInsight("반도체", docs, raw);
    expect(r.sources.find((s) => s.id === "S1")!.kind).toBe("news");
    expect(r.sources.find((s) => s.id === "S2")!.kind).toBe("official");
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

  it("condenseThemeInsight — 응축은 grounded claim 만 조립(새 사실 없음) + 균형 유지", () => {
    const insight: ThemeInsight = {
      theme: "반도체",
      stocks: ["삼성전자"],
      bull: [
        { claim: "외국인이 삼성전자를 담았어", sourceId: "S1", quote: "외국인 매수세가 삼성전자" },
        { claim: "소부장 ETF가 뛰었어", sourceId: "S2", quote: "소부장 ETF 뛰었다" },
        { claim: "세번째 강세", sourceId: "S1", quote: "외국인 매수세" },
      ],
      bear: [{ claim: "투톱이 주춤했어", sourceId: "S2", quote: "주춤할 때" }],
      wordings: [
        { text: "전강후약 쎄함", sourceId: "S3" },
        { text: "불기둥", sourceId: "S3" },
        { text: "세번째워딩", sourceId: "S3" },
      ],
      stance: "balanced",
      stanceNote: "강세와 약세 관점이 원문에 둘 다 있어.",
      sources: [{ id: "S1", kind: "news", title: "t1", url: "https://x/1" }],
      confidence: "low",
    };
    const c = condenseThemeInsight(insight, { maxPerSide: 2, maxWordings: 2 });
    expect(c.bull).toHaveLength(2); // maxPerSide
    expect(c.bear).toHaveLength(1);
    expect(c.wordings).toHaveLength(2); // maxWordings
    // whyHot 의 사실 문장은 전부 A의 claim 그대로(환각 없음).
    expect(c.whyHot).toContain("외국인이 삼성전자를 담았어");
    expect(c.whyHot).toContain("투톱이 주춤했어");
    // 출처(링크) 유지.
    expect(c.sources[0]!.url).toBe("https://x/1");
    expect(c.confidence).toBe("low");
  });

  it("condense — lean(쏠림): grounded 전체 카운트 + 방향 + oneSided", () => {
    const mk = (bull: number, bear: number): ThemeInsight => ({
      theme: "반도체",
      stocks: [],
      bull: Array.from({ length: bull }, (_, i) => ({ claim: `b${i}`, sourceId: "S1", quote: "q" })),
      bear: Array.from({ length: bear }, (_, i) => ({ claim: `r${i}`, sourceId: "S1", quote: "q" })),
      wordings: [],
      stance: "balanced",
      stanceNote: "",
      sources: [{ id: "S1", kind: "news", title: "t" }],
      confidence: "low",
      reason: "r",
    });
    // slice(maxPerSide=2) 와 무관하게 lean 은 전체 카운트.
    const a = condenseThemeInsight(mk(9, 1));
    expect(a.lean).toEqual({ bullCount: 9, bearCount: 1, direction: "bull", oneSided: false });
    expect(a.bull.length).toBe(2); // 표시는 slice
    expect(condenseThemeInsight(mk(3, 3)).lean.direction).toBe("balanced");
    expect(condenseThemeInsight(mk(5, 0)).lean).toMatchObject({ direction: "bull", oneSided: true });
    expect(condenseThemeInsight(mk(0, 4)).lean).toMatchObject({ direction: "bear", oneSided: true });
  });

  it("condense — 강세만이면 약세 안 보임 정직 표기(균형)", () => {
    const insight: ThemeInsight = {
      theme: "반도체",
      stocks: [],
      bull: [{ claim: "강세근거", sourceId: "S1", quote: "q" }],
      bear: [],
      wordings: [],
      stance: "bull-dominant",
      stanceNote: "약세 관점은 원문에서 안 보여.",
      sources: [],
      confidence: "low",
    };
    const c = condenseThemeInsight(insight);
    expect(c.whyHot).toContain("약세 관점은 원문에서 안 보여");
    expect(c.bear).toHaveLength(0);
  });

  it("condense — insufficient 면 가짜 응축 없이 빈 상태 통과", () => {
    const c = condenseThemeInsight(emptyThemeInsight("반도체", "원문 없음"));
    expect(c.confidence).toBe("insufficient");
    expect(c.bull).toEqual([]);
    expect(c.bear).toEqual([]);
  });

  it("condense — 출처 다양성: 한 매체뿐이면 singleOutlet, 여러 매체면 false", () => {
    const mk = (sources: { id: string; source: string }[]): ThemeInsight => ({
      theme: "반도체",
      stocks: [],
      bull: [{ claim: "강세", sourceId: sources[0]!.id, quote: "q" }],
      bear: [],
      wordings: [],
      stance: "bull-dominant",
      stanceNote: "약세 안 보임",
      sources: sources.map((s) => ({ id: s.id, kind: "news" as const, title: "t", source: s.source })),
      confidence: "low",
      reason: "r",
    });
    const single = condenseThemeInsight(mk([{ id: "S1", source: "매일경제" }, { id: "S2", source: "매일경제" }]));
    expect(single.outlets).toEqual(["매일경제"]);
    expect(single.singleOutlet).toBe(true);
    const multi = condenseThemeInsight(mk([{ id: "S1", source: "매일경제" }, { id: "S2", source: "한국경제" }]));
    expect(multi.outlets.sort()).toEqual(["한국경제", "매일경제"].sort());
    expect(multi.singleOutlet).toBe(false);
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

describe("발굴 엔진 — 연관 확산 (BM 구멍1, 불변)", () => {
  // 반도체 대장주(THEME_DICTIONARY.related) = 삼성전자/SK하이닉스/엔비디아.
  const mk = (stocks: string[], bull: { claim: string; sourceId: string; quote: string }[]): ThemeInsight => ({
    theme: "반도체",
    stocks,
    bull,
    bear: [],
    wordings: [],
    stance: "bull-dominant",
    stanceNote: "",
    sources: [{ id: "S1", kind: "news", title: "t", source: "한국경제" }],
    confidence: "low",
    reason: "r",
  });

  it("의외성 — 대장주(삼성전자)는 연관주로 안 뽑힌다", () => {
    const insight = mk(
      ["삼성전자", "한미반도체"],
      [
        { claim: "삼성전자가 외국인 매수세", sourceId: "S1", quote: "외국인 매수세" },
        { claim: "한미반도체가 삼성에 HBM 장비를 납품한다", sourceId: "S1", quote: "HBM 장비" },
      ]
    );
    const r = discoverRelatedStocks(insight);
    expect(r.map((x) => x.stock)).toEqual(["한미반도체"]); // 삼성전자(대장주) 제외
    expect(r[0]!.reason).toContain("한미반도체"); // grounded 연관 근거
    expect(r[0]!.sourceId).toBe("S1");
  });

  it("grounding — 연관 근거(claim 언급) 없는 종목은 폐기", () => {
    // HPSP 가 stocks 에 있지만 어떤 claim 도 HPSP 를 언급 안 함 → 폐기.
    const insight = mk(
      ["HPSP", "한미반도체"],
      [{ claim: "한미반도체가 장비를 납품한다", sourceId: "S1", quote: "장비" }]
    );
    expect(discoverRelatedStocks(insight).map((x) => x.stock)).toEqual(["한미반도체"]);
  });

  it("결정성 — 같은 insight → 같은 연관주", () => {
    const insight = mk(
      ["한미반도체", "HPSP"],
      [
        { claim: "한미반도체 납품 확대", sourceId: "S1", quote: "납품" },
        { claim: "HPSP 수주 증가", sourceId: "S1", quote: "수주" },
      ]
    );
    expect(discoverRelatedStocks(insight)).toEqual(discoverRelatedStocks(insight));
  });

  it("정직한 빈 상태 — 연관주 없으면 빈 배열(가짜 안 채움)", () => {
    expect(discoverRelatedStocks(mk(["삼성전자"], []))).toEqual([]);
  });

  it("v1.1 — 카테고리어(미국 AI주·반도체 부품·기술주)는 연관주에서 제외, 진짜 종목만", () => {
    const insight = mk(
      ["미국 AI주", "반도체 부품", "중국 기술주", "제너셈"],
      [
        { claim: "미국 AI주가 비싸다는 인식", sourceId: "S1", quote: "비싼" },
        { claim: "반도체 부품 수요가 늘었다", sourceId: "S1", quote: "수요" },
        { claim: "중국 기술주가 재평가받는다", sourceId: "S1", quote: "재평가" },
        { claim: "제너셈이 SK하이닉스에 장비를 공급한다", sourceId: "S1", quote: "공급" },
      ]
    );
    expect(discoverRelatedStocks(insight).map((x) => x.stock)).toEqual(["제너셈"]);
  });
});

describe("parseThemeInsightResponse — 깨진 LLM JSON 복구(바이오 파싱 실패 사고)", () => {
  it("코드펜스로 감싼 JSON 을 파싱한다", () => {
    const r = parseThemeInsightResponse('```json\n{"stocks":["삼성전자"],"bull":[],"bear":[],"wordings":[],"stanceNote":""}\n```');
    expect(r).not.toBeNull();
    expect(r!.stocks).toEqual(["삼성전자"]);
  });
  it("스마트따옴표 + trailing comma 를 복구한다", () => {
    const r = parseThemeInsightResponse('{“stocks”:[“SK하이닉스”,],“bull”:[],“bear”:[],“wordings”:[],“stanceNote”:“”}');
    expect(r).not.toBeNull();
    expect(r!.stocks).toEqual(["SK하이닉스"]);
  });
  it("문자열 내 raw 줄바꿈(제어문자)을 복구한다", () => {
    const r = parseThemeInsightResponse('{"stocks":[],"bull":[{"claim":"수요\n증가","sourceId":"S1","quote":""}],"bear":[],"wordings":[],"stanceNote":""}');
    expect(r).not.toBeNull();
    expect(r!.bull[0]!.claim).toContain("수요");
  });
  it("JSON 이 전혀 없으면 null", () => {
    expect(parseThemeInsightResponse("죄송합니다, 답변을 드릴 수 없습니다.")).toBeNull();
  });
});

describe("communityWordings — 워딩은 커뮤니티 출처만(§3-b)", () => {
  const insight = {
    theme: "반도체", whyHot: "", bull: [], bear: [], stance: "balanced", stanceNote: "",
    outlets: [], singleOutlet: false, confidence: "low", lean: { bullCount: 0, bearCount: 0, oneSided: false },
    reason: "", relatedStocks: [],
    wordings: [
      { text: "존버한다", sourceId: "S1" },   // 커뮤니티
      { text: "기사 인용", sourceId: "S2" },   // 뉴스 — 제외돼야
      { text: "공식 발표", sourceId: "S3" },   // 공식 — 제외돼야
    ],
    sources: [
      { id: "S1", kind: "community", title: "종토방" },
      { id: "S2", kind: "news", title: "매일경제" },
      { id: "S3", kind: "official", title: "FRED" },
    ],
  } as never;
  it("뉴스·공식 출처 워딩은 거르고 커뮤니티만 남긴다", () => {
    const out = communityWordings(insight);
    expect(out.map((w) => w.text)).toEqual(["존버한다"]);
  });
  it("커뮤니티 워딩이 없으면 빈 배열", () => {
    const none = { ...insight, wordings: [{ text: "기사", sourceId: "S2" }] } as never;
    expect(communityWordings(none)).toEqual([]);
  });
});
