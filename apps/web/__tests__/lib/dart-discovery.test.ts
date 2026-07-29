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

describe("DART 구조 덤프", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.DART_API_KEY;
    else process.env.DART_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it("키가 없으면 조사하지 않고 그 사실을 남긴다 — 조용한 빈 성공 금지", async () => {
    delete process.env.DART_API_KEY;
    delete process.env.DART_CRTFC_KEY;
    const { discoverDartStructure } = await import("../../lib/fundamentals/dart-discovery");
    const result = await discoverDartStructure("185750");
    expect(result.keyPresent).toBe(false);
    expect(result.dumps).toEqual([]);
    expect(result.corpCode).toBeNull();
    expect(result.corpCodeMap.error).toBe("DART_API_KEY 없음");
  });

  it("덤프 URL 에서 크레덴셜을 지운다 — 응답으로 키가 새지 않아야 한다", async () => {
    process.env.DART_API_KEY = "SECRET_KEY_VALUE";
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "013", message: "조회된 데이타가 없습니다.", list: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const { discoverDartStructure } = await import("../../lib/fundamentals/dart-discovery");
    const result = await discoverDartStructure("185750");
    expect(result.keyPresent).toBe(true);
    expect(result.dumps.length).toBeGreaterThan(0);
    for (const dump of result.dumps) {
      expect(dump.url).not.toContain("SECRET_KEY_VALUE");
      expect(dump.url).toContain("crtfc_key=***");
    }
    expect(JSON.stringify(result)).not.toContain("SECRET_KEY_VALUE");
  });

  it("corpCode.xml 이 ZIP 이 아니면 추측하지 않고 사유와 본문을 남긴다", async () => {
    process.env.DART_API_KEY = "K";
    // DART 는 키 오류 시 ZIP 대신 XML 을 준다 — 그걸 조용히 빈 매핑으로 삼으면 원인이 사라진다.
    vi.stubGlobal("fetch", async () => new Response("<result><status>020</status></result>", { status: 200 }));
    const { fetchCorpCodeMap } = await import("../../lib/fundamentals/dart-discovery");
    const map = await fetchCorpCodeMap("K");
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
    const map = await fetchCorpCodeMap("K");
    expect(map.error).toBeNull();
    expect(map.totalEntries).toBe(3);
    expect(map.listedEntries).toBe(2);
    expect(map.byStockCode.get("185750")).toBe("00164779");
    expect(map.byStockCode.get("005930")).toBe("00126380");
  });
});
