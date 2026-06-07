import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useCachedFetch } from "../../lib/useCachedFetch";

interface DisclosureItem {
  date: string;
  title: string;
  category: string;
  url?: string;
}

interface DisclosureResponse {
  items: DisclosureItem[];
}

interface Props {
  symbol: string;
}

export function DisclosureSummary({ symbol }: Props) {
  const path = `/api/tarot/disclosures?symbol=${encodeURIComponent(symbol)}`;
  // 30분 캐시 — 공시는 실시간 갱신 불필요
  const { data, loading, error } = useCachedFetch<DisclosureResponse>(path, 30 * 60 * 1000);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          최근 공시
        </Text>
        <View style={styles.placeholderCard}>
          <Text variant="caption" color={Colors.ironOutline}>공시 불러오는 중…</Text>
        </View>
      </View>
    );
  }

  // 아직 공시 API가 연동되지 않은 경우 — graceful empty state
  if (error || !data || data.items.length === 0) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          최근 공시
        </Text>
        <View style={styles.emptyCard}>
          <Text variant="caption" color={Colors.ironOutline} style={styles.emptyText}>
            공시 데이터를 준비 중이에요
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        최근 공시
      </Text>
      <View style={styles.card}>
        {data.items.slice(0, 5).map((item, i) => (
          <View key={i} style={[styles.item, i > 0 && styles.itemDivider]}>
            <View style={styles.itemMeta}>
              <View style={styles.categoryBadge}>
                <Text variant="caption" color={Colors.taroEssence} style={styles.categoryText}>
                  {item.category}
                </Text>
              </View>
              <Text variant="caption" color={Colors.ironOutline} style={styles.dateText}>
                {item.date}
              </Text>
            </View>
            <Text variant="body-sm" color={Colors.silverHighlight} style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
  },
  sectionLabel: {
    marginBottom: Spacing.s8,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    overflow: "hidden",
  },
  item: {
    padding: Spacing.s16,
    gap: 6,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.carbonBorder,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: Colors.voidGreen,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 11,
  },
  title: {
    lineHeight: 20,
  },
  placeholderCard: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    padding: Spacing.s24,
    alignItems: "center",
  },
  emptyCard: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    padding: Spacing.s24,
    alignItems: "center",
  },
  emptyText: {
    opacity: 0.6,
  },
});
