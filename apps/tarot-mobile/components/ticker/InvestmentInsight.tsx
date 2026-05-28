import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { apiFetch } from "../../lib/api";

interface InsightResponse {
  headline: string;
  summary: string;
  cardName: string;
  orientation: "upright" | "reversed";
}

interface Props {
  symbol: string;
}

export function InvestmentInsight({ symbol }: Props) {
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<InsightResponse>(`/api/tarot/news-insight?symbol=${encodeURIComponent(symbol)}`)
      .then((data) => setInsight(data))
      .catch(() => setInsight(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          타로 투자 인사이트
        </Text>
        <View style={[styles.card, styles.loadingCard]}>
          <ActivityIndicator size="small" color={Colors.taroEssence} />
        </View>
      </View>
    );
  }

  if (!insight) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        타로 투자 인사이트
      </Text>

      <View style={styles.card}>
        <View style={styles.cardBadgeRow}>
          <View style={styles.cardBadge}>
            <Text variant="caption" color={Colors.taroEssence}>{insight.cardName}</Text>
          </View>
          <View style={[styles.cardBadge, styles.orientationBadge]}>
            <Text variant="caption" color={Colors.midGrayText}>
              {insight.orientation === "upright" ? "정방향" : "역방향"}
            </Text>
          </View>
        </View>

        <Text variant="subheading" color={Colors.whiteout} style={styles.headline}>
          {insight.headline}
        </Text>

        <Text variant="body-sm" color={Colors.midGrayText} style={styles.summary}>
          {insight.summary}
        </Text>
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
    backgroundColor: Colors.voidGreen,
    borderRadius: Radius.cards,
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
    gap: 12,
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: Spacing.s32,
  },
  cardBadgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardBadge: {
    backgroundColor: Colors.ebonyCanvas,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
  orientationBadge: {
    borderColor: Colors.carbonBorder,
  },
  headline: {
    fontWeight: "700",
    lineHeight: 26,
  },
  summary: {
    lineHeight: 20,
  },
});
