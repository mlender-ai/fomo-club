import { scoreToEmoji } from "./state";
import { EMOTION_LABELS, type EmotionType } from "./types";
import type { EmotionTally } from "./index-engine/types";

/**
 * 롤링 배너 데이터 모델.
 * 정체성: "하향 비교 안도" — 코인·거시 시장도 같이 물려있음을 정직한 숫자로 보여 콜드스타트를 푼다.
 * 문구 포맷팅을 순수함수로 한 곳에 모아 route(서버 fetch)와 테스트가 공유한다.
 * 정직한 숫자 원칙: 실측값만. 결측 시 가짜 수치 대신 항목 생략 / 담담한 폴백.
 */
export type BannerKind = "whale" | "pulse" | "macro";

export interface BannerItem {
  /** 안정 식별자 — 상세 라우팅 키. 예: "macro-sox", "whale-btc-ath". */
  id: string;
  kind: BannerKind;
  emoji: string;
  /** 배너에 표시되는 한 줄. */
  text: string;
  /** 상세페이지용. 지금은 최소(title/body/metric/source). */
  detail?: BannerDetail;
}

export interface BannerDetail {
  title: string;
  /** 담담한 1~2문장 해석. 투자조언 금칙어 0. */
  body: string;
  metric?: { label: string; value: string; change?: number };
  source?: { label: string; url: string };
  // ── 확장 자리(이번엔 미사용, 타입만 선점) ──
  /** 향후 관련종목 리스트. */
  relatedSymbols?: string[];
  /** 향후 풀차트 시계열. */
  series?: { t: string; v: number }[];
  /** 향후 이 신호에 대한 사용자 감정 분포. */
  sentiment?: Record<string, number>;
}

/** 변화율 표기. +면 부호 노출, 소수 1자리. */
export function pct(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

// ───────────────────────── whale (CoinGecko) ─────────────────────────

export interface WhaleInput {
  /** 전체 암호화폐 시총 24h 변화율(%). */
  marketCapChange24h?: number | null;
  /** 시총 상위 코인들 (이름/심볼/24h 변화율/전고점 대비). */
  coins?: {
    name: string;
    symbol: string;
    change24h?: number | null;
    athChange?: number | null;
  }[];
}

/** CoinGecko 신호 → BannerItem[]. 실측값만, 결측은 생략. */
export function buildWhaleItems(input: WhaleInput): BannerItem[] {
  const items: BannerItem[] = [];

  const mc = input.marketCapChange24h;
  if (typeof mc === "number") {
    items.push({
      id: "whale-marketcap",
      kind: "whale",
      emoji: "🐋",
      text:
        mc < 0
          ? `오늘 암호화폐 시총 ${pct(mc)} — 오늘은 다 같이 빨갰어요`
          : `오늘 암호화폐 시총 ${pct(mc)}`,
      detail: {
        title: "암호화폐 전체 시총",
        body:
          mc < 0
            ? "오늘은 시장 전체가 같이 내려갔어요. 혼자 물린 게 아니에요."
            : "오늘은 시장 전체가 같이 올랐어요. 분위기만 살펴봐요.",
        metric: { label: "전체 시총 24시간", value: pct(mc), change: mc },
        source: { label: "CoinGecko", url: "https://www.coingecko.com/" },
      },
    });
  }

  const coins = input.coins ?? [];

  // BTC·ETH 전고점 대비 — 가장 많이 "고점에 물린" 두 코인. 둘 다 무료 CoinGecko 실측.
  const ATH_COINS: { sym: string; name: string; url: string }[] = [
    { sym: "btc", name: "비트코인", url: "https://www.coingecko.com/en/coins/bitcoin" },
    { sym: "eth", name: "이더리움", url: "https://www.coingecko.com/en/coins/ethereum" },
  ];
  for (const { sym, name, url } of ATH_COINS) {
    const coin = coins.find((c) => c.symbol?.toLowerCase() === sym);
    if (coin && typeof coin.athChange === "number" && coin.athChange < 0) {
      items.push({
        id: `whale-${sym}-ath`,
        kind: "whale",
        emoji: "📉",
        text: `${name}, 전고점 대비 ${pct(coin.athChange)} — 고점에 물린 사람, 혼자가 아니에요`,
        detail: {
          title: `${name} 전고점 대비`,
          body: "사상 최고가에 산 사람도 지금 같이 기다리는 중이에요. 고점에 물린 사람, 혼자가 아니에요.",
          metric: { label: "전고점(ATH) 대비", value: pct(coin.athChange), change: coin.athChange },
          source: { label: "CoinGecko", url },
        },
      });
    }
  }

  const withChg = coins.filter((c) => typeof c.change24h === "number");
  const worst = [...withChg].sort((a, b) => (a.change24h ?? 0) - (b.change24h ?? 0))[0];
  if (worst && (worst.change24h ?? 0) < 0) {
    items.push({
      id: "whale-worst",
      kind: "whale",
      emoji: "🔻",
      text: `${worst.name} 24시간 ${pct(worst.change24h!)}`,
      detail: {
        title: `${worst.name} 24시간`,
        body: "오늘 가장 많이 내린 대형 코인이에요. 차트만 잠깐 확인해둬요.",
        metric: { label: "24시간 변화", value: pct(worst.change24h!), change: worst.change24h! },
        source: { label: "CoinGecko", url: "https://www.coingecko.com/" },
      },
    });
  }

  if (withChg.length > 0) {
    const downCount = withChg.filter((c) => (c.change24h ?? 0) < 0).length;
    items.push({
      id: "whale-breadth",
      kind: "whale",
      emoji: "👀",
      text: `상위 ${withChg.length}개 중 ${downCount}개가 하락 중`,
      detail: {
        title: "시총 상위 코인 흐름",
        body: `시총 상위 ${withChg.length}개 중 ${downCount}개가 오늘 내렸어요. 다들 같은 화면을 보고 있어요.`,
        metric: { label: "하락 종목", value: `${downCount}/${withChg.length}` },
        source: { label: "CoinGecko", url: "https://www.coingecko.com/" },
      },
    });
  }

  return items;
}

// ───────────────────────── macro (Stooq) ─────────────────────────

export interface MacroQuote {
  /** 내부 식별자(라우팅·아이콘 매핑용). */
  key: "kospi" | "kosdaq" | "spx" | "ndq" | "sox";
  /** 표시 이름. 예: "코스피", "코스닥", "S&P500", "나스닥", "필라델피아 반도체". */
  label: string;
  /** 전일 종가 대비 변화율(%). */
  change?: number | null;
  /** 최근 종가(표시용). */
  close?: number | null;
}

const MACRO_META: Record<MacroQuote["key"], { emoji: string; sourceUrl: string; note: string }> = {
  kospi: {
    emoji: "🇰🇷",
    sourceUrl: "https://finance.yahoo.com/quote/%5EKS11",
    note: "코스피가 같이 움직인 날이에요.",
  },
  kosdaq: {
    emoji: "📊",
    sourceUrl: "https://finance.yahoo.com/quote/%5EKQ11",
    note: "코스닥이 같이 움직인 날이에요.",
  },
  spx: {
    emoji: "🇺🇸",
    sourceUrl: "https://finance.yahoo.com/quote/%5EGSPC",
    note: "미국 대표 지수가 같이 움직인 날이에요.",
  },
  ndq: {
    emoji: "💻",
    sourceUrl: "https://finance.yahoo.com/quote/%5EIXIC",
    note: "기술주 중심 지수가 같이 움직인 날이에요.",
  },
  sox: {
    emoji: "🔧",
    sourceUrl: "https://finance.yahoo.com/quote/%5ESOX",
    note: "반도체 섹터가 같이 움직인 날이에요.",
  },
};

/**
 * Stooq 일봉 CSV에서 전일 종가 대비 변화율(%)을 계산한다.
 * 포맷: `Date,Open,High,Low,Close,Volume` (마지막 행이 최신).
 * 데이터가 2행 미만이거나 파싱 불가 시 null(→ 항목 생략).
 */
export function parseStooqDailyChange(csv: string): { change: number; close: number } | null {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length < 3) return null; // 헤더 + 최소 2행
  const header = lines[0]?.toLowerCase() ?? "";
  const cols = header.split(",");
  const closeIdx = cols.indexOf("close");
  if (closeIdx < 0) return null;

  const closeOf = (row: string | undefined): number | null => {
    if (!row) return null;
    const cells = row.split(",");
    const raw = cells[closeIdx];
    if (raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };

  const last = closeOf(lines[lines.length - 1]);
  const prev = closeOf(lines[lines.length - 2]);
  if (last === null || prev === null || prev === 0) return null;
  return { change: ((last - prev) / prev) * 100, close: last };
}

/**
 * Yahoo chart 일봉 종가 배열에서 직전 대비 변화율(%)·최근 종가를 구한다.
 * (Stooq가 안티봇 차단으로 사망 → Yahoo chart JSON으로 교체.)
 * 유효 종가 2개 미만이거나 직전가 0이면 null(→ 항목 생략).
 */
export function yahooChange(
  closes: (number | null | undefined)[]
): { change: number; close: number } | null {
  const valid = closes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1]!;
  const prev = valid[valid.length - 2]!;
  if (prev === 0) return null;
  return { change: ((last - prev) / prev) * 100, close: last };
}

/**
 * Twelve Data `/quote` 응답 1건에서 변화율(%)·최근 종가를 구한다.
 * (Yahoo/Stooq가 Vercel egress IP를 레이트리밋·차단해 ^KS11 등이 상시 누락 →
 *  무료키 기반 Twelve Data 로 1차 소스 교체. #480.)
 * `percent_change`(문자열/숫자)를 우선 신뢰하고, 없으면 close/previous_close 로 계산.
 * 값이 없거나 파싱 불가, 또는 status:"error" 면 null(→ 항목 생략 / Yahoo 폴백).
 */
export function twelveDataChange(
  q:
    | {
        status?: string;
        close?: string | number | null;
        previous_close?: string | number | null;
        percent_change?: string | number | null;
      }
    | null
    | undefined
): { change: number; close: number } | null {
  if (!q || q.status === "error") return null;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const close = num(q.close);
  if (close === null) return null;
  const pctChange = num(q.percent_change);
  if (pctChange !== null) return { change: pctChange, close };
  const prev = num(q.previous_close);
  if (prev === null || prev === 0) return null;
  return { change: ((close - prev) / prev) * 100, close };
}

/** 미증시/반도체/국내 지수 → BannerItem[]. 실측 변화율만, 결측은 생략. */
export function buildMacroItems(quotes: MacroQuote[]): BannerItem[] {
  const items: BannerItem[] = [];
  for (const q of quotes) {
    if (typeof q.change !== "number") continue;
    const meta = MACRO_META[q.key];
    const down = q.change < 0;
    items.push({
      id: `macro-${q.key}`,
      kind: "macro",
      emoji: meta.emoji,
      text: down
        ? `${q.label} ${pct(q.change)} — 다들 같은 화면 보고 있어요`
        : `${q.label} ${pct(q.change)}`,
      detail: {
        title: q.label,
        body: `${meta.note} ${
          down ? "오늘 내린 건 혼자가 아니에요." : "오늘은 같이 올랐어요. 분위기만 살펴봐요."
        }`,
        metric: {
          label: "전일 종가 대비",
          value: pct(q.change),
          change: q.change,
        },
        source: { label: "Yahoo Finance", url: meta.sourceUrl },
      },
    });
  }
  return items;
}

// ───────────────────────── pulse (감정 집계) ─────────────────────────

export interface PulseInput {
  score: number;
  state: string;
  total: number;
  tally: EmotionTally;
}

/** FOMO 지수/감정 집계 → BannerItem[]. */
export function buildPulseItems(input: PulseInput): BannerItem[] {
  const items: BannerItem[] = [
    {
      id: "pulse-index",
      kind: "pulse",
      emoji: scoreToEmoji(input.score),
      text: `오늘 FOMO 지수 ${input.score} · ${input.state}`,
      detail: {
        title: "오늘의 FOMO Index",
        body: "FOMO Index는 시장 분위기를 감정으로 체감하는 지표예요. 투자 조언이 아니에요.",
        metric: { label: "FOMO Index", value: `${input.score} · ${input.state}` },
      },
    },
  ];

  if (input.total > 0) {
    const top = (Object.entries(input.tally) as [EmotionType, number][]).sort(
      (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
    )[0];
    if (top) {
      items.push({
        id: "pulse-participation",
        kind: "pulse",
        emoji: "👥",
        text: `오늘 ${input.total}명 참여 · 최다 「${EMOTION_LABELS[top[0]]}」`,
        detail: {
          title: "오늘 함께한 사람들",
          body: `오늘 ${input.total}명이 마음을 남겼어요. 가장 많은 감정은 「${EMOTION_LABELS[top[0]]}」이에요. 다들 그래요.`,
          metric: { label: "참여", value: `${input.total}명` },
        },
      });
    }
  } else {
    items.push({
      id: "pulse-empty",
      kind: "pulse",
      emoji: "👥",
      text: "오늘의 첫 감정을 남겨보세요",
      detail: {
        title: "오늘 함께한 사람들",
        body: "아직 오늘의 첫 감정이 비어 있어요. 먼저 남겨도 좋아요.",
      },
    });
  }

  return items;
}

/** 모든 신호가 비었을 때의 정직한 폴백 — 가짜 수치 금지. */
export function bannerFallback(): BannerItem {
  return {
    id: "fallback",
    kind: "whale",
    emoji: "🐋",
    text: "고래들도 오늘은 조용해요. 잠깐 같이 지켜봐요.",
    detail: {
      title: "오늘의 시장",
      body: "지금은 가져올 신호가 조용해요. 가짜 숫자 대신 잠깐 같이 지켜봐요.",
    },
  };
}
