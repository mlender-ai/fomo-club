import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import type { KeyMetrics, AnnualFinancial } from "../../lib/stockStore";

interface Props {
  keyMetrics: KeyMetrics;
  annualFinancials: AnnualFinancial[];
  currency?: string;
}

function formatBigNumber(val: number | null, currency: string): string {
  if (val === null) return "—";
  const symbol = currency === "KRW" ? "₩" : "$";
  const abs = Math.abs(val);
  if (abs >= 1e12) return `${symbol}${(val / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${symbol}${(val / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${symbol}${(val / 1e6).toFixed(1)}M`;
  return `${symbol}${val.toLocaleString()}`;
}

function formatPct(val: number | null): string {
  if (val === null) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

interface SummaryItem {
  label: string;
  value: string;
  highlight?: boolean;
}

export function FinancialSummary({ keyMetrics, annualFinancials, currency = "USD" }: Props) {
  const items = useMemo<SummaryItem[]>(() => {
    const latest = annualFinancials[annualFinancials.length - 1];
    const result: SummaryItem[] = [];

    if (latest?.revenue !== null && latest?.revenue !== undefined) {
      result.push({ label: "연매출", value: formatBigNumber(latest.revenue, currency), highlight: true });
    }
    if (latest?.operatingIncome !== null && latest?.operatingIncome !== undefined) {
      result.push({ label: "영업이익", value: formatBigNumber(latest.operatingIncome, currency) });
    }
    if (latest?.netIncome !== null && latest?.netIncome !== undefined) {
      result.push({ label: "순이익", value: formatBigNumber(latest.netIncome, currency) });
    }
    if (keyMetrics.revenueGrowth !== null) {
      result.push({ label: "매출 성장률", value: formatPct(keyMetrics.revenueGrowth), highlight: true });
    }
    if (keyMetrics.profitMargins !== null) {
      result.push({ label: "순이익률", value: formatPct(keyMetrics.profitMargins) });
    }
    if (keyMetrics.returnOnEquity !== null) {
      result.push({ label: "ROE", value: formatPct(keyMetrics.returnOnEquity) });
    }

    return result;
  }, [keyMetrics, annualFinancials, currency]);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="subheading" color={Colors.taroEssence} style={styles.title}>
        주요 재무 요약
      </Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.label} style={styles.card}>
            <Text variant="caption" color={Colors.midGrayText} style={styles.label}>
              {item.label}
            </Text>
            <Text
              variant={item.highlight ? "subheading" : "body"}
              color={Colors.whiteout}
              style={item.highlight ? styles.valueHighlight : styles.value}
            >
              {item.value}
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
  title: {
    marginBottom: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: Colors.graphiteBase,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    padding: 14,
    gap: 6,
  },
  label: {
    letterSpacing: 0.3,
  },
  value: {
    fontWeight: "500",
    fontSize: 15,
    lineHeight: 20,
  },
  valueHighlight: {
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 22,
  },
});
