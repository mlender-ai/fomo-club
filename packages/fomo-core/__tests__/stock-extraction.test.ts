import { describe, expect, it } from "vitest";
import {
  extractStocks,
  isLikelyStock,
  pickSurpriseStock,
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

describe("isLikelyStock — 종목 아닌 카테고리/품목/활동어 제외(희토류·무기 생산 사고)", () => {
  it("품목·산업·소재어는 종목 아님", () => {
    expect(isLikelyStock("희토류")).toBe(false);
    expect(isLikelyStock("반도체")).toBe(false);
    expect(isLikelyStock("2차전지")).toBe(false);
    expect(isLikelyStock("AI")).toBe(false);
  });
  it("카테고리·활동 접미사로 끝나면 종목 아님", () => {
    expect(isLikelyStock("무기 생산")).toBe(false);
    expect(isLikelyStock("반도체 관련주")).toBe(false);
    expect(isLikelyStock("2차전지 테마")).toBe(false);
  });
  it("실제 종목명은 통과(품목어를 부분 포함해도)", () => {
    expect(isLikelyStock("삼성전자")).toBe(true);
    expect(isLikelyStock("삼성바이오로직스")).toBe(true); // "바이오" 부분포함 보호
    expect(isLikelyStock("엔비디아")).toBe(true);
    expect(isLikelyStock("에코프로비엠")).toBe(true);
  });
});

describe("pickSurpriseStock — 의외의 추천 종목(대장주 말고 같이 뜬 종목)", () => {
  const mk = (n: number, title: string) => Array.from({ length: n }, () => ({ title }));
  it("대장주(1위) 제외하고 덜 알려진 종목을 고른다", () => {
    const items = [
      ...mk(5, "삼성전자 강세 삼성전자 또 삼성전자"), // 대장주 5
      ...mk(3, "한미반도체 납품 한미반도체 수주"),     // 코스닥 3
      ...mk(2, "SK하이닉스 실적"),                      // 대형 2
    ];
    const s = pickSurpriseStock(items);
    expect(s).not.toBeNull();
    expect(s!.canonical).not.toBe("삼성전자"); // 대장주 아님
  });
  it("종목이 대장주 하나뿐이면 null(의외 성립 안 함)", () => {
    const s = pickSurpriseStock([...Array(4)].map(() => ({ title: "삼성전자 뉴스" })));
    expect(s).toBeNull();
  });
  it("종목 0이면 null", () => {
    expect(pickSurpriseStock([{ title: "금리 인상 우려" }])).toBeNull();
  });
  // 회귀(prod 버그): 키워드로 좁힌 부분집합에선 비-marquee 종목이 1회만 등장하는 게 흔하다.
  // 기본 minMentions=2 였을 때 2+ 생존자가 전부 marquee라 제외 후 후보 0 → 항상 null(화면에 영영 안 뜸).
  // 기본 1로 내려 grounded 1회 언급도 후보가 돼야 한다. (반도체 매칭 집합 ≈ 한미반도체:1 + 마르키:N 재현)
  it("비-marquee 후보가 1회만 등장해도(marquee 다수) 그 종목을 고른다 — 기본 minMentions 1", () => {
    const items = [
      ...mk(5, "SK하이닉스 메모리 강세"),  // marquee 5
      ...mk(3, "삼성전자 반도체"),          // marquee 3
      { title: "한미반도체 HBM 장비 수주" }, // 비-marquee, 1회뿐
    ];
    const s = pickSurpriseStock(items);
    expect(s).not.toBeNull();
    expect(s!.canonical).toBe("한미반도체");
  });
});

describe("STOCK_VOCAB 확장 — 신규 종목 인식 + 오인식 방지", () => {
  it("새 종목을 원문에서 인식한다", () => {
    const items: KeywordSourceItem[] = [
      { title: "한화오션 카타르 LNG선 수주" },
      { title: "한화오션 추가 계약" },
      { title: "알테오젠 기술수출 기대 알테오젠 신고가" },
      { title: "한국항공우주 KAI 폴란드 수출" },
      { title: "한국항공우주 실적 호조" },
    ];
    const names = extractStocks(items, { minMentions: 2 }).map((s) => s.canonical);
    expect(names).toContain("한화오션");
    expect(names).toContain("한국항공우주");
  });
  it("짧은 영문 티커(HLB·KAI)는 일반 단어에서 오인식 안 함", () => {
    expect(stockMatchesText("HLB", "the global supply chain")).toBe(false);
    expect(stockMatchesText("한국항공우주", "kайak trip")).toBe(false);
    expect(stockMatchesText("HLB", "HLB 임상 결과")).toBe(true);
  });
  it("신규 비-marquee 종목이 주목 후보가 된다(대장주만 있을 때 비지 않게)", () => {
    const items = [
      ...Array(5).fill({ title: "삼성전자 반도체 강세" }),
      ...Array(3).fill({ title: "한미반도체 HBM 장비" }),
      { title: "리노공업 테스트소켓 수주" },
    ];
    const s = pickSurpriseStock(items);
    expect(s).not.toBeNull();
    expect(["한미반도체", "리노공업"]).toContain(s!.canonical);
  });
});
