import { useEffect, useCallback, useState } from "react";
import {
  SafeAreaView, View, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing } from "../../constants/theme";
import { TickerLogo } from "../../components/TickerLogo";
import { PriceChart } from "../../components/ticker/PriceChart";
import { TabBar, type TickerTab } from "../../components/ticker/TabBar";
import { PriceStats } from "../../components/ticker/PriceStats";
import { MetricsGrid } from "../../components/ticker/MetricsGrid";
import { CompanyInfo } from "../../components/ticker/CompanyInfo";
import { FinancialChart } from "../../components/ticker/FinancialChart";
import { NewsList } from "../../components/ticker/NewsList";
import { TickerCardHistory } from "../../components/ticker/TickerCardHistory";
import { useStockStore, type ChartRange } from "../../lib/stockStore";
import { useFavoritesStore } from "../../lib/favoritesStore";
import { useDrawStore } from "../../lib/drawStore";
import { useUserStore } from "../../lib/store";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - Spacing.s24 * 2;

const RANGE_OPTIONS: { key: ChartRange; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "1주" },
  { key: "1mo", label: "1달" },
  { key: "3mo", label: "3달" },
  { key: "1y", label: "1년" },
];

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${price.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TickerDetailScreen() {
  const router = useRouter();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { isLoggedIn, userId } = useUserStore();
  const {
    quote, chartBars, chartRange, quoteLoading, chartLoading,
    profile, quarterlyEarnings, annualFinancials, financialsLoading,
    fetchQuote, fetchChart, fetchFinancials, clearActive,
  } = useStockStore();
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const { setTicker } = useDrawStore();
  const [activeTab, setActiveTab] = useState<TickerTab>("chart");
  const [refreshing, setRefreshing] = useState(false);

  const isFav = symbol ? isFavorite(symbol) : false;

  useEffect(() => {
    if (!symbol) return;
    fetchQuote(symbol);
    fetchChart(symbol);
    fetchFinancials(symbol);
    return () => clearActive();
  }, [symbol]);

  const handleRefresh = useCallback(async () => {
    if (!symbol) return;
    setRefreshing(true);
    await Promise.all([
      fetchQuote(symbol, { force: true }),
      fetchChart(symbol, undefined, { force: true }),
      fetchFinancials(symbol, { force: true }),
    ]);
    setRefreshing(false);
  }, [symbol, fetchQuote, fetchChart, fetchFinancials]);

  const handleRangeChange = useCallback(
    (range: ChartRange) => {
      if (!symbol) return;
      fetchChart(symbol, range);
    },
    [symbol, fetchChart]
  );

  const handleFavoriteToggle = useCallback(() => {
    if (!symbol) return;
    if (isFav) {
      removeFavorite(symbol);
    } else {
      const market = symbol.includes(".KS") || symbol.includes(".KQ") ? "KR" : "US";
      addFavorite(symbol, market, quote?.shortName);
    }
  }, [symbol, isFav, quote, addFavorite, removeFavorite]);

  const handleTarotDraw = useCallback(() => {
    if (!symbol) return;
    setTicker(symbol, quote?.shortName ?? symbol);
    router.push("/(tabs)/draw");
  }, [symbol, quote, setTicker, router]);

  if (!symbol) {
    router.back();
    return null;
  }

  const isPositive = (quote?.change ?? 0) >= 0;
  const priceColor = isPositive ? Colors.taroEssence : "#f43f5e";
  const currency = quote?.currency ?? "USD";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.taroEssence}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text variant="body-sm" color={Colors.midGrayText}>← 뒤로</Text>
          </TouchableOpacity>
          {isLoggedIn && (
            <TouchableOpacity onPress={handleFavoriteToggle} style={styles.favBtn}>
              <Text style={[styles.favIcon, isFav && styles.favIconActive]}>
                {isFav ? "♥" : "♡"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ticker Info */}
        <View style={styles.tickerInfo}>
          <View style={styles.tickerRow}>
            <TickerLogo ticker={symbol} size={48} />
            <View style={styles.tickerMeta}>
              <Text variant="heading" color={Colors.whiteout}>
                {quoteLoading ? symbol : (quote?.shortName ?? symbol)}
              </Text>
              <Text variant="caption" color={Colors.midGrayText}>
                {symbol} · {quote?.exchange ?? ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Price */}
        {quoteLoading ? (
          <View style={styles.priceSection}>
            <ActivityIndicator size="small" color={Colors.taroEssence} />
          </View>
        ) : quote ? (
          <View style={styles.priceSection}>
            <Text style={[styles.currentPrice, { color: Colors.whiteout }]}>
              {formatPrice(quote.currentPrice, currency)}
            </Text>
            <View style={styles.changeRow}>
              <Text style={[styles.changeText, { color: priceColor }]}>
                {isPositive ? "+" : ""}{formatPrice(Math.abs(quote.change), currency)}
              </Text>
              <Text style={[styles.changePercent, { color: priceColor }]}>
                ({isPositive ? "+" : ""}{quote.changePercent.toFixed(2)}%)
              </Text>
            </View>
          </View>
        ) : null}

        {/* Tab Bar */}
        <View style={styles.tabSection}>
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </View>

        {/* Tab Content */}
        {activeTab === "chart" ? (
          <>
            {/* Chart */}
            <View style={styles.chartSection}>
              <PriceChart
                bars={chartBars}
                loading={chartLoading}
                width={CHART_WIDTH}
                positive={isPositive}
              />
              <View style={styles.rangeRow}>
                {RANGE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.rangeTab,
                      chartRange === opt.key && styles.rangeTabActive,
                    ]}
                    onPress={() => handleRangeChange(opt.key)}
                  >
                    <Text
                      variant="caption"
                      color={chartRange === opt.key ? Colors.taroEssence : Colors.midGrayText}
                      style={chartRange === opt.key ? styles.rangeTextActive : undefined}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Info Tab: PriceStats + MetricsGrid + CompanyInfo + Financials */}
            {quote && (
              <>
                <PriceStats quote={quote} />
                <MetricsGrid quote={quote} />
              </>
            )}
            {profile && (
              <CompanyInfo
                symbol={symbol}
                name={quote?.longName ?? quote?.shortName ?? symbol}
                exchange={quote?.exchange ?? ""}
                profile={profile}
              />
            )}
            {(quarterlyEarnings.length > 0 || annualFinancials.length > 0) && (
              <FinancialChart
                quarterlyEarnings={quarterlyEarnings}
                annualFinancials={annualFinancials}
                width={SCREEN_WIDTH}
                currency={currency}
              />
            )}
            {isLoggedIn && userId && (
              <TickerCardHistory symbol={symbol} userId={userId} />
            )}
            <NewsList symbol={symbol} />
          </>
        )}

        {/* CTA */}
        <View style={styles.ctaSection}>
          <Button
            variant="primary"
            label="이 종목 타로 뽑기"
            onPress={handleTarotDraw}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scrollView:   { flex: 1 },
  scroll:       { paddingHorizontal: Spacing.s24, paddingBottom: 48 },

  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.s16, marginBottom: Spacing.s16 },
  backBtn:      { padding: 4 },
  favBtn:       { padding: 4 },
  favIcon:      { fontSize: 24, color: Colors.midGrayText },
  favIconActive:{ color: "#f43f5e" },

  tickerInfo:   { marginBottom: Spacing.s16 },
  tickerRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  tickerMeta:   { flex: 1, gap: 2 },

  priceSection: { marginBottom: Spacing.s16, minHeight: 60 },
  currentPrice: { fontSize: 32, fontWeight: "700" },
  changeRow:    { flexDirection: "row", gap: 8, marginTop: 4 },
  changeText:   { fontSize: 16, fontWeight: "600" },
  changePercent:{ fontSize: 16, fontWeight: "600" },

  tabSection:   { marginBottom: Spacing.s24 },

  chartSection: { marginBottom: Spacing.s24 },
  rangeRow:     { flexDirection: "row", justifyContent: "space-around", marginTop: Spacing.s16 },
  rangeTab:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 },
  rangeTabActive: { backgroundColor: Colors.voidGreen },
  rangeTextActive: { fontWeight: "700" },

  ctaSection:   { marginTop: Spacing.s8 },
});
