/**
 * WO-RESET-02 PART A — 종목별 최근 90일 공시 목록을 모은다.
 *
 * ## 무엇을 저장하나 (A-1)
 *
 * 날짜 · 제목 · 종류 · 링크. **본문은 저장하지 않는다**(WO 하지 말 것 1번).
 * 제목은 원문 그대로 둔다 — 줄이거나 바꾸면 그건 우리가 쓴 말이 되고, 근거가 아니라 요약이 된다.
 *
 * ## 왜 화면에서 안 가져오나 (A-3)
 *
 * DART 목록 API 는 **날짜별**로만 준다(종목별 조회는 `corp_code` 가 필요하고 그 매핑은
 * 또 다른 수집이다). 그래서 하루치를 통째로 받아 우리 유니버스만 걸러낸다. 90일이면
 * 그 왕복이 수백 번이라 요청 경로에서 할 수 없다 — **미리 모아둔다.**
 *
 * ## 유니버스는 밖에서 받는다 (WO-RESET-04 PART D)
 *
 * 종전에는 `STOCK_VOCAB`(80종목)으로 걸렀다. 픽 엔진 유니버스가 326으로 넓어졌는데 여기가
 * 그대로면 **새로 들어온 260종목은 「왜 지금」에 쓸 날짜·사건이 영영 없다** — 카드는 나오는데
 * 근거 칸이 빈다. 그래서 유니버스를 인자로 받고, 라우트가 픽 엔진과 **같은 함수**로 만들어 넘긴다.
 * 넘기지 않으면 종전대로 사전을 쓴다(호환).
 *
 * ## 증분 수집
 *
 * 매 실행이 90일을 다시 훑지 않는다. 기본은 최근 며칠만 받아 **기존 저장분과 합치고**
 * 90일보다 오래된 것을 떨군다. 첫 채움이나 구멍 메우기는 `lookbackDays` 를 크게 줘서 돌린다.
 *
 * 시간 예산을 넘기면 **거기까지 모은 것을 저장하고 잘렸다고 기록한다.** 조용히 자르지 않는다 —
 * 부분 수집을 완전 수집으로 착각하면 "공시가 없다" 가 거짓말이 된다(그 문구가 §C-4 의 핵심이다).
 */

import { STOCK_VOCAB, classifyDisclosure, decodeHtmlEntities, type DisclosureKind, type StockDef } from "@fomo/core";
import { US_DISCOVERY_SYMBOLS, secCikForSymbol } from "./us-symbols";
import { secUserAgent } from "./sec-edgar";

export interface DisclosureItem {
  /** `YYYY-MM-DD`. */
  date: string;
  /** 공시 제목 **원문 그대로**. */
  title: string;
  kind: DisclosureKind;
  url?: string;
}

export interface DisclosureCollection {
  /** 이 수집이 끝난 시각. */
  asOf: string;
  /** 실제로 훑은 가장 오래된 날짜 — `최근 90일 공시가 없었다` 를 말해도 되는지의 근거다. */
  coveredFrom: string;
  /**
   * 그 날짜 범위를 **몇 종목짜리 유니버스로** 훑었나.
   *
   * `coveredFrom` 만으로는 부족하다. DART 목록은 하루치를 통째로 주고 우리가 유니버스로
   * 걸러내므로, **유니버스가 커지면 이미 훑은 날에도 새로 걸릴 종목이 생긴다.** 그런데
   * `coveredFrom` 은 "이 날짜까지 봤다" 만 말하므로 재개 로직이 과거를 다시 안 본다.
   *
   * 실제로 그랬다: 유니버스를 66 → 809 로 늘렸는데 공시가 붙은 종목은 155에 머물렀고,
   * 덱 15장 중 **공시 항목이 붙은 것이 0장**이었다(2026-08-27 실측). 새 종목의 90일 과거를
   * 영영 안 보는 상태였다.
   *
   * 구 저장분에는 이 필드가 없다 — 없으면 `0` 으로 보아 다시 훑는다(안전한 쪽).
   */
  coveredUniverse?: number;
  /** canonical → 최근 90일 공시(과거순). */
  byStock: Record<string, DisclosureItem[]>;
  /** 예산 초과로 훑다 만 날이 있는가. 있으면 "없었다" 를 말하지 않는다. */
  truncated: boolean;
  /** 소스별 실패 — 조용한 결손 금지. */
  errors: string[];
}

/** 화면이 보는 창(일). `@fomo/core` 의 `WHY_NOW_DISCLOSURE_WINDOW_DAYS` 와 같아야 한다. */
export const DISCLOSURE_WINDOW_DAYS = 90;

/** 기본 증분 창(일). 하루 한 번 도는 전제로 여유 있게 잡았다(주말·크론 지연 흡수). */
export const DISCLOSURE_DEFAULT_LOOKBACK_DAYS = 5;

/** 한 번 실행의 시간 예산. 라우트 `maxDuration` 300초 안에서 여유를 둔다. */
const BUDGET_MS = 240_000;

const DART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const DART_PAGE_COUNT = 100;
/** 하루치 전 종목 공시는 100건을 넘는다 — 우리 유니버스를 놓치지 않으려면 넉넉히 넘긴다. */
const DART_MAX_PAGES = 12;
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions";

function dartKey(): string | undefined {
  if (process.env.DISCOVERY_DART_LIVE === "0") return undefined;
  return process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
}

function yyyymmdd(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}

function isoFromDart(date: string | undefined): string | null {
  if (!date || !/^\d{8}$/.test(date)) return null;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function shiftIso(iso: string, days: number): string {
  const base = new Date(`${iso.slice(0, 10)}T12:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dartUrl(rceptNo: string | undefined): string | undefined {
  const no = rceptNo?.trim();
  return no && /^\d+$/.test(no) ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}` : undefined;
}

/**
 * 제목 정리 — **의미를 바꾸지 않는 것만** 한다.
 *
 * HTML 엔티티 복원과 공백 정규화까지다. 접두 `[정정]` 은 **남긴다** — 정정이라는 사실은
 * 사용자가 알아야 할 정보이고, 분류기는 접두를 무시하도록 따로 만들어져 있다.
 */
function cleanTitle(raw: string | undefined): string | null {
  const text = decodeHtmlEntities(raw ?? "").replace(/\s+/g, " ").trim();
  return text.length >= 2 ? text : null;
}

interface DartListItem {
  stock_code?: string;
  report_nm?: string;
  rcept_dt?: string;
  rcept_no?: string;
}

async function fetchDartDay(key: string, iso: string, page: number): Promise<DartListItem[] | null> {
  const url = new URL(DART_LIST_URL);
  url.searchParams.set("crtfc_key", key);
  url.searchParams.set("bgn_de", yyyymmdd(iso));
  url.searchParams.set("end_de", yyyymmdd(iso));
  url.searchParams.set("page_no", String(page));
  url.searchParams.set("page_count", String(DART_PAGE_COUNT));
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; list?: DartListItem[] };
  // `013` = 조회 결과 없음(휴일 등). 실패가 아니라 빈 날이다.
  if (data.status && data.status !== "000") return [];
  return data.list ?? [];
}

/** KR — 날짜별로 훑어 우리 유니버스만 남긴다. */
async function collectKr(
  dates: readonly string[],
  deadline: number,
  out: Map<string, DisclosureItem[]>,
  errors: string[],
  universe: readonly StockDef[]
): Promise<{ truncated: boolean; oldestScanned: string | null }> {
  const key = dartKey();
  if (!key) {
    errors.push("dart: DART_API_KEY 미설정 — KR 공시를 모으지 못했다");
    return { truncated: true, oldestScanned: null };
  }
  const byCode = new Map(
    universe.filter((s) => s.naverCode).map((s) => [s.naverCode!, s.canonical] as const)
  );
  let oldestScanned: string | null = null;

  for (const iso of dates) {
    if (Date.now() > deadline) return { truncated: true, oldestScanned };
    for (let page = 1; page <= DART_MAX_PAGES; page += 1) {
      if (Date.now() > deadline) return { truncated: true, oldestScanned };
      const list = await fetchDartDay(key, iso, page).catch((error) => {
        errors.push(`dart ${iso} p${page}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      if (list === null) break;
      if (list.length === 0) break;
      for (const item of list) {
        const canonical = byCode.get(item.stock_code?.trim() ?? "");
        if (!canonical) continue;
        const date = isoFromDart(item.rcept_dt) ?? iso;
        const title = cleanTitle(item.report_nm);
        if (!title) continue;
        const bucket = out.get(canonical) ?? [];
        bucket.push({ date, title, kind: classifyDisclosure(title), ...(dartUrl(item.rcept_no) ? { url: dartUrl(item.rcept_no)! } : {}) });
        out.set(canonical, bucket);
      }
      if (list.length < DART_PAGE_COUNT) break;
    }
    oldestScanned = iso;
  }
  return { truncated: false, oldestScanned };
}

/**
 * US — 심볼별 `submissions.json` 한 번이면 최근 제출이 다 온다. 날짜 창은 여기서 자른다.
 *
 * 유니버스는 `US_DISCOVERY_SYMBOLS` 가 정본이다 — `STOCK_VOCAB` 에는 심볼도 CIK 도 없다.
 */
async function collectUs(
  since: string,
  deadline: number,
  out: Map<string, DisclosureItem[]>,
  errors: string[]
): Promise<void> {
  /**
   * UA 형식은 `sec-edgar.ts` 의 실측 주석을 그대로 따른다 — 괄호 형식은 SEC WAF 가 403 을 준다.
   * 그래서 문자열을 새로 만들지 않고 그 모듈의 창구를 쓴다.
   */
  const userAgent = secUserAgent();
  if (!userAgent) {
    errors.push("sec: SEC_EDGAR_USER_AGENT 미설정 — US 공시를 모으지 못했다");
    return;
  }
  const targets = US_DISCOVERY_SYMBOLS.map((s) => ({
    canonical: s.canonical,
    cik: secCikForSymbol(s.symbol),
  })).filter((s): s is { canonical: string; cik: string } => Boolean(s.cik));
  for (const stock of targets) {
    if (Date.now() > deadline) return;
    const cik = stock.cik.padStart(10, "0");
    try {
      const res = await fetch(`${SEC_SUBMISSIONS}/CIK${cik}.json`, {
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) {
        errors.push(`sec ${stock.canonical}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        filings?: { recent?: { form?: string[]; filingDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] } };
      };
      const recent = data.filings?.recent;
      if (!recent?.form?.length) continue;
      const bucket = out.get(stock.canonical) ?? [];
      for (let i = 0; i < recent.form.length; i += 1) {
        const date = recent.filingDate?.[i];
        if (!date || date < since) break; // 최신순이므로 창을 벗어나면 끝
        const form = recent.form[i];
        if (!form) continue;
        const accession = recent.accessionNumber?.[i]?.replace(/-/g, "");
        const doc = recent.primaryDocument?.[i];
        bucket.push({
          date,
          // SEC 는 제목이 없다 — 폼 번호가 곧 제목이다. 지어내지 않고 그대로 쓴다.
          title: form,
          kind: classifyDisclosure(form),
          ...(accession && doc
            ? { url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${doc}` }
            : {}),
        });
      }
      if (bucket.length > 0) out.set(stock.canonical, bucket);
    } catch (error) {
      errors.push(`sec ${stock.canonical}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** 같은 공시가 두 번 들어오지 않게 — 날짜+제목이 같으면 하나로 본다. */
function dedupe(items: readonly DisclosureItem[]): DisclosureItem[] {
  const seen = new Set<string>();
  const out: DisclosureItem[] = [];
  for (const item of items) {
    const key = `${item.date}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 수집 실행. `previous` 를 주면 **합쳐서** 90일 창을 유지한다(증분).
 *
 * @param today   KST 기준 오늘 `YYYY-MM-DD`.
 * @param lookbackDays 이번에 새로 훑을 날 수. 첫 채움은 크게 준다.
 */
export async function collectDisclosures(options: {
  today: string;
  lookbackDays?: number;
  previous?: DisclosureCollection | null;
  /** 훑을 국내 유니버스. 안 주면 사전(종전 동작). 라우트는 픽 엔진과 같은 것을 넘긴다. */
  universe?: readonly StockDef[];
}): Promise<DisclosureCollection> {
  const { today, previous } = options;
  const universe = options.universe ?? STOCK_VOCAB;
  const lookback = Math.max(1, Math.min(options.lookbackDays ?? DISCLOSURE_DEFAULT_LOOKBACK_DAYS, DISCLOSURE_WINDOW_DAYS));
  const deadline = Date.now() + BUDGET_MS;
  const errors: string[] = [];
  const windowStart = shiftIso(today, -DISCLOSURE_WINDOW_DAYS);

  const fresh = new Map<string, DisclosureItem[]>();
  /**
   * 훑을 날짜 — **새로 생긴 것 + 아직 못 간 과거**.
   *
   * 첫 구현은 언제나 `today` 부터 거슬러 올라갔다. 그래서 예산에 잘리면(첫 실행 실측:
   * 90일 요청 → 20일만 훑고 `truncated`) **다시 돌려도 같은 최근 20일을 또 훑고** 더 과거로는
   * 영영 못 갔다. 증분이 아니라 제자리걸음이었다.
   *
   * 그래서 둘로 나눈다:
   *   1. 최근 `RECENT_ALWAYS_DAYS` 일 — 이미 덮었어도 다시 본다(그 사이 새 공시가 올라온다).
   *   2. 이미 덮은 구간(`coveredFrom`) **바로 앞**부터 과거로 — 이어받기.
   *
   * 덮은 구간이 없으면 종전처럼 오늘부터 내려간다.
   */
  /**
   * **유니버스가 커졌으면 과거를 다시 훑는다.** DART 목록은 하루치를 통째로 주고 우리가
   * 유니버스로 걸러내므로, 유니버스가 커지면 **이미 본 날에도 새 종목이 걸린다.**
   * 10% 넘게 커졌을 때만 되돌아간다 — 한두 종목 차이로 90일을 다시 훑으면 예산만 태운다.
   */
  const krUniverseSize = universe.filter((d) => d.naverCode).length;
  const universeGrew = krUniverseSize > (previous?.coveredUniverse ?? 0) * 1.1;

  const RECENT_ALWAYS_DAYS = 2;
  const dates = (() => {
    const recent = Array.from({ length: Math.min(RECENT_ALWAYS_DAYS, lookback) }, (_, i) => shiftIso(today, -i));
    const covered = universeGrew ? undefined : previous?.coveredFrom;
    if (!covered || covered >= today) {
      return Array.from({ length: lookback }, (_, i) => shiftIso(today, -i));
    }
    const remaining = lookback - recent.length;
    const older: string[] = [];
    for (let i = 1; i <= remaining; i += 1) {
      const day = shiftIso(covered, -i);
      if (day < windowStart) break; // 90일 창 밖은 어차피 버린다
      older.push(day);
    }
    return [...recent, ...older];
  })();
  const kr = await collectKr(dates, deadline, fresh, errors, universe);
  await collectUs(shiftIso(today, -lookback), deadline, fresh, errors);

  // 기존 저장분과 합치고 창 밖을 떨군다.
  const byStock: Record<string, DisclosureItem[]> = {};
  const names = new Set([...Object.keys(previous?.byStock ?? {}), ...fresh.keys()]);
  for (const name of names) {
    const merged = dedupe([...(previous?.byStock?.[name] ?? []), ...(fresh.get(name) ?? [])]).filter(
      (item) => item.date >= windowStart
    );
    if (merged.length > 0) byStock[name] = merged;
  }

  /**
   * `coveredFrom` — **실제로 훑은** 가장 오래된 날. 이전 수집이 덮은 구간과 이번 구간을 잇는다.
   * 이 값이 화면의 "최근 90일 공시가 없었어요" 를 말해도 되는지의 근거다.
   */
  /**
   * 유니버스가 커졌으면 **이전 커버리지를 물려받지 않는다.** 넓어진 유니버스로는 그 과거를
   * 아직 안 봤으므로, 물려받으면 "90일 다 봤다" 가 거짓말이 되고 "공시가 없었어요" 도
   * 따라서 거짓이 된다.
   */
  const previousFrom = universeGrew ? undefined : previous?.coveredFrom;
  /**
   * 이번에 실제로 끝까지 훑은 가장 오래된 날. 예산에 잘렸으면 `oldestScanned` 가 거기까지다.
   * 이전 커버리지와 **더 오래된 쪽**을 택한다 — 구간이 이어졌을 때만 뒤로 늘어난다.
   */
  const scannedFrom = kr.oldestScanned ?? dates.at(-1) ?? today;
  const candidate = previousFrom && previousFrom < scannedFrom ? previousFrom : scannedFrom;
  const coveredFrom = candidate < windowStart ? windowStart : candidate;

  return {
    asOf: new Date().toISOString(),
    coveredFrom,
    /**
     * **이번에 실제로 훑은 유니버스 크기.** 잘렸으면(`truncated`) 다음 실행이 다시 보게
     * 종전 값을 유지한다 — 부분 수집을 완전 수집으로 기록하면 그 구간이 영영 안 채워진다.
     */
    coveredUniverse: kr.truncated ? (previous?.coveredUniverse ?? 0) : krUniverseSize,
    byStock,
    truncated: kr.truncated,
    errors,
  };
}
