import React, { useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";

interface QuarterlyEarning {
  date: string;
  revenue: number | null;
  earnings: number | null;
}

interface AnnualFinancial {
  year: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
}

interface Props {
  quarterlyEarnings: QuarterlyEarning[];
  annualFinancials: AnnualFinancial[];
  width: number;
  currency?: string;
}

type ViewMode = "quarterly" | "annual";

const BAR_COLORS = {
  revenue: Colors.taroEssence,
  operatingIncome: "#3b82f6",
  netIncome: "#eab308",
  earnings: "#eab308",
};

const CHART_HEIGHT = 200;
const LABEL_H = 18;
const TOP_PAD = 16;
const DRAW_H = CHART_HEIGHT - LABEL_H - TOP_PAD;

// SVG 없는 차트 — Expo Go의 svg 네이티브 부재로 인한 크래시 회피. 순수 View 막대.
export function FinancialChart({ quarterlyEarnings, annualFinancials, width, currency = "USD" }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    annualFinancials.length > 0 ? "annual" : "quarterly"
  );

  const hasQuarterly = quarterlyEarnings.length > 0;
  const hasAnnual = annualFinancials.length > 0;

  if (!hasQuarterly && !hasAnnual) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          재무 실적
        </Text>
        <View style={styles.toggleRow}>
          {hasQuarterly && (
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === "quarterly" && styles.toggleActive]}
              onPress={() => setViewMode("quarterly")}
            >
              <Text variant="caption" color={viewMode === "quarterly" ? Colors.taroEssence : Colors.midGrayText}>
                분기
              </Text>
            </TouchableOpacity>
          )}
          {hasAnnual && (
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === "annual" && styles.toggleActive]}
              onPress={() => setViewMode("annual")}
            >
              <Text variant="caption" color={viewMode === "annual" ? Colors.taroEssence : Colors.midGrayText}>
                연간
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.card}>
        {viewMode === "quarterly" ? (
          <QuarterlyChart data={quarterlyEarnings} width={width - Spacing.s24 * 2 - 2} />
        ) : (
          <AnnualChart data={annualFinancials} width={width - Spacing.s24 * 2 - 2} />
        )}

        {/* Legend */}
        <View style={styles.legend}>
          {viewMode === "annual" ? (
            <>
              <LegendItem color={BAR_COLORS.revenue} label="매출" />
              <LegendItem color={BAR_COLORS.operatingIncome} label="영업이익" />
              <LegendItem color={BAR_COLORS.netIncome} label="순이익" />
            </>
          ) : (
            <>
              <LegendItem color={BAR_COLORS.revenue} label="매출" />
              <LegendItem color={BAR_COLORS.earnings} label="순이익" />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function QuarterlyChart({ data, width }: { data: QuarterlyEarning[]; width: number }) {
  const chartData = useMemo(() => {
    const items = data.slice(-8); // 최근 8분기
    if (items.length === 0) return null;

    const allValues = items.flatMap((d) => [d.revenue ?? 0, d.earnings ?? 0]);
    const maxVal = Math.max(...allValues, 1);
    const minVal = Math.min(...allValues, 0);
    const positiveRange = maxVal;
    const negativeRange = Math.max(0, -minVal);
    const totalRange = positiveRange + negativeRange || 1;
    const zeroFromTop = (positiveRange / totalRange) * DRAW_H;

    const groupW = width / items.length;
    const barW = Math.max(2, groupW * 0.3);

    return { items, groupW, barW, totalRange, zeroFromTop };
  }, [data, width]);

  if (!chartData) return null;

  return (
    <View style={{ width, height: CHART_HEIGHT }}>
      <View style={{ height: TOP_PAD + DRAW_H, position: "relative" }}>
        {/* 0 라인 */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TOP_PAD + chartData.zeroFromTop,
            height: StyleSheet.hairlineWidth,
            backgroundColor: Colors.carbonBorder,
          }}
        />

        <View style={styles.barsRow}>
          {chartData.items.map((item, i) => {
            const revRatio = (item.revenue ?? 0) / chartData.totalRange;
            const earnRatio = (item.earnings ?? 0) / chartData.totalRange;
            return (
              <View key={i} style={[styles.barGroup, { width: chartData.groupW, height: TOP_PAD + DRAW_H }]}>
                <FloatingBar
                  ratio={revRatio}
                  zeroFromTop={chartData.zeroFromTop + TOP_PAD}
                  drawH={DRAW_H}
                  color={BAR_COLORS.revenue}
                  width={chartData.barW}
                  offset={-chartData.barW / 2 - 1}
                />
                <FloatingBar
                  ratio={earnRatio}
                  zeroFromTop={chartData.zeroFromTop + TOP_PAD}
                  drawH={DRAW_H}
                  color={BAR_COLORS.earnings}
                  width={chartData.barW}
                  offset={chartData.barW / 2 + 1}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X축 라벨 */}
      <View style={styles.labelRow}>
        {chartData.items.map((item, i) => (
          <View key={i} style={{ width: chartData.groupW, alignItems: "center" }}>
            <Text variant="caption" color={Colors.midGrayText} style={styles.tickLabel}>
              {item.date}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnnualChart({ data, width }: { data: AnnualFinancial[]; width: number }) {
  const chartData = useMemo(() => {
    const items = data.slice(-5);
    if (items.length === 0) return null;

    const allValues = items.flatMap((d) => [d.revenue ?? 0, d.operatingIncome ?? 0, d.netIncome ?? 0]);
    const maxVal = Math.max(...allValues, 1);
    const minVal = Math.min(...allValues, 0);
    const positiveRange = maxVal;
    const negativeRange = Math.max(0, -minVal);
    const totalRange = positiveRange + negativeRange || 1;
    const zeroFromTop = (positiveRange / totalRange) * DRAW_H;

    const groupW = width / items.length;
    const barW = Math.max(2, groupW * 0.22);

    return { items, groupW, barW, totalRange, zeroFromTop };
  }, [data, width]);

  if (!chartData) return null;

  return (
    <View style={{ width, height: CHART_HEIGHT }}>
      <View style={{ height: TOP_PAD + DRAW_H, position: "relative" }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TOP_PAD + chartData.zeroFromTop,
            height: StyleSheet.hairlineWidth,
            backgroundColor: Colors.carbonBorder,
          }}
        />
        <View style={styles.barsRow}>
          {chartData.items.map((item, i) => {
            const r = (item.revenue ?? 0) / chartData.totalRange;
            const o = (item.operatingIncome ?? 0) / chartData.totalRange;
            const n = (item.netIncome ?? 0) / chartData.totalRange;
            const span = chartData.barW + 2;
            return (
              <View key={i} style={[styles.barGroup, { width: chartData.groupW, height: TOP_PAD + DRAW_H }]}>
                <FloatingBar ratio={r} zeroFromTop={chartData.zeroFromTop + TOP_PAD} drawH={DRAW_H} color={BAR_COLORS.revenue} width={chartData.barW} offset={-span} />
                <FloatingBar ratio={o} zeroFromTop={chartData.zeroFromTop + TOP_PAD} drawH={DRAW_H} color={BAR_COLORS.operatingIncome} width={chartData.barW} offset={0} />
                <FloatingBar ratio={n} zeroFromTop={chartData.zeroFromTop + TOP_PAD} drawH={DRAW_H} color={BAR_COLORS.netIncome} width={chartData.barW} offset={span} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.labelRow}>
        {chartData.items.map((item, i) => (
          <View key={i} style={{ width: chartData.groupW, alignItems: "center" }}>
            <Text variant="caption" color={Colors.midGrayText} style={styles.tickLabel}>
              {item.year}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// 0선 기준으로 위/아래로 뻗는 막대. ratio>0 → 위, ratio<0 → 아래.
function FloatingBar({
  ratio, zeroFromTop, drawH, color, width, offset,
}: {
  ratio: number; zeroFromTop: number; drawH: number; color: string; width: number; offset: number;
}) {
  const h = Math.max(1, Math.abs(ratio) * drawH);
  const top = ratio >= 0 ? zeroFromTop - h : zeroFromTop;
  return (
    <View
      style={{
        position: "absolute",
        top,
        left: "50%",
        marginLeft: offset - width / 2,
        width,
        height: h,
        backgroundColor: color,
        borderRadius: 2,
      }}
    />
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption" color={Colors.midGrayText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.s8,
  },
  sectionLabel: {
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 4,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  toggleActive: {
    backgroundColor: Colors.voidGreen,
  },
  card: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  barGroup: {
    position: "relative",
  },
  labelRow: {
    flexDirection: "row",
    height: LABEL_H,
    alignItems: "center",
  },
  tickLabel: {
    fontSize: 10,
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
