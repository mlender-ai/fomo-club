import { describe, expect, it } from "vitest";
import {
  extractStocks,
  stockMatchesText,
  stockDef,
  extractKeywords,
  THEME_DICTIONARY,
  type KeywordSourceItem,
} from "../src";

// 그날 원문 형태(뉴스+커뮤니티 제목). 엔비디아(글로벌)·삼성전자(KR)는 여러 번, 애플은 1번만.
const DOCS: KeywordSourceItem[] = [
  { title: "엔비디아 신고가, HBM 수요 폭발" },
  { title: "Nvidia earnings beat, AI demand strong", summary: "NVDA up" }, // 같은 종목 다른 별칭
  { title: "엔비디아 효과에 SK하이닉스·삼성전자 동반 강세" },
  { title: "삼성전자 파운드리 수주 기대" },
  { title: "애플 신제품 루머" }, // 1회 → 임계(2) 미만
  { title: "오늘 날씨 맑음" }, // 종목 0
];

describe("extractStocks — 그날 원문에 등장한 종목만(B 트랙 §1)", () => {
  it("임계(기본 2) 이상 등장 종목만, 빈도 내림차순", () => {
    const stocks = extractStocks(DOCS);
    const names = stocks.map((s) => s.canonical);
    expect(names).toContain("엔비디아"); // 3건
    expect(names).toContain("삼성전자"); // 2건
    expect(names).not.toContain("애플"); // 1건 → 노이즈 컷
    // 엔비디아가 삼성전자보다 많이 등장 → 앞
    expect(names.indexOf("엔비디아")).toBeLessThan(names.indexOf("삼성전자"));
  });

  it("같은 글에 별칭 여러 개 나와도 글 1건으로 카운트", () => {
    const stocks = extractStocks([
      { title: "엔비디아 Nvidia NVDA 삼중 언급" }, // 1건
      { title: "엔비디아 추가 상승" }, // 1건
    ]);
    expect(stocks.find((s) => s.canonical === "엔비디아")?.mentions).toBe(2);
  });

  it("market/country 동봉 + naverCode는 국내만 + relatedHint는 빈 배열(가짜 연관 금지)", () => {
    const stocks = extractStocks(DOCS);
    const nvda = stocks.find((s) => s.canonical === "엔비디아")!;
    const samsung = stocks.find((s) => s.canonical === "삼성전자")!;
    expect(nvda.market).toBe("NASDAQ");
    expect(nvda.country).toBe("US");
    expect(nvda.naverCode).toBeUndefined(); // 미국주 → 종토방 없음
    expect(samsung.market).toBe("KOSPI");
    expect(samsung.country).toBe("KR");
    expect(samsung.naverCode).toBe("005930");
    expect(nvda.relatedHint).toEqual([]); // D 이후 — 지금은 항상 비움
  });

  it("minMentions 옵션 — 1로 낮추면 1회 종목도 포함", () => {
    const names = extractStocks(DOCS, { minMentions: 1 }).map((s) => s.canonical);
    expect(names).toContain("애플");
  });

  it("빈 입력 → 빈 배열(에러 없음)", () => {
    expect(extractStocks([])).toEqual([]);
  });
});

describe("stockMatchesText — 별칭/티커 grounding", () => {
  it("엔비디아=Nvidia=NVDA 모두 인식", () => {
    expect(stockMatchesText("엔비디아", "엔비디아 급등")).toBe(true);
    expect(stockMatchesText("엔비디아", "Nvidia rallies")).toBe(true);
    expect(stockMatchesText("엔비디아", "NVDA to the moon")).toBe(true);
    expect(stockMatchesText("엔비디아", "삼성전자만 언급")).toBe(false);
  });
  it("티커는 단어경계 — 단어 속에서 오인식 안 함", () => {
    expect(stockMatchesText("AMD", "AMD 신제품")).toBe(true);
    expect(stockMatchesText("AMD", "camden street")).toBe(false); // 'amd' 부분일치 방지
  });
  it("stockDef 로 정의 조회", () => {
    expect(stockDef("엔비디아")?.country).toBe("US");
    expect(stockDef("없는종목")).toBeUndefined();
  });
});

describe("테마 풀 확장(B 트랙 §2) — 후킹 테마 추가 + 동적 노출", () => {
  it("새 테마가 사전에 있다", () => {
    for (const t of ["방산", "바이오", "원자력", "공급망"]) {
      expect(THEME_DICTIONARY[t]).toBeDefined();
    }
  });
  it("그날 원문에 뜬 테마만 추출(안 뜨면 자동 제외)", () => {
    const items: KeywordSourceItem[] = [
      { title: "한화에어로스페이스 방산 수출 호조" },
      { title: "두산에너빌리티 원전·SMR 수주" },
    ];
    const keys = extractKeywords(items).map((k) => k.keyword);
    expect(keys).toContain("방산");
    expect(keys).toContain("원자력");
    expect(keys).not.toContain("바이오"); // 안 뜸 → 제외(정직)
  });
  it("오인식 방지 — '무기한'은 방산 아님, '제약사항'은 바이오 아님", () => {
    const keys = extractKeywords([
      { title: "회의 무기한 연기, 제약사항 검토" },
    ]).map((k) => k.keyword);
    expect(keys).not.toContain("방산");
    expect(keys).not.toContain("바이오");
  });
});
