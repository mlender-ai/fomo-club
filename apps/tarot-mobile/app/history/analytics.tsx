import { SafeAreaView, ScrollView, View, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";

const MOCK_ANALYTICS = {
  totalDraws: 12,
  spreadBreakdown: [{ spread: "SINGLE", count: 8 }, { spread: "THREE_CARD", count: 4 }],
  topCards: [
    { cardId: "fool", count: 4, card: { nameKo: "광대", name: "The Fool", number: 0 } },
    { cardId: "star", count: 3, card: { nameKo: "별", name: "The Star", number: 17 } },
    { cardId: "tower", count: 2, card: { nameKo: "탑", name: "The Tower", number: 16 } },
    { cardId: "world", count: 2, card: { nameKo: "세계", name: "The World", number: 21 } },
    { cardId: "sun", count: 1, card: { nameKo: "태양", name: "The Sun", number: 19 } },
  ],
  topTickers: [
    { ticker: "AAPL", count: 4 }, { ticker: "NVDA", count: 3 },
    { ticker: "삼성전자", count: 3 }, { ticker: "TSLA", count: 2 },
  ],
  sourceBreakdown: [{ source: "LLM", count: 9 }, { source: "CACHE", count: 2 }, { source: "FALLBACK", count: 1 }],
  recentActivity: [
    { date: new Date(Date.now() - 0).toISOString(), count: 2 },
    { date: new Date(Date.now() - 86400000).toISOString(), count: 1 },
    { date: new Date(Date.now() - 172800000).toISOString(), count: 3 },
    { date: new Date(Date.now() - 259200000).toISOString(), count: 0 },
    { date: new Date(Date.now() - 345600000).toISOString(), count: 2 },
    { date: new Date(Date.now() - 432000000).toISOString(), count: 1 },
    { date: new Date(Date.now() - 518400000).toISOString(), count: 3 },
  ],
};

const maxActivity = Math.max(...MOCK_ANALYTICS.recentActivity.map((r) => r.count), 1);

export default function AnalyticsScreen() {
  const router = useRouter();
  const a = MOCK_ANALYTICS;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text variant="body-sm" color={Colors.midGrayText}>← 기록</Text>
          </TouchableOpacity>
          <Text variant="subheading" color={Colors.whiteout}>내 분석</Text>
        </View>

        {/* 총 뽑기 */}
        <View style={styles.heroCard}>
          <Text variant="caption" color={Colors.midGrayText}>총 뽑기 횟수</Text>
          <Text style={styles.heroNum}>{a.totalDraws}</Text>
          <Text variant="caption" color={Colors.midGrayText}>회</Text>
        </View>

        {/* 스프레드 분포 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>스프레드 선호</Text>
        <View style={styles.card}>
          {a.spreadBreakdown.map((s) => {
            const pct = a.totalDraws > 0 ? (s.count / a.totalDraws) * 100 : 0;
            return (
              <View key={s.spread} style={styles.barItem}>
                <View style={styles.barLabelRow}>
                  <Text variant="body-sm" color={Colors.silverHighlight}>{s.spread === "SINGLE" ? "1장" : "3장"}</Text>
                  <Text variant="caption" color={Colors.midGrayText}>{s.count}회 ({pct.toFixed(0)}%)</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` as any }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* 자주 나온 카드 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>자주 나온 카드 Top 5</Text>
        <View style={styles.card}>
          {a.topCards.map((c, i) => (
            <View key={c.cardId} style={styles.rankRow}>
              <View style={styles.rankNum}><Text style={styles.rankNumText}>{i + 1}</Text></View>
              <View style={styles.rankInfo}>
                <Text variant="body-sm" color={Colors.whiteout}>{c.card.nameKo}</Text>
                <Text variant="caption" color={Colors.midGrayText}>{c.card.name}</Text>
              </View>
              <Text variant="body-sm" color={Colors.taroEssence}>{c.count}회</Text>
            </View>
          ))}
        </View>

        {/* 자주 검색한 종목 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>관심 종목</Text>
        <View style={styles.card}>
          {a.topTickers.map((t, i) => (
            <View key={t.ticker} style={styles.rankRow}>
              <View style={styles.rankNum}><Text style={styles.rankNumText}>{i + 1}</Text></View>
              <Text variant="body-sm" color={Colors.whiteout} style={{ flex: 1 }}>{t.ticker}</Text>
              <Text variant="body-sm" color={Colors.taroEssence}>{t.count}회</Text>
            </View>
          ))}
        </View>

        {/* 해석 소스 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>해석 소스</Text>
        <View style={styles.sourceRow}>
          {a.sourceBreakdown.map((s) => (
            <View key={s.source} style={styles.sourceCard}>
              <Text style={[styles.sourceBadge, s.source === "LLM" ? styles.srcLlm : s.source === "CACHE" ? styles.srcCache : styles.srcFallback]}>
                {s.source === "LLM" ? "AI" : s.source === "CACHE" ? "캐시" : "폴백"}
              </Text>
              <Text variant="subheading" color={Colors.whiteout}>{s.count}</Text>
              <Text variant="caption" color={Colors.midGrayText}>건</Text>
            </View>
          ))}
        </View>

        {/* 최근 7일 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>최근 7일 활동</Text>
        <View style={styles.card}>
          {a.recentActivity.map((act) => (
            <View key={act.date} style={styles.actRow}>
              <Text variant="caption" color={Colors.midGrayText} style={styles.actDate}>
                {new Date(act.date).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
              </Text>
              <View style={styles.actTrack}>
                <View style={[styles.actFill, { width: `${(act.count / maxActivity) * 100}%` as any }]} />
              </View>
              <Text variant="caption" color={act.count > 0 ? Colors.taroEssence : Colors.ironOutline} style={styles.actCount}>{act.count}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scroll:       { paddingHorizontal: Spacing.s24, paddingBottom: 48 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.s16, marginBottom: Spacing.s24 },
  heroCard:     { backgroundColor: Colors.graphiteBase, borderRadius: 16, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, alignItems: "center", marginBottom: Spacing.s24 },
  heroNum:      { fontSize: 56, fontWeight: "800", color: Colors.whiteout, letterSpacing: -2, lineHeight: 64 },
  sectionLabel: { letterSpacing: 0.5, marginBottom: Spacing.s8 },
  card:         { backgroundColor: Colors.graphiteBase, borderRadius: 14, padding: Spacing.s16, borderWidth: 1, borderColor: Colors.carbonBorder, marginBottom: Spacing.s24, gap: 12 },
  barItem:      { gap: 6 },
  barLabelRow:  { flexDirection: "row", justifyContent: "space-between" },
  barTrack:     { height: 6, borderRadius: 3, backgroundColor: Colors.carbonBorder, overflow: "hidden" },
  barFill:      { height: "100%", borderRadius: 3, backgroundColor: Colors.taroEssence },
  rankRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  rankNum:      { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.voidGreen, alignItems: "center", justifyContent: "center" },
  rankNumText:  { fontSize: 11, color: Colors.taroEssence, fontWeight: "700" },
  rankInfo:     { flex: 1 },
  sourceRow:    { flexDirection: "row", gap: 10, marginBottom: Spacing.s24 },
  sourceCard:   { flex: 1, backgroundColor: Colors.graphiteBase, borderRadius: 12, padding: Spacing.s16, borderWidth: 1, borderColor: Colors.carbonBorder, alignItems: "center", gap: 4 },
  sourceBadge:  { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
  srcLlm:       { backgroundColor: Colors.voidGreen, color: Colors.taroEssence },
  srcCache:     { backgroundColor: "#2a1f00", color: "#c9a84c" },
  srcFallback:  { backgroundColor: "#2a0a0a", color: "#e0875a" },
  actRow:       { flexDirection: "row", alignItems: "center", gap: 10 },
  actDate:      { width: 76 },
  actTrack:     { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.carbonBorder, overflow: "hidden" },
  actFill:      { height: "100%", borderRadius: 3, backgroundColor: Colors.taroEssence },
  actCount:     { width: 20, textAlign: "right" },
});
