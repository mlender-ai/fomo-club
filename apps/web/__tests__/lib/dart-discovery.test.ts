import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * DART 구조 덤프 가드.
 *
 * 이 라우트의 목적은 **구조를 그대로 남기는 것**이다(WO-SUB-00: 확보율을 세기 전에 구조를 먼저 본다).
 * 그래서 지켜야 할 것 두 가지만 잠근다 —
 *   1. 키가 없으면 조용히 성공하지 않는다(`keyPresent: false`).
 *   2. 응답에 **키를 실어 보내지 않는다**(url 마스킹).
 */

const ORIGINAL_KEY = process.env.DART_API_KEY;

describe("DART corp_code 매핑", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.DART_API_KEY;
    else process.env.DART_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it("corpCode.xml 이 ZIP 이 아니면 추측하지 않고 사유와 본문을 남긴다", async () => {
    process.env.DART_API_KEY = "K";
    // DART 는 키 오류 시 ZIP 대신 XML 을 준다 — 그걸 조용히 빈 매핑으로 삼으면 원인이 사라진다.
    vi.stubGlobal("fetch", async () => new Response("<result><status>020</status></result>", { status: 200 }));
    const { fetchCorpCodeMap } = await import("../../lib/fundamentals/dart-discovery");
    const map = await fetchCorpCodeMap("K", { refresh: true });
    expect(map.listedEntries).toBe(0);
    expect(map.error).toContain("ZIP 시그니처 아님");
    expect(map.error).toContain("<status>020</status>");
  });

  it("ZIP 을 풀어 종목코드 → corp_code 표를 만든다 — 비상장(종목코드 공백)은 뺀다", async () => {
    process.env.DART_API_KEY = "K";
    const xml =
      "<result>" +
      "<list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code></list>" +
      "<list><corp_code>00164779</corp_code><corp_name>종근당</corp_name><stock_code>185750</stock_code></list>" +
      "<list><corp_code>00999999</corp_code><corp_name>비상장회사</corp_name><stock_code> </stock_code></list>" +
      "</result>";
    const { deflateRawSync } = await import("node:zlib");
    const body = deflateRawSync(Buffer.from(xml, "utf8"));
    const name = Buffer.from("CORPCODE.xml", "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    const zip = Buffer.concat([header, name, body]);
    vi.stubGlobal("fetch", async () => new Response(zip, { status: 200 }));
    const { fetchCorpCodeMap } = await import("../../lib/fundamentals/dart-discovery");
    const map = await fetchCorpCodeMap("K", { refresh: true });
    expect(map.error).toBeNull();
    expect(map.totalEntries).toBe(3);
    expect(map.listedEntries).toBe(2);
    expect(map.byStockCode.get("185750")).toBe("00164779");
  });

  /**
   * 네트워크를 **부르지 않는다**는 것까지 단정한다.
   *
   * 종전에는 fetch 를 스텁하지 않아 빈 키로 DART 에 실제 요청이 나갔다. 로컬에서는 에러 XML 이
   * 빨리 와서 통과했지만 CI 에서 5초 테스트 타임아웃에 걸렸다(DART 응답이 느릴 때). 외부 fetch
   * 계층까지 모킹해야 한다는 것은 이 레포의 기록된 교훈이다(WO-SUB-03.5 PART D).
   */
  it("키가 없으면 네트워크를 부르지 않고 사유를 남긴다", async () => {
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      throw new Error("키가 없는데 네트워크를 불렀다");
    });
    const { fetchCorpCodeMap } = await import("../../lib/fundamentals/dart-discovery");
    const map = await fetchCorpCodeMap("", { refresh: true });
    expect(called).toBe(false);
    expect(map.listedEntries).toBe(0);
    expect(map.error).toContain("DART_API_KEY 없음");
  });
});
