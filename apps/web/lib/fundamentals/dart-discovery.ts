import { inflateRawSync } from "node:zlib";
import { readFeedContent, writeFeedContent } from "../feed-content-store";

/**
 * DART `corp_code` 매핑.
 *
 * 원래 이 파일은 구조 덤프 라우트(`/api/fomo/cron/dart-discovery`)의 본체였다. 그 라우트는
 * **역할을 마쳐서 제거했다** — 인증 없이 호출되는 경로를 남겨 두면 외부에서 반복 호출해
 * DART 쿼터를 태울 수 있다. 덤프 결과는 `docs/fundamentals/DUMP_dart_structure.md` 에 있고,
 * 재현이 필요하면 그 문서의 요청 목록을 쓰면 된다.
 *
 * 남긴 것은 어댑터가 계속 쓰는 매핑 하나다.
 */

const DART_BASE = "https://opendart.fss.or.kr/api";

/**
 * `corpCode.xml` ZIP 의 첫(유일) 엔트리를 푼다.
 *
 * 로컬 파일 헤더: `PK\x03\x04` + 26바이트 고정부, 이후 파일명·extra, 그 다음이 압축 본문이다.
 * 압축 방식 8(deflate) 만 다룬다 — 다른 값이면 추측하지 않고 실패로 남긴다.
 */
function unzipSingleEntry(buffer: Uint8Array): { xml: string } | { error: string } {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) {
    return { error: `ZIP 시그니처 아님(head=${Array.from(buffer.slice(0, 4)).join(",")})` };
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const method = view.getUint16(8, true);
  if (method !== 8) return { error: `지원하지 않는 압축 방식 ${method}` };
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const body = buffer.subarray(30 + nameLength + extraLength);
  try {
    return { xml: new TextDecoder("utf-8").decode(inflateRawSync(body)) };
  } catch (error) {
    return { error: `inflate 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface CorpCodeMap {
  /** 종목코드(6자리) → DART corp_code(8자리). 비상장사는 stock_code 가 비어 있어 빠진다. */
  byStockCode: Map<string, string>;
  totalEntries: number;
  listedEntries: number;
  error: string | null;
  /** 단계별 소요(ms) — 60초 타임아웃의 원인이 전송인지 해동인지 파싱인지 구분한다. */
  timing: { fetchMs: number; unzipMs: number; parseMs: number };
  /** 캐시에서 읽었는가. 매핑은 하루에 몇 건 바뀌므로 매 호출 10만 행을 다시 받을 이유가 없다. */
  fromCache: boolean;
}

/** 매핑 캐시 키 — 기존 `FeedContentCache`(JSONB) 재사용, 신규 DDL 0. */
const CORP_CODE_CACHE_KEY = "dart-corpcode-map";
/**
 * `corpCode.xml` 은 10만 행짜리 ZIP 이고 DART 전송이 느리다(실측: 60초 타임아웃).
 * 매핑은 상장·상호 변경 때만 바뀌므로 캐시가 정답이다.
 */
const CORP_CODE_TTL_MS = 7 * 86_400_000;
/** 전송이 느린 것이 확인됐으므로 여유를 준다(라우트 maxDuration 안). */
const CORP_CODE_TIMEOUT_MS = 240_000;

interface CachedCorpCodeMap {
  fetchedAt: string;
  totalEntries: number;
  /** "종목코드:corp_code" 평문 배열 — JSONB 크기를 객체 키 오버헤드 없이 줄인다. */
  pairs: string[];
}

/** 공식 매핑 파일을 받아 종목코드 → corp_code 표를 만든다. 캐시 우선. */
export async function fetchCorpCodeMap(key: string, options: { refresh?: boolean } = {}): Promise<CorpCodeMap> {
  const zero = { fetchMs: 0, unzipMs: 0, parseMs: 0 };
  const empty = (error: string, timing = zero): CorpCodeMap => ({
    byStockCode: new Map(),
    totalEntries: 0,
    listedEntries: 0,
    error,
    timing,
    fromCache: false,
  });

  if (!options.refresh) {
    const cached = await readFeedContent<CachedCorpCodeMap>(CORP_CODE_CACHE_KEY).catch(() => null);
    const fetchedAt = cached ? Date.parse(cached.fetchedAt) : Number.NaN;
    if (cached && Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CORP_CODE_TTL_MS) {
      const byStockCode = new Map<string, string>();
      for (const pair of cached.pairs) {
        const [stock, corp] = pair.split(":");
        if (stock && corp) byStockCode.set(stock, corp);
      }
      return { byStockCode, totalEntries: cached.totalEntries, listedEntries: byStockCode.size, error: null, timing: zero, fromCache: true };
    }
  }

  const startedAt = Date.now();
  const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${key}`, {
    signal: AbortSignal.timeout(CORP_CODE_TIMEOUT_MS),
  }).catch((error: unknown) => ({ ok: false, status: 0, error }) as const);
  if (!("arrayBuffer" in res)) {
    const elapsed = Date.now() - startedAt;
    return empty(`corpCode.xml 요청 실패(${elapsed}ms): ${String((res as { error?: unknown }).error)}`, { ...zero, fetchMs: elapsed });
  }
  if (!res.ok) return empty(`corpCode.xml HTTP ${res.status}`, { ...zero, fetchMs: Date.now() - startedAt });
  const buffer = new Uint8Array(await res.arrayBuffer());
  const fetchMs = Date.now() - startedAt;

  const unzipAt = Date.now();
  const unzipped = unzipSingleEntry(buffer);
  const unzipMs = Date.now() - unzipAt;
  if ("error" in unzipped) {
    // ZIP 이 아니면 대개 에러 XML 이다 — 본문을 남겨 원인을 보이게 한다.
    return empty(`${unzipped.error} / head="${new TextDecoder().decode(buffer.subarray(0, 160))}"`, { fetchMs, unzipMs, parseMs: 0 });
  }

  const parseAt = Date.now();
  const byStockCode = new Map<string, string>();
  let totalEntries = 0;
  for (const match of unzipped.xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    totalEntries += 1;
    const block = match[1]!;
    const corp = block.match(/<corp_code>([^<]*)<\/corp_code>/)?.[1]?.trim();
    const stock = block.match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]?.trim();
    if (corp && stock && /^\d{6}$/.test(stock)) byStockCode.set(stock, corp);
  }
  const parseMs = Date.now() - parseAt;

  if (byStockCode.size > 0) {
    const payload: CachedCorpCodeMap = {
      fetchedAt: new Date().toISOString(),
      totalEntries,
      pairs: [...byStockCode].map(([stock, corp]) => `${stock}:${corp}`),
    };
    await writeFeedContent(CORP_CODE_CACHE_KEY, payload).catch(() => undefined);
  }
  return { byStockCode, totalEntries, listedEntries: byStockCode.size, error: null, timing: { fetchMs, unzipMs, parseMs }, fromCache: false };
}
