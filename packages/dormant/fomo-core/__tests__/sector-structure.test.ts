import { describe, expect, it } from "vitest";
import {
  SECTORS,
  sectorOf,
  stocksBySector,
  sortStocksForFeed,
  STOCK_VOCAB,
  type SectorStock,
  type StockSector,
} from "../src";

describe("섹터 ↔ 종목 매핑 (SECTOR_STRUCTURE §2 토대)", () => {
  it("SECTORS 는 THEME 키와 일치(섹터 요약 재사용 위해) + 중복 없음", () => {
    expect(SECTORS.length).toBe(new Set(SECTORS).size);
    expect(SECTORS).toContain("반도체");
    expect(SECTORS).toContain("코인");
  });

  it("stocksBySector — 그 섹터 종목만, 다른 섹터 종목 안 섞임", () => {
    const semi = stocksBySector("반도체");
    const names = semi.map((s) => s.canonical);
    expect(names).toContain("삼성전자"); // 대장주
    expect(names).toContain("한미반도체"); // 중소형
    expect(names).toContain("엔비디아"); // 글로벌 진원지
    expect(names).not.toContain("셀트리온"); // 바이오
    for (const s of semi) expect(s.sector).toBe("반도체");
  });

  it("대장주(marquee) + 발굴 후보(중소형)가 같은 풀에 섞여 있다(§4)", () => {
    const semi = stocksBySector("반도체");
    expect(semi.some((s) => s.marquee)).toBe(true); // 삼성전자류
    expect(semi.some((s) => !s.marquee)).toBe(true); // 한미반도체류
  });

  it("콜드스타트 기본 정렬 — 대표 대장주가 위로", () => {
    const semi = stocksBySector("반도체");
    const firstNonMarquee = semi.findIndex((s) => !s.marquee);
    const lastMarquee = semi.map((s) => s.marquee).lastIndexOf(true);
    expect(lastMarquee).toBeLessThan(firstNonMarquee); // 모든 marquee 가 비-marquee 앞
  });

  it("requireNaverCode — baseline 보장(국내 상장)만 (빈 카드 방지용)", () => {
    const all = stocksBySector("반도체");
    const krOnly = stocksBySector("반도체", { requireNaverCode: true });
    expect(krOnly.every((s) => !!s.naverCode)).toBe(true);
    expect(krOnly.some((s) => s.canonical === "엔비디아")).toBe(false); // 미국주 제외
    expect(all.length).toBeGreaterThan(krOnly.length);
  });

  it("개인화 정렬 seam — rank 주입 시 그 점수 순(다음 트랙 자리)", () => {
    const semi = stocksBySector("반도체");
    const liked = "한미반도체";
    const sorted = sortStocksForFeed(semi, { rank: (s) => (s.canonical === liked ? 100 : 0) });
    expect(sorted[0]!.canonical).toBe(liked); // 주입 점수가 대장주보다 위로
  });

  it("결정적 — 같은 입력은 같은 순서(캐시·새로고침 안정)", () => {
    const a = stocksBySector("방산").map((s) => s.canonical);
    const b = stocksBySector("방산").map((s) => s.canonical);
    expect(a).toEqual(b);
  });

  it("sectorOf — 매핑 일관성: vocab 의 섹터 보유 종목은 stocksBySector 에 정확히 1번 등장", () => {
    const counts = new Map<string, number>();
    for (const sec of SECTORS) {
      for (const s of stocksBySector(sec)) {
        counts.set(s.canonical, (counts.get(s.canonical) ?? 0) + 1);
        expect(sectorOf(s.canonical)).toBe(sec);
      }
    }
    for (const [, c] of counts) expect(c).toBe(1); // 단일 primary 섹터(평평)
  });

  it("매핑 없는 종목은 섹터 풀에 안 나온다(정직 — 가짜 섹터 금지)", () => {
    const inAnySector = new Set<string>();
    for (const sec of SECTORS) for (const s of stocksBySector(sec)) inAnySector.add(s.canonical);
    // 자동차(현대차)는 대응 테마 없음 → 어떤 섹터 풀에도 없음
    expect(STOCK_VOCAB.some((d) => d.canonical === "현대차")).toBe(true);
    expect(inAnySector.has("현대차")).toBe(false);
  });

  // ── SECTOR_POOL_EXPANSION §6: 최소 풀 + 코드 위생 ──
  // 코인은 구조적 공백(코인 자체는 상장주 아님) → 관련 상장주로 채우되 MIN 예외(화이트리스트).
  const MIN_BASELINE = 8;
  const MIN_EXEMPT: ReadonlySet<StockSector> = new Set<StockSector>(["코인"]);

  it(`baseline(국내 상장) 풀이 각 섹터 >= ${MIN_BASELINE} (코인 예외) — 무한 스와이프 체감`, () => {
    for (const sec of SECTORS) {
      const n = stocksBySector(sec, { requireNaverCode: true }).length;
      if (MIN_EXEMPT.has(sec)) {
        expect(n, `${sec}(예외) 최소 1개는 있어야`).toBeGreaterThan(0);
      } else {
        expect(n, `${sec} baseline 풀 ${n} < ${MIN_BASELINE}`).toBeGreaterThanOrEqual(MIN_BASELINE);
      }
    }
  });

  it("naverCode 위생 — 전부 6자리 숫자 + canonical/코드 중복 없음", () => {
    for (const d of STOCK_VOCAB) {
      if (d.naverCode) expect(d.naverCode, `잘못된 코드 ${d.canonical}:${d.naverCode}`).toMatch(/^\d{6}$/);
    }
    const names = STOCK_VOCAB.map((d) => d.canonical);
    expect(new Set(names).size, "canonical 중복").toBe(names.length);
  });
});

// 타입 사용 보장(미사용 import 린트 회피).
const _typecheck: SectorStock | undefined = undefined;
void _typecheck;
