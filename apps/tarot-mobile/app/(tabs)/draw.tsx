import { useState, useRef, useEffect } from "react";
import {
  SafeAreaView, View, TouchableOpacity, Animated,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as ExpoDigest from "expo-crypto";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useDrawStore, type SpreadType } from "../../lib/drawStore";
import { useUserStore } from "../../lib/store";
import { apiFetch } from "../../lib/api";
import { localDraw, saveLocalDraw } from "../../lib/localEngine";
import { AdBanner } from "../../components/AdBanner";
import { trackEvent } from "../../lib/analytics";
import { useStoreReview } from "../../lib/useStoreReview";
import { TickerLogo } from "../../components/TickerLogo";
import { CardSpread } from "../../components/CardSpread";

const SPREAD_OPTIONS: { type: SpreadType; label: string; desc: string; cost: number }[] = [
  { type: "single",     label: "1장",  desc: "핵심 흐름",     cost: 1 },
  { type: "three-card", label: "3장",  desc: "과거·현재·미래", cost: 3 },
];

const SPREAD_MAP: Record<SpreadType, string> = {
  "single":     "SINGLE",
  "three-card": "THREE_CARD",
};

interface ApiDrawResponse {
  drawId: string;
  ticker: string;
  market: string;
  spread: string;
  creditCost: number;
  creditsRemaining: number;
  marketSnapshot: { price: number; changePercent: number; condition: string; summary: string };
  interpretation: {
    headline: string;
    summary: string;
    detail: string;
    disclaimer: string;
    cards: Array<{ id: string; nameKo: string; orientation: string; slot: string | null; imageUrl: string }>;
  };
}

function CardBack({ flipped, delay }: { flipped: boolean; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (flipped) {
      Animated.timing(anim, { toValue: 1, duration: 600, delay, useNativeDriver: true }).start();
    }
  }, [flipped]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <Animated.View style={[styles.card, { transform: [{ rotateY: rotate }] }]}>
      <Text style={styles.cardSymbol}>✦</Text>
    </Animated.View>
  );
}

export default function DrawScreen() {
  const router = useRouter();
  const { spread, ticker, tickerName, isDrawing, setSpread, setDrawing, setResult } = useDrawStore();
  const { credits, setCredits, isLoggedIn } = useUserStore();
  const [phase, setPhase] = useState<"select" | "selecting" | "flipping" | "done">("select");
  const [loadingLabel, setLoadingLabel] = useState("해석 중...");

  useEffect(() => {
    if (phase !== "flipping") return;
    const steps = ["시장 분석 중...", "카드 배치 중...", "타로 해석 중...", "결과 생성 중..."];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % steps.length;
      setLoadingLabel(steps[i]!);
    }, 900);
    return () => clearInterval(id);
  }, [phase]);

  const selectedOption = SPREAD_OPTIONS.find((o) => o.type === spread)!;
  const market = ticker?.endsWith(".KS") || ticker?.endsWith(".KQ") ? "KR" : "US";
  const { onDrawComplete } = useStoreReview();

  const handleDraw = async () => {
    if (isDrawing) return;
    setDrawing(true);
    trackEvent("draw_start", { spread, ticker: ticker || "AAPL", market });

    const idempotencyKey = await ExpoDigest.digestStringAsync(
      ExpoDigest.CryptoDigestAlgorithm.SHA256,
      `draw-${ticker || "AAPL"}-${spread}-${Date.now()}`
    );

    try {
      const [, apiResult] = await Promise.allSettled([
        new Promise((r) => setTimeout(r, 1200)),
        apiFetch<ApiDrawResponse>("/api/tarot/draw", {
          method: "POST",
          body: JSON.stringify({
            ticker: ticker || "AAPL",
            market,
            spread: SPREAD_MAP[spread],
            idempotencyKey,
          }),
        }),
      ]);

      let drawResult;

      if (apiResult.status === "fulfilled") {
        const api = apiResult.value;
        setCredits(api.creditsRemaining);
        drawResult = {
          id: api.drawId,
          ticker: api.ticker,
          tickerName: tickerName || api.ticker,
          spread,
          interpretation: api.interpretation.summary,
          drawnAt: new Date().toISOString(),
          cards: api.interpretation.cards.map((c, i) => ({
            id: c.id,
            name: c.id,
            nameKo: c.nameKo,
            symbol: "✦",
            isReversed: c.orientation === "reversed",
            headline: i === 0 ? api.interpretation.headline : c.nameKo,
            summary: api.interpretation.summary,
            detail: api.interpretation.detail,
            slot: c.slot ?? null,
          })),
        };
      } else {
        drawResult = localDraw(ticker || "AAPL", tickerName || "AAPL", spread);
        void saveLocalDraw(drawResult, market);
      }

      setResult(drawResult);
      setPhase("done");
      trackEvent("draw_complete", { spread, ticker: ticker || "AAPL", source: apiResult.status === "fulfilled" ? "server" : "local" });
      onDrawComplete();
      setTimeout(() => router.push("/result"), 400);
    } catch {
      trackEvent("draw_error", { spread, ticker: ticker || "AAPL" });
      const fallback = localDraw(ticker || "AAPL", tickerName || "AAPL", spread);
      void saveLocalDraw(fallback, market);
      setResult(fallback);
      setPhase("done");
      setTimeout(() => router.push("/result"), 400);
    } finally {
      setDrawing(false);
    }
  };

  const handleBackPress = () => {
    if (phase === "selecting") {
      setPhase("select");
      return;
    }
    router.back();
  };

  const cardCount = spread === "single" ? 1 : 3;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
            <Text variant="body-sm" color={Colors.midGrayText}>← 뒤로</Text>
          </TouchableOpacity>
          <View style={styles.creditBadge}>
            <Text variant="caption" color={Colors.taroEssence}>
              {isLoggedIn ? `✦ ${credits} 크레딧` : "✦ 데모"}
            </Text>
          </View>
        </View>

        {/* 종목 */}
        <View style={styles.tickerRow}>
          <View style={styles.tickerInner}>
            {ticker && <TickerLogo ticker={ticker} size={36} />}
            <View>
              <Text variant="subheading" color={Colors.whiteout}>
                {tickerName || "종목 미선택"}
              </Text>
              {ticker ? (
                <Text variant="caption" color={Colors.taroEssence}>{ticker}</Text>
              ) : (
                <Text variant="caption" color={Colors.midGrayText}>홈에서 종목을 선택하세요</Text>
              )}
            </View>
          </View>
        </View>

        {/* SELECT — 스프레드 선택이 CTA */}
        {phase === "select" && (
          <>
            <View style={styles.spreadRow}>
              {SPREAD_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.spreadOpt, spread === opt.type && styles.spreadOptActive]}
                  onPress={() => {
                    setSpread(opt.type);
                    setPhase("selecting");
                  }}
                >
                  <Text variant="heading" color={spread === opt.type ? Colors.taroEssence : Colors.midGrayText}>
                    {opt.label}
                  </Text>
                  <Text variant="caption" color={spread === opt.type ? Colors.taroEssence : Colors.ironOutline}>
                    {opt.desc}
                  </Text>
                  <Text variant="caption" color={spread === opt.type ? Colors.taroEssence : Colors.ironOutline}>
                    {opt.cost} 크레딧
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.cardsArea}>
              <Text variant="body-sm" style={styles.hint}>스프레드를 선택하면 카드가 펼쳐집니다</Text>
            </View>
            <AdBanner />
          </>
        )}

        {/* SELECTING — 인터랙티브 카드 선택 */}
        {phase === "selecting" && (
          <CardSpread
            spreadType={spread}
            onComplete={() => {
              setPhase("flipping");
              handleDraw();
            }}
          />
        )}

        {/* FLIPPING — API 호출 중 */}
        {phase === "flipping" && (
          <>
            <View style={styles.cardsArea}>
              <View style={styles.cardsRow}>
                {Array.from({ length: cardCount }).map((_, i) => (
                  <CardBack key={i} flipped delay={i * 200} />
                ))}
              </View>
              <ActivityIndicator color={Colors.taroEssence} style={{ marginTop: 20 }} />
              <Text variant="body-sm" color={Colors.taroEssence} style={styles.loadingText}>
                {loadingLabel}
              </Text>
            </View>
            <AdBanner />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.ebonyCanvas },
  inner:           { flex: 1, paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16 },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.s24 },
  backBtn:         { padding: 4 },
  creditBadge:     { borderWidth: 1, borderColor: Colors.deepInsight, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  tickerRow:       { marginBottom: Spacing.s24 },
  tickerInner:     { flexDirection: "row", alignItems: "center", gap: 10 },
  spreadRow:       { flexDirection: "row", gap: 12, marginBottom: Spacing.s32 },
  spreadOpt:       { flex: 1, alignItems: "center", paddingVertical: Spacing.s16, backgroundColor: Colors.graphiteBase, borderRadius: Radius.cards, borderWidth: 1, borderColor: Colors.carbonBorder, gap: 4 },
  spreadOptActive: { borderColor: Colors.taroEssence, backgroundColor: Colors.voidGreen },
  cardsArea:       { flex: 1, alignItems: "center", justifyContent: "center" },
  cardsRow:        { flexDirection: "row", gap: 12 },
  card:            { width: 80, height: 128, backgroundColor: Colors.graphiteBase, borderRadius: 10, borderWidth: 1, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  cardSymbol:      { fontSize: 28, color: Colors.taroEssence },
  hint:            { color: Colors.ironOutline, textAlign: "center" },
  loadingText:     { marginTop: 12, textAlign: "center", letterSpacing: 0.3 },
});
