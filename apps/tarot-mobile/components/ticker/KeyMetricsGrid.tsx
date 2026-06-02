import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import type { KeyMetrics } from "../../lib/stockStore";
import { buildKeyMetricCards } from "@trading/shared/src/keyMetricsFormat";

interface Props {
  metrics: KeyMetrics;
  currency?: string;
}

export function KeyMetricsGrid({ metrics, currency = "USD" }: Props) {
  const cards = buildKeyMetricCards(metrics, currency);

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
