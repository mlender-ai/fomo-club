import { useEffect, useCallback } from "react";
import {
  SafeAreaView, View, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import { useUserStore } from "../../lib/store";
import { useHistoryStore, type DrawHistoryItem, type SpreadFilter, type SortOption } from "../../lib/historyStore";
import { useDrawStore } from "../../lib/drawStore";

// 목업 데이터 (API 연결 전)
const MOCK_HISTORY: DrawHistoryItem[] = [
  { id: "1", ticker: "AAPL", market: "US", spread: "SINGLE", headline: "새로운 시작의 기운이 감지됩니다", source: "llm", creditCost: 1, createdAt: new Date(Date.now() - 3600000).toISOString(), cards: [{ cardId: "fool", orientation: "upright", slot: null, position: 0, card: { nameKo: "광대", name: "The Fool", number: 0 } }] },
  { id: "2", ticker: "NVDA", market: "US", spread: "THREE_CARD", headline: "급격한 변화와 재편의 시기입니다", source: "llm", creditCost: 3, createdAt: new Date(Date.now() - 86400000).toISOString(), cards: [{ cardId: "tower", orientation: "reversed", slot: null, position: 0, card: { nameKo: "탑", name: "The Tower", number: 16 } }] },
  { id: "3", ticker: "삼성전자", market: "KR", spread: "SINGLE", headline: "회복과 희망의 신호가 보입니다", source: "cache", creditCost: 1, createdAt: new Date(Date.now() - 172800000).toISOString(), cards: [{ cardId: "star", orientation: "upright", slot: null, position: 0, card: { nameKo: "별", name: "The Star", number: 17 } }] },
  { id: "4", ticker: "TSLA", market: "US", spread: "SINGLE", headline: "내면의 직관을 신뢰하세요", source: "fallback", creditCost: 1, createdAt: new Date(Date.now() - 259200000).toISOString(), cards: [{ cardId: "hpriestess", orientation: "upright", slot: null, position: 0, card: { nameKo: "여사제", name: "The High Priestess", number: 2 } }] },
];

const SPREAD_FILTERS: { label: string; value: SpreadFilter }[] = [
  { label: "전체", value: "ALL" },
  { label: "1장", value: "SINGLE" },
  { label: "3장", value: "THREE_CARD" },
];

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "최신순", value: "newest" },
  { label: "오래된순", value: "oldest" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  return `${d}일 전`;
}

function HistoryCard({ item, onPress }: { item: DrawHistoryItem; onPress: () => void }) {
  const firstCard = item.cards[0]?.card;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <View style={styles.cardThumb}>
          <Text style={styles.cardNum}>{firstCard?.number ?? "?"}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text variant="caption" color={Colors.taroEssence}>{item.ticker}</Text>
          <Text variant="caption" color={Colors.ironOutline}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text variant="body-sm" color={Colors.whiteout} style={styles.headline} numberOfLines={2}>
          {item.headline}
        </Text>
        <View style={styles.cardMeta}>
          <Text variant="caption" color={Colors.midGrayText}>
            {item.spread === "SINGLE" ? "1장" : "3장"} · {firstCard?.nameKo}
          </Text>
          <Text variant="caption" color={Colors.ironOutline}>
            {item.source === "llm" ? "AI" : item.source === "cache" ? "캐시" : "기본"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { isLoggedIn, userId } = useUserStore();
  const { setResult } = useDrawStore();
  const { items, loading, filters, setFilter } = useHistoryStore();

  // 목업: 실제 데이터 없을 때 mock 사용
  const displayItems = items.length > 0 ? items : MOCK_HISTORY;
  const filtered = displayItems.filter((it) => {
    if (filters.spread !== "ALL" && it.spread !== filters.spread) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) =>
    filters.sort === "newest"
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

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
            style={[styles.filterChip, filters.spread === f.value && styles.filterChipActive]}
            onPress={() => setFilter("spread", f.value)}
          >
            <Text variant="caption" color={filters.spread === f.value ? Colors.taroEssence : Colors.midGrayText}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterSpacer} />
        {SORT_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s.value}
            onPress={() => setFilter("sort", s.value)}
          >
            <Text variant="caption" color={filters.sort === s.value ? Colors.taroEssence : Colors.ironOutline}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 목록 */}
      {loading ? (
        <ActivityIndicator color={Colors.taroEssence} style={{ marginTop: 40 }} />
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="heading" color={Colors.ironOutline}>◷</Text>
          <Text variant="body-sm" color={Colors.midGrayText} style={{ marginTop: 12 }}>
            아직 뽑기 기록이 없습니다
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              onPress={() => router.push(`/history/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.ebonyCanvas },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16, paddingBottom: Spacing.s16 },
  filterRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.s24, paddingBottom: Spacing.s16, gap: 8 },
  filterChip:      { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 1, borderColor: Colors.carbonBorder },
  filterChipActive:{ borderColor: Colors.taroEssence, backgroundColor: Colors.voidGreen },
  filterSpacer:    { flex: 1 },
  list:            { paddingHorizontal: Spacing.s24, paddingBottom: 32 },
  sep:             { height: 8 },
  card:            { flexDirection: "row", backgroundColor: Colors.graphiteBase, borderRadius: 14, padding: Spacing.s16, borderWidth: 1, borderColor: Colors.carbonBorder, gap: 12 },
  cardLeft:        { justifyContent: "center" },
  cardThumb:       { width: 44, height: 64, backgroundColor: Colors.ebonyCanvas, borderRadius: 6, borderWidth: 1, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  cardNum:         { fontSize: 13, color: Colors.taroEssence, fontWeight: "700" },
  cardBody:        { flex: 1, gap: 4 },
  cardTop:         { flexDirection: "row", justifyContent: "space-between" },
  headline:        { lineHeight: 20 },
  cardMeta:        { flexDirection: "row", justifyContent: "space-between" },
  empty:           { flex: 1, alignItems: "center", justifyContent: "center" },
});
