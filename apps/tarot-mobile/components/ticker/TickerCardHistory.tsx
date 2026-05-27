import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { apiFetch } from "../../lib/api";
import { formatTimeAgo, formatCardLabel } from "@trading/shared/src/historyFormatting";

interface HistoryItemCard {
  cardId: string;
  orientation: string;
  slot: string | null;
  position: number;
  card: { nameKo: string; name: string; number: number };
}

interface HistoryItem {
  id: string;
  ticker: string;
  market: string;
  spread: string;
  headline: string;
  source: string;
  creditCost: number;
  createdAt: string;
  cards: HistoryItemCard[];
}

interface Props {
  symbol: string;
  userId: string;
  limit?: number;
}

export function TickerCardHistory({ symbol, userId, limit = 5 }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol || !userId) return;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ userId, ticker: symbol, limit: String(limit) });
    apiFetch<{ items: HistoryItem[] }>(`/api/tarot/history?${params}`)
      .then((data) => setItems(data.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [symbol, userId, limit]);

  // 로딩 중에는 렌더링하지 않음 (다른 섹션이 먼저 채워지므로 깜빡임 방지)
  if (loading) return null;
  // 에러는 콘솔로만 — 사용자에게 노출하지 않음 (이 섹션은 부가 기능)
  if (error) return null;
  // 히스토리 없음 — 섹션 자체를 숨김 (빈 상태 강조보다 깔끔한 화면 우선)
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        이 종목 카드 히스토리
      </Text>

      <View style={styles.card}>
        {items.map((item, i) => {
          const cards = formatCardLabel(item.cards);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, i < items.length - 1 && styles.itemBorder]}
              onPress={() => router.push(`/history/${item.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.itemHeader}>
                <Text variant="caption" color={Colors.midGrayText}>
                  {cards}
                </Text>
                <Text variant="caption" color={Colors.ironOutline}>
                  {formatTimeAgo(item.createdAt, Date.now())}
                </Text>
              </View>
              <Text variant="body-sm" color={Colors.whiteout} numberOfLines={2} style={styles.headline}>
                {item.headline}
              </Text>
            </TouchableOpacity>
          );
        })}
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
    padding: 16,
    gap: 6,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.carbonBorder,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headline: {
    lineHeight: 20,
    fontWeight: "500",
  },
});
