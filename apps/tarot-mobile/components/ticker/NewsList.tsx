import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useCachedFetch } from "../../lib/useCachedFetch";
import { NewsDetailModal } from "./NewsDetailModal";

interface NewsItem {
  title: string;
  description: string;
  summary?: string;
  link: string;
  publishedAt: string;
  source: string;
  category?: string;
}

interface Props {
  symbol: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function NewsList({ symbol }: Props) {
  // SWR 캐시: 동일 종목 뉴스는 10분 내 재요청 없이 캐시 재사용 (탭 전환/재진입 시 호출 절감)
  const { data, loading } = useCachedFetch<{ items: NewsItem[] }>(
    `/api/tarot/news?symbol=${encodeURIComponent(symbol)}&limit=8`,
    10 * 60 * 1000
  );
  const news = data?.items ?? [];
  const [selected, setSelected] = useState<NewsItem | null>(null);

  if (loading) return null;
  if (news.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        관련 뉴스
      </Text>

      <View style={styles.card}>
        {news.map((item, i) => (
          <TouchableOpacity
            key={item.link || i}
            style={[styles.newsItem, i < news.length - 1 && styles.newsItemBorder]}
            onPress={() => setSelected(item)}
            activeOpacity={0.7}
          >
            <Text variant="body-sm" color={Colors.whiteout} numberOfLines={2} style={styles.newsTitle}>
              {item.title}
            </Text>
            <View style={styles.newsMeta}>
              <View style={styles.metaLeft}>
                {item.category ? (
                  <View style={styles.categoryChip}>
                    <Text variant="caption" color={Colors.taroEssence}>
                      {item.category}
                    </Text>
                  </View>
                ) : null}
                <Text variant="caption" color={Colors.midGrayText}>{item.source}</Text>
              </View>
              <Text variant="caption" color={Colors.ironOutline}>{timeAgo(item.publishedAt)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <NewsDetailModal
        visible={selected !== null}
        item={selected}
        symbol={symbol}
        onClose={() => setSelected(null)}
      />
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
  newsItem: {
    padding: 16,
    gap: 8,
  },
  newsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.carbonBorder,
  },
  newsTitle: {
    lineHeight: 20,
    fontWeight: "500",
  },
  newsMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryChip: {
    backgroundColor: Colors.voidGreen,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
});
