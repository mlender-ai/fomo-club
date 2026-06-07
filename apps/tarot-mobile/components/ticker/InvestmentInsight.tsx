import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useCachedFetch } from "../../lib/useCachedFetch";
import { DataFetchError } from "../ui/DataFetchError";

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
  const path = `/api/tarot/news-insight?symbol=${encodeURIComponent(symbol)}`;
  // 15분 캐시 — 탭 전환 시 재fetch 없음 (서버 캐시 TTL과 일치)
  const { data: insight, loading, error, refetch } = useCachedFetch<InsightResponse>(
    path,
    15 * 60 * 1000
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
            타로 시장 인사이트
          </Text>
        </View>
        <View style={[styles.card, styles.loadingCard]}>
          <ActivityIndicator size="small" color={Colors.taroEssence} />
          <Text variant="caption" color={Colors.midGrayText} style={styles.loadingText}>
            카드 해석 중…
          </Text>
        </View>
      </View>
    );
  }

  // 결측/실패 시 재시도 경로 제공 (#292)
  if (error && !insight) {
    return (
      <DataFetchError
        label="타로 시장 인사이트"
        message="인사이트를 불러오지 못했어요"
        onRetry={refetch}
      />
    );
  }

  if (!insight) return null;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          타로 시장 인사이트
        </Text>
        <Text variant="caption" color={Colors.ironOutline} style={styles.sectionSub}>
          AI가 시장 데이터를 타로 카드로 해석한 참고 정보
        </Text>
      </View>

      <View style={styles.contextBanner}>
        <Text variant="caption" color={Colors.silverHighlight} style={styles.contextText}>
          타로 해석은 선택한 종목의 시장 데이터를 기반으로 패턴과 흐름을 해석합니다. 타로가 제안하는 투자 인사이트는 의사결정을 돕는 실마리를 제공합니다.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardBadgeRow}>
          <View style={styles.cardBadge}>
            <Text variant="caption" color={Colors.taroEssence}>{insight.cardName}</Text>
          </View>
          <View style={[styles.cardBadge, styles.orientationBadge]}>
            <Text variant="caption" color={Colors.midGrayText}>
              {insight.orientation === "upright" ? "정방향 ↑" : "역방향 ↓"}
            </Text>
          </View>
        </View>

        <Text variant="subheading" color={Colors.whiteout} style={styles.headline}>
          {insight.headline}
        </Text>

        <Text variant="body-sm" color={Colors.midGrayText} style={styles.summary}>
          {insight.summary}
        </Text>

        <Text variant="caption" color={Colors.ironOutline} style={styles.disclaimer}>
          본 해석은 투자 조언이 아닌 참고용 콘텐츠입니다. 데이터 기반으로 도출된 통찰을 참고해 투자 결정을 보완하세요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
  },
  labelRow: {
    marginBottom: Spacing.s8,
    gap: 4,
  },
  sectionLabel: {
    letterSpacing: 0.5,
  },
  sectionSub: {
    fontSize: 10,
    letterSpacing: 0.2,
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
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
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
  contextBanner: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: 8,
    paddingHorizontal: Spacing.s16,
    paddingVertical: 10,
    marginBottom: Spacing.s8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.taroEssence,
  },
  contextText: {
    lineHeight: 18,
    opacity: 0.85,
  },
  disclaimer: {
    fontSize: 10,
    letterSpacing: 0.2,
    opacity: 0.7,
    marginTop: 4,
  },
});
