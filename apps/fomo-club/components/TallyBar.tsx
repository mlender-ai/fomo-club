import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { FomoColors, Spacing } from "../constants/fomoTheme";

/**
 * 감정 투표 집계 막대 — 한 줄. docs/IDENTITY_AND_MILESTONES.md "결과를 보는 만족감"(love mark).
 *
 * 비율이 바뀔 때 막대가 톡 차오르도록 RN Animated API로 폭을 보간한다(reanimated 금지).
 * 막대가 즉시 점프하지 않고 부드럽게 자라는 것 자체가 감정 선택 후의 작은 보상이다.
 * 내가 고른 감정(mine)은 "나" 마커로 표시해 집단 통계 속 내 자리를 보여준다.
 */
export function TallyBar({
  label,
  pct,
  color,
  mine,
}: {
  label: string;
  /** 0~100 비율. */
  pct: number;
  color: string;
  /** 내가 선택한 감정이면 true. */
  mine?: boolean;
}) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = Math.max(0, Math.min(100, pct));
    const anim = Animated.timing(grow, {
      toValue: target,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      // 폭(레이아웃) 보간이라 네이티브 드라이버 사용 불가.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [pct, grow]);

  const width = grow.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
        {mine ? " ·나" : ""}
      </Text>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width, backgroundColor: color, opacity: mine ? 1 : 0.7 },
          ]}
        />
      </View>
      <Text style={[styles.pct, mine && { color: FomoColors.whiteout }]}>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.s8, marginBottom: 6 },
  label: { width: 56, fontSize: 12 },
  track: { flex: 1, height: 8, borderRadius: 999, backgroundColor: FomoColors.elevated, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
  pct: { width: 36, textAlign: "right", color: FomoColors.muted, fontSize: 12 },
});
