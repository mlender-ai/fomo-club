import { useEffect, useCallback, useState, useRef } from "react";
import {
  SafeAreaView, View, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, RefreshControl,
  NativeSyntheticEvent, NativeScrollEvent,
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
import { KeyMetricsGrid } from "../../components/ticker/KeyMetricsGrid";
import { NewsList } from "../../components/ticker/NewsList";
import { TarotCardRecommendation } from "../../components/ticker/TarotCardRecommendation";
import { InvestmentInsight } from "../../components/ticker/InvestmentInsight";
import { TickerCardHistory } from "../../components/ticker/TickerCardHistory";
import { CompactHeader } from "../../components/ticker/CompactHeader";
import { TickerDetailSkeleton, InfoTabSkeleton } from "../../components/ticker/SkeletonLoader";
import { LazySection } from "../../components/ticker/LazySection";
import { planTabSwitch, shouldShowCompactHeader } from "@trading/shared/src/tabScrollPositions";
import { useStockStore, type ChartRange } from "../../lib/stockStore";
import { useFavoritesStore } from "../../lib/favoritesStore";
import { useDrawStore } from "../../lib/drawStore";
import { useUserStore } from "../../lib/store";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - Spacing.s24 * 2;
// 큰 헤더(현재가 영역)가 화면 위로 사라지는 임계값. 토스 패턴: 큰 가격 영역이 sticky 영역 위로 올라가면 압축 헤더 활성화.
const COMPACT_THRESHOLD = 140;

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
    profile, quarterlyEarnings, annualFinancials, keyMetrics, financialsLoading,
    fetchBundle, fetchChart, clearActive,
  } = useStockStore();
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const { setTicker } = useDrawStore();
  const [activeTab, setActiveTab] = useState<TickerTab>("chart");
  const [refreshing, setRefreshing] = useState(false);
  const [showCompact, setShowCompact] = useState(false);

  // 탭별 스크롤 위치 보존 — 탭 전환 시 이전 위치로 복원
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollPositions = useRef<Record<TickerTab, number>>({ chart: 0, info: 0 });
  const currentScrollY = useRef(0);

  const isFav = symbol ? isFavorite(symbol) : false;

  useEffect(() => {
    if (!symbol) return;
    fetchBundle(symbol);
    fetchChart(symbol);
    return () => clearActive();
  }, [symbol]);

  const handleRefresh = useCallback(async () => {
    if (!symbol) return;
    setRefreshing(true);
    await Promise.all([
      fetchBundle(symbol, { force: true }),
      fetchChart(symbol, undefined, { force: true }),
    ]);
    setRefreshing(false);
  }, [symbol, fetchBundle, fetchChart]);

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

  const handleTabChange = useCallback((tab: TickerTab) => {
    const plan = planTabSwitch(activeTab, tab, scrollPositions.current, currentScrollY.current);
    scrollPositions.current = plan.positionsAfter;
    setActiveTab(tab);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: plan.targetY, animated: false });
    });
  }, [activeTab]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    currentScrollY.current = y;
    const shouldShow = shouldShowCompactHeader(y, COMPACT_THRESHOLD);
    setShowCompact((prev) => (prev === shouldShow ? prev : shouldShow));
  }, []);

  if (!symbol) {
    router.back();
    return null;
  }

  // 첫 진입 시 (캐시 없음): 모든 데이터가 없고 로딩 중이면 전체 스켈레톤 표시
  const isInitialLoading = quoteLoading && !quote && chartLoading && chartBars.length === 0;
  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <TickerDetailSkeleton />
      </SafeAreaView>
    );
  }

  const isPositive = (quote?.change ?? 0) >= 0;
  const priceColor = isPositive ? Colors.taroEssence : "#f43f5e";
  const currency = quote?.currency ?? "USD";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[2]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.taroEssence}
          />
        }
      >
        {/* [0] Navigation Header — 일반 스크롤 */}
        <View style={styles.navHeader}>
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

        {/* [1] 큰 헤더 — 스크롤되면 사라지는 종목 이름 + 큰 가격 */}
        <View style={styles.largeHeader}>
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

          {quoteLoading ? (
            <View style={styles.priceSection}>
              <ActivityIndicator size="small" color={Colors.taroEssence} />
            </View>
          ) : quote ? (
            <View style={styles.priceSection}>
              <Text style={styles.currentPrice}>
                {formatPrice(quote.currentPrice, currency)}
              </Text>
              {/* 토스증권 패턴: 등락 알약 배지. 큰 헤더는 풀 배경(컬러 + 화이트 텍스트)으로 시인성 강조 */}
              <View
                style={[
                  styles.changePill,
                  { backgroundColor: priceColor },
                ]}
              >
                <Text style={styles.changePillText}>
                  {isPositive ? "+" : "−"}{formatPrice(Math.abs(quote.change), currency)} ({isPositive ? "+" : ""}{quote.changePercent.toFixed(2)}%)
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* [2] STICKY — 압축 헤더(opacity 토글) + TabBar */}
        <View style={styles.stickyArea}>
          {showCompact && quote && (
            <CompactHeader
              symbol={symbol}
              shortName={quote.shortName ?? symbol}
              currentPrice={quote.currentPrice}
              change={quote.change}
              changePercent={quote.changePercent}
              currency={currency}
            />
          )}
          <View style={styles.tabBarWrapper}>
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
          </View>
        </View>

        {/* [3] Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === "chart" ? (
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
          ) : financialsLoading && !profile ? (
            <InfoTabSkeleton />
          ) : (
            <>
              {quote && (
                <>
                  <PriceStats quote={quote} />
                  <MetricsGrid quote={quote} />
                </>
              )}
              <LazySection>
                <>
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
                  {keyMetrics && (
                    <KeyMetricsGrid metrics={keyMetrics} currency={currency} />
                  )}
                  {isLoggedIn && userId && (
                    <TickerCardHistory symbol={symbol} userId={userId} />
                  )}
                  {/* 타로 투자 인사이트: 뉴스 섹션의 AI 해석 헤드라인으로 뉴스 앞에 배치 */}
                  <InvestmentInsight symbol={symbol} />
                  <NewsList symbol={symbol} />
                  <TarotCardRecommendation
                    symbol={symbol}
                    tickerName={quote?.shortName ?? quote?.longName}
                  />
                </>
              </LazySection>
            </>
          )}
        </View>

        {/* [4] CTA */}
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
  scroll:       { paddingBottom: 48 },

  // [0] Navigation header
  navHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16, marginBottom: Spacing.s16 },
  backBtn:      { padding: 4 },
  favBtn:       { padding: 4 },
  favIcon:      { fontSize: 24, color: Colors.midGrayText },
  favIconActive:{ color: "#f43f5e" },

  // [1] 큰 헤더 — 토스증권 종목 상세 패턴: 32pt 현재가 + 알약 배지 등락
  // 여백 그리드: 4의 배수 (4 / 8 / 16 / 24)
  largeHeader:  { paddingHorizontal: Spacing.s24, marginBottom: Spacing.s24 },
  tickerRow:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: Spacing.s16 },
  tickerMeta:   { flex: 1, gap: 2 },
  priceSection: { minHeight: 64, gap: 8 },
  currentPrice: { fontSize: 32, fontWeight: "700", color: Colors.whiteout, lineHeight: 36, letterSpacing: -0.5 },
  changePill:   {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  changePillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },

  // [2] Sticky 영역
  stickyArea:   { backgroundColor: Colors.ebonyCanvas, zIndex: 10 },
  tabBarWrapper:{ paddingHorizontal: Spacing.s24 },

  // [3] Tab content — sticky 아래 여백 보장
  tabContent:   { paddingHorizontal: Spacing.s24, paddingTop: Spacing.s24 },

  chartSection: { marginBottom: Spacing.s24 },
  rangeRow:     { flexDirection: "row", justifyContent: "space-around", marginTop: Spacing.s16 },
  rangeTab:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 },
  rangeTabActive: { backgroundColor: Colors.voidGreen },
  rangeTextActive: { fontWeight: "700" },

  ctaSection:   { paddingHorizontal: Spacing.s24, marginTop: Spacing.s8 },
});
