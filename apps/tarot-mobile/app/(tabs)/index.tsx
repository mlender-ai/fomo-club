import { useState, useCallback, useEffect, useRef } from "react";
import {
  SafeAreaView, View, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, StatusBar, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing, Typography } from "../../constants/theme";
import { useUserStore } from "../../lib/store";
import { useDrawStore } from "../../lib/drawStore";
import { apiFetch } from "../../lib/api";
import { localSearch } from "../../lib/localEngine";
import { TickerLogo } from "../../components/TickerLogo";


const POPULAR: { ticker: string; label: string; market: string; flag: string }[] = [
  { ticker: "AAPL",       label: "Apple Inc.",  market: "US", flag: "🇺🇸" },
  { ticker: "NVDA",       label: "NVIDIA",      market: "US", flag: "🇺🇸" },
  { ticker: "TSLA",       label: "Tesla",       market: "US", flag: "🇺🇸" },
  { ticker: "MSFT",       label: "Microsoft",   market: "US", flag: "🇺🇸" },
  { ticker: "005930.KS",  label: "삼성전자",    market: "KR", flag: "🇰🇷" },
  { ticker: "000660.KS",  label: "SK하이닉스",  market: "KR", flag: "🇰🇷" },
];

// 날짜 기반 고정 인사이트 (서버 없어도 항상 표시)
const DAILY_INSIGHTS = [
  { card: "✦", message: "불확실성은 기회의 다른 이름입니다" },
  { card: "◈", message: "시장은 흔들려도, 방향은 잃지 마세요" },
  { card: "⬡", message: "패턴을 읽는 자가 흐름을 만듭니다" },
  { card: "◇", message: "두려움과 탐욕, 그 사이 어딘가에 진실이 있습니다" },
  { card: "✸", message: "작은 신호가 큰 전환의 시작입니다" },
  { card: "⟐", message: "시간이 시장의 가장 강한 편입니다" },
  { card: "✦", message: "오늘도 시장은 이야기하고 있습니다" },
];

function getDailyInsight() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_INSIGHTS[dayOfYear % DAILY_INSIGHTS.length]!;
}

interface SearchResult {
  ticker: string;
  label: string;
  market: string;
  exchange: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { credits, isLoggedIn } = useUserStore();
  const { recentSearches, setTicker, addRecentSearch } = useDrawStore();
  const dailyInsight = getDailyInsight();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 검색 API debounce 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ results: SearchResult[] }>(
          `/api/tarot/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(data.results.length > 0 ? data.results : localSearch(query.trim()));
      } catch {
        // 서버 없음 → 로컬 검색 폴백
        setResults(localSearch(query.trim()));
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = useCallback(
    (ticker: string, name: string) => {
      setQuery("");
      setResults([]);
      setTicker(ticker, name);
      addRecentSearch(ticker);
      router.push("/(tabs)/draw");
    },
    [setTicker, addRecentSearch, router]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Text variant="caption" color={Colors.taroEssence} style={styles.brand}>
            TRADING TARO
          </Text>
          <View style={styles.creditBadge}>
            <Text variant="caption" color={Colors.taroEssence}>
              {isLoggedIn ? `✦ ${credits} 크레딧` : "✦ 게스트"}
            </Text>
          </View>
        </View>

        {/* 히어로 */}
        <View style={styles.hero}>
          <Text variant="heading-lg" style={styles.heroTitle}>
            오늘의 시장,{"\n"}
            <Text variant="heading-lg" color={Colors.taroEssence}>
              카드에 물어보세요
            </Text>
          </Text>
          <Text variant="body-sm" style={styles.heroSub}>
            AI가 분석한 시장 데이터를 타로 카드 해석으로 만나보세요
          </Text>
        </View>

        {/* 오늘의 타로 인사이트 */}
        <TouchableOpacity style={styles.insightCard} onPress={() => router.push("/(tabs)/draw")} activeOpacity={0.8}>
          <View style={styles.insightIcon}>
            <Text style={styles.insightSymbol}>{dailyInsight.card}</Text>
          </View>
          <View style={styles.insightText}>
            <Text variant="caption" color={Colors.taroEssence} style={styles.insightLabel}>오늘의 타로 인사이트</Text>
            <Text variant="body-sm" color={Colors.silverHighlight} style={styles.insightMessage}>
              {dailyInsight.message}
            </Text>
          </View>
          <Text variant="caption" color={Colors.ironOutline}>→</Text>
        </TouchableOpacity>

        {/* 검색 */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            {searching ? (
              <ActivityIndicator size="small" color={Colors.taroEssence} />
            ) : (
              <Text style={styles.searchIcon}>⊕</Text>
            )}
            <TextInput
              style={styles.searchInput}
              placeholder="종목명 또는 티커 검색 (예: AAPL, 삼성전자)"
              placeholderTextColor={Colors.ironOutline}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (results.length > 0) {
                  handleSelect(results[0].ticker, results[0].label);
                } else if (query.trim()) {
                  handleSelect(query.trim().toUpperCase(), query.trim());
                }
              }}
              autoCapitalize="characters"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 검색 결과 드롭다운 */}
          {(results.length > 0 || (searching && query.length > 0)) && (
            <View style={styles.dropdown}>
              {results.map((r) => (
                <TouchableOpacity
                  key={r.ticker}
                  style={styles.dropdownItem}
                  onPress={() => handleSelect(r.ticker, r.label)}
                >
                  <View style={styles.dropdownRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <TickerLogo ticker={r.ticker} size={24} />
                      <Text variant="body-sm" color={Colors.whiteout}>{r.label}</Text>
                    </View>
                    <View style={styles.dropdownMeta}>
                      <Text variant="caption" color={Colors.taroEssence}>{r.ticker}</Text>
                      <Text variant="caption" color={Colors.ironOutline}>{r.market}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* 최근 검색 */}
        {recentSearches.length > 0 && (
          <View style={styles.section}>
            <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
              최근 검색
            </Text>
            <View style={styles.chipRow}>
              {recentSearches.map((t) => (
                <TouchableOpacity key={t} style={styles.chip} onPress={() => handleSelect(t, t)}>
                  <Text variant="caption" color={Colors.silverHighlight}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 인기 종목 */}
        <View style={styles.section}>
          <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
            인기 종목
          </Text>
          <View style={styles.chipRow}>
            {POPULAR.map((p) => (
              <TouchableOpacity
                key={p.ticker}
                style={styles.chip}
                onPress={() => handleSelect(p.ticker, p.label)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TickerLogo ticker={p.ticker} size={20} />
                  <Text variant="caption" color={Colors.silverHighlight}>{p.label}</Text>
                </View>
                <Text variant="caption" color={Colors.ironOutline} style={{ fontSize: 10 }}>
                  {p.ticker}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 사용 안내 */}
        <View style={styles.guide}>
          <Text variant="caption" color={Colors.midGrayText} style={{ letterSpacing: 0.5, marginBottom: 4 }}>처음이신가요?</Text>
          <View style={styles.guideRow}>
            <Text style={styles.guideStep}>1</Text>
            <View style={{ flex: 1 }}>
              <Text variant="body-sm" color={Colors.silverHighlight}>종목 검색</Text>
              <Text variant="caption" color={Colors.midGrayText}>AAPL, 삼성전자 등 원하는 종목을 입력하세요</Text>
            </View>
          </View>
          <View style={styles.guideRow}>
            <Text style={styles.guideStep}>2</Text>
            <View style={{ flex: 1 }}>
              <Text variant="body-sm" color={Colors.silverHighlight}>카드 선택</Text>
              <Text variant="caption" color={Colors.midGrayText}>1장(핵심 흐름) 또는 3장(과거·현재·미래)</Text>
            </View>
          </View>
          <View style={styles.guideRow}>
            <Text style={styles.guideStep}>3</Text>
            <View style={{ flex: 1 }}>
              <Text variant="body-sm" color={Colors.silverHighlight}>AI 타로 해석 확인</Text>
              <Text variant="caption" color={Colors.midGrayText}>실시간 시장 데이터 기반 타로 리딩을 받으세요</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scrollView:   { flex: 1 },
  scroll:       { paddingHorizontal: Spacing.s24, paddingBottom: 40 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.s16, marginBottom: Spacing.s32 },
  brand:        { letterSpacing: 2 },
  creditBadge:  { borderWidth: 1, borderColor: Colors.deepInsight, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  hero:         { marginBottom: Spacing.s32 },
  heroTitle:    { color: Colors.whiteout, marginBottom: Spacing.s8 },
  heroSub:      { color: Colors.midGrayText },
  searchWrap:   { marginBottom: Spacing.s24, zIndex: 10 },
  searchBox:    { flexDirection: "row", alignItems: "center", backgroundColor: Colors.graphiteBase, borderRadius: 12, borderWidth: 1, borderColor: Colors.carbonBorder, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  searchIcon:   { fontSize: 16, color: Colors.midGrayText },
  searchInput:  { flex: 1, fontSize: Typography.size.body, color: Colors.whiteout, padding: 0 },
  clearBtn:     { fontSize: 14, color: Colors.midGrayText, padding: 4 },
  dropdown:     { backgroundColor: Colors.graphiteBase, borderWidth: 1, borderColor: Colors.carbonBorder, borderRadius: 12, marginTop: 4, overflow: "hidden" },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.carbonBorder },
  dropdownRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dropdownMeta: { flexDirection: "row", gap: 8, alignItems: "center" },
  section:      { marginBottom: Spacing.s24 },
  sectionLabel: { marginBottom: Spacing.s8, letterSpacing: 0.5 },
  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { backgroundColor: Colors.graphiteBase, borderWidth: 1, borderColor: Colors.carbonBorder, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  guide:        { backgroundColor: Colors.graphiteBase, borderRadius: 16, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, gap: 14 },
  guideRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  guideStep:    { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.arcaneCta, textAlign: "center", lineHeight: 24, fontSize: 12, color: Colors.whiteout, fontWeight: "700", marginTop: 2 },
  insightCard:  { flexDirection: "row", alignItems: "center", backgroundColor: Colors.voidGreen, borderRadius: 14, padding: 16, marginBottom: Spacing.s24, borderWidth: 1, borderColor: Colors.deepInsight, gap: 12 },
  insightIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.arcaneCta, alignItems: "center", justifyContent: "center" },
  insightSymbol:{ fontSize: 18, color: Colors.taroEssence },
  insightText:  { flex: 1, gap: 2 },
  insightLabel: { letterSpacing: 0.5, fontWeight: "700" },
  insightMessage: { lineHeight: 20 },
});
