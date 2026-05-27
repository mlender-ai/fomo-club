import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { RangeBar } from "./RangeBar";
import type { StockQuote } from "@trading/shared/src/stockTypes";

interface Props {
  quote: StockQuote;
}

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${price.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PriceStats({ quote }: Props) {
  const currency = quote.currency ?? "USD";
  const fmt = (v: number) => formatPrice(v, currency);

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        시세 정보
      </Text>

      <View style={styles.card}>
        {/* Day range */}
        {quote.dayLow != null && quote.dayHigh != null && quote.dayLow > 0 && quote.dayHigh > 0 && (
          <RangeBar
            label="오늘"
            min={quote.dayLow}
            max={quote.dayHigh}
            current={quote.currentPrice}
            formatValue={fmt}
          />
        )}

        {/* 52-week range */}
        {quote.fiftyTwoWeekLow != null && quote.fiftyTwoWeekHigh != null && quote.fiftyTwoWeekLow > 0 && quote.fiftyTwoWeekHigh > 0 && (
          <View style={styles.rangeSpacing}>
            <RangeBar
              label="52주"
              min={quote.fiftyTwoWeekLow}
              max={quote.fiftyTwoWeekHigh}
              current={quote.currentPrice}
              formatValue={fmt}
            />
          </View>
        )}

        <View style={styles.divider} />

        {/* Grid stats */}
        <View style={styles.grid}>
          <GridItem label="시가" value={fmt(quote.previousClose)} />
          <GridItem label="거래량" value={quote.volume.toLocaleString()} />
          <GridItem label="평균 거래량" value={quote.averageVolume.toLocaleString()} />
          <GridItem label="전일 종가" value={fmt(quote.previousClose)} />
        </View>
      </View>
    </View>
  );
}

function GridItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.gridItem}>
      <Text variant="caption" color={Colors.midGrayText}>{label}</Text>
      <Text variant="body-sm" color={Colors.whiteout} style={styles.gridValue}>{value}</Text>
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
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    gap: 4,
  },
  rangeSpacing: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.carbonBorder,
    marginVertical: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridItem: {
    width: "50%",
    paddingVertical: 8,
    gap: 2,
  },
  gridValue: {
    fontWeight: "600",
  },
});
