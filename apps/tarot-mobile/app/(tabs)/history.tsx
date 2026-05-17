import { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView, View, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import { useDrawStore } from "../../lib/drawStore";
import { loadLocalHistory, type LocalHistoryItem } from "../../lib/localEngine";

const SPREAD_FILTERS = [
  { label: "전체", value: "ALL" },
  { label: "1장",  value: "single" },
  { label: "3장",  value: "three-card" },
] as const;

type SpreadFilter = "ALL" | "single" | "three-card";
type SortOption = "newest" | "oldest";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  return `${d}일 전`;
}

function HistoryCard({ item, onPress }: { item: LocalHistoryItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <View style={styles.cardThumb}>
          <Text style={styles.cardSymbol}>{item.cardSymbol}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text variant="caption" color={Colors.taroEssence}>{item.ticker}</Text>
          <Text variant="caption" color={Colors.ironOutline}>{timeAgo(item.drawnAt)}</Text>
        </View>
        <Text variant="body-sm" color={Colors.whiteout} style={styles.headline} numberOfLines={2}>
          {item.headline}
        </Text>
        <View style={styles.cardMeta}>
          <Text variant="caption" color={Colors.midGrayText}>
            {item.spread === "single" ? "1장" : "3장"} · {item.cardNameKo}
            {item.isReversed ? " (역방향)" : ""}
          </Text>
          <Text variant="caption" color={Colors.ironOutline}>{item.market}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { setResult } = useDrawStore();
  const [history, setHistory] = useState<LocalHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spreadFilter, setSpreadFilter] = useState<SpreadFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("newest");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const items = await loadLocalHistory();
    setHistory(items);
    setLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const filtered = history.filter(
    (it) => spreadFilter === "ALL" || it.spread === spreadFilter
  );
  const sorted = [...filtered].sort((a, b) =>
    sort === "newest"
      ? new Date(b.drawnAt).getTime() - new Date(a.drawnAt).getTime()
      : new Date(a.drawnAt).getTime() - new Date(b.drawnAt).getTime()
  );

  const handlePress = (item: LocalHistoryItem) => {
    // drawStore에 결과 복원 후 결과 화면으로
    setResult({
      id: item.id,
      ticker: item.ticker,
      tickerName: item.tickerName,
      spread: item.spread,
      interpretation: item.interpretation,
      drawnAt: item.drawnAt,
      cards: item.cards,
    });
    router.push("/result");
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text variant="heading" color={Colors.whiteout}>뽑기 기록</Text>
        <Text variant="caption" color={Colors.midGrayText}>{sorted.length}건</Text>
      </View>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {SPREAD_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterBtn, spreadFilter === f.value && styles.filterBtnActive]}
            onPress={() => setSpreadFilter(f.value)}
          >
            <Text
              variant="caption"
              color={spreadFilter === f.value ? Colors.taroEssence : Colors.midGrayText}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
        >
          <Text variant="caption" color={Colors.midGrayText}>
            {sort === "newest" ? "최신순 ↓" : "오래된순 ↑"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 목록 */}
      {loading ? (
        <View style={styles.emptyWrap}>
          <Text variant="body-sm" color={Colors.midGrayText}>불러오는 중...</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🃏</Text>
          <Text variant="heading" color={Colors.midGrayText} style={styles.emptyTitle}>
            아직 뽑기 기록이 없어요
          </Text>
          <Text variant="body-sm" color={Colors.ironOutline}>
            홈에서 종목을 선택하고 카드를 뽑아보세요
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <HistoryCard item={item} onPress={() => handlePress(item)} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadHistory}
              tintColor={Colors.taroEssence}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.ebonyCanvas },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16, paddingBottom: Spacing.s8 },
  filterRow:       { flexDirection: "row", paddingHorizontal: Spacing.s24, paddingBottom: Spacing.s8, gap: 8 },
  filterBtn:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.carbonBorder },
  filterBtnActive: { borderColor: Colors.taroEssence, backgroundColor: Colors.voidGreen },
  sortBtn:         { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6 },
  list:            { paddingHorizontal: Spacing.s24, paddingBottom: 32, gap: 12 },
  card:            { flexDirection: "row", backgroundColor: Colors.graphiteBase, borderRadius: 14, borderWidth: 1, borderColor: Colors.carbonBorder, padding: 14, gap: 12 },
  cardLeft:        { justifyContent: "center" },
  cardThumb:       { width: 44, height: 56, borderRadius: 6, backgroundColor: Colors.voidGreen, borderWidth: 1, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  cardSymbol:      { fontSize: 20, color: Colors.taroEssence },
  cardBody:        { flex: 1, gap: 4 },
  cardTop:         { flexDirection: "row", justifyContent: "space-between" },
  headline:        { lineHeight: 20 },
  cardMeta:        { flexDirection: "row", justifyContent: "space-between" },
  emptyWrap:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: Spacing.s24 },
  emptyIcon:       { fontSize: 48 },
  emptyTitle:      { textAlign: "center" },
});
