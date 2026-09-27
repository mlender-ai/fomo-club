/**
 * 복기 거래 한 건의 "왜" (UI-09 PART B) — 순수 함수.
 *
 * | 칸 | 어디서 |
 * |---|---|
 * | 진입 사유 · 당시 조건 | FCE 거래의 `entry_evidence` · `checklist` · `stance_snapshot` — **FCE 가 진입할 때 적은 것** |
 * | 사후 채점 | 청산 7일 뒤 가격 — Bitget 공개 일봉(시장 데이터). FCE 는 페이퍼 거래의 사후 가격을 재지 않는다 |
 *
 * ## 사후 채점은 랩이 잰다 — 규칙을 여기 적는다
 *
 * FCE 의 "사후 채점 27,624건" 은 **고래 체결**의 채점이고(`observed_win_rates`), 우리 거래의 청산 뒤 가격은 FCE 에 없다.
 * 그래서 시세로 잰다 — FCE 가 낸 값을 다시 계산하는 게 아니라 FCE 가 안 재는 것을 새로 잰다.
 *
 * - 기준: 청산가 → 청산 **7일 뒤 그날 일봉 종가**. 방향을 맞춘다(롱이면 오른 게 +, 숏이면 내린 게 +)
 * - ±1% 안이면 `flat` — 그 안의 움직임으로 청산을 탓하지 않는다
 * - 7일이 안 지났으면 `matured: false` — 요약(청산 품질)에 넣지 않는다
 */
import { shortAddress } from "./fce-payload";

export const POST_EXIT_DAYS = 7;
/** ±이 안의 사후 움직임은 "변화 없음". */
export const POST_EXIT_FLAT_PCT = 1;

const DAY = 86_400_000;

export type ExitCategory = "stop" | "take" | "signal" | "time" | "other";

/**
 * FCE 청산 사유 → UI-09 의 넷(손절 · 익절 · 신호 · 시간). FCE 가 새 사유를 내면 `other` 로 떨어진다 —
 * 숨기지 않고 `기타` 로 보인다(하지 말 것: 청산 사유를 빼지 말 것).
 */
const CATEGORY: Record<string, ExitCategory> = {
  invalidation_breach: "stop",
  breakeven_stop: "stop",
  take_profit_1: "take",
  take_profit_2: "take",
  take_profit_pressure: "take",
  opposite_stance_flip: "signal",
  time_decay: "time",
  time_stop: "time",
};

export function exitCategory(reason: string | null): ExitCategory {
  return (reason && CATEGORY[reason]) || "other";
}

export const CATEGORY_LABEL: Record<ExitCategory, string> = {
  stop: "손절",
  take: "익절",
  signal: "신호",
  time: "시간",
  other: "기타",
};

export interface PostExit {
  horizonDays: number;
  /** 7일이 지났나. 안 지났으면 `days` 는 지금까지 지난 날. */
  matured: boolean;
  days: number;
  price: number;
  /** 방향 맞춘 청산가 대비 %(롱: 오르면 + · 숏: 내리면 +). */
  movePct: number;
  verdict: "favorable" | "adverse" | "flat";
}

/** 일봉 `[t(초), o, h, l, c]` — 오래된 것부터. */
export type DailyCandle = [number, number, number, number, number];

export function postExitOf(
  t: { direction: string; exitAt: string | null; exitPrice: number | null },
  daily: DailyCandle[],
  now: Date
): PostExit | null {
  if (!t.exitAt || !t.exitPrice || daily.length === 0) return null;
  const exit = Date.parse(t.exitAt);
  const target = exit + POST_EXIT_DAYS * DAY;
  const matured = now.getTime() >= target;
  // 7일 뒤 그날의 일봉(없으면 지금까지 마지막 일봉).
  const at = matured ? target : now.getTime();
  const candle = [...daily].reverse().find((k) => k[0] * 1000 <= at) ?? null;
  if (!candle || candle[0] * 1000 < exit - DAY) return null;
  const close = candle[4];
  const side = t.direction === "short" || t.direction === "SHORT" ? -1 : 1;
  const movePct = side * (close / t.exitPrice - 1) * 100;
  return {
    horizonDays: POST_EXIT_DAYS,
    matured,
    days: Math.max(0, Math.floor((at - exit) / DAY)),
    price: close,
    movePct,
    verdict: movePct > POST_EXIT_FLAT_PCT ? "favorable" : movePct < -POST_EXIT_FLAT_PCT ? "adverse" : "flat",
  };
}

/**
 * 사후 채점 한 줄 해석 (B-1 — **숫자만 두지 않는다**).
 *
 * **포지션 방향 기준**으로 쓴다 — 숏 손절 뒤 가격이 14.8% 올랐는데 "손절 후 더 빠졌다" 라고 썼다(실측 LINKUSDT).
 * 차트가 아니라 포지션이 어떻게 됐을지를 말한다.
 *
 * | | 포지션에 유리하게 갔다 | 불리하게 갔다 |
 * |---|---|---|
 * | 손절 | 손절 뒤 되돌아왔다 — 손절이 빡빡했을 수 있다 | 손절 뒤 더 밀렸다 — 손절이 맞았다 |
 * | 익절 | 익절 뒤 더 갔다 — 익절이 일렀을 수 있다 | 익절 뒤 되돌았다 — 익절이 맞았다 |
 * | 신호·시간 | 나온 뒤 유리하게 갔다 — 더 들고 있었으면 벌었다 | 나온 뒤 불리하게 갔다 — 나온 게 맞았다 |
 */
export function postExitLine(category: ExitCategory, p: PostExit | null): string | null {
  if (!p) return null;
  const early = p.matured ? "" : ` (${p.days}일째 · 아직 7일 전)`;
  if (p.verdict === "flat") return `나온 뒤 큰 변화 없음${early}`;
  const up = p.verdict === "favorable";
  if (category === "stop") return (up ? "손절 뒤 되돌아왔다 — 손절이 빡빡했을 수 있다" : "손절 뒤 더 밀렸다 — 손절이 맞았다") + early;
  if (category === "take") return (up ? "익절 뒤 더 갔다 — 익절이 일렀을 수 있다" : "익절 뒤 되돌았다 — 익절이 맞았다") + early;
  return (up ? "나온 뒤 유리하게 갔다 — 더 들고 있었으면 벌었다" : "나온 뒤 불리하게 갔다 — 나온 게 맞았다") + early;
}

// ── FCE 거래 → "왜" ────────────────────────────────────────────────────────

export interface TradeDetail {
  /** 진입 사유 — FCE 근거 주장(크립토) 또는 고래 체결(고래). */
  reasons: { engine: string; claim: string; confidence: number | null }[];
  whale: {
    short: string;
    event: string | null;
    sizeUsd: number | null;
    price: number | null;
    at: string | null;
    delaySec: number | null;
    driftPctOfStop: number | null;
    label: string | null;
  } | null;
  /** 진입 체크리스트 — FCE 가 통과시킨 조건. */
  checklist: { label: string; status: string; reason: string | null }[];
  /** 진입 때 FCE 스탠스. */
  stance: string | null;
  levels: { invalidation: number | null; stop: number | null; takeProfit1: number | null; takeProfit2: number | null };
  partial: { at: string | null; price: number | null } | null;
  lossTags: string[];
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** FCE 거래 한 건(`/api/paper/trades` · `/api/onchain/follow/trades`)에서 **이름으로** 칸을 옮긴다. 전체 주소는 줄인다. */
export function tradeDetail(raw: Record<string, unknown>): TradeDetail {
  const ev = rec(raw.entry_evidence);
  const items = Array.isArray(ev.items) ? ev.items.map(rec) : [];
  const whaleAddress = s(ev.whale_address);
  const checklist = Array.isArray(rec(raw.checklist).items) ? (rec(raw.checklist).items as unknown[]).map(rec) : [];
  return {
    reasons: items
      .filter((i) => s(i.claim))
      .map((i) => ({ engine: s(i.engine) ?? "", claim: s(i.claim) as string, confidence: n(i.confidence) })),
    whale: whaleAddress
      ? {
          short: shortAddress(whaleAddress),
          event: s(ev.whale_event),
          sizeUsd: n(ev.whale_size_usd),
          price: n(ev.whale_price),
          at: s(ev.whale_event_at),
          delaySec: n(ev.signal_to_entry_seconds),
          driftPctOfStop: n(ev.price_drift_pct_of_stop),
          label: s(ev.label),
        }
      : null,
    checklist: checklist
      .filter((c) => s(c.label))
      .map((c) => ({ label: s(c.label) as string, status: s(c.status) ?? "", reason: s(c.reason) })),
    stance: s(rec(raw.stance_snapshot).stance),
    levels: {
      invalidation: n(raw.invalidation_price),
      stop: n(raw.stop_price),
      takeProfit1: n(raw.take_profit_price),
      takeProfit2: n(raw.take_profit_2_price),
    },
    partial: raw.partial_exit_at ? { at: s(raw.partial_exit_at), price: n(raw.partial_exit_price) } : null,
    lossTags: Array.isArray(raw.loss_tags) ? raw.loss_tags.map(String) : [],
  };
}
