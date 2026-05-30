import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { apiFetch } from "../../lib/api";
import { trackEvent } from "../../lib/tracking";

interface NewsItem {
  title: string;
  description: string;
  summary?: string;
  link: string;
  publishedAt: string;
  source: string;
  category?: string;
}

interface InsightResponse {
  headline: string;
  summary: string;
  cardName: string;
  orientation: "upright" | "reversed";
}

interface Props {
  visible: boolean;
  item: NewsItem | null;
  symbol: string;
  onClose: () => void;
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

export function NewsDetailModal({ visible, item, symbol, onClose }: Props) {
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !item) return;

    const startedAt = Date.now();
    setLoading(true);
    trackEvent("news_modal_opened", {
      symbol,
      category: item.category,
      source: item.source,
    });

    apiFetch<InsightResponse>(
      `/api/tarot/news-insight?symbol=${encodeURIComponent(symbol)}`,
    )
      .then((data) => setInsight(data))
      .catch(() => setInsight(null))
      .finally(() => setLoading(false));

    return () => {
      const dwellMs = Date.now() - startedAt;
      trackEvent("news_modal_closed", { symbol, dwellMs });
    };
  }, [visible, item, symbol]);

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="caption" color={Colors.midGrayText}>
            관련 뉴스
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text variant="body-sm" color={Colors.taroEssence}>
              닫기
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* 타로 투자 인사이트 (상단 우선 노출) */}
          <View style={styles.insightCard}>
            <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
              타로 투자 인사이트
            </Text>

            {loading ? (
              <View style={styles.insightLoading}>
                <ActivityIndicator size="small" color={Colors.taroEssence} />
              </View>
            ) : insight ? (
              <>
                <View style={styles.cardBadgeRow}>
                  <View style={styles.cardBadge}>
                    <Text variant="caption" color={Colors.taroEssence}>
                      {insight.cardName}
                    </Text>
                  </View>
                  <View style={[styles.cardBadge, styles.orientationBadge]}>
                    <Text variant="caption" color={Colors.midGrayText}>
                      {insight.orientation === "upright" ? "정방향" : "역방향"}
                    </Text>
                  </View>
                </View>

                <Text variant="subheading" color={Colors.whiteout} style={styles.insightHeadline}>
                  {insight.headline}
                </Text>

                <Text variant="body-sm" color={Colors.midGrayText} style={styles.insightSummary}>
                  {insight.summary}
                </Text>

                <Text variant="caption" color={Colors.ironOutline} style={styles.disclaimer}>
                  타로 해석은 참고용 콘텐츠이며 투자 조언이 아닙니다.
                </Text>
              </>
            ) : (
              <Text variant="body-sm" color={Colors.midGrayText}>
                인사이트를 불러올 수 없습니다.
              </Text>
            )}
          </View>

          {/* 기사 본문 */}
          <View style={styles.articleSection}>
            <View style={styles.metaRow}>
              {item.category ? (
                <View style={styles.categoryBadge}>
                  <Text variant="caption" color={Colors.taroEssence}>
                    {item.category}
                  </Text>
                </View>
              ) : null}
              <Text variant="caption" color={Colors.midGrayText}>
                {item.source}
              </Text>
              <Text variant="caption" color={Colors.ironOutline}>
                · {timeAgo(item.publishedAt)}
              </Text>
            </View>

            <Text variant="subheading" color={Colors.whiteout} style={styles.articleTitle}>
              {item.title}
            </Text>

            {item.summary || item.description ? (
              <Text variant="body-sm" color={Colors.midGrayText} style={styles.articleBody}>
                {item.summary || item.description}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              Linking.openURL(item.link).catch(() => {});
            }}
            activeOpacity={0.7}
          >
            <Text variant="body-sm" color={Colors.taroEssence}>
              원문 보기
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.ebonyCanvas,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.s16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.carbonBorder,
  },
  body: {
    padding: Spacing.s16,
    gap: Spacing.s24,
  },
  sectionLabel: {
    marginBottom: Spacing.s8,
    letterSpacing: 0.5,
  },
  insightCard: {
    backgroundColor: Colors.voidGreen,
    borderRadius: Radius.cards,
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
    gap: 12,
  },
  insightLoading: {
    paddingVertical: Spacing.s24,
    alignItems: "center",
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
  insightHeadline: {
    fontWeight: "700",
    lineHeight: 26,
  },
  insightSummary: {
    lineHeight: 20,
  },
  disclaimer: {
    marginTop: Spacing.s8,
    fontStyle: "italic",
  },
  articleSection: {
    gap: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  categoryBadge: {
    backgroundColor: Colors.voidGreen,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
  articleTitle: {
    fontWeight: "700",
    lineHeight: 26,
  },
  articleBody: {
    lineHeight: 20,
  },
  footer: {
    padding: Spacing.s16,
    borderTopWidth: 1,
    borderTopColor: Colors.carbonBorder,
  },
  linkButton: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
  },
});
