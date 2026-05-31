import React, { useMemo } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../ui/Text";
import { Colors } from "../../constants/theme";
import type { StockChartBar } from "@trading/shared/src/stockTypes";

interface Props {
  bars: StockChartBar[];
  loading?: boolean;
  width: number;
  height?: number;
  positive?: boolean; // true = green, false = red
}

const CHART_HEIGHT = 180;
const VOLUME_HEIGHT = 40;
const PAD_Y = 12;

// SVG 없는 차트 — Expo Go의 react-native-svg 네이티브 모듈 부재로 인한 크래시 회피.
// 각 봉을 얇은 vertical View 막대로 그리고, 막대 상단에 미니 dot으로 close 표시.
// 라인 차트 대비 단순화됐지만 추세 식별은 가능 — 종목 미니 차트 패턴.
export function PriceChart({ bars, loading, width, height = CHART_HEIGHT, positive = true }: Props) {
  const data = useMemo(() => {
    if (bars.length < 2) return null;

    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);
    const minP = Math.min(...closes);
    const maxP = Math.max(...closes);
    const maxV = Math.max(...volumes, 1);
    const rangeP = maxP - minP || 1;

    const innerH = height - PAD_Y * 2;
    const barW = width / closes.length;
    const stemW = Math.max(0.6, Math.min(2, barW * 0.18));

    // close 가격을 막대 높이(상단 정렬)로 표현 — 낮은 가격은 짧은 막대, 높은 가격은 긴 막대
    const priceBars = closes.map((c) => {
      const ratio = (c - minP) / rangeP;
      const barH = PAD_Y + ratio * innerH;
      return { barH, stemW };
    });

    const volBarW = Math.max(1, barW * 0.6);
    const volBars = volumes.map((v) => ({
      h: (v / maxV) * VOLUME_HEIGHT,
      w: volBarW,
    }));

    return { priceBars, volBars, barW, minP, maxP };
  }, [bars, width, height]);

  if (loading) {
    return (
      <View style={[styles.empty, { height: height + VOLUME_HEIGHT }]}>
        <ActivityIndicator size="small" color={Colors.taroEssence} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.empty, { height: height + VOLUME_HEIGHT }]}>
        <Text variant="caption" color={Colors.midGrayText}>차트 데이터 없음</Text>
      </View>
    );
  }

  const lineColor = positive ? Colors.taroEssence : "#f43f5e";

  return (
    <View>
      {/* 가격 영역 */}
      <View style={[styles.priceArea, { width, height }]}>
        {data.priceBars.map((b, i) => (
          <View
            key={i}
            style={[
              styles.priceBar,
              {
                width: data.barW,
                height: b.barH,
              },
            ]}
          >
            <View
              style={{
                width: b.stemW,
                height: b.barH,
                backgroundColor: lineColor,
                opacity: 0.85,
                borderRadius: b.stemW / 2,
              }}
            />
          </View>
        ))}
      </View>

      {/* 볼륨 영역 */}
      <View style={[styles.volumeArea, { width, height: VOLUME_HEIGHT }]}>
        {data.volBars.map((b, i) => (
          <View
            key={i}
            style={[styles.volSlot, { width: data.barW }]}
          >
            <View
              style={{
                width: b.w,
                height: Math.max(1, b.h),
                backgroundColor: Colors.ironOutline,
                opacity: 0.5,
                borderRadius: 1,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  priceArea: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  priceBar: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  volumeArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 4,
  },
  volSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
});
