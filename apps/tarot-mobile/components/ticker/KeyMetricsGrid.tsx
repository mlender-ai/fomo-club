import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import type { KeyMetrics } from "../../lib/stockStore";

interface Props {
  metrics: KeyMetrics;
  currency?: string;
}

type Tier = "primary" | "secondary";

interface MetricCard {
  label: string;
  value: string;
  show: boolean;
  tier: Tier;
}

function formatLargeNumber(n: number, currency: string): string {
  if (currency === "KRW") {
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조`;
    if (n >= 1e8) return `${(n / 1e8).toFixed(0)}억`;
    return n.toLocaleString("ko-KR");
  }
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString("en-US")}`;
}

export function KeyMetricsGrid({ metrics, currency = "USD" }: Props) {
  const cards: MetricCard[] = [
    // primary tier: 투자 판단에 직접 영향이 큰 지표
    {
      label: "EPS",
      value: metrics.eps != null ? `${metrics.eps.toFixed(2)}` : "-",
      show: metrics.eps != null,
      tier: "primary" as const,
    },
    {
      label: "순이익률",
      value: metrics.profitMargins != null
        ? `${(metrics.profitMargins * 100).toFixed(2)}%`
        : "-",
      show: metrics.profitMargins != null,
      tier: "primary" as const,
    },
    {
      label: "ROA",
      value: metrics.returnOnAssets != null
        ? `${(metrics.returnOnAssets * 100).toFixed(2)}%`
        : "-",
      show: metrics.returnOnAssets != null,
      tier: "primary" as const,
    },
    {
      label: "잉여현금흐름",
      value: metrics.freeCashflow != null ? formatLargeNumber(metrics.freeCashflow, currency) : "-",
      show: metrics.freeCashflow != null,
      tier: "primary" as const,
    },
    // secondary tier: 보조 지표
    {
      label: "PEG",
      value: metrics.pegRatio != null ? `${metrics.pegRatio.toFixed(2)}배` : "-",
      show: metrics.pegRatio != null,
      tier: "secondary" as const,
    },
    {
      label: "PSR",
      value: metrics.priceToSalesTrailing12Months != null
        ? `${metrics.priceToSalesTrailing12Months.toFixed(2)}배`
        : "-",
      show: metrics.priceToSalesTrailing12Months != null,
      tier: "secondary" as const,
    },
    {
      label: "BPS",
      value: metrics.bookValue != null ? `${metrics.bookValue.toFixed(2)}` : "-",
      show: metrics.bookValue != null,
      tier: "secondary" as const,
    },
    {
      label: "매출총이익률",
      value: metrics.grossMargins != null
        ? `${(metrics.grossMargins * 100).toFixed(2)}%`
        : "-",
      show: metrics.grossMargins != null,
      tier: "secondary" as const,
    },
    {
      label: "유동비율",
      value: metrics.currentRatio != null ? `${metrics.currentRatio.toFixed(2)}` : "-",
      show: metrics.currentRatio != null,
      tier: "secondary" as const,
    },
    {
      label: "당좌비율",
      value: metrics.quickRatio != null ? `${metrics.quickRatio.toFixed(2)}` : "-",
      show: metrics.quickRatio != null,
      tier: "secondary" as const,
    },
    {
      label: "총현금",
      value: metrics.totalCash != null ? formatLargeNumber(metrics.totalCash, currency) : "-",
      show: metrics.totalCash != null,
      tier: "secondary" as const,
    },
    {
      label: "총부채",
      value: metrics.totalDebt != null ? formatLargeNumber(metrics.totalDebt, currency) : "-",
      show: metrics.totalDebt != null,
      tier: "secondary" as const,
    },
  ].filter((m) => m.show);

  if (cards.length === 0) return null;

  const primary = cards.filter((c) => c.tier === "primary");
  const secondary = cards.filter((c) => c.tier === "secondary");

  return (
    <View style={styles.container}>
      <Text variant="subheading" color={Colors.taroEssence} style={styles.sectionLabel}>
        재무 지표
      </Text>

      {primary.length > 0 && (
        <>
          <Text variant="caption" color={Colors.midGrayText} style={styles.tierLabel}>
            핵심 지표
          </Text>
          <View style={styles.grid}>
            {primary.map((m) => (
              <View key={m.label} style={[styles.card, styles.primaryCard]}>
                <Text variant="caption" color={Colors.midGrayText} style={styles.cardLabel}>
                  {m.label}
                </Text>
                <Text variant="subheading" color={Colors.whiteout} style={styles.primaryValue}>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {secondary.length > 0 && (
        <>
          <Text variant="caption" color={Colors.midGrayText} style={styles.tierLabel}>
            보조 지표
          </Text>
          <View style={styles.grid}>
            {secondary.map((m) => (
              <View key={m.label} style={[styles.card, styles.secondaryCard]}>
                <Text variant="caption" color={Colors.midGrayText} style={styles.cardLabel}>
                  {m.label}
                </Text>
                <Text variant="body" color={Colors.whiteout} style={styles.secondaryValue}>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
    gap: 8,
  },
  sectionLabel: {
    marginBottom: 4,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  tierLabel: {
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  card: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  primaryCard: {
    backgroundColor: Colors.voidGreen,
    borderColor: Colors.deepInsight,
  },
  secondaryCard: {
    backgroundColor: Colors.graphiteBase,
    borderColor: Colors.carbonBorder,
  },
  cardLabel: {
    letterSpacing: 0.3,
  },
  primaryValue: {
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 22,
  },
  secondaryValue: {
    fontWeight: "500",
    fontSize: 15,
    lineHeight: 20,
  },
});
