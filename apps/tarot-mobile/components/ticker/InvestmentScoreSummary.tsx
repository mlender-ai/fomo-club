import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import type { StockQuote } from "@trading/shared/src/stockTypes";

interface Props {
  quote: StockQuote;
}

// 52주 위치 기반 투자 강도 점수 (0~100)
function compute52WeekScore(quote: StockQuote): number | null {
  const lo = quote.fiftyTwoWeekLow ?? quote.low52Week;
  const hi = quote.fiftyTwoWeekHigh ?? quote.high52Week;
  if (lo == null || hi == null || hi <= lo) return null;
  const pos = (quote.currentPrice - lo) / (hi - lo);
  return Math.round(Math.max(0, Math.min(1, pos)) * 100);
}

// 거래량 비율 기반 모멘텀 라벨
function volumeMomentumLabel(quote: StockQuote): string | null {
  if (!quote.averageVolume || !quote.volume) return null;
  const ratio = quote.volume / quote.averageVolume;
  if (ratio >= 2.0) return "거래량 급증";
  if (ratio >= 1.3) return "거래량 증가";
  if (ratio <= 0.5) return "거래량 급감";
  if (ratio <= 0.7) return "거래량 감소";
  return "거래량 안정";
}

// 점수 레벨 분류
function scoreLevel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "고점 근접", color: "#f43f5e" };
  if (score >= 50) return { label: "중상단 구간", color: Colors.taroEssence };
  if (score >= 30) return { label: "중하단 구간", color: Colors.silverHighlight };
  return { label: "저점 근접", color: "#60a5fa" };
}

export function InvestmentScoreSummary({ quote }: Props) {
  const score52w = compute52WeekScore(quote);
  const volLabel = volumeMomentumLabel(quote);
  const isPositive = quote.changePercent >= 0;
  const priceColor = isPositive ? Colors.taroEssence : "#f43f5e";
  const level = score52w != null ? scoreLevel(score52w) : null;

  const hasData = score52w != null || volLabel != null;
  if (!hasData) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        투자 스코어
      </Text>

      <View style={styles.card}>
        {/* 당일 등락 요약 */}
        <View style={styles.row}>
          <View style={styles.scoreBlock}>
            <Text variant="caption" color={Colors.midGrayText}>당일 변동</Text>
            <Text style={[styles.bigValue, { color: priceColor }]}>
              {isPositive ? "+" : ""}{quote.changePercent.toFixed(2)}%
            </Text>
          </View>

          {/* 52주 위치 점수 */}
          {score52w != null && level && (
            <View style={styles.scoreBlock}>
              <Text variant="caption" color={Colors.midGrayText}>52주 위치</Text>
              <Text style={[styles.bigValue, { color: level.color }]}>
                {score52w}
                <Text style={styles.scoreUnit}>/100</Text>
              </Text>
              <Text variant="caption" color={level.color}>{level.label}</Text>
            </View>
          )}
        </View>

        {/* 52주 위치 시각 바 */}
        {score52w != null && level && (
          <View style={styles.barSection}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${score52w}%` as `${number}%`, backgroundColor: level.color }]} />
              <View style={[styles.barThumb, { left: `${score52w}%` as `${number}%`, borderColor: level.color }]} />
            </View>
            <View style={styles.barLabels}>
              <Text variant="caption" color={Colors.ironOutline}>52주 저점</Text>
              <Text variant="caption" color={Colors.ironOutline}>52주 고점</Text>
            </View>
          </View>
        )}

        {/* 거래량 모멘텀 */}
        {volLabel && (
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text variant="caption" color={Colors.taroEssence}>{volLabel}</Text>
            </View>
            {quote.volume > 0 && (
              <Text variant="caption" color={Colors.midGrayText}>
                거래량 {quote.volume.toLocaleString()}
              </Text>
            )}
          </View>
        )}
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
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    gap: 24,
  },
  scoreBlock: {
    flex: 1,
    gap: 4,
  },
  bigValue: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  scoreUnit: {
    fontSize: 14,
    fontWeight: "400",
  },
  barSection: {
    gap: 6,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.carbonBorder,
    borderRadius: 3,
    position: "relative",
    overflow: "visible",
  },
  barFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  barThumb: {
    position: "absolute",
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.graphiteBase,
    borderWidth: 2,
    marginLeft: -7,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chip: {
    backgroundColor: Colors.voidGreen,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
});
