import { prisma } from "./prisma";
import { fetchMarketSnapshot } from "./market";
import { drawCards } from "@taro/core";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  channelId?: string;
}

interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushReceipt[]> {
  const token = process.env["EXPO_PUSH_ACCESS_TOKEN"];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Expo push error: ${res.status}`);
  const body = (await res.json()) as { data: ExpoPushReceipt[] };
  return body.data;
}

/**
 * 관심 종목 알림 발송
 * - alertEnabled인 즐겨찾기의 종목별 시장 데이터를 조회
 * - 의미 있는 변동(±3% 이상)이 있을 때만 알림 발송
 */
export async function notifyFavoriteChanges(): Promise<{ sent: number; skipped: number; errors: number }> {
  const favorites = await prisma.tarotFavorite.findMany({
    where: { alertEnabled: true },
    include: { user: { select: { id: true, pushToken: true } } },
  });

  // 유저별 + 종목별 그룹핑
  const userFavorites = new Map<string, { pushToken: string; tickers: Array<{ ticker: string; market: "US" | "KR" }> }>();
  for (const fav of favorites) {
    if (!fav.user.pushToken) continue;
    const existing = userFavorites.get(fav.userId);
    const market = (fav.market === "KR" ? "KR" : "US") as "US" | "KR";
    if (existing) {
      existing.tickers.push({ ticker: fav.ticker, market });
    } else {
      userFavorites.set(fav.userId, {
        pushToken: fav.user.pushToken,
        tickers: [{ ticker: fav.ticker, market }],
      });
    }
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // 종목별 시장 데이터 캐시 (같은 종목 여러 유저에게 반복 조회 방지)
  const snapshotCache = new Map<string, Awaited<ReturnType<typeof fetchMarketSnapshot>> | null>();

  const messages: ExpoPushMessage[] = [];

  for (const [, { pushToken, tickers }] of userFavorites) {
    for (const { ticker, market } of tickers) {
      const cacheKey = `${ticker}:${market}`;
      if (!snapshotCache.has(cacheKey)) {
        try {
          const snapshot = await fetchMarketSnapshot(ticker, market);
          snapshotCache.set(cacheKey, snapshot);
        } catch {
          snapshotCache.set(cacheKey, null);
        }
      }

      const snapshot = snapshotCache.get(cacheKey);
      if (!snapshot) { errors++; continue; }

      // 의미 있는 변동만 알림 (±3% 이상)
      if (Math.abs(snapshot.changePercent) < 3) { skipped++; continue; }

      const direction = snapshot.changePercent > 0 ? "상승" : "하락";
      const emoji = snapshot.changePercent > 0 ? "📈" : "📉";

      messages.push({
        to: pushToken,
        title: `${emoji} ${ticker} ${direction} ${Math.abs(snapshot.changePercent).toFixed(1)}%`,
        body: snapshot.summary,
        data: { ticker, market },
        sound: "default",
        channelId: "default",
      });
    }
  }

  // 배치 발송 (Expo는 100개씩 권장)
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const receipts = await sendExpoPush(batch);
      for (const r of receipts) {
        if (r.status === "ok") sent++;
        else errors++;
      }
    } catch {
      errors += batch.length;
    }
  }

  return { sent, skipped, errors };
}

// 카드별 푸시 카피 — 종목 + 카드 페어링 메시지
const CARD_COPY: Record<string, { upright: string; reversed: string }> = {
  "the-fool":         { upright: "새로운 시작의 에너지가 흐릅니다", reversed: "성급한 결정은 잠시 멈추세요" },
  "the-magician":     { upright: "당신의 집중이 흐름을 바꿉니다", reversed: "의도와 행동이 엇갈리는 순간" },
  "the-high-priestess": { upright: "직관이 데이터보다 먼저 말합니다", reversed: "숨겨진 정보를 놓치고 있을 수 있어요" },
  "the-empress":      { upright: "꾸준한 성장이 결실을 맺는 시기", reversed: "과신보다 관망이 필요한 순간" },
  "the-emperor":      { upright: "안정된 구조가 든든한 버팀목", reversed: "통제감이 흔들릴 때는 원칙으로" },
  "the-hierophant":   { upright: "검증된 방법을 따르는 것이 답", reversed: "관행을 의심할 용기가 필요한 때" },
  "the-lovers":       { upright: "선택의 기로, 가슴이 말하는 길로", reversed: "가치관의 혼란을 정리할 시간" },
  "the-chariot":      { upright: "의지로 방향을 잡는 순간입니다", reversed: "속도보다 방향을 먼저 점검하세요" },
  "strength":         { upright: "내면의 힘이 시장의 소음을 잠재웁니다", reversed: "자기 의심이 가장 큰 적" },
  "the-hermit":       { upright: "홀로 버텨온 인내가 빛을 발합니다", reversed: "고립이 아닌 연결이 필요한 때" },
  "wheel-of-fortune": { upright: "흐름이 바뀌는 변곡점에 서 있습니다", reversed: "운에 기대기보다 준비가 먼저" },
  "justice":          { upright: "냉정한 판단이 최선의 결과를 냅니다", reversed: "편향된 시각을 점검해 보세요" },
  "the-hanged-man":   { upright: "기다림이 새로운 시각을 열어줍니다", reversed: "멈춤의 이유를 먼저 찾아보세요" },
  "death":            { upright: "변화를 받아들일 준비가 됐나요?", reversed: "변화를 거부하는 것이 더 위험합니다" },
  "temperance":       { upright: "균형 잡힌 시선이 답을 찾습니다", reversed: "조급함이 균형을 깨뜨립니다" },
  "the-devil":        { upright: "욕심이 판단을 흐리고 있지는 않나요?", reversed: "스스로 만든 족쇄를 풀 때입니다" },
  "the-tower":        { upright: "예상치 못한 전환이 찾아옵니다", reversed: "두려워하던 폭풍은 비껴갈 수도 있어요" },
  "the-star":         { upright: "손실 후에도 다시 돌아오는 당신", reversed: "희망은 있지만 방향이 아직 불분명합니다" },
  "the-moon":         { upright: "불확실함이 오히려 기회일 수 있습니다", reversed: "혼란의 원인을 직면할 시간" },
  "the-sun":          { upright: "명확한 흐름이 당신 편입니다", reversed: "지나친 낙관은 잠시 내려놓으세요" },
  "judgement":        { upright: "지금이 그 종목을 다시 평가할 시간", reversed: "과거의 실수를 반복하지 않으려면" },
  "the-world":        { upright: "완성된 흐름, 이제 새 챕터로", reversed: "마무리되지 않은 숙제가 남아 있습니다" },
};

function buildCardCopy(cardId: string, orientation: "upright" | "reversed", ticker: string): string {
  const copy = CARD_COPY[cardId];
  const message = copy?.[orientation] ?? "오늘의 타로가 준비되어 있습니다";
  return `${ticker} · ${message}`;
}

/**
 * 데일리 "종목+카드" 페어 푸시 발송
 * - 즐겨찾기 종목별로 타로 카드를 뽑아 페어 카피로 알림
 * - 시장 조건 없이 daily 드로 — 아침 루틴 트리거용
 */
export async function notifyDailyCardPair(): Promise<{ sent: number; errors: number }> {
  const favorites = await prisma.tarotFavorite.findMany({
    where: { alertEnabled: true },
    include: { user: { select: { id: true, pushToken: true } } },
  });

  const userFavorites = new Map<string, { pushToken: string; tickers: Array<{ ticker: string; market: "US" | "KR" }> }>();
  for (const fav of favorites) {
    if (!fav.user.pushToken) continue;
    const existing = userFavorites.get(fav.userId);
    const market = (fav.market === "KR" ? "KR" : "US") as "US" | "KR";
    if (existing) {
      existing.tickers.push({ ticker: fav.ticker, market });
    } else {
      userFavorites.set(fav.userId, { pushToken: fav.user.pushToken, tickers: [{ ticker: fav.ticker, market }] });
    }
  }

  const snapshotCache = new Map<string, Awaited<ReturnType<typeof fetchMarketSnapshot>> | null>();
  const messages: ExpoPushMessage[] = [];
  let errors = 0;

  for (const [, { pushToken, tickers }] of userFavorites) {
    // 유저당 첫 번째 즐겨찾기 종목만 데일리 카드 페어 발송 (알림 과부하 방지)
    const primary = tickers[0];
    if (!primary) continue;

    const cacheKey = `${primary.ticker}:${primary.market}`;
    if (!snapshotCache.has(cacheKey)) {
      try {
        snapshotCache.set(cacheKey, await fetchMarketSnapshot(primary.ticker, primary.market));
      } catch {
        snapshotCache.set(cacheKey, null);
      }
    }

    const snapshot = snapshotCache.get(cacheKey);
    const condition = snapshot?.condition ?? "neutral";

    try {
      const [drawn] = drawCards("single", condition);
      if (!drawn) { errors++; continue; }

      messages.push({
        to: pushToken,
        title: "🔮 오늘의 투자 타로",
        body: buildCardCopy(drawn.card.id, drawn.orientation, primary.ticker),
        data: { ticker: primary.ticker, market: primary.market, cardId: drawn.card.id },
        sound: "default",
        channelId: "daily",
      });
    } catch {
      errors++;
    }
  }

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const receipts = await sendExpoPush(batch);
      for (const r of receipts) {
        if (r.status === "ok") sent++;
        else errors++;
      }
    } catch {
      errors += batch.length;
    }
  }

  return { sent, errors };
}
