/**
 * 병행 운용 대조 (OPS-04 PART D).
 *
 * > 1주차 — 맥이 운영(업로드), 서버는 그림자(로컬 기록만). **매일 두 쪽 결과를 대조한다.**
 *
 * | 대조 항목 | 여기서 |
 * |---|---|
 * | 같은 신호가 나왔나 | 갈라진 시각(`since`) 뒤의 **진입**이 양쪽에 다 있나. 진입은 신호가 실제로 행동이 된 것이다 |
 * | 같은 시각에 체결했나 | 짝지은 진입·청산 시각 차이 |
 * | 같은 가격인가 | 진입·청산 가격 차이(bp) |
 * | 트랙별 N · 손익 차이 | 트랙 거래 수 · 자본 |
 *
 * **순수 함수다.** 양쪽 자료를 받아 판정만 한다 — 어디서 읽는지는 `scripts/ops/server/shadow-compare.ts` 가 안다.
 *
 * ## 갈라진 시각
 *
 * 서버 FCE 는 맥 DB 를 복사해 시작한다. 그 전의 거래는 id 까지 같으니 대조할 게 없다. `since` 뒤에 **진입한** 것은
 * 양쪽이 각자 만든 것이라 id 가 다르다(uuid4) — 그래서 트랙 · 심볼 · 방향 · 진입 시각으로 짝짓는다. `since` 때
 * 이미 열려 있던 거래는 id 가 같으므로 id 로 짝지어 **청산**만 본다.
 */

export interface ShadowTrade {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  entryAt: string | null;
  entryPrice: number | null;
  exitAt: string | null;
  exitPrice: number | null;
  netPnlUsdt: number | null;
}

export interface ShadowPosition {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  entryAt: string | null;
  entryPrice: number | null;
}

export interface ShadowTrack {
  key: string;
  trades: number | null;
  currentCapital: number | null;
  status: string;
}

/** 한 쪽(맥 또는 서버)의 모습. */
export interface ShadowSide {
  /** 이 자료를 읽은 시각. */
  at: string;
  tracks: ShadowTrack[];
  trades: ShadowTrade[];
  positions: ShadowPosition[];
}

export interface ShadowOptions {
  /** 서버가 맥 DB 를 복사한 시각. 이 뒤만 대조한다. */
  since: string;
  /**
   * 진입 시각 허용차(분). 크립토는 확정 봉 시각으로 들어가 **0** 이어야 한다. 고래 추종은 지갑 체결을 몇 분 간격으로
   * 읽어 따라가므로 두 기계가 같은 체결을 몇 분 차이로 볼 수 있다.
   */
  entryToleranceMin?: Record<string, number>;
  /** 가격 허용차(bp). 기본 1bp. */
  priceToleranceBp?: number;
}

type Side = "mac" | "server";

interface Entry {
  side: Side;
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  entryAt: number;
  entryPrice: number | null;
  /** 닫혔으면 청산, 아직 열려 있으면 null. */
  exitAt: number | null;
  exitPrice: number | null;
  netPnlUsdt: number | null;
}

export interface EntryPair {
  trackKey: string;
  symbol: string;
  direction: string;
  mac: Entry;
  server: Entry;
  entryLagMin: number;
  entryPriceBp: number | null;
  exitLagMin: number | null;
  exitPriceBp: number | null;
  /** 한쪽만 청산했다. */
  exitMismatch: boolean;
  netPnlDiff: number | null;
}

export interface TrackDiff {
  key: string;
  macTrades: number | null;
  serverTrades: number | null;
  macCapital: number | null;
  serverCapital: number | null;
  macStatus: string | null;
  serverStatus: string | null;
}

export interface ShadowReport {
  since: string;
  macAt: string;
  serverAt: string;
  verdict: "일치" | "불일치";
  /** 불일치 사유 한 줄씩. 일치면 빈 배열. */
  reasons: string[];
  pairs: EntryPair[];
  onlyMac: Entry[];
  onlyServer: Entry[];
  tracks: TrackDiff[];
  /** 트랙별 `since` 뒤 청산 순손익 합. */
  pnlSince: { key: string; mac: number; server: number }[];
}

const MIN = 60_000;
const DEFAULT_TOLERANCE_MIN: Record<string, number> = { crypto: 0, whale: 15 };

const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso));

function bp(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a === 0) return null;
  return Math.abs((b - a) / a) * 10_000;
}

function entries(side: Side, s: ShadowSide): Entry[] {
  const out: Entry[] = [];
  for (const t of s.trades) {
    const at = ms(t.entryAt);
    if (at === null) continue;
    out.push({
      side,
      id: t.id,
      trackKey: t.trackKey,
      symbol: t.symbol,
      direction: t.direction,
      entryAt: at,
      entryPrice: t.entryPrice,
      exitAt: ms(t.exitAt),
      exitPrice: t.exitPrice,
      netPnlUsdt: t.netPnlUsdt,
    });
  }
  for (const p of s.positions) {
    const at = ms(p.entryAt);
    if (at === null) continue;
    // 같은 id 가 거래 쪽에도 있으면(업로드 사이 청산) 거래가 이긴다.
    if (out.some((e) => e.id === p.id)) continue;
    out.push({
      side,
      id: p.id,
      trackKey: p.trackKey,
      symbol: p.symbol,
      direction: p.direction,
      entryAt: at,
      entryPrice: p.entryPrice,
      exitAt: null,
      exitPrice: null,
      netPnlUsdt: null,
    });
  }
  return out;
}

function pair(mac: Entry, server: Entry): EntryPair {
  const bothClosed = mac.exitAt !== null && server.exitAt !== null;
  return {
    trackKey: mac.trackKey,
    symbol: mac.symbol,
    direction: mac.direction,
    mac,
    server,
    entryLagMin: Math.abs(server.entryAt - mac.entryAt) / MIN,
    entryPriceBp: bp(mac.entryPrice, server.entryPrice),
    exitLagMin: bothClosed ? Math.abs((server.exitAt as number) - (mac.exitAt as number)) / MIN : null,
    exitPriceBp: bothClosed ? bp(mac.exitPrice, server.exitPrice) : null,
    exitMismatch: (mac.exitAt === null) !== (server.exitAt === null),
    netPnlDiff:
      bothClosed && mac.netPnlUsdt !== null && server.netPnlUsdt !== null ? server.netPnlUsdt - mac.netPnlUsdt : null,
  };
}

export function compareShadow(mac: ShadowSide, server: ShadowSide, options: ShadowOptions): ShadowReport {
  const since = Date.parse(options.since);
  const tol = { ...DEFAULT_TOLERANCE_MIN, ...(options.entryToleranceMin ?? {}) };
  const priceTol = options.priceToleranceBp ?? 1;

  const macAll = entries("mac", mac);
  const serverAll = entries("server", server);

  // ① 갈라지기 전에 열려 있던 것 — id 가 같다. 청산만 본다.
  const openAtFork = (e: Entry) => e.entryAt < since && (e.exitAt === null || e.exitAt >= since);
  const pairs: EntryPair[] = [];
  const onlyMac: Entry[] = [];
  const onlyServer: Entry[] = [];
  const serverById = new Map(serverAll.filter(openAtFork).map((e) => [e.id, e]));
  for (const m of macAll.filter(openAtFork)) {
    const s = serverById.get(m.id);
    if (s) {
      pairs.push(pair(m, s));
      serverById.delete(m.id);
    } else onlyMac.push(m);
  }
  onlyServer.push(...serverById.values());

  // ② 갈라진 뒤 진입 — 트랙 · 심볼 · 방향이 같고 진입 시각이 허용차 안에서 가장 가까운 것끼리.
  const fresh = (e: Entry) => e.entryAt >= since;
  const pool = serverAll.filter(fresh);
  for (const m of macAll.filter(fresh).sort((a, b) => a.entryAt - b.entryAt)) {
    const limit = (tol[m.trackKey] ?? 0) * MIN;
    let best = -1;
    let bestLag = Infinity;
    pool.forEach((s, i) => {
      if (s.trackKey !== m.trackKey || s.symbol !== m.symbol || s.direction !== m.direction) return;
      const lag = Math.abs(s.entryAt - m.entryAt);
      if (lag <= limit && lag < bestLag) {
        best = i;
        bestLag = lag;
      }
    });
    if (best >= 0) {
      pairs.push(pair(m, pool[best] as Entry));
      pool.splice(best, 1);
    } else onlyMac.push(m);
  }
  onlyServer.push(...pool);

  // ③ 트랙
  const keys = [...new Set([...mac.tracks.map((t) => t.key), ...server.tracks.map((t) => t.key)])];
  const tracks: TrackDiff[] = keys.map((key) => {
    const a = mac.tracks.find((t) => t.key === key);
    const b = server.tracks.find((t) => t.key === key);
    return {
      key,
      macTrades: a?.trades ?? null,
      serverTrades: b?.trades ?? null,
      macCapital: a?.currentCapital ?? null,
      serverCapital: b?.currentCapital ?? null,
      macStatus: a?.status ?? null,
      serverStatus: b?.status ?? null,
    };
  });

  const pnl = (side: ShadowSide, key: string) =>
    side.trades
      .filter((t) => t.trackKey === key && t.exitAt !== null && Date.parse(t.exitAt) >= since)
      .reduce((s, t) => s + (t.netPnlUsdt ?? 0), 0);
  const tradeKeys = [...new Set([...mac.trades, ...server.trades].map((t) => t.trackKey))];
  const pnlSince = tradeKeys.map((key) => ({ key, mac: pnl(mac, key), server: pnl(server, key) }));

  // ④ 판정 — 한 줄이라도 어긋나면 불일치. 맥이 계속 운영한다.
  const reasons: string[] = [];
  const fmt = (e: Entry) => `${e.trackKey} ${e.symbol} ${e.direction} ${new Date(e.entryAt).toISOString().slice(0, 16)}`;
  for (const e of onlyMac) reasons.push(`맥에만 있는 진입 — ${fmt(e)}`);
  for (const e of onlyServer) reasons.push(`서버에만 있는 진입 — ${fmt(e)}`);
  for (const p of pairs) {
    const name = fmt(p.mac);
    if (p.entryPriceBp !== null && p.entryPriceBp > priceTol) reasons.push(`진입가 ${p.entryPriceBp.toFixed(1)}bp 차이 — ${name}`);
    if (p.exitMismatch) reasons.push(`한쪽만 청산 — ${name} (맥 ${p.mac.exitAt ? "청산" : "보유"} · 서버 ${p.server.exitAt ? "청산" : "보유"})`);
    if (p.exitLagMin !== null && p.exitLagMin > (tol[p.trackKey] ?? 0)) reasons.push(`청산 시각 ${p.exitLagMin.toFixed(0)}분 차이 — ${name}`);
    if (p.exitPriceBp !== null && p.exitPriceBp > priceTol) reasons.push(`청산가 ${p.exitPriceBp.toFixed(1)}bp 차이 — ${name}`);
  }
  for (const t of tracks) {
    if (t.macStatus !== t.serverStatus) reasons.push(`${t.key} 상태 — 맥 ${t.macStatus ?? "없음"} · 서버 ${t.serverStatus ?? "없음"}`);
    if (t.macTrades !== t.serverTrades) reasons.push(`${t.key} N — 맥 ${t.macTrades ?? "—"} · 서버 ${t.serverTrades ?? "—"}`);
  }

  return {
    since: options.since,
    macAt: mac.at,
    serverAt: server.at,
    verdict: reasons.length === 0 ? "일치" : "불일치",
    reasons,
    pairs,
    onlyMac,
    onlyServer,
    tracks,
    pnlSince,
  };
}

const n2 = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/** 문서에 그대로 붙이는 모양. 매일 한 장. */
export function shadowMarkdown(r: ShadowReport): string {
  const lines = [
    `## ${r.serverAt.slice(0, 10)} — **${r.verdict}**`,
    "",
    `갈라진 시각 ${r.since} · 맥 자료 ${r.macAt} · 서버 자료 ${r.serverAt}`,
    "",
    "| 트랙 | N 맥 | N 서버 | 자본 맥 | 자본 서버 | 상태 맥 | 상태 서버 |",
    "|---|---|---|---|---|---|---|",
    ...r.tracks.map(
      (t) =>
        `| ${t.key} | ${t.macTrades ?? "—"} | ${t.serverTrades ?? "—"} | ${n2(t.macCapital)} | ${n2(t.serverCapital)} | ${t.macStatus ?? "—"} | ${t.serverStatus ?? "—"} |`
    ),
    "",
    "| 트랙 | 갈라진 뒤 청산 순손익 맥 | 서버 |",
    "|---|---|---|",
    ...r.pnlSince.map((p) => `| ${p.key} | ${p.mac.toFixed(2)} | ${p.server.toFixed(2)} |`),
    "",
    `짝지은 진입 ${r.pairs.length} · 맥에만 ${r.onlyMac.length} · 서버에만 ${r.onlyServer.length}`,
    "",
  ];
  if (r.reasons.length > 0) {
    lines.push("### 어긋난 것", "", ...r.reasons.map((x) => `- ${x}`), "");
  }
  return lines.join("\n");
}
