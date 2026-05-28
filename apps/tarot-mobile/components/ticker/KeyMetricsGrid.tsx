import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import type { KeyMetrics } from "../../lib/stockStore";

interface Props {
  metrics: KeyMetrics;
  currency?: string;
}

interface MetricCard {
  label: string;
  value: string;
  show: boolean;
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
    {
      label: "EPS",
      value: metrics.eps != null ? `${metrics.eps.toFixed(2)}` : "-",
      show: metrics.eps != null,
    },
    {
      label: "PEG",
      value: metrics.pegRatio != null ? `${metrics.pegRatio.toFixed(2)}배` : "-",
      show: metrics.pegRatio != null,
    },
    {
      label: "PSR",
      value: metrics.priceToSalesTrailing12Months != null
        ? `${metrics.priceToSalesTrailing12Months.toFixed(2)}배`
        : "-",
      show: metrics.priceToSalesTrailing12Months != null,
    },
    {
      label: "BPS",
      value: metrics.bookValue != null ? `${metrics.bookValue.toFixed(2)}` : "-",
      show: metrics.bookValue != null,
    },
    {
      label: "순이익률",
      value: metrics.profitMargins != null
        ? `${(metrics.profitMargins * 100).toFixed(2)}%`
        : "-",
      show: metrics.profitMargins != null,
    },
    {
      label: "매출총이익률",
      value: metrics.grossMargins != null
        ? `${(metrics.grossMargins * 100).toFixed(2)}%`
        : "-",
      show: metrics.grossMargins != null,
    },
    {
      label: "ROA",
      value: metrics.returnOnAssets != null
        ? `${(metrics.returnOnAssets * 100).toFixed(2)}%`
        : "-",
      show: metrics.returnOnAssets != null,
    },
    {
      label: "유동비율",
      value: metrics.currentRatio != null ? `${metrics.currentRatio.toFixed(2)}` : "-",
      show: metrics.currentRatio != null,
    },
    {
      label: "당좌비율",
      value: metrics.quickRatio != null ? `${metrics.quickRatio.toFixed(2)}` : "-",
      show: metrics.quickRatio != null,
    },
    {
      label: "총현금",
      value: metrics.totalCash != null ? formatLargeNumber(metrics.totalCash, currency) : "-",
      show: metrics.totalCash != null,
    },
    {
      label: "총부채",
      value: metrics.totalDebt != null ? formatLargeNumber(metrics.totalDebt, currency) : "-",
      show: metrics.totalDebt != null,
    },
    {
      label: "잉여현금흐름",
      value: metrics.freeCashflow != null ? formatLargeNumber(metrics.freeCashflow, currency) : "-",
      show: metrics.freeCashflow != null,
    },
  ].filter((m) => m.show);

  if (cards.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        재무 지표
      </Text>

      <View style={styles.grid}>
        {cards.map((m) => (
          <View key={m.label} style={styles.card}>
            <Text variant="caption" color={Colors.midGrayText}>{m.label}</Text>
            <Text variant="subheading" color={Colors.whiteout} style={styles.value}>
              {m.value}
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: Colors.graphiteBase,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    gap: 6,
  },
  value: {
    fontWeight: "700",
  },
});
