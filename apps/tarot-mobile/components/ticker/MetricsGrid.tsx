import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import type { StockQuote } from "@trading/shared/src/stockTypes";

interface Props {
  quote: StockQuote;
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

export function MetricsGrid({ quote }: Props) {
  const currency = quote.currency ?? "USD";

  const metrics: MetricCard[] = [
    {
      label: "시가총액",
      value: quote.marketCap != null ? formatLargeNumber(quote.marketCap, currency) : "-",
      show: quote.marketCap != null && quote.marketCap > 0,
    },
    {
      label: "PER",
      value: quote.trailingPE != null ? `${quote.trailingPE.toFixed(2)}배` : "-",
      show: true,
    },
    {
      label: "PBR",
      value: quote.priceToBook != null ? `${quote.priceToBook.toFixed(2)}배` : "-",
      show: true,
    },
    {
      label: "배당수익률",
      value: quote.dividendYield != null ? `${(quote.dividendYield * 100).toFixed(2)}%` : "-",
      show: true,
    },
    {
      label: "ROE",
      value: quote.returnOnEquity != null ? `${(quote.returnOnEquity * 100).toFixed(2)}%` : "-",
      show: quote.returnOnEquity != null,
    },
    {
      label: "영업이익률",
      value: quote.operatingMargins != null ? `${(quote.operatingMargins * 100).toFixed(2)}%` : "-",
      show: quote.operatingMargins != null,
    },
    {
      label: "매출 성장률",
      value: quote.revenueGrowth != null ? `${(quote.revenueGrowth * 100).toFixed(2)}%` : "-",
      show: quote.revenueGrowth != null,
    },
    {
      label: "부채비율",
      value: quote.debtToEquity != null ? `${quote.debtToEquity.toFixed(1)}%` : "-",
      show: quote.debtToEquity != null,
    },
  ].filter((m) => m.show);

  if (metrics.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        투자지표
      </Text>

      <View style={styles.grid}>
        {metrics.map((m) => (
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
