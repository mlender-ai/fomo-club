/**
 * TRADER-03 PART E — `/me/rules`. TRADER-02 산출물을 읽기 좋게. **순수 함수.**
 *
 * 규칙 JSON 을 사람 말로 옮길 뿐 해석을 더하지 않는다. '일치' 는 TRADER-02 C 표가 매긴 것 그대로.
 */
import type { RulesPayload } from "./types";

export type Match = "일치" | "부분" | "불일치" | "광혁 판단" | "말 안 함" | "데이터 없음" | "—";

export interface RuleLine {
  key: string;
  label: string;
  data: string;
  said: string;
  match: Match;
  details: { item: string; said: string; data: string; match: string }[];
}

export interface RulesView {
  ready: boolean;
  title: string;
  asOf: number | null;
  lines: RuleLine[];
  discretionary: { n: number; of: number; net: number; shareOfGross: number | null } | null;
  verdict: string | null;
  versions: { version: string; at: number; data: string | null; said: string | null; afterValidation: boolean }[];
  warnings: string[];
}

const NAME: Record<string, string> = {
  pct_from_ma: "선 대비",
  rsi: "RSI",
  volume_ratio: "거래량 배수",
  pct_from_high: "직전 고점 대비",
  pct_from_low: "직전 저점 대비",
  consecutive: "연속 봉",
  hour_utc: "UTC 시",
  whale_net: "고래 순포지션",
  whale_flow: "고래 순포지션 변화",
  ma: "이평",
  atr: "ATR",
  ma_cross: "이평 교차",
};

type Json = Record<string, unknown>;

export function condText(c: Json): string {
  const ind = String(c.indicator ?? "");
  if (ind === "_todo") return "광혁 확인 대기";
  const tf = c.tf ? `${String(c.tf).toUpperCase()} ` : "";
  const period = typeof c.period === "number" ? c.period : typeof c.window === "number" ? c.window : null;
  let base: string;
  if (ind === "pct_from_ma") base = `${tf}${period ?? 20}선 대비`;
  else if (ind === "consecutive") base = "연속 봉(+상승 · −하락)";
  else base = `${tf}${NAME[ind] ?? ind}${period && ind !== "pct_from_high" && ind !== "pct_from_low" ? `(${period})` : ""}`;
  const unit = ["pct_from_ma", "pct_from_high", "pct_from_low"].includes(ind) ? "%" : "";
  const parts: string[] = [];
  if (typeof c.min === "number") parts.push(`≥ ${c.min}${unit}`);
  if (typeof c.max === "number") parts.push(`≤ ${c.max}${unit}`);
  if (typeof c.dir === "string") parts.push(c.dir);
  return `${base} ${parts.join(" · ")}`.trim();
}

function group(g: unknown): string {
  const node = (g ?? {}) as { all?: Json[]; any?: Json[] };
  const list = node.all ?? node.any ?? [];
  if (!list.length) return "—";
  return list.map((c) => ("all" in c || "any" in c ? `(${group(c)})` : condText(c))).join(node.all ? " · " : " 또는 ");
}

function entryText(d: Json | undefined): string {
  if (!d) return "—";
  const side = String(d.side ?? "long");
  if (side === "both") return `롱: ${group(d.entry)} / 숏: ${group(d.entry_short)}`;
  return `${side === "short" ? "숏" : "롱"}: ${group(d.entry)}`;
}

function stopText(d: Json | undefined): string {
  const e = (d?.exit ?? {}) as Json;
  return typeof e.stop_pct === "number" ? `${e.stop_pct}%` : "—";
}

function exitText(d: Json | undefined): string {
  const e = (d?.exit ?? {}) as Json;
  const legs = (e.scale_out ?? null) as Json[] | null;
  const bits: string[] = [];
  if (legs?.length) {
    for (const leg of legs) {
      const size = typeof leg.size === "number" ? `${Math.round(leg.size * 100)}%` : "?";
      if (typeof leg.at_pct === "number") bits.push(`+${leg.at_pct}% 에서 ${size}`);
      else if (leg.trail) {
        const t = leg.trail as Json;
        bits.push(`나머지 ${size} 고점 대비 −${t.pct}%${typeof t.activate_pct === "number" ? `(+${t.activate_pct}% 뒤)` : ""} 추적`);
      } else bits.push(`${size} 광혁 확인 대기`);
    }
    if (e.breakeven_after_first) bits.push("첫 익절 뒤 본절");
  } else if (typeof e.target_pct === "number") {
    bits.push(`+${e.target_pct}% 목표`);
  }
  if (typeof e.max_hold_days === "number") bits.push(`길어도 ${Math.round(e.max_hold_days * 24)}시간`);
  return bits.join(" · ") || "—";
}

function pauseText(d: Json | undefined): string {
  const p = d?.pause as Json | null | undefined;
  return p ? `${p.after_consecutive_losses}연패 후 ${p.minutes}분` : "쉬는 규칙 없음";
}

function sizeText(d: Json | undefined): string {
  if (!d) return "—";
  const s = (d.sizing ?? {}) as Json;
  const pct = typeof s.fixed_pct === "number" ? `증거금 ${s.fixed_pct}%` : "—";
  return `${pct} · ${d.leverage ?? "?"}배 · 동시 ${d.max_positions ?? "?"}개`;
}

const RANK: Record<string, number> = { 불일치: 5, 부분: 4, 일치: 3, "광혁 판단": 2, "데이터 없음": 1, "말 안 함": 1 };

function worst(matches: string[]): Match {
  const known = matches.filter((m) => m in RANK);
  if (!known.length) return "—";
  return known.sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0] as Match;
}

export function buildRulesView(r: RulesPayload | null): RulesView {
  if (!r) {
    return { ready: false, title: "광혁 매매법", asOf: null, lines: [], discretionary: null, verdict: null, versions: [], warnings: [] };
  }
  const data = r.definitions["광혁-데이터"];
  const said = r.definitions["광혁-말"];
  const rows = r.compare ?? [];
  const pick = (...items: string[]) => rows.filter((row) => items.includes(row.item));
  const line = (key: string, label: string, dataText: string, saidText: string, items: string[]): RuleLine => {
    const details = pick(...items).map((x) => ({ item: x.item, said: x.said, data: x.data, match: x.match }));
    return { key, label, data: dataText, said: saidText, match: worst(details.map((d) => d.match)), details };
  };
  const lines = [
    line("entry", "진입", entryText(data), entryText(said), ["확인하는 것 · 시간봉", "방향", "나눠서 진입", "하루 진입"]),
    line("stop", "손절", stopText(data), stopText(said), ["손절", "손절 주문 미리", "손절 뒤 같은 종목 재진입"]),
    line("exit", "익절", exitText(data), exitText(said), ["나눠서 파나", "첫 익절", "끌고 가기", "최대 보유"]),
    line("pause", "쉬기", pauseText(data), pauseText(said), ["쉬는 조건"]),
    line("size", "크기", sizeText(data), sizeText(said), ["레버리지", "증거금 비율", "자신 있을 때 더 싣나"]),
  ];
  const disc = r.validation?.discretionary?.["광혁-데이터"];
  const versions = (r.freezes ?? []).map((f, i) => ({
    version: `v${i + 1}`,
    at: f.at,
    data: f.hashes["광혁-데이터"]?.slice(0, 8) ?? null,
    said: f.hashes["광혁-말"]?.slice(0, 8) ?? null,
    afterValidation: f.afterValidation,
  }));
  return {
    ready: true,
    title: `광혁 매매법 ${versions.length ? versions[versions.length - 1]?.version : "(동결 전)"}`,
    asOf: r.asOf,
    lines,
    discretionary: disc ? { n: disc.n, of: disc.of, net: disc.net, shareOfGross: disc.share_of_gross_profit } : null,
    verdict: r.validation?.verdict ?? null,
    versions,
    warnings: r.contamination ?? [],
  };
}
